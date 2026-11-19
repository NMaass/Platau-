// Tiny DOM/string helpers. Screens build HTML strings (like the prototype) and
// wire behaviour by event delegation on data-* attributes (see app.ts).

/** Escape text for HTML content and attribute values. Use on every piece of data. */
export const esc = (v: unknown): string => String(v ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Inline icon from the sprite sheet in icons.ts. */
export const ic = (id: string, cls = ''): string =>
  `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] => Array.from(root.querySelectorAll<T>(sel));

/** Join truthy fragments. */
export const cat = (...parts: (string | false | null | undefined | 0)[]): string => parts.filter(Boolean).join('');

/** "$4.2M" from dollars. */
export const money = (dollars: number): string => {
  const m = dollars / 1e6;
  return (m < 0 ? '−$' : '$') + Math.abs(m).toFixed(1) + 'M';
};
export const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;
export const signed = (v: number): string => (v < 0 ? '−' + Math.abs(v) : '+' + v);
/** "A, B and C" */
export const listJoin = (xs: string[]): string => xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
export const record = (w: number, l: number): string => `${w}–${l}`;
