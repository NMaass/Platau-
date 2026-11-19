// One BattleJob -> BattleJobResult, synchronously, with any loaded engine.
// Used by the Web Worker (worker.ts), the Node pool and tests.
import {Teams, type PokemonSet} from '@pkmn/sim';
import type {Engine} from '../../battle/runner.ts';
import type {BattleJob, BattleJobResult} from '../types.ts';
import {boxScore} from './box.ts';
import {runPlateauBattle} from './runner-plateau.ts';

function importTeam(side: 'p1' | 'p2', text: string, expected: number): PokemonSet[] {
  const team = Teams.import(text);
  if (!team || !team.length) throw new Error(`${side}: could not import team export`);
  if (team.length !== expected) throw new Error(`${side}: export has ${team.length} sets but job lists ${expected} monIds`);
  return team;
}

/** Deterministic coin flip from the job seed (used when a battle cannot be played). */
export function coinFlip(seed: number): 'p1' | 'p2' {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h & 1 ? 'p2' : 'p1';
}

/** A result for a job that failed outright: no log, empty box, coin-flip winner. */
export function failedResult(job: BattleJob, problem: string): BattleJobResult {
  const box: BattleJobResult['box'] = {};
  for (const s of ['p1', 'p2'] as const) {
    for (const id of job[s].monIds) box[id] = {teamId: job[s].teamId, played: false, kos: 0, fainted: false, damageDealt: 0, damageTaken: 0, statusInflicted: 0, hazardsSet: 0, hazardsRemoved: 0};
  }
  return {id: job.id, winner: coinFlip(job.seed), turns: 0, log: [], box, problems: [problem]};
}

export function runJob(engine: Engine, job: BattleJob): BattleJobResult {
  try {
    const p1 = importTeam('p1', job.p1.export, job.p1.monIds.length);
    const p2 = importTeam('p2', job.p2.export, job.p2.monIds.length);
    const out = runPlateauBattle({
      engine,
      p1: {name: job.p1.name, team: p1},
      p2: {name: job.p2.name, team: p2},
      seed: job.seed,
      budgetMs: job.budgetMs,
    });
    // Showdown avatars: put the trainer sprite id on each |player| line
    const log = out.log.map((l) => {
      if (!l.startsWith('|player|')) return l;
      const p = l.split('|');
      const t = p[2] === 'p1' ? job.p1.trainer : p[2] === 'p2' ? job.p2.trainer : '';
      if (!t) return l;
      while (p.length < 5) p.push('');
      p[4] = t;
      return p.join('|');
    });
    const box = boxScore(log, {
      p1: {teamId: job.p1.teamId, monIds: job.p1.monIds, names: out.names.p1},
      p2: {teamId: job.p2.teamId, monIds: job.p2.monIds, names: out.names.p2},
    });
    const problems = [...out.problems];
    for (const s of ['p1', 'p2'] as const) {
      const n = s === 'p1' ? p1.length : p2.length;
      if (n !== 6) problems.unshift(`${s} fields ${n} Pokémon; the engine needs 6, so this battle was played with random moves`);
    }
    let winner: 'p1' | 'p2';
    if (out.winner === job.p1.name && out.winner !== job.p2.name) winner = 'p1';
    else if (out.winner === job.p2.name && out.winner !== job.p1.name) winner = 'p2';
    else {
      // tie, unfinished battle, or both sides share a name: decide by remaining mons, then a coin flip
      const left = (s: 'p1' | 'p2') => job[s].monIds.filter((id) => !box[id].fainted).length;
      const winLine = log.find((l) => l.startsWith('|win|'));
      if (winLine && job.p1.name === job.p2.name) winner = left('p1') >= left('p2') ? 'p1' : 'p2';
      else {
        winner = left('p1') > left('p2') ? 'p1' : left('p2') > left('p1') ? 'p2' : coinFlip(job.seed);
        problems.push(`no clear winner (${out.winner}); decided by remaining Pokémon`);
      }
    }
    return {id: job.id, winner, turns: out.turns, log, box, problems};
  } catch (err) {
    return failedResult(job, `battle failed: ${(err as Error).message}`);
  }
}
