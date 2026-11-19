// The 16 Plateau franchises: real gym cities of Generations 1–4, four per region.
// Each club is named for its gym's badge, plays its gym's type, and shows the badge as its logo
// (assets/badges/<badge>.png, PokeAPI badge sprites numbered 1..32 in game order).
import type {TeamId} from '../types.ts';

export const CONFERENCE_NAMES: [string, string] = ['Indigo Conference', 'Lily of the Valley Conference'];
export const DIVISION_NAMES: [[string, string], [string, string]] = [['Kanto', 'Johto'], ['Hoenn', 'Sinnoh']];

export interface TeamSeed {
  city: string; name: string; abbr: string;
  /** the gym type's colour (the design system's .ty-* palette, AA on white) */
  color: string;
  /** gym leader, a Showdown trainer sprite id (catalog/sprites.ts TRAINERS) */
  trainer: string;
  leader: string;
  gymType: string;
  /** badge number 1..32 (assets/badges/<n>.png) */
  badge: number;
  badgeName: string;
  /** two strategies that suit the gym type, best first (strategies.ts ids) */
  favorites: [string, string];
}

/** Index i: conference = i >> 3, division = (i >> 2) & 1. One gym type per club, all 16 different. */
export const TEAM_SEEDS: TeamSeed[] = [
  // Kanto
  {city: 'Pewter', name: 'Boulders', abbr: 'PEW', color: '#6B5B16', trainer: 'brock', leader: 'Brock', gymType: 'Rock', badge: 1, badgeName: 'Boulder Badge', favorites: ['sand', 'balance']},
  {city: 'Cerulean', name: 'Cascades', abbr: 'CER', color: '#2F5FB8', trainer: 'misty', leader: 'Misty', gymType: 'Water', badge: 2, badgeName: 'Cascade Badge', favorites: ['rain', 'bulky-offense']},
  {city: 'Fuchsia', name: 'Souls', abbr: 'FCH', color: '#7A3F8C', trainer: 'koga', leader: 'Koga', gymType: 'Poison', badge: 5, badgeName: 'Soul Badge', favorites: ['hazard-stack', 'stall']},
  {city: 'Viridian', name: 'Earthquakes', abbr: 'VIR', color: '#7A5A1C', trainer: 'giovanni', leader: 'Giovanni', gymType: 'Ground', badge: 8, badgeName: 'Earth Badge', favorites: ['sand', 'bulky-offense']},
  // Johto
  {city: 'Azalea', name: 'Hive', abbr: 'AZA', color: '#56620E', trainer: 'bugsy', leader: 'Bugsy', gymType: 'Bug', badge: 10, badgeName: 'Hive Badge', favorites: ['hazard-stack', 'hyper-offense']},
  {city: 'Goldenrod', name: 'Plains', abbr: 'GOL', color: '#6A6458', trainer: 'whitney', leader: 'Whitney', gymType: 'Normal', badge: 11, badgeName: 'Plain Badge', favorites: ['balance', 'bulky-offense']},
  {city: 'Cianwood', name: 'Storm', abbr: 'CWD', color: '#A1352B', trainer: 'chuck', leader: 'Chuck', gymType: 'Fighting', badge: 13, badgeName: 'Storm Badge', favorites: ['hyper-offense', 'bulky-offense']},
  {city: 'Blackthorn', name: 'Risers', abbr: 'BLA', color: '#5B32C9', trainer: 'clair', leader: 'Clair', gymType: 'Dragon', badge: 16, badgeName: 'Rising Badge', favorites: ['hyper-offense', 'sand']},
  // Hoenn
  {city: 'Mauville', name: 'Dynamos', abbr: 'MAU', color: '#7A5E00', trainer: 'wattson', leader: 'Wattson', gymType: 'Electric', badge: 19, badgeName: 'Dynamo Badge', favorites: ['rain', 'hyper-offense']},
  {city: 'Lavaridge', name: 'Heat', abbr: 'LAV', color: '#B04A16', trainer: 'flannery', leader: 'Flannery', gymType: 'Fire', badge: 20, badgeName: 'Heat Badge', favorites: ['sun', 'hyper-offense']},
  {city: 'Fortree', name: 'Feathers', abbr: 'FOR', color: '#5E50B0', trainer: 'winona', leader: 'Winona', gymType: 'Flying', badge: 22, badgeName: 'Feather Badge', favorites: ['hyper-offense', 'balance']},
  {city: 'Mossdeep', name: 'Minds', abbr: 'MOS', color: '#A3365F', trainer: 'tate', leader: 'Tate & Liza', gymType: 'Psychic', badge: 23, badgeName: 'Mind Badge', favorites: ['balance', 'bulky-offense']},
  // Sinnoh
  {city: 'Eterna', name: 'Forest', abbr: 'ETE', color: '#2F6B22', trainer: 'gardenia', leader: 'Gardenia', gymType: 'Grass', badge: 26, badgeName: 'Forest Badge', favorites: ['sun', 'balance']},
  {city: 'Hearthome', name: 'Relics', abbr: 'HEA', color: '#5B4380', trainer: 'fantina', leader: 'Fantina', gymType: 'Ghost', badge: 29, badgeName: 'Relic Badge', favorites: ['stall', 'balance']},
  {city: 'Canalave', name: 'Miners', abbr: 'CAN', color: '#5A5A70', trainer: 'byron', leader: 'Byron', gymType: 'Steel', badge: 30, badgeName: 'Mine Badge', favorites: ['stall', 'hazard-stack']},
  {city: 'Snowpoint', name: 'Icicles', abbr: 'SNO', color: '#2A6F7A', trainer: 'candice', leader: 'Candice', gymType: 'Ice', badge: 31, badgeName: 'Icicle Badge', favorites: ['snow', 'hyper-offense']},
];

export const teamIdAt = (i: number): TeamId => `t${i}`;

/** Badge art for a badge number, relative to the app (build.mjs copies assets/ into dist). */
export const badgeUrl = (badge: number): string => `assets/badges/${badge}.png`;

/** A team's seed by its id (t0..t15); undefined for unknown ids. */
export const seedOf = (id: TeamId): TeamSeed | undefined => TEAM_SEEDS[Number(id.slice(1))];
