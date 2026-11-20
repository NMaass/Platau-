// Sprite URLs. Showdown first, PokeAPI (by dex number) as the fallback; the
// fallback is swapped in by the global image error handler in installSpriteFallback().
// Boxes (.ico, .spr) are fixed size in the design system, so a slow or failed
// image never moves anything.
import type {CatalogSpecies} from '../types.ts';
import {esc} from './dom.ts';
import {badgeUrl, seedOf} from '../model/teams.ts';

import {spriteUrl as sdUrl, fallbackSpriteUrl, trainerSpriteUrl as sdTrainer, ICON_SHEET_URL, iconSheetPosition} from '../catalog/sprites.ts';

export const spriteUrl = (sp: Pick<CatalogSpecies, 'spriteId'>): string => sdUrl(sp.spriteId);
export const fallbackUrl = (sp: Pick<CatalogSpecies, 'num'>): string => fallbackSpriteUrl(sp.num);
export const trainerSpriteUrl = (trainer: string): string => sdTrainer(trainer);

type SpriteSpecies = Pick<CatalogSpecies, 'spriteId' | 'num'> | null | undefined;

/** Row icon: 40x30 box from Showdown's icon sheet (one cached image for every row). */
let sheetOk = true;
/** Probe the icon sheet once; if it can't load (blocked host), rows use per-species PokeAPI images. */
export function probeIconSheet(onFail: () => void): void {
  const img = new Image();
  img.onerror = () => { sheetOk = false; onFail(); };
  img.src = ICON_SHEET_URL;
}
export function ico(sp: SpriteSpecies): string {
  if (!sp) return `<span class="ico" aria-hidden="true"></span>`;
  if (!sheetOk) return `<span class="ico" aria-hidden="true"><img class="fb" src="${esc(fallbackUrl(sp))}" alt="" width="40" height="40" loading="lazy"></span>`;
  const p = iconSheetPosition(sp.num);
  return `<span class="ico" aria-hidden="true" style="background:url(${ICON_SHEET_URL}) ${p.x}px ${p.y}px no-repeat"></span>`;
}

/** Front sprite in a framed square. size: '' (72), 'md' (56), 'xl' (112). */
export function spr(sp: SpriteSpecies, size: '' | 'md' | 'xl' = ''): string {
  const cls = 'spr' + (size ? ' ' + size : '');
  if (!sp) return `<span class="${cls}" aria-hidden="true"></span>`;
  return `<span class="${cls}" aria-hidden="true"><img src="${esc(spriteUrl(sp))}" data-fb="${esc(fallbackUrl(sp))}" alt="" width="96" height="96"></span>`;
}

export function trainerImg(trainer: string, size = 56): string {
  return `<span class="spr" style="width:${size}px;height:${size}px" aria-hidden="true"><img src="${esc(trainerSpriteUrl(trainer))}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px"></span>`;
}

/** One capture-phase listener: on error use data-fb once, then hide the image (its box stays). */
export function installSpriteFallback(): void {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fb = img.dataset.fb;
    if (fb) { delete img.dataset.fb; img.src = fb; } else img.style.visibility = 'hidden';
  }, true);
}

/** A club's logo: its gym badge in the fixed `.logo` square (older saves without a badge use their slot's badge). */
export function teamLogo(t: {id: string; badge?: number} | undefined, lg: boolean | 'lg' | 'xl' = false): string {
  const n = t?.badge ?? (t ? seedOf(t.id)?.badge : undefined);
  const cls = 'logo' + (lg === 'xl' ? ' xl' : lg ? ' lg' : '');
  return n ? `<span class="${cls}" aria-hidden="true"><img src="${esc(badgeUrl(n))}" alt="" width="64" height="64"></span>` : `<span class="${cls}" aria-hidden="true"></span>`;
}
