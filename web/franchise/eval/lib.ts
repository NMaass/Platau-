// Shared helpers for the AI evaluation scripts (eval/*.ts). Read-only use of the model:
// nothing here changes model code; experiments work on cloned LeagueStates.
//   cd web && node franchise/eval/<script>.ts
import {readFileSync, writeFileSync, mkdirSync, appendFileSync} from 'node:fs';
import type {BattleJob, BattleJobResult, Catalog, LeagueState, MonId, TeamId} from '../types.ts';
import * as api from '../model/api.ts';
import {quickSim} from '../model/quicksim.ts';
import {teamExport} from '../model/export.ts';
import {bestRole} from '../model/ratings.ts';
import {createNodePoolOrFallback} from '../sim/node-pool.ts';

export const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8')) as Catalog;
export const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

export const clone = <T>(x: T): T => structuredClone(x);
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
export const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-');
export const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '-');
export const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(0)}%` : '-');
/** 95% normal-approx half-width for a proportion. */
export const ci = (p: number, n: number) => 1.96 * Math.sqrt(Math.max(p * (1 - p), 0.0001) / Math.max(1, n));

/** Small deterministic rng for the eval's own choices. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: T[]) => xs[Math.floor(next() * xs.length)], shuffle: <T>(xs: T[]) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; }};
}

export function league(seed: number, start: 'random' | 'fantasy-draft' = 'random'): LeagueState {
  return api.newLeague(catalog, {start, seed, name: 'Eval', userTeamIndex: 0});
}

/** Advance (fast sim) until `phase` is reached (after at least one step if already there and `force`). */
export function simTo(state: LeagueState, phase: LeagueState['phase'], maxSteps = 400): void {
  let g = 0;
  while (state.phase !== phase && g++ < maxSteps) step(state);
  if (state.phase !== phase) throw new Error(`simTo ${phase}: stuck at ${state.phase}`);
}
export function step(state: LeagueState): void {
  if (state.phase === 'regular' || state.phase === 'playoffs') { api.playWeekSync(catalog, state); return; }
  const before = `${state.phase}/${state.season}/${state.faRound}`;
  api.advancePhase(catalog, state);
  if (`${state.phase}/${state.season}/${state.faRound}` === before) { api.trimRoster(catalog, state, state.userTeamId); api.advancePhase(catalog, state); }
}

export interface Pick { monId: MonId; setId: string }
export const ovrOf = (state: LeagueState, id: MonId) => bestRole(catalog, state.mons[id]).ovr;
export const meanOvr = (state: LeagueState, picks: Pick[]) => mean(picks.map(p => ovrOf(state, p.monId)));

// ------------------------------------------------------------------ battles
let poolP: Promise<Awaited<ReturnType<typeof createNodePoolOrFallback>>> | null = null;
export const pool = () => (poolP ??= createNodePoolOrFallback(3));
export async function closePool() { if (poolP) (await poolP).terminate?.(); }

export interface Match { state: LeagueState; a: Pick[]; b: Pick[]; teamA: TeamId; teamB: TeamId; tag: string; meta?: Record<string, unknown>; xfB?: (exportText: string) => string; budget?: number }
export interface MatchResult { tag: string; meta?: Record<string, unknown>; aWins: number; games: number; qsP: number; ovrA: number; ovrB: number; problems: number }

const BUDGET = Number(process.env.BUDGET ?? 10);

function job(m: Match, flip: boolean, seed: number, id: string): BattleJob {
  const side = (picks: Pick[], name: string, teamId: TeamId, pre: string) => ({
    teamId, name, trainer: 'red', export: teamExport(catalog, m.state, picks), monIds: picks.map((_, i) => `${pre}${i}`),
  });
  const A = side(m.a, 'Side A', m.teamA, 'a'), B = side(m.b, 'Side B', m.teamB, 'b');
  if (m.xfB) B.export = m.xfB(B.export);
  const bud = m.budget ?? BUDGET;
  return {id, p1: flip ? B : A, p2: flip ? A : B, seed, budgetMs: {p1: bud, p2: bud}, keepLog: false};
}

/** Quick-sim P(A beats B) for a match (sampled from model/quicksim.ts with real mon ids). */
export function quickP(m: Match, samples = 400): number {
  let w = 0;
  for (let s = 0; s < samples; s++) {
    const j: BattleJob = {id: 'q', seed: 7919 * s + 13, budgetMs: {p1: 0, p2: 0}, keepLog: false,
      p1: {teamId: m.teamA, name: 'A', trainer: '', export: '', monIds: m.a.map(p => p.monId)},
      p2: {teamId: m.teamB, name: 'B', trainer: '', export: '', monIds: m.b.map(p => p.monId)}};
    if (quickSim(catalog, m.state, j).winner === 'p1') w++;
  }
  return w / samples;
}

/** Play each match `reps` times (alternating sides). Appends every battle to out/battles.jsonl. */
export async function play(matches: Match[], reps = 2, seed0 = 1): Promise<MatchResult[]> {
  const p = await pool();
  const jobs: BattleJob[] = [];
  matches.forEach((m, i) => { for (let r = 0; r < reps; r++) jobs.push(job(m, r % 2 === 1, seed0 * 100003 + i * 101 + r, `${i}:${r}`)); });
  const t0 = performance.now();
  const res: BattleJobResult[] = await p.run(jobs);
  const out: MatchResult[] = matches.map((m) => ({tag: m.tag, meta: m.meta, aWins: 0, games: 0, qsP: quickP(m), ovrA: meanOvr(m.state, m.a), ovrB: meanOvr(m.state, m.b), problems: 0}));
  for (const r of res) {
    const [i, rep] = r.id.split(':').map(Number);
    const flip = rep % 2 === 1;
    const aWon = (r.winner === 'p1') !== flip;
    out[i].games++; if (aWon) out[i].aWins++;
    out[i].problems += r.problems.length ? 1 : 0;
    appendFileSync(`${OUT}battles.jsonl`, JSON.stringify({tag: matches[i].tag, aWon, qsP: out[i].qsP, ovrA: out[i].ovrA, ovrB: out[i].ovrB, turns: r.turns, problems: r.problems.slice(0, 2), meta: matches[i].meta}) + '\n');
  }
  console.error(`  ${jobs.length} battles in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  return out;
}

export function summarize(rs: MatchResult[]): {n: number; wr: number; ci: number; qs: number; problems: number} {
  const n = rs.reduce((s, r) => s + r.games, 0), w = rs.reduce((s, r) => s + r.aWins, 0);
  const qs = mean(rs.map(r => r.qsP));
  return {n, wr: w / n, ci: ci(w / n, n), qs, problems: rs.reduce((s, r) => s + r.problems, 0)};
}

export function save(name: string, data: unknown) { writeFileSync(`${OUT}${name}.json`, JSON.stringify(data, null, 1)); }
