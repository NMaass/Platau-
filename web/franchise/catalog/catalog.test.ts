import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Dex} from '@pkmn/sim';
import type {StatTable} from '../types.ts';
import {deriveRoles, catalogStats, loadCatalogNode, spriteUrl, fallbackSpriteUrl, trainerSpriteUrl, TRAINERS, ROLES, type DeriveContext} from './index.ts';

const dex = Dex.forGen(9);
const ctx = (species: string): DeriveContext => {
  const s = dex.species.get(species);
  return {
    move: (n) => { const m = dex.moves.get(n); return m.exists ? {category: m.category, type: m.type, basePower: m.basePower} : undefined; },
    baseStats: s.baseStats as StatTable, types: [...s.types],
  };
};
const has = (roles: string[], ...want: string[]) => { for (const w of want) assert.ok(roles.includes(w), `${w} missing from ${roles.join(',')}`); };

test('Hippowdon Stealth Rock + Sand Stream: rocks, sand-setter, wall', () => {
  const roles = deriveRoles({moves: ['Stealth Rock', 'Earthquake', 'Slack Off', 'Ice Fang'], ability: 'Sand Stream', item: 'Leftovers',
    evs: {hp: 248, def: 112, spd: 148}}, undefined, ctx('hippowdon'));
  has(roles, 'rocks', 'sand-setter', 'wall');
});

test('Rotom-Wash Volt Switch: pivot', () => {
  has(deriveRoles({moves: ['Volt Switch', 'Hydro Pump', 'Pain Split', 'Will-O-Wisp'], ability: 'Levitate', item: 'Leftovers',
    evs: {hp: 252, def: 212, spe: 44}}, undefined, ctx('rotomwash')), 'pivot', 'wall');
});

test('Garchomp Swords Dance: sweeper', () => {
  has(deriveRoles({moves: ['Swords Dance', 'Scale Shot', 'Earthquake', 'Fire Fang'], ability: 'Rough Skin', item: 'Loaded Dice',
    evs: {atk: 252, spd: 4, spe: 252}}, undefined, ctx('garchomp')), 'sweeper', 'attacker');
});

test('Pelipper Drizzle U-turn: rain-setter, pivot', () => {
  has(deriveRoles({moves: ['Hurricane', 'U-turn', 'Roost', 'Knock Off'], ability: 'Drizzle', item: 'Damp Rock'}, undefined, ctx('pelipper')),
    'rain-setter', 'pivot');
});

test('randbats labels and fallbacks', () => {
  has(deriveRoles({moves: ['Close Combat', 'Knock Off'], ability: 'Intimidate', item: 'Choice Band'}, 'Wallbreaker', ctx('ursaluna')), 'wallbreaker');
  has(deriveRoles({moves: ['Toxic', 'Protect'], ability: 'Pressure', item: 'Leftovers'}, 'Bulky Support'), 'wall');
  assert.deepEqual(deriveRoles({moves: ['Splash'], ability: 'Swift Swim', item: ''}, undefined, ctx('magikarp')), ['rain-abuser']);
  assert.deepEqual(deriveRoles({moves: ['Splash'], ability: 'Run Away', item: ''}), ['attacker']);
  has(deriveRoles({moves: ['Rapid Spin', 'Spikes', 'Whirlwind'], ability: 'Sturdy', item: ''}), 'remover', 'spikes', 'phazer');
  has(deriveRoles({moves: ['Reflect', 'Light Screen', 'U-turn'], ability: 'Prankster', item: 'Light Clay'}), 'screens', 'pivot');
});

test('sprite and trainer URLs', () => {
  assert.equal(spriteUrl('rotom-wash'), 'https://play.pokemonshowdown.com/sprites/gen5/rotom-wash.png');
  assert.equal(spriteUrl('garchomp', {kind: 'back', shiny: true}), 'https://play.pokemonshowdown.com/sprites/gen5-back-shiny/garchomp.png');
  assert.equal(spriteUrl('garchomp', {kind: 'icon'}), 'https://play.pokemonshowdown.com/sprites/dex/garchomp.png');
  assert.equal(fallbackSpriteUrl(445), 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/445.png');
  assert.equal(trainerSpriteUrl('brock'), 'https://play.pokemonshowdown.com/sprites/trainers/brock.png');
  assert.ok(TRAINERS.length >= 40 && new Set(TRAINERS).size === TRAINERS.length);
});

const root = fileURLToPath(new URL('../../../', import.meta.url));
const built = existsSync(`${root}web/franchise/data/catalog.json`);

test('catalog sanity', {skip: !built && 'run node web/franchise/scripts/build-catalog.ts first'}, async () => {
  const c = await loadCatalogNode(root);
  const all = Object.values(c.species);
  assert.ok(all.length > 1000, `${all.length} species`);
  for (const s of all) {
    assert.ok(s.sets.length >= 1, `${s.id} has no set`);
    assert.ok(Object.keys(s.roleBase).length >= 1, `${s.id} has no role`);
    assert.ok(s.battleLevel >= 64 && s.battleLevel <= 100, `${s.id} level ${s.battleLevel}`);
    const ids = new Set<string>();
    for (const x of s.sets) {
      assert.ok(x.moves.length >= 1 && x.moves.length <= 4, `${x.id} moves`);
      assert.ok(x.roles.length >= 1 && x.roles.every((r) => ROLES.includes(r)), `${x.id} roles`);
      assert.ok(x.id.startsWith(`${s.id}:`) && !ids.has(x.id), `${x.id} id`);
      ids.add(x.id);
      const evTotal = Object.values(x.evs).reduce((a, b) => a + (b ?? 0), 0);
      assert.ok(evTotal <= 510, `${x.id} EVs ${evTotal}`);
    }
    for (const [role, rb] of Object.entries(s.roleBase)) {
      const set = s.sets.find((x) => x.id === rb!.setId);
      assert.ok(set && set.roles.includes(role as never), `${s.id} ${role} base points at a set without the role`);
    }
    for (const e of s.evolvesTo) assert.ok(c.species[e.id]?.evolvesFrom === s.id, `${s.id} -> ${e.id}`);
    assert.ok(c.species[s.family], `${s.id} family ${s.family}`);
  }
  const g = c.species.garchomp;
  assert.equal(g.battleLevel, 74);
  assert.equal(g.evolvesFrom, 'gabite');
  assert.equal(g.rarity, 'pseudo');
  assert.deepEqual(c.species.gible.evolvesTo, [{id: 'gabite', level: 24}]);
  assert.deepEqual(c.species.gabite.evolvesTo, [{id: 'garchomp', level: 48}]);
  assert.equal(c.species.gible.family, 'gible');
  assert.equal(c.species.mewtwo.rarity, 'legendary');
  assert.equal(c.species.mew.rarity, 'mythical');
  assert.equal(c.species.rotomwash.spriteId, 'rotom-wash');
  assert.equal(c.species.ninetalesalola.spriteId, 'ninetales-alola');
  for (const gone of ['garchompmega', 'charizardgmax', 'pikachuoriginal', 'vivillonfancy', 'palafinhero', 'mimikyubusted']) assert.ok(!c.species[gone], gone);
  const st = catalogStats(c);
  assert.equal(st.species, all.length);
  assert.ok(st.byRole.rocks > 50 && st.byRole.pivot > 100);
});
