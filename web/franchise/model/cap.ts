// Contracts and the hard cap: payroll, cap space, market value, rookie scale, dead money.
import type {Catalog, Contract, LeagueState, Mon, TeamId} from '../types.ts';
import {bestRole} from './ratings.ts';
import {baseEvGrade, gi} from './grades.ts';
import {clamp, round50k, teamMons} from './util.ts';

/** The season a payroll counts toward: after the season's contracts tick (draft-lottery on), next season. */
export function capYear(state: LeagueState): number {
  return ['draft-lottery', 'draft', 'resign', 'free-agency'].includes(state.phase) ? state.season + 1 : state.season;
}

export const maxSalary = (state: LeagueState): number => round50k(state.settings.cap * state.settings.maxSalaryPct);

export function contractHit(c: Contract | null): number {
  return c && c.yearsLeft > 0 ? c.salary : 0;
}

export function payroll(state: LeagueState, teamId: TeamId): number {
  let sum = 0;
  for (const m of teamMons(state, teamId)) sum += contractHit(m.contract);
  const y = capYear(state);
  for (const d of state.teams[teamId].deadMoney) if (d.season === y) sum += d.amount;
  return sum;
}

/** Payroll that counts toward the hard cap: every contract and dead money (what the UI shows as payroll).
 *  The one exception is signing: a minimum deal can always be signed, even over the cap. */
export const capPayroll = (state: LeagueState, teamId: TeamId): number => payroll(state, teamId);

export const capSpace = (state: LeagueState, teamId: TeamId): number => state.settings.cap - capPayroll(state, teamId);

/** Can the team sign this salary? Minimum deals always fit (hard-cap exception). */
export function canAfford(state: LeagueState, teamId: TeamId, salary: number): boolean {
  if (salary <= state.settings.minSalary) return true;
  return capPayroll(state, teamId) + salary <= state.settings.cap;
}

/** Exponent of the salary curve over (OVR - 55) / 42 (tunable). */
export const MARKET_CURVE = 1.7;

/** Market salary by role OVR and EV grade, discounted for age. No fame/legendary premium. */
export function marketSalary(catalog: Catalog, state: LeagueState, mon: Mon): number {
  const o = bestRole(catalog, mon).ovr;
  const g = gi(baseEvGrade(mon));
  const v = clamp((o - 55 + g * 0.5) / 42, 0, 1);
  let s = state.settings.minSalary + (maxSalary(state) - state.settings.minSalary) * Math.pow(v, MARKET_CURVE);
  const age = mon.age;
  if (age <= 23) s *= 0.85;
  else if (age >= 32) s *= 0.6;
  else if (age >= 30) s *= 0.8;
  return clamp(round50k(s), state.settings.minSalary, maxSalary(state));
}

export function marketYears(mon: Mon): number {
  if (mon.age <= 25) return 4;
  if (mon.age <= 28) return 3;
  if (mon.age <= 31) return 2;
  return 1;
}

export function makeContract(salary: number, years: number, opts: Partial<Contract> = {}): Contract {
  return {salary, yearsLeft: years, signingBonus: 0, originalYears: years, guaranteedYears: Math.min(years, opts.guaranteedYears ?? Math.ceil(years / 2)), ...opts};
}

/** Rookie scale by overall pick (1..48): ~$5.5M for #1 down to the minimum. 1st round: 4 years + fifth-year option. */
export function rookieContract(state: LeagueState, round: number, pick: number, overall: number): Contract {
  const min = state.settings.minSalary;
  const top = state.settings.cap * 0.055;
  const t = Math.pow(Math.max(0, (48 - overall) / 47), 2.2);
  const salary = Math.max(min, round50k(min + (top - min) * t));
  const years = round === 1 ? 4 : 3;
  return makeContract(salary, years, {guaranteedYears: round === 1 ? 4 : 2, rookie: {round, pick, fifthYearOption: round === 1}, exception: 'rookie'});
}

/** Dead money from releasing: remaining prorated bonus + remaining guaranteed salary, charged to the cap year. */
export function deadMoneyOnCut(c: Contract): number {
  if (c.yearsLeft <= 0) return 0;
  const prorated = c.originalYears > 0 ? (c.signingBonus / c.originalYears) * c.yearsLeft : 0;
  const played = c.originalYears - c.yearsLeft;
  const guaranteedLeft = Math.max(0, c.guaranteedYears - played);
  const salaryPart = c.exception === 'minimum' ? 0 : Math.min(guaranteedLeft, c.yearsLeft) * (c.salary - (c.originalYears ? c.signingBonus / c.originalYears : 0)) * 0.5;
  // charged to one cap year, never more than the cap hit it replaces (cuts never push a team over)
  return Math.min(c.exception ? 0 : c.salary, round50k(prorated + salaryPart));
}

export function addDeadMoney(state: LeagueState, teamId: TeamId, amount: number): void {
  if (amount <= 0) return;
  const y = capYear(state);
  const team = state.teams[teamId];
  const row = team.deadMoney.find(d => d.season === y);
  if (row) row.amount += amount; else team.deadMoney.push({season: y, amount});
  team.deadMoney = team.deadMoney.filter(d => d.season >= state.season);
}
