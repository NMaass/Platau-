// Environment-neutral SimPool: a job queue across N workers, one job per
// worker at a time. Resilience: a job whose worker crashes or hangs is retried
// once on a fresh worker, then returned as a failed result (problems + a
// coin-flip winner) so a season never stops on one battle; a crashed or hung
// worker is terminated and replaced.
import type {BattleJob, BattleJobResult, SimPool} from '../types.ts';
import type {FromWorker, ToWorker} from './protocol.ts';
import {failedResult} from './run.ts';

/** The minimal handle the pool needs on a worker (Web Worker or worker_threads). */
export interface WorkerHandle {
  post(m: ToWorker): void;
  onMessage(cb: (m: FromWorker) => void): void;
  /** fatal: the worker is gone (uncaught error, exit) */
  onError(cb: (message: string) => void): void;
  terminate(): void;
}

export interface PoolOptions {
  /** per-battle wall-clock limit before the worker is killed (default 120 s) */
  jobTimeoutMs?: number;
  /** attempts per job when its worker dies (default 2) */
  attempts?: number;
}

export interface ManagedPool extends SimPool {
  /** stop every worker; later run() calls start fresh ones */
  terminate(): void;
}

interface Slot { handle: WorkerHandle | null; busy: Task | null; timer: ReturnType<typeof setTimeout> | null; dead: boolean }
interface Task { job: BattleJob; tries: number; resolve(r: BattleJobResult): void }

export function createPoolCore(spawn: () => WorkerHandle, size: number, opts: PoolOptions = {}): ManagedPool {
  const timeoutMs = opts.jobTimeoutMs ?? 120_000;
  const attempts = opts.attempts ?? 2;
  const slots: Slot[] = Array.from({length: Math.max(1, size)}, () => ({handle: null, busy: null, timer: null, dead: false}));
  const queue: Task[] = [];

  const ensure = (slot: Slot): WorkerHandle => {
    if (slot.handle && !slot.dead) return slot.handle;
    slot.dead = false;
    const h = spawn();
    slot.handle = h;
    h.onMessage((m) => {
      if (slot.handle !== h) return;
      if (m.type === 'result') {
        const task = slot.busy;
        if (!task || task.job.id !== m.result.id) return;
        finish(slot, task, m.result);
      } else if (m.type === 'error' && !m.id) {
        kill(slot, h, m.message);
      }
    });
    h.onError((message) => { if (slot.handle === h) kill(slot, h, message); });
    return h;
  };

  const finish = (slot: Slot, task: Task, result: BattleJobResult) => {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.busy = null;
    task.resolve(result);
    pump();
  };

  const kill = (slot: Slot, h: WorkerHandle, reason: string) => {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.dead = true;
    slot.handle = null;
    try { h.terminate(); } catch { /* already gone */ }
    const task = slot.busy;
    slot.busy = null;
    if (task) {
      task.tries++;
      if (task.tries < attempts) queue.unshift(task);
      else task.resolve(failedResult(task.job, `worker crashed (${task.tries}x): ${reason}`));
    }
    pump();
  };

  const pump = () => {
    for (const slot of slots) {
      if (slot.busy || !queue.length) continue;
      const task = queue.shift()!;
      let h: WorkerHandle;
      try { h = ensure(slot); } catch (err) {
        task.resolve(failedResult(task.job, `could not start worker: ${(err as Error).message}`));
        continue;
      }
      slot.busy = task;
      slot.timer = setTimeout(() => kill(slot, h, `timed out after ${timeoutMs} ms`), timeoutMs);
      try { h.post({type: 'job', job: task.job}); } catch (err) { kill(slot, h, (err as Error).message); }
    }
  };

  return {
    size: slots.length,
    run(jobs, onDone) {
      const all = Promise.all(jobs.map((job) => new Promise<BattleJobResult>((resolve) => {
        let done = false;
        queue.push({job, tries: 0, resolve: (r) => {
          if (done) return;
          done = true;
          try { onDone?.(r); } catch { /* the caller's callback must not stall the pool */ }
          resolve(r);
        }});
      })));
      pump();
      return all;
    },
    terminate() {
      for (const slot of slots) {
        if (slot.timer) clearTimeout(slot.timer);
        slot.timer = null;
        if (slot.handle) try { slot.handle.terminate(); } catch { /* ignore */ }
        slot.handle = null;
        if (slot.busy) slot.busy.resolve(failedResult(slot.busy.job, 'pool terminated'));
        slot.busy = null;
      }
      for (const t of queue.splice(0)) t.resolve(failedResult(t.job, 'pool terminated'));
    },
  };
}
