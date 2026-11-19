// Battle every catalog set once through the real runner (sim + engine) to catch
// sets the sim rejects or the engine chokes on.
//   node web/franchise/catalog/check-sets.ts [budget_ms=2] [limit]
import type {PokemonSet} from '@pkmn/sim';
import {runBattle} from '../../battle/runner.ts';
import {loadEngine, REPO_ROOT} from '../../scripts/load-engine.ts';
import type {CatalogSet, CatalogSpecies, StatTable} from '../types.ts';
import {loadCatalogNode} from './load.ts';

const budget = Number(process.argv[2] ?? 2);
const limit = Number(process.argv[3] ?? Infinity);
const engine = await loadEngine();
const catalog = await loadCatalogNode(REPO_ROOT);
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

function toSet(sp: CatalogSpecies, s: CatalogSet): PokemonSet {
  const evs = Object.fromEntries(STATS.map((k) => [k, s.evs[k] ?? 0])) as StatTable;
  const ivs = Object.fromEntries(STATS.map((k) => [k, s.ivs?.[k] ?? 31])) as StatTable;
  return {name: sp.name, species: sp.name, item: s.item, ability: s.ability, moves: s.moves, nature: s.nature, evs, ivs, level: sp.battleLevel, gender: ''};
}

const all = Object.values(catalog.species).flatMap((sp) => sp.sets.map((s) => ({sp, s})));
const queue = all.slice(0, Math.min(all.length, limit));
let battles = 0, bad = 0;
const t0 = Date.now();
for (let i = 0; i < queue.length; i += 12) {
  const chunk = queue.slice(i, i + 12);
  const p1 = chunk.slice(0, 6), p2 = chunk.slice(6);
  while (p1.length < 6) p1.push(queue[p1.length]);
  while (p2.length < 6) p2.push(queue[6 + p2.length]);
  try {
    const o = runBattle({engine, p1: {name: 'A', team: p1.map((x) => toSet(x.sp, x.s))}, p2: {name: 'B', team: p2.map((x) => toSet(x.sp, x.s))},
      seed: i + 1, budgetMs: {p1: budget, p2: budget}});
    battles++;
    if (o.problems.length || o.fallbacks) { bad++; console.log(`battle ${i / 12}: ${[...p1, ...p2].map((x) => x.s.id).join(' ')}\n  fallbacks ${o.fallbacks}; ${o.problems.slice(0, 5).join('\n  ')}`); }
  } catch (err) {
    bad++;
    console.log(`battle ${i / 12} threw: ${(err as Error).message}\n  ${[...p1, ...p2].map((x) => x.s.id).join(' ')}`);
  }
}
console.log(`${queue.length} sets in ${battles} battles, ${bad} with problems, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (bad) process.exitCode = 1;
