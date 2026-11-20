// How a team values a Pokémon or a draft pick (trades, FA bids, cuts, draft).
// From role ratings, age/potential, contract surplus and the team's role needs.
import type {Catalog, CatalogSpecies, DraftPick, LeagueState, Mon, MonId, Role, TeamId} from '../types.ts';
import {EV_ADJ, allRoles, bestRole, speciesRoles} from './ratings.ts';
import {knownPotential, knownRating} from './scouting.ts';
import {marketSalary} from './cap.ts';
import {strategyById} from './strategies.ts';
import {GROWTH_BAND_HI, gi, gradeAt, gradeForGrowth} from './grades.ts';
import {clamp, teamMons} from './util.ts';
import {reverseStandings} from './standings.ts';

const finalBaseCache = new WeakMap<CatalogSpecies, number>();

/** Best role base this species can reach (itself or any evolution). */
export function ceilingBase(catalog: Catalog, sp: CatalogSpecies): number {
  const hit = finalBaseCache.get(sp);
  if (hit !== undefined) return hit;
  let best = Math.max(0, ...speciesRoles(sp).map(r => r.base));
  for (const e of sp.evolvesTo) { const n = catalog.species[e.id]; if (n?.sets.length) best = Math.max(best, ceilingBase(catalog, n)); }
  finalBaseCache.set(sp, best);
  return best;
}

/** Rating the viewer believes the mon has now (exact or scouted midpoint). */
export function perceivedOvr(catalog: Catalog, state: LeagueState, viewer: TeamId | null, mon: Mon): number {
  if (!viewer) return bestRole(catalog, mon).ovr;
  const k = knownRating(catalog, state, viewer, mon);
  return (k.lo + k.hi) / 2;
}

/** Growth a young mon gains in a season (measured in fast-sim leagues: ~14 at 23 and under, ~7 at 24–26) and how
 *  many seasons a club plans ahead when it values young mons (draft, trades, FA). */
export const GROWTH_PER_SEASON = {young: 14, prime: 7};
export const PLAN_SEASONS = 3;

const bestBase = (sp: CatalogSpecies): number => Math.max(0, ...speciesRoles(sp).map(r => r.base));
/** Best role base the species reaches by this Growth (evolutions happen at their level, measured on Growth). */
function baseAtGrowth(catalog: Catalog, sp: CatalogSpecies, growth: number): number {
  let best = bestBase(sp);
  for (const e of sp.evolvesTo) {
    const n = catalog.species[e.id];
    if (n?.sets.length && growth >= e.level) best = Math.max(best, baseAtGrowth(catalog, n, growth));
  }
  return best;
}

/** Projected rating PLAN_SEASONS ahead: the Growth a young mon can still gain by then (time to peak), capped by its
 *  potential, with the evolutions that Growth reaches. A ceiling five seasons away counts only as far as it gets. */
export function projectedOvr(catalog: Catalog, state: LeagueState, viewer: TeamId | null, mon: Mon): number {
  const now = perceivedOvr(catalog, state, viewer, mon);
  if (mon.age > 25) return now;
  const pot = viewer ? knownPotential(state, viewer, mon) : {lo: mon.potential, hi: mon.potential};
  const potGrade = gradeAt(Math.round((gi(pot.lo) + gi(pot.hi)) / 2));
  const sp = catalog.species[mon.speciesId];
  const perSeason = mon.age <= 23 ? GROWTH_PER_SEASON.young : GROWTH_PER_SEASON.prime;
  const g = Math.min(Math.max(mon.growth, GROWTH_BAND_HI[potGrade]), mon.growth + PLAN_SEASONS * perSeason);
  const grade = gradeAt(Math.min(gi(potGrade), gi(gradeForGrowth(g))));
  const adjNow = now - (bestBase(sp) + EV_ADJ[gradeForGrowth(mon.growth)]);   // IVs, scouting error: carried over
  const proj = baseAtGrowth(catalog, sp, g) + EV_ADJ[grade] + adjNow;
  return now + Math.max(0, proj - now) * 0.8;
}

const fitFor = (roles: {role: Role; ovr: number}[], slot: Role[]): number => {
  let f = 0;
  for (const r of roles) if (r.ovr > f && slot.includes(r.role)) f = r.ovr;
  return f;
};

/** On-role fit of each slot of a strategy from the team's roster (greedy, best fits first; 0 = open slot). */
export function slotFits(catalog: Catalog, state: LeagueState, teamId: TeamId, strategyId: string, exclude?: MonId | MonId[], extra: Mon[] = []): number[] {
  const strat = strategyById(strategyId);
  const ex = new Set(Array.isArray(exclude) ? exclude : exclude ? [exclude] : []);
  const mons = [...teamMons(state, teamId).filter(m => m.tier !== 'ir' && !ex.has(m.id)), ...extra];
  const pairs: [number, number, number][] = [];
  mons.forEach((m, i) => {
    const roles = allRoles(catalog, m);
    strat.slots.forEach((slot, si) => { const f = fitFor(roles, slot); if (f > 0) pairs.push([si, i, f]); });
  });
  pairs.sort((a, b) => b[2] - a[2]);
  const fit = strat.slots.map(() => 0), used = new Set<number>();
  for (const [si, i, f] of pairs) if (!fit[si] && !used.has(i)) { fit[si] = f; used.add(i); }
  return fit;
}

/** The strategies a club builds toward: the one it plays and its two favourites (second favourite weighs a bit less). */
export function targetStrategies(state: LeagueState, teamId: TeamId): [string, number][] {
  const team = state.teams[teamId];
  const out = new Map<string, number>([[team.lineup.strategyId, 1]]);
  const [f1, f2] = team.favoriteStrategies ?? [];
  if (f1) out.set(f1, 1);
  if (f2 && !out.has(f2)) out.set(f2, 0.8);
  return [...out];
}

/** Rating points the mon adds to the team's best slot in the strategies it builds toward (0 = no better than now). */
export function lineupGain(catalog: Catalog, state: LeagueState, teamId: TeamId, mon: Mon): number {
  const roles = allRoles(catalog, mon);
  let gain = 0;
  for (const [sid, w] of targetStrategies(state, teamId)) {
    const fits = slotFits(catalog, state, teamId, sid, mon.id);
    strategyById(sid).slots.forEach((slot, i) => {
      const f = fitFor(roles, slot);
      if (f) gain = Math.max(gain, w * (f - fits[i]));
    });
  }
  return gain;
}

/** How much this team would gain by adding the mon (0..0.35): its lineup gain in the club's current and favourite
 *  strategies, plus a little for the gym's type. */
export function needBoost(catalog: Catalog, state: LeagueState, teamId: TeamId, mon: Mon): number {
  const team = state.teams[teamId];
  let b = clamp(lineupGain(catalog, state, teamId, mon) / 25, 0, 0.35);
  if (team.gymType && catalog.species[mon.speciesId]?.types.includes(team.gymType)) b += 0.03;
  return clamp(b, 0, 0.35);
}

/** Trade value in points (an OVR-95 prime starter ~100). */
export function monValue(catalog: Catalog, state: LeagueState, mon: Mon, viewer: TeamId | null): number {
  const eff = projectedOvr(catalog, state, viewer, mon);
  let v = Math.pow(Math.max(0, eff - 55) / 40, 2) * 100;
  if (mon.age >= 31) v *= Math.max(0.3, 1 - 0.13 * (mon.age - 30));
  if (mon.contract && mon.contract.yearsLeft > 0) {
    const surplus = (marketSalary(catalog, state, mon) - mon.contract.salary) / 1e6;
    v += surplus * Math.min(mon.contract.yearsLeft, 3) * 0.8;
  }
  if (mon.injury?.kind === 'ir') v *= 0.7;
  if (viewer && mon.teamId !== viewer) v *= 1 + needBoost(catalog, state, viewer, mon);
  if (viewer && mon.teamId === viewer && mon.tier === 'active') v *= 1.15;
  return Math.max(0, v);
}

/** The season of the next draft to be held (the draft after season S is season S's draft). */
export const nextDraftSeason = (state: LeagueState): number =>
  state.phase === 'resign' || state.phase === 'free-agency' ? state.season + 1 : state.season;

export function pickValue(state: LeagueState, pick: DraftPick): number {
  const order = reverseStandings(state);
  const idx = order.indexOf(pick.originalTeamId);
  const base = pick.round === 1 ? 45 - idx * 2 : pick.round === 2 ? 10 : 4;
  const draftSeason = nextDraftSeason(state);
  return base * Math.pow(0.8, Math.max(0, pick.season - draftSeason));
}
