// Roster moves shared by free agency, trades, waivers and the season machine:
// sign, release, keep every team at 18 (IR excluded).
import type {Catalog, Contract, LeagueState, Mon, TeamId} from '../types.ts';
import type {Rng} from './rng.ts';
import {ROSTER, normalizeTiers, removeFromLineup, autoLineup} from './lineup.ts';
import {addDeadMoney, canAfford, deadMoneyOnCut, makeContract, marketSalary} from './cap.ts';
import {monValue} from './value.ts';
import {bestRole} from './ratings.ts';
import {freeAgents, logTx, money, monLabel, rosterCount, teamMons} from './util.ts';
import {inbox} from './inbox.ts';
import {drawFamily} from './pool.ts';
import {createMon} from './mons.ts';

const spName = (catalog: Catalog, state: LeagueState, m: Mon) => monLabel(catalog, state, m);

export function signMon(catalog: Catalog, state: LeagueState, teamId: TeamId, mon: Mon, contract: Contract, kind = 'signed'): void {
  mon.teamId = teamId;
  mon.contract = contract;
  mon.tier = 'backup';
  mon.prospect = undefined;
  mon.faSince = undefined;
  mon.askMult = undefined;
  logTx(state, kind, `${state.teams[teamId].name} ${kind} ${spName(catalog, state, mon)} (${money(contract.salary)} x ${contract.yearsLeft})`, [teamId], [mon.id]);
}

/** Release to free agency; dead money for the remaining guarantee. */
export function releaseMon(catalog: Catalog, state: LeagueState, mon: Mon, why = 'released'): void {
  const teamId = mon.teamId;
  if (!teamId) return;
  if (mon.contract) addDeadMoney(state, teamId, deadMoneyOnCut(mon.contract));
  removeFromLineup(state, teamId, mon.id);
  mon.teamId = null;
  mon.contract = null;
  mon.tier = 'practice';
  mon.faSince = state.season;
  mon.askMult = 1;
  mon.tempFor = undefined;
  logTx(state, 'release', `${state.teams[teamId].name} ${why} ${spName(catalog, state, mon)}`, [teamId], [mon.id]);
}

/** A replacement-level free agent made on the spot when the FA pool is empty. */
export function streetFreeAgent(catalog: Catalog, state: LeagueState, rng: Rng): Mon {
  const fam = drawFamily(catalog, state, rng, 'nonlegendary')!;
  const m = createMon(catalog, state, rng, {family: fam, age: rng.range(24, 30), teamId: null});
  m.faSince = state.season;
  m.askMult = 0.5;
  return m;
}

/** Best free agent this team can still sign at the minimum (in-season replacements, roster fill). */
export function bestCheapFa(catalog: Catalog, state: LeagueState, teamId: TeamId, rng: Rng): Mon {
  // unsigned after the bidding rounds (or mid-season), every free agent takes a minimum deal
  const fas = freeAgents(state);
  fas.sort((a, b) => monValue(catalog, state, b, teamId) - monValue(catalog, state, a, teamId) || a.id.localeCompare(b.id));
  return fas[0] ?? streetFreeAgent(catalog, state, rng);
}

export function minimumDeal(state: LeagueState, years = 1): Contract {
  return makeContract(state.settings.minSalary, years, {guaranteedYears: 0, exception: 'minimum'});
}

/** Lowest-value mon a team would release (temporary IR fills first). */
export function releaseCandidate(catalog: Catalog, state: LeagueState, teamId: TeamId): Mon | undefined {
  const mons = teamMons(state, teamId).filter(m => m.tier !== 'ir');
  const temp = mons.find(m => m.tempFor && (!state.mons[m.tempFor] || state.mons[m.tempFor].teamId !== teamId || state.mons[m.tempFor].tier !== 'ir'));
  if (temp) return temp;
  const starters = new Set(state.teams[teamId].lineup.slots.map(s => s.monId));
  return mons.filter(m => !starters.has(m.id))
    .sort((a, b) => monValue(catalog, state, a, teamId) - monValue(catalog, state, b, teamId) || a.id.localeCompare(b.id))[0];
}

/**
 * Who a club would release to get down to 18 outside injured reserve: never a lineup starter;
 * lowest-rated first, then cheapest (the user sees this list in a confirm dialog before any cut).
 */
export function rosterExcess(catalog: Catalog, state: LeagueState, teamId: TeamId): Mon[] {
  const mons = teamMons(state, teamId).filter(m => m.tier !== 'ir');
  const over = mons.length - ROSTER;
  if (over <= 0) return [];
  const starters = new Set(state.teams[teamId].lineup.slots.map(s => s.monId));
  return mons.filter(m => !starters.has(m.id))
    .sort((a, b) => bestRole(catalog, a).ovr - bestRole(catalog, b).ovr || (a.contract?.salary ?? 0) - (b.contract?.salary ?? 0) || a.id.localeCompare(b.id))
    .slice(0, over);
}

/** Release `rosterExcess` (the user confirmed the list). */
export function trimRoster(catalog: Catalog, state: LeagueState, teamId: TeamId): Mon[] {
  const cut = rosterExcess(catalog, state, teamId);
  for (const m of cut) releaseMon(catalog, state, m);
  const team = state.teams[teamId];
  if (cut.length) { if (!team.human || team.lineup.auto) autoLineup(catalog, state, teamId); else normalizeTiers(catalog, state, teamId); }
  return cut;
}

/**
 * Bring every team to exactly 18 (IR excluded): sign minimum-deal free agents
 * (waiver priority = reverse standings order of `order`), release the lowest value.
 * The user's team is filled and trimmed too, flagged in the inbox.
 */
export function enforceRosters(catalog: Catalog, state: LeagueState, rng: Rng, order: TeamId[] = Object.keys(state.teams), max = ROSTER, trimUser = true): void {
  for (const teamId of order) {
    const team = state.teams[teamId];
    let mons = teamMons(state, teamId);
    let changed = false;
    while (rosterCount(mons) < ROSTER) {
      const fa = bestCheapFa(catalog, state, teamId, rng);
      const ask = marketSalary(catalog, state, fa) * (fa.askMult ?? 1);
      const irOut = mons.find(m => m.tier === 'ir' && !mons.some(x => x.tempFor === m.id));
      const c = !team.human && ask > state.settings.minSalary && canAfford(state, teamId, ask) && state.phase !== 'regular'
        ? makeContract(Math.round(ask / 50_000) * 50_000, 1, {guaranteedYears: 0})
        : minimumDeal(state);
      signMon(catalog, state, teamId, fa, c);
      if (irOut && (state.phase === 'regular' || state.phase === 'playoffs')) fa.tempFor = irOut.id;
      if (team.human) inbox(state, 'deal', `Signed ${spName(catalog, state, fa)} to fill the roster`, `Your roster was short, so ${spName(catalog, state, fa)} joined on a ${money(c.salary)} deal. Review it on the roster page.`, {kind: 'mon', id: fa.id});
      mons = teamMons(state, teamId);
      changed = true;
    }
    while (rosterCount(mons) > max && (trimUser || !team.human)) {
      const cut = releaseCandidate(catalog, state, teamId);
      if (!cut) break;
      releaseMon(catalog, state, cut);
      if (team.human) inbox(state, 'deal', `Released ${spName(catalog, state, cut)}`, `Rosters hold 18 outside injured reserve, so ${spName(catalog, state, cut)} was released.`, {kind: 'mon', id: cut.id});
      mons = teamMons(state, teamId);
      changed = true;
    }
    if (changed) {
      if (!team.human || team.lineup.auto) autoLineup(catalog, state, teamId);
      else normalizeTiers(catalog, state, teamId);
    }
  }
}
