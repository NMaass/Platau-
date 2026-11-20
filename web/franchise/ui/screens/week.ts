// Home / This week: the hero (lineup step, then Watch week / Sim week), this week's opponent,
// Before you play, last week's results (series MVP + summary + replay links), since last week feed.
// Also the scouting report (#opponent), where weekly scouting points narrow the opponent's ratings.
import {strategyLook} from '../../model/strategies.ts';
import type {Series, TeamId, InboxItem, LeagueState} from '../../types.ts';
import type {Advisory} from '../../model/advisories.ts';
import {FA_ROUNDS} from '../../model/freeagency.ts';
import {REVEAL_BATTLES} from '../../model/scouting.ts';
import {ROLE_LABEL} from '../../catalog/roles.ts';
import {esc, ic, record} from '../dom.ts';
import {C, S, act, fastSim} from '../store.ts';
import {M, api} from '../model.ts';
import {head, itemList, panel, empty} from '../components/page.ts';
import {eventChip, roleBadge, rangeBadge} from '../components/badges.ts';
import {monRef, monName, speciesOf, team, teamName, teamAbbr} from '../components/mon.ts';
import {once} from '../components/front.ts';
import {spr, teamLogo} from '../sprites.ts';
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

/** The user's next series: this week's, or week 1's during the preseason. */
function nextSeries(): Series | null {
  const s = S(), me = s.userTeamId;
  return M.userSeries(s) ?? (s.phase === 'preseason' ? s.schedule.find((x) => x.season === s.season && x.week === 1 && (x.homeId === me || x.awayId === me)) ?? null : null);
}

/** Plain-English scouting status of the opponent's likely starters (digits throughout). */
export function scoutLine(opp: TeamId): string {
  const s = S(), c = C(), me = s.userTeamId;
  const lu = M.likelyLineup(c, s, opp);
  const known = lu.filter((x) => M.knownRating(c, s, me, s.mons[x.monId]).exact).length, n = lu.length;
  if (!n) return 'No likely starters to scout.';
  if (known === n) return `You know all ${n} of their likely starters' ratings.`;
  if (!known) return `You haven't scouted their ${n} likely starters. Their ratings show as ranges until you do.`;
  return `You know ${known} of their ${n} likely starters' ratings. Scout the other ${n - known} to see them exactly.`;
}

/** The "this week" opponent card (Home right column). */
function opponentCard(): string {
  const s = S();
  const se = nextSeries();
  if (!se) return panel('opp', 'No series this week', `<p class="muted">${esc(phaseLabel(s.phase))}: no games until next season.</p>`);
  const opp = oppOf(se, s.userTeamId), t = team(opp);
  const st = M.standings(s).find((x) => x.teamId === opp);
  const lu = M.likelyLineup(C(), s, opp);
  const ace = lu.map((x) => s.mons[x.monId]).sort((a, b) => M.bestRole(C(), s, b).ovr - M.bestRole(C(), s, a).ovr)[0];
  const home = se.homeId === s.userTeamId;
  const when = s.phase === 'preseason' ? 'Week 1 opponent' : "This week's opponent";
  return `<section class="l-panel l-section" aria-labelledby="h-opp">
    <div class="opp-h">${spr(ace ? speciesOf(ace) : null, 'md')}<div><span class="cap">${when}</span><h2 id="h-opp" class="x-team">${teamLogo(t)}<span>${esc(teamName(opp))}</span></h2><p class="muted">${record(st?.wins ?? 0, st?.losses ?? 0)} · ${esc(strategyLook(t.lineup.strategyId).says)} · ${home ? 'home' : 'away'}</p></div></div>
    <div class="l-facts">
      <div><span class="cap">Series · best of ${se.bestOf}</span>${pips(se)}</div>
      <div><span class="cap">Likely team</span>${likelyTeam(opp)}</div>
      <div><span class="cap">Scouting</span><p>${esc(scoutLine(opp))}</p></div>
      <div><span class="cap">Last met</span><p>${esc(lastMet(opp))}</p></div>
      <div class="l-actions"><a class="btn" href="#opponent">${ic('scout')}Scouting report</a></div>
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
  if (!mine) return '';  // nothing played yet: no empty panel (the hero and the opponent fill the page)
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

// ---------------------------------------------------------------- hero (the week's call to action)
export type PlayMode = 'watch' | 'sim' | 'step';
const LINEUP_KINDS = new Set(['lineup', 'injury']);
/** One xl hero button: icon, label, one-line hint. A disabled one keeps its place and says why in a peek. */
function xl(o: {label: string; hint: string; icon: string; go?: boolean; act?: string; mode?: PlayMode; href?: string; why?: string}): string {
  const inner = `${ic(o.icon)}<span>${esc(o.label)}</span><small>${esc(o.why ?? o.hint)}</small>`;
  if (o.why) return `<button class="btn xl peek" type="button" aria-disabled="true" aria-label="${esc(o.label)}: ${esc(o.why)}">${inner}<span class="pop"><strong>${esc(o.label)}</strong><span>${esc(o.why)}.</span></span></button>`;
  if (o.href) return `<a class="btn xl${o.go ? ' go' : ''}" href="${esc(o.href)}">${inner}</a>`;
  return `<button class="btn xl${o.go ? ' go' : ''}" type="button" data-act="${o.act ?? 'play'}"${o.mode ? ` data-mode="${o.mode}"` : ''}>${inner}</button>`;
}
const step = (n: number, label: string, body: string, state: '' | 'done' | 'todo' = ''): string =>
  `<div class="step${state ? ' is-' + state : ''}"><span class="cap"><b>${state === 'done' ? ic('check') : n}</b>${esc(label)}</span>${body}</div>`;

/** What the single hero button does outside game weeks. */
function phaseStep(s: LeagueState): {label: string; hint: string} {
  switch (s.phase) {
    case 'preseason': return {label: 'Start season', hint: `Little Cup for rookies, then week 1`};
    case 'awards': return {label: 'Close the season', hint: 'Retirements, then the draft lottery'};
    case 'draft-lottery': return {label: 'Open the draft', hint: 'The lottery set the pick order'};
    case 'draft': return {label: 'Finish the draft', hint: 'Auto-picks any picks you still own'};
    case 'resign': return {label: 'Open free agency', hint: 'Unsigned Pokémon become free agents'};
    case 'free-agency': {
      const r = (s.faRound ?? 0) + 1, last = r >= FA_ROUNDS;
      return {label: last ? `Start season ${s.season + 1}` : `Free agency round ${r + 1}`, hint: last ? 'Last round of signings, then the preseason' : `Round ${r} of ${FA_ROUNDS} of signings`};
    }
    default: return {label: 'Next', hint: ''};
  }
}

/** Lineup status for step 1: ready, or how many things need a look. */
function lineupState(adv: Advisory[]): {ok: boolean; text: string} {
  const s = S(), c = C(), L = s.teams[s.userTeamId].lineup;
  const issues = adv.filter((a) => LINEUP_KINDS.has(a.kind) && a.id !== 'roster');
  if (issues.length) return {ok: false, text: issues.length === 1 ? issues[0].text : `${issues.length} things to fix, listed below`};
  const ovrs = L.slots.map((sl) => sl.monId ? M.roleRating(c, s, s.mons[sl.monId], sl.role) : null).filter((x): x is number => x != null);
  const avg = ovrs.length ? Math.round(ovrs.reduce((a, b) => a + b, 0) / ovrs.length) : 0;
  return {ok: true, text: `${L.auto ? 'Auto lineup' : 'Your lineup'} · ${strategyName(L.strategyId)} · starters average ${avg}`};
}

function hero(se: Series | null, adv: Advisory[]): string {
  const s = S();
  const games = s.phase === 'regular' || s.phase === 'playoffs';
  const lu = lineupState(adv);
  const lineupStep = step(1, lu.ok ? 'Lineup ready' : 'Lineup needs a look', `<div class="l-hero-acts">${xl({label: 'Set lineup', hint: lu.text, icon: 'lineup', href: '#lineup', go: !lu.ok})}</div>`, lu.ok ? 'done' : 'todo');
  let play: string;
  if (s.draft?.startup && s.phase === 'draft') {
    return `<section class="l-panel l-hero" aria-label="Next step">${step(1, 'Startup draft', `<div class="l-hero-acts">${xl({label: 'Go to the draft board', hint: 'Every club drafts 18 Pokémon from one board', icon: 'scout', href: '#draft', go: true})}</div>`)}</section>`;
  }
  if (games && se) {
    const why = fastSim() ? 'Fast sim keeps no replays' : undefined;
    play = step(2, `Play week ${s.week}`, `<div class="l-hero-acts" style="--n:2">
      ${xl({label: 'Watch week', hint: 'Your games as replays', icon: 'film', mode: 'watch', go: lu.ok, why})}
      ${xl({label: 'Sim week', hint: 'Straight to the results', icon: 'play', mode: 'sim', go: lu.ok})}</div>`);
  } else if (games) {
    play = step(2, `Week ${s.week}`, `<div class="l-hero-acts">${xl({label: `Sim week ${s.week}`, hint: 'Your club has no series this week', icon: 'play', mode: 'sim', go: true})}</div>`);
  } else {
    const p = phaseStep(s);
    const body = s.phase === 'draft'
      ? `<div class="l-hero-acts" style="--n:2">${xl({label: 'Draft board', hint: 'Make your picks', icon: 'scout', href: '#draft'})}${xl({label: p.label, hint: p.hint, icon: 'play', mode: 'step', go: true})}</div>`
      : `<div class="l-hero-acts">${xl({label: p.label, hint: p.hint, icon: 'play', mode: 'step', go: true})}</div>`;
    if (s.phase !== 'preseason') return `<section class="l-panel l-hero" aria-label="Next step">${step(1, phaseLabel(s.phase), body)}</section>`;
    play = step(2, phaseLabel(s.phase), body);
  }
  return `<section class="l-panel l-hero" aria-label="Next step">${lineupStep}${play}</section>`;
}

export function viewWeek(): string {
  const s = S(), c = C();
  const se = M.userSeries(s);
  const adv = M.advisories(c, s);
  const opp = se ? oppOf(se, s.userTeamId) : null;
  const title = s.phase === 'regular' ? `Week ${s.week}` : s.draft?.startup && s.phase === 'draft' ? 'Startup draft' : phaseLabel(s.phase);
  const PO: Record<string, string> = {round1: 'Round 1', conference: 'Conference final', final: 'Plateau final'};
  const sub = se && opp ? `${se.playoff ? PO[se.playoff] : `of ${s.settings.weeks}`} · ${se.homeId === s.userTeamId ? 'vs' : 'at'} ${esc(teamName(opp))} · best of ${se.bestOf}` : `Season ${s.season}`;
  // one lineup problem is already spelled out on the hero's Set lineup button
  const lineupRows = adv.filter((a) => LINEUP_KINDS.has(a.kind) && a.id !== 'roster');
  const rows = adv.filter((a) => a.kind !== 'scout' && (lineupRows.length > 1 || !lineupRows.includes(a)));
  const before = rows.length ? panel('adv', 'Before you play', itemList(rows.map((a) => ({
    chip: eventChip(ADV[a.kind][0], ADV[a.kind][1], a.label),
    text: esc(a.text),
    action: `<a class="btn sm" href="${esc(a.action.route)}">${esc(a.action.label)} ${ic('arrow')}</a>`,
  })), {label: 'Before you play'})) : '';
  return head(title, sub) + `<div class="l-cols side-first">
    ${hero(se, adv)}
    ${opponentCard()}
    ${before}
    ${lastWeek()}
    ${feed()}
  </div>`;
}

// ---------------------------------------------------------------- scouting report (#opponent)
/** Scout buttons for one opponent Pokémon: 1 point narrows its rating, 5 (in total) reveal it. */
function scoutActs(monId: string, exact: boolean): string {
  const s = S(), me = s.userTeamId, m = s.mons[monId];
  if (exact) return `<span class="chip c-growth">${ic('check')}Rating known</span>`;
  const left = s.teams[me].scoutingPoints, cost = s.settings.scoutCost;
  const full = Math.max(cost, s.settings.fullScoutCost - (m.scouting?.[me] ?? 0));
  const dis = (n: number) => left < n ? ` aria-disabled="true"` : '';
  return `<span class="l-cellacts"><button type="button" class="btn sm" data-scout="${esc(monId)}"${dis(cost)} aria-label="Scout ${esc(monName(m))} for ${cost} point">${ic('scout')}Scout · ${cost}</button><button type="button" class="btn sm" data-scout="${esc(monId)}" data-full="1"${dis(full)} aria-label="Learn ${esc(monName(m))}'s exact rating for ${full} points">Exact · ${full}</button></span>`;
}

export function viewOpponent(): string {
  const s = S(), c = C(), me = s.userTeamId;
  once('scout-opp', () => document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-scout]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    act((st, cat) => { api.scoutMon(cat, st, st.userTeamId, b.dataset.scout!, b.dataset.full === '1'); });
    document.querySelector<HTMLElement>(`[data-scout="${b.dataset.scout}"]${b.dataset.full ? '[data-full]' : ':not([data-full])'}`)?.focus();
  }));
  const se = nextSeries();
  if (!se) return head('Scouting report', 'No series this week') + empty('No opponent', 'There is no series to scout right now.', `<a class="btn" href="#week">Back to This week</a>`);
  const opp = oppOf(se, me), t = team(opp);
  const st = M.standings(s).find((x) => x.teamId === opp);
  const lu = M.likelyLineup(c, s, opp);
  const cards = Array.from({length: 6}, (_, i) => {
    const x = lu[i];
    if (!x) return `<article class="l-card scout-card"><h3 class="l-card-title">Unknown</h3><div class="l-empty">Not enough film on this slot.</div></article>`;
    const m = s.mons[x.monId], sp = speciesOf(m);
    const kr = M.knownRating(c, s, me, m);
    const set = sp?.sets.find((z) => z.id === (t.lineup.slots[i]?.setId ?? m.setId)) ?? sp?.sets[0];
    return `<article class="l-card scout-card"><h3 class="l-card-title">${esc(ROLE_LABEL[x.role])}</h3>
      <div class="slot-mon">${spr(sp)}<div class="l-stack tight">${monRef(m, {icon: false})}${kr.exact ? roleBadge(x.role, M.roleRating(c, s, m, x.role) ?? kr.hi, {full: true}) : rangeBadge(x.role, kr.lo, kr.hi, {full: true})}</div></div>
      <ul class="moves" aria-label="Likely moves">${(set?.moves ?? []).concat(['', '', '', '']).slice(0, 4).map((mv) => `<li>${esc(mv) || '<span class="dash">—</span>'}</li>`).join('')}</ul>
      <p class="x-small">${esc([set?.item, set?.ability].filter(Boolean).join(' · '))}</p>
      <div class="scout-acts">${scoutActs(m.id, kr.exact)}</div></article>`;
  }).join('');
  const recent = s.schedule.filter((x) => x.winnerId && (x.homeId === opp || x.awayId === opp)).slice(-3).reverse().map((x) => {
    const [w, l] = seriesScore(x, opp);
    return `<li><span class="chip ${w > l ? 'c-growth' : 'c-health'}">${w > l ? 'Won' : 'Lost'} ${record(w, l)}</span><span>Week ${x.week} ${x.homeId === opp ? 'vs' : 'at'} ${esc(teamName(oppOf(x, opp)))}</span><span></span></li>`;
  }).join('');
  const pts = s.teams[me].scoutingPoints;
  const intro = `<p>${esc(scoutLine(opp))}</p><p class="muted">You have <b>${pts}</b> scouting ${pts === 1 ? 'point' : 'points'} left this week (shared with the draft class). ${s.settings.scoutCost} point narrows a rating; ${s.settings.fullScoutCost} in total show it exactly. A Pokémon's rating is known to everyone after ${REVEAL_BATTLES} battles.</p>`;
  return `<a class="back" href="#week">${ic('back')}This week</a>` + head(`<span class="x-team">${teamLogo(t)}<span>${esc(teamName(opp))}</span></span>`, `Scouting report · ${record(st?.wins ?? 0, st?.losses ?? 0)} · ${esc(strategyLook(t.lineup.strategyId).says)}`, `<a class="btn" href="#lineup">Set lineup ${ic('arrow')}</a>`) +
    panel('likely', 'Likely team', `${intro}<div class="l-grid scout-grid">${cards}</div>`) +
    panel('recent', 'Recent results', recent ? `<ul class="l-list top recent">${recent}</ul>` : `<p class="muted">No results yet.</p>`);
}
