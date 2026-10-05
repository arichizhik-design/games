// Shared game data, used by both the server (require) and the browser (window.GameData).
(function (root) {
  // growSec: how long a placed tub takes to grow before customers can buy it
  // stock: chance the shop has this rarity after a restock, and how many tubs
  const RARITIES = {
    common:    { name: 'Common',    color: '#b0b0b0', order: 0, growSec: 10,  stock: { chance: 1,    min: 5, max: 10 } },
    uncommon:  { name: 'Uncommon',  color: '#4caf50', order: 1, growSec: 30,  stock: { chance: 0.8,  min: 3, max: 6 } },
    rare:      { name: 'Rare',      color: '#2196f3', order: 2, growSec: 60,  stock: { chance: 0.6,  min: 2, max: 4 } },
    // the really good ones are really rare in the shop
    epic:      { name: 'Epic',      color: '#9c27b0', order: 3, growSec: 120, stock: { chance: 0.2,   min: 1, max: 2 } },
    legendary: { name: 'Legendary', color: '#ff9800', order: 4, growSec: 240, stock: { chance: 0.07,  min: 1, max: 1 } },
    mythic:    { name: 'Mythic',    color: '#f44336', order: 5, growSec: 420, stock: { chance: 0.02,  min: 1, max: 1 } },
    secret:    { name: 'Secret',    color: '#111111', order: 6, growSec: 600, stock: { chance: 0.004, min: 1, max: 1 } },
    // admin-only ice creams: never in the shop, only admins can give or spawn them
    admin:     { name: 'Admin',     color: '#e8a200', order: 7, growSec: 30,  stock: { chance: 0,     min: 0, max: 0 } },
    // pet-only rarities, even better than Secret
    // Celestial is also the rarity of Infinity Swirl (an admin-only ice cream)
    celestial: { name: 'Celestial', color: '#00b8d9', order: 8, growSec: 900, stock: { chance: 0, min: 0, max: 0 } },
    divine:    { name: 'Divine',    color: '#f5b700', order: 9, growSec: 0, stock: { chance: 0, min: 0, max: 0 } },
    infinity:  { name: 'Infinity',  color: '#d61fff', order: 10, growSec: 0, stock: { chance: 0, min: 0, max: 0 } },
  };

  // price = what a customer pays per scoop, cost = price of one tub in the shop
  // effect = special look (glow, flames, stars...) drawn on the scoop
  const FLAVORS = [
    { id: 'vanilla',     name: 'Vanilla',          rarity: 'common',    price: 2,    cost: 10,      color: '#fff3c4' },
    { id: 'chocolate',   name: 'Chocolate',        rarity: 'common',    price: 2,    cost: 10,      color: '#6b3e26' },
    { id: 'banana',      name: 'Banana',           rarity: 'common',    price: 2,    cost: 10,      color: '#ffe680' },
    { id: 'strawberry',  name: 'Strawberry',       rarity: 'uncommon',  price: 5,    cost: 50,      color: '#ff8fab' },
    { id: 'mint',        name: 'Mint Chip',        rarity: 'uncommon',  price: 6,    cost: 120,     color: '#a8e6cf', effect: 'frost' },
    { id: 'blueberry',   name: 'Blueberry',        rarity: 'uncommon',  price: 5.5,  cost: 80,      color: '#8a9ae6', effect: 'berries' },
    { id: 'cookiedough', name: 'Cookie Dough',     rarity: 'rare',      price: 14,   cost: 400,     color: '#e6c79c', effect: 'chips' },
    { id: 'cottoncandy', name: 'Cotton Candy',     rarity: 'rare',      price: 16,   cost: 800,     color: '#c3aed6', effect: 'fluff' },
    { id: 'bubblegum',   name: 'Bubblegum',        rarity: 'rare',      price: 15,   cost: 600,     color: '#ff9ecf', effect: 'bubble' },
    { id: 'rainbow',     name: 'Rainbow Sherbet',  rarity: 'epic',      price: 35,   cost: 2500,    color: '#ffb347', effect: 'sherbet' },
    { id: 'galaxy',      name: 'Galaxy Swirl',     rarity: 'epic',      price: 40,   cost: 5000,    color: '#5b3cc4', effect: 'stars' },
    { id: 'mango',       name: 'Mango Tango',      rarity: 'epic',      price: 38,   cost: 3500,    color: '#ffb020', effect: 'shine' },
    { id: 'golden',      name: 'Golden Caramel',   rarity: 'legendary', price: 90,   cost: 15000,   color: '#ffd700', effect: 'gold' },
    { id: 'dragonfruit', name: 'Dragon Fruit',     rarity: 'legendary', price: 110,  cost: 30000,   color: '#ff3cac', effect: 'dragon' },
    { id: 'lava',        name: 'Lava Swirl',       rarity: 'legendary', price: 100,  cost: 22000,   color: '#ff5a1f', effect: 'lava' },
    { id: 'unicorn',     name: 'Unicorn Dream',    rarity: 'mythic',    price: 300,  cost: 100000,  color: '#e0bbff', effect: 'unicorn' },
    { id: 'phoenix',     name: 'Phoenix Fire',     rarity: 'mythic',    price: 350,  cost: 200000,  color: '#ff4500', effect: 'fire' },
    { id: 'aurora',      name: 'Frozen Aurora',    rarity: 'mythic',    price: 320,  cost: 150000,  color: '#7fffd4', effect: 'aurora' },
    { id: 'void',        name: 'Cosmic Void',      rarity: 'secret',    price: 1200, cost: 1000000, color: '#0b0033', effect: 'void' },
    // ♾️ even better than Cosmic Void, and not in the shop: only admins can give or spawn it
    { id: 'infinity',    name: 'Infinity Swirl',   rarity: 'celestial', price: 3000, cost: 0, color: '#ff66ff', effect: 'infinity', adminOnly: true },
    // 👑 admin-only
    { id: 'crownjewel',  name: 'Crown Jewel',      rarity: 'admin', price: 5000,  cost: 0, color: '#ffcf33', effect: 'crown', adminOnly: true },
    { id: 'storm',       name: 'Storm Cloud',      rarity: 'admin', price: 7500,  cost: 0, color: '#3b4a6b', effect: 'storm', adminOnly: true },
    { id: 'supernova',   name: 'Supernova',        rarity: 'admin', price: 10000, cost: 0, color: '#fff1c2', effect: 'nova',  adminOnly: true },
    { id: 'prism',       name: 'Prism Swirl',      rarity: 'admin', price: 15000, cost: 0, color: '#ff66cc', effect: 'prism', adminOnly: true },
  ];

  // Toppings: bought at the Supplies Shop, then put on a tub on your stand.
  // Every scoop from that tub sells for `bonus` more (0.5 = +50%). One topping per tub.
  const TOPPINGS = [
    { id: 'sprinkles', name: 'Sprinkles',       emoji: '🌈', bonus: 0.25, cost: 40,      color: '#ff6fa5' },
    { id: 'syrup',     name: 'Chocolate Syrup', emoji: '🍫', bonus: 0.5,  cost: 300,     color: '#5a2e14' },
    { id: 'whipped',   name: 'Whipped Cream',   emoji: '☁️', bonus: 0.75, cost: 2000,    color: '#ffffff' },
    { id: 'cherry',    name: 'Cherry on Top',   emoji: '🍒', bonus: 1,    cost: 12000,   color: '#e3002b' },
    { id: 'goldflakes',name: 'Gold Flakes',     emoji: '✨', bonus: 2,    cost: 150000,  color: '#ffd700' },
    { id: 'stardust',  name: 'Stardust',        emoji: '🌟', bonus: 4,    cost: 2000000, color: '#b197fc' },
  ];

  // Pets: you get them from lucky blocks at the Pet Shop. Your equipped pet follows you
  // and gives you `boost` more money from every scoop (0.5 = +50%).
  // kind = how it moves: walk, hop, waddle, fly or swim (swimmers float through the air)
  const PETS = [
    { id: 'puppy',   name: 'Puppy',           emoji: '🐶', rarity: 'common',    boost: 0.05, fx: 'hearts',  kind: 'walk' },
    { id: 'kitty',   name: 'Kitty',           emoji: '🐱', rarity: 'common',    boost: 0.05, fx: 'hearts',  kind: 'walk' },
    { id: 'bunny',   name: 'Bunny',           emoji: '🐰', rarity: 'common',    boost: 0.08, fx: 'hop',     kind: 'hop' },
    { id: 'fox',     name: 'Fire Fox',        emoji: '🦊', rarity: 'uncommon',  boost: 0.12, fx: 'embers',  kind: 'walk' },
    { id: 'panda',   name: 'Bamboo Panda',    emoji: '🐼', rarity: 'uncommon',  boost: 0.15, fx: 'leaves',  kind: 'waddle' },
    { id: 'penguin', name: 'Ice Penguin',     emoji: '🐧', rarity: 'rare',      boost: 0.25, fx: 'snow',    kind: 'waddle' },
    { id: 'owl',     name: 'Night Owl',       emoji: '🦉', rarity: 'rare',      boost: 0.3,  fx: 'moon',    kind: 'fly' },
    { id: 'unicorn', name: 'Rainbow Unicorn', emoji: '🦄', rarity: 'epic',      boost: 0.5,  fx: 'rainbow', kind: 'walk' },
    { id: 'wolf',    name: 'Shadow Wolf',     emoji: '🐺', rarity: 'epic',      boost: 0.6,  fx: 'shadow',  kind: 'walk' },
    { id: 'phoenix', name: 'Phoenix',         emoji: '🦅', rarity: 'legendary', boost: 1,    fx: 'fire',    kind: 'fly' },
    { id: 'kraken',  name: 'Kraken',          emoji: '🐙', rarity: 'legendary', boost: 1.2,  fx: 'bubbles', kind: 'swim' },
    { id: 'lion',    name: 'Galaxy Lion',     emoji: '🦁', rarity: 'mythic',    boost: 2,    fx: 'galaxy',  kind: 'walk' },
    { id: 'whale',   name: 'Cosmic Whale',    emoji: '🐋', rarity: 'mythic',    boost: 2.5,  fx: 'cosmic',  kind: 'swim' },
    { id: 'dragon',  name: 'Dragon',          emoji: '🐉', rarity: 'secret',    boost: 5,    fx: 'dragon',  kind: 'fly' },
    // ⬇ even better than the Dragon!
    { id: 'rex',     name: 'Lava Rex',        emoji: '🦖', rarity: 'celestial', boost: 7,    fx: 'lava',    kind: 'walk' },
    { id: 'shark',   name: 'Thunder Shark',   emoji: '🦈', rarity: 'celestial', boost: 8,    fx: 'thunder', kind: 'swim' },
    { id: 'dove',    name: 'Angel Dove',      emoji: '🕊️', rarity: 'divine',    boost: 12,   fx: 'holy',    kind: 'fly' },
    { id: 'dragonking', name: 'Dragon King',  emoji: '🐲', rarity: 'divine',    boost: 15,   fx: 'king',    kind: 'fly' },
    { id: 'infinity', name: 'Infinity Dragon', emoji: '🐉', rarity: 'infinity', boost: 30,   fx: 'infinity', kind: 'fly' }, // the best pet of all!
  ];
  const MAX_PETS = 60;

  // Lucky blocks at the Pet Shop: `odds` = chance of each rarity (they add up to 100)
  const LUCKY_BLOCKS = [
    { id: 'wood',    name: 'Wooden Block',  cost: 1000,     color: '#b07a3e', odds: { common: 70, uncommon: 25, rare: 5 } },
    { id: 'iron',    name: 'Iron Block',    cost: 15000,    color: '#adb5bd', odds: { common: 35, uncommon: 40, rare: 20, epic: 5 } },
    { id: 'gold',    name: 'Gold Block',    cost: 150000,   color: '#fcc419', odds: { uncommon: 30, rare: 40, epic: 25, legendary: 5 } },
    { id: 'diamond', name: 'Diamond Block', cost: 2000000,  color: '#66d9e8', odds: { rare: 30, epic: 45, legendary: 20, mythic: 5 } },
    { id: 'rainbow', name: 'Rainbow Block', cost: 25000000, color: 'rainbow', odds: { epic: 44, legendary: 40, mythic: 15, secret: 1 } },
    { id: 'cosmic',  name: 'Cosmic Block',  cost: 1e9,      color: '#3b1f8f', odds: { legendary: 30, mythic: 45, secret: 20, celestial: 5 } },
    { id: 'divine',  name: 'Divine Block',  cost: 25e9,     color: '#ffe8a3', odds: { mythic: 30, secret: 40, celestial: 25, divine: 5 } },
    { id: 'infinity', name: 'Infinity Block', cost: 500e9,  color: 'infinity', odds: { secret: 40, celestial: 40, divine: 19, infinity: 1 } },
  ];

  // list them from most common to rarest, cheapest first (for the shop and the Flavor guide)
  FLAVORS.sort((a, b) => RARITIES[a.rarity].order - RARITIES[b.rarity].order || a.price - b.price);

  // cost of the next level = base * growth^level
  const UPGRADES = {
    sign:  { name: 'Bigger Sign',    desc: 'Attract more customers',      base: 40, growth: 1.9, max: 10 },
    tips:  { name: 'Tip Jar',        desc: '+10% money from every scoop', base: 60, growth: 2.0, max: 10 },
  };

  function upgradeCost(key, level) {
    const u = UPGRADES[key];
    return Math.round(u.base * Math.pow(u.growth, level));
  }

  const SERVE_TIME = 2.5; // seconds per scoop (the Scoop! button speeds it up)

  // Flavor spaces on the stand: start with 5, each Extra Space adds 3
  const START_SPACES = 5;
  const SPACES_PER_BUY = 3;
  const SPACE_COSTS = [300, 6000, 75000];

  function spaceCost(spaces) {
    if (spaces >= FLAVORS.filter(f => !f.adminOnly).length) return null; // already room for every shop flavor
    return SPACE_COSTS[Math.round((spaces - START_SPACES) / SPACES_PER_BUY)] ?? null;
  }

  // Mutation events: every 30, 45 or 50 minutes one of these takes over the park for a few
  // minutes. While it's on, scoops can turn into that mutation and sell for `mult` times more.
  // `weight` = how often it gets picked (rarer mutations pay more).
  const MUTATIONS = [
    { id: 'gold',      name: 'Gold',       emoji: '🪙', mult: 2,  weight: 20, colors: ['#ffd700', '#ffec80'] },
    { id: 'sakura',    name: 'Sakura',     emoji: '🌸', mult: 4,  weight: 14, colors: ['#ffb7d5', '#ffe3ef', '#ff8fbf'] },
    { id: 'diamond',   name: 'Diamond',    emoji: '💎', mult: 5,  weight: 12, colors: ['#b9f2ff', '#e8fdff', '#7fdcff'] },
    { id: 'galaxy',    name: 'Galaxy',     emoji: '🪐', mult: 15, weight: 5,  colors: ['#2a1060', '#7b3cff', '#ff66d9'] },
    { id: 'rainbow',   name: 'Rainbow',    emoji: '🌈', mult: 30, weight: 2,
      colors: ['#e8202a', '#f7811e', '#fbd31a', '#3cb44a', '#2a7fd4', '#4b3aa8', '#8f3fb8'] },
    { id: 'meteor',    name: 'Meteor Shower', emoji: '☄️', mult: 40, weight: 1.6, colors: ['#ff6b00', '#ffd43b', '#5c2a00'] },
    { id: 'impossible', name: 'Impossible', emoji: '♾️', mult: 100, weight: 0.3,
      colors: ['#ff00ff', '#00ffff', '#ffff00', '#ff0055', '#00ff66'] },
  ];
  MUTATIONS.sort((a, b) => a.mult - b.mult); // lowest to highest money, for the Mutations list
  const MUTATION_GAPS_MIN = [30, 45, 50]; // minutes between mutation events
  const MUTATION_LENGTH_MIN = 5;          // how long each event lasts
  const MUTATION_CHANCE = 0.35;           // chance a scoop mutates while an event is on

  const RESTOCK_SEC = 180;  // the shop gets new stock every 3 minutes
  const HOTBAR_SIZE = 10;   // see-through slots at the bottom of the screen
  const STORAGE_SIZE = 30;  // the Inventory chest on your plot
  const MAX_STACK = 99;     // tubs of one flavor per slot

  // Avatar Shop choices (the first of each is the default; shirt 'stand' = your stand's color)
  const AVATAR = {
    shirt: ['stand', '#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#212529', '#ffffff', '#f06595'],
    pants: ['#3b3b58', '#1c7ed6', '#2b8a3e', '#5c3d2e', '#868e96', '#e64980'],
    skin:  ['#f8d5b8', '#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'],
    hat:   ['cap', 'none', 'tophat', 'beanie', 'party', 'cowboy', 'wizard', 'bunny', 'cone'],
    face:  ['happy', 'cool', 'wink', 'silly', 'wow'],
  };

  const GameData = { RARITIES, FLAVORS, TOPPINGS, PETS, MAX_PETS, LUCKY_BLOCKS, UPGRADES, upgradeCost, SERVE_TIME, AVATAR,
    RESTOCK_SEC, HOTBAR_SIZE, STORAGE_SIZE, MAX_STACK,
    START_SPACES, SPACES_PER_BUY, spaceCost,
    MUTATIONS, MUTATION_GAPS_MIN, MUTATION_LENGTH_MIN, MUTATION_CHANCE };
  if (typeof module !== 'undefined' && module.exports) module.exports = GameData;
  else root.GameData = GameData;
})(this);
