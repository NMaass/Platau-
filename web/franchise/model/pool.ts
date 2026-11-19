// Rarity pool: a finite count per species family, drawn without replacement.
// Legendary/mythical families start at 1, pseudo-legendary at ~3, others ~20.
// A retiring mon returns its family's slot so the league never runs dry.
import type {Catalog, CatalogSpecies, LeagueState, Rarity} from '../types.ts';
import type {Rng} from './rng.ts';

export interface PoolCounts { legendary: number; pseudo: number; common: number }
export const DEFAULT_POOL_COUNTS: PoolCounts = {legendary: 1, pseudo: 3, common: 20};

export interface FamilyInfo {
  id: string;
  bucket: 'legendary' | 'pseudo' | 'common';
  bases: string[];          // species with no pre-evolution inside the family (formes count separately)
  members: string[];
}

const cache = new WeakMap<Catalog, Map<string, FamilyInfo>>();

const isLegend = (r: Rarity) => r === 'legendary' || r === 'mythical';

export function families(catalog: Catalog): Map<string, FamilyInfo> {
  let m = cache.get(catalog);
  if (m) return m;
  m = new Map();
  for (const sp of Object.values(catalog.species)) {
    if (!sp.sets.length) continue;
    let f = m.get(sp.family);
    if (!f) { f = {id: sp.family, bucket: 'common', bases: [], members: []}; m.set(sp.family, f); }
    f.members.push(sp.id);
    if (isLegend(sp.rarity)) f.bucket = 'legendary';
    else if (sp.rarity === 'pseudo' && f.bucket !== 'legendary') f.bucket = 'pseudo';
    const pre = sp.evolvesFrom ? catalog.species[sp.evolvesFrom] : undefined;
    if (!pre || !pre.sets.length || pre.family !== sp.family) f.bases.push(sp.id);
  }
  for (const [k, f] of m) if (!f.bases.length) m.delete(k);
  cache.set(catalog, m);
  return m;
}

export function familyOf(catalog: Catalog, speciesId: string): FamilyInfo | undefined {
  const sp = catalog.species[speciesId];
  return sp ? families(catalog).get(sp.family) : undefined;
}

export function initPool(catalog: Catalog, counts: PoolCounts = DEFAULT_POOL_COUNTS): Record<string, number> {
  const pool: Record<string, number> = {};
  for (const f of families(catalog).values()) pool[f.id] = counts[f.bucket];
  return pool;
}

/** Draw one family from the pool (weighted by remaining count). Refills commons if the pool runs dry. */
export function drawFamily(catalog: Catalog, state: LeagueState, rng: Rng, bucket: 'legendary' | 'nonlegendary'): string | null {
  const fams = families(catalog);
  const eligible = (): string[] => Object.keys(state.pool).filter(id => {
    const f = fams.get(id);
    if (!f || state.pool[id] <= 0) return false;
    return bucket === 'legendary' ? f.bucket === 'legendary' : f.bucket !== 'legendary';
  });
  let ids = eligible();
  if (!ids.length && bucket === 'nonlegendary') {
    for (const f of fams.values()) if (f.bucket === 'common') state.pool[f.id] = (state.pool[f.id] ?? 0) + 5;
    ids = eligible();
  }
  if (!ids.length) return null;
  ids.sort();
  const id = rng.weighted(ids, k => state.pool[k])!;
  state.pool[id]--;
  return id;
}

export function returnToPool(state: LeagueState, family: string | undefined): void {
  if (!family || !(family in state.pool)) return;
  state.pool[family]++;
}

/** Species a mon of this family is at a given Growth: start at a base, evolve while Growth allows. */
export function speciesForGrowth(catalog: Catalog, familyId: string, growth: number, rng: Rng): CatalogSpecies {
  const f = families(catalog).get(familyId)!;
  let sp = catalog.species[rng.pick(f.bases)];
  for (let guard = 0; guard < 4; guard++) {
    const next = evolutionTarget(catalog, sp, growth, rng);
    if (!next) break;
    sp = next;
  }
  return sp;
}

/** The species `sp` evolves into at this Growth (random branch), or null. */
export function evolutionTarget(catalog: Catalog, sp: CatalogSpecies, growth: number, rng: Rng): CatalogSpecies | null {
  const opts = sp.evolvesTo.filter(e => growth >= e.level && catalog.species[e.id]?.sets.length);
  if (!opts.length) return null;
  return catalog.species[rng.pick(opts).id];
}
