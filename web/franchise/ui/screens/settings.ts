// Settings (theme, save export/import, budgets, new league) and the New League screen.
import {esc, ic, money, $} from '../dom.ts';
import {store, fastSim, savedLeagues, notify, save, loadCatalog, type SaveMeta} from '../store.ts';
import {table} from '../components/table.ts';
import {head, panel} from '../components/page.ts';
import {isFixtureMode, setFixtureMode} from '../model.ts';
import {openDialog, closeDialog, confirmDialog} from '../components/layer.ts';
import {once} from '../components/front.ts';
import {fixtureCatalog, fixtureLeague} from '../dev-fixture.ts';
import {strategyLook} from '../../model/strategies.ts';
import {divisionName} from '../shell.ts';
import type {LeagueState, Mon} from '../../types.ts';
import {api} from '../model.ts';
import {TEAM_SEEDS, CONFERENCE_NAMES, DIVISION_NAMES, type TeamSeed} from '../../model/teams.ts';
import {ROLE_LABEL} from '../../catalog/roles.ts';
import {monLabel} from '../../model/util.ts';
import {roleBadge, typeChips} from '../components/badges.ts';
import {ico, spr, teamLogo, trainerImg} from '../sprites.ts';

const ordinal = (n: number): string => (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

export const theme = (): string => { try { return localStorage.getItem('plateau-theme') ?? 'auto'; } catch { return 'auto'; } };
export function applyTheme(t = theme()): void {
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}

export function viewSettings(): string {
  const s = store.state;
  const seg = ['auto', 'light', 'dark'].map((t) => `<button type="button" data-act="theme" data-theme="${t}" aria-pressed="${theme() === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
  const save = s ? `<dl class="l-kv"><dt>League</dt><dd>${esc(s.name)}${isFixtureMode() ? ' <span class="chip c-scout">Dev fixture, not saved</span>' : ''}</dd><dt>Season</dt><dd>${s.season}, week ${s.week}</dd></dl>
    <div class="l-actions"><button class="btn" type="button" data-act="export">${ic('down')}Export save</button><button class="btn" type="button" data-act="import">${ic('upload')}Import save</button></div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>` : `<div class="l-actions"><button class="btn" type="button" data-act="import">${ic('upload')}Import save</button></div><input type="file" id="importFile" accept="application/json,.json" hidden>`;
  const budgets = s ? `<dl class="l-kv">
      <dt>Your games</dt><dd class="l-row"><input class="num-in" type="number" min="5" max="500" step="5" value="${s.settings.budgetMs.human}" data-act="budget" data-k="human" aria-label="Think time for your games in ms"><span class="muted">ms per decision</span></dd>
      <dt>AI vs AI</dt><dd class="l-row"><input class="num-in" type="number" min="2" max="200" step="2" value="${s.settings.budgetMs.ai}" data-act="budget" data-k="ai" aria-label="Think time for AI games in ms"><span class="muted">ms per decision</span></dd>
      <dt>Salary cap</dt><dd>${money(s.settings.cap)}</dd></dl><p class="x-small">Higher think time plays better battles and takes longer to sim a week.</p>` : '';
  return head('Settings') + `<div class="l-cols">
    <div class="l-stack loose">
      ${panel('theme', 'Theme', `<div class="l-seg" role="group" aria-label="Theme">${seg}</div>`)}
      ${panel('save', 'Save', save)}
    </div>
    <div class="l-stack loose">
      ${s ? panel('budget', 'Battle think time', budgets) : ''}
      ${s ? panel('testing', 'Fast sim (no battles, for testing)', `<div class="l-seg" role="group" aria-label="Fast sim">${[['0', 'Off'], ['1', 'On']].map(([v, l]) => `<button type="button" data-act="fastsim" data-v="${v}" aria-pressed="${fastSim() === (v === '1')}">${l}</button>`).join('')}</div><p class="x-small">On: every week is decided by a quick rating model instead of real battles, so a season takes seconds. No replays.</p>`) : ''}
      ${panel('newl', 'New league', `<p class="muted">Start another league. Every league stays saved in this browser; switch between them under Your leagues.</p><div class="l-actions"><a class="btn" href="#new">${ic('plus')}New league</a></div>`)}
    </div></div>` + leaguesPanel();
}

const PHASE_WORD: Record<string, string> = {preseason: 'Preseason', regular: 'Week', playoffs: 'Indigo Plateau', awards: 'Awards', 'draft-lottery': 'Draft lottery', draft: 'Draft', resign: 'Re-sign window', 'free-agency': 'Free agency'};
const whereText = (m: SaveMeta): string => `Season ${m.season} · ${m.phase === 'regular' ? `week ${m.week}` : PHASE_WORD[m.phase] ?? m.phase}`;

/** "Your leagues": every league saved in this browser, with Open / Export / Delete (delete asks first). */
export function leaguesPanel(): string {
  const rows = savedLeagues();
  const cur = store.state?.id;
  if (!rows.length) return '';
  const body = table<SaveMeta>({id: 'saves', label: 'Your leagues', rows, minWidth: 820, cols: [
    {key: 'name', label: 'League', width: '26%', cell: (m) => `<b>${esc(m.name)}</b>${m.id === cur ? ' <span class="chip c-growth">Open now</span>' : ''}`},
    {key: 'club', label: 'Club', width: '30%', cell: (m) => esc(m.team)},
    {key: 'where', label: 'Where', width: '22%', cell: (m) => esc(whereText(m))},
    {key: 'act', label: '', width: '340px', cell: (m) => `<span class="l-cellacts" style="--n:3"><button type="button" class="btn sm" data-act="saveopen" data-id="${esc(m.id)}"${m.id === cur ? ' aria-disabled="true"' : ''} aria-label="Open ${esc(m.name)}">Open</button><button type="button" class="btn sm" data-act="saveexport" data-id="${esc(m.id)}" aria-label="Export ${esc(m.name)}">Export</button><button type="button" class="btn sm" data-act="savedelete" data-id="${esc(m.id)}" aria-label="Delete ${esc(m.name)}">Delete</button></span>`},
  ]});
  return `<section class="l-panel flush l-section" aria-labelledby="h-saves"><h2 id="h-saves">Your leagues</h2>${body}</section>`;
}

// ---------------------------------------------------------------- New League (a wizard)
// Step 1: Pre-made teams or Draft (two decision cards). Step 2: pick a club (16 badge tiles by region; a preview of
// the club beside them on desktop). Step 3: the club, large, its roster or draft slot, the league name, Start.
// The league is generated once per mode when the wizard opens (one seed); the preview IS the league that starts
// (the club picked only changes who is human: newLeague is deterministic per seed). Start plays a short intro.
export type NewMode = 'premade' | 'draft';
const previews = new Map<NewMode, LeagueState>();
const STEPS = ['How to start', 'Club', 'Ready'];

export const newMode = (): NewMode | undefined => store.ui.newMode as NewMode | undefined;
export const newTeamIndex = (): number => (store.ui.newTeam as number | undefined) ?? 0;
const newStep = (): number => (newMode() ? (store.ui.newStep as number | undefined) ?? 1 : 1);
function newSeed(): number {
  if (store.ui.newSeed === undefined) store.ui.newSeed = Math.floor(Math.random() * 2 ** 31);
  return store.ui.newSeed as number;
}

/** The league for the chosen mode (null without the catalog: dev fixture path). Rosters don't depend on the club. */
export function previewLeague(mode = newMode() ?? 'premade'): LeagueState | null {
  const c = store.catalog;
  if (!c) return null;
  let st = previews.get(mode);
  if (!st) {
    try { st = api.newLeague(c, {seed: newSeed(), start: mode === 'draft' ? 'draft' : 'random', userTeamIndex: 0, name: 'Indigo League'}); } catch { return null; }
    previews.set(mode, st);
  }
  return st;
}

const look = (sid: string): string => { const l = strategyLook(sid); return `<span class="plays">${ic(l.icon)}<span>${esc(l.says)}</span></span>`; };
/** What a club plays: its starting strategy (pre-made), or the one it drafts toward (draft). */
const playsId = (st: LeagueState | null, i: number): string => (newMode() === 'premade' && st?.teams[`t${i}`]?.lineup.strategyId) || TEAM_SEEDS[i].favorites[0];
const where = (i: number): string => `${divisionName(i >> 3, (i >> 2) & 1)} · ${CONFERENCE_NAMES[i >> 3]}`;

function clubTile(t: TeamSeed, i: number, pick: number, st: LeagueState | null): string {
  const sid = playsId(st, i), l = strategyLook(sid);
  return `<button type="button" class="club-tile" data-nl="team" data-i="${i}" aria-pressed="${i === pick}" style="--c:${t.color}" aria-label="${esc(`${t.city} ${t.name}, ${t.gymType} gym, ${l.says.toLowerCase()}`)}">
    ${teamLogo({id: `t${i}`, badge: t.badge}, true)}<b>${esc(t.city)}</b><small>${esc(t.name)}</small>
    <span class="meta">${typeChips([t.gymType])}<span title="${esc(l.says)}">${ic(l.icon)}</span></span>
    <span class="sub2">${ic(l.icon)}${esc(t.name)}</span></button>`;
}

const iconCell = (st: LeagueState, m: Mon | undefined): string => {
  const c = store.catalog!;
  if (!m) return '<span><span class="ico"></span><span class="dash">—</span></span>';
  const b = api.bestRole(c, st, m);
  return `<span title="${esc(`${monLabel(c, st, m)} · ${ROLE_LABEL[b.role]} ${b.ovr} · age ${m.age}`)}">${ico(c.species[m.speciesId])}<span>${b.ovr}</span></span>`;
};
const emptyTile = '<span><span class="spr md"></span><span class="nm dash">—</span></span>';

/** The club's facts, six tiles and two icon rows: same boxes in both modes and on every club. */
function clubDetail(i: number, withPlays = true): string {
  const seed = TEAM_SEEDS[i], tid = `t${i}`, mode = newMode() ?? 'premade';
  const st = previewLeague(mode), c = store.catalog, team = st?.teams[tid];
  let facts: [string, string][], tiles: string[], rowA: [string, string], rowB: [string, string], tilesCap: string;
  if (!st || !c || !team) {
    facts = [['Plays', look(seed.favorites[0])], ['Strength', '<span class="dash">—</span>'], ['Payroll', '<span class="dash">—</span>']];
    tiles = Array.from({length: 6}, () => emptyTile); tilesCap = 'Starting six';
    rowA = ['Backups', '']; rowB = ['Practice squad', ''];
  } else if (mode === 'premade') {
    const ids = Object.keys(st.teams);
    const mine = api.teamStrength(c, st, tid);
    const rank = ids.filter((t) => api.teamStrength(c, st, t) > mine).length + 1;
    const pay = api.payroll(st, tid), cap = st.settings.cap;
    facts = [['Plays', look(team.lineup.strategyId)],
      ['Strength', `<b>${rank}${ordinal(rank)}</b> <span class="muted">of 16 by its best six</span>`],
      ['Payroll', `${money(pay)} <span class="muted">· ${money(cap - pay)} under the cap</span>`]];
    tilesCap = 'Starting six';
    tiles = team.lineup.slots.slice(0, 6).map((sl) => {
      const m = sl.monId ? st.mons[sl.monId] : undefined;
      if (!m) return emptyTile;
      const r = api.roleRating(c, st, m, sl.role) ?? api.bestRole(c, st, m).ovr;
      return `<span>${spr(c.species[m.speciesId], 'md')}<span class="nm">${esc(monLabel(c, st, m))}</span>${roleBadge(sl.role, r, {sm: true})}</span>`;
    });
    while (tiles.length < 6) tiles.push(emptyTile);
    const mons = api.teamRoster(st, tid);
    const byOvr = (a: Mon, b: Mon) => api.bestRole(c, st, b).ovr - api.bestRole(c, st, a).ovr;
    const backups = mons.filter((m) => m.tier === 'backup').sort(byOvr), practice = mons.filter((m) => m.tier === 'practice').sort(byOvr);
    rowA = ['Backups', Array.from({length: 6}, (_, k) => iconCell(st, backups[k])).join('')];
    rowB = ['Practice squad', Array.from({length: 6}, (_, k) => iconCell(st, practice[k])).join('')];
  } else {
    const d = st.draft!;
    const mine = d.order.map((p, n) => ({p, n: n + 1})).filter((x) => x.p.ownerTeamId === tid);
    const board = api.draftBoard(st).sort((a, b) => api.bestRole(c, st, b).ovr - api.bestRole(c, st, a).ovr);
    facts = [['Wants to play', look(seed.favorites[0])],
      ['First pick', `<b>${mine[0].n}${ordinal(mine[0].n)}</b> <span class="muted">of 16, then every other round from the end</span>`],
      ['Payroll', `<span class="muted">Contracts are signed after the draft</span>`]];
    tilesCap = 'Your first six picks';
    tiles = mine.slice(0, 6).map((x, k) => `<span><span class="big x-num">${x.n}</span><span class="nm">Round ${x.p.round}</span><span class="x-small">${k === 0 ? 'first pick' : `${x.n - mine[k - 1].n} picks later`}</span></span>`);
    rowA = ['Best on the board', Array.from({length: 6}, (_, k) => iconCell(st, board[k])).join('')];
    rowB = [`Best ${seed.gymType} type`, Array.from({length: 6}, (_, k) => iconCell(st, board.filter((m) => c.species[m.speciesId]?.types.includes(seed.gymType))[k])).join('')];
  }
  if (!withPlays) facts = facts.slice(1);
  return `<dl class="l-kv">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="l-clamp" style="--lines:1">${v}</dd>`).join('')}</dl>
    <div class="l-stack tight"><span class="cap">${esc(tilesCap)}</span><div class="l-tiles">${tiles.join('')}</div></div>
    <div class="l-stack tight"><span class="cap">${esc(rowA[0])}</span><div class="l-icons">${rowA[1]}</div></div>
    <div class="l-stack tight"><span class="cap">${esc(rowB[0])}</span><div class="l-icons">${rowB[1]}</div></div>`;
}

/** Step 2's side panel: the picked club, then its detail. */
export function newPreview(i = newTeamIndex()): string {
  const s = TEAM_SEEDS[i];
  return `<section class="l-panel l-section l-sticky" aria-labelledby="h-np" aria-live="polite" id="np">
    <div class="opp-h">${teamLogo({id: `t${i}`, badge: s.badge}, true)}<div><span class="cap">${esc(where(i))}</span><h2 id="h-np">${esc(s.city)} ${esc(s.name)}</h2></div></div>
    ${clubDetail(i)}</section>`;
}

function stepMode(): string {
  const m = newMode();
  const card = (v: NewMode, icon: string, title: string, text: string, facts: [string, string][]) =>
    `<button type="button" class="decide" data-nl="mode" data-v="${v}" aria-pressed="${m === v}"><span class="dic">${ic(icon)}</span><b>${title}</b><span>${text}</span>
      <ul>${facts.map(([i, f]) => `<li>${ic(i)}${f}</li>`).join('')}</ul></button>`;
  return `<div class="wz-head"><h1 tabindex="-1">How do you want to start?</h1><p class="sub">Pick one. Every league is saved on its own, so you can try the other way later.</p></div>
    <div class="l-decide" role="group" aria-label="How to start">
      ${card('premade', 'team', 'Pre-made teams', 'Every club starts with 18 Pokémon. Pick a club and the season is ready to go.', [['check', 'Rosters ready to play'], ['play', 'First week right away']])}
      ${card('draft', 'draft', 'Draft', 'Every club starts empty. Take turns picking 18 Pokémon each from one board of 288.', [['check', 'Build your own roster'], ['clock', '18 rounds of picks before the season']])}
    </div>${leaguesPanel()}`;
}

function stepClub(): string {
  const pick = newTeamIndex(), st = previewLeague();
  const regions = DIVISION_NAMES.flat().map((r, g) => `<section class="l-stack tight" aria-labelledby="rg-${g}"><div class="l-split"><h2 id="rg-${g}">${esc(r)}</h2><span class="cap">${esc(CONFERENCE_NAMES[g >> 1])}</span></div>
      <div class="l-clubs">${TEAM_SEEDS.slice(g * 4, g * 4 + 4).map((t, k) => clubTile(t, g * 4 + k, pick, st)).join('')}</div></section>`).join('');
  const sub = newMode() === 'premade' ? 'Each club comes with its gym leader’s style and a roster ready to play. You keep it for the whole league.'
    : 'Each club drafts toward its gym leader’s style. Your club decides where you pick.';
  return `<div class="wz-head"><h1 tabindex="-1">Pick your club</h1><p class="sub">${sub}</p></div>
    <div class="l-cols"><div class="l-stack loose">${regions}</div><div class="wz-side">${newPreview(pick)}</div></div>`;
}

function stepReady(): string {
  const i = newTeamIndex(), s = TEAM_SEEDS[i], st = previewLeague();
  const name = (store.ui.newName as string | undefined) ?? 'Indigo League';
  return `<div class="wz-club">${teamLogo({id: `t${i}`, badge: s.badge}, 'xl')}
      <div class="l-stack tight"><span class="cap">${esc(where(i))}</span><h1 tabindex="-1">${esc(s.city)} ${esc(s.name)}</h1>
      <div class="facts"><span>${trainerImg(s.trainer, 32)}Leader <b>${esc(s.leader)}</b>${typeChips([s.gymType])}</span>${look(playsId(st, i))}</div></div></div>
    <div class="l-cols"><section class="l-panel l-section" aria-label="Your club">${clubDetail(i, false)}</section>
      <section class="l-panel l-section" aria-labelledby="h-ln"><h2 id="h-ln">League name</h2>
        <input type="text" id="leagueName" class="txt-in" value="${esc(name)}" maxlength="40" aria-labelledby="h-ln">
        <p class="muted">${newMode() === 'draft' ? 'Start opens the draft board. You pick when your club is on the clock; Sim to my pick skips ahead.' : 'Start takes you to your club’s home, ready for the first week.'}</p></section></div>`;
}

export function viewNewLeague(): string {
  const step = newStep(), mode = newMode();
  const enter = store.ui.newEnter as string | undefined;
  store.ui.newEnter = undefined;
  const steps = STEPS.map((l, k) => `<li${k + 1 === step ? ' aria-current="step"' : k + 1 < step ? ' class="is-done"' : ''}><span>${l}</span></li>`).join('');
  const body = step === 1 ? stepMode() : step === 2 ? stepClub() : stepReady();
  const next = step === 3 ? `<button class="btn go" type="button" data-nl="start">${ic('play')}Start league</button>`
    : `<button class="btn go" type="button" data-nl="next"${step === 1 && !mode ? ' aria-disabled="true" title="Pick how to start first"' : ''}>Next${ic('arrow')}</button>`;
  const hint = step === 1 ? (mode ? (mode === 'premade' ? 'Pre-made teams' : 'Draft') : 'Pick one to continue')
    : step === 2 ? `${esc(TEAM_SEEDS[newTeamIndex()].city)} ${esc(TEAM_SEEDS[newTeamIndex()].name)}` : `${mode === 'draft' ? 'Draft' : 'Pre-made teams'} · Season 1`;
  return `<div class="l-wizard">
    <header class="wz-top"><span class="wz-brand"><span class="logo" aria-hidden="true">${ic('trophy')}</span><span>New league</span></span>
      <ol class="wz-steps" aria-label="Steps">${steps}</ol>
      ${store.state ? `<a class="btn wz-close" href="#week" aria-label="Close, back to ${esc(store.state.name)}">${ic('x')}<span>Close</span></a>` : '<span></span>'}</header>
    <div class="wz-body${enter ? ` l-enter${enter === 'back' ? ' back' : ''}` : ''}" id="wz-body">${body}</div>
    <footer class="wz-foot"><button class="btn" type="button" data-nl="back"${step === 1 ? ' hidden' : ''}>${ic('back')}Back</button><span class="hint" id="wz-hint">${hint}</span>${next}</footer>
  </div>`;
}

// ---------------------------------------------------------------- wizard actions
const keepName = (): void => { const v = $<HTMLInputElement>('#leagueName')?.value; if (v !== undefined) store.ui.newName = v; };
function go(step: number, dir: 'fwd' | 'back'): void {
  keepName();
  store.ui.newStep = step; store.ui.newEnter = dir;
  notify();
  $<HTMLElement>('#wz-body h1')?.focus({preventScroll: true});
  scrollTo(0, 0);
}

/** Pick a club without re-rendering the page: tiles flip aria-pressed, the side preview and hint swap content. */
function pickClub(i: number): void {
  store.ui.newTeam = i;
  for (const b of Array.from(document.querySelectorAll<HTMLElement>('[data-nl="team"]'))) b.setAttribute('aria-pressed', String(+b.dataset.i! === i));
  const np = $('#np');
  if (np) np.outerHTML = newPreview(i);
  const h = $('#wz-hint');
  if (h) h.textContent = `${TEAM_SEEDS[i].city} ${TEAM_SEEDS[i].name}`;
}

once('new-league', () => {
  document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-nl]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    switch (b.dataset.nl) {
      case 'mode': {
        const v = b.dataset.v as NewMode;
        store.ui.newMode = v;
        for (const d of Array.from(document.querySelectorAll<HTMLElement>('[data-nl="mode"]'))) d.setAttribute('aria-pressed', String(d.dataset.v === v));
        const nx = $('[data-nl="next"]'); nx?.removeAttribute('aria-disabled'); nx?.removeAttribute('title');
        const h = $('#wz-hint'); if (h) h.textContent = v === 'premade' ? 'Pre-made teams' : 'Draft';
        break;
      }
      case 'next': go(newStep() + 1, 'fwd'); break;
      case 'back': go(Math.max(1, newStep() - 1), 'back'); break;
      case 'team': pickClub(+b.dataset.i!); break;
      case 'start': void startLeague(); break;
    }
  });
});

/** Start the league picked in the wizard: confirm if one is open (it stays saved), save, intro, then the team home. */
export async function startLeague(): Promise<void> {
  keepName();
  if (store.state && !isFixtureMode()) {
    const cur = store.state, t = cur.teams[cur.userTeamId];
    const ok = await confirmDialog('Start a new league?', `${esc(cur.name)} (${esc(t ? `${t.city} ${t.name}` : '')}, season ${cur.season}) stays saved in this browser. Reopen it any time from Your leagues in Settings.`, 'Start new league');
    if (!ok) return;
  }
  const idx = newTeamIndex(), mode = newMode() ?? 'premade';
  const name = ((store.ui.newName as string | undefined) || 'Indigo League').trim();
  if (!store.catalog) store.catalog = await loadCatalog();
  const catalog = store.catalog;
  if (catalog) {
    let st: LeagueState;
    try { st = api.newLeague(catalog, {seed: newSeed(), start: mode === 'draft' ? 'draft' : 'random', userTeamIndex: idx, name}); }
    catch (e) { openDialog({title: 'Could not start the league', body: `<p>${esc((e as Error).message)}</p>`}); return; }
    st.createdAt = Date.now();
    st.id = `${st.id}-${st.createdAt.toString(36)}`;  // every league its own save, even on the same seed
    setFixtureMode(false);
    store.state = st;
  } else {
    const fc = fixtureCatalog();
    setFixtureMode(true);
    store.catalog = fc; store.state = fixtureLeague(fc, idx);
  }
  previews.clear();
  for (const k of ['newSeed', 'newStep', 'newMode', 'newTeam', 'newName']) store.ui[k] = undefined;
  await save();
  closeDialog();
  await intro(idx, () => { location.hash = store.state?.phase === 'draft' ? '#draft' : '#week'; notify(); });
}

/** The league-start intro (design system: .l-intro): the badge pops in, the club name and "Season 1" rise, the team
 *  home is rendered beneath, the layer fades. ~1.5 s, a click or key skips it; skipped under reduced motion. */
function intro(i: number, show: () => void): Promise<void> {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { show(); return Promise.resolve(); }
  const s = TEAM_SEEDS[i];
  const el = document.createElement('div');
  el.className = 'l-intro'; el.setAttribute('role', 'status'); el.style.setProperty('--c', s.color);
  el.innerHTML = `<div>${teamLogo({id: `t${i}`, badge: s.badge}, 'xl')}<h1>${esc(s.city)} ${esc(s.name)}</h1><span class="cap">Season 1 · Leader ${esc(s.leader)}</span><span class="bar"></span><small>Click to skip</small></div>`;
  document.body.append(el);
  return new Promise((res) => {
    let shown = false, done = false;
    const reveal = () => { if (!shown) { shown = true; show(); } };
    const finish = () => {
      if (done) return;
      done = true; reveal();
      el.classList.add('out');
      setTimeout(() => { el.remove(); removeEventListener('keydown', finish); res(); }, 220);
    };
    el.addEventListener('click', finish);
    addEventListener('keydown', finish);
    setTimeout(reveal, 1150);
    setTimeout(finish, 1450);
  });
}
