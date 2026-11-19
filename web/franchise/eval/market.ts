// Trade and free-agency AI sanity over fast-sim seasons (no engine).
// AI-AI trades: true value each side gave/got and the counterfactual change in each club's best
// lineup score (chooseStrategy's objective), at the trade and one season later.
// Free agency: what AI clubs sign, whether it improves their lineup, who is left unsigned, floor payers.
//   cd web && node franchise/eval/market.ts [seasons=3]
import type {LeagueState, MonId, TeamId} from '../types.ts';
import {planLineup} from '../model/lineup.ts';
import {STRATEGIES} from '../model/strategies.ts';
import {STRATEGY_PICK} from '../model/season.ts';
import {bestRole} from '../model/ratings.ts';
import {monValue} from '../model/value.ts';
import {freeAgents} from '../model/util.ts';
import {catalog, league, step, mean, f1, pct, save} from './lib.ts';

const SEASONS = Number(process.argv[2] ?? 3);
const lines: string[] = [];
const L = (x = '') => { lines.push(x); console.log(x); };

function teamScore(s: LeagueState, t: TeamId): number {
  const team = s.teams[t];
  let best = -1e9;
  for (const st of STRATEGIES) {
    const plan = planLineup(catalog, s, t, st.id);
    const fav = st.id === team.favoriteStrategies[0] ? STRATEGY_PICK.favourite1 : st.id === team.favoriteStrategies[1] ? STRATEGY_PICK.favourite2 : 0;
    best = Math.max(best, plan.ratingSum / 6 - (6 - plan.onRole) * STRATEGY_PICK.offRolePenalty + fav);
  }
  return best;
}
/** Score of team t if the given mons were moved to the given owners (temporarily). */
function scoreWith(s: LeagueState, t: TeamId, moves: [MonId, TeamId | null][]): number {
  const old = moves.map(([id]) => [id, s.mons[id].teamId, s.mons[id].tier] as const);
  for (const [id, to] of moves) { s.mons[id].teamId = to; if (to) s.mons[id].tier = 'backup'; }
  const v = teamScore(s, t);
  for (const [id, tm, tier] of old) { s.mons[id].teamId = tm; s.mons[id].tier = tier; }
  return v;
}

interface TradeRow { season: number; week: number; a: TeamId; b: TeamId; aGot: MonId[]; bGot: MonId[]; ovrA: number; ovrB: number; valA: number; valB: number; ageA: number; ageB: number; gainA: number; gainB: number; laterOvrA?: number; laterOvrB?: number }
interface SignRow { season: number; team: TeamId; mon: MonId; ovr: number; age: number; gain: number; starter?: boolean; salary: number }
const trades: TradeRow[] = [], signs: SignRow[] = [];
const leftover: {topLeftOvr: number; medianSignedOvr: number; signed: number; fas: number}[] = [];
let floorPays = 0, teamSeasons = 0;
const sumVal = (s: LeagueState, ids: MonId[]) => ids.reduce((a, id) => a + monValue(catalog, s, s.mons[id], null), 0);
const meanOvr = (s: LeagueState, ids: MonId[]) => mean(ids.map(id => bestRole(catalog, s.mons[id]).ovr));

for (const seed of [1, 2, 3, 4]) {
  const s = league(seed);
  const startSeason = s.season;
  let faSigns: SignRow[] = [];
  while (s.season < startSeason + SEASONS || s.phase !== 'preseason') {
    const n0 = s.log.length, phase0 = s.phase;
    const fas0 = phase0 === 'free-agency' ? freeAgents(s).map(m => m.id) : [];
    step(s);
    // the log keeps the last 3000 entries; entries added this step are at the end
    const added = s.log.slice(Math.min(n0, s.log.length));
    for (const tx of added) {
      if (tx.kind === 'trade' && tx.teamIds.every(t => !s.teams[t].human)) {
        const [a, b] = tx.teamIds;
        const aGot = tx.monIds.filter(id => s.mons[id].teamId === a), bGot = tx.monIds.filter(id => s.mons[id].teamId === b);
        const undo: [MonId, TeamId][] = [...aGot.map(id => [id, b] as [MonId, TeamId]), ...bGot.map(id => [id, a] as [MonId, TeamId])];
        trades.push({season: s.season, week: s.week, a, b, aGot, bGot, ovrA: meanOvr(s, aGot), ovrB: meanOvr(s, bGot), valA: sumVal(s, aGot), valB: sumVal(s, bGot),
          ageA: mean(aGot.map(id => s.mons[id].age)), ageB: mean(bGot.map(id => s.mons[id].age)),
          gainA: teamScore(s, a) - scoreWith(s, a, undo), gainB: teamScore(s, b) - scoreWith(s, b, undo)});
      }
      if (tx.kind === 'signed' && phase0 === 'free-agency' && !s.teams[tx.teamIds[0]].human) {
        const t = tx.teamIds[0], id = tx.monIds[0];
        const row: SignRow = {season: s.season, team: t, mon: id, ovr: bestRole(catalog, s.mons[id]).ovr, age: s.mons[id].age, gain: teamScore(s, t) - scoreWith(s, t, [[id, null]]), salary: s.mons[id].contract?.salary ?? 0};
        signs.push(row); faSigns.push(row);
      }
      if (tx.kind === 'floor') floorPays++;
    }
    if (phase0 === 'free-agency' && s.phase === 'preseason') {
      const left = freeAgents(s).map(m => bestRole(catalog, m).ovr).sort((x, y) => y - x);
      const so = faSigns.map(r => r.ovr).sort((x, y) => x - y);
      leftover.push({topLeftOvr: mean(left.slice(0, 5)), medianSignedOvr: so[Math.floor(so.length / 2)] ?? NaN, signed: so.length, fas: fas0.length});
      for (const r of faSigns) r.starter = s.mons[r.mon].teamId === r.team && s.teams[r.team].lineup.slots.some(sl => sl.monId === r.mon);
      faSigns = [];
    }
    if (s.phase === 'regular' && s.week === 1 && phase0 === 'preseason') teamSeasons += 16;
    // a season after each trade: OVR of what each side got
    if (phase0 === 'free-agency' && s.phase === 'preseason') for (const t of trades) if (t.laterOvrA === undefined && t.season < s.season) {
      t.laterOvrA = meanOvr(s, t.aGot); t.laterOvrB = meanOvr(s, t.bGot);
    }
  }
}

L(`## Trades (AI ↔ AI), ${trades.length} trades over 4 leagues × ${SEASONS} fast-sim seasons`);
const dVal = trades.map(t => Math.abs(t.valA - t.valB)), dOvr = trades.map(t => Math.abs(t.ovrA - t.ovrB));
const big = trades.filter(t => Math.abs(t.valA - t.valB) > 0.5 * Math.max(t.valA, t.valB, 1));
L(`Mean |true value gap| ${f1(mean(dVal))} pts (value scale: OVR-95 prime starter ≈ 100); mean |OVR gap| ${f1(mean(dOvr))}; ${pct(big.length / trades.length)} of trades have one side getting < half the other's true value.`);
const gains = trades.flatMap(t => [t.gainA, t.gainB]);
L(`Lineup effect (chooseStrategy score, per-slot points): mean ${f1(mean(gains))}; ${pct(gains.filter(g => g > 0.05).length / gains.length)} of sides improve their best lineup, ${pct(gains.filter(g => g < -0.05).length / gains.length)} get worse, ${pct(gains.filter(g => Math.abs(g) <= 0.05).length / gains.length)} unchanged (bench-for-bench).`);
const later = trades.filter(t => t.laterOvrA !== undefined);
L(`One season later: mean |OVR gap| between what the sides got ${f1(mean(later.map(t => Math.abs(t.laterOvrA! - t.laterOvrB!))))} (n=${later.length}). Age of mons moved: ${f1(mean(trades.flatMap(t => [t.ageA, t.ageB])))}.`);
L('Largest true-value gaps:');
for (const t of [...trades].sort((x, y) => Math.abs(y.valA - y.valB) - Math.abs(x.valA - x.valB)).slice(0, 4)) {
  L(`- S${t.season} W${t.week}: ${t.a} got OVR ${f1(t.ovrA)} age ${f1(t.ageA)} (value ${f1(t.valA)}) ↔ ${t.b} got OVR ${f1(t.ovrB)} age ${f1(t.ageB)} (value ${f1(t.valB)}); lineup gain ${f1(t.gainA)} / ${f1(t.gainB)}`);
}
L('');
L(`## Free agency (AI clubs), ${signs.length} signings over ${leftover.length} offseasons`);
L(`Signings per offseason ${f1(mean(leftover.map(x => x.signed)))} of ${f1(mean(leftover.map(x => x.fas)))} free agents. Mean OVR signed ${f1(mean(signs.map(r => r.ovr)))}, age ${f1(mean(signs.map(r => r.age)))}.`);
L(`Signings that improve the club's best lineup: ${pct(signs.filter(r => r.gain > 0.05).length / signs.length)}; that start right after FA: ${pct(signs.filter(r => r.starter).length / signs.length)}; mean lineup gain ${f1(mean(signs.map(r => r.gain)))} per slot.`);
L(`Best 5 unsigned free agents after FA: mean OVR ${f1(mean(leftover.map(x => x.topLeftOvr)))} vs median OVR signed ${f1(mean(leftover.map(x => x.medianSignedOvr)))}.`);
L(`Salary-floor payments: ${floorPays} of ${teamSeasons} club-seasons.`);
save('market', {trades, signs, leftover, floorPays, teamSeasons});
(await import('node:fs')).writeFileSync(new URL('./out/market.md', import.meta.url), lines.join('\n') + '\n');
