(() => {
  const { RARITIES, FLAVORS, UPGRADES, upgradeCost, spaceCost, MUTATIONS, MUTATION_CHANCE } = window.GameData;
  const mutationById = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));
  const flavorById = Object.fromEntries(FLAVORS.map(f => [f.id, f]));

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  let ws = null;
  let myId = null;
  let world = { width: 1280, height: 860 };
  let slots = [];
  let stands = [];
  const customers = new Map(); // id -> { ...server data, dx, dy (display position) }
  const floaters = [];
  const ambient = []; // falling sparkles during a mutation event
  const particles = [];
  let view = { scale: 1, ox: 0, oy: 0 };
  let spaceBtn = null; // Extra Space button area (world coords) while it's showing
  let gameEvent = { id: null, left: 0, next: 0 }; // current mutation event

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

  // mutations shimmer through their colors
  function mutColor(m, time) {
    return m.colors[Math.floor(time * 5) % m.colors.length];
  }
  const mutGradient = m => `linear-gradient(90deg, ${m.colors.join(', ')}${m.colors.length < 2 ? ', ' + m.colors[0] : ''})`;

  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  const me = () => stands.find(s => s.id === myId);

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
    const conn = { send: msg => onMessage(msg) };
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
    switch (msg.type) {
      case 'welcome':
        myId = msg.id;
        world = msg.world;
        slots = msg.slots;
        $('join').classList.add('hidden');
        $('game').classList.remove('hidden');
        buildPanel();
        $('testTools').classList.toggle('hidden', !msg.allowTest);
        resize();
        toast(msg.returning ? 'Welcome back! Your stand is open again.' : 'Your stand is open! Customers are on their way.');
        break;
      case 'error':
        if (myId) toast(msg.text); else $('joinError').textContent = msg.text;
        break;
      case 'state':
        stands = msg.stands;
        gameEvent = msg.event;
        syncCustomers(msg.customers);
        updatePanel();
        break;
      case 'sale':
        onSale(msg);
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
      case 'spaceAdded': {
        toast(`+3 flavor spaces! Your stand now holds ${msg.spaces} flavors.`);
        const s = me();
        if (s) confetti(slots[s.slot].x, slots[s.slot].y - 40, 40);
        break;
      }
      case 'unlocked': {
        const f = flavorById[msg.flavor];
        toast(`New flavor: ${f.name} (${RARITIES[f.rarity].name})!`);
        const s = me();
        if (s) confetti(slots[s.slot].x, slots[s.slot].y - 40, RARITIES[f.rarity].order >= 3 ? 80 : 30);
        break;
      }
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
            ${fmt(f.price)} / scoop</div>
        </div>
        <button></button>`;
      row.querySelector('button').addEventListener('click', () => send({ type: 'buyFlavor', id: f.id }));
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
  }

  function updatePanel() {
    const s = me();
    if (!s) return;
    $('money').textContent = fmt(s.money);
    $('stats').textContent = `${s.sold} scoops sold · ${fmt(s.totalEarned)} earned · ` +
      `${s.flavors.length}/${s.spaces} flavor spaces used`;
    const full = s.flavors.length >= s.spaces;
    $('serveBar').style.width = Math.min(100, s.serve * 100) + '%';

    for (const f of FLAVORS) {
      const owned = s.flavors.includes(f.id);
      const hidden = f.rarity === 'secret' && !owned;
      const row = f.row;
      row.classList.toggle('owned', owned);
      row.querySelector('.name').textContent = hidden ? '???' : f.name;
      row.querySelector('.scoop').style.background = hidden ? '#222' : f.color;
      const btn = row.querySelector('button');
      if (owned) {
        btn.textContent = 'On menu ✓';
        btn.disabled = true;
      } else if (full) {
        btn.textContent = 'Stand full';
        btn.disabled = true;
      } else {
        btn.textContent = 'Unlock ' + fmt(f.cost);
        btn.disabled = s.money < f.cost;
      }
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
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && myId && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      if (!e.repeat) scoop();
    }
  });
  canvas.addEventListener('pointerdown', e => {
    const s = me();
    if (!s) return;
    const rect = canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left - view.ox) / view.scale;
    const wy = (e.clientY - rect.top - view.oy) / view.scale;
    if (spaceBtn && wx > spaceBtn.x && wx < spaceBtn.x + spaceBtn.w && wy > spaceBtn.y && wy < spaceBtn.y + spaceBtn.h) {
      send({ type: 'buySpace' });
      return;
    }
    const slot = slots[s.slot];
    if (Math.abs(wx - slot.x) < 100 && wy > slot.y - 90 && wy < slot.y + 160) scoop();
  });

  // ---------- rendering ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min(rect.width / world.width, rect.height / world.height);
    view = { scale, ox: (rect.width - world.width * scale) / 2, oy: (rect.height - world.height * scale) / 2 };
  }
  window.addEventListener('resize', resize);

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawPark(time) {
    ctx.fillStyle = '#8fd16a';
    ctx.fillRect(0, 0, world.width, world.height);
    // grass tufts
    ctx.fillStyle = '#7cc257';
    for (let i = 0; i < 120; i++) {
      const x = (i * 397) % world.width, y = (i * 263) % world.height;
      ctx.beginPath(); ctx.ellipse(x, y, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    // paths between rows of stands
    ctx.fillStyle = '#ecd9b0';
    for (let i = 0; i < slots.length; i += 4) {
      ctx.fillRect(0, slots[i].y + 75, world.width, 150);
    }
    // trees in the gaps between stands
    for (let i = 0; i < slots.length; i += 4) {
      for (const x of [22, 326, 639, 952, 1258]) drawTree(x, slots[i].y - 20);
    }
  }

  function drawTree(x, y) {
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(x - 4, y, 8, 18);
    ctx.fillStyle = '#4c9a3a';
    ctx.beginPath(); ctx.arc(x, y - 4, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5db347';
    ctx.beginPath(); ctx.arc(x - 6, y - 10, 10, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillText('Empty spot', slot.x, slot.y + 6);
    ctx.restore();
  }

  function drawStand(s, time) {
    const { x, y } = slots[s.slot];
    const mine = s.id === myId;

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
    ctx.fillRect(x - 85, y + 22, 170, 16);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2;
    roundRect(x - 85, y, 170, 60, 6); ctx.stroke();

    // flavor tubs on the counter
    // one tub per flavor space; empty spaces are dashed outlines
    const n = s.spaces;
    const spacing = Math.min(28, 156 / n);
    const r = Math.min(11, spacing / 2 - 1);
    for (let i = s.flavors.length; i < n; i++) {
      const tx = x - ((n - 1) * spacing) / 2 + i * spacing;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(tx, y + 2, r, Math.PI, 0); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
    }
    s.flavors.forEach((id, i) => {
      const f = flavorById[id];
      const tx = x - ((n - 1) * spacing) / 2 + i * spacing;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(tx, y + 2, r, Math.PI, 0); ctx.fill();
      if (f.rarity === 'secret' || f.rarity === 'mythic') {
        ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(time * 5 + i)})`;
        ctx.beginPath(); ctx.arc(tx + 2, y - 3, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    });

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

    const cost = mine && s.flavors.length >= s.spaces ? spaceCost(s.spaces) : null;
    if (mine) spaceBtn = null;
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
    } else if (mine) {
      const bob = Math.sin(time * 4) * 5;
      ctx.fillStyle = '#ff2e7e';
      ctx.beginPath();
      ctx.moveTo(x, ay - 38 + bob);
      ctx.lineTo(x - 12, ay - 56 + bob);
      ctx.lineTo(x + 12, ay - 56 + bob);
      ctx.fill();
      ctx.font = 'bold 14px Trebuchet MS';
      ctx.fillText('YOU', x, ay - 60 + bob);
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

    if (m) {
      const text = `${m.emoji} ${m.name.toUpperCase()} MUTATION · x${m.mult} · ${clock(gameEvent.left)}`;
      ctx.font = 'bold 22px Trebuchet MS';
      ctx.textAlign = 'center';
      const w = ctx.measureText(text).width + 40;
      ctx.fillStyle = 'rgba(30, 15, 25, 0.75)';
      roundRect(world.width / 2 - w / 2, world.height - 52, w, 40, 14); ctx.fill();
      ctx.strokeStyle = mutColor(m, time); ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(text, world.width / 2, world.height - 24);
    }
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
    drawRainbowArc(world.width / 2, world.height + 120, 900, 120, (0.34 + shimmer) * fade);
    drawRainbowArc(world.width / 2, world.height + 120, 1060, 90, (0.12 + shimmer / 2) * fade); // faint double rainbow
  }

  function drawSunShower(dt) {
    // light sun-shower rain: thin slanted streaks
    if (Math.random() < dt * 40) {
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
    const rect = canvas.getBoundingClientRect();

    ctx.fillStyle = '#6fb34c';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.beginPath(); ctx.rect(0, 0, world.width, world.height); ctx.clip();

    drawPark(time);
    if (gameEvent.id === 'rainbow') drawRainbowSky(time); // behind the stands, like a real rainbow
    const used = new Set(stands.map(s => s.slot));
    slots.forEach((slot, i) => { if (!used.has(i)) drawEmptySlot(slot); });
    for (const s of stands) drawStand(s, time);

    // smooth customers toward their latest server position, draw back-to-front
    const k = Math.min(1, dt * 10);
    const list = [...customers.values()];
    for (const c of list) { c.dx += (c.x - c.dx) * k; c.dy += (c.y - c.dy) * k; }
    list.sort((a, b) => a.dy - b.dy);
    for (const c of list) drawCustomer(c, time);

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
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
