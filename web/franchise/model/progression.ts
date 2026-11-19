// Growth (1–100 XP track): XP from box scores and practice, grade-ups,
// evolution at the real level measured on Growth, aging and decline, retirement.
import type {Catalog, Grade, GrowthRate, LeagueState, Mon, MonBox} from '../types.ts';
import type {Rng} from './rng.ts';
import {GROWTH_BAND_HI, baseEvGrade, gi} from './grades.ts';
import {evolutionTarget} from './pool.ts';
import {defaultSetId, primeEnd} from './mons.ts';
import {setForRole} from './ratings.ts';

/** XP knobs (tunable). */
export const XP = {
  played: 15, win: 20, ko: 25, damageDealt: 0.2, damageTaken: 0.05, status: 8, hazard: 10, seriesMvp: 60,
  practiceActive: 30, practiceBackup: 60, practiceSquad: 75, focus: 200, seriesWinTeam: 10,
  pastPotential: 0.25,
};

const RATE: Record<GrowthRate, number> = {fast: 0.8, 'medium-fast': 1, erratic: 1, 'medium-slow': 1.1, fluctuating: 1.05, slow: 1.2};

export function xpToNext(growth: number, rate: GrowthRate): number {
  return Math.round(120 * RATE[rate] * (1 + growth / 30));
}

export function battleXp(box: MonBox, won: boolean): number {
  if (!box.played) return 0;
  return Math.round(XP.played + (won ? XP.win : 0) + box.kos * XP.ko + box.damageDealt * XP.damageDealt
    + box.damageTaken * XP.damageTaken + box.statusInflicted * XP.status + (box.hazardsSet + box.hazardsRemoved) * XP.hazard);
}

export function addXp(catalog: Catalog, mon: Mon, xp: number): void {
  if (xp <= 0) return;
  const past = mon.growth > GROWTH_BAND_HI[mon.potential];
  mon.xp += Math.round(past ? xp * XP.pastPotential : xp);
}

export interface GrowthEvent { mon: Mon; kind: 'grade-up' | 'evolved' | 'grade-down'; from: string; to: string }

/** Turn banked XP into Growth levels; evolve when Growth reaches the evolution level. */
export function levelUp(catalog: Catalog, state: LeagueState, rng: Rng, mon: Mon): GrowthEvent[] {
  const events: GrowthEvent[] = [];
  const sp0 = catalog.species[mon.speciesId];
  const before = baseEvGrade(mon);
  for (let guard = 0; guard < 100 && mon.growth < 100; guard++) {
    const need = xpToNext(mon.growth, sp0.growthRate);
    if (mon.xp < need) break;
    mon.xp -= need;
    mon.growth++;
  }
  if (mon.growth >= 100) { mon.growth = 100; mon.xp = 0; }
  const after = baseEvGrade(mon);
  if (gi(after) > gi(before)) events.push({mon, kind: 'grade-up', from: before, to: after});
  const evo = evolve(catalog, state, rng, mon);
  if (evo) events.push(evo);
  return events;
}

export function evolve(catalog: Catalog, state: LeagueState, rng: Rng, mon: Mon): GrowthEvent | null {
  const sp = catalog.species[mon.speciesId];
  const target = evolutionTarget(catalog, sp, mon.growth, rng);
  if (!target) return null;
  const from = sp.name;
  mon.speciesId = target.id;
  // keep the role it was playing if the new species fills it
  const slot = mon.teamId ? state.teams[mon.teamId]?.lineup.slots.find(s => s.monId === mon.id) : undefined;
  mon.setId = slot ? setForRole(catalog, mon, slot.role) : defaultSetId(target);
  if (slot) slot.setId = mon.setId;
  return {mon, kind: 'evolved', from, to: target.name};
}

/** Offseason aging: +1 year; past the prime window, lose Growth (and so EV grades). */
export function ageMon(catalog: Catalog, rng: Rng, mon: Mon): GrowthEvent | null {
  mon.age++;
  const sp = catalog.species[mon.speciesId];
  const past = mon.age - primeEnd(sp.growthRate);
  if (past <= 0) return null;
  const before = baseEvGrade(mon);
  mon.growth = Math.max(1, mon.growth - (2 + past * 2 + rng.int(3)));
  mon.xp = 0;
  const after = baseEvGrade(mon);
  return gi(after) < gi(before) ? {mon, kind: 'grade-down', from: before, to: after} : null;
}

/** Chance to retire this offseason (30–36 by age, injuries, decline). */
export function retireChance(catalog: Catalog, mon: Mon): number {
  if (mon.age < 30) return 0;
  const base: Record<number, number> = {30: 0.05, 31: 0.1, 32: 0.18, 33: 0.3, 34: 0.45, 35: 0.65};
  let p = mon.age >= 36 ? 1 : base[mon.age] ?? 0;
  if (mon.injury?.kind === 'ir' || mon.gradeCap) p += 0.15;
  const g: Grade = baseEvGrade(mon);
  if (gi(g) >= 5) p *= 0.6;
  if (gi(g) <= 1) p += 0.2;
  if (!mon.teamId) p += 0.25;
  return Math.min(1, p);
}
