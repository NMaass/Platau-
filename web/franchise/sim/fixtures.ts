// Node-only helpers for tests and the benchmark: realistic Plateau-like teams
// from rollmons/pool/*/*.txt with levels 74–90 and EVs scaled to 60 %.
import {readdirSync, readFileSync} from 'node:fs';
import {Teams, type PokemonSet} from '@pkmn/sim';
import {mulberry32} from '../../game/rng.ts';
import type {BattleJob} from '../types.ts';

export const REPO_ROOT = new URL('../../../', import.meta.url).pathname;

/** Every set in the non-LC pool files (LC teams are level-5 sets). */
export function poolSets(): PokemonSet[] {
  const root = `${REPO_ROOT}rollmons/pool`;
  const out: PokemonSet[] = [];
  for (const dir of readdirSync(root).sort()) {
    if (dir === 'level_1') continue;
    for (const f of readdirSync(`${root}/${dir}`).sort()) {
      if (!f.endsWith('.txt')) continue;
      const t = Teams.import(readFileSync(`${root}/${dir}/${f}`, 'utf8'));
      if (t) out.push(...t);
    }
  }
  return out;
}

/** A set as Plateau would field it: given level, EVs scaled, no nickname/Tera. */
export function plateauSet(s: PokemonSet, level: number, evScale = 0.6): PokemonSet {
  const evs = {...s.evs};
  for (const k of Object.keys(evs) as (keyof typeof evs)[]) evs[k] = Math.floor((evs[k] * evScale) / 4) * 4;
  return {...s, name: '', level, evs, teraType: undefined as never};
}

/** Two teams of six, distinct species, levels 74–90, as Showdown exports. */
export function randomJob(id: string, seed: number, budgetMs: {p1: number; p2: number}, sets = poolSets()): BattleJob {
  const rng = mulberry32(seed);
  const seen = new Set<string>();
  const picked: PokemonSet[] = [];
  while (picked.length < 12) {
    const s = sets[Math.floor(rng() * sets.length)];
    if (seen.has(s.species)) continue;
    seen.add(s.species);
    picked.push(plateauSet(s, 74 + Math.floor(rng() * 17)));
  }
  const side = (team: PokemonSet[], n: number) => ({
    teamId: `T${n}`, name: `Team ${n}`, trainer: n === 1 ? 'cynthia' : 'leon',
    export: Teams.export(team), monIds: team.map((_, i) => `${id}-p${n}-${i}`),
  });
  return {id, p1: side(picked.slice(0, 6), 1), p2: side(picked.slice(6), 2), seed, budgetMs, keepLog: false};
}
