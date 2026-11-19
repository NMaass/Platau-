// App shell: calm paper sidebar (club, rooms, next series, settings), phone header
// and tab bar, room sub-tabs. Team colour is an accent only (crest, active nav, go button).
import {esc, ic, record} from './dom.ts';
import {ROOMS, roomOf} from './router.ts';
import {DIVISION_NAMES} from '../model/teams.ts';
import {S, store} from './store.ts';
import {M, isFixtureMode} from './model.ts';
import {team, teamName} from './components/mon.ts';

export const divisionName = (conf: number, div: number): string => DIVISION_NAMES[conf as 0 | 1]?.[div as 0 | 1] ?? `Division ${div + 1}`;

export function userRecord(): {w: number; l: number} {
  const r = M.standings(S()).find((x) => x.teamId === S().userTeamId);
  return {w: r?.wins ?? 0, l: r?.losses ?? 0};
}

export function shellHtml(): string {
  return `<div class="l-shell">
    <aside class="l-side" aria-label="Club" id="side"></aside>
    <main id="main" class="l-page">
      <div class="mhead" id="mhead"></div>
      <div id="subnav"></div>
      <div id="view" class="l-stack loose"></div>
    </main>
  </div>
  <nav class="l-tabbar" aria-label="Main" id="tabbar"></nav>`;
}

/** Apply the user's team colour to the accent tokens (light + dark handled in CSS via --club). */
export function applyTeamColour(): void {
  const root = document.documentElement;
  if (!store.state) { root.style.removeProperty('--club'); delete root.dataset.club; return; }
  const c = team(S().userTeamId).color;
  root.style.setProperty('--club', c);
  // WCAG: pick the text colour (white or near-black) with the higher contrast on the club colour
  const n = parseInt(c.slice(1), 16);
  const lin = (v: number) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const L = .2126 * lin(n >> 16) + .7152 * lin((n >> 8) & 255) + .0722 * lin(n & 255);
  root.style.setProperty('--club-on', (1.05 / (L + .05)) >= ((L + .05) / .0625) ? '#FFFFFF' : '#1A1A1A');
  root.dataset.club = '1';
}

function crest(abbr: string): string { return `<span class="crest" aria-hidden="true">${esc(abbr.slice(0, 1))}</span>`; }

export function renderShell(path: string): void {
  const {room, tab} = roomOf(path);
  const side = document.getElementById('side')!, mh = document.getElementById('mhead')!, sub = document.getElementById('subnav')!, bar = document.getElementById('tabbar')!;
  if (!store.state) {
    side.innerHTML = `<div class="club">${crest('P')}<div><b>Plateau</b><span>No league yet</span></div></div><nav aria-label="Rooms"><a href="#new" aria-current="page">${ic('plus')}New league</a></nav>`;
    mh.innerHTML = `${crest('P')}<b>Plateau</b>`; sub.innerHTML = ''; bar.innerHTML = '';
    return;
  }
  const s = S(), t = team(s.userTeamId), rec = userRecord();
  const se = M.userSeries(s);
  const flags = M.advisories(store.catalog!, s).filter((a) => a.kind === 'lineup' || a.kind === 'injury').length;
  const cnt = `<span class="cnt${flags ? '' : ' off'}" aria-label="${flags ? flags + ' to check' : ''}">${flags || 1}</span>`;
  const next = se ? (() => {
    const home = se.homeId === s.userTeamId, opp = home ? se.awayId : se.homeId;
    return `<span><b>Week ${se.week}</b> ${home ? 'vs' : 'at'} ${esc(teamName(opp))}</span><span>Best of ${se.bestOf}</span>`;
  })() : `<span>${esc(phaseLabel(s.phase))}</span>`;
  const roomTabs = (store.ui.roomTab ??= {}) as Record<string, string>;
  if (tab) roomTabs[room] = tab;
  side.innerHTML = `<div class="club">${crest(t.abbr)}<div><b>${esc(teamName(t.id))}</b><span>${esc(divisionName(t.conference, t.division))} · ${record(rec.w, rec.l)}</span></div></div>
    <nav aria-label="Rooms">${ROOMS.map((r) => `<a href="#${roomTabs[r.k] ?? r.tabs[0][0]}"${r.k === room ? ' aria-current="page"' : ''}>${ic(r.icon)}${r.label}${r.k === 'team' ? cnt : ''}</a>`).join('')}</nav>
    <div class="nextup"><span class="cap">Next</span>${next}</div>
    <nav aria-label="App" class="side-foot"><a href="#settings"${room === 'settings' ? ' aria-current="page"' : ''}>${ic('gear')}Settings${isFixtureMode() ? '<span class="cnt" style="background:var(--ev-scout-bg);color:var(--ev-scout)">dev</span>' : ''}</a></nav>`;
  mh.innerHTML = `${crest(t.abbr)}<b>${esc(t.name)}</b><span class="rec">${record(rec.w, rec.l)}</span><a class="x" href="#settings" aria-label="Settings">${ic('gear')}</a>`;
  const r = ROOMS.find((x) => x.k === room);
  sub.innerHTML = r ? `<nav class="l-tabs subnav" aria-label="${r.label}">${r.tabs.map(([k, l]) => `<a href="#${k}"${k === tab ? ' aria-current="page"' : ''}>${l}${k === 'lineup' ? cnt : ''}</a>`).join('')}</nav>` : '';
  const TB: [string, string, string, string][] = [['week', 'week', 'week', 'This week'], ['roster', 'roster', 'roster', 'Roster'], ['lineup', 'lineup', 'lineup', 'Lineup'], ['moves', roomTabs.moves ?? 'trades', 'swap', 'Moves'], ['league', roomTabs.league ?? 'standings', 'trophy', 'League']];
  const cur = room === 'team' ? (tab ?? 'week') : room === 'draft' ? 'league' : room;
  bar.innerHTML = TB.map(([k, h, i, l]) => `<a href="#${h}"${k === cur ? ' aria-current="page"' : ''}>${ic(i)}${l}</a>`).join('');
}

export function phaseLabel(p: string): string {
  return ({preseason: 'Preseason', regular: 'Regular season', playoffs: 'Indigo Plateau', awards: 'Awards', 'draft-lottery': 'Draft lottery', draft: 'Draft', resign: 'Re-signing', 'free-agency': 'Free agency'} as Record<string, string>)[p] ?? p;
}
