// App state: catalog + the league, persisted in IndexedDB (one save slot per league id,
// plus the id of the last opened league). act() runs a model action, saves, re-renders.
import type {Catalog, LeagueState, SimPool, BattleJobResult} from '../types.ts';
import {api, isFixtureMode} from './model.ts';
import * as fb from './fallback.ts';

export interface Store {
  catalog: Catalog | null;
  state: LeagueState | null;
  /** UI-only, not saved: lens choices etc. */
  ui: Record<string, unknown>;
}
export const store: Store = {catalog: null, state: null, ui: {}};

type Listener = () => void;
const listeners: Listener[] = [];
export const onChange = (fn: Listener): void => { listeners.push(fn); };
export const notify = (): void => { for (const fn of listeners) fn(); };

export const S = (): LeagueState => { if (!store.state) throw new Error('no league loaded'); return store.state; };
export const C = (): Catalog => { if (!store.catalog) throw new Error('no catalog loaded'); return store.catalog; };

// ---------------------------------------------------------------- IndexedDB
const DB = 'plateau', OS = 'saves';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (os: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(OS, mode);
    const req = fn(tx.objectStore(OS));
    req.onsuccess = () => res(req.result as T);
    req.onerror = () => rej(req.error);
  });
}
export async function save(): Promise<void> {
  if (!store.state || isFixtureMode()) return;
  try {
    await idb('readwrite', (os) => os.put(store.state, 'league:' + store.state!.id));
    await idb('readwrite', (os) => os.put(store.state!.id, 'last'));
  } catch (e) { console.warn('[plateau] save failed', e); }
}
export async function loadLast(): Promise<LeagueState | null> {
  try {
    const id = await idb<string | undefined>('readonly', (os) => os.get('last'));
    if (!id) return null;
    const s = await idb<LeagueState | undefined>('readonly', (os) => os.get('league:' + id));
    return s ? api.migrate(s) : null;
  } catch { return null; }
}
export async function deleteSave(id: string): Promise<void> {
  try { await idb('readwrite', (os) => os.delete('league:' + id)); await idb('readwrite', (os) => os.delete('last')); } catch { /* ignore */ }
}

export function exportSave(): void {
  const s = S();
  const blob = new Blob([JSON.stringify(s)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `plateau-${s.name.replace(/\W+/g, '-').toLowerCase()}-${s.season}-w${s.week}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export async function importSave(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text()) as LeagueState;
  if (parsed?.schemaVersion !== 1 || !parsed.teams || !parsed.mons) throw new Error('This file is not a Plateau save.');
  store.state = api.migrate(parsed);
  await save();
  notify();
}

// ---------------------------------------------------------------- catalog
export async function loadCatalog(): Promise<Catalog | null> {
  try {
    const r = await fetch(new URL('data/catalog.json', location.href));
    if (!r.ok) return null;
    return await r.json() as Catalog;
  } catch { return null; }
}

/** Run a model action on the current state, save and re-render. Returns the action's result. */
export function act<T>(fn: (state: LeagueState, catalog: Catalog) => T): T {
  const out = fn(S(), C());
  void save();
  notify();
  return out;
}

// ---------------------------------------------------------------- the week
export interface PlayProgress { done: number; total: number; label: string }

let pool: SimPool | null = null;
/** Set by app.ts once the sim pool module is available. */
export const setPool = (p: SimPool | null): void => { pool = p; };
export const hasPool = (): boolean => !!pool;

/**
 * Sim the week: weekJobs(g) -> pool.run -> applyResults, game by game, then finishWeek.
 * Falls back to the model's quick sim (playWeekSync) or the UI's fake sim when the engine
 * pool or the model isn't there yet. Progress goes to onProgress (a dialog), never the layout.
 */
export async function playWeek(onProgress: (p: PlayProgress) => void): Promise<void> {
  const s = S(), c = C();
  if (isFixtureMode() || !modelSims()) { await fakeWeek(onProgress); return; }
  if (s.phase !== 'regular' && s.phase !== 'playoffs') {
    onProgress({done: 0, total: 1, label: 'Advancing'});
    api.advancePhase(c, s);
    onProgress({done: 1, total: 1, label: 'Done'});
    await save(); notify(); return;
  }
  const maxGames = Math.max(s.settings.seriesBestOf, s.settings.finalBestOf);
  const quick = (api as unknown as {playWeekSync?: (c: Catalog, s: LeagueState) => void}).playWeekSync;
  if ((!pool || fastSim()) && quick) {
    onProgress({done: 0, total: 1, label: pool ? 'Fast sim (no battles)' : 'Quick sim (engine not loaded)'});
    await tick();
    quick(c, s);
    onProgress({done: 1, total: 1, label: 'Done'});
    await save(); notify(); return;
  }
  let total = 0, done = 0;
  for (let g = 0; g < maxGames; g++) {
    const jobs = api.weekJobs(c, s, g);
    if (!jobs.length) break;
    total = done + jobs.length;
    onProgress({done, total, label: `Game ${g + 1}`});
    const results: BattleJobResult[] = pool
      ? await pool.run(jobs, () => { done++; onProgress({done, total, label: `Game ${g + 1}`}); })
      : [];
    if (!pool) throw new Error('No battle engine available.');
    api.applyResults(c, s, results);
  }
  api.finishWeek(c, s);
  onProgress({done: total, total, label: 'Done'});
  await save();
  notify();
}
const modelSims = (): boolean => implemented();
/** Dev setting (Settings → Testing): sim weeks with model/quicksim.ts instead of the engine. Per browser. */
export const fastSim = (): boolean => { try { return localStorage.getItem('plateau-fastsim') === '1'; } catch { return false; } };
export const setFastSim = (on: boolean): void => { try { localStorage.setItem('plateau-fastsim', on ? '1' : '0'); } catch { /* private mode */ } };
/** weekJobs is implemented once calling it doesn't throw the todo error. Probed once per page. */
let probed: boolean | null = null;
function implemented(): boolean {
  if (probed !== null) return probed;
  try { api.weekJobs(C(), structuredClone(S()), 99); probed = true; } catch (e) { probed = !(e instanceof Error && /not implemented/.test(e.message)); }
  return probed;
}
const tick = () => new Promise((r) => setTimeout(r, 30));

async function fakeWeek(onProgress: (p: PlayProgress) => void): Promise<void> {
  const s = S(), c = C();
  const series = s.schedule.filter((x) => x.season === s.season && x.week === s.week && !x.winnerId);
  const total = series.length;
  let done = 0;
  onProgress({done, total, label: 'Simulating'});
  for (const se of series) {
    for (let g = 0; g < se.bestOf; g++) {
      se.games.push(fb.fakeGame(c, s, se, g));
      const need = Math.ceil(se.bestOf / 2);
      const h = se.games.filter((x) => x.winnerTeamId === se.homeId).length;
      if (h >= need || se.games.length - h >= need) break;
    }
    fb.finishSeries(c, s, se);
    done++;
    onProgress({done, total, label: 'Simulating'});
    await tick();
  }
  fb.fakeFinishWeek(c, s);
  for (const t of Object.values(s.teams)) if (!t.human) t.lineup = fb.autoLineup(c, s, t.id);
  await save();
  notify();
}
