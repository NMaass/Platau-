// Battle screen: the Pokémon Showdown replay viewer (sim/replay.ts mountReplay) in a
// design-system frame, with the series score, game tabs and the game's box score.
// Watch mode (`#battle-<series>-<game>?watch=1`, from Watch week): no spoilers. The score counts only
// the games before this one, later tabs say "Up next", and the box score waits behind "Game result"
// (a dialog); "Next game" / "Series result" walk through the series.
import type {Series, MonBox} from '../../types.ts';
import {esc, ic, record} from '../dom.ts';
import {S} from '../store.ts';
import {parse} from '../router.ts';
import {openDialog} from '../components/layer.ts';
import {head, empty} from '../components/page.ts';
import {table} from '../components/table.ts';
import {monRef, team, teamName, teamAbbr} from '../components/mon.ts';
import {mountReplay, type MountedReplay} from '../../sim/replay.ts';
import {seriesScore, seriesResult, gameNums} from './week.ts';
import {pauseNote, seriesTitle, watchHash} from './play.ts';
import {api} from '../model.ts';

export function parseBattleArg(arg: string): {seriesId: string; game: number} {
  const i = arg.lastIndexOf('-');
  return {seriesId: arg.slice(0, i), game: Math.max(1, parseInt(arg.slice(i + 1), 10) || 1)};
}
const findSeries = (id: string): Series | undefined => S().schedule.find((x) => x.id === id);

const watching = (): boolean => parse().params.get('watch') === '1';

export function viewBattle(arg: string): string {
  const {seriesId, game} = parseBattleArg(arg);
  const se = findSeries(seriesId);
  if (!se) return head('Battle', 'Not found') + empty('No such series', 'It may be from an earlier season.', `<a class="btn" href="#week">Back to This week</a>`);
  const s = S(), me = s.userTeamId, watch = watching();
  const left = se.awayId === me ? se.awayId : se.homeId, right = left === se.homeId ? se.awayId : se.homeId;
  // watching: the score so far is the games already watched
  const [w, l] = seriesScore(watch ? {...se, games: se.games.slice(0, game - 1)} : se, left);
  const g = se.games[game - 1];
  const tabs = Array.from({length: se.bestOf}, (_, i) => {
    const gm = se.games[i];
    const ahead = watch && i + 1 > game;
    const sub = ahead ? 'Up next' : watch && i + 1 === game ? 'Watching' : gm ? (gm.winnerTeamId === left ? `${team(left).abbr} won` : `${team(right).abbr} won`) : 'Not played';
    return gm && !ahead ? `<a role="tab" href="#battle-${esc(se.id)}-${i + 1}${watch ? '?watch=1' : ''}" aria-selected="${i + 1 === game}">Game ${i + 1}<small>${sub}</small></a>` : `<span role="tab" aria-disabled="true" aria-selected="false">Game ${i + 1}<small>${sub}</small></span>`;
  }).join('');
  const frame = g
    ? (g.log?.length ? `<div id="replay-host" class="replay-host"></div>` : `<div class="l-frame"><div class="l-empty">${ic('film')}<b>No replay saved for this game</b><span>${watch ? 'Fast sim keeps no replays. Game result has the box score.' : 'Replays are kept for your games and the last few weeks.'}</span></div></div>`)
    : `<div class="l-frame"><div class="l-empty">${ic('clock')}<b>Not played</b><span>This game was not needed.</span></div></div>`;
  const box = g && !watch ? boxTable(g.box) : '';
  const last = game >= se.games.length;
  const walk = watch && g ? `<div class="l-actions" role="group" aria-label="Watch the series">
      <button class="btn" type="button" data-watch="game">${ic('check')}Game ${game} result</button>
      ${last ? `<button class="btn go" type="button" data-watch="series">${ic('trophy')}Series result</button>` : `<a class="btn go" href="${esc(watchHash(se.id, game + 1))}">Next: game ${game + 1} ${ic('arrow')}</a>`}</div>` : '';
  return `<a class="back" href="#week">${ic('back')}This week</a>` +
    head(`${esc(team(left).name)} vs ${esc(team(right).name)}`, `Week ${se.week} · game ${game} · best of ${se.bestOf}${g && !watch ? ` · ${g.turns} turns` : ''}`) +
    `<div class="x-bar"><div class="x-score" role="group" aria-label="${watch ? 'Series score before this game' : 'Series score'}">${teamAbbr(left)}<b>${record(w, l)}</b>${teamAbbr(right)}</div>
      <div class="x-gtabs" role="tablist" aria-label="Games" style="grid-template-columns:repeat(${se.bestOf},minmax(88px,1fr))">${tabs}</div></div>
    ${frame}
    ${walk}
    ${box ? `<section class="l-panel flush l-section" aria-labelledby="h-box"><h2 id="h-box">Box score</h2>${box}</section>` : ''}`;
}

/** Watch mode: the game's result, then the series' result, in the dialog. */
function watchDialog(kind: string, arg: string): void {
  const {seriesId, game} = parseBattleArg(arg);
  const se = findSeries(seriesId), g = se?.games[game - 1];
  if (!se || !g) return;
  const me = S().userTeamId;
  if (kind === 'series') {
    openDialog({title: seriesTitle(se.winnerId === me), cap: `Week ${se.week} · vs ${teamName(se.homeId === me ? se.awayId : se.homeId)}`,
      body: seriesResult(se) + pauseNote(se.week === S().week - 1 ? api.pauseReasons(S()) : []), actions: [{key: 'week', label: 'Back to This week', href: '#week', go: true}]});
    return;
  }
  const last = game >= se.games.length;
  const won = g.winnerTeamId === me;
  openDialog({title: `${esc(team(me).name)} ${won ? 'win' : 'lose'} game ${game}`, cap: `Week ${se.week} · ${g.turns} turns`, wide: true,
    body: `${gameNums(g, me)}${boxTable(g.box)}`,
    actions: last ? [{key: 'close', label: 'Close'}, {key: 'series', label: `${ic('trophy')}Series result`, go: true}]
      : [{key: 'close', label: 'Close'}, {key: 'next', label: `Next: game ${game + 1} ${ic('arrow')}`, href: watchHash(se.id, game + 1), go: true}],
    onAction: (k) => { if (k === 'series') { watchDialog('series', arg); return false; } }});
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
let mountedArg = '';
/** Called after every render of the battle view. A re-render of the same game (any notify())
 *  puts the existing viewer back into the new host instead of leaving it blank. */
export function afterBattle(arg: string): void {
  document.querySelectorAll<HTMLElement>('[data-watch]').forEach((b) => b.addEventListener('click', () => watchDialog(b.dataset.watch!, arg)));
  const host = document.getElementById('replay-host');
  if (mounted && mountedArg === arg && host) { if (mounted.root.parentElement !== host) host.appendChild(mounted.root); return; }
  mounted?.destroy(); mounted = null; mountedArg = '';
  if (!host) return;
  const {seriesId, game} = parseBattleArg(arg);
  const se = findSeries(seriesId), g = se?.games[game - 1];
  if (!se || !g?.log) return;
  const h = team(se.homeId), a = team(se.awayId);
  mountedArg = arg;
  mounted = mountReplay(host, {log: g.log, p1: {name: teamName(h.id), trainer: h.trainer}, p2: {name: teamName(a.id), trainer: a.trainer}, game: `Game ${game}`, viewpoint: se.awayId === S().userTeamId ? 'p2' : 'p1'});
}
export function leaveBattle(): void { mounted?.destroy(); mounted = null; mountedArg = ''; }
