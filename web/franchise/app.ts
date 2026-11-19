// Plateau entry: boot (catalog + league), shell, router, event delegation.
import {ICONS} from './ui/icons.ts';
import {esc, ic, $, plural, record} from './ui/dom.ts';
import {store, onChange, notify, act, S, C, loadCatalog, loadLast, save, exportSave, importSave, playWeek, setPool, setFastSim} from './ui/store.ts';
import {M, api, setFixtureMode, isFixtureMode} from './ui/model.ts';
import {parse, type Route} from './ui/router.ts';
import {ROUTES} from './ui/routes.ts';
import {shellHtml, renderShell, applyTeamColour, phaseLabel} from './ui/shell.ts';
import {installLayers, openDialog, updateDialog, hideFloat, closeDialog, confirmDialog} from './ui/components/layer.ts';
import {toggleSort} from './ui/components/table.ts';
import {comingSoon} from './ui/components/page.ts';
import {installSpriteFallback, probeIconSheet} from './ui/sprites.ts';
import {viewWeek, viewOpponent, seriesResult, openFocus, UNTIL, untilState, calendarPos, type Until} from './ui/screens/week.ts';
import {viewRoster} from './ui/screens/roster.ts';
import {viewLineup, openChooser} from './ui/screens/lineup.ts';
import {viewMon} from './ui/screens/mon.ts';
import {viewBattle, afterBattle, leaveBattle} from './ui/screens/battle.ts';
import {viewSettings, viewNewLeague, applyTheme} from './ui/screens/settings.ts';
import {fixtureCatalog, fixtureLeague} from './ui/dev-fixture.ts';
import {createSimPool} from './sim/pool.ts';
import {teamName} from './ui/components/mon.ts';

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

// ---------------------------------------------------------------- play the week
async function play(): Promise<void> {
  const s = S();
  // Continuing out of the draft auto-picks every remaining pick of the user's: say so first.
  if (s.phase === 'draft' && s.draft && !isFixtureMode()) {
    const left = s.draft.order.slice(s.draft.picks.length).filter((p) => p.ownerTeamId === s.userTeamId);
    if (left.length) {
      const rounds = [...new Set(left.map((p) => p.round))].join(', ');
      const ok = await confirmDialog(`Auto-pick ${left.length} ${left.length === 1 ? 'pick' : 'picks'}?`,
        `You still own ${left.length} ${left.length === 1 ? 'pick' : 'picks'} in this draft (round ${esc(rounds)}). Continuing finishes the draft and picks the best available prospect for you each time.`, 'Auto-pick and continue');
      if (!ok) return;
    }
  }
  const wk = s.week, season = s.season, phase = s.phase;
  const bar = (done: number, total: number, label: string) => `<div class="l-stack"><p>${esc(label)}</p><div class="l-progress"><span class="fitbar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total ? (done / total * 100).toFixed(1) : 0}%"></i></span><output>${done} / ${total}</output></div><p class="x-small">Every series in the league is played in the background.</p></div>`;
  openDialog({title: phase === 'regular' || phase === 'playoffs' ? `Simulating week ${wk}` : esc(phaseLabel(phase)), cap: `Season ${season}`, body: bar(0, 0, 'Preparing battles'), actions: [], locked: true});
  try {
    await playWeek((p) => {
      const d = document.getElementById('dlg');
      const i = d?.querySelector<HTMLElement>('.fitbar i'), o = d?.querySelector('output'), lbl = d?.querySelector('[data-body] p');
      if (i) i.style.width = `${p.total ? (p.done / p.total * 100).toFixed(1) : 0}%`;
      if (o) o.textContent = `${p.done} / ${p.total}`;
      if (lbl) lbl.textContent = p.label;
    });
  } catch (e) {
    console.error(e);
    updateDialog({title: 'The week could not be simulated', body: `<p>${esc((e as Error).message)}</p>`, actions: [{key: 'close', label: 'Close', go: true}], locked: false});
    return;
  }
  const me = S().userTeamId;
  const played = phase === 'regular' || phase === 'playoffs';  // offseason steps keep week 17: don't re-show the final
  const se = played ? S().schedule.find((x) => x.season === season && x.week === wk && (x.homeId === me || x.awayId === me) && x.games.length) : undefined;
  if (!se) {
    const now = S();
    const reasons = (now as unknown as {pauseReasons?: string[]}).pauseReasons ?? [];
    updateDialog({title: esc(now.phase === 'regular' ? `Week ${now.week} is next` : phaseLabel(now.phase)), cap: `Season ${now.season}`,
      body: `<p>${now.phase === phase ? 'Done.' : `Moved on from ${esc(phaseLabel(phase))}.`}</p>${reasons.map((r) => `<p class="muted">${esc(r)}</p>`).join('')}`,
      actions: [{key: 'close', label: 'Done', go: true}], locked: false});
    return;
  }
  const won = se.winnerId === me;
  updateDialog({
    title: `${esc(S().teams[me].name)} ${won ? 'win' : 'lose'} the series`, cap: `Week ${wk} · vs ${teamName(se.homeId === me ? se.awayId : se.homeId)}`,
    body: seriesResult(se), locked: false,
    actions: [{key: 'watch', label: `${ic('film')}Watch game 1`, href: `#battle-${se.id}-1`}, {key: 'close', label: 'Done', go: true}],
  });
}

// ---------------------------------------------------------------- play until
/** Pick a stop point, then sim week after week in one progress dialog. Stops early on a pause reason
 *  (a starter out 2+ weeks, a trade offer) and says why. Never plays past the start of the draft. */
function openPlayUntil(): void {
  const s = S();
  const rows = UNTIL.map((u) => {
    const st = untilState(s, u.key);
    return `<li><button type="button" data-until="${u.key}"${st.target !== null ? '' : ' aria-disabled="true"'}>${ic('play')}<span><span class="nm">${esc(u.label)}</span><span class="where">${esc(st.text)}</span></span><span></span></button></li>`;
  }).join('');
  const d = openDialog({title: 'Play until', cap: phaseLabel(s.phase), body: `<p class="muted">Sims every week up to the stop you pick. It stops early if a starter is hurt for weeks or a club sends you a trade offer.</p><ul class="chooser" role="list">${rows}</ul>`,
    actions: [{key: 'close', label: 'Cancel'}]});
  d.querySelector('[data-body]')!.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-until]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    void playUntil(b.dataset.until as Until);
  });
}

async function playUntil(target: Until): Promise<void> {
  if (target === 'week') { closeDialog(); await play(); return; }
  const start = S();
  const me = start.userTeamId, season0 = start.season;
  const rec0 = recordOf(me);
  const {label, done} = UNTIL.find((u) => u.key === target)!;
  const goal = untilState(start, target).target;
  if (goal === null) return;
  const bar = (title: string, done: number, total: number, sub: string) => `<div class="l-stack"><p>${esc(title)}</p><div class="l-progress"><span class="fitbar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total ? (done / total * 100).toFixed(1) : 0}%"></i></span><output>${done} / ${total}</output></div><p class="x-small">${esc(sub)}</p></div>`;
  openDialog({title: `Playing until: ${esc(label)}`, cap: `Season ${season0}`, body: bar(phaseLabel(start.phase), 0, 0, 'Every series in the league is played in the background.'), actions: [], locked: true});
  let steps = 0, reasons: string[] = [];
  try {
    for (let guard = 0; guard < 40; guard++) {
      const s = S();
      if (calendarPos(s) >= goal || s.phase === 'draft') break;
      const step = phaseLabel(s.phase);
      await playWeek((p) => {
        const dlg = document.getElementById('dlg');
        const i = dlg?.querySelector<HTMLElement>('.fitbar i'), o = dlg?.querySelector('output'), t = dlg?.querySelector('[data-body] p');
        if (i) i.style.width = `${p.total ? (p.done / p.total * 100).toFixed(1) : 0}%`;
        if (o) o.textContent = `${p.done} / ${p.total}`;
        if (t) t.textContent = `${step} · ${p.label}`;
      });
      if (s.phase === 'regular' || s.phase === 'playoffs') steps++;
      const now = S();
      reasons = s.phase === 'regular' || s.phase === 'playoffs' ? api.pauseReasons(now) : [];
      if (reasons.length) break;
    }
  } catch (e) {
    console.error(e);
    updateDialog({title: 'The sim stopped', body: `<p>${esc((e as Error).message)}</p>`, actions: [{key: 'close', label: 'Close', go: true}], locked: false});
    return;
  }
  const now = S();
  const rec = recordOf(me);
  const n = rec.w - rec0.w + rec.l - rec0.l;
  const played = now.season === season0 && n > 0 ? `${rec.w - rec0.w}–${rec.l - rec0.l} in ${plural(n, 'series', 'series')}` : '';
  const reached = calendarPos(now) >= goal;
  const stopped = (reached ? `<p>Reached ${esc(done)}.</p>` : `<p><b>Stopped early.</b></p>`)
    + (reasons.length ? `<ul class="l-list">${reasons.map((r) => `<li><span>${esc(r)}</span></li>`).join('')}</ul>` : '');
  const go = reasons.some((r) => /offer/i.test(r)) ? {key: 'go', label: `Offers ${ic('arrow')}`, href: '#offers'} : reasons.length ? {key: 'go', label: `Roster ${ic('arrow')}`, href: '#roster'} : null;
  updateDialog({title: esc(now.phase === 'regular' ? `Week ${now.week} is next` : phaseLabel(now.phase)), cap: `Season ${now.season}`,
    body: `${stopped}<dl class="l-kv">${steps ? `<dt>Simulated</dt><dd>${plural(steps, 'week')}${played ? ` · went ${played}` : ''}</dd>` : ''}<dt>Record</dt><dd>${esc(record(rec.w, rec.l))}</dd></dl>`,
    actions: go ? [go, {key: 'close', label: 'Done', go: true}] : [{key: 'close', label: 'Done', go: true}], locked: false});
}
function recordOf(teamId: string): {w: number; l: number} {
  const st = M.standings(S()).find((x) => x.teamId === teamId);
  return {w: st?.wins ?? 0, l: st?.losses ?? 0};
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
    case 'play': void play(); break;
    case 'until': openPlayUntil(); break;
    case 'fastsim': setFastSim(b.dataset.v === '1'); render(); $(`[data-act="fastsim"][data-v="${b.dataset.v}"]`)?.focus(); break;
    case 'auto': act((s, c) => { s.teams[me()].lineup = M.autoLineup(c, s, me()); }); break;
    case 'swap': act((s) => M.assignSlot(s, me(), +b.dataset.slot!, b.dataset.mon!)); break;
    case 'focus': openFocus((ids) => act((s) => api.setPracticeFocus(s, me(), ids))); break;
    case 'chooser': openChooser(+b.dataset.slot!, (id) => act((s) => M.assignSlot(s, me(), +b.dataset.slot!, id))); break;
    case 'theme': try { localStorage.setItem('plateau-theme', b.dataset.theme!); } catch { /* private mode */ } applyTheme(b.dataset.theme); render(); break;
    case 'export': exportSave(); break;
    case 'import': $<HTMLInputElement>('#importFile')?.click(); break;
    case 'pickteam': store.ui.newTeam = +b.dataset.i!; render(); $(`[data-act="pickteam"][data-i="${b.dataset.i}"]`)?.focus(); break;
    case 'newleague': void newLeague(); break;
  }
});
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

async function newLeague(): Promise<void> {
  const idx = (store.ui.newTeam as number | undefined) ?? 0;
  const name = ($<HTMLInputElement>('#leagueName')?.value || 'Indigo League').trim();
  let catalog = store.catalog ?? await loadCatalog();
  try {
    if (!catalog) throw new Error('not implemented: catalog');
    const st = api.newLeague(catalog, {start: 'random', userTeamIndex: idx, name, seed: Math.floor(Math.random() * 2 ** 31)});
    setFixtureMode(false);
    store.catalog = catalog; store.state = st;
  } catch (e) {
    if (!/not implemented/.test((e as Error).message)) { openDialog({title: 'Could not start the league', body: `<p>${esc((e as Error).message)}</p>`}); return; }
    catalog = fixtureCatalog();
    setFixtureMode(true);
    store.catalog = catalog; store.state = fixtureLeague(catalog, idx);
    openDialog({title: 'Started a dev league', body: `<p>The league model isn't finished yet, so this is the hand-built development league. It is not saved.</p>`});
  }
  await save();
  location.hash = '#week';
  notify();
}

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
    try { setPool(createSimPool(new URL('sim-worker.js', location.href))); } catch (e) { console.warn('[plateau] no sim pool', e); }
  }
  if (!store.state && !location.hash.startsWith('#settings')) history.replaceState(null, '', '#new');
  document.body.classList.remove('booting');
  render();
}
void boot();
void C;
