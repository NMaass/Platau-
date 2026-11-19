// How a team values a Pokémon or a draft pick (trades, FA bids, cuts, draft).
// From role ratings, age/potential, contract surplus and the team's role needs.
import type {Catalog, CatalogSpecies, DraftPick, LeagueState, Mon, TeamId} from '../types.ts';
import {EV_ADJ, allRoles, bestRole, speciesRoles} from './ratings.ts';
import {knownPotential, knownRating} from './scouting.ts';
import {marketSalary} from './cap.ts';
import {strategyById} from './strategies.ts';
import {gi, gradeAt} from './grades.ts';
import {clamp} from './util.ts';
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

/** Projected peak rating (young mons with room to grow and evolve). */
export function projectedOvr(catalog: Catalog, state: LeagueState, viewer: TeamId | null, mon: Mon): number {
  const now = perceivedOvr(catalog, state, viewer, mon);
  if (mon.age > 25) return now;
  const pot = viewer ? knownPotential(state, viewer, mon) : {lo: mon.potential, hi: mon.potential};
  const potGrade = gradeAt(Math.round((gi(pot.lo) + gi(pot.hi)) / 2));
  const peak = ceilingBase(catalog, catalog.species[mon.speciesId]) + EV_ADJ[potGrade];
  const w = clamp((26 - mon.age) / 5, 0, 1);
  return now + Math.max(0, peak - now) * 0.6 * w;
}

/** How much this team would gain in its lineup by adding the mon (0..0.35). */
export function needBoost(catalog: Catalog, state: LeagueState, teamId: TeamId, mon: Mon): number {
  const team = state.teams[teamId];
  const strat = strategyById(team.lineup.strategyId);
  const roles = allRoles(catalog, mon);
  let gain = 0;
  strat.slots.forEach((slotRoles, i) => {
    const fit = Math.max(0, ...roles.filter(r => slotRoles.includes(r.role)).map(r => r.ovr));
    if (!fit) return;
    const cur = team.lineup.slots[i]?.monId ? state.mons[team.lineup.slots[i].monId!] : undefined;
    const curFit = cur && cur.teamId === teamId ? Math.max(0, ...allRoles(catalog, cur).filter(r => slotRoles.includes(r.role)).map(r => r.ovr)) : 0;
    gain = Math.max(gain, fit - curFit);
  });
  return clamp(gain / 25, 0, 0.35);
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
