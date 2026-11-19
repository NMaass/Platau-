import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replayDocument, withTrainers} from './replay.ts';

const log = ['|player|p1|Pallet Town|1|', '|player|p2|Viridian City|2|', '|poke|p1|Pikachu, L74|', '|start|', '|turn|1', '|win|Pallet Town'];
const opts = {log, p1: {name: 'Pallet Town', trainer: 'red'}, p2: {name: 'Viridian City', trainer: 'blue'}};

test('trainer avatars on both |player| lines', () => {
  const out = withTrainers(log, opts.p1, opts.p2);
  assert.equal(out[0], '|player|p1|Pallet Town|red|');
  assert.equal(out[1], '|player|p2|Viridian City|blue|');
});

test('replay document: hosted player, our trainers, viewer chrome hidden', () => {
  const doc = replayDocument(opts);
  assert.match(doc, /play\.pokemonshowdown\.com\/js\/battle\.js/);
  assert.ok(doc.includes('|player|p1|Pallet Town|red|'));
  assert.ok(doc.includes('|player|p2|Viridian City|blue|'), 'boss avatar rewrite undone');
  assert.match(doc, /\.replay-controls,\.replay-controls-2\{display:none!important\}/);
  assert.ok(doc.includes('L74'));
});
