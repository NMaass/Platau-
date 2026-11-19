// 14-week schedule: every team plays one series every week.
// Teams sit at index i = conf*8 + div*4 + k. Per team: division rivals twice
// (two 3-round round robins = 6 weeks), the other division in its conference
// once (4 rounds of a 4x4 rotation), and the 4 teams of one division in the
// other conference (4 rounds; which division rotates by season).
import type {LeagueState, Series, TeamId} from '../types.ts';

type Pair = [number, number];
const RR: [number, number][][] = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];

function divisionRound(r: number, second: boolean): Pair[] {
  const out: Pair[] = [];
  for (let c = 0; c < 2; c++) for (let d = 0; d < 2; d++) {
    const base = c * 8 + d * 4;
    for (const [a, b] of RR[r]) out.push(second ? [base + b, base + a] : [base + a, base + b]);
  }
  return out;
}

function conferenceRound(r: number): Pair[] {
  const out: Pair[] = [];
  for (let c = 0; c < 2; c++) for (let k = 0; k < 4; k++) {
    const a = c * 8 + k, b = c * 8 + 4 + ((k + r) % 4);
    out.push(r % 2 ? [b, a] : [a, b]);
  }
  return out;
}

function crossRound(r: number, season: number): Pair[] {
  const out: Pair[] = [];
  for (let d = 0; d < 2; d++) for (let k = 0; k < 4; k++) {
    const a = d * 4 + k, b = 8 + ((d + season) % 2) * 4 + ((k + r) % 4);
    out.push((r + season) % 2 ? [b, a] : [a, b]);
  }
  return out;
}

/** Week-by-week pairings [home, away] as team indices, 14 weeks x 8 series. */
export function scheduleRounds(season: number): Pair[][] {
  const D = (r: number, s = false) => divisionRound(r, s), C = conferenceRound, X = (r: number) => crossRound(r, season);
  return [D(0), X(0), C(0), D(1), X(1), C(1), D(2), X(2), C(2), D(0, true), X(3), C(3), D(1, true), D(2, true)];
}

export function buildSchedule(state: LeagueState, teamIds: TeamId[]): Series[] {
  const rounds = scheduleRounds(state.season);
  const out: Series[] = [];
  rounds.forEach((pairs, w) => {
    for (const [h, a] of pairs) {
      out.push({
        id: `s${state.season}w${w + 1}-${teamIds[h]}-${teamIds[a]}`, season: state.season, week: w + 1,
        homeId: teamIds[h], awayId: teamIds[a], bestOf: state.settings.seriesBestOf, games: [],
      });
    }
  });
  return out;
}

export const seriesOfWeek = (state: LeagueState, week: number): Series[] => state.schedule.filter(s => s.week === week);
