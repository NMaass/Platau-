// Scouting: what a team knows about a mon it does not own.
// Ranges have equal width for equal points spent; the truth sits uniformly
// inside, except ~10% of ranges that miss it (per-team error, deterministic per
// league seed). 1 point per scout, 5 points (fullScoutCost) = full knowledge.
// Everyone knows a mon exactly once it has played ~6 battles.
import type {Catalog, Grade, LeagueState, Mon, Role, TeamId} from '../types.ts';
import {ROLE_LABEL} from '../catalog/roles.ts';
import {hash01} from './rng.ts';
import {bestRole} from './ratings.ts';
import {GRADES, gi, gradeAt} from './grades.ts';

/** Range width (rating points) by points spent 0..4 (5 = exact). Tunable. */
export const RANGE_WIDTH = [24, 18, 13, 9, 5];
export const MISS_RATE = 0.1;
export const REVEAL_BATTLES = 6;

export const careerBattles = (mon: Mon): number => mon.stats.reduce((s, l) => s + l.battles, 0);

export function scoutPoints(state: LeagueState, viewer: TeamId, mon: Mon): number {
  return mon.scouting?.[viewer] ?? 0;
}

export function knowsExactly(state: LeagueState, viewer: TeamId, mon: Mon): boolean {
  return mon.teamId === viewer || careerBattles(mon) >= REVEAL_BATTLES || scoutPoints(state, viewer, mon) >= state.settings.fullScoutCost;
}

/** Equal-width range around (or, ~10% of the time, beside) the truth. Pure. */
export function scoutRange(seed: number, viewer: TeamId, monId: string, truth: number, points: number, lo = 1, hi = 99): {lo: number; hi: number} {
  const w = RANGE_WIDTH[Math.min(points, RANGE_WIDTH.length - 1)];
  const u = hash01(seed, 'pos', viewer, monId, points);
  const miss = hash01(seed, 'miss', viewer, monId, points) < MISS_RATE;
  let a: number;
  if (!miss) a = truth - u * w;
  else if (hash01(seed, 'side', viewer, monId, points) < 0.5) a = truth - w - 1 - u * 4;   // range entirely below truth
  else a = truth + 1 + u * 4;                                                               // entirely above
  let l = Math.round(a), h = l + w;
  if (l < lo) { h += lo - l; l = lo; }
  if (h > hi) { l -= h - hi; h = hi; }
  return {lo: l, hi: h};
}

export function knownRating(catalog: Catalog, state: LeagueState, viewer: TeamId, mon: Mon): {role: Role; lo: number; hi: number; exact: boolean} {
  const b = bestRole(catalog, mon);
  if (knowsExactly(state, viewer, mon)) return {role: b.role, lo: b.ovr, hi: b.ovr, exact: true};
  const r = scoutRange(state.seed, viewer, mon.id, b.ovr, scoutPoints(state, viewer, mon));
  return {role: b.role, lo: r.lo, hi: r.hi, exact: false};
}

/** Potential (hidden ceiling) as a grade range: 3 grades wide unscouted, 2 after 1–2 points, 1 after 3+, exact at 5. */
export function knownPotential(state: LeagueState, viewer: TeamId, mon: Mon): {lo: Grade; hi: Grade; exact: boolean} {
  const pts = scoutPoints(state, viewer, mon);
  if (pts >= state.settings.fullScoutCost) return {lo: mon.potential, hi: mon.potential, exact: true};
  const width = pts >= 3 ? 1 : pts >= 1 ? 2 : 3;
  const t = gi(mon.potential);
  const u = hash01(state.seed, 'pot', viewer, mon.id, pts);
  const miss = hash01(state.seed, 'potmiss', viewer, mon.id, pts) < MISS_RATE;
  let lo = miss ? t + (u < 0.5 ? -width - 1 : 1) : t - Math.floor(u * (width + 1));
  lo = Math.max(0, Math.min(GRADES.length - 1 - width, lo));
  return {lo: gradeAt(lo), hi: gradeAt(lo + width), exact: false};
}

/** Traits a viewer has uncovered (2+ points: a maxed stat; 3+: the role it is especially suited to). */
export function knownTraits(catalog: Catalog, state: LeagueState, viewer: TeamId, mon: Mon): string[] {
  const pts = knowsExactly(state, viewer, mon) ? 5 : scoutPoints(state, viewer, mon);
  const out: string[] = [];
  if (pts >= 2) {
    const labels: Record<string, string> = {hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed'};
    for (const [k, v] of Object.entries(mon.ivs)) if (v === 'A') out.push(`Maxed ${labels[k]}`);
  }
  if (pts >= 3) out.push(`Especially suited: ${ROLE_LABEL[bestRole(catalog, mon).role]}`);
  return out;
}

export interface ScoutResult { ok: boolean; reason: string; spent: number }

/** Spend points: +1 level for `scoutCost`, or straight to full knowledge for `fullScoutCost`. */
export function scout(state: LeagueState, teamId: TeamId, mon: Mon, full: boolean, catalog?: Catalog): ScoutResult {
  const team = state.teams[teamId];
  const cur = scoutPoints(state, teamId, mon);
  const max = state.settings.fullScoutCost;
  if (cur >= max || mon.teamId === teamId) return {ok: false, reason: 'Already fully known', spent: 0};
  // full knowledge costs fullScoutCost in total: points already spent count toward it
  const cost = full ? Math.max(state.settings.scoutCost, max - cur) : state.settings.scoutCost;
  if (team.scoutingPoints < cost) return {ok: false, reason: `Needs ${cost} points, ${team.scoutingPoints} left`, spent: 0};
  team.scoutingPoints -= cost;
  mon.scouting = {...(mon.scouting ?? {}), [teamId]: full ? max : Math.min(max, cur + 1)};
  if (catalog && team.human) mon.traits = knownTraits(catalog, state, teamId, mon);
  return {ok: true, reason: full ? 'Fully scouted' : 'Range narrowed', spent: cost};
}

/** AI teams spend their weekly points on the prospects nearest their pick. */
export function aiScout(catalog: Catalog, state: LeagueState, teamId: TeamId, prospects: Mon[]): void {
  const team = state.teams[teamId];
  const ranked = [...prospects].sort((a, b) => {
    const ka = knownRating(catalog, state, teamId, a), kb = knownRating(catalog, state, teamId, b);
    return (kb.lo + kb.hi) - (ka.lo + ka.hi);
  });
  for (const m of ranked) {
    if (team.scoutingPoints < state.settings.scoutCost) break;
    if (scoutPoints(state, teamId, m) >= 3) continue;
    scout(state, teamId, m, false);
  }
}
