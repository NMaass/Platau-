// Build the Plateau static catalog (web/franchise/data/catalog.json).
//   node web/franchise/scripts/build-catalog.ts        (from the repo root or web/)
//
// Sources (no network needed; growth rates are vendored in catalog/growth-rates.json):
//   species/formes, learnsets, moves, items   @pkmn/sim Dex, gen9 (+Past), filtered to what the engine knows
//   battle levels, randbats roles/movepools   pokemon-showdown@0.11.11 data/random-battles/gen*/sets.json
//   concrete gen9 randbats sets (items)       rollmons/data/gen9randombattle.json
//   Smogon sets                               rollmons/data/smogon_sets.json via web/game/smogon-sets.ts
//   player sets                               rollmons/sets/*.txt
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {Dex, Teams} from '@pkmn/sim';
import type {Catalog, CatalogSet, CatalogSpecies, GrowthRate, Rarity, Role, StatId, StatTable} from '../types.ts';
import {ROLE_LABEL, TIER_BASE} from '../catalog/roles.ts';
import {deriveRoles, toId, type DeriveContext, type MoveInfo, BOOST, RECOVERY, HAZARD_ROCKS, HAZARD_SPIKES, REMOVAL, PIVOT, PHAZE} from '../catalog/derive-roles.ts';
import {loadUsableSmogonSets} from '../../game/smogon-sets.ts';
import {exportBlocks} from '../../game/showdown-export.ts';
import {loadGameData} from '../../scripts/game-data.ts';
import {loadEngine, REPO_ROOT} from '../../scripts/load-engine.ts';

const t0 = Date.now();
const require = createRequire(import.meta.url);
const dex = Dex.forGen(9);
const STATS: StatId[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const log = (...a: unknown[]) => console.log(...a);
const engine = await loadEngine();
const unknownNames = (kind: string, names: Iterable<string>): Set<string> =>
  new Set(JSON.parse(engine.unknown_names(kind, [...new Set([...names].map((n) => toId(n).toUpperCase()))].join(','))));

// ------------------------------------------------------------------ species
type Sp = ReturnType<typeof dex.species.get>;
const sameArr = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);
function isCosmeticDuplicate(s: Sp): boolean {
  if (!s.forme || s.requiredItem || s.requiredItems?.length || s.requiredMove) return false;
  if (s.baseSpecies === 'Pikachu') return true; // cap / cosplay Pikachu: same battler as Pikachu
  const base = dex.species.get(s.baseSpecies);
  return sameArr(s.types, base.types) && STATS.every((k) => s.baseStats[k] === base.baseStats[k]) &&
    sameArr(Object.values(s.abilities), Object.values(base.abilities));
}
// Formes that exist in the data but were never obtainable as battlers.
const UNOBTAINABLE = new Set(['eternatuseternamax', 'floetteeternal', 'pichuspikyeared']);
const candidates = dex.species.all().filter((s) =>
  s.exists && (s.isNonstandard === null || s.isNonstandard === 'Past') && !s.battleOnly && !s.isCosmeticForme &&
  !/Totem|Gmax|Mega|Primal|Starter/.test(s.forme) && !isCosmeticDuplicate(s) && !UNOBTAINABLE.has(s.id));
const unknownSpecies = unknownNames('species', candidates.map((s) => s.id));
const speciesList = candidates.filter((s) => !unknownSpecies.has(s.id.toUpperCase()));
const included = new Map<string, Sp>(speciesList.map((s) => [s.id, s]));
log(`species: ${candidates.length} candidates, ${unknownSpecies.size} unknown to the engine (${[...unknownSpecies].join(' ')}), ${speciesList.length} included`);

// ------------------------------------------------------------------ randbats data
interface RbRole { role: string; movepool: string[]; abilities?: string[] }
interface RbEntry { level?: number; sets?: RbRole[] }
const rbGens: Record<number, Record<string, RbEntry>> = {};
for (const g of [9, 8, 7, 6, 5, 4, 3, 2]) rbGens[g] = require(`pokemon-showdown/data/random-battles/gen${g}/sets.json`);
const rbConcrete: Record<string, Record<string, number>> = JSON.parse(readFileSync(`${REPO_ROOT}rollmons/data/gen9randombattle.json`, 'utf8'));

function rbLevelOwn(id: string): number | undefined {
  for (const g of [9, 8, 7, 6, 5, 4, 3, 2]) { const l = rbGens[g][id]?.level; if (l) return l; }
  return undefined;
}
function rbRolesOwn(id: string): {gen: number; sets: RbRole[]} | undefined {
  for (const g of [9, 8, 7, 6, 5, 4, 3, 2]) { const e = rbGens[g][id]; if (e?.sets?.length) return {gen: g, sets: e.sets}; }
  return undefined;
}

// Least-squares level ~ BST over the gen9 randbats levels.
const bstOf = (s: Sp) => STATS.reduce((n, k) => n + s.baseStats[k], 0);
const fitPts = Object.entries(rbGens[9]).filter(([id, e]) => e.level && dex.species.get(id).exists).map(([id, e]) => [bstOf(dex.species.get(id)), e.level!]);
const mx = fitPts.reduce((a, p) => a + p[0], 0) / fitPts.length, my = fitPts.reduce((a, p) => a + p[1], 0) / fitPts.length;
const slope = fitPts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / fitPts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
const fitLevel = (bst: number) => Math.max(64, Math.min(100, Math.round(my + slope * (bst - mx))));
log(`level fit: level = ${my.toFixed(1)} + ${slope.toFixed(4)} * (BST - ${mx.toFixed(0)}) over ${fitPts.length} gen9 levels`);

function battleLevel(s: Sp): number {
  const own = rbLevelOwn(s.id);
  if (own) return Math.max(64, Math.min(100, own));
  if (s.forme) { const b = rbLevelOwn(toId(s.baseSpecies)); if (b) return Math.max(64, Math.min(100, b)); }
  return fitLevel(bstOf(s));
}

// ------------------------------------------------------------------ rarity, family, growth
const PSEUDO_ROOTS = new Set(['dratini', 'larvitar', 'bagon', 'beldum', 'gible', 'deino', 'goomy', 'jangmoo', 'dreepy', 'frigibax']);
function family(s: Sp): string {
  let cur = s;
  for (let i = 0; i < 5 && cur.prevo; i++) {
    let p = dex.species.get(cur.prevo);
    if (p.exists && !included.has(p.id) && p.forme) p = dex.species.get(p.baseSpecies); // Rockruff-Dusk -> Rockruff
    if (!p.exists || !included.has(p.id)) break;
    cur = p;
  }
  // Formes without a prevo (Rotom-Wash, Arceus-Fire) belong to their base species' line.
  if (cur.id === s.id && s.forme && !s.prevo) return family(dex.species.get(s.baseSpecies));
  return cur.id;
}
function rarity(s: Sp, fam: string): Rarity {
  const tags = s.tags as string[];
  if (tags.includes('Mythical')) return 'mythical';
  if (tags.includes('Restricted Legendary') || tags.includes('Sub-Legendary')) return 'legendary';
  // Ultra Beasts and Paradox Pokémon are rare like pseudo-legendaries (~3 each), not common (lead's call, 2026-11-19).
  if (PSEUDO_ROOTS.has(fam) || tags.includes('Ultra Beast') || tags.includes('Paradox')) return 'pseudo';
  return 'common';
}
const growthJson: {byNum: Record<string, GrowthRate>} = JSON.parse(readFileSync(new URL('../catalog/growth-rates.json', import.meta.url), 'utf8'));
let growthFallbacks = 0;
function growthRate(s: Sp, r: Rarity): GrowthRate {
  const g = growthJson.byNum[String(s.num)];
  if (g) return g;
  growthFallbacks++;
  return r === 'common' ? (bstOf(s) >= 500 ? 'medium-slow' : 'medium-fast') : 'slow';
}

// Evolution levels. Real evoLevel where Showdown has one. Otherwise (stone, trade, friendship,
// move, other) a level equivalent: a single-evolution (2-stage) line evolves at 36; in a
// 3-stage line the first evolution is at 30 (or 10 below a real second level) and the second
// at 50 (or 15 above a real first level, if that is later).
function stageOf(s: Sp): number { let n = 0, cur = s; while (cur.prevo && n < 4) { cur = dex.species.get(cur.prevo); n++; } return n; }
function lineDepth(s: Sp): number { // stages below the root to the deepest final form through s's line
  const root = dex.species.get(family(s));
  const walk = (x: Sp, d: number): number => Math.max(d, ...x.evos.map((e) => walk(dex.species.get(e), d + 1)));
  return walk(root.exists ? root : s, 0);
}
function evoLevel(from: Sp, to: Sp): number {
  if (to.evoLevel) return to.evoLevel;
  const depth = lineDepth(from), stage = stageOf(from);
  if (depth <= 1) return 36;
  if (stage === 0) {
    const nextReal = Math.min(...to.evos.map((e) => dex.species.get(e).evoLevel ?? Infinity));
    return Number.isFinite(nextReal) ? Math.min(30, nextReal - 10) : 30;
  }
  return Math.max(50, (from.evoLevel ?? 0) + 15);
}

// ------------------------------------------------------------------ moves, learnsets, items
const moveCache = new Map<string, MoveInfo | undefined>();
function moveInfo(name: string): MoveInfo | undefined {
  const id = toId(name);
  if (!moveCache.has(id)) {
    const m = dex.moves.get(id);
    moveCache.set(id, m.exists ? {category: m.category, type: m.type, basePower: m.basePower} : undefined);
  }
  return moveCache.get(id);
}
const validMove = (name: string) => {
  const m = dex.moves.get(name);
  return m.exists && (m.isNonstandard === null || m.isNonstandard === 'Past') && !m.isZ && !m.isMax && !m.id.startsWith('hiddenpower');
};
const allGen9Moves = dex.moves.all().filter((m) => validMove(m.id));
const unknownMoves = unknownNames('move', allGen9Moves.map((m) => m.id));
const engineMove = (name: string) => validMove(name) && !unknownMoves.has(toId(name).toUpperCase());

const learnCache = new Map<string, Set<string>>();
function learnable(s: Sp): Set<string> {
  if (learnCache.has(s.id)) return learnCache.get(s.id)!;
  const out = new Set<string>();
  const add = (id: string) => { const l = dex.species.getLearnsetData(id as never)?.learnset; if (l) for (const k of Object.keys(l)) out.add(k); return !!l; };
  let cur: Sp | undefined = s;
  for (let i = 0; cur && i < 5; i++) {
    if (!add(cur.id) && cur.forme) add(toId(cur.baseSpecies));
    if (cur.changesFrom) add(toId(cur.changesFrom));
    cur = cur.prevo ? dex.species.get(cur.prevo) : undefined;
  }
  learnCache.set(s.id, out);
  return out;
}
const itemName = (id: string) => { const it = dex.items.get(id); return it.exists ? it.name : id; };
const isMegaOrZ = (item: string) => { const it = dex.items.get(item); return !!(it.exists && (it.megaStone || (it as {megaEvolves?: string}).megaEvolves || it.zMove || (it as {onPrimal?: unknown}).onPrimal || /^(Red|Blue) Orb$/.test(it.name))); };

// ------------------------------------------------------------------ set helpers
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const evsFrom = (e: Partial<StatTable> | undefined): Partial<StatTable> => {
  const out: Partial<StatTable> = {};
  for (const k of STATS) if (e?.[k]) out[k] = e[k];
  return out;
};
const ctxFor = (s: Sp): DeriveContext => ({move: moveInfo, baseStats: s.baseStats as StatTable, types: [...s.types]});
type Draft = Omit<CatalogSet, 'id' | 'roles'> & {rbRole?: string; ivs?: Partial<StatTable>; format?: string};

const SMOGON_TIER: Record<string, string> = {Ubers: 'Uber', 'Ubers UU': 'Ubers UU', 'Almost Any Ability': 'AG'};
function smogonTier(format: string): string {
  let f = format.replace(/^National Dex\s+/, '').replace(/\s*\(.*\)$/, '').trim();
  f = SMOGON_TIER[f] ?? f;
  return f;
}
const tierBase = (tier: string) => TIER_BASE[tier] ?? 62;

/** A Smogon set never rates above what the species actually plays at: its own Showdown tier (data/tiers.json,
 *  latest generation). Odd formats (AG) count only when that is the species' own tier; NFE/LC species cap at ZU. */
function cappedTier(setTier: string, speciesId: string): string {
  const raw = speciesTiers[speciesId];
  if (!raw) return setTier === 'AG' ? 'Uber' : setTier;
  const own = raw === 'NFE' || raw === 'LC' ? 'ZU' : raw;
  if (setTier === 'AG' && own !== 'AG') return own;
  if (setTier === 'LC') return setTier;
  return (TIER_BASE[setTier] ?? 62) > (TIER_BASE[own] ?? 62) ? own : setTier;
}

/** Rating base for randbats/generated sets: by battle level; NFEs below 62 by BST. */
function levelBase(s: Sp, level: number): number {
  if (s.evos.some((e) => included.has(toId(e)))) {
    const bst = bstOf(s);
    return bst >= 450 ? 60 : bst >= 400 ? 56 : bst >= 330 ? 52 : 48;
  }
  return level <= 74 ? 90 : level <= 79 ? 84 : level <= 84 ? 78 : level <= 89 ? 72 : 66;
}

function offenseStat(s: Sp, moves: string[]): 'atk' | 'spa' {
  let p = 0, sp = 0;
  for (const m of moves) { const i = moveInfo(m); if (i?.category === 'Physical') p++; else if (i?.category === 'Special') sp++; }
  if (p === sp) return s.baseStats.atk >= s.baseStats.spa ? 'atk' : 'spa';
  return p > sp ? 'atk' : 'spa';
}

/** A sensible EV spread + nature for a randbats role label. */
function spreadFor(s: Sp, role: string, moves: string[]): {evs: Partial<StatTable>; nature: string} {
  const off = offenseStat(s, moves);
  const phys = off === 'atk';
  if (/bulky support|staller|bulky setup|av pivot/i.test(role)) {
    if (/av pivot/i.test(role)) return {evs: {hp: 252, [off]: 4, spd: 252}, nature: phys ? 'Careful' : 'Calm'};
    const physWall = s.baseStats.def >= s.baseStats.spd;
    return {evs: {hp: 252, def: physWall ? 252 : 4, spd: physWall ? 4 : 252}, nature: physWall ? (phys ? 'Impish' : 'Bold') : (phys ? 'Careful' : 'Calm')};
  }
  if (/bulky attacker/i.test(role)) return {evs: {hp: 252, [off]: 252, spe: 4}, nature: phys ? 'Adamant' : 'Modest'};
  if (/fast support/i.test(role)) return {evs: {hp: 252, def: 4, spe: 252}, nature: phys ? 'Jolly' : 'Timid'};
  if (/wallbreaker/i.test(role)) return {evs: {hp: 4, [off]: 252, spe: 252}, nature: phys ? 'Adamant' : 'Modest'};
  return {evs: {hp: 4, [off]: 252, spe: 252}, nature: phys ? 'Jolly' : 'Timid'};
}

// Attacks a generated set should never pick (situational, self-defeating or gimmick moves).
const BAD_ATTACKS = new Set(['focuspunch', 'lastresort', 'dreameater', 'belch', 'synchronoise', 'steelbeam', 'mindblown', 'skydrop',
  'shelltrap', 'beakblast', 'fling', 'naturalgift', 'spitup', 'snore', 'burnup', 'doubleshock', 'hyperspacefury', 'lightthatburnsthesky',
  'chloroblast', 'endeavor', 'uproar', 'thrash', 'petaldance', 'rollout', 'iceball', 'outrage', 'ragingfury', 'futuresight', 'doomdesire',
  'echoedvoice', 'furycutter', 'round', 'stompingtantrum', 'trumpcard', 'wringout', 'crushgrip', 'present', 'magnitude', 'payday', 'feint',
  'fakeout', 'firstimpression', 'suckerpunch', 'upperhand', 'thunderclap', 'pursuit', 'retaliate', 'revenge', 'avalanche', 'payback',
  'counter', 'mirrorcoat', 'metalburst', 'comeuppance', 'bide', 'gigatonhammer', 'bloodmoon', 'solarbeam', 'solarblade', 'meteorbeam']);

function attackScore(s: Sp, m: ReturnType<typeof dex.moves.get>, off: 'atk' | 'spa', strict = false): number {
  if (m.category === 'Status' || !m.basePower || (strict && (BAD_ATTACKS.has(m.id) || m.priority < 0))) return 0;
  if (m.flags.charge || m.flags.recharge || m.selfdestruct || m.ohko || m.flags.futuremove) return 0;
  const wantCat = off === 'atk' ? 'Physical' : 'Special';
  let bp = m.basePower * (typeof m.multihit === 'number' ? m.multihit : Array.isArray(m.multihit) ? 3 : 1);
  bp = Math.min(bp, 150);
  const acc = m.accuracy === true ? 1 : m.accuracy / 100;
  const stab = s.types.includes(m.type) ? 1.5 : 1;
  const cat = m.category === wantCat ? 1 : 0.55;
  const drawback = m.self?.boosts || m.selfBoost ? 0.9 : 1;
  return bp * acc * stab * cat * drawback;
}

const UTILITY_ORDER = ['stealthrock', 'spikes', 'toxicspikes', 'rapidspin', 'defog', 'mortalspin', 'uturn', 'voltswitch', 'flipturn',
  'partingshot', 'teleport', 'chillyreception', 'willowisp', 'toxic', 'thunderwave', 'knockoff', 'whirlwind', 'roar', 'haze'];

/** Pick up to four moves from a pool for a role: role-defining status moves first, then the best attacks of distinct types. */
function pickMoves(s: Sp, pool: string[], role: string, fromLearnset = false): string[] {
  const valid = [...new Set(pool.map(toId))].filter(engineMove).map((id) => dex.moves.get(id));
  // A randbats movepool says which side the set attacks from; a whole learnset does not, so use base stats.
  const off = fromLearnset ? (s.baseStats.atk >= s.baseStats.spa ? 'atk' : 'spa') : offenseStat(s, valid.map((m) => m.id));
  const out: string[] = [];
  const add = (id: string) => { if (out.length < 4 && !out.includes(id)) out.push(id); };
  const status = valid.filter((m) => m.category === 'Status');
  const setup = /setup/i.test(role);
  const support = /support|staller|bulky setup/i.test(role);
  if (setup) { const b = status.find((m) => BOOST.has(m.id)); if (b) add(b.id); }
  if (support || setup) { const r = status.find((m) => RECOVERY.has(m.id)); if (r) add(r.id); }
  if (support) for (const u of UTILITY_ORDER) if (status.some((m) => m.id === u) && out.length < 3) add(u);
  const score = (m: ReturnType<typeof dex.moves.get>) => attackScore(s, m, off, fromLearnset);
  const attacks = valid.filter((m) => score(m) > 0).sort((a, b) => score(b) - score(a));
  const types = new Set<string>();
  for (const m of attacks) if (!types.has(m.type)) { types.add(m.type); add(m.id); }
  for (const m of attacks) add(m.id);
  if (!fromLearnset || out.length < 2) for (const m of status) add(m.id); // learnset with no attacks (Cosmog): its status moves
  if (!out.length && pool.map(toId).includes('hiddenpower')) out.push('hiddenpower'); // Unown
  return out.map((id) => dex.moves.get(id).name);
}

function itemFor(s: Sp, role: string, moves: string[]): string {
  if (s.requiredItem) return s.requiredItem;
  if (s.evos.some((e) => included.has(toId(e))) && s.nfe) return 'Eviolite';
  const statusCount = moves.filter((m) => moveInfo(m)?.category === 'Status').length;
  if (/wallbreaker/i.test(role) && statusCount === 0) return offenseStat(s, moves) === 'atk' ? 'Choice Band' : 'Choice Specs';
  if (/fast attacker|setup sweeper|wallbreaker/i.test(role)) return 'Life Orb';
  if (/av pivot/i.test(role) && statusCount === 0) return 'Assault Vest';
  if (/fast support/i.test(role)) return 'Heavy-Duty Boots';
  return 'Leftovers';
}

function abilityFor(s: Sp, wanted?: string[]): string {
  const own = Object.values(s.abilities) as string[];
  for (const w of wanted ?? []) { const hit = own.find((a) => toId(a) === toId(w)); if (hit) return hit; }
  return own[0];
}

function fixRequired(s: Sp, d: Draft) {
  if (s.requiredItem && toId(d.item) !== toId(s.requiredItem)) d.item = s.requiredItem;
  if (s.requiredMove && !d.moves.some((m) => toId(m) === toId(s.requiredMove!))) {
    const rm = dex.moves.get(s.requiredMove).name;
    if (d.moves.length >= 4) d.moves[3] = rm; else d.moves.push(rm);
  }
}

// ------------------------------------------------------------------ Smogon + player sets
const gameData = loadGameData();
const smogon = loadUsableSmogonSets(gameData.smogon, {pokedex: gameData.pokedex, moves: gameData.moves});
const speciesTiers: Record<string, string> = gameData.tiers;
let megaSkipped = 0;

function draftsFromExport(text: string, s: Sp, meta: {name: string; tier: string; format: string}): Draft | null {
  const team = Teams.import(text.split('\n').filter((l) => !/^\s*tera type:/i.test(l)).join('\n'));
  const p = team?.[0];
  if (!p) return null;
  if (p.item && isMegaOrZ(p.item)) { megaSkipped++; return null; }
  const moves = p.moves.map((m) => dex.moves.get(m)).filter((m) => m.exists).map((m) => m.name).slice(0, 4);
  const ivs: Partial<StatTable> = {};
  for (const k of STATS) if (p.ivs && p.ivs[k] !== undefined && p.ivs[k] !== 31) ivs[k] = p.ivs[k];
  return {
    name: meta.name, tier: meta.tier, source: 'smogon', moves,
    ability: p.ability ? dex.abilities.get(p.ability).name : abilityFor(s),
    item: p.item ? itemName(p.item) : '', nature: p.nature || 'Serious', evs: evsFrom(p.evs),
    ...(Object.keys(ivs).length ? {ivs} : {}), format: meta.format,
  };
}

function smogonDrafts(s: Sp): Draft[] {
  const out: Draft[] = [];
  for (const raw of smogon[s.id] ?? []) {
    const d = draftsFromExport(raw.export, s, {name: raw.name || raw.label, tier: smogonTier(raw.format), format: `${raw.generation} ${raw.format}`});
    if (d) out.push(d);
  }
  const text = gameData.overrides[s.id];
  if (text) {
    exportBlocks(text).forEach((block, i) => {
      const first = block.trim().split('\n')[0];
      const nick = /^(.+?)\s*\(/.exec(first)?.[1]?.trim();
      const tier = speciesTiers[s.id] && !['NFE', 'LC'].includes(speciesTiers[s.id]) ? speciesTiers[s.id] : (speciesTiers[s.id] ?? 'ZU');
      const d = draftsFromExport(block, s, {name: nick || `Player set ${i + 1}`, tier, format: 'Player set'});
      if (d) out.push(d);
    });
  }
  return out;
}

// ------------------------------------------------------------------ randbats sets
function randbatsDrafts(s: Sp): Draft[] {
  const rb = rbRolesOwn(s.id);
  if (!rb) return [];
  const level = battleLevel(s);
  const out: Draft[] = [];
  const concrete = rb.gen === 9 ? Object.entries(rbConcrete[s.id] ?? {}).map(([enc, n]) => {
    const f = enc.split(',');
    return {item: f[1], ability: f[2], moves: f.slice(3, -1), n};
  }) : [];
  for (const role of rb.sets) {
    if (/tera blast|dynamax/i.test(role.role) && rb.sets.length > 1) continue;
    const poolIds = new Set(role.movepool.map(toId));
    const abil = new Set((role.abilities ?? []).map(toId));
    const fits = concrete.filter((c) => c.moves.every((m) => poolIds.has(m)) && (!abil.size || abil.has(c.ability))).sort((a, b) => b.n - a.n);
    let moves: string[], item: string, ability: string;
    if (fits.length) {
      const c = fits[0];
      moves = c.moves.filter((m) => engineMove(m)).map((m) => dex.moves.get(m).name);
      item = itemName(c.item); ability = dex.abilities.get(c.ability).name;
    } else {
      moves = pickMoves(s, role.movepool, role.role);
      item = itemFor(s, role.role, moves); ability = abilityFor(s, role.abilities);
    }
    if (!moves.length) continue;
    const {evs, nature} = spreadFor(s, role.role, moves);
    out.push({name: role.role, tier: 'Randbats', source: 'randbats', moves, ability, item, nature, evs, rbRole: role.role,
      format: `Gen ${rb.gen} Random Battle (level ${level})`});
  }
  return out;
}

// ------------------------------------------------------------------ generated sets
function relativesFor(s: Sp): Sp[] {
  // Most-evolved relatives first (breadth-first down the evolutions), then the base forme, then the prevo line.
  const out: Sp[] = [];
  const q = [...s.evos.map((e) => dex.species.get(e))];
  const finals: Sp[] = [], mids: Sp[] = [];
  while (q.length) { const x = q.shift()!; (x.evos.length ? mids : finals).push(x); q.push(...x.evos.map((e) => dex.species.get(e))); }
  out.push(...finals, ...mids.reverse());
  if (s.forme) out.push(dex.species.get(s.baseSpecies));
  let p = s.prevo ? dex.species.get(s.prevo) : undefined;
  while (p) { out.push(p); p = p.prevo ? dex.species.get(p.prevo) : undefined; }
  return out.filter((x) => x.exists && x.id !== s.id);
}

function generatedDrafts(s: Sp, built: Map<string, Draft[]>): Draft[] {
  const learn = learnable(s);
  const canLearn = (m: string) => learn.has(toId(m)) && engineMove(m);
  for (const rel of relativesFor(s)) {
    const sets = built.get(rel.id) ?? [];
    if (!sets.length) continue;
    const out: Draft[] = [];
    const seen = new Set<string>();
    for (const src of sets.slice(0, 3)) {
      const kept = src.moves.filter(canLearn);
      if (kept.length < 2) continue;
      const fill = pickMoves(s, [...learn], src.rbRole ?? src.name, true).filter((m) => !kept.includes(m));
      const moves = [...kept, ...fill].slice(0, 4);
      const sig = [...moves].sort().join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      const nfe = s.evos.some((e) => included.has(toId(e)));
      const roles = deriveRoles({moves, ability: abilityFor(s, [src.ability]), item: src.item, evs: src.evs}, src.rbRole, ctxFor(s));
      const primary = roles.find((r) => r !== 'attacker') ?? roles[0];
      out.push({
        name: ROLE_LABEL[primary], tier: 'Generated', source: 'generated', moves,
        ability: abilityFor(s, [src.ability]), item: nfe ? 'Eviolite' : src.item, nature: src.nature, evs: {...src.evs},
        rbRole: src.rbRole, format: `Adapted from ${rel.name}: ${src.name}`,
      });
      if (out.length >= 2) break;
    }
    if (out.length) return out;
  }
  // Nothing to adapt: the four best STAB/coverage moves it learns.
  const fast = s.baseStats.spe >= 80;
  const role = fast ? 'Fast Attacker' : 'Bulky Attacker';
  const moves = pickMoves(s, [...learn], role, true);
  if (!moves.length) return [];
  const {evs, nature} = spreadFor(s, role, moves);
  return [{name: role, tier: 'Generated', source: 'generated', moves, ability: abilityFor(s), item: itemFor(s, role, moves), nature, evs,
    rbRole: role, format: 'Generated from learnset'}];
}

// ------------------------------------------------------------------ assemble
const TIER_RANK = (t: string) => -(TIER_BASE[t] ?? (t === 'Randbats' ? 50 : t === 'Generated' ? 40 : 61));
const built = new Map<string, Draft[]>();
const counts = {smogon: 0, randbats: 0, generated: 0};
for (const s of speciesList) {
  let drafts = smogonDrafts(s);
  if (!drafts.length) drafts = randbatsDrafts(s);
  built.set(s.id, drafts);
}
// Generated sets: process most-evolved first so NFEs can adapt freshly generated relatives too.
const byDepthDesc = [...speciesList].sort((a, b) => stageOf(b) - stageOf(a));
for (const s of byDepthDesc) if (!built.get(s.id)!.length) built.set(s.id, generatedDrafts(s, built));
for (const s of speciesList) if (!built.get(s.id)!.length) built.set(s.id, generatedDrafts(s, built));

// Engine check on every set's names.
const allItems = new Set<string>(), allAbilities = new Set<string>(), allMoves = new Set<string>();
for (const ds of built.values()) for (const d of ds) { if (d.item) allItems.add(d.item); allAbilities.add(d.ability); d.moves.forEach((m) => allMoves.add(m)); }
const badItems = unknownNames('item', allItems), badAbilities = unknownNames('ability', allAbilities), badMoves = unknownNames('move', allMoves);
const engineUnknownItems = [...allItems].filter((i) => badItems.has(toId(i).toUpperCase())).sort();

const species: Record<string, CatalogSpecies> = {};
let tierCapped = 0;
const problems: string[] = [];
for (const s of speciesList) {
  const fam = family(s);
  const r = rarity(s, fam);
  const level = battleLevel(s);
  const ctx = ctxFor(s);
  const sets: CatalogSet[] = [];
  const names = new Map<string, number>();
  const sigs = new Set<string>();
  const drafts = [...built.get(s.id)!].sort((a, b) => TIER_RANK(a.tier) - TIER_RANK(b.tier));
  for (const d of drafts) {
    fixRequired(s, d);
    d.moves = d.moves.filter((m) => !badMoves.has(toId(m).toUpperCase()));
    if (!d.moves.length) { problems.push(`${s.id} ${d.name}: no engine-known moves`); continue; }
    if (badAbilities.has(toId(d.ability).toUpperCase())) d.ability = abilityFor(s);
    const sig = [[...d.moves].sort().join('|'), d.item, d.ability].join('/');
    if (sigs.has(sig)) continue;
    sigs.add(sig);
    let name = d.name;
    if (names.has(name)) name = `${d.name} (${d.tier === 'Randbats' || d.tier === 'Generated' ? names.get(d.name)! + 1 : d.tier})`;
    for (let n = 2; sets.some((x) => x.name === name || x.id === `${s.id}:${slug(name)}`); n++) name = `${d.name} (${n})`;
    names.set(d.name, (names.get(d.name) ?? 0) + 1);
    const {rbRole, ...rest} = d;
    const tier = d.source === 'smogon' ? cappedTier(d.tier, s.id) : d.tier;
    if (tier !== d.tier) tierCapped++;
    sets.push({id: `${s.id}:${slug(name)}`, ...rest, tier, name, roles: deriveRoles(d, rbRole, ctx)});
  }
  if (!sets.length) { problems.push(`${s.id}: no sets`); continue; }
  for (const x of sets) counts[x.source]++;
  const roleBase: CatalogSpecies['roleBase'] = {};
  for (const x of sets) {
    const base = x.source === 'smogon' ? tierBase(x.tier) : levelBase(s, level);
    for (const role of x.roles) {
      const cur = roleBase[role];
      if (!cur || base > cur.base) roleBase[role] = {base, tier: x.tier, setId: x.id};
    }
  }
  const invested = new Set<StatId>();
  for (const x of sets) for (const k of STATS) if ((x.evs[k] ?? 0) >= 100) invested.add(k);
  species[s.id] = {
    id: s.id, name: s.name, num: s.num, types: [...s.types],
    baseStats: {...s.baseStats} as StatTable, bst: bstOf(s), battleLevel: level, rarity: r, growthRate: growthRate(s, r),
    evolvesTo: s.evos.map((e) => dex.species.get(e)).filter((e) => included.has(e.id) && toId(e.prevo) === s.id).map((e) => ({id: e.id, level: evoLevel(s, e)})),
    ...(s.prevo && included.has(toId(s.prevo)) ? {evolvesFrom: toId(s.prevo)} : {}),
    family: fam, sets, roleBase, investedStats: STATS.filter((k) => invested.has(k)), spriteId: s.spriteid,
  };
}

const body = JSON.stringify(species);
const catalog: Catalog & {engineUnknownItems: string[]} = {
  version: `plateau-catalog-${new Date().toISOString().slice(0, 10)}-${createHash('sha1').update(body).digest('hex').slice(0, 8)}`,
  species, engineUnknownItems,
};
const outDir = `${REPO_ROOT}web/franchise/data`;
mkdirSync(outDir, {recursive: true});
const json = JSON.stringify(catalog);
writeFileSync(`${outDir}/catalog.json`, json);

const roleDist: Partial<Record<Role, number>> = {};
for (const sp of Object.values(species)) for (const r of Object.keys(sp.roleBase) as Role[]) roleDist[r] = (roleDist[r] ?? 0) + 1;
const randOnly = Object.values(species).filter((x) => x.sets.every((y) => y.source === 'randbats')).length;
const genOnly = Object.values(species).filter((x) => x.sets.every((y) => y.source === 'generated')).length;
log(`wrote ${outDir}/catalog.json: ${(json.length / 1e6).toFixed(2)} MB, ${Object.keys(species).length} species, sets ${JSON.stringify(counts)}`);
log(`species with randbats-only sets: ${randOnly}, generated-only: ${genOnly}; Mega/Z sets skipped: ${megaSkipped}; growth-rate fallbacks: ${growthFallbacks}`);
log(`Smogon sets capped at the species' own tier: ${tierCapped}`);
log(`species per role: ${JSON.stringify(roleDist)}`);
log(`items unknown to the engine (kept; searched as no item): ${engineUnknownItems.length}: ${engineUnknownItems.join(', ')}`);
if (problems.length) log(`problems (${problems.length}):\n  ${problems.join('\n  ')}`);
log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
