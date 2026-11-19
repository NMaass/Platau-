// Settings (theme, save export/import, budgets, new league) and the New League screen.
import {esc, ic, money} from '../dom.ts';
import {store, fastSim} from '../store.ts';
import {head, panel} from '../components/page.ts';
import {isFixtureMode} from '../model.ts';
import {divisionName} from '../shell.ts';
import type {LeagueState, Mon} from '../../types.ts';
import {api, strategies} from '../model.ts';
import {TEAM_SEEDS, CONFERENCE_NAMES, DIVISION_NAMES, type TeamSeed} from '../../model/teams.ts';
import {ROLE_LABEL} from '../../catalog/roles.ts';
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
      ${panel('newl', 'New league', `<p class="muted">Start over with a new league. Your current save stays until you replace it.</p><div class="l-actions"><a class="btn" href="#new">${ic('plus')}New league</a></div>`)}
    </div></div>`;
}

// ---------------------------------------------------------------- New League
// One page: Pre-made / Draft, the 16 gyms as equal cards by region, a fixed-size preview of the picked club.
// The preview IS the league that starts: it is generated once per (seed, mode, club) and Start takes it.
export type NewMode = 'premade' | 'draft';
const previews = new Map<string, LeagueState>();
const REGION_CONF = (i: number) => CONFERENCE_NAMES[i >> 1];

export const newMode = (): NewMode => (store.ui.newMode as NewMode | undefined) ?? 'premade';
export const newTeamIndex = (): number => (store.ui.newTeam as number | undefined) ?? 0;
function newSeed(): number {
  if (store.ui.newSeed === undefined) store.ui.newSeed = Math.floor(Math.random() * 2 ** 31);
  return store.ui.newSeed as number;
}
export function rerollNewLeague(): void { store.ui.newSeed = Math.floor(Math.random() * 2 ** 31); previews.clear(); }

/** The league the current choices start (null without the catalog: dev fixture path). */
export function previewLeague(): LeagueState | null {
  const c = store.catalog;
  if (!c) return null;
  const seed = newSeed(), mode = newMode(), idx = newTeamIndex();
  const key = `${seed}:${mode}:${idx}`;
  let st = previews.get(key);
  if (!st) {
    try { st = api.newLeague(c, {seed, start: mode === 'draft' ? 'draft' : 'random', userTeamIndex: idx, name: 'Indigo League'}); } catch { return null; }
    if (previews.size > 12) previews.clear();
    previews.set(key, st);
  }
  return st;
}
/** Hand the previewed league over to the app (and forget the previews). */
export function takePreview(): LeagueState | null {
  const st = previewLeague();
  previews.clear();
  store.ui.newSeed = undefined;
  return st;
}

const stratName = (id: string): string => strategies().find((x) => x.id === id)?.name ?? id;

function teamCard(t: TeamSeed, i: number, pick: number): string {
  return `<button type="button" class="l-pick" data-act="pickteam" data-i="${i}" aria-pressed="${i === pick}" style="--c:${t.color}" aria-label="${esc(`${t.city} ${t.name}, ${t.gymType} gym, leader ${t.leader}`)}">
    ${teamLogo({id: `t${i}`, badge: t.badge}, true)}
    <span><b>${esc(t.city)}</b><small>${esc(t.name)}</small>${typeChips([t.gymType])}</span>
    ${trainerImg(t.trainer, 56)}</button>`;
}

const iconCell = (st: LeagueState, m: Mon | undefined, label?: string): string => {
  const c = store.catalog!;
  if (!m) return '<span><span class="ico"></span><span class="dash">—</span></span>';
  const sp = c.species[m.speciesId];
  const b = api.bestRole(c, st, m);
  return `<span title="${esc(`${sp?.name ?? m.speciesId} · ${ROLE_LABEL[b.role]} ${b.ovr} · age ${m.age}`)}">${ico(sp)}<span>${esc(label ?? String(b.ovr))}</span></span>`;
};

/** The fixed-size preview: header, five facts, six tiles, two icon rows. Same boxes in both modes. */
export function newPreview(): string {
  const idx = newTeamIndex(), mode = newMode(), seed = TEAM_SEEDS[idx];
  const st = previewLeague(), c = store.catalog;
  const tid = `t${idx}`;
  const team = st?.teams[tid];
  const head = `<div class="opp-h">${teamLogo({id: tid, badge: seed.badge}, true)}<div><span class="cap">${esc(divisionName(idx >> 3, (idx >> 2) & 1))} · ${esc(CONFERENCE_NAMES[idx >> 3])}</span><h2 id="h-np">${esc(seed.city)} ${esc(seed.name)}</h2></div></div>`;
  const leader = `<span class="l-row">${trainerImg(seed.trainer, 32)}<b>${esc(seed.leader)}</b>${typeChips([seed.gymType])}</span>`;
  const favs = `${esc(stratName(seed.favorites[0]))} <span class="muted">· then ${esc(stratName(seed.favorites[1]))}</span>`;
  let facts: [string, string][], tiles: string[], rowA: [string, string], rowB: [string, string];
  if (!st || !c || !team) {
    facts = [['Gym leader', leader], ['Favourite', favs], ['Strength', '<span class="dash">—</span>'], ['Cap', '<span class="dash">—</span>'], ['Plays', '<span class="dash">—</span>']];
    tiles = Array.from({length: 6}, () => '<span><span class="spr md"></span><span class="nm dash">—</span></span>');
    rowA = ['Backups', '']; rowB = ['Practice squad', ''];
  } else if (mode === 'premade') {
    const ids = Object.keys(st.teams);
    const str = new Map(ids.map((t) => [t, api.teamStrength(c, st, t)]));
    const avg = [...str.values()].reduce((a, b) => a + b, 0) / ids.length;
    const mine = str.get(tid)!, rank = [...str.values()].filter((v) => v > mine).length + 1;
    const pay = api.payroll(st, tid), cap = st.settings.cap;
    const mons = api.teamRoster(st, tid);
    const typed = mons.filter((m) => c.species[m.speciesId]?.types.includes(seed.gymType)).length;
    facts = [['Gym leader', leader], ['Favourite', favs],
      ['Strength', `<b class="x-num">${mine.toFixed(1)}</b> <span class="muted">· league ${avg.toFixed(1)} (${mine >= avg ? '+' : ''}${(mine - avg).toFixed(1)}) · ${rank}${ordinal(rank)} of 16</span>`],
      ['Cap', `${money(pay)} <span class="muted">of ${money(cap)} · ${money(cap - pay)} room</span>`],
      ['Plays', `${esc(stratName(team.lineup.strategyId))} <span class="muted">· ${typed} of 18 ${esc(seed.gymType)} type</span>`]];
    tiles = team.lineup.slots.slice(0, 6).map((sl) => {
      const m = sl.monId ? st.mons[sl.monId] : undefined;
      if (!m) return '<span><span class="spr md"></span><span class="nm dash">Empty</span></span>';
      const sp = c.species[m.speciesId];
      const r = api.roleRating(c, st, m, sl.role) ?? api.bestRole(c, st, m).ovr;
      return `<span>${spr(sp, 'md')}<span class="nm">${esc(sp?.name ?? m.speciesId)}</span>${roleBadge(sl.role, r, {sm: true})}</span>`;
    });
    while (tiles.length < 6) tiles.push('<span><span class="spr md"></span><span class="nm dash">Empty</span></span>');
    const byOvr = (a: Mon, b: Mon) => api.bestRole(c, st, b).ovr - api.bestRole(c, st, a).ovr;
    const backups = mons.filter((m) => m.tier === 'backup').sort(byOvr), practice = mons.filter((m) => m.tier === 'practice').sort(byOvr);
    rowA = ['Backups', Array.from({length: 6}, (_, k) => iconCell(st, backups[k])).join('')];
    rowB = ['Practice squad', Array.from({length: 6}, (_, k) => iconCell(st, practice[k])).join('')];
  } else {
    const d = st.draft!;
    const mine = d.order.map((p, n) => ({p, n: n + 1})).filter((x) => x.p.ownerTeamId === tid);
    const board = api.draftBoard(st).sort((a, b) => api.bestRole(c, st, b).ovr - api.bestRole(c, st, a).ovr);
    const typedBoard = board.filter((m) => c.species[m.speciesId]?.types.includes(seed.gymType));
    facts = [['Gym leader', leader], ['Favourite', favs],
      ['Draft slot', `<b class="x-num">#${mine[0].n}</b> <span class="muted">of 16 · snake order, ${mine.length} picks</span>`],
      ['Board', `${board.length} Pokémon <span class="muted">· every rating known</span>`],
      ['Cap', `${money(st.settings.cap)} <span class="muted">· contracts after the draft</span>`]];
    tiles = mine.slice(0, 6).map((x) => `<span><span class="big x-num">#${x.n}</span><span class="nm">Round ${x.p.round}</span><span class="x-small">${x.p.round === 1 ? 'first pick' : `${x.n - mine[mine.indexOf(x) - 1].n} after`}</span></span>`);
    rowA = ['Best on the board', Array.from({length: 6}, (_, k) => iconCell(st, board[k])).join('')];
    rowB = [`Best ${seed.gymType} type`, Array.from({length: 6}, (_, k) => iconCell(st, typedBoard[k])).join('')];
  }
  const tilesCap = mode === 'premade' ? 'Starting six' : 'Your first six picks';
  return `<section class="l-panel l-section l-sticky" aria-labelledby="h-np" aria-live="polite">${head}
    <dl class="l-kv">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="l-clamp" style="--lines:1">${v}</dd>`).join('')}</dl>
    <div class="l-stack tight"><span class="cap">${tilesCap}</span><div class="l-tiles">${tiles.join('')}</div></div>
    <div class="l-stack tight"><span class="cap">${esc(rowA[0])}</span><div class="l-icons">${rowA[1]}</div></div>
    <div class="l-stack tight"><span class="cap">${esc(rowB[0])}</span><div class="l-icons">${rowB[1]}</div></div>
  </section>`;
}

export function viewNewLeague(): string {
  const pick = newTeamIndex(), mode = newMode();
  const regions = DIVISION_NAMES.flat().map((r, g) => `<section class="l-stack tight" aria-labelledby="rg-${g}"><div class="l-split"><h2 id="rg-${g}">${esc(r)}</h2><span class="cap">${esc(REGION_CONF(g))}</span></div>
      <div class="l-grid team-grid">${TEAM_SEEDS.slice(g * 4, g * 4 + 4).map((t, k) => teamCard(t, g * 4 + k, pick)).join('')}</div></section>`).join('');
  const seg = `<div class="l-seg" role="group" aria-label="Rosters">${([['premade', 'Pre-made teams'], ['draft', 'Draft']] as const).map(([v, l]) => `<button type="button" data-act="newmode" data-v="${v}" aria-pressed="${mode === v}">${l}</button>`).join('')}</div>`;
  const sub = mode === 'premade' ? 'Pick a gym. Every club starts with a roster built around its gym type.' : 'Pick a gym. Every club starts empty and drafts 18 Pokémon from one board.';
  return head('New league', sub, `<button class="btn" type="button" data-act="newreroll">${ic('refresh')}Reroll</button><button class="btn go" type="button" data-act="newleague">${ic('play')}Start league</button>`) +
    `<div class="l-toolbar">${seg}<label class="l-row"><span class="cap">League name</span><input type="text" id="leagueName" class="txt-in" value="${esc((store.ui.newName as string | undefined) ?? 'Indigo League')}" maxlength="40" aria-label="League name"></label></div>` +
    `<div class="l-cols"><div class="l-stack loose">${regions}</div><div>${newPreview()}</div></div>`;
}
