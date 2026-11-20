// Trades: value model (value.ts), legality (deadline, rosters, cap), the AI's
// verdict with a meter score and a reason, AI offers to the user, AI-AI trades.
import type {Catalog, DraftPick, LeagueState, Mon, MonId, TeamId, TradeOffer} from '../types.ts';
import type {Rng} from './rng.ts';
import {monValue, pickValue, targetStrategies} from './value.ts';
import {capPayroll} from './cap.ts';
import {ROSTER, autoLineup, normalizeTiers, planLineup, removeFromLineup} from './lineup.ts';
import {logTx, monLabel, newId, rosterCount, teamMons} from './util.ts';
import {inbox} from './inbox.ts';
import {enforceRosters} from './roster.ts';
import {leagueRng} from './rng.ts';

export type TradeProposal = Omit<TradeOffer, 'id' | 'status' | 'expiresWeek'>;

/** The AI wants at least this edge (score, -100..100) to accept. */
export const ACCEPT_SCORE = 5;

const spName = (catalog: Catalog, state: LeagueState, id: MonId) => state.mons[id] ? monLabel(catalog, state, state.mons[id]) : id;
const samePick = (a: DraftPick, b: DraftPick) => a.season === b.season && a.round === b.round && a.originalTeamId === b.originalTeamId;

export function tradeWindowOpen(state: LeagueState): {open: boolean; reason: string} {
  if (state.phase === 'playoffs' || state.phase === 'awards') return {open: false, reason: 'Trades reopen after the Indigo Plateau'};
  if (state.phase === 'regular' && state.week > state.settings.tradeDeadlineWeek) return {open: false, reason: 'After the trade deadline'};
  return {open: true, reason: ''};
}

/** Structural checks for both sides. Returns a reason or ''. */
export function tradeProblem(catalog: Catalog, state: LeagueState, o: TradeProposal): string {
  const w = tradeWindowOpen(state);
  if (!w.open) return w.reason;
  if (o.fromTeamId === o.toTeamId) return 'Same club';
  if (!o.give.mons.length && !o.give.picks.length && !o.get.mons.length && !o.get.picks.length) return 'Empty trade';
  for (const id of o.give.mons) if (state.mons[id]?.teamId !== o.fromTeamId) return `${spName(catalog, state, id)} is not yours to trade`;
  for (const id of o.get.mons) if (state.mons[id]?.teamId !== o.toTeamId) return `${spName(catalog, state, id)} is not on their roster`;
  const owns = (t: TeamId, p: DraftPick) => state.teams[t].draftPicks.some(x => samePick(x, p));
  for (const p of o.give.picks) if (!owns(o.fromTeamId, p)) return 'You do not own that pick';
  for (const p of o.get.picks) if (!owns(o.toTeamId, p)) return 'They do not own that pick';
  const nonIr = (ids: MonId[]) => ids.filter(id => state.mons[id].tier !== 'ir').length;
  const inSeason = state.phase === 'regular' || state.phase === 'preseason';
  for (const [team, out, inc] of [[o.fromTeamId, o.give.mons, o.get.mons], [o.toTeamId, o.get.mons, o.give.mons]] as [TeamId, MonId[], MonId[]][]) {
    const after = rosterCount(teamMons(state, team)) - nonIr(out) + nonIr(inc);
    if (state.teams[team].human && inSeason && after > ROSTER) return 'Your roster would go over 18: release someone or add a Pokémon';
    const sal = (ids: MonId[]) => ids.reduce((s, id) => s + (state.mons[id].contract?.exception ? 0 : state.mons[id].contract?.salary ?? 0), 0);
    const before = capPayroll(state, team);
    const next = before - sal(out) + sal(inc);
    if (next > state.settings.cap && next > before) return `${state.teams[team].human ? 'You' : state.teams[team].name} would be over the cap`;
  }
  return '';
}

/** Value the receiving club (toTeamId) sees: what it gets (give) minus what it sends (get). */
export function tradeBalance(catalog: Catalog, state: LeagueState, o: TradeProposal, viewer: TeamId): {inValue: number; outValue: number} {
  const getsSide = viewer === o.toTeamId ? o.give : o.get;
  const sendsSide = viewer === o.toTeamId ? o.get : o.give;
  const v = (side: TradeProposal['give']) => side.mons.reduce((s, id) => s + monValue(catalog, state, state.mons[id], viewer), 0)
    + side.picks.reduce((s, p) => s + pickValue(state, p), 0);
  // a 2-for-1 costs the receiver a roster spot: charge the lowest player it would release
  const extra = getsSide.mons.length - sendsSide.mons.length;
  let roster = 0;
  if (extra > 0) {
    const vals = teamMons(state, viewer).filter(m => m.tier !== 'ir').map(m => monValue(catalog, state, m, viewer)).sort((a, b) => a - b);
    roster = vals.slice(0, extra).reduce((a, b) => a + b, 0);
  }
  return {inValue: v(getsSide), outValue: v(sendsSide) + roster};
}

export function evaluateTrade(catalog: Catalog, state: LeagueState, o: TradeProposal): {accept: boolean; score: number; reason: string} {
  const problem = tradeProblem(catalog, state, o);
  const {inValue, outValue} = tradeBalance(catalog, state, o, o.toTeamId);
  const score = Math.round(Math.max(-100, Math.min(100, ((inValue - outValue) / Math.max(10, outValue, inValue)) * 100)));
  if (problem) return {accept: false, score, reason: problem};
  const them = state.teams[o.toTeamId];
  if (score >= ACCEPT_SCORE) {
    const star = o.give.mons.map(id => state.mons[id]).sort((a, b) => monValue(catalog, state, b, o.toTeamId) - monValue(catalog, state, a, o.toTeamId))[0];
    return {accept: true, score, reason: star ? `${them.name} like what ${spName(catalog, state, star.id)} brings` : `${them.name} like the picks`};
  }
  const key = o.get.mons.map(id => state.mons[id]).sort((a, b) => monValue(catalog, state, b, o.toTeamId) - monValue(catalog, state, a, o.toTeamId))[0];
  if (score > -15) return {accept: false, score, reason: `Close: ${them.name} want a little more${key ? ` for ${spName(catalog, state, key.id)}` : ''}`};
  return {accept: false, score, reason: `${them.name} value ${key ? spName(catalog, state, key.id) : 'their side'} much higher`};
}

/** Carry out a trade (no checks). Rosters are rebalanced to 18 afterwards. */
export function executeTrade(catalog: Catalog, state: LeagueState, o: TradeProposal): void {
  const move = (ids: MonId[], from: TeamId, to: TeamId) => {
    for (const id of ids) {
      const m = state.mons[id];
      removeFromLineup(state, from, id);
      m.teamId = to;
      if (m.tier !== 'ir') m.tier = 'backup';
      m.tempFor = undefined;
    }
  };
  move(o.give.mons, o.fromTeamId, o.toTeamId);
  move(o.get.mons, o.toTeamId, o.fromTeamId);
  const movePick = (p: DraftPick, from: TeamId, to: TeamId) => {
    const src = state.teams[from];
    const idx = src.draftPicks.findIndex(x => samePick(x, p));
    if (idx < 0) return;
    const [pk] = src.draftPicks.splice(idx, 1);
    pk.ownerTeamId = to;
    state.teams[to].draftPicks.push(pk);
  };
  for (const p of o.give.picks) movePick(p, o.fromTeamId, o.toTeamId);
  for (const p of o.get.picks) movePick(p, o.toTeamId, o.fromTeamId);
  const names = (ids: MonId[], ps: DraftPick[]) => [...ids.map(id => spName(catalog, state, id)), ...ps.map(p => `${p.season} round ${p.round} pick`)].join(', ') || 'nothing';
  const A = state.teams[o.fromTeamId], B = state.teams[o.toTeamId];
  logTx(state, 'trade', `${A.name} traded ${names(o.give.mons, o.give.picks)} to ${B.name} for ${names(o.get.mons, o.get.picks)}`, [A.id, B.id], [...o.give.mons, ...o.get.mons]);
  for (const t of [A, B]) {
    if (!t.human || t.lineup.auto) autoLineup(catalog, state, t.id); else normalizeTiers(catalog, state, t.id);
  }
  // AI clubs refill/trim at once; the user's club is never back-filled silently (the UI offers the signing, or Play fills it)
  const ai = [A.id, B.id].filter(t => !state.teams[t].human);
  if ((state.phase === 'regular' || state.phase === 'preseason') && ai.length) enforceRosters(catalog, state, leagueRng(state), ai);
}

export function proposeTrade(catalog: Catalog, state: LeagueState, o: TradeProposal): {accepted: boolean; reason: string} {
  const ev = evaluateTrade(catalog, state, o);
  if (!ev.accept) return {accepted: false, reason: ev.reason};
  executeTrade(catalog, state, o);
  return {accepted: true, reason: ev.reason};
}

export function respondOffer(catalog: Catalog, state: LeagueState, offerId: string, accept: boolean): {ok: boolean; reason: string} {
  const o = state.offers.find(x => x.id === offerId);
  if (!o || o.status !== 'open') return {ok: false, reason: 'Offer is no longer open'};
  if (!accept) { o.status = 'declined'; return {ok: true, reason: 'Declined'}; }
  const problem = tradeProblem(catalog, state, o);
  if (problem) { o.status = 'expired'; return {ok: false, reason: problem}; }
  o.status = 'accepted';
  executeTrade(catalog, state, o);
  return {ok: true, reason: 'Trade done'};
}

export function expireOffers(state: LeagueState): void {
  for (const o of state.offers) if (o.status === 'open' && (o.expiresWeek < state.week || !tradeWindowOpen(state).open)) o.status = 'expired';
  if (state.offers.length > 60) state.offers = state.offers.filter(o => o.status === 'open').concat(state.offers.filter(o => o.status !== 'open').slice(-40));
}

/** Is an incoming offer good for the user by the model's own measure (the bar the AI uses to accept)? */
export function offerGoodForUser(catalog: Catalog, state: LeagueState, o: TradeProposal): boolean {
  const {inValue, outValue} = tradeBalance(catalog, state, o, o.toTeamId);
  const score = ((inValue - outValue) / Math.max(10, outValue, inValue)) * 100;
  return score >= ACCEPT_SCORE && !tradeProblem(catalog, state, o);
}

/** Tradeable assets of a team, least valuable to it first (never its starters unless asked). */
function spareMons(catalog: Catalog, state: LeagueState, teamId: TeamId): Mon[] {
  const starters = new Set(state.teams[teamId].lineup.slots.map(s => s.monId));
  return teamMons(state, teamId).filter(m => !starters.has(m.id) && m.tier !== 'ir')
    .sort((a, b) => monValue(catalog, state, b, teamId) - monValue(catalog, state, a, teamId));
}

/** One AI club makes the user an offer it likes for one of the user's mons (1-for-1 plus picks). */
export function makeAiOffer(catalog: Catalog, state: LeagueState, rng: Rng): TradeOffer | null {
  if (!tradeWindowOpen(state).open) return null;
  const user = state.userTeamId;
  const ai = rng.pick(Object.keys(state.teams).filter(t => t !== user));
  const targets = teamMons(state, user).filter(m => m.tier === 'active' || m.tier === 'backup')
    .map(m => ({m, v: monValue(catalog, state, m, ai)})).filter(x => x.v > 15).sort((a, b) => b.v - a.v);
  if (!targets.length) return null;
  const target = targets[Math.min(targets.length - 1, rng.int(3))];
  const theirs = spareMons(catalog, state, ai);
  let best: {m: Mon; gap: number} | null = null;
  for (const m of theirs) {
    const theirView = monValue(catalog, state, m, ai);
    const gap = target.v - theirView;          // what the AI gains
    if (gap >= 2 && (!best || gap < best.gap)) best = {m, gap};
  }
  if (!best) return null;
  const offer: TradeProposal = {fromTeamId: ai, toTeamId: user, give: {mons: [best.m.id], picks: []}, get: {mons: [target.m.id], picks: []}};
  // sweeten with a late pick when the AI's edge is big
  if (best.gap > 25) {
    const pick = state.teams[ai].draftPicks.filter(p => p.round >= 2).sort((a, b) => b.round - a.round)[0];
    if (pick) offer.give.picks.push(pick);
  }
  if (tradeProblem(catalog, state, offer)) return null;
  const full: TradeOffer = {...offer, id: newId(state, 'o'), status: 'open', expiresWeek: state.week + 1};
  state.offers.push(full);
  inbox(state, 'deal', `${state.teams[ai].name} want ${spName(catalog, state, target.m.id)}`,
    `They offer ${spName(catalog, state, best.m.id)}${offer.give.picks.length ? ' and a draft pick' : ''}. The offer ends next week.`, {kind: 'trade', id: full.id});
  return full;
}

/** AI-AI trade knobs: neutral values (viewer null) within `fair` of each other, and at least one side's lineup
 *  (or `slack` points for cheap players), and at least one side's lineup must improve by `minLineupGain` rating
 *  points (no more bench-for-bench swaps). */
export const AI_TRADE = {fair: 0.3, slack: 2, minLineupGain: 2};

/** Change in a club's best lineup (planLineup over the strategies it builds toward: rating sum, off-role slots
 *  costed like chooseStrategy) if it swapped `out` for `inc`. Tried on the state and put back. */
export function planDelta(catalog: Catalog, state: LeagueState, teamId: TeamId, inc: Mon, out: Mon): number {
  const score = () => Math.max(...targetStrategies(state, teamId).map(([sid, w]) => {
    const p = planLineup(catalog, state, teamId, sid);
    return w * (p.ratingSum - (6 - p.onRole) * 40);
  }));
  const before = score();
  const keep = [inc.teamId, inc.tier, out.teamId, out.tier] as const;
  inc.teamId = teamId; if (inc.tier !== 'ir') inc.tier = 'backup';
  out.teamId = null;
  const after = score();
  [inc.teamId, inc.tier, out.teamId, out.tier] = keep;
  return after - before;
}

/** AI-to-AI: a 1-for-1 swap both clubs value (needs make the same mon worth more to one side), fair by neutral
 *  value, that improves at least one club's lineup in the strategies it builds toward. */
export function aiTrade(catalog: Catalog, state: LeagueState, rng: Rng): boolean {
  if (!tradeWindowOpen(state).open) return false;
  const ids = Object.keys(state.teams).filter(t => !state.teams[t].human);
  const a = rng.pick(ids), b = rng.pick(ids.filter(t => t !== a));
  const sa = spareMons(catalog, state, a).slice(0, 8), sb = spareMons(catalog, state, b).slice(0, 8);
  for (const x of sa) for (const y of sb) {
    const o: TradeProposal = {fromTeamId: a, toTeamId: b, give: {mons: [x.id], picks: []}, get: {mons: [y.id], picks: []}};
    const gainA = monValue(catalog, state, y, a) - monValue(catalog, state, x, a);
    const gainB = monValue(catalog, state, x, b) - monValue(catalog, state, y, b);
    if (gainA <= 2 || gainB <= 2) continue;
    const vx = monValue(catalog, state, x, null), vy = monValue(catalog, state, y, null);
    if (Math.abs(vx - vy) > Math.max(AI_TRADE.fair * Math.max(vx, vy), AI_TRADE.slack)) continue;
    const lineupA = planDelta(catalog, state, a, y, x), lineupB = planDelta(catalog, state, b, x, y);
    if (Math.max(lineupA, lineupB) < AI_TRADE.minLineupGain || Math.min(lineupA, lineupB) < 0) continue;
    if (tradeProblem(catalog, state, o)) continue;
    executeTrade(catalog, state, o);
    return true;
  }
  return false;
}
