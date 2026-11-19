// Messages between a SimPool and its workers (browser Web Worker or Node worker_threads).
import type {BattleJob, BattleJobResult} from '../types.ts';

export type ToWorker = {type: 'job'; job: BattleJob};
export type FromWorker =
  | {type: 'ready'; version: string}
  | {type: 'result'; result: BattleJobResult}
  | {type: 'error'; id?: string; message: string};
