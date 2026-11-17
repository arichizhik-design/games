// Space Wick multiplayer server: serves the game page and runs one shared game for everyone who connects.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createEngine, TICK_MS } = require('./public/engine.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'players.json');

// ---------- progress (money, planes, upgrades), kept by pilot name ----------
let saves = {};
try { saves = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch (e) {}
let dirty = false;
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.writeFile(SAVE_FILE + '.tmp', JSON.stringify(saves), err => {
      if (err) return console.error('Saving failed:', err.message);
      fs.rename(SAVE_FILE + '.tmp', SAVE_FILE, () => {});
    });
  });
}, 3000);

const sockets = new Map();
const engine = createEngine({
  send(id, msg) {
    const ws = sockets.get(id);
    if (!ws || ws.readyState !== 1) return;
    if (msg.t === 's' && ws.bufferedAmount > 64 * 1024) return; // slow connection: skip a frame
    ws.send(JSON.stringify(msg));
  },
  load: key => saves[key] || null,
  save: (key, s) => { saves[key] = JSON.parse(JSON.stringify(s)); dirty = true; },
});
setInterval(engine.tick, TICK_MS);

// ---------- web server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/health') { res.writeHead(200); return res.end('ok'); }
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

let nextId = 1;
const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on('connection', ws => {
  const id = 'p' + (nextId++);
  sockets.set(id, ws);
  let count = 0, windowStart = Date.now();
  ws.on('message', raw => {
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; count = 0; }
    if (++count > 80) return; // too many messages
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    engine.handle(id, msg);
  });
  ws.on('close', () => { engine.removePlayer(id); sockets.delete(id); });
});

server.listen(PORT, () => console.log(`🚀 Space Wick running on http://localhost:${PORT}`));
