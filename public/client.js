(() => {
  const { RARITIES, FLAVORS, TOPPINGS, PETS, MAX_PETS, LUCKY_BLOCKS, UPGRADES, upgradeCost, spaceCost, MUTATIONS,
    MUTATION_CHANCE, HOTBAR_SIZE, STORAGE_SIZE, AVATAR, SCOOP_SLOWEST, SCOOP_FASTEST, scoopSpeedup, spacesPerBuy,
    CYBER, CYBER_ADMINS_ONLY, CYBER_PASS, GAME_PASSES, ICE_CREAM_PRICES, shopCost } = window.GameData;
  const { SHOP, AVATAR_SHOP, PET_SHOP, REACH, MAX_WORN, chestPos, tubPos } = window.Engine;
  const mutationById = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));
  const flavorById = Object.fromEntries(FLAVORS.map(f => [f.id, f]));
  const toppingById = Object.fromEntries(TOPPINGS.map(t => [t.id, t]));
  const itemById = { ...flavorById, ...toppingById }; // hotbar/Inventory things: ice cream tubs and toppings
  const petById = Object.fromEntries(PETS.map(p => [p.id, p]));
  const pct = n => `+${Math.round(n * 100)}%`;

  const canvas = document.getElementById('canvas');
  let ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  let ws = null;
  let myId = null;
  let world = { width: 1800, height: 1070 };
  let slots = [];
  let stands = [];
  const customers = new Map(); // id -> { ...server data, dx, dy (display position) }
  const others = new Map();    // stand id -> display position of other players' characters
  const floaters = [];
  const ambient = []; // falling sparkles during a mutation event
  const particles = [];
  let view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0 };
  let spaceBtn = null; // Extra Space button area (world coords) while it's showing
  let gameEvent = { id: null, ids: [], left: 0, next: 0 }; // mutation events going on now
  const activeMuts = () => (gameEvent.ids || []).map(id => mutationById[id]).filter(Boolean);
  let shop = { stock: {}, left: 0 };

  // your character (moved here in the browser, then sent to the server)
  const player = { x: 0, y: 0, placed: false, facing: 1, moving: false };
  let walkTarget = null; // { x, y, reach, action } when walking somewhere you tapped
  const keys = new Set();
  let hand = -1;         // selected hotbar slot
  let openWindow = null; // 'shop' | 'inventory' | null
  let iAmAdmin = false;   // admins also see the admin-only ice creams in the Flavor guide
  // flavors shown in the Flavor guide, and flavors sold in the shop
  // ⚡ in the online game only admins can see the Cyber stuff for now (the server says so when you join)
  let seeCyber = !CYBER_ADMINS_ONLY;
  const canSee = x => seeCyber || (x.rarity !== 'cyber' && x.id !== 'cyber');
  const guideFlavors = () => FLAVORS.filter(f => (!f.adminOnly || iAmAdmin) && canSee(f));
  const shopFlavors = () => FLAVORS.filter(canSee); // admin ice creams only show up when an admin puts them in the shop

  // ---------- helpers ----------
  function fmt(n) {
    if (n >= 1e12 || n >= 1e9 && +(n / 1e9).toFixed(2) >= 1000) return '$' + +(n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + +(n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  let toastTimer = null;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  function clock(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  const growText = sec => sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec}s`;

  // mutations shimmer through their colors
  function mutColor(m, time) {
    return m.colors[Math.floor(time * 5) % m.colors.length];
  }
  const mutGradient = m => `linear-gradient(90deg, ${m.colors.join(', ')}${m.colors.length < 2 ? ', ' + m.colors[0] : ''})`;

  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  const me = () => stands.find(s => s.id === myId);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const isSecretHidden = (f, s) => f.rarity === 'secret' && !(s && s.seen.includes(f.id));
  const heldItem = () => { const s = me(); return s && hand >= 0 ? s.hotbar[hand] : null; };

  // HTML icon of an ice cream cone for the hotbar, inventory and shop
  function iconHtml(flavorId) {
    if (toppingById[flavorId]) return `<div class="icon topping">${toppingById[flavorId].emoji}</div>`;
    const f = flavorById[flavorId];
    const fx = f.effect ? ` fx-${f.effect}` : '';
    return `<div class="icon${fx}"><div class="ball" style="background:${f.color}"></div><div class="cone"></div></div>`;
  }

  // ---------- joining ----------
  // (plain click/Enter handlers instead of a <form>: preview windows often block form submits)
  let joining = false;
  let adminCode = ''; // the secret admin code; saved on this device once it's right
  const ADMIN_NAMES = ['coolkid', 'james'];
  // each admin's code is saved on this device under their own name
  const typedName = () => $('nameInput').value.trim().toLowerCase();
  const codeKey = () => 'icecream-admin-code:' + typedName();
  const savedCode = () => { try { return localStorage.getItem(codeKey()) || ''; } catch (e) { return ''; } };

  // show the admin code box when someone types the admin name on a device that doesn't know the code yet
  function updateCodeBox() {
    const isAdmin = ADMIN_NAMES.includes(typedName());
    $('adminCodeRow').classList.toggle('hidden', !isAdmin || !!savedCode());
  }
  $('nameInput').addEventListener('input', updateCodeBox);

  // your progress backup from the server, kept on this device (it brings your progress back after an update)
  const nameKey = name => name.replace(/[^\w \-]/g, '').trim().slice(0, 16).toLowerCase();
  function loadBackup(name) {
    try { return JSON.parse(localStorage.getItem('icecream-backup:' + nameKey(name))) || null; } catch (e) { return null; }
  }

  function join() {
    const name = $('nameInput').value.trim();
    if (!name) { $('joinError').textContent = 'Type your name first!'; return; }
    if (joining) return;
    joining = true;
    adminCode = $('adminCodeInput').value.trim() || savedCode();
    try { localStorage.setItem('icecream-name', name); } catch (e) {}
    connect(name);
  }
  $('adminCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); join(); } });
  $('joinBtn').addEventListener('click', join);
  $('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); join(); } });
  try { $('nameInput').value = localStorage.getItem('icecream-name') || ''; } catch (e) {}
  updateCodeBox();
  if (window.SOLO) {
    document.querySelector('.hint').textContent =
      'Single-player version: your progress is saved in this browser.';
  }

  // a random id saved on this device, so admin names stay locked to the device that first used them
  function deviceId() {
    try {
      let d = localStorage.getItem('icecream-device');
      if (!d) {
        d = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('icecream-device', d);
      }
      return d;
    } catch (e) { return ''; }
  }

  function connect(name) {
    $('joinError').textContent = '';
    if (window.SOLO) return startSolo(name);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => send({ type: 'join', name, device: deviceId(), adminCode, backup: loadBackup(name) });
    ws.onmessage = e => onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      if (myId) { toast('Disconnected from server. Refresh to rejoin.'); }
      else {
        joining = false;
        if (!$('joinError').textContent) $('joinError').textContent = 'Could not connect to the server.';
      }
    };
  }

  // Single-file version: run the game engine right here in the browser, saving to this device
  function startSolo(name) {
    const SAVE_KEY = 'icecream-solo-saves';
    let saves = {};
    try { saves = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) {}
    const game = window.Engine.createGame({ saves });
    const conn = { send: msg => onMessage(JSON.parse(JSON.stringify(msg))) };
    ws = { readyState: 1, send: data => game.handle(conn, JSON.parse(data)) };
    const save = () => {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.snapshotSaves())); } catch (e) {}
    };
    let last = performance.now(), acc = 0;
    setInterval(() => {
      const now = performance.now();
      acc = Math.min(acc + (now - last) / 1000, 5);
      last = now;
      while (acc >= 0.1) { game.tick(0.1); acc -= 0.1; }
    }, 100);
    setInterval(save, 5000);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    send({ type: 'join', name, device: deviceId(), adminCode });
  }

  function onMessage(msg) {
    const s = me();
    switch (msg.type) {
      case 'welcome':
        myId = msg.id;
        world = msg.world;
        slots = msg.slots;
        $('join').classList.add('hidden');
        $('game').classList.remove('hidden');
        iAmAdmin = !!msg.admin;
        seeCyber = msg.cyber !== false;
        buildPanel();
        buildHotbar();
        $('testTools').classList.toggle('hidden', !msg.admin); // test buttons are for admins only
        $('adminPanel').classList.toggle('hidden', !msg.admin);
        // remember the admin code on this device, so next time just the name is enough
        if (msg.admin && adminCode) { try { localStorage.setItem(codeKey(), adminCode); } catch (e) {} }
        resize();
        if (!tourDone()) startTour(); // everyone new on this device goes through the tour first
        else if (!msg.returning && !tutorialDone()) startTutorial();
        else if (msg.admin) toast('👑 Admin mode! You have $1T and admin commands.');
        if (tour.on) { /* the tour explains everything */ }
        else if (msg.restored) toast('Welcome back! The game was updated, and your progress came back with you.');
        else if (msg.returning || tutorialDone()) toast(msg.returning ? 'Welcome back! Your stand is open again.'
          : 'Welcome! Walk with the arrow keys or tap where you want to go.');
        break;
      case 'error':
        if (myId) toast(msg.text);
        else {
          $('joinError').textContent = msg.text;
          joining = false;
          if (msg.needCode) {
            // the saved code didn't work (or there isn't one): ask for it
            try { localStorage.removeItem(codeKey()); } catch (e) {}
            $('adminCodeRow').classList.remove('hidden');
            $('adminCodeInput').value = '';
            $('adminCodeInput').focus();
          }
        }
        break;
      case 'backup':
        try { localStorage.setItem('icecream-backup:' + msg.key, JSON.stringify(msg.blob)); } catch (e) {}
        break;
      case 'admin':
        toast('👑 ' + msg.text);
        break;
      case 'announce':
        showAnnouncement(msg.from, msg.text);
        break;
      case 'players':
        if (openWindow === 'ban') showPlayers(msg.players);
        break;
      case 'chat':
        addChat(msg);
        break;
      case 'gift':
        toast(`🎁 ${msg.from} gave you ${describe(msg.bundle)}!`);
        confetti(player.x, player.y - 30, 30);
        break;
      case 'giftSent':
        toast(`🎁 You gave ${msg.to} ${describe(msg.bundle)}!`);
        giftRefresh = true; // redraw the gift window once the new counts arrive
        break;
      case 'tradeOffer':
        showTradeOffer(msg);
        break;
      case 'tradeSent':
        toast(`📨 Offer sent to ${msg.to}! Waiting for them to answer…`);
        break;
      case 'tradeDone':
        toast(msg.text);
        if (msg.ok) { confetti(player.x, player.y - 30, 30); giftRefresh = true; }
        break;
      case 'passPrize':
        toast('⚡ Prize claimed!');
        confetti(player.x, player.y - 30, 30);
        break;
      case 'gamePassDone': {
        const gp = GAME_PASSES.find(g => g.id === msg.id);
        toast(msg.id === 'icecream' ? `🍦 You got a ${flavorById[msg.flavor].name}! (TEST: free)`
          : msg.id === 'premium' ? '⚡ Premium Cyber Pass unlocked! Open the Pass to claim the better prizes. (TEST: free)'
          : `${gp.emoji} ${gp.name} done! (TEST: free)`);
        confetti(player.x, player.y - 30, 25);
        break;
      }
      case 'petGot':
        revealPet(msg);
        break;
      case 'blockGot':
        revealItem(msg);
        break;
      case 'boughtTopping': {
        const t = toppingById[msg.topping];
        toast(`You bought ${msg.count} ${t.name}! Hold it and tap an ice cream on your stand.`);
        break;
      }
      case 'banned':
        closeWindows();
        hand = -1;
        $('bannedText').textContent = (msg.self ? 'You banned yourself.' : `${msg.by} (admin) banned you.`) +
          ' You lost everything and have to start over from the beginning.';
        $('bannedModal').classList.remove('hidden');
        break;
      case 'state':
        stands = msg.stands;
        gameEvent = msg.event;
        shop = msg.shop;
        if (msg.cyber) cyberState = msg.cyber;
        if (CYBER) updateCyber();
        if (!player.placed && me()) {
          player.x = me().x; player.y = me().y; player.placed = true;
        }
        syncCustomers(msg.customers);
        updatePanel();
        updateHotbar();
        if (openWindow === 'shop') { updateShop(); updateToppings(); }
        if (openWindow === 'petshop') updatePetShop();
        if (openWindow === 'pets') updatePets();
        if (openWindow === 'inventory') updateInventory();
        if (openWindow === 'gift' && giftRefresh && giftTo !== null) { giftRefresh = false; showGiftItems(); }
        break;
      case 'sale':
        onSale(msg);
        break;
      case 'bought': {
        const f = flavorById[msg.flavor];
        toast(`You bought ${f.name}! Hold it and place it on your stand.`);
        tut.bought = true;
        break;
      }
      case 'placed': {
        const f = flavorById[msg.flavor];
        if (msg.topping) {
          const t = toppingById[msg.topping];
          toast(`${t.emoji} ${t.name} on ${f.name}! Its scoops now sell for ${pct(t.bonus)} more.`);
          if (s) confetti(slots[s.slot].x, slots[s.slot].y, 12);
          break;
        }
        toast(`${f.name} is growing! Ready in ${growText(RARITIES[f.rarity].growSec)}.`);
        tut.placed = true;
        if (s) confetti(slots[s.slot].x, slots[s.slot].y, 12);
        break;
      }
      case 'restock':
        toast('🛒 The Supplies Shop has new ice cream stock!');
        break;
      case 'mutationStart': {
        const m = mutationById[msg.mutation];
        toast(m.id === 'rainbow'
          ? `🌈 A RAINBOW appeared! Scoops can turn Rainbow (x${m.mult} money)!`
          : `${m.emoji} ${m.name} mutation has started! Scoops can turn ${m.name} (x${m.mult} money)!`);
        for (const sl of slots) confetti(sl.x, sl.y - 40, 12);
        break;
      }
      case 'mutationEnd':
        toast(`The ${mutationById[msg.mutation].name} mutation is over.`);
        break;
      case 'spaceAdded':
        toast(`+${msg.added || 3} flavor space${msg.added === 1 ? '' : 's'}! Your stand now holds ${msg.spaces} tubs.` +
          (spaceCost(msg.spaces, seeCyber) === null ? ' That\'s the most!' : ''));
        if (s) confetti(slots[s.slot].x, slots[s.slot].y - 40, 40);
        break;
    }
  }

  function syncCustomers(list) {
    const seen = new Set();
    for (const c of list) {
      seen.add(c.id);
      const existing = customers.get(c.id);
      if (existing) Object.assign(existing, c);
      else customers.set(c.id, { ...c, dx: c.x, dy: c.y });
    }
    for (const id of customers.keys()) if (!seen.has(id)) customers.delete(id);
  }

  function onSale(msg) {
    const stand = stands.find(s => s.id === msg.standId);
    if (!stand) return;
    const slot = slots[stand.slot];
    const f = flavorById[msg.flavor];
    const rarity = RARITIES[f.rarity];
    floaters.push({ x: slot.x, y: slot.y - 10, text: '+' + fmt(msg.amount), color: '#2b8a3e', size: 22, t: 0 });
    floaters.push({ x: slot.x, y: slot.y + 14, text: rarity.name.toUpperCase(), color: rarity.color, size: 14, t: 0 });
    if (msg.golden) {
      floaters.push({ x: slot.x, y: slot.y - 36, text: '⭐ LUCKY x3!', color: '#e6a800', size: 18, t: 0 });
    }
    const muts = (msg.mutations || (msg.mutation ? [msg.mutation] : [])).map(id => mutationById[id]);
    muts.forEach((m, k) => {
      floaters.push({ x: slot.x, y: slot.y - (msg.golden ? 60 : 36) - k * 22, text: `${m.emoji} ${m.name.toUpperCase()} x${m.mult}!`,
        mutation: m, size: 19, t: 0 });
    });
    if (muts.length > 1) {
      const total = muts.reduce((p, m) => p * m.mult, 1);
      floaters.push({ x: slot.x, y: slot.y - (msg.golden ? 60 : 36) - muts.length * 22, text: `COMBO x${total.toLocaleString()}!`,
        color: '#ff2e7e', size: 21, t: 0 });
    }
    if (muts.length && msg.standId === myId) confetti(slot.x, slot.y - 40, 20 * muts.length);
    if (msg.standId === myId && rarity.order >= 4) confetti(slot.x, slot.y - 40, 25);
  }

  // All Server Talk: a big message from an admin at the top of everyone's screen
  let announceTimer = null;
  function showAnnouncement(from, text) {
    const el = $('announce');
    el.querySelector('.annFrom').textContent = `📢 ${from} (admin) says:`;
    el.querySelector('.annText').textContent = text;
    el.classList.add('hidden');
    void el.offsetWidth; // restart the pop animation
    el.classList.remove('hidden');
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => el.classList.add('hidden'), 4000 + text.length * 60);
  }

  function confetti(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 100 + Math.random() * 250;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 150, t: 0,
        color: `hsl(${Math.random() * 360}, 90%, 60%)` });
    }
  }

  // ---------- side panel ----------
  function buildPanel() {
    const fl = $('flavors');
    fl.innerHTML = '';
    for (const f of guideFlavors()) {
      const r = RARITIES[f.rarity];
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="scoop"></div>
        <div class="info">
          <div class="name"></div>
          <div class="meta"><span class="badge ${f.rarity}" style="background-color:${r.color}">${r.name}</span>
            ${fmt(f.price)} / scoop · grows in ${growText(r.growSec)} · <b class="speedTag">⏱️ -${scoopSpeedup(f)}s</b></div>
        </div>`;
      fl.appendChild(row);
      f.row = row;
    }

    const mu = $('mutations');
    mu.innerHTML = '';
    for (const m of MUTATIONS.filter(canSee)) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="emoji">${m.emoji}</div>
        <div class="info">
          <div class="name">${m.name}</div>
          <div class="meta"><span class="mut-badge" style="background:${mutGradient(m)}">x${m.mult} money</span></div>
        </div>
        <div class="count"></div>`;
      mu.appendChild(row);
      m.row = row;
    }

    const up = $('upgrades');
    up.innerHTML = '';
    for (const [key, u] of Object.entries(UPGRADES)) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="info">
          <div class="name">${u.name} <span class="lvl"></span></div>
          <div class="meta">${u.desc}</div>
        </div>
        <button></button>`;
      row.querySelector('button').addEventListener('click', () => send({ type: 'buyUpgrade', key }));
      up.appendChild(row);
      u.row = row;
    }

    // shop window rows
    const list = $('shopList');
    list.innerHTML = '';
    for (const f of shopFlavors()) {
      const r = RARITIES[f.rarity];
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="iconWrap"></div>
        <div class="info">
          <div class="name"></div>
          <div class="meta"><span class="badge ${f.rarity}" style="background-color:${r.color}">${r.name}</span>
            ${fmt(f.price)} / scoop · grows in ${growText(r.growSec)} · <b class="speedTag">⏱️ -${scoopSpeedup(f)}s</b></div>
          <div class="stock"></div>
        </div>
        <button>${fmt(shopCost(f))}</button>`;
      row.querySelector('button').addEventListener('click', () => send({ type: 'buy', flavor: f.id }));
      list.appendChild(row);
      f.shopRow = row;
    }

    // inventory window slots
    const grid = $('invGrid');
    grid.innerHTML = '';
    for (let i = 0; i < STORAGE_SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'slot';
      cell.addEventListener('click', () => send({ type: 'moveItem', from: 'storage', index: i }));
      grid.appendChild(cell);
    }
  }

  function updatePanel() {
    const s = me();
    if (!s) return;
    $('money').textContent = fmt(s.money);
    const filled = s.tubs.filter(Boolean).length;
    $('stats').textContent = `${s.sold} scoops sold · ${fmt(s.totalEarned)} earned · ` +
      `${filled}/${s.spaces} stand spaces used`;
    $('serveBar').style.width = Math.min(100, s.serve * 100) + '%';
    const info = $('scoopInfo');
    if (s.scoopEvery) {
      info.className = 'ok';
      info.textContent = `⏱️ You sell 1 scoop every ${s.scoopEvery} second${s.scoopEvery === 1 ? '' : 's'}` +
        (s.scoopEvery === SCOOP_FASTEST ? ' (the fastest!)' : '');
    } else {
      info.className = 'none';
      info.textContent = s.tubs.some(Boolean) ? '🌱 Your ice cream is still growing. Sales start when it\'s ready!'
        : '🛒 No ice cream on your stand, so no sales! Buy some at the Supplies Shop.';
    }
    $('shopTimerSide').textContent = `🛒 Shop restocks in ${clock(shop.left)}`;

    for (const f of guideFlavors()) {
      const hidden = isSecretHidden(f, s);
      f.row.querySelector('.name').textContent = hidden ? '???' : f.name;
      const dot = f.row.querySelector('.scoop');
      dot.style.background = hidden ? '#222' : f.color;
      dot.className = 'scoop' + (!hidden && f.effect ? ` fx-${f.effect}` : '');
    }

    for (const [key, u] of Object.entries(UPGRADES)) {
      const lvl = s.upgrades[key];
      u.row.querySelector('.lvl').textContent = `Lv ${lvl}`;
      const btn = u.row.querySelector('button');
      if (lvl >= u.max) { btn.textContent = 'MAX'; btn.disabled = true; }
      else {
        const cost = upgradeCost(key, lvl);
        btn.textContent = fmt(cost);
        btn.disabled = s.money < cost;
      }
    }

    const box = $('eventBox');
    const evs = activeMuts();
    const ev = evs[0];
    box.classList.toggle('active', !!ev);
    // light-colored mutations get dark text so it stays readable
    const light = evs.length === 1 && ['diamond', 'gold', 'sakura', 'cyber'].includes(ev.id);
    box.style.color = light ? '#5a4300' : '';
    box.style.textShadow = light ? '0 1px 2px rgba(255,255,255,0.8)' : '';
    if (evs.length > 1) {
      box.style.background = `linear-gradient(90deg, ${evs.map(m => m.colors[0]).join(', ')})`;
      box.innerHTML = `<div class="big">${evs.map(m => m.emoji).join(' ')} ${evs.length} MUTATIONS!</div>
        ${evs.map(m => `${m.name} x${m.mult}`).join(' · ')}<br>Each one has a ${Math.round(MUTATION_CHANCE * 100)}% chance, and they stack! · ${clock(gameEvent.left)} left`;
    } else if (ev) {
      box.style.background = mutGradient(ev);
      box.innerHTML = `<div class="big">${ev.emoji} ${ev.name.toUpperCase()} MUTATION!</div>
        ${Math.round(MUTATION_CHANCE * 100)}% of scoops turn ${ev.name} (x${ev.mult}) · ${clock(gameEvent.left)} left`;
    } else {
      box.style.background = '';
      box.textContent = `Next mutation in ${clock(gameEvent.next)}`;
    }
    for (const m of MUTATIONS.filter(canSee)) {
      const n = s.mutations[m.id] || 0;
      m.row.querySelector('.count').textContent = n ? `${n} sold` : 'not yet';
      m.row.classList.toggle('active-mut', (gameEvent.ids || []).includes(m.id));
    }

    const lb = $('leaderboard');
    const sorted = [...stands].sort((a, b) => b.totalEarned - a.totalEarned);
    lb.innerHTML = '';
    for (const st of sorted) {
      const li = document.createElement('li');
      li.textContent = `${st.name} — ${fmt(st.totalEarned)}`;
      if (st.id === myId) li.className = 'me';
      lb.appendChild(li);
    }
  }

  // ---------- hotbar (10 see-through slots at the bottom) ----------
  function buildHotbar() {
    const bar = $('hotbar');
    bar.innerHTML = '';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'slot';
      cell.innerHTML = `<span class="key">${(i + 1) % 10}</span><div class="content"></div>`;
      cell.addEventListener('click', () => {
        if (openWindow === 'inventory') send({ type: 'moveItem', from: 'hotbar', index: i });
        else selectHand(hand === i ? -1 : i);
      });
      bar.appendChild(cell);
    }
  }

  function selectHand(i) {
    hand = i;
    send({ type: 'hold', slot: i });
    updateHotbar();
    const item = heldItem();
    if (item && toppingById[item.flavor]) toast(`Holding ${itemById[item.flavor].name}. Tap an ice cream on your stand to put it on top.`);
    else if (item) toast(`Holding ${itemById[item.flavor].name}. Tap a dashed space on your stand to place it.`);
  }

  function slotHtml(item) {
    return item ? `${iconHtml(item.flavor)}${item.count > 1 ? `<span class="count">${item.count}</span>` : ''}` : '';
  }

  function updateHotbar() {
    const s = me();
    if (!s) return;
    [...$('hotbar').children].forEach((cell, i) => {
      const item = s.hotbar[i];
      const html = slotHtml(item);
      const content = cell.querySelector('.content');
      if (content.innerHTML !== html) content.innerHTML = html;
      cell.classList.toggle('selected', i === hand && !!item);
      cell.title = item ? itemById[item.flavor].name : '';
    });
    $('handLabel').textContent = heldItem() ? `In hand: ${itemById[heldItem().flavor].name}` : '';
  }

  // ---------- shop and inventory windows ----------
  function openShop() {
    closeWindows();
    openWindow = 'shop';
    $('shopModal').classList.remove('hidden');
    updateShop();
    updateToppings();
  }

  function openInventory() {
    closeWindows();
    openWindow = 'inventory';
    $('invModal').classList.remove('hidden');
    updateInventory();
  }

  function closeWindows() {
    openWindow = null;
    $('shopModal').classList.add('hidden');
    $('invModal').classList.add('hidden');
    $('avatarModal').classList.add('hidden');
    $('banModal').classList.add('hidden');
    $('giftModal').classList.add('hidden');
    $('petShopModal').classList.add('hidden');
    $('petsModal').classList.add('hidden');
    $('adminPetsModal').classList.add('hidden');
    $('passModal').classList.add('hidden');
    $('growModal').classList.add('hidden');
    $('storeModal').classList.add('hidden');
  }

  // ---------- Ban Players (admins) ----------
  let banSure = null; // the player whose Ban button was pressed once ("Sure?")

  function openBan() {
    closeWindows();
    openWindow = 'ban';
    banSure = null;
    $('banList').innerHTML = '<div class="sub">Loading players…</div>';
    $('banModal').classList.remove('hidden');
    send({ type: 'adminPlayers' });
  }

  function showPlayers(players) {
    const list = $('banList');
    list.innerHTML = '';
    if (!players.length) list.innerHTML = '<div class="sub">No players yet.</div>';
    for (const pl of players) {
      const row = document.createElement('div');
      row.className = 'row';
      const who = document.createElement('div');
      who.className = 'who';
      who.innerHTML = `<div class="name"></div><div class="status">${pl.online ? '🟢 Playing now' : '⚪ Away'} · ${fmt(pl.money)}</div>`;
      const mine = me();
      who.querySelector('.name').textContent = pl.name + (mine && mine.name.toLowerCase() === pl.key ? ' (you)' : '');
      row.appendChild(who);
      if (pl.admin) row.insertAdjacentHTML('beforeend', '<span class="adminTag">👑 Admin</span>');
      {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = banSure === pl.key ? 'Sure? Ban!' : 'Ban';
        b.classList.toggle('sure', banSure === pl.key);
        // tap once to get "Sure?", tap again to ban
        b.addEventListener('click', () => {
          if (banSure === pl.key) { banSure = null; send({ type: 'adminBan', key: pl.key }); }
          else { banSure = pl.key; showPlayers(players); }
        });
        row.appendChild(b);
      }
      list.appendChild(row);
    }
  }
  $('banBtn').addEventListener('click', openBan);
  $('banClose').addEventListener('click', closeWindows);
  $('bannedOk').addEventListener('click', () => $('bannedModal').classList.add('hidden'));

  // ---------- 🎁 Gift & 🤝 Trade: give or swap money, ice cream, toppings and pets ----------
  let giftTo = null;     // the stand id of the player you picked
  let giftMode = 'gift'; // 'gift' or 'trade'
  let giftRefresh = false;
  let tradeOffer = null; // a trade someone offered you, waiting for your answer

  // "5k", "2.5m", "1b", "3t" or "1,000,000" -> a number
  function parseMoney(text) {
    const m = String(text || '').replace(/[,$\s]/g, '').toLowerCase().match(/^(\d*\.?\d+)([kmbtq]?)$/);
    if (!m) return 0;
    return Math.floor(Number(m[1]) * { '': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12, q: 1e15 }[m[2]]);
  }

  // what someone has: { items: { id: count }, pets: { id: count } }
  function stuffOf(st) {
    const items = {}, pets = {};
    for (const it of [...st.hotbar, ...st.storage]) if (it) items[it.flavor] = (items[it.flavor] || 0) + it.count;
    for (const id of st.pets || []) pets[id] = (pets[id] || 0) + 1;
    return { items, pets };
  }

  const itemName = id => itemById[id].name;
  function describe(b) {
    const parts = [];
    if (b.money) parts.push(fmt(b.money));
    for (const [id, n] of Object.entries(b.items || {})) parts.push(`${n} ${itemName(id)}`);
    for (const [id, n] of Object.entries(b.pets || {})) parts.push(`${n} ${petById[id].emoji} ${petById[id].name}`);
    return parts.join(', ') || 'nothing';
  }

  function openGift() {
    closeWindows();
    openWindow = 'gift';
    $('giftModal').classList.remove('hidden');
    showGiftPlayers();
  }

  function showGiftPlayers() {
    giftTo = null;
    $('giftSub').textContent = 'Who do you want to gift or trade with?';
    const body = $('giftBody');
    body.innerHTML = '';
    const others = stands.filter(st => st.id !== myId);
    if (!others.length) body.innerHTML = '<div class="sub">No one else is playing right now. Invite a friend!</div>';
    for (const st of others) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="who"><div class="name"></div><div class="meta">🟢 Playing now</div></div>
        <button type="button">Pick</button>`;
      row.querySelector('.name').textContent = (st.admin ? '👑 ' : '') + st.name;
      row.querySelector('button').addEventListener('click', () => { giftTo = st.id; showGiftItems(); });
      body.appendChild(row);
    }
  }

  // a list of number boxes for everything someone has; returns a function that reads the picked bundle
  function buildPicker(parent, owner, emptyText) {
    const { items, pets } = stuffOf(owner);
    const rows = [];
    const addRow = (html, max, read) => {
      const row = document.createElement('div');
      row.className = 'row pickRow';
      row.innerHTML = html + `<input type="number" min="0" max="${max}" value="0"><button type="button" class="maxBtn">All</button>`;
      const input = row.querySelector('input');
      row.querySelector('.maxBtn').addEventListener('click', () => { input.value = max; });
      parent.appendChild(row);
      rows.push({ input, max, read });
      return row;
    };

    // money: type any amount, like 500, 25k, 3m or 1t
    const moneyRow = document.createElement('div');
    moneyRow.className = 'row pickRow';
    moneyRow.innerHTML = `<div class="petEmoji">💵</div><div class="info"><div class="name">Money</div>
      <div class="meta">Has ${fmt(owner.money)} · type 500, 25k, 3m, 1b or 1t</div></div>
      <input type="text" placeholder="0" inputmode="decimal"><button type="button" class="maxBtn">All</button>`;
    const moneyInput = moneyRow.querySelector('input');
    moneyRow.querySelector('.maxBtn').addEventListener('click', () => { moneyInput.value = Math.floor(owner.money); });
    parent.appendChild(moneyRow);

    const ids = [...FLAVORS, ...TOPPINGS].map(f => f.id).filter(id => items[id]);
    for (const id of ids) {
      const f = itemById[id];
      const r = RARITIES[f.rarity];
      const badge = r ? `<span class="badge ${f.rarity}" style="background-color:${r.color}">${r.name}</span>`
        : `<span class="bonus">${pct(f.bonus)} topping</span>`;
      const row = addRow(`<div class="iconWrap">${iconHtml(id)}</div>
        <div class="info"><div class="name"></div><div class="meta">${badge} Has ${items[id]}</div></div>`, items[id], n => ['items', id, n]);
      row.querySelector('.name').textContent = f.name;
    }
    const petIds = PETS.map(p => p.id).filter(id => pets[id]).reverse();
    for (const id of petIds) {
      const p = petById[id];
      const r = RARITIES[p.rarity];
      addRow(`<div class="petEmoji">${petIcon(p)}</div><div class="info"><div class="name">${p.name}</div>
        <div class="meta"><span class="badge ${p.rarity}" style="background-color:${r.color}">${r.name}</span>
        Pet · Has ${pets[id]}${(owner.worn || []).includes(id) ? ' · wearing it' : ''}</div></div>`, pets[id], n => ['pets', id, n]);
    }
    if (!ids.length && !petIds.length) parent.insertAdjacentHTML('beforeend', `<div class="sub">${emptyText}</div>`);

    return () => {
      const b = { money: Math.min(parseMoney(moneyInput.value), Math.floor(owner.money)), items: {}, pets: {} };
      for (const r of rows) {
        const n = Math.min(r.max, Math.max(0, Math.floor(Number(r.input.value) || 0)));
        if (n > 0) { const [kind, id] = r.read(n); b[kind][id] = n; }
      }
      return b;
    };
  }

  const bundleEmpty = b => !b.money && !Object.keys(b.items).length && !Object.keys(b.pets).length;

  function showGiftItems() {
    const target = stands.find(st => st.id === giftTo);
    const mine = me();
    if (!target || !mine) return showGiftPlayers();
    const body = $('giftBody');
    body.innerHTML = '';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'backBtn';
    back.textContent = '← Pick someone else';
    back.addEventListener('click', showGiftPlayers);
    body.appendChild(back);

    const tabs = document.createElement('div');
    tabs.className = 'giftTabs';
    tabs.innerHTML = `<button type="button" data-mode="gift">🎁 Gift</button><button type="button" data-mode="buy">💰 Buy</button>` +
      `<button type="button" data-mode="trade">🤝 Trade</button>`;
    tabs.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.mode === giftMode);
      b.addEventListener('click', () => { giftMode = b.dataset.mode; showGiftItems(); });
    });
    body.appendChild(tabs);

    if (giftMode === 'gift') {
      $('giftSub').textContent = `Pick how much of anything to give ${target.name}, then press Send.`;
      body.insertAdjacentHTML('beforeend', '<h3>🎁 Your stuff</h3>');
      const read = buildPicker(body, mine, "You don't have any ice cream, toppings or pets yet.");
      const sendBtn = document.createElement('button');
      sendBtn.type = 'button';
      sendBtn.className = 'sendBig';
      sendBtn.textContent = `🎁 Send gift to ${target.name}`;
      sendBtn.addEventListener('click', () => {
        const give = read();
        if (bundleEmpty(give)) return toast('Type how much to give first (or press All).');
        send({ type: 'gift', to: giftTo, give });
      });
      body.appendChild(sendBtn);
    } else if (giftMode === 'buy') {
      // 💰 buy their ice cream: pick how many and type your price; they say yes or no
      $('giftSub').textContent = `Buy ${target.name}'s ice cream! Pick how many, type how much money you'll pay, and they decide.`;
      body.insertAdjacentHTML('beforeend', `<h3>🍦 ${target.name.replace(/</g, '')}'s ice cream <span class="sub">(you have ${fmt(mine.money)})</span></h3>`);
      const { items } = stuffOf(target);
      const ids = FLAVORS.map(f => f.id).filter(id => items[id]);
      if (!ids.length) body.insertAdjacentHTML('beforeend', `<div class="sub">${target.name.replace(/</g, '')} doesn't have any ice cream in their hotbar or Inventory right now.</div>`);
      for (const id of ids) {
        const f = flavorById[id], r = RARITIES[f.rarity];
        const row = document.createElement('div');
        row.className = 'row buyRow';
        row.innerHTML = `<div class="iconWrap">${iconHtml(id)}</div>
          <div class="info"><div class="name"></div>
            <div class="meta"><span class="badge ${f.rarity}" style="background-color:${r.color}">${r.name}</span> They have ${items[id]}
              ${f.cost ? ` · shop price ${fmt(f.cost)}` : ''}</div></div>
          <div class="buyInputs"><label>How many <input class="buyCount" type="number" min="1" max="${items[id]}" value="1"></label>
            <label>Your price $ <input class="buyPrice" type="text" inputmode="decimal" placeholder="500, 25k, 1m"></label></div>
          <button type="button">💰 Offer</button>`;
        row.querySelector('.name').textContent = f.name;
        row.querySelector('button').addEventListener('click', () => {
          const count = Math.min(items[id], Math.max(1, Math.floor(Number(row.querySelector('.buyCount').value) || 1)));
          const price = parseMoney(row.querySelector('.buyPrice').value);
          if (price <= 0) return toast('Type how much money you want to pay.');
          if (price > mine.money) return toast("You don't have that much money!");
          send({ type: 'tradeOffer', kind: 'buy', to: giftTo, give: { money: price, items: {}, pets: {} },
            get: { money: 0, items: { [id]: count }, pets: {} } });
        });
        body.appendChild(row);
      }
    } else {
      $('giftSub').textContent = `Pick what you give and what you want back. ${target.name} has to say yes!`;
      body.insertAdjacentHTML('beforeend', '<h3>📤 You give</h3>');
      const readGive = buildPicker(body, mine, "You don't have any ice cream, toppings or pets yet.");
      const theirs = document.createElement('div');
      theirs.className = 'theirs';
      theirs.insertAdjacentHTML('beforeend', `<h3>📥 You want from ${target.name.replace(/</g, '')}</h3>`);
      body.appendChild(theirs);
      const readGet = buildPicker(theirs, target, `${target.name} doesn't have any ice cream, toppings or pets yet.`);
      const sendBtn = document.createElement('button');
      sendBtn.type = 'button';
      sendBtn.className = 'sendBig';
      sendBtn.textContent = `🤝 Send trade offer to ${target.name}`;
      sendBtn.addEventListener('click', () => {
        const give = readGive(), get = readGet();
        if (bundleEmpty(give) && bundleEmpty(get)) return toast('Pick what to trade first.');
        send({ type: 'tradeOffer', to: giftTo, give, get });
      });
      body.appendChild(sendBtn);
    }
  }
  $('giftBtn').addEventListener('click', openGift);
  $('giftClose').addEventListener('click', closeWindows);

  // someone offered you a trade
  function showTradeOffer(msg) {
    tradeOffer = msg;
    const buying = msg.kind === 'buy';
    $('tradeTitle').textContent = buying ? '💰 Someone wants to buy your ice cream!' : '🤝 Trade offer!';
    $('tradeFrom').textContent = buying ? `${msg.from} wants to buy your ice cream. Do you want to sell?` : `${msg.from} wants to trade with you:`;
    $('tradeYes').textContent = buying ? '✅ Sell' : '✅ Accept';
    const lines = b => {
      const parts = describe(b).split(', ');
      return parts.map(p => `<div class="line">• ${p.replace(/</g, '&lt;')}</div>`).join('');
    };
    $('tradeGet').innerHTML = lines(msg.give);
    $('tradeGive').innerHTML = lines(msg.get);
    $('tradeModal').classList.remove('hidden');
  }
  function answerTrade(accept) {
    if (tradeOffer) send({ type: 'tradeReply', id: tradeOffer.id, accept });
    tradeOffer = null;
    $('tradeModal').classList.add('hidden');
  }
  $('tradeYes').addEventListener('click', () => answerTrade(true));
  $('tradeNo').addEventListener('click', () => answerTrade(false));

  // ---------- 🛒 Supplies Shop: Ice Cream / Toppings squares ----------
  function showShopTab(tab) {
    $('tabIce').classList.toggle('on', tab === 'ice');
    $('tabTop').classList.toggle('on', tab === 'top');
    $('icePane').classList.toggle('hidden', tab !== 'ice');
    $('topPane').classList.toggle('hidden', tab !== 'top');
  }
  $('tabIce').addEventListener('click', () => showShopTab('ice'));
  $('tabTop').addEventListener('click', () => showShopTab('top'));

  for (const t of TOPPINGS) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="iconWrap">${iconHtml(t.id)}</div>
      <div class="info"><div class="name">${t.name}</div>
        <div class="meta"><span class="bonus">${pct(t.bonus)} money</span> per scoop of the ice cream it's on</div></div>
      <div class="buyBtns"><button type="button" data-n="1">${fmt(t.cost)}</button><button type="button" data-n="10">x10</button></div>`;
    row.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => send({ type: 'buyTopping', topping: t.id, count: Number(b.dataset.n) })));
    $('topList').appendChild(row);
    t.row = row;
  }
  function updateToppings() {
    const s = me();
    if (!s) return;
    for (const t of TOPPINGS) {
      const [one, ten] = t.row.querySelectorAll('button');
      one.disabled = s.money < t.cost;
      ten.disabled = s.money < t.cost * 10;
    }
  }

  // ---------- ⚡ Cyber Event: the Cyber Pass and Game Passes (online: admins only for now) ----------
  // lucky block colors (fancy ones get a CSS class instead)
  const fancyBlock = b => ['rainbow', 'infinity', 'cyber'].includes(b.color) ? b.color : '';
  const blockBg = b => fancyBlock(b) ? '' : `background:${b.color}`;
  let cyberState = { on: false, endsAt: 0 };
  const cyberIsOn = () => CYBER && cyberState.on;
  function timeLeft(at) {
    const sec = Math.max(0, Math.floor((at - Date.now()) / 1000));
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${sec % 60}s`;
  }
  const blockById = Object.fromEntries(LUCKY_BLOCKS.map(b => [b.id, b]));

  function prizeHtml(p) {
    if (p.money) return { icon: '💵', name: fmt(p.money) };
    if (p.item) {
      const it = itemById[p.item];
      return { icon: iconHtml(p.item), name: `${p.count > 1 ? p.count + ' ' : ''}${it.name}` };
    }
    const b = blockById[p.block];
    return { icon: `<div class="luckyBlock ${fancyBlock(b)}" style="${blockBg(b)}"></div>`,
      name: `${p.count > 1 ? p.count + ' ' : ''}${b.name}${p.count > 1 ? 's' : ''}` };
  }

  function buildPass() {
    for (const row of ['free', 'premium']) {
      const box = $(row === 'free' ? 'passFree' : 'passPremium');
      box.innerHTML = '';
      CYBER_PASS[row].forEach((p, i) => {
        const h = prizeHtml(p);
        const tile = document.createElement('div');
        tile.className = 'passTile';
        tile.innerHTML = `<div class="prizeIcon">${h.icon}</div><div class="prizeName">${h.name}</div>
          <div class="prizeAt">${p.at} scoops</div><button type="button"></button>`;
        tile.querySelector('button').addEventListener('click', () => send({ type: 'passClaim', row, tier: i }));
        box.appendChild(tile);
        p.tile = tile;
      });
    }
  }

  function updatePass() {
    const s = me();
    if (!s) return;
    $('passTimer').textContent = cyberIsOn() ? `Event ends in ${timeLeft(cyberState.endsAt)}` : 'The Cyber Event is over.';
    $('passXP').textContent = `You've sold ${s.passXP || 0} scoops during the Cyber Event. Sell more to unlock prizes!`;
    const premium = !!s.premiumPass;
    $('passPremium').classList.toggle('locked', !premium);
    const note = $('passPremiumNote');
    const want = premium ? '✅ You have it!' : '🔒 Needs the Premium Pass';
    if (note.dataset.state !== String(premium)) {
      note.dataset.state = String(premium);
      note.innerHTML = premium ? want : `${want} <button type="button">Get it</button>`;
      const b = note.querySelector('button');
      if (b) b.addEventListener('click', openStore);
    }
    for (const row of ['free', 'premium']) {
      CYBER_PASS[row].forEach((p, i) => {
        const claimed = (s.passClaimed?.[row] || []).includes(i);
        const unlocked = (s.passXP || 0) >= p.at && (row === 'free' || premium);
        const btn = p.tile.querySelector('button');
        const text = claimed ? '✓ Claimed' : unlocked ? 'Claim!' : row === 'premium' && !premium ? '🔒 Premium' : `🔒 ${p.at - (s.passXP || 0)} more`;
        if (btn.textContent !== text) btn.textContent = text;
        btn.disabled = claimed || !unlocked;
        p.tile.classList.toggle('claimed', claimed);
        p.tile.classList.toggle('ready', unlocked && !claimed);
      });
    }
  }

  function openPass() {
    closeWindows();
    openWindow = 'pass';
    $('passModal').classList.remove('hidden');
    updatePass();
  }

  function buildStore() {
    const list = $('storeList');
    list.innerHTML = '';
    for (const gp of GAME_PASSES) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="gpEmoji">${gp.emoji}</div>
        <div class="info"><div class="name">${gp.name}</div><div class="meta">${gp.desc}</div>
          <div class="gpPrice">${gp.price} real money</div></div>`;
      let pick = null;
      if (gp.id === 'icecream') {
        pick = document.createElement('select');
        for (const f of FLAVORS.filter(f => !f.adminOnly && ICE_CREAM_PRICES[f.rarity])) {
          const o = document.createElement('option');
          o.value = f.id;
          o.textContent = `${f.name} (${ICE_CREAM_PRICES[f.rarity]})`;
          pick.appendChild(o);
        }
        row.querySelector('.info').appendChild(pick);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Buy (TEST: free)';
      b.addEventListener('click', () => send({ type: 'gamePass', id: gp.id, flavor: pick ? pick.value : undefined }));
      row.appendChild(b);
      list.appendChild(row);
      gp.row = row;
    }
  }

  function openStore() {
    closeWindows();
    openWindow = 'store';
    $('storeModal').classList.remove('hidden');
    updateStore();
  }
  function updateStore() {
    const s = me();
    const gp = GAME_PASSES.find(g => g.id === 'premium');
    if (s && gp.row) {
      const b = gp.row.querySelector('button');
      b.disabled = !!s.premiumPass;
      b.textContent = s.premiumPass ? '✅ You have it' : 'Buy (TEST: free)';
    }
  }

  function updateCyber() {
    $('cyberBtns').classList.toggle('hidden', !seeCyber);
    $('passBtn').classList.toggle('hidden', !cyberIsOn());
    if (openWindow === 'pass') { if (cyberIsOn()) updatePass(); else closeWindows(); }
    if (openWindow === 'store') updateStore();
  }

  if (CYBER) {
    buildPass();
    buildStore();
    $('passBtn').addEventListener('click', openPass);
    $('passClose').addEventListener('click', closeWindows);
    $('storeBtn').addEventListener('click', openStore);
    $('storeClose').addEventListener('click', closeWindows);
  }

  // ---------- 🐾 Pet Shop, lucky blocks and your pets ----------
  for (const b of LUCKY_BLOCKS) {
    const row = document.createElement('div');
    row.className = 'row';
    const odds = Object.entries(b.odds).map(([r, c]) =>
      `<b style="color:${RARITIES[r].color === '#111111' ? '#000' : RARITIES[r].color}">${RARITIES[r].name} ${c}%</b>`).join(' · ');
    row.innerHTML = `<div class="luckyBlock ${fancyBlock(b)}" style="${blockBg(b)}"></div>
      <div class="info"><div class="name">${b.name} ${b.event ? '<span class="eventTag">⚡ CYBER EVENT · <span class="left"></span></span>' : ''}</div>
        <div class="odds">${odds}</div></div>
      <button type="button">${fmt(b.cost)}</button>`;
    row.querySelector('button').addEventListener('click', () => send({ type: 'buyBlock', block: b.id }));
    $('blockList').appendChild(row);
    b.row = row;
  }

  function openPetShop() {
    closeWindows();
    openWindow = 'petshop';
    $('petShopModal').classList.remove('hidden');
    updatePetShop();
  }
  function updatePetShop() {
    const s = me();
    if (!s) return;
    for (const b of LUCKY_BLOCKS) {
      b.row.querySelector('button').disabled = s.money < b.cost || s.pets.length >= MAX_PETS;
      // event blocks are only in the shop while their event is on
      if (b.event) {
        b.row.classList.toggle('hidden', !cyberIsOn());
        const left = b.row.querySelector('.left');
        if (left) left.textContent = 'ends in ' + timeLeft(cyberState.endsAt);
      }
    }
  }
  $('petShopClose').addEventListener('click', closeWindows);

  // the lucky block shakes, then pops open to show your new pet
  let revealTimer = null;
  // a lucky block that opens with an ice cream or topping (admins' Give in Lucky Block)
  function revealItem(msg) {
    const it = itemById[msg.item];
    revealPet({ ...msg, show: {
      icon: `<div class="revealItem">${iconHtml(it.id)}</div>`, name: it.name,
      rarity: RARITIES[it.rarity] || { name: 'Topping', color: '#ff6fa5', order: 3 }, rarityId: it.rarity || 'topping',
      line: flavorById[it.id] ? `${fmt(it.price)} a scoop · it's in your hotbar or Inventory` : `${pct(it.bonus)} money · it's in your hotbar or Inventory`,
    } });
  }

  function revealPet(msg) {
    const pet = petById[msg.pet];
    const show = msg.show || { icon: petIcon(pet), name: pet.name, rarity: RARITIES[pet.rarity], rarityId: pet.rarity,
      line: `${pct(pet.boost)} money from every scoop` + (msg.equipped ? ' · it\'s following you now!' : '') };
    const r = show.rarity;
    const block = LUCKY_BLOCKS.find(b => b.id === msg.block);
    const el = $('revealBlock');
    el.className = 'luckyBlock shake ' + fancyBlock(block);
    el.style.cssText = blockBg(block);
    el.classList.remove('hidden');
    $('revealPet').classList.add('hidden');
    $('revealOk').classList.add('hidden');
    $('revealModal').classList.remove('hidden');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      el.classList.add('hidden');
      const box = $('revealPet');
      if (block && block.color === 'cyber') { // ⚡ the Cyber Block bursts open with a flash and shockwaves
        const m = $('revealModal');
        m.classList.remove('cyberBoom'); void m.offsetWidth; m.classList.add('cyberBoom');
      }
      box.querySelector('.revealEmoji').innerHTML = show.icon;
      const badge = box.querySelector('.revealRarity');
      badge.textContent = r.name.toUpperCase();
      badge.style.background = r.color;
      badge.className = 'revealRarity ' + show.rarityId;
      box.querySelector('.revealName').textContent = show.name;
      box.querySelector('.revealBoost').textContent = show.line;
      box.classList.remove('hidden');
      $('revealOk').classList.remove('hidden');
      const s = me();
      if (s) confetti(player.x, player.y - 40, 15 + r.order * 15);
    }, 1400);
  }
  $('revealOk').addEventListener('click', () => $('revealModal').classList.add('hidden'));

  // My Pets: wear the one you like
  let petsKey = '';
  function openPets() {
    closeWindows();
    openWindow = 'pets';
    petsKey = '';
    $('petsModal').classList.remove('hidden');
    updatePets();
  }
  function updatePets() {
    const s = me();
    if (!s) return;
    const worn = s.worn || [];
    const key = s.pets.join() + '|' + worn.join();
    if (key === petsKey) return;
    petsKey = key;
    const boost = worn.reduce((sum, id) => sum + petById[id].boost, 0);
    $('petsSub').textContent = `You have ${s.pets.length}/${MAX_PETS} pets. Wearing ${worn.length}/${MAX_WORN}` +
      (worn.length ? `: they give you ${pct(boost)} money from every scoop!` : '. Tap Wear on a pet, or press Equip Best.') +
      (s.pets.length ? '' : ' Get pets from lucky blocks at the 🐾 Pet Shop.');
    $('equipBestBtn').disabled = !s.pets.length;
    const list = $('petsList');
    list.innerHTML = '';
    // every pet gets its own card, best first; the ones you wear are marked
    const wornLeft = {};
    for (const id of worn) wornLeft[id] = (wornLeft[id] || 0) + 1;
    const sorted = [...s.pets].sort((a, b) => petById[b].boost - petById[a].boost);
    for (const id of sorted) {
      const p = petById[id], r = RARITIES[p.rarity];
      const on = wornLeft[id] > 0;
      if (on) wornLeft[id]--;
      const card = document.createElement('div');
      card.className = 'petCard' + (on ? ' equipped' : '');
      card.innerHTML = `<div class="petEmoji">${petIcon(p)}</div><div class="name">${p.name}</div>
        <span class="badge ${p.rarity}" style="background-color:${r.color}">${r.name}</span>
        <div class="boost">${pct(p.boost)} money</div>
        <button type="button">${on ? 'Take off' : 'Wear'}</button>`;
      const btn = card.querySelector('button');
      btn.disabled = !on && worn.length >= MAX_WORN;
      btn.title = btn.disabled ? `You can wear ${MAX_WORN} pets at once. Take one off first.` : '';
      btn.addEventListener('click', () => send({ type: 'equipPet', pet: id, on: !on }));
      list.appendChild(card);
    }
  }
  $('equipBestBtn').addEventListener('click', () => { send({ type: 'equipBest' }); toast(`⭐ Wearing your ${MAX_WORN} best pets!`); });
  $('petsBtn').addEventListener('click', openPets);
  $('petsClose').addEventListener('click', closeWindows);

  // 👑 admins: spawn any pet into your own pets
  let adminPetPick = null;
  function openAdminPets() {
    closeWindows();
    openWindow = 'adminpets';
    $('adminPetsModal').classList.remove('hidden');
    const list = $('adminPetsList');
    list.innerHTML = '';
    for (const p of PETS) { // most common first, rarest last
      const r = RARITIES[p.rarity];
      const row = document.createElement('div');
      row.className = 'row petRow' + (adminPetPick === p.id ? ' picked' : '');
      row.innerHTML = `<div class="petEmoji">${petIcon(p)}</div>
        <div class="info"><div class="name">${p.name}</div>
          <div class="meta"><span class="badge ${p.rarity}" style="background-color:${r.color}">${r.name}</span>
            <span class="boost">${pct(p.boost)} money</span></div></div>`;
      row.addEventListener('click', () => {
        adminPetPick = p.id;
        list.querySelectorAll('.petRow').forEach(x => x.classList.remove('picked'));
        row.classList.add('picked');
        $('adminPetSpawn').disabled = false;
        $('adminPetSpawn').textContent = `Spawn ${p.emoji} ${p.name}`;
      });
      list.appendChild(row);
    }
  }
  $('adminPetsBtn').addEventListener('click', openAdminPets);
  $('adminPetsClose').addEventListener('click', closeWindows);
  $('adminPetSpawn').addEventListener('click', () => {
    if (adminPetPick) send({ type: 'adminSpawnPet', pet: adminPetPick, count: Number($('adminPetCount').value) || 1 });
  });

  // ---------- 💬 Chat (top left) ----------
  const STAND_COLORS = id => (stands.find(st => st.id === id) || {}).color;

  function addChat(msg) {
    const log = $('chatLog');
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
    const line = document.createElement('div');
    line.className = 'msg';
    const from = document.createElement('span');
    from.className = 'from' + (msg.admin ? ' admin' : '');
    from.textContent = (msg.admin ? '👑 ' : '') + msg.from + ': ';
    if (!msg.admin && STAND_COLORS(msg.id)) from.style.color = STAND_COLORS(msg.id);
    line.appendChild(from);
    line.appendChild(document.createTextNode(msg.text));
    log.appendChild(line);
    while (log.children.length > 50) log.firstChild.remove();
    if (atBottom || msg.id === myId) log.scrollTop = log.scrollHeight;
    // a new message pops the chat open again
    if (msg.id !== myId) $('chat').classList.remove('collapsed');
  }

  function sendChat() {
    const text = $('chatInput').value.trim();
    if (!text) return $('chatInput').blur();
    send({ type: 'chat', text });
    $('chatInput').value = '';
  }
  $('chatSend').addEventListener('click', sendChat);
  $('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    else if (e.key === 'Escape') $('chatInput').blur();
  });
  $('chatToggle').addEventListener('click', () => $('chat').classList.toggle('collapsed'));
  $('chatLog').innerHTML = '<div class="msg hint">Say hi to everyone in the park! Press Enter to chat.</div>';
  if (window.innerWidth < 700) $('chat').classList.add('collapsed');

  // ---------- 📖 Tutorial: a guide card and a bouncing arrow for new players ----------
  const tut = { step: -1, bought: false, placed: false, start: null };
  const myStandPos = () => { const s = me(); return s ? slots[s.slot] : null; };
  const SHOP_DOOR = () => ({ x: SHOP.x, y: SHOP.y + 90 });
  const TUT_STEPS = [
    { text: '👋 Let\'s open your stand! Walk with the <b>arrow keys</b> (or W A S D), or <b>tap</b> where you want to go.',
      done: () => tut.start && dist(player, tut.start) > 80 },
    { text: '🛒 Your stand is empty, so nobody can buy anything yet. Walk to the <b>Supplies Shop</b> in the middle of the park. Follow the arrow!',
      target: SHOP_DOOR, done: () => dist(player, SHOP_DOOR()) <= REACH || tut.bought },
    { text: '💵 Tap the shop and buy a tub of ice cream. <b>Vanilla, Chocolate and Banana cost $10</b>, and you have $20.',
      target: () => SHOP, done: () => tut.bought },
    { text: '✋ Your tub is in your <b>hotbar</b> at the bottom. Tap it (or press its number key) to hold it.',
      hotbar: true, done: () => !!heldItem() || tut.placed },
    { text: '🏪 Walk back to your stand and tap a <b>dashed space</b> to put your ice cream in.',
      target: myStandPos, done: () => tut.placed },
    { text: `⏱️ Your ice cream is growing! When it's ready, a customer buys <b>1 scoop every ${SCOOP_SLOWEST} seconds</b>.
      Every extra ice cream makes it faster: <b>1 second</b> each, <b>2 seconds</b> for flavors over $1,000,
      <b>3 seconds</b> over $10,000, down to <b>1 scoop a second</b>. Wait for your first sale!`,
      target: myStandPos, onShow: () => { tut.sold0 = me()?.sold || 0; }, done: () => (me()?.sold || 0) > tut.sold0 },
    { text: '🎉 Your first sale! Buy more ice cream to sell faster. Also try: 🍒 <b>toppings</b>, 🎒 the <b>chest</b> (your Inventory), ' +
      '🐾 the <b>Pet Shop</b>, 👕 the <b>Avatar Shop</b>, 🎁 <b>Gift &amp; Trade</b>, 💬 <b>chat</b>, and 🌈 <b>mutations</b>!', last: true },
  ];

  function tutorialDone() { try { return !!localStorage.getItem('icecream-tutorial-done'); } catch (e) { return false; } }

  function startTutorial() {
    tut.bought = tut.placed = false;
    showTutStep(0);
  }

  function showTutStep(i) {
    tut.step = i;
    tut.start = player.placed ? { x: player.x, y: player.y } : null;
    const st = TUT_STEPS[i];
    $('tutorial').classList.remove('hidden');
    $('tutorial').querySelector('.tutStep').textContent = `Tutorial · Step ${i + 1} of ${TUT_STEPS.length}`;
    $('tutorial').querySelector('.tutText').innerHTML = st.text;
    $('tutNext').classList.toggle('hidden', !st.last);
    $('tutSkip').classList.toggle('hidden', !!st.last);
    $('hotbar').classList.toggle('tutGlow', !!st.hotbar);
    if (st.onShow) st.onShow();
  }

  function endTutorial() {
    tut.step = -1;
    $('tutorial').classList.add('hidden');
    $('hotbar').classList.remove('tutGlow');
    try { localStorage.setItem('icecream-tutorial-done', '1'); } catch (e) {}
  }

  function updateTutorial() {
    const st = TUT_STEPS[tut.step];
    if (!st || st.last || !me() || !player.placed) return;
    if (!tut.start) tut.start = { x: player.x, y: player.y };
    if (st.done()) {
      confetti(player.x, player.y - 40, 16);
      showTutStep(tut.step + 1);
    }
  }

  // a bouncing arrow over where to go, plus a little pointer next to you when it's far away
  function drawTutorialArrow(time) {
    const st = TUT_STEPS[tut.step];
    const t = st && st.target && st.target();
    if (!t) return;
    const bob = Math.sin(time * 6) * 8;
    const ax = t.x, ay = t.y - 110 + bob;
    ctx.fillStyle = '#ff3b82';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ax, ay + 30); ctx.lineTo(ax - 22, ay + 6); ctx.lineTo(ax - 9, ay + 6); ctx.lineTo(ax - 9, ay - 22);
    ctx.lineTo(ax + 9, ay - 22); ctx.lineTo(ax + 9, ay + 6); ctx.lineTo(ax + 22, ay + 6); ctx.closePath();
    ctx.stroke(); ctx.fill();
    const d = dist(player, t);
    if (d > 220) {
      const a = Math.atan2(t.y - player.y, t.x - player.x);
      ctx.save();
      ctx.translate(player.x + Math.cos(a) * 55, player.y - 25 + Math.sin(a) * 55);
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(16 + bob / 2, 0); ctx.lineTo(-8, -12); ctx.lineTo(-8, 12); ctx.closePath();
      ctx.stroke(); ctx.fill();
      ctx.restore();
    }
  }

  $('tutSkip').addEventListener('click', endTutorial);
  $('tutNext').addEventListener('click', endTutorial);
  $('tutBtn').addEventListener('click', () => startTour(true));

  // ---------- 📖 the click-through tour: the camera flies to each place and spotlights it ----------
  const box = (p, w, h, dy = 0) => p && { x: p.x - w / 2, y: p.y - h / 2 + dy, w, h };
  const TOUR = [
    { title: '🍦 Welcome to Ice Cream Tycoon!',
      text: `You run your own ice cream stand: customers buy scoops and you get money.<br>
        <b>Your stand starts empty</b>, and with no ice cream nobody can buy anything. You get <b>$20</b> to start.<br>
        Click <b>Next</b> to see how everything works.`,
      world: () => box(myStandPos(), 310, 210, -30) },
    { title: '🛒 The Supplies Shop',
      text: `In the middle of the park. Walk here and tap it to <b>buy tubs of ice cream</b>
        (Vanilla, Chocolate and Banana cost $10). It also sells 🍒 toppings that make scoops worth more.`,
      world: () => box(SHOP, 320, 270, -20) },
    { title: '🏪 Put it in your store',
      text: `Back at your stand, pick the tub in your <b>hotbar</b> (the boxes at the bottom), then tap a
        <b>dashed space</b> on your stand. The ice cream grows for a bit, then customers buy it automatically.`,
      world: () => box(myStandPos(), 310, 210, -30) },
    { title: '⏱️ How fast you sell',
      text: `<ul>
        <li><b>1 ice cream</b> on your stand: 1 scoop sold every <b>${SCOOP_SLOWEST} seconds</b></li>
        <li>Every extra ice cream: <b>1 second faster</b></li>
        <li>Flavors that cost <b>over $1,000</b>: <b>2 seconds faster</b></li>
        <li>Flavors that cost <b>over $10,000</b>: <b>3 seconds faster</b></li>
        <li>The fastest is <b>1 scoop every second</b></li>
        <li><b>No ice cream = no sales!</b> (Growing ice cream starts counting once it's ready.)</li></ul>`,
      world: () => box(myStandPos(), 310, 210, -30) },
    { title: '⭐ Specialty ice creams',
      text: `Rare flavors cost a lot of money, but they sell for much more and make your stand faster.
        Look for <b class="speedTag">⏱️ -2s</b> and <b class="speedTag">⏱️ -3s</b> in the shop. New stock comes every 3 minutes.`,
      world: () => box(SHOP, 320, 270, -20) },
    { title: '💬 Chat',
      text: 'Talk to everyone in the park here. Press <b>Enter</b> to start typing. Be nice!',
      dom: '#chat' },
    { title: '🐾 The Pet Shop',
      text: `Open lucky blocks to get pets. You can wear <b>3 pets</b>: they follow you around and make every
        scoop worth more. The rarest pets are amazing!`,
      world: () => box(PET_SHOP, 300, 250, -20) },
    { title: '👕 The Avatar Shop',
      text: `Change your shirt, pants, hat and face, then press <b>Save</b>. You're ready:
        now go buy your first ice cream! (You can see this again with the 📖 Tutorial button.)`,
      world: () => box(AVATAR_SHOP, 260, 230, -10), last: true },
  ];
  const tour = { on: false, i: 0, focus: null };
  const tourDone = () => { try { return !!localStorage.getItem('icecream-tour-done'); } catch (e) { return false; } };

  function startTour() {
    closeWindows();
    tour.on = true;
    $('tutorial').classList.add('hidden');
    $('tour').classList.remove('hidden');
    showTourStep(0);
  }

  function showTourStep(i) {
    tour.i = i;
    const st = TOUR[i];
    $('tour').querySelector('.tourStep').textContent = `Step ${i + 1} of ${TOUR.length}`;
    $('tour').querySelector('.tourTitle').textContent = st.title;
    $('tour').querySelector('.tourText').innerHTML = st.text;
    $('tourBack').style.visibility = i ? 'visible' : 'hidden';
    $('tourNext').textContent = st.last ? "Let's play! 🍦" : 'Next ▶';
    placeTour();
  }

  function endTour() {
    tour.on = false;
    tour.focus = null;
    cam.back = true;
    $('tour').classList.add('hidden');
    try { localStorage.setItem('icecream-tour-done', '1'); } catch (e) {}
    startTutorial(); // then the step-by-step guide while you play
  }

  // move the spotlight ring (and the card) onto this step's place; runs every frame while the tour is on
  function placeTour() {
    if (!tour.on) return;
    const st = TOUR[tour.i];
    const ring = $('tourRing'), card = $('tourCard');
    let r = null;
    if (st.world) {
      const b = st.world();
      if (b) {
        tour.focus = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const c = canvas.getBoundingClientRect();
        r = { left: c.left + view.ox + b.x * view.scale, top: c.top + view.oy + b.y * view.scale, width: b.w * view.scale, height: b.h * view.scale };
      }
    } else if (st.dom) {
      tour.focus = null;
      const e = document.querySelector(st.dom);
      if (e) { const q = e.getBoundingClientRect(); r = { left: q.left - 8, top: q.top - 8, width: q.width + 16, height: q.height + 16 }; }
    }
    if (r) Object.assign(ring.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', opacity: 1 });
    else Object.assign(ring.style, { left: '50%', top: '50%', width: '0px', height: '0px', opacity: 0.99 });
    // the card goes where it doesn't cover the spotlight
    const low = r && r.top + r.height / 2 > window.innerHeight * 0.5;
    card.classList.toggle('atTop', !!low);
  }

  $('tourNext').addEventListener('click', () => { if (TOUR[tour.i].last) endTour(); else showTourStep(tour.i + 1); });
  $('tourBack').addEventListener('click', () => { if (tour.i > 0) showTourStep(tour.i - 1); });
  window.addEventListener('resize', placeTour);

  // ---------- Avatar Shop ----------
  const AVATAR_LABELS = {
    hat: { cap: 'Cap', none: 'No hat', tophat: 'Top hat', beanie: 'Beanie', party: 'Party hat',
      cowboy: 'Cowboy hat', wizard: 'Wizard hat', bunny: 'Bunny ears', cone: 'Ice cream hat', robo: '🤖 Robo antenna' },
    face: { happy: 'Happy', cool: 'Sunglasses', wink: 'Wink', silly: 'Silly', wow: 'Wow', robo: '🤖 Robo visor' },
  };
  const AVATAR_PARTS = [['shirt', 'Shirt'], ['pants', 'Pants'], ['skin', 'Skin'], ['hat', 'Hat'], ['face', 'Face']];

  // you try things on first; nothing changes until you press Save
  let avatarDraft = null;
  function openAvatar() {
    closeWindows();
    openWindow = 'avatar';
    const s = me();
    avatarDraft = s ? { ...s.avatar } : null;
    $('avatarModal').classList.remove('hidden');
    buildAvatarOptions();
  }

  function saveAvatar() {
    if (!avatarDraft) return;
    send({ type: 'setAvatar', avatar: avatarDraft });
    const s = me();
    if (s) { s.avatar = { ...avatarDraft }; confetti(player.x, player.y - 40, 25); }
    toast('💾 Saved! This is your new look.');
    closeWindows();
  }

  function buildAvatarOptions() {
    const s = me();
    if (!s || !avatarDraft) return;
    const box = $('avatarOptions');
    const changed = Object.keys(avatarDraft).some(k => avatarDraft[k] !== s.avatar[k]);
    $('avatarSave').textContent = changed ? '💾 Save' : '💾 Save (no changes yet)';
    box.innerHTML = '';
    for (const [part, label] of AVATAR_PARTS) {
      const row = document.createElement('div');
      row.className = 'avRow';
      row.innerHTML = `<div class="avLabel">${label}</div>`;
      const opts = document.createElement('div');
      opts.className = 'avOpts';
      for (const value of AVATAR[part].filter(v => seeCyber || v !== 'robo')) {
        const b = document.createElement('button');
        b.type = 'button';
        const isColor = part === 'shirt' || part === 'pants' || part === 'skin';
        b.className = 'avOpt' + (isColor ? ' swatch' : '') + (avatarDraft[part] === value ? ' on' : '');
        if (isColor) {
          if (value === 'robo') b.classList.add('robo'); // the cyber ring look
          else b.style.background = value === 'stand' ? s.color : value;
          b.title = value === 'stand' ? 'Your stand color' : value === 'robo' ? 'Robo' : '';
        } else b.textContent = AVATAR_LABELS[part][value];
        b.addEventListener('click', () => {
          avatarDraft[part] = value; // try it on in the preview; Save makes it your look
          buildAvatarOptions();
        });
        opts.appendChild(b);
      }
      row.appendChild(opts);
      box.appendChild(row);
    }
  }

  // a big picture of your character in the Avatar Shop window
  function drawAvatarPreview(time) {
    const c = $('avatarPreview');
    const s = me();
    if (!s || openWindow !== 'avatar') return;
    const pctx = c.getContext('2d');
    const saved = ctx;
    ctx = pctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffe3ee';
    ctx.beginPath(); ctx.arc(c.width / 2, c.height / 2 + 10, 62, 0, Math.PI * 2); ctx.fill();
    ctx.translate(c.width / 2, c.height / 2 + 30);
    ctx.scale(2.2, 2.2);
    drawPlayer({ x: 0, y: 0, facing: 1, moving: false, color: s.color, avatar: avatarDraft || s.avatar, name: '', admin: s.admin }, time);
    ctx = saved;
  }
  $('shopClose').addEventListener('click', closeWindows);
  $('invClose').addEventListener('click', closeWindows);
  $('avatarClose').addEventListener('click', closeWindows);
  $('avatarSave').addEventListener('click', saveAvatar);

  function updateShop() {
    const s = me();
    if (!s) return;
    $('shopTimer').textContent = `New stock in ${clock(shop.left)}`;
    for (const f of shopFlavors()) {
      const row = f.shopRow;
      const left = (shop.stock[f.id] || 0) - (s.bought[f.id] || 0);
      const hidden = isSecretHidden(f, s);
      row.querySelector('.name').textContent = hidden ? '???' : f.name;
      const wrap = row.querySelector('.iconWrap');
      const icon = hidden ? '<div class="icon mystery">?</div>' : iconHtml(f.id);
      if (wrap.innerHTML !== icon) wrap.innerHTML = icon;
      const stock = row.querySelector('.stock');
      stock.textContent = left > 0 ? `x${left} in stock` : 'Out of stock';
      stock.className = 'stock ' + (left > 0 ? 'in' : 'out');
      row.classList.toggle('soldout', left <= 0);
      row.querySelector('button').disabled = left <= 0 || s.money < shopCost(f);
      if (f.adminOnly) row.classList.toggle('hidden', !(shop.stock[f.id] > 0));
    }
  }

  function updateInventory() {
    const s = me();
    if (!s) return;
    [...$('invGrid').children].forEach((cell, i) => {
      const html = slotHtml(s.storage[i]);
      if (cell.innerHTML !== html) cell.innerHTML = html;
    });
  }

  // ---------- input ----------
  function scoop() {
    send({ type: 'scoop' });
    const s = me();
    if (s) {
      const slot = slots[s.slot];
      for (let i = 0; i < 4; i++) {
        particles.push({ x: slot.x + (Math.random() - 0.5) * 60, y: slot.y, vx: (Math.random() - 0.5) * 80,
          vy: -120 - Math.random() * 80, t: 0, color: '#fff' });
      }
    }
  }
  $('scoopBtn').addEventListener('click', scoop);
  for (const m of MUTATIONS) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.emoji} ${m.name} (x${m.mult})`;
    $('testMutationPick').appendChild(opt);
  }
  $('testMutationBtn').addEventListener('click', () =>
    send({ type: 'testMutation', id: $('testMutationPick').value || undefined }));
  $('testMoneyBtn').addEventListener('click', () => send({ type: 'testMoney' }));
  $('testRestockBtn').addEventListener('click', () => send({ type: 'testRestock' }));
  // 🌱 Grow all: pick anyone playing (you too), and all the ice cream on their stand grows right now
  function openGrow() {
    closeWindows();
    openWindow = 'grow';
    $('growModal').classList.remove('hidden');
    const list = $('growList');
    list.innerHTML = '';
    const people = [...stands].sort((a, b) => (b.id === myId) - (a.id === myId)); // you first
    for (const st of people) {
      const growing = st.tubs.filter(t => t && t.grow > 0).length, total = st.tubs.filter(Boolean).length;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="who"><div class="name"></div>
        <div class="meta">${total} ice cream on their stand · ${growing ? `${growing} still growing` : 'all grown'}</div></div>
        <button type="button">🌱 Grow</button>`;
      row.querySelector('.name').textContent = (st.admin ? '👑 ' : '') + st.name + (st.id === myId ? ' (you)' : '');
      row.querySelector('button').addEventListener('click', () => { send({ type: 'adminGrow', to: st.id }); setTimeout(openGrow, 300); });
      list.appendChild(row);
    }
  }
  $('testGrowBtn').addEventListener('click', openGrow);
  $('growClose').addEventListener('click', closeWindows);
  $('growEveryone').addEventListener('click', () => { send({ type: 'adminGrow', all: true }); setTimeout(openGrow, 300); });

  // ---------- admin commands (only work for admin names like "coolkid") ----------
  for (const f of FLAVORS) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = (f.adminOnly ? '👑 ' : '') + f.name;
    $('adminFlavor').appendChild(opt);
  }
  for (const t of TOPPINGS) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.emoji} ${t.name}`;
    $('adminFlavor').appendChild(opt);
  }
  document.querySelectorAll('#adminPanel [data-money]').forEach(btn =>
    btn.addEventListener('click', () => send({ type: 'adminMoney', amount: Number(btn.dataset.money) })));
  $('adminGiveBtn').addEventListener('click', () =>
    send({ type: 'adminGive', flavor: $('adminFlavor').value, count: Number($('adminCount').value) }));
  $('adminEndBtn').addEventListener('click', () => send({ type: 'adminEndMutation' }));
  // 🎁 Give in Lucky Block: whatever you type comes out of a lucky block
  function giveInBlock() {
    const text = $('adminBlockInput').value.trim();
    if (!text) return toast('Type a pet or ice cream first, like dragon or void.');
    const pet = PETS.find(p => squash(p.id) === squash(text) || squash(p.name) === squash(text));
    const item = !pet && (findFlavor(text) || findTopping(text));
    if (!pet && !item) return toast(`"${text}" isn't a pet or ice cream. Try dragon, unicorn, void or cherry.`);
    send(pet ? { type: 'adminBlockGive', pet: pet.id } : { type: 'adminBlockGive', item: item.id });
    $('adminBlockInput').value = '';
  }
  $('adminBlockBtn').addEventListener('click', giveInBlock);
  $('adminBlockInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); giveInBlock(); } });
  $('adminShopBtn').addEventListener('click', () =>
    send({ type: 'adminShopSpawn', flavor: $('adminFlavor').value, count: Number($('adminCount').value) }));
  $('talkBtn').addEventListener('click', () => {
    $('talkRow').classList.toggle('hidden');
    if (!$('talkRow').classList.contains('hidden')) $('talkInput').focus();
  });
  function sendTalk() {
    const text = $('talkInput').value.trim();
    if (!text) return;
    send({ type: 'adminAnnounce', text });
    $('talkInput').value = '';
  }
  $('talkSend').addEventListener('click', sendTalk);
  $('talkInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendTalk(); } });
  $('adminSpawnBtn').addEventListener('click', () =>
    send({ type: 'adminSpawn', flavor: $('adminFlavor').value, count: Number($('adminCount').value) }));
  // pick several mutations, then turn them all on together
  const pickedMuts = new Set();
  for (const m of MUTATIONS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'mutChip';
    chip.textContent = `${m.emoji} ${m.name}`;
    chip.addEventListener('click', () => {
      if (pickedMuts.has(m.id)) pickedMuts.delete(m.id); else pickedMuts.add(m.id);
      chip.classList.toggle('on', pickedMuts.has(m.id));
    });
    $('adminMutChips').appendChild(chip);
  }
  $('adminMutBtn').addEventListener('click', () => {
    if (!pickedMuts.size) return toast('Tap some mutations first, then press Turn on.');
    send({ type: 'adminMutations', ids: [...pickedMuts] });
  });

  const squash = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const findTopping = t => TOPPINGS.find(f => squash(f.id) === squash(t) || squash(f.name) === squash(t));
  const findFlavor = t => FLAVORS.find(f => squash(f.id) === squash(t) || squash(f.name) === squash(t));
  const findMutation = t => MUTATIONS.find(m => squash(m.id) === squash(t) || squash(m.name) === squash(t));

  function parseAmount(t) {
    const m = String(t || '').toLowerCase().replace(/[$,]/g, '').match(/^(\d+(?:\.\d+)?)([kmbt]?)$/);
    if (!m) return NaN;
    return Number(m[1]) * { '': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2]];
  }

  function runCommand(line) {
    const [cmd, ...args] = line.trim().replace(/^[/;:]/, '').split(/\s+/);
    switch ((cmd || '').toLowerCase()) {
      case 'money': {
        const amount = parseAmount(args[0]);
        if (!(amount > 0)) return toast('Try: /money 5t (k, m, b or t)');
        return send({ type: 'adminMoney', amount });
      }
      case 'give': {
        // the flavor name can have spaces: /give cookie dough 5
        let count = 1;
        if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) count = Number(args.pop());
        const f = findFlavor(args.join(' ')) || findTopping(args.join(' '));
        if (!f) return toast('Try: /give rainbow 5 (any flavor or topping name)');
        return send({ type: 'adminGive', flavor: f.id, count });
      }
      case 'shop': { // put any ice cream in the Supplies Shop: /shop void 3
        let count = 1;
        if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) count = Number(args.pop());
        const f = findFlavor(args.join(' '));
        if (!f) return toast('Try: /shop void 3 (any ice cream name)');
        return send({ type: 'adminShopSpawn', flavor: f.id, count });
      }
      case 'pet': case 'pets': {
        // put any pet in your pets: /pet dragon 2
        let count = 1;
        if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) count = Number(args.pop());
        const p = PETS.find(x => squash(x.id) === squash(args.join(' ')) || squash(x.name) === squash(args.join(' ')));
        if (!p) return toast('Try: /pet dragon (any pet name)');
        return send({ type: 'adminSpawnPet', pet: p.id, count });
      }
      case 'spawn': {
        // put an ice cream straight on your stand, fully grown: /spawn void 3
        let count = 1;
        if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) count = Number(args.pop());
        const f = findFlavor(args.join(' '));
        if (!f) return toast('Try: /spawn void 3 (any flavor name)');
        return send({ type: 'adminSpawn', flavor: f.id, count });
      }
      case 'cyber': { // /cyber on, /cyber off, /cyber auto (turn the Cyber Event on or off to test it)
        if (!CYBER) return toast('The Cyber Event is only in the test file for now.');
        const mode = squash(args[0] || '');
        if (!['on', 'off', 'auto'].includes(mode)) return toast('Try: /cyber on, /cyber off or /cyber auto');
        return send({ type: 'adminCyber', mode });
      }
      case 'mutation': case 'mutations': case 'mutate': {
        if (squash(args[0]) === 'end' || squash(args[0]) === 'stop') return send({ type: 'adminEndMutation' });
        if (!args.length) return send({ type: 'testMutation' });
        // several at once: /mutation rainbow meteor sakura
        const words = args.join(' ').split(/[\s,+]+/).filter(Boolean);
        const ids = [];
        for (let i = 0; i < words.length; i++) {
          let found = null;
          for (let j = Math.min(words.length, i + 3); j > i && !found; j--) {
            const m = findMutation(words.slice(i, j).join(' '));
            if (m) { found = m; i = j - 1; }
          }
          if (!found) return toast(`"${words[i]}" isn't a mutation. Try: /mutation rainbow meteor sakura`);
          ids.push(found.id);
        }
        return send({ type: 'adminMutations', ids });
      }
      case 'say': case 'talk': {
        const text = line.trim().replace(/^[/;:]?\S+\s*/, '');
        if (!text) return toast('Try: /say Hello everyone!');
        return send({ type: 'adminAnnounce', text });
      }
      case 'restock': return send({ type: 'testRestock' });
      case 'grow': return send({ type: 'testGrow' });
      default:
        return toast('Commands: /say hi · /money 5t · /give mint 10 · /spawn void 3 · /mutation rainbow meteor · /mutation end · /restock · /grow');
    }
  }
  function runTypedCommand() {
    if (!$('adminCmd').value.trim()) return;
    runCommand($('adminCmd').value);
    $('adminCmd').value = '';
    $('adminCmd').blur();
  }
  $('adminRunBtn').addEventListener('click', runTypedCommand);
  $('adminCmd').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runTypedCommand(); } });

  const MOVE_KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };

  document.addEventListener('keydown', e => {
    if (!myId || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
    if (tour.on) {
      if (e.code === 'Enter' || e.code === 'ArrowRight' || e.code === 'Space') { e.preventDefault(); $('tourNext').click(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); $('tourBack').click(); }
      return;
    }
    if (MOVE_KEYS[e.code]) {
      e.preventDefault();
      keys.add(e.code);
      walkTarget = null;
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) scoop();
    } else if (/^Digit\d$/.test(e.code)) {
      const i = (Number(e.code.slice(5)) + 9) % 10; // 1..9 -> 0..8, 0 -> 9
      selectHand(hand === i ? -1 : i);
    } else if (e.code === 'Enter') {
      e.preventDefault();
      $('chat').classList.remove('collapsed');
      $('chatInput').focus();
    } else if (e.code === 'Escape') {
      closeWindows();
      selectHand(-1);
    }
  });
  document.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // walk to a spot, then do something there (tapping things that are far away)
  function goDo(target, reach, action) {
    if (dist(player, target) <= reach) { walkTarget = null; action(); return; }
    walkTarget = { x: target.x, y: target.y, reach, action };
  }

  const near = (p, extra = 0) => dist(player, p) <= REACH - 30 + extra;
  const inRect = (wx, wy, r) => wx > r.x && wx < r.x + r.w && wy > r.y && wy < r.y + r.h;

  canvas.addEventListener('pointerdown', e => {
    const s = me();
    if (!s) return;
    const rect = canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left - view.ox) / view.scale;
    const wy = (e.clientY - rect.top - view.oy) / view.scale;
    const slot = slots[s.slot];
    const stub = { x: slot.x, y: slot.y };

    if (spaceBtn && inRect(wx, wy, spaceBtn)) return send({ type: 'buySpace' });

    // the Inventory chest (and its button) on your plot
    const chest = chestPos(slot);
    if (inRect(wx, wy, { x: chest.x - 45, y: chest.y - 62, w: 90, h: 90 })) {
      return goDo(chest, REACH - 40, openInventory);
    }
    // the Avatar Shop
    if (inRect(wx, wy, { x: AVATAR_SHOP.x - 110, y: AVATAR_SHOP.y - 95, w: 220, h: 185 })) {
      return goDo({ x: AVATAR_SHOP.x, y: AVATAR_SHOP.y + 85 }, 60, openAvatar);
    }
    // the Pet Shop
    if (inRect(wx, wy, { x: PET_SHOP.x - 130, y: PET_SHOP.y - 100, w: 260, h: 190 })) {
      return goDo({ x: PET_SHOP.x, y: PET_SHOP.y + 90 }, 60, openPetShop);
    }
    // the Supplies Shop
    if (inRect(wx, wy, { x: SHOP.x - 150, y: SHOP.y - 100, w: 300, h: 200 })) {
      return goDo({ x: SHOP.x, y: SHOP.y + 90 }, 60, openShop);
    }
    // a space on your stand
    for (let i = 0; i < s.spaces; i++) {
      const p = tubPos(slot, i, s.spaces);
      if (Math.hypot(wx - p.x, wy - p.y) < 13 * p.s) {
        const tub = s.tubs[i];
        if (tub && heldItem() && toppingById[heldItem().flavor]) {
          return goDo(stub, REACH - 40, () => send({ type: 'place', space: i }));
        }
        if (heldItem() && !tub) return goDo(stub, REACH - 40, () => send({ type: 'place', space: i }));
        if (tub) return goDo(stub, REACH - 40, () => send({ type: 'takeOut', space: i }));
        return toast('Pick an ice cream in your hotbar, then tap a dashed space to place it.');
      }
    }
    // the rest of your stand: place into the first empty space
    if (heldItem() && Math.abs(wx - slot.x) < 95 && wy > slot.y - 70 && wy < slot.y + 65) {
      return goDo(stub, REACH - 40, () => send({ type: 'place', space: -1 }));
    }
    // anywhere else: walk there
    walkTarget = { x: wx, y: wy, reach: 4, action: null };
  });

  // ---------- movement ----------
  const PLAYER_SPEED = 260;
  let sendTimer = 0;
  let lastSent = { x: -1, y: -1 };

  function updatePlayer(dt) {
    if (!player.placed) return;
    let vx = 0, vy = 0;
    for (const k of keys) { vx += MOVE_KEYS[k][0]; vy += MOVE_KEYS[k][1]; }
    if (!vx && !vy && walkTarget) {
      const dx = walkTarget.x - player.x, dy = walkTarget.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d <= Math.max(walkTarget.reach, PLAYER_SPEED * dt)) {
        const action = walkTarget.action;
        walkTarget = null;
        if (action) action();
      } else { vx = dx / d; vy = dy / d; }
    }
    const len = Math.hypot(vx, vy);
    player.moving = len > 0;
    if (len > 0) {
      player.x = Math.max(10, Math.min(world.width - 10, player.x + (vx / len) * PLAYER_SPEED * dt));
      player.y = Math.max(20, Math.min(world.height - 10, player.y + (vy / len) * PLAYER_SPEED * dt));
      if (vx) player.facing = vx > 0 ? 1 : -1;
    }

    sendTimer -= dt;
    if (sendTimer <= 0 && (Math.abs(player.x - lastSent.x) > 1 || Math.abs(player.y - lastSent.y) > 1)) {
      send({ type: 'move', x: Math.round(player.x), y: Math.round(player.y) });
      lastSent = { x: player.x, y: player.y };
      sendTimer = 0.1;
    }

    // close windows when you walk away
    const s = me();
    if (openWindow === 'shop' && dist(player, { x: SHOP.x, y: SHOP.y + 90 }) > REACH) closeWindows();
    if (openWindow === 'avatar' && dist(player, { x: AVATAR_SHOP.x, y: AVATAR_SHOP.y + 85 }) > REACH) closeWindows();
    if (openWindow === 'petshop' && dist(player, { x: PET_SHOP.x, y: PET_SHOP.y + 90 }) > REACH) closeWindows();
    if (openWindow === 'inventory' && s && !near(chestPos(slots[s.slot]), 40)) closeWindows();
  }

  // ---------- rendering ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.w = rect.width; view.h = rect.height;
    // zoom so about 860 x 620 of the park is visible
    view.scale = Math.max(rect.width / 860, rect.height / 620);
  }
  window.addEventListener('resize', resize);

  // the camera follows your character
  const cam = { x: null, y: null, back: false };
  function updateCamera(dt = 0) {
    // follow your character; during the tour, fly to what it's showing (and glide back after)
    const want = tour.on && tour.focus ? tour.focus : player;
    if (cam.x !== null && (tour.on || cam.back)) {
      const k = Math.min(1, dt * 4);
      cam.x += (want.x - cam.x) * k; cam.y += (want.y - cam.y) * k;
      if (!tour.on && Math.hypot(want.x - cam.x, want.y - cam.y) < 3) cam.back = false;
    } else { cam.x = want.x; cam.y = want.y; }
    const sw = world.width * view.scale, sh = world.height * view.scale;
    const ox = view.w / 2 - cam.x * view.scale, oy = view.h / 2 - cam.y * view.scale;
    view.ox = sw <= view.w ? (view.w - sw) / 2 : Math.min(0, Math.max(view.w - sw, ox));
    view.oy = sh <= view.h ? (view.h - sh) / 2 : Math.min(0, Math.max(view.h - sh, oy));
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) return ctx.roundRect(x, y, w, h, r);
    // older browsers without roundRect
    r = Math.min(Array.isArray(r) ? r[0] : r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPark(time) {
    ctx.fillStyle = '#8fd16a';
    ctx.fillRect(0, 0, world.width, world.height);
    // grass tufts
    ctx.fillStyle = '#7cc257';
    for (let i = 0; i < 170; i++) {
      const x = (i * 397) % world.width, y = (i * 263) % world.height;
      ctx.beginPath(); ctx.ellipse(x, y, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ecd9b0';
    // paths between rows of stands
    for (let i = 0; i < slots.length; i += 4) {
      ctx.fillRect(0, slots[i].y + 75, world.width, 115);
    }
    // the shop plaza down the middle of the park, with stone tiles
    const px = SHOP.x - 245, pw = 490;
    ctx.fillStyle = '#e8d3a8';
    ctx.fillRect(px, 0, pw, world.height);
    ctx.strokeStyle = 'rgba(160, 120, 70, 0.18)';
    ctx.lineWidth = 2;
    for (let y = 0; y < world.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke();
      for (let x = px + ((y / 40) % 2) * 30; x < px + pw; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 40); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#c9a66b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, world.height); ctx.moveTo(px + pw, 0); ctx.lineTo(px + pw, world.height); ctx.stroke();
    // flowers along the plaza edges
    for (let y = 30; y < world.height; y += 75) {
      for (const x of [px + 12, px + pw - 12]) {
        ctx.fillStyle = ['#ff6b6b', '#fcc419', '#cc5de8', '#4dabf7'][(y / 75 | 0) % 4];
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * Math.PI * 2;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#fff3bf';
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // trees in the gaps between stands
    for (let i = 0; i < slots.length; i += 4) {
      for (const x of [22, 326, 1473, 1778]) drawTree(x, slots[i].y - 40);
    }
    for (const x of [60, 200, 340, 520, 1280, 1460, 1600, 1740]) drawTree(x, 40);
  }

  function drawTree(x, y) {
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(x - 4, y, 8, 18);
    ctx.fillStyle = '#4c9a3a';
    ctx.beginPath(); ctx.arc(x, y - 4, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5db347';
    ctx.beginPath(); ctx.arc(x - 6, y - 10, 10, 0, Math.PI * 2); ctx.fill();
  }

  function drawShop(time) {
    const { x, y } = SHOP;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 72, 150, 14, 0, 0, Math.PI * 2); ctx.fill();
    // building
    ctx.fillStyle = '#fff4e6';
    roundRect(x - 130, y - 40, 260, 110, 8); ctx.fill();
    ctx.strokeStyle = '#d9a35b'; ctx.lineWidth = 3; ctx.stroke();
    // door and windows
    ctx.fillStyle = '#b5651d';
    roundRect(x - 22, y + 10, 44, 60, 6); ctx.fill();
    ctx.fillStyle = '#9ad7ff';
    roundRect(x - 110, y + 5, 60, 40, 6); ctx.fill();
    roundRect(x + 50, y + 5, 60, 40, 6); ctx.fill();
    // ice cream tubs in the windows
    ['#ff8fab', '#a8e6cf', '#fff3c4', '#6b3e26'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x - 98 + (i % 2) * 36 + (i > 1 ? 160 : 0), y + 34, 9, Math.PI, 0); ctx.fill();
    });
    // roof
    ctx.fillStyle = '#ff6fa5';
    ctx.beginPath();
    ctx.moveTo(x - 150, y - 38); ctx.lineTo(x, y - 100); ctx.lineTo(x + 150, y - 38);
    ctx.fill();
    // giant cone on the roof
    drawCone(x, y - 108, { color: '#ffb3cf' }, 22);
    // sign
    ctx.fillStyle = '#fff';
    roundRect(x - 95, y - 66, 190, 26, 8); ctx.fill();
    ctx.strokeStyle = '#ff6fa5'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#e0457b';
    ctx.font = 'bold 16px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText('SUPPLIES SHOP', x, y - 47);
    // restock timer
    ctx.fillStyle = 'rgba(40, 20, 35, 0.8)';
    roundRect(x - 80, y + 78, 160, 24, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Trebuchet MS';
    ctx.fillText(`New stock in ${clock(shop.left)}`, x, y + 95);
    if (dist(player, { x, y: y + 90 }) <= REACH && openWindow !== 'shop') {
      drawBubbleButton(x, y + 128, '🛒 Tap the shop: ice cream & toppings', '#ff6fa5', time);
    }
  }

  function drawBubbleButton(x, y, text, color, time) {
    ctx.font = 'bold 14px Trebuchet MS';
    const w = ctx.measureText(text).width + 20;
    const bob = Math.sin(time * 4) * 2;
    ctx.fillStyle = color;
    roundRect(x - w / 2, y - 13 + bob, w, 26, 10); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 5 + bob);
  }

  function drawEmptySlot(slot) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#5a7d3c';
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    roundRect(slot.x - 85, slot.y - 60, 170, 120, 12);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#3d5a27';
    ctx.font = 'bold 16px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText('Empty plot', slot.x, slot.y + 6);
    ctx.restore();
  }

  function drawChest(s, time) {
    const slot = slots[s.slot];
    const { x, y } = chestPos(slot);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 22, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a0662d';
    roundRect(x - 24, y - 6, 48, 28, 4); ctx.fill();
    ctx.fillStyle = '#c47f3a';
    roundRect(x - 24, y - 18, 48, 14, [8, 8, 2, 2]); ctx.fill();
    ctx.fillStyle = '#ffd43b';
    ctx.fillRect(x - 4, y - 8, 8, 9);
    ctx.strokeStyle = '#6e4317'; ctx.lineWidth = 2;
    roundRect(x - 24, y - 18, 48, 40, 4); ctx.stroke();
    if (s.id === myId) {
      // the Inventory button on your plot
      ctx.font = 'bold 13px Trebuchet MS';
      const text = '🎒 Inventory';
      const w = ctx.measureText(text).width + 16;
      const glow = near({ x, y }, 40) ? 1 : 0.85;
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#845ef7';
      roundRect(x - w / 2, y - 50, w, 24, 9); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y - 33);
      ctx.globalAlpha = 1;
    }
  }

  function drawTub(s, i, slot, time, holding) {
    // smaller tubs when the stand has lots of spaces
    const p = tubPos(slot, i, s.spaces);
    ctx.save();
    ctx.translate(p.x, p.y); ctx.scale(p.s, p.s); ctx.translate(-p.x, -p.y);
    drawTubAt(s, i, p, time, holding);
    ctx.restore();
  }

  function drawTubAt(s, i, p, time, holding) {
    const tub = s.tubs[i];
    const mine = s.id === myId;
    if (!tub) {
      if (mine && holding === 'tub') {
        // moving dashed outline: "you can place your ice cream here"
        ctx.strokeStyle = '#ff2e7e';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.lineDashOffset = -time * 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, 10.5 + Math.sin(time * 5) * 0.8, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    const f = flavorById[tub.flavor];
    const total = RARITIES[f.rarity].growSec;
    const progress = tub.grow > 0 ? 1 - tub.grow / total : 1;
    // tub
    ctx.fillStyle = '#e9ecef';
    roundRect(p.x - 9, p.y, 18, 9, 2); ctx.fill();
    // scoop grows bigger until it's ready; special effects show once it's grown
    const sr = 3 + 6.5 * progress;
    const ready = tub.grow <= 0;
    if (ready && f.effect) drawFlavorFx(f, p.x, p.y - sr * 0.3, sr * 0.85, true, i);
    fillScoop(ready ? f : { color: f.color }, p.x, p.y + 1, sr, true);
    if (ready && f.effect) drawFlavorFx(f, p.x, p.y - sr * 0.3, sr * 0.85, false, i);
    if (tub.topping) drawTopping(tub.topping, p.x, p.y - sr * 0.55, sr, time, i);
    if (mine && holding === 'topping' && !tub.topping) {
      // dashed ring: "you can put your topping on this one"
      ctx.strokeStyle = '#ff2e7e';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.lineDashOffset = -time * 12;
      ctx.beginPath(); ctx.arc(p.x, p.y - 1, 13 + Math.sin(time * 5) * 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    if (tub.grow > 0) {
      ctx.strokeStyle = '#2fb344';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y + 2, 12, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
      if (mine) {
        ctx.font = 'bold 9px Trebuchet MS';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1b5e20';
        ctx.fillText(tub.grow >= 60 ? `${Math.ceil(tub.grow / 60)}m` : `${Math.ceil(tub.grow)}s`, p.x, p.y - 10);
      }
    }
  }

  // ---------- 🐾 pets in the park, with their effects ----------
  const petPos = new Map();      // stand id -> where their pet is drawn
  const petParticles = [];
  const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

  function petSpark(x, y, o) {
    if (petParticles.length > 400) return;
    petParticles.push({ x, y, vx: 0, vy: -20, t: 0, life: 1, size: 3, color: '#fff', shape: 'dot', ...o });
  }

  // a hue (0-360) as '255, 0, 0' for glow()
  function hueRgb(h) {
    const f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return `${f(0)}, ${f(8)}, ${f(4)}`;
  }

  // pets move like real animals: walkers trot and sit, bunnies hop, penguins waddle,
  // birds and dragons flap in the air, and sea creatures swim through it
  const PET_SIZE = { dragon: 1.45, cyberwhale: 1.8, rex: 1.5, shark: 1.4, dove: 1.3, dragonking: 1.6, infinity: 1.75 };

  // ⚡ the Cyber look: glowing cyan cracks between dark armor plates, a glowing ring core, and crackling lightning
  const CYAN = '#2ee8ff';
  function seam(pts, w = 1) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = CYAN; ctx.shadowBlur = 6 * w;
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1.3 * w;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#d9fdff'; ctx.lineWidth = 0.45 * w; ctx.stroke();
    ctx.restore();
  }
  function cyberRing(x, y, r) {
    ctx.save();
    ctx.fillStyle = '#0b1116';
    ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = CYAN; ctx.shadowBlur = r * 3;
    ctx.strokeStyle = CYAN; ctx.lineWidth = r * 0.45;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#d9fdff'; ctx.lineWidth = r * 0.16;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // a glowing hexagon outline (for shields, rings and sparks)
  function hexagon(x, y, r, rot = 0, w = 1, alpha = 1, plain = false) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y); ctx.rotate(rot);
    const pts = [];
    for (let k = 0; k <= 6; k++) pts.push([Math.cos(k * Math.PI / 3) * r, Math.sin(k * Math.PI / 3) * r]);
    if (plain) { // no blur: fast enough to draw lots of them
      ctx.strokeStyle = CYAN; ctx.lineWidth = 1.6 * w;
      ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
    } else seam(pts, w);
    ctx.restore();
  }
  // a thick plasma beam that fades out at the end
  function plasmaBeam(x1, y1, x2, y2, w) {
    ctx.save();
    ctx.lineCap = 'round';
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, 'rgba(46, 232, 255, 0.95)'); g.addColorStop(0.7, 'rgba(46, 232, 255, 0.55)'); g.addColorStop(1, 'rgba(46, 232, 255, 0)');
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.shadowColor = CYAN; ctx.shadowBlur = w * 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const core = ctx.createLinearGradient(x1, y1, x2, y2);
    core.addColorStop(0, 'rgba(255,255,255,0.95)'); core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = core; ctx.lineWidth = w * 0.35; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  // a jagged lightning bolt (it's different every frame, so it crackles)
  function zap(x1, y1, x2, y2, jit = 4, w = 1) {
    const pts = [[x1, y1]], n = 6;
    for (let i = 1; i < n; i++) pts.push([x1 + (x2 - x1) * i / n + (Math.random() - 0.5) * jit * 2, y1 + (y2 - y1) * i / n + (Math.random() - 0.5) * jit * 2]);
    pts.push([x2, y2]);
    seam(pts, w);
  }

  // ⚡ the Cyber Whale, the best pet: the whale (like the Cosmic Whale) made of dark armor
  // with glowing cyan cracks and a glowing ring core. It's drawn once into a picture, then reused.
  let cyberWhaleSprite = null;
  function makeCyberWhale() {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const saved = ctx;
    ctx = c.getContext('2d');
    // the whale, darkened into gunmetal armor
    ctx.font = `120px ${EMOJI_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.filter = 'grayscale(1) brightness(0.5) contrast(1.4)';
    ctx.fillText('🐋', 80, 140);
    ctx.filter = 'none';
    // everything below only paints on the whale itself
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(10, 60, 80, 0.35)';
    ctx.fillRect(0, 0, 160, 160);
    seam([[0, 92], [30, 88], [44, 96], [70, 90], [96, 98], [124, 92], [160, 96]], 3.2);
    seam([[44, 96], [40, 70], [48, 40]], 3);
    seam([[96, 98], [104, 126], [98, 150]], 3);
    seam([[124, 92], [132, 64], [150, 54]], 2.6);
    seam([[16, 118], [40, 122], [64, 132]], 2.4);
    seam([[70, 90], [76, 60], [72, 30]], 2.4);
    cyberRing(82, 104, 11);
    ctx = saved;
    return c;
  }
  function drawCyberWhale(time) {
    if (!cyberWhaleSprite) cyberWhaleSprite = makeCyberWhale();
    // drawn where the emoji would be: centered, with its bottom at y = 10
    ctx.drawImage(cyberWhaleSprite, -20, -25, 40, 40);
    // the ring core pulses
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(time * 4);
    glow(0.5, -5, 7, '46, 232, 255', 1);
    ctx.restore();
  }
  const PET_MODELS = { cyberwhale: drawCyberWhale }; // pets drawn as pictures instead of their emoji

  // pictures of the low-poly pets for the pet lists (made once each)
  const petIcons = {};
  function petIcon(p) {
    if (!PET_MODELS[p.id]) return p.emoji;
    if (!petIcons[p.id]) {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const saved = ctx;
      ctx = c.getContext('2d');
      ctx.translate(46, 72); ctx.scale(1.7, 1.7);
      PET_MODELS[p.id](0.6, 0, false);
      ctx = saved;
      petIcons[p.id] = c.toDataURL();
    }
    return `<img class="petImg" src="${petIcons[p.id]}" alt="${p.name}">`;
  }

  // fire (or rainbow fire) out of the pet's mouth
  function breathe(x, y, facing, colors, rnd) {
    for (let k = 0; k < 4; k++) {
      petSpark(x + facing * 22, y - 12, { shape: 'flame', color: colors[k % colors.length],
        vx: facing * (140 + Math.random() * 120), vy: rnd() * 60 - 10, life: 0.45, size: 4 + Math.random() * 5 });
    }
  }

  function drawPet(pet, pp, time, dt, seed) {
    const r = RARITIES[pet.rarity];
    const big = PET_SIZE[pet.id] || (r.order >= 4 ? 1.15 : 1);
    const rnd = () => Math.random() - 0.5;
    const chance = k => Math.random() < dt * k;
    const wave = Math.sin(pp.step * Math.PI); // -1..1 once per step

    // how it moves
    let alt = 0, bob = 0, tilt = 0, sx = 1, sy = 1;
    switch (pet.kind) {
      case 'fly':
        alt = 26 + Math.sin(time * 2.2 + seed) * 5;
        sy = 1 + Math.sin(time * (pp.moving ? 18 : 11) + seed) * 0.07; // flapping wings
        tilt = pp.moving ? 0.16 : 0;
        break;
      case 'swim':
        alt = 16 + Math.sin(time * 1.5 + seed) * 4;
        tilt = Math.sin(time * 2 + seed) * 0.12 + (pp.moving ? 0.08 : 0);
        sx = 1 + Math.sin(time * 4 + seed) * 0.03;
        break;
      case 'hop': {
        const ph = (pp.moving ? pp.step * 0.5 : (time + seed) / 3) % 1; // idle bunnies still hop now and then
        const up = pp.moving || ph < 0.25 ? Math.sin(Math.min(1, ph * (pp.moving ? 1 : 4)) * Math.PI) : 0;
        bob = up * (pp.moving ? 14 : 6);
        if (up < 0.15) { sy = 0.9; sx = 1.08; } // squish when it lands
        break;
      }
      case 'waddle':
        if (pp.moving) { tilt = wave * 0.2; bob = Math.abs(wave) * 2; }
        else sy = 1 + Math.sin(time * 2.5 + seed) * 0.03;
        break;
      default: // walk
        if (pp.moving) { bob = Math.abs(wave) * 5; tilt = wave * 0.06; }
        else if (pp.still > 3) { sy = 0.93; sx = 1.04; } // sits down when you stand still
        else sy = 1 + Math.sin(time * 2.5 + seed) * 0.035; // breathing
    }
    const x = pp.x, y = pp.y - alt - bob;

    // shadow on the ground (smaller and lighter when it's up in the air)
    const lift = Math.min(1, (alt + bob) / 60);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.22 * (1 - lift * 0.6)})`;
    ctx.beginPath(); ctx.ellipse(pp.x, pp.y + 10, 12 * big * (1 - lift * 0.4), 4 * (1 - lift * 0.3), 0, 0, Math.PI * 2); ctx.fill();

    // effects behind the pet
    switch (pet.fx) {
      case 'hearts': if (chance(1.5)) petSpark(x + rnd() * 16, y - 12, { shape: 'heart', color: '#ff6b9a', vy: -25, life: 1.4, size: 7 }); break;
      case 'embers': glow(x, y - 4, 22, '255, 140, 40', 0.5);
        if (chance(8)) petSpark(x + rnd() * 18, y, { color: Math.random() < 0.5 ? '#ff922b' : '#ffd43b', vy: -40, vx: rnd() * 20, size: 2.5 }); break;
      case 'leaves': if (chance(3)) petSpark(x + rnd() * 26, y - 20, { shape: 'leaf', color: '#51cf66', vy: 18, vx: rnd() * 30, life: 1.6, size: 4 }); break;
      case 'snow': glow(x, y - 4, 26, '160, 230, 255', 0.55);
        if (chance(6)) petSpark(x + rnd() * 34, y - 24, { shape: 'flake', color: '#fff', vy: 22, vx: rnd() * 10, life: 1.6, size: 3 }); break;
      case 'moon': glow(x, y - 4, 30, '70, 80, 190', 0.55); {
          const a = time * 1.5 + seed;
          ctx.fillStyle = '#fff3bf';
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 24, y - 6 + Math.sin(a) * 10, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3b4cca';
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 24 + 2.5, y - 7 + Math.sin(a) * 10, 4.2, 0, Math.PI * 2); ctx.fill();
          if (chance(3)) petSpark(x + rnd() * 40, y - 10 + rnd() * 30, { shape: 'star', color: '#fff', vy: 0, life: 0.8, size: 3 });
        } break;
      case 'rainbow': glow(x, y - 4, 30, hueRgb((time * 120) % 360), 0.55);
        if (chance(25)) petSpark(x - pp.facing * 10 + rnd() * 6, y + rnd() * 10, { color: `hsl(${(time * 300) % 360},100%,60%)`, vy: 5, vx: -pp.facing * 20, life: 0.9, size: 4 });
        if (chance(3)) petSpark(x + rnd() * 30, y - 10 + rnd() * 20, { shape: 'star', color: '#fff', vy: -5, life: 0.7, size: 3.5 }); break;
      case 'shadow': glow(x, y - 4, 32, '90, 30, 140', 0.6);
        if (chance(12)) petSpark(x + rnd() * 24, y + 4, { shape: 'smoke', color: 'rgba(40,10,60,0.5)', vy: -18, vx: rnd() * 14, life: 1.3, size: 7 }); break;
      case 'fire': glow(x, y - 4, 36, '255, 90, 0', 0.65);
        if (chance(30)) petSpark(x + rnd() * 22, y + 2, { shape: 'flame', color: Math.random() < 0.5 ? '#ff6a00' : '#ffd000', vy: -60, vx: rnd() * 20, life: 0.6, size: 5 }); break;
      case 'bubbles': glow(x, y - 4, 32, '50, 150, 255', 0.55);
        if (chance(6)) petSpark(x + rnd() * 30, y + 6, { shape: 'bubble', color: '#a5d8ff', vy: -30, vx: rnd() * 10, life: 1.5, size: 2 + Math.random() * 3 }); break;
      case 'galaxy': glow(x, y - 4, 38, '120, 60, 255', 0.65);
        for (let k = 0; k < 3; k++) {
          const a = time * 2 + k * 2.094 + seed;
          star(x + Math.cos(a) * 28, y - 4 + Math.sin(a) * 12, 4, ['#fff', '#ffd43b', '#ff8cc6'][k]);
        }
        if (chance(5)) petSpark(x + rnd() * 50, y - 10 + rnd() * 40, { shape: 'star', color: '#e5dbff', vy: 0, life: 0.8, size: 3 }); break;
      case 'cosmic': glow(x - 10, y - 6, 40, '255, 80, 200', 0.5); glow(x + 10, y - 2, 40, '60, 180, 255', 0.5);
        if (chance(10)) petSpark(x + rnd() * 60, y - 10 + rnd() * 40, { shape: 'star', color: Math.random() < 0.5 ? '#fff' : '#99e9f2', vy: -3, life: 1, size: 3 }); break;
      case 'dragon': {
        // a huge fiery aura, a ring of flames, embers, and fire breath
        const pulse = 1 + Math.sin(time * 4) * 0.12;
        glow(x, y - 8, 60 * pulse, '255, 60, 0', 0.55);
        glow(x, y - 8, 34 * pulse, '255, 215, 0', 0.5);
        for (let k = 0; k < 8; k++) {
          const a = -time * 2.5 + k * Math.PI / 4;
          glow(x + Math.cos(a) * 40, y - 8 + Math.sin(a) * 16, 7, k % 2 ? '255, 200, 0' : '255, 80, 0', 0.9);
        }
        if (chance(20)) petSpark(x + rnd() * 40, y + 4, { shape: 'flame', color: Math.random() < 0.5 ? '#ff4800' : '#ffc300', vy: -70, vx: rnd() * 30, life: 0.8, size: 5 });
        if ((time + seed) % 4 < 1.1) breathe(x, y, pp.facing, ['#ff2a00', '#ff8c00', '#ffd000', '#fff3b0'], rnd);
        break;
      }
      case 'lava': {
        // 🦖 Lava Rex: a glowing lava pool under it, dripping magma, and burning footprints
        glow(pp.x, pp.y + 8, 46, '255, 70, 0', 0.55);
        glow(x, y - 10, 50, '255, 120, 0', 0.45);
        if (chance(10)) petSpark(x + rnd() * 30, y - 6, { shape: 'flame', color: Math.random() < 0.5 ? '#ff3d00' : '#ff9100', vy: 50, vx: rnd() * 10, life: 0.6, size: 3.5 });
        if (chance(14)) petSpark(x + rnd() * 40, y, { color: '#ffd166', vy: -50, vx: rnd() * 30, life: 0.9, size: 2 });
        if (pp.moving && chance(5)) petSpark(pp.x + rnd() * 10, pp.y + 10, { shape: 'print', color: '#ff5400', vy: 0, life: 1.6, size: 4 });
        if ((time + seed) % 5 < 0.9) breathe(x, y + 4, pp.facing, ['#ff1f00', '#ff7b00', '#ffcc00'], rnd);
        break;
      }
      case 'thunder': {
        // 🦈 Thunder Shark: crackling electric aura and lightning bolts
        glow(x, y - 6, 52 * (1 + Math.sin(time * 9) * 0.08), '60, 170, 255', 0.6);
        glow(x, y - 6, 26, '220, 245, 255', 0.5);
        if (chance(4)) {
          const a = Math.random() * Math.PI * 2, len = 35 + Math.random() * 30;
          const pts = [];
          for (let k = 0; k <= 5; k++) pts.push([Math.cos(a) * len * k / 5 + rnd() * 12, Math.sin(a) * len * k / 5 * 0.7 + rnd() * 12]);
          petSpark(x, y - 6, { shape: 'bolt', pts, color: '#e7f5ff', vy: 0, life: 0.18 });
        }
        if (chance(15)) petSpark(x + rnd() * 50, y - 6 + rnd() * 30, { shape: 'star', color: '#74c0fc', vy: 0, life: 0.3, size: 3 });
        break;
      }
      case 'holy': {
        // 🕊️ Angel Dove: soft light rays, a golden halo and falling feathers
        ctx.save();
        ctx.translate(x, y - 6);
        ctx.rotate(time * 0.5);
        for (let k = 0; k < 10; k++) {
          ctx.rotate(Math.PI / 5);
          ctx.fillStyle = 'rgba(255, 240, 180, 0.22)';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, 70); ctx.lineTo(6, 70); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        glow(x, y - 6, 46, '255, 250, 220', 0.75);
        if (chance(3)) petSpark(x + rnd() * 50, y - 30, { shape: 'leaf', color: '#ffffff', vy: 16, vx: rnd() * 20, life: 2, size: 4.5 });
        if (chance(6)) petSpark(x + rnd() * 60, y - 6 + rnd() * 40, { shape: 'star', color: '#ffe066', vy: -6, life: 0.9, size: 3 });
        break;
      }
      case 'king': {
        // 🐲 Dragon King: royal golden flames, a roar shockwave and golden fire breath
        const pulse = 1 + Math.sin(time * 4) * 0.1;
        glow(x, y - 8, 70 * pulse, '255, 190, 0', 0.55);
        glow(x, y - 8, 36 * pulse, '255, 255, 220', 0.55);
        for (let k = 0; k < 10; k++) {
          const a = time * 2 + k * Math.PI / 5;
          glow(x + Math.cos(a) * 48, y - 8 + Math.sin(a) * 18, 8, k % 2 ? '255, 230, 120' : '255, 160, 0', 0.95);
        }
        if (chance(16)) petSpark(x + rnd() * 50, y + 4, { shape: 'flame', color: Math.random() < 0.5 ? '#ffd43b' : '#fff3bf', vy: -70, vx: rnd() * 30, life: 0.8, size: 5 });
        const roar = (time + seed) % 3.5;
        if (roar < dt) petSpark(x, y - 8, { shape: 'ring', color: '#ffd43b', vy: 0, life: 0.8, size: 20, grow: 110 });
        if (roar < 1) breathe(x, y, pp.facing, ['#fff3bf', '#ffd43b', '#ffa94d'], rnd);
        break;
      }
      case 'cyberwhale': {
        // ⚡ Cyber Whale, the best pet: EPIC cyber power all around it
        const pulse = 1 + Math.sin(time * 5) * 0.1;
        const gx = pp.x, gy = pp.y + 9;
        // a glowing circuit platform on the ground with spinning hexagon rings
        glow(gx, gy, 85, '46, 232, 255', 0.3);
        ctx.save();
        ctx.translate(gx, gy); ctx.scale(1, 0.32);
        hexagon(0, 0, 62, time * 0.7, 1.4, 0.9);
        hexagon(0, 0, 44, -time * 1.2, 1, 0.75);
        for (let k = 0; k < 12; k++) {
          const a = k * Math.PI / 6 + time * 0.7;
          seam([[Math.cos(a) * 64, Math.sin(a) * 64], [Math.cos(a) * 74, Math.sin(a) * 74]], 0.8);
        }
        ctx.restore();
        // the big energy aura
        glow(x, y - 12, 100 * pulse, '46, 232, 255', 0.42);
        glow(x, y - 12, 48, '217, 253, 255', 0.38);
        // three energy orbs flying around it, linked to it by lightning
        for (let k = 0; k < 3; k++) {
          const a = time * 1.8 + k * 2.094 + seed;
          const ox = x + Math.cos(a) * 58, oy = y - 16 + Math.sin(a) * 20;
          glow(ox, oy, 16, '46, 232, 255', 0.7);
          cyberRing(ox, oy, 3.2);
          if (Math.random() < 0.45) zap(ox, oy, x + rnd() * 16, y - 14 + rnd() * 10, 5, 0.9);
        }
        // crackling lightning close around its body
        if (Math.random() < 0.8) {
          for (let k = 0; k < 2; k++) {
            const a = Math.random() * Math.PI * 2, r1 = 22 + Math.random() * 8, r2 = 42 + Math.random() * 20;
            zap(x + Math.cos(a) * r1, y - 12 + Math.sin(a) * r1 * 0.7, x + Math.cos(a + 0.4) * r2, y - 12 + Math.sin(a + 0.4) * r2 * 0.6, 4);
          }
        }
        // glowing hexagon sparks rising up
        if (chance(14)) petSpark(x + rnd() * 90, y + 6, { shape: 'hex', color: CYAN, vy: -45, vx: rnd() * 10, life: 1.4, size: 2 + Math.random() * 3 });
        // every few seconds: a giant lightning bolt strikes it from the sky
        const strike = (time + seed * 0.7) % 4.5;
        if (strike < 0.22) {
          zap(x + rnd() * 60, y - 230, x, y - 20, 22, 3);
          zap(x + rnd() * 80, y - 200, x + rnd() * 10, y - 30, 16, 1.8);
          glow(x, y - 20, 140, '217, 253, 255', 0.55 * (1 - strike / 0.22));
          if (strike < dt) {
            petSpark(gx, gy, { shape: 'ring', color: CYAN, vy: 0, life: 1, size: 18, grow: 220 });
            for (let k = 0; k < 14; k++) petSpark(x, y - 16, { shape: 'hex', color: k % 2 ? '#d9fdff' : CYAN, vx: rnd() * 260, vy: rnd() * 200 - 60, life: 0.8, size: 3 });
          }
        }
        // a plasma spout from its blowhole, and a plasma beam from its mouth
        const beam = (time + seed) % 3.4;
        if (beam < 1.1) {
          const grow = Math.min(1, beam * 4), f = pp.facing, wv = 7 + Math.sin(time * 40) * 1.5;
          const bx = x - f * 4 * big, by = y - 22 * big;
          plasmaBeam(bx, by, bx + Math.sin(time * 9) * 6, by - 110 * grow, wv * 1.2);
          for (let k = 0; k < 2; k++) {
            petSpark(bx, by - 100 * grow, { shape: 'hex', color: k ? CYAN : '#d9fdff', vx: rnd() * 140, vy: -40 + Math.random() * 120, life: 0.9, size: 2.5 });
          }
          plasmaBeam(x + f * 18 * big, y - 4 * big, x + f * (18 * big + 140 * grow), y + 2, wv);
        }
        break;
      }
      case 'infinity': {
        // ♾️ Infinity Dragon, the best pet: a rainbow galaxy around it, rainbow fire and color waves
        const hue = (time * 90) % 360;
        glow(x, y - 8, 80, hueRgb(hue), 0.5);
        glow(x, y - 8, 50, hueRgb((hue + 120) % 360), 0.45);
        glow(x, y - 8, 26, '255, 255, 255', 0.6);
        for (let k = 0; k < 12; k++) {
          const a = time * (k % 2 ? 1.6 : -2.2) + k * Math.PI / 6;
          const rad = k % 2 ? 58 : 40;
          star(x + Math.cos(a) * rad, y - 8 + Math.sin(a) * rad * 0.4, 4.5, `hsl(${(hue + k * 30) % 360}, 100%, 65%)`);
        }
        if (chance(25)) petSpark(x + rnd() * 70, y - 8 + rnd() * 40, { shape: 'star', color: `hsl(${Math.random() * 360}, 100%, 70%)`, vy: -10, life: 0.9, size: 3 });
        const beat = (time + seed) % 3;
        if (beat < dt) petSpark(x, y - 8, { shape: 'ring', color: `hsl(${hue}, 100%, 60%)`, vy: 0, life: 1, size: 24, grow: 140 });
        if (beat < 1.1) breathe(x, y, pp.facing, [0, 60, 120, 200, 280].map(h => `hsl(${(hue + h) % 360}, 100%, 60%)`), rnd);
        break;
      }
    }

    // the pet itself
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt * pp.facing);
    ctx.scale(-pp.turn * big * sx, big * sy); // pet emojis face left; turn smoothly to face where they go
    if (pet.fx === 'infinity') ctx.filter = `hue-rotate(${(time * 90) % 360}deg) saturate(1.6)`;
    if (pet.fx === 'cyberwhale' && Math.random() < 0.04) ctx.translate((Math.random() - 0.5) * 6, 0); // a little glitch
    ctx.font = `30px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // emoji pets get a soft glow in their rarity color (low-poly pets are drawn from many pieces, so they skip it)
    if (r.order >= 2 && !PET_MODELS[pet.id]) { ctx.shadowColor = r.color === '#111111' ? '#ff5a00' : r.color; ctx.shadowBlur = 14; }
    if (pet.fx === 'cyberwhale' && pp.moving) {
      // glowing ghost copies trailing behind it when it moves
      for (const [off, a] of [[16, 0.22], [30, 0.1]]) {
        ctx.save(); ctx.globalAlpha = a; ctx.translate(off, 0);
        PET_MODELS[pet.id](time - off * 0.01, seed, true, true);
        ctx.restore();
      }
    }
    if (PET_MODELS[pet.id]) PET_MODELS[pet.id](time, seed, pet.kind === 'fly' || pet.kind === 'swim', pp.moving);
    else ctx.fillText(pet.emoji, 0, 10); // drawn from its feet, so squishing and sitting look right
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
    if (pet.fx === 'holy') {
      ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3;
      ctx.shadowColor = '#ffd43b'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.ellipse(x, y - 30 * big - 4, 11, 4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (pet.fx === 'king') {
      // a golden crown on the Dragon King
      const cy = y - 30 * big - 2, cx = x;
      ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#e8a200'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 11, cy + 6); ctx.lineTo(cx - 11, cy - 6); ctx.lineTo(cx - 5, cy); ctx.lineTo(cx, cy - 9);
      ctx.lineTo(cx + 5, cy); ctx.lineTo(cx + 11, cy - 6); ctx.lineTo(cx + 11, cy + 6); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e03131'; ctx.beginPath(); ctx.arc(cx, cy + 2, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPetParticles(dt) {
    for (let i = petParticles.length - 1; i >= 0; i--) {
      const p = petParticles[i];
      p.t += dt;
      if (p.t > p.life) { petParticles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      switch (p.shape) {
        case 'heart':
          ctx.font = `bold ${p.size * 2}px sans-serif`; ctx.textAlign = 'center';
          ctx.fillText('♥', p.x, p.y);
          break;
        case 'leaf':
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size / 2, p.t * 4, 0, Math.PI * 2); ctx.fill();
          break;
        case 'flake':
          ctx.strokeStyle = p.color; ctx.lineWidth = 1.2;
          for (let k = 0; k < 3; k++) {
            const an = k * Math.PI / 3;
            ctx.beginPath(); ctx.moveTo(p.x - Math.cos(an) * p.size, p.y - Math.sin(an) * p.size);
            ctx.lineTo(p.x + Math.cos(an) * p.size, p.y + Math.sin(an) * p.size); ctx.stroke();
          }
          break;
        case 'star': star(p.x, p.y, p.size * (0.5 + a), p.color); break;
        case 'bubble':
          ctx.strokeStyle = p.color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'smoke':
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.t), 0, Math.PI * 2); ctx.fill();
          break;
        case 'flame':
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
          break;
        case 'bit': // a flying 0 or 1
          ctx.font = `bold ${p.size}px monospace`; ctx.textAlign = 'center';
          ctx.fillText(p.text, p.x, p.y);
          break;
        case 'print': // a burning footprint
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
          break;
        case 'hex': // a little glowing hexagon spark
          hexagon(p.x, p.y, p.size, p.t * 3, 0.6, a);
          break;
        case 'ring': // a shockwave
          ctx.strokeStyle = p.color; ctx.lineWidth = 4 * a;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size + p.t * p.grow, (p.size + p.t * p.grow) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'bolt': // lightning
          ctx.strokeStyle = p.color; ctx.lineWidth = 2.2;
          ctx.shadowColor = '#4dabf7'; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          for (const [bx, by] of p.pts) ctx.lineTo(p.x + bx, p.y + by);
          ctx.stroke(); ctx.shadowBlur = 0;
          break;
        default:
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // a topping sitting on a scoop
  function drawTopping(id, x, y, r, time, seed = 0) {
    ctx.save();
    switch (id) {
      case 'sprinkles':
        ['#ff6b6b', '#4dabf7', '#fcc419', '#51cf66', '#cc5de8'].forEach((c, k) => {
          ctx.strokeStyle = c; ctx.lineWidth = 1.4;
          const a = k * 1.3 + seed, d = r * 0.5;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6);
          ctx.lineTo(x + Math.cos(a) * d + 2, y + Math.sin(a) * d * 0.6 + 1); ctx.stroke();
        });
        break;
      case 'syrup':
        ctx.fillStyle = '#5a2e14';
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.75, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - r * 0.5, y, 1.6, r * 0.6); ctx.fillRect(x + r * 0.3, y, 1.6, r * 0.45);
        break;
      case 'whipped':
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e9ecef'; ctx.lineWidth = 0.8;
        for (const [dx, dy, rr] of [[0, 0, 0.5], [-0.25, -0.35, 0.35], [0.2, -0.6, 0.25]]) {
          ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        break;
      case 'cherry':
        ctx.strokeStyle = '#2b8a3e'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.quadraticCurveTo(x + 2, y - 7, x + 4, y - 8); ctx.stroke();
        ctx.fillStyle = '#e3002b';
        ctx.beginPath(); ctx.arc(x, y - 1, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(x - 1, y - 2, 1, 0, Math.PI * 2); ctx.fill();
        break;
      case 'goldflakes':
        ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 6;
        for (let k = 0; k < 4; k++) {
          const a = k * 1.7 + seed + time;
          ctx.fillStyle = k % 2 ? '#ffd700' : '#fff3a0';
          ctx.fillRect(x + Math.cos(a) * r * 0.5 - 1, y + Math.sin(a) * r * 0.3 - 1, 2.2, 2.2);
        }
        break;
      case 'stardust':
        ctx.shadowColor = '#b197fc'; ctx.shadowBlur = 8;
        for (let k = 0; k < 3; k++) {
          const a = time * 2 + k * 2.1 + seed;
          star(x + Math.cos(a) * r * 0.9, y - 2 + Math.sin(a) * r * 0.5, 2.6, k % 2 ? '#e5dbff' : '#b197fc');
        }
        break;
    }
    ctx.restore();
  }

  function star(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, rr = k % 2 ? r * 0.35 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }

  function drawStand(s, time) {
    const slot = slots[s.slot];
    const { x, y } = slot;
    const mine = s.id === myId;

    // the plot's ground
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(x - 150, y - 125, 300, 195, 16); ctx.fill();
    ctx.strokeStyle = s.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
    ctx.stroke(); ctx.globalAlpha = 1;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 62, 95, 12, 0, 0, Math.PI * 2); ctx.fill();

    // posts
    ctx.fillStyle = '#d9d9d9';
    ctx.fillRect(x - 78, y - 30, 7, 40);
    ctx.fillRect(x + 71, y - 30, 7, 40);

    // counter
    ctx.fillStyle = '#fff';
    roundRect(x - 85, y, 170, 60, 6); ctx.fill();
    ctx.fillStyle = s.color;
    ctx.fillRect(x - 85, y + 48, 170, 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2;
    roundRect(x - 85, y, 170, 60, 6); ctx.stroke();

    // flavor spaces
    const held = mine ? heldItem() : null;
    const holding = held ? (toppingById[held.flavor] ? 'topping' : 'tub') : null;
    for (let i = 0; i < s.spaces; i++) drawTub(s, i, slot, time, holding);

    // striped awning
    const stripes = 8, aw = 190, ax = x - aw / 2, ay = y - 62;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : s.color;
      ctx.beginPath();
      ctx.moveTo(ax + 10 + (i * (aw - 20)) / stripes, ay);
      ctx.lineTo(ax + 10 + ((i + 1) * (aw - 20)) / stripes, ay);
      ctx.lineTo(ax + ((i + 1) * aw) / stripes, ay + 30);
      ctx.lineTo(ax + (i * aw) / stripes, ay + 30);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ax + ((i + 0.5) * aw) / stripes, ay + 30, aw / stripes / 2, 0, Math.PI);
      ctx.fill();
    }

    // name sign
    ctx.font = 'bold 17px Trebuchet MS';
    ctx.textAlign = 'center';
    const label = s.name + "'s Ice Cream";
    const tw = ctx.measureText(label).width + 20;
    ctx.fillStyle = '#fff';
    roundRect(x - tw / 2, ay - 30, tw, 26, 8); ctx.fill();
    ctx.strokeStyle = s.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#3a2a35';
    ctx.fillText(label, x, ay - 11);

    // serving progress
    if (s.serve > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      roundRect(x - 50, y + 66, 100, 7, 3); ctx.fill();
      ctx.fillStyle = '#ff6fa5';
      roundRect(x - 50, y + 66, 100 * Math.min(1, s.serve), 7, 3); ctx.fill();
    }

    if (mine) {
      spaceBtn = null;
      const cost = !s.tubs.includes(null) ? spaceCost(s.spaces, seeCyber) : null;
      if (cost !== null) {
        // stand is full: show the Extra Space button on top of it
        const text = `Extra Space +${spacesPerBuy(s.spaces, seeCyber)} (${fmt(cost)})`;
        ctx.font = 'bold 16px Trebuchet MS';
        const bw = ctx.measureText(text).width + 24, bh = 30;
        const pulse = s.money >= cost ? 1 + Math.sin(time * 6) * 0.04 : 1;
        spaceBtn = { x: x - bw / 2, y: ay - 70, w: bw, h: bh };
        ctx.save();
        ctx.translate(x, ay - 70 + bh / 2);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = s.money >= cost ? '#2fb344' : '#a99aa3';
        roundRect(-bw / 2, -bh / 2, bw, bh, 10); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(text, 0, 6);
        ctx.restore();
      } else if (!s.tubs.some(Boolean)) {
        drawBubbleButton(x, ay - 54, 'Buy ice cream at the shop!', '#ff6fa5', time);
      }
    }
  }

  const SHIRTS = ['#e64980', '#4263eb', '#37b24d', '#f59f00', '#7048e8', '#1098ad'];
  const SKINS = ['#f8d5b8', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#f1c27d'];

  function drawCone(x, y, flavor, size) {
    ctx.fillStyle = '#d9a35b';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.6, y);
    ctx.lineTo(x + size * 0.6, y);
    ctx.lineTo(x, y + size * 1.4);
    ctx.fill();
    const cx = x, cy = y - size * 0.2, r = size * 0.75;
    if (flavor.effect) drawFlavorFx(flavor, cx, cy, r, true);
    fillScoop(flavor, cx, cy, r, false);
    if (flavor.effect) drawFlavorFx(flavor, cx, cy, r, false);
  }

  // ---------- flavor effects (Phoenix Fire flames, Galaxy stars, Void aura...) ----------
  const SHERBET = ['#ff8a5c', '#ffd56b', '#ff9ad5', '#9be08a'];
  let nowSec = 0; // set every frame

  // a scoop: full circle, or the top half (ice cream in a tub)
  function fillScoop(f, x, y, r, half) {
    const outline = () => { ctx.beginPath(); if (half) ctx.arc(x, y, r, Math.PI, 0); else ctx.arc(x, y, r, 0, Math.PI * 2); };
    const stripes = f.stripes || (f.effect === 'sherbet' ? SHERBET : null);
    if (stripes) {
      // striped scoop (Rainbow Sherbet, or the Rainbow mutation)
      ctx.save();
      outline(); ctx.closePath(); ctx.clip();
      const band = (2 * r) / stripes.length;
      stripes.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x - r, y - r + i * band, 2 * r, band + 0.5); });
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; // shine
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (f.effect === 'robo') {
      // ⚡ Robo Ice Cream: dark armor plates with glowing cyan cracks and a glowing ring core
      const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, '#4a545e'); g.addColorStop(0.5, '#262d34'); g.addColorStop(1, '#11161a');
      ctx.fillStyle = g;
      outline(); ctx.fill();
      ctx.save();
      outline(); ctx.clip();
      const w = Math.max(0.35, r * 0.09);
      seam([[x - r, y - r * 0.35], [x - r * 0.4, y - r * 0.3], [x - r * 0.1, y - r * 0.55], [x + r * 0.5, y - r * 0.4], [x + r, y - r * 0.5]], w);
      seam([[x - r * 0.1, y - r * 0.55], [x, y - r]], w);
      seam([[x - r * 0.75, y - r * 0.3], [x - r * 0.8, y + r]], w);
      seam([[x + r * 0.7, y - r * 0.45], [x + r * 0.75, y + r]], w);
      ctx.restore();
      cyberRing(x, y - r * 0.05, r * 0.32);
      return;
    }
    if (f.effect === 'infinity') {
      // Infinity Swirl: every color swirling around and slowly spinning
      const spin = nowSec * 1.5;
      let g;
      if (ctx.createConicGradient) {
        g = ctx.createConicGradient(spin, x, y);
        [0, 50, 110, 180, 250, 310, 360].forEach((h, i, a) => g.addColorStop(i / (a.length - 1), `hsl(${h}, 100%, 62%)`));
      } else {
        g = ctx.createLinearGradient(x - r, y, x + r, y);
        [0, 60, 120, 200, 280].forEach((h, i, a) => g.addColorStop(i / (a.length - 1), `hsl(${(h + nowSec * 90) % 360}, 100%, 62%)`));
      }
      ctx.fillStyle = g;
      outline(); ctx.fill();
      // a white swirl and shine on top
      ctx.save();
      outline(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(0.6, r * 0.14);
      ctx.beginPath(); ctx.arc(x, y, r * 0.5, spin, spin + Math.PI * 1.3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (f.effect === 'void') {
      // pitch-black middle fading to deep purple, with tiny stars inside
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, '#000000');
      g.addColorStop(0.55, '#12002e');
      g.addColorStop(1, '#5a1fb8');
      ctx.fillStyle = g;
      outline(); ctx.fill();
      ctx.save();
      outline(); ctx.clip();
      for (let k = 0; k < 6; k++) {
        const a = nowSec * 0.6 + k * 1.05, d = r * (0.25 + (k % 3) * 0.22);
        ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(nowSec * 3 + k))})`;
        ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.6, r * 0.09), Math.max(0.6, r * 0.09));
      }
      ctx.restore();
      return;
    }
    if (f.effect === 'prism') {
      // Prism Swirl: a spinning rainbow swirl
      ctx.save();
      outline(); ctx.clip();
      for (let k = 0; k < 12; k++) {
        const a0 = nowSec * 2 + (k / 12) * Math.PI * 2;
        ctx.fillStyle = `hsl(${k * 30}, 95%, 62%)`;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 1.1, a0, a0 + Math.PI / 6 + 0.02); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (f.effect === 'nova' || f.effect === 'storm' || f.effect === 'crown') {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      const stops = { nova: ['#ffffff', '#ffe066', '#ff8a00'], storm: ['#8aa0c8', '#3b4a6b', '#1b2238'],
        crown: ['#fffbe0', '#ffcf33', '#c98a00'] }[f.effect];
      stops.forEach((c, k) => g.addColorStop(k / 2, c));
      ctx.fillStyle = g;
      outline(); ctx.fill();
      return;
    }
    if (f.effect === 'stars') {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, '#8a6cff');
      g.addColorStop(1, f.color);
      ctx.fillStyle = g;
    } else ctx.fillStyle = f.color;
    outline(); ctx.fill();
  }

  // soft glow; rgb like '255, 30, 0' (fades to the same color, so no grey edge)
  function glow(x, y, radius, rgb, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }

  function sparkle(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y - s * 0.25); ctx.lineTo(x + s, y);
    ctx.lineTo(x + s * 0.25, y + s * 0.25); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y + s * 0.25);
    ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.25, y - s * 0.25);
    ctx.fill();
  }

  function flame(x, baseY, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - w, baseY);
    ctx.quadraticCurveTo(x - w * 0.9, baseY - h * 0.6, x, baseY - h);
    ctx.quadraticCurveTo(x + w * 0.9, baseY - h * 0.6, x + w, baseY);
    ctx.closePath();
    ctx.fill();
  }

  // dots floating up and fading (embers, bubbles)
  function risers(x, y, r, t, color, n) {
    for (let k = 0; k < n; k++) {
      const ph = (t * 0.7 + k / n) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + Math.sin(t * 3 + k * 2.1) * r * 0.7, y - r * 0.8 - ph * r * 3, Math.max(0.6, r * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // things circling around the scoop
  function orbit(x, y, r, t, color, n, size) {
    for (let k = 0; k < n; k++) {
      const a = t * 2 + (k / n) * Math.PI * 2;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 0.7, size, 0, Math.PI * 2); ctx.fill();
    }
  }

  // back = true draws glows behind the scoop, false draws sparkles on top
  function drawFlavorFx(f, x, y, r, back, seed = 0) {
    const t = nowSec + seed * 0.37;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    switch (f.effect) {
      case 'fire': // Phoenix Fire: red glow, flickering flames and rising embers
        if (back) {
          glow(x, y, r * 3.2, '255, 30, 0', 0.55 + 0.3 * pulse);
          for (let k = -1; k <= 1; k++) {
            const h = r * (2.1 + 0.7 * Math.sin(t * 13 + k * 2)) * (k ? 0.75 : 1);
            flame(x + k * r * 0.6, y - r * 0.2, r * 0.5, h, '#ff3a00');
            flame(x + k * r * 0.6, y - r * 0.2, r * 0.3, h * 0.7, k ? '#ff9a00' : '#ffe14d');
          }
        } else risers(x, y, r, t, '#ffb000', 3);
        break;
      case 'void': // Cosmic Void, the best ice cream: a tiny black hole
        if (back) {
          // big pulsing purple glow
          glow(x, y, r * 4.2, '120, 0, 220', 0.5 + 0.3 * pulse);
          glow(x, y, r * 2.2, '255, 80, 230', 0.25 + 0.15 * pulse);
          // swirling disk: two glowing spiral arms spinning around
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(1, 0.45);
          ctx.rotate(t * 1.6);
          ctx.lineCap = 'round';
          for (let arm = 0; arm < 2; arm++) {
            ctx.rotate(Math.PI);
            for (let k = 0; k < 10; k++) {
              const a0 = k * 0.32, rad = r * (2.4 - k * 0.12);
              ctx.strokeStyle = `rgba(${200 + k * 5}, ${110 + k * 10}, 255, ${0.85 - k * 0.07})`;
              ctx.lineWidth = Math.max(1, r * (0.32 - k * 0.02));
              ctx.beginPath(); ctx.arc(0, 0, rad, a0, a0 + 0.4); ctx.stroke();
            }
          }
          ctx.restore();
        } else {
          // sparkles getting pulled in, spinning faster as they fall toward the middle
          for (let k = 0; k < 7; k++) {
            const ph = (t * 0.45 + k / 7) % 1;
            const a = k * 0.9 + t * 1.2 + ph * 5;
            const rad = r * 3 * (1 - ph);
            ctx.globalAlpha = Math.min(1, ph * 2) * (1 - ph * 0.3);
            ctx.fillStyle = k % 2 ? '#e8d0ff' : '#ff9cf5';
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.5, Math.max(0.7, r * 0.14), 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
          // bright edge of the black hole
          ctx.strokeStyle = `rgba(230, 180, 255, ${0.6 + 0.4 * pulse})`;
          ctx.lineWidth = Math.max(1, r * 0.13);
          ctx.beginPath(); ctx.arc(x, y, r * 1.02, 0, Math.PI * 2); ctx.stroke();
          sparkle(x - r * 0.35, y - r * 0.35, r * 0.35 * pulse, '#ffffff');
        }
        break;
      case 'stars': // Galaxy Swirl: purple glow and twinkling stars
        if (back) glow(x, y, r * 2.4, '120, 80, 255', 0.5);
        else for (let k = 0; k < 3; k++) {
          const tw = 0.5 + 0.5 * Math.sin(t * 5 + k * 2);
          sparkle(x + [-0.4, 0.35, 0][k] * r, y + [-0.2, 0.1, -0.55][k] * r, r * 0.28 * tw, '#ffffff');
        }
        break;
      case 'gold': // Golden Caramel: warm golden glow and a shiny glint
        if (back) glow(x, y, r * 2.4, '255, 200, 0', 0.45 + 0.25 * pulse);
        else sparkle(x + r * 0.35, y - r * 0.4, r * 0.55 * Math.max(0, Math.sin(t * 3)), '#ffffff');
        break;
      case 'dragon': // Dragon Fruit: pink glow with little black seeds
        if (back) glow(x, y, r * 2.2, '255, 60, 172', 0.45);
        else {
          ctx.fillStyle = '#2b0a1a';
          for (const [dx, dy] of [[-0.4, -0.2], [0.3, -0.45], [0.1, 0.1], [-0.1, -0.6], [0.5, 0]]) {
            ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r, r * 0.08, r * 0.13, 0.4, 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      case 'unicorn': // Unicorn Dream: color-changing glow and pastel sparkles
        if (back) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
          const hue = (t * 90) % 360;
          g.addColorStop(0, `hsla(${hue}, 90%, 75%, 0.65)`);
          g.addColorStop(1, `hsla(${hue}, 90%, 75%, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
        }
        else {
          sparkle(x + Math.cos(t * 2) * r * 1.3, y + Math.sin(t * 2) * r * 0.8, r * 0.35, '#fff6a8');
          sparkle(x - Math.cos(t * 2) * r * 1.3, y - Math.sin(t * 2) * r * 0.8, r * 0.3, '#ffc6f5');
        }
        break;
      case 'fluff': // Cotton Candy: soft fluffy puffs
        if (back) {
          ctx.fillStyle = 'rgba(255, 190, 235, 0.6)';
          for (let k = 0; k < 3; k++) {
            const a = k * 2.1 + Math.sin(t) * 0.3;
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.6, r * 0.55, 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      case 'crown': // 👑 Crown Jewel: royal gold glow, a little crown and shining gems
        if (back) glow(x, y, r * 3, '255, 200, 40', 0.55 + 0.25 * pulse);
        else {
          const cy = y - r * 1.15, w = r * 0.8;
          ctx.fillStyle = '#ffd43b';
          ctx.strokeStyle = '#b07800'; ctx.lineWidth = Math.max(0.6, r * 0.06);
          ctx.beginPath();
          ctx.moveTo(x - w, cy + r * 0.35); ctx.lineTo(x - w, cy - r * 0.25); ctx.lineTo(x - w * 0.5, cy + r * 0.05);
          ctx.lineTo(x, cy - r * 0.45); ctx.lineTo(x + w * 0.5, cy + r * 0.05); ctx.lineTo(x + w, cy - r * 0.25);
          ctx.lineTo(x + w, cy + r * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
          [['#e03131', -0.45], ['#1c7ed6', 0], ['#2fb344', 0.45]].forEach(([c, dx]) => {
            ctx.fillStyle = c;
            ctx.beginPath(); ctx.arc(x + dx * r, y + r * 0.1, r * 0.16, 0, Math.PI * 2); ctx.fill();
          });
          sparkle(x + r * 0.5, y - r * 0.4, r * 0.45 * Math.max(0, Math.sin(t * 3)), '#ffffff');
        }
        break;
      case 'storm': // 🌩️ Storm Cloud: dark cloud puffs, rain and lightning flashes
        if (back) {
          const flash = Math.sin(t * 6) > 0.85;
          if (flash) glow(x, y, r * 3.4, '200, 220, 255', 0.8);
          ctx.fillStyle = '#4b5a7d';
          for (const [dx, dy, s] of [[-0.8, -0.8, 0.55], [0, -1.05, 0.65], [0.8, -0.8, 0.55]]) {
            ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, s * r, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          ctx.strokeStyle = 'rgba(160, 200, 255, 0.85)';
          ctx.lineWidth = Math.max(0.6, r * 0.07);
          for (let k = 0; k < 3; k++) {
            const ph = (t * 1.5 + k / 3) % 1;
            const dx = (k - 1) * r * 0.6;
            ctx.beginPath(); ctx.moveTo(x + dx, y + r * (0.9 + ph)); ctx.lineTo(x + dx - r * 0.1, y + r * (1.2 + ph)); ctx.stroke();
          }
          if (Math.sin(t * 6) > 0.6) {
            ctx.strokeStyle = '#fff36b';
            ctx.lineWidth = Math.max(1, r * 0.14);
            ctx.beginPath();
            ctx.moveTo(x + r * 0.2, y - r * 1.4); ctx.lineTo(x - r * 0.15, y - r * 0.5);
            ctx.lineTo(x + r * 0.15, y - r * 0.45); ctx.lineTo(x - r * 0.2, y + r * 0.4);
            ctx.stroke();
          }
        }
        break;
      case 'nova': // 💥 Supernova: a blinding star with shock rings bursting outward
        if (back) {
          glow(x, y, r * 3.6, '255, 170, 40', 0.6 + 0.3 * pulse);
          glow(x, y, r * 1.8, '255, 255, 255', 0.8);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * 0.6);
          ctx.fillStyle = 'rgba(255, 230, 150, 0.6)';
          for (let k = 0; k < 12; k++) {
            ctx.rotate(Math.PI / 6);
            const len = r * (2.2 + 0.6 * Math.sin(t * 5 + k));
            ctx.beginPath(); ctx.moveTo(-r * 0.12, 0); ctx.lineTo(0, len); ctx.lineTo(r * 0.12, 0); ctx.fill();
          }
          ctx.restore();
        } else {
          for (let k = 0; k < 2; k++) {
            const ph = (t * 0.8 + k / 2) % 1;
            ctx.strokeStyle = `rgba(255, 200, 80, ${1 - ph})`;
            ctx.lineWidth = Math.max(0.6, r * 0.12 * (1 - ph));
            ctx.beginPath(); ctx.arc(x, y, r * (1 + ph * 2.2), 0, Math.PI * 2); ctx.stroke();
          }
        }
        break;
      case 'prism': // 🌈 Prism Swirl: rainbow glow and sparkles in every color circling it
        if (back) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
          const hue = (t * 100) % 360;
          g.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.6)`);
          g.addColorStop(1, `hsla(${hue}, 100%, 65%, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
        } else {
          for (let k = 0; k < 6; k++) {
            const a = t * 1.8 + (k / 6) * Math.PI * 2;
            sparkle(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 0.8, r * 0.3, `hsl(${k * 60}, 100%, 70%)`);
          }
        }
        break;
      case 'robo': // ⚡ Robo Ice Cream: a big cyan glow, two spinning energy rings with sparks on them, and lightning
        if (back) {
          glow(x, y, r * 3.8, '46, 232, 255', 0.4 + 0.25 * pulse);
          glow(x, y, r * 1.8, '217, 253, 255', 0.25 + 0.2 * pulse);
        } else {
          const w = Math.max(0.35, r * 0.07);
          for (const [tilt, speed] of [[0.5, 3], [-0.6, -2.4]]) {
            ctx.save();
            ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(1, 0.32);
            ctx.globalAlpha = 0.75;
            ctx.strokeStyle = CYAN; ctx.lineWidth = w * 1.4; ctx.shadowColor = CYAN; ctx.shadowBlur = r * 0.6;
            ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
            const a = t * speed;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.7, Math.sin(a) * r * 1.7, r * 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
          if (Math.random() < 0.6) {
            const a = Math.random() * Math.PI * 2;
            zap(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, x + Math.cos(a + 0.5) * r * 2.4, y + Math.sin(a + 0.5) * r * 2.4, r * 0.3, w * 1.2);
          }
        }
        break;
      case 'infinity': // ♾️ Infinity Swirl, the best ice cream: color-changing glow and stars flying in an infinity loop
        if (back) {
          const hue = (t * 80) % 360;
          glow(x, y, r * 4.5, hueRgb(hue), 0.45 + 0.25 * pulse);
          glow(x, y, r * 2.4, hueRgb((hue + 150) % 360), 0.35);
          // the infinity (figure 8) path
          const loop = u => { const d = 1 + Math.sin(u) ** 2; return [x + r * 2.6 * Math.cos(u) / d, y - r * 0.2 + r * 2.6 * Math.sin(u) * Math.cos(u) / d]; };
          ctx.strokeStyle = `hsla(${hue}, 100%, 75%, 0.35)`;
          ctx.lineWidth = Math.max(0.5, r * 0.1);
          ctx.beginPath();
          for (let k = 0; k <= 40; k++) { const [px, py] = loop(k / 40 * Math.PI * 2); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          ctx.stroke();
          for (let k = 0; k < 3; k++) {
            const [px, py] = loop(t * 2 + k * 2.094);
            sparkle(px, py, r * 0.45, `hsl(${(hue + k * 120) % 360}, 100%, 80%)`);
          }
        } else sparkle(x + r * 0.3, y - r * 0.55, r * 0.45 * (0.4 + 0.6 * pulse), '#ffffff');
        break;
      case 'berries': // Blueberry: little blueberries on top
        if (!back) {
          ctx.fillStyle = '#2d3a8c';
          for (const [dx, dy] of [[-0.35, -0.35], [0.3, -0.45], [0.05, -0.05]]) {
            ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * 0.17, 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      case 'bubble': // Bubblegum: a bubble that slowly grows, then pops
        if (!back) {
          const g = (t * 0.45) % 1, br = r * (0.15 + 0.75 * g);
          ctx.save();
          ctx.globalAlpha = g > 0.92 ? 0 : 0.8;
          ctx.fillStyle = '#ffc2e2'; ctx.strokeStyle = '#ff7ab8'; ctx.lineWidth = Math.max(0.6, r * 0.08);
          ctx.beginPath(); ctx.arc(x + r * 0.75 + br * 0.6, y - r * 0.1, br, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.beginPath(); ctx.arc(x + r * 0.75 + br * 0.35, y - r * 0.1 - br * 0.35, br * 0.22, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        break;
      case 'shine': // Mango Tango: warm sunny glow with slowly turning rays
        if (back) {
          glow(x, y, r * 2.6, '255, 170, 0', 0.35 + 0.2 * pulse);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * 0.8);
          ctx.fillStyle = 'rgba(255, 200, 60, 0.4)';
          for (let k = 0; k < 8; k++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath(); ctx.moveTo(-r * 0.18, r * 1.05); ctx.lineTo(r * 0.18, r * 1.05); ctx.lineTo(0, r * 2); ctx.fill();
          }
          ctx.restore();
        } else sparkle(x + r * 0.35, y - r * 0.45, r * 0.35 * (0.4 + 0.6 * pulse), '#fff6d0');
        break;
      case 'lava': // Lava Swirl: hot glow, a dark cooling swirl and dripping lava
        if (back) glow(x, y, r * 2.8, '255, 80, 0', 0.4 + 0.25 * pulse);
        else {
          ctx.strokeStyle = 'rgba(90, 20, 0, 0.7)';
          ctx.lineWidth = Math.max(0.6, r * 0.12);
          ctx.beginPath(); ctx.arc(x, y - r * 0.15, r * 0.55, t * 1.5, t * 1.5 + Math.PI * 1.2); ctx.stroke();
          const drip = (t * 0.8) % 1;
          ctx.fillStyle = '#ffb000';
          ctx.beginPath(); ctx.arc(x - r * 0.55, y + r * 0.3 + drip * r * 0.9, r * 0.14 * (1 - drip * 0.5), 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'aurora': // Frozen Aurora: a glow that shifts green, blue and purple, with icy sparkles
        if (back) glow(x, y, r * 3, hueRgb(140 + 70 * (1 + Math.sin(t * 1.2))), 0.45 + 0.15 * pulse);
        else sparkle(x - r * 0.4, y - r * 0.5, r * 0.4 * (0.4 + 0.6 * pulse), '#e6fcff');
        break;
      case 'frost': // Mint Chip: icy sparkle
        if (!back) sparkle(x + r * 0.4, y - r * 0.45, r * 0.4 * (0.4 + 0.6 * pulse), '#ffffff');
        break;
      case 'chips': // Cookie Dough: chocolate chunks
        if (!back) {
          ctx.fillStyle = '#5a3a1e';
          for (const [dx, dy] of [[-0.4, -0.3], [0.35, -0.4], [0.05, 0.05], [0.45, 0.1]]) {
            ctx.fillRect(x + dx * r - r * 0.12, y + dy * r - r * 0.12, r * 0.24, r * 0.24);
          }
        }
        break;
    }
  }

  // a rainbow arc, like the real thing: red on the outside, violet inside, faded and see-through
  function drawRainbowArc(cx, cy, radius, width, alpha) {
    const colors = mutationById.rainbow.colors;
    const band = width / colors.length;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = band + 1;
    colors.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - i * band - band / 2, Math.PI, 0);
      ctx.stroke();
    });
    // soft glow on both edges so it blends into the sky
    ctx.globalAlpha = alpha * 0.4;
    ctx.lineWidth = band * 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, radius - width - band * 0.6, Math.PI, 0); ctx.stroke();
    ctx.restore();
  }

  function drawCustomer(c, time) {
    const walking = c.state !== 'waiting';
    const bounce = walking ? Math.abs(Math.sin(time * 10 + c.id)) * 3 : 0;
    ctx.save();
    ctx.translate(c.dx, c.dy);
    ctx.scale(1.3, 1.3);
    const x = 0, y = -bounce;

    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(0, 12, 10, 4, 0, 0, Math.PI * 2); ctx.fill();

    if (c.golden) {
      ctx.fillStyle = `rgba(255, 215, 0, ${0.35 + 0.2 * Math.sin(time * 6)})`;
      ctx.beginPath(); ctx.arc(x, y - 6, 20, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = c.golden ? '#ffd700' : SHIRTS[c.look % SHIRTS.length];
    roundRect(x - 9, y - 6, 18, 18, 6); ctx.fill();
    ctx.fillStyle = SKINS[c.look % SKINS.length];
    ctx.beginPath(); ctx.arc(x, y - 13, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 3.5, y - 15, 2, 2.5);
    ctx.fillRect(x + 1.5, y - 15, 2, 2.5);
    if (c.golden) {
      ctx.fillStyle = '#ffb700';
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 20); ctx.lineTo(x - 7, y - 27); ctx.lineTo(x - 3, y - 23);
      ctx.lineTo(x, y - 29); ctx.lineTo(x + 3, y - 23); ctx.lineTo(x + 7, y - 27); ctx.lineTo(x + 7, y - 20);
      ctx.fill();
    }

    const flavor = flavorById[c.flavor];
    if (c.served && c.mutation) {
      const m = mutationById[c.mutation];
      const col = mutScoopColor(m, time + c.id);
      ctx.fillStyle = m.id === 'rainbow' ? 'rgba(255,255,255,0.8)' : col;
      ctx.globalAlpha = 0.5 + (m.id === 'rainbow' ? 0.2 * Math.sin(time * 3 + c.id) : 0);
      ctx.beginPath(); ctx.arc(x + 12, y - 4, 11, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      drawCone(x + 12, y - 2, m.id === 'rainbow' ? { stripes: m.colors } : { color: col }, 7);
    } else if (c.served) {
      drawCone(x + 12, y - 2, flavor, 6);
    } else if (c.state === 'waiting') {
      // thought bubble showing the flavor they want
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + 18, y - 30, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 8, y - 20, 3, 0, Math.PI * 2); ctx.fill();
      drawCone(x + 18, y - 32, flavor, 5);
    }
    ctx.restore();
  }

  // a player's character: bigger than customers, dressed the way they picked in the Avatar Shop
  function drawPlayer(p, time) {
    const av = p.avatar || {};
    const ROBO = { shirt: '#2c343c', pants: '#1f262e', skin: '#3a444e' }; // ⚡ robo parts are dark armor with glowing cyan cracks
    const shirt = !av.shirt || av.shirt === 'stand' ? p.color : av.shirt === 'robo' ? ROBO.shirt : av.shirt;
    const skin = av.skin === 'robo' ? ROBO.skin : av.skin || '#f8d5b8';
    const bounce = p.moving ? Math.abs(Math.sin(time * 12)) * 3 : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 18, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    const roboParts = ['shirt', 'pants', 'skin', 'hat', 'face'].filter(k => av[k] === 'robo').length;
    if (roboParts) {
      // ⚡ robo parts glow, and a full robot crackles with lightning
      glow(0, -18, 26 + roboParts * 4, '46, 232, 255', 0.08 * roboParts);
      if (roboParts >= 4 && Math.random() < 0.3) {
        const a = Math.random() * Math.PI * 2;
        zap(Math.cos(a) * 14, -18 + Math.sin(a) * 18, Math.cos(a + 0.6) * 28, -18 + Math.sin(a + 0.6) * 30, 4, 0.8);
      }
      if (p.moving && Math.random() < 0.2) petSpark(p.x + (Math.random() - 0.5) * 12, p.y + 16, { shape: 'hex', color: CYAN, vy: -30, life: 0.6, size: 2 });
    }
    ctx.scale(1.7 * (p.facing || 1), 1.7);
    const y = -bounce / 1.7;
    // legs
    ctx.fillStyle = av.pants === 'robo' ? ROBO.pants : av.pants || '#3b3b58';
    ctx.fillRect(-6, y + 6, 5, 6);
    ctx.fillRect(1, y + 6, 5, 6);
    if (av.pants === 'robo') { seam([[-5, y + 7], [-3.5, y + 9], [-4, y + 11.5]], 0.45); seam([[2, y + 7], [3.5, y + 9], [3, y + 11.5]], 0.45); }
    // body
    ctx.fillStyle = shirt;
    roundRect(-9, y - 7, 18, 15, 5); ctx.fill();
    if (shirt === '#ffffff') { ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.8; ctx.stroke(); }
    if (av.shirt === 'robo') {
      // armor plates with glowing cyan cracks and a glowing ring core
      seam([[-9, y - 3], [-4, y - 2.5], [-2.5, y - 6]], 0.5);
      seam([[9, y - 2], [4, y - 3], [3, y - 6.5]], 0.5);
      seam([[-6, y + 7.5], [-3, y + 3], [3, y + 3.5], [6, y + 7.5]], 0.5);
      cyberRing(0, y, 2.1 + Math.sin(time * 4) * 0.15);
    }
    // head
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, y - 14, 8, 0, Math.PI * 2); ctx.fill();
    if (av.skin === 'robo') {
      // a dark armor head with glowing cyan cracks
      seam([[-7.5, y - 18], [-3, y - 19.5], [0, y - 22]], 0.45);
      seam([[-7, y - 10], [-4, y - 12], [-7.8, y - 14]], 0.45);
    }
    drawFace(av.face || 'happy', y, time);
    // admins wear their crown unless they picked a special hat in the Avatar Shop
    const hat = av.hat || 'cap';
    const crown = p.admin && (hat === 'cap' || hat === 'none');
    drawHat(crown ? 'none' : hat, y, shirt);
    // the ice cream in your hand
    if (p.item && toppingById[p.item.flavor]) {
      ctx.font = '9px serif';
      ctx.textAlign = 'center';
      ctx.fillText(toppingById[p.item.flavor].emoji, 11, y + 1);
    } else if (p.item) drawCone(11, y - 2, flavorById[p.item.flavor], 6);
    if (crown) {
      // golden crown
      ctx.fillStyle = '#ffd43b';
      ctx.strokeStyle = '#e8a200'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-7, y - 20); ctx.lineTo(-7, y - 28); ctx.lineTo(-3.5, y - 24);
      ctx.lineTo(0, y - 30); ctx.lineTo(3.5, y - 24); ctx.lineTo(7, y - 28); ctx.lineTo(7, y - 20);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    if (!p.name) return;

    ctx.font = 'bold 13px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    const label = p.admin ? `👑 ${p.name} [ADMIN]` : p.name;
    const ly = p.admin || ['tophat', 'wizard', 'bunny', 'party', 'cone'].includes(av.hat) ? p.y - 66 : p.y - 46;
    ctx.strokeText(label, p.x, ly);
    ctx.fillStyle = p.admin ? '#e8a200' : p.isMe ? '#e0457b' : '#3a2a35';
    ctx.fillText(label, p.x, ly);
  }

  function drawFace(face, y, time) {
    if (face === 'robo') {
      // a glowing visor instead of eyes
      ctx.fillStyle = '#1b2430';
      roundRect(-1, y - 17.5, 10, 5, 2); ctx.fill();
      ctx.fillStyle = CYAN;
      ctx.shadowColor = CYAN; ctx.shadowBlur = 5;
      const scan = (Math.sin(time * 3) + 1) / 2 * 6;
      ctx.fillRect(0 + scan, y - 16.3, 2.5, 2.6);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#5c6b7a';
      ctx.fillRect(2, y - 10.5, 6, 1.2);
      return;
    }
    ctx.fillStyle = '#222';
    if (face === 'cool') {
      // sunglasses
      ctx.fillRect(0.5, y - 16.5, 8, 3.5);
      ctx.fillRect(-2, y - 16, 3, 1);
    } else if (face === 'wink') {
      ctx.fillRect(2, y - 15, 2, 2.5);
      ctx.fillRect(5, y - 14, 3, 1.2);
    } else if (face === 'wow') {
      ctx.beginPath(); ctx.arc(3, y - 14, 1.5, 0, Math.PI * 2); ctx.arc(6.5, y - 14, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, y - 10, 1.4, 0, Math.PI * 2); ctx.fill();
      return;
    } else {
      ctx.fillRect(2, y - 15, 2, 2.5);
      ctx.fillRect(5.5, y - 15, 2, 2.5);
    }
    if (face === 'silly') {
      ctx.fillStyle = '#ff6b8a';
      ctx.beginPath(); ctx.arc(5, y - 9.5, 1.6, 0, Math.PI); ctx.fill();
    }
    // smile
    ctx.strokeStyle = '#222'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(5, y - 11.5, 2, 0.2, Math.PI - 0.2); ctx.stroke();
  }

  function drawHat(hat, y, shirt) {
    switch (hat) {
      case 'robo': // a robot antenna with a blinking light
        ctx.fillStyle = '#2c343c';
        ctx.fillRect(-0.6, y - 28, 1.2, 7);
        ctx.fillRect(-3, y - 22.5, 6, 1.5);
        cyberRing(0, y - 29.5, 1.5 + Math.sin(nowSec * 6) * 0.2); // a glowing cyan ring on top
        break;
      case 'cap':
        ctx.fillStyle = shirt;
        ctx.beginPath(); ctx.arc(0, y - 16, 8, Math.PI, 0); ctx.fill();
        ctx.fillRect(0, y - 17, 11, 3);
        break;
      case 'tophat':
        ctx.fillStyle = '#222';
        ctx.fillRect(-9, y - 21, 18, 2.5);
        ctx.fillRect(-6, y - 33, 12, 12);
        ctx.fillStyle = '#e03131';
        ctx.fillRect(-6, y - 24, 12, 2.5);
        break;
      case 'beanie':
        ctx.fillStyle = '#4dabf7';
        ctx.beginPath(); ctx.arc(0, y - 16, 8.5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#1c7ed6';
        ctx.fillRect(-8.5, y - 18, 17, 3);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, y - 25, 2.5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'party':
        ctx.fillStyle = '#cc5de8';
        ctx.beginPath(); ctx.moveTo(-6, y - 20); ctx.lineTo(0, y - 36); ctx.lineTo(6, y - 20); ctx.fill();
        ctx.fillStyle = '#ffd43b';
        ctx.beginPath(); ctx.arc(0, y - 36, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(-3, y - 28, 6, 2);
        break;
      case 'cowboy':
        ctx.fillStyle = '#a0662d';
        ctx.beginPath(); ctx.ellipse(0, y - 20, 13, 3, 0, 0, Math.PI * 2); ctx.fill();
        roundRect(-6, y - 29, 12, 9, 3); ctx.fill();
        ctx.fillStyle = '#5c3d2e';
        ctx.fillRect(-6, y - 23, 12, 2);
        break;
      case 'wizard':
        ctx.fillStyle = '#5f3dc4';
        ctx.beginPath(); ctx.moveTo(-10, y - 19); ctx.lineTo(2, y - 40); ctx.lineTo(10, y - 19); ctx.fill();
        ctx.fillStyle = '#ffd43b';
        ctx.beginPath(); ctx.arc(0, y - 28, 1.6, 0, Math.PI * 2); ctx.arc(3, y - 23, 1.2, 0, Math.PI * 2); ctx.fill();
        break;
      case 'bunny':
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(-4, y - 28, 2.8, 8, -0.15, 0, Math.PI * 2); ctx.ellipse(4, y - 28, 2.8, 8, 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffb3c6';
        ctx.beginPath(); ctx.ellipse(-4, y - 28, 1.3, 5.5, -0.15, 0, Math.PI * 2); ctx.ellipse(4, y - 28, 1.3, 5.5, 0.15, 0, Math.PI * 2); ctx.fill();
        break;
      case 'cone':
        // a giant ice cream cone hat
        ctx.fillStyle = '#d9a35b';
        ctx.beginPath(); ctx.moveTo(-6, y - 20); ctx.lineTo(6, y - 20); ctx.lineTo(0, y - 9); ctx.fill();
        ctx.fillStyle = '#ff8fab';
        ctx.beginPath(); ctx.arc(0, y - 25, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e03131';
        ctx.beginPath(); ctx.arc(1, y - 33, 2, 0, Math.PI * 2); ctx.fill();
        break;
    }
  }

  // the Avatar Shop building at the bottom of the plaza
  function drawAvatarShop(time) {
    const { x, y } = AVATAR_SHOP;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 70, 115, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e7f5ff';
    roundRect(x - 95, y - 35, 190, 105, 8); ctx.fill();
    ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 3; ctx.stroke();
    // door
    ctx.fillStyle = '#1c7ed6';
    roundRect(x - 18, y + 15, 36, 55, 6); ctx.fill();
    // window with clothes on hangers
    ctx.fillStyle = '#9ad7ff';
    roundRect(x - 85, y - 15, 55, 45, 6); ctx.fill();
    roundRect(x + 30, y - 15, 55, 45, 6); ctx.fill();
    [['#ff6b6b', x - 72], ['#51cf66', x - 52], ['#fcc419', x + 45], ['#cc5de8', x + 65]].forEach(([c, sx]) => {
      ctx.fillStyle = c;
      roundRect(sx - 7, y - 4, 14, 16, 3); ctx.fill();
    });
    // tiny top hat in the window
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 64, y + 20, 12, 3); ctx.fillRect(x - 61, y + 12, 6, 8);
    // roof
    ctx.fillStyle = '#4dabf7';
    ctx.beginPath(); ctx.moveTo(x - 110, y - 33); ctx.lineTo(x, y - 85); ctx.lineTo(x + 110, y - 33); ctx.fill();
    // sign
    ctx.fillStyle = '#fff';
    roundRect(x - 75, y - 60, 150, 26, 8); ctx.fill();
    ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#1c7ed6';
    ctx.font = 'bold 15px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText('👕 AVATAR SHOP', x, y - 41);
    if (dist(player, { x, y: y + 85 }) <= REACH && openWindow !== 'avatar') {
      drawBubbleButton(x, y + 98, '👕 Tap to change your look', '#4dabf7', time);
    }
  }

  function drawPetShop(time) {
    const { x, y } = PET_SHOP;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 72, 140, 13, 0, 0, Math.PI * 2); ctx.fill();
    // building
    ctx.fillStyle = '#fff4e0';
    roundRect(x - 120, y - 35, 240, 105, 8); ctx.fill();
    ctx.strokeStyle = '#f08c00'; ctx.lineWidth = 3; ctx.stroke();
    // door with a paw print
    ctx.fillStyle = '#d9480f';
    roundRect(x - 20, y + 15, 40, 55, 6); ctx.fill();
    ctx.fillStyle = '#ffd8a8';
    ctx.beginPath(); ctx.arc(x, y + 44, 6, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - 7 + k * 7, y + 34, 3, 0, Math.PI * 2); ctx.fill(); }
    // windows with lucky blocks that bounce
    ctx.fillStyle = '#9ad7ff';
    roundRect(x - 105, y - 12, 70, 48, 6); ctx.fill();
    roundRect(x + 35, y - 12, 70, 48, 6); ctx.fill();
    const blockColors = ['#b07a3e', '#fcc419', '#66d9e8', null];
    blockColors.forEach((c, k) => {
      const bx = (k < 2 ? x - 88 : x + 52) + (k % 2) * 34, by = y + 8 + Math.sin(time * 4 + k) * 3;
      if (c) ctx.fillStyle = c;
      else {
        const g = ctx.createLinearGradient(bx - 10, 0, bx + 10, 0);
        ['#ff4040', '#ffee00', '#39d353', '#3d9bff', '#ff4fd8'].forEach((cc, i, a) => g.addColorStop(i / (a.length - 1), cc));
        ctx.fillStyle = g;
      }
      roundRect(bx - 10, by - 10, 20, 20, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px Trebuchet MS';
      ctx.textAlign = 'center';
      ctx.fillText('?', bx, by + 5);
    });
    // roof
    ctx.fillStyle = '#f08c00';
    ctx.beginPath(); ctx.moveTo(x - 138, y - 33); ctx.lineTo(x, y - 92); ctx.lineTo(x + 138, y - 33); ctx.fill();
    // a little dragon on the roof
    ctx.font = '34px serif';
    ctx.fillText('🐉', x, y - 92 + Math.sin(time * 2) * 3);
    // sign
    ctx.fillStyle = '#fff';
    roundRect(x - 75, y - 64, 150, 26, 8); ctx.fill();
    ctx.strokeStyle = '#f08c00'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#d9480f';
    ctx.font = 'bold 15px Trebuchet MS';
    ctx.fillText('🐾 PET SHOP', x, y - 45);
    if (dist(player, { x, y: y + 90 }) <= REACH && openWindow !== 'petshop') {
      drawBubbleButton(x, y + 98, '🐾 Tap to open lucky blocks', '#f08c00', time);
    }
  }

  // colored sky, falling sparkles and a banner while a mutation is happening
  // the color of a mutated scoop (Impossible cycles through every color)
  function mutScoopColor(m, time) {
    if (m.id === 'impossible') return `hsl(${(time * 240) % 360}, 100%, 60%)`;
    return mutColor(m, time);
  }

  const pickColor = m => m.colors[Math.floor(Math.random() * m.colors.length)];

  function drawEventEffects(time, dt) {
    const muts = activeMuts();
    // with several mutations going, each one gets a share of the tint and sparkles
    const share = 1 / Math.max(1, muts.length);
    for (const m of muts) drawOneMutation(m, time, dt * Math.max(share, 0.5), share);
    drawAmbient(time, dt);
  }

  function drawOneMutation(m, time, dt, share) {
    if (m.id === 'rainbow') {
      drawSunShower(dt);
    } else if (m) {
      const tint = ({ impossible: 0.1, sakura: 0.08, meteor: 0.12, cyber: 0.3 }[m.id] ?? 0.13) *
        Math.max(share, 0.5);
      if (tint) {
        ctx.globalAlpha = tint;
        ctx.fillStyle = m.id === 'impossible' ? `hsl(${(time * 120) % 360}, 100%, 50%)` : m.id === 'cyber' ? '#04121c' : m.colors[0];
        ctx.fillRect(0, 0, world.width, world.height);
        ctx.globalAlpha = 1;
      }
      const rate = m.id === 'meteor' ? 1.5 : 20; // fewer of the big meteors
      for (let i = 0; i < 2; i++) {
        if (Math.random() >= dt * rate) continue;
        const p = { x: Math.random() * world.width, y: -10, vy: 40 + Math.random() * 60,
          vx: (Math.random() - 0.5) * 30, r: 2 + Math.random() * 3, color: pickColor(m), shape: 'dot' };
        if (m.id === 'sakura') { p.shape = 'petal'; p.r += 2; p.vy *= 0.6; p.vx += 25; }      // drifting cherry blossoms
        if (m.id === 'cyber') {                                                             // glowing cyan sparks floating up
          Object.assign(p, { y: world.height + 10, vy: -(30 + Math.random() * 50), color: Math.random() < 0.7 ? CYAN : '#d9fdff', r: 1.5 + Math.random() * 2.5 });
        }
        if (m.id === 'meteor') {                                                            // big flaming meteors
          Object.assign(p, { x: world.width * 0.2 + Math.random() * world.width, y: -20, vx: -220 - Math.random() * 80, vy: 340 + Math.random() * 80,
            shape: 'meteor', r: 6 + Math.random() * 6, life: 4 });
        }
        if (m.id === 'impossible') {
          // sparks fly out in every direction
          const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
          Object.assign(p, { y: Math.random() * world.height, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 1.5, color: `hsl(${Math.random() * 360}, 100%, 60%)` });
        }
        ambient.push(p);
      }
      if (m.id === 'impossible') drawGlitch(time);
      if (m.id === 'cyber') drawCyberGrid(time, share);
    }
  }

  function drawAmbient(time, dt) {
    for (let i = ambient.length - 1; i >= 0; i--) {
      const p = ambient[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life !== undefined) p.life -= dt;
      if (p.y > world.height + 20 || p.y < -20 || p.life <= 0) { ambient.splice(i, 1); continue; }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life !== undefined ? Math.min(0.9, p.life) : 0.8;
      if (p.shape === 'code') {
        ctx.font = `bold ${p.r * 1.6}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.shape === 'petal') {
        // a pink petal tumbling in the wind
        ctx.save();
        ctx.translate(p.x + Math.sin(time * 1.5 + i) * 14, p.y);
        ctx.rotate(time * 2 + i);
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.ellipse(-p.r * 0.3, 0, p.r * 0.35, p.r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (p.shape === 'meteor') {
        // a flaming rock with a fading tail behind it
        const sp = Math.hypot(p.vx, p.vy), tx = -p.vx / sp, ty = -p.vy / sp, len = 90;
        const tail = ctx.createLinearGradient(p.x, p.y, p.x + tx * len, p.y + ty * len);
        tail.addColorStop(0, 'rgba(255,200,60,0.9)');
        tail.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.strokeStyle = tail; ctx.lineWidth = p.r * 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + tx * len, p.y + ty * len); ctx.stroke();
        ctx.lineCap = 'butt';
        glow(p.x, p.y, p.r * 3, '255, 120, 0', 0.6);
        ctx.fillStyle = '#5c2a00';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd43b';
        ctx.beginPath(); ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.7 + 0.3 * Math.sin(time * 8 + i)), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ⚡ Cyber mutation: blue lightning striking all over the park
  const cyberBolts = [];
  let cyberFlash = 0;
  function drawCyberGrid(time, share) {
    const k = Math.max(share, 0.5);
    // a glowing hexagon wave slowly sweeping across the whole park
    const sweep = ((time * 160) % (world.width + 600)) - 300;
    for (let y = 30; y < world.height; y += 70) {
      for (let dx = -2; dx <= 2; dx++) {
        const hx = sweep + dx * 60 + ((y / 70) % 2) * 30;
        hexagon(hx, y, 26, 0, 1, (1 - Math.abs(dx) / 2.5) * 0.35 * k, true);
      }
    }
    // lightning strikes: big bolts from the sky with branches, a shockwave and sparks where they land
    if (Math.random() < 0.07 * k) {
      const x2 = Math.random() * world.width, y2 = 200 + Math.random() * (world.height - 220);
      cyberBolts.push({ x: x2 + (Math.random() - 0.5) * 200, y: -20, x2, y2, life: 0.4, big: Math.random() < 0.2 });
      if (cyberBolts[cyberBolts.length - 1].big) {
        cyberFlash = Math.max(cyberFlash, 0.12); // a soft flash (gentle and not too often, so it never strobes)
        petSpark(x2, y2, { shape: 'ring', color: CYAN, vy: 0, life: 1, size: 20, grow: 260 });
        for (let i = 0; i < 16; i++) petSpark(x2, y2, { shape: 'hex', color: i % 2 ? '#d9fdff' : CYAN, vx: (Math.random() - 0.5) * 320, vy: -Math.random() * 260, life: 0.9, size: 3 });
      }
    }
    for (let i = cyberBolts.length - 1; i >= 0; i--) {
      const bolt = cyberBolts[i];
      bolt.life -= 1 / 60;
      if (bolt.life <= 0) { cyberBolts.splice(i, 1); continue; }
      const w = bolt.big ? 3.2 : 2;
      glow(bolt.x2, bolt.y2, bolt.big ? 120 : 60, '46, 232, 255', 0.35);
      zap(bolt.x, bolt.y, bolt.x2, bolt.y2, 26, w);
      for (let b = 0; b < (bolt.big ? 3 : 1); b++) {
        const f = 0.3 + Math.random() * 0.5, mx = bolt.x + (bolt.x2 - bolt.x) * f, my = bolt.y + (bolt.y2 - bolt.y) * f;
        zap(mx, my, mx + (Math.random() - 0.5) * 140, my + 50 + Math.random() * 90, 12, w * 0.55); // branches
      }
    }
    // sparks crackling on the ground here and there
    if (Math.random() < 0.25 * k) {
      const sx = Math.random() * world.width, sy = Math.random() * world.height;
      zap(sx, sy, sx + (Math.random() - 0.5) * 50, sy + (Math.random() - 0.5) * 30, 6, 0.9);
    }
    if (cyberFlash > 0) {
      ctx.fillStyle = `rgba(160, 245, 255, ${cyberFlash})`;
      ctx.fillRect(0, 0, world.width, world.height);
      cyberFlash = Math.max(0, cyberFlash - 0.012);
    }
  }

  // Impossible mutation: the world glitches with soft colored bars (changes a few times a second, not flashing)
  function drawGlitch(time) {
    let seed = Math.floor(time * 4) * 9301;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let k = 0; k < 5; k++) {
      ctx.globalAlpha = 0.08 + rand() * 0.07;
      ctx.fillStyle = `hsl(${rand() * 360}, 100%, 55%)`;
      ctx.fillRect(0, rand() * world.height, world.width, 6 + rand() * 30);
    }
    ctx.globalAlpha = 1;
  }

  // the mutation banner stays at the top of the screen (screen coordinates)
  function drawEventBanner(time) {
    const muts = activeMuts();
    const m = muts[0];
    if (!m) return;
    const text = muts.length > 1
      ? `${muts.map(x => `${x.emoji} ${x.name.toUpperCase()}`).join(' + ')} · ${clock(gameEvent.left)}`
      : `${m.emoji} ${m.name.toUpperCase()} MUTATION · x${m.mult} · ${clock(gameEvent.left)}`;
    ctx.font = 'bold 16px Trebuchet MS';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 30;
    ctx.fillStyle = 'rgba(30, 15, 25, 0.75)';
    roundRect(view.w / 2 - w / 2, 8, w, 32, 12); ctx.fill();
    ctx.strokeStyle = mutScoopColor(m, time); ctx.lineWidth = 3; ctx.stroke();
    if (muts.some(x => x.id === 'impossible')) {
      // glitchy text
      const j = Math.sin(time * 20) * 1.5;
      ctx.fillStyle = 'rgba(0,255,255,0.8)'; ctx.fillText(text, view.w / 2 - 2 + j, 30);
      ctx.fillStyle = 'rgba(255,0,255,0.8)'; ctx.fillText(text, view.w / 2 + 2 - j, 30);
    }
    ctx.fillStyle = '#fff';
    ctx.fillText(text, view.w / 2, 30);
  }

  // Rainbow mutation: warm sunlight after rain, a big rainbow across the park, a light sun shower
  const raindrops = [];
  function drawRainbowSky(time) {
    const sun = ctx.createRadialGradient(world.width * 0.9, -40, 20, world.width * 0.9, -40, 700);
    sun.addColorStop(0, 'rgba(255, 244, 200, 0.45)');
    sun.addColorStop(1, 'rgba(255, 244, 200, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, world.width, world.height);

    const fade = Math.min(1, (300 - gameEvent.left) / 4 + 0.15, gameEvent.left / 4); // fade in and out
    const shimmer = 0.03 * Math.sin(time * 0.8);
    drawRainbowArc(world.width / 2, world.height + 120, world.width * 0.62, 150, (0.34 + shimmer) * fade);
    drawRainbowArc(world.width / 2, world.height + 120, world.width * 0.62 + 190, 100, (0.12 + shimmer / 2) * fade); // faint double rainbow
  }

  function drawSunShower(dt) {
    // light sun-shower rain: thin slanted streaks
    if (Math.random() < dt * 50) {
      raindrops.push({ x: Math.random() * (world.width + 200), y: -20, v: 600 + Math.random() * 250 });
    }
    ctx.strokeStyle = 'rgba(220, 235, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = raindrops.length - 1; i >= 0; i--) {
      const d = raindrops[i];
      d.y += d.v * dt; d.x -= d.v * 0.2 * dt;
      if (d.y > world.height) { raindrops.splice(i, 1); continue; }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 4, d.y - 18);
    }
    ctx.stroke();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    nowSec = time;

    updatePlayer(dt);
    updateCamera(dt);
    if (tour.on) placeTour();

    ctx.fillStyle = '#6fb34c';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.beginPath(); ctx.rect(0, 0, world.width, world.height); ctx.clip();

    drawPark(time);
    const ids = gameEvent.ids || [];
    if (ids.includes('rainbow')) drawRainbowSky(time); // behind everything, like a real rainbow
    drawShop(time);
    drawAvatarShop(time);
    drawPetShop(time);
    const used = new Set(stands.map(s => s.slot));
    slots.forEach((slot, i) => { if (!used.has(i)) drawEmptySlot(slot); });
    for (const s of stands) drawStand(s, time);
    for (const s of stands) drawChest(s, time);

    // smooth customers and other players toward their latest server position
    const k = Math.min(1, dt * 10);
    const entities = [];
    for (const c of customers.values()) {
      c.dx += (c.x - c.dx) * k; c.dy += (c.y - c.dy) * k;
      entities.push({ y: c.dy, draw: () => drawCustomer(c, time) });
    }
    for (const s of stands) {
      if (s.id === myId) {
        if (!player.placed) continue;
        const p = { x: player.x, y: player.y, facing: player.facing, moving: player.moving,
          color: s.color, name: s.name, item: heldItem(), isMe: true, admin: s.admin, avatar: s.avatar };
        entities.push({ y: p.y, draw: () => drawPlayer(p, time) });
        continue;
      }
      let o = others.get(s.id);
      if (!o) { o = { x: s.x, y: s.y, facing: 1 }; others.set(s.id, o); }
      const nx = o.x + (s.x - o.x) * k;
      o.moving = Math.abs(nx - o.x) + Math.abs(s.y - o.y) > 0.5;
      if (Math.abs(nx - o.x) > 0.3) o.facing = nx > o.x ? 1 : -1;
      o.x = nx; o.y += (s.y - o.y) * k;
      const p = { ...o, color: s.color, name: s.name, item: s.hand >= 0 ? s.hotbar[s.hand] : null, admin: s.admin, avatar: s.avatar };
      entities.push({ y: o.y, draw: () => drawPlayer(p, time) });
    }
    // your pets follow you in a little line
    const shown = new Set();
    for (const s of stands) {
      const owner = s.id === myId ? (player.placed ? player : null) : others.get(s.id);
      if (!owner) continue;
      let lead = owner;
      (s.worn || []).forEach((id, k) => {
        const pet = petById[id];
        if (!pet) return;
        const key = s.id + ':' + k;
        let pp = petPos.get(key);
        // the first pet follows you, the next one follows that pet, and so on (big pets keep more space)
        const gap = (k ? 30 : 24) + 16 * (PET_SIZE[pet.id] || 1);
        const tx = lead.x - (owner.facing || 1) * gap, ty = lead.y + (k ? 2 : 8);
        if (!pp) { pp = { x: tx, y: ty, facing: 1, turn: 1, speed: 0, step: 0, still: 0, chasing: false }; petPos.set(key, pp); }
        const dx = tx - pp.x, dy = ty - pp.y, d = Math.hypot(dx, dy);
        // like a real pet: it waits when it's close, then trots to catch up (faster when far behind)
        if (d > 45) pp.chasing = true;
        else if (d < 8) pp.chasing = false;
        const want = pp.chasing ? Math.min(420, Math.max(70, d * 3.5)) : 0;
        pp.speed += (want - pp.speed) * Math.min(1, dt * 6);
        if (d > 0.5 && pp.speed > 1) {
          const stepLen = Math.min(d, pp.speed * dt);
          pp.x += dx / d * stepLen; pp.y += dy / d * stepLen;
        }
        if (d > 600) { pp.x = tx; pp.y = ty; } // teleported (new round, far away): jump along
        pp.moving = pp.speed > 25;
        pp.step += dt * Math.min(pp.speed, 300) / 45;
        if (pp.moving) {
          pp.still = 0;
          if (Math.abs(dx) > 4) pp.facing = dx > 0 ? 1 : -1;
        } else {
          pp.still += dt;
          // waiting: look at its owner, and look around now and then
          if (Math.abs(owner.x - pp.x) > 6) pp.facing = owner.x > pp.x ? 1 : -1;
          if (pp.still > 2 && (time + s.id * 1.7 + k * 2.3) % 6 < 0.9) pp.facing = -pp.facing;
        }
        pp.turn += (pp.facing - pp.turn) * Math.min(1, dt * 9);
        shown.add(key);
        entities.push({ y: pp.y - 1, draw: () => drawPet(pet, pp, time, dt, s.id + k * 7) });
        lead = pp;
      });
    }
    for (const key of petPos.keys()) if (!shown.has(key)) petPos.delete(key);
    entities.sort((a, b) => a.y - b.y);
    for (const e of entities) e.draw();

    // where you're walking to
    if (walkTarget && !walkTarget.action) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(walkTarget.x, walkTarget.y, 12, 5, 0, 0, Math.PI * 2); ctx.stroke();
    }

    drawPetParticles(dt);
    drawEventEffects(time, dt);
    if (tut.step >= 0) { updateTutorial(); drawTutorialArrow(time); }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      p.vy += 500 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t > 1.2) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - p.t / 1.2;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += dt;
      if (f.t > 1.6) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - f.t / 1.6;
      ctx.font = `bold ${f.size}px Trebuchet MS`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = f.mutation ? '#2a1a25' : '#fff';
      ctx.strokeText(f.text, f.x, f.y - f.t * 40);
      if (f.mutation && f.mutation.id === 'rainbow') {
        const w = ctx.measureText(f.text).width;
        const g = ctx.createLinearGradient(f.x - w / 2, 0, f.x + w / 2, 0);
        f.mutation.colors.forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
        ctx.fillStyle = g;
      } else ctx.fillStyle = f.mutation ? mutScoopColor(f.mutation, time) : f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 40);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
    drawEventBanner(time);
    drawAvatarPreview(time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__icecream = { view, player, home: () => myStandPos(), send, // for automated tests
    drawPetModel(id, canvasEl, time = 0.6) { // draws one low-poly pet big, to check how it looks
      const saved = ctx; ctx = canvasEl.getContext('2d');
      ctx.translate(canvasEl.width / 2, canvasEl.height * 0.78); ctx.scale(canvasEl.width / 48, canvasEl.width / 48);
      PET_MODELS[id](time, 0, false); ctx = saved;
    } }; // for automated tests
})();
