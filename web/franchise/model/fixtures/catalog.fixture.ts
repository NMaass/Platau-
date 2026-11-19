// Hand-written fixture catalog (~90 species) so model tests never depend on the
// generated web/franchise/data/catalog.json. Stats/levels are close to the real
// ones; sets are Smogon-like (several borrowed from design/proto-reference/roster-sets.json).
import type {Catalog, CatalogSpecies, CatalogSet, Role, Rarity, GrowthRate, StatId, StatTable} from '../../types.ts';
import {TIER_BASE} from '../../catalog/roles.ts';

type S = [name: string, tier: string, moves: string, ability: string, item: string, nature: string, evs: string, roles: Role[]];

function parseEvs(s: string): Partial<StatTable> {
  const out: Partial<StatTable> = {};
  for (const part of s.split(' ').filter(Boolean)) {
    const m = /^(hp|atk|def|spa|spd|spe)(\d+)$/.exec(part);
    if (!m) throw new Error(`bad evs ${s}`);
    out[m[1] as StatId] = Number(m[2]);
  }
  return out;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const species: Record<string, CatalogSpecies> = {};

function sp(
  id: string, name: string, num: number, types: string[], bs: number[], level: number,
  rarity: Rarity, growthRate: GrowthRate, family: string, evolvesTo: [string, number][],
  sets: S[], evolvesFrom?: string,
): void {
  const baseStats: StatTable = {hp: bs[0], atk: bs[1], def: bs[2], spa: bs[3], spd: bs[4], spe: bs[5]};
  const catSets: CatalogSet[] = sets.map(([n, tier, moves, ability, item, nature, evs, roles]) => ({
    id: `${id}:${slug(n)}-${slug(tier)}`, name: n, tier,
    source: tier === 'Randbats' ? 'randbats' : tier === 'NFE' ? 'generated' : 'smogon',
    moves: moves.split('/'), ability, item, nature, evs: parseEvs(evs), roles,
  }));
  const roleBase: CatalogSpecies['roleBase'] = {};
  for (const set of catSets) {
    const base = TIER_BASE[set.tier] ?? 62;
    for (const r of set.roles) if (!roleBase[r] || roleBase[r]!.base < base) roleBase[r] = {base, tier: set.tier, setId: set.id};
  }
  const invested = new Set<StatId>();
  for (const set of catSets) for (const k of Object.keys(set.evs) as StatId[]) if ((set.evs[k] ?? 0) >= 80) invested.add(k);
  species[id] = {
    id, name, num, types, baseStats, bst: bs.reduce((a, b) => a + b, 0), battleLevel: level, rarity, growthRate,
    evolvesTo: evolvesTo.map(([to, lv]) => ({id: to, level: lv})), evolvesFrom, family, sets: catSets, roleBase,
    investedStats: [...invested], spriteId: id.replace(/(alola|wash|therian)$/, m => `-${m}`),
  };
}

// ---------------------------------------------------------------- legendaries / mythicals
sp('mewtwo', 'Mewtwo', 150, ['Psychic'], [106, 110, 90, 154, 90, 130], 70, 'legendary', 'slow', 'mewtwo', [], [
  ['Nasty Plot', 'Uber', 'Nasty Plot/Psystrike/Aura Sphere/Recover', 'Unnerve', 'Life Orb', 'Timid', 'spa252 spd4 spe252', ['sweeper']],
  ['Specs', 'Uber', 'Psystrike/Aura Sphere/Ice Beam/Fire Blast', 'Pressure', 'Choice Specs', 'Timid', 'spa252 spd4 spe252', ['wallbreaker']]]);
sp('lugia', 'Lugia', 249, ['Psychic', 'Flying'], [106, 90, 130, 90, 154, 110], 72, 'legendary', 'slow', 'lugia', [], [
  ['Defensive', 'Uber', 'Whirlwind/Toxic/Roost/Aeroblast', 'Multiscale', 'Heavy-Duty Boots', 'Bold', 'hp252 def252 spd4', ['wall', 'phazer']]]);
sp('hooh', 'Ho-Oh', 250, ['Fire', 'Flying'], [106, 130, 90, 110, 154, 90], 72, 'legendary', 'slow', 'hooh', [], [
  ['Defensive', 'Uber', 'Sacred Fire/Brave Bird/Recover/Whirlwind', 'Regenerator', 'Heavy-Duty Boots', 'Impish', 'hp248 def224 spe36', ['wall', 'phazer', 'attacker']]]);
sp('kyogre', 'Kyogre', 382, ['Water'], [100, 100, 90, 150, 140, 90], 70, 'legendary', 'slow', 'kyogre', [], [
  ['Choice Scarf', 'Uber', 'Water Spout/Origin Pulse/Thunder/Ice Beam', 'Drizzle', 'Choice Scarf', 'Modest', 'spa252 spd4 spe252', ['rain-setter', 'rain-abuser', 'wallbreaker']],
  ['Calm Mind', 'Uber', 'Calm Mind/Origin Pulse/Thunder/Rest', 'Drizzle', 'Leftovers', 'Bold', 'hp252 def252 spe4', ['rain-setter', 'sweeper']]]);
sp('groudon', 'Groudon', 383, ['Ground'], [100, 150, 140, 100, 90, 90], 70, 'legendary', 'slow', 'groudon', [], [
  ['Stealth Rock', 'Uber', 'Stealth Rock/Precipice Blades/Heat Crash/Lava Plume', 'Drought', 'Leftovers', 'Impish', 'hp252 def252 spd4', ['sun-setter', 'rocks', 'wall']],
  ['Swords Dance', 'Uber', 'Swords Dance/Precipice Blades/Heat Crash/Stone Edge', 'Drought', 'Life Orb', 'Jolly', 'atk252 spd4 spe252', ['sun-setter', 'sweeper', 'sun-abuser']]]);
sp('rayquaza', 'Rayquaza', 384, ['Dragon', 'Flying'], [105, 150, 90, 150, 90, 95], 72, 'legendary', 'slow', 'rayquaza', [], [
  ['Dragon Dance', 'Uber', 'Dragon Dance/Dragon Ascent/Extreme Speed/Earthquake', 'Air Lock', 'Life Orb', 'Jolly', 'atk252 spd4 spe252', ['sweeper']],
  ['Swords Dance', 'Uber', 'Swords Dance/Dragon Ascent/Extreme Speed/V-create', 'Air Lock', 'Life Orb', 'Adamant', 'atk252 spd4 spe252', ['wallbreaker']]]);
sp('dialga', 'Dialga', 483, ['Steel', 'Dragon'], [100, 120, 120, 150, 100, 90], 72, 'legendary', 'slow', 'dialga', [], [
  ['Stealth Rock', 'Uber', 'Stealth Rock/Draco Meteor/Fire Blast/Thunder Wave', 'Pressure', 'Leftovers', 'Modest', 'hp252 spa252 spe4', ['rocks', 'attacker']]]);
sp('palkia', 'Palkia', 484, ['Water', 'Dragon'], [90, 120, 100, 150, 120, 100], 72, 'legendary', 'slow', 'palkia', [], [
  ['Specs', 'Uber', 'Spacial Rend/Hydro Pump/Fire Blast/Thunder', 'Pressure', 'Choice Specs', 'Timid', 'spa252 spd4 spe252', ['wallbreaker', 'rain-abuser']]]);
sp('giratina', 'Giratina', 487, ['Ghost', 'Dragon'], [150, 100, 120, 100, 120, 90], 72, 'legendary', 'slow', 'giratina', [], [
  ['Defensive', 'Uber', 'Will-O-Wisp/Defog/Rest/Shadow Ball', 'Pressure', 'Leftovers', 'Bold', 'hp252 def252 spd4', ['wall', 'remover']]]);
sp('reshiram', 'Reshiram', 643, ['Dragon', 'Fire'], [100, 120, 100, 150, 120, 90], 73, 'legendary', 'slow', 'reshiram', [], [
  ['Choice Specs', 'Uber', 'Blue Flare/Draco Meteor/Earth Power/Flamethrower', 'Turboblaze', 'Choice Specs', 'Modest', 'spa252 spd4 spe252', ['wallbreaker', 'sun-abuser']]]);
sp('zekrom', 'Zekrom', 644, ['Dragon', 'Electric'], [100, 150, 120, 120, 100, 90], 73, 'legendary', 'slow', 'zekrom', [], [
  ['Dragon Dance', 'Uber', 'Dragon Dance/Bolt Strike/Outrage/Substitute', 'Teravolt', 'Life Orb', 'Adamant', 'atk252 spd4 spe252', ['sweeper']]]);
sp('heatran', 'Heatran', 485, ['Fire', 'Steel'], [91, 90, 106, 130, 106, 77], 78, 'legendary', 'slow', 'heatran', [], [
  ['Stealth Rock', 'OU', 'Stealth Rock/Magma Storm/Earth Power/Taunt', 'Flash Fire', 'Leftovers', 'Calm', 'hp252 spd252 spe4', ['rocks', 'wall', 'sun-abuser']]]);
sp('landorustherian', 'Landorus-Therian', 645, ['Ground', 'Flying'], [89, 145, 90, 105, 80, 91], 76, 'legendary', 'slow', 'landorustherian', [], [
  ['Defensive Pivot', 'OU', 'Stealth Rock/Earthquake/U-turn/Taunt', 'Intimidate', 'Rocky Helmet', 'Impish', 'hp252 def216 spe40', ['rocks', 'pivot', 'wall']]]);
sp('zapdos', 'Zapdos', 145, ['Electric', 'Flying'], [90, 90, 85, 125, 90, 100], 79, 'legendary', 'slow', 'zapdos', [], [
  ['Defensive Pivot', 'OU', 'Volt Switch/Hurricane/Roost/Discharge', 'Static', 'Heavy-Duty Boots', 'Bold', 'hp248 def244 spe16', ['pivot', 'rain-abuser']]]);
sp('moltres', 'Moltres', 146, ['Fire', 'Flying'], [90, 100, 90, 125, 85, 90], 80, 'legendary', 'slow', 'moltres', [], [
  ['Defensive', 'UU', 'Flamethrower/Roost/U-turn/Will-O-Wisp', 'Flame Body', 'Heavy-Duty Boots', 'Bold', 'hp248 def248 spe12', ['pivot', 'wall', 'sun-abuser']]]);
sp('mew', 'Mew', 151, ['Psychic'], [100, 100, 100, 100, 100, 100], 79, 'mythical', 'medium-slow', 'mew', [], [
  ['Utility', 'OU', 'Stealth Rock/Will-O-Wisp/Psychic Noise/U-turn', 'Synchronize', 'Leftovers', 'Bold', 'hp252 def252 spe4', ['rocks', 'pivot', 'wall']],
  ['Spikes', 'OU', 'Spikes/Taunt/Psychic/Roost', 'Synchronize', 'Leftovers', 'Timid', 'hp252 def4 spe252', ['spikes']]]);
sp('jirachi', 'Jirachi', 385, ['Steel', 'Psychic'], [100, 100, 100, 100, 100, 100], 80, 'mythical', 'slow', 'jirachi', [], [
  ['Support', 'UU', 'Iron Head/U-turn/Stealth Rock/Wish', 'Serene Grace', 'Leftovers', 'Careful', 'hp252 spd252 spe4', ['rocks', 'pivot', 'wall']]]);
sp('celebi', 'Celebi', 251, ['Psychic', 'Grass'], [100, 100, 100, 100, 100, 100], 82, 'mythical', 'medium-slow', 'celebi', [], [
  ['Nasty Plot', 'UU', 'Nasty Plot/Giga Drain/Psychic/Earth Power', 'Natural Cure', 'Leftovers', 'Timid', 'spa252 spd4 spe252', ['sweeper', 'sun-abuser']]]);

// ---------------------------------------------------------------- pseudo-legendary lines
sp('gible', 'Gible', 443, ['Dragon', 'Ground'], [58, 70, 45, 40, 45, 42], 99, 'pseudo', 'slow', 'gible', [['gabite', 24]], [
  ['Generated', 'NFE', 'Dragon Claw/Earthquake/Stealth Rock/Fire Fang', 'Rough Skin', 'Eviolite', 'Jolly', 'hp252 atk252 spe4', ['rocks', 'attacker']]]);
sp('gabite', 'Gabite', 444, ['Dragon', 'Ground'], [68, 90, 65, 50, 55, 82], 93, 'pseudo', 'slow', 'gible', [['garchomp', 48]], [
  ['Generated', 'NFE', 'Dragon Claw/Earthquake/Stealth Rock/Fire Fang', 'Rough Skin', 'Eviolite', 'Jolly', 'hp252 atk252 spe4', ['rocks', 'attacker']]], 'gible');
sp('garchomp', 'Garchomp', 445, ['Dragon', 'Ground'], [108, 130, 95, 80, 85, 102], 78, 'pseudo', 'slow', 'gible', [], [
  ['Swords Dance', 'OU', 'Swords Dance/Earthquake/Fire Fang/Scale Shot', 'Rough Skin', 'Leftovers', 'Jolly', 'atk252 spd4 spe252', ['sweeper']],
  ['Tank', 'OU', 'Stealth Rock/Earthquake/Toxic/Rest', 'Rough Skin', 'Rocky Helmet', 'Impish', 'hp252 def176 spe80', ['rocks', 'attacker']]], 'gabite');
sp('larvitar', 'Larvitar', 246, ['Rock', 'Ground'], [50, 64, 50, 45, 50, 41], 99, 'pseudo', 'slow', 'larvitar', [['pupitar', 30]], [
  ['Generated', 'NFE', 'Stealth Rock/Rock Slide/Earthquake/Crunch', 'Guts', 'Eviolite', 'Adamant', 'hp252 atk252 def4', ['rocks', 'attacker']]]);
sp('pupitar', 'Pupitar', 247, ['Rock', 'Ground'], [70, 84, 70, 65, 70, 51], 95, 'pseudo', 'slow', 'larvitar', [['tyranitar', 55]], [
  ['Generated', 'NFE', 'Stealth Rock/Rock Slide/Earthquake/Crunch', 'Shed Skin', 'Eviolite', 'Impish', 'hp252 def252 atk4', ['rocks', 'wall']]], 'larvitar');
sp('tyranitar', 'Tyranitar', 248, ['Rock', 'Dark'], [100, 134, 110, 95, 100, 61], 80, 'pseudo', 'slow', 'larvitar', [], [
  ['Specially Defensive', 'OU', 'Stealth Rock/Knock Off/Stone Edge/Thunder Wave', 'Sand Stream', 'Leftovers', 'Careful', 'hp252 atk4 spd252', ['rocks', 'sand-setter']],
  ['Choice Band', 'OU', 'Stone Edge/Crunch/Earthquake/Ice Punch', 'Sand Stream', 'Choice Band', 'Adamant', 'hp92 atk252 spe164', ['sand-setter', 'wallbreaker']]], 'pupitar');
sp('dratini', 'Dratini', 147, ['Dragon'], [41, 64, 45, 50, 50, 50], 99, 'pseudo', 'slow', 'dratini', [['dragonair', 30]], [
  ['Generated', 'NFE', 'Dragon Dance/Outrage/Extreme Speed/Iron Tail', 'Marvel Scale', 'Eviolite', 'Adamant', 'atk252 spd4 spe252', ['sweeper']]]);
sp('dragonair', 'Dragonair', 148, ['Dragon'], [61, 84, 65, 70, 70, 70], 95, 'pseudo', 'slow', 'dratini', [['dragonite', 55]], [
  ['Generated', 'NFE', 'Dragon Dance/Outrage/Extreme Speed/Iron Tail', 'Marvel Scale', 'Eviolite', 'Adamant', 'atk252 spd4 spe252', ['sweeper']]], 'dratini');
sp('dragonite', 'Dragonite', 149, ['Dragon', 'Flying'], [91, 134, 95, 100, 100, 80], 76, 'pseudo', 'slow', 'dratini', [], [
  ['Offensive Dragon Dance', 'OU', 'Dragon Dance/Extreme Speed/Earthquake/Fire Punch', 'Multiscale', 'Heavy-Duty Boots', 'Adamant', 'atk252 spd4 spe252', ['sweeper']],
  ['Utility', 'OU', 'Roost/Defog/Extreme Speed/Earthquake', 'Multiscale', 'Heavy-Duty Boots', 'Impish', 'hp252 def252 spd4', ['wall', 'remover']]], 'dragonair');
sp('beldum', 'Beldum', 374, ['Steel', 'Psychic'], [40, 55, 80, 35, 60, 30], 100, 'pseudo', 'slow', 'beldum', [['metang', 20]], [
  ['Generated', 'NFE', 'Iron Head/Zen Headbutt/Take Down/Iron Defense', 'Clear Body', 'Eviolite', 'Adamant', 'hp252 atk252 def4', ['attacker']]]);
sp('metang', 'Metang', 375, ['Steel', 'Psychic'], [60, 75, 100, 55, 80, 50], 96, 'pseudo', 'slow', 'beldum', [['metagross', 45]], [
  ['Generated', 'NFE', 'Meteor Mash/Zen Headbutt/Bullet Punch/Stealth Rock', 'Clear Body', 'Eviolite', 'Adamant', 'hp252 atk252 def4', ['attacker', 'rocks']]], 'beldum');
sp('metagross', 'Metagross', 376, ['Steel', 'Psychic'], [80, 135, 130, 95, 90, 70], 82, 'pseudo', 'slow', 'beldum', [], [
  ['Stealth Rock', 'UU', 'Stealth Rock/Meteor Mash/Knock Off/Earthquake', 'Clear Body', 'Leftovers', 'Adamant', 'hp252 atk252 spd4', ['rocks', 'attacker']],
  ['Agility', 'UU', 'Agility/Meteor Mash/Psychic Fangs/Earthquake', 'Clear Body', 'Life Orb', 'Jolly', 'atk252 spd4 spe252', ['sweeper']]], 'metang');
sp('deino', 'Deino', 633, ['Dark', 'Dragon'], [52, 65, 50, 45, 50, 38], 100, 'pseudo', 'slow', 'deino', [['zweilous', 50]], [
  ['Generated', 'NFE', 'Dragon Rush/Crunch/Earthquake/Roar', 'Hustle', 'Eviolite', 'Adamant', 'hp252 atk252 def4', ['attacker', 'phazer']]]);
sp('zweilous', 'Zweilous', 634, ['Dark', 'Dragon'], [72, 85, 70, 65, 70, 58], 94, 'pseudo', 'slow', 'deino', [['hydreigon', 64]], [
  ['Generated', 'NFE', 'Outrage/Crunch/Earthquake/Roar', 'Hustle', 'Eviolite', 'Adamant', 'hp252 atk252 def4', ['attacker', 'phazer']]], 'deino');
sp('hydreigon', 'Hydreigon', 635, ['Dark', 'Dragon'], [92, 105, 90, 125, 90, 98], 81, 'pseudo', 'slow', 'deino', [], [
  ['Three Attacks', 'OU', 'Draco Meteor/Dark Pulse/Flash Cannon/U-turn', 'Levitate', 'Choice Specs', 'Timid', 'spa252 spd4 spe252', ['wallbreaker', 'pivot']],
  ['Nasty Plot', 'OU', 'Nasty Plot/Draco Meteor/Dark Pulse/Flamethrower', 'Levitate', 'Life Orb', 'Timid', 'spa252 spd4 spe252', ['sweeper']]], 'zweilous');
sp('dreepy', 'Dreepy', 885, ['Dragon', 'Ghost'], [28, 60, 30, 40, 30, 82], 100, 'pseudo', 'slow', 'dreepy', [['drakloak', 50]], [
  ['Generated', 'LC', 'Dragon Darts/Phantom Force/U-turn/Quick Attack', 'Infiltrator', 'Choice Scarf', 'Jolly', 'atk236 spe236', ['pivot', 'attacker']]]);
sp('drakloak', 'Drakloak', 886, ['Dragon', 'Ghost'], [68, 80, 50, 60, 50, 102], 92, 'pseudo', 'slow', 'dreepy', [['dragapult', 60]], [
  ['Generated', 'NFE', 'Dragon Darts/Phantom Force/U-turn/Will-O-Wisp', 'Infiltrator', 'Eviolite', 'Jolly', 'atk252 spd4 spe252', ['pivot', 'attacker']]], 'dreepy');
sp('dragapult', 'Dragapult', 887, ['Dragon', 'Ghost'], [88, 120, 75, 100, 75, 142], 77, 'pseudo', 'slow', 'dreepy', [], [
  ['Choice Specs', 'OU', 'Draco Meteor/Shadow Ball/Flamethrower/U-turn', 'Infiltrator', 'Choice Specs', 'Timid', 'spa252 spd4 spe252', ['pivot', 'wallbreaker']],
  ['Offensive Pivot', 'OU', 'Dragon Darts/Hex/Will-O-Wisp/U-turn', 'Infiltrator', 'Heavy-Duty Boots', 'Hasty', 'atk252 spd4 spe252', ['pivot']]], 'drakloak');

// ---------------------------------------------------------------- common lines
sp('hippopotas', 'Hippopotas', 449, ['Ground'], [68, 72, 78, 38, 42, 32], 100, 'common', 'slow', 'hippopotas', [['hippowdon', 34]], [
  ['Generated', 'LC', 'Stealth Rock/Earthquake/Slack Off/Whirlwind', 'Sand Stream', 'Eviolite', 'Impish', 'hp236 def236', ['sand-setter', 'rocks', 'phazer']]]);
sp('hippowdon', 'Hippowdon', 450, ['Ground'], [108, 112, 118, 68, 72, 47], 82, 'common', 'slow', 'hippopotas', [], [
  ['Special Wall', 'OU', 'Earthquake/Slack Off/Stealth Rock/Toxic', 'Sand Stream', 'Leftovers', 'Careful', 'hp252 atk8 spd248', ['rocks', 'sand-setter', 'wall']],
  ['Physical Wall', 'UU', 'Earthquake/Slack Off/Whirlwind/Stealth Rock', 'Sand Stream', 'Leftovers', 'Impish', 'hp252 def252 spd4', ['rocks', 'sand-setter', 'phazer', 'wall']]], 'hippopotas');
sp('rotomwash', 'Rotom-Wash', 479, ['Electric', 'Water'], [50, 65, 107, 105, 107, 86], 84, 'common', 'medium-fast', 'rotomwash', [], [
  ['Defensive Pivot', 'OU', 'Volt Switch/Hydro Pump/Thunder Wave/Pain Split', 'Levitate', 'Leftovers', 'Calm', 'hp252 spd168 spe88', ['pivot']],
  ['Pivot', 'UU', 'Volt Switch/Hydro Pump/Pain Split/Will-O-Wisp', 'Levitate', 'Leftovers', 'Timid', 'hp252 def40 spe216', ['pivot', 'rain-abuser']]]);
sp('drilbur', 'Drilbur', 529, ['Ground'], [60, 85, 40, 30, 45, 68], 100, 'common', 'medium-fast', 'drilbur', [['excadrill', 31]], [
  ['Generated', 'LC', 'Rapid Spin/Earthquake/Rock Slide/Swords Dance', 'Sand Rush', 'Eviolite', 'Jolly', 'atk236 spe236', ['remover', 'sand-abuser']]]);
sp('excadrill', 'Excadrill', 530, ['Ground', 'Steel'], [110, 135, 60, 50, 65, 88], 80, 'common', 'medium-fast', 'drilbur', [], [
  ['Sand Rush', 'OU', 'Swords Dance/Earthquake/Iron Head/Rapid Spin', 'Sand Rush', 'Life Orb', 'Adamant', 'atk252 spd4 spe252', ['remover', 'sand-abuser', 'sweeper']],
  ['Utility', 'OU', 'Stealth Rock/Rapid Spin/Earthquake/Iron Head', 'Mold Breaker', 'Leftovers', 'Jolly', 'hp252 atk4 spe252', ['rocks', 'remover']]], 'drilbur');
sp('rookidee', 'Rookidee', 821, ['Flying'], [38, 47, 35, 33, 35, 57], 100, 'common', 'medium-slow', 'rookidee', [['corvisquire', 18]], [
  ['Generated', 'LC', 'Brave Bird/U-turn/Roost/Defog', 'Keen Eye', 'Eviolite', 'Jolly', 'atk236 spe236', ['pivot', 'remover']]]);
sp('corvisquire', 'Corvisquire', 822, ['Flying'], [68, 67, 55, 43, 55, 77], 98, 'common', 'medium-slow', 'rookidee', [['corviknight', 38]], [
  ['Generated', 'NFE', 'Brave Bird/U-turn/Roost/Defog', 'Keen Eye', 'Eviolite', 'Impish', 'hp252 def252 spe4', ['pivot', 'remover']]], 'rookidee');
sp('corviknight', 'Corviknight', 823, ['Flying', 'Steel'], [98, 87, 105, 53, 85, 67], 83, 'common', 'medium-slow', 'rookidee', [], [
  ['Defog', 'OU', 'Defog/Roost/U-turn/Body Press', 'Pressure', 'Leftovers', 'Impish', 'hp252 def168 spd88', ['remover', 'pivot', 'wall']]], 'corvisquire');
sp('larvesta', 'Larvesta', 636, ['Bug', 'Fire'], [55, 85, 55, 50, 55, 60], 100, 'common', 'slow', 'larvesta', [['volcarona', 59]], [
  ['Pivot', 'LC', 'U-turn/Flare Blitz/Morning Sun/Will-O-Wisp', 'Flame Body', 'Eviolite', 'Jolly', 'hp76 atk196 spe236', ['pivot']]]);
sp('volcarona', 'Volcarona', 637, ['Bug', 'Fire'], [85, 60, 65, 135, 105, 100], 79, 'common', 'slow', 'larvesta', [], [
  ['Bulky Quiver Dance', 'OU', 'Quiver Dance/Fiery Dance/Giga Drain/Morning Sun', 'Flame Body', 'Heavy-Duty Boots', 'Timid', 'hp252 def4 spe252', ['sweeper', 'sun-abuser']],
  ['Offensive Quiver Dance', 'OU', 'Quiver Dance/Fire Blast/Bug Buzz/Psychic', 'Flame Body', 'Heavy-Duty Boots', 'Timid', 'spa252 spd4 spe252', ['sweeper']]], 'larvesta');
sp('wingull', 'Wingull', 278, ['Water', 'Flying'], [40, 30, 30, 55, 30, 85], 100, 'common', 'medium-fast', 'wingull', [['pelipper', 25]], [
  ['Generated', 'LC', 'Scald/Hurricane/U-turn/Roost', 'Drizzle', 'Eviolite', 'Timid', 'spa236 spe236', ['rain-setter', 'pivot']]]);
sp('pelipper', 'Pelipper', 279, ['Water', 'Flying'], [60, 50, 100, 95, 70, 65], 86, 'common', 'medium-fast', 'wingull', [], [
  ['Defensive', 'OU', 'Scald/Hurricane/U-turn/Roost', 'Drizzle', 'Damp Rock', 'Bold', 'hp248 def252 spd8', ['remover', 'pivot', 'rain-setter', 'wall']],
  ['Choice Specs', 'OU', 'Hurricane/Hydro Pump/U-turn/Weather Ball', 'Drizzle', 'Choice Specs', 'Modest', 'hp248 spa252 spe8', ['pivot', 'rain-setter', 'wallbreaker']]], 'wingull');
sp('vullaby', 'Vullaby', 629, ['Dark', 'Flying'], [70, 55, 75, 45, 65, 60], 100, 'common', 'slow', 'vullaby', [['mandibuzz', 54]], [
  ['Generated', 'LC', 'Foul Play/Roost/U-turn/Defog', 'Overcoat', 'Eviolite', 'Bold', 'hp236 def236', ['wall', 'remover', 'pivot']]]);
sp('mandibuzz', 'Mandibuzz', 630, ['Dark', 'Flying'], [110, 65, 105, 55, 95, 80], 84, 'common', 'slow', 'vullaby', [], [
  ['Defensive', 'OU', 'Foul Play/Roost/U-turn/Defog', 'Overcoat', 'Heavy-Duty Boots', 'Bold', 'hp248 def244 spe16', ['remover', 'pivot', 'wall']]], 'vullaby');
sp('arrokuda', 'Arrokuda', 846, ['Water'], [41, 63, 40, 40, 30, 66], 100, 'common', 'slow', 'arrokuda', [['barraskewda', 26]], [
  ['Generated', 'LC', 'Liquidation/Close Combat/Psychic Fangs/Aqua Jet', 'Swift Swim', 'Life Orb', 'Adamant', 'atk236 spe236', ['rain-abuser', 'attacker']]]);
sp('barraskewda', 'Barraskewda', 847, ['Water'], [61, 123, 60, 60, 50, 136], 83, 'common', 'slow', 'arrokuda', [], [
  ['Choice Band', 'OU', 'Liquidation/Close Combat/Psychic Fangs/Flip Turn', 'Swift Swim', 'Choice Band', 'Adamant', 'atk252 spd4 spe252', ['pivot', 'rain-abuser', 'wallbreaker']]], 'arrokuda');
sp('torkoal', 'Torkoal', 324, ['Fire'], [70, 85, 140, 85, 70, 20], 89, 'common', 'medium-fast', 'torkoal', [], [
  ['Support', 'OU', 'Lava Plume/Rapid Spin/Yawn/Stealth Rock', 'Drought', 'Heat Rock', 'Bold', 'hp248 def252 spd8', ['remover', 'sun-setter', 'wall', 'rocks']],
  ['Sun Support', 'RU', 'Stealth Rock/Lava Plume/Solar Beam/Rapid Spin', 'Drought', 'Heat Rock', 'Modest', 'hp252 spa252 def4', ['rocks', 'sun-setter']]]);
sp('vulpixalola', 'Vulpix-Alola', 37, ['Ice'], [38, 41, 40, 50, 65, 65], 100, 'common', 'medium-fast', 'vulpixalola', [['ninetalesalola', 36]], [
  ['Aurora Veil', 'LC', 'Aurora Veil/Freeze-Dry/Moonblast/Encore', 'Snow Warning', 'Light Clay', 'Timid', 'hp76 spa196 spe236', ['snow-setter', 'screens']]]);
sp('ninetalesalola', 'Ninetales-Alola', 38, ['Ice', 'Fairy'], [73, 67, 75, 81, 100, 109], 82, 'common', 'medium-fast', 'vulpixalola', [], [
  ['Aurora Veil', 'OU', 'Aurora Veil/Blizzard/Moonblast/Encore', 'Snow Warning', 'Light Clay', 'Timid', 'hp252 spa4 spe252', ['snow-setter', 'screens']]], 'vulpixalola');
sp('ferroseed', 'Ferroseed', 597, ['Grass', 'Steel'], [44, 50, 91, 24, 86, 10], 100, 'common', 'medium-fast', 'ferroseed', [['ferrothorn', 40]], [
  ['Generated', 'LC', 'Spikes/Leech Seed/Gyro Ball/Protect', 'Iron Barbs', 'Eviolite', 'Relaxed', 'hp236 def236', ['spikes', 'wall']]]);
sp('ferrothorn', 'Ferrothorn', 598, ['Grass', 'Steel'], [74, 94, 131, 54, 116, 20], 84, 'common', 'medium-fast', 'ferroseed', [], [
  ['Utility', 'OU', 'Spikes/Leech Seed/Power Whip/Knock Off', 'Iron Barbs', 'Leftovers', 'Relaxed', 'hp252 def88 spd168', ['spikes', 'wall']]], 'ferroseed');
sp('mareanie', 'Mareanie', 747, ['Poison', 'Water'], [50, 53, 62, 43, 52, 45], 100, 'common', 'medium-fast', 'mareanie', [['toxapex', 38]], [
  ['Generated', 'LC', 'Toxic Spikes/Recover/Haze/Knock Off', 'Regenerator', 'Eviolite', 'Bold', 'hp236 def236', ['wall', 'phazer']]]);
sp('toxapex', 'Toxapex', 748, ['Poison', 'Water'], [50, 63, 152, 53, 142, 35], 84, 'common', 'medium-fast', 'mareanie', [], [
  ['The Pex', 'OU', 'Toxic Spikes/Recover/Haze/Surf', 'Regenerator', 'Black Sludge', 'Bold', 'hp252 def252 spd4', ['phazer', 'spikes', 'wall']]], 'mareanie');
sp('chansey', 'Chansey', 113, ['Normal'], [250, 5, 5, 35, 105, 50], 88, 'common', 'fast', 'chansey', [['blissey', 36]], [
  ['Eviolite', 'UU', 'Seismic Toss/Soft-Boiled/Stealth Rock/Toxic', 'Natural Cure', 'Eviolite', 'Bold', 'hp4 def252 spd252', ['wall', 'rocks']]]);
sp('blissey', 'Blissey', 242, ['Normal'], [255, 10, 10, 75, 135, 55], 86, 'common', 'fast', 'chansey', [], [
  ['Special Wall', 'OU', 'Seismic Toss/Soft-Boiled/Teleport/Calm Mind', 'Natural Cure', 'Heavy-Duty Boots', 'Bold', 'hp252 def252 spd4', ['wall', 'pivot']]], 'chansey');
sp('skarmory', 'Skarmory', 227, ['Steel', 'Flying'], [65, 80, 140, 40, 70, 70], 84, 'common', 'slow', 'skarmory', [], [
  ['Physically Defensive', 'UU', 'Spikes/Whirlwind/Roost/Brave Bird', 'Sturdy', 'Rocky Helmet', 'Impish', 'hp252 def252 spe4', ['spikes', 'phazer', 'wall']],
  ['Defog', 'UU', 'Defog/Roost/Body Press/Iron Defense', 'Sturdy', 'Leftovers', 'Impish', 'hp252 def252 spe4', ['remover', 'wall']]]);
sp('gligar', 'Gligar', 207, ['Ground', 'Flying'], [65, 75, 105, 35, 65, 85], 92, 'common', 'medium-slow', 'gligar', [['gliscor', 36]], [
  ['Eviolite', 'NFE', 'Earthquake/U-turn/Roost/Stealth Rock', 'Hyper Cutter', 'Eviolite', 'Impish', 'hp252 def252 spe4', ['rocks', 'pivot', 'wall']]]);
sp('gliscor', 'Gliscor', 472, ['Ground', 'Flying'], [75, 95, 125, 45, 75, 95], 80, 'common', 'medium-slow', 'gligar', [], [
  ['Defensive', 'OU', 'Earthquake/Knock Off/Spikes/Protect', 'Poison Heal', 'Toxic Orb', 'Impish', 'hp244 def12 spd252', ['spikes', 'wall']],
  ['Stealth Rock', 'OU', 'Stealth Rock/Earthquake/U-turn/Protect', 'Poison Heal', 'Toxic Orb', 'Careful', 'hp244 spd252 spe12', ['rocks', 'pivot', 'wall']]], 'gligar');
sp('clefairy', 'Clefairy', 35, ['Fairy'], [70, 45, 48, 60, 65, 35], 100, 'common', 'fast', 'clefairy', [['clefable', 36]], [
  ['Eviolite', 'NFE', 'Moonblast/Moonlight/Stealth Rock/Knock Off', 'Magic Guard', 'Eviolite', 'Bold', 'hp252 def252 spd4', ['wall', 'rocks']]]);
sp('clefable', 'Clefable', 36, ['Fairy'], [95, 70, 73, 95, 90, 60], 84, 'common', 'fast', 'clefairy', [], [
  ['Unaware', 'OU', 'Moonblast/Moonlight/Stealth Rock/Knock Off', 'Unaware', 'Leftovers', 'Bold', 'hp252 def252 spd4', ['wall', 'rocks']],
  ['Calm Mind', 'OU', 'Calm Mind/Moonblast/Flamethrower/Moonlight', 'Magic Guard', 'Life Orb', 'Bold', 'hp252 def252 spe4', ['sweeper']]], 'clefairy');
sp('foongus', 'Foongus', 590, ['Grass', 'Poison'], [69, 55, 45, 55, 55, 15], 100, 'common', 'medium-fast', 'foongus', [['amoonguss', 39]], [
  ['Generated', 'LC', 'Spore/Giga Drain/Sludge Bomb/Clear Smog', 'Regenerator', 'Eviolite', 'Bold', 'hp236 def236', ['wall', 'pivot']]]);
sp('amoonguss', 'Amoonguss', 591, ['Grass', 'Poison'], [114, 85, 70, 85, 80, 30], 86, 'common', 'medium-fast', 'foongus', [], [
  ['Regenerator', 'UU', 'Spore/Giga Drain/Sludge Bomb/Clear Smog', 'Regenerator', 'Black Sludge', 'Bold', 'hp252 def252 spd4', ['wall', 'pivot', 'phazer']]], 'foongus');
sp('horsea', 'Horsea', 116, ['Water'], [30, 40, 70, 70, 25, 60], 100, 'common', 'medium-fast', 'horsea', [['seadra', 32]], [
  ['Generated', 'LC', 'Hydro Pump/Draco Meteor/Ice Beam/Flip Turn', 'Swift Swim', 'Eviolite', 'Modest', 'spa236 spe236', ['rain-abuser', 'attacker']]]);
sp('seadra', 'Seadra', 117, ['Water'], [55, 65, 95, 95, 45, 85], 96, 'common', 'medium-fast', 'horsea', [['kingdra', 48]], [
  ['Generated', 'NFE', 'Hydro Pump/Draco Meteor/Ice Beam/Flip Turn', 'Swift Swim', 'Eviolite', 'Modest', 'spa252 spd4 spe252', ['rain-abuser', 'attacker']]], 'horsea');
sp('kingdra', 'Kingdra', 230, ['Water', 'Dragon'], [75, 95, 95, 95, 95, 85], 85, 'common', 'medium-fast', 'horsea', [], [
  ['Rain Sweeper', 'UU', 'Hydro Pump/Draco Meteor/Hurricane/Rain Dance', 'Swift Swim', 'Choice Specs', 'Modest', 'spa252 spd4 spe252', ['rain-abuser', 'wallbreaker']],
  ['Dragon Dance', 'RU', 'Dragon Dance/Waterfall/Outrage/Iron Head', 'Sniper', 'Life Orb', 'Adamant', 'atk252 spd4 spe252', ['sweeper', 'rain-abuser']]], 'seadra');
sp('bulbasaur', 'Bulbasaur', 1, ['Grass', 'Poison'], [45, 49, 49, 65, 65, 45], 100, 'common', 'medium-slow', 'bulbasaur', [['ivysaur', 16]], [
  ['Generated', 'LC', 'Giga Drain/Sludge Bomb/Sleep Powder/Growth', 'Chlorophyll', 'Eviolite', 'Modest', 'spa236 spe236', ['sun-abuser', 'attacker']]]);
sp('ivysaur', 'Ivysaur', 2, ['Grass', 'Poison'], [60, 62, 63, 80, 80, 60], 96, 'common', 'medium-slow', 'bulbasaur', [['venusaur', 32]], [
  ['Generated', 'NFE', 'Giga Drain/Sludge Bomb/Sleep Powder/Growth', 'Chlorophyll', 'Eviolite', 'Modest', 'spa252 spd4 spe252', ['sun-abuser', 'attacker']]], 'bulbasaur');
sp('venusaur', 'Venusaur', 3, ['Grass', 'Poison'], [80, 82, 83, 100, 100, 80], 85, 'common', 'medium-slow', 'bulbasaur', [], [
  ['Sun Sweeper', 'RU', 'Growth/Giga Drain/Weather Ball/Sludge Bomb', 'Chlorophyll', 'Life Orb', 'Modest', 'spa252 spd4 spe252', ['sun-abuser', 'sweeper']],
  ['Bulky', 'UU', 'Giga Drain/Sludge Bomb/Leech Seed/Synthesis', 'Overgrow', 'Black Sludge', 'Bold', 'hp252 def252 spd4', ['wall']]], 'ivysaur');
sp('snover', 'Snover', 459, ['Grass', 'Ice'], [60, 62, 50, 62, 60, 40], 100, 'common', 'slow', 'snover', [['abomasnow', 40]], [
  ['Generated', 'LC', 'Blizzard/Giga Drain/Ice Shard/Aurora Veil', 'Snow Warning', 'Eviolite', 'Modest', 'hp236 spa236', ['snow-setter', 'screens']]]);
sp('abomasnow', 'Abomasnow', 460, ['Grass', 'Ice'], [90, 92, 75, 92, 85, 60], 86, 'common', 'slow', 'snover', [], [
  ['Aurora Veil', 'RU', 'Aurora Veil/Blizzard/Wood Hammer/Ice Shard', 'Snow Warning', 'Light Clay', 'Lonely', 'atk252 spa4 spe252', ['snow-setter', 'screens', 'snow-abuser']]], 'snover');
sp('cetoddle', 'Cetoddle', 974, ['Ice'], [108, 68, 45, 30, 40, 43], 100, 'common', 'medium-fast', 'cetoddle', [['cetitan', 36]], [
  ['Generated', 'LC', 'Icicle Crash/Earthquake/Ice Shard/Belly Drum', 'Slush Rush', 'Eviolite', 'Adamant', 'atk236 spe236', ['snow-abuser', 'sweeper']]]);
sp('cetitan', 'Cetitan', 975, ['Ice'], [170, 113, 65, 45, 55, 73], 88, 'common', 'medium-fast', 'cetoddle', [], [
  ['Belly Drum', 'RU', 'Belly Drum/Icicle Crash/Earthquake/Ice Shard', 'Slush Rush', 'Sitrus Berry', 'Adamant', 'atk252 spd4 spe252', ['snow-abuser', 'sweeper']]], 'cetoddle');
sp('scyther', 'Scyther', 123, ['Bug', 'Flying'], [70, 110, 80, 55, 80, 105], 90, 'common', 'medium-fast', 'scyther', [['scizor', 36]], [
  ['Eviolite', 'NFE', 'U-turn/Close Combat/Dual Wingbeat/Swords Dance', 'Technician', 'Eviolite', 'Jolly', 'atk252 spd4 spe252', ['pivot', 'sweeper']]]);
sp('scizor', 'Scizor', 212, ['Bug', 'Steel'], [70, 130, 100, 55, 80, 65], 82, 'common', 'medium-fast', 'scyther', [], [
  ['Choice Band', 'OU', 'Bullet Punch/U-turn/Close Combat/Knock Off', 'Technician', 'Choice Band', 'Adamant', 'hp248 atk252 spd8', ['pivot', 'wallbreaker', 'attacker']],
  ['Swords Dance', 'UU', 'Swords Dance/Bullet Punch/Close Combat/Roost', 'Technician', 'Leftovers', 'Adamant', 'hp248 atk252 spd8', ['sweeper']]], 'scyther');
sp('marill', 'Marill', 183, ['Water', 'Fairy'], [70, 20, 50, 20, 50, 40], 100, 'common', 'fast', 'marill', [['azumarill', 18]], [
  ['Generated', 'LC', 'Aqua Jet/Play Rough/Knock Off/Belly Drum', 'Huge Power', 'Eviolite', 'Adamant', 'hp236 atk236', ['attacker', 'rain-abuser']]]);
sp('azumarill', 'Azumarill', 184, ['Water', 'Fairy'], [100, 50, 80, 60, 80, 50], 82, 'common', 'fast', 'marill', [], [
  ['Belly Drum', 'UU', 'Belly Drum/Aqua Jet/Play Rough/Knock Off', 'Huge Power', 'Sitrus Berry', 'Adamant', 'hp252 atk252 spd4', ['sweeper', 'rain-abuser']],
  ['Choice Band', 'UU', 'Aqua Jet/Liquidation/Play Rough/Knock Off', 'Huge Power', 'Choice Band', 'Adamant', 'hp252 atk252 spd4', ['wallbreaker', 'attacker']]], 'marill');
sp('riolu', 'Riolu', 447, ['Fighting'], [40, 70, 40, 35, 40, 60], 100, 'common', 'medium-slow', 'riolu', [['lucario', 36]], [
  ['Generated', 'LC', 'Close Combat/Crunch/Copycat/Swords Dance', 'Prankster', 'Eviolite', 'Jolly', 'atk236 spe236', ['attacker']]]);
sp('lucario', 'Lucario', 448, ['Fighting', 'Steel'], [70, 110, 70, 115, 70, 90], 86, 'common', 'medium-slow', 'riolu', [], [
  ['Swords Dance', 'UU', 'Swords Dance/Close Combat/Meteor Mash/Extreme Speed', 'Justified', 'Life Orb', 'Adamant', 'atk252 spd4 spe252', ['sweeper']],
  ['Nasty Plot', 'RU', 'Nasty Plot/Aura Sphere/Flash Cannon/Vacuum Wave', 'Inner Focus', 'Life Orb', 'Timid', 'spa252 spd4 spe252', ['sweeper', 'wallbreaker']]], 'riolu');
sp('gastly', 'Gastly', 92, ['Ghost', 'Poison'], [30, 35, 30, 100, 35, 80], 100, 'common', 'medium-slow', 'gastly', [['haunter', 25]], [
  ['Generated', 'LC', 'Shadow Ball/Sludge Bomb/Dazzling Gleam/Trick', 'Levitate', 'Choice Scarf', 'Timid', 'spa236 spe236', ['attacker', 'wallbreaker']]]);
sp('haunter', 'Haunter', 93, ['Ghost', 'Poison'], [45, 50, 45, 115, 55, 95], 94, 'common', 'medium-slow', 'gastly', [['gengar', 40]], [
  ['Generated', 'NFE', 'Shadow Ball/Sludge Bomb/Focus Blast/Nasty Plot', 'Levitate', 'Eviolite', 'Timid', 'spa252 spd4 spe252', ['attacker', 'sweeper']]], 'gastly');
sp('gengar', 'Gengar', 94, ['Ghost', 'Poison'], [60, 65, 60, 130, 75, 110], 82, 'common', 'medium-slow', 'gastly', [], [
  ['Nasty Plot', 'UU', 'Nasty Plot/Shadow Ball/Sludge Wave/Focus Blast', 'Cursed Body', 'Life Orb', 'Timid', 'spa252 spd4 spe252', ['sweeper', 'wallbreaker']],
  ['Choice Scarf', 'UU', 'Shadow Ball/Sludge Wave/Focus Blast/Trick', 'Cursed Body', 'Choice Scarf', 'Timid', 'spa252 spd4 spe252', ['attacker']]], 'haunter');
sp('sneasel', 'Sneasel', 215, ['Dark', 'Ice'], [55, 95, 55, 35, 75, 115], 92, 'common', 'medium-slow', 'sneasel', [['weavile', 36]], [
  ['Generated', 'NFE', 'Triple Axel/Knock Off/Ice Shard/Swords Dance', 'Inner Focus', 'Eviolite', 'Jolly', 'atk252 spd4 spe252', ['attacker', 'snow-abuser']]]);
sp('weavile', 'Weavile', 461, ['Dark', 'Ice'], [70, 120, 65, 45, 85, 125], 82, 'common', 'medium-slow', 'sneasel', [], [
  ['Swords Dance', 'OU', 'Swords Dance/Triple Axel/Knock Off/Ice Shard', 'Pressure', 'Heavy-Duty Boots', 'Jolly', 'atk252 spd4 spe252', ['sweeper', 'snow-abuser']],
  ['Choice Band', 'UU', 'Triple Axel/Knock Off/Ice Shard/Low Kick', 'Pressure', 'Choice Band', 'Jolly', 'atk252 spd4 spe252', ['attacker', 'wallbreaker']]], 'sneasel');
sp('grimmsnarl', 'Grimmsnarl', 861, ['Dark', 'Fairy'], [95, 120, 65, 95, 75, 60], 84, 'common', 'medium-slow', 'grimmsnarl', [], [
  ['Dual Screens', 'UU', 'Reflect/Light Screen/Spirit Break/Thunder Wave', 'Prankster', 'Light Clay', 'Careful', 'hp252 def4 spd252', ['screens']]]);
sp('forretress', 'Forretress', 205, ['Bug', 'Steel'], [75, 90, 140, 60, 60, 40], 88, 'common', 'medium-fast', 'forretress', [], [
  ['Hazard Setter', 'RU', 'Spikes/Stealth Rock/Rapid Spin/Volt Switch', 'Sturdy', 'Leftovers', 'Relaxed', 'hp252 def252 spd4', ['spikes', 'rocks', 'remover', 'pivot']]]);

export const FIXTURE_CATALOG: Catalog = {version: 'fixture-1', species};
