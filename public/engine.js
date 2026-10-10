// The game rules: players, stands, customers, the shop, inventories and mutation events.
// Runs on the server for multiplayer, or right in the browser for the single-file version.
// Each player connection is an object with a send(msg) function.
(function (root) {
  const GameData = typeof module !== 'undefined' && module.exports
    ? require('./gamedata.js') : root.GameData;
  const { RARITIES, FLAVORS, TOPPINGS, PETS, MAX_PETS, LUCKY_BLOCKS, UPGRADES, upgradeCost, scoopSeconds, START_MONEY, shopCost, START_SPACES, SPACES_PER_BUY, spaceCost, spacesPerBuy, AVATAR,
    CYBER, CYBER_ADMINS_ONLY, CYBER_EVENT, CYBER_PASS, ICE_CREAM_PRICES, GAME_PASSES, SHARD_SCOOPS, SHARD_WEEKLY,
    MUTATIONS, MUTATION_GAPS_MIN, MUTATION_LENGTH_MIN, MUTATION_CHANCE,
    RESTOCK_SEC, HOTBAR_SIZE, STORAGE_SIZE, MAX_STACK, PET_SELL, sellPrice } = GameData;

  // ---------- park layout (shared with the browser for drawing and clicking) ----------
  // two columns of plots on each side, and a plaza with the shops down the middle
  const WORLD = { width: 1800, height: 1290 };
  const PET_SHOP = { x: 900, y: 230 };    // 🐾 Pet Shop (top of the plaza)
  const SHOP = { x: 900, y: 530 };        // 🛒 Supplies Shop, right in the middle of the park
  const AVATAR_SHOP = { x: 900, y: 830 }; // 👕 Avatar Shop
  const SELL_SHOP = { x: 900, y: 1120 };  // 💰 Sell Shop (bottom of the plaza)
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

  // 4 x 3 grid of plots: two columns left of the plaza, two columns right of it
  const SLOTS = [];
  for (let row = 0; row < 3; row++) {
    for (const x of [170, 483, 1317, 1630]) {
      SLOTS.push({ x, y: 230 + row * 300 });
    }
  }

  // where the Inventory chest sits on a plot
  const chestPos = slot => ({ x: slot.x + 128, y: slot.y + 30 });

  // where flavor space i sits on the stand counter (up to 7 per row)
  // (with lots of spaces they get smaller: 10 per row, so up to 30 still fit on the counter)
  function tubPos(slot, i, spaces) {
    const big = spaces > 14;
    const per = big ? 10 : 7, gap = big ? 16.5 : 23, rowH = big ? 18 : 26;
    const row = Math.floor(i / per);
    const inRow = Math.min(per, spaces - row * per);
    const col = i % per;
    return { x: slot.x - ((inRow - 1) * gap) / 2 + col * gap, y: slot.y + (big ? 7 : 9) + row * rowH, s: big ? 0.72 : 1 };
  }

  const flavorById = Object.fromEntries(FLAVORS.map(f => [f.id, f]));
  const toppingById = Object.fromEntries(TOPPINGS.map(t => [t.id, t]));
  const itemById = { ...flavorById, ...toppingById }; // things that go in the hotbar and Inventory
  const petById = Object.fromEntries(PETS.map(p => [p.id, p]));
  const blockById = Object.fromEntries(LUCKY_BLOCKS.map(b => [b.id, b]));

  // ---------- wearing pets: up to MAX_WORN follow you, and their money boosts add up ----------
  const MAX_WORN = 3;
  const petBoost = list => list.reduce((sum, id) => sum + (petById[id] ? petById[id].boost : 0), 0);
  const countOf = (list, id) => list.filter(x => x === id).length;
  // the pets you own, best first
  const bestPets = pets => [...pets].sort((a, b) => petById[b].boost - petById[a].boost);
  // keep only worn pets you still own (after gifts and trades)
  function fixWorn(who) {
    const out = [];
    for (const id of who.worn || []) if (petById[id] && out.length < MAX_WORN && countOf(out, id) < countOf(who.pets, id)) out.push(id);
    who.worn = out;
  }
  // a new pet goes on if there's room, or swaps out your weakest pet if it's better
  function autoWear(who, id) {
    if (who.worn.length < MAX_WORN) { who.worn.push(id); return true; }
    const weakest = who.worn.reduce((w, x) => petById[x].boost < petById[w].boost ? x : w);
    if (petById[weakest].boost >= petById[id].boost) return false;
    who.worn.splice(who.worn.indexOf(weakest), 1, id);
    return true;
  }

  // open a lucky block: roll a rarity with the block's odds, then a pet of that rarity
  function rollPet(block) {
    let r = Math.random() * 100;
    let rarity = Object.keys(block.odds)[0];
    for (const [k, chance] of Object.entries(block.odds)) {
      r -= chance;
      if (r <= 0) { rarity = k; break; }
    }
    // a block with its own pets (the Cyber Block) only gives those; the others never give them
    return pick(PETS.filter(p => p.rarity === rarity && (block.ownPets ? p.block === block.id : !p.block)));
  }
  const mutationById = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));

  // ---------- ⚡ who can see the Cyber stuff ----------
  // In the online game only admins can see it for now (CYBER_ADMINS_ONLY). Everyone else never
  // gets the Cyber Block, Cyber pets (except ones someone is wearing, which follow them around for all to see), Robo Ice Cream, the Robo look, the Cyber mutation or the Passes,
  // and the messages they get from the server have all of it taken out.
  const seesCyber = s => !CYBER_ADMINS_ONLY || !!s.admin;
  const isCyber = id => id === 'cyber' || (flavorById[id] || petById[id] || {}).rarity === 'cyber' || petById[id]?.event === 'cyber';
  const noCyber = list => (list || []).filter(id => !isCyber(id));
  const bundleHasCyber = b => Object.keys(b.items).some(isCyber) || Object.keys(b.pets).some(isCyber);
  function hideRobo(avatar) {
    const out = { ...avatar };
    for (const part of Object.keys(out)) if (out[part] === 'robo') out[part] = AVATAR[part][0];
    return out;
  }
  function hideCyberMutations(c) {
    if (!(c.mutations || []).some(isCyber)) return c;
    const mutations = noCyber(c.mutations);
    return { ...c, mutations, mutation: mutations[0] || null };
  }
  // a server message the way someone who can't see the Cyber stuff gets it (null = they don't get it)
  function hideCyber(msg) {
    if (msg.type === 'mutationStart' || msg.type === 'mutationEnd') return isCyber(msg.mutation) ? null : msg;
    if (msg.type === 'sale') return isCyber(msg.flavor) ? null : hideCyberMutations(msg);
    if (msg.type !== 'state') return msg;
    const ids = noCyber(msg.event.ids);
    const stock = { ...msg.shop.stock };
    for (const id of Object.keys(stock)) if (isCyber(id)) delete stock[id];
    const slots = list => list.map(x => x && isCyber(x.flavor) ? null : x);
    return { ...msg, cyber: null,
      event: { ...msg.event, id: ids[0] || null, ids },
      shop: { ...msg.shop, stock },
      stands: msg.stands.map(({ passXP, passClaimed, premiumPass, shards, ...s }) => {
        const mutations = { ...s.mutations };
        delete mutations.cyber;
        return { ...s, tubs: slots(s.tubs), hotbar: slots(s.hotbar), storage: slots(s.storage), seen: noCyber(s.seen),
          // pets someone is wearing show to everyone; the rest of their Cyber pets stay hidden
          pets: noCyber(s.pets), worn: s.worn, mutations, avatar: hideRobo(s.avatar) };
      }),
      customers: msg.customers.filter(c => !isCyber(c.flavor)).map(c => hideCyberMutations({ ...c, robo: false })) };
  }
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

  // ---------- chat ----------
  const BAD_WORDS = ['fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'cunt', 'damn',
    'crap', 'slut', 'whore', 'retard', 'nigger', 'nigga', 'fag', 'stupid', 'idiot', 'dumb', 'loser', 'shut up', 'hate you'];
  const BAD_RE = new RegExp(BAD_WORDS.map(w => w.replace(/ /g, '\\s*')).join('|'), 'gi');

  // keep chat short, on one line, and kind
  function cleanChat(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120).replace(BAD_RE, m => '*'.repeat(m.length));
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
      if (s && itemById[s.flavor] && s.count > 0) out[i] = { flavor: s.flavor, count: s.count };
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

  // ---------- gifts and trades ----------
  // a bundle is { money, items: { itemId: count }, pets: { petId: count } }
  function cleanBundle(b) {
    b = b || {};
    const out = { money: Math.min(1e18, Math.max(0, Math.floor(Number(b.money) || 0))), items: {}, pets: {} };
    for (const [id, n] of Object.entries(b.items || {})) {
      const c = Math.min(99999, Math.floor(Number(n) || 0));
      if (itemById[id] && c > 0) out.items[id] = c;
    }
    for (const [id, n] of Object.entries(b.pets || {})) {
      const c = Math.min(MAX_PETS, Math.floor(Number(n) || 0));
      if (petById[id] && c > 0) out.pets[id] = c;
    }
    return out;
  }
  const bundleEmpty = b => !b.money && !Object.keys(b.items).length && !Object.keys(b.pets).length;

  const countItem = (who, id) => [...who.hotbar, ...who.storage].reduce((n, s) => n + (s && s.flavor === id ? s.count : 0), 0);

  // take a bundle out of someone's stuff; returns an error message if they don't have it all
  function takeBundle(who, b) {
    if (b.money > who.money) return `${who.name} doesn't have that much money.`;
    for (const [id, n] of Object.entries(b.items)) {
      if (countItem(who, id) < n) return `${who.name} doesn't have ${n} ${itemById[id].name}.`;
    }
    for (const [id, n] of Object.entries(b.pets)) {
      if (who.pets.filter(p => p === id).length < n) return `${who.name} doesn't have ${n} ${petById[id].name}.`;
    }
    who.money -= b.money;
    for (const [id, n] of Object.entries(b.items)) {
      let left = n;
      for (const list of [who.hotbar, who.storage]) {
        for (let i = 0; i < list.length && left > 0; i++) {
          const s = list[i];
          if (!s || s.flavor !== id) continue;
          const k = Math.min(left, s.count);
          s.count -= k; left -= k;
          if (s.count <= 0) list[i] = null;
        }
      }
    }
    for (const [id, n] of Object.entries(b.pets)) {
      for (let k = 0; k < n; k++) who.pets.splice(who.pets.indexOf(id), 1);
    }
    return null;
  }

  // add a bundle to someone's stuff; returns an error message if it doesn't fit
  function addBundle(who, b) {
    who.money += b.money;
    for (const [id, n] of Object.entries(b.items)) {
      if (addItem(who.storage, id, addItem(who.hotbar, id, n)) > 0) return `${who.name}'s inventory is too full!`;
    }
    for (const [id, n] of Object.entries(b.pets)) for (let k = 0; k < n; k++) who.pets.push(id);
    if (who.pets.length > MAX_PETS) return `${who.name} has too many pets (the most is ${MAX_PETS})!`;
    return null;
  }

  // swap bundles between two players all at once: either everything happens, or nothing does
  function exchange(a, b, fromA, fromB) {
    const copy = s => ({ name: s.name, money: s.money, pets: [...s.pets],
      hotbar: s.hotbar.map(x => x && { ...x }), storage: s.storage.map(x => x && { ...x }) });
    const ca = copy(a), cb = copy(b);
    const error = takeBundle(ca, fromA) || takeBundle(cb, fromB) || addBundle(cb, fromA) || addBundle(ca, fromB);
    if (error) return error;
    for (const [real, c, got] of [[a, ca, fromB], [b, cb, fromA]]) {
      Object.assign(real, { money: c.money, pets: c.pets, hotbar: c.hotbar, storage: c.storage });
      fixWorn(real);
      for (const id of Object.keys(got.pets)) for (let k = 0; k < got.pets[id]; k++) autoWear(real, id);
      for (const id of Object.keys(got.items)) if (flavorById[id] && !real.seen.includes(id)) real.seen.push(id);
    }
    return null;
  }

  // backup (server only): { seal(key, save) -> blob, open(key, blob) -> save or null }.
  // Each player's browser keeps a sealed copy of their progress. If the server forgets them
  // (Render wipes its files on every update), the copy brings their progress back when they rejoin.
  // The seal means nobody can edit their copy to give themselves money.
  function createGame({ saves = {}, backup = null } = {}) {
    const stands = new Map();     // id -> stand (one per connected player)
    const customers = new Map();  // id -> customer
    // ⚡ the Cyber Event is on for one week (admins can switch it on or off to test with /cyber on|off|auto)
    let cyberOverride = null;
    // ⚡ Cyber Storms: during the event the Cyber mutation starts by itself every 30 minutes, for 3 minutes
    const STORM_EVERY = 30 * 60, STORM_LENGTH = 3 * 60;
    let stormNext = 5 * 60; // the first one 5 minutes after the server starts
    const cyberOn = () => CYBER && (cyberOverride ?? (Date.now() >= CYBER_EVENT.start && Date.now() < CYBER_EVENT.end));
    const trades = new Map();     // trade offers waiting for an answer: id -> { id, from, to, give, get, left }
    let nextId = 1;

    // mutation events: the ones going on now (admins can run several at once),
    // and the countdown (seconds) to the next natural one
    const event = { active: [], next: pick(MUTATION_GAPS_MIN) * 60 };
    // the shop's stock is the same for everyone; each player can buy up to that many of each
    const shop = { stock: rollStock(), left: RESTOCK_SEC };

    function toSave(s) {
      return { name: s.name, money: s.money, totalEarned: s.totalEarned, sold: s.sold,
        spaces: s.spaces, tubs: s.tubs, hotbar: s.hotbar, storage: s.storage, seen: s.seen,
        upgrades: s.upgrades, mutations: s.mutations, avatar: s.avatar, pets: s.pets, worn: s.worn,
        ...(CYBER ? { passXP: s.passXP, passClaimed: s.passClaimed, premiumPass: s.premiumPass } : {}),
        shards: s.shards, shardWeek: s.shardWeek, shardScoops: s.shardScoops, giftDay: s.giftDay,
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
      const oldFlavors = saved.tubs ? null : (saved.flavors ?? []); // older saves; new players start with an empty stand
      (saved.tubs || oldFlavors.map(f => ({ flavor: f, grow: 0 }))).slice(0, spaces).forEach((t, i) => {
        if (t && flavorById[t.flavor]) {
          tubs[i] = { flavor: t.flavor, grow: Math.max(0, t.grow || 0) };
          if (toppingById[t.topping]) tubs[i].topping = t.topping;
        }
      });

      const s = SLOTS[slot];
      const stand = {
        id: nextId++, conn, key, name, slot,
        color: COLORS[slot % COLORS.length],
        money: saved.money ?? START_MONEY,
        totalEarned: saved.totalEarned ?? 0,
        sold: saved.sold ?? 0,
        spaces, tubs,
        hotbar: fixSlots(saved.hotbar, HOTBAR_SIZE),
        storage: fixSlots(saved.storage, STORAGE_SIZE),
        seen: saved.seen ?? [...new Set(tubs.filter(Boolean).map(t => t.flavor))], // flavors you've had
        upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, saved.upgrades?.[k] ?? 0])),
        mutations: saved.mutations ?? {}, // mutation id -> scoops sold with it
        avatar: fixAvatar(saved.avatar),
        // (the Cyber Hydra became the Cyber Whale)
        pets: (saved.pets || []).map(id => id === 'hydra' ? 'cyberwhale' : id).filter(id => petById[id]).slice(0, MAX_PETS),
        passXP: saved.passXP || 0,                                   // ⚡ scoops sold during the Cyber Event
        passClaimed: { free: [...(saved.passClaimed?.free || [])], premium: [...(saved.passClaimed?.premium || [])] },
        premiumPass: !!saved.premiumPass,
        shards: Math.max(0, Math.floor(saved.shards || 0)),        // 💎
        shardWeek: saved.shardWeek || { week: 0, earned: 0 },      // shards earned by playing this week
        shardScoops: saved.shardScoops || 0,                       // scoops toward the next shard
        giftDay: saved.giftDay || 0,                               // ⚡ the day the daily event gift was last claimed
        worn: (saved.worn || (saved.pet ? [saved.pet] : [])).map(id => id === 'hydra' ? 'cyberwhale' : id), // the pets following you
        adminDevice: saved.adminDevice,
        bought: {},                       // tubs bought since the last restock
        x: s.x + 60, y: s.y + 110,        // the player's character
        hand: -1,                         // hotbar slot in hand, -1 = nothing
        queue: [],
        serveProgress: 0,                 // seconds toward the next scoop sold
        spawnTimer: 0,
        lastScoop: 0,                     // when you last pressed Scoop!
      };
      fixWorn(stand);
      stands.set(stand.id, stand);
      return stand;
    }

    // the progress a brand-new player starts with (used when an admin bans someone)
    function freshProgress() {
      return {
        money: START_MONEY, totalEarned: 0, sold: 0, spaces: START_SPACES,
        tubs: Array(START_SPACES).fill(null),
        hotbar: Array(HOTBAR_SIZE).fill(null), storage: Array(STORAGE_SIZE).fill(null),
        seen: [], upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
        mutations: {}, avatar: fixAvatar(null), pets: [], worn: [], bought: {},
        passXP: 0, passClaimed: { free: [], premium: [] }, premiumPass: false, hand: -1, serveProgress: 0,
        shards: 0, shardWeek: { week: 0, earned: 0 }, shardScoops: 0,
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
      const tub = pick(ready);
      const c = {
        id: nextId++,
        x: fromLeft ? -30 : WORLD.width + 30,
        y: slot.y + 95 + Math.random() * 80,
        standId: stand.id,
        flavor: null,
        golden: Math.random() < 0.05, // lucky customer pays triple
        robo: cyberOn() && Math.random() < 0.15, // ⚡ during the Cyber Event some customers are robots that pay double
        mutation: null,
        state: 'walking',
        look: Math.floor(Math.random() * 6),
      };
      c.flavor = tub.flavor;
      c.topping = tub.topping || null; // toppings make the scoop worth more
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
      if (toppingById[c.topping]) amount *= 1 + toppingById[c.topping].bonus;
      amount *= 1 + petBoost(stand.worn); // every pet you wear adds its boost
      if (c.golden) amount *= 3;
      if (c.robo && seesCyber(stand)) amount *= 2;
      // every mutation going on gets its own chance; several can stack on one scoop
      c.mutations = event.active.filter(e => (seesCyber(stand) || !isCyber(e.id)) && Math.random() < MUTATION_CHANCE).map(e => e.id);
      for (const id of c.mutations) {
        amount *= mutationById[id].mult;
        stand.mutations[id] = (stand.mutations[id] || 0) + 1;
      }
      c.mutation = c.mutations[0] || null;
      amount = Math.round(amount * 100) / 100;
      stand.money += amount;
      stand.totalEarned += amount;
      stand.sold++;
      if (cyberOn()) stand.passXP++;
      earnShard(stand);
      c.served = true;
      sendOffCustomer(c);
      broadcast({ type: 'sale', standId: stand.id, customerId: c.id, flavor: c.flavor,
        amount, golden: c.golden, mutation: c.mutation, mutations: c.mutations, topping: c.topping });
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
      if (cyberOn()) {
        stormNext -= dt;
        if (stormNext <= 0) {
          stormNext = STORM_EVERY;
          const running = event.active.find(e => e.id === 'cyber');
          if (running) running.left = Math.max(running.left, STORM_LENGTH);
          else event.active.push({ id: 'cyber', left: STORM_LENGTH }); // joins any mutation already going on
          broadcast({ type: 'mutationStart', mutation: 'cyber' });
          broadcast({ type: 'chat', id: 0, from: '⚡ Cyber Storm', admin: false, text: 'A CYBER STORM is here! Scoops can turn Cyber (x50 money) for 3 minutes!' }, true);
        }
      }
      shop.left -= dt;
      if (shop.left <= 0) restock();
    }

    let backupTimer = 0;
    function tick(dt) {
      updateTimers(dt);
      backupTimer -= dt;
      if (backupTimer <= 0) { // refresh everyone's backup every few seconds
        backupTimer = 5;
        for (const s of stands.values()) sendBackup(s);
      }
      for (const [id, t] of trades) {
        t.left -= dt;
        if (t.left > 0) continue;
        trades.delete(id);
        const from = stands.get(t.from);
        if (from) from.conn.send({ type: 'tradeDone', ok: false, text: 'Nobody answered your trade in time.' });
      }

      for (const stand of stands.values()) {
        for (const t of stand.tubs) if (t && t.grow > 0) t.grow = Math.max(0, t.grow - dt);

        // ⏱️ a scoop is sold every few seconds (see scoopSeconds), only if there's grown ice cream
        const every = scoopSeconds(readyTubs(stand).map(t => t.flavor));
        stand.scoopEvery = every;
        if (!every) { stand.serveProgress = 0; continue; }
        stand.serveProgress = Math.min(every, stand.serveProgress + dt);

        // customers walk up and wait in line, so one is ready each time a scoop is sold
        stand.spawnTimer -= dt;
        if (stand.spawnTimer <= 0) {
          stand.spawnTimer = Math.min(3, every * 0.6) * (0.7 + Math.random() * 0.6);
          if (stand.queue.length < Math.min(MAX_QUEUE, 2 + Math.ceil(4 / every))) spawnCustomer(stand);
        }

        const front = customers.get(stand.queue[0]);
        if (front && front.state === 'waiting' && stand.serveProgress >= every - 1e-6) completeSale(stand);
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
        cyber: CYBER ? { on: cyberOn(), endsAt: CYBER_EVENT.end, override: cyberOverride } : null,
        stands: [...stands.values()].map(s => ({
          id: s.id, name: s.name, slot: s.slot, color: s.color,
          money: s.money, totalEarned: s.totalEarned, sold: s.sold,
          spaces: s.spaces, tubs: s.tubs, hotbar: s.hotbar, storage: s.storage, seen: s.seen,
          upgrades: s.upgrades, mutations: s.mutations, bought: s.bought,
          x: Math.round(s.x), y: Math.round(s.y), hand: s.hand, admin: !!s.admin, avatar: s.avatar,
          pets: s.pets, worn: s.worn,
          ...(CYBER ? { passXP: s.passXP, passClaimed: s.passClaimed, premiumPass: s.premiumPass } : {}),
          shards: s.shards, giftDay: s.giftDay,
          serve: s.scoopEvery ? s.serveProgress / s.scoopEvery : 0, scoopEvery: s.scoopEvery || null,
        })),
        customers: [...customers.values()].map(c => ({
          id: c.id, x: Math.round(c.x), y: Math.round(c.y), flavor: c.flavor, topping: c.topping,
          golden: c.golden, robo: !!c.robo, mutation: c.mutation, mutations: c.mutations, state: c.state, look: c.look,
          served: !!c.served,
        })),
      });
    }

    // 💎 1 shard for every SHARD_SCOOPS scoops sold, up to SHARD_WEEKLY shards a week
    function earnShard(stand) {
      if (++stand.shardScoops < SHARD_SCOOPS) return;
      stand.shardScoops = 0;
      const week = Math.floor(Date.now() / (7 * 86400e3));
      if (stand.shardWeek.week !== week) stand.shardWeek = { week, earned: 0 };
      if (stand.shardWeek.earned >= SHARD_WEEKLY) return;
      stand.shardWeek.earned++;
      stand.shards++;
    }

    // ⚡ give a Cyber Pass prize; returns an error message if it doesn't fit
    function givePrize(stand, prize) {
      if (prize.item) {
        const copy = { hotbar: stand.hotbar.map(x => x && { ...x }), storage: stand.storage.map(x => x && { ...x }) };
        if (addItem(copy.storage, prize.item, addItem(copy.hotbar, prize.item, prize.count || 1)) > 0) return 'Make room in your inventory first.';
        stand.hotbar = copy.hotbar; stand.storage = copy.storage;
        if (flavorById[prize.item] && !stand.seen.includes(prize.item)) stand.seen.push(prize.item);
      }
      if (prize.block) {
        const n = prize.count || 1;
        if (stand.pets.length + n > MAX_PETS) return `You have too many pets (the most is ${MAX_PETS}).`;
        for (let k = 0; k < n; k++) {
          const pet = rollPet(blockById[prize.block]);
          stand.pets.push(pet.id);
          const wearing = autoWear(stand, pet.id);
          stand.conn.send({ type: 'petGot', pet: pet.id, block: prize.block, equipped: wearing });
          if (RARITIES[pet.rarity].order >= 5) {
            broadcast({ type: 'chat', id: 0, from: '⚡ Cyber Pass', admin: false,
              text: `WOW! ${stand.name} got a ${RARITIES[pet.rarity].name} ${pet.name} ${pet.emoji}!` }, true);
          }
        }
      }
      if (prize.money) stand.money += prize.money;
      return null;
    }

    function sendBackup(s) {
      if (backup) s.conn.send({ type: 'backup', key: s.key, blob: backup.seal(s.key, toSave(s)) });
    }

    // cyberOnly = only for players who can see the Cyber stuff
    function broadcast(msg, cyberOnly = false) {
      let hidden; // the message without the Cyber stuff, worked out once if someone needs it
      for (const s of stands.values()) {
        if (seesCyber(s)) s.conn.send(msg);
        else if (!cyberOnly) {
          if (hidden === undefined) hidden = hideCyber(msg);
          if (hidden) s.conn.send(hidden);
        }
      }
    }

    // ---------- player actions ----------
    function handle(conn, msg) {
      const stand = conn.standId && stands.get(conn.standId);
      const err = text => conn.send({ type: 'error', text });

      if (msg.type === 'join' && !stand) {
        const name = String(msg.name || '').replace(/[^\w \-]/g, '').trim().slice(0, 16);
        if (!name) return err('Please pick a name.');
        const key = name.toLowerCase();
        // the same player logging in again (a refresh, or another window): the server has checked their
        // password and says takeOver, so the new login replaces the old one
        const existing = [...stands.values()].find(s => s.key === key);
        if (existing && !msg.takeOver) return err('Someone with that name is already playing.');
        // the server lost this player's progress (an update wiped it): bring it back from their backup
        let restored = false;
        if (backup && !saves[key] && msg.backup) {
          const save = backup.open(key, msg.backup);
          if (save) { saves[key] = save; restored = true; }
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
        if (existing) {
          existing.conn.send({ type: 'kicked' });
          leave(existing.conn); // saves their progress first
          existing.conn.standId = null;
        }
        const s = createStand(conn, name);
        if (!s) return err('The park is full (12 stands). Try again later!');
        conn.standId = s.id;
        s.admin = isAdminName;
        if (s.admin && device) s.adminDevice = device;
        if (s.admin && s.money < ADMIN_MONEY) s.money = ADMIN_MONEY;
        conn.send({ type: 'welcome', id: s.id, world: WORLD, slots: SLOTS, key: s.key,
          returning: !!saves[s.key], restored, admin: s.admin, cyber: seesCyber(s) });
        sendBackup(s);
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
        if (!seesCyber(stand)) stand.avatar = hideRobo(stand.avatar);
      } else if (msg.type === 'scoop') {
        // Scoop! helps a little: each press takes a quarter second off the wait (up to 4 presses a second)
        const now = Date.now();
        if (stand.scoopEvery && now - stand.lastScoop >= 250) {
          stand.lastScoop = now;
          stand.serveProgress = Math.min(stand.scoopEvery, stand.serveProgress + 0.25);
        }
      } else if (msg.type === 'buy') {
        const f = flavorById[msg.flavor];
        if (!f || (isCyber(f.id) && !seesCyber(stand))) return;
        if (!near(SHOP)) return err('Walk to the Supplies Shop to buy.');
        if ((shop.stock[f.id] || 0) - (stand.bought[f.id] || 0) <= 0) return err('Sold out! New stock soon.');
        const cost = shopCost(f);
        if (stand.money < cost) return err('Not enough money!');
        if (!fits(stand.hotbar, f.id) && !fits(stand.storage, f.id)) return err('Your inventory is full!');
        stand.money -= cost;
        stand.bought[f.id] = (stand.bought[f.id] || 0) + 1;
        if (addItem(stand.hotbar, f.id, 1) > 0) addItem(stand.storage, f.id, 1);
        if (!stand.seen.includes(f.id)) stand.seen.push(f.id);
        conn.send({ type: 'bought', flavor: f.id });
      } else if (msg.type === 'place') {
        // put the tub in your hand into an empty space on your stand
        const item = stand.hotbar[stand.hand];
        if (!item) return err('Pick an ice cream from your hotbar first.');
        if (!near(slot)) return err('Walk to your stand to place ice cream.');
        const top = toppingById[item.flavor];
        if (top) {
          // put a topping on an ice cream that doesn't have one yet
          let i = Number(msg.space);
          if (!(i >= 0 && i < stand.spaces && stand.tubs[i] && !stand.tubs[i].topping)) i = stand.tubs.findIndex(t => t && !t.topping);
          if (i === -1) return err(stand.tubs.some(Boolean) ? 'All your ice creams already have toppings!' : 'Place an ice cream first, then put the topping on it.');
          stand.tubs[i].topping = top.id;
          item.count--;
          if (item.count <= 0) stand.hotbar[stand.hand] = null;
          conn.send({ type: 'placed', topping: top.id, flavor: stand.tubs[i].flavor });
          return;
        }
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
        // the topping comes back too, if there's room
        if (tub.topping && addItem(stand.hotbar, tub.topping, 1) > 0) addItem(stand.storage, tub.topping, 1);
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
        const cost = spaceCost(stand.spaces, seesCyber(stand));
        if (cost === null || stand.tubs.includes(null)) return;
        if (stand.money < cost) return err('Not enough money!');
        stand.money -= cost;
        const add = spacesPerBuy(stand.spaces, seesCyber(stand));
        stand.spaces += add;
        for (let i = 0; i < add; i++) stand.tubs.push(null);
        conn.send({ type: 'spaceAdded', spaces: stand.spaces, added: add });
      } else if (msg.type === 'buyUpgrade') {
        const u = UPGRADES[msg.key];
        if (!u) return;
        const level = stand.upgrades[msg.key];
        if (level >= u.max) return;
        const cost = upgradeCost(msg.key, level);
        if (stand.money < cost) return err('Not enough money!');
        stand.money -= cost;
        stand.upgrades[msg.key]++;
      } else if (msg.type === 'chat') {
        // park chat: everyone playing sees it
        const text = cleanChat(msg.text);
        const now = Date.now();
        if (!text) return;
        if (now - (stand.lastChat || 0) < 1000) return err('Slow down! Wait a second between messages.');
        stand.lastChat = now;
        broadcast({ type: 'chat', id: stand.id, from: stand.name, admin: !!stand.admin, text });
      } else if (msg.type === 'buyTopping') {
        const t = toppingById[msg.topping];
        if (!t) return;
        if (!near(SHOP)) return err('Walk to the Supplies Shop to buy.');
        const n = Math.min(99, Math.max(1, Math.floor(Number(msg.count) || 1)));
        if (stand.money < t.cost * n) return err('Not enough money!');
        const left = addItem(stand.storage, t.id, addItem(stand.hotbar, t.id, n));
        const got = n - left;
        if (!got) return err('Your inventory is full!');
        // only pay for the ones that fit
        stand.money -= t.cost * got;
        conn.send({ type: 'boughtTopping', topping: t.id, count: got });
      } else if (msg.type === 'buyBlock') {
        // 🐾 open a lucky block for a random pet
        const b = blockById[msg.block];
        if (!b || (b.event && !seesCyber(stand))) return;
        if (!near(PET_SHOP)) return err('Walk to the Pet Shop to buy lucky blocks.');
        if (b.event && !cyberOn()) return err('The Cyber Event is over, so the Cyber Block is gone!');
        if (stand.money < b.cost) return err('Not enough money!');
        if (stand.pets.length >= MAX_PETS) return err(`You have too many pets (the most is ${MAX_PETS}).`);
        stand.money -= b.cost;
        const pet = rollPet(b);
        stand.pets.push(pet.id);
        const wearing = autoWear(stand, pet.id);
        conn.send({ type: 'petGot', pet: pet.id, block: b.id, equipped: wearing });
        if (RARITIES[pet.rarity].order >= 5) {
          broadcast({ type: 'chat', id: 0, from: '🐾 Pet Shop', admin: false,
            text: `WOW! ${stand.name} got a ${RARITIES[pet.rarity].name} ${pet.name} ${pet.emoji}!` }, isCyber(pet.id) || !!b.event);
        }
      } else if (msg.type === 'equipPet') {
        // wear one more of this pet, or take one off
        const id = msg.pet;
        if (!petById[id]) return;
        if (msg.on === false) {
          const i = stand.worn.indexOf(id);
          if (i !== -1) stand.worn.splice(i, 1);
        } else {
          if (stand.worn.length >= MAX_WORN) return err(`You can wear ${MAX_WORN} pets at once. Take one off first.`);
          if (countOf(stand.worn, id) >= countOf(stand.pets, id)) return;
          stand.worn.push(id);
        }
      } else if (CYBER && seesCyber(stand) && msg.type === 'passClaim') {
        // ⚡ claim a Cyber Pass prize you've unlocked
        if (!cyberOn()) return err('The Cyber Event is over.');
        const row = msg.row === 'premium' ? 'premium' : 'free';
        const i = Number(msg.tier);
        const prize = CYBER_PASS[row][i];
        if (!prize) return;
        if (row === 'premium' && !stand.premiumPass) return err('This row needs the ⚡ Premium Cyber Pass.');
        if (stand.passXP < prize.at) return err(`Sell ${prize.at - stand.passXP} more scoops to unlock this prize.`);
        if (stand.passClaimed[row].includes(i)) return;
        const error = givePrize(stand, prize);
        if (error) return err(error);
        stand.passClaimed[row].push(i);
        conn.send({ type: 'passPrize', row, tier: i });
      } else if (CYBER && seesCyber(stand) && msg.type === 'gamePass') {
        // 💎 Game Passes cost shards (admins have unlimited shards)
        const id = msg.id;
        const pass = GAME_PASSES.find(g => g.id === id);
        if (!pass) return;
        const price = id === 'icecream' ? ICE_CREAM_PRICES[flavorById[msg.flavor]?.rarity] : pass.shards;
        if (!price) return err('Pick an ice cream from the shop list.');
        if (!stand.admin && stand.shards < price) return err(`You need 💎 ${price - stand.shards} more shards. You get 1 for every ${SHARD_SCOOPS} scoops you sell!`);
        if (id === 'starter') {
          const items = { strawberry: 2, mint: 2 };
          const copy = { hotbar: stand.hotbar.map(x => x && { ...x }), storage: stand.storage.map(x => x && { ...x }) };
          for (const [f, n] of Object.entries(items)) {
            if (addItem(copy.storage, f, addItem(copy.hotbar, f, n)) > 0) return err('Make room in your inventory first.');
          }
          stand.hotbar = copy.hotbar; stand.storage = copy.storage;
          stand.money += 20000;
          for (const f of Object.keys(items)) if (!stand.seen.includes(f)) stand.seen.push(f);
        } else if (id === 'premium') {
          if (stand.premiumPass) return err('You already have the Premium Cyber Pass!');
          stand.premiumPass = true;
        } else if (id === 'fillall') {
          // every empty space gets a fully grown ice cream (common ones more often, like the shop)
          const empty = stand.tubs.map((t, i) => t ? -1 : i).filter(i => i >= 0);
          if (!empty.length) return err('Your stand is already full!');
          const pool = FLAVORS.filter(f => !f.adminOnly && RARITIES[f.rarity].stock.chance > 0);
          for (const i of empty) {
            let r = Math.random() * pool.reduce((sum, f) => sum + RARITIES[f.rarity].stock.chance, 0);
            const f = pool.find(f => (r -= RARITIES[f.rarity].stock.chance) <= 0) || pool[0];
            stand.tubs[i] = { flavor: f.id, grow: 0 };
            if (!stand.seen.includes(f.id)) stand.seen.push(f.id);
          }
        } else if (id === 'icecream') {
          const f = flavorById[msg.flavor];
          if (!f || f.adminOnly || !ICE_CREAM_PRICES[f.rarity]) return err('Pick an ice cream from the shop list.');
          if (addItem(stand.storage, f.id, addItem(stand.hotbar, f.id, 1)) > 0) return err('Your inventory is full!');
          if (!stand.seen.includes(f.id)) stand.seen.push(f.id);
        } else if (id === 'restock') {
          restock();
          broadcast({ type: 'chat', id: 0, from: '🛒 Supplies Shop', admin: false, text: `${stand.name} restocked the shop for everyone!` }, true);
        } else return;
        if (!stand.admin) stand.shards -= price;
        conn.send({ type: 'gamePassDone', id, flavor: msg.flavor, price });
      } else if (CYBER && seesCyber(stand) && msg.type === 'eventGift') {
        // ⚡ a free lucky block once a day during the event (the Cyber Block on the last day!)
        if (!cyberOn()) return err('The Cyber Event is over.');
        const day = Math.floor(Date.now() / 86400e3);
        if (stand.giftDay === day) return err('You already got today\'s gift. Come back tomorrow!');
        const lastDay = Date.now() >= CYBER_EVENT.end - 86400e3;
        const error = givePrize(stand, { block: lastDay ? 'cyber' : 'gold' });
        if (error) return err(error);
        stand.giftDay = day;
      } else if (CYBER && stand.admin && msg.type === 'adminCyber') {
        cyberOverride = msg.mode === 'on' ? true : msg.mode === 'off' ? false : null;
        conn.send({ type: 'admin', text: `⚡ Cyber Event is ${cyberOn() ? 'ON' : 'OFF'}` + (cyberOverride === null ? ' (following the calendar)' : '') });
      } else if (msg.type === 'sell') {
        // 💰 sell ice cream, toppings or pets at the Sell Shop
        if (!near(SELL_SHOP)) return err('Walk to the Sell Shop to sell things.');
        const pet = msg.kind === 'pet' && petById[msg.id], item = msg.kind === 'item' && itemById[msg.id];
        if (!pet && !item) return;
        const have = pet ? countOf(stand.pets, pet.id) : countItem(stand, item.id);
        const n = Math.min(have, Math.max(1, Math.floor(Number(msg.count) || 1)));
        if (n <= 0) return err(`You don't have any ${(pet || item).name}.`);
        const each = pet ? PET_SELL[pet.rarity] || 0 : sellPrice(item);
        takeBundle(stand, { money: 0, items: item ? { [item.id]: n } : {}, pets: pet ? { [pet.id]: n } : {} });
        // pets you sold stop following you
        if (pet) while (countOf(stand.worn, pet.id) > countOf(stand.pets, pet.id)) stand.worn.splice(stand.worn.indexOf(pet.id), 1);
        stand.money += each * n;
        conn.send({ type: 'sold', kind: msg.kind, id: (pet || item).id, count: n, money: each * n });
      } else if (msg.type === 'releasePet') {
        // let go of one pet you don't want (makes room for more); one you're not wearing goes first
        const id = msg.pet;
        const i = stand.pets.indexOf(id);
        if (i === -1) return;
        stand.pets.splice(i, 1);
        if (countOf(stand.worn, id) > countOf(stand.pets, id)) stand.worn.splice(stand.worn.indexOf(id), 1);
        conn.send({ type: 'petReleased', pet: id });
      } else if (msg.type === 'equipBest') {
        stand.worn = bestPets(stand.pets).slice(0, MAX_WORN);
      } else if (msg.type === 'gift' || msg.type === 'tradeOffer') {
        // 🎁 give stuff to another player, or 🤝 offer them a trade
        const target = stands.get(Number(msg.to));
        if (!target || target === stand) return err('That player left the park.');
        const now = Date.now();
        if (now - (stand.lastGift || 0) < 1000) return err('Slow down! Wait a second.');
        const give = cleanBundle(msg.give);
        const get = msg.type === 'gift' ? cleanBundle(null) : cleanBundle(msg.get);
        if ((bundleHasCyber(give) || bundleHasCyber(get)) && !(seesCyber(stand) && seesCyber(target))) {
          return err(`${target.name} can't have Cyber stuff yet. Only admins can see it for now!`);
        }
        if (msg.type === 'gift') {
          if (bundleEmpty(give)) return err('Pick something to gift first.');
          const error = exchange(stand, target, give, cleanBundle(null));
          if (error) return err(error);
          stand.lastGift = now;
          target.conn.send({ type: 'gift', from: stand.name, bundle: give });
          conn.send({ type: 'giftSent', to: target.name, bundle: give });
          return;
        }
        if (bundleEmpty(give) && bundleEmpty(get)) return err('Pick what to trade first.');
        // make sure you really have what you're offering
        const test = { name: 'You', money: stand.money, pets: [...stand.pets],
          hotbar: stand.hotbar.map(x => x && { ...x }), storage: stand.storage.map(x => x && { ...x }) };
        const error = takeBundle(test, give);
        if (error) return err(error.replace("You doesn't", "You don't"));
        stand.lastGift = now;
        for (const [id, t] of trades) if (t.from === stand.id) trades.delete(id); // one offer at a time
        // 'buy' = an offer of money for someone's ice cream (it works just like a trade)
        const kind = msg.kind === 'buy' ? 'buy' : 'trade';
        const trade = { id: nextId++, from: stand.id, to: target.id, give, get, left: 60, kind };
        trades.set(trade.id, trade);
        target.conn.send({ type: 'tradeOffer', id: trade.id, from: stand.name, give, get, kind });
        conn.send({ type: 'tradeSent', to: target.name });
      } else if (msg.type === 'tradeReply') {
        const trade = trades.get(Number(msg.id));
        if (!trade || trade.to !== stand.id) return err('That trade is over.');
        trades.delete(trade.id);
        const from = stands.get(trade.from);
        if (!from) return err('That player left the park.');
        if (!msg.accept) {
          from.conn.send({ type: 'tradeDone', ok: false, text: `${stand.name} said no to your ${trade.kind === 'buy' ? 'offer' : 'trade'}.` });
          return;
        }
        const error = exchange(from, stand, trade.give, trade.get);
        if (error) {
          from.conn.send({ type: 'tradeDone', ok: false, text: `Trade didn't work: ${error}` });
          return err(`Trade didn't work: ${error}`);
        }
        if (trade.kind === 'buy') {
          from.conn.send({ type: 'tradeDone', ok: true, text: `💰 ${stand.name} sold it to you! It's in your hotbar or Inventory.` });
          conn.send({ type: 'tradeDone', ok: true, text: `💰 You sold it to ${from.name} for $${trade.give.money.toLocaleString()}!` });
        } else {
          from.conn.send({ type: 'tradeDone', ok: true, text: `🤝 Trade with ${stand.name} done!` });
          conn.send({ type: 'tradeDone', ok: true, text: `🤝 Trade with ${from.name} done!` });
        }
      } else if (stand.admin && msg.type === 'adminMoney') {
        const amount = Math.min(1e15, Math.max(0, Number(msg.amount) || 0));
        stand.money += amount;
        conn.send({ type: 'admin', text: `Added $${amount.toLocaleString()}` });
      } else if (stand.admin && msg.type === 'adminGive') {
        // put any ice cream in your inventory, even if the shop is sold out
        const f = itemById[msg.flavor];
        if (!f) return err('No ice cream with that name.');
        const count = Math.min(990, Math.max(1, Math.floor(Number(msg.count) || 1)));
        const left = addItem(stand.storage, f.id, addItem(stand.hotbar, f.id, count));
        if (flavorById[f.id] && !stand.seen.includes(f.id)) stand.seen.push(f.id);
        conn.send({ type: 'admin', text: `Gave you ${count - left} ${f.name}` + (left ? ` (${left} didn't fit)` : '') });
        if (count > left) broadcast({ type: 'adminSpawned', by: stand.name, item: f.id, count: count - left });
      } else if (stand.admin && msg.type === 'adminAnnounce') {
        // All Server Talk: an admin's message pops up on everyone's screen
        const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 150);
        const now = Date.now();
        if (!text || now - (stand.lastAnnounce || 0) < 1500) return;
        stand.lastAnnounce = now;
        broadcast({ type: 'announce', from: stand.name, text });
      } else if (stand.admin && msg.type === 'adminGiftShards') {
        // 💎 admins give shards to a player
        const target = stands.get(Number(msg.to));
        if (!target) return err('That player left the park.');
        const n = Math.min(1e6, Math.max(1, Math.floor(Number(msg.amount) || 0)));
        if (target.admin) return err(`${target.name} is an admin and already has unlimited shards.`);
        target.shards += n;
        console.log(`[shards] ${stand.name} gave ${n} shards to ${target.name}`); // the gift log
        target.conn.send({ type: 'shardsGift', from: stand.name, amount: n });
        conn.send({ type: 'admin', text: `💎 Gave ${n.toLocaleString()} shards to ${target.name}` });
      } else if (stand.admin && msg.type === 'adminPlayers') {
        conn.send({ type: 'players', players: playerList() });
      } else if (stand.admin && msg.type === 'adminBan') {
        // Ban: the player loses everything and starts over (admins can ban other admins, or themselves)
        const key = String(msg.key || '').toLowerCase();
        const target = [...stands.values()].find(s => s.key === key);
        if (target) {
          for (const id of target.queue) { const c = customers.get(id); if (c) sendOffCustomer(c); }
          target.queue = [];
          const keepShards = target.shards; // shards may have been bought with real money, so a ban keeps them
          Object.assign(target, freshProgress(), { shards: keepShards });
          if (target.admin) target.money = ADMIN_MONEY; // a banned admin starts over like a new admin
          target.conn.send({ type: 'banned', by: stand.name, self: target === stand });
        } else if (saves[key]) {
          const { adminDevice, name, shards } = saves[key];
          saves[key] = { name, ...(adminDevice ? { adminDevice } : {}), ...freshProgress(), shards: shards || 0 };
        } else return err('No player with that name.');
        conn.send({ type: 'admin', text: target === stand ? '🚫 You banned yourself and started over.'
          : `🚫 ${target ? target.name : saves[key].name} was banned and has to start over.` });
        conn.send({ type: 'players', players: playerList() });
      } else if (stand.admin && msg.type === 'adminBlockGive') {
        // 🎁 a lucky block that opens with exactly what the admin typed (a pet, ice cream or topping)
        const pet = petById[msg.pet], item = itemById[msg.item];
        const rarity = pet ? pet.rarity : item && item.rarity;
        // show the fanciest block that could have it (toppings and admin things come in the best block)
        const block = pet && pet.block ? blockById[pet.block]
          : [...LUCKY_BLOCKS].reverse().find(b => b.odds[rarity] && !b.ownPets) || LUCKY_BLOCKS[LUCKY_BLOCKS.length - 1];
        if (pet) {
          if (stand.pets.length >= MAX_PETS) return err(`You have too many pets (the most is ${MAX_PETS}).`);
          stand.pets.push(pet.id);
          const wearing = autoWear(stand, pet.id);
          conn.send({ type: 'petGot', pet: pet.id, block: block.id, equipped: wearing });
          broadcast({ type: 'adminSpawned', by: stand.name, pet: pet.id, count: 1, where: 'block' });
        } else if (item) {
          if (addItem(stand.storage, item.id, addItem(stand.hotbar, item.id, 1)) > 0) return err('Your inventory is full!');
          if (flavorById[item.id] && !stand.seen.includes(item.id)) stand.seen.push(item.id);
          conn.send({ type: 'blockGot', item: item.id, block: block.id });
          broadcast({ type: 'adminSpawned', by: stand.name, item: item.id, count: 1, where: 'block' });
        } else return err('Nothing with that name. Try a pet like dragon, or an ice cream like void.');
      } else if (stand.admin && msg.type === 'adminRefreshAll') {
        // 🔄 everyone's game reloads (progress is saved first) and they come right back in
        for (const s of stands.values()) sendBackup(s);
        broadcast({ type: 'refresh', by: stand.name });
      } else if (stand.admin && msg.type === 'adminShopSpawn') {
        // 🏪 put any ice cream in the Supplies Shop for everyone (until the next restock)
        const f = flavorById[msg.flavor];
        if (!f) return err(toppingById[msg.flavor] ? 'Toppings are always in the shop. Pick an ice cream.' : 'No ice cream with that name.');
        const n = Math.min(99, Math.max(1, Math.floor(Number(msg.count) || 1)));
        shop.stock[f.id] = (shop.stock[f.id] || 0) + n;
        broadcast({ type: 'chat', id: 0, from: '🛒 Supplies Shop', admin: false,
          text: `${stand.name} put ${n} ${f.name} in the shop! Go get it before the next restock.` }, isCyber(f.id));
        conn.send({ type: 'admin', text: `🏪 Put ${n} ${f.name} in the Supplies Shop` });
      } else if (stand.admin && msg.type === 'adminSpawnPet') {
        // 🐾 admins can put any pet in their own pet inventory
        const pet = petById[msg.pet];
        if (!pet) return err('No pet with that name.');
        const n = Math.min(MAX_PETS - stand.pets.length, Math.max(1, Math.floor(Number(msg.count) || 1)));
        if (n <= 0) return err(`You have too many pets (the most is ${MAX_PETS}).`);
        for (let k = 0; k < n; k++) stand.pets.push(pet.id);
        for (let k = 0; k < n; k++) autoWear(stand, pet.id);
        conn.send({ type: 'admin', text: `Spawned ${n} ${pet.emoji} ${pet.name} in your pets` });
        broadcast({ type: 'adminSpawned', by: stand.name, pet: pet.id, count: n });
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
        if (placed) broadcast({ type: 'adminSpawned', by: stand.name, item: f.id, count: placed, where: 'stand' });
      } else if (stand.admin && msg.type === 'testMutation') {
        // test button: start a (new) mutation event right away
        startMutation(msg.id);
      } else if (stand.admin && msg.type === 'testMoney') {
        stand.money += 1000;
        stand.totalEarned += 1000;
      } else if (stand.admin && msg.type === 'testRestock') {
        restock();
      } else if (stand.admin && msg.type === 'adminGrow') {
        // 🌱 grow all the ice cream on one player's stand (or everyone's) right now
        const targets = msg.all ? [...stands.values()] : [stands.get(Number(msg.to))].filter(Boolean);
        if (!targets.length) return err('That player left the park.');
        for (const t of targets) {
          for (const tub of t.tubs) if (tub) tub.grow = 0;
          if (t !== stand) t.conn.send({ type: 'admin', text: `🌱 ${stand.name} grew all your ice cream!` });
        }
        conn.send({ type: 'admin', text: msg.all ? "🌱 Grew everyone's ice cream!"
          : targets[0] === stand ? '🌱 Grew all your ice cream!' : `🌱 Grew all of ${targets[0].name}'s ice cream!` });
      } else if (stand.admin && msg.type === 'testGrow') {
        for (const t of stand.tubs) if (t) t.grow = 0;
      }
    }

    function leave(conn) {
      const stand = stands.get(conn.standId);
      if (!stand) return;
      saves[stand.key] = toSave(stand);
      stands.delete(stand.id);
      for (const [id, t] of trades) if (t.from === stand.id || t.to === stand.id) trades.delete(id);
    }

    // send everyone their latest backup right now (the server calls this just before it shuts down)
    const sendBackups = () => { for (const s of stands.values()) sendBackup(s); };

    // 💎 shards bought with real money (or taken back after a refund): works whether the player is online or not
    function addShards(key, n) {
      const s = [...stands.values()].find(st => st.key === key);
      if (s) {
        s.shards = Math.max(0, s.shards + n);
        s.conn.send({ type: 'shardsChanged', amount: n });
      } else if (saves[key]) saves[key].shards = Math.max(0, (saves[key].shards || 0) + n);
      else return false;
      return true;
    }
    // who's playing on this connection (the server uses it for accounts and the Shard Shop)
    function whoIs(conn) {
      const s = conn.standId && stands.get(conn.standId);
      return s ? { key: s.key, name: s.name, admin: !!s.admin } : null;
    }

    return { handle, leave, tick, snapshotSaves, sendBackups, addShards, whoIs };
  }

  const Engine = { createGame, MAX_WORN, WORLD, SLOTS, SHOP, AVATAR_SHOP, PET_SHOP, SELL_SHOP, REACH, chestPos, tubPos };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(this);
