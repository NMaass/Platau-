// Plateau model facade: the ONLY surface the UI calls. Pure functions over
// LeagueState (mutating the given state in place is fine; the UI store saves
// after each action). The model agent owns the bodies; the signatures are the
// contract with the UI and the sim layer. Add functions freely; don't change
// existing signatures without updating every caller.
import type {
  Catalog, LeagueState, TeamId, MonId, Mon, Role, Lineup, Grade, BattleJob, BattleJobResult,
  Series, TradeOffer, DraftPick, StatId, IvGrade,
} from '../types.ts';
import * as season from './season.ts';
import * as R from './ratings.ts';
import * as G from './grades.ts';
import * as S from './scouting.ts';
import * as cap from './cap.ts';
import * as st from './standings.ts';
import * as adv from './advisories.ts';
import * as lu from './lineup.ts';
import * as dr from './draft.ts';
import * as tr from './trades.ts';
import * as fa from './freeagency.ts';
import * as po from './playoffs.ts';
import {releaseMon, rosterExcess as excess, trimRoster as trim} from './roster.ts';
import {strategyById} from './strategies.ts';
import {freeAgents as faList, teamMons} from './util.ts';
import {inbox as pushInbox, markRead} from './inbox.ts';

// Remembered for the few contract calls whose signature has no catalog (franchiseTag, cut).
let lastCatalog: Catalog | null = null;
const remember = (c: Catalog) => { lastCatalog = c; return c; };
const needCatalog = (c?: Catalog): Catalog => {
  const x = c ?? lastCatalog;
  if (!x) throw new Error('model/api: call with a catalog first');
  return x;
};

// ---- league lifecycle
export interface NewLeagueOptions { seed?: number; name?: string; userTeamIndex?: number; start: 'random' | 'fantasy-draft' }
export function newLeague(catalog: Catalog, opts: NewLeagueOptions): LeagueState { return season.newLeague(remember(catalog), opts); }

// ---- derived ratings (pure, cheap; the UI calls these per row)
/** EV grade from Growth (and IV cap, injury: day-to-day plays one grade lower). */
export function evGrade(_state: LeagueState, mon: Mon): Grade { return G.effectiveEvGrade(mon); }
/** Rating 0..99 of this mon in a role; null if none of its sets fills the role. */
export function roleRating(catalog: Catalog, _state: LeagueState, mon: Mon, role: Role): number | null { return R.roleRating(catalog, mon, role); }
/** Best role and its rating (the glance badge "ATK | 88"). */
export function bestRole(catalog: Catalog, _state: LeagueState, mon: Mon): {role: Role; ovr: number} { return R.bestRole(catalog, mon); }
/** All roles this mon can fill, best first. */
export function roles(catalog: Catalog, _state: LeagueState, mon: Mon): {role: Role; ovr: number; setId: string}[] { return R.allRoles(catalog, mon); }
export function ivHeadline(mon: Mon): IvGrade { return G.ivHeadlineOf(mon.ivs); }
/** What `teamId` knows about a mon's rating: exact for own/veteran mons, else a range that narrows with scouting. */
export function knownRating(catalog: Catalog, state: LeagueState, viewer: TeamId, mon: Mon): {role: Role; lo: number; hi: number; exact: boolean} { return S.knownRating(catalog, state, viewer, mon); }
export function capSpace(state: LeagueState, teamId: TeamId): number { return cap.capSpace(state, teamId); }
export function payroll(state: LeagueState, teamId: TeamId): number { return cap.payroll(state, teamId); }
export function standings(state: LeagueState): {teamId: TeamId; wins: number; losses: number; gameWins: number; gameLosses: number; divRank: number; confSeed: number | null; streak: string}[] { return st.standings(state); }
/** The series the user's team plays this week (or null in offseason / bye). */
export function userSeries(state: LeagueState): Series | null { return adv.userSeries(state); }
/** The likely 6 the opponent will field (from its lineup), for the scouting report. */
export function likelyLineup(catalog: Catalog, state: LeagueState, teamId: TeamId): {role: Role; monId: MonId}[] { return adv.likelyLineup(catalog, state, teamId); }
/** Advisories for "Before you play": injuries, broken slots, expiring offers, unscouted opponent. */
export function advisories(catalog: Catalog, state: LeagueState): {id: string; kind: 'injury' | 'lineup' | 'offer' | 'scout' | 'contract'; label: string; text: string; action: {label: string; route: string}}[] { return adv.advisories(catalog, state); }

// ---- roster & lineup actions
export function setStrategy(catalog: Catalog, state: LeagueState, teamId: TeamId, strategyId: string): void {
  const team = state.teams[teamId];
  const next = strategyById(strategyId).id;
  if (next === team.lineup.strategyId) return;
  // a hand-set lineup is kept per strategy and comes back when you switch back to it
  const saved = (team.savedLineups ??= {});
  if (!team.lineup.auto) saved[team.lineup.strategyId] = structuredClone(team.lineup.slots);
  team.lineup.strategyId = next;
  const back = saved[next];
  const valid = back && back.every(sl => !sl.monId || (state.mons[sl.monId]?.teamId === teamId && state.mons[sl.monId].tier !== 'ir'));
  if (back && valid) {
    team.lineup.slots = structuredClone(back).map(sl => ({...sl, backups: sl.backups.filter(b => state.mons[b]?.teamId === teamId)}));
    team.lineup.auto = false;
    lu.normalizeTiers(remember(catalog), state, teamId);
    return;
  }
  team.lineup.auto = true;
  lu.autoLineup(remember(catalog), state, teamId);
}
export function autoLineup(catalog: Catalog, state: LeagueState, teamId: TeamId): Lineup {
  state.teams[teamId].lineup.auto = true;
  return lu.autoLineup(remember(catalog), state, teamId);
}
/** Put a mon in a slot (swaps if it starts elsewhere). Turns the lineup to manual. */
export function assignSlot(state: LeagueState, teamId: TeamId, slotIndex: number, monId: MonId | null): void {
  const team = state.teams[teamId];
  const slots = team.lineup.slots;
  const slot = slots[slotIndex];
  if (!slot) return;
  if (monId && state.mons[monId]?.teamId !== teamId) return;
  const prev = slot.monId;
  const other = monId ? slots.findIndex((s, i) => i !== slotIndex && s.monId === monId) : -1;
  if (other >= 0) { slots[other].monId = prev; slots[other].setId = undefined; }
  slot.monId = monId; slot.setId = undefined;
  slot.backups = slot.backups.filter(b => b !== monId);
  team.lineup.auto = false;
  const m = monId ? state.mons[monId] : undefined;
  if (m && m.tier !== 'ir') {
    if (m.tier === 'practice' && m.contract && m.contract.salary < state.settings.minSalary) m.contract.salary = state.settings.minSalary;
    m.tier = 'active';
  }
  if (lastCatalog) lu.normalizeTiers(lastCatalog, state, teamId);
}
export function setMonSet(state: LeagueState, monId: MonId, setId: string): void {
  const m = state.mons[monId];
  if (!m) return;
  m.setId = setId;
  if (m.teamId) for (const sl of state.teams[m.teamId].lineup.slots) if (sl.monId === monId) sl.setId = setId;
}
/** Move between active / backup / practice (a full tier swaps its lowest member back). */
export function moveTier(state: LeagueState, monId: MonId, tier: Mon['tier']): void {
  const m = state.mons[monId];
  if (!m?.teamId || m.tier === tier) return;
  if (tier === 'ir' && m.injury?.kind !== 'ir') return;
  if (m.tier === 'ir' && m.injury?.kind === 'ir') return;
  const from = m.tier;
  const full = teamMons(state, m.teamId).filter(x => x.tier === tier && x.id !== m.id);
  if (tier !== 'ir' && full.length >= 6) {
    const swap = lastCatalog ? full.sort((a, b) => R.bestRole(lastCatalog!, a).ovr - R.bestRole(lastCatalog!, b).ovr)[0] : full[0];
    swap.tier = from === 'ir' ? 'backup' : from;
    if (swap.tier === 'practice') lu.removeFromLineup(state, m.teamId, swap.id);
  }
  if (m.tier === 'practice' && tier !== 'practice' && m.contract && m.contract.salary < state.settings.minSalary) m.contract.salary = state.settings.minSalary;
  m.tier = tier;
  if (tier === 'practice') lu.removeFromLineup(state, m.teamId, m.id);
}
/** Up to 3 picks get extra practice XP this week. */
export function setPracticeFocus(state: LeagueState, teamId: TeamId, monIds: MonId[]): void {
  state.teams[teamId].practiceFocus = monIds.filter(id => state.mons[id]?.teamId === teamId).slice(0, 3);
}
export function cut(state: LeagueState, monId: MonId): void {
  const m = state.mons[monId];
  if (!m?.teamId) return;
  releaseMon(needCatalog(), state, m);
}

// ---- week simulation
/** Battle jobs for every series this week (one job per game; series continue game by game). */
export function weekJobs(catalog: Catalog, state: LeagueState, gameIndex: number): BattleJob[] { return season.weekJobs(remember(catalog), state, gameIndex); }
/** Apply finished battles: box scores, XP, injuries, series results. */
export function applyResults(catalog: Catalog, state: LeagueState, results: BattleJobResult[]): void { season.applyResults(remember(catalog), state, results); }
/** After all games of the week: standings, growth/evolution, aging, AI moves (lineups, trades, signings), inbox, advance week/phase. */
export function finishWeek(catalog: Catalog, state: LeagueState): void { season.finishWeek(remember(catalog), state); }
/** Offseason/phase steps that need no battles (awards, retirements, lottery, AI draft picks, re-sign, FA rounds). */
export function advancePhase(catalog: Catalog, state: LeagueState): void { season.advancePhase(remember(catalog), state); }
/** Whole week without the engine (quicksim resolver), for tests, fast sims and fallbacks. */
export function playWeekSync(catalog: Catalog, state: LeagueState): void { season.playWeekSync(remember(catalog), state); }
/** Who would be released to bring a roster to 18 (lowest-rated first, then cheapest; never a starter). */
export function rosterExcess(catalog: Catalog, state: LeagueState, teamId: TeamId): Mon[] { return excess(remember(catalog), state, teamId); }
/** Release that list (after the user confirmed it). Returns who went. */
export function trimRoster(catalog: Catalog, state: LeagueState, teamId: TeamId): Mon[] { return trim(remember(catalog), state, teamId); }
/** Reasons the last finishWeek wants a multi-week sim to stop (long injury to a starter, a new offer). */
export function pauseReasons(state: LeagueState): string[] { return state.pauseReasons ?? []; }

// ---- front office
export function scout(state: LeagueState, teamId: TeamId, monId: MonId, full: boolean): void {
  const m = state.mons[monId];
  if (m) S.scout(state, teamId, m, full, lastCatalog ?? undefined);
}
/** Same as scout, with the outcome for a dialog. */
export function scoutMon(catalog: Catalog, state: LeagueState, teamId: TeamId, monId: MonId, full: boolean): S.ScoutResult {
  return S.scout(state, teamId, state.mons[monId], full, remember(catalog));
}
export function draftPick(catalog: Catalog, state: LeagueState, monId: MonId): void {
  const p = dr.onTheClock(state);
  if (state.phase !== 'draft' || !p || p.ownerTeamId !== state.userTeamId) return;
  dr.makePick(remember(catalog), state, monId);
}
export function simDraftToUser(catalog: Catalog, state: LeagueState): void {
  if (state.phase === 'draft') dr.simToUser(remember(catalog), state);
}
/** Finish the draft (the user's remaining picks by the auto-picker); stays in the draft phase so the board can be reviewed. */
export function simDraftToEnd(catalog: Catalog, state: LeagueState): void {
  if (state.phase === 'draft') dr.completeDraft(remember(catalog), state);
}
export function evaluateTrade(catalog: Catalog, state: LeagueState, offer: Omit<TradeOffer, 'id' | 'status' | 'expiresWeek'>): {accept: boolean; score: number; reason: string} { return tr.evaluateTrade(remember(catalog), state, offer); }
export function proposeTrade(catalog: Catalog, state: LeagueState, offer: Omit<TradeOffer, 'id' | 'status' | 'expiresWeek'>): {accepted: boolean; reason: string} { return tr.proposeTrade(remember(catalog), state, offer); }
export function respondOffer(catalog: Catalog, state: LeagueState, offerId: string, accept: boolean): void { tr.respondOffer(remember(catalog), state, offerId, accept); }
export function askingPrice(catalog: Catalog, state: LeagueState, monId: MonId): {salary: number; years: number} { return fa.askingPrice(remember(catalog), state, state.mons[monId]); }
export function offerContract(catalog: Catalog, state: LeagueState, monId: MonId, salary: number, years: number): {accepted: boolean; reason: string} {
  return fa.offerContract(remember(catalog), state, state.userTeamId, state.mons[monId], salary, years);
}
export function franchiseTag(state: LeagueState, monId: MonId, catalog?: Catalog): void {
  fa.franchiseTag(needCatalog(catalog), state, state.mons[monId]);
}
export function franchiseTagCheck(catalog: Catalog, state: LeagueState, monId: MonId): {ok: boolean; reason: string; salary: number} { return fa.franchiseTagCheck(remember(catalog), state, state.mons[monId]); }

// ---- extra reads for screens
export const knownPotential = (state: LeagueState, viewer: TeamId, mon: Mon) => S.knownPotential(state, viewer, mon);
export const knownTraits = (catalog: Catalog, state: LeagueState, viewer: TeamId, mon: Mon) => S.knownTraits(catalog, state, viewer, mon);
export const freeAgents = (state: LeagueState): Mon[] => faList(state);
export const draftBoard = (state: LeagueState): Mon[] => dr.availableProspects(state);
export const draftProspects = (state: LeagueState): Mon[] => (state.draft?.prospects ?? []).map(id => state.mons[id]).filter(Boolean);
export const onTheClock = (state: LeagueState): DraftPick | null => dr.onTheClock(state);
export const playoffPicture = (state: LeagueState) => po.playoffPicture(state);
export const interest = (state: LeagueState, mon: Mon, teamId: TeamId) => fa.interest(state, mon, teamId);
export const isExpiring = (mon: Mon) => fa.isExpiring(mon);
export const tradeWindow = (state: LeagueState) => tr.tradeWindowOpen(state);
export const capPayroll = (state: LeagueState, teamId: TeamId) => cap.capPayroll(state, teamId);
export const marketSalary = (catalog: Catalog, state: LeagueState, mon: Mon) => cap.marketSalary(catalog, state, mon);
export const brokenSlots = (state: LeagueState, teamId: TeamId) => lu.brokenSlots(state, teamId);
export const fieldedLineup = (catalog: Catalog, state: LeagueState, teamId: TeamId) => lu.fieldedLineup(catalog, state, teamId);
export const markInboxRead = (state: LeagueState, ids: string[] | 'all') => markRead(state, ids);
export const potentialRange = knownPotential;
export function teamRoster(state: LeagueState, teamId: TeamId): Mon[] { return teamMons(state, teamId); }
export function phaseLabel(state: LeagueState): string {
  switch (state.phase) {
    case 'preseason': return `Season ${state.season} preseason`;
    case 'regular': return `Season ${state.season}, week ${state.week}`;
    case 'playoffs': return state.week === 15 ? 'Indigo Plateau, round 1' : state.week === 16 ? 'Indigo Plateau, conference finals' : 'Indigo Plateau final';
    case 'awards': return 'Awards';
    case 'draft-lottery': return 'Draft lottery';
    case 'draft': return 'Draft';
    case 'resign': return 'Re-signing';
    case 'free-agency': return `Free agency, round ${(state.faRound ?? 0) + 1} of ${fa.FA_ROUNDS}`;
  }
}
export const notify = (state: LeagueState, title: string, body: string) => pushInbox(state, 'league', title, body);

export {serialize, deserialize, migrate} from './serialize.ts';
export {monExport, teamExport} from './export.ts';
export {quickSim} from './quicksim.ts';
export {STRATEGIES, strategyById} from './strategies.ts';
export {DEFAULT_SETTINGS} from './season.ts';
export type {DraftPick, StatId};
