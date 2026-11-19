// Creating individual Pokémon: IV grades, hidden potential, age, Growth by age.
import type {Catalog, CatalogSpecies, Grade, GrowthRate, IvGrade, LeagueState, Mon, RosterTier, StatId, TeamId} from '../types.ts';
import type {Rng} from './rng.ts';
import {GRADES, GROWTH_BAND_HI, GROWTH_BAND_LO, STATS, gi, gradeAt} from './grades.ts';
import {families, speciesForGrowth} from './pool.ts';
import {newId} from './util.ts';

/** IV grade odds per stat: F 10, D 20, C 35, B 25, A 10 (%). */
const IV_ODDS: [IvGrade, number][] = [['F', 10], ['D', 20], ['C', 35], ['B', 25], ['A', 10]];
/** Hidden ceiling odds (%), shifted up one grade for pseudo/legendary families. */
const POTENTIAL_ODDS: [Grade, number][] = [['F', 3], ['D', 8], ['C', 19], ['B', 25], ['A', 24], ['AA', 14], ['AAA', 7]];

export function randomIvs(rng: Rng): Record<StatId, IvGrade> {
  const out = {} as Record<StatId, IvGrade>;
  for (const s of STATS) out[s] = rng.weighted(IV_ODDS, x => x[1])![0];
  return out;
}

export function randomPotential(rng: Rng, bucket: 'legendary' | 'pseudo' | 'common'): Grade {
  const g = rng.weighted(POTENTIAL_ODDS, x => x[1])![0];
  return bucket === 'common' ? g : gradeAt(gi(g) + 1);
}

/** Last age of the prime window by species growth rate (fast peaks and declines earlier). */
export function primeEnd(rate: GrowthRate): number {
  switch (rate) {
    case 'fast': return 27;
    case 'medium-fast': case 'erratic': return 28;
    case 'medium-slow': case 'fluctuating': return 29;
    case 'slow': return 30;
  }
}

/** Growth a mon would have reached by this age (league start, street free agents). */
export function growthForAge(age: number, potential: Grade, rate: GrowthRate, rng: Rng): number {
  const peak = rng.range(GROWTH_BAND_LO[potential], GROWTH_BAND_HI[potential]);
  const maturity = Math.min(1, 0.22 + (age - 21) * 0.13);
  let g = peak * maturity + rng.normal() * 5;
  const past = age - primeEnd(rate);
  if (past > 0) g -= past * (3 + rng.int(3));
  return Math.max(1, Math.min(100, Math.round(g)));
}

/** Best set (by tier base) of a species, the default set when nothing else is chosen. */
export function defaultSetId(sp: CatalogSpecies): string {
  let best = sp.sets[0], bestBase = -1;
  for (const r of Object.values(sp.roleBase)) if (r && r.base > bestBase && sp.sets.some(s => s.id === r.setId)) { bestBase = r.base; best = sp.sets.find(s => s.id === r.setId)!; }
  return best.id;
}

export interface CreateMonOptions {
  family: string; age: number; growth?: number; potential?: Grade;
  teamId?: TeamId | null; tier?: RosterTier; speciesId?: string;
}

export function createMon(catalog: Catalog, state: LeagueState, rng: Rng, o: CreateMonOptions): Mon {
  const fam = families(catalog).get(o.family)!;
  const potential = o.potential ?? randomPotential(rng, fam.bucket);
  const ivs = randomIvs(rng);
  const probe = catalog.species[fam.bases[0]];
  const growth = o.growth ?? growthForAge(o.age, potential, probe.growthRate, rng);
  const sp = o.speciesId ? catalog.species[o.speciesId] : speciesForGrowth(catalog, o.family, growth, rng);
  const mon: Mon = {
    id: newId(state, 'm'), speciesId: sp.id, teamId: o.teamId ?? null, tier: o.tier ?? 'practice',
    age: o.age, ivs, growth, xp: 0, setId: defaultSetId(sp), contract: null, injury: null,
    fame: 0, potential, stats: [], awards: [], family: o.family,
  };
  state.mons[mon.id] = mon;
  return mon;
}

export const isLegendary = (catalog: Catalog, mon: Mon): boolean => {
  const r = catalog.species[mon.speciesId]?.rarity;
  return r === 'legendary' || r === 'mythical';
};

export const GRADE_LIST = GRADES;
