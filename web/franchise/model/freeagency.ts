// Re-signing window, franchise tag, 3 free-agency bidding rounds, in-season FA.
import type {Catalog, LeagueState, Mon, TeamId} from '../types.ts';
import type {Rng} from './rng.ts';
import {canAfford, capYear, makeContract, marketSalary, marketYears, maxSalary, payroll} from './cap.ts';
import {round50k} from './util.ts';
import {gi} from './grades.ts';
import {lineupGain, monValue} from './value.ts';
import {freeAgents, logTx, money, monLabel, rosterCount, teamMons} from './util.ts';
import {releaseMon, signMon} from './roster.ts';
import {clubFamilies, clubHasFamily, monFamily} from './pool.ts';
import {ROSTER, autoLineup, removeFromLineup} from './lineup.ts';
import {bestRole} from './ratings.ts';
import {inbox} from './inbox.ts';

export const FA_ROUNDS = 3;
export const FA_ASK_DROP = 0.85;

const spName = (catalog: Catalog, state: LeagueState, m: Mon) => monLabel(catalog, state, m);

/** Expiring this offseason (contracts ticked at the draft lottery): yearsLeft 0 while still on the team. */
export const isExpiring = (m: Mon): boolean => !!m.teamId && !!m.contract && m.contract.yearsLeft <= 0;

export function askingPrice(catalog: Catalog, state: LeagueState, mon: Mon): {salary: number; years: number} {
  const base = marketSalary(catalog, state, mon);
  const salary = Math.max(state.settings.minSalary, round50k(base * (mon.askMult ?? 1)));
  return {salary, years: marketYears(mon)};
}

/** Interest in a club: deterministic-ish by mon and team, shown as Keen / Neutral / Cool. */
export function interest(state: LeagueState, mon: Mon, teamId: TeamId): 'Keen' | 'Neutral' | 'Cool' {
  const n = (parseInt(mon.id.slice(1), 36) + parseInt(teamId.slice(1), 10) * 7 + state.season) % 10;
  return n < 3 ? 'Keen' : n < 8 ? 'Neutral' : 'Cool';
}

/** What interest does to the salary a free agent takes (× its ask). */
export const INTEREST_MULT = {Keen: 0.95, Neutral: 1, Cool: 1.08};
const interestMult = INTEREST_MULT;

/** Why this team can't sign this mon at any price right now ('' = it can negotiate). Checked before an offer is built. */
export function signBlock(state: LeagueState, teamId: TeamId, mon: Mon): {reason: string; rosterFull: boolean} {
  const no = (reason: string, rosterFull = false) => ({reason, rosterFull});
  if (mon.retired) return no('Retired');
  const resign = mon.teamId === teamId && isExpiring(mon);
  if (!resign && mon.teamId) return no('Under contract with a club');
  if (!resign && mon.prospect !== undefined) return no('In the draft class');
  if (resign && state.phase !== 'resign') return no('Re-signing happens in the re-sign window');
  if (resign) return no('');
  if (clubHasFamily(state, teamId, mon)) return no('Already one of this species on the club');
  if (state.phase === 'regular' && state.week > state.settings.weeks) return no('Season over');
  const inSeason = state.phase === 'regular' || state.phase === 'playoffs';
  const n = rosterCount(teamMons(state, teamId));
  if (inSeason && n >= ROSTER) return no('Roster full: release someone first', true);
  if (!inSeason && n >= ROSTER + 4) return no('Roster full for the offseason (22 at most): release someone first', true);
  return no('');
}

/** Cap rule for one salary: over the cap, only minimum deals ('' = fits). */
export function capBlock(state: LeagueState, teamId: TeamId, salary: number): string {
  return canAfford(state, teamId, salary) ? '' : `Over the cap after this deal: only minimum deals (${money(state.settings.minSalary)}) fit`;
}

export function offerContract(catalog: Catalog, state: LeagueState, teamId: TeamId, mon: Mon, salary: number, years: number): {accepted: boolean; reason: string} {
  const s = state.settings;
  if (years < 1 || years > 7) return {accepted: false, reason: 'Contracts run 1 to 7 years'};
  if (salary < s.minSalary) return {accepted: false, reason: `The minimum is ${money(s.minSalary)}`};
  if (salary > maxSalary(state)) return {accepted: false, reason: `The maximum is ${money(maxSalary(state))}`};
  const resign = mon.teamId === teamId && isExpiring(mon);
  const block = signBlock(state, teamId, mon).reason;
  if (block) return {accepted: false, reason: block};
  const cap = capBlock(state, teamId, salary);
  if (cap) return {accepted: false, reason: cap};
  const ask = askingPrice(catalog, state, mon);
  const need = Math.min(maxSalary(state), ask.salary * interestMult[interest(state, mon, teamId)] * (resign ? 0.97 : 1));
  // more years for a young mon, fewer for a veteran, shift the price a little
  const yearsAdj = 1 + (years - ask.years) * (mon.age <= 27 ? -0.02 : 0.03);
  if (salary * yearsAdj < need * 0.995 && salary > s.minSalary) return {accepted: false, reason: `Wants about ${money(Math.ceil(need / 50_000) * 50_000)} a year`};
  if (salary <= s.minSalary && ask.salary > s.minSalary * 1.05) return {accepted: false, reason: `Wants about ${money(ask.salary)} a year`};
  const c = makeContract(salary, years, {exception: salary <= s.minSalary ? 'minimum' : undefined});
  if (resign) {
    mon.contract = c;
    logTx(state, 're-sign', `${state.teams[teamId].name} re-signed ${spName(catalog, state, mon)} (${money(salary)} x ${years})`, [teamId], [mon.id]);
  } else {
    signMon(catalog, state, teamId, mon, c);
    const team = state.teams[teamId];
    if (!team.human || team.lineup.auto) autoLineup(catalog, state, teamId);
  }
  return {accepted: true, reason: resign ? 'Re-signed' : 'Signed'};
}

export function franchiseTagPrice(catalog: Catalog, state: LeagueState, mon: Mon): number {
  return Math.min(maxSalary(state), Math.max(round50k(askingPrice(catalog, state, mon).salary * 1.3), round50k(state.settings.cap * 0.12)));
}

export function franchiseTagCheck(catalog: Catalog, state: LeagueState, mon: Mon): {ok: boolean; reason: string; salary: number} {
  const teamId = mon.teamId;
  const salary = franchiseTagPrice(catalog, state, mon);
  if (!teamId || !isExpiring(mon)) return {ok: false, reason: 'Only an expiring contract can be tagged', salary};
  if (state.phase !== 'resign') return {ok: false, reason: 'Tags are used in the re-sign window', salary};
  if (state.teams[teamId].tagSeason === state.season) return {ok: false, reason: 'You used your one franchise tag this offseason', salary};
  if (!canAfford(state, teamId, salary)) return {ok: false, reason: 'Not enough cap space for the tag', salary};
  return {ok: true, reason: `One year at ${money(salary)}`, salary};
}

export function franchiseTag(catalog: Catalog, state: LeagueState, mon: Mon): {ok: boolean; reason: string} {
  const chk = franchiseTagCheck(catalog, state, mon);
  if (!chk.ok) return chk;
  mon.contract = makeContract(chk.salary, 1, {guaranteedYears: 1, tagged: true});
  state.teams[mon.teamId!].tagSeason = state.season;
  logTx(state, 'tag', `${state.teams[mon.teamId!].name} tagged ${spName(catalog, state, mon)} (${money(chk.salary)})`, [mon.teamId!], [mon.id]);
  return {ok: true, reason: chk.reason};
}

/** AI re-sign decisions at the close of the window. */
export function aiResign(catalog: Catalog, state: LeagueState, rng: Rng): void {
  for (const team of Object.values(state.teams)) {
    if (team.human) continue;
    const mons = teamMons(state, team.id);
    const ovrs = mons.map(m => bestRole(catalog, m).ovr).sort((a, b) => b - a);
    const bar = ovrs[13] ?? 0;
    const expiring = mons.filter(isExpiring).sort((a, b) => monValue(catalog, state, b, team.id) - monValue(catalog, state, a, team.id));
    for (const m of expiring) {
      const ask = askingPrice(catalog, state, m);
      const o = bestRole(catalog, m).ovr;
      const keep = m.age <= 32 && (o >= bar || (m.age <= 25 && gi(m.potential) >= 3));
      if (!keep || !rng.chance(0.85)) continue;
      if (canAfford(state, team.id, ask.salary)) {
        m.contract = makeContract(ask.salary, ask.years);
        logTx(state, 're-sign', `${team.name} re-signed ${spName(catalog, state, m)} (${money(ask.salary)} x ${ask.years})`, [team.id], [m.id]);
      } else if (team.tagSeason !== state.season && o >= (ovrs[2] ?? 99)) {
        franchiseTag(catalog, state, m);
      }
    }
  }
}

/** Unsigned expiring contracts become free agents. */
export function releaseExpiring(catalog: Catalog, state: LeagueState): void {
  for (const id in state.mons) {
    const m = state.mons[id];
    if (m.retired || !isExpiring(m)) continue;
    const teamId = m.teamId!;
    const human = state.teams[teamId].human;
    removeFromLineup(state, teamId, m.id);
    m.teamId = null; m.contract = null; m.tier = 'practice'; m.faSince = state.season; m.askMult = 1;
    logTx(state, 'free-agent', `${spName(catalog, state, m)} left ${state.teams[teamId].name} in free agency`, [teamId], [m.id]);
    if (human) inbox(state, 'deal', `${spName(catalog, state, m)} hit free agency`, 'The contract ran out without a new deal.', {kind: 'mon', id: m.id});
  }
}

/** FA bidding knobs: a club bids more the more the mon adds to its lineup (rating points over its current best fit in
 *  the strategies it builds toward), and a club under the salary floor spends toward it (the shortfall is charged
 *  as dead money anyway). */
export const FA_BID = {gainEager: 1 / 40, gainEagerMax: 0.15, needGain: 3, floorEager: 0.25, floorPay: 4, floorExtra: 3, floorMargin: 1.04};

/**
 * One bidding round: AI teams bid by lineup gain and cap room, and spend toward the floor; each free agent
 * takes the best offer by total money weighted to guaranteed years; unsigned free agents lower their ask.
 */
export function faRound(catalog: Catalog, state: LeagueState, rng: Rng): number {
  const fas = freeAgents(state);
  const vals = new Map(fas.map(m => [m.id, monValue(catalog, state, m, null)]));
  fas.sort((a, b) => vals.get(b.id)! - vals.get(a.id)! || a.id.localeCompare(b.id));
  const counts = new Map(Object.keys(state.teams).map(t => [t, rosterCount(teamMons(state, t))]));
  const worst = new Map<TeamId, number>();
  for (const t of Object.keys(state.teams)) {
    const vs = teamMons(state, t).filter(m => m.tier !== 'ir').map(m => monValue(catalog, state, m, t)).sort((a, b) => a - b);
    worst.set(t, vs[0] ?? 0);
  }
  // the floor these contracts count toward: next season's (it grows with the cap), with a little margin for cuts
  const floorTarget = round50k(state.settings.floor * (capYear(state) > state.season ? 1 + state.settings.capGrowth : 1) * FA_BID.floorMargin);
  const fams = new Map(Object.keys(state.teams).map(t => [t, clubFamilies(state, t)]));
  let signed = 0;
  for (const fa of fas) {
    const ask = askingPrice(catalog, state, fa);
    const bids: {teamId: TeamId; salary: number; years: number; score: number}[] = [];
    for (const team of Object.values(state.teams)) {
      if (team.human || fams.get(team.id)!.has(monFamily(fa))) continue;   // species clause
      const n = counts.get(team.id)!;
      const v = monValue(catalog, state, fa, team.id);
      const gain = lineupGain(catalog, state, team.id, fa);
      const short = floorTarget - payroll(state, team.id);
      // a spot to fill, a real lineup upgrade, or a clear upgrade on the worst player (who would be cut)
      const wants = n < ROSTER || (n < ROSTER + 2 && (gain >= FA_BID.needGain || v > worst.get(team.id)! + 10))
        || (short > 0 && n < ROSTER + FA_BID.floorExtra);
      if (!wants) continue;
      // a full-enough roster doesn't pay for a body that doesn't play
      if (n >= ROSTER - 1 && gain <= 0 && short <= 0) continue;
      const eager = 0.95 + rng.next() * 0.1 + Math.min(FA_BID.gainEagerMax, gain * FA_BID.gainEager)
        + (n < ROSTER - 2 ? 0.05 : 0) + (short > 0 ? FA_BID.floorEager : 0);
      let salary = Math.min(maxSalary(state), Math.max(state.settings.minSalary, round50k(ask.salary * eager)));
      if (short > 0) salary = Math.min(maxSalary(state), Math.max(salary, round50k(Math.min(short, ask.salary * FA_BID.floorPay))));
      if (!canAfford(state, team.id, salary)) continue;
      const years = Math.max(1, Math.min(5, ask.years + (rng.chance(0.3) ? 1 : 0)));
      const guaranteed = Math.ceil(years / 2);
      bids.push({teamId: team.id, salary, years, score: salary * (years + guaranteed) / 2});
    }
    if (!bids.length) continue;
    bids.sort((a, b) => b.score - a.score || a.teamId.localeCompare(b.teamId));
    const b = bids[0];
    if (b.salary < ask.salary * 0.95) continue;
    signMon(catalog, state, b.teamId, fa, makeContract(b.salary, b.years, {exception: b.salary <= state.settings.minSalary ? 'minimum' : undefined}));
    counts.set(b.teamId, counts.get(b.teamId)! + 1);
    fams.get(b.teamId)!.add(monFamily(fa));
    signed++;
  }
  for (const m of freeAgents(state)) m.askMult = Math.max(0.3, (m.askMult ?? 1) * FA_ASK_DROP);
  for (const team of Object.values(state.teams)) if (!team.human) autoLineup(catalog, state, team.id);
  return signed;
}

/** Free agents who sat out two offseasons leave the league (keeps the pool small). */
export function pruneFreeAgents(catalog: Catalog, state: LeagueState): Mon[] {
  const gone: Mon[] = [];
  for (const m of freeAgents(state)) {
    if (m.faSince !== undefined && state.season - m.faSince >= 2) gone.push(m);
  }
  return gone;
}

export {releaseMon};
