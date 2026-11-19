// Page-level compositions of the layout layer: head, panels, lenses, item lists, skeletons.
import {esc, ic} from '../dom.ts';

/** Page head: h1 + one sub line on the left, equal-width actions on the right. */
export function head(title: string, sub?: string, actions?: string): string {
  return `<header class="l-head"><div><h1 tabindex="-1">${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions ? `<div class="l-actions">${actions}</div>` : ''}</header>`;
}

/** Boxed section with an h2. flush = no padding (tables). */
export function panel(id: string, title: string, body: string, o: {flush?: boolean; label?: boolean} = {}): string {
  return `<section class="l-panel${o.flush ? ' flush' : ''} l-section" aria-labelledby="h-${esc(id)}"><h2 id="h-${esc(id)}">${title}</h2>${body}</section>`;
}

/** Lens tabs (role=tablist). Clicking sets store.ui[key] (handled by [data-lens]). */
export function lensTabs(key: string, cur: string, lenses: [string, string][]): string {
  return `<div class="l-tabs" role="tablist" aria-label="Lens">${lenses.map(([k, l]) =>
    `<button type="button" role="tab" data-lens="${esc(key)}:${esc(k)}" aria-selected="${k === cur}" tabindex="${k === cur ? 0 : -1}">${esc(l)}</button>`).join('')}</div>`;
}

export interface Item { chip: string; text: string; action?: string; resolved?: boolean }
/**
 * "Before you play" / feed list. Label chip, text and action share ONE top edge
 * (.l-list.top in the design system) with a fixed label column and action column.
 */
export function itemList(items: Item[], o: {cls?: string; label?: string} = {}): string {
  return `<ul class="l-list wrap top ${o.cls ?? 'ev'}"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>${items.map((a) =>
    `<li class="${a.resolved ? 'resolved' : ''}">${a.chip}<p>${a.text}</p>${a.action ?? '<span></span>'}</li>`).join('')}</ul>`;
}

/** Skeleton block with its final dimensions. */
export const skel = (w: string, h: string): string => `<span class="l-skel" style="display:block;width:${w};height:${h}" aria-hidden="true"></span>`;

export const empty = (title: string, text: string, action = ''): string =>
  `<div class="l-empty"><b>${title}</b><span>${text}</span>${action}</div>`;

/** Fixed panel for screens that aren't built yet. Same size every time. */
export function comingSoon(title: string, what: string): string {
  return head(esc(title), 'Coming soon') + `<section class="l-panel l-section soon">${ic('clock')}<p><b>${esc(title)} is being built.</b> ${esc(what)}</p><div class="l-actions"><a class="btn" href="#week">Back to This week</a></div></section>`;
}
