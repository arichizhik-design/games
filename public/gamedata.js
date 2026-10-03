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
  };

  // price = what a customer pays per scoop, cost = price of one tub in the shop
  // effect = special look (glow, flames, stars...) drawn on the scoop
  const FLAVORS = [
    { id: 'vanilla',     name: 'Vanilla',          rarity: 'common',    price: 2,    cost: 10,      color: '#fff3c4' },
    { id: 'chocolate',   name: 'Chocolate',        rarity: 'common',    price: 2,    cost: 10,      color: '#6b3e26' },
    { id: 'strawberry',  name: 'Strawberry',       rarity: 'uncommon',  price: 5,    cost: 50,      color: '#ff8fab' },
    { id: 'mint',        name: 'Mint Chip',        rarity: 'uncommon',  price: 6,    cost: 120,     color: '#a8e6cf', effect: 'frost' },
    { id: 'cookiedough', name: 'Cookie Dough',     rarity: 'rare',      price: 14,   cost: 400,     color: '#e6c79c', effect: 'chips' },
    { id: 'cottoncandy', name: 'Cotton Candy',     rarity: 'rare',      price: 16,   cost: 800,     color: '#c3aed6', effect: 'fluff' },
    { id: 'rainbow',     name: 'Rainbow Sherbet',  rarity: 'epic',      price: 35,   cost: 2500,    color: '#ffb347', effect: 'sherbet' },
    { id: 'galaxy',      name: 'Galaxy Swirl',     rarity: 'epic',      price: 40,   cost: 5000,    color: '#5b3cc4', effect: 'stars' },
    { id: 'golden',      name: 'Golden Caramel',   rarity: 'legendary', price: 90,   cost: 15000,   color: '#ffd700', effect: 'gold' },
    { id: 'dragonfruit', name: 'Dragon Fruit',     rarity: 'legendary', price: 110,  cost: 30000,   color: '#ff3cac', effect: 'dragon' },
    { id: 'unicorn',     name: 'Unicorn Dream',    rarity: 'mythic',    price: 300,  cost: 100000,  color: '#e0bbff', effect: 'unicorn' },
    { id: 'phoenix',     name: 'Phoenix Fire',     rarity: 'mythic',    price: 350,  cost: 200000,  color: '#ff4500', effect: 'fire' },
    { id: 'void',        name: 'Cosmic Void',      rarity: 'secret',    price: 1200, cost: 1000000, color: '#0b0033', effect: 'void' },
  ];

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
    if (spaces >= FLAVORS.length) return null; // already room for every flavor
    return SPACE_COSTS[Math.round((spaces - START_SPACES) / SPACES_PER_BUY)] ?? null;
  }

  // Mutation events: every 30, 45 or 50 minutes one of these takes over the park for a few
  // minutes. While it's on, scoops can turn into that mutation and sell for `mult` times more.
  // `weight` = how often it gets picked (rarer mutations pay more).
  const MUTATIONS = [
    { id: 'gold',      name: 'Gold',       emoji: '🪙', mult: 2,  weight: 20, colors: ['#ffd700', '#ffec80'] },
    { id: 'candy',     name: 'Candy',      emoji: '🍬', mult: 3,  weight: 16, colors: ['#ff8fcf', '#8fe3ff', '#fff38f'] },
    { id: 'frozen',    name: 'Frozen',     emoji: '❄️', mult: 3,  weight: 16, colors: ['#bfefff', '#ffffff'] },
    { id: 'diamond',   name: 'Diamond',    emoji: '💎', mult: 5,  weight: 12, colors: ['#b9f2ff', '#e8fdff', '#7fdcff'] },
    { id: 'thunder',   name: 'Thunder',    emoji: '⚡', mult: 6,  weight: 10, colors: ['#fff200', '#5a5aff'] },
    { id: 'molten',    name: 'Molten',     emoji: '🌋', mult: 8,  weight: 8,  colors: ['#ff5a00', '#ffb300', '#5a1a00'] },
    { id: 'aurora',    name: 'Aurora',     emoji: '🌌', mult: 10, weight: 6,  colors: ['#33ffaa', '#33ccff', '#b366ff'] },
    { id: 'shadow',    name: 'Shadow',     emoji: '🌑', mult: 12, weight: 5,  colors: ['#1a1a2e', '#4b3f72', '#000000'] },
    { id: 'galaxy',    name: 'Galaxy',     emoji: '🪐', mult: 15, weight: 5,  colors: ['#2a1060', '#7b3cff', '#ff66d9'] },
    { id: 'yinyang',   name: 'Yin Yang',   emoji: '☯️', mult: 20, weight: 4,  colors: ['#111111', '#ffffff'] },
    { id: 'bloodmoon', name: 'Blood Moon', emoji: '🌕', mult: 25, weight: 3,  colors: ['#b3001b', '#ff3b3b', '#4a0008'] },
    { id: 'rainbow',   name: 'Rainbow',    emoji: '🌈', mult: 30, weight: 2,
      colors: ['#e8202a', '#f7811e', '#fbd31a', '#3cb44a', '#2a7fd4', '#4b3aa8', '#8f3fb8'] },
    // the super-rare top three
    { id: 'godly',      name: 'Godly',      emoji: '⚜️', mult: 50,  weight: 1.2, colors: ['#ffd700', '#fff6c2', '#ffb000'] },
    { id: 'heavenly',   name: 'Heavenly',   emoji: '😇', mult: 75,  weight: 0.7, colors: ['#ffffff', '#e3f2ff', '#fff3b0'] },
    { id: 'impossible', name: 'Impossible', emoji: '♾️', mult: 100, weight: 0.3,
      colors: ['#ff00ff', '#00ffff', '#ffff00', '#ff0055', '#00ff66'] },
  ];
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

  const GameData = { RARITIES, FLAVORS, UPGRADES, upgradeCost, SERVE_TIME, AVATAR,
    RESTOCK_SEC, HOTBAR_SIZE, STORAGE_SIZE, MAX_STACK,
    START_SPACES, SPACES_PER_BUY, spaceCost,
    MUTATIONS, MUTATION_GAPS_MIN, MUTATION_LENGTH_MIN, MUTATION_CHANCE };
  if (typeof module !== 'undefined' && module.exports) module.exports = GameData;
  else root.GameData = GameData;
})(this);
