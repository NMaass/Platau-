// Draft AI. Part A: the season draft (model/draft.ts aiChoice) vs baselines, scored by each
// prospect's REALISED OVR three seasons later (AI league simmed on with the fast sim) and by its
// true projected peak. Part B: the startup fantasy draft (newLeague start 'fantasy-draft') vs
// random rosters, and a mixed snake draft where half the clubs draft need-aware, played out in
// the real engine.
//   cd web && node franchise/eval/draft.ts [--static]
import type {LeagueState, Mon, TeamId} from '../types.ts';
import {aiChoice, availableProspects, makePick, onTheClock} from '../model/draft.ts';
import {projectedOvr, needBoost} from '../model/value.ts';
import {knownRating} from '../model/scouting.ts';
import {allRoles, bestRole} from '../model/ratings.ts';
import {isLegendary} from '../model/mons.ts';
import {planLineup, fieldedLineup} from '../model/lineup.ts';
import {chooseStrategy, STRATEGY_PICK} from '../model/season.ts';
import {STRATEGIES} from '../model/strategies.ts';
import {teamMons} from '../model/util.ts';
import {GROWTH_BAND_HI} from '../model/grades.ts';
import {catalog, league, simTo, step, clone, mean, sd, f1, f2, pct, rng, play, summarize, save, closePool, type Match} from './lib.ts';

const STATIC_ONLY = process.argv.includes('--static');
const lines: string[] = [];
const L = (x = '') => { lines.push(x); console.log(x); };
const R = rng(7);

function spearman(xs: number[], ys: number[]): number {
  const rank = (v: number[]) => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); o.forEach(([, i], k) => (r[i] = k)); return r; };
  const rx = rank(xs), ry = rank(ys), mx = mean(rx), my = mean(ry);
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) { n += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return n / Math.sqrt(dx * dy);
}

// ---------------------------------------------------------------- part A: season draft
type Policy = (s: LeagueState, t: TeamId) => Mon | undefined;
const truthProj = (s: LeagueState, m: Mon) => projectedOvr(catalog, s, null, m);
const POLICIES: Record<string, Policy> = {
  'AI (aiChoice)': (s, t) => aiChoice(catalog, s, t),
  'best scouted OVR now': (s, t) => argmax(availableProspects(s), m => { const k = knownRating(catalog, s, t, m); return (k.lo + k.hi) / 2; }),
  'best true OVR now': (s) => argmax(availableProspects(s), m => bestRole(catalog, m).ovr),
  'best true projected peak': (s) => argmax(availableProspects(s), m => truthProj(s, m)),
  'random': (s) => R.pick(availableProspects(s)),
};
function argmax<T>(xs: T[], f: (x: T) => number): T | undefined { let b: T | undefined, bv = -Infinity; for (const x of xs) { const v = f(x); if (v > bv) { bv = v; b = x; } } return b; }
function runDraft(s: LeagueState, pol: Policy): {monId: string; teamId: TeamId; pick: number}[] {
  const out: {monId: string; teamId: TeamId; pick: number}[] = [];
  for (let p = onTheClock(s); p; p = onTheClock(s)) { const m = pol(s, p.ownerTeamId); if (!m) break; makePick(catalog, s, m.id); out.push({monId: m.id, teamId: p.ownerTeamId, pick: out.length + 1}); }
  return out;
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const polRows: Record<string, {r1: number[]; r2: number[]; r3: number[]; all: number[]; proj: number[]; regret: number[]}> = {};
const aiPicks: {pick: number; real: number; proj: number; nowOvr: number; legend: boolean; need: number; starterLater: boolean; lo: number; hi: number}[] = [];
let spAI: number[] = [], spProj: number[] = [], classSizes: number[] = [];
const legendRanks: string[] = [];
const devRows: Record<string, {proj: number[]; real: number[]}> = {};
for (const seed of SEEDS) {
  const s0 = league(seed);
  simTo(s0, 'draft');
  // truth: AI draft, then 3 more seasons (fast sim) -> realised OVR of every prospect (drafted or not)
  const sAI = clone(s0);
  const prospects = [...sAI.draft!.prospects];
  const projAtDraft = new Map(prospects.map(id => [id, truthProj(sAI, sAI.mons[id])]));
  const needAt = new Map<string, number>(), kr = new Map<string, {lo: number; hi: number}>();
  const aiRun: {monId: string; teamId: TeamId; pick: number}[] = [];
  for (let p = onTheClock(sAI); p; p = onTheClock(sAI)) {
    const m = aiChoice(catalog, sAI, p.ownerTeamId)!;
    needAt.set(m.id, needBoost(catalog, sAI, p.ownerTeamId, m)); const k = knownRating(catalog, sAI, p.ownerTeamId, m); kr.set(m.id, k);
    makePick(catalog, sAI, m.id); aiRun.push({monId: m.id, teamId: p.ownerTeamId, pick: aiRun.length + 1});
  }
  const draftSeason = sAI.season;
  while (sAI.season < draftSeason + 3 || sAI.phase !== 'draft') step(sAI);
  const real = new Map(prospects.map(id => [id, bestRole(catalog, sAI.mons[id]).ovr]));
  classSizes.push(prospects.length);
  for (const x of aiRun) {
    const m = sAI.mons[x.monId];
    aiPicks.push({pick: x.pick, real: real.get(x.monId)!, proj: projAtDraft.get(x.monId)!, nowOvr: bestRole(catalog, s0.mons[x.monId]).ovr, legend: isLegendary(catalog, m), need: needAt.get(x.monId)!,
      starterLater: !m.retired && !!m.teamId && sAI.teams[m.teamId].lineup.slots.some(sl => sl.monId === m.id), lo: kr.get(x.monId)!.lo, hi: kr.get(x.monId)!.hi});
  }
  // legendaries in the class: AI pick # vs realised rank
  const byReal = [...prospects].sort((a, b) => real.get(b)! - real.get(a)!);
  for (const id of prospects) if (isLegendary(catalog, s0.mons[id])) {
    const pk = aiRun.find(x => x.monId === id)?.pick;
    legendRanks.push(`${catalog.species[s0.mons[id].speciesId].name} (pot ${s0.mons[id].potential}, OVR ${bestRole(catalog, s0.mons[id]).ovr}): AI pick #${pk ?? 'undrafted'}, realised rank #${byReal.indexOf(id) + 1}, OVR +3y ${real.get(id)}`);
  }
  // one club deviates (uses policy X), the other 15 use the AI: that club's haul
  for (const [name, pol] of Object.entries(POLICIES)) {
    for (const dev of Object.keys(s0.teams).filter((_, i) => i % 4 === seed % 4)) {
      const s = clone(s0);
      for (let p = onTheClock(s); p; p = onTheClock(s)) { const m = (p.ownerTeamId === dev ? pol : POLICIES['AI (aiChoice)'])(s, p.ownerTeamId)!; makePick(catalog, s, m.id); }
      const mine = s.draft!.picks.filter(x => x.pick.ownerTeamId === dev).map(x => x.monId);
      const d = (devRows[name] ??= {proj: [], real: []});
      d.proj.push(mean(mine.map(id => projAtDraft.get(id)!))); d.real.push(mean(mine.map(id => real.get(id)!)));
    }
  }
  for (const [name, pol] of Object.entries(POLICIES)) {
    const s = clone(s0);
    const run = runDraft(s, pol);
    const row = (polRows[name] ??= {r1: [], r2: [], r3: [], all: [], proj: [], regret: []});
    for (const x of run) {
      const v = real.get(x.monId)!;
      (x.pick <= 16 ? row.r1 : x.pick <= 32 ? row.r2 : row.r3).push(v);
      row.all.push(v); row.proj.push(projAtDraft.get(x.monId)!);
    }
    // regret vs oracle by realised value, same pick slots: sum of top-48 realised minus drafted
    const top48 = byReal.slice(0, run.length).reduce((a, id) => a + real.get(id)!, 0);
    row.regret.push((top48 - run.reduce((a, x) => a + real.get(x.monId)!, 0)) / run.length);
    if (name === 'AI (aiChoice)') { spAI.push(spearman(run.map(x => -x.pick), run.map(x => real.get(x.monId)!))); spProj.push(spearman(run.map(x => -x.pick), run.map(x => projAtDraft.get(x.monId)!))); }
  }
}
L(`## Draft AI — season draft (${SEEDS.length} leagues, after season 1; class ${f1(mean(classSizes))} prospects, 48 picks)`);
L('Value = the prospect\'s true OVR three seasons later (league simmed on with the AI draft; development is mostly intrinsic).');
L('| policy (all 16 clubs) | round 1 mean | round 2 | round 3 | all 48 | true projected peak at draft | regret vs oracle (pts/pick) |');
L('|---|---|---|---|---|---|---|');
for (const [n, r] of Object.entries(polRows)) L(`| ${n} | ${f1(mean(r.r1))} | ${f1(mean(r.r2))} | ${f1(mean(r.r3))} | ${f1(mean(r.all))} | ${f1(mean(r.proj))} | ${f1(mean(r.regret))} |`);
L('');
L('One club uses the policy, the other 15 use the AI (its picks\' mean value; 4 clubs per league):');
L('| policy | true projected peak | realised OVR +3 seasons |');
L('|---|---|---|');
for (const [n, r] of Object.entries(devRows)) L(`| ${n} | ${f1(mean(r.proj))} | ${f1(mean(r.real))} |`);
L(`AI pick order vs realised OVR: Spearman ${f2(mean(spAI))} (vs true projection at draft: ${f2(mean(spProj))}).`);
const scoutW = aiPicks.map(p => p.hi - p.lo);
L(`Scouting at AI pick time: mean range width ${f1(mean(scoutW))} pts; ${pct(aiPicks.filter(p => p.hi - p.lo === 0).length / aiPicks.length)} exact.`);
L(`AI picks with needBoost > 0 (fills a slot better than the current starter): ${pct(aiPicks.filter(p => p.need > 0).length / aiPicks.length)}; drafted mons starting 3 seasons later: R1 ${pct(aiPicks.filter(p => p.pick <= 16 && p.starterLater).length / aiPicks.filter(p => p.pick <= 16).length)}, R2 ${pct(aiPicks.filter(p => p.pick > 16 && p.pick <= 32 && p.starterLater).length / aiPicks.filter(p => p.pick > 16 && p.pick <= 32).length)}, R3 ${pct(aiPicks.filter(p => p.pick > 32 && p.starterLater).length / aiPicks.filter(p => p.pick > 32).length)}.`);
L('Legendaries in the classes:');
for (const x of legendRanks) L(`- ${x}`);
save('draft-season', {polRows: Object.fromEntries(Object.entries(polRows).map(([k, r]) => [k, {r1: mean(r.r1), r2: mean(r.r2), r3: mean(r.r3), all: mean(r.all), regret: mean(r.regret)}])), aiPicks, legendRanks});

// ---------------------------------------------------------------- part B: fantasy draft
interface TeamStat { onRole: number; sum: number; fillable: number; starterOvr: number; strategy: string }
function teamStats(s: LeagueState): Record<TeamId, TeamStat> {
  const out: Record<TeamId, TeamStat> = {};
  for (const t of Object.keys(s.teams)) {
    const plan = planLineup(catalog, s, t, s.teams[t].lineup.strategyId);
    const f = fieldedLineup(catalog, s, t);
    out[t] = {onRole: plan.onRole, sum: plan.ratingSum, fillable: STRATEGIES.filter(st => planLineup(catalog, s, t, st.id).onRole === 6).length,
      starterOvr: mean(f.map(x => bestRole(catalog, s.mons[x.monId]).ovr)), strategy: s.teams[t].lineup.strategyId};
  }
  return out;
}
const FSEEDS = [1, 2, 3, 4, 5, 6];
const cmp: Record<string, TeamStat[]> = {random: [], 'fantasy-draft': []};
const fdStates: LeagueState[] = [];
for (const seed of FSEEDS) for (const start of ['random', 'fantasy-draft'] as const) {
  const s = league(seed, start);
  if (start === 'fantasy-draft') fdStates.push(s);
  cmp[start].push(...Object.values(teamStats(s)));
}
L('');
L(`## Draft AI — startup (${FSEEDS.length} leagues each)`);
L('| start | starters on-role (of 6) | lineup rating sum | strategies fillable on-role (of 9) | starter OVR mean | SD of starter OVR across clubs | distinct strategies per league |');
L('|---|---|---|---|---|---|---|');
for (const [k, v] of Object.entries(cmp)) {
  const per = FSEEDS.map((_, i) => v.slice(i * 16, i * 16 + 16));
  L(`| ${k} | ${f2(mean(v.map(x => x.onRole)))} | ${f1(mean(v.map(x => x.sum)))} | ${f1(mean(v.map(x => x.fillable)))} | ${f1(mean(v.map(x => x.starterOvr)))} | ${f2(mean(per.map(p => sd(p.map(x => x.starterOvr)))))} | ${f1(mean(per.map(p => new Set(p.map(x => x.strategy)).size)))} |`);
}

// mixed snake draft over the same pool: AI heuristic (copied from season.ts fantasyDraft) vs need-aware
const aiHeur = (m: Mon) => bestRole(catalog, m).ovr + (m.age <= 24 ? 3 : 0) - (m.age >= 31 ? 4 : 0);
function teamScore(s: LeagueState, t: TeamId): number {
  // chooseStrategy's objective (x6), favourites included
  const team = s.teams[t];
  let best = -1e9;
  for (const st of STRATEGIES) {
    const plan = planLineup(catalog, s, t, st.id);
    const fav = st.id === team.favoriteStrategies[0] ? STRATEGY_PICK.favourite1 : st.id === team.favoriteStrategies[1] ? STRATEGY_PICK.favourite2 : 0;
    const filled = plan.slots.filter(sl => sl.monId).length;
    best = Math.max(best, plan.ratingSum - (6 - plan.onRole) * STRATEGY_PICK.offRolePenalty * 6 - (6 - filled) * 600 + fav * 6);
  }
  return best;
}
function mixedDraft(base: LeagueState, needTeams: Set<TeamId>): LeagueState {
  const s = clone(base);
  const pool = Object.values(s.mons).filter(m => m.teamId);
  for (const m of pool) { m.teamId = null; m.tier = 'backup'; }
  const order = R.shuffle(Object.keys(s.teams));
  for (const t of Object.keys(s.teams)) s.teams[t].lineup = {strategyId: s.teams[t].favoriteStrategies[0], slots: [], auto: true};
  const left = [...pool];
  for (let round = 0; round < 18; round++) {
    const seq = round % 2 ? [...order].reverse() : order;
    for (const t of seq) {
      let pick: Mon;
      if (!needTeams.has(t) || round >= 10) pick = argmax(left, aiHeur)!;
      else {
        const base0 = teamScore(s, t);
        const shortlist = [...left].sort((a, b) => aiHeur(b) - aiHeur(a)).slice(0, 25);
        pick = argmax(shortlist, m => { m.teamId = t; const g = teamScore(s, t) - base0; m.teamId = null; return aiHeur(m) + 0.5 * g; })!;
      }
      left.splice(left.indexOf(pick), 1);
      pick.teamId = t;
    }
  }
  for (const t of Object.keys(s.teams)) {
    [...teamMons(s, t)].sort((a, b) => a.age - b.age || a.id.localeCompare(b.id)).forEach((m, i) => { m.tier = i < 6 ? 'practice' : 'backup'; });
    chooseStrategy(catalog, s, t, true);
  }
  return {...s, _order: order} as LeagueState;
}
const mixed: {s: LeagueState; need: Set<TeamId>}[] = [];
const gStats: Record<string, TeamStat[]> = {heuristic: [], 'need-aware': []};
for (const base of fdStates) {
  // need-aware = every other team in a random snake order, decided after the order is drawn: use ids
  const ids = Object.keys(base.teams);
  const need = new Set(R.shuffle([...ids]).slice(0, 8));
  const s = mixedDraft(base, need);
  mixed.push({s, need});
  const st = teamStats(s);
  for (const t of ids) gStats[need.has(t) ? 'need-aware' : 'heuristic'].push(st[t]);
}
L('');
L('Mixed fantasy draft (same pools; 8 random clubs per league pick need-aware for 10 rounds = AI heuristic + 0.5 × gain in their best strategy score):');
L('| clubs | starters on-role | lineup rating sum | strategies fillable | starter OVR mean |');
L('|---|---|---|---|---|');
for (const [k, v] of Object.entries(gStats)) L(`| ${k} | ${f2(mean(v.map(x => x.onRole)))} | ${f1(mean(v.map(x => x.sum)))} | ${f1(mean(v.map(x => x.fillable)))} | ${f1(mean(v.map(x => x.starterOvr)))} |`);
save('draft-fantasy', {cmp, gStats});

if (!STATIC_ONLY) {
  const matches: Match[] = [];
  for (const {s, need} of mixed) {
    const N = [...need], H = Object.keys(s.teams).filter(t => !need.has(t));
    R.shuffle(N); R.shuffle(H);
    for (let i = 0; i < 8; i++) matches.push({state: s, teamA: N[i], teamB: H[i], tag: 'fd-need-vs-heur',
      a: fieldedLineup(catalog, s, N[i]).map(f => ({monId: f.monId, setId: f.setId})), b: fieldedLineup(catalog, s, H[i]).map(f => ({monId: f.monId, setId: f.setId}))});
  }
  const rs = await play(matches, 2, 77);
  const sm = summarize(rs);
  L('');
  L(`Real engine, need-aware club vs heuristic club (${matches.length} pairings × 2): need-aware wins ${pct(sm.wr)} ± ${pct(sm.ci)} (quick sim predicts ${pct(sm.qs)}; mean starter OVR ${f1(mean(rs.map(r => r.ovrA)))} vs ${f1(mean(rs.map(r => r.ovrB)))}).`);
  save('draft-engine', rs);
  await closePool();
}
(await import('node:fs')).writeFileSync(new URL('./out/draft.md', import.meta.url), lines.join('\n') + '\n');
