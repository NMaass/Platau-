// Strategies: 6 role slots each (docs/FRANCHISE.md). Each slot lists the roles
// that may fill it, preferred first.
import type {Role, StrategyDef, Weather} from '../types.ts';
import {WEATHER_ABUSER, WEATHER_SETTER} from '../catalog/roles.ts';

const SETTER: Role[] = ['rocks', 'spikes', 'screens', 'rain-setter', 'sun-setter', 'sand-setter', 'snow-setter'];

function weather(id: string, name: string, w: Weather): StrategyDef {
  const ab = WEATHER_ABUSER[w];
  return {
    id, name, weather: w,
    slots: [[WEATHER_SETTER[w]], [ab, 'sweeper'], [ab, 'wallbreaker'], [ab, 'attacker'], ['sweeper', ab], ['pivot', 'remover']],
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
  {id: 'hazard-stack', name: 'Hazard Stack', slots: [
    ['rocks'], ['spikes'], ['phazer'], ['wall', 'remover'], ['pivot'], ['attacker', 'wallbreaker']]},
];

export function strategyById(id: string): StrategyDef {
  return STRATEGIES.find(s => s.id === id) ?? STRATEGIES[2];
}
