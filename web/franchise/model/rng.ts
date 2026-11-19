// Seeded RNG (mulberry32). League randomness lives in LeagueState.rngState so a
// save reloads into the same future; quicksim and scouting use their own
// derived streams so they never disturb the league stream.

export interface Rng {
  next(): number;                       // [0, 1)
  int(n: number): number;               // 0..n-1
  range(lo: number, hi: number): number; // integer lo..hi inclusive
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined;
  normal(): number;                     // ~N(0,1)
  shuffle<T>(arr: T[]): T[];
  seed(): number;                       // a fresh 31-bit seed for a job
}

function step(s: number): [number, number] {
  const ns = (s + 0x6d2b79f5) | 0;
  let t = ns;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [ns, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

function build(get: () => number, set: (s: number) => void): Rng {
  const next = (): number => { const [s, v] = step(get()); set(s); return v; };
  const r: Rng = {
    next,
    int: n => Math.floor(next() * n),
    range: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: p => next() < p,
    pick: arr => arr[Math.floor(next() * arr.length)],
    weighted(items, weight) {
      let total = 0;
      for (const it of items) total += Math.max(0, weight(it));
      if (total <= 0) return undefined;
      let x = next() * total;
      for (const it of items) { x -= Math.max(0, weight(it)); if (x < 0) return it; }
      return items[items.length - 1];
    },
    normal() {
      const u = Math.max(next(), 1e-9), v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr;
    },
    seed: () => Math.floor(next() * 0x7fffffff),
  };
  return r;
}

/** RNG over the league stream (reads and writes state.rngState). */
export function leagueRng(state: {rngState: number}): Rng {
  return build(() => state.rngState, s => { state.rngState = s; });
}

/** Standalone RNG from a seed (quicksim, tests). */
export function seededRng(seed: number): Rng {
  let s = seed | 0;
  return build(() => s, v => { s = v; });
}

/** Deterministic hash of parts to [0, 1) (scouting error, template choice). Pure. */
export function hash01(...parts: (string | number)[]): number {
  let h = 2166136261;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  const [, v] = step(h);
  return v;
}
