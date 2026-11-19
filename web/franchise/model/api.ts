// Plateau model facade: the ONLY surface the UI calls. Pure functions over
// LeagueState (mutating the given state in place is fine; the UI store saves
// after each action). The model agent owns the bodies; the signatures are the
// contract with the UI and the sim layer. Add functions freely; don't change
// existing signatures without updating every caller.
import type {
  Catalog, LeagueState, TeamId, MonId, Mon, Role, Lineup, Grade, BattleJob, BattleJobResult,
  Series, TradeOffer, DraftPick, StatId, IvGrade,
} from '../types.ts';

const todo = (name: string): never => { throw new Error(`model/api.${name} not implemented`); };

// ---- league lifecycle
export interface NewLeagueOptions { seed?: number; name?: string; userTeamIndex?: number; start: 'random' | 'fantasy-draft' }
export function newLeague(catalog: Catalog, opts: NewLeagueOptions): LeagueState { return todo('newLeague'); }

// ---- derived ratings (pure, cheap; the UI calls these per row)
/** EV grade from Growth (and IV cap, injury: day-to-day plays one grade lower). */
export function evGrade(state: LeagueState, mon: Mon): Grade { return todo('evGrade'); }
/** Rating 0..99 of this mon in a role; null if none of its sets fills the role. */
export function roleRating(catalog: Catalog, state: LeagueState, mon: Mon, role: Role): number | null { return todo('roleRating'); }
/** Best role and its rating (the glance badge "ATK | 88"). */
export function bestRole(catalog: Catalog, state: LeagueState, mon: Mon): {role: Role; ovr: number} { return todo('bestRole'); }
/** All roles this mon can fill, best first. */
export function roles(catalog: Catalog, state: LeagueState, mon: Mon): {role: Role; ovr: number; setId: string}[] { return todo('roles'); }
export function ivHeadline(mon: Mon): IvGrade { return todo('ivHeadline'); }
/** What `teamId` knows about a mon's rating: exact for own/veteran mons, else a range that narrows with scouting. */
export function knownRating(catalog: Catalog, state: LeagueState, viewer: TeamId, mon: Mon): {role: Role; lo: number; hi: number; exact: boolean} { return todo('knownRating'); }
export function capSpace(state: LeagueState, teamId: TeamId): number { return todo('capSpace'); }
export function payroll(state: LeagueState, teamId: TeamId): number { return todo('payroll'); }
export function standings(state: LeagueState): {teamId: TeamId; wins: number; losses: number; gameWins: number; gameLosses: number; divRank: number; confSeed: number | null; streak: string}[] { return todo('standings'); }
/** The series the user's team plays this week (or null in offseason / bye). */
export function userSeries(state: LeagueState): Series | null { return todo('userSeries'); }
/** The likely 6 the opponent will field (from its lineup), for the scouting report. */
export function likelyLineup(catalog: Catalog, state: LeagueState, teamId: TeamId): {role: Role; monId: MonId}[] { return todo('likelyLineup'); }
/** Advisories for "Before you play": injuries, broken slots, expiring offers, unscouted opponent. */
export function advisories(catalog: Catalog, state: LeagueState): {id: string; kind: 'injury' | 'lineup' | 'offer' | 'scout' | 'contract'; label: string; text: string; action: {label: string; route: string}}[] { return todo('advisories'); }

// ---- roster & lineup actions
export function setStrategy(catalog: Catalog, state: LeagueState, teamId: TeamId, strategyId: string): void { todo('setStrategy'); }
export function autoLineup(catalog: Catalog, state: LeagueState, teamId: TeamId): Lineup { return todo('autoLineup'); }
export function assignSlot(state: LeagueState, teamId: TeamId, slotIndex: number, monId: MonId | null): void { todo('assignSlot'); }
export function setMonSet(state: LeagueState, monId: MonId, setId: string): void { todo('setMonSet'); }
export function moveTier(state: LeagueState, monId: MonId, tier: Mon['tier']): void { todo('moveTier'); }
export function setPracticeFocus(state: LeagueState, teamId: TeamId, monIds: MonId[]): void { todo('setPracticeFocus'); }
export function cut(state: LeagueState, monId: MonId): void { todo('cut'); }

// ---- week simulation
/** Battle jobs for every series this week (one job per game; series continue game by game). */
export function weekJobs(catalog: Catalog, state: LeagueState, gameIndex: number): BattleJob[] { return todo('weekJobs'); }
/** Apply finished battles: box scores, XP, injuries, series results. */
export function applyResults(catalog: Catalog, state: LeagueState, results: BattleJobResult[]): void { todo('applyResults'); }
/** After all games of the week: standings, growth/evolution, aging, AI moves (lineups, trades, signings), inbox, advance week/phase. */
export function finishWeek(catalog: Catalog, state: LeagueState): void { todo('finishWeek'); }
/** Offseason/phase steps that need no battles (awards, retirements, lottery, AI draft picks, re-sign, FA rounds). */
export function advancePhase(catalog: Catalog, state: LeagueState): void { todo('advancePhase'); }

// ---- front office
export function scout(state: LeagueState, teamId: TeamId, monId: MonId, full: boolean): void { todo('scout'); }
export function draftPick(catalog: Catalog, state: LeagueState, monId: MonId): void { todo('draftPick'); }
export function simDraftToUser(catalog: Catalog, state: LeagueState): void { todo('simDraftToUser'); }
export function evaluateTrade(catalog: Catalog, state: LeagueState, offer: Omit<TradeOffer, 'id' | 'status' | 'expiresWeek'>): {accept: boolean; score: number; reason: string} { return todo('evaluateTrade'); }
export function proposeTrade(catalog: Catalog, state: LeagueState, offer: Omit<TradeOffer, 'id' | 'status' | 'expiresWeek'>): {accepted: boolean; reason: string} { return todo('proposeTrade'); }
export function respondOffer(catalog: Catalog, state: LeagueState, offerId: string, accept: boolean): void { todo('respondOffer'); }
export function askingPrice(catalog: Catalog, state: LeagueState, monId: MonId): {salary: number; years: number} { return todo('askingPrice'); }
export function offerContract(catalog: Catalog, state: LeagueState, monId: MonId, salary: number, years: number): {accepted: boolean; reason: string} { return todo('offerContract'); }
export function franchiseTag(state: LeagueState, monId: MonId): void { todo('franchiseTag'); }

export type {DraftPick, StatId};
