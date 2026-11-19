// Front-office flows through the api facade: draft pick, contracts, tag, offers, lineup actions.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {LeagueState} from '../types.ts';
import {FIXTURE_CATALOG as C} from './fixtures/catalog.fixture.ts';
import * as api from './api.ts';
import {teamMons, rosterCount} from './util.ts';
import {makeAiOffer} from './trades.ts';
import {leagueRng} from './rng.ts';

/** 10% over the ask, within the max salary. */
const above = (s: LeagueState, ask: number) => Math.min(s.settings.cap * s.settings.maxSalaryPct, Math.ceil(ask * 1.1 / 50_000) * 50_000);

function toPhase(s: LeagueState, phase: LeagueState['phase']): void {
  for (let g = 0; g < 80 && s.phase !== phase; g++) {
    if (s.phase === 'regular' || s.phase === 'playoffs') api.playWeekSync(C, s);
    else api.advancePhase(C, s);
  }
  assert.equal(s.phase, phase);
}

test('draft: the user picks when on the clock; AI picks up to the user', () => {
  const s = api.newLeague(C, {seed: 31, start: 'random', userTeamIndex: 5});
  toPhase(s, 'draft');
  assert.equal(s.draft!.lottery!.length, 10);
  api.simDraftToUser(C, s);
  const p = api.onTheClock(s)!;
  assert.equal(p.ownerTeamId, s.userTeamId);
  const before = s.draft!.picks.length;
  const pick = api.draftBoard(s)[0];
  api.draftPick(C, s, pick.id);
  assert.equal(s.draft!.picks.length, before + 1);
  assert.equal(s.mons[pick.id].teamId, s.userTeamId);
  assert.equal(s.mons[pick.id].contract!.exception, 'rookie');
  api.advancePhase(C, s);
  assert.equal(s.phase, 'resign');
  assert.equal(s.draft!.picks.length, 48);
  assert.equal(api.draftBoard(s).length, 0, 'undrafted became free agents');
});

test('re-sign window, franchise tag, free agency signing', () => {
  const s = api.newLeague(C, {seed: 32, start: 'random'});
  toPhase(s, 'resign');
  const exp = teamMons(s, s.userTeamId).filter(m => api.isExpiring(m));
  assert.ok(exp.length >= 2, 'some contracts expire');
  const [a, b] = exp;
  const ask = api.askingPrice(C, s, a.id);
  const low = api.offerContract(C, s, a.id, Math.max(s.settings.minSalary, Math.round(ask.salary * 0.5 / 50_000) * 50_000), ask.years);
  if (ask.salary > s.settings.minSalary * 2) assert.equal(low.accepted, false);
  const ok = api.offerContract(C, s, a.id, above(s, ask.salary), ask.years);
  assert.equal(ok.accepted, true, ok.reason);
  assert.ok(a.contract!.yearsLeft >= 1);
  const chk = api.franchiseTagCheck(C, s, b.id);
  if (chk.ok) {
    api.franchiseTag(s, b.id, C);
    assert.equal(b.contract!.tagged, true);
    assert.equal(b.contract!.yearsLeft, 1);
    assert.equal(api.franchiseTagCheck(C, s, exp[2]?.id ?? b.id).ok, false, 'one tag per offseason');
  }
  api.advancePhase(C, s);
  assert.equal(s.phase, 'free-agency');
  const fa = api.freeAgents(s).sort((x, y) => api.bestRole(C, s, y).ovr - api.bestRole(C, s, x).ovr).find(m => api.askingPrice(C, s, m.id).salary <= api.capSpace(s, s.userTeamId));
  if (fa) {
    const price = api.askingPrice(C, s, fa.id);
    const res = api.offerContract(C, s, fa.id, above(s, price.salary), price.years);
    assert.equal(res.accepted, true, res.reason);
    assert.equal(fa.teamId, s.userTeamId);
  }
  toPhase(s, 'preseason');
  api.advancePhase(C, s);
  assert.equal(rosterCount(teamMons(s, s.userTeamId)), 18);
});

test('AI offers reach the user and can be accepted', () => {
  const s = api.newLeague(C, {seed: 33, start: 'random'});
  toPhase(s, 'regular');
  let offer = null;
  for (let i = 0; i < 40 && !offer; i++) offer = makeAiOffer(C, s, leagueRng(s));
  assert.ok(offer, 'an offer was made');
  const meter = api.evaluateTrade(C, s, offer!);
  assert.equal(typeof meter.score, 'number');
  const got = offer!.give.mons[0];
  api.respondOffer(C, s, offer!.id, true);
  assert.equal(s.offers.find(o => o.id === offer!.id)!.status, 'accepted');
  assert.equal(s.mons[got].teamId, s.userTeamId);
  assert.equal(rosterCount(teamMons(s, s.userTeamId)), 18);
});

test('lineup actions: strategy, assign, tiers, practice focus, cut', () => {
  const s = api.newLeague(C, {seed: 34, start: 'random'});
  const me = s.userTeamId;
  api.setStrategy(C, s, me, 'stall');
  assert.equal(s.teams[me].lineup.strategyId, 'stall');
  assert.equal(s.teams[me].lineup.slots.length, 6);
  const bench = teamMons(s, me).find(m => m.tier === 'backup')!;
  api.assignSlot(s, me, 0, bench.id);
  assert.equal(s.teams[me].lineup.slots[0].monId, bench.id);
  assert.equal(s.teams[me].lineup.auto, false);
  assert.equal(teamMons(s, me).filter(m => m.tier === 'active').length, 6);
  const prac = teamMons(s, me).filter(m => m.tier === 'practice');
  api.setPracticeFocus(s, me, prac.map(m => m.id));
  assert.equal(s.teams[me].practiceFocus!.length, 3);
  api.moveTier(s, prac[0].id, 'backup');
  assert.equal(s.mons[prac[0].id].tier, 'backup');
  assert.equal(teamMons(s, me).filter(m => m.tier === 'backup').length, 6);
  const ex = api.likelyLineup(C, s, 't3');
  assert.equal(ex.length, 6);
  api.cut(s, prac[1].id);
  assert.equal(s.mons[prac[1].id].teamId, null);
  assert.ok(api.advisories(C, s).some(a => a.label === 'Roster'));
  const text = api.monExport(C, s, s.mons[bench.id], s.mons[bench.id].setId);
  assert.match(text, /Level: \d+/);
});

test('a hand-set lineup is saved per strategy and restored when switching back', async () => {
  const {readFileSync} = await import('node:fs');
  const api = await import('./api.ts');
  const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const s = api.newLeague(catalog, {start: 'random', seed: 5, userTeamIndex: 2});
  const me = s.userTeamId, team = s.teams[me];
  const first = team.lineup.strategyId;
  const bench = api.teamRoster(s, me).find((m) => m.tier === 'backup')!;
  api.assignSlot(s, me, 0, bench.id);
  const handSet = team.lineup.slots.map((x) => x.monId);
  const other = api.STRATEGIES.find((x) => x.id !== first)!.id;
  api.setStrategy(catalog, s, me, other);
  assert.equal(team.lineup.auto, true);
  api.setStrategy(catalog, s, me, first);
  assert.equal(team.lineup.auto, false);
  assert.deepEqual(team.lineup.slots.map((x) => x.monId), handSet);
});
