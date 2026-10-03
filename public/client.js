(() => {
  const { RARITIES, FLAVORS, UPGRADES, upgradeCost, spaceCost, MUTATIONS, MUTATION_CHANCE,
    HOTBAR_SIZE, STORAGE_SIZE, AVATAR } = window.GameData;
  const { SHOP, AVATAR_SHOP, REACH, chestPos, tubPos } = window.Engine;
  const mutationById = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));
  const flavorById = Object.fromEntries(FLAVORS.map(f => [f.id, f]));

  const canvas = document.getElementById('canvas');
  let ctx = canvas.getContext('2d');
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
  const guideFlavors = () => FLAVORS.filter(f => !f.adminOnly || iAmAdmin);
  const shopFlavors = FLAVORS.filter(f => !f.adminOnly);

  // ---------- helpers ----------
  function fmt(n) {
    if (n >= 1e12) return '$' + +(n / 1e12).toFixed(2) + 'T';
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
      'Single-player test version: your progress is saved in this browser.';
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
    ws.onopen = () => send({ type: 'join', name, device: deviceId(), adminCode });
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
        buildPanel();
        buildHotbar();
        $('testTools').classList.toggle('hidden', !msg.allowTest && !msg.admin);
        $('adminPanel').classList.toggle('hidden', !msg.admin);
        // remember the admin code on this device, so next time just the name is enough
        if (msg.admin && adminCode) { try { localStorage.setItem(codeKey(), adminCode); } catch (e) {} }
        resize();
        if (msg.admin) toast('👑 Admin mode! You have $1T and admin commands.');
        else toast(msg.returning ? 'Welcome back! Your stand is open again.'
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
      case 'admin':
        toast('👑 ' + msg.text);
        break;
      case 'announce':
        showAnnouncement(msg.from, msg.text);
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
    for (const f of shopFlavors) {
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
    const light = evs.length === 1 && ['heavenly', 'frozen', 'diamond', 'godly', 'gold'].includes(ev.id);
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
    for (const m of MUTATIONS) {
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
    $('avatarModal').classList.add('hidden');
  }

  // ---------- Avatar Shop ----------
  const AVATAR_LABELS = {
    hat: { cap: 'Cap', none: 'No hat', tophat: 'Top hat', beanie: 'Beanie', party: 'Party hat',
      cowboy: 'Cowboy hat', wizard: 'Wizard hat', bunny: 'Bunny ears', cone: 'Ice cream hat' },
    face: { happy: 'Happy', cool: 'Sunglasses', wink: 'Wink', silly: 'Silly', wow: 'Wow' },
  };
  const AVATAR_PARTS = [['shirt', 'Shirt'], ['pants', 'Pants'], ['skin', 'Skin'], ['hat', 'Hat'], ['face', 'Face']];

  function openAvatar() {
    openWindow = 'avatar';
    $('shopModal').classList.add('hidden');
    $('invModal').classList.add('hidden');
    $('avatarModal').classList.remove('hidden');
    buildAvatarOptions();
  }

  function buildAvatarOptions() {
    const s = me();
    if (!s) return;
    const box = $('avatarOptions');
    box.innerHTML = '';
    for (const [part, label] of AVATAR_PARTS) {
      const row = document.createElement('div');
      row.className = 'avRow';
      row.innerHTML = `<div class="avLabel">${label}</div>`;
      const opts = document.createElement('div');
      opts.className = 'avOpts';
      for (const value of AVATAR[part]) {
        const b = document.createElement('button');
        b.type = 'button';
        const isColor = part === 'shirt' || part === 'pants' || part === 'skin';
        b.className = 'avOpt' + (isColor ? ' swatch' : '') + (s.avatar[part] === value ? ' on' : '');
        if (isColor) {
          b.style.background = value === 'stand' ? s.color : value;
          b.title = value === 'stand' ? 'Your stand color' : '';
        } else b.textContent = AVATAR_LABELS[part][value];
        b.addEventListener('click', () => {
          s.avatar[part] = value; // show it right away; the server saves it
          send({ type: 'setAvatar', avatar: { [part]: value } });
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
    drawPlayer({ x: 0, y: 0, facing: 1, moving: false, color: s.color, avatar: s.avatar, name: '', admin: s.admin }, time);
    ctx = saved;
  }
  $('shopClose').addEventListener('click', closeWindows);
  $('invClose').addEventListener('click', closeWindows);
  $('avatarClose').addEventListener('click', closeWindows);

  function updateShop() {
    const s = me();
    if (!s) return;
    $('shopTimer').textContent = `New stock in ${clock(shop.left)}`;
    for (const f of shopFlavors) {
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

  // ---------- admin commands (only work for admin names like "coolkid") ----------
  for (const f of FLAVORS) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = (f.adminOnly ? '👑 ' : '') + f.name;
    $('adminFlavor').appendChild(opt);
  }
  document.querySelectorAll('#adminPanel [data-money]').forEach(btn =>
    btn.addEventListener('click', () => send({ type: 'adminMoney', amount: Number(btn.dataset.money) })));
  $('adminGiveBtn').addEventListener('click', () =>
    send({ type: 'adminGive', flavor: $('adminFlavor').value, count: Number($('adminCount').value) }));
  $('adminEndBtn').addEventListener('click', () => send({ type: 'adminEndMutation' }));
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
        const f = findFlavor(args.join(' '));
        if (!f) return toast('Try: /give rainbow 5 (any flavor name)');
        return send({ type: 'adminGive', flavor: f.id, count });
      }
      case 'spawn': {
        // put an ice cream straight on your stand, fully grown: /spawn void 3
        let count = 1;
        if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) count = Number(args.pop());
        const f = findFlavor(args.join(' '));
        if (!f) return toast('Try: /spawn void 3 (any flavor name)');
        return send({ type: 'adminSpawn', flavor: f.id, count });
      }
      case 'mutation': case 'mutations': case 'mutate': {
        if (squash(args[0]) === 'end' || squash(args[0]) === 'stop') return send({ type: 'adminEndMutation' });
        if (!args.length) return send({ type: 'testMutation' });
        // several at once: /mutation rainbow godly blood moon
        const words = args.join(' ').split(/[\s,+]+/).filter(Boolean);
        const ids = [];
        for (let i = 0; i < words.length; i++) {
          let found = null;
          for (let j = Math.min(words.length, i + 3); j > i && !found; j--) {
            const m = findMutation(words.slice(i, j).join(' '));
            if (m) { found = m; i = j - 1; }
          }
          if (!found) return toast(`"${words[i]}" isn't a mutation. Try: /mutation rainbow godly blood moon`);
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
        return toast('Commands: /say hi · /money 5t · /give mint 10 · /spawn void 3 · /mutation rainbow godly · /mutation end · /restock · /grow');
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
    // the Avatar Shop
    if (inRect(wx, wy, { x: AVATAR_SHOP.x - 110, y: AVATAR_SHOP.y - 95, w: 220, h: 185 })) {
      return goDo({ x: AVATAR_SHOP.x, y: AVATAR_SHOP.y + 85 }, 60, openAvatar);
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
    if (openWindow === 'avatar' && dist(player, { x: AVATAR_SHOP.x, y: AVATAR_SHOP.y + 85 }) > REACH) closeWindows();
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
    for (const x of [60, 180, 300, 1220]) drawTree(x, 60);
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
    // scoop grows bigger until it's ready; special effects show once it's grown
    const sr = 3 + 6.5 * progress;
    const ready = tub.grow <= 0;
    if (ready && f.effect) drawFlavorFx(f, p.x, p.y - sr * 0.3, sr * 0.85, true, i);
    fillScoop(ready ? f : { color: f.color }, p.x, p.y + 1, sr, true);
    if (ready && f.effect) drawFlavorFx(f, p.x, p.y - sr * 0.3, sr * 0.85, false, i);
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
      if (m.id === 'heavenly') {
        // little angel wings
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(x + 12 + side * 8, y - 5, 6, 3, side * -0.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.fillStyle = m.id === 'rainbow' || m.id === 'heavenly' ? 'rgba(255,255,255,0.8)' : col;
      ctx.globalAlpha = 0.5 + (m.id === 'rainbow' ? 0.2 * Math.sin(time * 3 + c.id) : 0);
      ctx.beginPath(); ctx.arc(x + 12, y - 4, 11, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      drawCone(x + 12, y - 2, m.id === 'rainbow' ? { stripes: m.colors } : { color: col }, 7);
      if (m.id === 'godly' || m.id === 'heavenly') {
        // glowing halo above the scoop
        ctx.strokeStyle = m.id === 'godly' ? '#ffcc00' : '#fff6b0';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(x + 12, y - 13 + Math.sin(time * 3) * 0.8, 5, 1.8, 0, 0, Math.PI * 2); ctx.stroke();
      }
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
    const shirt = !av.shirt || av.shirt === 'stand' ? p.color : av.shirt;
    const skin = av.skin || '#f8d5b8';
    const bounce = p.moving ? Math.abs(Math.sin(time * 12)) * 3 : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 18, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(1.7 * (p.facing || 1), 1.7);
    const y = -bounce / 1.7;
    // legs
    ctx.fillStyle = av.pants || '#3b3b58';
    ctx.fillRect(-6, y + 6, 5, 6);
    ctx.fillRect(1, y + 6, 5, 6);
    // body
    ctx.fillStyle = shirt;
    roundRect(-9, y - 7, 18, 15, 5); ctx.fill();
    if (shirt === '#ffffff') { ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.8; ctx.stroke(); }
    // head
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, y - 14, 8, 0, Math.PI * 2); ctx.fill();
    drawFace(av.face || 'happy', y, time);
    // admins wear their crown unless they picked a special hat in the Avatar Shop
    const hat = av.hat || 'cap';
    const crown = p.admin && (hat === 'cap' || hat === 'none');
    drawHat(crown ? 'none' : hat, y, shirt);
    // the ice cream in your hand
    if (p.item) drawCone(11, y - 2, flavorById[p.item.flavor], 6);
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

  // the Avatar Shop building next to the Ice Cream Shop
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
      const tint = ({ bloodmoon: 0.22, shadow: 0.32, molten: 0.16, godly: 0.1, heavenly: 0, impossible: 0.1 }[m.id] ?? 0.13) *
        Math.max(share, 0.5);
      if (tint) {
        ctx.globalAlpha = tint;
        ctx.fillStyle = m.id === 'impossible' ? `hsl(${(time * 120) % 360}, 100%, 50%)` : m.colors[0];
        ctx.fillRect(0, 0, world.width, world.height);
        ctx.globalAlpha = 1;
      }
      for (let i = 0; i < 2; i++) {
        if (Math.random() >= dt * 20) continue;
        const p = { x: Math.random() * world.width, y: -10, vy: 40 + Math.random() * 60,
          vx: (Math.random() - 0.5) * 30, r: 2 + Math.random() * 3, color: pickColor(m), shape: 'dot' };
        if (m.id === 'godly' || m.id === 'molten') { p.y = world.height + 10; p.vy = -p.vy; } // rising sparks
        if (m.id === 'heavenly') { p.shape = 'feather'; p.r += 3; p.vy *= 0.6; }
        if (m.id === 'impossible') {
          // sparks fly out in every direction
          const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
          Object.assign(p, { y: Math.random() * world.height, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 1.5, color: `hsl(${Math.random() * 360}, 100%, 60%)` });
        }
        ambient.push(p);
      }
      if (m.id === 'impossible') drawGlitch(time);
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
      if (p.shape === 'feather') {
        // a white feather gently rocking as it falls
        ctx.save();
        ctx.translate(p.x + Math.sin(time * 2 + i) * 10, p.y);
        ctx.rotate(Math.sin(time * 2 + i) * 0.6);
        ctx.beginPath(); ctx.ellipse(0, 0, p.r * 0.45, p.r * 1.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(180,190,210,0.8)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(0, -p.r * 1.3); ctx.lineTo(0, p.r * 1.5); ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.7 + 0.3 * Math.sin(time * 8 + i)), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
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

  // Godly: golden light rays from the sky. Heavenly: soft light beams and clouds. (drawn behind the stands)
  function drawHolySky(time, id) {
    if (id === 'godly') {
      const cx = world.width / 2, cy = -150;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.05);
      for (let k = 0; k < 16; k++) {
        ctx.rotate(Math.PI / 8);
        ctx.fillStyle = k % 2 ? 'rgba(255, 215, 0, 0.13)' : 'rgba(255, 245, 190, 0.09)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-90, 1700); ctx.lineTo(90, 1700); ctx.fill();
      }
      ctx.restore();
      glow(cx, 0, 420, '255, 230, 120', 0.45);
    } else if (id === 'heavenly') {
      const haze = ctx.createLinearGradient(0, 0, 0, world.height);
      haze.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      haze.addColorStop(1, 'rgba(225, 240, 255, 0.15)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, world.width, world.height);
      for (let k = 0; k < 4; k++) {
        const bx = ((k * 340 + time * 15) % (world.width + 300)) - 150;
        const beam = ctx.createLinearGradient(bx, 0, bx + 120, 0);
        beam.addColorStop(0, 'rgba(255,255,240,0)');
        beam.addColorStop(0.5, 'rgba(255,255,240,0.3)');
        beam.addColorStop(1, 'rgba(255,255,240,0)');
        ctx.fillStyle = beam;
        ctx.fillRect(bx, 0, 120, world.height);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k < 5; k++) {
        const x = ((k * 300 + time * 12) % (world.width + 260)) - 130, y = 30 + (k % 3) * 25;
        for (const [dx, dy, r] of [[0, 0, 34], [30, 6, 26], [-30, 8, 24], [12, -14, 24]]) {
          ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
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
    nowSec = time;

    updatePlayer(dt);
    updateCamera();

    ctx.fillStyle = '#6fb34c';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.beginPath(); ctx.rect(0, 0, world.width, world.height); ctx.clip();

    drawPark(time);
    const ids = gameEvent.ids || [];
    if (ids.includes('rainbow')) drawRainbowSky(time); // behind everything, like a real rainbow
    for (const id of ['godly', 'heavenly']) if (ids.includes(id)) drawHolySky(time, id);
    drawShop(time);
    drawAvatarShop(time);
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
          color: s.color, name: s.name, item: heldItem(), isMe: true, admin: s.admin };
        entities.push({ y: p.y, draw: () => drawPlayer(p, time) });
        continue;
      }
      let o = others.get(s.id);
      if (!o) { o = { x: s.x, y: s.y, facing: 1 }; others.set(s.id, o); }
      const nx = o.x + (s.x - o.x) * k;
      o.moving = Math.abs(nx - o.x) + Math.abs(s.y - o.y) > 0.5;
      if (Math.abs(nx - o.x) > 0.3) o.facing = nx > o.x ? 1 : -1;
      o.x = nx; o.y += (s.y - o.y) * k;
      const p = { ...o, color: s.color, name: s.name, item: s.hand >= 0 ? s.hotbar[s.hand] : null, admin: s.admin };
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
  window.__icecream = { view, player }; // for automated tests
})();
