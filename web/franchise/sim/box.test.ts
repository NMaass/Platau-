import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boxScore, hpPercent, parseIdent} from './box.ts';

const input = {
  p1: {teamId: 'A', monIds: ['a0', 'a1'], names: ['Garchomp', 'Skarmory']},
  p2: {teamId: 'B', monIds: ['b0', 'b1'], names: ['Excadrill', 'Gengar']},
};
const head = ['|player|p1|Alpha|cynthia|', '|player|p2|Beta|leon|', '|poke|p1|Garchomp, L80, M|', '|poke|p1|Skarmory, L78, F|', '|poke|p2|Excadrill, L82, M|', '|poke|p2|Gengar, L76, M|', '|start|',
  '|switch|p1a: Skarmory|Skarmory, L78, F|300/300', '|switch|p2a: Excadrill|Excadrill, L82, M|320/320', '|turn|1'];

test('parses idents and hp', () => {
  assert.deepEqual(parseIdent('p2a: Mr. Mime'), {side: 'p2', pos: 'a', name: 'Mr. Mime'});
  assert.deepEqual(parseIdent('p1: Alpha'), {side: 'p1', pos: '', name: 'Alpha'});
  assert.equal(hpPercent('150/300 par'), 50);
  assert.equal(hpPercent('0 fnt'), 0);
});

test('direct damage, hazards, residual KO credit and end status', () => {
  const log = [...head,
    '|move|p1a: Skarmory|Stealth Rock|p2a: Excadrill', '|-sidestart|p2: Beta|move: Stealth Rock',
    '|move|p2a: Excadrill|Rapid Spin|p1a: Skarmory', '|-damage|p1a: Skarmory|270/300',
    '|-sideend|p2: Beta|Stealth Rock|[from] move: Rapid Spin|[of] p2a: Excadrill',
    '|upkeep', '|turn|2',
    '|move|p1a: Skarmory|Stealth Rock|p2a: Excadrill', '|-sidestart|p2: Beta|move: Stealth Rock',
    '|move|p2a: Excadrill|Iron Head|p1a: Skarmory', '|-damage|p1a: Skarmory|240/300',
    '|-damage|p1a: Skarmory|210/300|[from] item: Life Orb',
    '|upkeep', '|turn|3',
    '|switch|p2a: Gengar|Gengar, L76, M|10/250', '|-damage|p2a: Gengar|0 fnt|[from] Stealth Rock', '|faint|p2a: Gengar',
    '|move|p1a: Skarmory|Toxic|p2a: Excadrill',
    '|upkeep', '|turn|4',
    '|switch|p2a: Excadrill|Excadrill, L82, M|320/320',
    '|move|p1a: Skarmory|Toxic|p2a: Excadrill', '|-status|p2a: Excadrill|tox', '|upkeep',
    '|-damage|p2a: Excadrill|300/320 tox|[from] psn',
    '|turn|5', '|win|Alpha'];
  const b = boxScore(log, input);
  assert.equal(b.a1.hazardsSet, 2);
  assert.equal(b.b0.hazardsRemoved, 1);
  assert.equal(b.a1.kos, 1, 'rocks KO credited to the setter');
  assert.equal(b.b1.fainted, true);
  assert.equal(b.b1.endStatus, undefined);
  assert.equal(b.a1.statusInflicted, 1);
  assert.equal(b.b0.endStatus, 'tox');
  assert.equal(b.a1.damageTaken, 30, 'all HP lost, incl. Life Orb');
  assert.equal(b.b0.damageDealt, 20, 'Life Orb self damage not credited');
  assert.equal(b.a1.damageDealt, Math.round((4 + 100 * 20 / 320) * 10) / 10);
  assert.equal(b.a0.played, false);
  assert.equal(b.a1.played, true);
  assert.equal(b.a0.teamId, 'A');
});

test('[of] attribution, recoil self-KO, Toxic Debris, Court Change', () => {
  const log = [...head,
    '|move|p2a: Excadrill|Earthquake|p1a: Skarmory', '|-immune|p1a: Skarmory',
    '|move|p1a: Skarmory|Brave Bird|p2a: Excadrill', '|-damage|p2a: Excadrill|160/320',
    '|-damage|p1a: Skarmory|0 fnt|[from] Recoil', '|faint|p1a: Skarmory',
    '|upkeep',
    '|switch|p1a: Garchomp|Garchomp, L80, M|330/330', '|turn|2',
    '|move|p2a: Excadrill|Iron Head|p1a: Garchomp', '|-damage|p1a: Garchomp|300/330',
    '|-damage|p2a: Excadrill|0 fnt|[from] ability: Rough Skin|[of] p1a: Garchomp', '|faint|p2a: Excadrill',
    '|-activate|p1a: Garchomp|ability: Toxic Debris', '|-sidestart|p2: Beta|move: Toxic Spikes',
    '|upkeep',
    '|switch|p2a: Gengar|Gengar, L76, M|250/250', '|-status|p2a: Gengar|psn', '|turn|3',
    '|move|p2a: Gengar|Court Change|p2a: Gengar', '|-swapsideconditions|',
    '|turn|4'];
  const b = boxScore(log, input);
  assert.equal(b.a1.kos, 0, 'recoil KO credits nobody');
  assert.equal(b.b0.kos, 0);
  assert.equal(b.a0.kos, 1, 'Rough Skin KO');
  assert.equal(b.a0.damageDealt, 50);
  assert.equal(b.a0.hazardsSet, 1, 'Toxic Debris layer credited to its user');
  assert.equal(b.a0.statusInflicted, 1, 'Toxic Spikes poison credited to the setter');
  assert.equal(b.b1.hazardsRemoved, 1, 'Court Change');
});
