// League room: Standings (one table per division, clinch chips in words), Playoffs
// (picture "if the season ended today" during the season, the real bracket once the
// Indigo Plateau starts), Schedule (your season + a league week view), History.
import type {Series, TeamId, Mon} from '../../types.ts';
import {esc, ic, record, plural} from '../dom.ts';
import {C, S, store, notify} from '../store.ts';
import {M} from '../model.ts';
import {head, panel, lensTabs, empty} from '../components/page.ts';
import {table, type Col} from '../components/table.ts';
import {info, openDialog} from '../components/layer.ts';
import {monRef, teamCell, teamAbbr, teamName, speciesOf} from '../components/mon.ts';
import {teamLogo} from '../sprites.ts';
import {divisionName, phaseLabel} from '../shell.ts';
import {spr} from '../sprites.ts';
import {fixChip, once} from '../components/front.ts';
import {seriesResult, seriesScore, oppOf} from './week.ts';
import {stratChip} from '../components/stats.ts';

type Row = ReturnType<typeof M.standings>[number];
const PLAYOFF_LABEL: Record<NonNullable<Series['playoff']>, string> = {round1: 'Round 1', conference: 'Conference final', final: 'Plateau final'};
const gamesDiff = (r: Row): string => { const d = r.gameWins - r.gameLosses; return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0'; };
const gamesInfo = info('About games', '<strong>Games</strong><span>Battles won and lost across every best-of-3 series. The fourth tiebreak after series record, head to head and division record.</span>');

/** Series left in the regular season for a team. */
function remaining(teamId: TeamId): number {
  const s = S();
  return s.schedule.filter((x) => !x.playoff && x.season === s.season && !x.winnerId && (x.homeId === teamId || x.awayId === teamId)).length;
}

/** Clinch / elimination status in words. Conservative: only says "Clinched" when no rival can catch up. */
export function status(r: Row, rows: Row[]): [string, string, string] {
  const s = S(), t = s.teams[r.teamId];
  const conf = rows.filter((x) => s.teams[x.teamId].conference === t.conference);
  const div = conf.filter((x) => s.teams[x.teamId].division === t.division);
  const max = (x: Row) => x.wins + remaining(x.teamId);
  const started = rows.some((x) => x.wins + x.losses > 0);
  if (!started) return ['league', 'clock', 'Not started'];
  if (div.every((x) => x === r || max(x) < r.wins)) return ['growth', 'trophy', 'Won division'];
  // a spot: more wins than every conference rival but one could reach (3 spots per conference)
  const catchers = conf.filter((x) => x !== r && max(x) >= r.wins).length;
  if (catchers < 3) return ['growth', 'check', 'Clinched spot'];
  const leader = div[0];
  const wild = conf.filter((x) => x.confSeed === 3)[0];
  if (max(r) < leader.wins && wild && max(r) < wild.wins) return ['health', 'x', 'Eliminated'];
  if (r.confSeed === 1) return ['growth', 'trophy', 'Bye seed'];
  if (r.confSeed === 2) return ['growth', 'check', 'Leads division'];
  if (r.confSeed === 3) return ['scout', 'check', 'Wild card'];
  return ['', '', ''];
}

function seasonLine(): string {
  const s = S();
  if (s.phase === 'regular') return `Season ${s.season} · week ${s.week} of ${s.settings.weeks}`;
  if (s.phase === 'preseason') return `Season ${s.season} · preseason`;
  return `Season ${s.season} · ${phaseLabel(s.phase)}`;
}

// ---------------------------------------------------------------- standings
export function viewStandings(): string {
  const s = S(), me = s.userTeamId;
  const rows = M.standings(s);
  const tables = ([0, 1] as const).flatMap((c) => ([0, 1] as const).map((d) => {
    const L = rows.filter((x) => s.teams[x.teamId].conference === c && s.teams[x.teamId].division === d);
    const lead = L[0];
    const cols: Col<Row>[] = [
      {key: 'club', label: 'Club', width: '40%', cell: (r) => teamCell(r.teamId)},
      {key: 'w', label: 'W', width: '44px', num: true, cell: (r) => String(r.wins)},
      {key: 'l', label: 'L', width: '44px', num: true, cell: (r) => String(r.losses)},
      {key: 'back', label: 'Back', width: '56px', num: true, cell: (r) => r === lead ? '—' : String(lead.wins - r.wins)},
      {key: 'g', label: `Games ${gamesInfo}`, width: '96px', num: true, cell: (r) => `<span class="x-num" title="${record(r.gameWins, r.gameLosses)}">${record(r.gameWins, r.gameLosses)}</span>`},
      {key: 'st', label: 'Streak', width: '64px', cell: (r) => r.streak ? `<span aria-label="${r.streak[0] === 'W' ? 'Won' : 'Lost'} ${r.streak.slice(1)}">${esc(r.streak)}</span>` : '—'},
      {key: 'status', label: 'Status', width: '152px', cell: (r) => { const [k, i, w] = status(r, rows); return w ? fixChip(k, i, w) : ''; }},
    ];
    const name = divisionName(c, d);
    return `<section class="l-panel flush l-section" aria-labelledby="h-div-${c}${d}"><h2 id="h-div-${c}${d}">${esc(name)}</h2>${table<Row>({id: `std-${c}${d}`, cols, rows: L, minWidth: 560, rowClass: (r) => r.teamId === me ? 'cur' : '', label: `${name} standings`})}</section>`;
  }));
  const mine = rows.find((r) => r.teamId === me)!;
  const sub = `${seasonLine()} · you are ${record(mine.wins, mine.losses)}, ${ordinal(mine.divRank)} in the ${esc(divisionName(s.teams[me].conference, s.teams[me].division))}`;
  return head('Standings', sub) + `<div class="l-grid" style="--card-min:560px;grid-auto-rows:auto">${tables.join('')}</div>`;
}
const ordinal = (n: number): string => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

// ---------------------------------------------------------------- playoffs
function teamRow(id: TeamId | null, seed: number | null, wins: number | null, won: boolean | null): string {
  if (!id) return `<div><span class="x-seed"></span><span class="x-tbd">${seed === -1 ? 'Bye' : 'To be decided'}</span><span></span></div>`;
  const me = S().userTeamId;
  const t = S().teams[id];
  return `<div class="${id === me ? 'cur' : ''}"><span class="x-seed">${seed ?? ''}</span><span class="x-team">${teamLogo(t)}<span>${esc(t.name)}</span><span class="sr">${esc(teamName(id))}</span></span><b class="x-num" ${won === false ? 'style="opacity:.55"' : ''}>${wins ?? ''}</b></div>`;
}
function match(se: Series | null, a: [TeamId | null, number | null], b: [TeamId | null, number | null], watch = true): string {
  const wa = se && a[0] ? seriesScore(se, a[0])[0] : null, wb = se && b[0] ? seriesScore(se, b[0])[0] : null;
  const done = !!se?.winnerId;
  // every match box has the same footer so all boxes are one height (bye and unplayed included)
  const foot = se && se.games.length && watch
    ? `<div class="x-mfoot"><span class="x-small">${done ? 'Final' : 'In progress'}</span><a class="btn sm" href="#battle-${esc(se.id)}-1" aria-label="Watch ${esc(teamName(se.homeId))} vs ${esc(teamName(se.awayId))}">${ic('film')}Watch</a></div>`
    : `<div class="x-mfoot"><span class="x-small">${watch ? 'Not played' : 'Rests a week'}</span><span></span></div>`;
  return `<div class="x-match">${teamRow(a[0], a[1], se?.games.length ? wa : null, done ? se!.winnerId === a[0] : null)}${teamRow(b[0], b[1], se?.games.length ? wb : null, done ? se!.winnerId === b[0] : null)}${foot}</div>`;
}

function bracket(projected: boolean): string {
  const s = S();
  const pic = M.standings(s);
  const field = ([0, 1] as const).map((c) => {
    const seeds = pic.filter((r) => s.teams[r.teamId].conference === c && r.confSeed).sort((a, b) => a.confSeed! - b.confSeed!).map((r) => r.teamId);
    return {c, seeds};
  });
  const ps = projected ? [] : s.schedule.filter((x) => x.playoff && x.season === s.season);
  const find = (round: NonNullable<Series['playoff']>, c?: 0 | 1) => ps.find((x) => x.playoff === round && (c === undefined || s.teams[x.homeId].conference === c)) ?? null;
  // seeds of the real field come from the round-1/conference series themselves
  const seedOf = (c: 0 | 1, id: TeamId | null) => { if (!id) return null; const i = field[c].seeds.indexOf(id); return i >= 0 ? i + 1 : null; };
  const confCol = (c: 0 | 1) => {
    const [s1, s2, s3] = field[c].seeds;
    const r1 = find('round1', c), cf = find('conference', c);
    const r1a = r1?.homeId ?? s2, r1b = r1?.awayId ?? s3;
    const cfA = cf?.homeId ?? s1, cfB = cf?.awayId ?? r1?.winnerId ?? null;
    return {r1: match(r1, [r1a, seedOf(c, r1a)], [r1b, seedOf(c, r1b)]), bye: match(null, [s1, 1], [null, -1], false), cf: match(cf, [cfA, seedOf(c, cfA)], [cfB, seedOf(c, cfB)])};
  };
  const A = confCol(0), B = confCol(1);
  const fin = find('final');
  const champ = fin?.winnerId;
  const label = (c: 0 | 1) => `<span class="x-small">${c === 0 ? 'Conference 1' : 'Conference 2'}</span>`;
  return `<div class="l-panel flush"><div class="l-table-wrap x-bracket-wrap" tabindex="0" role="region" aria-label="${projected ? 'Projected bracket' : 'Indigo Plateau bracket'}"><div class="x-bracket">
    <div class="x-round"><span class="cap">Round 1 · week 15</span><div class="x-round-body">${label(0)}${A.bye}${A.r1}${label(1)}${B.bye}${B.r1}</div></div>
    <div class="x-round"><span class="cap">Conference finals · week 16</span><div class="x-round-body">${A.cf}${B.cf}</div></div>
    <div class="x-round"><span class="cap">Plateau final · week 17</span><div class="x-round-body">${match(fin, [fin?.homeId ?? null, null], [fin?.awayId ?? null, null])}</div></div>
    <div class="x-round"><span class="cap">Champion</span><div class="x-round-body"><div class="x-champ">${ic('trophy')}${champ ? `<b>${esc(teamName(champ))}</b>` : '<span>Indigo Plateau</span>'}</div></div></div>
  </div></div></div>`;
}

export function viewPlayoffs(): string {
  const s = S(), me = s.userTeamId;
  const started = s.schedule.some((x) => x.playoff && x.season === s.season);
  const rows = M.standings(s);
  if (started) {
    const mine = s.schedule.filter((x) => x.playoff && x.season === s.season && (x.homeId === me || x.awayId === me));
    const last = mine[mine.length - 1];
    const IN: Record<string, string> = {round1: 'first round', conference: 'conference final', final: 'Plateau final'};
    const sub = !mine.length ? 'You missed the Indigo Plateau this season.'
      : last.winnerId && last.winnerId !== me ? `Your run ended in the ${IN[last.playoff!]}.`
        : last.playoff === 'final' && last.winnerId === me ? 'You won the Indigo Plateau.' : `You are in the ${IN[last.playoff!]}.`;
    return head('Indigo Plateau', `Season ${s.season} · ${esc(sub)}`) +
      `<section class="l-section" aria-labelledby="h-br"><h2 id="h-br">Bracket</h2>${bracket(false)}<span class="x-small">Six clubs. The better division winner in each conference has a bye. Best of ${s.settings.seriesBestOf}; the final is best of ${s.settings.finalBestOf}.</span></section>`;
  }
  // picture during the season: per conference, seeds then the bubble
  const confTable = (c: 0 | 1) => {
    const L = rows.filter((r) => s.teams[r.teamId].conference === c)
      .sort((a, b) => (a.confSeed ?? 99) - (b.confSeed ?? 99) || b.wins - a.wins || (b.gameWins - b.gameLosses) - (a.gameWins - a.gameLosses));
    const cutWins = L[2]?.wins ?? 0;
    const cols: Col<Row>[] = [
      {key: 'seed', label: 'Seed', width: '64px', num: true, cell: (r) => r.confSeed ? String(r.confSeed) : '—'},
      {key: 'club', label: 'Club', width: '44%', cell: (r) => teamCell(r.teamId)},
      {key: 'wl', label: 'W–L', width: '72px', num: true, cell: (r) => record(r.wins, r.losses)},
      {key: 'g', label: `Games ${gamesInfo}`, width: '80px', num: true, cell: (r) => gamesDiff(r)},
      {key: 'st', label: 'Status', width: '152px', cell: (r) => {
        const st = status(r, rows);
        if (st[2] === 'Won division' || st[2] === 'Clinched spot' || st[2] === 'Eliminated') return fixChip(st[0], st[1], st[2]);
        if (r.confSeed === 1) return fixChip('growth', 'trophy', 'Bye');
        if (r.confSeed === 2) return fixChip('growth', 'check', 'Division lead');
        if (r.confSeed === 3) return fixChip('scout', 'check', 'Wild card');
        if (cutWins - r.wins <= 1) return fixChip('decline', 'alert', 'Bubble');
        return fixChip('league', 'clock', `${cutWins - r.wins} back`);
      }},
    ];
    return `<section class="l-panel flush l-section" aria-labelledby="h-pc-${c}"><h2 id="h-pc-${c}">Conference ${c + 1}</h2>${table<Row>({id: `pic-${c}`, cols, rows: L, minWidth: 520, rowClass: (r) => (r.teamId === me ? 'cur' : '') + (r.confSeed === 3 ? ' x-cut' : ''), label: `Conference ${c + 1} playoff picture`})}</section>`;
  };
  const mine = rows.find((r) => r.teamId === me)!;
  const sub = s.phase === 'preseason' || !rows.some((r) => r.wins + r.losses) ? 'No series played yet. Three clubs per conference make it.'
    : mine.confSeed ? `If the season ended today you would be the ${ordinal(mine.confSeed)} seed${mine.confSeed === 1 ? ' with a bye' : ''}.` : 'If the season ended today you would miss out.';
  return head('Playoff picture', esc(sub)) +
    `<div class="l-grid" style="--card-min:520px;grid-auto-rows:auto">${confTable(0)}${confTable(1)}</div>
    <section class="l-section" aria-labelledby="h-br"><h2 id="h-br">Bracket if the season ended today</h2>${bracket(true)}<span class="x-small">Per conference: two division winners and one wild card. The better division winner has a bye.</span></section>`;
}

// ---------------------------------------------------------------- schedule
function resultChip(se: Series, me: TeamId): string {
  if (!se.winnerId) return se.games.length ? fixChip('scout', 'clock', 'In progress') : '';
  const [w, l] = seriesScore(se, me);
  return se.winnerId === me ? fixChip('growth', 'check', `Won ${record(w, l)}`) : fixChip('health', 'x', `Lost ${record(w, l)}`);
}
function seriesActs(se: Series, label: string): string {
  if (!se.games.length) return '';
  return `<span class="l-cellacts"><a class="btn sm" href="#battle-${esc(se.id)}-1" aria-label="Watch ${esc(label)}">${ic('film')}Watch</a><button type="button" class="btn sm" data-fo="recap" data-series="${esc(se.id)}" aria-label="Recap ${esc(label)}">Recap</button></span>`;
}

export function viewSchedule(): string {
  const s = S(), me = s.userTeamId;
  const lens = (store.ui.schedLens as string) ?? 'mine';
  const season = s.schedule.filter((x) => x.season === s.season);
  if (!season.length) return head('Schedule', `Season ${s.season}`) + empty('No schedule yet', 'The schedule is drawn when the new season starts.');
  let body: string, sub: string;
  if (lens === 'week') {
    const weeks = [...new Set(season.map((x) => x.week))].sort((a, b) => a - b);
    const cur = Math.min(Math.max(s.week, weeks[0]), weeks[weeks.length - 1]);
    const wk = Math.min(Math.max((store.ui.schedWeek as number | undefined) ?? cur, weeks[0]), weeks[weeks.length - 1]);
    const rows = season.filter((x) => x.week === wk);
    const cols: Col<Series>[] = [
      {key: 'home', label: 'Home', width: '30%', cell: (x) => teamCell(x.homeId)},
      {key: 'away', label: 'Away', width: '30%', cell: (x) => teamCell(x.awayId)},
      {key: 'res', label: 'Result', width: '152px', cell: (x) => x.winnerId ? `<span class="x-team">${teamAbbr(x.winnerId)}<span>won ${record(...seriesScore(x, x.winnerId))}</span></span>` : '<span class="dash">—</span>'},
      {key: 'act', label: '', width: '240px', cell: (x) => seriesActs(x, `${teamName(x.homeId)} vs ${teamName(x.awayId)}`)},
    ];
    const wkName = (w: number) => w > s.settings.weeks ? PLAYOFF_LABEL[season.find((x) => x.week === w)?.playoff ?? 'round1'] : `Week ${w}`;
    const i = weeks.indexOf(wk);
    sub = `${wkName(wk)} · ${plural(rows.length, 'series', 'series')}`;
    body = `<div class="l-toolbar l-pad"><span class="l-row"><button type="button" class="btn sm" data-fo="schedweek" data-week="${weeks[i - 1] ?? wk}"${i <= 0 ? ' aria-disabled="true"' : ''} aria-label="Previous week">${ic('back')}</button><b class="x-wk">${esc(wkName(wk))}</b><button type="button" class="btn sm" data-fo="schedweek" data-week="${weeks[i + 1] ?? wk}"${i >= weeks.length - 1 ? ' aria-disabled="true"' : ''} aria-label="Next week">${ic('arrow')}</button></span><button type="button" class="btn sm" data-fo="schedweek" data-week="${cur}">This week</button></div>
      ${table<Series>({id: 'sched-week', cols, rows, minWidth: 640, rowClass: (x) => x.homeId === me || x.awayId === me ? 'cur' : '', label: `${wkName(wk)} series`})}`;
  } else {
    const mine = season.filter((x) => x.homeId === me || x.awayId === me).sort((a, b) => a.week - b.week);
    const cols: Col<Series>[] = [
      {key: 'wk', label: 'Wk', width: '56px', num: true, cell: (x) => x.playoff ? 'PO' : String(x.week)},
      {key: 'opp', label: 'Opponent', width: '34%', cell: (x) => teamCell(oppOf(x, me))},
      {key: 'where', label: 'Where', width: '72px', cell: (x) => x.homeId === me ? 'Home' : 'Away'},
      {key: 'strat', label: 'Strategy', width: '160px', cell: (x) => stratChip(s.teams[oppOf(x, me)].lineup.strategyId)},
      {key: 'res', label: 'Result', width: '152px', cell: (x) => resultChip(x, me) || (x.week === s.week && (s.phase === 'regular' || s.phase === 'playoffs') ? fixChip('scout', 'clock', 'This week') : '<span class="dash">—</span>')},
      {key: 'act', label: '', width: '240px', cell: (x) => seriesActs(x, `week ${x.week}`)},
    ];
    const left = mine.filter((x) => !x.winnerId && !x.playoff).length;
    sub = `Season ${s.season} · ${left ? `${plural(left, 'series', 'series')} left` : 'regular season complete'}`;
    body = table<Series>({id: 'sched-mine', cols, rows: mine, minWidth: 720, rowClass: (x) => x.week === s.week && !x.winnerId ? 'cur' : '', label: 'Your season'});
  }
  return head('Schedule', sub) + `<section class="l-panel flush" aria-label="Schedule">${lensTabs('schedLens', lens, [['mine', 'Your season'], ['week', 'League week']])}${body}</section>`;
}

// ---------------------------------------------------------------- history
interface Rec { label: string; who: string; mark: string; season: string; mine: boolean }
function records(): Rec[] {
  const s = S(), me = s.userTeamId;
  const all = Object.values(s.mons);
  const out: Rec[] = [];
  const best = <T>(xs: T[], v: (x: T) => number) => xs.reduce<{x: T; v: number} | null>((b, x) => { const n = v(x); return n > 0 && (!b || n > b.v) ? {x, v: n} : b; }, null);
  const lines = all.flatMap((m) => m.stats.map((l) => ({m, l})));
  const add = (label: string, b: {x: {m: Mon; l?: {season: number; teamId: TeamId}}; v: number} | null, unit: string, season: (x: {m: Mon; l?: {season: number}}) => string) => {
    if (b) out.push({label, who: monRef(b.x.m), mark: `${b.v} ${unit}`, season: season(b.x), mine: (b.x.l?.teamId ?? b.x.m.teamId) === me});
  };
  add('Most KOs, season', best(lines, (x) => x.l.kos), 'KOs', (x) => String(x.l!.season));
  add('Most series MVPs, season', best(lines, (x) => x.l.seriesMvps), 'MVPs', (x) => String(x.l!.season));
  add('Most hazards set, season', best(lines, (x) => x.l.hazardsSet), 'set', (x) => String(x.l!.season));
  const careers = all.map((m) => ({m, kos: m.stats.reduce((t, l) => t + l.kos, 0), from: m.stats[0]?.season, to: m.stats[m.stats.length - 1]?.season}));
  add('Most KOs, career', best(careers, (x) => x.kos), 'KOs', (x) => { const y = x as unknown as {from?: number; to?: number}; return y.from == null ? '—' : y.from === y.to ? String(y.from) : `${y.from}–${y.to}`; });
  const seasons = s.history.flatMap((h) => h.standings.map((st) => ({h, st})));
  const top = best(seasons, (x) => x.st.wins);
  if (top) out.push({label: 'Best record, season', who: teamCell(top.x.st.teamId), mark: record(top.x.st.wins, top.x.st.losses), season: String(top.x.h.season), mine: top.x.st.teamId === me});
  const titles = new Map<TeamId, number>();
  for (const h of s.history) titles.set(h.championId, (titles.get(h.championId) ?? 0) + 1);
  const most = [...titles].sort((a, b) => b[1] - a[1])[0];
  if (most) out.push({label: 'Most titles', who: teamCell(most[0]), mark: plural(most[1], 'title'), season: '—', mine: most[0] === me});
  return out;
}

export function viewHistory(): string {
  const s = S(), me = s.userTeamId;
  const hist = [...s.history].sort((a, b) => b.season - a.season);
  const latest = hist[0];
  const mvp = (h: typeof latest) => h.awards.find((a) => a.award === 'Indigo Plateau MVP') ?? h.awards.find((a) => a.award === 'MVP');
  const champs = hist.length ? table<typeof latest>({id: 'hist-champs', minWidth: 680, label: 'Champions by season', rowClass: (h) => h.championId === me ? 'cur' : '', rows: hist, cols: [
    {key: 'season', label: 'Season', width: '80px', num: true, cell: (h) => String(h.season), sort: (h) => h.season, desc: true},
    {key: 'champ', label: 'Champion', width: '32%', cell: (h) => teamCell(h.championId)},
    {key: 'runner', label: 'Runner-up', width: '32%', cell: (h) => teamCell(h.runnerUpId)},
    {key: 'mvp', label: 'Plateau MVP', width: '28%', cell: (h) => { const a = mvp(h); const m = a && s.mons[a.monId]; return m ? monRef(m) : '—'; }},
  ]}) : `<div class="l-pad">${empty('No champions yet', `The first Indigo Plateau ends after week 17 of season ${s.season}.`)}</div>`;
  const ORDER = ['MVP', 'Offensive Pokémon of the Year', 'Defensive Pokémon of the Year', 'Support Pokémon of the Year', 'Rookie of the Year', 'Comeback Pokémon of the Year', 'Indigo Plateau MVP'];
  const awards = latest ? ORDER.map((name) => {
    const a = latest.awards.find((x) => x.award === name);
    const m = a && s.mons[a.monId];
    return `<div class="l-card x-award"><span class="cap">${esc(name)}</span>${m ? monRef(m) : '<span class="dash">Not awarded</span>'}<span class="x-small">${a ? esc(teamName(a.teamId)) : '&nbsp;'}</span></div>`;
  }).join('') : '';
  const allLeague = latest ? (['All-League 1st Team', 'All-League 2nd Team'] as const).map((n) => {
    const ms = latest.awards.filter((a) => a.award === n).map((a) => s.mons[a.monId]).filter(Boolean);
    return `<div class="l-card"><span class="cap">${n}</span><ul class="l-wrap" aria-label="${n}">${ms.map((m) => `<li>${monRef(m)}</li>`).join('')}</ul></div>`;
  }).join('') : '';
  const hof = Object.values(s.mons).filter((m) => m.retired?.hallOfFame).sort((a, b) => b.fame - a.fame);
  const hofHtml = hof.length ? `<div class="l-grid" style="--card-min:260px">${hof.map((m) => {
    const sp = speciesOf(m);
    const yrs = m.stats.length ? `${m.stats[0].season}–${m.retired!.season}` : `retired ${m.retired!.season}`;
    const best = m.awards.find((a) => a.award === 'MVP') ?? m.awards[0];
    return `<div class="l-card x-hof">${spr(sp, 'md')}<div class="l-stack tight">${monRef(m, {icon: false})}<span class="x-small">${esc(yrs)} · ${plural(m.awards.length, 'award')}</span>${best ? fixChip('honour', 'trophy', `${best.award === 'MVP' ? 'MVP' : best.award.replace(' Pokémon of the Year', '')} ${best.season}`) : ''}</div></div>`;
  }).join('')}</div>` : empty('Nobody yet', 'Pokémon whose careers clear the bar enter the hall of fame when they retire.');
  const recs = records();
  const recTable = recs.length ? table<Rec>({id: 'hist-rec', minWidth: 600, label: 'League records', rows: recs, rowClass: (r) => r.mine ? 'cur' : '', cols: [
    {key: 'rec', label: 'Record', width: '34%', cell: (r) => esc(r.label)},
    {key: 'who', label: 'Holder', width: '34%', cell: (r) => r.who},
    {key: 'mark', label: 'Mark', width: '112px', num: true, cell: (r) => esc(r.mark)},
    {key: 'season', label: 'Season', width: '88px', num: true, cell: (r) => esc(r.season)},
  ]}) : `<div class="l-pad">${empty('No records yet', 'Records start with the first series.')}</div>`;
  // team history: the user's seasons
  const mine = hist.map((h) => {
    const st = h.standings.find((x) => x.teamId === me);
    const rank = h.standings.findIndex((x) => x.teamId === me) + 1;
    const finish = h.championId === me ? 'Champion' : h.runnerUpId === me ? 'Runner-up' : rank ? `${ordinal(rank)} overall` : '—';
    return {season: h.season, wl: st ? record(st.wins, st.losses) : '—', finish, champ: h.championId === me};
  });
  const teamHist = mine.length ? table<typeof mine[number]>({id: 'hist-team', minWidth: 420, label: 'Your seasons', rows: mine, cols: [
    {key: 'season', label: 'Season', width: '96px', num: true, cell: (r) => String(r.season)},
    {key: 'wl', label: 'W–L', width: '96px', num: true, cell: (r) => r.wl},
    {key: 'finish', label: 'Finish', width: 'auto', cell: (r) => r.champ ? fixChip('honour', 'trophy', r.finish) : esc(r.finish)},
  ]}) : `<div class="l-pad">${empty('First season', `Your ${esc(s.teams[me].name)} history starts when season ${s.season} ends.`)}</div>`;
  const sub = hist.length ? `${plural(hist.length, 'season')} played${titlesLine()}` : `Season ${s.season} is the first.`;
  return head('History', sub) +
    `<section class="l-panel flush l-section" aria-labelledby="h-ch"><h2 id="h-ch">Champions</h2>${champs}</section>
    ${latest ? `<section class="l-section" aria-labelledby="h-aw"><h2 id="h-aw">Season ${latest.season} awards</h2><div class="l-grid" style="--card-min:220px">${awards}</div><div class="l-grid" style="--card-min:320px;grid-auto-rows:auto">${allLeague}</div></section>` : ''}
    <section class="l-panel flush l-section" aria-labelledby="h-tm"><h2 id="h-tm">${esc(teamName(me))}</h2>${teamHist}</section>
    <section class="l-panel flush l-section" aria-labelledby="h-rc"><h2 id="h-rc">Records</h2>${recTable}</section>
    ${panel('hof', 'Hall of fame', hofHtml)}`;
}
function titlesLine(): string {
  const s = S(), me = s.userTeamId;
  const n = s.history.filter((h) => h.championId === me).length;
  return n ? ` · ${plural(n, 'title')} for you` : '';
}

// ---------------------------------------------------------------- wiring
export function afterLeague(): void {
  once('league', () => {
    document.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-fo]');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      if (b.dataset.fo === 'schedweek') { store.ui.schedWeek = +b.dataset.week!; notify(); document.querySelector<HTMLElement>(`[data-fo="schedweek"][data-week="${b.dataset.week}"]`)?.focus(); }
      if (b.dataset.fo === 'recap') {
        const se = S().schedule.find((x) => x.id === b.dataset.series);
        if (!se) return;
        openDialog({title: `${esc(teamName(se.homeId))} vs ${esc(teamName(se.awayId))}`, cap: se.playoff ? PLAYOFF_LABEL[se.playoff] : `Week ${se.week}`, body: seriesResult(se), wide: false});
      }
    });
  });
}
void C;
