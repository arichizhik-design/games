const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createGame } = require('./public/engine.js');
const { openStore } = require('./store.js');
const { createShop } = require('./shop.js');
const { SHARD_PACKS, MONTHLY_LIMIT_USD } = require('./public/gamedata.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const TICK_RATE = 10;

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

// the web address players use (Render sets RENDER_EXTERNAL_URL), for Stripe to send them back to
const baseUrl = () => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// 📜 the page Stripe needs: who runs the game, what's for sale, refunds
function policyPage() {
  const email = process.env.CONTACT_EMAIL;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const contact = email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : '<i>(contact email coming soon)</i>';
  const rows = SHARD_PACKS.map(p => `<tr><td>$${p.usd}</td><td>${p.shards.toLocaleString('en-US')} shards</td><td>${p.bonus ? `+${p.bonus}% bonus` : ''}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ice Cream Tycoon: Shop, Refunds and Contact</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.5;color:#2b2b2b;background:#fff8fb}
h1{color:#d6336c}h2{color:#d6336c;margin-top:28px}table{border-collapse:collapse}td{padding:4px 14px 4px 0}a{color:#d6336c}</style></head><body>
<h1>🍦 Ice Cream Tycoon</h1>
<p>Ice Cream Tycoon is a free online game. Everything in the game can be earned by playing.</p>
<h2>Contact</h2><p>Questions, problems or refunds: ${contact}</p>
<h2>What's for sale</h2>
<p>Players can buy <b>💎 shards</b>, a digital in-game currency. Shards are used for Game Passes inside the game. They have no
value outside the game and can't be traded or turned back into money. Nothing physical is shipped. Prices are in US dollars.</p>
<table>${rows}</table>
<h2>Parents are in charge</h2>
<p>A parent or guardian has to set up purchases first with their email and a parent PIN. Receipts go to that email.
Each account can spend at most $${MONTHLY_LIMIT_USD} a month unless the parent changes the limit with their PIN.
Payments are handled by Stripe; card numbers never reach the game.</p>
<h2>Refunds</h2>
<p>If a purchase was a mistake, email us within 14 days and we'll refund it. When a purchase is refunded, its shards are
removed from the account (shards already spent can make the account's shard count go to zero).</p>
<p><a href="/">← Back to the game</a></p></body></html>`;
}

async function main() {
  // ---------- saving: Postgres when DATABASE_URL is set, otherwise files in data/ ----------
  const store = await openStore({ dir: DATA_DIR });
  const saves = await store.loadSaves();
  if (store.kind === 'postgres' && !Object.keys(saves).length) {
    // first start with the database: bring over the progress saved in the old file, if there is one
    try { Object.assign(saves, JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'players.json'), 'utf8'))); } catch (e) {}
  }
  const accounts = await store.loadAccounts();
  console.log(`Saving to ${store.kind === 'postgres' ? 'the database' : 'files in data/'}: ${Object.keys(saves).length} players, ${Object.keys(accounts).length} accounts`);

  const game = createGame({ saves, backup });

  // write only the players whose progress changed since last time
  const written = {};
  let saving = Promise.resolve();
  function saveAll() {
    saving = saving.then(async () => {
      const all = game.snapshotSaves();
      const changed = {};
      for (const [key, save] of Object.entries(all)) {
        const text = JSON.stringify(save);
        if (written[key] !== text) { changed[key] = save; written[key] = text; }
      }
      if (Object.keys(changed).length) await store.writeSaves(changed);
    }).catch(e => console.error('Saving failed:', e.message));
    return saving;
  }
  for (const [key, save] of Object.entries(saves)) written[key] = JSON.stringify(save);

  const shop = createShop({ game, store, accounts, persist: saveAll, baseUrl });
  console.log(shop.enabled ? `💎 Shard Shop is on (${process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'TEST mode' : 'LIVE payments'})` : '💎 Shard Shop is off (no STRIPE_SECRET_KEY)');

  // ---------- servers ----------
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/stripe/webhook' && req.method === 'POST') return shop.webhook(req, res);
    if (urlPath === '/policy') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(policyPage());
    }
    const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
    if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      // no-cache: browsers always check for the newest version after an update (so nobody plays an old copy)
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws, req) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const conn = {
      send(msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    };
    ws.on('message', async raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      if (!msg || typeof msg !== 'object') return;
      try {
        // accounts and the Shard Shop first, then the game
        if (await shop.handle(conn, msg, ip)) return;
      } catch (e) {
        console.error('Shop error:', e);
        return conn.send({ type: 'error', text: 'Something went wrong. Try again.' });
      }
      game.handle(conn, msg);
    });
    ws.on('close', () => {
      shop.leave(conn);
      game.leave(conn);
      saveAll();
    });
  });

  setInterval(() => game.tick(1 / TICK_RATE), 1000 / TICK_RATE);
  setInterval(saveAll, 10000);
  // Render stops the old server on every update: save, and give everyone a fresh backup first
  async function shutDown() {
    game.sendBackups();
    await saveAll();
    setTimeout(() => process.exit(0), 300);
  }
  process.on('SIGINT', shutDown);
  process.on('SIGTERM', shutDown);

  server.listen(PORT, () => {
    console.log(`Ice Cream Tycoon running at http://localhost:${PORT}`);
  });
}

main().catch(e => { console.error('Could not start:', e); process.exit(1); });
