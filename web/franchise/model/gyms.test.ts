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

// ---------------------------------------------------------------- pre-made rosters (model/premade.ts), species clause
import {readFileSync} from 'node:fs';
import type {Catalog, LeagueState} from '../types.ts';
import {premadeRosters, PREMADE} from './premade.ts';
import {initPool, monFamily} from './pool.ts';
import {leagueRng} from './rng.ts';
import {planLineup} from './lineup.ts';
import {runsStrategy, strategyById} from './strategies.ts';
import {startupChoice} from './draft.ts';
import {tradeProblem} from './trades.ts';
import {signBlock} from './freeagency.ts';

const REAL = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8')) as Catalog;
const youngestSix = (s: LeagueState, t: string) => {
  const ms = teamMons(s, t);
  for (const m of ms) m.tier = 'backup';
  [...ms].sort((a, b) => a.age - b.age || a.id.localeCompare(b.id)).slice(0, 6).forEach(m => { m.tier = 'practice'; });
};
/** A league's clubs with empty rosters and a full pool, then pre-made rosters as newLeague builds them. */
function premade(seed: number): LeagueState {
  const s = api.newLeague(REAL, {seed, start: 'draft'});
  for (const id in s.mons) delete s.mons[id];
  s.pool = initPool(REAL); s.draft = undefined; s.phase = 'preseason';
  const rng = leagueRng(s);
  premadeRosters(REAL, s, rng, Object.keys(s.teams), {perTeam: 18, legendaries: 9,
    ages: n => rng.shuffle(Array.from({length: n}, (_, k) => 21 + Math.round(k * 12 / (n - 1)))), practice: t => youngestSix(s, t)});
  return s;
}
const gymTyped = (C2: Catalog, s: LeagueState, id: string | null, type?: string) => !!id && !!type && C2.species[s.mons[id].speciesId].types.includes(type);

test('pre-made: every club can run its favourite strategy (a rain club has a rain setter), the gym type is at most half the six, one of a species, even clubs', () => {
  for (const seed of [3, 41, 777, 2026]) {
    const s = premade(seed);
    const str: number[] = [];
    for (const t of Object.keys(s.teams)) {
      const team = s.teams[t], mons = teamMons(s, t);
      const fav = team.favoriteStrategies[0], plan = planLineup(REAL, s, t, fav);
      assert.equal(mons.length, 18);
      assert.ok(runsStrategy(plan), `seed ${seed}: ${team.city} can't run ${fav}: ${plan.slots.map(sl => sl.role).join(', ')}`);
      const w = strategyById(fav).weather;
      if (w) assert.equal(plan.slots[0].role, `${w}-setter`, `${team.city} leads with its ${w} setter`);
      assert.ok(plan.slots.filter(sl => gymTyped(REAL, s, sl.monId, team.gymType)).length <= PREMADE.typedStarters, `${team.city}: gym type at most half the starters`);
      const typed = mons.filter(m => gymTyped(REAL, s, m.id, team.gymType)).length;
      assert.ok(typed >= 4 && typed <= 9, `${team.city}: ${typed} of 18 of the gym type (a theme, not the whole club)`);
      assert.equal(new Set(mons.map(m => monFamily(m, REAL))).size, 18, `${team.city}: one of each species line`);
      str.push(api.teamStrength(REAL, s, t));
    }
    assert.ok(Math.max(...str) - Math.min(...str) <= PREMADE.spread + 1.5, `seed ${seed}: clubs within ${PREMADE.spread} of each other (${Math.min(...str).toFixed(1)}–${Math.max(...str).toFixed(1)})`);
  }
});

test('weather needs its setter: a lineup without one does not run the strategy', () => {
  const s = premade(5);
  const t = Object.keys(s.teams).find(x => s.teams[x].favoriteStrategies[0] === 'rain')!;
  for (const m of teamMons(s, t)) if (REAL.species[m.speciesId].sets.some(x => x.roles.includes('rain-setter'))) m.teamId = null;
  const plan = planLineup(REAL, s, t, 'rain');
  assert.equal(runsStrategy(plan), false);
});

test('species clause: the startup draft, free agency and trades never put two of a species line on a club', () => {
  const s = api.newLeague(REAL, {seed: 21, start: 'fantasy-draft'});
  for (const t of Object.keys(s.teams)) {
    const ms = teamMons(s, t);
    assert.equal(new Set(ms.map(m => monFamily(m, REAL))).size, ms.length, `${s.teams[t].city}: no duplicate after the draft`);
  }
  void startupChoice;
  // free agency: a free agent of a line the club has is blocked
  const me = s.userTeamId, mine = teamMons(s, me)[0];
  const twin = teamMons(s, 't7').find(m => m.speciesId !== mine.speciesId)!;
  const was = twin.family;
  twin.family = mine.family; twin.teamId = null; twin.contract = null;
  s.phase = 'free-agency';
  assert.match(signBlock(s, me, twin).reason, /species/);
  twin.family = was;
  assert.doesNotMatch(signBlock(s, me, twin).reason, /species/);
  twin.teamId = 't7';
  // trades: getting a second of a line is refused, swapping one for the other is fine
  s.phase = 'preseason';
  const theirs = teamMons(s, 't7')[1];
  const keep = theirs.family;
  theirs.family = teamMons(s, me)[1].family;
  const o = {fromTeamId: me, toTeamId: 't7', give: {mons: [teamMons(s, me)[2].id], picks: []}, get: {mons: [theirs.id], picks: []}};
  assert.match(tradeProblem(REAL, s, o), /species/);
  assert.doesNotMatch(tradeProblem(REAL, s, {...o, give: {mons: [teamMons(s, me)[1].id], picks: []}}), /species/);
  theirs.family = keep;
});
