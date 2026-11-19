// Role ratings: tier base of the best set filling the role (catalog roleBase),
// adjusted by EV grade and the IVs of the stats that set invests in. OVR = best.
import type {Catalog, CatalogSet, CatalogSpecies, Grade, Mon, Role, StatId} from '../types.ts';
import {TIER_BASE} from '../catalog/roles.ts';
import {IV_VALUE, effectiveEvGrade} from './grades.ts';

/** EV grade adjustment to the tier base (tunable). */
export const EV_ADJ: Record<Grade, number> = {F: -18, D: -13, C: -9, B: -5, A: -2, AA: 0, AAA: 3};

/** Base for a set: its Smogon tier; randbats/generated sets by battle level. */
export function setBase(sp: CatalogSpecies, set: CatalogSet): number {
  const t = TIER_BASE[set.tier];
  if (t !== undefined) return t;
  if (set.tier === 'Ubers UU') return 89;
  const byLevel = Math.round(100 - (sp.battleLevel - 64));
  return set.source === 'generated' ? Math.min(byLevel, 66) : Math.max(60, Math.min(92, byLevel));
}

const ALL_STATS: StatId[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

/** One role a species can fill: tier base, the set that gives it, and the stats that set invests in. */
export interface RoleEntry { role: Role; base: number; setId: string; keys: StatId[] }

function investedKeys(sp: CatalogSpecies, set: CatalogSet | undefined): StatId[] {
  const keys = set ? (Object.keys(set.evs) as StatId[]).filter(k => (set.evs[k] ?? 0) >= 80) : [];
  if (keys.length) return keys;
  return sp.investedStats.length ? sp.investedStats : ALL_STATS;
}

function ivAdj(mon: Mon, keys: StatId[]): number {
  let sum = 0;
  for (const k of keys) sum += IV_VALUE[mon.ivs[k]];
  return Math.round((sum / keys.length - 26) * 0.4);
}

const rolesCache = new WeakMap<CatalogSpecies, RoleEntry[]>();

/** Every role the species can fill (cached per species object). */
export function speciesRoles(sp: CatalogSpecies): RoleEntry[] {
  const hit = rolesCache.get(sp);
  if (hit) return hit;
  const out = new Map<Role, RoleEntry>();
  const setById = new Map(sp.sets.map(x => [x.id, x]));
  for (const [role, rb] of Object.entries(sp.roleBase) as [Role, {base: number; setId: string}][]) {
    const set = rb && setById.get(rb.setId);
    if (set) out.set(role, {role, base: rb.base, setId: rb.setId, keys: investedKeys(sp, set)});
  }
  for (const set of sp.sets) {
    const b = setBase(sp, set);
    for (const role of set.roles) if (!out.has(role)) out.set(role, {role, base: b, setId: set.id, keys: investedKeys(sp, set)});
  }
  const res = [...out.values()];
  rolesCache.set(sp, res);
  return res;
}

const rate = (mon: Mon, r: RoleEntry, grade: Grade) => Math.max(1, Math.min(99, r.base + EV_ADJ[grade] + ivAdj(mon, r.keys)));

export function ratingWith(catalog: Catalog, mon: Mon, role: Role, grade: Grade): {ovr: number; setId: string} | null {
  const sp = catalog.species[mon.speciesId];
  if (!sp) return null;
  const r = speciesRoles(sp).find(x => x.role === role);
  return r ? {ovr: rate(mon, r, grade), setId: r.setId} : null;
}

export function roleRating(catalog: Catalog, mon: Mon, role: Role): number | null {
  return ratingWith(catalog, mon, role, effectiveEvGrade(mon))?.ovr ?? null;
}

export function allRoles(catalog: Catalog, mon: Mon): {role: Role; ovr: number; setId: string}[] {
  const sp = catalog.species[mon.speciesId];
  if (!sp) return [];
  const g = effectiveEvGrade(mon);
  const out = speciesRoles(sp).map(r => ({role: r.role, ovr: rate(mon, r, g), setId: r.setId}));
  out.sort((a, b) => b.ovr - a.ovr || (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
  return out;
}

export function bestRole(catalog: Catalog, mon: Mon): {role: Role; ovr: number} {
  const sp = catalog.species[mon.speciesId];
  if (!sp) return {role: 'attacker', ovr: 40};
  const g = effectiveEvGrade(mon);
  let best: {role: Role; ovr: number} | null = null;
  for (const r of speciesRoles(sp)) {
    const o = rate(mon, r, g);
    if (!best || o > best.ovr || (o === best.ovr && r.role < best.role)) best = {role: r.role, ovr: o};
  }
  return best ?? {role: 'attacker', ovr: 40};
}

export const ovr = (catalog: Catalog, mon: Mon): number => bestRole(catalog, mon).ovr;

/** Best set for a role on this mon's current species (falls back to its chosen set). */
export function setForRole(catalog: Catalog, mon: Mon, role: Role): string {
  const sp = catalog.species[mon.speciesId];
  const r = speciesRoles(sp).find(x => x.role === role);
  if (r) return r.setId;
  return sp.sets.some(s => s.id === mon.setId) ? mon.setId : sp.sets[0].id;
}
