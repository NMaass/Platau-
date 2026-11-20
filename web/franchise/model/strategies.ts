// Strategies: 6 role slots each (docs/FRANCHISE.md). Each slot lists the roles
// that may fill it, preferred first.
import type {Role, StrategyDef, Weather} from '../types.ts';
import {WEATHER_ABUSER, WEATHER_SETTER} from '../catalog/roles.ts';

const SETTER: Role[] = ['rocks', 'spikes', 'screens', 'rain-setter', 'sun-setter', 'sand-setter', 'snow-setter'];

/** Weather: its setter and abusers come first (the solver prefers earlier roles), but a typical roster can field it
 *  on-role: the lead slot takes another setter when the club has no weather setter (only 4 species set sand), and
 *  the abuser slots take the attackers a weather team plays alongside them. */
function weather(id: string, name: string, w: Weather): StrategyDef {
  const ab = WEATHER_ABUSER[w];
  return {
    id, name, weather: w,
    slots: [[WEATHER_SETTER[w], 'rocks', 'spikes', 'screens'], [ab, 'sweeper', 'attacker'], [ab, 'wallbreaker', 'attacker'],
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
