// Numbers, not sentences: the strategy chip, stat tiles, rating meters and a yours-vs-theirs pair
// (design system: .strat, .l-stats/.stat, .l-meters/.meter, .vs in plateau-tokens.css).
import {strategyLook} from '../../model/strategies.ts';
import {esc, ic} from '../dom.ts';

/** The one way a strategy shows: icon + short name ("Rain"), fixed width. iconOnly keeps the name in aria/title. */
export function stratChip(id: string, o: {iconOnly?: boolean} = {}): string {
  const l = strategyLook(id), lbl = `Strategy: ${l.short}`;
  return `<span class="strat${o.iconOnly ? ' icon' : ''}" role="img" aria-label="${esc(lbl)}" title="${esc(lbl)}">${ic(l.icon)}${o.iconOnly ? '' : `<span aria-hidden="true">${esc(l.short)}</span>`}</span>`;
}
export const stratName = (id: string): string => strategyLook(id).short;

/** One stat tile: cap label (optional icon) over a big value (HTML), optional one-line note under it. wide = two columns. */
export function stat(label: string, value: string, o: {icon?: string; sub?: string; title?: string; wide?: boolean} = {}): string {
  return `<div class="stat${o.wide ? ' wide' : ''}"${o.title ? ` title="${esc(o.title)}"` : ''}><span class="cap">${o.icon ? ic(o.icon) : ''}${esc(label)}</span><b>${value}</b>${o.sub !== undefined ? `<small>${o.sub || '&nbsp;'}</small>` : ''}</div>`;
}
/** N equal stat tiles (n-sm columns under 480 px). */
export const stats = (tiles: string[], n = tiles.length, nSm = 2): string =>
  `<div class="l-stats" style="--n:${n};--n-sm:${nSm}">${tiles.join('')}</div>`;

/** A rating bar: label | bar | number (0..max). null shows an empty bar and a dash. */
export function meter(label: string, value: number | null, max = 100): string {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value / max * 100));
  return `<div class="meter"><span class="cap">${esc(label)}</span><span class="fitbar" role="img" aria-label="${esc(label)} ${value ?? 'unknown'}"><i style="width:${pct.toFixed(1)}%"></i></span><b>${value ?? '—'}</b></div>`;
}
export const meters = (rows: string[]): string => `<div class="l-meters">${rows.join('')}</div>`;

/** Yours vs theirs: two values; the lower one muted. Numbers may be text ("74–81"); compare by the given keys. */
export function vs(a: string, b: string, ka: number | null, kb: number | null, label = 'Average rating, you vs them'): string {
  const la = ka != null && kb != null && ka < kb, lb = ka != null && kb != null && kb < ka;
  return `<span class="vs" role="img" aria-label="${esc(`${label}: ${a} vs ${b}`)}"><span class="${la ? 'lo' : ''}">${esc(a)}</span><i>vs</i><span class="${lb ? 'lo' : ''}">${esc(b)}</span></span>`;
}

/** Average of numbers, rounded; null for none. */
export const avg = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
