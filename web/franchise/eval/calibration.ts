// Quick-sim calibration and "what predicts a real win". Plays fresh cross-club matches (auto
// lineups, random pairs from several leagues incl. mid-season states) in the real engine and
// records three predictors per side: mean starter OVR (what every AI decision optimises), a
// level-aware stat proxy (sum of actual battle stats from base stats, battle level, EVs and IVs),
// and the quick sim's P(A). Then pools EVERY battle in out/battles.jsonl for the quick-sim
// calibration table and fits logistic slopes.
//   cd web && node franchise/eval/calibration.ts [--analyse-only]
import {readFileSync, writeFileSync} from 'node:fs';
import type {LeagueState, MonId} from '../types.ts';
import {fieldedLineup} from '../model/lineup.ts';
import {monEvs, monIvs} from '../model/export.ts';
import {STATS} from '../model/grades.ts';
import {QUICKSIM_SCALE} from '../model/quicksim.ts';
import {catalog, league, simTo, step, mean, f2, pct, rng, play, closePool, ci, OUT, type Match, type Pick} from './lib.ts';

const R = rng(31);
/** Sum of the six real battle stats at battle level (neutral nature). */
export function statPower(state: LeagueState, p: Pick): number {
  const m = state.mons[p.monId], sp = catalog.species[m.speciesId];
  const ev = monEvs(catalog, m, p.setId), iv = monIvs(catalog, m, p.setId), L = sp.battleLevel;
  let tot = 0;
  for (const k of STATS) {
    const b = (sp.baseStats as Record<string, number>)[k];
    const core = Math.floor(((2 * b + iv[k] + Math.floor((ev[k] ?? 0) / 4)) * L) / 100);
    tot += k === 'hp' ? core + L + 10 : core + 5;
  }
  return tot;
}

if (!process.argv.includes('--analyse-only')) {
  const matches: Match[] = [];
  for (const seed of [11, 12, 13, 14, 15]) {
    const s = league(seed);
    if (seed % 2) { simTo(s, 'regular'); while (s.week < 6) step(s); }
    const ts = Object.keys(s.teams);
    const lu = new Map(ts.map(t => [t, fieldedLineup(catalog, s, t).map(f => ({monId: f.monId, setId: f.setId}))]));
    R.shuffle(ts);
    for (let i = 0; i + 1 < ts.length; i += 2) {
      const [a, b] = [ts[i], ts[i + 1]];
      matches.push({state: s, teamA: a, teamB: b, tag: 'calib', a: lu.get(a)!, b: lu.get(b)!,
        meta: {powA: mean(lu.get(a)!.map(p => statPower(s, p))), powB: mean(lu.get(b)!.map(p => statPower(s, p)))}});
    }
  }
  await play(matches, 2, 909);
  await closePool();
}

// ---------------------------------------------------------------- analysis over every battle played
interface B { tag: string; aWon: boolean; qsP: number; qsScale?: number; ovrA: number; ovrB: number; meta?: {powA?: number; powB?: number} }
// Battles recorded under another QUICKSIM_SCALE (older records: 6.5) are re-expressed at the current one: the quick
// sim's P(A) is a logistic in strength gap / scale, so logit(P) scales by recorded/current (P clamped off 0 and 1).
const lg = (p: number) => { const q = Math.min(1 - 1 / 800, Math.max(1 / 800, p)); return Math.log(q / (1 - q)); };
const raw: B[] = readFileSync(`${OUT}battles.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  .map((b: B) => ({...b, qsP: 1 / (1 + Math.exp(-lg(b.qsP) * (b.qsScale ?? 6.5) / QUICKSIM_SCALE))}));
// the level control changes the export behind the quick sim's back (same mon ids), so it is not a quick-sim matchup
const all = raw.filter(b => b.tag !== 'ctl-level-10');
const lines: string[] = [];
const L = (x = '') => { lines.push(x); console.log(x); };
/** 1-D logistic regression (no intercept, sides are symmetric) by Newton's method. */
function fitSlope(xs: number[], ys: number[]): {k: number; se: number} {
  let k = 0, h = 1;
  for (let it = 0; it < 50; it++) {
    let g = 0; h = 0;
    xs.forEach((x, i) => { const p = 1 / (1 + Math.exp(-k * x)); g += (ys[i] - p) * x; h += p * (1 - p) * x * x; });
    k += g / h;
  }
  return {k, se: 1 / Math.sqrt(h)};
}
const logit = (p: number) => Math.log(Math.max(1e-4, p) / Math.max(1e-4, 1 - p));
const brier = (ps: number[], ys: number[]) => mean(ps.map((p, i) => (p - ys[i]) ** 2));
const y = all.map(b => (b.aWon ? 1 : 0));
L(`## Quick-sim calibration (all ${all.length} real-engine battles from every eval script)`);
L('| quick-sim P(A) bin | battles | quick-sim mean | real A win rate (95% CI) |');
L('|---|---|---|---|');
for (const [lo, hi] of [[0, 0.35], [0.35, 0.45], [0.45, 0.55], [0.55, 0.65], [0.65, 0.8], [0.8, 0.9], [0.9, 1.01]]) {
  const b = all.filter(x => x.qsP >= lo && x.qsP < hi);
  if (!b.length) continue;
  const w = b.filter(x => x.aWon).length / b.length;
  L(`| ${lo.toFixed(2)}–${Math.min(1, hi).toFixed(2)} | ${b.length} | ${pct(mean(b.map(x => x.qsP)))} | ${pct(w)} ± ${pct(ci(w, b.length))} |`);
}
const qs = all.map(b => b.qsP);
L(`Brier score: quick sim ${f2(brier(qs, y))}, coin flip 0.25. Mean |quick sim − 0.5| = ${pct(mean(qs.map(p => Math.abs(p - 0.5))))}.`);
const kq = fitSlope(qs.map(logit), y);
L(`Logistic fit real ~ k·logit(quick sim): k = ${f2(kq.k)} ± ${f2(1.96 * kq.se)} (1 = calibrated; <1 = quick sim overconfident).`);
const dO = all.map(b => b.ovrA - b.ovrB);
const ko = fitSlope(dO, y);
L(`Real win vs mean-starter-OVR gap: slope ${f2(ko.k)} ± ${f2(1.96 * ko.se)} per point → a 10-point OVR edge = ${pct(1 / (1 + Math.exp(-10 * ko.k)))} (quick sim at QUICKSIM_SCALE ${QUICKSIM_SCALE}: 10 pts ≈ ${pct(1 / (1 + Math.exp(-10 / QUICKSIM_SCALE)))} before roles; scale that would match: ${f2(1 / Math.max(1e-6, ko.k))}).`);
const cal = all.filter(b => b.meta?.powA !== undefined);
if (cal.length) {
  const dp = cal.map(b => (b.meta!.powA! - b.meta!.powB!) / 10);
  const yc = cal.map(b => (b.aWon ? 1 : 0));
  const kp = fitSlope(dp, yc), ko2 = fitSlope(cal.map(b => b.ovrA - b.ovrB), yc);
  const sdp = Math.sqrt(mean(dp.map(x => x * x))), sdo = Math.sqrt(mean(cal.map(b => (b.ovrA - b.ovrB) ** 2)));
  L(`Cross-club calibration matches (${cal.length} battles): per-SD effect of predictor on log-odds — OVR gap ${f2(ko2.k * sdo)} ± ${f2(1.96 * ko2.se * sdo)}, level-aware stat proxy ${f2(kp.k * sdp)} ± ${f2(1.96 * kp.se * sdp)}.`);
  // correlation of the two predictors
  const xo = cal.map(b => b.ovrA - b.ovrB), mo = mean(xo), mp = mean(dp);
  const r = xo.reduce((s, x, i) => s + (x - mo) * (dp[i] - mp), 0) / Math.sqrt(xo.reduce((s, x) => s + (x - mo) ** 2, 0) * dp.reduce((s, x) => s + (x - mp) ** 2, 0));
  L(`Correlation of OVR gap with stat-proxy gap: ${f2(r)}.`);
}
L('');
L('Per experiment (quick sim vs real):');
L('| tag | battles | real A win | quick-sim P(A) |');
L('|---|---|---|---|');
for (const tag of [...new Set(all.map(b => b.tag))]) {
  const b = all.filter(x => x.tag === tag); const w = b.filter(x => x.aWon).length / b.length;
  L(`| ${tag} | ${b.length} | ${pct(w)} ± ${pct(ci(w, b.length))} | ${pct(mean(b.map(x => x.qsP)))} |`);
}
writeFileSync(`${OUT}calibration.md`, lines.join('\n') + '\n');
