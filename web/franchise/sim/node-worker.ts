// worker_threads entry for node-pool.ts (same protocol as worker.ts).
import {parentPort} from 'node:worker_threads';
import {loadEngine} from '../../scripts/load-engine.ts';
import {runJob, failedResult} from './run.ts';
import type {FromWorker, ToWorker} from './protocol.ts';

const port = parentPort!;
const post = (m: FromWorker) => port.postMessage(m);
const enginePromise = loadEngine();
enginePromise.then((e) => post({type: 'ready', version: e.engine_version()}), (err) => post({type: 'error', message: String(err)}));
let chain: Promise<unknown> = Promise.resolve();
port.on('message', (data: ToWorker) => {
  if (data?.type !== 'job') return;
  const job = data.job;
  chain = chain.then(async () => {
    try { post({type: 'result', result: runJob(await enginePromise, job)}); }
    catch (err) { post({type: 'result', result: failedResult(job, `worker error: ${(err as Error)?.message ?? err}`)}); }
  });
});
