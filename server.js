const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createGame } = require('./public/engine.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'players.json');
const TICK_RATE = 10;

// ---------- saving ----------
let saves = {};
try { saves = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch (e) { saves = {}; }

// sealed progress backups kept in each player's browser (see createGame in engine.js).
// SAVE_SECRET is made by Render (render.yaml) and stays the same across updates.
const SECRET = process.env.SAVE_SECRET || 'ice-cream-tycoon-local-secret';
const seal = text => crypto.createHmac('sha256', SECRET).update(text).digest('hex');
const backup = {
  seal(key, save) {
    const data = JSON.stringify(save);
    return { data, sig: seal(key + '\n' + data) };
  },
  open(key, blob) {
    try {
      if (!blob || typeof blob.data !== 'string' || typeof blob.sig !== 'string' || blob.data.length > 200000) return null;
      const want = Buffer.from(seal(key + '\n' + blob.data));
      const got = Buffer.from(blob.sig);
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
      const save = JSON.parse(blob.data);
      return save && String(save.name || '').toLowerCase() === key ? save : null;
    } catch (e) { return null; }
  },
};

const game = createGame({ saves, backup });

function saveAll() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SAVE_FILE, JSON.stringify(game.snapshotSaves(), null, 2));
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
  const conn = {
    send(msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
  };
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    game.handle(conn, msg);
  });
  ws.on('close', () => {
    game.leave(conn);
    saveAll();
  });
});

setInterval(() => game.tick(1 / TICK_RATE), 1000 / TICK_RATE);
setInterval(saveAll, 10000);
// Render stops the old server on every update: give everyone a fresh backup first
function shutDown() {
  saveAll();
  game.sendBackups();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);

server.listen(PORT, () => {
  console.log(`Ice Cream Tycoon running at http://localhost:${PORT}`);
});
