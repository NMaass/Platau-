// Lineup AI (model/lineup.ts planLineup/autoLineup, season.ts chooseStrategy).
// Part A (static): auto lineup vs brute-force optimum vs random lineups vs top-6-OVR, strategy spread.
// Part B (real engine): auto vs random / same six with best sets / shuffled order / top-6 OVR,
//   OVR gap curve, weather with vs without its setter.
//   cd web && node franchise/eval/lineup.ts [--static]
import type {LeagueState, Mon, TeamId} from '../types.ts';
import {STRATEGIES, strategyById} from '../model/strategies.ts';
import {canBattle, fieldedLineup, planLineup} from '../model/lineup.ts';
import {allRoles, bestRole} from '../model/ratings.ts';
import {WEATHER_SETTER} from '../catalog/roles.ts';
import {teamMons} from '../model/util.ts';
import {catalog, league, simTo, step, clone, mean, f1, f2, pct, rng, play, summarize, save, closePool, type Pick, type Match} from './lib.ts';

const STATIC_ONLY = process.argv.includes('--static');
const SEEDS = [1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------- objective (same rules as the model, no in-slot preference)
interface Cand { mon: Mon; practice: boolean; fit: {on: boolean; r: number; setId: string}[] }
function cands(state: LeagueState, t: TeamId, sid: string): Cand[] {
  const strat = strategyById(sid);
  return teamMons(state, t).filter(canBattle).map(mon => {
    const all = allRoles(catalog, mon);
    return {mon, practice: mon.tier === 'practice', fit: strat.slots.map(roles => {
      const hits = all.filter(x => roles.includes(x.role));
      if (hits.length) { const h = hits.reduce((a, b) => (b.ovr > a.ovr ? b : a)); return {on: true, r: h.ovr, setId: h.setId}; }
      return {on: false, r: (all[0]?.ovr ?? 40) - 25, setId: all[0]?.setId ?? mon.setId};
    })};
  });
}
/** Exhaustive optimum: max on-role slots, then max rating sum (practice allowed only on-role, -6). */
function bruteForce(cs: Cand[]): {on: number; sum: number; picks: number[]} {
  const nonPractice = cs.filter(c => !c.practice).length;
  const val = (c: Cand, s: number) => (c.practice && !c.fit[s].on && nonPractice >= 6 ? null : (c.fit[s].on ? 10000 : 0) + c.fit[s].r - (c.practice ? 6 : 0));
  const memo = new Map<string, [number, number]>();
  const go = (s: number, used: number): number => {
    if (s === 6) return 0;
    const k = `${s}:${used}`; const h = memo.get(k); if (h !== undefined) return h[0];
    let best = -1e9, arg = -1;
    cs.forEach((c, i) => { if (used & (1 << i)) return; const v = val(c, s); if (v === null) return; const t = v + go(s + 1, used | (1 << i)); if (t > best) { best = t; arg = i; } });
    memo.set(k, [best, arg]); return best;
  };
  go(0, 0);
  const picks: number[] = []; let used = 0;
  for (let s = 0; s < 6; s++) { const a = memo.get(`${s}:${used}`)![1]; picks.push(a); used |= 1 << a; }
  return {...evalPicks(cs, picks), picks};
}
function evalPicks(cs: Cand[], picks: number[]): {on: number; sum: number} {
  let on = 0, sum = 0;
  picks.forEach((ci, s) => { const f = cs[ci].fit[s]; if (f.on) on++; sum += f.r; });
  return {on, sum};
}
/** Best slot assignment of a fixed set of 6 candidates (6! perms). */
function bestAssign(cs: Cand[], six: number[]): {on: number; sum: number; perm: number[]} {
  let best = {on: -1, sum: -1e9, perm: six};
  const perm = (arr: number[], k: number) => {
    if (k === arr.length) { const e = evalPicks(cs, arr); if (e.on > best.on || (e.on === best.on && e.sum > best.sum)) best = {...e, perm: [...arr]}; return; }
    for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; }
  };
  perm([...six], 0);
  return best;
}

// ---------------------------------------------------------------- part A
const R = rng(99);
const rowsA: Record<string, number[]> = {autoOn: [], optOn: [], autoSum: [], optSum: [], randOn: [], randSum: [], top6On: [], top6Sum: [], gapOn: [], gapSum: []};
let teamStrats = 0, exactOn = 0, exactSum = 0;
const chosen: Record<string, number> = {}; let favChosen = 0, fullOnRole = 0, aiTeams = 0;
const unfillable: Record<string, number> = {}; let chosenVsBest: number[] = [];
const states: LeagueState[] = [];
for (const seed of SEEDS) {
  for (const when of ['start', 'week8'] as const) {
    const s = league(seed);
    if (when === 'week8') { simTo(s, 'regular'); while (s.week < 8) step(s); }
    states.push(s);
    for (const t of Object.keys(s.teams)) {
      if (s.teams[t].human) continue;
      aiTeams++;
      const sid = s.teams[t].lineup.strategyId;
      chosen[sid] = (chosen[sid] ?? 0) + 1;
      if (s.teams[t].favoriteStrategies.includes(sid)) favChosen++;
      let bestSum = -1;
      for (const st of STRATEGIES) {
        const plan = planLineup(catalog, s, t, st.id);
        const cs = cands(s, t, st.id);
        const idx = new Map(cs.map((c, i) => [c.mon.id, i]));
        const autoPicks = plan.slots.map(sl => idx.get(sl.monId!)!);
        const a = evalPicks(cs, autoPicks);
        if (process.env.DEBUG && a.on < bruteForce(cs).on) { const o = bruteForce(cs); console.log(st.id, t, 'auto', autoPicks.map((i, k) => `${cs[i].mon.speciesId}:${cs[i].mon.tier}:${cs[i].fit[k].on}`), 'opt', o.picks.map((i, k) => `${cs[i].mon.speciesId}:${cs[i].mon.tier}:${cs[i].fit[k].on}`)); }
        const o = bruteForce(cs);
        teamStrats++;
        if (a.on === o.on) exactOn++;
        if (a.on === o.on && Math.abs(a.sum - o.sum) <= 2) exactSum++;
        rowsA.autoOn.push(a.on); rowsA.optOn.push(o.on); rowsA.autoSum.push(a.sum); rowsA.optSum.push(o.sum);
        rowsA.gapOn.push(o.on - a.on); rowsA.gapSum.push(o.sum - a.sum);
        if (o.on < 6) unfillable[st.id] = (unfillable[st.id] ?? 0) + 1;
        if (o.on === 6) bestSum = Math.max(bestSum, o.sum);
        // random valid lineups from active+backup (no practice)
        const pool = cs.map((c, i) => i).filter(i => !cs[i].practice);
        const ro: number[] = [], rs: number[] = [];
        for (let k = 0; k < 100; k++) { const six = R.shuffle([...pool]).slice(0, 6); const e = evalPicks(cs, six); ro.push(e.on); rs.push(e.sum); }
        rowsA.randOn.push(mean(ro)); rowsA.randSum.push(mean(rs));
        // top-6 by OVR (active+backup), best slot assignment
        const top6 = [...pool].sort((x, y) => bestRole(catalog, cs[y].mon).ovr - bestRole(catalog, cs[x].mon).ovr).slice(0, 6);
        const tb = bestAssign(cs, top6);
        rowsA.top6On.push(tb.on); rowsA.top6Sum.push(tb.sum);
      }
      const cp = planLineup(catalog, s, t, sid);
      if (cp.onRole === 6) fullOnRole++;
      if (bestSum > 0) chosenVsBest.push(bestSum - cp.ratingSum);
    }
  }
}
const lines: string[] = [];
const L = (x = '') => { lines.push(x); console.log(x); };
L(`## Lineup AI — static (${SEEDS.length} leagues × {start, week 8}, ${aiTeams} AI team-states × ${STRATEGIES.length} strategies = ${teamStrats})`);
L('| lineup | on-role slots (of 6) | rating sum (6 slots) |');
L('|---|---|---|');
L(`| auto (planLineup) | ${f2(mean(rowsA.autoOn))} | ${f1(mean(rowsA.autoSum))} |`);
L(`| brute-force optimum | ${f2(mean(rowsA.optOn))} | ${f1(mean(rowsA.optSum))} |`);
L(`| top-6 OVR, best assignment | ${f2(mean(rowsA.top6On))} | ${f1(mean(rowsA.top6Sum))} |`);
L(`| random 6 of active+backup, random slots | ${f2(mean(rowsA.randOn))} | ${f1(mean(rowsA.randSum))} |`);
L(`Auto matches the optimum's on-role count in ${pct(exactOn / teamStrats)} of cases, and its rating sum (±2) in ${pct(exactSum / teamStrats)}; mean gap ${f2(mean(rowsA.gapOn))} slots / ${f1(mean(rowsA.gapSum))} pts (max ${Math.max(...rowsA.gapSum)}).`);
L(`Strategies chosen by AI teams: ${Object.entries(chosen).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}. Favourite chosen ${pct(favChosen / aiTeams)}; chosen lineup fully on-role ${pct(fullOnRole / aiTeams)}; chosen strategy's rating sum below the best fully-on-role strategy by ${f1(mean(chosenVsBest))} pts on average.`);
L(`Strategies a roster cannot fill fully on-role (count of ${aiTeams} team-states): ${STRATEGIES.map(s => `${s.id} ${unfillable[s.id] ?? 0}`).join(', ')}.`);
save('lineup-static', {rowsA: Object.fromEntries(Object.entries(rowsA).map(([k, v]) => [k, mean(v)])), chosen, favChosen, aiTeams, fullOnRole, unfillable});

if (STATIC_ONLY) { (await import('node:fs')).writeFileSync(new URL('./out/lineup.md', import.meta.url), lines.join('\n') + '\n'); process.exit(0); }

// ---------------------------------------------------------------- part B (real engine)
const starts = states.filter((_, i) => i % 2 === 0);   // league-start states
const bestSet = (m: Mon) => allRoles(catalog, m)[0]?.setId ?? m.setId;
const autoOf = (s: LeagueState, t: TeamId): Pick[] => fieldedLineup(catalog, s, t).map(f => ({monId: f.monId, setId: f.setId}));
const ab = (s: LeagueState, t: TeamId) => teamMons(s, t).filter(m => canBattle(m) && m.tier !== 'practice');
const teamsAll = starts.flatMap(s => Object.keys(s.teams).filter(t => !s.teams[t].human).map(t => ({s, t})));
R.shuffle(teamsAll);
const pickN = (n: number, off: number) => teamsAll.slice(off, off + n);

const exp: {name: string; matches: Match[]}[] = [];
exp.push({name: 'auto vs random 6 (active+backup, best sets, random order)', matches: pickN(30, 0).map(({s, t}) => ({state: s, teamA: t, teamB: t, tag: 'auto-vs-random', a: autoOf(s, t),
  b: R.shuffle(ab(s, t)).slice(0, 6).map(m => ({monId: m.id, setId: bestSet(m)}))}))});
exp.push({name: 'auto vs same six, each on its best-OVR set (same order)', matches: pickN(25, 30).map(({s, t}) => { const a = autoOf(s, t); return {state: s, teamA: t, teamB: t, tag: 'auto-vs-bestset', a, b: a.map(p => ({monId: p.monId, setId: bestSet(s.mons[p.monId])}))}; })
  .filter(m => m.a.some((p, i) => p.setId !== m.b[i].setId))});
exp.push({name: 'auto vs same six & sets, shuffled order (lead)', matches: pickN(20, 55).map(({s, t}) => { const a = autoOf(s, t); return {state: s, teamA: t, teamB: t, tag: 'auto-vs-shuffled', a, b: R.shuffle([...a])}; })});
exp.push({name: 'auto (strategy) vs top-6 OVR on best sets', matches: pickN(25, 75).map(({s, t}) => {
  const a = autoOf(s, t);
  const top = [...ab(s, t)].sort((x, y) => bestRole(catalog, y).ovr - bestRole(catalog, x).ovr).slice(0, 6);
  return {state: s, teamA: t, teamB: t, tag: 'auto-vs-top6', a, b: top.map(m => ({monId: m.id, setId: bestSet(m)})), meta: {sameSix: top.every(m => a.some(p => p.monId === m.id))}};
}).filter(m => !m.meta!.sameSix)});
// OVR gap: auto lineups of two teams of the same league, spread over gaps
const gapPairs: Match[] = [];
for (const s of starts) {
  const ts = Object.keys(s.teams);
  const lu = new Map(ts.map(t => [t, autoOf(s, t)]));
  const pairs = ts.flatMap((a, i) => ts.slice(i + 1).map(b => ({a, b, gap: mean(lu.get(a)!.map(p => bestRole(catalog, s.mons[p.monId]).ovr)) - mean(lu.get(b)!.map(p => bestRole(catalog, s.mons[p.monId]).ovr))})));
  pairs.sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));
  // 8 per league: spread from largest to smallest gaps
  for (let k = 0; k < 8; k++) { const p = pairs[Math.floor((k * (pairs.length - 1)) / 7 * 0.7)]; const [A, B] = p.gap >= 0 ? [p.a, p.b] : [p.b, p.a]; gapPairs.push({state: s, teamA: A, teamB: B, tag: 'ovr-gap', a: lu.get(A)!, b: lu.get(B)!}); }
}
exp.push({name: 'higher-OVR team vs lower-OVR team (auto lineups)', matches: gapPairs});
// weather with vs without its setter
const wx: Match[] = [];
for (const s of starts) for (const t of Object.keys(s.teams)) for (const st of STRATEGIES.filter(x => x.weather)) {
  const plan = planLineup(catalog, s, t, st.id);
  const setter = WEATHER_SETTER[st.weather!];
  const sl0 = plan.slots[0];
  if (!sl0.monId || sl0.role !== setter || plan.onRole < 5) continue;
  if (!allRoles(catalog, s.mons[sl0.monId]).some(r => r.role === setter)) continue;
  const a: Pick[] = plan.slots.map(sl => ({monId: sl.monId!, setId: sl.setId!}));
  const used = new Set(a.map(p => p.monId));
  const sub = ab(s, t).filter(m => !used.has(m.id) && !allRoles(catalog, m).some(r => r.role === setter)).sort((x, y) => bestRole(catalog, y).ovr - bestRole(catalog, x).ovr)[0];
  if (!sub) continue;
  wx.push({state: s, teamA: t, teamB: t, tag: 'weather-setter', a, b: [{monId: sub.id, setId: bestSet(sub)}, ...a.slice(1)], meta: {weather: st.weather, setterOvr: bestRole(catalog, s.mons[sl0.monId]).ovr, subOvr: bestRole(catalog, sub).ovr}});
}
exp.push({name: 'weather lineup with setter vs setter swapped for best non-setter', matches: R.shuffle(wx).slice(0, 25)});

L('');
L(`## Lineup AI — real engine (budget ${process.env.BUDGET ?? 10} ms/decision, each match played twice with sides swapped)`);
L('| experiment | matches | battles | A win rate (95% CI) | quick-sim P(A) | mean OVR A / B |');
L('|---|---|---|---|---|---|');
const allRes: Record<string, unknown> = {};
let si = 1;
for (const e of exp) {
  if (!e.matches.length) { L(`| ${e.name} | 0 | 0 | - | - | - |`); continue; }
  console.error(`running: ${e.name}`);
  const rs = await play(e.matches, 2, si++);
  const sm = summarize(rs);
  allRes[e.name] = rs;
  L(`| ${e.name} | ${e.matches.length} | ${sm.n} | ${pct(sm.wr)} ± ${pct(sm.ci)} | ${pct(sm.qs)} | ${f1(mean(rs.map(r => r.ovrA)))} / ${f1(mean(rs.map(r => r.ovrB)))} |`);
  if (e.matches[0].tag === 'ovr-gap') {
    const bins = [[0, 1.5], [1.5, 3], [3, 5], [5, 99]];
    L('');
    L('OVR gap curve (mean starter OVR A − B):');
    L('| gap | battles | real win rate A | quick-sim P(A) |');
    L('|---|---|---|---|');
    for (const [lo, hi] of bins) {
      const b = rs.filter(r => r.ovrA - r.ovrB >= lo && r.ovrA - r.ovrB < hi);
      if (!b.length) continue;
      const x = summarize(b);
      L(`| ${lo}–${hi === 99 ? '+' : hi} | ${x.n} | ${pct(x.wr)} ± ${pct(x.ci)} | ${pct(x.qs)} |`);
    }
    L('');
  }
  if (sm.problems) L(`(battles with engine problems: ${sm.problems})`);
}
save('lineup-engine', allRes);
(await import('node:fs')).writeFileSync(new URL('./out/lineup.md', import.meta.url), lines.join('\n') + '\n');
await closePool();
