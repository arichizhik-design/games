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
    speed: { name: 'Faster Scooper', desc: 'Serve customers faster',      base: 25, growth: 1.8, max: 10 },
    sign:  { name: 'Bigger Sign',    desc: 'Attract more customers',      base: 40, growth: 1.9, max: 10 },
    tips:  { name: 'Tip Jar',        desc: '+10% money from every scoop', base: 60, growth: 2.0, max: 10 },
  };

  function upgradeCost(key, level) {
    const u = UPGRADES[key];
    return Math.round(u.base * Math.pow(u.growth, level));
  }

  function serveTime(speedLevel) {
    return Math.max(0.5, 3 - speedLevel * 0.25); // seconds
  }

  const GameData = { RARITIES, FLAVORS, UPGRADES, upgradeCost, serveTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = GameData;
  else root.GameData = GameData;
})(this);
