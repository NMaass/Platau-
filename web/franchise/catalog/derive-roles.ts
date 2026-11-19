// Role derivation: a set's roles come only from its structured data (moves,
// ability, item, EV spread) plus the Showdown random-battle role label when the
// set came from randbats (docs/FRANCHISE.md, rule 3). Deterministic, no I/O.
import type {Role, StatId, StatTable} from '../types.ts';
import {ROLES} from './roles.ts';

export interface MoveInfo { category: 'Physical' | 'Special' | 'Status'; type: string; basePower: number }

export interface RoleSetInput {
  moves: string[];
  ability: string;
  item: string;
  evs?: Partial<StatTable>;
}

export interface DeriveContext {
  /** Move lookup by display name or id. Without it, a move counts as an attack unless it is a known status move. */
  move?: (name: string) => MoveInfo | undefined;
  baseStats?: StatTable;
  types?: string[];
}

export const toId = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const ids = (xs: readonly string[]) => new Set(xs.map(toId));

export const HAZARD_ROCKS = ids(['Stealth Rock']);
export const HAZARD_SPIKES = ids(['Spikes', 'Toxic Spikes']);
export const REMOVAL = ids(['Rapid Spin', 'Defog', 'Mortal Spin', 'Tidy Up', 'Court Change']);
export const PIVOT = ids(['U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Teleport', 'Shed Tail', 'Chilly Reception']);
export const PHAZE = ids(['Whirlwind', 'Roar', 'Dragon Tail', 'Circle Throw', 'Haze']);
/** Boosting moves that make a sweeper on their own (with at least one attack). */
export const BOOST = ids(['Swords Dance', 'Dragon Dance', 'Nasty Plot', 'Quiver Dance', 'Shell Smash', 'Bulk Up', 'Shift Gear',
  'Coil', 'Belly Drum', 'Tail Glow', 'Victory Dance', 'Geomancy', 'Clangorous Soul', 'No Retreat', 'Fillet Away', 'Tidy Up',
  'Calm Mind', 'Agility', 'Rock Polish', 'Autotomize', 'Curse']);
export const RECOVERY = ids(['Recover', 'Roost', 'Slack Off', 'Soft-Boiled', 'Moonlight', 'Morning Sun', 'Synthesis', 'Wish',
  'Milk Drink', 'Rest', 'Shore Up', 'Strength Sap', 'Heal Order', 'Pain Split', 'Leech Seed', 'Lunar Blessing', 'Life Dew', 'Jungle Healing']);
const RECOVERY_ABILITIES = ids(['Regenerator', 'Poison Heal']);

// A small status-move list for the no-context fallback (the catalog build always passes a Dex-backed context).
const KNOWN_STATUS = new Set([...HAZARD_ROCKS, ...HAZARD_SPIKES, ...BOOST, ...RECOVERY, ...ids(['Rapid Spin', 'Defog', 'Tidy Up',
  'Court Change', 'Parting Shot', 'Teleport', 'Shed Tail', 'Chilly Reception', 'Whirlwind', 'Roar', 'Haze', 'Reflect', 'Light Screen',
  'Aurora Veil', 'Rain Dance', 'Sunny Day', 'Sandstorm', 'Snowscape', 'Will-O-Wisp', 'Toxic', 'Thunder Wave', 'Protect', 'Substitute',
  'Spore', 'Sleep Powder', 'Leech Seed', 'Taunt', 'Encore', 'Trick', 'Glare', 'Yawn', 'Destiny Bond', 'Memento', 'Healing Wish',
  'Trick Room', 'Tailwind', 'Stun Spore', 'Baton Pass', 'Iron Defense', 'Amnesia', 'Cotton Guard', 'Acid Armor', 'Barrier',
  'Defend Order', 'Stockpile', 'Cosmic Power', 'Sticky Web', 'Hypnosis', 'Sing', 'Lovely Kiss', 'Nuzzle', 'Heal Bell', 'Aromatherapy'])]);

function moveInfo(ctx: DeriveContext | undefined, name: string): MoveInfo {
  const m = ctx?.move?.(name);
  if (m) return m;
  return {category: KNOWN_STATUS.has(toId(name)) ? 'Status' : 'Physical', type: '', basePower: KNOWN_STATUS.has(toId(name)) ? 0 : 80};
}

/** Roles a set fills. `randbatsRole` is the Showdown random-battle role label ("Bulky Support", ...). */
export function deriveRoles(set: RoleSetInput, randbatsRole?: string, ctx?: DeriveContext): Role[] {
  const moves = set.moves.map(toId);
  const has = (id: string) => moves.includes(id);
  const any = (s: Set<string>) => moves.some((m) => s.has(m));
  const ability = toId(set.ability ?? '');
  const item = toId(set.item ?? '');
  const label = randbatsRole ?? '';
  const infos = set.moves.map((m) => moveInfo(ctx, m));
  const attacks = infos.filter((m) => m.category !== 'Status');
  const attackOfType = (t: string) => attacks.some((m) => m.type === t);
  const physical = attacks.filter((m) => m.category === 'Physical').length;
  const special = attacks.length - physical;
  const out = new Set<Role>();

  if (any(HAZARD_ROCKS)) out.add('rocks');
  if (any(HAZARD_SPIKES) || ability === 'toxicdebris') out.add('spikes');
  if ((has('reflect') && has('lightscreen')) || has('auroraveil')) out.add('screens');

  // Weather setters: an ability, or the move with its rock or inside a set that uses the weather.
  const rainUse = ['swiftswim', 'hydration', 'raindish', 'dryskin'].includes(ability) || attackOfType('Water') || has('thunder') || has('hurricane') || has('weatherball') || has('electroshot');
  const sunUse = ['chlorophyll', 'solarpower', 'protosynthesis', 'flowergift', 'harvest', 'leafguard'].includes(ability) || attackOfType('Fire') || has('solarbeam') || has('solarblade') || has('weatherball') || has('growth');
  const sandUse = ['sandrush', 'sandforce', 'sandveil'].includes(ability) || has('shoreup') || has('weatherball');
  const snowUse = ['slushrush', 'icebody', 'snowcloak'].includes(ability) || has('blizzard') || has('auroraveil') || has('weatherball');
  const rainSetter = ability === 'drizzle' || (has('raindance') && (item === 'damprock' || rainUse));
  const sunSetter = ability === 'drought' || ability === 'orichalcumpulse' || (has('sunnyday') && (item === 'heatrock' || sunUse));
  const sandSetter = ability === 'sandstream' || ability === 'sandspit' || (has('sandstorm') && (item === 'smoothrock' || sandUse));
  const snowSetter = ability === 'snowwarning' || has('chillyreception') || (has('snowscape') && (item === 'icyrock' || snowUse));
  if (rainSetter) out.add('rain-setter');
  if (sunSetter) out.add('sun-setter');
  if (sandSetter) out.add('sand-setter');
  if (snowSetter) out.add('snow-setter');

  // Weather abusers: the speed/power abilities, or an attacker of the weather's type that brings its own weather.
  if (['swiftswim', 'hydration'].includes(ability) || (rainSetter && attackOfType('Water'))) out.add('rain-abuser');
  if (['chlorophyll', 'solarpower', 'protosynthesis', 'flowergift'].includes(ability) || (sunSetter && (attackOfType('Fire') || has('solarbeam') || has('solarblade')))) out.add('sun-abuser');
  if (['sandrush', 'sandforce'].includes(ability)) out.add('sand-abuser');
  if (ability === 'slushrush' || (snowSetter && has('blizzard'))) out.add('snow-abuser');

  if (any(REMOVAL)) out.add('remover');
  if (any(PIVOT)) out.add('pivot');

  const ghost = ctx?.types?.includes('Ghost') ?? false;
  const boosts = moves.filter((m) => BOOST.has(m) && !(m === 'curse' && ghost));
  if ((boosts.length && attacks.length >= 1) || /setup sweeper/i.test(label)) out.add('sweeper');

  const base = ctx?.baseStats;
  const mainStat: StatId = physical >= special ? 'atk' : 'spa';
  const highAttack = base ? base[mainStat] >= 110 : false;
  if (item === 'choiceband' || item === 'choicespecs' || (item === 'lifeorb' && highAttack) || /wallbreaker/i.test(label)) out.add('wallbreaker');
  if (/attacker/i.test(label) || attacks.length >= 3) out.add('attacker');

  const evs = set.evs ?? {};
  const defensiveEvs = (evs.hp ?? 0) + (evs.def ?? 0) + (evs.spd ?? 0);
  const recovery = any(RECOVERY) || RECOVERY_ABILITIES.has(ability);
  if ((recovery && defensiveEvs >= 400) || /bulky support|staller/i.test(label) || (/bulky setup/i.test(label) && recovery)) out.add('wall');

  if (any(PHAZE)) out.add('phazer');
  if (!out.size) out.add('attacker');
  return ROLES.filter((r) => out.has(r));
}
