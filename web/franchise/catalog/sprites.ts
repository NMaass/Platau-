// Sprite URLs (docs/FRANCHISE.md rule 4): Showdown first, PokeAPI as fallback.
// These hotlink play.pokemonshowdown.com, which the user's browser reaches.
const PS = 'https://play.pokemonshowdown.com/sprites';

export type SpriteKind = 'front' | 'back' | 'icon';

/** spriteId is CatalogSpecies.spriteId (e.g. "garchomp", "rotom-wash", "ninetales-alola"). */
export function spriteUrl(spriteId: string, opts: {kind?: SpriteKind; shiny?: boolean} = {}): string {
  const kind = opts.kind ?? 'front';
  const shiny = opts.shiny ? '-shiny' : '';
  if (kind === 'back') return `${PS}/gen5-back${shiny}/${spriteId}.png`;
  if (kind === 'icon') return `${PS}/dex${shiny}/${spriteId}.png`;
  return `${PS}/gen5${shiny}/${spriteId}.png`;
}

/** Animated front sprite (Showdown "ani" set), for the Pokémon page. */
export function animatedSpriteUrl(spriteId: string, opts: {back?: boolean; shiny?: boolean} = {}): string {
  return `${PS}/${opts.back ? 'ani-back' : 'ani'}${opts.shiny ? '-shiny' : ''}/${spriteId}.gif`;
}

/** PokeAPI fallback by national dex number (use as <img onerror>). */
export function fallbackSpriteUrl(num: number, opts: {shiny?: boolean; back?: boolean} = {}): string {
  const base = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  return `${base}${opts.back ? '/back' : ''}${opts.shiny ? '/shiny' : ''}/${num}.png`;
}

/** Showdown's 40x30 icon sheet (one image, background-position per dex number). Formes use the base number. */
export const ICON_SHEET_URL = `${PS}/pokemonicons-sheet.png`;
export function iconSheetPosition(num: number): {x: number; y: number; width: 40; height: 30} {
  return {x: -(num % 12) * 40, y: -Math.floor(num / 12) * 30, width: 40, height: 30};
}

export function trainerSpriteUrl(id: string): string {
  return `${PS}/trainers/${id}.png`;
}

/** Valid Showdown trainer sprite ids (web/replay/embed.ts avatars + gym leaders). */
export const TRAINERS: readonly string[] = [
  'cynthia', 'lance', 'steven', 'wallace', 'diantha', 'leon', 'geeta', 'red', 'blue', 'silver', 'ethan', 'giovanni',
  'archie-gen6', 'maxie-gen6', 'cyrus', 'ghetsis', 'lysandre', 'guzma', 'marnie', 'raihan', 'nessa', 'n', 'alder',
  'caitlin', 'grimsley', 'ash', 'zinnia', 'emma',
  'brock', 'misty', 'erika', 'sabrina', 'blaine', 'koga', 'lt-surge', 'janine', 'whitney', 'clair', 'morty', 'jasmine',
  'pryce', 'chuck', 'bugsy', 'falkner', 'roxanne', 'flannery', 'winona', 'norman', 'wattson', 'brawly', 'tate', 'liza',
  'juan', 'roark', 'gardenia', 'maylene', 'crasherwake', 'fantina', 'byron', 'candice', 'volkner', 'elesa', 'skyla',
  'clay', 'drayden', 'iris',
];
