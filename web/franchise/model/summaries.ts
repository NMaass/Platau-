// Template recaps from box scores (no AI model). Deterministic: the template
// is chosen by a hash of the series id.
import type {BattleResult, Catalog, LeagueState, MonBox, MonId, Series, TeamId} from '../types.ts';
import {hash01} from './rng.ts';

export interface MonTotals { monId: MonId; teamId: TeamId; battles: number; kos: number; faints: number; damageDealt: number; damageTaken: number; statusInflicted: number; hazardsSet: number; hazardsRemoved: number }

export function seriesTotals(games: BattleResult[]): Map<MonId, MonTotals> {
  const map = new Map<MonId, MonTotals>();
  for (const g of games) for (const [id, b] of Object.entries(g.box)) {
    if (!b.played) continue;
    let t = map.get(id);
    if (!t) { t = {monId: id, teamId: b.teamId, battles: 0, kos: 0, faints: 0, damageDealt: 0, damageTaken: 0, statusInflicted: 0, hazardsSet: 0, hazardsRemoved: 0}; map.set(id, t); }
    t.battles++; t.kos += b.kos; t.faints += b.fainted ? 1 : 0; t.damageDealt += b.damageDealt; t.damageTaken += b.damageTaken;
    t.statusInflicted += b.statusInflicted; t.hazardsSet += b.hazardsSet; t.hazardsRemoved += b.hazardsRemoved;
  }
  return map;
}

/** Box-score impact score used for series MVP and season awards. */
export function impact(t: {kos: number; damageDealt: number; statusInflicted: number; hazardsSet: number; hazardsRemoved: number; faints?: number}): number {
  return t.kos * 30 + t.damageDealt * 0.3 + t.statusInflicted * 10 + (t.hazardsSet + t.hazardsRemoved) * 8 - (t.faints ?? 0) * 5;
}

const name = (catalog: Catalog, state: LeagueState, id: MonId) => catalog.species[state.mons[id]?.speciesId]?.name ?? 'Unknown';
const team = (state: LeagueState, id: TeamId) => state.teams[id].name;

function standout(t: MonTotals): string {
  if (t.kos >= 3) return `${t.kos} KOs`;
  if (t.hazardsSet + t.hazardsRemoved >= 3) return `${t.hazardsSet} hazards set and ${t.hazardsRemoved} cleared`;
  if (t.statusInflicted >= 2) return `${t.statusInflicted} statuses spread`;
  if (t.kos >= 1) return `${t.kos} KO${t.kos > 1 ? 's' : ''} and ${Math.round(t.damageDealt)}% damage`;
  return `${Math.round(t.damageDealt)}% damage dealt`;
}

export function gameSummary(catalog: Catalog, state: LeagueState, winner: TeamId, box: Record<MonId, MonBox>, turns: number): string {
  const mine = Object.entries(box).filter(([, b]) => b.teamId === winner && b.played);
  const left = mine.filter(([, b]) => !b.fainted).length;
  const top = mine.sort((a, b) => impact(b[1]) - impact(a[1]))[0];
  const lead = !top ? '' : top[1].kos > 0
    ? ` ${name(catalog, state, top[0])} led with ${top[1].kos} KO${top[1].kos === 1 ? '' : 's'}.`
    : ` ${name(catalog, state, top[0])} led with ${Math.round(top[1].damageDealt)}% damage dealt.`;
  return `${team(state, winner)} win in ${turns} turns with ${left} left standing.${lead}`;
}

export function seriesSummary(catalog: Catalog, state: LeagueState, s: Series): string {
  if (!s.winnerId) return '';
  const loser = s.winnerId === s.homeId ? s.awayId : s.homeId;
  const w = s.games.filter(g => g.winnerTeamId === s.winnerId).length, l = s.games.length - w;
  const totals = [...seriesTotals(s.games).values()];
  const best = (tid: TeamId) => totals.filter(t => t.teamId === tid).sort((a, b) => impact(b) - impact(a))[0];
  const bw = s.mvpMonId ? totals.find(t => t.monId === s.mvpMonId) : best(s.winnerId);
  const bl = best(loser);
  const longest = s.games.reduce((m, g) => Math.max(m, g.turns), 0);
  const h = hash01(s.id, 'tpl');
  const W = team(state, s.winnerId), L = team(state, loser);
  const sweep = l === 0;
  const opener = sweep
    ? [`${W} swept ${L} ${w}–0.`, `${W} made quick work of ${L}, ${w}–0.`, `No contest: ${W} beat ${L} ${w}–0.`][Math.floor(h * 3)]
    : [`${W} edged ${L} ${w}–${l}.`, `${W} outlasted ${L} ${w}–${l}.`, `${W} took the series from ${L}, ${w}–${l}.`][Math.floor(h * 3)];
  const parts = [opener];
  if (bw) parts.push(`${name(catalog, state, bw.monId)} was the difference with ${standout(bw)}.`);
  if (bl && bl.kos + bl.statusInflicted + bl.hazardsSet > 0) parts.push(`${name(catalog, state, bl.monId)} had ${standout(bl)} in defeat.`);
  if (!sweep && longest >= 40) parts.push(`The longest game ran ${longest} turns.`);
  if (s.playoff === 'final') parts.push(`${W} are Indigo Plateau champions.`);
  else if (s.playoff) parts.push(`${W} advance.`);
  return parts.join(' ');
}
