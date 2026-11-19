// Home / This week: Before you play, this week's series card, last week's results
// (series MVP + template summary + replay links), since last week feed.
import type {Series, TeamId, InboxItem, Mon, LeagueState} from '../../types.ts';
import {ROLE_LABEL} from '../../catalog/roles.ts';
import {esc, ic, record, listJoin} from '../dom.ts';
import {C, S} from '../store.ts';
import {M} from '../model.ts';
import {head, itemList, panel, empty, type Item} from '../components/page.ts';
import {eventChip, roleBadge, rangeBadge} from '../components/badges.ts';
import {monRef, monBadge, monName, speciesOf, team, teamName, teamAbbr} from '../components/mon.ts';
import {openDialog} from '../components/layer.ts';
import {spr, ico, teamLogo} from '../sprites.ts';
import {strategies} from '../model.ts';
import {phaseLabel} from '../shell.ts';

const ADV: Record<string, [string, string]> = {
  injury: ['health', 'health'], lineup: ['decline', 'alert'], offer: ['deal', 'deal'], scout: ['scout', 'scout'], contract: ['deal', 'deal'],
};
const FEED_WORD: Record<InboxItem['category'], string> = {health: 'Health', growth: 'Growth', decline: 'Decline', deal: 'Deal', league: 'League', honour: 'Honour', scout: 'Scouting'};
const FEED: Record<InboxItem['category'], string> = {health: 'health', growth: 'up', decline: 'alert', deal: 'deal', league: 'trophy', honour: 'star', scout: 'scout'};

export const oppOf = (se: Series, me: TeamId): TeamId => se.homeId === me ? se.awayId : se.homeId;
export function seriesScore(se: Series, id: TeamId): [number, number] {
  const w = se.games.filter((g) => g.winnerTeamId === id).length;
  return [w, se.games.length - w];
}
export const strategyName = (id: string): string => strategies().find((x) => x.id === id)?.name ?? id;

/** Six slots of the opponent's likely team; empty slots keep their space. */
export function likelyTeam(teamId: TeamId, cls = 'l-wrap'): string {
  const c = C(), s = S();
  const lu = M.likelyLineup(c, s, teamId);
  const cells = Array.from({length: 6}, (_, i) => {
    const x = lu[i];
    if (!x) return `<li><span class="ref"><span class="ico"></span><span class="nm dash">Unknown</span></span></li>`;
    return `<li>${monRef(s.mons[x.monId])}</li>`;
  });
  return `<ul class="${cls}" aria-label="Likely team">${cells.join('')}</ul>`;
}

function pips(se: Series | null): string {
  const me = S().userTeamId;
  const n = se?.bestOf ?? 3;
  return `<span class="pips">${Array.from({length: n}, (_, i) => {
    const g = se?.games[i];
    if (!g) return `<i>${i + 1}</i>`;
    const w = g.winnerTeamId === me;
    return `<i class="${w ? 'w' : 'l'}">${w ? 'W' : 'L'}</i>`;
  }).join('')}</span>`;
}

function lastMet(opp: TeamId): string {
  const s = S(), me = s.userTeamId;
  const se = [...s.schedule].reverse().find((x) => x.winnerId && ((x.homeId === me && x.awayId === opp) || (x.awayId === me && x.homeId === opp)));
  if (!se) return 'First meeting';
  const [w, l] = seriesScore(se, me);
  return `${w > l ? 'Won' : 'Lost'} ${record(w, l)}, week ${se.week}`;
}

/** The "this week" opponent card (Home right column). */
function opponentCard(se: Series | null): string {
  const s = S();
  if (!se) return panel('opp', 'No series this week', `<p class="muted">${esc(phaseLabel(s.phase))}. Play advances the calendar.</p>`);
  const opp = oppOf(se, s.userTeamId), t = team(opp);
  const st = M.standings(s).find((x) => x.teamId === opp);
  const lu = M.likelyLineup(C(), s, opp);
  const ace = lu.map((x) => s.mons[x.monId]).sort((a, b) => M.bestRole(C(), s, b).ovr - M.bestRole(C(), s, a).ovr)[0];
  const home = se.homeId === s.userTeamId;
  return `<section class="l-panel l-section" aria-labelledby="h-opp">
    <div class="opp-h">${spr(ace ? speciesOf(ace) : null, 'md')}<div><span class="cap">This week's opponent</span><h2 id="h-opp" class="x-team">${teamLogo(t)}<span>${esc(teamName(opp))}</span></h2><p class="muted">${record(st?.wins ?? 0, st?.losses ?? 0)} · plays ${esc(strategyName(t.lineup.strategyId))} · ${home ? 'home' : 'away'}</p></div></div>
    <div class="l-facts">
      <div><span class="cap">Series · best of ${se.bestOf}</span>${pips(se)}</div>
      <div><span class="cap">Likely team</span>${likelyTeam(opp)}</div>
      <div><span class="cap">Last met</span><p>${esc(lastMet(opp))}</p></div>
      <div class="l-actions"><a class="btn" href="#opponent">Scouting report ${ic('arrow')}</a></div>
    </div>
  </section>`;
}

/** Result block for a finished series: score, game list with replay links, MVP, summary. Used on Home and in the play dialog. */
export function seriesResult(se: Series, o: {headless?: boolean} = {}): string {
  const s = S(), me = s.userTeamId;
  const mine = se.homeId === me || se.awayId === me;
  const a = mine ? me : se.homeId, b = oppOf(se, a);
  const [w, l] = seriesScore(se, a);
  const mvp = se.mvpMonId ? s.mons[se.mvpMonId] : null;
  const mvpKos = mvp ? se.games.reduce((t, g) => t + (g.box[mvp.id]?.kos ?? 0), 0) : 0;
  const games = se.games.map((g, i) => {
    const won = g.winnerTeamId === a;
    const left = (t: TeamId) => Object.values(g.box).filter((x) => x.teamId === t && x.played && !x.fainted).length;
    const la = left(a), lb = left(b);
    return `<li><span class="cap">Game ${i + 1}</span><span class="chip ${won ? 'c-growth' : 'c-health'}" title="Pokémon left standing">${ic(won ? 'check' : 'x')}${won ? 'Won' : 'Lost'} ${la}–${lb}</span><span class="l-clamp" style="--lines:2">${esc(g.summary || '')}</span><a class="btn sm" href="#battle-${esc(se.id)}-${i + 1}" aria-label="Watch game ${i + 1}">${ic('film')}Watch</a></li>`;
  }).join('');
  return `${o.headless ? '' : ''}<div class="score"><span>${esc(teamName(a))}</span><b>${record(w, l)}</b><span>${esc(teamName(b))}</span></div>
    <ol class="l-list top games" aria-label="Game by game">${games}</ol>
    ${mvp ? `<div class="mvp">${spr(speciesOf(mvp), 'md')}<div><span class="cap">Series MVP</span><b>${monRef(mvp, {icon: false})}</b><span class="muted">${mvpKos} KOs across ${se.games.length} games · ${esc(teamName(mvp.teamId!))}</span></div></div>` : ''}
    ${se.summary ? `<p class="l-clamp" style="--lines:2">${esc(se.summary)}</p>` : ''}`;
}

function lastWeek(): string {
  const s = S(), me = s.userTeamId;
  // the user's most recent played series this season (in the playoffs and offseason that can be weeks back)
  const mine = [...s.schedule].reverse().find((x) => x.season === s.season && x.games.length && (x.homeId === me || x.awayId === me) && (x.week < s.week || (s.phase !== 'regular' && s.phase !== 'playoffs')));
  if (!mine) return panel('last', 'Last week', `<p class="muted">No games played yet this season.</p>`);
  const prev = s.schedule.filter((x) => x.season === s.season && x.week === mine.week);
  const others = prev.filter((x) => x !== mine && x.winnerId);
  const around = others.map((x) => {
    const [w, l] = seriesScore(x, x.winnerId!);
    const lose = oppOf(x, x.winnerId!);
    return `<li>${teamAbbr(x.winnerId!)}<span class="muted">beat</span>${teamAbbr(lose)}<b>${record(w, l)}</b><a class="btn sm" href="#battle-${esc(x.id)}-1">Watch</a></li>`;
  }).join('');
  return panel('last', mine.week === s.week - 1 ? `Last week · week ${mine.week}` : `Last series · week ${mine.week}`, `${seriesResult(mine)}
    <details class="around"><summary class="cap">Around the league</summary><ul class="l-list results">${around}</ul></details>`);
}

function feed(): string {
  const s = S();
  // newest first, only what arrived since the last week was played
  const items = [...s.inbox].reverse().filter((it) => it.season === s.season && it.week >= s.week - 1).slice(0, 6);
  if (!items.length) return '';
  return panel('feed', 'Since last week', itemList(items.map((it) => ({
    chip: eventChip(it.category, FEED[it.category], FEED_WORD[it.category]),
    text: `<b>${esc(it.title)}</b> ${esc(it.body)}`,
    action: `<span class="when">Wk ${it.week}</span>`,
  })), {cls: 'feed'}));
}

// ---------------------------------------------------------------- practice focus
const FOCUS_MAX = 3;
const focusable = (): Mon[] => Object.values(S().mons).filter((m) => m.teamId === S().userTeamId).filter((m) => !m.injury || m.injury.kind === 'day-to-day');
/** "Before you play" row: who gets extra practice XP this week (2–3 picks). Always the last row. */
function practiceItem(): Item {
  const s = S(), picks = (s.teams[s.userTeamId].practiceFocus ?? []).map((id) => s.mons[id]).filter(Boolean);
  const text = picks.length ? `Extra XP for ${listJoin(picks.map((m) => esc(monName(m))))}. Everyone healthy gets base XP.` : 'Pick up to 3 Pokémon for extra XP this week. Everyone healthy gets base XP.';
  return {chip: eventChip('growth', 'up', 'Practice'), text, action: `<button class="btn sm" type="button" data-act="focus">Choose ${ic('arrow')}</button>`};
}
/** Dialog: toggle up to 3 Pokémon, then save with setPracticeFocus. */
export function openFocus(onSave: (ids: string[]) => void): void {
  const s = S(), cur = new Set(s.teams[s.userTeamId].practiceFocus ?? []);
  const order = {practice: 0, backup: 1, active: 2, ir: 3} as Record<string, number>;
  const list = focusable().sort((a, b) => (order[a.tier] - order[b.tier]) || a.age - b.age);
  const row = (m: Mon) => `<li><button type="button" data-pick="${esc(m.id)}" aria-pressed="${cur.has(m.id)}">${ico(speciesOf(m))}<span><span class="nm">${esc(monName(m))}</span><span class="where">${esc(TIER_WORD[m.tier] ?? m.tier)} · age ${m.age}</span></span>${monBadge(m, null, {sm: true, noPeek: true})}</button></li>`;
  const cap = () => `${cur.size} of ${FOCUS_MAX} picked`;
  const d = openDialog({title: 'Practice focus', cap: cap(), body: `<p class="muted">Extra XP this week for up to ${FOCUS_MAX} picks.</p><ul class="chooser" role="list">${list.map(row).join('')}</ul>`,
    actions: [{key: 'close', label: 'Cancel'}, {key: 'save', label: 'Save', go: true}],
    onAction: (k) => { if (k === 'save') onSave([...cur]); }});
  d.querySelector('[data-body]')!.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-pick]');
    if (!b) return;
    const id = b.dataset.pick!;
    if (cur.has(id)) cur.delete(id); else if (cur.size < FOCUS_MAX) cur.add(id); else return;
    b.setAttribute('aria-pressed', String(cur.has(id)));
    const c = d.querySelector('.l-dialog-head .cap'); if (c) c.textContent = cap();
  });
}
// ---------------------------------------------------------------- play until
export type Until = 'week' | 'deadline' | 'regular' | 'plateau' | 'draft';
export const UNTIL: {key: Until; label: string; done: string}[] = [
  {key: 'week', label: 'Next week', done: 'the next week'}, {key: 'deadline', label: 'Trade deadline', done: 'the trade deadline'},
  {key: 'regular', label: 'End of regular season', done: 'the end of the regular season'},
  {key: 'plateau', label: 'Indigo Plateau', done: 'the end of the Indigo Plateau'}, {key: 'draft', label: 'Draft', done: 'the draft'},
];
const PHASES = ['preseason', 'regular', 'playoffs', 'awards', 'draft-lottery', 'draft', 'resign', 'free-agency'];
/** A point on the calendar as one number, so "have we reached it" is a comparison. */
export const calendarPos = (s: LeagueState): number => {
  const ph = PHASES.indexOf(s.phase);
  return s.season * 10000 + ph * 100 + (ph === 1 || ph === 2 ? s.week : 0);
};
/** Where a "Play until" stop is from here: target position (null = not selectable now) and a one-line description.
 *  Never plays through the draft (the user's picks); from re-signing on, stops refer to next season. */
export function untilState(s: LeagueState, u: Until): {target: number | null; text: string} {
  const ph = PHASES.indexOf(s.phase), dl = s.settings.tradeDeadlineWeek;
  const next = ph >= 6, season = next ? s.season + 1 : s.season, when = next ? ' next season' : '';
  const at = (p: number, w = 0) => season * 10000 + p * 100 + w;
  if (u === 'week') return {target: -1, text: s.phase === 'regular' || s.phase === 'playoffs' ? 'Play one week' : 'Move on one step'};
  if (ph === 5) return {target: null, text: 'Finish the draft first'};
  const pos = calendarPos(s);
  const t = u === 'deadline' ? at(1, dl) : u === 'regular' ? at(2, 0) : u === 'plateau' ? at(3) : at(5);
  const ok = t > pos;
  const text = u === 'deadline' ? (ok ? `Stops at week ${dl}${when}, the last week trades are open` : 'Already past the deadline this season')
    : u === 'regular' ? (ok ? `Stops when the Indigo Plateau field is set${when}` : 'The regular season is over')
    : u === 'plateau' ? (ok ? `Plays the Indigo Plateau through the final${when}` : 'The Indigo Plateau is over')
    : (ok ? `Awards, retirements and the lottery${when}, then stops at the draft` : 'The draft has started');
  return {target: ok ? t : null, text};
}

const TIER_WORD: Record<string, string> = {active: 'Active', backup: 'Backup', practice: 'Practice squad', ir: 'Injured reserve'};

export function viewWeek(): string {
  const s = S(), c = C();
  const se = M.userSeries(s);
  const adv = M.advisories(c, s);
  const opp = se ? oppOf(se, s.userTeamId) : null;
  const playLabel = se ? `Play week ${s.week}` : s.phase === 'regular' || s.phase === 'playoffs' ? 'Play week' : 'Continue';
  const actions = `<a class="btn" href="#lineup">Set lineup ${ic('arrow')}</a><button class="btn" type="button" data-act="until">Play until…</button><button class="btn go" type="button" data-act="play">${ic('play')}${esc(playLabel)}</button>`;
  const title = s.phase === 'regular' ? `Week ${s.week}` : s.draft?.startup && s.phase === 'draft' ? 'Startup draft' : phaseLabel(s.phase);
  const PO: Record<string, string> = {round1: 'Round 1', conference: 'Conference final', final: 'Plateau final'};
  const sub = se && opp ? `${se.playoff ? PO[se.playoff] : `of ${s.settings.weeks}`} · ${se.homeId === s.userTeamId ? 'vs' : 'at'} ${esc(teamName(opp))} · best of ${se.bestOf}` : `Season ${s.season}`;
  const before = itemList([...adv.map((a) => ({
    chip: eventChip(ADV[a.kind][0], ADV[a.kind][1], a.label),
    text: esc(a.text),
    action: `<a class="btn sm" href="${esc(a.action.route)}">${esc(a.action.label)} ${ic('arrow')}</a>`,
  })), ...(s.draft?.startup && s.phase === 'draft' ? [{
    chip: eventChip('scout', 'scout', 'Draft'),
    text: 'The startup draft is on: every club drafts 18 Pokémon from one board.',
    action: `<a class="btn sm" href="#draft">Draft board ${ic('arrow')}</a>`,
  }] : [practiceItem()])], {label: 'Before you play'});
  return head(title, sub, actions) + `<div class="l-cols side-first">
    ${panel('adv', 'Before you play', before)}
    ${opponentCard(se)}
    ${lastWeek()}
    ${feed()}
  </div>`;
}

// ---------------------------------------------------------------- scouting report (#opponent)
export function viewOpponent(): string {
  const s = S(), c = C();
  const se = M.userSeries(s);
  if (!se) return head('Scouting report', 'No series this week') + empty('No opponent', 'There is no series to scout right now.', `<a class="btn" href="#week">Back to This week</a>`);
  const opp = oppOf(se, s.userTeamId), t = team(opp);
  const st = M.standings(s).find((x) => x.teamId === opp);
  const lu = M.likelyLineup(c, s, opp);
  const cards = Array.from({length: 6}, (_, i) => {
    const x = lu[i];
    if (!x) return `<article class="l-card scout-card"><h3 class="l-card-title">Unknown</h3><div class="l-empty">Not enough film on this slot.</div></article>`;
    const m = s.mons[x.monId], sp = speciesOf(m);
    const kr = M.knownRating(c, s, s.userTeamId, m);
    const set = sp?.sets.find((z) => z.id === (t.lineup.slots[i]?.setId ?? m.setId)) ?? sp?.sets[0];
    return `<article class="l-card scout-card"><h3 class="l-card-title">${esc(ROLE_LABEL[x.role])}</h3>
      <div class="slot-mon">${spr(sp)}<div class="l-stack tight">${monRef(m, {icon: false})}${kr.exact ? roleBadge(x.role, M.roleRating(c, s, m, x.role) ?? kr.hi, {full: true}) : rangeBadge(x.role, kr.lo, kr.hi, {full: true})}</div></div>
      <ul class="moves" aria-label="Likely moves">${(set?.moves ?? []).concat(['', '', '', '']).slice(0, 4).map((mv) => `<li>${esc(mv) || '<span class="dash">—</span>'}</li>`).join('')}</ul>
      <p class="x-small">${esc([set?.item, set?.ability].filter(Boolean).join(' · '))}</p></article>`;
  }).join('');
  const recent = s.schedule.filter((x) => x.winnerId && (x.homeId === opp || x.awayId === opp)).slice(-3).reverse().map((x) => {
    const [w, l] = seriesScore(x, opp);
    return `<li><span class="chip ${w > l ? 'c-growth' : 'c-health'}">${w > l ? 'Won' : 'Lost'} ${record(w, l)}</span><span>Week ${x.week} ${x.homeId === opp ? 'vs' : 'at'} ${esc(teamName(oppOf(x, opp)))}</span><span></span></li>`;
  }).join('');
  return `<a class="back" href="#week">${ic('back')}This week</a>` + head(`<span class="x-team">${teamLogo(t)}<span>${esc(teamName(opp))}</span></span>`, `Scouting report · ${record(st?.wins ?? 0, st?.losses ?? 0)} · plays ${esc(strategyName(t.lineup.strategyId))}`, `<a class="btn" href="#lineup">Set lineup ${ic('arrow')}</a>`) +
    panel('likely', 'Likely team', `<div class="l-grid scout-grid">${cards}</div>`) +
    panel('recent', 'Recent results', recent ? `<ul class="l-list top recent">${recent}</ul>` : `<p class="muted">No results yet.</p>`);
}

