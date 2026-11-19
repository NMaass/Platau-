import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {BattleJob} from '../types.ts';
import {createPoolCore, type WorkerHandle} from './pool-core.ts';
import {createNodeSimPool} from './node-pool.ts';
import {randomJob} from './fixtures.ts';
import type {FromWorker, ToWorker} from './protocol.ts';

const job = (id: string): BattleJob => ({
  id, seed: 1, budgetMs: {p1: 1, p2: 1}, keepLog: false,
  p1: {teamId: 'A', name: 'A', trainer: 'red', export: 'Pikachu\n- Thunderbolt', monIds: ['a']},
  p2: {teamId: 'B', name: 'B', trainer: 'blue', export: 'Eevee\n- Tackle', monIds: ['b']},
});

/** Fake worker: answers jobs, but a job whose id starts with "crash" kills it. */
function fake(spawned: {n: number}): WorkerHandle {
  spawned.n++;
  let msg: (m: FromWorker) => void = () => {};
  let err: (s: string) => void = () => {};
  return {
    post(m: ToWorker) {
      setTimeout(() => {
        if (m.job.id.startsWith('crash')) err('boom');
        else if (m.job.id.startsWith('hang')) { /* never answers */ }
        else msg({type: 'result', result: {id: m.job.id, winner: 'p1', turns: 3, log: [], box: {}, problems: []}});
      }, 1);
    },
    onMessage(cb) { msg = cb; }, onError(cb) { err = cb; }, terminate() {},
  };
}

test('pool keeps order, survives crashes and hangs, replaces workers', async () => {
  const spawned = {n: 0};
  const pool = createPoolCore(() => fake(spawned), 2, {jobTimeoutMs: 50});
  const seen: string[] = [];
  const rs = await pool.run([job('a'), job('crash1'), job('b'), job('hang1'), job('c')], (r) => seen.push(r.id));
  assert.deepEqual(rs.map((r) => r.id), ['a', 'crash1', 'b', 'hang1', 'c']);
  assert.equal(seen.length, 5);
  assert.equal(rs[0].problems.length, 0);
  assert.match(rs[1].problems[0], /crashed/);
  assert.match(rs[3].problems[0], /timed out/);
  assert.ok(rs[1].winner === 'p1' || rs[1].winner === 'p2');
  assert.ok(spawned.n >= 4, 'dead workers were replaced');
  assert.equal(pool.size, 2);
});

test('node worker_threads pool runs real battles', async () => {
  const pool = createNodeSimPool(2);
  try {
    const jobs = ['x', 'y', 'z'].map((id, i) => randomJob(id, i + 1, {p1: 1, p2: 1}));
    const rs = await pool.run(jobs);
    assert.deepEqual(rs.map((r) => r.id), ['x', 'y', 'z']);
    for (const r of rs) { assert.deepEqual(r.problems, []); assert.ok(r.turns > 0); assert.equal(Object.keys(r.box).length, 12); }
  } finally { pool.terminate(); }
});
