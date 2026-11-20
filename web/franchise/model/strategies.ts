// Strategies: 6 role slots each (docs/FRANCHISE.md). Each slot lists the roles
// that may fill it, preferred first.
import type {Role, StrategyDef, Weather} from '../types.ts';
import {WEATHER_ABUSER, WEATHER_SETTER} from '../catalog/roles.ts';

const SETTER: Role[] = ['rocks', 'spikes', 'screens', 'rain-setter', 'sun-setter', 'sand-setter', 'snow-setter'];

/** Weather: the lead slot is the weather setter and nothing else (a rain club without Drizzle or Rain Dance can't
 *  play in the rain: the slot shows off-role and the AI picks another strategy), then abusers first (the solver
 *  prefers earlier roles), with the attackers a weather team plays alongside them. */
function weather(id: string, name: string, w: Weather): StrategyDef {
  const ab = WEATHER_ABUSER[w];
  return {
    id, name, weather: w,
    slots: [[WEATHER_SETTER[w]], [ab, 'sweeper', 'attacker'], [ab, 'wallbreaker', 'attacker'],
      [ab, 'attacker', 'wallbreaker'], ['sweeper', ab, 'attacker'], ['pivot', 'remover', 'wall']],
  };
}

export const STRATEGIES: StrategyDef[] = [
  {id: 'hyper-offense', name: 'Hyper Offense', slots: [
    ['rocks', 'screens', ...SETTER.slice(1)], ['sweeper'], ['sweeper', 'attacker'], ['wallbreaker'], ['wallbreaker', 'attacker'], ['attacker', 'pivot']]},
  {id: 'bulky-offense', name: 'Bulky Offense', slots: [
    ['rocks', ...SETTER.slice(1)], ['pivot', 'remover'], ['attacker'], ['attacker', 'wallbreaker'], ['wallbreaker'], ['sweeper']]},
  {id: 'balance', name: 'Balance', slots: [
    ['rocks', ...SETTER.slice(1)], ['wall', 'remover'], ['wall', 'phazer'], ['pivot', 'remover'], ['attacker'], ['wallbreaker', 'attacker']]},
  {id: 'stall', name: 'Stall', slots: [
    ['rocks', 'spikes', ...SETTER.slice(2)], ['wall'], ['wall', 'phazer'], ['wall', 'remover'], ['wall'], ['pivot', 'remover']]},
  weather('rain', 'Rain', 'rain'),
  weather('sun', 'Sun', 'sun'),
  weather('sand', 'Sand', 'sand'),
  weather('snow', 'Snow', 'snow'),
  // hazards first; spikes setters are rare (62 species), so a second rocks/screens lead and walls that phaze stand in
  {id: 'hazard-stack', name: 'Hazard Stack', slots: [
    ['rocks', 'spikes'], ['spikes', 'rocks', 'screens'], ['phazer', 'wall', 'pivot'], ['wall', 'remover', 'phazer'], ['pivot', 'remover', 'wall'], ['attacker', 'wallbreaker', 'sweeper']]},
];

export function strategyById(id: string): StrategyDef {
  return STRATEGIES.find(s => s.id === id) ?? STRATEGIES[2];
}

/** How a strategy shows in the UI: its icon (ui/icons.ts id) and a short name ("Rain", "Hyper offense"). One chip
 *  everywhere (ui/components/stats.ts stratChip); no descriptive sentences. */
export const STRATEGY_LOOK: Record<string, {icon: string; short: string}> = {
  'hyper-offense': {icon: 'bolt', short: 'Hyper offense'},
  'bulky-offense': {icon: 'fist', short: 'Bulky offense'},
  balance: {icon: 'scales', short: 'Balance'},
  stall: {icon: 'shield', short: 'Stall'},
  rain: {icon: 'rain', short: 'Rain'},
  sun: {icon: 'sun', short: 'Sun'},
  sand: {icon: 'sand', short: 'Sand'},
  snow: {icon: 'snow', short: 'Snow'},
  'hazard-stack': {icon: 'spikes', short: 'Hazards'},
};
export const strategyLook = (id: string): {icon: string; short: string} => STRATEGY_LOOK[id] ?? STRATEGY_LOOK.balance;

/** Can this lineup plan run the strategy as meant? Every slot on-role (so a weather club has its setter leading). */
export const runsStrategy = (plan: {onRole: number; slots: {monId: string | null}[]}): boolean =>
  plan.onRole === plan.slots.length && plan.slots.every(sl => sl.monId);
