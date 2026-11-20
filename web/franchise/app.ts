// Plateau entry: boot (catalog + league), shell, router, event delegation.
import {ICONS} from './ui/icons.ts';
import {esc, ic, $} from './ui/dom.ts';
import {store, onChange, notify, act, S, C, loadCatalog, loadLast, save, exportSave, importSave, setPool, setFastSim, refreshSaveList, savedLeagues, openSave, exportSaveById, deleteSave} from './ui/store.ts';
import {M, api, setFixtureMode, isFixtureMode} from './ui/model.ts';
import {parse, type Route} from './ui/router.ts';
import {ROUTES} from './ui/routes.ts';
import {shellHtml, renderShell, applyTeamColour} from './ui/shell.ts';
import {installLayers, openDialog, hideFloat, closeDialog, confirmDialog} from './ui/components/layer.ts';
import {toggleSort} from './ui/components/table.ts';
import {comingSoon} from './ui/components/page.ts';
import {installSpriteFallback, probeIconSheet} from './ui/sprites.ts';
import {viewWeek, viewOpponent, type PlayMode} from './ui/screens/week.ts';
import {play} from './ui/screens/play.ts';
import {viewRoster} from './ui/screens/roster.ts';
import {viewLineup, openChooser} from './ui/screens/lineup.ts';
import {viewMon} from './ui/screens/mon.ts';
import {viewBattle, afterBattle, leaveBattle} from './ui/screens/battle.ts';
import {releaseDialog} from './ui/screens/moves.ts';
import {viewSettings, viewNewLeague, applyTheme} from './ui/screens/settings.ts';   // New League wizard wires its own clicks (data-nl)
import {fixtureCatalog, fixtureLeague} from './ui/dev-fixture.ts';
import {createSimPool} from './sim/pool.ts';

const STUBS: Record<string, [string, string]> = {
  trades: ['Trades', 'A two-sided trade builder with a meter that turns green when they will say yes.'],
  freeagents: ['Free agents', 'Every unsigned Pokémon with its asking price and interest; negotiate in a dialog.'],
  offers: ['Offers', 'Trade proposals from other GMs, with an expiry. Accept or counter.'],
  scouting: ['Scouting', 'Spend points on prospects: 1 point to scout, 5 for full knowledge.'],
  draft: ['Draft', 'A sortable board that keeps taken prospects in place, next to the pick order.'],
  standings: ['Standings', 'Division tables with clinch chips in words.'],
  playoffs: ['Playoffs', 'The Indigo Plateau bracket, projected during the season.'],
  schedule: ['Schedule', 'Every week of your season with scores and replay links.'],
  history: ['History', 'Champions, awards, records and the hall of fame.'],
};


function screen(r: Route): string {
  if (!store.state) return r.path === 'settings' ? viewSettings() : viewNewLeague();
  if (ROUTES[r.path]) return ROUTES[r.path].view(r);
  switch (r.path) {
    case 'week': return viewWeek();
    case 'opponent': return viewOpponent();
    case 'roster': if (r.params.get('lens')) store.ui.rosterLens = r.params.get('lens'); return viewRoster();
    case 'lineup': return viewLineup();
    case 'mon': return viewMon(r.arg);
    case 'battle': return viewBattle(r.arg);
    case 'settings': return viewSettings();
    case 'new': return viewNewLeague();
  }
  const st = STUBS[r.path];
  return comingSoon(st?.[0] ?? 'Not found', st?.[1] ?? 'This page does not exist.');
}

let lastHash = '';
function render(): void {
  const r = parse();
  const routeChanged = r.hash !== lastHash;
  if (lastHash.startsWith('#battle') && routeChanged) leaveBattle();
  lastHash = r.hash;
  const view = $('#view')!;
  const y = scrollY;
  applyTeamColour();
  renderShell(r.path);
  try { view.innerHTML = screen(r); } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="l-empty"><b>Something went wrong on this page.</b><span>${esc((e as Error).message)}</span><a class="btn" href="#week">Back to This week</a></div>`;
  }
  hideFloat();
  if (r.path === 'battle') afterBattle(r.arg);
  ROUTES[r.path]?.after?.(r);
  if (routeChanged) { scrollTo(0, 0); view.querySelector<HTMLElement>('h1')?.focus({preventScroll: true}); } else scrollTo(0, y);
}

// ---------------------------------------------------------------- events
document.addEventListener('click', (e) => {
  const t = e.target as Element;
  const sortB = t.closest<HTMLElement>('[data-sort]');
  if (sortB) { const [id, key, desc] = sortB.dataset.sort!.split(':'); toggleSort(id, key, desc === '1'); render(); $(`[data-sort^="${id}:${key}:"]`)?.focus(); return; }
  const lens = t.closest<HTMLElement>('[data-lens]');
  if (lens) { const [k, v] = lens.dataset.lens!.split(':'); store.ui[k] = v; render(); $(`[data-lens="${k}:${v}"]`)?.focus(); return; }
  const mlink = t.closest<HTMLAnchorElement>('a[href^="#mon-"]');
  if (mlink) { if (!location.hash.startsWith('#mon-')) store.ui.monBack = location.hash || '#week'; return; }
  const b = t.closest<HTMLElement>('[data-act]');
  if (!b || b.getAttribute('aria-disabled') === 'true' || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  const me = () => S().userTeamId;
  switch (b.dataset.act) {
    case 'play': void play((b.dataset.mode ?? 'step') as PlayMode); break;
    case 'fastsim': setFastSim(b.dataset.v === '1'); render(); $(`[data-act="fastsim"][data-v="${b.dataset.v}"]`)?.focus(); break;
    case 'auto': act((s, c) => { s.teams[me()].lineup = M.autoLineup(c, s, me()); }); break;
    case 'swap': act((s) => M.assignSlot(s, me(), +b.dataset.slot!, b.dataset.mon!)); break;
    case 'chooser': openChooser(+b.dataset.slot!, (id) => act((s) => M.assignSlot(s, me(), +b.dataset.slot!, id))); break;
    case 'theme': try { localStorage.setItem('plateau-theme', b.dataset.theme!); } catch { /* private mode */ } applyTheme(b.dataset.theme); render(); break;
    case 'export': exportSave(); break;
    case 'import': $<HTMLInputElement>('#importFile')?.click(); break;
    case 'release': releaseDialog(b.dataset.mon!); break;
    case 'saveopen': void openSave(b.dataset.id!).then((ok) => { if (ok) location.hash = S().phase === 'draft' ? '#draft' : '#week'; }); break;
    case 'saveexport': void exportSaveById(b.dataset.id!); break;
    case 'savedelete': void deleteLeague(b.dataset.id!); break;
  }
});

/** Delete a saved league, after a confirm that names it. Deleting the open league goes back to New league. */
async function deleteLeague(id: string): Promise<void> {
  const m = savedLeagues().find((x) => x.id === id);
  if (!m) return;
  const open = store.state?.id === id;
  const ok = await confirmDialog(`Delete ${esc(m.name)}?`, `${esc(m.team)}, season ${m.season}. The save is removed from this browser and can't be recovered${open ? '. It is the league open now' : ''}. Export it first to keep a copy.`, 'Delete league');
  if (!ok) return;
  await deleteSave(id);
  if (open) { location.hash = '#new'; }
  notify();
}
document.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.id === 'importFile') {
    const f = (t as HTMLInputElement).files?.[0];
    if (f) importSave(f).then(() => { setFixtureMode(false); location.hash = '#week'; }).catch((err) => openDialog({title: 'Import failed', body: `<p>${esc(err.message)}</p>`}));
    return;
  }
  const me = () => S().userTeamId;
  switch (t.dataset.act) {
    case 'strategy': act((s, c) => M.setStrategy(c, s, me(), t.value)); break;
    case 'slotset': act((s) => { M.setMonSet(s, t.dataset.mon!, t.value); const sl = s.teams[me()].lineup.slots[+t.dataset.slot!]; if (sl) sl.setId = t.value; }); break;
    case 'monset': act((s) => M.setMonSet(s, t.dataset.mon!, t.value)); break;
    case 'tier': act((s) => M.moveTier(s, t.dataset.mon!, t.value as 'active')); break;
    case 'budget': act((s) => { const v = Math.max(1, +t.value || 1); s.settings.budgetMs[t.dataset.k as 'ai' | 'human'] = v; }); break;
  }
  const focusId = t.id;
  if (focusId) $(`#${focusId}`)?.focus();
});
document.addEventListener('keydown', (e) => {
  const tab = (e.target as Element).closest?.('[role="tab"][data-lens]');
  if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const tabs = Array.from(tab.parentElement!.querySelectorAll<HTMLElement>('[role="tab"]'));
    const n = tabs[(tabs.indexOf(tab as HTMLElement) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    e.preventDefault(); n.click();
  }
});

// ---------------------------------------------------------------- boot
async function boot(): Promise<void> {
  applyTheme();
  document.body.insertAdjacentHTML('afterbegin', ICONS);
  $('#app')!.innerHTML = shellHtml();
  installLayers();
  installSpriteFallback();
  probeIconSheet(() => render());
  onChange(render);
  addEventListener('hashchange', () => { closeDialog(); render(); });
  const q = new URLSearchParams(location.search);
  if (q.has('fixture')) {
    setFixtureMode(true);
    store.catalog = fixtureCatalog();
    store.state = fixtureLeague(store.catalog);
  } else {
    store.catalog = await loadCatalog();
    store.state = store.catalog ? await loadLast() : null;
    await refreshSaveList();
    try { setPool(createSimPool(new URL('sim-worker.js', location.href))); } catch (e) { console.warn('[plateau] no sim pool', e); }
  }
  if (!store.state && !location.hash.startsWith('#settings')) history.replaceState(null, '', '#new');
  document.body.classList.remove('booting');
  render();
}
void boot();
void C;
