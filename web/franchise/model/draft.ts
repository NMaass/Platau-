// Draft: class generation from the rarity pool, NBA-style lottery for the 10
// non-playoff teams (top 4 drawn), 3 rounds of 16, AI picks by perceived value
// and their favourite strategies' needs, rookie scale contracts.
import type {Catalog, DraftPick, LeagueState, Mon, MonId, TeamId} from '../types.ts';
import type {Rng} from './rng.ts';
import {clubFamilies, drawFamily, monFamily} from './pool.ts';
import {createMon} from './mons.ts';
import {rookieContract} from './cap.ts';
import {reverseStandings, rankTeams} from './standings.ts';
import {playoffTeams} from './playoffs.ts';
import {projectedOvr, needBoost, slotFits} from './value.ts';
import {allRoles} from './ratings.ts';
import {strategyById} from './strategies.ts';
import {logTx} from './util.ts';
import {inbox} from './inbox.ts';
import {knownRating} from './scouting.ts';

export const LOTTERY_ODDS = [18, 18, 16, 13, 10, 8, 6, 5, 4, 2];
export const LOTTERY_PICKS = 4;
export const ROUNDS = 3;
export const CLASS_SIZE = 60;
/** Legendary arrivals per class: 0 (25%), 1 (70%), 2 (5%). */
export const LEGEND_ARRIVALS: [number, number][] = [[0, 25], [1, 70], [2, 5]];

export function generateClass(catalog: Catalog, state: LeagueState, rng: Rng, season: number, size = CLASS_SIZE): MonId[] {
  const ids: MonId[] = [];
  const legends = rng.weighted(LEGEND_ARRIVALS, x => x[1])![0];
  for (let i = 0; i < size; i++) {
    const fam = (i < legends ? drawFamily(catalog, state, rng, 'legendary') : null) ?? drawFamily(catalog, state, rng, 'nonlegendary');
    if (!fam) break;
    const age = rng.weighted([[21, 40], [22, 35], [23, 25]] as [number, number][], x => x[1])![0];
    const m = createMon(catalog, state, rng, {family: fam, age, growth: rng.range(3, 26), teamId: null, tier: 'practice'});
    m.prospect = season;
    ids.push(m.id);
  }
  state.draft = {season, order: [], prospects: ids, picks: []};
  return ids;
}

/** Make sure every team owns its own picks for the next `ahead` drafts (new seasons only add). */
export function ensurePicks(state: LeagueState, fromSeason: number, ahead = 3): void {
  const teams = Object.values(state.teams);
  const all = teams.flatMap(t => t.draftPicks);
  for (let s = fromSeason; s < fromSeason + ahead; s++) for (const t of teams) for (let r = 1; r <= ROUNDS; r++) {
    if (!all.some(p => p.season === s && p.round === r && p.originalTeamId === t.id)) t.draftPicks.push({season: s, round: r, originalTeamId: t.id, ownerTeamId: t.id});
  }
}

export function ownerOf(state: LeagueState, season: number, round: number, original: TeamId): DraftPick | undefined {
  for (const t of Object.values(state.teams)) {
    const p = t.draftPicks.find(x => x.season === season && x.round === round && x.originalTeamId === original);
    if (p) return p;
  }
  return undefined;
}

/** Draw the top `LOTTERY_PICKS` among `worstFirst` (10 teams) with LOTTERY_ODDS; returns the full lottery order. */
export function drawLottery(rng: Rng, worstFirst: TeamId[]): TeamId[] {
  const odds = new Map(worstFirst.map((t, i) => [t, LOTTERY_ODDS[i] ?? 0]));
  const winners: TeamId[] = [];
  for (let k = 0; k < LOTTERY_PICKS; k++) {
    const left = worstFirst.filter(t => !winners.includes(t));
    winners.push(rng.weighted(left, t => odds.get(t)!)!);
  }
  return [...winners, ...worstFirst.filter(t => !winners.includes(t))];
}

/** Lottery + pick order for this season's draft. Playoff teams pick 11–16 by elimination, champion last. */
export function runLottery(state: LeagueState, rng: Rng): void {
  const season = state.season;
  const po = new Set(playoffTeams(state));
  const worst = reverseStandings(state);
  const lotteryTeams = worst.filter(t => !po.has(t));
  const lotteryOrder = drawLottery(rng, lotteryTeams);
  const elimRank = (t: TeamId): number => {
    const ps = state.schedule.filter(s => s.playoff && (s.homeId === t || s.awayId === t));
    const lostAt = ps.find(s => s.winnerId && s.winnerId !== t);
    if (!lostAt) return 4;
    return lostAt.playoff === 'round1' ? 1 : lostAt.playoff === 'conference' ? 2 : 3;
  };
  const playoffOrder = worst.filter(t => po.has(t)).sort((a, b) => elimRank(a) - elimRank(b) || worst.indexOf(a) - worst.indexOf(b));
  const round1 = [...lotteryOrder, ...playoffOrder];
  const later = [...lotteryTeams, ...playoffOrder];
  const order: DraftPick[] = [];
  for (let r = 1; r <= ROUNDS; r++) for (const t of r === 1 ? round1 : later) {
    const p = ownerOf(state, season, r, t) ?? {season, round: r, originalTeamId: t, ownerTeamId: t};
    order.push({...p});
  }
  if (!state.draft || state.draft.season !== season) state.draft = {season, order: [], prospects: [], picks: []};
  state.draft.order = order;
  state.draft.lottery = lotteryTeams.map((t, i) => ({teamId: t, odds: LOTTERY_ODDS[i] ?? 0, result: lotteryOrder.indexOf(t) + 1}));
  const me = state.draft.lottery.find(l => l.teamId === state.userTeamId);
  if (me) inbox(state, 'league', `Draft lottery: you pick ${me.result}${ordinal(me.result)}`, `You went in with ${me.odds}% odds for the first pick.`);
}

export const ordinal = (n: number): string => (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

export function onTheClock(state: LeagueState): DraftPick | null {
  const d = state.draft;
  if (!d || !d.order.length) return null;
  return d.order[d.picks.length] ?? null;
}

/** What a club may draft: the board without families it already has (species clause); the whole board if nothing else is left. */
export function draftableFor(state: LeagueState, teamId: TeamId, avail = availableProspects(state)): Mon[] {
  const fams = clubFamilies(state, teamId);
  const ok = avail.filter(m => !fams.has(monFamily(m)));
  return ok.length ? ok : avail;
}

export function availableProspects(state: LeagueState): Mon[] {
  const d = state.draft;
  if (!d) return [];
  const taken = new Set(d.picks.map(p => p.monId));
  return d.prospects.filter(id => !taken.has(id)).map(id => state.mons[id]).filter(m => m && m.prospect !== undefined);
}

/** AI (or auto) choice: perceived projected rating + need for its strategies. */
export function aiChoice(catalog: Catalog, state: LeagueState, teamId: TeamId): Mon | undefined {
  if (state.draft?.startup) return startupChoice(catalog, state, teamId);
  const avail = draftableFor(state, teamId);
  let best: Mon | undefined, bestScore = -Infinity;
  for (const m of avail) {
    const k = knownRating(catalog, state, teamId, m);
    const score = projectedOvr(catalog, state, teamId, m) + (k.lo + k.hi) / 2 * 0.2 + needBoost(catalog, state, teamId, m) * 10;
    if (score > bestScore || (score === bestScore && best && m.id < best.id)) { best = m; bestScore = score; }
  }
  return best;
}

/** Startup-draft knobs: role need in both favourite strategies (`perPoint` per rating point a pick adds to a slot,
 *  at most `maxGain` points, for the first `needUntil` picks), gym-type bonus up to `typed` picks, age. */
export const STARTUP_AI = {perPoint: 1, maxGain: 30, fav2: 0.8, needUntil: 12, type: 4, typed: 9, young: 2, old: -3};

const rolesCache = new WeakMap<Mon, {role: string; ovr: number}[]>();
const rolesOf = (catalog: Catalog, m: Mon) => { let r = rolesCache.get(m); if (!r) { r = allRoles(catalog, m); rolesCache.set(m, r); } return r; };

/** Startup draft (every rating known): best rating, plus what the pick adds to the club's two favourite strategies'
 *  slots (role-aware: an open slot or a weak fit counts most) and, for about half the roster, the gym's type. */
export function startupChoice(catalog: Catalog, state: LeagueState, teamId: TeamId): Mon | undefined {
  const team = state.teams[teamId];
  const mine = Object.values(state.mons).filter(m => m.teamId === teamId);
  const [f1, f2] = team.favoriteStrategies;
  const favs: [string[][], number[], number][] = [[f1, 1], ...(f2 && f2 !== f1 ? [[f2, STARTUP_AI.fav2] as [string, number]] : [])]
    .map(([sid, w]) => [strategyById(sid as string).slots as string[][], slotFits(catalog, state, teamId, sid as string), w as number]);
  const typed = mine.filter(m => catalog.species[m.speciesId]?.types.includes(team.gymType ?? '')).length;
  let best: Mon | undefined, bestScore = -Infinity;
  for (const m of draftableFor(state, teamId)) {
    const roles = rolesOf(catalog, m);
    const ovr = roles[0]?.ovr ?? 0;
    let score = ovr + (m.age <= 24 ? STARTUP_AI.young : m.age >= 31 ? STARTUP_AI.old : 0);
    if (mine.length < STARTUP_AI.needUntil) {
      let gain = 0;
      for (const [slots, fits, w] of favs) slots.forEach((slot, i) => {
        let f = 0;
        for (const r of roles) if (r.ovr > f && slot.includes(r.role)) f = r.ovr;
        if (f) gain = Math.max(gain, w * Math.min(STARTUP_AI.maxGain, f - fits[i]));
      });
      score += STARTUP_AI.perPoint * gain;
    }
    if (typed < STARTUP_AI.typed && team.gymType && catalog.species[m.speciesId]?.types.includes(team.gymType)) score += STARTUP_AI.type;
    if (score > bestScore || (score === bestScore && best && m.id < best.id)) { best = m; bestScore = score; }
  }
  return best;
}

export function makePick(catalog: Catalog, state: LeagueState, monId: MonId): {ok: boolean; reason: string} {
  const d = state.draft;
  const pick = onTheClock(state);
  if (!d || !pick) return {ok: false, reason: 'No pick on the clock'};
  const mon = state.mons[monId];
  if (!mon || mon.prospect === undefined || d.picks.some(p => p.monId === monId)) return {ok: false, reason: 'Not available'};
  if (!draftableFor(state, pick.ownerTeamId).includes(mon)) return {ok: false, reason: `Already one of the ${catalog.species[mon.speciesId]?.name ?? 'Pokémon'} line on this club: one of a species per club`};
  const overall = d.picks.length + 1;
  const inRound = overall - (pick.round - 1) * 16;
  d.picks.push({pick, monId});
  const teamId = pick.ownerTeamId;
  mon.teamId = teamId;
  mon.prospect = undefined;
  if (d.startup) {
    // contracts and practice squads are set when the startup draft ends (season.ts)
    mon.tier = 'backup';
    mon.draft = {season: 0, round: pick.round, pick: overall, teamId};
    return {ok: true, reason: `Drafted at #${overall}`};
  }
  mon.tier = 'practice';
  mon.contract = rookieContract(state, pick.round, inRound, overall);
  mon.draft = {season: d.season, round: pick.round, pick: overall, teamId};
  mon.rookieSeason = d.season + 1;
  const owner = state.teams[teamId];
  owner.draftPicks = owner.draftPicks.filter(p => !(p.season === pick.season && p.round === pick.round && p.originalTeamId === pick.originalTeamId));
  const name = catalog.species[mon.speciesId].name;
  logTx(state, 'draft', `${owner.name} drafted ${name} (#${overall})`, [teamId], [mon.id]);
  if (owner.human) inbox(state, 'league', `You drafted ${name} at #${overall}`, 'Rookies start on the practice squad.', {kind: 'mon', id: mon.id});
  return {ok: true, reason: `Drafted at #${overall}`};
}

/** AI picks until the user is on the clock (or the draft ends). */
export function simToUser(catalog: Catalog, state: LeagueState): void {
  for (let p = onTheClock(state); p && p.ownerTeamId !== state.userTeamId; p = onTheClock(state)) {
    const m = aiChoice(catalog, state, p.ownerTeamId);
    if (!m) break;
    makePick(catalog, state, m.id);
  }
}

/** Finish the draft (the user's remaining picks are made by the auto-picker); undrafted become free agents. */
export function completeDraft(catalog: Catalog, state: LeagueState): void {
  for (let p = onTheClock(state); p; p = onTheClock(state)) {
    const m = aiChoice(catalog, state, p.ownerTeamId);
    if (!m) break;
    makePick(catalog, state, m.id);
  }
  for (const m of availableProspects(state)) { m.prospect = undefined; m.faSince = state.season; m.askMult = 0.8; }
}

export {rankTeams};
