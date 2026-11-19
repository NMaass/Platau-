// Small shared helpers over LeagueState.
import type {LeagueState, Mon, MonId, TeamId, Transaction} from '../types.ts';

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
