// The game rules: players, stands, customers, the shop, inventories and mutation events.
// Runs on the server for multiplayer, or right in the browser for the single-file version.
// Each player connection is an object with a send(msg) function.
(function (root) {
  const GameData = typeof module !== 'undefined' && module.exports
    ? require('./gamedata.js') : root.GameData;
  const { RARITIES, FLAVORS, UPGRADES, upgradeCost, SERVE_TIME, START_SPACES, SPACES_PER_BUY, spaceCost,
    MUTATIONS, MUTATION_GAPS_MIN, MUTATION_LENGTH_MIN, MUTATION_CHANCE,
    RESTOCK_SEC, HOTBAR_SIZE, STORAGE_SIZE, MAX_STACK } = GameData;

  // ---------- park layout (shared with the browser for drawing and clicking) ----------
  const WORLD = { width: 1280, height: 1180 };
  const SHOP = { x: 640, y: 120 };   // the Ice Cream Shop building at the top of the park
  const REACH = 230;                 // how close you must stand to use something
  const ADMIN_NAMES = ['coolkid'];   // these names get admin commands
  const ADMIN_MONEY = 1e12;          // admins start with $1 trillion
  const MAX_QUEUE = 5;
  const WALK_SPEED = 170;            // customers
  const COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b',
    '#20c997', '#f06595', '#748ffc', '#94d82d', '#fd7e14', '#22b8cf'];

  // 4 x 3 grid of plots below the shop
  const SLOTS = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      SLOTS.push({ x: 170 + col * 313, y: 340 + row * 300 });
    }
  }

  // where the Inventory chest sits on a plot
  const chestPos = slot => ({ x: slot.x + 128, y: slot.y + 30 });

  // where flavor space i sits on the stand counter (up to 8 per row)
  function tubPos(slot, i, spaces) {
    const row = Math.floor(i / 8);
    const inRow = Math.min(8, spaces - row * 8);
    const col = i % 8;
    return { x: slot.x - ((inRow - 1) * 20.5) / 2 + col * 20.5, y: slot.y + 9 + row * 22 };
  }

  const flavorById = Object.fromEntries(FLAVORS.map(f => [f.id, f]));
  const mutationById = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function pickMutation() {
    let r = Math.random() * MUTATIONS.reduce((sum, m) => sum + m.weight, 0);
    for (const m of MUTATIONS) {
      r -= m.weight;
      if (r <= 0) return m;
    }
    return MUTATIONS[0];
  }

  function rollStock() {
    const stock = {};
    for (const f of FLAVORS) {
      const st = RARITIES[f.rarity].stock;
      stock[f.id] = Math.random() < st.chance
        ? st.min + Math.floor(Math.random() * (st.max - st.min + 1)) : 0;
    }
    return stock;
  }

  // ---------- inventory helpers (a slot is null or { flavor, count }) ----------
  function addItem(slots, flavor, count) {
    for (const s of slots) {
      if (count <= 0) break;
      if (s && s.flavor === flavor && s.count < MAX_STACK) {
        const n = Math.min(count, MAX_STACK - s.count);
        s.count += n; count -= n;
      }
    }
    for (let i = 0; i < slots.length && count > 0; i++) {
      if (!slots[i]) {
        const n = Math.min(count, MAX_STACK);
        slots[i] = { flavor, count: n }; count -= n;
      }
    }
    return count; // tubs that didn't fit
  }

  const fits = (slots, flavor) => slots.some(s => !s || (s.flavor === flavor && s.count < MAX_STACK));

  function fixSlots(list, size) {
    const out = Array(size).fill(null);
    (list || []).slice(0, size).forEach((s, i) => {
      if (s && flavorById[s.flavor] && s.count > 0) out[i] = { flavor: s.flavor, count: s.count };
    });
    return out;
  }

  function createGame({ saves = {}, allowTest = false } = {}) {
    const stands = new Map();     // id -> stand (one per connected player)
    const customers = new Map();  // id -> customer
    let nextId = 1;

    // mutation event: either one is active, or we count down to the next one (seconds)
    const event = { id: null, left: 0, next: pick(MUTATION_GAPS_MIN) * 60 };
    // the shop's stock is the same for everyone; each player can buy up to that many of each
    const shop = { stock: rollStock(), left: RESTOCK_SEC };

    function toSave(s) {
      return { name: s.name, money: s.money, totalEarned: s.totalEarned, sold: s.sold,
        spaces: s.spaces, tubs: s.tubs, hotbar: s.hotbar, storage: s.storage, seen: s.seen,
        upgrades: s.upgrades, mutations: s.mutations };
    }

    function snapshotSaves() {
      for (const s of stands.values()) saves[s.key] = toSave(s);
      return saves;
    }

    function createStand(conn, name) {
      const key = name.toLowerCase();
      const used = new Set([...stands.values()].map(s => s.slot));
      const slot = SLOTS.findIndex((_, i) => !used.has(i));
      if (slot === -1) return null;
      const saved = saves[key] || {};
      const spaces = saved.spaces ?? START_SPACES;

      // tubs on the stand: null (empty space) or { flavor, grow: seconds left until ready }
      let tubs = Array(spaces).fill(null);
      const oldFlavors = saved.tubs ? null : (saved.flavors ?? ['vanilla', 'chocolate']); // older saves
      (saved.tubs || oldFlavors.map(f => ({ flavor: f, grow: 0 }))).slice(0, spaces).forEach((t, i) => {
        if (t && flavorById[t.flavor]) tubs[i] = { flavor: t.flavor, grow: Math.max(0, t.grow || 0) };
      });

      const s = SLOTS[slot];
      const stand = {
        id: nextId++, conn, key, name, slot,
        color: COLORS[slot % COLORS.length],
        money: saved.money ?? 0,
        totalEarned: saved.totalEarned ?? 0,
        sold: saved.sold ?? 0,
        spaces, tubs,
        hotbar: fixSlots(saved.hotbar, HOTBAR_SIZE),
        storage: fixSlots(saved.storage, STORAGE_SIZE),
        seen: saved.seen ?? [...new Set(tubs.filter(Boolean).map(t => t.flavor))], // flavors you've had
        upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, saved.upgrades?.[k] ?? 0])),
        mutations: saved.mutations ?? {}, // mutation id -> scoops sold with it
        bought: {},                       // tubs bought since the last restock
        x: s.x + 60, y: s.y + 110,        // the player's character
        hand: -1,                         // hotbar slot in hand, -1 = nothing
        queue: [],
        serveProgress: 0,
        spawnTimer: 0,
        clicks: 0,
      };
      stands.set(stand.id, stand);
      return stand;
    }

    function queuePos(stand, index) {
      const s = SLOTS[stand.slot];
      return { x: s.x, y: s.y + 88 + index * 20 };
    }

    const readyTubs = stand => stand.tubs.filter(t => t && t.grow <= 0);

    function spawnCustomer(stand) {
      const ready = readyTubs(stand);
      if (!ready.length) return; // nothing to sell yet
      // walk in along the path from whichever side of the park is closer
      const slot = SLOTS[stand.slot];
      const fromLeft = slot.x < WORLD.width / 2;
      const c = {
        id: nextId++,
        x: fromLeft ? -30 : WORLD.width + 30,
        y: slot.y + 95 + Math.random() * 80,
        standId: stand.id,
        flavor: pick(ready).flavor,
        golden: Math.random() < 0.05, // lucky customer pays triple
        mutation: null,
        state: 'walking',
        look: Math.floor(Math.random() * 6),
      };
      customers.set(c.id, c);
      stand.queue.push(c.id);
    }

    function sendOffCustomer(c) {
      c.state = 'leaving';
      c.tx = c.x < WORLD.width / 2 ? -40 : WORLD.width + 40;
      c.ty = c.y + 20 + Math.random() * 40;
    }

    function completeSale(stand) {
      const c = customers.get(stand.queue.shift());
      stand.serveProgress = 0;
      if (!c) return;
      const flavor = flavorById[c.flavor];
      let amount = flavor.price * (1 + 0.1 * stand.upgrades.tips);
      if (c.golden) amount *= 3;
      if (event.id && Math.random() < MUTATION_CHANCE) {
        c.mutation = event.id;
        amount *= mutationById[event.id].mult;
        stand.mutations[event.id] = (stand.mutations[event.id] || 0) + 1;
      }
      amount = Math.round(amount * 100) / 100;
      stand.money += amount;
      stand.totalEarned += amount;
      stand.sold++;
      c.served = true;
      sendOffCustomer(c);
      broadcast({ type: 'sale', standId: stand.id, customerId: c.id, flavor: c.flavor,
        amount, golden: c.golden, mutation: c.mutation });
    }

    function startMutation(id) {
      const m = mutationById[id] || pickMutation();
      event.id = m.id;
      event.left = MUTATION_LENGTH_MIN * 60;
      broadcast({ type: 'mutationStart', mutation: m.id });
    }

    function restock() {
      shop.stock = rollStock();
      shop.left = RESTOCK_SEC;
      for (const s of stands.values()) s.bought = {};
      broadcast({ type: 'restock' });
    }

    function updateTimers(dt) {
      if (event.id) {
        event.left -= dt;
        if (event.left <= 0) {
          broadcast({ type: 'mutationEnd', mutation: event.id });
          event.id = null;
          event.next = pick(MUTATION_GAPS_MIN) * 60;
        }
      } else {
        event.next -= dt;
        if (event.next <= 0) startMutation();
      }
      shop.left -= dt;
      if (shop.left <= 0) restock();
    }

    function tick(dt) {
      updateTimers(dt);

      for (const stand of stands.values()) {
        for (const t of stand.tubs) if (t && t.grow > 0) t.grow = Math.max(0, t.grow - dt);

        // new customers: bigger sign and more ready tubs bring more people
        const ready = readyTubs(stand).length;
        const interval = 2.5 / (1 + 0.3 * stand.upgrades.sign + 0.1 * Math.max(0, ready - 2));
        stand.spawnTimer -= dt;
        if (stand.spawnTimer <= 0) {
          stand.spawnTimer = interval * (0.6 + Math.random() * 0.8);
          if (stand.queue.length < MAX_QUEUE) spawnCustomer(stand);
        }

        // serve the customer at the front once they arrive
        const front = customers.get(stand.queue[0]);
        if (front && front.state === 'waiting') {
          stand.serveProgress += dt + Math.min(stand.clicks, 3) * 0.35;
          if (stand.serveProgress >= SERVE_TIME) completeSale(stand);
        }
        stand.clicks = 0;
      }

      for (const c of customers.values()) {
        const stand = stands.get(c.standId);
        if (c.state !== 'leaving') {
          if (!stand) { sendOffCustomer(c); continue; }
          const t = queuePos(stand, stand.queue.indexOf(c.id));
          c.tx = t.x; c.ty = t.y;
        }
        const dx = c.tx - c.x, dy = c.ty - c.y;
        const d = Math.hypot(dx, dy);
        const step = WALK_SPEED * dt;
        if (d <= step) {
          c.x = c.tx; c.y = c.ty;
          if (c.state === 'walking') c.state = 'waiting';
          else if (c.state === 'leaving') customers.delete(c.id);
        } else {
          c.x += (dx / d) * step;
          c.y += (dy / d) * step;
          if (c.state === 'waiting') c.state = 'walking';
        }
      }

      broadcast({
        type: 'state',
        event: { id: event.id, left: Math.ceil(event.left), next: Math.ceil(event.next) },
        shop: { stock: shop.stock, left: Math.ceil(shop.left) },
        stands: [...stands.values()].map(s => ({
          id: s.id, name: s.name, slot: s.slot, color: s.color,
          money: s.money, totalEarned: s.totalEarned, sold: s.sold,
          spaces: s.spaces, tubs: s.tubs, hotbar: s.hotbar, storage: s.storage, seen: s.seen,
          upgrades: s.upgrades, mutations: s.mutations, bought: s.bought,
          x: Math.round(s.x), y: Math.round(s.y), hand: s.hand, admin: !!s.admin,
          serve: s.queue.length ? s.serveProgress / SERVE_TIME : 0,
        })),
        customers: [...customers.values()].map(c => ({
          id: c.id, x: Math.round(c.x), y: Math.round(c.y), flavor: c.flavor,
          golden: c.golden, mutation: c.mutation, state: c.state, look: c.look, served: !!c.served,
        })),
      });
    }

    function broadcast(msg) {
      for (const s of stands.values()) s.conn.send(msg);
    }

    // ---------- player actions ----------
    function handle(conn, msg) {
      const stand = conn.standId && stands.get(conn.standId);
      const err = text => conn.send({ type: 'error', text });

      if (msg.type === 'join' && !stand) {
        const name = String(msg.name || '').replace(/[^\w \-]/g, '').trim().slice(0, 16);
        if (!name) return err('Please pick a name.');
        if ([...stands.values()].some(s => s.key === name.toLowerCase())) {
          return err('Someone with that name is already playing.');
        }
        const s = createStand(conn, name);
        if (!s) return err('The park is full (12 stands). Try again later!');
        conn.standId = s.id;
        s.admin = ADMIN_NAMES.includes(s.key);
        if (s.admin && s.money < ADMIN_MONEY) s.money = ADMIN_MONEY;
        conn.send({ type: 'welcome', id: s.id, world: WORLD, slots: SLOTS,
          returning: !!saves[s.key], allowTest, admin: s.admin });
        return;
      }
      if (!stand) return;
      const slot = SLOTS[stand.slot];
      const near = p => dist(stand, p) <= REACH;

      if (msg.type === 'move') {
        stand.x = Math.max(0, Math.min(WORLD.width, Number(msg.x) || 0));
        stand.y = Math.max(0, Math.min(WORLD.height, Number(msg.y) || 0));
      } else if (msg.type === 'hold') {
        const i = Number(msg.slot);
        stand.hand = Number.isInteger(i) && i >= 0 && i < HOTBAR_SIZE ? i : -1;
      } else if (msg.type === 'scoop') {
        stand.clicks++;
      } else if (msg.type === 'buy') {
        const f = flavorById[msg.flavor];
        if (!f) return;
        if (!near(SHOP)) return err('Walk to the Ice Cream Shop to buy.');
        if ((shop.stock[f.id] || 0) - (stand.bought[f.id] || 0) <= 0) return err('Sold out! New stock soon.');
        if (stand.money < f.cost) return err('Not enough money!');
        if (!fits(stand.hotbar, f.id) && !fits(stand.storage, f.id)) return err('Your inventory is full!');
        stand.money -= f.cost;
        stand.bought[f.id] = (stand.bought[f.id] || 0) + 1;
        if (addItem(stand.hotbar, f.id, 1) > 0) addItem(stand.storage, f.id, 1);
        if (!stand.seen.includes(f.id)) stand.seen.push(f.id);
        conn.send({ type: 'bought', flavor: f.id });
      } else if (msg.type === 'place') {
        // put the tub in your hand into an empty space on your stand
        const item = stand.hotbar[stand.hand];
        if (!item) return err('Pick an ice cream from your hotbar first.');
        if (!near(slot)) return err('Walk to your stand to place ice cream.');
        let i = Number(msg.space);
        if (!(i >= 0 && i < stand.spaces && !stand.tubs[i])) i = stand.tubs.indexOf(null);
        if (i === -1) return err('Your stand is full! Buy Extra Space or take a tub off.');
        stand.tubs[i] = { flavor: item.flavor, grow: RARITIES[flavorById[item.flavor].rarity].growSec };
        item.count--;
        if (item.count <= 0) stand.hotbar[stand.hand] = null;
        conn.send({ type: 'placed', flavor: stand.tubs[i].flavor });
      } else if (msg.type === 'takeOut') {
        // take a tub off your stand and put it back in your inventory
        const i = Number(msg.space);
        const tub = stand.tubs[i];
        if (!tub) return;
        if (!near(slot)) return err('Walk to your stand to take ice cream off.');
        if (!fits(stand.hotbar, tub.flavor) && !fits(stand.storage, tub.flavor)) return err('Your inventory is full!');
        if (addItem(stand.hotbar, tub.flavor, 1) > 0) addItem(stand.storage, tub.flavor, 1);
        stand.tubs[i] = null;
      } else if (msg.type === 'moveItem') {
        // click an item to move it between the hotbar and the Inventory chest
        const from = msg.from === 'storage' ? stand.storage : stand.hotbar;
        const to = from === stand.storage ? stand.hotbar : stand.storage;
        const i = Number(msg.index);
        const item = from[i];
        if (!item) return;
        if (!near(chestPos(slot))) return err('Walk to your Inventory chest first.');
        const left = addItem(to, item.flavor, item.count);
        if (left === item.count) return err(to === stand.hotbar ? 'Your hotbar is full!' : 'Your inventory is full!');
        if (left > 0) item.count = left; else from[i] = null;
      } else if (msg.type === 'buySpace') {
        const cost = spaceCost(stand.spaces);
        if (cost === null || stand.tubs.includes(null)) return;
        if (stand.money < cost) return err('Not enough money!');
        stand.money -= cost;
        stand.spaces += SPACES_PER_BUY;
        for (let i = 0; i < SPACES_PER_BUY; i++) stand.tubs.push(null);
        conn.send({ type: 'spaceAdded', spaces: stand.spaces });
      } else if (msg.type === 'buyUpgrade') {
        const u = UPGRADES[msg.key];
        if (!u) return;
        const level = stand.upgrades[msg.key];
        if (level >= u.max) return;
        const cost = upgradeCost(msg.key, level);
        if (stand.money < cost) return err('Not enough money!');
        stand.money -= cost;
        stand.upgrades[msg.key]++;
      } else if (stand.admin && msg.type === 'adminMoney') {
        const amount = Math.min(1e15, Math.max(0, Number(msg.amount) || 0));
        stand.money += amount;
        conn.send({ type: 'admin', text: `Added $${amount.toLocaleString()}` });
      } else if (stand.admin && msg.type === 'adminGive') {
        // put any ice cream in your inventory, even if the shop is sold out
        const f = flavorById[msg.flavor];
        if (!f) return err('No ice cream with that name.');
        const count = Math.min(990, Math.max(1, Math.floor(Number(msg.count) || 1)));
        const left = addItem(stand.storage, f.id, addItem(stand.hotbar, f.id, count));
        if (!stand.seen.includes(f.id)) stand.seen.push(f.id);
        conn.send({ type: 'admin', text: `Gave you ${count - left} ${f.name}` + (left ? ` (${left} didn't fit)` : '') });
      } else if (stand.admin && msg.type === 'adminEndMutation') {
        if (event.id) event.left = 0.01;
      } else if ((allowTest || stand.admin) && msg.type === 'testMutation') {
        // test button: start a (new) mutation event right away
        if (event.id) broadcast({ type: 'mutationEnd', mutation: event.id });
        startMutation(msg.id);
      } else if ((allowTest || stand.admin) && msg.type === 'testMoney') {
        stand.money += 1000;
        stand.totalEarned += 1000;
      } else if ((allowTest || stand.admin) && msg.type === 'testRestock') {
        restock();
      } else if ((allowTest || stand.admin) && msg.type === 'testGrow') {
        for (const t of stand.tubs) if (t) t.grow = 0;
      }
    }

    function leave(conn) {
      const stand = stands.get(conn.standId);
      if (!stand) return;
      saves[stand.key] = toSave(stand);
      stands.delete(stand.id);
    }

    return { handle, leave, tick, snapshotSaves };
  }

  const Engine = { createGame, WORLD, SLOTS, SHOP, REACH, chestPos, tubPos };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(this);
