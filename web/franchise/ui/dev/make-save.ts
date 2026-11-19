// Dev: build a league save at a chosen phase with the quick sim (no engine), for
// screenshots and for jumping straight to offseason screens. Load the JSON with
// Settings → Import (or the Playwright script next to this file).
//   cd web && node franchise/ui/dev/make-save.ts <phase> [out.json] [seed]
// phase: preseason | week<N> (regular season, before week N) | playoffs | awards |
//        draft-lottery | draft | resign | free-agency | season2 (preseason of season 2)
import {readFileSync, writeFileSync} from 'node:fs';
import type {Catalog, LeagueState} from '../../types.ts';
import * as api from '../../model/api.ts';

const [phase = 'week6', out = 'plateau-dev.json', seedArg = '7'] = process.argv.slice(2);
const catalog = JSON.parse(readFileSync(new URL('../../data/catalog.json', import.meta.url), 'utf8')) as Catalog;
const s: LeagueState = api.newLeague(catalog, {start: 'random', seed: +seedArg, name: 'Dev League', userTeamIndex: 0});

const step = (): void => {
  if (s.phase === 'regular' || s.phase === 'playoffs') api.playWeekSync(catalog, s);
  else {
    // the season won't open over 18; a dev save trims the way the confirm dialog would
    if (s.phase === 'preseason' && api.rosterExcess(catalog, s, s.userTeamId).length) api.trimRoster(catalog, s, s.userTeamId);
    api.advancePhase(catalog, s);
  }
};
const at = (): boolean => {
  const m = /^week(\d+)$/.exec(phase);
  if (m) return s.phase === 'regular' && s.week >= +m[1];
  if (phase === 'season2') return s.season === 2 && s.phase === 'preseason';
  if (phase === 'playoffs') return s.phase === 'playoffs';
  return s.phase === phase && (phase !== 'preseason' || true);
};
let guard = 0;
while (!at() && guard++ < 80) step();
// a few user-facing extras so the screens have something to show
if (s.phase === 'draft') api.simDraftToUser(catalog, s);
writeFileSync(out, JSON.stringify(s));
console.log(`${out}: season ${s.season} ${s.phase} week ${s.week}`);
