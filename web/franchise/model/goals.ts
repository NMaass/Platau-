// Weekly goals: one per club per week, bonus XP when met (shown in the inbox).
import type {Catalog, LeagueState, Mon, Series, TeamId} from '../types.ts';
import type {Rng} from './rng.ts';
import {addXp} from './progression.ts';
import {seriesTotals} from './summaries.ts';
import {allRoles} from './ratings.ts';
import {inbox} from './inbox.ts';
import {monLabel} from './util.ts';

export const GOAL_XP = {team: 40, mon: 150};

type Goal = NonNullable<LeagueState['teams'][string]['weeklyGoal']>;

export function setGoal(catalog: Catalog, state: LeagueState, rng: Rng, teamId: TeamId, starters: Mon[]): Goal {
  const team = state.teams[teamId];
  const name = (m: Mon) => monLabel(catalog, state, m);
  const hazard = starters.find(m => allRoles(catalog, m).some(r => r.role === 'rocks' || r.role === 'spikes'));
  const options: Goal[] = [{kind: 'win-series', text: 'Win the series', target: 1, week: state.week}];
  if (state.week > 1) options.push({kind: 'sweep', text: 'Win the series without dropping a game', target: 1, week: state.week});
  const hitter = starters.length ? rng.pick(starters) : undefined;
  if (hitter) options.push({kind: 'kos', text: `${name(hitter)} scores 3 KOs`, monId: hitter.id, target: 3, week: state.week});
  if (hazard) options.push({kind: 'hazards', text: `${name(hazard)} sets 2 hazards`, monId: hazard.id, target: 2, week: state.week});
  const g = rng.pick(options);
  team.weeklyGoal = g;
  if (team.human) inbox(state, 'growth', `Weekly goal: ${g.text}`, g.monId ? `Meet it for +${GOAL_XP.mon} XP.` : `Meet it for +${GOAL_XP.team} XP for every active Pokémon.`);
  return g;
}

/** Check last week's goal against the team's series; award XP. Returns true when met. */
export function checkGoal(catalog: Catalog, state: LeagueState, teamId: TeamId, s: Series | undefined, active: Mon[]): boolean {
  const team = state.teams[teamId];
  const g = team.weeklyGoal;
  if (!g || !s || g.week !== s.week) return false;
  const won = s.winnerId === teamId;
  let met = false;
  if (g.kind === 'win-series') met = won;
  else if (g.kind === 'sweep') met = won && s.games.every(x => x.winnerTeamId === teamId);
  else {
    const t = g.monId ? seriesTotals(s.games).get(g.monId) : undefined;
    met = !!t && (g.kind === 'kos' ? t.kos : t.hazardsSet) >= g.target;
  }
  if (met) {
    if (g.monId && state.mons[g.monId]?.teamId === teamId) addXp(catalog, state.mons[g.monId], GOAL_XP.mon);
    else if (!g.monId) for (const m of active) addXp(catalog, m, GOAL_XP.team);
    if (team.human) inbox(state, 'growth', `Goal met: ${g.text}`, 'Bonus XP awarded.');
  }
  team.weeklyGoal = undefined;
  return met;
}
