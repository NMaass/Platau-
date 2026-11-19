// The gym-city clubs, themed pre-made rosters, the New League preview contract and the startup draft.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {FIXTURE_CATALOG as C} from './fixtures/catalog.fixture.ts';
import * as api from './api.ts';
import {TEAM_SEEDS} from './teams.ts';
import {TRAINERS} from '../catalog/sprites.ts';
import {STRATEGIES} from './strategies.ts';
import {teamMons} from './util.ts';

test('16 gym cities: four per region, distinct badges and types, real trainer sprites, badge art on disk', () => {
  assert.equal(TEAM_SEEDS.length, 16);
  assert.equal(new Set(TEAM_SEEDS.map(t => t.badge)).size, 16);
  assert.equal(new Set(TEAM_SEEDS.map(t => t.gymType)).size, 16);
  assert.equal(new Set(TEAM_SEEDS.map(t => t.abbr)).size, 16);
  const ids = new Set(STRATEGIES.map(s => s.id));
  TEAM_SEEDS.forEach((t, i) => {
    assert.ok(TRAINERS.includes(t.trainer), `${t.trainer} is a Showdown trainer`);
    assert.ok(t.badge >= 8 * Math.floor(i / 4) + 1 && t.badge <= 8 * Math.floor(i / 4) + 8, `${t.city}'s badge is from its region`);
    assert.ok(existsSync(new URL(`../assets/badges/${t.badge}.png`, import.meta.url)));
    for (const f of t.favorites) assert.ok(ids.has(f));
  });
});

test('pre-made: the same seed and club give the same league (the New League preview is the league that starts)', () => {
  const a = api.newLeague(C, {seed: 77, start: 'random', userTeamIndex: 9});
  const b = api.newLeague(C, {seed: 77, start: 'random', userTeamIndex: 9});
  b.createdAt = a.createdAt;
  assert.equal(api.serialize(a), api.serialize(b));
  // the club picked only changes who is human, never the rosters
  const c = api.newLeague(C, {seed: 77, start: 'random', userTeamIndex: 0});
  for (const t of Object.keys(a.teams)) {
    assert.deepEqual(teamMons(a, t).map(m => m.id + m.speciesId), teamMons(c, t).map(m => m.id + m.speciesId));
    assert.equal(a.teams[t].gymType, TEAM_SEEDS[Number(t.slice(1))].gymType);
  }
});

test('draft start: empty rosters, 18 snake rounds over the whole pool, then contracts and the preseason', () => {
  const s = api.newLeague(C, {seed: 12, start: 'draft', userTeamIndex: 3});
  assert.equal(s.phase, 'draft');
  assert.ok(s.draft!.startup);
  assert.equal(s.draft!.order.length, 16 * 18);
  assert.equal(s.draft!.prospects.length, 16 * 18);
  for (const t of Object.keys(s.teams)) assert.equal(teamMons(s, t).length, 0);
  const r1 = s.draft!.order.slice(0, 16).map(p => p.ownerTeamId), r2 = s.draft!.order.slice(16, 32).map(p => p.ownerTeamId);
  assert.deepEqual(r2, [...r1].reverse(), 'snake order');
  // every rating on the board is known
  for (const m of api.draftBoard(s).slice(0, 20)) assert.ok(api.knownRating(C, s, s.userTeamId, m).exact);
  api.simDraftToUser(C, s);
  assert.equal(api.onTheClock(s)!.ownerTeamId, s.userTeamId);
  const pick = api.draftBoard(s)[0];
  api.draftPick(C, s, pick.id);
  assert.equal(s.mons[pick.id].teamId, s.userTeamId);
  api.simDraftToEnd(C, s);
  assert.equal(s.phase, 'draft', 'the board stays up for review');
  api.advancePhase(C, s);
  assert.equal(s.phase, 'preseason');
  assert.ok(!s.draft?.startup, 'the season 1 class replaces the startup board');
  for (const t of Object.keys(s.teams)) {
    const ms = teamMons(s, t);
    assert.equal(ms.length, 18);
    assert.equal(ms.filter(m => m.tier === 'practice').length, 6);
    assert.ok(ms.every(m => m.contract && m.prospect === undefined));
    assert.equal(s.teams[t].lineup.slots.filter(sl => sl.monId).length, 6);
  }
  // and the season plays
  api.advancePhase(C, s);
  assert.equal(s.phase, 'regular');
  api.playWeekSync(C, s);
  assert.equal(s.week, 2);
});

test("'fantasy-draft' still returns a ready league (auto-picked startup draft)", () => {
  const s = api.newLeague(C, {seed: 13, start: 'fantasy-draft'});
  assert.equal(s.phase, 'preseason');
  for (const t of Object.keys(s.teams)) assert.equal(teamMons(s, t).length, 18);
});
