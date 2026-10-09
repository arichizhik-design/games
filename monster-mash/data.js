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
  spider:   { name: 'Crystal Spider',    rarity: 'Epic',     speed: 18,   shape: 'spider', scale: 3.4, c: { body: 0x2a2440, leg: 0x3a3456, gem: 0x5ff0e6, eye: 0xff4a6a } },
  spiderGold:    { name: 'Gold Crystal Spider',    rarity: 'Legendary', speed: 20, shape: 'spider', scale: 3.4, mutation: 'Gold', c: { body: 0xc9961a, leg: 0xe0b030, gem: 0xfff07a, eye: 0xff4a6a } },
  spiderDiamond: { name: 'Diamond Crystal Spider', rarity: 'Legendary', speed: 22, shape: 'spider', scale: 3.4, mutation: 'Diamond', c: { body: 0x5ac8d8, leg: 0x8ff7ff, gem: 0xffffff, eye: 0x2a5aff } },
  spiderRainbow: { name: 'Rainbow Crystal Spider', rarity: 'Mythic',    speed: 25, shape: 'spider', scale: 3.4, mutation: 'Rainbow', rainbow: true, c: { body: 0xff5577, leg: 0x5ff0e6, gem: 0xffe95a, eye: 0xffffff } },
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
const BOSS_BASE = {
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

// ---------- more loot for the other planets ----------
Object.assign(WEAPONS, {
  frostBlade:   { name: 'Frost Blade',    kind: 'melee', dmg: 30, cd: 0.34, reach: 3.1, rarity: 'Epic',      icon: ['#3a5a7a', '#bfeeff'] },
  iceHammer:    { name: 'Ice Hammer',     kind: 'melee', dmg: 38, cd: 0.46, reach: 3.3, rarity: 'Legendary', icon: ['#3a5a7a', '#7ad8ff'] },
  iceCannon:    { name: 'Ice Cannon',     kind: 'gun', dmg: 34, cd: 0.32, speed: 36, rarity: 'Legendary', color: 0x9ae8ff, icon: ['#446', '#9ae8ff'] },
  blizzard:     { name: 'Blizzard Ray',   kind: 'gun', dmg: 46, cd: 0.18, speed: 55, rarity: 'Mythic',    color: 0xe8fbff, icon: ['#335', '#e8fbff'] },
  lavaSword:    { name: 'Lava Sword',     kind: 'melee', dmg: 55, cd: 0.34, reach: 3.1, rarity: 'Legendary', icon: ['#3a1a10', '#ff7a2a'] },
  magmaAxe:     { name: 'Magma Axe',      kind: 'melee', dmg: 72, cd: 0.44, reach: 3.4, rarity: 'Mythic',    icon: ['#3a1a10', '#ffb02a'] },
  lavaLauncher: { name: 'Lava Launcher',  kind: 'gun', dmg: 66, cd: 0.3, speed: 34, rarity: 'Legendary', color: 0xff6a2a, icon: ['#432', '#ff6a2a'] },
  sunBeam:      { name: 'Sun Beam',       kind: 'gun', dmg: 92, cd: 0.16, speed: 60, rarity: 'Mythic',    color: 0xfff07a, icon: ['#432', '#fff07a'] },
});
WEAPON_ORDER.push('frostBlade', 'iceHammer', 'lavaSword', 'magmaAxe', 'iceCannon', 'blizzard', 'lavaLauncher', 'sunBeam');
ARMORS.push(
  { name: 'Frost Armor', block: 0.75, color: 0xbfeeff, rarity: 'Legendary' },
  { name: 'Lava Armor',  block: 0.82, color: 0xff6a2a, rarity: 'Mythic' },
);

// pets for the other planets: same shapes, new colours, much faster
const PLANET_PETS = {
  snowBunny:   ['Snow Bunny', 'Common', 20, 'bunny', 1.25, { body: 0xf4f8ff, ear: 0x9ad8ff, nose: 0xff9ab0 }],
  arcticFox:   ['Arctic Fox', 'Uncommon', 22, 'quad', 1.15, { body: 0xf0f4f8, belly: 0xffffff, ear: 0xc8d8e8, tip: 0xffffff }],
  iceFawn:     ['Ice Fawn', 'Rare', 24, 'deer', 1.0, { body: 0xbfd8ee, belly: 0xffffff, spot: 0x7ad8ff, antler: 0x9ae8ff }],
  polarBear:   ['Polar Bear', 'Common', 23, 'quad', 1.6, { body: 0xf4f4ee, belly: 0xe8e8e0, ear: 0xd8d8d0, tip: 0xf4f4ee }],
  snowFennec:  ['Snow Fennec', 'Uncommon', 25, 'quad', 1.05, { body: 0xffffff, belly: 0xf4f8ff, ear: 0xbfe0f0, tip: 0x9ad8ff }, { bigEars: true }],
  iceScorplet: ['Ice Scorpion', 'Rare', 27, 'scorpion', 0.55, { body: 0x8ad0f0, dark: 0x3a7ab0, sting: 0xffffff }],
  narwhal:     ['Narwhal', 'Uncommon', 26, 'fish', 1.3, { body: 0x8a9aaa, belly: 0xe8eef4, fin: 0x6a7a8a }],
  orca:        ['Orca', 'Rare', 28, 'fish', 1.5, { body: 0x1a1a22, belly: 0xffffff, fin: 0x1a1a22 }, { shark: true }],
  iceSquidlet: ['Ice Squid', 'Epic', 30, 'squid', 0.5, { body: 0x7ab8f0, dark: 0x3a6ab0, eye: 0xffffff }],
  frostSpider:        ['Frost Spider', 'Epic', 32, 'spider', 3.4, { body: 0xd8ecff, leg: 0x9ac8f0, gem: 0x5ff0e6, eye: 0x2a5aff }],
  frostSpiderGold:    ['Gold Frost Spider', 'Legendary', 35, 'spider', 3.45, { body: 0xc9961a, leg: 0xf0d070, gem: 0xbfeeff, eye: 0x2a5aff }, { mutation: 'Gold' }],
  frostSpiderDiamond: ['Diamond Frost Spider', 'Legendary', 38, 'spider', 3.5, { body: 0x8ff7ff, leg: 0xffffff, gem: 0xffffff, eye: 0x2a5aff }, { mutation: 'Diamond' }],
  frostSpiderRainbow: ['Rainbow Frost Spider', 'Mythic', 42, 'spider', 3.55, { body: 0xff5577, leg: 0x5ff0e6, gem: 0xffe95a, eye: 0xffffff }, { mutation: 'Rainbow', rainbow: true }],
  lavaBunny:   ['Ember Bunny', 'Common', 30, 'bunny', 1.25, { body: 0x3a2a2a, ear: 0xff7a2a, nose: 0xff7a2a }],
  fireFox:     ['Fire Fox', 'Uncommon', 32, 'quad', 1.15, { body: 0xff4a1a, belly: 0xffb02a, ear: 0x3a1a10, tip: 0xfff07a, eye: 0xfff07a }],
  fireFawn:    ['Fire Fawn', 'Rare', 34, 'deer', 1.0, { body: 0x5a2a1a, belly: 0xff9a4a, spot: 0xffd04a, antler: 0xff7a2a }],
  magmaCamel:  ['Magma Camel', 'Common', 33, 'quad', 1.35, { body: 0x8a3a1a, belly: 0xc85a2a, ear: 0x5a2a1a, tip: 0xff7a2a }, { hump: true }],
  emberFennec: ['Ember Fennec', 'Uncommon', 36, 'quad', 1.05, { body: 0xffb04a, belly: 0xfff0c0, ear: 0xff6a2a, tip: 0x3a1a10 }, { bigEars: true }],
  magmaScorplet: ['Magma Scorpion', 'Rare', 38, 'scorpion', 0.55, { body: 0x2a1a1a, dark: 0xff5a1a, sting: 0xfff07a }],
  lavaDolphin: ['Lava Dolphin', 'Uncommon', 37, 'fish', 1.3, { body: 0xff7a2a, belly: 0xfff0c0, fin: 0xc84a1a }],
  lavaShark:   ['Lava Shark', 'Rare', 40, 'fish', 1.5, { body: 0x3a2a2a, belly: 0xff9a4a, fin: 0xff5a1a }, { shark: true }],
  magmaSquidlet: ['Magma Squid', 'Epic', 42, 'squid', 0.5, { body: 0xff6a2a, dark: 0x8a2a10, eye: 0xfff07a }],
  infernoSpider:        ['Inferno Spider', 'Epic', 45, 'spider', 3.4, { body: 0x2a1410, leg: 0x5a2a1a, gem: 0xff7a2a, eye: 0xfff07a }],
  infernoSpiderGold:    ['Gold Inferno Spider', 'Legendary', 48, 'spider', 3.45, { body: 0xc9961a, leg: 0xffd04a, gem: 0xff7a2a, eye: 0xff2a2a }, { mutation: 'Gold' }],
  infernoSpiderDiamond: ['Diamond Inferno Spider', 'Legendary', 52, 'spider', 3.5, { body: 0x8ff7ff, leg: 0xffffff, gem: 0xff7a2a, eye: 0xff2a2a }, { mutation: 'Diamond' }],
  infernoSpiderRainbow: ['Rainbow Inferno Spider', 'Mythic', 58, 'spider', 3.55, { body: 0xff5577, leg: 0x5ff0e6, gem: 0xffe95a, eye: 0xffffff }, { mutation: 'Rainbow', rainbow: true }],
};
for (const [id, [name, rarity, speed, shape, scale, c, extra]] of Object.entries(PLANET_PETS))
  PET_SPECIES[id] = Object.assign({ name, rarity, speed, shape, scale, c }, extra || {});

Object.assign(EGGS, {
  forest2:  { name: 'Snow Egg',      shell: 0xf4f8ff, spotA: 0x9ad8ff, spotB: 0xc8d8e8, odds: [['snowBunny', 50], ['arcticFox', 35], ['iceFawn', 15]] },
  desert2:  { name: 'Glacier Egg',   shell: 0xd8f0ff, spotA: 0x3a7ab0, spotB: 0xffffff, odds: [['polarBear', 45], ['snowFennec', 35], ['iceScorplet', 20]] },
  ocean2:   { name: 'Frozen Sea Egg', shell: 0xbfe0f8, spotA: 0x1a1a22, spotB: 0x7ab8f0, odds: [['narwhal', 45], ['orca', 35], ['iceSquidlet', 20]] },
  crystal2: { name: 'Frost Crystal Egg', shell: 0xe8f4ff, spotA: 0x5ff0e6, spotB: 0x2a5aff, odds: [['frostSpider', 80], ['frostSpiderGold', 13], ['frostSpiderDiamond', 6], ['frostSpiderRainbow', 1]] },
  forest3:  { name: 'Ember Egg',     shell: 0x5a3a2a, spotA: 0xff7a2a, spotB: 0xffd04a, odds: [['lavaBunny', 50], ['fireFox', 35], ['fireFawn', 15]] },
  desert3:  { name: 'Magma Egg',     shell: 0x8a3a1a, spotA: 0xff5a1a, spotB: 0xfff07a, odds: [['magmaCamel', 45], ['emberFennec', 35], ['magmaScorplet', 20]] },
  ocean3:   { name: 'Boiling Sea Egg', shell: 0xffb04a, spotA: 0xc84a1a, spotB: 0x3a2a2a, odds: [['lavaDolphin', 45], ['lavaShark', 35], ['magmaSquidlet', 20]] },
  crystal3: { name: 'Inferno Egg',   shell: 0x2a1410, spotA: 0xff7a2a, spotB: 0xfff07a, odds: [['infernoSpider', 80], ['infernoSpiderGold', 13], ['infernoSpiderDiamond', 6], ['infernoSpiderRainbow', 1]] },
});
Object.assign(CHESTS, {
  forest2:  { name: 'Ice Chest',      color: 0xbfe0f8, prizes: [[['weapon', 'diamond'], 35], [['armor', 4], 35], [['weapon', 'frostBlade'], 20], [['armor', 5], 10]] },
  desert2:  { name: 'Glacier Chest',  color: 0x8ad0f0, prizes: [[['weapon', 'frostBlade'], 30], [['armor', 5], 30], [['weapon', 'laser'], 20], [['weapon', 'iceHammer'], 12], [['armor', 6], 8]] },
  ocean2:   { name: 'Frozen Chest',   color: 0x7ab8f0, prizes: [[['weapon', 'iceHammer'], 25], [['armor', 6], 25], [['weapon', 'plasma'], 20], [['weapon', 'iceCannon'], 20], [['weapon', 'rainbow'], 10]] },
  crystal2: { name: 'Snow Queen Chest', color: 0xe8f4ff, prizes: [[['weapon', 'iceCannon'], 55], [['weapon', 'rainbow'], 28], [['weapon', 'blizzard'], 17]] },
  forest3:  { name: 'Ember Chest',    color: 0x5a3a2a, prizes: [[['weapon', 'iceHammer'], 35], [['armor', 6], 35], [['weapon', 'lavaSword'], 20], [['armor', 7], 10]] },
  desert3:  { name: 'Magma Chest',    color: 0x8a3a1a, prizes: [[['weapon', 'lavaSword'], 30], [['armor', 7], 30], [['weapon', 'blizzard'], 20], [['weapon', 'magmaAxe'], 20]] },
  ocean3:   { name: 'Boiling Chest',  color: 0xc84a1a, prizes: [[['weapon', 'magmaAxe'], 35], [['weapon', 'blizzard'], 25], [['weapon', 'lavaLauncher'], 30], [['weapon', 'sunBeam'], 10]] },
  crystal3: { name: 'Inferno Chest',  color: 0xff7a2a, prizes: [[['weapon', 'lavaLauncher'], 60], [['weapon', 'sunBeam'], 40]] },
});

// ---------- planets ----------
// each planet has the same kinds of places (a village, woods, a desert, a sea and crystal caves) in new spots,
// with tougher bosses and better loot. hp/dmg multiply the base boss numbers.
const PLANETS = {
  island: {
    name: 'The Island', world: 1, blurb: 'Grassy forests, a sandy desert, the ocean and the Crystal Caves.',
    hp: 1, dmg: 1, coins: 1, suffix: '',
    places: { rabbit: 'Forest', sand: 'Desert', dive: 'Ocean', crystal: 'Crystal Caves' },
    bossNames: { deer: 'Giant Deer', scorpion: 'Sand Scorpion', squid: 'King Squid', spider: 'Crystal Spider' },
  },
  frost: {
    name: 'Frost Planet', world: 2, blurb: 'Snowy pine woods, an ice field, a frozen sea and the Ice Caves.',
    hp: 3, dmg: 1.8, coins: 2.5, suffix: '2',
    places: { rabbit: 'Pine Woods', sand: 'Ice Field', dive: 'Frozen Sea', crystal: 'Ice Caves' },
    bossNames: { deer: 'Frost Stag', scorpion: 'Glacier Scorpion', squid: 'Ice Kraken', spider: 'Snow Queen Spider' },
    scrolls: {
      deer: 'Out where the snow turns to sheets of ice,\na cave hides a beast that isn\'t nice.\nYou\'ll find an egg and no one there...\nbut pick it up, and then beware!',
      scorpion: 'Dive through the cold where the frozen sea ends,\nsink thirty seconds with your whale friends.\nA kraken sleeps on a throne of gold,\nso grab its egg and be brave and bold.',
      squid: 'Ice Caves glitter under a hole in the sky,\nthe Snow Queen waits on her web up high.\nShe\'s the strongest of all on this frozen land,\nso bring your best weapon in your hand!',
    },
  },
  lava: {
    name: 'Lava Planet', world: 3, blurb: 'Burnt ash woods, a red desert, a boiling sea and the Fire Caves.',
    hp: 7, dmg: 3, coins: 5, suffix: '3',
    places: { rabbit: 'Ash Woods', sand: 'Red Desert', dive: 'Boiling Sea', crystal: 'Fire Caves' },
    bossNames: { deer: 'Fire Stag', scorpion: 'Magma Scorpion', squid: 'Lava Kraken', spider: 'Inferno Spider' },
    scrolls: {
      deer: 'Where red sand burns and the hot wind blows,\na lava tube hides what nobody knows.\nTake the egg, then walk away...\nthe ground will shake and ruin your day!',
      scorpion: 'The sea out here is bubbling hot,\ndive down deep, it\'s your only shot.\nPast the whales a kraken sleeps,\non a golden throne way down deep.',
      squid: 'The Fire Caves burn with a hole in the roof,\nthe Inferno Spider waits, and that\'s the truth.\nThe toughest boss in all the stars,\nbeat it and the galaxy\'s yours!',
    },
  },
};
const PLANET_ORDER = ['island', 'frost', 'lava'];
let PLANET = 'island';

// bosses for a planet: same moves, new names, much tougher
let BOSSES = {};
function setPlanetBosses(pid) {
  const pl = PLANETS[pid];
  BOSSES = {};
  for (const id of BOSS_ORDER) {
    const base = BOSS_BASE[id];
    BOSSES[id] = Object.assign({}, base, {
      name: pl.bossNames[id], hp: Math.round(base.hp * pl.hp), mult: base.mult * pl.dmg,
      egg: base.egg + pl.suffix, chest: base.chest + pl.suffix, coins: Math.round([50, 100, 175, 300][BOSS_ORDER.indexOf(id)] * pl.coins),
      scroll: id === 'spider' ? null : (pl.scrolls ? pl.scrolls[id] : base.scroll),
    });
  }
}
setPlanetBosses('island');

// ---------- decorations for your house (sold in the village shop) ----------
const DECOR = [
  { id: 'flower', name: 'Flower Pot', price: 20 },
  { id: 'rug', name: 'Cozy Rug', price: 30 },
  { id: 'lamp', name: 'Lamp', price: 40 },
  { id: 'bookshelf', name: 'Bookshelf', price: 60 },
  { id: 'couch', name: 'Couch', price: 80 },
  { id: 'painting', name: 'Painting', price: 100 },
  { id: 'fishTank', name: 'Fish Tank', price: 150 },
  { id: 'tv', name: 'TV', price: 200 },
  { id: 'trophy', name: 'Trophy Case', price: 250 },
  { id: 'rainbowBed', name: 'Rainbow Bed', price: 300 },
  { id: 'statue', name: 'Gold Pet Statue', price: 400 },
  { id: 'disco', name: 'Disco Ball', price: 500 },
];
