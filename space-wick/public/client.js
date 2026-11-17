// Space Wick client: draws the game, reads your controls and talks to the engine
// (over the network when online, or directly when playing solo).
(function () {
  'use strict';
  const E = window.SpaceEngine;
  const { PLANES, UPGRADES, ZONES, SHIP_R, DUMMY_R, MAX_HP } = E;
  const $ = id => document.getElementById(id);
  const fmt = n => '$' + Math.floor(n).toLocaleString('en-US');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // ---------- state ----------
  const S = {
    id: null, save: null, zone: 'lobby', tpn: 0, dead: false, hp: MAX_HP, prot: false,
    me: { x: 900, y: 760, vx: 0, vy: 0, a: -Math.PI / 2 },
    ships: new Map(), bullets: [], bulletT: 0, dummyHp: [], parts: [],
    lastAimT: 0, aim: 0, localFire: 0, shopOpen: null, near: null,
  };

  window.__spaceWick = S; // handy for testing in the browser console

  // ---------- connection ----------
  let send = () => {};
  const SOLO = window.SOLO || location.protocol === 'file:' || /claudeusercontent|claude\.ai/.test(location.hostname);

  function startSolo() {
    const LOCAL = 'me';
    const engine = E.createEngine({
      send: (id, msg) => { if (id === LOCAL) onMsg(JSON.parse(JSON.stringify(msg))); },
      load: key => { try { return JSON.parse(store.get('spacewick:' + key)); } catch (e) { return null; } },
      save: (key, s) => store.set('spacewick:' + key, JSON.stringify(s)),
    });
    setInterval(engine.tick, E.TICK_MS);
    send = msg => engine.handle(LOCAL, msg);
    $('mode').textContent = 'Solo mode: you, AI pilots and dummies. Progress is saved on this device.';
  }

  let ws = null, wsReady = false;
  function startOnline(onFail) {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    try { ws = new WebSocket(url); } catch (e) { return onFail(); }
    let opened = false;
    ws.onopen = () => { opened = true; wsReady = true; $('mode').textContent = 'Online: everyone on this server flies together.'; };
    ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => { wsReady = false; if (!opened) onFail(); else if (S.id) $('lost').hidden = false; };
    send = msg => { if (wsReady) ws.send(JSON.stringify(msg)); };
  }

  if (SOLO) startSolo();
  else startOnline(() => { startSolo(); });

  // ---------- messages from the engine ----------
  function onMsg(m) {
    switch (m.t) {
      case 'welcome':
        S.id = m.id; S.save = m.save;
        store.set('spacewick:last', m.save.name);
        $('start').hidden = true; $('hud').hidden = false;
        updateHud();
        break;
      case 'err':
        $('startErr').textContent = m.text;
        break;
      case 'tp':
        S.zone = m.zone; S.tpn = m.tpn; S.dead = false;
        Object.assign(S.me, { x: m.x, y: m.y, vx: 0, vy: 0, a: -Math.PI / 2 });
        S.ships.clear(); S.bullets = []; S.parts = [];
        $('dead').hidden = true;
        if (m.zone !== 'lobby') closeShop();
        banner(m.zone === 'wick' ? 'THE WICK' : 'LOBBY', m.zone === 'wick' ? '#ff6b6b' : '#6ff3ff');
        sfx('warp');
        updateHud();
        break;
      case 's': onSnap(m); break;
      case 'money':
        S.save.money = m.money;
        toast(`+${fmt(m.amt)}  ${m.why}`, 'money');
        sfx('coin');
        updateHud();
        break;
      case 'save':
        S.save = m.save; updateHud(); renderShop();
        break;
      case 'msg':
        toast(m.text);
        break;
      case 'dead':
        S.dead = true; S.hp = 0;
        $('deadBy').textContent = 'Shot down by ' + m.by;
        $('dead').hidden = false;
        closeShop();
        let left = 3;
        $('deadT').textContent = left;
        const iv = setInterval(() => { left--; $('deadT').textContent = Math.max(0, left); if (left <= 0 || !S.dead) clearInterval(iv); }, 1000);
        updateHud();
        break;
      case 'feed': {
        const d = document.createElement('div');
        const mine = S.save && (m.k === S.save.name || m.v === S.save.name);
        if (mine) d.className = 'me';
        d.textContent = `${m.k}  💥  ${m.v}`;
        $('feed').prepend(d);
        while ($('feed').children.length > 5) $('feed').lastChild.remove();
        setTimeout(() => d.remove(), 6000);
        break;
      }
    }
  }

  function onSnap(m) {
    const now = performance.now();
    const seen = new Set();
    for (const [id, x, y, a, hp, plane, flags, name] of m.sh) {
      if (id === S.id) { S.hp = hp; S.prot = !!(flags & 2); continue; }
      seen.add(id);
      let s = S.ships.get(id);
      if (!s) { s = { x, y, a, vx: 0, vy: 0 }; S.ships.set(id, s); }
      if (s.tx !== undefined && s.tt) {
        const dt = (now - s.tt) / 1000;
        if (dt > 0.01) { s.vx = (x - s.tx) / dt; s.vy = (y - s.ty) / dt; }
      }
      Object.assign(s, { tx: x, ty: y, ta: a, hp, plane, bot: !!(flags & 1), prot: !!(flags & 2), name, tt: now });
    }
    for (const id of S.ships.keys()) if (!seen.has(id)) S.ships.delete(id);
    S.bullets = m.b; S.bulletT = now;
    S.dummyHp = m.d;
    for (const [k, x, y, c] of m.fx) {
      if (k === 'boom') { boom(x, y, c); if (Math.hypot(x - S.me.x, y - S.me.y) < 900) sfx('boom'); }
      else if (k === 'hit') spark(x, y, c);
      else if (k === 'warp') warpFx(x, y);
    }
    updateHpBar();
  }

  // ---------- start screen ----------
  $('name').value = store.get('spacewick:last') || '';
  function join() {
    const name = $('name').value.trim();
    if (!name) { $('startErr').textContent = 'Type a pilot name first!'; return; }
    $('startErr').textContent = '';
    audioOn();
    const go = () => send({ t: 'join', name });
    if (!SOLO && ws && !wsReady) { // still connecting
      $('startErr').textContent = 'Connecting…';
      const t0 = Date.now();
      const iv = setInterval(() => { if (wsReady || Date.now() - t0 > 5000) { clearInterval(iv); $('startErr').textContent = ''; go(); } }, 100);
    } else go();
  }
  $('play').onclick = join;
  $('name').onkeydown = e => { if (e.key === 'Enter') join(); };

  // ---------- HUD ----------
  function updateHud() {
    if (!S.save) return;
    $('money').textContent = fmt(S.save.money);
    $('shopMoney').textContent = fmt(S.save.money);
    $('kills').textContent = `🎯 ${S.save.kills} kill${S.save.kills === 1 ? '' : 's'}`;
    const z = $('zone');
    z.textContent = S.zone === 'wick' ? '⚔️ THE WICK' : '🛡️ LOBBY (SAFE)';
    z.className = S.zone === 'wick' ? 'wick' : '';
    updateHpBar();
  }
  function updateHpBar() {
    const hp = Math.max(0, S.hp);
    $('hpfill').style.width = (hp / MAX_HP * 100) + '%';
    $('hpfill').style.background = hp > 120 ? 'linear-gradient(90deg,#22c55e,#86efac)' : hp > 60 ? 'linear-gradient(90deg,#eab308,#fde047)' : 'linear-gradient(90deg,#dc2626,#f87171)';
    $('hptext').textContent = `${Math.ceil(hp)} / ${MAX_HP}`;
  }
  function toast(text, cls) {
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.textContent = text;
    $('toasts').appendChild(d);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => d.remove(), 1600);
  }
  function banner(text, color) {
    const b = $('banner');
    b.textContent = text; b.style.color = color;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  // ---------- shops ----------
  $('look').onclick = () => { if (S.near) openShop(S.near.id); };
  $('shopClose').onclick = closeShop;
  $('shop').addEventListener('pointerdown', e => { if (e.target === $('shop')) closeShop(); });
  function openShop(id) { S.shopOpen = id; $('shop').hidden = false; keys.clear(); renderShop(); }
  function closeShop() { S.shopOpen = null; $('shop').hidden = true; }

  const maxStat = { speed: 420, dmg: 30 * 3, rate: 1000 / 170 };
  function renderShop() {
    if (!S.shopOpen || !S.save) return;
    const body = $('shopBody');
    body.innerHTML = '';
    $('shopMoney').textContent = fmt(S.save.money);
    if (S.shopOpen === 'planes') {
      $('shopTitle').textContent = '✈️ PLANE SHOP';
      PLANES.forEach((p, i) => {
        const owned = S.save.planes.includes(p.id), on = S.save.plane === p.id;
        const card = document.createElement('div');
        card.className = 'card' + (on ? ' on' : '');
        const bar = (label, v) => `<div class="stat">${label}<i><b style="width:${Math.min(100, v * 100)}%"></b></i></div>`;
        card.innerHTML = `<canvas width="360" height="180"></canvas><h3>${p.name}</h3><p class="desc">${p.desc}</p>
          ${bar('Speed', p.speed / maxStat.speed)}${bar('Damage', p.dmg * p.guns / maxStat.dmg)}${bar('Fire rate', 1000 / p.delay / maxStat.rate)}
          <div class="stat">Guns<span>${'🔫'.repeat(p.guns)}</span></div>`;
        const btn = document.createElement('button');
        if (on) { btn.textContent = '✓ FLYING'; btn.disabled = true; }
        else if (owned) { btn.textContent = 'EQUIP'; btn.className = 'eq'; btn.onclick = () => send({ t: 'equip', plane: p.id }); }
        else {
          btn.textContent = 'BUY ' + fmt(p.price);
          if (S.save.money < p.price) btn.className = 'cant';
          btn.onclick = () => send({ t: 'buy', plane: p.id });
        }
        card.appendChild(btn);
        body.appendChild(card);
        const c = card.querySelector('canvas'), g = c.getContext('2d');
        g.translate(180, 90); g.scale(2.4, 2.4);
        drawPlane(g, i, 0, 0, -Math.PI / 2 + 0.0001 + Math.PI / 2 * 0, 1, 0.6, 1);
      });
    } else {
      $('shopTitle').textContent = '🔧 UPGRADE SHOP';
      for (const u of UPGRADES) {
        const lvl = S.save.up[u.key] || 0, max = lvl >= u.max, cost = E.upCost(u.key, lvl);
        const row = document.createElement('div');
        row.className = 'card upg';
        row.innerHTML = `<div class="ico">${u.icon}</div><div><h3>${u.name} <span class="small">Lv ${lvl}/${u.max}</span></h3>
          <p class="desc" style="min-height:0">${u.desc} per level</p>
          <div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'f' : ''}"></i>`).join('')}</div></div>`;
        const btn = document.createElement('button');
        if (max) { btn.textContent = 'MAX'; btn.disabled = true; }
        else {
          btn.textContent = 'UPGRADE ' + fmt(cost);
          if (S.save.money < cost) btn.className = 'cant';
          btn.onclick = () => send({ t: 'up', key: u.key });
        }
        row.appendChild(btn);
        body.appendChild(row);
      }
      const st = E.stats(S.save);
      const note = document.createElement('p');
      note.className = 'note';
      note.textContent = `Your ${PLANES[E.PLANE_INDEX[S.save.plane]].name} now: ${Math.round(st.dmg)} damage per bullet × ${st.guns} gun${st.guns > 1 ? 's' : ''}, ${(1000 / st.delay).toFixed(1)} shots/sec, speed ${Math.round(st.speed)}. Upgrades work on every plane you own.`;
      body.appendChild(note);
    }
  }

  // ---------- controls ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, scale = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    scale = Math.max(0.55, Math.min(1.1, Math.sqrt(W * H) / 820));
  }
  window.addEventListener('resize', resize);
  resize();

  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (document.activeElement === $('name')) return;
    keys.add(e.key.toLowerCase());
    if (e.key === 'Escape') closeShop();
    if ((e.key === 'e' || e.key === 'Enter') && S.near && !S.shopOpen) openShop(S.near.id);
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; fingers.clear(); joy = null; });

  let joy = null;                 // the left-thumb joystick
  const fingers = new Map();      // fingers that are shooting
  const mouse = { down: false, x: 0, y: 0 };
  let tapQueued = false;
  const inJoyZone = (x, y) => x < W * 0.45 && y > H * 0.4;

  cv.addEventListener('touchstart', e => {
    e.preventDefault();
    audioOn();
    for (const t of e.changedTouches) {
      if (!joy && inJoyZone(t.clientX, t.clientY)) joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
      else { fingers.set(t.identifier, { x: t.clientX, y: t.clientY }); tapQueued = true; aimAt(t.clientX, t.clientY); }
    }
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (joy && t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; }
      else if (fingers.has(t.identifier)) fingers.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }, { passive: false });
  const endTouch = e => {
    for (const t of e.changedTouches) {
      if (joy && t.identifier === joy.id) joy = null;
      fingers.delete(t.identifier);
    }
  };
  cv.addEventListener('touchend', endTouch);
  cv.addEventListener('touchcancel', endTouch);
  cv.addEventListener('mousedown', e => { audioOn(); mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; tapQueued = true; aimAt(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  function aimAt(sx, sy) {
    const wx = S.me.x + (sx - W / 2) / scale, wy = S.me.y + (sy - H / 2) / scale;
    S.aim = Math.atan2(wy - S.me.y, wx - S.me.x);
    S.lastAimT = performance.now();
  }
  function aimPoint() {
    if (fingers.size) { const f = [...fingers.values()].pop(); return f; }
    if (mouse.down) return mouse;
    return null;
  }
  function moveInput() {
    let mx = 0, my = 0;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (keys.has('w') || keys.has('arrowup')) my -= 1;
    if (keys.has('s') || keys.has('arrowdown')) my += 1;
    if (joy) {
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), R = 55;
      if (d > 6) { const k = Math.min(1, d / R) / d; mx = dx * k; my = dy * k; }
    }
    return [mx, my];
  }

  // ---------- sound ----------
  let ac = null, soundOn = store.get('spacewick:sound') !== 'off';
  $('sound').textContent = soundOn ? '🔊' : '🔇';
  $('sound').onclick = () => { soundOn = !soundOn; $('sound').textContent = soundOn ? '🔊' : '🔇'; store.set('spacewick:sound', soundOn ? 'on' : 'off'); };
  function audioOn() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} }
  function sfx(kind) {
    if (!ac || !soundOn) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    if (kind === 'pew') { o.type = 'square'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.09); g.gain.setValueAtTime(0.04, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.start(t); o.stop(t + 0.1); }
    else if (kind === 'boom') { o.type = 'sawtooth'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.45); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.start(t); o.stop(t + 0.5); }
    else if (kind === 'coin') { o.type = 'triangle'; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + 0.07); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.start(t); o.stop(t + 0.25); }
    else if (kind === 'warp') { o.type = 'sine'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(1200, t + 0.4); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45); o.start(t); o.stop(t + 0.45); }
  }

  // ---------- effects ----------
  function colorOf(i) { return i >= 0 && PLANES[i] ? PLANES[i].color : '#ff9a3c'; }
  function boom(x, y, c) {
    const col = colorOf(c);
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 320;
      S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.6, max: 1.1, r: 2 + Math.random() * 4, c: i % 3 ? '#ffb347' : col });
    }
    S.parts.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, r: 70, c: '#fff', ring: true });
  }
  function spark(x, y, c) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 160;
      S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.25, max: 0.25, r: 2, c: colorOf(c) });
    }
  }
  function warpFx(x, y) { S.parts.push({ x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, r: 60, c: '#6ff3ff', ring: true }); }

  // ---------- drawing ----------
  // half outlines of each plane (nose at +x); they're mirrored to make the full ship
  const SHAPES = [
    [[1.3, 0], [-0.8, 0.95], [-0.45, 0]],
    [[1.55, 0], [0.2, 0.22], [-0.5, 1.05], [-0.85, 1.0], [-0.6, 0.25], [-1.0, 0.22], [-1.0, 0]],
    [[1.5, 0], [0.6, 0.2], [0.1, 1.15], [-0.25, 1.15], [-0.3, 0.35], [-0.95, 0.5], [-0.95, 0]],
    [[1.4, 0], [0.5, 0.25], [-0.2, 1.4], [-0.6, 1.4], [-0.5, 0.3], [-1.0, 0.6], [-1.05, 0]],
    [[1.6, 0], [-0.9, 1.2], [-0.6, 0.4], [-1.0, 0.3], [-0.8, 0]],
    [[1.3, 0], [0.9, 0.35], [0.4, 0.45], [0.2, 1.3], [-0.5, 1.5], [-0.7, 1.3], [-0.55, 0.5], [-1.1, 0.55], [-1.1, 0]],
    [[1.7, 0], [0.7, 0.18], [0.3, 0.7], [0.5, 1.25], [-0.1, 1.1], [-0.5, 1.45], [-0.7, 0.4], [-1.05, 0.3], [-0.9, 0]],
  ];
  function drawPlane(g, idx, x, y, a, alpha, thrust, sizeMul) {
    const p = PLANES[idx] || PLANES[0], half = SHAPES[idx] || SHAPES[0], R = SHIP_R * (sizeMul || 1);
    g.save();
    g.translate(x, y); g.rotate(a); g.globalAlpha = alpha;
    if (thrust > 0.05) {
      const fl = R * (0.5 + thrust * 0.9) * (0.85 + Math.random() * 0.3);
      const grd = g.createLinearGradient(-R, 0, -R - fl, 0);
      grd.addColorStop(0, '#fff'); grd.addColorStop(0.3, p.color); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(-R * 0.85, -R * 0.22); g.lineTo(-R - fl, 0); g.lineTo(-R * 0.85, R * 0.22); g.fill();
    }
    g.beginPath();
    half.forEach(([px, py], i) => (i ? g.lineTo(px * R, py * R) : g.moveTo(px * R, py * R)));
    for (let i = half.length - 1; i >= 0; i--) g.lineTo(half[i][0] * R, -half[i][1] * R);
    g.closePath();
    g.shadowColor = p.color; g.shadowBlur = 12;
    g.fillStyle = p.trim; g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 2.5; g.strokeStyle = p.color; g.stroke();
    // stripe and cockpit
    g.fillStyle = p.color; g.globalAlpha = alpha * 0.55;
    g.fillRect(-R * 0.7, -R * 0.07, R * 1.2, R * 0.14);
    g.globalAlpha = alpha;
    g.fillStyle = '#e8fbff';
    g.beginPath(); g.ellipse(R * 0.45, 0, R * 0.28, R * 0.15, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // stars (three layers that move at different speeds)
  const starLayers = [0.15, 0.35, 0.6].map((f, li) => {
    const r = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7 + li * 1000);
    return { f, stars: Array.from({ length: 70 + li * 20 }, () => ({ x: r() * 1024, y: r() * 1024, s: 0.6 + r() * (1 + li), b: 0.3 + r() * 0.7 })) };
  });
  function drawStars(camX, camY, t) {
    for (const L of starLayers) {
      const ox = ((-camX * L.f) % 1024 + 1024) % 1024, oy = ((-camY * L.f) % 1024 + 1024) % 1024;
      for (let tx = ox - 1024; tx < W; tx += 1024) for (let ty = oy - 1024; ty < H; ty += 1024) {
        for (const s of L.stars) {
          const x = tx + s.x, y = ty + s.y;
          if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
          ctx.globalAlpha = s.b * (0.75 + 0.25 * Math.sin(t / 600 + s.x));
          ctx.fillStyle = '#fff';
          ctx.fillRect(x, y, s.s, s.s);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function label(text, x, y, size, color, glow) {
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
    ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawZone(t) {
    const z = ZONES[S.zone];
    if (S.zone === 'lobby') {
      // a space station deck
      roundRect(0, 0, z.w, z.h, 60);
      ctx.fillStyle = 'rgba(20,32,80,0.55)'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(111,243,255,0.07)'; ctx.lineWidth = 2;
      for (let x = 0; x <= z.w; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, z.h); ctx.stroke(); }
      for (let y = 0; y <= z.h; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(z.w, y); ctx.stroke(); }
      ctx.restore();
      roundRect(0, 0, z.w, z.h, 60);
      ctx.strokeStyle = '#6ff3ff'; ctx.lineWidth = 6; ctx.shadowColor = '#6ff3ff'; ctx.shadowBlur = 20; ctx.stroke(); ctx.shadowBlur = 0;
      label('🛡️ SAFE ZONE — practice on the dummies!', z.w / 2, z.h - 50, 28, 'rgba(200,230,255,0.6)');
    } else {
      ctx.strokeStyle = 'rgba(255,90,90,0.06)'; ctx.lineWidth = 2;
      for (let x = 0; x <= z.w; x += 200) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, z.h); ctx.stroke(); }
      for (let y = 0; y <= z.h; y += 200) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(z.w, y); ctx.stroke(); }
      ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 8; ctx.shadowColor = '#ff4d4d'; ctx.shadowBlur = 24;
      ctx.strokeRect(0, 0, z.w, z.h); ctx.shadowBlur = 0;
    }
    drawPortal(z.portal, t);
    for (const s of z.shops) drawShop(s, t);
    z.dummies.forEach(([x, y], i) => drawDummy(x, y, S.dummyHp[i] === undefined ? MAX_HP : S.dummyHp[i], z.reward, t));
  }

  function drawPortal(p, t) {
    const wick = p.to === 'wick', c1 = wick ? '#b14bff' : '#00c2ff', c2 = wick ? '#ff4fd8' : '#6ff3ff';
    const grd = ctx.createRadialGradient(p.x, p.y, 5, p.x, p.y, p.r * 1.4);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.35, c1); grd.addColorStop(0.75, 'rgba(60,0,120,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.4, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t / (700 + i * 300) * (i % 2 ? -1 : 1));
      ctx.strokeStyle = i % 2 ? c2 : c1; ctx.lineWidth = 6 - i; ctx.shadowColor = c2; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(0, 0, p.r * (0.6 + i * 0.22), 0, Math.PI * 1.4); ctx.stroke();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    label(p.label, p.x, p.y - p.r - 38, wick ? 42 : 30, wick ? '#ff9cf0' : '#9ff6ff', true);
    if (!wick) label('fly in to leave', p.x, p.y + p.r + 30, 18, 'rgba(200,230,255,0.7)');
    else label('fly in to fight!', p.x, p.y + p.r + 30, 20, 'rgba(255,200,240,0.8)');
  }

  function drawShop(s, t) {
    const planes = s.id === 'planes', col = planes ? '#ffb347' : '#57f287', near = S.near === s;
    // building
    ctx.save();
    if (near) { ctx.shadowColor = col; ctx.shadowBlur = 30 + 10 * Math.sin(t / 200); }
    roundRect(s.x, s.y, s.w, s.h, 22);
    ctx.fillStyle = '#141c3f'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.stroke();
    ctx.restore();
    // sign
    roundRect(s.x + 20, s.y - 34, s.w - 40, 62, 14);
    ctx.fillStyle = col; ctx.fill();
    label(s.label, s.x + s.w / 2, s.y - 3, 34, '#fff');
    // window with a picture
    roundRect(s.x + 40, s.y + 50, s.w - 80, s.h - 110, 14);
    ctx.fillStyle = '#0a1030'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 3; ctx.stroke();
    const cx = s.x + s.w / 2, cy = s.y + 50 + (s.h - 110) / 2;
    if (planes) {
      const i = Math.floor(t / 1500) % PLANES.length;
      drawPlane(ctx, i, cx, cy, -Math.PI / 2 + Math.sin(t / 500) * 0.2, 1, 0.6, 1.25);
    } else {
      ctx.font = '60px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(['💥', '🔫', '🚀'][Math.floor(t / 1200) % 3], cx, cy);
    }
    label(near ? 'tap LOOK below!' : 'fly here', cx, s.y + s.h - 30, 22, near ? '#fff' : 'rgba(255,255,255,0.6)');
  }

  function drawDummy(x, y, hp, reward, t) {
    if (hp <= 0) {
      ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, DUMMY_R, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      return;
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(t / 1500);
    // little target drone
    ctx.fillStyle = '#444b6e';
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillRect(DUMMY_R - 4, -5, 14, 10); }
    ctx.restore();
    const rings = ['#ff4d4d', '#fff', '#ff4d4d', '#fff'];
    rings.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, DUMMY_R * (1 - i * 0.24), 0, Math.PI * 2); ctx.fill(); });
    healthBar(x, y - DUMMY_R - 16, hp);
    label(reward ? `DUMMY  +$${reward}` : 'DUMMY', x, y + DUMMY_R + 20, 16, reward ? '#ffd84d' : 'rgba(255,255,255,0.7)');
  }

  function healthBar(x, y, hp) {
    const w = 56, f = Math.max(0, hp) / MAX_HP;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 9);
    ctx.fillStyle = f > 0.6 ? '#22c55e' : f > 0.3 ? '#eab308' : '#ef4444';
    ctx.fillRect(x - w / 2, y, w * f, 5);
  }

  function drawShipFull(s, isMe, t) {
    const speed = Math.hypot(s.vx || 0, s.vy || 0);
    drawPlane(ctx, s.plane, s.x, s.y, s.a, 1, Math.min(1, speed / 300), 1);
    if (s.prot) {
      ctx.strokeStyle = `rgba(111,243,255,${0.5 + 0.3 * Math.sin(t / 120)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, SHIP_R * 1.7, 0, Math.PI * 2); ctx.stroke();
    }
    if (S.zone !== 'lobby' || !isMe) healthBar(s.x, s.y - SHIP_R - 22, s.hp);
    label((s.bot ? '🤖 ' : '') + s.name, s.x, s.y - SHIP_R - 36, 15, isMe ? '#ffd84d' : s.bot ? '#c9d2ff' : '#ffffff');
  }

  function drawMinimap() {
    if (S.zone !== 'wick') return;
    const z = ZONES.wick, size = Math.min(150, W * 0.3), k = size / z.w;
    const x0 = W - size - 12, y0 = H - size - (W <= 520 ? 54 : 12);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, size, size);
    ctx.fillStyle = '#b14bff'; ctx.beginPath(); ctx.arc(x0 + z.portal.x * k, y0 + z.portal.y * k, 4, 0, Math.PI * 2); ctx.fill();
    z.dummies.forEach(([x, y], i) => { if ((S.dummyHp[i] || 0) > 0) { ctx.fillStyle = '#ffd84d'; ctx.fillRect(x0 + x * k - 1.5, y0 + y * k - 1.5, 3, 3); } });
    for (const s of S.ships.values()) { ctx.fillStyle = '#ff5c5c'; ctx.beginPath(); ctx.arc(x0 + s.x * k, y0 + s.y * k, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x0 + S.me.x * k, y0 + S.me.y * k, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawJoystick() {
    if (!('ontouchstart' in window)) return;
    const R = 55;
    if (joy) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#6ff3ff';
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, R, 0, Math.PI * 2); ctx.fill();
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
      ctx.globalAlpha = 0.8; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 24, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (S.id && !S.dead) {
      const x = Math.min(W * 0.2, 110), y = H - 110;
      ctx.globalAlpha = 0.18; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.font = '700 13px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('drag to fly', x, y + 4);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- main loop ----------
  let lastT = performance.now(), lastSend = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    const me = S.me;

    if (S.id && !S.dead) {
      const [mx, my] = S.shopOpen ? [0, 0] : moveInput();
      E.stepShip(me, mx, my, E.stats(S.save).speed, dt, S.zone);
      const ap = aimPoint();
      if (ap) aimAt(ap.x, ap.y);
      const firing = !!ap && !S.shopOpen;
      if (t - S.lastAimT < 350) me.a = S.aim;
      // local "pew" in time with your guns
      if ((firing || tapQueued) && t - S.localFire >= E.stats(S.save).delay) { S.localFire = t; sfx('pew'); }
      if (t - lastSend > 45 || tapQueued) {
        send({ t: 'in', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, a: Math.round(me.a * 100) / 100,
          aim: Math.round(S.aim * 1000) / 1000, fire: firing, tap: tapQueued, tpn: S.tpn });
        tapQueued = false; lastSend = t;
      }
      // shop check
      const near = S.zone === 'lobby' ? E.nearShop('lobby', me.x, me.y) : null;
      if (near !== S.near) {
        S.near = near;
        $('look').hidden = !near;
        if (near) $('look').innerHTML = `👀 LOOK<small>${near.id === 'planes' ? 'Plane Shop' : 'Upgrade Shop'}</small>`;
      }
    } else if (S.near) { S.near = null; $('look').hidden = true; }

    // other ships glide smoothly toward where the engine says they are
    const k = Math.min(1, dt * 14);
    for (const s of S.ships.values()) {
      s.x += (s.tx - s.x) * k; s.y += (s.ty - s.y) * k;
      let da = s.ta - s.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      s.a += da * k;
    }

    // ---- draw ----
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = S.zone === 'wick' ? '#07040e' : '#05060f';
    ctx.fillRect(0, 0, W, H);
    drawStars(me.x, me.y, t);
    ctx.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * (W / 2 - me.x * scale), DPR * (H / 2 - me.y * scale));
    drawZone(t);

    const age = (t - S.bulletT) / 1000;
    for (const [x, y, vx, vy, c] of S.bullets) {
      const bx = x + vx * age, by = y + vy * age, sp = Math.hypot(vx, vy) || 1;
      ctx.strokeStyle = colorOf(c); ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.shadowColor = colorOf(c); ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - vx / sp * 22, by - vy / sp * 22); ctx.stroke();
    }
    ctx.shadowBlur = 0;

    for (const s of S.ships.values()) drawShipFull(s, false, t);
    if (S.id && !S.dead) drawShipFull({ ...me, plane: E.PLANE_INDEX[S.save.plane], hp: S.hp, prot: S.prot, name: S.save.name, bot: false }, true, t);

    S.parts = S.parts.filter(p => (p.life -= dt) > 0);
    for (const p of S.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
      const f = p.life / p.max;
      ctx.globalAlpha = f;
      if (p.ring) { ctx.strokeStyle = p.c; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 - f), 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawMinimap();
    drawJoystick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
