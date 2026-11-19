// Battle screen: the Pokémon Showdown replay viewer (sim/replay.ts mountReplay) in a
// design-system frame, with the series score, game tabs and the game's box score.
import type {Series, MonBox} from '../../types.ts';
import {esc, ic, record} from '../dom.ts';
import {S} from '../store.ts';
import {head, empty} from '../components/page.ts';
import {table} from '../components/table.ts';
import {monRef, team, teamName, teamAbbr} from '../components/mon.ts';
import {mountReplay, type MountedReplay} from '../../sim/replay.ts';
import {seriesScore} from './week.ts';

export function parseBattleArg(arg: string): {seriesId: string; game: number} {
  const i = arg.lastIndexOf('-');
  return {seriesId: arg.slice(0, i), game: Math.max(1, parseInt(arg.slice(i + 1), 10) || 1)};
}
const findSeries = (id: string): Series | undefined => S().schedule.find((x) => x.id === id);

export function viewBattle(arg: string): string {
  const {seriesId, game} = parseBattleArg(arg);
  const se = findSeries(seriesId);
  if (!se) return head('Battle', 'Not found') + empty('No such series', 'It may be from an earlier season.', `<a class="btn" href="#week">Back to This week</a>`);
  const s = S(), me = s.userTeamId;
  const left = se.awayId === me ? se.awayId : se.homeId, right = left === se.homeId ? se.awayId : se.homeId;
  const [w, l] = seriesScore(se, left);
  const g = se.games[game - 1];
  const tabs = Array.from({length: se.bestOf}, (_, i) => {
    const gm = se.games[i];
    const sub = gm ? (gm.winnerTeamId === left ? `${team(left).abbr} won` : `${team(right).abbr} won`) : 'Not played';
    return gm ? `<a role="tab" href="#battle-${esc(se.id)}-${i + 1}" aria-selected="${i + 1 === game}">Game ${i + 1}<small>${sub}</small></a>` : `<span role="tab" aria-disabled="true" aria-selected="false">Game ${i + 1}<small>${sub}</small></span>`;
  }).join('');
  const frame = g
    ? (g.log?.length ? `<div id="replay-host" class="replay-host"></div>` : `<div class="l-frame"><div class="l-empty">${ic('film')}<b>No replay saved for this game</b><span>Replays are kept for your games and the last few weeks.</span></div></div>`)
    : `<div class="l-frame"><div class="l-empty">${ic('clock')}<b>Not played</b><span>This game was not needed.</span></div></div>`;
  const box = g ? boxTable(g.box) : '';
  return `<a class="back" href="#week">${ic('back')}This week</a>` +
    head(`${esc(team(left).name)} vs ${esc(team(right).name)}`, `Week ${se.week} · game ${game} · best of ${se.bestOf}${g ? ` · ${g.turns} turns` : ''}`) +
    `<div class="x-bar"><div class="x-score" role="group" aria-label="Series score">${teamAbbr(left)}<b>${record(w, l)}</b>${teamAbbr(right)}</div>
      <div class="x-gtabs" role="tablist" aria-label="Games" style="grid-template-columns:repeat(${se.bestOf},minmax(88px,1fr))">${tabs}</div></div>
    ${frame}
    ${g?.summary ? `<p class="muted l-clamp" style="--lines:2">${esc(g.summary)}</p>` : ''}
    ${box ? `<section class="l-panel flush l-section" aria-labelledby="h-box"><h2 id="h-box">Box score</h2>${box}</section>` : ''}`;
}

function boxTable(bx: Record<string, MonBox>): string {
  const s = S();
  const rows = Object.entries(bx).map(([id, b]) => ({id, b}));
  return table({
    id: 'box', rows, minWidth: 640, defaultSort: {key: 'team', dir: 'asc'},
    cols: [
      {key: 'mon', label: 'Pokémon', width: '30%', cell: (r) => s.mons[r.id] ? monRef(s.mons[r.id]) : esc(r.id)},
      {key: 'team', label: 'Team', width: '12%', cell: (r) => teamAbbr(r.b.teamId), sort: (r) => r.b.teamId === s.userTeamId ? '0' : r.b.teamId},
      {key: 'kos', label: 'KOs', width: '10%', num: true, cell: (r) => String(r.b.kos), sort: (r) => r.b.kos, desc: true},
      {key: 'dmg', label: 'Dealt', width: '12%', num: true, cell: (r) => Math.round(r.b.damageDealt) + '%', sort: (r) => r.b.damageDealt, desc: true},
      {key: 'took', label: 'Taken', width: '12%', num: true, cell: (r) => Math.round(r.b.damageTaken) + '%', sort: (r) => r.b.damageTaken, desc: true},
      {key: 'st', label: 'Status', width: '10%', num: true, cell: (r) => String(r.b.statusInflicted), sort: (r) => r.b.statusInflicted, desc: true},
      {key: 'end', label: 'End', width: '14%', cell: (r) => r.b.fainted ? '<span class="tag t-out">Fainted</span>' : r.b.played ? 'Standing' : '<span class="dash">Bench</span>', sort: (r) => (r.b.fainted ? 1 : 0)},
    ],
  });
}

let mounted: MountedReplay | null = null;
/** Called after the view is in the DOM. */
export function afterBattle(arg: string): void {
  mounted?.destroy(); mounted = null;
  const host = document.getElementById('replay-host');
  if (!host) return;
  const {seriesId, game} = parseBattleArg(arg);
  const se = findSeries(seriesId), g = se?.games[game - 1];
  if (!se || !g?.log) return;
  const h = team(se.homeId), a = team(se.awayId);
  mounted = mountReplay(host, {log: g.log, p1: {name: teamName(h.id), trainer: h.trainer}, p2: {name: teamName(a.id), trainer: a.trainer}, game: `Game ${game}`});
}
export function leaveBattle(): void { mounted?.destroy(); mounted = null; }
