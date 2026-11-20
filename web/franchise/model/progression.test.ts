// Growth XP rules: the practice squad trains every week; starters and backups only grow from battles they play.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Mon} from '../types.ts';
import {FIXTURE_CATALOG as C} from './fixtures/catalog.fixture.ts';
import * as api from './api.ts';
import {playWeekSync} from './season.ts';
import {quickSim} from './quicksim.ts';
import {XP, practiceXp} from './progression.ts';
import {teamMons} from './util.ts';

const progress = (m: Mon) => m.growth * 10000 + m.xp;

test('practice XP goes to the practice squad only, never to hurt Pokémon', () => {
  const s = api.newLeague(C, {seed: 21, start: 'random'});
  const mons = teamMons(s, s.userTeamId);
  const by = (t: Mon['tier']) => mons.find(m => m.tier === t)!;
  assert.equal(practiceXp(by('practice')), XP.practiceSquad);
  assert.equal(practiceXp(by('backup')), 0);
  assert.equal(practiceXp(by('active')), 0);
  const hurt = {...by('practice'), injury: {kind: 'out', weeksLeft: 2, description: 'x', season: 1, sinceWeek: 1}} as Mon;
  assert.equal(practiceXp(hurt), 0);
});

test('a backup earns Growth XP only in a week it sees play', () => {
  const s = api.newLeague(C, {seed: 21, start: 'random'});
  api.advancePhase(C, s);  // preseason -> week 1
  assert.equal(s.phase, 'regular');
  const me = s.userTeamId;
  const backups = teamMons(s, me).filter(m => m.tier === 'backup' && !m.injury);
  const [plays, sits] = backups;
  const squad = teamMons(s, me).filter(m => m.tier === 'practice' && !m.injury);
  const before = new Map(teamMons(s, me).map(m => [m.id, progress(m)]));
  // every game of the week: the user's battles also list `plays` as having come off the bench
  playWeekSync(C, s, (c, st, job) => {
    const r = quickSim(c, st, job);
    const side = Object.values(r.box).find(b => b.teamId === me);
    if (side) r.box[plays.id] = {teamId: me, played: true, kos: 1, fainted: false, damageDealt: 80, damageTaken: 20, statusInflicted: 0, hazardsSet: 0, hazardsRemoved: 0};
    return r;
  });
  assert.equal(progress(s.mons[sits.id]), before.get(sits.id), 'a backup that never played gains nothing');
  assert.ok(progress(s.mons[plays.id]) > before.get(plays.id)!, 'a backup that played gains battle XP');
  for (const m of squad) assert.ok(progress(s.mons[m.id]) > before.get(m.id)!, `practice squad ${m.id} trained`);
});
