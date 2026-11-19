// The season machine: league creation, weekly jobs/results, end-of-week
// processing and the offseason phases.
// preseason -> regular (weeks 1..14) -> playoffs (15..17) -> awards ->
// draft-lottery -> draft -> resign -> free-agency (3 rounds) -> next preseason.
import type {BattleJob, BattleJobResult, BattleResult, Catalog, DraftPick, LeagueSettings, LeagueState, Mon, MonBox, MonId, Series, Team, TeamId} from '../types.ts';
import {hash01, leagueRng, type Rng} from './rng.ts';
import {TEAM_SEEDS, teamIdAt} from './teams.ts';
import {initPool, drawFamily, familyTypes, returnToPool, type FamilyInfo, type PoolCounts} from './pool.ts';
import {createMon} from './mons.ts';
import {STRATEGIES} from './strategies.ts';
import {ROSTER, STARTERS, applyPlan, autoLineup, canBattle, fieldedLineup, normalizeTiers, planLineup, removeFromLineup, type LineupPlan} from './lineup.ts';
import {addDeadMoney, canAfford, capPayroll, makeContract, marketSalary, marketYears, maxSalary, payroll} from './cap.ts';
import {teamExport} from './export.ts';
import {buildSchedule, seriesOfWeek} from './schedule.ts';
import {reverseStandings} from './standings.ts';
import {advancePlayoffs, finalSeries, startPlayoffs} from './playoffs.ts';
import {XP, addXp, ageMon, battleXp, levelUp, retireChance, type GrowthEvent} from './progression.ts';
import {applyInjury, healAll, rollInjury, tickInjuries} from './injuries.ts';
import {FAME, hallOfFameWorthy, seasonAwards, seriesMvp} from './awards.ts';
import {gameSummary, seriesSummary} from './summaries.ts';
import {inbox} from './inbox.ts';
import {aiScout} from './scouting.ts';
import {availableProspects, completeDraft, ensurePicks, generateClass, runLottery} from './draft.ts';
import {FA_ROUNDS, aiResign, faRound, pruneFreeAgents, releaseExpiring} from './freeagency.ts';
import {enforceRosters} from './roster.ts';
import {aiTrade, expireOffers, makeAiOffer} from './trades.ts';
import {quickSim} from './quicksim.ts';
import {checkGoal, setGoal} from './goals.ts';
import {bestRole} from './ratings.ts';
import {freeAgents, logTx, money, monsByTeam, rosterCount, round50k, teamMons} from './util.ts';
import {GRADES, GROWTH_BAND_HI} from './grades.ts';

export const DEFAULT_SETTINGS: LeagueSettings = {
  cap: 100_000_000, capGrowth: 0.04, floor: 70_000_000, minSalary: 500_000, maxSalaryPct: 0.2,
  injuryKo: 0.025, injuryStatus: 0.012, injuryDayToDay: 0.68, injuryIr: 0.06,
  budgetMs: {ai: 20, human: 40},
  seriesBestOf: 3, finalBestOf: 5,
  scoutingPointsPerWeek: 10, scoutCost: 1, fullScoutCost: 5,
  tradeDeadlineWeek: 8, weeks: 14,
};

/** Knobs for league creation (tunable). */
export const START = {perTeam: 18, legendaries: 9, ageMin: 21, ageMax: 33, payrollTarget: [0.85, 0.95] as [number, number], aiOfferChance: 0.3, aiTradeChance: 0.35};

export interface NewLeagueOptions {
  /** 'random' = pre-made rosters (lean to each gym's type); 'draft' = the league starts in a startup draft
   *  (empty rosters, 18 snake rounds, the user picks); 'fantasy-draft' = that draft, auto-picked to the end. */
  seed?: number; name?: string; userTeamIndex?: number; start: 'random' | 'fantasy-draft' | 'draft';
  settings?: Partial<LeagueSettings>; pool?: PoolCounts;
}

const spName = (catalog: Catalog, m: Mon) => catalog.species[m.speciesId]?.name ?? m.speciesId;

// ---------------------------------------------------------------- creation
export function newLeague(catalog: Catalog, opts: NewLeagueOptions): LeagueState {
  const seed = (opts.seed ?? Math.floor(Math.random() * 0x7fffffff)) | 0;
  const settings: LeagueSettings = {...DEFAULT_SETTINGS, ...(opts.settings ?? {}), budgetMs: {...DEFAULT_SETTINGS.budgetMs, ...(opts.settings?.budgetMs ?? {})}};
  const userIdx = Math.max(0, Math.min(15, opts.userTeamIndex ?? 0));
  const state: LeagueState = {
    schemaVersion: 1, id: `league-${seed >>> 0}`, name: opts.name ?? 'Plateau League', createdAt: Date.now(),
    seed, rngState: seed, season: 1, week: 0, phase: 'preseason', settings, userTeamId: teamIdAt(userIdx),
    teams: {}, mons: {}, schedule: [], history: [], inbox: [], offers: [], pool: initPool(catalog, opts.pool), nextId: 1, log: [],
  };
  const rng = leagueRng(state);
  TEAM_SEEDS.forEach((t, i) => {
    const [fav1, fav2] = t.favorites;
    const team: Team = {
      id: teamIdAt(i), city: t.city, name: t.name, abbr: t.abbr, color: t.color, trainer: t.trainer,
      gymType: t.gymType, badge: t.badge, leader: t.leader,
      conference: (i >> 3) as 0 | 1, division: ((i >> 2) & 1) as 0 | 1, human: i === userIdx,
      favoriteStrategies: [fav1, fav2], lineup: {strategyId: fav1, slots: [], auto: true},
      scoutingPoints: settings.scoutingPointsPerWeek, deadMoney: [], draftPicks: [],
    };
    state.teams[team.id] = team;
  });
  const teamIds = Object.keys(state.teams);
  ensurePicks(state, 1);
  state.schedule = buildSchedule(state, teamIds);
  const me = state.teams[state.userTeamId];
  if (opts.start === 'draft' || opts.start === 'fantasy-draft') {
    startupDraft(catalog, state, rng, teamIds);
    inbox(state, 'league', `Welcome to the ${me.city} ${me.name}`,
      'Every club starts with an empty roster. Draft 18 Pokémon from the board, then set your strategy and lineup.');
    if (opts.start === 'fantasy-draft') advancePhase(catalog, state);
    return state;
  }
  randomRosters(catalog, state, rng, teamIds);
  startRosters(catalog, state, rng, teamIds);
  inbox(state, 'league', `Welcome to the ${me.city} ${me.name}`, 'Set your strategy and lineup, then start the season.');
  return state;
}

/** Contracts, strategies, practice focus and the season 1 draft class, once every club has its 18. */
function startRosters(catalog: Catalog, state: LeagueState, rng: Rng, teamIds: TeamId[]): void {
  for (const t of teamIds) {
    assignContracts(catalog, state, rng, t);
    chooseStrategy(catalog, state, t, true);
  }
  state.teams[state.userTeamId].practiceFocus = defaultFocus(catalog, teamMons(state, state.userTeamId));
  generateClass(catalog, state, rng, 1);
}

function staggeredAges(rng: Rng, n: number): number[] {
  const span = START.ageMax - START.ageMin;
  return rng.shuffle(Array.from({length: n}, (_, k) => START.ageMin + Math.round((k * span) / (n - 1)) + (rng.chance(0.3) ? rng.range(-1, 1) : 0))
    .map(a => Math.max(START.ageMin, Math.min(START.ageMax, a))));
}

/** Knobs for pre-made rosters: how many of the 18 are drawn from the gym type, and how even the clubs must be
 *  (mean of each club's best six ratings; filler Pokémon of similar age are swapped until the spread is under `spread`). */
export const THEME = {typed: 9, spread: 2, swaps: 400};

export const hasType = (catalog: Catalog, m: Mon, type: string | undefined): boolean =>
  !!type && (catalog.species[m.speciesId]?.types ?? []).includes(type);

/** Mean of the best six ratings: the strength the New League preview and the roster balancing use. */
export function topSix(catalog: Catalog, mons: Mon[]): number {
  const o = mons.map(m => bestRole(catalog, m).ovr).sort((a, b) => b - a).slice(0, 6);
  return o.length ? o.reduce((a, b) => a + b, 0) / 6 : 0;
}

function randomRosters(catalog: Catalog, state: LeagueState, rng: Rng, teamIds: TeamId[]): void {
  const legendTeams = rng.shuffle([...teamIds]).slice(0, START.legendaries);
  for (const t of teamIds) {
    const type = state.teams[t].gymType;
    const prefer = type ? (f: FamilyInfo) => familyTypes(catalog, f).has(type) : undefined;
    const ages = staggeredAges(rng, START.perTeam);
    ages.forEach((age, k) => {
      const legend = k === 0 && legendTeams.includes(t);
      // every other draw leans to the gym type (about half the roster), the rest fill the strategy roles
      const typed = k % 2 === 1 && Math.floor(k / 2) < THEME.typed;
      const fam = (legend ? drawFamily(catalog, state, rng, 'legendary') : null) ?? drawFamily(catalog, state, rng, 'nonlegendary', typed ? prefer : undefined)!;
      const m = createMon(catalog, state, rng, {family: fam, age: legend ? Math.max(age, 24) : age, teamId: t, tier: 'backup'});
      if (m.age <= 21) m.rookieSeason = 1;
    });
  }
  balanceRosters(catalog, state, teamIds);
  for (const t of teamIds) setPracticeSquad(state, t);
}

/** Practice squad = the youngest six; everyone else starts as a backup (lineups promote the starters). */
function setPracticeSquad(state: LeagueState, teamId: TeamId): void {
  const mons = teamMons(state, teamId);
  for (const m of mons) m.tier = 'backup';
  [...mons].sort((a, b) => a.age - b.age || a.id.localeCompare(b.id)).slice(0, 6).forEach(m => { m.tier = 'practice'; });
}

/** Even out the clubs: swap filler Pokémon (not legendary, not of either gym's type, within 2 years of age)
 *  between the strongest and the weakest club while that narrows their gap. */
function balanceRosters(catalog: Catalog, state: LeagueState, teamIds: TeamId[]): void {
  const legend = (m: Mon) => catalog.species[m.speciesId]?.rarity === 'legendary' || catalog.species[m.speciesId]?.rarity === 'mythical';
  // a swap must not cost either club a Pokémon of its gym type
  const keepsTypes = (a: Mon, ta: TeamId, b: Mon, tb: TeamId) =>
    (!hasType(catalog, a, state.teams[ta].gymType) || hasType(catalog, b, state.teams[ta].gymType))
    && (!hasType(catalog, b, state.teams[tb].gymType) || hasType(catalog, a, state.teams[tb].gymType));
  for (let guard = 0; guard < THEME.swaps; guard++) {
    const str = teamIds.map(t => ({t, v: topSix(catalog, teamMons(state, t))})).sort((a, b) => b.v - a.v);
    let done = true;
    // try the strongest against the weakest first, then the next pairs out
    outer: for (let i = 0; i < 3; i++) for (let j = str.length - 1; j > str.length - 4; j--) {
      const hi = str[i], lo = str[j];
      if (hi.v - lo.v <= THEME.spread) break outer;
      const A = teamMons(state, hi.t), B = teamMons(state, lo.t);
      let best: {a: Mon; b: Mon; gap: number} | null = null;
      for (const a of A) {
        if (legend(a)) continue;
        for (const b of B) {
          if (legend(b) || Math.abs(a.age - b.age) > 2 || !keepsTypes(a, hi.t, b, lo.t)) continue;
          if (bestRole(catalog, a).ovr <= bestRole(catalog, b).ovr) continue;
          const A2 = A.map(x => x === a ? b : x), B2 = B.map(x => x === b ? a : x);
          const gap = Math.abs(topSix(catalog, A2) - topSix(catalog, B2));
          if (gap < hi.v - lo.v && (!best || gap < best.gap)) best = {a, b, gap};
        }
      }
      if (best) { best.a.teamId = lo.t; best.b.teamId = hi.t; done = false; break outer; }
    }
    if (done) break;
  }
}

// ---------------------------------------------------------------- startup draft
/** The league-start draft: the whole starting pool (18 per club) on the board, 18 snake rounds in a random order. */
function startupDraft(catalog: Catalog, state: LeagueState, rng: Rng, teamIds: TeamId[]): void {
  const n = teamIds.length * START.perTeam;
  const ages = staggeredAges(rng, n);
  const ids = ages.map((age, k) => {
    const fam = (k < START.legendaries ? drawFamily(catalog, state, rng, 'legendary') : null) ?? drawFamily(catalog, state, rng, 'nonlegendary')!;
    const m = createMon(catalog, state, rng, {family: fam, age: k < START.legendaries ? Math.max(age, 24) : age, teamId: null, tier: 'backup'});
    m.prospect = 0;
    return m.id;
  });
  const first = rng.shuffle([...teamIds]);
  const order: DraftPick[] = [];
  for (let r = 1; r <= START.perTeam; r++) for (const t of r % 2 ? first : [...first].reverse()) order.push({season: 0, round: r, originalTeamId: t, ownerTeamId: t});
  state.draft = {season: 0, order, prospects: ids, picks: [], startup: true};
  state.phase = 'draft';
}

/** After the last startup pick: practice squads, contracts, strategies, the season 1 class; on to the preseason. */
function finishStartupDraft(catalog: Catalog, state: LeagueState, rng: Rng): void {
  const teamIds = Object.keys(state.teams);
  for (const t of teamIds) {
    for (const m of teamMons(state, t)) if (m.age <= 21) m.rookieSeason = 1;
    setPracticeSquad(state, t);
  }
  startRosters(catalog, state, rng, teamIds);
  state.phase = 'preseason';
  state.week = 0;
  inbox(state, 'league', 'The startup draft is done', 'Contracts are signed. Set your strategy and lineup, then start the season.');
}

/** Market-value contracts with 1–5 years left, scaled so the payroll lands between floor and cap
 * (a per-club target in START.payrollTarget, as a share of the cap). */
function assignContracts(catalog: Catalog, state: LeagueState, rng: Rng, teamId: TeamId): void {
  const mons = teamMons(state, teamId);
  const min = state.settings.minSalary, max = maxSalary(state);
  for (const m of mons) {
    const sal = marketSalary(catalog, state, m);
    const years = Math.max(1, Math.min(5, marketYears(m) + rng.range(-2, 1)));
    m.contract = makeContract(sal, years);
  }
  const [lo, hi] = START.payrollTarget;
  const target = state.settings.cap * (lo + (hi - lo) * rng.next());
  // scale the part above the minimum (both ways), clamping at the max salary; a few passes settle the clamps
  for (let pass = 0; pass < 6; pass++) {
    const total = mons.reduce((s, m) => s + m.contract!.salary, 0);
    if (Math.abs(total - target) < 100_000) break;
    const free = mons.filter(m => total < target ? m.contract!.salary < max : m.contract!.salary > min);
    const above = free.reduce((s, m) => s + (m.contract!.salary - min), 0);
    if (above <= 0) break;
    const f = Math.max(0, 1 + (target - total) / above);
    for (const m of free) m.contract!.salary = Math.max(min, Math.min(max, round50k(min + (m.contract!.salary - min) * f)));
  }
  for (const m of mons) if (m.contract!.salary <= min) { m.contract!.salary = min; m.contract!.exception = 'minimum'; }
}

/** Salary floor, the NFL way: at the start of the regular season a club under the floor pays the
 * shortfall as dead money for the season. */
export function enforceFloor(catalog: Catalog, state: LeagueState): void {
  for (const t of Object.values(state.teams)) {
    const short = state.settings.floor - payroll(state, t.id);
    if (short <= 0) continue;
    const amount = Math.ceil(short / 50_000) * 50_000;
    addDeadMoney(state, t.id, amount);
    logTx(state, 'floor', `${t.name} paid ${money(amount)} to reach the salary floor`, [t.id], []);
    if (t.id === state.userTeamId) inbox(state, 'deal', `Paid ${money(amount)} to reach the salary floor`,
      `Your payroll was ${money(state.settings.floor - short)}, under the ${money(state.settings.floor)} floor. The difference counts as dead money this season.`);
  }
}

/** Strategy-choice knobs: favourites win ties, but never over a strategy the roster can fill on-role. */
export const STRATEGY_PICK = {offRolePenalty: 40, favourite1: 6, favourite2: 3};

/**
 * AI: try every strategy and play the strongest lineup the roster can fill on-role, leaning to
 * the club's favourites (an off-role slot costs more than any favourite bonus).
 */
export function chooseStrategy(catalog: Catalog, state: LeagueState, teamId: TeamId, atStart = false): void {
  const team = state.teams[teamId];
  if (team.human && !team.lineup.auto) { normalizeTiers(catalog, state, teamId); return; }
  // the user keeps the strategy they play, except at league start: then the one their roster fits best
  // (with the club's favourites, like every club, so the New League preview shows exactly this lineup)
  if (team.human && !atStart) { autoLineup(catalog, state, teamId); return; }
  let best: {sid: string; plan: LineupPlan; score: number} | null = null;
  for (const st of STRATEGIES) {
    const plan = planLineup(catalog, state, teamId, st.id);
    const fav = team.human && !atStart ? 0 : st.id === team.favoriteStrategies[0] ? STRATEGY_PICK.favourite1 : st.id === team.favoriteStrategies[1] ? STRATEGY_PICK.favourite2 : 0;
    const filled = plan.slots.filter(sl => sl.monId).length;
    const score = plan.ratingSum / STARTERS - (STARTERS - plan.onRole) * STRATEGY_PICK.offRolePenalty - (STARTERS - filled) * 100 + fav
      + (st.id === team.lineup.strategyId ? 1 : 0);   // a little stickiness week to week
    if (!best || score > best.score) best = {sid: st.id, plan, score};
  }
  applyPlan(catalog, state, teamId, best!.sid, best!.plan);
}

// ---------------------------------------------------------------- weeks
export const userInvolved = (state: LeagueState, s: Series): boolean => s.homeId === state.userTeamId || s.awayId === state.userTeamId;

export function seriesWins(s: Series): Record<TeamId, number> {
  const w: Record<TeamId, number> = {[s.homeId]: 0, [s.awayId]: 0};
  for (const g of s.games) w[g.winnerTeamId] = (w[g.winnerTeamId] ?? 0) + 1;
  return w;
}

export function weekJobs(catalog: Catalog, state: LeagueState, gameIndex: number): BattleJob[] {
  if (state.phase !== 'regular' && state.phase !== 'playoffs') return [];
  const jobs: BattleJob[] = [];
  for (const s of seriesOfWeek(state, state.week)) {
    if (s.winnerId || s.games.length !== gameIndex) continue;
    const side = (teamId: TeamId) => {
      const t = state.teams[teamId];
      const f = fieldedLineup(catalog, state, teamId);
      return {teamId, name: `${t.city} ${t.name}`, trainer: t.trainer, export: teamExport(catalog, state, f), monIds: f.map(x => x.monId)};
    };
    const mine = userInvolved(state, s);
    const budget = mine ? state.settings.budgetMs.human : state.settings.budgetMs.ai;
    jobs.push({
      id: `${s.id}#${gameIndex}`, p1: side(s.homeId), p2: side(s.awayId),
      seed: Math.floor(hash01(state.seed, s.id, gameIndex) * 0x7fffffff),  // pure: calling twice gives the same jobs
      budgetMs: {p1: budget, p2: budget}, keepLog: mine || !!s.playoff,
    });
  }
  return jobs;
}

function lineFor(mon: Mon, season: number, teamId: TeamId) {
  let line = mon.stats.find(l => l.season === season && l.teamId === teamId);
  if (!line) {
    line = {season, teamId, series: 0, battles: 0, wins: 0, kos: 0, faints: 0, damageDealt: 0, damageTaken: 0, statusInflicted: 0, hazardsSet: 0, hazardsRemoved: 0, seriesMvps: 0};
    mon.stats.push(line);
  }
  return line;
}

export function applyResults(catalog: Catalog, state: LeagueState, results: BattleJobResult[]): void {
  const rng = leagueRng(state);
  for (const r of results) {
    const [sid, gs] = r.id.split('#');
    const s = state.schedule.find(x => x.id === sid);
    if (!s || s.winnerId || s.games.length !== Number(gs)) continue;
    const winnerTeamId = r.winner === 'p1' ? s.homeId : s.awayId;
    const keep = userInvolved(state, s) || !!s.playoff;
    const box: Record<MonId, MonBox> = {};
    // trust our own roster for the side (no trades happen mid-week)
    for (const [id, b] of Object.entries(r.box)) { const m = state.mons[id]; if (m) box[id] = {...b, teamId: m.teamId ?? b.teamId}; }
    const game: BattleResult = {id: r.id, winnerTeamId, turns: r.turns, log: keep ? r.log : undefined, box, summary: gameSummary(catalog, state, winnerTeamId, box, r.turns)};
    s.games.push(game);
    for (const [id, b] of Object.entries(box)) {
      if (!b.played) continue;
      const mon = state.mons[id];
      const line = lineFor(mon, state.season, b.teamId);
      line.battles++; if (b.teamId === winnerTeamId) line.wins++;
      line.kos += b.kos; line.faints += b.fainted ? 1 : 0; line.damageDealt += Math.round(b.damageDealt); line.damageTaken += Math.round(b.damageTaken);
      line.statusInflicted += b.statusInflicted; line.hazardsSet += b.hazardsSet; line.hazardsRemoved += b.hazardsRemoved;
      addXp(catalog, mon, battleXp(b, b.teamId === winnerTeamId));
      const inj = rollInjury(state, rng, mon, b);
      if (inj) {
        applyInjury(mon, inj);
        if (mon.teamId === state.userTeamId) {
          const what = inj.kind === 'day-to-day' ? 'day-to-day (plays one grade lower)' : inj.kind === 'out' ? `out ${inj.weeksLeft} week${inj.weeksLeft > 1 ? 's' : ''}` : `on injured reserve for ${inj.weeksLeft} weeks`;
          inbox(state, 'health', `${spName(catalog, mon)}: ${inj.description}`, `${spName(catalog, mon)} is ${what}.${inj.severe ? ' A severe injury: it will not fully recover.' : ''}`, {kind: 'mon', id: mon.id});
        }
      }
    }
    const wins = seriesWins(s);
    const need = Math.floor(s.bestOf / 2) + 1;
    const decided = Object.entries(wins).find(([, w]) => w >= need);
    if (decided) closeSeries(catalog, state, s, decided[0]);
  }
}

function closeSeries(catalog: Catalog, state: LeagueState, s: Series, winnerId: TeamId): void {
  s.winnerId = winnerId;
  s.mvpMonId = seriesMvp(s);
  const played = new Set<MonId>();
  for (const g of s.games) for (const [id, b] of Object.entries(g.box)) if (b.played) played.add(id);
  for (const id of played) {
    const m = state.mons[id];
    const teamId = s.games.find(g => g.box[id])!.box[id].teamId;
    lineFor(m, state.season, teamId).series++;
    if (teamId === winnerId) addXp(catalog, m, XP.seriesWinTeam);
  }
  if (s.mvpMonId) {
    const m = state.mons[s.mvpMonId];
    lineFor(m, state.season, winnerId).seriesMvps++;
    addXp(catalog, m, XP.seriesMvp);
    m.fame += FAME.seriesMvp;
  }
  s.summary = seriesSummary(catalog, state, s);
}

/** Finish any series the battle layer left undecided (crashes, missing results) with quicksim. */
function settleWeek(catalog: Catalog, state: LeagueState): void {
  for (let g = 0; g < 9; g++) {
    const jobs = weekJobs(catalog, state, g);
    if (jobs.length) applyResults(catalog, state, jobs.map(j => quickSim(catalog, state, j)));
  }
}

/** The three practice-squad prospects with the most to gain: an evolution within reach first, then
 * the most Growth left below their potential (youngest first on ties). */
export function defaultFocus(catalog: Catalog, mons: Mon[]): MonId[] {
  const gain = (m: Mon) => {
    const room = Math.max(0, GROWTH_BAND_HI[m.potential] - m.growth);
    const next = catalog.species[m.speciesId]?.evolvesTo.filter(e => e.level <= GROWTH_BAND_HI[m.potential]).map(e => e.level - m.growth).filter(d => d > 0) ?? [];
    return room + (next.length && Math.min(...next) <= 30 ? 40 : 0);
  };
  return mons.filter(m => m.tier === 'practice' && canBattle(m))
    .map(m => ({m, g: gain(m)}))
    .sort((a, b) => b.g - a.g || a.m.age - b.m.age || a.m.id.localeCompare(b.m.id))
    .slice(0, 3).map(x => x.m.id);
}

function practice(catalog: Catalog, state: LeagueState, rng: Rng, byTeam: Map<TeamId, Mon[]>): GrowthEvent[] {
  const events: GrowthEvent[] = [];
  for (const [teamId, mons] of byTeam) {
    const team = state.teams[teamId];
    // AI clubs focus their best prospects every week; the user's club starts with the same picks
    // (shown under Practice in "Before you play") until the user chooses
    if (!team.human || team.practiceFocus === undefined) team.practiceFocus = defaultFocus(catalog, mons);
    const focus = new Set(team.practiceFocus ?? []);
    for (const m of mons) {
      if (m.injury && m.injury.kind !== 'day-to-day') continue;
      const base = m.tier === 'active' ? XP.practiceActive : m.tier === 'backup' ? XP.practiceBackup : XP.practiceSquad;
      addXp(catalog, m, base + (focus.has(m.id) ? XP.focus : 0) + rng.int(10));
      events.push(...levelUp(catalog, state, rng, m));
    }
  }
  return events;
}

export function finishWeek(catalog: Catalog, state: LeagueState): void {
  if (state.phase !== 'regular' && state.phase !== 'playoffs') return;
  settleWeek(catalog, state);
  const rng = leagueRng(state);
  const pause: string[] = [];
  const user = state.userTeamId;
  // results to the inbox
  for (const s of seriesOfWeek(state, state.week)) {
    if (!userInvolved(state, s)) continue;
    const w = seriesWins(s);
    const opp = s.homeId === user ? s.awayId : s.homeId;
    const won = s.winnerId === user;
    inbox(state, 'league', `${won ? 'Won' : 'Lost'} ${w[user]}–${w[opp]} vs ${state.teams[opp].name}`, s.summary ?? '', {kind: 'series', id: s.id});
  }
  // weekly goals (checked before practice so the bonus counts toward this week's growth)
  const byTeam = monsByTeam(state);
  for (const [t, mons] of byTeam) {
    const s = seriesOfWeek(state, state.week).find(x => x.homeId === t || x.awayId === t);
    checkGoal(catalog, state, t, s, mons.filter(m => m.tier === 'active'));
  }
  // practice, growth, evolution
  const events = practice(catalog, state, rng, byTeam);
  for (const e of events) {
    if (e.mon.teamId !== user) continue;
    if (e.kind === 'evolved') inbox(state, 'growth', `${e.from} evolved into ${e.to}`, `Growth ${e.mon.growth} unlocked the evolution.`, {kind: 'mon', id: e.mon.id});
    else if (e.kind === 'grade-up') inbox(state, 'growth', `${spName(catalog, e.mon)} reached grade ${e.to}`, `Up from ${e.from}: its EV spread grows to the new grade.`, {kind: 'mon', id: e.mon.id});
  }
  // injuries count down
  const healed = tickInjuries(state);
  for (const m of healed) if (m.teamId === user && m.tier === 'ir') inbox(state, 'health', `${spName(catalog, m)} is back from injured reserve`, 'Ready to play.', {kind: 'mon', id: m.id});
  // a starter (in the lineup, or active before an IR injury moved it) hurt this week for 2+ weeks
  const starters = new Set(state.teams[user].lineup.slots.map(sl => sl.monId).filter(Boolean));
  for (const id in state.mons) {
    const m = state.mons[id];
    if (m.teamId === user && !m.retired && m.injury && m.injury.kind !== 'day-to-day' && m.injury.sinceWeek === state.week && m.injury.season === state.season && m.injury.weeksLeft >= 2 && (m.tier === 'active' || starters.has(m.id))) {
      pause.push(`${spName(catalog, m)} is out ${m.injury.weeksLeft} weeks${m.injury.kind === 'ir' ? ' (injured reserve)' : ''}`);
    }
  }
  // tiers, lineups, rosters (waiver priority = reverse standings)
  for (const t of Object.keys(state.teams)) normalizeTiers(catalog, state, t);
  enforceRosters(catalog, state, rng, reverseStandings(state));
  for (const t of Object.keys(state.teams)) chooseStrategy(catalog, state, t);
  // trades
  expireOffers(state);
  if (state.phase === 'regular' && state.week < state.settings.tradeDeadlineWeek) {
    if (rng.chance(START.aiOfferChance)) {
      const o = makeAiOffer(catalog, state, rng);
      if (o) pause.push(`${state.teams[o.fromTeamId].name} sent a trade offer`);
    }
    if (rng.chance(START.aiTradeChance)) aiTrade(catalog, state, rng);
  }
  // scouting
  const prospects = availableProspects(state);
  for (const t of Object.values(state.teams)) {
    t.scoutingPoints = state.settings.scoutingPointsPerWeek;
    if (!t.human && prospects.length) aiScout(catalog, state, t.id, prospects);
  }
  state.pauseReasons = pause;
  const nextGoals = () => {
    for (const t of Object.keys(state.teams)) {
      if (!seriesOfWeek(state, state.week).some(x => x.homeId === t || x.awayId === t)) continue;
      const starters = state.teams[t].lineup.slots.map(sl => sl.monId && state.mons[sl.monId]).filter((m): m is Mon => !!m);
      setGoal(catalog, state, rng, t, starters);
    }
  };
  // advance
  if (state.phase === 'regular') {
    if (state.week < state.settings.weeks) { state.week++; nextGoals(); }
    else {
      state.phase = 'playoffs';
      startPlayoffs(state);
      const inField = state.schedule.some(s => s.playoff && userInvolved(state, s));
      inbox(state, 'league', inField ? 'You made the Indigo Plateau' : 'The regular season is over', inField ? 'Six clubs play for the Plateau.' : 'Your season is over; the Indigo Plateau starts.');
    }
  } else if (advancePlayoffs(state)) {
    enterAwards(catalog, state);
  } else nextGoals();
}

// ---------------------------------------------------------------- offseason
function enterAwards(catalog: Catalog, state: LeagueState): void {
  state.phase = 'awards';
  const fin = finalSeries(state)!;
  const awards = seasonAwards(catalog, state);
  const recs = reverseStandings(state).reverse();
  const tally = new Map<TeamId, {w: number; l: number}>();
  for (const s of state.schedule) if (!s.playoff && s.winnerId) {
    for (const t of [s.homeId, s.awayId]) { const r = tally.get(t) ?? {w: 0, l: 0}; if (s.winnerId === t) r.w++; else r.l++; tally.set(t, r); }
  }
  state.history.push({
    season: state.season, championId: fin.winnerId!, runnerUpId: fin.winnerId === fin.homeId ? fin.awayId : fin.homeId, awards,
    standings: recs.map(t => ({teamId: t, wins: tally.get(t)?.w ?? 0, losses: tally.get(t)?.l ?? 0})),
  });
  const champ = state.teams[fin.winnerId!];
  logTx(state, 'champion', `${champ.city} ${champ.name} win the Indigo Plateau`, [champ.id], []);
  inbox(state, 'honour', `${champ.city} ${champ.name} are champions`, fin.summary ?? '', {kind: 'series', id: fin.id});
  const mvp = awards.find(a => a.award === 'MVP');
  if (mvp) inbox(state, 'honour', `${spName(catalog, state.mons[mvp.monId])} is the MVP`, `${state.teams[mvp.teamId].name}`, {kind: 'mon', id: mvp.monId});
  for (const a of awards) if (a.teamId === state.userTeamId && a.award !== 'MVP') inbox(state, 'honour', `${spName(catalog, state.mons[a.monId])}: ${a.award}`, '', {kind: 'mon', id: a.monId});
}

function retire(catalog: Catalog, state: LeagueState, m: Mon): void {
  const hof = hallOfFameWorthy(m);
  if (m.teamId) removeFromLineup(state, m.teamId, m.id);
  const teamId = m.teamId;
  m.retired = {season: state.season, hallOfFame: hof};
  m.teamId = null; m.contract = null; m.injury = null; m.prospect = undefined;
  returnToPool(state, m.family);
  if (hof) {
    logTx(state, 'hall-of-fame', `${spName(catalog, m)} enters the hall of fame`, teamId ? [teamId] : [], [m.id]);
    inbox(state, 'honour', `${spName(catalog, m)} enters the hall of fame`, `Retired at ${m.age}.`, {kind: 'mon', id: m.id});
  } else if (teamId === state.userTeamId) inbox(state, 'decline', `${spName(catalog, m)} retired`, `Retired at ${m.age}.`, {kind: 'mon', id: m.id});
}

function tickContracts(catalog: Catalog, state: LeagueState): void {
  for (const id in state.mons) {
    const m = state.mons[id];
    if (!m.teamId || !m.contract || m.retired) continue;
    m.contract.yearsLeft--;
    const c = m.contract;
    if (c.yearsLeft <= 0 && c.rookie?.fifthYearOption) {
      c.rookie.fifthYearOption = false;
      const sal = Math.max(c.salary, round50k(marketSalary(catalog, state, m) * 0.9));
      if (bestRole(catalog, m).ovr >= 78 && canAfford(state, m.teamId, sal)) {
        m.contract = {...c, salary: sal, yearsLeft: 1, originalYears: c.originalYears + 1, exception: undefined};
        logTx(state, 'option', `${state.teams[m.teamId].name} picked up ${spName(catalog, m)}'s fifth-year option`, [m.teamId], [m.id]);
      }
    }
  }
}

function newSeason(catalog: Catalog, state: LeagueState, rng: Rng): void {
  state.season++;
  state.week = 0;
  state.phase = 'preseason';
  state.faRound = undefined;
  state.settings.cap = round50k(state.settings.cap * (1 + state.settings.capGrowth));
  state.settings.floor = round50k(state.settings.floor * (1 + state.settings.capGrowth));
  for (const id in state.mons) {
    const m = state.mons[id];
    if (m.retired) continue;
    const ev = ageMon(catalog, rng, m);
    if (ev && m.teamId === state.userTeamId) inbox(state, 'decline', `${spName(catalog, m)} slipped to grade ${ev.to}`, `Age ${m.age} is past its prime.`, {kind: 'mon', id: m.id});
  }
  healAll(state);
  for (const t of Object.values(state.teams)) t.deadMoney = t.deadMoney.filter(d => d.season >= state.season);
  state.offers = [];
  ensurePicks(state, state.season);
  generateClass(catalog, state, rng, state.season);
  state.schedule = buildSchedule(state, Object.keys(state.teams));
  for (const t of Object.keys(state.teams)) normalizeTiers(catalog, state, t);
}

export function advancePhase(catalog: Catalog, state: LeagueState): void {
  const rng = leagueRng(state);
  if (state.phase !== 'regular' && state.phase !== 'playoffs') state.pauseReasons = [];  // only a played week pauses a sim
  switch (state.phase) {
    case 'preseason': {
      // the user's roster is never trimmed silently: Play asks first (api.trimRoster)
      const over = rosterCount(teamMons(state, state.userTeamId)) - ROSTER;
      if (over > 0) {
        state.pauseReasons = [`Your roster has ${ROSTER + over} outside injured reserve: release ${over} before the season starts`];
        return;
      }
      enforceRosters(catalog, state, rng, Object.keys(state.teams), ROSTER, false);
      littleCup(catalog, state, rng);
      for (const t of Object.keys(state.teams)) chooseStrategy(catalog, state, t);
      state.phase = 'regular';
      state.week = 1;
      enforceFloor(catalog, state);
      for (const t of Object.keys(state.teams)) {
        const starters = state.teams[t].lineup.slots.map(sl => sl.monId && state.mons[sl.monId]).filter((m): m is Mon => !!m);
        setGoal(catalog, state, rng, t, starters);
      }
      return;
    }
    case 'regular': case 'playoffs': return;
    case 'awards': {
      for (const id in state.mons) {
        const m = state.mons[id];
        if (m.retired || m.prospect !== undefined) continue;
        if (rng.chance(retireChance(catalog, m))) retire(catalog, state, m);
      }
      for (const m of pruneFreeAgents(catalog, state)) retire(catalog, state, m);
      tickContracts(catalog, state);
      state.phase = 'draft-lottery';
      runLottery(state, rng);
      return;
    }
    case 'draft-lottery': state.phase = 'draft'; return;
    case 'draft': {
      if (state.draft?.startup) { completeDraft(catalog, state); finishStartupDraft(catalog, state, rng); return; }
      completeDraft(catalog, state);
      state.phase = 'resign';
      const expiring = teamMons(state, state.userTeamId).filter(m => m.contract && m.contract.yearsLeft <= 0);
      if (expiring.length) inbox(state, 'deal', `${expiring.length} contract${expiring.length > 1 ? 's' : ''} expiring`, 'Re-sign or tag them before free agency opens.');
      return;
    }
    case 'resign': {
      aiResign(catalog, state, rng);
      releaseExpiring(catalog, state);
      state.phase = 'free-agency';
      state.faRound = 0;
      return;
    }
    case 'free-agency': {
      faRound(catalog, state, rng);
      state.faRound = (state.faRound ?? 0) + 1;
      if (state.faRound >= FA_ROUNDS) newSeason(catalog, state, rng);
      return;
    }
  }
}

/** Preseason Little Cup (simplified, no battles): half the clubs' rookies win bonus Growth. */
function littleCup(catalog: Catalog, state: LeagueState, rng: Rng): void {
  const winners = rng.shuffle(Object.keys(state.teams)).slice(0, 8);
  for (const t of winners) for (const m of teamMons(state, t)) {
    if (m.rookieSeason !== state.season) continue;
    addXp(catalog, m, 250);
    levelUp(catalog, state, rng, m);
  }
  if (winners.includes(state.userTeamId)) inbox(state, 'growth', 'Your rookies won their Little Cup bracket', 'Each rookie gets bonus Growth.');
}

/** Sync week with a resolver (quicksim by default): every game of every series, then finishWeek. */
export function playWeekSync(catalog: Catalog, state: LeagueState, resolve: (c: Catalog, s: LeagueState, j: BattleJob) => BattleJobResult = quickSim): void {
  const max = Math.max(state.settings.seriesBestOf, state.settings.finalBestOf);
  for (let g = 0; g < max; g++) {
    const jobs = weekJobs(catalog, state, g);
    if (!jobs.length) break;
    applyResults(catalog, state, jobs.map(j => resolve(catalog, state, j)));
  }
  finishWeek(catalog, state);
}

export {freeAgents, capPayroll};
