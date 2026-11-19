// The UI's single doorway to the model. Every call goes to model/api.ts; a function
// whose body still throws "not implemented" falls back to ui/fallback.ts (once
// noticed, the fallback is used directly). In fixture mode (?fixture=1) the
// fallback is always used, because the hand-built league is not the model's.
import * as api from '../model/api.ts';
import * as fb from './fallback.ts';
import type {StrategyDef} from '../types.ts';
import {STRATEGIES} from '../model/strategies.ts';

let fixture = false;
export const setFixtureMode = (on: boolean): void => { fixture = on; };
export const isFixtureMode = (): boolean => fixture;

const missing = new Set<string>();
const notImpl = (e: unknown) => e instanceof Error && /not implemented/.test(e.message);

/** Does the real model implement `name`? (probes once by catching the todo() throw at call time) */
export const modelHas = (name: string): boolean => !fixture && !missing.has(name);

function wrap<K extends keyof typeof api & keyof typeof fb>(name: K): (typeof api)[K] {
  const real = api[name] as (...a: unknown[]) => unknown;
  const alt = fb[name] as (...a: unknown[]) => unknown;
  return ((...args: unknown[]) => {
    if (fixture || missing.has(name)) return alt(...args);
    try { return real(...args); } catch (e) {
      if (notImpl(e)) { missing.add(name); console.info(`[plateau] model.${name} not implemented yet, using UI fallback`); return alt(...args); }
      throw e;
    }
  }) as (typeof api)[K];
}

export const M = {
  evGrade: wrap('evGrade'), roleRating: wrap('roleRating'), bestRole: wrap('bestRole'), roles: wrap('roles'),
  ivHeadline: wrap('ivHeadline'), knownRating: wrap('knownRating'), capSpace: wrap('capSpace'), payroll: wrap('payroll'),
  standings: wrap('standings'), userSeries: wrap('userSeries'), likelyLineup: wrap('likelyLineup'), advisories: wrap('advisories'),
  setStrategy: wrap('setStrategy'), autoLineup: wrap('autoLineup'), assignSlot: wrap('assignSlot'), setMonSet: wrap('setMonSet'),
  moveTier: wrap('moveTier'),
};
/** Raw model for calls with no fallback (newLeague, weekJobs, applyResults, finishWeek, front office). */
export {api};

/** Strategy list (model/strategies.ts). */
export const strategies = (): StrategyDef[] => STRATEGIES;
