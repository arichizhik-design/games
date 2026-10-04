// The game rules: players, stands, customers, the shop, inventories and mutation events.
// Runs on the server for multiplayer, or right in the browser for the single-file version.
// Each player connection is an object with a send(msg) function.
(function (root) {
  const GameData = typeof module !== 'undefined' && module.exports
    ? require('./gamedata.js') : root.GameData;
  const { RARITIES, FLAVORS, UPGRADES, upgradeCost, SERVE_TIME, START_SPACES, SPACES_PER_BUY, spaceCost, AVATAR,
    MUTATIONS, MUTATION_GAPS_MIN, MUTATION_LENGTH_MIN, MUTATION_CHANCE,
    RESTOCK_SEC, HOTBAR_SIZE, STORAGE_SIZE, MAX_STACK } = GameData;

  // ---------- park layout (shared with the browser for drawing and clicking) ----------
  const WORLD = { width: 1280, height: 1180 };
  const SHOP = { x: 640, y: 120 };   // the Ice Cream Shop building at the top of the park
  const AVATAR_SHOP = { x: 1020, y: 125 }; // the Avatar Shop next to it
  const REACH = 230;                 // how close you must stand to use something
  // admin names and their secret codes (only a scrambled version of each code is kept here).
  // Each admin needs their code once per device, and each name only works on the first device that used it.
  const ADMIN_CODES = {
    coolkid: '1aazefnqiv3',
    james: '8itvkdxe00',
  };
  const ADMIN_NAMES = Object.keys(ADMIN_CODES);

  // scrambles text into a short code (cyrb53), so the real admin code isn't written in the game files
  function scramble(str, seed = 7) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const adminCodeOk = (name, code) => scramble(String(code || '').toLowerCase().replace(/\s+/g, '')) === ADMIN_CODES[name];
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

  // where flavor space i sits on the stand counter (up to 7 per row)
  function tubPos(slot, i, spaces) {
    const row = Math.floor(i / 7);
    const inRow = Math.min(7, spaces - row * 7);
    const col = i % 7;
    return { x: slot.x - ((inRow - 1) * 23) / 2 + col * 23, y: slot.y + 9 + row * 26 };
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
      if (f.adminOnly) continue;
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

  // keep only avatar choices that exist
  function fixAvatar(a) {
    const out = {};
    for (const [part, options] of Object.entries(AVATAR)) {
      out[part] = a && options.includes(a[part]) ? a[part] : options[0];
    }
    return out;
  }

  function createGame({ saves = {} } = {}) {
    const stands = new Map();     // id -> stand (one per connected player)
    const customers = new Map();  // id -> customer
    let nextId = 1;

    // mutation events: the ones going on now (admins can run several at once),
    // and the countdown (seconds) to the next natural one
    const event = { active: [], next: pick(MUTATION_GAPS_MIN) * 60 };
    // the shop's stock is the same for everyone; each player can buy up to that many of each
    const shop = { stock: rollStock(), left: RESTOCK_SEC };

    function toSave(s) {
      return { name: s.name, money: s.money, totalEarned: s.totalEarned, sold: s.sold,
        spaces: s.spaces, tubs: s.tubs, hotbar: s.hotbar, storage: s.storage, seen: s.seen,
        upgrades: s.upgrades, mutations: s.mutations, avatar: s.avatar,
        ...(s.adminDevice ? { adminDevice: s.adminDevice } : {}) };
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
        avatar: fixAvatar(saved.avatar),
        adminDevice: saved.adminDevice,
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

    // the progress a brand-new player starts with (used when an admin bans someone)
    function freshProgress() {
      return {
        money: 0, totalEarned: 0, sold: 0, spaces: START_SPACES,
        tubs: [{ flavor: 'vanilla', grow: 0 }, { flavor: 'chocolate', grow: 0 }, ...Array(START_SPACES - 2).fill(null)],
        hotbar: Array(HOTBAR_SIZE).fill(null), storage: Array(STORAGE_SIZE).fill(null),
        seen: ['vanilla', 'chocolate'], upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
        mutations: {}, avatar: fixAvatar(null), bought: {}, hand: -1, serveProgress: 0,
      };
    }

    // everyone an admin can see in the Ban list: players here now, then saved players who are away
    function playerList() {
      const online = [...stands.values()].map(s => ({ key: s.key, name: s.name, online: true, money: s.money,
        admin: ADMIN_NAMES.includes(s.key) }));
      const away = Object.entries(saves).filter(([key]) => !online.some(p => p.key === key))
        .map(([key, sv]) => ({ key, name: sv.name || key, online: false, money: sv.money || 0, admin: ADMIN_NAMES.includes(key) }));
      return [...online, ...away];
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
      // every mutation going on gets its own chance; several can stack on one scoop
      c.mutations = event.active.filter(() => Math.random() < MUTATION_CHANCE).map(e => e.id);
      for (const id of c.mutations) {
        amount *= mutationById[id].mult;
        stand.mutations[id] = (stand.mutations[id] || 0) + 1;
      }
      c.mutation = c.mutations[0] || null;
      amount = Math.round(amount * 100) / 100;
      stand.money += amount;
      stand.totalEarned += amount;
      stand.sold++;
      c.served = true;
      sendOffCustomer(c);
      broadcast({ type: 'sale', standId: stand.id, customerId: c.id, flavor: c.flavor,
        amount, golden: c.golden, mutation: c.mutation, mutations: c.mutations });
    }

    // start a mutation; stack = keep the ones already going (admins only)
    function startMutation(id, stack = false) {
      const m = mutationById[id] || pickMutation();
      if (!stack) endMutations();
      const running = event.active.find(e => e.id === m.id);
      if (running) running.left = MUTATION_LENGTH_MIN * 60;
      else event.active.push({ id: m.id, left: MUTATION_LENGTH_MIN * 60 });
      broadcast({ type: 'mutationStart', mutation: m.id });
    }

    function endMutations() {
      for (const e of event.active) broadcast({ type: 'mutationEnd', mutation: e.id });
      if (event.active.length) event.next = pick(MUTATION_GAPS_MIN) * 60;
      event.active = [];
    }

    function restock() {
      shop.stock = rollStock();
      shop.left = RESTOCK_SEC;
      for (const s of stands.values()) s.bought = {};
      broadcast({ type: 'restock' });
    }

    function updateTimers(dt) {
      if (event.active.length) {
        for (const e of event.active) e.left -= dt;
        for (const e of event.active.filter(e => e.left <= 0)) broadcast({ type: 'mutationEnd', mutation: e.id });
        event.active = event.active.filter(e => e.left > 0);
        if (!event.active.length) event.next = pick(MUTATION_GAPS_MIN) * 60;
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
        event: {
          id: event.active[0]?.id || null,
          ids: event.active.map(e => e.id),
          left: Math.ceil(Math.max(0, ...event.active.map(e => e.left))),
          next: Math.ceil(event.next),
        },
        shop: { stock: shop.stock, left: Math.ceil(shop.left) },
        stands: [...stands.values()].map(s => ({
          id: s.id, name: s.name, slot: s.slot, color: s.color,
          money: s.money, totalEarned: s.totalEarned, sold: s.sold,
          spaces: s.spaces, tubs: s.tubs, hotbar: s.hotbar, storage: s.storage, seen: s.seen,
          upgrades: s.upgrades, mutations: s.mutations, bought: s.bought,
          x: Math.round(s.x), y: Math.round(s.y), hand: s.hand, admin: !!s.admin, avatar: s.avatar,
          serve: s.queue.length ? s.serveProgress / SERVE_TIME : 0,
        })),
        customers: [...customers.values()].map(c => ({
          id: c.id, x: Math.round(c.x), y: Math.round(c.y), flavor: c.flavor,
          golden: c.golden, mutation: c.mutation, mutations: c.mutations, state: c.state, look: c.look,
          served: !!c.served,
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
        const key = name.toLowerCase();
        if ([...stands.values()].some(s => s.key === key)) {
          return err('Someone with that name is already playing.');
        }
        // admin names belong to the first device that used them
        const device = String(msg.device || '').slice(0, 64);
        const isAdminName = ADMIN_NAMES.includes(key);
        const lockedTo = saves[key]?.adminDevice;
        if (isAdminName && lockedTo && lockedTo !== device) {
          return err('That name is taken. Please pick a different name.');
        }
        if (isAdminName && !adminCodeOk(key, msg.adminCode)) {
          return conn.send({ type: 'error', needCode: true,
            text: msg.adminCode ? 'Wrong admin code.' : 'That name needs the secret admin code.' });
        }
        const s = createStand(conn, name);
        if (!s) return err('The park is full (12 stands). Try again later!');
        conn.standId = s.id;
        s.admin = isAdminName;
        if (s.admin && device) s.adminDevice = device;
        if (s.admin && s.money < ADMIN_MONEY) s.money = ADMIN_MONEY;
        conn.send({ type: 'welcome', id: s.id, world: WORLD, slots: SLOTS,
          returning: !!saves[s.key], admin: s.admin });
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
      } else if (msg.type === 'setAvatar') {
        stand.avatar = fixAvatar({ ...stand.avatar, ...(msg.avatar || {}) });
      } else if (msg.type === 'scoop') {
        stand.clicks++;
      } else if (msg.type === 'buy') {
        const f = flavorById[msg.flavor];
        if (!f || f.adminOnly) return;
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
      } else if (msg.type === 'gift') {
        // give money or ice cream to another player in the park
        const target = stands.get(Number(msg.to));
        if (!target || target === stand) return err('That player left the park.');
        const now = Date.now();
        if (now - (stand.lastGift || 0) < 1000) return err('Slow down! Wait a second between gifts.');
        if (msg.money !== undefined) {
          const amount = Math.floor(Number(msg.money) || 0);
          if (amount <= 0) return err('Type how much money to gift.');
          if (amount > stand.money) return err("You don't have that much money!");
          stand.money -= amount;
          target.money += amount;
          stand.lastGift = now;
          target.conn.send({ type: 'gift', from: stand.name, money: amount });
          conn.send({ type: 'giftSent', to: target.name, money: amount });
          return;
        }
        const f = flavorById[msg.flavor];
        if (!f) return;
        const have = [...stand.hotbar, ...stand.storage]
          .reduce((n, s) => n + (s && s.flavor === f.id ? s.count : 0), 0);
        const count = Math.min(have, Math.max(1, Math.floor(Number(msg.count) || 1)));
        if (!have) return err(`You don't have any ${f.name}.`);
        // only send what fits in their hotbar and Inventory
        const room = [...target.hotbar, ...target.storage].reduce((n, s) =>
          n + (!s ? MAX_STACK : s.flavor === f.id ? MAX_STACK - s.count : 0), 0);
        const give = Math.min(count, room);
        if (!give) return err(`${target.name}'s inventory is full!`);
        let left = give;
        for (const list of [stand.hotbar, stand.storage]) {
          for (let i = 0; i < list.length && left > 0; i++) {
            const s = list[i];
            if (!s || s.flavor !== f.id) continue;
            const n = Math.min(left, s.count);
            s.count -= n; left -= n;
            if (s.count <= 0) list[i] = null;
          }
        }
        addItem(target.storage, f.id, addItem(target.hotbar, f.id, give));
        if (!target.seen.includes(f.id)) target.seen.push(f.id);
        stand.lastGift = now;
        target.conn.send({ type: 'gift', from: stand.name, flavor: f.id, count: give });
        conn.send({ type: 'giftSent', to: target.name, flavor: f.id, count: give });
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
      } else if (stand.admin && msg.type === 'adminAnnounce') {
        // All Server Talk: an admin's message pops up on everyone's screen
        const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 150);
        const now = Date.now();
        if (!text || now - (stand.lastAnnounce || 0) < 1500) return;
        stand.lastAnnounce = now;
        broadcast({ type: 'announce', from: stand.name, text });
      } else if (stand.admin && msg.type === 'adminPlayers') {
        conn.send({ type: 'players', players: playerList() });
      } else if (stand.admin && msg.type === 'adminBan') {
        // Ban: the player loses everything and starts over
        const key = String(msg.key || '').toLowerCase();
        if (ADMIN_NAMES.includes(key)) return err("You can't ban an admin.");
        const target = [...stands.values()].find(s => s.key === key);
        if (target) {
          for (const id of target.queue) { const c = customers.get(id); if (c) sendOffCustomer(c); }
          target.queue = [];
          Object.assign(target, freshProgress());
          target.conn.send({ type: 'banned', by: stand.name });
        } else if (saves[key]) {
          const { adminDevice, name } = saves[key];
          saves[key] = { name, ...(adminDevice ? { adminDevice } : {}), ...freshProgress() };
        } else return err('No player with that name.');
        conn.send({ type: 'admin', text: `🚫 ${target ? target.name : saves[key].name} was banned and has to start over.` });
        conn.send({ type: 'players', players: playerList() });
      } else if (stand.admin && msg.type === 'adminEndMutation') {
        endMutations();
      } else if (stand.admin && msg.type === 'adminMutations') {
        // turn on one or more mutations at once, on top of the ones already going
        const ids = (Array.isArray(msg.ids) ? msg.ids : []).filter(id => mutationById[id]).slice(0, MUTATIONS.length);
        for (const id of ids) startMutation(id, true);
      } else if (stand.admin && msg.type === 'adminSpawn') {
        // put any ice cream straight onto your stand, fully grown
        const f = flavorById[msg.flavor];
        if (!f) return err('No ice cream with that name.');
        let want = Math.min(stand.spaces, Math.max(1, Math.floor(Number(msg.count) || 1)));
        let placed = 0;
        for (let i = 0; i < stand.tubs.length && placed < want; i++) {
          if (!stand.tubs[i]) { stand.tubs[i] = { flavor: f.id, grow: 0 }; placed++; }
        }
        if (!placed) return err('Your stand is full! Take a tub off or buy Extra Space.');
        if (!stand.seen.includes(f.id)) stand.seen.push(f.id);
        conn.send({ type: 'admin', text: `Spawned ${placed} ${f.name} on your stand` });
      } else if (stand.admin && msg.type === 'testMutation') {
        // test button: start a (new) mutation event right away
        startMutation(msg.id);
      } else if (stand.admin && msg.type === 'testMoney') {
        stand.money += 1000;
        stand.totalEarned += 1000;
      } else if (stand.admin && msg.type === 'testRestock') {
        restock();
      } else if (stand.admin && msg.type === 'testGrow') {
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

  const Engine = { createGame, WORLD, SLOTS, SHOP, AVATAR_SHOP, REACH, chestPos, tubPos };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(this);
