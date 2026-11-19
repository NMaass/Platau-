// Unit tests: schedule shape, standings and tiebreaks, playoff seeding, lottery odds.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {LeagueState, Series, TeamId} from '../types.ts';
import {FIXTURE_CATALOG} from './fixtures/catalog.fixture.ts';
import {newLeague} from './season.ts';
import {scheduleRounds} from './schedule.ts';
import {rankTeams, standings, conferenceSeeds} from './standings.ts';
import {startPlayoffs, advancePlayoffs} from './playoffs.ts';
import {drawLottery, LOTTERY_ODDS} from './draft.ts';
import {seededRng} from './rng.ts';

const conf = (i: number) => i >> 3, div = (i: number) => (i >> 2) & 1;

test('schedule: 14 weeks, everyone every week, 6 division / 4 conference / 4 cross', () => {
  for (const season of [1, 2]) {
    const rounds = scheduleRounds(season);
    assert.equal(rounds.length, 14);
    const opps = new Map<number, number[]>();
    const home = new Map<number, number>();
    for (const week of rounds) {
      assert.equal(week.length, 8);
      assert.equal(new Set(week.flat()).size, 16, 'every team once per week');
      for (const [h, a] of week) {
        opps.set(h, [...(opps.get(h) ?? []), a]); opps.set(a, [...(opps.get(a) ?? []), h]);
        home.set(h, (home.get(h) ?? 0) + 1);
      }
    }
    for (let t = 0; t < 16; t++) {
      const o = opps.get(t)!;
      assert.equal(o.length, 14);
      const sameDiv = o.filter(x => conf(x) === conf(t) && div(x) === div(t));
      const sameConf = o.filter(x => conf(x) === conf(t) && div(x) !== div(t));
      const cross = o.filter(x => conf(x) !== conf(t));
      assert.equal(sameDiv.length, 6);
      for (const r of new Set(sameDiv)) assert.equal(sameDiv.filter(x => x === r).length, 2, 'each rival twice');
      assert.equal(new Set(sameConf).size, 4);
      assert.equal(cross.length, 4);
      assert.equal(new Set(cross).size, 4);
      const h = home.get(t) ?? 0;
      assert.ok(h >= 5 && h <= 9, `home games balanced (${h})`);
    }
  }
});

/** Overwrite the schedule's results: winners[i] is the winner of series i of the regular season. */
function fakeResults(s: LeagueState, pick: (x: Series) => TeamId): void {
  for (const x of s.schedule) {
    if (x.playoff) continue;
    const w = pick(x);
    const l = w === x.homeId ? x.awayId : x.homeId;
    x.winnerId = w;
    x.games = [mkGame(w), mkGame(w)];
    void l;
  }
}
const mkGame = (w: TeamId) => ({id: 'g', winnerTeamId: w, turns: 20, box: {}, summary: ''});

test('standings: wins first, then head-to-head among the tied', () => {
  const s = newLeague(FIXTURE_CATALOG, {seed: 1, start: 'random'});
  // lower team index wins every series → strict order t0 > t1 > ... within each division
  fakeResults(s, x => (Number(x.homeId.slice(1)) < Number(x.awayId.slice(1)) ? x.homeId : x.awayId));
  const rows = standings(s);
  const d00 = rows.filter(r => ['t0', 't1', 't2', 't3'].includes(r.teamId));
  assert.deepEqual(d00.map(r => r.teamId), ['t0', 't1', 't2', 't3']);
  assert.deepEqual(d00.map(r => r.divRank), [1, 2, 3, 4]);
  assert.equal(rows.find(r => r.teamId === 't0')!.wins, 14);
  assert.match(rows.find(r => r.teamId === 't0')!.streak, /^W\d+$/);
  // head-to-head: make t1 and t2 tie on wins, t2 beat t1 twice
  const s2 = newLeague(FIXTURE_CATALOG, {seed: 2, start: 'random'});
  fakeResults(s2, x => {
    const pair = new Set([x.homeId, x.awayId]);
    if (pair.has('t1') && pair.has('t2')) return 't2';
    return Number(x.homeId.slice(1)) < Number(x.awayId.slice(1)) ? x.homeId : x.awayId;
  });
  // equalize wins by handing some of t2's other wins away
  const recs = standings(s2);
  const w1 = recs.find(r => r.teamId === 't1')!.wins, w2 = recs.find(r => r.teamId === 't2')!.wins;
  if (w1 !== w2) {
    // flip enough t2 wins against teams outside {t1} to tie
    let diff = w2 - w1;
    for (const x of s2.schedule) {
      if (diff <= 0) break;
      if (x.winnerId === 't2' && x.homeId !== 't1' && x.awayId !== 't1') {
        x.winnerId = x.homeId === 't2' ? x.awayId : x.homeId;
        x.games = [mkGame(x.winnerId), mkGame(x.winnerId)];
        diff--;
      }
    }
  }
  const after = standings(s2);
  assert.equal(after.find(r => r.teamId === 't1')!.wins, after.find(r => r.teamId === 't2')!.wins, 'tied on wins');
  const ranked = rankTeams(s2, ['t1', 't2']);
  assert.deepEqual(ranked, ['t2', 't1'], 'head-to-head breaks the tie');
});

test('playoffs: division winners seeded 1-2, wild card 3, seed 1 has a bye, final on week 17', () => {
  const s = newLeague(FIXTURE_CATALOG, {seed: 3, start: 'random'});
  fakeResults(s, x => (Number(x.homeId.slice(1)) < Number(x.awayId.slice(1)) ? x.homeId : x.awayId));
  // conference 0: t0 (div 0) is 14-0, t4 (div 1) wins its division; wild card is the best non-winner (t1)
  const seeds = conferenceSeeds(s, 0);
  assert.deepEqual(seeds, ['t0', 't4', 't1']);
  s.phase = 'playoffs';
  startPlayoffs(s);
  const r1 = s.schedule.filter(x => x.playoff === 'round1');
  assert.equal(r1.length, 2);
  assert.ok(!r1.some(x => x.homeId === 't0' || x.awayId === 't0'), 'seed 1 has a bye');
  assert.ok(r1.some(x => x.homeId === 't4' && x.awayId === 't1'));
  for (const x of r1) { x.winnerId = x.awayId; x.games = [mkGame(x.awayId), mkGame(x.awayId)]; }
  assert.equal(advancePlayoffs(s), false);
  const cf = s.schedule.filter(x => x.playoff === 'conference');
  assert.equal(cf.length, 2);
  assert.ok(cf.some(x => x.homeId === 't0' && x.awayId === 't1'));
  for (const x of cf) { x.winnerId = x.homeId; x.games = [mkGame(x.homeId), mkGame(x.homeId)]; }
  assert.equal(advancePlayoffs(s), false);
  const fin = s.schedule.find(x => x.playoff === 'final')!;
  assert.equal(fin.week, 17);
  assert.equal(fin.bestOf, s.settings.finalBestOf);
  assert.equal(advancePlayoffs(s), true);
});

test('lottery: first-pick odds follow 18,18,16,13,10,8,6,5,4,2 and the worst team picks no lower than 5th', () => {
  const rng = seededRng(12345);
  const teams = Array.from({length: 10}, (_, i) => `t${i}`);
  const first = new Array(10).fill(0);
  const N = 20000;
  let worstLow = 0;
  for (let n = 0; n < N; n++) {
    const order = drawLottery(rng, teams);
    first[teams.indexOf(order[0])]++;
    if (order.indexOf('t0') > 4) worstLow++;
    assert.equal(new Set(order).size, 10);
  }
  for (let i = 0; i < 10; i++) {
    const p = first[i] / N * 100;
    assert.ok(Math.abs(p - LOTTERY_ODDS[i]) < 1.5, `team ${i}: ${p.toFixed(1)}% vs ${LOTTERY_ODDS[i]}%`);
  }
  assert.equal(worstLow, 0);
});
