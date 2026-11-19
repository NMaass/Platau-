// Browser SimPool over Web Workers running worker.ts (bundled as
// dist/franchise/sim-worker.js with the engine wasm next to it).
import {createPoolCore, type ManagedPool, type PoolOptions, type WorkerHandle} from './pool-core.ts';
import type {FromWorker} from './protocol.ts';

export type {ManagedPool, PoolOptions};

/** Default worker count: leave one core for the page. */
export function defaultPoolSize(): number {
  const n = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, n - 1);
}

export function createSimPool(workerUrl: string | URL, size = defaultPoolSize(), opts: PoolOptions = {}): ManagedPool {
  const spawn = (): WorkerHandle => {
    const w = new Worker(workerUrl, {type: 'module'});
    return {
      post: (m) => w.postMessage(m),
      onMessage: (cb) => w.addEventListener('message', (e: MessageEvent<FromWorker>) => cb(e.data)),
      onError: (cb) => {
        w.addEventListener('error', (e) => { e.preventDefault(); cb(e.message || 'worker error'); });
        w.addEventListener('messageerror', () => cb('message could not be deserialised'));
      },
      terminate: () => w.terminate(),
    };
  };
  return createPoolCore(spawn, size, opts);
}
