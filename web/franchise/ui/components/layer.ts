// The two overlay mechanisms: one floating peek layer (#float) and one shared
// <dialog class="l-dialog"> (#dlg). Every action result goes in a dialog, so the
// page itself never shifts.
import {esc, ic} from '../dom.ts';

// ---------------------------------------------------------------- dialog
let dlg: HTMLDialogElement;
let onClose: (() => void) | null = null;
let returnTo: Element | null = null;

/** `why` (with disabled): the reason, in a peek on the disabled button (it stays in place, same size). */
export interface DialogAction { key: string; label: string; go?: boolean; disabled?: boolean; href?: string; why?: string }
export interface DialogOpts {
  title: string;
  /** small caps line above the title */
  cap?: string;
  body: string;
  /** default: one "Done" button */
  actions?: DialogAction[];
  /** called with the action key; return false to keep the dialog open */
  onAction?: (key: string, d: HTMLDialogElement) => boolean | void;
  onClose?: () => void;
  /** wider dialog (replays, box scores) */
  wide?: boolean;
  /** no close button / Esc (progress dialogs) */
  locked?: boolean;
}

export function installLayers(): void {
  dlg = document.createElement('dialog');
  dlg.id = 'dlg'; dlg.className = 'l-dialog';
  document.body.appendChild(dlg);
  const fl = document.createElement('div');
  fl.id = 'float'; fl.className = 'l-peek-layer'; fl.setAttribute('role', 'tooltip'); fl.hidden = true;
  document.body.appendChild(fl);
  dlg.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t === dlg && !dlg.dataset.locked) { dlg.close(); return; }
    const b = t.closest<HTMLElement>('[data-dlg]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    const k = b.dataset.dlg!;
    if (k === 'close') { dlg.close(); return; }
    if (current?.onAction?.(k, dlg) === false) return;
    dlg.close();
  });
  dlg.addEventListener('cancel', (e) => { if (dlg.dataset.locked) e.preventDefault(); });
  dlg.addEventListener('close', () => {
    // close() fires this event asynchronously; if another dialog was opened in the meantime, it is not ours to clear
    if (dlg.open) return;
    const cb = onClose, r = returnTo;
    onClose = null; returnTo = null; current = null;
    dlg.innerHTML = '';
    cb?.();
    if (r instanceof HTMLElement && document.contains(r)) r.focus();
  });
  installPeeks(fl);
}

let current: DialogOpts | null = null;
export function dialogHtml(o: DialogOpts): string {
  const acts = o.actions ?? [{key: 'close', label: 'Done', go: true}];
  return `<div class="l-dialog-head"><div>${o.cap ? `<span class="cap">${esc(o.cap)}</span>` : ''}<h2 id="dlg-title">${o.title}</h2></div>${o.locked ? '' : `<button class="x" type="button" data-dlg="close" aria-label="Close">${ic('x')}</button>`}</div>
  <div class="l-dialog-body" data-body>${o.body}</div>
  ${acts.length ? `<div class="l-dialog-foot"><div class="l-actions" data-acts>${acts.map((a) => a.href
    ? `<a class="btn${a.go ? ' go' : ''}" href="${esc(a.href)}" data-dlg="${esc(a.key)}">${a.label}</a>`
    : `<button type="button" class="btn${a.go && !a.disabled ? ' go' : ''}${a.disabled && a.why ? ' peek' : ''}" data-dlg="${esc(a.key)}"${a.disabled ? ' aria-disabled="true"' : ''}${a.disabled && a.why ? ` aria-label="${esc(a.label.replace(/<[^>]*>/g, ''))}: ${esc(a.why)}"` : ''}>${a.label}${a.disabled && a.why ? `<span class="pop"><strong>${esc(a.label.replace(/<[^>]*>/g, ''))}</strong><span>${esc(a.why)}.</span></span>` : ''}</button>`).join('')}</div></div>` : ''}`;
}
export function openDialog(o: DialogOpts): HTMLDialogElement {
  hideFloat();
  if (dlg.open) { onClose = null; dlg.close(); }
  current = o;
  returnTo = document.activeElement;
  onClose = o.onClose ?? null;
  dlg.innerHTML = dialogHtml(o);
  dlg.setAttribute('aria-labelledby', 'dlg-title');
  dlg.style.setProperty('--dialog-w', o.wide ? '960px' : '');
  if (o.locked) dlg.dataset.locked = '1'; else delete dlg.dataset.locked;
  dlg.showModal();
  const f = dlg.querySelector<HTMLElement>('[data-acts] .btn.go:not([aria-disabled])') ?? dlg.querySelector<HTMLElement>('[data-acts] .btn, .x');
  f?.focus();
  return dlg;
}
/** Replace the body (and optionally actions) of the open dialog in place. */
export function updateDialog(o: Partial<DialogOpts>): void {
  if (!dlg.open || !current) return;
  Object.assign(current, o);
  if (o.locked === false) delete dlg.dataset.locked;
  dlg.innerHTML = dialogHtml(current);
  (dlg.querySelector<HTMLElement>('[data-acts] .btn.go') ?? dlg.querySelector<HTMLElement>('.x'))?.focus();
}
export const closeDialog = (): void => { if (dlg?.open) dlg.close(); };
export const dialogEl = (): HTMLDialogElement => dlg;

/** Confirm in a dialog; resolves true when the go action is chosen. */
export function confirmDialog(title: string, body: string, goLabel: string): Promise<boolean> {
  return new Promise((res) => {
    let ok = false;
    openDialog({title, body: `<p>${body}</p>`, actions: [{key: 'close', label: 'Cancel'}, {key: 'ok', label: goLabel, go: true}],
      onAction: (k) => { if (k === 'ok') ok = true; }, onClose: () => res(ok)});
  });
}

// ---------------------------------------------------------------- peeks
// Markup: any .peek element holds a hidden .pop child; hover/focus/tap shows a copy in #float.
let fl: HTMLElement;
let owner: Element | null = null;
function show(p: Element): void {
  if (dlg.open && !dlg.contains(p)) return;
  const pop = p.querySelector(':scope>.pop');
  if (!pop) return;
  fl.innerHTML = pop.innerHTML; fl.hidden = false; owner = p;
  p.setAttribute('aria-describedby', 'float');
  if (dlg.open && fl.parentNode !== dlg) dlg.appendChild(fl);
  else if (!dlg.open && fl.parentNode !== document.body) document.body.appendChild(fl);
  const rc = p.getBoundingClientRect(), fw = fl.offsetWidth, fh = fl.offsetHeight;
  const left = Math.min(Math.max(8, rc.left), innerWidth - fw - 8);
  let top = rc.bottom + 8;
  if (top + fh > innerHeight - 8) top = Math.max(8, rc.top - fh - 8);
  fl.style.left = left + 'px'; fl.style.top = top + 'px';
}
export function hideFloat(): void {
  if (!fl) return;
  owner?.removeAttribute('aria-describedby');
  fl.hidden = true; owner = null;
}
function installPeeks(layer: HTMLElement): void {
  fl = layer;
  document.addEventListener('pointerover', (e) => {
    const p = (e.target as Element).closest?.('.peek');
    if (p && p !== owner) show(p); else if (!p && owner && e.pointerType === 'mouse') hideFloat();
  });
  document.addEventListener('focusin', (e) => { const p = (e.target as Element).closest?.('.peek'); if (p) show(p); else if (owner) hideFloat(); });
  document.addEventListener('pointerdown', (e) => { const p = (e.target as Element).closest?.('.peek'); if (p) show(p); else hideFloat(); });
  addEventListener('scroll', hideFloat, {passive: true});
  document.addEventListener('scroll', hideFloat, {passive: true, capture: true});
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideFloat(); });
}

/** Peek content helpers */
export const prow = (k: string, v: string): string => `<span class="row"><span>${k}</span><span>${v}</span></span>`;
/** (i) button with a peek */
export const info = (label: string, popHtml: string): string =>
  `<button type="button" class="info peek" aria-label="${esc(label)}">i<span class="pop">${popHtml}</span></button>`;
/** dotted-underline label with a peek */
export const peekLabel = (label: string, popHtml: string, aria?: string): string =>
  `<span class="peek" tabindex="0"${aria ? ` aria-label="${esc(aria)}"` : ''}><span class="l-peek-lbl">${label}</span><span class="pop">${popHtml}</span></span>`;
