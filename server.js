const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { FLAVORS, UPGRADES, upgradeCost, SERVE_TIME, START_SPACES, SPACES_PER_BUY, spaceCost } =
  require('./public/gamedata.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'players.json');

const WORLD = { width: 1280, height: 860 };
const TICK_RATE = 10;
const MAX_QUEUE = 5;
const WALK_SPEED = 170;
const COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b',
  '#20c997', '#f06595', '#748ffc', '#94d82d', '#fd7e14', '#22b8cf'];

// 4 x 3 grid of stand spots in the park
const SLOTS = [];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 4; col++) {
    SLOTS.push({ x: 170 + col * 313, y: 140 + row * 270 });
  }
}

const flavorById = Object.fromEntries(FLAVORS.map(f => [f.id, f]));

// ---------- saving ----------
let saves = {};
try { saves = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch (e) { saves = {}; }

function saveAll() {
  for (const s of stands.values()) saves[s.key] = toSave(s);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SAVE_FILE, JSON.stringify(saves, null, 2));
}

function toSave(s) {
  return { name: s.name, money: s.money, totalEarned: s.totalEarned, sold: s.sold,
    flavors: s.flavors, spaces: s.spaces, upgrades: s.upgrades };
}

// ---------- game state ----------
const stands = new Map();     // id -> stand (one per connected player)
const customers = new Map();  // id -> customer
let nextId = 1;

function createStand(ws, name) {
  const key = name.toLowerCase();
  const used = new Set([...stands.values()].map(s => s.slot));
  const slot = SLOTS.findIndex((_, i) => !used.has(i));
  if (slot === -1) return null;
  const saved = saves[key] || {};
  const stand = {
    id: nextId++, ws, key, name, slot,
    color: COLORS[slot % COLORS.length],
    money: saved.money ?? 0,
    totalEarned: saved.totalEarned ?? 0,
    sold: saved.sold ?? 0,
    flavors: saved.flavors ?? ['vanilla', 'chocolate'],
    spaces: saved.spaces ?? START_SPACES,
    upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, saved.upgrades?.[k] ?? 0])),
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

function spawnCustomer(stand) {
  // walk in along the path from whichever side of the park is closer
  const slot = SLOTS[stand.slot];
  const fromLeft = slot.x < WORLD.width / 2;
  const flavor = stand.flavors[Math.floor(Math.random() * stand.flavors.length)];
  const c = {
    id: nextId++,
    x: fromLeft ? -30 : WORLD.width + 30,
    y: slot.y + 90 + Math.random() * 120,
    standId: stand.id,
    flavor,
    golden: Math.random() < 0.05, // lucky customer pays triple
    state: 'walking',
    look: Math.floor(Math.random() * 6),
  };
  customers.set(c.id, c);
  stand.queue.push(c.id);
}

function sendOffCustomer(c) {
  c.state = 'leaving';
  c.tx = c.x < WORLD.width / 2 ? -40 : WORLD.width + 40;
  c.ty = c.y + 30 + Math.random() * 60;
}

function completeSale(stand) {
  const c = customers.get(stand.queue.shift());
  stand.serveProgress = 0;
  if (!c) return;
  const flavor = flavorById[c.flavor];
  let amount = flavor.price * (1 + 0.1 * stand.upgrades.tips);
  if (c.golden) amount *= 3;
  amount = Math.round(amount * 100) / 100;
  stand.money += amount;
  stand.totalEarned += amount;
  stand.sold++;
  c.served = true;
  sendOffCustomer(c);
  broadcast({ type: 'sale', standId: stand.id, customerId: c.id, flavor: c.flavor,
    amount, golden: c.golden });
}

function tick(dt) {
  for (const stand of stands.values()) {
    // new customers: bigger sign and more flavors bring more people
    const interval = 2.5 / (1 + 0.3 * stand.upgrades.sign + 0.1 * (stand.flavors.length - 2));
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
    const dist = Math.hypot(dx, dy);
    const step = WALK_SPEED * dt;
    if (dist <= step) {
      c.x = c.tx; c.y = c.ty;
      if (c.state === 'walking') c.state = 'waiting';
      else if (c.state === 'leaving') customers.delete(c.id);
    } else {
      c.x += (dx / dist) * step;
      c.y += (dy / dist) * step;
      if (c.state === 'waiting') c.state = 'walking';
    }
  }

  broadcast({
    type: 'state',
    stands: [...stands.values()].map(s => ({
      id: s.id, name: s.name, slot: s.slot, color: s.color,
      money: s.money, totalEarned: s.totalEarned, sold: s.sold,
      flavors: s.flavors, spaces: s.spaces, upgrades: s.upgrades,
      serve: s.queue.length ? s.serveProgress / SERVE_TIME : 0,
    })),
    customers: [...customers.values()].map(c => ({
      id: c.id, x: Math.round(c.x), y: Math.round(c.y), flavor: c.flavor,
      golden: c.golden, state: c.state, look: c.look, served: !!c.served,
    })),
  });
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const s of stands.values()) {
    if (s.ws.readyState === 1) s.ws.send(data);
  }
}

// ---------- player actions ----------
function handle(ws, msg) {
  const stand = ws.standId && stands.get(ws.standId);

  if (msg.type === 'join' && !stand) {
    const name = String(msg.name || '').replace(/[^\w \-]/g, '').trim().slice(0, 16);
    if (!name) return send(ws, { type: 'error', text: 'Please pick a name.' });
    if ([...stands.values()].some(s => s.key === name.toLowerCase())) {
      return send(ws, { type: 'error', text: 'Someone with that name is already playing.' });
    }
    const s = createStand(ws, name);
    if (!s) return send(ws, { type: 'error', text: 'The park is full (12 stands). Try again later!' });
    ws.standId = s.id;
    send(ws, { type: 'welcome', id: s.id, world: WORLD, slots: SLOTS, returning: !!saves[s.key] });
    return;
  }
  if (!stand) return;

  if (msg.type === 'scoop') {
    stand.clicks++;
  } else if (msg.type === 'buyFlavor') {
    const f = flavorById[msg.id];
    if (!f || stand.flavors.includes(f.id)) return;
    if (stand.flavors.length >= stand.spaces) {
      return send(ws, { type: 'error', text: 'Your stand is full! Buy Extra Space first.' });
    }
    if (stand.money < f.cost) return send(ws, { type: 'error', text: 'Not enough money!' });
    stand.money -= f.cost;
    stand.flavors.push(f.id);
    send(ws, { type: 'unlocked', flavor: f.id });
  } else if (msg.type === 'buySpace') {
    const cost = spaceCost(stand.spaces);
    if (cost === null || stand.flavors.length < stand.spaces) return;
    if (stand.money < cost) return send(ws, { type: 'error', text: 'Not enough money!' });
    stand.money -= cost;
    stand.spaces += SPACES_PER_BUY;
    send(ws, { type: 'spaceAdded', spaces: stand.spaces });
  } else if (msg.type === 'buyUpgrade') {
    const u = UPGRADES[msg.key];
    if (!u) return;
    const level = stand.upgrades[msg.key];
    if (level >= u.max) return;
    const cost = upgradeCost(msg.key, level);
    if (stand.money < cost) return send(ws, { type: 'error', text: 'Not enough money!' });
    stand.money -= cost;
    stand.upgrades[msg.key]++;
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// ---------- servers ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    handle(ws, msg);
  });
  ws.on('close', () => {
    const stand = stands.get(ws.standId);
    if (!stand) return;
    saves[stand.key] = toSave(stand);
    stands.delete(stand.id);
    saveAll();
  });
});

setInterval(() => tick(1 / TICK_RATE), 1000 / TICK_RATE);
setInterval(saveAll, 10000);
process.on('SIGINT', () => { saveAll(); process.exit(0); });
process.on('SIGTERM', () => { saveAll(); process.exit(0); });

server.listen(PORT, () => {
  console.log(`Ice Cream Tycoon running at http://localhost:${PORT}`);
});
