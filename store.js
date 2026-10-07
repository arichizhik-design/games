// Where the online game keeps things that must never be lost: everyone's progress, accounts
// (passwords, parent settings) and shard purchases.
// With DATABASE_URL set (Render Postgres) it all lives in the database; without it (testing on
// your own computer) it lives in files in the data folder.
const fs = require('fs');
const path = require('path');

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };

// ---------- Postgres ----------
async function openPostgres(url) {
  const { Pool } = require('pg');
  // Render's Internal Database URL needs no SSL; the External one (…render.com) does
  const pool = new Pool({ connectionString: url, ssl: /render\.com/.test(url) ? { rejectUnauthorized: false } : false, max: 5 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (key TEXT PRIMARY KEY, save JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS accounts (key TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS purchases (
      session_id TEXT PRIMARY KEY, key TEXT NOT NULL, pack TEXT NOT NULL, cents INTEGER NOT NULL, shards INTEGER NOT NULL,
      payment_intent TEXT, refunded_shards INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS purchases_key ON purchases (key, created_at);
    CREATE INDEX IF NOT EXISTS purchases_intent ON purchases (payment_intent);`);
  const row = r => r && { session: r.session_id, key: r.key, pack: r.pack, cents: r.cents, shards: r.shards,
    intent: r.payment_intent, refundedShards: r.refunded_shards, at: new Date(r.created_at).getTime() };
  return {
    kind: 'postgres',
    async loadSaves() {
      const { rows } = await pool.query('SELECT key, save FROM players');
      return Object.fromEntries(rows.map(r => [r.key, r.save]));
    },
    async writeSaves(changed) {
      for (const [key, save] of Object.entries(changed)) {
        await pool.query(`INSERT INTO players (key, save, updated_at) VALUES ($1, $2, now())
          ON CONFLICT (key) DO UPDATE SET save = EXCLUDED.save, updated_at = now()`, [key, save]);
      }
    },
    async deleteSave(key) { await pool.query('DELETE FROM players WHERE key = $1', [key]); },
    async loadAccounts() {
      const { rows } = await pool.query('SELECT key, data FROM accounts');
      return Object.fromEntries(rows.map(r => [r.key, r.data]));
    },
    async putAccount(key, data) {
      await pool.query(`INSERT INTO accounts (key, data) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [key, data]);
    },
    async deleteAccount(key) { await pool.query('DELETE FROM accounts WHERE key = $1', [key]); },
    // returns true only the first time a payment is recorded (Stripe can send the same event twice)
    async addPurchase(p) {
      const r = await pool.query(`INSERT INTO purchases (session_id, key, pack, cents, shards, payment_intent)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (session_id) DO NOTHING`, [p.session, p.key, p.pack, p.cents, p.shards, p.intent]);
      return r.rowCount === 1;
    },
    async purchaseByIntent(intent) {
      const { rows } = await pool.query('SELECT * FROM purchases WHERE payment_intent = $1', [intent]);
      return row(rows[0]);
    },
    async setRefundedShards(session, n) {
      await pool.query('UPDATE purchases SET refunded_shards = $2 WHERE session_id = $1', [session, n]);
    },
    async monthSpend(key) {
      const { rows } = await pool.query(`SELECT COALESCE(SUM(cents), 0)::int AS c FROM purchases
        WHERE key = $1 AND created_at >= $2 AND refunded_shards < shards`, [key, monthStart()]);
      return rows[0].c;
    },
    async purchases(key, limit = 20) {
      const { rows } = await pool.query('SELECT * FROM purchases WHERE key = $1 ORDER BY created_at DESC LIMIT $2', [key, limit]);
      return rows.map(row);
    },
  };
}

// ---------- files (for testing without a database) ----------
function openFiles(dir) {
  const file = name => path.join(dir, name);
  const read = (name, empty) => { try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch (e) { return empty; } };
  const write = (name, data) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file(name), JSON.stringify(data, null, 2)); };
  const saves = read('players.json', {}), accounts = read('accounts.json', {}), purchases = read('purchases.json', []);
  return {
    kind: 'files',
    async loadSaves() { return saves; },
    async writeSaves(changed) { Object.assign(saves, changed); write('players.json', saves); },
    async deleteSave(key) { delete saves[key]; write('players.json', saves); },
    async loadAccounts() { return { ...accounts }; },
    async putAccount(key, data) { accounts[key] = data; write('accounts.json', accounts); },
    async deleteAccount(key) { delete accounts[key]; write('accounts.json', accounts); },
    async addPurchase(p) {
      if (purchases.some(x => x.session === p.session)) return false;
      purchases.push({ ...p, refundedShards: 0, at: Date.now() });
      write('purchases.json', purchases);
      return true;
    },
    async purchaseByIntent(intent) { return intent ? purchases.find(x => x.intent === intent) || null : null; },
    async setRefundedShards(session, n) {
      const p = purchases.find(x => x.session === session);
      if (p) { p.refundedShards = n; write('purchases.json', purchases); }
    },
    async monthSpend(key) {
      const from = monthStart().getTime();
      return purchases.filter(p => p.key === key && p.at >= from && p.refundedShards < p.shards).reduce((n, p) => n + p.cents, 0);
    },
    async purchases(key, limit = 20) { return purchases.filter(p => p.key === key).sort((a, b) => b.at - a.at).slice(0, limit); },
  };
}

async function openStore({ url = process.env.DATABASE_URL, dir } = {}) {
  return url ? openPostgres(url) : openFiles(dir);
}

module.exports = { openStore };
