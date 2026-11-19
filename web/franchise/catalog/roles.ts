// Role vocabulary (shared by catalog, model and UI). The catalog agent owns
// role *derivation*; these display constants are stable: extend, don't rename.
import type {Role, Weather} from '../types.ts';

export const ROLES: Role[] = [
  'rocks', 'spikes', 'screens',
  'rain-setter', 'sun-setter', 'sand-setter', 'snow-setter',
  'remover', 'pivot', 'sweeper', 'wallbreaker', 'attacker', 'wall', 'phazer',
  'rain-abuser', 'sun-abuser', 'sand-abuser', 'snow-abuser',
];

/** Badge code shown in the glance mark ("ATK | 88"). Max 4 characters so badges stay one width. */
export const ROLE_ABBR: Record<Role, string> = {
  rocks: 'ROK', spikes: 'SPK', screens: 'SCR',
  'rain-setter': 'RAIN', 'sun-setter': 'SUN', 'sand-setter': 'SAND', 'snow-setter': 'SNOW',
  remover: 'HAZ', pivot: 'PIV', sweeper: 'SWP', wallbreaker: 'WBK', attacker: 'ATK', wall: 'WAL', phazer: 'PHZ',
  'rain-abuser': 'ABU', 'sun-abuser': 'ABU', 'sand-abuser': 'ABU', 'snow-abuser': 'ABU',
};

/** Full name used as a lineup card heading and in peeks. */
export const ROLE_LABEL: Record<Role, string> = {
  rocks: 'Rocks setter', spikes: 'Spikes setter', screens: 'Screens setter',
  'rain-setter': 'Rain setter', 'sun-setter': 'Sun setter', 'sand-setter': 'Sand setter', 'snow-setter': 'Snow setter',
  remover: 'Hazard remover', pivot: 'Pivot', sweeper: 'Setup sweeper', wallbreaker: 'Wallbreaker', attacker: 'Attacker',
  wall: 'Wall', phazer: 'Phazer',
  'rain-abuser': 'Rain abuser', 'sun-abuser': 'Sun abuser', 'sand-abuser': 'Sand abuser', 'snow-abuser': 'Snow abuser',
};

export const WEATHER_SETTER: Record<Weather, Role> = {rain: 'rain-setter', sun: 'sun-setter', sand: 'sand-setter', snow: 'snow-setter'};
export const WEATHER_ABUSER: Record<Weather, Role> = {rain: 'rain-abuser', sun: 'sun-abuser', sand: 'sand-abuser', snow: 'snow-abuser'};

/** Tier -> role rating base (docs/FRANCHISE.md). */
export const TIER_BASE: Record<string, number> = {
  Uber: 96, AG: 96, 'Ubers UU': 94, OU: 92, UUBL: 89, UU: 86, RUBL: 83, RU: 80, NUBL: 77, NU: 74, PUBL: 71, PU: 68, ZUBL: 65, ZU: 62, LC: 62, NFE: 60,
};
