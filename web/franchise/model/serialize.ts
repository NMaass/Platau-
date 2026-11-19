// Saves are plain JSON of LeagueState. migrate() upgrades older saves in place.
import type {LeagueState} from '../types.ts';

export const SCHEMA_VERSION = 1;

export function serialize(state: LeagueState): string {
  return JSON.stringify(state);
}

export function deserialize(text: string): LeagueState {
  return migrate(JSON.parse(text));
}

/** Upgrade a parsed save to the current schema. Add a step per version bump. */
export function migrate(raw: unknown): LeagueState {
  const s = raw as LeagueState & {schemaVersion: number};
  if (!s || typeof s !== 'object' || !s.teams || !s.mons) throw new Error('not a Plateau save');
  if (s.schemaVersion > SCHEMA_VERSION) throw new Error(`save is from a newer version (${s.schemaVersion})`);
  // v1 is current; defaults for optional fields added during v1
  s.inbox ??= []; s.offers ??= []; s.log ??= []; s.history ??= [];
  for (const t of Object.values(s.teams)) { t.deadMoney ??= []; t.draftPicks ??= []; }
  // injury retune (2026-11): saves made before the day-to-day/IR shares existed used ~4x the rates
  if (s.settings && s.settings.injuryDayToDay === undefined) {
    s.settings.injuryDayToDay = 0.68; s.settings.injuryIr = 0.06;
    if (s.settings.injuryKo === 0.1) s.settings.injuryKo = 0.025;
    if (s.settings.injuryStatus === 0.05) s.settings.injuryStatus = 0.012;
  }
  return s as LeagueState;
}

/** Deep copy (structured clone of plain JSON). */
export const cloneState = (state: LeagueState): LeagueState => JSON.parse(JSON.stringify(state));
