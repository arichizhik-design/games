// Everything you can win and fight: weapons, armor, pets, eggs, treasure chests, bosses and the riddle scrolls.
'use strict';

const RARITY = {
  Starter: '#b9b0d8', Common: '#f0f0f0', Uncommon: '#6be06b', Rare: '#4aa8ff', Epic: '#c07bff', Legendary: '#ffcf4a', Mythic: '#ff5a8a',
};

// melee weapons swing, guns shoot
const WEAPONS = {
  bat:      { name: 'Baseball Bat',  kind: 'melee', dmg: 5,  cd: 0.42, reach: 2.7, rarity: 'Starter',   icon: ['#7a5230', '#c9955a'] },
  stone:    { name: 'Stone Sword',   kind: 'melee', dmg: 8,  cd: 0.40, reach: 2.8, rarity: 'Common',    icon: ['#6b4a2b', '#a8a8a8'] },
  iron:     { name: 'Iron Sword',    kind: 'melee', dmg: 11, cd: 0.38, reach: 2.9, rarity: 'Uncommon',  icon: ['#6b4a2b', '#e6e8ee'] },
  spear:    { name: 'Stinger Spear', kind: 'melee', dmg: 14, cd: 0.45, reach: 3.9, rarity: 'Rare',      icon: ['#7a5230', '#ff9a3a'] },
  gold:     { name: 'Golden Sword',  kind: 'melee', dmg: 16, cd: 0.36, reach: 2.9, rarity: 'Rare',      icon: ['#6b4a2b', '#ffd24a'] },
  trident:  { name: 'Trident',       kind: 'melee', dmg: 20, cd: 0.42, reach: 3.9, rarity: 'Epic',      icon: ['#2a6a7a', '#5ff0e6'] },
  diamond:  { name: 'Diamond Sword', kind: 'melee', dmg: 24, cd: 0.34, reach: 3.0, rarity: 'Epic',      icon: ['#3a2a1a', '#8ff7ff'] },
  blaster:  { name: 'Blaster',       kind: 'gun', dmg: 7,  cd: 0.22, speed: 34, rarity: 'Rare',      color: 0xff5a3c, icon: ['#555', '#ff5a3c'] },
  laser:    { name: 'Laser Gun',     kind: 'gun', dmg: 11, cd: 0.2,  speed: 48, rarity: 'Epic',      color: 0x4aff7a, icon: ['#444', '#4aff7a'] },
  plasma:   { name: 'Plasma Cannon', kind: 'gun', dmg: 22, cd: 0.38, speed: 30, rarity: 'Legendary', color: 0x7a7bff, icon: ['#333', '#7a7bff'] },
  rainbow:  { name: 'Rainbow Ray',   kind: 'gun', dmg: 30, cd: 0.18, speed: 55, rarity: 'Mythic',    color: 0xffffff, icon: ['#222', 'rainbow'] },
};
const WEAPON_ORDER = ['bat', 'stone', 'iron', 'spear', 'gold', 'trident', 'diamond', 'blaster', 'laser', 'plasma', 'rainbow'];

const ARMORS = [
  { name: 'No armor',      block: 0,    color: 0,        rarity: 'Common' },
  { name: 'Leather Armor', block: 0.2,  color: 0x8a5a32, rarity: 'Common' },
  { name: 'Iron Armor',    block: 0.35, color: 0xd0d4dc, rarity: 'Uncommon' },
  { name: 'Golden Armor',  block: 0.45, color: 0xffd24a, rarity: 'Rare' },
  { name: 'Diamond Armor', block: 0.6,  color: 0x8ff7ff, rarity: 'Epic' },
  { name: 'Crystal Armor', block: 0.7,  color: 0xb77bff, rarity: 'Legendary' },
];

// pets: speed is how fast they run when you ride them (you run at 5.5)
const PET_SPECIES = {
  turtle:   { name: 'Pebble the Turtle', rarity: 'Starter',  speed: 7,    shape: 'turtle', scale: 1.05, c: { shell: 0x6b8a3a, top: 0x4f6b2a, skin: 0x8cc65a, belly: 0xd8c87a } },
  bunny:    { name: 'Forest Bunny',      rarity: 'Common',   speed: 9,    shape: 'bunny',  scale: 1.25, c: { body: 0xa8825a, ear: 0xf0b0b8, nose: 0xff9ab0 } },
  fox:      { name: 'Red Fox',           rarity: 'Uncommon', speed: 10.5, shape: 'quad',   scale: 1.15, c: { body: 0xe8782a, belly: 0xfff1e0, ear: 0x3a2010, tip: 0xffffff } },
  fawn:     { name: 'Baby Deer',         rarity: 'Rare',     speed: 12,   shape: 'deer',   scale: 1.0,  c: { body: 0xb0743a, belly: 0xf0dcc0, spot: 0xfff4e0, antler: 0xe8d8b0 } },
  camel:    { name: 'Camel',             rarity: 'Common',   speed: 11,   shape: 'quad',   scale: 1.35, hump: true, c: { body: 0xd2a462, belly: 0xe8c890, ear: 0xa07a40, tip: 0xa07a40 } },
  fennec:   { name: 'Fennec Fox',        rarity: 'Uncommon', speed: 12.5, shape: 'quad',   scale: 1.05, bigEars: true, c: { body: 0xf0d2a0, belly: 0xfff6e8, ear: 0xf0b890, tip: 0x5a3a20 } },
  scorplet: { name: 'Baby Scorpion',     rarity: 'Rare',     speed: 14,   shape: 'scorpion', scale: 0.5, c: { body: 0xd9822b, dark: 0x8a4a1a, sting: 0xffe08a } },
  dolphin:  { name: 'Dolphin',           rarity: 'Uncommon', speed: 13,   shape: 'fish',   scale: 1.2,  c: { body: 0x7aa8d8, belly: 0xe8f2ff, fin: 0x5a88b8 } },
  shark:    { name: 'Shark',             rarity: 'Rare',     speed: 15,   shape: 'fish',   scale: 1.4,  shark: true, c: { body: 0x7a8a9a, belly: 0xf0f0f0, fin: 0x5a6a7a } },
  squidlet: { name: 'Baby Squid',        rarity: 'Epic',     speed: 16,   shape: 'squid',  scale: 0.45, c: { body: 0xd84a7a, dark: 0x8a2a5a, eye: 0xffffff } },
  spider:   { name: 'Crystal Spider',    rarity: 'Epic',     speed: 18,   shape: 'spider', scale: 0.5, c: { body: 0x2a2440, leg: 0x3a3456, gem: 0x5ff0e6, eye: 0xff4a6a } },
  spiderGold:    { name: 'Gold Crystal Spider',    rarity: 'Legendary', speed: 20, shape: 'spider', scale: 0.52, mutation: 'Gold', c: { body: 0xc9961a, leg: 0xe0b030, gem: 0xfff07a, eye: 0xff4a6a } },
  spiderDiamond: { name: 'Diamond Crystal Spider', rarity: 'Legendary', speed: 22, shape: 'spider', scale: 0.54, mutation: 'Diamond', c: { body: 0x5ac8d8, leg: 0x8ff7ff, gem: 0xffffff, eye: 0x2a5aff } },
  spiderRainbow: { name: 'Rainbow Crystal Spider', rarity: 'Mythic',    speed: 25, shape: 'spider', scale: 0.56, mutation: 'Rainbow', rainbow: true, c: { body: 0xff5577, leg: 0x5ff0e6, gem: 0xffe95a, eye: 0xffffff } },
};

// each boss drops a better egg than the last
const EGGS = {
  forest:  { name: 'Forest Egg',  shell: 0xd8f0b8, spotA: 0x4f8a3a, spotB: 0xa8825a, odds: [['bunny', 50], ['fox', 35], ['fawn', 15]] },
  desert:  { name: 'Desert Egg',  shell: 0xf4e2b0, spotA: 0xd9822b, spotB: 0xc9961a, odds: [['camel', 45], ['fennec', 35], ['scorplet', 20]] },
  ocean:   { name: 'Ocean Egg',   shell: 0xc8ecff, spotA: 0x3a8ad8, spotB: 0xff7a9a, odds: [['dolphin', 45], ['shark', 35], ['squidlet', 20]] },
  crystal: { name: 'Crystal Egg', shell: 0xefe8ff, spotA: 0xb77bff, spotB: 0x5ff0e6, odds: [['spider', 80], ['spiderGold', 13], ['spiderDiamond', 6], ['spiderRainbow', 1]] },
};

// treasure chests: what can land under the red line, and how likely each is
// a prize is ['weapon', id] or ['armor', tier]
const CHESTS = {
  forest:  { name: 'Wooden Chest',  color: 0x9a6a30, prizes: [[['weapon', 'stone'], 40], [['armor', 1], 40], [['weapon', 'iron'], 12], [['armor', 2], 8]] },
  desert:  { name: 'Sandstone Chest', color: 0xd8b878, prizes: [[['weapon', 'iron'], 30], [['armor', 2], 30], [['weapon', 'spear'], 20], [['armor', 3], 12], [['weapon', 'gold'], 8]] },
  ocean:   { name: 'Golden Chest',  color: 0xffcf4a, prizes: [[['weapon', 'gold'], 25], [['armor', 3], 25], [['weapon', 'trident'], 22], [['armor', 4], 13], [['weapon', 'diamond'], 10], [['weapon', 'blaster'], 5]] },
  crystal: { name: 'Crystal Chest', color: 0xb77bff, prizes: [[['weapon', 'blaster'], 55], [['weapon', 'laser'], 28], [['weapon', 'plasma'], 13], [['weapon', 'rainbow'], 4]] },
};

// the four bosses of World 1, in order
const BOSSES = {
  deer: {
    name: 'Giant Deer', cave: 'rabbit', egg: 'forest', chest: 'forest', hp: 160, mult: 1, speed: 3.2, radius: 2.3, height: 6,
    attacks: { charge: 3, stomp: 2, leap: 1 }, phase2: { leap: 2, rain: 2 }, rainColor: 0x6b4a2b, rainLabel: 'Acorns',
    scroll: 'Where the sun is hot and the sand blows high,\na cave hides under a dune, way out in the dry.\nNo boss is there... or so it seems.\nBut grab the egg and hear the sand scream!',
    nextLabel: 'Desert',
  },
  scorpion: {
    name: 'Sand Scorpion', cave: 'sand', egg: 'desert', chest: 'desert', hp: 320, mult: 1.5, speed: 3.6, radius: 2.4, height: 4,
    attacks: { pinch: 3, sting: 3, shots: 2, charge: 1 }, phase2: { burrow: 3 }, shotColor: 0xe0c070,
    scroll: 'Put on your mask and swim to the sea,\ndive down, down, as deep as can be.\nKeep sinking for thirty seconds or more,\na King sleeps in coral on the ocean floor.',
    nextLabel: 'Ocean dive spot',
  },
  squid: {
    name: 'King Squid', cave: 'coral', egg: 'ocean', chest: 'ocean', hp: 520, mult: 2, speed: 2.8, radius: 2.4, height: 6,
    attacks: { tentacles: 3, ink: 2, spin: 2 }, phase2: { tentacles: 2, rain: 1 }, shotColor: 0x1a1a2a, rainColor: 0x5ff0e6, rainLabel: 'Bubbles',
    scroll: 'Where the mountain glows purple and crystals grow,\nthere\'s a hole in the roof where the sunbeams go.\nThe last boss of this world waits up in the sky...\nIt has eight long legs and a hundred eyes!',
    nextLabel: 'Crystal Caves',
  },
  spider: {
    name: 'Crystal Spider', cave: 'crystal', egg: 'crystal', chest: 'crystal', hp: 900, mult: 2.3, speed: 4.2, radius: 2.6, height: 4.5,
    attacks: { leap: 3, web: 2, charge: 2, stomp: 1 }, phase2: { rain: 3, web: 1 }, shotColor: 0xf4f4ff, rainColor: 0xb77bff, rainLabel: 'Crystals',
    scroll: null, nextLabel: 'Rocket ship',
  },
};
const BOSS_ORDER = ['deer', 'scorpion', 'squid', 'spider'];

function weightedPick(list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of list) { r -= w; if (r < 0) return v; }
  return list[list.length - 1][0];
}
function oddsText(list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  return list.map(([v, w]) => [v, Math.round(w / total * 1000) / 10]);
}
