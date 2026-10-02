// Shared game data, used by both the server (require) and the browser (window.GameData).
(function (root) {
  const RARITIES = {
    common:    { name: 'Common',    color: '#b0b0b0', order: 0 },
    uncommon:  { name: 'Uncommon',  color: '#4caf50', order: 1 },
    rare:      { name: 'Rare',      color: '#2196f3', order: 2 },
    epic:      { name: 'Epic',      color: '#9c27b0', order: 3 },
    legendary: { name: 'Legendary', color: '#ff9800', order: 4 },
    mythic:    { name: 'Mythic',    color: '#f44336', order: 5 },
    secret:    { name: 'Secret',    color: '#111111', order: 6 },
  };

  // price = what a customer pays per scoop, cost = price to unlock the flavor
  const FLAVORS = [
    { id: 'vanilla',     name: 'Vanilla',          rarity: 'common',    price: 2,    cost: 0,       color: '#fff3c4' },
    { id: 'chocolate',   name: 'Chocolate',        rarity: 'common',    price: 2,    cost: 0,       color: '#6b3e26' },
    { id: 'strawberry',  name: 'Strawberry',       rarity: 'uncommon',  price: 5,    cost: 50,      color: '#ff8fab' },
    { id: 'mint',        name: 'Mint Chip',        rarity: 'uncommon',  price: 6,    cost: 120,     color: '#a8e6cf' },
    { id: 'cookiedough', name: 'Cookie Dough',     rarity: 'rare',      price: 14,   cost: 400,     color: '#e6c79c' },
    { id: 'cottoncandy', name: 'Cotton Candy',     rarity: 'rare',      price: 16,   cost: 800,     color: '#c3aed6' },
    { id: 'rainbow',     name: 'Rainbow Sherbet',  rarity: 'epic',      price: 35,   cost: 2500,    color: '#ffb347' },
    { id: 'galaxy',      name: 'Galaxy Swirl',     rarity: 'epic',      price: 40,   cost: 5000,    color: '#5b3cc4' },
    { id: 'golden',      name: 'Golden Caramel',   rarity: 'legendary', price: 90,   cost: 15000,   color: '#ffd700' },
    { id: 'dragonfruit', name: 'Dragon Fruit',     rarity: 'legendary', price: 110,  cost: 30000,   color: '#ff3cac' },
    { id: 'unicorn',     name: 'Unicorn Dream',    rarity: 'mythic',    price: 300,  cost: 100000,  color: '#e0bbff' },
    { id: 'phoenix',     name: 'Phoenix Fire',     rarity: 'mythic',    price: 350,  cost: 200000,  color: '#ff4500' },
    { id: 'void',        name: 'Cosmic Void',      rarity: 'secret',    price: 1200, cost: 1000000, color: '#0b0033' },
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
    { id: 'aurora',    name: 'Aurora',     emoji: '🌌', mult: 10, weight: 6,  colors: ['#33ffaa', '#33ccff', '#b366ff'] },
    { id: 'galaxy',    name: 'Galaxy',     emoji: '🪐', mult: 15, weight: 5,  colors: ['#2a1060', '#7b3cff', '#ff66d9'] },
    { id: 'yinyang',   name: 'Yin Yang',   emoji: '☯️', mult: 20, weight: 4,  colors: ['#111111', '#ffffff'] },
    { id: 'bloodmoon', name: 'Blood Moon', emoji: '🌕', mult: 25, weight: 3,  colors: ['#b3001b', '#ff3b3b', '#4a0008'] },
    // the best and rarest mutation
    { id: 'rainbow',   name: 'Rainbow',    emoji: '🌈', mult: 30, weight: 2,
      colors: ['#e8202a', '#f7811e', '#fbd31a', '#3cb44a', '#2a7fd4', '#4b3aa8', '#8f3fb8'] },
  ];
  const MUTATION_GAPS_MIN = [30, 45, 50]; // minutes between mutation events
  const MUTATION_LENGTH_MIN = 5;          // how long each event lasts
  const MUTATION_CHANCE = 0.35;           // chance a scoop mutates while an event is on

  const GameData = { RARITIES, FLAVORS, UPGRADES, upgradeCost, SERVE_TIME,
    START_SPACES, SPACES_PER_BUY, spaceCost,
    MUTATIONS, MUTATION_GAPS_MIN, MUTATION_LENGTH_MIN, MUTATION_CHANCE };
  if (typeof module !== 'undefined' && module.exports) module.exports = GameData;
  else root.GameData = GameData;
})(this);
