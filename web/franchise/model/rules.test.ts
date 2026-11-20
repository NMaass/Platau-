// Unit tests: EV grade bands and caps, export text, scouting ranges, cap rules.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Teams} from '@pkmn/sim';
import type {Mon} from '../types.ts';
import {FIXTURE_CATALOG as C} from './fixtures/catalog.fixture.ts';
import {newLeague} from './season.ts';
import {gradeForGrowth, baseEvGrade, effectiveEvGrade, ivHeadlineOf, EV_PCT} from './grades.ts';
import {monExport} from './export.ts';
import {RANGE_WIDTH, scoutRange, knownRating, scout} from './scouting.ts';
import {canAfford, capPayroll, deadMoneyOnCut, rookieContract, makeContract} from './cap.ts';
import {offerContract} from './freeagency.ts';
import {evaluateTrade} from './trades.ts';
import {freeAgents, teamMons} from './util.ts';
import {clubFamilies, monFamily} from './pool.ts';
import {roleRating, bestRole} from './ratings.ts';

const mon = (over: Partial<Mon> = {}): Mon => ({
  id: 'mx', speciesId: 'garchomp', teamId: null, tier: 'active', age: 25,
  ivs: {hp: 'B', atk: 'A', def: 'C', spa: 'F', spd: 'D', spe: 'A'}, growth: 80, xp: 0,
  setId: 'garchomp:swords-dance-ou', contract: null, injury: null, fame: 0, potential: 'AAA', stats: [], awards: [], ...over,
});

test('EV grade bands: F 1–14, D 15–29, C 30–44, B 45–59, A 60–74, AA 75–89, AAA 90–100', () => {
  const cases: [number, string][] = [[1, 'F'], [14, 'F'], [15, 'D'], [29, 'D'], [30, 'C'], [44, 'C'], [45, 'B'], [59, 'B'], [60, 'A'], [74, 'A'], [75, 'AA'], [89, 'AA'], [90, 'AAA'], [100, 'AAA']];
  for (const [g, want] of cases) assert.equal(gradeForGrowth(g), want, `growth ${g}`);
  assert.equal(EV_PCT.F, 40); assert.equal(EV_PCT.AAA, 100);
});

test('EV grade is capped by potential and by the IV headline; day-to-day plays one lower', () => {
  const allF = {hp: 'F', atk: 'F', def: 'F', spa: 'F', spd: 'F', spe: 'F'} as const;
  assert.equal(ivHeadlineOf(allF), 'F');
  assert.equal(baseEvGrade(mon({growth: 95, ivs: {...allF}})), 'B', 'F headline caps at B');
  assert.equal(baseEvGrade(mon({growth: 95, potential: 'A'})), 'A', 'potential caps');
  const m = mon({growth: 80});
  assert.equal(baseEvGrade(m), 'AA');
  m.injury = {kind: 'day-to-day', weeksLeft: 0, description: 'x', sinceWeek: 1, season: 1};
  assert.equal(effectiveEvGrade(m), 'A');
  assert.ok(roleRating(C, m, 'sweeper')! < roleRating(C, mon({growth: 80}), 'sweeper')!);
  assert.equal(roleRating(C, m, 'wall'), null, 'no set fills wall');
});

test('export text parses back with Showdown and carries level, graded EVs and IVs', () => {
  const m = mon({growth: 50}); // grade B = 70%
  const text = monExport(C, null, m, 'garchomp:swords-dance-ou');
  const [set] = Teams.import(text)!;
  assert.equal(set.species, 'Garchomp');
  assert.equal(set.level, C.species.garchomp.battleLevel);
  assert.equal(set.item, 'Leftovers');
  assert.equal(set.ability, 'Rough Skin');
  assert.equal(set.nature, 'Jolly');
  assert.deepEqual(set.moves, ['Swords Dance', 'Earthquake', 'Fire Fang', 'Scale Shot']);
  assert.equal(set.evs.atk, 176); // floor(252*0.7/4)*4
  assert.equal(set.evs.spe, 176);
  assert.equal(set.evs.spd, 0);   // 4*0.7 floors to 0
  for (const k of Object.keys(set.evs) as (keyof typeof set.evs)[]) assert.equal(set.evs[k] % 4, 0);
  assert.deepEqual(set.ivs, {hp: 28, atk: 31, def: 24, spa: 16, spd: 20, spe: 31});
  const lc = Teams.import(monExport(C, null, mon({speciesId: 'gible', setId: 'gible:generated-nfe'}), 'gible:generated-nfe', {littleCup: true}))!;
  assert.equal(lc[0].level, 5);
});

test('weekJobs exports parse as six-mon teams', () => {
  const s = newLeague(C, {seed: 5, start: 'random'});
  s.phase = 'regular'; s.week = 1;
  return import('./season.ts').then(({weekJobs}) => {
    const jobs = weekJobs(C, s, 0);
    assert.equal(jobs.length, 8);
    for (const j of jobs) {
      const team = Teams.import(j.p1.export)!;
      assert.equal(team.length, 6);
      assert.deepEqual(team.map(t => t.species), j.p1.monIds.map(id => C.species[s.mons[id].speciesId].name));
    }
  });
});

test('scouting ranges: equal width per points spent, truth inside ~90% and uniformly placed', () => {
  for (let pts = 0; pts < RANGE_WIDTH.length; pts++) {
    let inside = 0, lowHalf = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const truth = 70;
      const r = scoutRange(1, 't3', `m${i}`, truth, pts);
      assert.equal(r.hi - r.lo, RANGE_WIDTH[pts]);
      if (truth >= r.lo && truth <= r.hi) {
        inside++;
        if (truth - r.lo < (r.hi - r.lo) / 2) lowHalf++;
      }
    }
    const pIn = inside / N;
    assert.ok(pIn > 0.86 && pIn < 0.94, `points ${pts}: ${(pIn * 100).toFixed(1)}% inside`);
    assert.ok(Math.abs(lowHalf / inside - 0.5) < 0.06, 'uniform position');
  }
  // per-team error: two teams see different ranges for the same mon
  const a = scoutRange(1, 't1', 'm9', 70, 1), b = scoutRange(1, 't2', 'm9', 70, 1);
  assert.ok(a.lo !== b.lo || a.hi !== b.hi);
});

test('scouting costs 1 point per scout and 5 in total for full knowledge', () => {
  const s = newLeague(C, {seed: 6, start: 'random'});
  const p = s.mons[s.draft!.prospects[0]];
  const me = s.userTeamId;
  s.teams[me].scoutingPoints = 10;
  assert.equal(knownRating(C, s, me, p).exact, false);
  assert.ok(scout(s, me, p, false).ok);
  assert.equal(s.teams[me].scoutingPoints, 9);
  assert.equal(p.scouting![me], 1);
  assert.ok(scout(s, me, p, true).ok);
  assert.equal(s.teams[me].scoutingPoints, 5, 'full costs the remaining 4 of 5');
  assert.equal(knownRating(C, s, me, p).exact, true);
  const q = s.mons[s.draft!.prospects[1]];
  assert.ok(scout(s, me, q, true).ok);
  assert.equal(s.teams[me].scoutingPoints, 0);
  assert.equal(scout(s, me, s.mons[s.draft!.prospects[2]], false).ok, false, 'no points left');
  const k = knownRating(C, s, 't5', q);
  assert.equal(k.exact, false, 'other teams still see a range');
});

test('cap rules: minimum deals fit over the cap, others do not; rookie scale; dead money', () => {
  const s = newLeague(C, {seed: 8, start: 'random'});
  const t = s.userTeamId;
  const room = s.settings.cap - capPayroll(s, t);
  assert.ok(room >= 0);
  assert.equal(canAfford(s, t, room + 50_000), false);
  assert.equal(canAfford(s, t, s.settings.minSalary), true);
  const r1 = rookieContract(s, 1, 1, 1), r48 = rookieContract(s, 3, 16, 48);
  assert.ok(r1.salary > r48.salary);
  assert.equal(r48.salary, s.settings.minSalary);
  assert.equal(r1.yearsLeft, 4); assert.equal(r1.rookie!.fifthYearOption, true);
  assert.equal(r48.yearsLeft, 3);
  const c = makeContract(10_000_000, 4, {guaranteedYears: 2});
  assert.ok(deadMoneyOnCut(c) > 0 && deadMoneyOnCut(c) <= c.salary);
  // a free agent asking more than the room is refused, at the minimum accepted only if his ask is the minimum
  s.phase = 'free-agency';
  const fa = teamMons(s, 't3').find(m => !teamMons(s, t).some(x => x.family === m.family))!;   // species clause aside
  fa.teamId = null; fa.contract = null; fa.askMult = 1;
  // fill the user's cap
  const mine = teamMons(s, t).find(m => !m.contract!.exception)!;
  mine.contract!.salary += s.settings.cap - capPayroll(s, t);
  assert.equal(capPayroll(s, t), s.settings.cap);
  const res = offerContract(C, s, t, fa, 5_000_000, 2);
  assert.equal(res.accepted, false);
  assert.match(res.reason, /cap|Wants/);
  void freeAgents; void bestRole;
});

test('trades: over-the-cap trades that add salary are refused; deadline closes trading', () => {
  const s = newLeague(C, {seed: 9, start: 'random'});
  s.phase = 'regular'; s.week = 3;
  const t = s.userTeamId;
  // a swap the species clause allows: neither club already has the other's line
  const famT = clubFamilies(s, t), fam5 = clubFamilies(s, 't5');
  const theirs = teamMons(s, 't5').filter(m => !famT.has(monFamily(m, C))).sort((a, b) => b.contract!.salary - a.contract!.salary)[0];
  const mine = teamMons(s, t).filter(m => !m.contract!.exception && !fam5.has(monFamily(m, C))).sort((a, b) => a.contract!.salary - b.contract!.salary)[0];
  const offer = {fromTeamId: t, toTeamId: 't5', give: {mons: [mine.id], picks: []}, get: {mons: [theirs.id], picks: []}};
  // push the user to the cap
  const filler = teamMons(s, t).find(m => !m.contract!.exception && m.id !== mine.id)!;
  filler.contract!.salary += s.settings.cap - capPayroll(s, t);
  const ev = evaluateTrade(C, s, offer);
  assert.equal(ev.accept, false);
  assert.match(ev.reason, /over the cap/);
  s.week = s.settings.tradeDeadlineWeek + 1;
  assert.match(evaluateTrade(C, s, offer).reason, /deadline/);
  assert.equal(typeof ev.score, 'number');
});

test('scouting: each extra point narrows the range inside the previous one (misses included)', () => {
  for (let i = 0; i < 2000; i++) {
    const truth = 35 + (i % 30);   // away from the 1..99 clamp
    let prev = scoutRange(7, 't4', `m${i}`, truth, 0);
    const inside0 = truth >= prev.lo && truth <= prev.hi;
    for (let pts = 1; pts < RANGE_WIDTH.length; pts++) {
      const r = scoutRange(7, 't4', `m${i}`, truth, pts);
      assert.ok(r.lo >= prev.lo && r.hi <= prev.hi, `m${i} pts ${pts}: ${prev.lo}-${prev.hi} -> ${r.lo}-${r.hi}`);
      assert.equal(truth >= r.lo && truth <= r.hi, inside0, 'a miss is decided once per team and mon');
      prev = r;
    }
  }
});
