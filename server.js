const http = require('http');
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

const game = createGame({ saves });

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
process.on('SIGINT', () => { saveAll(); process.exit(0); });
process.on('SIGTERM', () => { saveAll(); process.exit(0); });

server.listen(PORT, () => {
  console.log(`Ice Cream Tycoon running at http://localhost:${PORT}`);
});
