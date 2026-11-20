// Plateau battle screen: the Pokémon Showdown replay viewer (web/replay/embed.ts
// document: hosted player from play.pokemonshowdown.com, scripts in order)
// inside a design-system frame. The viewer's own controls and log are hidden;
// the frame drives the player through its Battle object (same-origin srcdoc,
// `window.rollmonsLive.battle`): play/pause, step, speed, skip to end, switch sides.
//
// Layout: the iframe is always 640x360 (the player's native battle size, so
// its own phone autoresize never kicks in) and scaled with a CSS transform to
// the width of a fixed-aspect box: nothing shifts while the player loads.
import {esc, lazyLoadReplay, PLAYER_ROOT, replayDoc, withBossAvatar} from '../../replay/embed.ts';

export interface ReplaySide { name: string; trainer: string }
export interface ReplayOptions { log: string[]; p1: ReplaySide; p2: ReplaySide; title?: string; game?: string; /** side shown near (left in the header); default p1 */ viewpoint?: 'p1' | 'p2' }

export const VIEW_W = 640;
export const VIEW_H = 360;
/** Seconds the frame may try to start the hosted viewer before the "couldn't load" message. */
export const LOAD_TIMEOUT_S = 10;

/** Player speeds as [messageFadeTime, messageShownTime] (embed.ts SPEEDS: normal, fast, hyperfast). */
export const SPEEDS: Record<string, [number, number]> = {'1x': [300, 1], '2x': [50, 1], '4x': [40, 1]};

const FRAME_CSS = `html,body{margin:0;padding:0;width:${VIEW_W}px;height:${VIEW_H}px;overflow:hidden;background:transparent}
.wrapper,.replay-wrapper{max-width:none!important;width:${VIEW_W}px!important;height:${VIEW_H}px!important;margin:0!important;padding:0!important;position:relative}
.battle{position:absolute!important;top:0!important;left:0!important;margin:0!important}
.battle-log,.replay-controls,.replay-controls-2{display:none!important}`;

/** Set each side's `|player|` avatar to its trainer sprite id. */
export function withTrainers(log: string[], p1: ReplaySide, p2: ReplaySide): string[] {
  return log.map((line) => {
    if (!line.startsWith('|player|')) return line;
    const p = line.split('|');
    const side = p[2] === 'p1' ? p1 : p[2] === 'p2' ? p2 : null;
    if (!side) return line;
    while (p.length < 5) p.push('');
    p[4] = side.trainer;
    return p.join('|');
  });
}

/** The iframe srcdoc: embed.ts's replay document with Plateau's trainers and the viewer chrome hidden. */
export function replayDocument(opts: ReplayOptions): string {
  const log = withTrainers(opts.log, opts.p1, opts.p2);
  // replayDoc rewrites every |player| line but the named player's with a
  // "boss" avatar; undo that for both lines so the trainers stand.
  let doc = replayDoc(log, opts.p2.name, opts.p1.name);
  for (const line of log.filter((l) => l.startsWith('|player|'))) {
    const rewritten = withBossAvatar([line], opts.p2.name, opts.p1.name)[0];
    if (rewritten !== line) doc = doc.replace(rewritten.replaceAll('/', '\\/'), line.replaceAll('/', '\\/'));
  }
  return `${doc}\n<style>${FRAME_CSS}</style>`;
}

const trainerSprite = (t: string) => `${PLAYER_ROOT}/sprites/trainers/${encodeURIComponent(t)}.png`;

interface PlayerBattle {
  paused: boolean; ended?: boolean; turn: number; atQueueEnd?: boolean;
  play(): void; pause(): void; seekBy(n: number): void; seekTurn(t: number): void; switchViewpoint(): void;
  messageFadeTime: number; messageShownTime: number; scene: {updateAcceleration(): void};
}

export interface MountedReplay {
  frame: HTMLIFrameElement;
  root: HTMLElement;
  destroy(): void;
}

export function mountReplay(container: HTMLElement, opts: ReplayOptions): MountedReplay {
  const side = (s: ReplaySide, align: 'start' | 'end') => {
    const img = `<span class="spr md"><img alt="" src="${esc(trainerSprite(s.trainer))}" loading="lazy" onerror="this.style.visibility='hidden'"></span>`;
    const nm = `<b class="ref"><span class="nm">${esc(s.name)}</span></b>`;
    return `<div class="l-row">${align === 'start' ? img + nm : nm + img}</div>`;
  };
  const root = document.createElement('section');
  root.className = 'l-panel l-stack';
  root.innerHTML = `
    <div class="l-split">
      <div class="l-stack tight">
        ${opts.title ? `<h2>${esc(opts.title)}</h2>` : ''}
        <span class="cap" data-r="status">${esc(opts.game ?? '')}${opts.game ? ' · ' : ''}<span data-r="turn">Loading</span></span>
      </div>
    </div>
    <div class="l-versus" data-r="sides">${side(opts.p1, 'start')}<span class="cap">vs</span>${side(opts.p2, 'end')}</div>
    <div data-r="box" style="position:relative;width:100%;aspect-ratio:${VIEW_W}/${VIEW_H};overflow:hidden;border-radius:var(--r);background:var(--spr-bg)"></div>
    <div class="l-actions" role="group" aria-label="Playback">
      <button class="btn sm" type="button" data-a="back" aria-label="Previous turn">Back</button>
      <button class="btn sm go" type="button" data-a="toggle">Play</button>
      <button class="btn sm" type="button" data-a="fwd" aria-label="Next turn">Forward</button>
      <button class="btn sm" type="button" data-a="end">Skip to end</button>
    </div>
    <div class="l-split">
      <div class="l-row" role="group" aria-label="Speed">
        ${Object.keys(SPEEDS).map((k) => `<button class="btn sm" type="button" data-speed="${k}" aria-pressed="${k === '1x'}">${k}</button>`).join('')}
      </div>
      <button class="btn sm" type="button" data-a="switch">Switch sides</button>
    </div>`;
  container.appendChild(root);

  const box = root.querySelector<HTMLElement>('[data-r="box"]')!;
  const turnEl = root.querySelector<HTMLElement>('[data-r="turn"]')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-a="toggle"]')!;
  const sidesEl = root.querySelector<HTMLElement>('[data-r="sides"]')!;
  // header order follows the viewer's viewpoint: the near side is on the left
  let flipped = false;
  const setFlip = (on: boolean) => {
    flipped = on;
    sidesEl.innerHTML = on ? `${side(opts.p2, 'start')}<span class="cap">vs</span>${side(opts.p1, 'end')}` : `${side(opts.p1, 'start')}<span class="cap">vs</span>${side(opts.p2, 'end')}`;
  };
  let wantFlip = opts.viewpoint === 'p2';
  if (wantFlip) setFlip(true);
  const f = document.createElement('iframe');
  f.title = `${opts.p1.name} vs ${opts.p2.name} replay`;
  f.style.cssText = `position:absolute;left:0;top:0;width:${VIEW_W}px;height:${VIEW_H}px;border:0;transform-origin:0 0;background:transparent`;
  box.appendChild(f);

  const fit = () => { const w = box.clientWidth; if (w > 0) f.style.transform = `scale(${w / VIEW_W})`; };
  fit();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(box);

  const battle = (): PlayerBattle | null => {
    try { return (f.contentWindow as (Window & {rollmonsLive?: {battle: PlayerBattle}}) | null)?.rollmonsLive?.battle ?? null; } catch { return null; }
  };
  let speed = '1x';
  const applySpeed = (b: PlayerBattle) => {
    const [fade, shown] = SPEEDS[speed];
    b.messageFadeTime = fade; b.messageShownTime = shown;
    try { b.scene.updateAcceleration(); } catch { /* older client */ }
  };
  const refresh = () => {
    const b = battle();
    if (!b) return;
    if (wantFlip) { wantFlip = false; try { b.switchViewpoint(); } catch { /* older client */ } }
    toggle.textContent = b.paused ? 'Play' : 'Pause';
    turnEl.textContent = b.turn > 0 ? `Turn ${b.turn}` : 'Team preview';
  };
  const timer = setInterval(refresh, 250);
  f.addEventListener('load', () => { const b = battle(); if (b) applySpeed(b); refresh(); });
  // The viewer comes from play.pokemonshowdown.com: offline or blocked it never starts. After LOAD_TIMEOUT_S
  // seconds of the frame trying, say so in the same fixed box (the box score below stays).
  let waited = 0;
  const watchdog = setInterval(() => {
    if (battle()) { clearInterval(watchdog); return; }
    if (f.srcdoc) waited++;
    if (waited < LOAD_TIMEOUT_S) return;
    clearInterval(watchdog); clearInterval(timer);
    f.remove();
    box.innerHTML = `<div class="l-empty" role="status" style="position:absolute;inset:0;margin:0;place-content:center;justify-items:center;text-align:center"><b>Replay viewer couldn't load</b><span>It needs play.pokemonshowdown.com. The box score below has the game.</span></div>`;
    turnEl.textContent = 'Viewer unavailable';
    root.querySelectorAll<HTMLButtonElement>('[data-a],[data-speed]').forEach((b) => { b.setAttribute('aria-disabled', 'true'); b.disabled = true; });
  }, 1000);

  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const b = battle();
    const s = btn.dataset.speed;
    if (s) {
      speed = s;
      root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((o) => o.setAttribute('aria-pressed', String(o === btn)));
      if (b) applySpeed(b);
      return;
    }
    if (!b) return;
    switch (btn.dataset.a) {
      case 'toggle': if (b.paused) b.play(); else b.pause(); break;
      case 'back': b.seekBy(-1); break;
      case 'fwd': b.seekBy(1); break;
      case 'end': b.seekTurn(Infinity); break;
      case 'switch': b.switchViewpoint(); setFlip(!flipped); break;
    }
    refresh();
  });

  lazyLoadReplay(f, replayDocument(opts));
  return {
    frame: f, root,
    destroy() { clearInterval(timer); clearInterval(watchdog); ro?.disconnect(); root.remove(); },
  };
}
