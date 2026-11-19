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

function slotFit(catalog: Catalog, mon: Mon, roles: Role[], all = allRoles(catalog, mon)): {role: Role; score: number} {
  let best: {role: Role; score: number} | null = null;
  roles.forEach((r, i) => {
    const hit = all.find(x => x.role === r);
    if (hit) {
      const score = hit.ovr - i * 2;
      if (!best || score > best.score) best = {role: r, score};
    }
  });
  if (best) return best;
  // off-role pick: no stat penalty in battle, but auto-assign prefers real fits
  return {role: roles[0], score: (all[0]?.ovr ?? 40) - 25};
}

/** Auto-assign the team's lineup for its current strategy. Returns (and stores) the lineup. */
export function autoLineup(catalog: Catalog, state: LeagueState, teamId: TeamId): Lineup {
  const team = state.teams[teamId];
  const strat = strategyById(team.lineup.strategyId);
  const mons = teamMons(state, teamId);
  let pool = mons.filter(m => canBattle(m) && m.tier !== 'practice');
  if (pool.length < STARTERS) pool = mons.filter(canBattle);
  const allR = pool.map(m => allRoles(catalog, m));
  const fits = strat.slots.map(roles => pool.map((m, i) => slotFit(catalog, m, roles, allR[i])));
  const chosen: (number | null)[] = strat.slots.map(() => null);
  const used = new Set<number>();
  for (let n = 0; n < strat.slots.length; n++) {
    let bs = -1, bm = -1, best = -Infinity;
    for (let s = 0; s < strat.slots.length; s++) {
      if (chosen[s] !== null) continue;
      for (let m = 0; m < pool.length; m++) {
        if (used.has(m)) continue;
        const sc = fits[s][m].score;
        if (sc > best) { best = sc; bs = s; bm = m; }
      }
    }
    if (bs < 0) break;
    chosen[bs] = bm; used.add(bm);
  }
  const slots: LineupSlot[] = strat.slots.map((roles, s) => {
    const mi = chosen[s];
    const mon = mi === null ? null : pool[mi];
    const role = mi === null ? roles[0] : fits[s][mi].role;
    const backups = pool
      .map((m, i) => ({i, sc: fits[s][i].score}))
      .filter(x => !used.has(x.i))
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 2)
      .map(x => pool[x.i].id);
    return {role, monId: mon?.id ?? null, backups, setId: mon ? setForRole(catalog, mon, role) : undefined};
  });
  team.lineup = {strategyId: strat.id, slots, auto: team.lineup.auto};
  for (const sl of slots) if (sl.monId && sl.setId) state.mons[sl.monId].setId = sl.setId;
  normalizeTiers(catalog, state, teamId);
  return team.lineup;
}

/** The set a slot plays: the slot's pick, else the mon's chosen set if it fills the role, else best for role. */
export function slotSetId(catalog: Catalog, mon: Mon, slot: {role: Role; setId?: string}): string {
  const sp = catalog.species[mon.speciesId];
  if (slot.setId && sp.sets.some(s => s.id === slot.setId)) return slot.setId;
  const chosen = sp.sets.find(s => s.id === mon.setId);
  if (chosen && chosen.roles.includes(slot.role)) return chosen.id;
  return setForRole(catalog, mon, slot.role);
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
  if (team.practiceFocus) team.practiceFocus = team.practiceFocus.filter(x => x !== monId);
}
