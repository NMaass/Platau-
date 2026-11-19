// Indigo Plateau: 6 teams. Per conference: seed 1 (better division winner, bye),
// seed 2 (other division winner) vs seed 3 (wild card) in round 1 (week 15),
// conference final (week 16), Plateau final (week 17, best of finalBestOf).
import type {LeagueState, Series, TeamId} from '../types.ts';
import {conferenceSeeds, records, rankTeams} from './standings.ts';

export const PLAYOFF_WEEK = {round1: 15, conference: 16, final: 17} as const;

function series(state: LeagueState, week: number, home: TeamId, away: TeamId, playoff: Series['playoff'], bestOf: number): Series {
  return {id: `s${state.season}w${week}-${home}-${away}`, season: state.season, week, homeId: home, awayId: away, bestOf, games: [], playoff};
}

export function playoffField(state: LeagueState): {conference: 0 | 1; seeds: TeamId[]}[] {
  const recs = records(state);
  return ([0, 1] as const).map(c => ({conference: c, seeds: conferenceSeeds(state, c, recs)}));
}

export function startPlayoffs(state: LeagueState): void {
  for (const {seeds} of playoffField(state)) {
    state.schedule.push(series(state, PLAYOFF_WEEK.round1, seeds[1], seeds[2], 'round1', state.settings.seriesBestOf));
  }
  state.week = PLAYOFF_WEEK.round1;
}

/** After a playoff week: schedule the next round. Returns true when the final is done. */
export function advancePlayoffs(state: LeagueState): boolean {
  const week = state.week;
  if (week === PLAYOFF_WEEK.round1) {
    for (const {conference, seeds} of playoffField(state)) {
      const r1 = state.schedule.find(s => s.playoff === 'round1' && state.teams[s.homeId].conference === conference)!;
      state.schedule.push(series(state, PLAYOFF_WEEK.conference, seeds[0], r1.winnerId!, 'conference', state.settings.seriesBestOf));
    }
    state.week = PLAYOFF_WEEK.conference;
    return false;
  }
  if (week === PLAYOFF_WEEK.conference) {
    const champs = state.schedule.filter(s => s.playoff === 'conference').map(s => s.winnerId!);
    const [home, away] = rankTeams(state, champs);
    state.schedule.push(series(state, PLAYOFF_WEEK.final, home, away, 'final', state.settings.finalBestOf));
    state.week = PLAYOFF_WEEK.final;
    return false;
  }
  return true;
}

export function finalSeries(state: LeagueState): Series | undefined {
  return state.schedule.find(s => s.playoff === 'final' && s.season === state.season);
}

/** Teams in the playoffs this season (6), or [] before the regular season ends. */
export function playoffTeams(state: LeagueState): TeamId[] {
  return [...new Set(state.schedule.filter(s => s.playoff).flatMap(s => [s.homeId, s.awayId]))];
}

/** Playoff picture for the UI: seeds now (live during the season). */
export function playoffPicture(state: LeagueState): {conference: 0 | 1; seeds: TeamId[]; series: Series[]}[] {
  return playoffField(state).map(f => ({...f, series: state.schedule.filter(s => s.playoff && state.teams[s.homeId].conference === f.conference || (s.playoff === 'final'))}));
}
