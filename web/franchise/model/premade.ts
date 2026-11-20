// Pre-made rosters (New League → Pre-made teams): 18 per club from the rarity pool, built so that
//  - the club can run its favourite strategy: every slot on-role (a rain club has a rain setter),
//  - the gym type is a theme, not the whole team: about a third of the roster, at most half the starting six,
//  - no club holds two of one family (species clause),
//  - the clubs are even: filler Pokémon are swapped until the best-six strength is within `spread`.
import type {Catalog, LeagueState, Mon, MonId, Role, TeamId} from '../types.ts';
import type {Rng} from './rng.ts';
import {clubFamilies, drawFamily, familyTypes, monFamily, returnToPool, type FamilyInfo} from './pool.ts';
import {createMon} from './mons.ts';
import {strategyById, runsStrategy} from './strategies.ts';
import {planLineup, type LineupPlan} from './lineup.ts';
import {allRoles, bestRole} from './ratings.ts';
import {teamMons} from './util.ts';

/** Knobs: gym-type Pokémon per roster, gym-type starters at most, draws tried per role, repair passes,
 *  balance target (best-six strength spread) and swap budget. */
export const PREMADE = {typed: 6, typedMin: 4, typedStarters: 3, roleTries: 12, repairs: 10, spread: 2, swaps: 400};

export interface PremadeOptions {
  perTeam: number; legendaries: number;
  /** ages for n Pokémon (the league's age spread) */
  ages: (n: number) => number[];
  /** set the club's practice squad (lineups read it) */
  practice: (teamId: TeamId) => void;
}

const hasType = (catalog: Catalog, m: Mon, type: string | undefined): boolean => !!type && (catalog.species[m.speciesId]?.types ?? []).includes(type);
const isLegend = (catalog: Catalog, m: Mon): boolean => { const r = catalog.species[m.speciesId]?.rarity; return r === 'legendary' || r === 'mythical'; };

const roleCache = new WeakMap<Catalog, Map<string, Set<string>>>();
/** Roles any member of a family has a set for. */
function familyRoles(catalog: Catalog, f: FamilyInfo): Set<string> {
  let m = roleCache.get(catalog);
  if (!m) { m = new Map(); roleCache.set(catalog, m); }
  let r = m.get(f.id);
  if (!r) { r = new Set(f.members.flatMap(id => Object.keys(catalog.species[id].roleBase ?? {}))); m.set(f.id, r); }
  return r;
}

/** Mean of the best six ratings (same measure as season.ts topSix). */
function strength(catalog: Catalog, mons: Mon[]): number {
  const o = mons.map(m => bestRole(catalog, m).ovr).sort((a, b) => b - a).slice(0, 6);
  return o.length ? o.reduce((a, b) => a + b, 0) / 6 : 0;
}

export function premadeRosters(catalog: Catalog, state: LeagueState, rng: Rng, teamIds: TeamId[], o: PremadeOptions): void {
  const legendTeams = new Set(rng.shuffle([...teamIds]).slice(0, o.legendaries));

  const remove = (m: Mon) => { delete state.mons[m.id]; returnToPool(state, m.family); };
  /** One Pokémon for a slot's roles (preferring the gym type or not), retried until the mon itself fills the slot. */
  const roleMon = (t: TeamId, roles: Role[], age: number, typed: boolean | null): Mon => {
    const type = state.teams[t].gymType;
    const want = (f: FamilyInfo) => roles.some(r => familyRoles(catalog, f).has(r))
      && (typed === null || !type || familyTypes(catalog, f).has(type) === typed);
    let last: Mon | null = null;
    for (let i = 0; i < PREMADE.roleTries; i++) {
      const fam = drawFamily(catalog, state, rng, 'nonlegendary', want, clubFamilies(state, t))!;
      const m = createMon(catalog, state, rng, {family: fam, age, teamId: t, tier: 'backup'});
      if (allRoles(catalog, m).some(r => roles.includes(r.role)) && (typed === null || hasType(catalog, m, type) === typed)) { if (last) remove(last); return m; }
      if (last) remove(last);
      last = m;
    }
    return last!;
  };

  for (const t of teamIds) {
    const team = state.teams[t], type = team.gymType;
    const strat = strategyById(team.favoriteStrategies[0]);
    const ages = o.ages(o.perTeam);
    let k = 0;
    if (legendTeams.has(t)) {
      const fam = drawFamily(catalog, state, rng, 'legendary', undefined, clubFamilies(state, t));
      if (fam) createMon(catalog, state, rng, {family: fam, age: Math.max(ages[k++], 24), teamId: t, tier: 'backup'});
    }
    // the favourite strategy's six roles first (prime ages so they have evolved); two of them may be of the gym type
    let typedRoles = 0;
    for (const slot of strat.slots) {
      const typed = typedRoles < 2 && rng.chance(0.35);
      const m = roleMon(t, slot as Role[], Math.max(24, Math.min(31, ages[k++])), typed ? true : null);
      if (hasType(catalog, m, type)) typedRoles++;
    }
    // the rest: the gym type up to PREMADE.typed, then anything
    const prefer = type ? (f: FamilyInfo) => familyTypes(catalog, f).has(type) : undefined;
    while (k < o.perTeam) {
      const typedNow = teamMons(state, t).filter(m => hasType(catalog, m, type)).length;
      const fam = drawFamily(catalog, state, rng, 'nonlegendary', typedNow < PREMADE.typed ? prefer : undefined, clubFamilies(state, t))!;
      const m = createMon(catalog, state, rng, {family: fam, age: ages[k++], teamId: t, tier: 'backup'});
      if (m.age <= 21) m.rookieSeason = 1;
    }
    o.practice(t);
    repair(t);
  }

  /** Until the favourite strategy runs on-role with at most PREMADE.typedStarters of the gym type in it: swap the
   *  weakest spare Pokémon for a role player of the missing slot, or a gym-type starter for one of another type. */
  function repair(t: TeamId): void {
    const team = state.teams[t], type = team.gymType, sid = team.favoriteStrategies[0];
    const strat = strategyById(sid);
    for (let pass = 0; pass < PREMADE.repairs; pass++) {
      const plan: LineupPlan = planLineup(catalog, state, t, sid);
      const starters = new Set(plan.slots.map(sl => sl.monId).filter(Boolean) as MonId[]);
      const typedStarters = [...starters].filter(id => hasType(catalog, state.mons[id], type));
      const runs = runsStrategy(plan);
      if (runs && typedStarters.length <= PREMADE.typedStarters) return;
      let out: Mon | undefined, slot: number;
      if (!runs) {
        slot = plan.slots.findIndex(sl => !sl.monId || !allRoles(catalog, state.mons[sl.monId]).some(r => r.role === sl.role));
        if (slot < 0) slot = 0;
        out = teamMons(state, t).filter(m => !starters.has(m.id) && !isLegend(catalog, m) && !hasType(catalog, m, type))
          .sort((a, b) => bestRole(catalog, a).ovr - bestRole(catalog, b).ovr || a.id.localeCompare(b.id))[0];
      } else {
        const id = typedStarters.sort((a, b) => bestRole(catalog, state.mons[a]).ovr - bestRole(catalog, state.mons[b]).ovr || a.localeCompare(b))[0];
        out = state.mons[id];
        slot = plan.slots.findIndex(sl => sl.monId === id);
      }
      if (!out) return;
      const age = Math.max(24, Math.min(31, out.age)), tier = out.tier;
      remove(out);
      const m = roleMon(t, strat.slots[slot] as Role[], age, false);
      m.tier = tier;
    }
  }

  const fine = (t: TeamId): boolean => {
    const team = state.teams[t];
    const plan = planLineup(catalog, state, t, team.favoriteStrategies[0]);
    return runsStrategy(plan) && plan.slots.filter(sl => sl.monId && hasType(catalog, state.mons[sl.monId], team.gymType)).length <= PREMADE.typedStarters;
  };
  balance(catalog, state, teamIds, fine);
  // practice squads are the youngest six again after the swaps: re-check (rarely needs one more repair)
  for (const t of teamIds) { o.practice(t); if (!fine(t)) { repair(t); o.practice(t); } }
}

/** Even out the clubs: swap Pokémon (not legendary, within 2 years of age, never a family the other club already has,
 *  each club keeping PREMADE.typedMin of its gym type) between the strongest and the weakest club while that narrows their gap, as long as both
 *  clubs still run their favourite strategy with at most PREMADE.typedStarters gym-type starters. */
function balance(catalog: Catalog, state: LeagueState, teamIds: TeamId[], fine: (t: TeamId) => boolean): void {
  const typedIn = (ms: Mon[], t: TeamId) => ms.filter(m => hasType(catalog, m, state.teams[t].gymType)).length;
  for (let guard = 0; guard < PREMADE.swaps; guard++) {
    const str = teamIds.map(t => ({t, v: strength(catalog, teamMons(state, t))})).sort((a, b) => b.v - a.v);
    let done = true;
    outer: for (let i = 0; i < 3; i++) for (let j = str.length - 1; j > str.length - 4; j--) {
      const hi = str[i], lo = str[j];
      if (hi.v - lo.v <= PREMADE.spread) break outer;
      const A = teamMons(state, hi.t), B = teamMons(state, lo.t);
      const famA = new Set(A.map(m => monFamily(m, catalog))), famB = new Set(B.map(m => monFamily(m, catalog)));
      const cands: {a: Mon; b: Mon; gap: number}[] = [];
      for (const a of A) {
        if (isLegend(catalog, a) || famB.has(monFamily(a, catalog))) continue;
        for (const b of B) {
          if (isLegend(catalog, b) || Math.abs(a.age - b.age) > 2 || famA.has(monFamily(b, catalog))) continue;
          if (bestRole(catalog, a).ovr <= bestRole(catalog, b).ovr) continue;
          const A2 = A.map(x => x === a ? b : x), B2 = B.map(x => x === b ? a : x);
          if (typedIn(A2, hi.t) < Math.min(PREMADE.typedMin, typedIn(A, hi.t)) || typedIn(B2, lo.t) < Math.min(PREMADE.typedMin, typedIn(B, lo.t))) continue;
          const gap = Math.abs(strength(catalog, A2) - strength(catalog, B2));
          if (gap < hi.v - lo.v) cands.push({a, b, gap});
        }
      }
      cands.sort((x, y) => x.gap - y.gap || x.a.id.localeCompare(y.a.id) || x.b.id.localeCompare(y.b.id));
      for (const c of cands.slice(0, 40)) {
        const ta = [c.a.tier, c.b.tier] as const;
        c.a.teamId = lo.t; c.b.teamId = hi.t; [c.a.tier, c.b.tier] = [ta[1], ta[0]];
        if (fine(hi.t) && fine(lo.t)) { done = false; break outer; }
        c.a.teamId = hi.t; c.b.teamId = lo.t; [c.a.tier, c.b.tier] = ta;
      }
    }
    if (done) break;
  }
}
