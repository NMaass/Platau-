// Sim throughput benchmark: battles per second per budget and thread count.
//   cd web && [BUDGETS=10/10,5/5,40/10] [THREADS=1,3] node franchise/sim/bench.ts [battles=12]
import {loadavg, availableParallelism} from 'node:os';
import {poolSets, randomJob} from './fixtures.ts';
import {createNodeSimPool} from './node-pool.ts';

const N = Number(process.argv[2] ?? 12);
const BUDGETS = (process.env.BUDGETS ?? "10/10,5/5,40/10").split(",").map((b) => { const [p1, p2] = b.split("/").map(Number); return {p1, p2}; });
const THREADS = (process.env.THREADS ?? "1,3").split(",").map(Number);
const sets = poolSets();
console.log(`cores ${availableParallelism()}, load ${loadavg().map((x) => x.toFixed(2)).join(' ')}, ${N} battles per row`);
console.log('| budget p1/p2 ms | threads | battles/s | wall ms/battle | mean turns | fallbacks/problems | load |');
console.log('|---|---|---|---|---|---|---|');
for (const budgetMs of BUDGETS) {
  for (const threads of THREADS) {
    const pool = createNodeSimPool(threads);
    // warm-up: start every worker and tier up the wasm
    await pool.run(Array.from({length: threads}, (_, i) => randomJob(`w${i}`, 1000 + i, {p1: 1, p2: 1}, sets)));
    const jobs = Array.from({length: N}, (_, i) => randomJob(`b${i}`, i + 1, budgetMs, sets));
    const t0 = performance.now();
    const rs = await pool.run(jobs);
    const wall = performance.now() - t0;
    pool.terminate();
    const turns = rs.reduce((a, r) => a + r.turns, 0) / rs.length;
    const problems = rs.reduce((a, r) => a + r.problems.length, 0);
    console.log(`| ${budgetMs.p1}/${budgetMs.p2} | ${threads} | ${(N / (wall / 1000)).toFixed(2)} | ${Math.round(wall / N)} | ${turns.toFixed(1)} | ${problems} | ${loadavg()[0].toFixed(2)} |`);
  }
}
