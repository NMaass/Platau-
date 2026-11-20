// Small shared helpers over LeagueState.
import type {Catalog, LeagueState, Mon, MonId, TeamId, Transaction} from '../types.ts';

export function newId(state: LeagueState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

/** Mons currently on a team (any tier, incl. IR), in id order. */
export function teamMons(state: LeagueState, teamId: TeamId): Mon[] {
  const out: Mon[] = [];
  for (const id in state.mons) { const m = state.mons[id]; if (m.teamId === teamId && !m.retired) out.push(m); }
  return out;
}

/** Index of active (non-retired) mons per team, built once for heavy passes. */
export function monsByTeam(state: LeagueState): Map<TeamId, Mon[]> {
  const map = new Map<TeamId, Mon[]>();
  for (const t in state.teams) map.set(t, []);
  for (const id in state.mons) { const m = state.mons[id]; if (m.teamId && !m.retired) map.get(m.teamId)?.push(m); }
  return map;
}

export const rosterCount = (mons: Mon[]): number => mons.filter(m => m.tier !== 'ir').length;

export function freeAgents(state: LeagueState): Mon[] {
  const out: Mon[] = [];
  for (const id in state.mons) { const m = state.mons[id]; if (!m.teamId && !m.retired && m.prospect === undefined) out.push(m); }
  return out;
}

export function logTx(state: LeagueState, kind: string, text: string, teamIds: TeamId[], monIds: MonId[]): void {
  const tx: Transaction = {season: state.season, week: state.week, kind, text, teamIds, monIds};
  state.log.push(tx);
  if (state.log.length > 3000) state.log.splice(0, state.log.length - 3000);
}

export const money = (n: number): string => `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
export const round50k = (n: number): number => Math.round(n / 50_000) * 50_000;

const idNum = (id: string) => parseInt(id.slice(1), 10) || 0;

/**
 * Club-mates of the same species get a visible number so they never read as one Pokémon:
 * the earliest on the club (lowest id) is plain, the next "#2", and so on. Free agents and prospects have none.
 */
export function dupNumbers(state: LeagueState): Map<MonId, number> {
  const groups = new Map<string, Mon[]>();
  for (const id in state.mons) {
    const m = state.mons[id];
    if (!m.teamId || m.retired) continue;
    const k = `${m.teamId}|${m.speciesId}`;
    const g = groups.get(k);
    if (g) g.push(m); else groups.set(k, [m]);
  }
  const out = new Map<MonId, number>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => idNum(a.id) - idNum(b.id));
    g.forEach((m, i) => out.set(m.id, i + 1));
  }
  return out;
}

/** Display name: species, plus "#n" for the second and later of a species on one club. */
export function monLabel(catalog: Catalog, state: LeagueState, mon: Mon, nums?: Map<MonId, number>): string {
  const name = catalog.species[mon.speciesId]?.name ?? mon.speciesId;
  const n = (nums ?? dupNumbers(state)).get(mon.id) ?? 0;
  return n > 1 ? `${name} #${n}` : name;
}
