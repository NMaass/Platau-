// Injuries (all tunable in LeagueSettings): KO ~2.5%, ending a battle with a status ~1.2% (burn and
// toxic riskier), age raises risk; ~68% day-to-day, ~6% IR. A club sees ~3–5 a season. Day-to-day plays one EV grade lower; out 1–3
// weeks; IR 4+ weeks. Rare severe injuries cost an IV grade or cap the EV grade.
import type {Injury, LeagueState, Mon, MonBox, StatId} from '../types.ts';
import type {Rng} from './rng.ts';
import {IV_GRADES, baseEvGrade} from './grades.ts';

const KO_TEXT = ['Sprained wing', 'Bruised shell', 'Pulled tail', 'Cracked claw', 'Strained jaw', 'Twisted ankle', 'Knocked-out fatigue', 'Chipped horn'];
const STATUS_TEXT: Record<string, string[]> = {
  brn: ['Lingering burn', 'Scorched scales'], tox: ['Poison relapse', 'Toxic fatigue'], psn: ['Poison relapse'],
  par: ['Nerve strain'], slp: ['Drowsy spell'], frz: ['Frostbite'],
};

export function injuryRisk(state: LeagueState, mon: Mon, box: MonBox): number {
  if (!box.played) return 0;
  const age = 1 + Math.max(0, mon.age - 28) * 0.08;
  if (box.fainted) return state.settings.injuryKo * age;
  if (box.endStatus) {
    const mult = box.endStatus === 'brn' || box.endStatus === 'tox' ? 1.5 : 1;
    return state.settings.injuryStatus * mult * age;
  }
  return 0;
}

export function rollInjury(state: LeagueState, rng: Rng, mon: Mon, box: MonBox): Injury | null {
  if (!rng.chance(injuryRisk(state, mon, box))) return null;
  const x = rng.next();
  const late = mon.age >= 31 ? 0.08 : 0;
  const dtd = state.settings.injuryDayToDay ?? 0.68, ir = state.settings.injuryIr ?? 0.06;
  let kind: Injury['kind'], weeksLeft: number;
  if (x < dtd - late) { kind = 'day-to-day'; weeksLeft = 0; }
  else if (x < 1 - ir - late) { kind = 'out'; weeksLeft = rng.range(1, 3); }
  else { kind = 'ir'; weeksLeft = rng.range(4, 8); }
  const pool = box.fainted || !box.endStatus ? KO_TEXT : (STATUS_TEXT[box.endStatus] ?? KO_TEXT);
  const inj: Injury = {kind, weeksLeft, description: rng.pick(pool), sinceWeek: state.week, season: state.season};
  if (kind === 'ir' && rng.chance(0.06)) {
    if (rng.chance(0.5)) {
      const stats = (Object.keys(mon.ivs) as StatId[]).filter(s => mon.ivs[s] !== 'F');
      if (stats.length) inj.severe = {ivLost: rng.pick(stats)};
    } else inj.severe = {gradeCap: baseEvGrade(mon)};
  }
  return inj;
}

/** Apply an injury to a mon, including permanent severe effects. Keeps the worse of two injuries. */
export function applyInjury(mon: Mon, inj: Injury): void {
  const rank = (i: Injury | null) => (!i ? 0 : i.kind === 'day-to-day' ? 1 : i.kind === 'out' ? 2 : 3);
  if (inj.severe?.ivLost) {
    const s = inj.severe.ivLost;
    mon.ivs[s] = IV_GRADES[Math.max(0, IV_GRADES.indexOf(mon.ivs[s]) - 1)];
  }
  if (inj.severe?.gradeCap) mon.gradeCap = inj.severe.gradeCap;
  if (rank(inj) >= rank(mon.injury)) mon.injury = inj;
  if (inj.kind === 'ir') mon.tier = 'ir';
}

/** End of a week: day-to-day from earlier weeks clears; out/IR count down. Returns mons that healed. */
export function tickInjuries(state: LeagueState): Mon[] {
  const healed: Mon[] = [];
  for (const id in state.mons) {
    const m = state.mons[id];
    const inj = m.injury;
    if (!inj || m.retired) continue;
    const fresh = inj.season === state.season && inj.sinceWeek === state.week;
    if (fresh) continue;
    if (inj.kind === 'day-to-day') { m.injury = null; healed.push(m); continue; }
    inj.weeksLeft--;
    if (inj.weeksLeft <= 0) { m.injury = null; healed.push(m); }
    else if (inj.kind === 'ir' && inj.weeksLeft < 4) { /* stays on IR until healed */ }
  }
  return healed;
}

/** Offseason: everything heals (severe effects stay). */
export function healAll(state: LeagueState): void {
  for (const id in state.mons) state.mons[id].injury = null;
}
