// Lineups: auto-assign by role ratings, backups depth chart, injuries respected,
// tiers (active 6 / backup 6 / practice rest / IR) kept consistent.
import type {Catalog, LeagueState, Lineup, LineupSlot, Mon, MonId, Role, TeamId} from '../types.ts';
import {strategyById} from './strategies.ts';
import {allRoles, bestRole, roleRating, setForRole} from './ratings.ts';
import {teamMons} from './util.ts';

export const STARTERS = 6;
export const BACKUPS = 6;
export const ROSTER = 18;

/** Can this mon battle this game? (day-to-day can; out/IR cannot) */
export function canBattle(mon: Mon): boolean {
  if (mon.retired || mon.tier === 'ir') return false;
  return !mon.injury || mon.injury.kind === 'day-to-day';
}

/** Score bonus for an on-role pick: the solver maximises on-role slots first, then the rating sum. */
const ON_ROLE = 1000;
/** Practice-squad candidates are promoted only when they beat the active/backup options by this much. */
const PRACTICE_PENALTY = 6;

function slotFit(mon: Mon, roles: Role[], all: {role: Role; ovr: number; setId: string}[]): {role: Role; score: number; setId: string; onRole: boolean} {
  let best: {role: Role; score: number; setId: string; onRole: boolean} | null = null;
  roles.forEach((r, i) => {
    const hit = all.find(x => x.role === r);
    if (hit) {
      const score = ON_ROLE + hit.ovr - i * 2;
      if (!best || score > best.score) best = {role: r, score, setId: hit.setId, onRole: true};
    }
  });
  if (best) return best;
  // off-role pick: no stat penalty in battle; plays its best set
  const top = all[0];
  return {role: roles[0], score: (top?.ovr ?? 40) - 25, setId: top?.setId ?? mon.setId, onRole: false};
}

/**
 * Max-weight assignment of rows (slots) to distinct columns (candidates), rows <= cols.
 * Hungarian algorithm (O(n^2 m)) on cost = -score. Returns the column per row.
 */
export function assignMax(score: number[][]): number[] {
  const n = score.length, m = n ? score[0].length : 0;
  if (!n || !m) return score.map(() => -1);
  if (m < n) {   // pad with dummy columns that score very low (rows left unfilled)
    const padded = score.map(r => [...r, ...Array(n - m).fill(-1e9)]);
    return assignMax(padded).map(c => (c >= m ? -1 : c));
  }
  const INF = 1e18;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF), used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = -score[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const out = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) out[p[j] - 1] = j - 1;
  return out;
}

export interface LineupPlan { slots: LineupSlot[]; onRole: number; ratingSum: number }

/**
 * Best lineup for a strategy without touching state: every slot gets a Pokémon whose set fills
 * the slot's role whenever the roster has one (practice squad included, promoted if needed), then
 * the highest rating sum. Off-role picks play their best set.
 */
export function planLineup(catalog: Catalog, state: LeagueState, teamId: TeamId, strategyId: string): LineupPlan {
  const strat = strategyById(strategyId);
  const mons = teamMons(state, teamId).filter(canBattle);
  const allR = mons.map(m => allRoles(catalog, m));
  const fits = strat.slots.map(roles => mons.map((m, i) => slotFit(m, roles, allR[i])));
  const nonPractice = mons.filter(m => m.tier !== 'practice').length;
  const score = fits.map(row => row.map((f, i) => {
    if (mons[i].tier !== 'practice') return f.score;
    // practice only when it fills a role nobody else can, or the roster is short
    return f.onRole || nonPractice < STARTERS ? f.score - PRACTICE_PENALTY : -1e6;
  }));
  const pick = assignMax(score);
  const used = new Set(pick.filter(c => c >= 0));
  let onRole = 0, ratingSum = 0;
  const slots: LineupSlot[] = strat.slots.map((roles, s) => {
    const c = pick[s];
    if (c < 0 || score[s][c] <= -1e5) return {role: roles[0], monId: null, backups: backupsOf(s), setId: undefined};
    const f = fits[s][c];
    if (f.onRole) onRole++;
    ratingSum += f.onRole ? f.score - ON_ROLE : f.score;
    return {role: f.role, monId: mons[c].id, backups: backupsOf(s), setId: f.setId};
  });
  function backupsOf(s: number): MonId[] {
    return mons.map((m, i) => ({m, i, sc: fits[s][i].score}))
      .filter(x => !used.has(x.i) && x.m.tier !== 'practice')
      .sort((a, b) => b.sc - a.sc || a.m.id.localeCompare(b.m.id))
      .slice(0, 2).map(x => x.m.id);
  }
  return {slots, onRole, ratingSum};
}

/** Auto-assign the team's lineup for its current strategy. Returns (and stores) the lineup. */
export function autoLineup(catalog: Catalog, state: LeagueState, teamId: TeamId): Lineup {
  const team = state.teams[teamId];
  const strat = strategyById(team.lineup.strategyId);
  return applyPlan(catalog, state, teamId, strat.id, planLineup(catalog, state, teamId, strat.id));
}

export function applyPlan(catalog: Catalog, state: LeagueState, teamId: TeamId, strategyId: string, plan: LineupPlan): Lineup {
  const team = state.teams[teamId];
  team.lineup = {strategyId, slots: plan.slots, auto: team.lineup.auto};
  for (const sl of plan.slots) if (sl.monId && sl.setId) state.mons[sl.monId].setId = sl.setId;
  normalizeTiers(catalog, state, teamId);
  return team.lineup;
}

/** The set a slot plays: the slot's pick, else the mon's chosen set if it fills the role, else best for role. */
export function slotSetId(catalog: Catalog, mon: Mon, slot: {role: Role; setId?: string}): string {
  const sp = catalog.species[mon.speciesId];
  if (slot.setId && sp.sets.some(s => s.id === slot.setId)) return slot.setId;
  const chosen = sp.sets.find(s => s.id === mon.setId);
  if (chosen && chosen.roles.includes(slot.role)) return chosen.id;
  if (roleRating(catalog, mon, slot.role) !== null) return setForRole(catalog, mon, slot.role);
  // off-role: its best set (never a set-less Pokémon)
  return allRoles(catalog, mon)[0]?.setId ?? (sp.sets.some(s => s.id === mon.setId) ? mon.setId : sp.sets[0].id);
}

export interface FieldedSlot { slot: number; role: Role; monId: MonId; setId: string; flagged?: 'backup' | 'auto' | 'practice' | 'injured' }

/**
 * The 6 that actually take the field this game: lineup picks, then their backups,
 * then the best available active/backup, then practice, then anyone (flagged). Always 6
 * when the team has 6 mons (the engine needs exactly six).
 */
export function fieldedLineup(catalog: Catalog, state: LeagueState, teamId: TeamId, unavailable: Set<MonId> = new Set()): FieldedSlot[] {
  const team = state.teams[teamId];
  const mons = teamMons(state, teamId);
  const byId = new Map(mons.map(m => [m.id, m]));
  const used = new Set<MonId>();
  const ok = (m: Mon | undefined): m is Mon => !!m && !used.has(m.id) && !unavailable.has(m.id) && canBattle(m);
  const out: FieldedSlot[] = [];
  const strat = strategyById(team.lineup.strategyId);
  const slots = team.lineup.slots.length === STARTERS ? team.lineup.slots
    : strat.slots.map(r => ({role: r[0], monId: null, backups: []} as LineupSlot));
  const pending: number[] = [];
  slots.forEach((sl, i) => {
    const m = sl.monId ? byId.get(sl.monId) : undefined;
    if (ok(m) && m.tier !== 'practice') { used.add(m.id); out[i] = {slot: i, role: sl.role, monId: m.id, setId: slotSetId(catalog, m, sl)}; }
    else pending.push(i);
  });
  for (const i of pending) {
    const sl = slots[i];
    let m: Mon | undefined, flag: FieldedSlot['flagged'];
    for (const b of sl.backups) { const c = byId.get(b); if (ok(c) && c.tier !== 'practice') { m = c; flag = 'backup'; break; } }
    const rank = (pool: Mon[]) => pool.filter(ok).sort((a, b) =>
      (roleRating(catalog, b, sl.role) ?? bestRole(catalog, b).ovr - 25) - (roleRating(catalog, a, sl.role) ?? bestRole(catalog, a).ovr - 25))[0];
    if (!m) { m = rank(mons.filter(x => x.tier === 'active' || x.tier === 'backup')); flag = 'auto'; }
    if (!m) { m = rank(mons.filter(x => x.tier === 'practice')); flag = 'practice'; }
    if (!m) {
      m = mons.filter(x => !used.has(x.id) && !x.retired && !unavailable.has(x.id)).sort((a, b) => injuryRank(a) - injuryRank(b))[0]
        ?? mons.filter(x => !used.has(x.id) && !x.retired)[0];
      flag = 'injured';
    }
    if (!m) continue;
    used.add(m.id);
    out[i] = {slot: i, role: sl.role, monId: m.id, setId: slotSetId(catalog, m, sl), flagged: flag};
  }
  return out.filter(Boolean);
}

const injuryRank = (m: Mon): number => (!m.injury ? 0 : m.injury.kind === 'day-to-day' ? 1 : m.injury.kind === 'out' ? 2 : 3);

/** Lineup slots that would not field their pick (empty, injured, or gone). */
export function brokenSlots(state: LeagueState, teamId: TeamId): number[] {
  const team = state.teams[teamId];
  const out: number[] = [];
  team.lineup.slots.forEach((sl, i) => {
    const m = sl.monId ? state.mons[sl.monId] : undefined;
    if (!m || m.teamId !== teamId || !canBattle(m) || m.tier === 'practice') out.push(i);
  });
  return out;
}

/**
 * Keep tiers consistent: IR for IR injuries, starters active, 6 backups, the rest practice.
 * AI teams keep their youngest on the practice squad. Promotions out of practice get the minimum.
 */
export function normalizeTiers(catalog: Catalog, state: LeagueState, teamId: TeamId): void {
  const team = state.teams[teamId];
  const mons = teamMons(state, teamId);
  for (const m of mons) {
    if (m.injury?.kind === 'ir') m.tier = 'ir';
    else if (m.tier === 'ir') m.tier = 'backup';
  }
  const live = mons.filter(m => m.tier !== 'ir');
  const starters = new Set(team.lineup.slots.map(s => s.monId).filter((x): x is MonId => !!x && state.mons[x]?.teamId === teamId && state.mons[x].tier !== 'ir'));
  const val = (m: Mon) => bestRole(catalog, m).ovr;
  const active = live.filter(m => starters.has(m.id));
  const rest = live.filter(m => !starters.has(m.id));
  const keepScore = (m: Mon) => {
    let s = val(m);
    if (m.tier === 'active') s += 3;
    if (!team.human && m.age <= 23) s -= 8;
    if (team.human && m.tier === 'practice') s -= 30;
    return s;
  };
  rest.sort((a, b) => keepScore(b) - keepScore(a) || a.id.localeCompare(b.id));
  while (active.length < STARTERS && rest.length) active.push(rest.shift()!);
  const backups = rest.slice(0, BACKUPS);
  const practice = rest.slice(BACKUPS);
  const set = (m: Mon, tier: Mon['tier']) => {
    if (m.tier === 'practice' && tier !== 'practice' && m.contract && m.contract.salary < state.settings.minSalary) {
      m.contract.salary = state.settings.minSalary;
    }
    m.tier = tier;
  };
  for (const m of active) set(m, 'active');
  for (const m of backups) set(m, 'backup');
  for (const m of practice) set(m, 'practice');
}

/** Drop a mon from a team's lineup (traded, cut, retired). */
export function removeFromLineup(state: LeagueState, teamId: TeamId, monId: MonId): void {
  const team = state.teams[teamId];
  for (const sl of team.lineup.slots) {
    if (sl.monId === monId) { sl.monId = null; sl.setId = undefined; }
    sl.backups = sl.backups.filter(b => b !== monId);
  }
}
