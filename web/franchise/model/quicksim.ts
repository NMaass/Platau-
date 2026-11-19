// FAKE battle resolver: turns a BattleJob into a plausible BattleJobResult from
// role ratings plus randomness, with a fake box score, so the league runs
// without the engine. The real engine plugs in through the same types.
import type {BattleJob, BattleJobResult, Catalog, LeagueState, MonBox, MonId, Role} from '../types.ts';
import {seededRng} from './rng.ts';
import {allRoles, bestRole} from './ratings.ts';

const STATUSES = ['brn', 'par', 'psn', 'tox', 'slp'];
const HAZARD_ROLES: Role[] = ['rocks', 'spikes'];
const WEATHER_PAIRS: [Role, Role][] = [['rain-setter', 'rain-abuser'], ['sun-setter', 'sun-abuser'], ['sand-setter', 'sand-abuser'], ['snow-setter', 'snow-abuser']];

/** Temperature of the outcome: rating gap of ~8 points ≈ 73% win. */
export const QUICKSIM_SCALE = 6.5;

interface Side { ids: MonId[]; ratings: number[]; roles: Set<Role>[] }

function side(catalog: Catalog, state: LeagueState, ids: MonId[]): Side {
  const mons = ids.map(id => state.mons[id]);
  return {
    ids,
    ratings: mons.map(m => (m ? bestRole(catalog, m).ovr : 40)),
    roles: mons.map(m => new Set(m ? allRoles(catalog, m).map(r => r.role) : [])),
  };
}

function strength(s: Side): number {
  if (!s.ids.length) return 0;
  const sorted = [...s.ratings].sort((a, b) => b - a);
  let v = sorted.reduce((a, b, i) => a + b * (i < 4 ? 1.15 : 0.8), 0) / s.ids.length;
  const has = (r: Role) => s.roles.some(x => x.has(r));
  for (const [setter, abuser] of WEATHER_PAIRS) if (has(setter) && s.roles.filter(x => x.has(abuser)).length >= 2) v += 1.5;
  if (has('rocks')) v += 0.8;
  if (has('remover')) v += 0.5;
  v -= (6 - s.ids.length) * 8;
  return v;
}

export function quickSim(catalog: Catalog, state: LeagueState, job: BattleJob): BattleJobResult {
  const rng = seededRng(job.seed);
  const a = side(catalog, state, job.p1.monIds), b = side(catalog, state, job.p2.monIds);
  const diff = strength(a) - strength(b);
  const pA = 1 / (1 + Math.exp(-diff / QUICKSIM_SCALE));
  const winner: 'p1' | 'p2' = rng.next() < pA ? 'p1' : 'p2';
  const [W, L] = winner === 'p1' ? [a, b] : [b, a];
  const [wTeam, lTeam] = winner === 'p1' ? [job.p1.teamId, job.p2.teamId] : [job.p2.teamId, job.p1.teamId];
  const box: Record<MonId, MonBox> = {};
  const blank = (teamId: string): MonBox => ({teamId, played: false, kos: 0, fainted: false, damageDealt: 0, damageTaken: 0, statusInflicted: 0, hazardsSet: 0, hazardsRemoved: 0});
  for (const id of W.ids) box[id] = blank(wTeam);
  for (const id of L.ids) box[id] = blank(lTeam);
  // how many of the winner's fall (closer games cost more)
  const close = 1 - Math.abs(pA - 0.5) * 2;
  const wFaints = Math.min(W.ids.length - 1, Math.max(0, Math.round(rng.next() * 3 + close * 2 - 0.5)));
  const lPlayed = L.ids.length;
  const wPlayed = Math.min(W.ids.length, Math.max(wFaints + 1, W.ids.length - rng.int(2)));
  const pickBy = (s: Side, n: number, played: number) => {
    const w = s.ids.slice(0, played).map((id, i) => ({id, w: Math.max(1, s.ratings[i] - 50)}));
    return Array.from({length: n}, () => rng.weighted(w, x => x.w)!.id);
  };
  // KOs: every loser falls; credit goes to winner's mons weighted by rating
  for (const id of L.ids) { box[id].played = true; box[id].fainted = true; box[id].damageTaken = 100; }
  for (const id of pickBy(W, lPlayed, wPlayed)) box[id].kos++;
  const wOrder = W.ids.slice(0, wPlayed);
  rng.shuffle(wOrder);
  for (const id of W.ids.slice(0, wPlayed)) box[id].played = true;
  for (const id of wOrder.slice(0, wFaints)) { box[id].fainted = true; box[id].damageTaken = 100; }
  for (const id of pickBy(L, wFaints, lPlayed)) box[id].kos++;
  // damage dealt roughly matches damage taken by the other side
  const spread = (from: Side, played: number, total: number) => {
    const ws = from.ids.slice(0, played).map((id, i) => ({id, w: Math.max(1, from.ratings[i] - 45) * (0.6 + rng.next())}));
    const sum = ws.reduce((s, x) => s + x.w, 0);
    for (const x of ws) box[x.id].damageDealt += Math.round((total * x.w) / sum);
  };
  for (const id of W.ids.slice(0, wPlayed)) if (!box[id].fainted) box[id].damageTaken = Math.round(rng.next() * 80);
  const dmgOnW = W.ids.reduce((s, id) => s + box[id].damageTaken, 0);
  spread(W, wPlayed, lPlayed * 100);
  spread(L, lPlayed, dmgOnW);
  // support plays
  for (const [S, played] of [[W, wPlayed], [L, lPlayed]] as [Side, number][]) {
    S.ids.slice(0, played).forEach((id, i) => {
      if (HAZARD_ROLES.some(r => S.roles[i].has(r)) && rng.chance(0.7)) box[id].hazardsSet += 1 + rng.int(2);
      if (S.roles[i].has('remover') && rng.chance(0.45)) box[id].hazardsRemoved += 1;
      if ((S.roles[i].has('wall') || S.roles[i].has('pivot')) && rng.chance(0.35)) box[id].statusInflicted += 1;
      if (!box[id].fainted && rng.chance(0.12)) box[id].endStatus = rng.pick(STATUSES);
    });
  }
  const turns = 12 + rng.int(25) + Math.round(close * 15);
  const log = [
    `|player|p1|${job.p1.name}|${job.p1.trainer}`, `|player|p2|${job.p2.name}|${job.p2.trainer}`,
    '|gametype|singles', '|gen|9', '|tier|Plateau (quicksim)', '|start', `|turn|${turns}`,
    `|win|${winner === 'p1' ? job.p1.name : job.p2.name}`,
  ];
  return {id: job.id, winner, turns, log, box, problems: []};
}
