(() => {
  const { RARITIES, FLAVORS, UPGRADES, upgradeCost, spaceCost, MUTATIONS, MUTATION_CHANCE,
    HOTBAR_SIZE, STORAGE_SIZE } = window.GameData;
  const { SHOP, REACH, chestPos, tubPos } = window.Engine;
  const mutationById = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));
  const flavorById = Object.fromEntries(FLAVORS.map(f => [f.id, f]));

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  let ws = null;
  let myId = null;
  let world = { width: 1280, height: 1180 };
  let slots = [];
  let stands = [];
  const customers = new Map(); // id -> { ...server data, dx, dy (display position) }
  const others = new Map();    // stand id -> display position of other players' characters
  const floaters = [];
  const ambient = []; // falling sparkles during a mutation event
  const particles = [];
  let view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0 };
  let spaceBtn = null; // Extra Space button area (world coords) while it's showing
  let gameEvent = { id: null, left: 0, next: 0 }; // current mutation event
  let shop = { stock: {}, left: 0 };

  // your character (moved here in the browser, then sent to the server)
  const player = { x: 0, y: 0, placed: false, facing: 1, moving: false };
  let walkTarget = null; // { x, y, reach, action } when walking somewhere you tapped
  const keys = new Set();
  let hand = -1;         // selected hotbar slot
  let openWindow = null; // 'shop' | 'inventory' | null

  // ---------- helpers ----------
  function fmt(n) {
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
    const f = flavorById[flavorId];
    return `<div class="icon"><div class="ball" style="background:${f.color}"></div><div class="cone"></div></div>`;
  }

  // ---------- joining ----------
  $('joinForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('nameInput').value.trim();
    if (!name) return;
    try { localStorage.setItem('icecream-name', name); } catch (e) {}
    connect(name);
  });
  try { $('nameInput').value = localStorage.getItem('icecream-name') || ''; } catch (e) {}
  if (window.SOLO) {
    document.querySelector('.hint').textContent =
      'Single-player test version: your progress is saved in this browser.';
  }

  function connect(name) {
    $('joinError').textContent = '';
    if (window.SOLO) return startSolo(name);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => send({ type: 'join', name });
    ws.onmessage = e => onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      if (myId) { toast('Disconnected from server. Refresh to rejoin.'); }
      else if (!$('joinError').textContent) $('joinError').textContent = 'Could not connect to the server.';
    };
  }

  // Single-file version: run the game engine right here in the browser, saving to this device
  function startSolo(name) {
    const SAVE_KEY = 'icecream-solo-saves';
    let saves = {};
    try { saves = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) {}
    const game = window.Engine.createGame({ saves, allowTest: true });
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
    send({ type: 'join', name });
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
        buildPanel();
        buildHotbar();
        $('testTools').classList.toggle('hidden', !msg.allowTest);
        resize();
        toast(msg.returning ? 'Welcome back! Your stand is open again.'
          : 'Welcome! Walk with the arrow keys or tap where you want to go.');
        break;
      case 'error':
        if (myId) toast(msg.text); else $('joinError').textContent = msg.text;
        break;
      case 'state':
        stands = msg.stands;
        gameEvent = msg.event;
        shop = msg.shop;
        if (!player.placed && me()) {
          player.x = me().x; player.y = me().y; player.placed = true;
        }
        syncCustomers(msg.customers);
        updatePanel();
        updateHotbar();
        if (openWindow === 'shop') updateShop();
        if (openWindow === 'inventory') updateInventory();
        break;
      case 'sale':
        onSale(msg);
        break;
      case 'bought': {
        const f = flavorById[msg.flavor];
        toast(`You bought ${f.name}! Hold it and place it on your stand.`);
        break;
      }
      case 'placed': {
        const f = flavorById[msg.flavor];
        toast(`${f.name} is growing! Ready in ${growText(RARITIES[f.rarity].growSec)}.`);
        if (s) confetti(slots[s.slot].x, slots[s.slot].y, 12);
        break;
      }
      case 'restock':
        toast('🛒 The Ice Cream Shop has new stock!');
        break;
      case 'mutationStart': {
        const m = mutationById[msg.mutation];
        toast(m.id === 'rainbow'
          ? `🌈 A RAINBOW appeared! The best mutation: scoops can turn Rainbow (x${m.mult} money)!`
          : `${m.emoji} ${m.name} mutation has started! Scoops can turn ${m.name} (x${m.mult} money)!`);
        for (const sl of slots) confetti(sl.x, sl.y - 40, 12);
        break;
      }
      case 'mutationEnd':
        toast(`The ${mutationById[msg.mutation].name} mutation is over.`);
        break;
      case 'spaceAdded':
        toast(`+3 flavor spaces! Your stand now holds ${msg.spaces} tubs.`);
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
    if (msg.mutation) {
      const m = mutationById[msg.mutation];
      floaters.push({ x: slot.x, y: slot.y - (msg.golden ? 60 : 36), text: `${m.emoji} ${m.name.toUpperCase()} x${m.mult}!`,
        mutation: m, size: 19, t: 0 });
      if (msg.standId === myId) confetti(slot.x, slot.y - 40, 20);
    }
    if (msg.standId === myId && rarity.order >= 4) confetti(slot.x, slot.y - 40, 25);
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
    for (const f of FLAVORS) {
      const r = RARITIES[f.rarity];
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="scoop"></div>
        <div class="info">
          <div class="name"></div>
          <div class="meta"><span class="badge ${f.rarity}" style="background-color:${r.color}">${r.name}</span>
            ${fmt(f.price)} / scoop · grows in ${growText(r.growSec)}</div>
        </div>`;
      fl.appendChild(row);
      f.row = row;
    }

    const mu = $('mutations');
    mu.innerHTML = '';
    for (const m of MUTATIONS) {
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
    for (const f of FLAVORS) {
      const r = RARITIES[f.rarity];
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="iconWrap"></div>
        <div class="info">
          <div class="name"></div>
          <div class="meta"><span class="badge ${f.rarity}" style="background-color:${r.color}">${r.name}</span>
            ${fmt(f.price)} / scoop · grows in ${growText(r.growSec)}</div>
          <div class="stock"></div>
        </div>
        <button>${fmt(f.cost)}</button>`;
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
    $('shopTimerSide').textContent = `🛒 Shop restocks in ${clock(shop.left)}`;

    for (const f of FLAVORS) {
      const hidden = isSecretHidden(f, s);
      f.row.querySelector('.name').textContent = hidden ? '???' : f.name;
      f.row.querySelector('.scoop').style.background = hidden ? '#222' : f.color;
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
    const ev = gameEvent.id && mutationById[gameEvent.id];
    box.classList.toggle('active', !!ev);
    if (ev) {
      box.style.background = mutGradient(ev);
      box.innerHTML = `<div class="big">${ev.emoji} ${ev.name.toUpperCase()} MUTATION!</div>
        ${Math.round(MUTATION_CHANCE * 100)}% of scoops turn ${ev.name} (x${ev.mult}) · ${clock(gameEvent.left)} left`;
    } else {
      box.style.background = '';
      box.textContent = `Next mutation in ${clock(gameEvent.next)}`;
    }
    for (const m of MUTATIONS) {
      const n = s.mutations[m.id] || 0;
      m.row.querySelector('.count').textContent = n ? `${n} sold` : 'not yet';
      m.row.classList.toggle('active-mut', gameEvent.id === m.id);
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
    if (item) toast(`Holding ${flavorById[item.flavor].name}. Tap a dashed space on your stand to place it.`);
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
      cell.title = item ? flavorById[item.flavor].name : '';
    });
    $('handLabel').textContent = heldItem() ? `In hand: ${flavorById[heldItem().flavor].name}` : '';
  }

  // ---------- shop and inventory windows ----------
  function openShop() {
    openWindow = 'shop';
    $('invModal').classList.add('hidden');
    $('shopModal').classList.remove('hidden');
    updateShop();
  }

  function openInventory() {
    openWindow = 'inventory';
    $('shopModal').classList.add('hidden');
    $('invModal').classList.remove('hidden');
    updateInventory();
  }

  function closeWindows() {
    openWindow = null;
    $('shopModal').classList.add('hidden');
    $('invModal').classList.add('hidden');
  }
  $('shopClose').addEventListener('click', closeWindows);
  $('invClose').addEventListener('click', closeWindows);

  function updateShop() {
    const s = me();
    if (!s) return;
    $('shopTimer').textContent = `New stock in ${clock(shop.left)}`;
    for (const f of FLAVORS) {
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
      row.querySelector('button').disabled = left <= 0 || s.money < f.cost;
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
  $('testGrowBtn').addEventListener('click', () => send({ type: 'testGrow' }));

  const MOVE_KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };

  document.addEventListener('keydown', e => {
    if (!myId || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
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
    // the Ice Cream Shop
    if (inRect(wx, wy, { x: SHOP.x - 150, y: SHOP.y - 100, w: 300, h: 200 })) {
      return goDo({ x: SHOP.x, y: SHOP.y + 90 }, 60, openShop);
    }
    // a space on your stand
    for (let i = 0; i < s.spaces; i++) {
      const p = tubPos(slot, i, s.spaces);
      if (Math.hypot(wx - p.x, wy - p.y) < 13) {
        const tub = s.tubs[i];
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
  function updateCamera() {
    const sw = world.width * view.scale, sh = world.height * view.scale;
    const ox = view.w / 2 - player.x * view.scale, oy = view.h / 2 - player.y * view.scale;
    view.ox = sw <= view.w ? (view.w - sw) / 2 : Math.min(0, Math.max(view.w - sw, ox));
    view.oy = sh <= view.h ? (view.h - sh) / 2 : Math.min(0, Math.max(view.h - sh, oy));
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
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
    // plaza in front of the shop and a path down the middle
    ctx.fillRect(0, SHOP.y + 75, world.width, 70);
    ctx.fillRect(SHOP.x - 40, SHOP.y + 75, 80, world.height);
    // paths between rows of stands
    for (let i = 0; i < slots.length; i += 4) {
      ctx.fillRect(0, slots[i].y + 75, world.width, 115);
    }
    // trees in the gaps between stands
    for (let i = 0; i < slots.length; i += 4) {
      for (const x of [22, 326, 952, 1258]) drawTree(x, slots[i].y - 40);
    }
    for (const x of [60, 180, 300, 980, 1100, 1220]) drawTree(x, 60);
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
    ctx.fillText('ICE CREAM SHOP', x, y - 47);
    // restock timer
    ctx.fillStyle = 'rgba(40, 20, 35, 0.8)';
    roundRect(x - 80, y + 78, 160, 24, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Trebuchet MS';
    ctx.fillText(`New stock in ${clock(shop.left)}`, x, y + 95);
    if (dist(player, { x, y: y + 90 }) <= REACH && openWindow !== 'shop') {
      drawBubbleButton(x, y + 128, '🛒 Tap the shop to buy', '#ff6fa5', time);
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
    const p = tubPos(slot, i, s.spaces);
    const tub = s.tubs[i];
    const mine = s.id === myId;
    if (!tub) {
      if (mine && holding) {
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
    // scoop grows bigger until it's ready
    ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.arc(p.x, p.y + 1, 3 + 6.5 * progress, Math.PI, 0); ctx.fill();
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
    } else if (f.rarity === 'secret' || f.rarity === 'mythic' || f.rarity === 'legendary') {
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(time * 5 + i)})`;
      ctx.beginPath(); ctx.arc(p.x + 3, p.y - 4, 1.8, 0, Math.PI * 2); ctx.fill();
    }
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
    const holding = mine && !!heldItem();
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
      const cost = !s.tubs.includes(null) ? spaceCost(s.spaces) : null;
      if (cost !== null) {
        // stand is full: show the Extra Space button on top of it
        const text = `Extra Space +3 (${fmt(cost)})`;
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
    if (flavor.stripes) {
      // real rainbow scoop: soft color bands from red on top to violet at the bottom
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      const band = (2 * r) / flavor.stripes.length;
      flavor.stripes.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(cx - r, cy - r + i * band, 2 * r, band + 0.5);
      });
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; // shine
      ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = flavor.color;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
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
      ctx.fillStyle = m.id === 'rainbow' ? 'rgba(255,255,255,0.8)' : mutColor(m, time + c.id);
      ctx.globalAlpha = 0.5 + (m.id === 'rainbow' ? 0.2 * Math.sin(time * 3 + c.id) : 0);
      ctx.beginPath(); ctx.arc(x + 12, y - 4, 11, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      drawCone(x + 12, y - 2, m.id === 'rainbow' ? { stripes: m.colors } : { color: mutColor(m, time) }, 7);
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

  // a player's character: bigger than customers, wears their stand's color, shows their name
  function drawPlayer(p, time) {
    const bounce = p.moving ? Math.abs(Math.sin(time * 12)) * 3 : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 18, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(1.7 * p.facing, 1.7);
    const y = -bounce / 1.7;
    // legs
    ctx.fillStyle = '#3b3b58';
    ctx.fillRect(-6, y + 6, 5, 6);
    ctx.fillRect(1, y + 6, 5, 6);
    // body
    ctx.fillStyle = p.color;
    roundRect(-9, y - 7, 18, 15, 5); ctx.fill();
    // head
    ctx.fillStyle = '#f8d5b8';
    ctx.beginPath(); ctx.arc(0, y - 14, 8, 0, Math.PI * 2); ctx.fill();
    // cap
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(0, y - 16, 8, Math.PI, 0); ctx.fill();
    ctx.fillRect(0, y - 17, 11, 3);
    ctx.fillStyle = '#222';
    ctx.fillRect(2, y - 15, 2, 2.5);
    ctx.fillRect(5.5, y - 15, 2, 2.5);
    // the ice cream in your hand
    if (p.item) drawCone(11, y - 2, flavorById[p.item.flavor], 6);
    ctx.restore();

    ctx.font = 'bold 13px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.strokeText(p.name, p.x, p.y - 46);
    ctx.fillStyle = p.isMe ? '#e0457b' : '#3a2a35';
    ctx.fillText(p.name, p.x, p.y - 46);
  }

  // colored sky, falling sparkles and a banner while a mutation is happening
  function drawEventEffects(time, dt) {
    const m = gameEvent.id && mutationById[gameEvent.id];
    if (m && m.id === 'rainbow') {
      drawSunShower(dt);
    } else if (m) {
      ctx.globalAlpha = m.id === 'bloodmoon' ? 0.22 : 0.13;
      ctx.fillStyle = m.colors[0];
      ctx.fillRect(0, 0, world.width, world.height);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 2; i++) {
        if (Math.random() < dt * 20) {
          ambient.push({ x: Math.random() * world.width, y: -10, vy: 40 + Math.random() * 60,
            vx: (Math.random() - 0.5) * 30, r: 2 + Math.random() * 3,
            color: m.colors[Math.floor(Math.random() * m.colors.length)] });
        }
      }
    }
    for (let i = ambient.length - 1; i >= 0; i--) {
      const p = ambient[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > world.height + 10) { ambient.splice(i, 1); continue; }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.7 + 0.3 * Math.sin(time * 8 + i)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // the mutation banner stays at the top of the screen (screen coordinates)
  function drawEventBanner(time) {
    const m = gameEvent.id && mutationById[gameEvent.id];
    if (!m) return;
    const text = `${m.emoji} ${m.name.toUpperCase()} MUTATION · x${m.mult} · ${clock(gameEvent.left)}`;
    ctx.font = 'bold 16px Trebuchet MS';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 30;
    ctx.fillStyle = 'rgba(30, 15, 25, 0.75)';
    roundRect(view.w / 2 - w / 2, 8, w, 32, 12); ctx.fill();
    ctx.strokeStyle = mutColor(m, time); ctx.lineWidth = 3; ctx.stroke();
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
    drawRainbowArc(world.width / 2, world.height + 120, 1100, 140, (0.34 + shimmer) * fade);
    drawRainbowArc(world.width / 2, world.height + 120, 1290, 100, (0.12 + shimmer / 2) * fade); // faint double rainbow
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

    updatePlayer(dt);
    updateCamera();

    ctx.fillStyle = '#6fb34c';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.beginPath(); ctx.rect(0, 0, world.width, world.height); ctx.clip();

    drawPark(time);
    if (gameEvent.id === 'rainbow') drawRainbowSky(time); // behind everything, like a real rainbow
    drawShop(time);
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
          color: s.color, name: s.name, item: heldItem(), isMe: true };
        entities.push({ y: p.y, draw: () => drawPlayer(p, time) });
        continue;
      }
      let o = others.get(s.id);
      if (!o) { o = { x: s.x, y: s.y, facing: 1 }; others.set(s.id, o); }
      const nx = o.x + (s.x - o.x) * k;
      o.moving = Math.abs(nx - o.x) + Math.abs(s.y - o.y) > 0.5;
      if (Math.abs(nx - o.x) > 0.3) o.facing = nx > o.x ? 1 : -1;
      o.x = nx; o.y += (s.y - o.y) * k;
      const p = { ...o, color: s.color, name: s.name, item: s.hand >= 0 ? s.hotbar[s.hand] : null };
      entities.push({ y: o.y, draw: () => drawPlayer(p, time) });
    }
    entities.sort((a, b) => a.y - b.y);
    for (const e of entities) e.draw();

    // where you're walking to
    if (walkTarget && !walkTarget.action) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(walkTarget.x, walkTarget.y, 12, 5, 0, 0, Math.PI * 2); ctx.stroke();
    }

    drawEventEffects(time, dt);

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
      } else ctx.fillStyle = f.mutation ? mutColor(f.mutation, time) : f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 40);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
    drawEventBanner(time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__icecream = { view, player }; // for automated tests
})();
