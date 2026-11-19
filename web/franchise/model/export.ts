// Showdown export text for one mon (the sim agent reuses this).
// Level = catalog battle level (5 for Little Cup); EVs = set EVs x EV grade %
// floored to multiples of 4 (day-to-day plays one grade lower); IVs from IV grades.
import type {Catalog, LeagueState, Mon, StatId} from '../types.ts';
import {EV_PCT, IV_VALUE, STATS, STAT_LABEL, effectiveEvGrade} from './grades.ts';

export interface ExportOptions { littleCup?: boolean; nickname?: string }

export function monEvs(catalog: Catalog, mon: Mon, setId: string): Partial<Record<StatId, number>> {
  const sp = catalog.species[mon.speciesId];
  const set = sp.sets.find(s => s.id === setId) ?? sp.sets[0];
  const pct = EV_PCT[effectiveEvGrade(mon)];
  const out: Partial<Record<StatId, number>> = {};
  for (const k of STATS) {
    const v = set.evs[k] ?? 0;
    const e = Math.floor((v * pct) / 100 / 4) * 4;
    if (e > 0) out[k] = e;
  }
  return out;
}

export function monIvs(catalog: Catalog, mon: Mon, setId: string): Record<StatId, number> {
  const sp = catalog.species[mon.speciesId];
  const set = sp.sets.find(s => s.id === setId) ?? sp.sets[0];
  const setIvs = (set as {ivs?: Partial<Record<StatId, number>>}).ivs ?? {};
  const out = {} as Record<StatId, number>;
  for (const k of STATS) {
    const g = IV_VALUE[mon.ivs[k]];
    const s = setIvs[k];
    out[k] = s !== undefined ? Math.min(g, s) : g;   // e.g. 0 Spe for Trick Room sets
  }
  return out;
}

export function monExport(catalog: Catalog, _state: LeagueState | null, mon: Mon, setId: string, opts: ExportOptions = {}): string {
  const sp = catalog.species[mon.speciesId];
  if (!sp) throw new Error(`unknown species ${mon.speciesId}`);
  const set = sp.sets.find(s => s.id === setId) ?? sp.sets.find(s => s.id === mon.setId) ?? sp.sets[0];
  const lines: string[] = [];
  const head = opts.nickname ? `${opts.nickname} (${sp.name})` : sp.name;
  lines.push(set.item ? `${head} @ ${set.item}` : head);
  if (set.ability) lines.push(`Ability: ${set.ability}`);
  lines.push(`Level: ${opts.littleCup ? 5 : sp.battleLevel}`);
  const evs = monEvs(catalog, mon, set.id);
  const evParts = STATS.filter(k => evs[k]).map(k => `${evs[k]} ${STAT_LABEL[k]}`);
  if (evParts.length) lines.push(`EVs: ${evParts.join(' / ')}`);
  if (set.nature) lines.push(`${set.nature} Nature`);
  const ivs = monIvs(catalog, mon, set.id);
  lines.push(`IVs: ${STATS.map(k => `${ivs[k]} ${STAT_LABEL[k]}`).join(' / ')}`);
  for (const mv of set.moves.slice(0, 4)) lines.push(`- ${mv}`);
  return lines.join('\n');
}

export function teamExport(catalog: Catalog, state: LeagueState, picks: {monId: string; setId: string}[], opts: ExportOptions = {}): string {
  return picks.map(p => monExport(catalog, state, state.mons[p.monId], p.setId, opts)).join('\n\n');
}
