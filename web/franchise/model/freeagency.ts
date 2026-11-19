// Re-signing window, franchise tag, 3 free-agency bidding rounds, in-season FA.
import type {Catalog, LeagueState, Mon, TeamId} from '../types.ts';
import type {Rng} from './rng.ts';
import {canAfford, makeContract, marketSalary, marketYears, maxSalary} from './cap.ts';
import {round50k} from './util.ts';
import {gi} from './grades.ts';
import {monValue} from './value.ts';
import {freeAgents, logTx, money, rosterCount, teamMons} from './util.ts';
import {releaseMon, signMon} from './roster.ts';
import {ROSTER, autoLineup, removeFromLineup} from './lineup.ts';
import {bestRole} from './ratings.ts';
import {inbox} from './inbox.ts';

export const FA_ROUNDS = 3;
export const FA_ASK_DROP = 0.85;

const spName = (catalog: Catalog, m: Mon) => catalog.species[m.speciesId].name;

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

const interestMult = {Keen: 0.95, Neutral: 1, Cool: 1.08};

export function offerContract(catalog: Catalog, state: LeagueState, teamId: TeamId, mon: Mon, salary: number, years: number): {accepted: boolean; reason: string} {
  const s = state.settings;
  if (mon.retired) return {accepted: false, reason: 'Retired'};
  if (years < 1 || years > 7) return {accepted: false, reason: 'Contracts run 1 to 7 years'};
  if (salary < s.minSalary) return {accepted: false, reason: `The minimum is ${money(s.minSalary)}`};
  if (salary > maxSalary(state)) return {accepted: false, reason: `The maximum is ${money(maxSalary(state))}`};
  const resign = mon.teamId === teamId && isExpiring(mon);
  if (!resign && mon.teamId) return {accepted: false, reason: 'Under contract with a club'};
  if (!resign && mon.prospect !== undefined) return {accepted: false, reason: 'In the draft class'};
  if (resign && state.phase !== 'resign') return {accepted: false, reason: 'Re-signing happens in the re-sign window'};
  if (!resign && state.phase === 'regular' && state.week > state.settings.weeks) return {accepted: false, reason: 'Season over'};
  const inSeason = state.phase === 'regular' || state.phase === 'playoffs';
  if (!resign && inSeason && rosterCount(teamMons(state, teamId)) >= ROSTER) return {accepted: false, reason: 'Roster full: release someone first'};
  if (!resign && !inSeason && rosterCount(teamMons(state, teamId)) >= ROSTER + 4) return {accepted: false, reason: 'Roster full for the offseason'};
  if (!canAfford(state, teamId, salary)) return {accepted: false, reason: 'Not enough cap space (minimum deals always fit)'};
  const ask = askingPrice(catalog, state, mon);
  const need = Math.min(maxSalary(state), ask.salary * interestMult[interest(state, mon, teamId)] * (resign ? 0.97 : 1));
  // more years for a young mon, fewer for a veteran, shift the price a little
  const yearsAdj = 1 + (years - ask.years) * (mon.age <= 27 ? -0.02 : 0.03);
  if (salary * yearsAdj < need * 0.995 && salary > s.minSalary) return {accepted: false, reason: `Wants about ${money(Math.ceil(need / 50_000) * 50_000)} a year`};
  if (salary <= s.minSalary && ask.salary > s.minSalary * 1.05) return {accepted: false, reason: `Wants about ${money(ask.salary)} a year`};
  const c = makeContract(salary, years, {exception: salary <= s.minSalary ? 'minimum' : undefined});
  if (resign) {
    mon.contract = c;
    logTx(state, 're-sign', `${state.teams[teamId].name} re-signed ${spName(catalog, mon)} (${money(salary)} x ${years})`, [teamId], [mon.id]);
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
  if (state.teams[teamId].tagSeason === state.season) return {ok: false, reason: 'One tag per offseason', salary};
  if (!canAfford(state, teamId, salary)) return {ok: false, reason: 'Not enough cap space for the tag', salary};
  return {ok: true, reason: `One year at ${money(salary)}`, salary};
}

export function franchiseTag(catalog: Catalog, state: LeagueState, mon: Mon): {ok: boolean; reason: string} {
  const chk = franchiseTagCheck(catalog, state, mon);
  if (!chk.ok) return chk;
  mon.contract = makeContract(chk.salary, 1, {guaranteedYears: 1, tagged: true});
  state.teams[mon.teamId!].tagSeason = state.season;
  logTx(state, 'tag', `${state.teams[mon.teamId!].name} tagged ${spName(catalog, mon)} (${money(chk.salary)})`, [mon.teamId!], [mon.id]);
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
        logTx(state, 're-sign', `${team.name} re-signed ${spName(catalog, m)} (${money(ask.salary)} x ${ask.years})`, [team.id], [m.id]);
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
    logTx(state, 'free-agent', `${spName(catalog, m)} left ${state.teams[teamId].name} in free agency`, [teamId], [m.id]);
    if (human) inbox(state, 'deal', `${spName(catalog, m)} hit free agency`, 'The contract ran out without a new deal.', {kind: 'mon', id: m.id});
  }
}

/**
 * One bidding round: AI teams bid by role needs and cap room; each free agent
 * takes the best offer by total money weighted to guaranteed years; unsigned
 * free agents lower their ask.
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
  let signed = 0;
  for (const fa of fas) {
    const ask = askingPrice(catalog, state, fa);
    const bids: {teamId: TeamId; salary: number; years: number; score: number}[] = [];
    for (const team of Object.values(state.teams)) {
      if (team.human) continue;
      const n = counts.get(team.id)!;
      const v = monValue(catalog, state, fa, team.id);
      const wants = n < ROSTER || (n < ROSTER + 2 && v > worst.get(team.id)! + 10);
      if (!wants) continue;
      const eager = 0.95 + rng.next() * 0.15 + (n < ROSTER - 2 ? 0.05 : 0);
      const salary = Math.min(maxSalary(state), Math.max(state.settings.minSalary, round50k(ask.salary * eager)));
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
