// Grade tables from docs/FRANCHISE.md (EV grade bands, IV values, caps).
import type {Grade, IvGrade, StatId, Mon} from '../types.ts';

export const GRADES: Grade[] = ['F', 'D', 'C', 'B', 'A', 'AA', 'AAA'];
export const IV_GRADES: IvGrade[] = ['F', 'D', 'C', 'B', 'A'];
export const STATS: StatId[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_LABEL: Record<StatId, string> = {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};

/** % of the set's EV spread per EV grade. */
export const EV_PCT: Record<Grade, number> = {F: 40, D: 50, C: 60, B: 70, A: 80, AA: 90, AAA: 100};
/** Lowest Growth of each band (F 1–14, D 15–29, … AAA 90–100). */
export const GROWTH_BAND_LO: Record<Grade, number> = {F: 1, D: 15, C: 30, B: 45, A: 60, AA: 75, AAA: 90};
export const GROWTH_BAND_HI: Record<Grade, number> = {F: 14, D: 29, C: 44, B: 59, A: 74, AA: 89, AAA: 100};
export const IV_VALUE: Record<IvGrade, number> = {F: 16, D: 20, C: 24, B: 28, A: 31};
/** Headline IV grade caps the EV grade (tunable). */
export const IV_CAP: Record<IvGrade, Grade> = {F: 'B', D: 'A', C: 'AA', B: 'AAA', A: 'AAA'};

export const gi = (g: Grade): number => GRADES.indexOf(g);
export const gradeAt = (i: number): Grade => GRADES[Math.max(0, Math.min(GRADES.length - 1, i))];
export const minGrade = (...gs: Grade[]): Grade => gradeAt(Math.min(...gs.map(gi)));

export function gradeForGrowth(growth: number): Grade {
  let g: Grade = 'F';
  for (const k of GRADES) if (growth >= GROWTH_BAND_LO[k]) g = k;
  return g;
}

export function ivHeadlineOf(ivs: Record<StatId, IvGrade>): IvGrade {
  const avg = STATS.reduce((s, k) => s + IV_VALUE[ivs[k]], 0) / STATS.length;
  let best: IvGrade = 'F';
  for (const g of IV_GRADES) if (avg >= IV_VALUE[g] - 2) best = g;
  return best;
}

/** Base EV grade (no injury modifier): Growth band, capped by potential, IVs, severe injuries. */
export function baseEvGrade(mon: Mon): Grade {
  const caps: Grade[] = [gradeForGrowth(mon.growth), mon.potential, IV_CAP[ivHeadlineOf(mon.ivs)]];
  if (mon.gradeCap) caps.push(mon.gradeCap);
  return minGrade(...caps);
}

/** Effective EV grade: day-to-day injury plays one grade lower. */
export function effectiveEvGrade(mon: Mon): Grade {
  const g = baseEvGrade(mon);
  return mon.injury?.kind === 'day-to-day' ? gradeAt(gi(g) - 1) : g;
}
