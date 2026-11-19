// Controls: can the real engine (at the AI budget) tell strong from weak at all?
// C1: a lineup vs itself 10 levels lower. C2: a lineup vs itself at EV grade F (Growth 1).
// C3: the largest OVR-gap pairings at a 30 ms budget (is 10 ms the reason OVR does not predict?).
//   cd web && node franchise/eval/controls.ts
import type {LeagueState, TeamId} from '../types.ts';
import {fieldedLineup} from '../model/lineup.ts';
import {bestRole} from '../model/ratings.ts';
import {catalog, league, mean, f1, pct, rng, play, summarize, closePool, type Match, type Pick} from './lib.ts';

const R = rng(5);
const lines: string[] = [];
const L = (x = '') => { lines.push(x); console.log(x); };
const states = [21, 22, 23].map(s => league(s));
const auto = (s: LeagueState, t: TeamId): Pick[] => fieldedLineup(catalog, s, t).map(f => ({monId: f.monId, setId: f.setId}));
const teams = R.shuffle(states.flatMap(s => Object.keys(s.teams).map(t => ({s, t}))));

const c1: Match[] = teams.slice(0, 15).map(({s, t}) => ({state: s, teamA: t, teamB: t, tag: 'ctl-level-10', a: auto(s, t), b: auto(s, t),
  xfB: (x: string) => x.replace(/Level: (\d+)/g, (_, l) => `Level: ${Number(l) - 10}`)}));
const c2: Match[] = teams.slice(15, 30).map(({s, t}) => {
  const a = auto(s, t);
  const b = a.map(p => { const id = `${p.monId}_F`; s.mons[id] = {...structuredClone(s.mons[p.monId]), id, growth: 1, teamId: null}; return {monId: id, setId: p.setId}; });
  return {state: s, teamA: t, teamB: t, tag: 'ctl-ev-F', a, b, meta: {ovrDrop: mean(a.map(p => bestRole(catalog, s.mons[p.monId]).ovr)) - mean(b.map(p => bestRole(catalog, s.mons[p.monId]).ovr))}};
});
const c3: Match[] = [];
for (const s of states) {
  const ts = Object.keys(s.teams);
  const lu = new Map(ts.map(t => [t, auto(s, t)]));
  const o = (t: TeamId) => mean(lu.get(t)!.map(p => bestRole(catalog, s.mons[p.monId]).ovr));
  const pairs = ts.flatMap((a, i) => ts.slice(i + 1).map(b => (o(a) >= o(b) ? [a, b] : [b, a]))).sort((x, y) => (o(y[0]) - o(y[1])) - (o(x[0]) - o(x[1])));
  const used = new Set<string>();
  for (const [a, b] of pairs) { if (used.has(a) || used.has(b)) continue; used.add(a); used.add(b); c3.push({state: s, teamA: a, teamB: b, tag: 'ctl-gap-30ms', a: lu.get(a)!, b: lu.get(b)!, budget: 30}); if (c3.length % 5 === 0) break; }
}
L('## Controls (real engine)');
L('| control | battles | A win rate (95% CI) | quick-sim P(A) | mean OVR A / B |');
L('|---|---|---|---|---|');
for (const [name, ms] of [['same lineup vs itself 10 levels lower (10 ms)', c1], ['same lineup vs itself at EV grade F (10 ms)', c2], ['largest OVR gaps, 30 ms budget', c3]] as [string, Match[]][]) {
  const rs = await play(ms, 2, name.length);
  const sm = summarize(rs);
  L(`| ${name} | ${sm.n} | ${pct(sm.wr)} ± ${pct(sm.ci)} | ${pct(sm.qs)} | ${f1(mean(rs.map(r => r.ovrA)))} / ${f1(mean(rs.map(r => r.ovrB)))} |`);
}
(await import('node:fs')).writeFileSync(new URL('./out/controls.md', import.meta.url), lines.join('\n') + '\n');
await closePool();
