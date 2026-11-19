// SimPool over node:worker_threads (scripts, tests, the benchmark). Each
// worker runs node-worker.ts directly (Node 22.18+ strips types in workers
// too). If a worker cannot start, the pool falls back to running jobs
// in-process, one at a time.
import {availableParallelism} from 'node:os';
import {Worker} from 'node:worker_threads';
import {loadEngine} from '../../scripts/load-engine.ts';
import type {BattleJobResult, SimPool} from '../types.ts';
import {createPoolCore, type ManagedPool, type PoolOptions, type WorkerHandle} from './pool-core.ts';
import type {FromWorker} from './protocol.ts';
import {runJob} from './run.ts';

const WORKER_URL = new URL('./node-worker.ts', import.meta.url);

export function createNodeSimPool(size = Math.max(1, availableParallelism() - 1), opts: PoolOptions = {}): ManagedPool {
  const spawn = (): WorkerHandle => {
    const w = new Worker(WORKER_URL);
    return {
      post: (m) => w.postMessage(m),
      onMessage: (cb) => w.on('message', (m: FromWorker) => cb(m)),
      onError: (cb) => {
        w.on('error', (e) => cb(e.message));
        w.on('exit', (code) => cb(`exited with code ${code}`));
      },
      terminate: () => { void w.terminate(); },
    };
  };
  return createPoolCore(spawn, size, opts);
}

/** Sequential in-process pool (no threads). */
export async function createInProcessSimPool(): Promise<SimPool> {
  const engine = await loadEngine();
  return {
    size: 1,
    async run(jobs, onDone) {
      const out: BattleJobResult[] = [];
      for (const job of jobs) {
        const r = runJob(engine, job);
        try { onDone?.(r); } catch { /* ignore */ }
        out.push(r);
        await new Promise((res) => setImmediate(res));
      }
      return out;
    },
  };
}

/** A worker_threads pool when threads work here, else the in-process fallback. */
export async function createNodePoolOrFallback(size?: number, opts?: PoolOptions): Promise<SimPool & {terminate?(): void}> {
  try {
    const probe = new Worker(WORKER_URL);
    const ok = await new Promise<boolean>((resolve) => {
      probe.once('message', (m: FromWorker) => resolve(m.type === 'ready'));
      probe.once('error', () => resolve(false));
      probe.once('exit', () => resolve(false));
    });
    await probe.terminate();
    if (ok) return createNodeSimPool(size, opts);
  } catch { /* fall through */ }
  return createInProcessSimPool();
}
