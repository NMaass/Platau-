// Standings with tiebreaks: series wins, then head-to-head among the tied teams,
// division record, conference record, game differential, games won, then a
// seeded coin flip.
import type {LeagueState, Series, TeamId} from '../types.ts';
import {hash01} from './rng.ts';

export interface Record_ {
  teamId: TeamId; wins: number; losses: number; gameWins: number; gameLosses: number;
  divWins: number; confWins: number; results: {opp: TeamId; won: boolean; week: number}[];
}

export interface StandingRow {
  teamId: TeamId; wins: number; losses: number; gameWins: number; gameLosses: number;
  divRank: number; confSeed: number | null; streak: string;
}

function gameTally(s: Series, teamId: TeamId): [number, number] {
  let w = 0, l = 0;
  for (const g of s.games) { if (g.winnerTeamId === teamId) w++; else l++; }
  return [w, l];
}

export function records(state: LeagueState): Map<TeamId, Record_> {
  const map = new Map<TeamId, Record_>();
  for (const id in state.teams) map.set(id, {teamId: id, wins: 0, losses: 0, gameWins: 0, gameLosses: 0, divWins: 0, confWins: 0, results: []});
  for (const s of state.schedule) {
    if (s.playoff || !s.winnerId || s.season !== state.season) continue;
    const h = state.teams[s.homeId], a = state.teams[s.awayId];
    for (const [me, opp] of [[h, a], [a, h]]) {
      const r = map.get(me.id)!;
      const won = s.winnerId === me.id;
      const [gw, gl] = gameTally(s, me.id);
      r.gameWins += gw; r.gameLosses += gl;
      if (won) {
        r.wins++;
        if (me.conference === opp.conference) { r.confWins++; if (me.division === opp.division) r.divWins++; }
      } else r.losses++;
      r.results.push({opp: opp.id, won, week: s.week});
    }
  }
  return map;
}

/** Rank teams best first with the tiebreak chain. */
export function rankTeams(state: LeagueState, ids: TeamId[], recs = records(state)): TeamId[] {
  const byWins = new Map<number, TeamId[]>();
  for (const id of ids) { const w = recs.get(id)!.wins; byWins.set(w, [...(byWins.get(w) ?? []), id]); }
  const out: TeamId[] = [];
  for (const w of [...byWins.keys()].sort((a, b) => b - a)) {
    const group = byWins.get(w)!;
    if (group.length === 1) { out.push(group[0]); continue; }
    const set = new Set(group);
    const key = (id: TeamId): number[] => {
      const r = recs.get(id)!;
      const h2h = r.results.filter(x => set.has(x.opp));
      const h2hPct = h2h.length ? h2h.filter(x => x.won).length / h2h.length : 0.5;
      return [h2hPct, r.divWins, r.confWins, r.gameWins - r.gameLosses, r.gameWins, hash01(state.seed, state.season, id)];
    };
    const keys = new Map(group.map(id => [id, key(id)]));
    group.sort((a, b) => {
      const ka = keys.get(a)!, kb = keys.get(b)!;
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
      return 0;
    });
    out.push(...group);
  }
  return out;
}

/** Playoff seeds per conference: [seed1 (bye), seed2, wild card], division winners first. */
export function conferenceSeeds(state: LeagueState, conference: 0 | 1, recs = records(state)): TeamId[] {
  const teams = Object.values(state.teams).filter(t => t.conference === conference);
  const winners: TeamId[] = [];
  for (const d of [0, 1]) winners.push(rankTeams(state, teams.filter(t => t.division === d).map(t => t.id), recs)[0]);
  const seeded = rankTeams(state, winners, recs);
  const wild = rankTeams(state, teams.map(t => t.id).filter(id => !winners.includes(id)), recs)[0];
  return [...seeded, wild];
}

export function standings(state: LeagueState): StandingRow[] {
  const recs = records(state);
  const seeds = new Map<TeamId, number>();
  for (const c of [0, 1] as const) conferenceSeeds(state, c, recs).forEach((id, i) => seeds.set(id, i + 1));
  const rows: StandingRow[] = [];
  for (const c of [0, 1]) for (const d of [0, 1]) {
    const ids = Object.values(state.teams).filter(t => t.conference === c && t.division === d).map(t => t.id);
    rankTeams(state, ids, recs).forEach((id, i) => {
      const r = recs.get(id)!;
      const res = [...r.results].sort((a, b) => a.week - b.week);
      let streak = '';
      if (res.length) {
        const last = res[res.length - 1].won;
        let n = 0;
        for (let k = res.length - 1; k >= 0 && res[k].won === last; k--) n++;
        streak = `${last ? 'W' : 'L'}${n}`;
      }
      rows.push({teamId: id, wins: r.wins, losses: r.losses, gameWins: r.gameWins, gameLosses: r.gameLosses, divRank: i + 1, confSeed: seeds.get(id) ?? null, streak});
    });
  }
  return rows;
}

/** All 16 teams worst first (draft order, waivers). */
export function reverseStandings(state: LeagueState): TeamId[] {
  return rankTeams(state, Object.keys(state.teams)).reverse();
}
