// Space Wick game engine. The same file runs on the server (multiplayer) and in the browser (solo mode).
// The engine owns health, bullets, money, shops and AI pilots. Each player's own browser moves their ship,
// and the engine checks that the move is possible before accepting it.
(function (root) {
  'use strict';

  const MAX_HP = 200;            // every ship and every dummy has 200 health
  const SHIP_R = 24;
  const DUMMY_R = 30;
  const BULLET_SPEED = 950;
  const BULLET_LIFE = 0.9;       // seconds
  const RESPAWN_MS = 3000;
  const PROTECT_MS = 3000;       // spawn shield when you enter the Wick
  const DUMMY_RESPAWN_MS = 4000;
  const REWARD_DUMMY = 10;       // money for a dummy in the Wick (lobby dummies give nothing)
  const REWARD_KILL = 50;        // money for shooting down another pilot

  // ✈️ planes: the better the plane, the more it costs
  const PLANES = [
    { id: 'rookie',  name: 'Rookie',  price: 0,     speed: 260, dmg: 10, delay: 420, guns: 1, color: '#9db4ff', trim: '#3b5bb5', desc: 'Your first ship. Slow but steady.' },
    { id: 'scout',   name: 'Scout',   price: 150,   speed: 320, dmg: 12, delay: 360, guns: 1, color: '#6ee7a0', trim: '#1f7a4a', desc: 'Light and quick.' },
    { id: 'viper',   name: 'Viper',   price: 400,   speed: 330, dmg: 17, delay: 310, guns: 1, color: '#ff6b6b', trim: '#8a1c1c', desc: 'Hits hard for its size.' },
    { id: 'falcon',  name: 'Falcon',  price: 1000,  speed: 345, dmg: 14, delay: 260, guns: 2, color: '#ffb347', trim: '#9a5a00', desc: 'Twin guns!' },
    { id: 'phantom', name: 'Phantom', price: 2500,  speed: 385, dmg: 20, delay: 230, guns: 2, color: '#b28dff', trim: '#4b2a8a', desc: 'Stealth fighter. Very fast.' },
    { id: 'titan',   name: 'Titan',   price: 6000,  speed: 340, dmg: 28, delay: 210, guns: 2, color: '#ffd84d', trim: '#8a6d00', desc: 'A flying fortress.' },
    { id: 'nova',    name: 'Nova',    price: 15000, speed: 420, dmg: 30, delay: 170, guns: 3, color: '#6ff3ff', trim: '#0b6b7a', desc: 'The best ship in space. Triple guns.' },
  ];
  const PLANE_INDEX = {};
  PLANES.forEach((p, i) => { PLANE_INDEX[p.id] = i; });

  // 🔧 upgrades work on whichever plane you fly
  const UPGRADES = [
    { key: 'dmg',  name: 'Damage',    icon: '💥', desc: '+10% bullet damage',  base: 60, max: 10 },
    { key: 'rate', name: 'Fire Rate', icon: '🔫', desc: 'shoot 8% faster',     base: 70, max: 10 },
    { key: 'spd',  name: 'Engine',    icon: '🚀', desc: '+6% flying speed',    base: 50, max: 10 },
  ];
  const UPG = {};
  UPGRADES.forEach(u => { UPG[u.key] = u; });
  const upCost = (key, lvl) => Math.round(UPG[key].base * Math.pow(1.7, lvl) / 5) * 5;

  function stats(save) {
    const p = PLANES[PLANE_INDEX[save.plane]] || PLANES[0];
    const u = save.up || {};
    return {
      speed: p.speed * (1 + 0.06 * (u.spd || 0)),
      dmg: p.dmg * (1 + 0.10 * (u.dmg || 0)),
      delay: p.delay / (1 + 0.08 * (u.rate || 0)),
      guns: p.guns,
    };
  }

  function rng(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }

  // 🗺️ the two places: the lobby (safe) and the Wick (the battlefield)
  const ZONES = {
    lobby: {
      name: 'Lobby', w: 1800, h: 1400, safe: true, reward: 0,
      spawn: { x: 900, y: 760 },
      portal: { x: 900, y: 250, r: 85, to: 'wick', label: 'ENTER WICK' },
      shops: [
        { id: 'planes',   label: 'PLANE SHOP',   x: 160,  y: 860, w: 380, h: 240 },
        { id: 'upgrades', label: 'UPGRADE SHOP', x: 1260, y: 860, w: 380, h: 240 },
      ],
      dummies: [[480, 520], [1320, 520], [900, 1200]],
    },
    wick: {
      name: 'The Wick', w: 4000, h: 4000, safe: false, reward: REWARD_DUMMY,
      portal: { x: 2000, y: 3830, r: 85, to: 'lobby', label: 'BACK TO LOBBY' },
      shops: [],
      dummies: [],
    },
  };
  (function placeWickDummies() {
    const r = rng(42), z = ZONES.wick;
    while (z.dummies.length < 16) {
      const x = 300 + r() * (z.w - 600), y = 300 + r() * (z.h - 600);
      if (Math.hypot(x - z.portal.x, y - z.portal.y) < 400) continue;
      if (z.dummies.some(d => Math.hypot(d[0] - x, d[1] - y) < 450)) continue;
      z.dummies.push([Math.round(x), Math.round(y)]);
    }
  })();

  function nearShop(zone, x, y) {
    const z = ZONES[zone];
    if (!z) return null;
    for (const s of z.shops) {
      const pad = SHIP_R + 20;
      if (x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad) return s;
    }
    return null;
  }

  // ship movement, shared by the browser (your ship) and the engine (AI pilots)
  function stepShip(s, mx, my, speed, dt, zone) {
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const k = Math.min(1, 5 * dt);
    s.vx += (mx * speed - s.vx) * k;
    s.vy += (my * speed - s.vy) * k;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const z = ZONES[zone];
    if (s.x < SHIP_R) { s.x = SHIP_R; s.vx = 0; }
    if (s.y < SHIP_R) { s.y = SHIP_R; s.vy = 0; }
    if (s.x > z.w - SHIP_R) { s.x = z.w - SHIP_R; s.vx = 0; }
    if (s.y > z.h - SHIP_R) { s.y = z.h - SHIP_R; s.vy = 0; }
    if (Math.hypot(s.vx, s.vy) > 25) s.a = Math.atan2(s.vy, s.vx);
  }

  const cleanName = n => String(n || '').replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

  function cleanSave(s, name) {
    const out = { name, money: 0, planes: ['rookie'], plane: 'rookie', up: { dmg: 0, rate: 0, spd: 0 }, kills: 0 };
    if (!s || typeof s !== 'object') return out;
    if (Number.isFinite(s.money) && s.money >= 0) out.money = Math.floor(s.money);
    if (Number.isFinite(s.kills) && s.kills >= 0) out.kills = Math.floor(s.kills);
    if (Array.isArray(s.planes)) out.planes = PLANES.map(p => p.id).filter(id => id === 'rookie' || s.planes.includes(id));
    if (out.planes.includes(s.plane)) out.plane = s.plane;
    for (const u of UPGRADES) {
      const v = s.up && s.up[u.key];
      if (Number.isInteger(v)) out.up[u.key] = Math.max(0, Math.min(u.max, v));
    }
    return out;
  }

  const BOT_NAMES = ['Zorbo', 'NebulaNick', 'CometKid', 'StarDust', 'Blaze77', 'Orbit', 'LunaZap', 'Quasar',
    'RocketRay', 'Meteor', 'Pixel', 'Gizmo', 'Vortex', 'Astro_Jo', 'Sparky', 'Nova_Lee', 'TurboTom', 'Ziggy'];

  function createEngine(opts) {
    const send = opts.send;                    // send(playerId, message)
    const load = opts.load || (() => null);    // load(nameKey) -> saved progress or null
    const store = opts.save || (() => {});     // save(nameKey, progress)
    const players = new Map();
    let bullets = [];
    const fx = { lobby: [], wick: [] };
    const dummies = [];
    for (const zone of Object.keys(ZONES)) {
      ZONES[zone].dummies.forEach(([x, y], i) => dummies.push({ id: i, zone, x, y, hp: MAX_HP, deadUntil: 0 }));
    }
    let last = Date.now();
    let botCheck = 0, lastBotSpawn = 0, botSeq = 0;

    const humans = () => [...players.values()].filter(p => !p.bot);
    const toZone = (zone, msg) => { for (const p of players.values()) if (!p.bot && p.zone === zone) send(p.id, msg); };
    const persist = p => { if (!p.bot) store(p.save.name.toLowerCase(), p.save); };
    const sendSave = p => { if (!p.bot) send(p.id, { t: 'save', save: p.save }); };
    const tell = (p, text) => { if (!p.bot) send(p.id, { t: 'msg', text }); };

    function makeShip(id, name, bot, save) {
      return { id, name, bot, save, zone: 'lobby', x: 0, y: 0, vx: 0, vy: 0, a: -Math.PI / 2, hp: MAX_HP,
        dead: false, respawnAt: 0, prot: 0, lastFire: 0, lastHit: 0, fire: false, tap: false, aim: 0,
        tpn: 0, lastT: Date.now(), ai: null };
    }

    function wickSpawn() {
      const z = ZONES.wick;
      let best = null, bestD = -1;
      for (let i = 0; i < 10; i++) {
        const x = 250 + Math.random() * (z.w - 500), y = 250 + Math.random() * (z.h - 700);
        let d = 99999;
        for (const q of players.values()) if (q.zone === 'wick' && !q.dead) d = Math.min(d, Math.hypot(q.x - x, q.y - y));
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
      return best;
    }

    function teleport(p, zone) {
      const now = Date.now();
      p.zone = zone;
      if (zone === 'lobby') {
        const s = ZONES.lobby.spawn;
        p.x = s.x + (Math.random() - 0.5) * 120; p.y = s.y + (Math.random() - 0.5) * 60;
        p.prot = 0;
      } else {
        const s = wickSpawn();
        p.x = s.x; p.y = s.y;
        p.prot = now + PROTECT_MS;
      }
      p.vx = p.vy = 0; p.a = -Math.PI / 2;
      p.tpn++; p.lastT = now; p.fire = false; p.tap = false;
      if (!p.bot) send(p.id, { t: 'tp', zone, x: p.x, y: p.y, tpn: p.tpn });
    }

    function give(p, amt, why) {
      if (p.bot || amt <= 0) return;
      p.save.money += amt;
      send(p.id, { t: 'money', amt, why, money: p.save.money });
      persist(p);
    }

    // ---------- messages from players ----------
    function handle(id, msg) {
      if (!msg || typeof msg !== 'object') return;
      const p = players.get(id);
      if (msg.t === 'join') {
        if (p) return;
        let name = cleanName(msg.name);
        if (!name) name = 'Pilot' + Math.floor(Math.random() * 9000 + 1000);
        if (humans().some(q => q.name.toLowerCase() === name.toLowerCase())) {
          return send(id, { t: 'err', text: `Someone named ${name} is already flying. Pick another name!` });
        }
        const save = cleanSave(load(name.toLowerCase()), name);
        const ship = makeShip(id, name, false, save);
        players.set(id, ship);
        send(id, { t: 'welcome', id, save });
        teleport(ship, 'lobby');
        return;
      }
      if (!p || p.bot) return;

      if (msg.t === 'in') {
        if (p.dead) return;
        const now = Date.now();
        if (msg.tpn === p.tpn && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
          // accept the move, but no faster than the ship can really fly
          const dt = Math.min(1, (now - p.lastT) / 1000);
          const maxD = stats(p.save).speed * 1.35 * dt + 40;
          let dx = msg.x - p.x, dy = msg.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > maxD) { dx *= maxD / d; dy *= maxD / d; }
          const z = ZONES[p.zone];
          const nx = Math.max(SHIP_R, Math.min(z.w - SHIP_R, p.x + dx));
          const ny = Math.max(SHIP_R, Math.min(z.h - SHIP_R, p.y + dy));
          if (dt > 0) { p.vx = p.vx * 0.5 + (nx - p.x) / dt * 0.5; p.vy = p.vy * 0.5 + (ny - p.y) / dt * 0.5; }
          p.x = nx; p.y = ny; p.lastT = now;
        }
        if (Number.isFinite(msg.a)) p.a = msg.a;
        if (Number.isFinite(msg.aim)) p.aim = msg.aim;
        p.fire = !!msg.fire;
        if (msg.tap) p.tap = true;
        return;
      }

      if (msg.t === 'buy') {
        const plane = PLANES[PLANE_INDEX[msg.plane]];
        if (!plane) return;
        if (p.zone !== 'lobby') return tell(p, 'Shops are in the lobby!');
        if (p.save.planes.includes(plane.id)) return;
        if (p.save.money < plane.price) return tell(p, `You need $${(plane.price - p.save.money).toLocaleString('en-US')} more for the ${plane.name}.`);
        p.save.money -= plane.price;
        p.save.planes.push(plane.id);
        p.save.plane = plane.id;
        tell(p, `You bought the ${plane.name}! ✈️`);
        sendSave(p); persist(p);
        return;
      }

      if (msg.t === 'equip') {
        if (!p.save.planes.includes(msg.plane)) return;
        if (p.zone !== 'lobby') return tell(p, 'Change planes in the lobby!');
        p.save.plane = msg.plane;
        sendSave(p); persist(p);
        return;
      }

      if (msg.t === 'up') {
        const u = UPG[msg.key];
        if (!u) return;
        if (p.zone !== 'lobby') return tell(p, 'Shops are in the lobby!');
        const lvl = p.save.up[u.key] || 0;
        if (lvl >= u.max) return tell(p, `${u.name} is already maxed out!`);
        const cost = upCost(u.key, lvl);
        if (p.save.money < cost) return tell(p, `You need $${(cost - p.save.money).toLocaleString('en-US')} more.`);
        p.save.money -= cost;
        p.save.up[u.key] = lvl + 1;
        tell(p, `${u.icon} ${u.name} is now level ${lvl + 1}!`);
        sendSave(p); persist(p);
      }
    }

    function removePlayer(id) {
      const p = players.get(id);
      if (!p) return;
      persist(p);
      players.delete(id);
    }

    // ---------- fighting ----------
    function fireGuns(p, st) {
      const gx = { 1: [0], 2: [-0.4, 0.4], 3: [-0.5, 0, 0.5] }[st.guns];
      const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
      for (const g of gx) {
        const ox = -sa * g * SHIP_R, oy = ca * g * SHIP_R;
        bullets.push({ zone: p.zone, x: p.x + ca * SHIP_R * 1.2 + ox, y: p.y + sa * SHIP_R * 1.2 + oy,
          vx: ca * BULLET_SPEED, vy: sa * BULLET_SPEED, owner: p.id, oname: p.name, dmg: p.bot ? st.dmg * 0.6 : st.dmg,
          life: BULLET_LIFE, c: PLANE_INDEX[p.save.plane] });
      }
      if (p.zone === 'wick') p.prot = 0; // shooting turns off your spawn shield
    }

    function killShip(t, killer, killerName, now) {
      t.dead = true; t.hp = 0; t.fire = false;
      t.respawnAt = now + RESPAWN_MS;
      fx[t.zone].push(['boom', Math.round(t.x), Math.round(t.y), PLANE_INDEX[t.save.plane]]);
      if (!t.bot) send(t.id, { t: 'dead', by: killerName || 'space' });
      if (killer && killer !== t) {
        if (!killer.bot) { killer.save.kills++; give(killer, REWARD_KILL, `Shot down ${t.name}`); }
      }
      toZone(t.zone, { t: 'feed', k: killerName || '?', v: t.name });
    }

    function hitSeg(x1, y1, x2, y2, cx, cy, r) {
      const dx = x2 - x1, dy = y2 - y1;
      const l2 = dx * dx + dy * dy || 1;
      let u = ((cx - x1) * dx + (cy - y1) * dy) / l2;
      u = Math.max(0, Math.min(1, u));
      const px = x1 + u * dx - cx, py = y1 + u * dy - cy;
      return px * px + py * py < r * r;
    }

    function stepBullets(dt, now) {
      const keep = [];
      for (const b of bullets) {
        b.life -= dt;
        const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
        const z = ZONES[b.zone];
        let hit = false;
        if (!z.safe) {
          for (const t of players.values()) {
            if (t.dead || t.zone !== b.zone || t.id === b.owner || now < t.prot) continue;
            if (hitSeg(b.x, b.y, nx, ny, t.x, t.y, SHIP_R)) {
              hit = true;
              t.hp -= b.dmg; t.lastHit = now;
              fx[b.zone].push(['hit', Math.round(nx), Math.round(ny), b.c]);
              if (t.bot && t.ai && players.get(b.owner)) t.ai.revenge = b.owner;
              if (t.hp <= 0) killShip(t, players.get(b.owner), b.oname, now);
              break;
            }
          }
        }
        if (!hit) {
          for (const d of dummies) {
            if (d.zone !== b.zone || d.hp <= 0) continue;
            if (hitSeg(b.x, b.y, nx, ny, d.x, d.y, DUMMY_R)) {
              hit = true;
              d.hp -= b.dmg;
              fx[b.zone].push(['hit', Math.round(nx), Math.round(ny), b.c]);
              if (d.hp <= 0) {
                d.hp = 0; d.deadUntil = now + DUMMY_RESPAWN_MS;
                fx[b.zone].push(['boom', d.x, d.y, -1]);
                const owner = players.get(b.owner);
                if (owner && z.reward) give(owner, z.reward, 'Dummy');
              }
              break;
            }
          }
        }
        b.x = nx; b.y = ny;
        if (!hit && b.life > 0 && nx > -50 && ny > -50 && nx < z.w + 50 && ny < z.h + 50) keep.push(b);
      }
      bullets = keep;
    }

    // ---------- 🤖 AI pilots, so the Wick is never empty ----------
    function manageBots(now) {
      if (now < botCheck) return;
      botCheck = now + 1000;
      const inWick = humans().filter(p => p.zone === 'wick').length;
      const bots = [...players.values()].filter(p => p.bot);
      const want = Math.max(3, Math.min(5, 6 - inWick));
      if (bots.length < want && now - lastBotSpawn > 1500) {
        lastBotSpawn = now;
        const used = new Set([...players.values()].map(p => p.name));
        const free = BOT_NAMES.filter(n => !used.has(n));
        const name = free[Math.floor(Math.random() * free.length)] || 'Bot' + botSeq;
        const r = Math.random();
        const plane = r < 0.35 ? 'rookie' : r < 0.6 ? 'scout' : r < 0.8 ? 'viper' : r < 0.95 ? 'falcon' : 'phantom';
        const lvl = () => Math.floor(Math.random() * 4);
        const save = { name, money: 0, planes: [plane], plane, up: { dmg: lvl(), rate: lvl(), spd: lvl() }, kills: 0 };
        const b = makeShip('b' + (++botSeq), name, true, save);
        players.set(b.id, b);
        teleport(b, 'wick');
      } else if (bots.length > want) {
        const extra = bots.find(b => !b.dead);
        if (extra) { fx.wick.push(['warp', Math.round(extra.x), Math.round(extra.y), 0]); players.delete(extra.id); }
      }
    }

    function botThink(p, dt, now) {
      const st = stats(p.save);
      const ai = p.ai || (p.ai = { t: 0, target: null, kind: null, wx: p.x, wy: p.y, strafe: 1, burst: 0, firing: false, revenge: null });
      ai.t -= dt;
      if (ai.t <= 0) {
        ai.t = 0.7 + Math.random() * 0.7;
        if (Math.random() < 0.25) ai.strafe = -ai.strafe;
        let best = null, bestScore = 1100, kind = null;
        for (const q of players.values()) {
          if (q === p || q.dead || q.zone !== 'wick' || now < q.prot) continue;
          let score = Math.hypot(q.x - p.x, q.y - p.y) * 0.8;
          if (q.id === ai.revenge) score *= 0.5;
          // don't all gang up on the same pilot
          let chasers = 0;
          for (const o of players.values()) if (o !== p && o.ai && o.ai.target === q) chasers++;
          score *= 1 + chasers * 0.9;
          if (score < bestScore) { bestScore = score; best = q; kind = 'ship'; }
        }
        for (const d of dummies) {
          if (d.zone !== 'wick' || d.hp <= 0) continue;
          const score = Math.hypot(d.x - p.x, d.y - p.y) * 1.3;
          if (score < bestScore) { bestScore = score; best = d; kind = 'dummy'; }
        }
        ai.target = best; ai.kind = kind;
      }
      let t = ai.target;
      if (t && (ai.kind === 'ship' ? (t.dead || !players.has(t.id) || t.zone !== 'wick') : t.hp <= 0)) { t = ai.target = null; }

      let mx = 0, my = 0, dist = 0;
      if (t) {
        const dx = t.x - p.x, dy = t.y - p.y;
        dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist, uy = dy / dist;
        if (dist > 400) { mx = ux; my = uy; }
        else if (dist < 220) { mx = -ux + -uy * ai.strafe * 0.6; my = -uy + ux * ai.strafe * 0.6; }
        else { mx = -uy * ai.strafe + ux * 0.2; my = ux * ai.strafe + uy * 0.2; }
      } else {
        if (Math.hypot(ai.wx - p.x, ai.wy - p.y) < 120) { ai.wx = 300 + Math.random() * 3400; ai.wy = 300 + Math.random() * 3200; }
        mx = ai.wx - p.x; my = ai.wy - p.y;
      }
      // stay away from the lobby portal and the walls
      const po = ZONES.wick.portal, pd = Math.hypot(p.x - po.x, p.y - po.y);
      if (pd < 300) { mx += (p.x - po.x) / pd * 2; my += (p.y - po.y) / pd * 2; }
      if (p.x < 150) mx += 1; if (p.x > 3850) mx -= 1; if (p.y < 150) my += 1; if (p.y > 3850) my -= 1;
      stepShip(p, mx, my, st.speed * 0.85, dt, 'wick');

      ai.burst -= dt;
      if (ai.burst <= 0) { ai.firing = !ai.firing; ai.burst = ai.firing ? 0.6 + Math.random() * 0.9 : 0.3 + Math.random() * 0.8; }
      if (t && dist < 750) {
        const lead = ai.kind === 'ship' ? dist / BULLET_SPEED * 0.6 : 0;
        const tx = t.x + (t.vx || 0) * lead, ty = t.y + (t.vy || 0) * lead;
        p.aim = Math.atan2(ty - p.y, tx - p.x) + (Math.random() - 0.5) * 0.4;
        p.fire = ai.firing;
        if (p.fire) p.a = p.aim;
      } else {
        p.fire = false;
      }
    }

    // ---------- the game clock ----------
    function tick() {
      const now = Date.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      manageBots(now);
      for (const p of [...players.values()]) {
        if (p.dead) {
          if (now >= p.respawnAt) {
            if (p.bot) players.delete(p.id);
            else { p.dead = false; p.hp = MAX_HP; teleport(p, 'lobby'); }
          }
          continue;
        }
        if (p.bot) botThink(p, dt, now);
        if (now - p.lastHit > 5000 && p.hp < MAX_HP) p.hp = Math.min(MAX_HP, p.hp + 12 * dt);
        const st = stats(p.save);
        if ((p.fire || p.tap) && now - p.lastFire >= st.delay) {
          fireGuns(p, st);
          p.lastFire = now; p.tap = false;
        }
        const po = ZONES[p.zone].portal;
        if (!p.bot && Math.hypot(p.x - po.x, p.y - po.y) < po.r + SHIP_R * 0.4) teleport(p, po.to);
      }
      stepBullets(dt, now);
      for (const d of dummies) if (d.hp <= 0 && now >= d.deadUntil) d.hp = MAX_HP;

      for (const zone of Object.keys(ZONES)) {
        const viewers = humans().filter(p => p.zone === zone);
        if (viewers.length) {
          const snap = {
            t: 's',
            sh: [...players.values()].filter(p => p.zone === zone && !p.dead).map(p =>
              [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.a * 100) / 100, Math.ceil(p.hp),
                PLANE_INDEX[p.save.plane], (p.bot ? 1 : 0) | (now < p.prot ? 2 : 0), p.name]),
            b: bullets.filter(b => b.zone === zone).map(b => [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), b.c]),
            d: dummies.filter(d => d.zone === zone).map(d => Math.ceil(d.hp)),
            fx: fx[zone],
          };
          for (const v of viewers) send(v.id, snap);
        }
        fx[zone] = [];
      }
    }

    return { handle, removePlayer, tick, players };
  }

  const api = { createEngine, PLANES, PLANE_INDEX, UPGRADES, UPG, upCost, stats, ZONES, nearShop, stepShip,
    MAX_HP, SHIP_R, DUMMY_R, REWARD_DUMMY, REWARD_KILL, TICK_MS: 50 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpaceEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
