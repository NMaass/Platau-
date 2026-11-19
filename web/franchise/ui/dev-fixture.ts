// Hand-built league for UI development (?fixture=1). Real species and Smogon sets
// from design/proto-reference/roster-sets.json plus a few opponents' sets; 16 teams,
// 5 weeks already played with the fallback fake sim so Home has results to show.
import type {Catalog, CatalogSet, CatalogSpecies, LeagueState, Mon, Role, StatId, IvGrade, Team, TeamId, Series, Rarity} from '../types.ts';
import {ROLE_LABEL, TIER_BASE} from '../catalog/roles.ts';
import rosterSets from '../design/proto-reference/roster-sets.json' with {type: 'json'};
import * as fb from './fallback.ts';
import {TEAM_SEEDS} from '../model/teams.ts';

const LABEL_TO_ROLE = Object.fromEntries(Object.entries(ROLE_LABEL).map(([k, v]) => [v, k])) as Record<string, Role>;

// name, dex num, types, rarity
const SPECIES: [string, number, string[], Rarity?][] = [
  ['Hippowdon', 450, ['ground']], ['Rotom-Wash', 479, ['electric', 'water']], ['Garchomp', 445, ['dragon', 'ground'], 'pseudo'],
  ['Excadrill', 530, ['ground', 'steel']], ['Hydreigon', 635, ['dark', 'dragon'], 'pseudo'], ['Dragonite', 149, ['dragon', 'flying'], 'pseudo'],
  ['Tyranitar', 248, ['rock', 'dark'], 'pseudo'], ['Corviknight', 823, ['flying', 'steel']], ['Volcarona', 637, ['bug', 'fire']],
  ['Pelipper', 279, ['water', 'flying']], ['Mandibuzz', 630, ['dark', 'flying']], ['Dragapult', 887, ['dragon', 'ghost'], 'pseudo'],
  ['Gible', 443, ['dragon', 'ground'], 'pseudo'], ['Larvesta', 636, ['bug', 'fire']], ['Barraskewda', 847, ['water']],
  ['Torkoal', 324, ['fire']], ['Ninetales-Alola', 38, ['ice', 'fairy']], ['Ferrothorn', 598, ['grass', 'steel']], ['Toxapex', 748, ['poison', 'water']],
  ['Blissey', 242, ['normal']], ['Gliscor', 472, ['ground', 'flying']], ['Skarmory', 227, ['steel', 'flying']], ['Slowbro', 80, ['water', 'psychic']],
  ['Clodsire', 980, ['poison', 'ground']], ['Clefable', 36, ['fairy']], ['Heatran', 485, ['fire', 'steel'], 'legendary'],
  ['Landorus-Therian', 645, ['ground', 'flying'], 'legendary'], ['Weavile', 461, ['dark', 'ice']], ['Magnezone', 462, ['electric', 'steel']],
  ['Scizor', 212, ['bug', 'steel']], ['Kingambit', 983, ['dark', 'steel']], ['Great Tusk', 984, ['ground', 'fighting']],
  ['Gholdengo', 1000, ['steel', 'ghost'], 'pseudo'], ['Iron Valiant', 1006, ['fairy', 'fighting']],
];
// sets for species not in roster-sets.json: name, tier, roles, moves, ability, item, nature, evs
type Raw = [string, string, string[], string[], string, string, string, Partial<Record<StatId, number>>];
const EXTRA: Record<string, Raw[]> = {
  Blissey: [['Special Wall', 'OU', ['Wall'], ['Seismic Toss', 'Soft-Boiled', 'Toxic', 'Stealth Rock'], 'Natural Cure', 'Heavy-Duty Boots', 'Calm', {hp: 252, def: 252, spd: 4}]],
  Gliscor: [['Spikes', 'OU', ['Spikes setter', 'Wall'], ['Earthquake', 'Spikes', 'Toxic', 'Protect'], 'Poison Heal', 'Toxic Orb', 'Impish', {hp: 244, def: 248, spe: 16}]],
  Skarmory: [['Defog', 'UU', ['Hazard remover', 'Phazer', 'Wall'], ['Brave Bird', 'Defog', 'Roost', 'Whirlwind'], 'Sturdy', 'Rocky Helmet', 'Impish', {hp: 252, def: 252, spd: 4}]],
  Slowbro: [['Regenerator', 'UU', ['Wall', 'Pivot'], ['Scald', 'Slack Off', 'Future Sight', 'Teleport'], 'Regenerator', 'Heavy-Duty Boots', 'Bold', {hp: 252, def: 252, spd: 4}]],
  Clodsire: [['Specially Defensive', 'OU', ['Rocks setter', 'Wall'], ['Earthquake', 'Stealth Rock', 'Recover', 'Toxic'], 'Water Absorb', 'Leftovers', 'Careful', {hp: 252, spd: 252, def: 4}]],
  Clefable: [['Calm Mind', 'OU', ['Wall', 'Setup sweeper'], ['Moonblast', 'Calm Mind', 'Moonlight', 'Flamethrower'], 'Magic Guard', 'Leftovers', 'Bold', {hp: 252, def: 252, spe: 4}]],
  Heatran: [['Stealth Rock', 'OU', ['Rocks setter', 'Wall'], ['Magma Storm', 'Earth Power', 'Stealth Rock', 'Taunt'], 'Flash Fire', 'Leftovers', 'Calm', {hp: 252, spd: 216, spe: 40}]],
  'Landorus-Therian': [['Rocks Pivot', 'OU', ['Rocks setter', 'Pivot'], ['Stealth Rock', 'Earthquake', 'U-turn', 'Stone Edge'], 'Intimidate', 'Rocky Helmet', 'Impish', {hp: 252, def: 216, spe: 40}]],
  Weavile: [['Swords Dance', 'UU', ['Setup sweeper', 'Attacker'], ['Swords Dance', 'Triple Axel', 'Knock Off', 'Ice Shard'], 'Pressure', 'Heavy-Duty Boots', 'Jolly', {atk: 252, spd: 4, spe: 252}]],
  Magnezone: [['Choice Specs', 'UU', ['Wallbreaker'], ['Thunderbolt', 'Flash Cannon', 'Volt Switch', 'Body Press'], 'Magnet Pull', 'Choice Specs', 'Modest', {hp: 252, spa: 252, spe: 4}]],
  Scizor: [['Bulky U-turn', 'OU', ['Pivot', 'Attacker'], ['Bullet Punch', 'U-turn', 'Knock Off', 'Roost'], 'Technician', 'Heavy-Duty Boots', 'Adamant', {hp: 248, atk: 16, spd: 244}]],
  Kingambit: [['Swords Dance', 'OU', ['Setup sweeper', 'Wallbreaker'], ['Swords Dance', 'Kowtow Cleave', 'Sucker Punch', 'Iron Head'], 'Supreme Overlord', 'Black Glasses', 'Adamant', {hp: 120, atk: 252, spe: 136}]],
  'Great Tusk': [['Rapid Spin', 'OU', ['Hazard remover', 'Attacker'], ['Headlong Rush', 'Close Combat', 'Rapid Spin', 'Knock Off'], 'Protosynthesis', 'Booster Energy', 'Jolly', {atk: 252, spd: 4, spe: 252}]],
  Gholdengo: [['Nasty Plot', 'OU', ['Setup sweeper', 'Wallbreaker'], ['Nasty Plot', 'Make It Rain', 'Shadow Ball', 'Recover'], 'Good as Gold', 'Air Balloon', 'Timid', {hp: 252, spa: 4, spe: 252}]],
  'Iron Valiant': [['Booster Energy', 'OU', ['Setup sweeper', 'Attacker'], ['Moonblast', 'Close Combat', 'Knock Off', 'Encore'], 'Quark Drive', 'Booster Energy', 'Naive', {atk: 252, spa: 4, spe: 252}]],
};

const idOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9-]/g, '');
const spriteIdOf = (n: string) => n.toLowerCase().replace(/[ .']/g, '');
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const GROWTH: Record<string, number> = {Gible: 24, Larvesta: 59};

export function fixtureCatalog(): Catalog {
  const species: Record<string, CatalogSpecies> = {};
  const rs = rosterSets as Record<string, {sets: {tier: string; name: string; moves: string[]; ability: string; item: string; nature: string; evs: Partial<Record<StatId, number>>; roles: string[]}[]}>;
  for (const [name, num, types, rarity] of SPECIES) {
    const id = idOf(name);
    const raw = rs[name]?.sets.map((s) => [s.name, s.tier, s.roles, s.moves, s.ability, s.item, s.nature, s.evs] as Raw) ?? EXTRA[name] ?? [];
    const sets: CatalogSet[] = raw.map(([sname, tier, rls, moves, ability, item, nature, evs]) => {
      const roles = new Set(rls.map((r) => LABEL_TO_ROLE[r]).filter(Boolean));
      if (roles.has('wallbreaker') || roles.has('sweeper')) roles.add('attacker');
      return {id: `${id}:${slug(sname)}`, name: sname, tier, source: 'smogon', moves, ability, item, nature, evs, roles: [...roles]};
    });
    if (!sets.length) sets.push({id: `${id}:generated`, name: 'Generated', tier: 'LC', source: 'generated', moves: ['Dragon Claw', 'Earthquake', 'Rock Slide', 'Fire Fang'], ability: 'Rough Skin', item: 'Eviolite', nature: 'Jolly', evs: {atk: 252, spe: 252, hp: 4}, roles: ['attacker']});
    const roleBase: CatalogSpecies['roleBase'] = {};
    for (const s of sets) for (const r of s.roles) {
      const base = TIER_BASE[s.tier] ?? 62;
      if (!roleBase[r] || roleBase[r]!.base < base) roleBase[r] = {base, tier: s.tier, setId: s.id};
    }
    const invested = new Set<StatId>();
    for (const s of sets) for (const [k, v] of Object.entries(s.evs)) if ((v ?? 0) >= 40) invested.add(k as StatId);
    species[id] = {
      id, name, num, types, baseStats: {hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80}, bst: 480,
      battleLevel: 80, rarity: rarity ?? 'common', growthRate: 'medium-slow',
      evolvesTo: GROWTH[name] ? [{id: name === 'Gible' ? 'garchomp' : 'volcarona', level: GROWTH[name]}] : [],
      family: id, sets, roleBase, investedStats: [...invested], spriteId: spriteIdOf(name),
    };
  }
  return {version: 'fixture', species};
}

const TEAMS: [string, string, string, string, string][] = TEAM_SEEDS.map((t) => [t.city, t.name, t.abbr, t.color, t.trainer]);
export const TEAM_PRESETS = TEAMS;

function rng(seed: number) {
  let h = seed | 0;
  return () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), h | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const IVS: IvGrade[] = ['F', 'D', 'C', 'B', 'A'];

/** Round-robin (circle method) of 16 teams, first `weeks` rounds; each round is one series per pair. */
function schedule(ids: TeamId[], season: number, weeks: number, bestOf: number): Series[] {
  const out: Series[] = [];
  const arr = ids.slice();
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < arr.length / 2; i++) {
      const a = arr[i], b = arr[arr.length - 1 - i];
      const [homeId, awayId] = (w + i) % 2 ? [a, b] : [b, a];
      out.push({id: `s${season}w${w + 1}-${homeId}-${awayId}`, season, week: w + 1, homeId, awayId, bestOf, games: []});
    }
    arr.splice(1, 0, arr.pop()!);
  }
  return out;
}

export function fixtureLeague(catalog: Catalog, userTeamIndex = 0): LeagueState {
  const r = rng(1234);
  const season = 2026;
  const settings = {
    cap: 100e6, capGrowth: .04, floor: 70e6, minSalary: .5e6, maxSalaryPct: .2, injuryKo: .1, injuryStatus: .05,
    budgetMs: {ai: 10, human: 40}, seriesBestOf: 3, finalBestOf: 5, scoutingPointsPerWeek: 10, scoutCost: 1, fullScoutCost: 5,
    tradeDeadlineWeek: 8, weeks: 14,
  };
  const teams: Record<TeamId, Team> = {};
  TEAMS.forEach(([city, name, abbr, color, trainer], i) => {
    const id = 't' + i;
    const strats = fb.STRATEGIES;
    const fav = [strats[(i * 3) % 4].id, strats[(i * 5 + 1) % strats.length].id] as [string, string];
    teams[id] = {
      id, city, name, abbr, color, trainer, conference: (i >> 3) as 0 | 1, division: ((i >> 2) & 1) as 0 | 1,
      human: i === userTeamIndex, favoriteStrategies: fav, lineup: {strategyId: i === userTeamIndex ? 'bulky-offense' : fav[0], slots: [], auto: true},
      scoutingPoints: 10, deadMoney: [], draftPicks: [],
    };
  });
  const mons: Record<string, Mon> = {};
  let n = 0;
  const allIds = Object.keys(catalog.species);
  const mk = (speciesId: string, teamId: TeamId, tier: Mon['tier'], age?: number): Mon => {
    const spc = catalog.species[speciesId];
    const ivs = Object.fromEntries((['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatId[]).map((k) => [k, IVS[Math.min(4, Math.floor(r() * 5.6))]])) as Mon['ivs'];
    const a = age ?? 21 + Math.floor(r() * 12);
    const growth = Math.min(98, Math.max(5, Math.round(25 + (a - 21) * 4 + r() * 30)));
    const best = Object.values(spc.roleBase).sort((x, y) => y!.base - x!.base)[0];
    const yrs = 1 + Math.floor(r() * 4);
    const sal = Math.round(Math.max(.5, ((best?.base ?? 60) - 60) * .35 + growth * .05 + (r() - .5) * 2) * 10) / 10 * 1e6;
    const id = 'm' + (n++);
    const m: Mon = {
      id, speciesId, teamId, tier, age: a, ivs, growth, xp: Math.floor(r() * 50), setId: best?.setId ?? spc.sets[0].id,
      contract: {salary: tier === 'practice' ? Math.min(sal, 1.5e6) : sal, yearsLeft: yrs, signingBonus: 0, originalYears: yrs + 1, guaranteedYears: 1},
      injury: null, fame: Math.floor(r() * 100), potential: (['B', 'A', 'AA', 'AAA'] as const)[Math.floor(r() * 4)], stats: [], awards: [],
    };
    mons[id] = m;
    return m;
  };
  // user roster: the prototype's 19 (Toxapex on IR)
  const userId = 't' + userTeamIndex;
  const order: [string, Mon['tier']][] = [
    ['hippowdon', 'active'], ['rotom-wash', 'active'], ['garchomp', 'active'], ['excadrill', 'active'], ['hydreigon', 'active'], ['dragonite', 'active'],
    ['tyranitar', 'backup'], ['corviknight', 'backup'], ['volcarona', 'backup'], ['pelipper', 'backup'], ['mandibuzz', 'backup'], ['dragapult', 'backup'],
    ['gible', 'practice'], ['larvesta', 'practice'], ['barraskewda', 'practice'], ['torkoal', 'practice'], ['ninetales-alola', 'practice'], ['ferrothorn', 'practice'],
    ['toxapex', 'ir'],
  ];
  const ages: Record<string, number> = {gible: 21, larvesta: 21, barraskewda: 22, mandibuzz: 33, torkoal: 32, corviknight: 31};
  for (const [sid, tier] of order) mk(sid, userId, tier, ages[sid]);
  Object.values(mons).find((m) => m.speciesId === 'toxapex')!.injury = {kind: 'ir', weeksLeft: 5, description: 'Torn fin', sinceWeek: 4, season};
  Object.values(mons).find((m) => m.speciesId === 'gible')!.growth = 22;
  Object.values(mons).find((m) => m.speciesId === 'gible')!.potential = 'AAA';
  for (const t of Object.values(teams)) {
    if (t.id === userId) continue;
    const tiers: Mon['tier'][] = [...Array(6).fill('active'), ...Array(6).fill('backup'), ...Array(6).fill('practice')];
    tiers.forEach((tier) => mk(allIds[Math.floor(r() * allIds.length)], t.id, tier));
  }
  const state: LeagueState = {
    schemaVersion: 1, id: 'fixture', name: 'Fixture league', createdAt: Date.now(), seed: 1234, rngState: 99,
    season, week: 1, phase: 'regular', settings, userTeamId: userId, teams, mons,
    schedule: schedule(Object.keys(teams), season, settings.weeks, settings.seriesBestOf),
    history: [], inbox: [], offers: [], pool: {}, nextId: n + 1, log: [],
  };
  for (const t of Object.values(teams)) t.lineup = fb.autoLineup(catalog, state, t.id);
  // play weeks 1..5 with the fake sim
  for (let w = 1; w <= 5; w++) {
    for (const se of state.schedule.filter((x) => x.week === state.week)) {
      for (let g = 0; g < se.bestOf; g++) {
        se.games.push(fb.fakeGame(catalog, state, se, g));
        const wins = se.games.filter((x) => x.winnerTeamId === se.homeId).length;
        if (wins === 2 || se.games.length - wins === 2) break;
      }
      fb.finishSeries(catalog, state, se);
    }
    fb.fakeFinishWeek(catalog, state);
  }
  // a fresh injury to a starter, so "Before you play" has something to review
  const ex = Object.values(mons).find((m) => m.speciesId === 'excadrill')!;
  ex.injury = {kind: 'out', weeksLeft: 2, description: 'Sprained claw', sinceWeek: 5, season};
  return state;
}
