// Plateau catalog: public surface for the model and UI.
import type {Catalog, Rarity, Role} from '../types.ts';
import {ROLES} from './roles.ts';

export {ROLES, ROLE_ABBR, ROLE_LABEL, TIER_BASE, WEATHER_ABUSER, WEATHER_SETTER} from './roles.ts';
export {deriveRoles, toId, type DeriveContext, type MoveInfo, type RoleSetInput} from './derive-roles.ts';
export {loadCatalogNode, fetchCatalog, CATALOG_PATH} from './load.ts';
export {spriteUrl, animatedSpriteUrl, fallbackSpriteUrl, trainerSpriteUrl, iconSheetPosition, ICON_SHEET_URL, TRAINERS, type SpriteKind} from './sprites.ts';

export interface CatalogStats {
  version: string;
  species: number;
  sets: number;
  setsBySource: Record<'smogon' | 'randbats' | 'generated', number>;
  speciesBySetSource: {smogon: number; randbatsOnly: number; generatedOnly: number};
  byRarity: Record<Rarity, number>;
  /** species able to fill each role */
  byRole: Record<Role, number>;
  families: number;
  levels: {min: number; max: number; mean: number};
}

export function catalogStats(catalog: Catalog): CatalogStats {
  const all = Object.values(catalog.species);
  const setsBySource = {smogon: 0, randbats: 0, generated: 0};
  const byRarity: Record<Rarity, number> = {legendary: 0, mythical: 0, pseudo: 0, common: 0};
  const byRole = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  const spec = {smogon: 0, randbatsOnly: 0, generatedOnly: 0};
  let sets = 0, lmin = Infinity, lmax = -Infinity, lsum = 0;
  for (const s of all) {
    for (const x of s.sets) { setsBySource[x.source]++; sets++; }
    if (s.sets.some((x) => x.source === 'smogon')) spec.smogon++;
    else if (s.sets.every((x) => x.source === 'randbats')) spec.randbatsOnly++;
    else if (s.sets.every((x) => x.source === 'generated')) spec.generatedOnly++;
    byRarity[s.rarity]++;
    for (const r of Object.keys(s.roleBase) as Role[]) byRole[r]++;
    lmin = Math.min(lmin, s.battleLevel); lmax = Math.max(lmax, s.battleLevel); lsum += s.battleLevel;
  }
  return {
    version: catalog.version, species: all.length, sets, setsBySource, speciesBySetSource: spec, byRarity, byRole,
    families: new Set(all.map((s) => s.family)).size,
    levels: {min: lmin, max: lmax, mean: Math.round((lsum / Math.max(1, all.length)) * 10) / 10},
  };
}
