// End to end: create a league and simulate full seasons with quicksim, checking
// invariants every week. Also runs against the generated catalog when present.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {Catalog, LeagueState, Phase} from '../types.ts';
import {FIXTURE_CATALOG} from './fixtures/catalog.fixture.ts';
import * as api from './api.ts';
import {capPayroll} from './cap.ts';
import {monsByTeam, rosterCount} from './util.ts';
import {families} from './pool.ts';
import {FAME} from './awards.ts';
import {deserialize, serialize} from './serialize.ts';

function checkInvariants(catalog: Catalog, s: LeagueState, where: string): void {
  const by = monsByTeam(s);
  const inSeason = s.phase === 'regular' || s.phase === 'playoffs' || (s.phase === 'awards');
  for (const [t, mons] of by) {
    if (inSeason) assert.equal(rosterCount(mons), 18, `${where}: ${t} has ${rosterCount(mons)} outside IR`);
    assert.ok(capPayroll(s, t) <= s.settings.cap, `${where}: ${t} over the cap (${capPayroll(s, t)})`);
    for (const m of mons) assert.equal(m.teamId, t);
  }
  // unique legendaries among living mons (team, free agent or prospect)
  const fams = families(catalog);
  const seen = new Set<string>();
  for (const m of Object.values(s.mons)) {
    if (m.retired) continue;
    const f = fams.get(catalog.species[m.speciesId].family);
    if (f?.bucket !== 'legendary') continue;
    assert.ok(!seen.has(f.id), `${where}: two living ${f.id}`);
    seen.add(f.id);
  }
  // no mon in two lineups, lineups only hold own mons
  const used = new Set<string>();
  for (const team of Object.values(s.teams)) for (const sl of team.lineup.slots) {
    if (!sl.monId) continue;
    assert.ok(!used.has(sl.monId), `${where}: ${sl.monId} in two lineups`);
    used.add(sl.monId);
    assert.equal(s.mons[sl.monId].teamId, team.id, `${where}: lineup of ${team.id} holds a foreign mon`);
  }
}

function runSeasons(catalog: Catalog, seasons: number, seed: number): {state: LeagueState; phases: Set<Phase>; weekMs: number[]} {
  const s = api.newLeague(catalog, {seed, start: 'random'});
  const phases = new Set<Phase>();
  const weekMs: number[] = [];
  checkInvariants(catalog, s, 'start');
  const startSeason = s.season;
  for (let guard = 0; guard < 40 * seasons && s.season < startSeason + seasons; guard++) {
    phases.add(s.phase);
    if (s.phase === 'regular' || s.phase === 'playoffs') {
      const week = s.week;
      if (s.phase === 'regular') {
        const teams = s.schedule.filter(x => x.week === week).flatMap(x => [x.homeId, x.awayId]);
        assert.equal(new Set(teams).size, 16, `week ${week}: every team plays`);
      }
      const max = Math.max(s.settings.seriesBestOf, s.settings.finalBestOf);
      for (let g = 0; g < max; g++) {
        const jobs = api.weekJobs(catalog, s, g);
        if (!jobs.length) break;
        for (const j of jobs) {
          assert.equal(j.p1.monIds.length, 6, `${j.id}: p1 fields 6`);
          assert.equal(j.p2.monIds.length, 6, `${j.id}: p2 fields 6`);
        }
        api.applyResults(catalog, s, jobs.map(j => api.quickSim(catalog, s, j)));
      }
      assert.ok(s.schedule.filter(x => x.week === week).every(x => x.winnerId), `week ${week} decided`);
      const t0 = performance.now();
      api.finishWeek(catalog, s);
      weekMs.push(performance.now() - t0);
      checkInvariants(catalog, s, `S${s.season} W${week}`);
    } else {
      if (s.phase === 'draft') api.simDraftToUser(catalog, s);
      api.advancePhase(catalog, s);
      if ((s.phase as Phase) === 'regular') checkInvariants(catalog, s, `S${s.season} preseason done`);
    }
  }
  return {state: s, phases, weekMs};
}

test('three full seasons on the fixture catalog keep every invariant', () => {
  const t0 = performance.now();
  const {state: s, phases, weekMs} = runSeasons(FIXTURE_CATALOG, 3, 7);
  for (const p of ['preseason', 'regular', 'playoffs', 'awards', 'draft-lottery', 'draft', 'resign', 'free-agency'] as Phase[]) assert.ok(phases.has(p), `visited ${p}`);
  assert.equal(s.history.length, 3);
  for (const h of s.history) {
    assert.ok(h.championId && h.runnerUpId && h.championId !== h.runnerUpId);
    assert.ok(h.awards.some(a => a.award === 'MVP'));
    assert.ok(h.awards.some(a => a.award === 'Indigo Plateau MVP'));
    assert.equal(h.awards.filter(a => a.award === 'All-League 1st Team').length, 6);
  }
  const mons = Object.values(s.mons);
  const drafted = mons.filter(m => m.draft && m.draft.season >= 1);
  assert.equal(drafted.length, 48 * 3, 'three drafts of 48');
  const retired = mons.filter(m => m.retired);
  assert.ok(retired.length > 20, `retirements happen (${retired.length})`);
  for (const m of retired) assert.equal(m.retired!.hallOfFame, m.fame >= FAME.hallOfFame);
  assert.ok(s.log.some(t => t.kind === 'signed'), 'free agents signed');
  assert.ok(s.log.some(t => t.kind === 're-sign'), 're-signings');
  assert.ok(s.log.some(t => t.kind === 'trade'), 'trades happen');
  assert.ok(mons.some(m => m.stats.some(l => l.seriesMvps > 0)));
  // series summaries and MVPs on every decided series of the last season
  for (const x of s.schedule) assert.ok(!x.winnerId || (x.summary && x.mvpMonId));
  const avg = weekMs.reduce((a, b) => a + b, 0) / weekMs.length;
  assert.ok(avg < 50, `finishWeek averages ${avg.toFixed(1)} ms`);
  // the save round-trips
  const back = deserialize(serialize(s));
  assert.equal(serialize(back), serialize(s));
  assert.ok(performance.now() - t0 < 30_000);
});

test('same seed, same league', () => {
  const a = runSeasons(FIXTURE_CATALOG, 1, 99).state, b = runSeasons(FIXTURE_CATALOG, 1, 99).state;
  a.createdAt = b.createdAt = 0;
  assert.deepEqual(a.history, b.history);
  assert.equal(serialize(a), serialize(b));
});

const catalogPath = fileURLToPath(new URL('../data/catalog.json', import.meta.url));
test('one season on the generated catalog', {skip: !existsSync(catalogPath)}, () => {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as Catalog;
  const {state: s} = runSeasons(catalog, 1, 3);
  assert.equal(s.history.length, 1);
});
