// Series MVP, season awards from the box score, hidden fame and the hall of fame.
import type {Catalog, LeagueState, Mon, MonId, SeasonLine, Series, TeamId} from '../types.ts';
import {impact, seriesTotals} from './summaries.ts';
import {finalSeries} from './playoffs.ts';

export const FAME = {seriesMvp: 2, mvp: 30, award: 14, allLeague1: 8, allLeague2: 4, champion: 6, plateauMvp: 12, starterSeason: 2, hallOfFame: 80};

export const AWARDS = ['MVP', 'Offensive Pokémon of the Year', 'Defensive Pokémon of the Year', 'Support Pokémon of the Year',
  'Rookie of the Year', 'Comeback Pokémon of the Year', 'Indigo Plateau MVP', 'All-League 1st Team', 'All-League 2nd Team'] as const;

export function seriesMvp(s: Series): MonId | undefined {
  if (!s.winnerId) return undefined;
  const totals = [...seriesTotals(s.games).values()].filter(t => t.teamId === s.winnerId);
  totals.sort((a, b) => impact(b) - impact(a) || a.monId.localeCompare(b.monId));
  return totals[0]?.monId;
}

export function seasonLine(mon: Mon, season: number): SeasonLine | undefined {
  // a mon traded mid-season has two lines; awards use the sum
  const lines = mon.stats.filter(l => l.season === season);
  if (!lines.length) return undefined;
  if (lines.length === 1) return lines[0];
  const sum: SeasonLine = {...lines[lines.length - 1]};
  for (const k of ['series', 'battles', 'wins', 'kos', 'faints', 'damageDealt', 'damageTaken', 'statusInflicted', 'hazardsSet', 'hazardsRemoved', 'seriesMvps'] as const) {
    sum[k] = lines.reduce((s, l) => s + l[k], 0);
  }
  return sum;
}

function give(state: LeagueState, out: {award: string; monId: MonId; teamId: TeamId}[], mon: Mon, award: string, fame: number): void {
  const teamId = mon.teamId ?? seasonLine(mon, state.season)?.teamId ?? 't0';
  mon.awards.push({season: state.season, award, teamId});
  mon.fame += fame;
  out.push({award, monId: mon.id, teamId});
}

/** Compute and record the season's awards. Returns them for the season summary. */
export function seasonAwards(catalog: Catalog, state: LeagueState): {award: string; monId: MonId; teamId: TeamId}[] {
  const out: {award: string; monId: MonId; teamId: TeamId}[] = [];
  const S = state.season;
  const cands: {mon: Mon; line: SeasonLine}[] = [];
  for (const id in state.mons) {
    const mon = state.mons[id];
    if (mon.retired) continue;
    const line = seasonLine(mon, S);
    if (line && line.battles >= 8) cands.push({mon, line});
  }
  if (!cands.length) return out;
  const top = (score: (c: {mon: Mon; line: SeasonLine}) => number, filter: (c: {mon: Mon; line: SeasonLine}) => boolean = () => true) =>
    cands.filter(filter).sort((a, b) => score(b) - score(a) || a.mon.id.localeCompare(b.mon.id));
  const mvpScore = (c: {line: SeasonLine}) => impact(c.line) + c.line.wins * 6 + c.line.seriesMvps * 15;
  const mvp = top(mvpScore);
  if (mvp[0]) give(state, out, mvp[0].mon, 'MVP', FAME.mvp);
  const off = top(c => c.line.kos * 30 + c.line.damageDealt * 0.4)[0];
  if (off) give(state, out, off.mon, 'Offensive Pokémon of the Year', FAME.award);
  const def = top(c => (c.line.battles - c.line.faints) * 12 + c.line.damageTaken * 0.3, c => c.line.battles >= 12)[0];
  if (def) give(state, out, def.mon, 'Defensive Pokémon of the Year', FAME.award);
  const sup = top(c => (c.line.hazardsSet + c.line.hazardsRemoved) * 12 + c.line.statusInflicted * 12)[0];
  if (sup) give(state, out, sup.mon, 'Support Pokémon of the Year', FAME.award);
  const roy = top(mvpScore, c => c.mon.rookieSeason === S)[0];
  if (roy) give(state, out, roy.mon, 'Rookie of the Year', FAME.award);
  const cb = top(c => {
    const prev = seasonLine(c.mon, S - 1);
    if (!prev) return -Infinity;
    const per = (l: SeasonLine) => impact(l) / Math.max(1, l.battles);
    return (per(c.line) - per(prev)) * 10 + (prev.battles < 10 ? 20 : 0);
  }, c => !!seasonLine(c.mon, S - 1))[0];
  if (cb) give(state, out, cb.mon, 'Comeback Pokémon of the Year', FAME.award);
  const fin = finalSeries(state);
  if (fin?.winnerId) {
    const playoffGames = state.schedule.filter(s => s.playoff && s.season === S).flatMap(s => s.games);
    const totals = [...seriesTotals(playoffGames).values()].filter(t => t.teamId === fin.winnerId).sort((a, b) => impact(b) - impact(a) || a.monId.localeCompare(b.monId));
    const pm = totals[0] && state.mons[totals[0].monId];
    if (pm) give(state, out, pm, 'Indigo Plateau MVP', FAME.plateauMvp);
    for (const id in state.mons) { const m = state.mons[id]; if (m.teamId === fin.winnerId && !m.retired && m.tier === 'active') m.fame += FAME.champion; }
  }
  mvp.slice(0, 6).forEach(c => give(state, out, c.mon, 'All-League 1st Team', FAME.allLeague1));
  mvp.slice(6, 12).forEach(c => give(state, out, c.mon, 'All-League 2nd Team', FAME.allLeague2));
  for (const c of cands) if (c.line.battles >= 20) c.mon.fame += FAME.starterSeason;
  return out;
}

export const hallOfFameWorthy = (mon: Mon): boolean => mon.fame >= FAME.hallOfFame;
