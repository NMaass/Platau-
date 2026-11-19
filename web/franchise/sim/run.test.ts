import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from '../../scripts/load-engine.ts';
import type {BattleJob} from '../types.ts';
import {runJob, coinFlip} from './run.ts';
import {PLATEAU_FORMAT, uniqueNicknames} from './runner-plateau.ts';

const mon = (species: string, level: number, moves: string[]) => `${species} @ Eviolite
Level: ${level}
EVs: 92 HP / 92 Atk / 92 Def
Adamant Nature
${moves.map((m) => `- ${m}`).join('\n')}`;
const LC1 = [
  mon('Mudbray', 5, ['Earthquake', 'Rock Slide', 'Body Press', 'Stealth Rock']),
  mon('Mudbray', 5, ['High Horsepower', 'Rock Slide', 'Close Combat', 'Heavy Slam']),
  mon('Pawniard', 5, ['Sucker Punch', 'Iron Head', 'Knock Off', 'Swords Dance']),
  mon('Timburr', 5, ['Mach Punch', 'Drain Punch', 'Knock Off', 'Bulk Up']),
  mon('Foongus', 5, ['Spore', 'Giga Drain', 'Sludge Bomb', 'Clear Smog']),
  mon('Snover', 5, ['Ice Shard', 'Wood Hammer', 'Ice Punch', 'Leech Seed']),
].join('\n\n');
const LC2 = [
  mon('Garchomp', 80, ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Swords Dance']),
  mon('Corviknight', 80, ['Brave Bird', 'Body Press', 'Roost', 'U-turn']),
  mon('Gengar', 80, ['Shadow Ball', 'Sludge Bomb', 'Focus Blast', 'Will-O-Wisp']),
  mon('Toxapex', 80, ['Scald', 'Toxic', 'Recover', 'Haze']),
  mon('Rotom-Wash', 80, ['Hydro Pump', 'Volt Switch', 'Will-O-Wisp', 'Pain Split']),
  mon('Weavile', 80, ['Ice Shard', 'Knock Off', 'Triple Axel', 'Swords Dance']),
].join('\n\n');

const job = (over: Partial<BattleJob> = {}): BattleJob => ({
  id: 'g1',
  p1: {teamId: 'T1', name: 'Pallet', trainer: 'red', export: LC1, monIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']},
  p2: {teamId: 'T2', name: 'Viridian', trainer: 'blue', export: LC2, monIds: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']},
  seed: 11, budgetMs: {p1: 2, p2: 2}, keepLog: true, ...over,
});

test('format keeps per-mon levels', () => {
  assert.ok(!/adjust level/i.test(PLATEAU_FORMAT));
});

test('unique nicknames for repeated species', () => {
  const t = uniqueNicknames([{species: 'Mudbray', name: ''}, {species: 'Mudbray', name: ''}] as never);
  assert.equal(t[0].name, '');
  assert.equal(t[1].name, 'Mudbray 2');
});

test('runs a job: levels respected, box keyed by monIds, trainers on |player|', async () => {
  const engine = await loadEngine();
  const r = runJob(engine, job());
  assert.deepEqual(r.problems, []);
  assert.ok(r.winner === 'p1' || r.winner === 'p2');
  assert.ok(r.turns > 0);
  assert.equal(Object.keys(r.box).length, 12);
  assert.ok(r.log.includes('|poke|p1|Mudbray, L5, M|') || r.log.some((l) => l.startsWith('|poke|p1|Mudbray, L5')));
  assert.ok(r.log.some((l) => l.startsWith('|poke|p2|Garchomp, L80')));
  assert.ok(r.log.some((l) => l.startsWith('|poke|p1|Mudbray 2, L5') || l.startsWith('|poke|p1|Mudbray, L5')));
  assert.ok(r.log.some((l) => l.startsWith('|player|p1|Pallet|red')));
  assert.ok(r.log.some((l) => l.startsWith('|player|p2|Viridian|blue')));
  // level 80 beats level 5
  assert.equal(r.winner, 'p2');
  const loser = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id) => r.box[id]);
  assert.ok(loser.every((b) => b.fainted));
  assert.equal(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].reduce((a, id) => a + r.box[id].kos, 0), 6);
  assert.ok(r.box.m2.played === false || r.log.some((l) => l.includes('p1a: Mudbray 2')), 'duplicate species mapped through its nickname');
});

test('a broken job returns a coin-flip result with a problem', async () => {
  const engine = await loadEngine();
  const r = runJob(engine, job({p1: {...job().p1, export: 'not a team'}}));
  assert.equal(r.winner, coinFlip(11));
  assert.equal(r.turns, 0);
  assert.equal(r.problems.length, 1);
  assert.equal(r.box.m1.played, false);
});
