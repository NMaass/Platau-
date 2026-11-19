// Web Worker entry for the Plateau sim pool: loads the wasm engine once, then
// runs BattleJobs one at a time, posting each BattleJobResult. The build
// bundles this to dist/franchise/sim-worker.js with rollmons_engine_bg.wasm
// next to it (init() resolves the wasm relative to the bundle's URL).
import init, * as engine from '../../../engine/pkg/rollmons_engine.js';
import {runJob, failedResult} from './run.ts';
import type {FromWorker, ToWorker} from './protocol.ts';

const post = (m: FromWorker) => (self as unknown as {postMessage(m: FromWorker): void}).postMessage(m);
const ready = init().then(() => post({type: 'ready', version: engine.engine_version()}), (err: unknown) => {
  post({type: 'error', message: `engine failed to load: ${(err as Error)?.message ?? err}`});
  throw err;
});

let chain: Promise<unknown> = Promise.resolve();
self.onmessage = ({data}: MessageEvent<ToWorker>) => {
  if (data?.type !== 'job') return;
  const job = data.job;
  chain = chain.then(async () => {
    try {
      await ready;
      post({type: 'result', result: runJob(engine, job)});
    } catch (err) {
      post({type: 'result', result: failedResult(job, `worker error: ${(err as Error)?.message ?? err}`)});
    }
  });
};
