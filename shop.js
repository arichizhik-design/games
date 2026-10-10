// 🔑 Accounts and 💎 the Shard Shop (online game only).
// - Every player has a password. A device that logged in once gets a "remember me" token.
// - Shards are bought on Stripe's own payment page (Stripe Checkout). The game only adds shards
//   when Stripe tells the server the payment went through (the webhook), never from the browser.
// - A parent email and PIN are needed before the first purchase. Each account has a monthly
//   spending limit ($50 unless the parent changes it with their PIN).
const crypto = require('crypto');
const { SHARD_PACKS, MONTHLY_LIMIT_USD, MAX_LIMIT_USD } = require('./public/gamedata.js');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
// who sees the Shard Shop: admins only while testing, or everyone (SHARDS=everyone)
const SHOP_FOR_EVERYONE = process.env.SHARDS === 'everyone';
const MIN_PASSWORD = 4;

const sha = text => crypto.createHash('sha256').update(text).digest('hex');
function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((ok, fail) => crypto.scrypt(secret, salt, 32, (e, key) => e ? fail(e) : ok({ salt, hash: key.toString('hex') })));
}
function checkSecret(secret, stored) {
  if (!stored) return Promise.resolve(false);
  return new Promise(ok => crypto.scrypt(String(secret), stored.salt, 32, (e, key) => {
    if (e) return ok(false);
    const want = Buffer.from(stored.hash, 'hex');
    ok(want.length === key.length && crypto.timingSafeEqual(want, key));
  }));
}
// the same name cleaning as the game engine
const cleanName = name => String(name || '').replace(/[^\w \-]/g, '').trim().slice(0, 16);
const maskEmail = e => e.replace(/^(.)[^@]*(@.*)$/, '$1•••$2');
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function createShop({ game, store, accounts, persist, baseUrl }) {
  let stripe = null;
  if (STRIPE_KEY) {
    const Stripe = require('stripe');
    // STRIPE_API_HOST is only for automated tests (a pretend Stripe on this computer)
    const host = process.env.STRIPE_API_HOST;
    stripe = new Stripe(STRIPE_KEY, host ? { host, port: Number(process.env.STRIPE_API_PORT || 80), protocol: 'http' } : {});
  }
  const testMode = STRIPE_KEY.startsWith('sk_test_');
  const conns = new Set();               // logged-in connections, to tell them when shards arrive
  const pending = {};                    // key -> checkouts started but not paid yet [{ cents, until }]
  const fails = {};                      // name or IP -> { n, until }: too many wrong passwords = wait a bit

  const locked = id => fails[id] && fails[id].n >= 8 && fails[id].until > Date.now();
  function failed(id) {
    const f = fails[id] && fails[id].until > Date.now() ? fails[id] : { n: 0 };
    fails[id] = { n: f.n + 1, until: Date.now() + 10 * 60e3 };
  }
  const pendingCents = key => (pending[key] = (pending[key] || []).filter(p => p.until > Date.now())).reduce((n, p) => n + p.cents, 0);
  const canShop = conn => !!stripe && !!conn.key && (SHOP_FOR_EVERYONE || !!game.whoIs(conn)?.admin);

  async function sendAccount(conn) {
    if (!conn.key) return;
    const acc = accounts[conn.key];
    const shop = canShop(conn);
    const info = { type: 'account', shop, testMode };
    if (shop && acc) {
      const parent = acc.parent;
      info.hasParent = !!parent;
      if (parent) {
        info.parentEmail = maskEmail(parent.email);
        info.limitUsd = parent.limitUsd;
        info.spentUsd = ((await store.monthSpend(conn.key)) + pendingCents(conn.key)) / 100;
      }
      info.purchases = (await store.purchases(conn.key, 10)).map(p => ({ at: p.at, usd: p.cents / 100, shards: p.shards, refunded: p.refundedShards }));
      info.packs = SHARD_PACKS;
      info.maxLimitUsd = MAX_LIMIT_USD;
    }
    conn.send(info);
  }
  const tellKey = key => { for (const c of conns) if (c.key === key) sendAccount(c).catch(() => {}); };

  // ---------- 🔑 logging in ----------
  async function join(conn, msg, ip) {
    if (conn.joining || conn.key) return;
    const name = cleanName(msg.name);
    if (!name) return game.handle(conn, msg); // the game says "Please pick a name."
    const key = name.toLowerCase();
    const err = (text, extra = {}) => conn.send({ type: 'error', needPassword: true, text, ...extra });
    if (locked(key) || locked('ip:' + ip)) return err('Too many wrong passwords. Wait 10 minutes and try again.');
    conn.joining = true;
    try {
      const acc = accounts[key];
      const password = String(msg.password || '');
      let fresh = null;
      if (acc && acc.pw) {
        const tokenOk = msg.token && acc.tokens.includes(sha(String(msg.token)));
        if (!tokenOk && !(password && await checkSecret(password, acc.pw))) {
          if (password) { failed(key); failed('ip:' + ip); }
          return err(password ? 'Wrong password.' : 'Type your password.');
        }
      } else {
        if (password.length < MIN_PASSWORD) {
          return err(`Pick a password (at least ${MIN_PASSWORD} letters or numbers) so nobody else can use the name ${name}. Remember it!`, { newAccount: true });
        }
        // a new player, or one whose password an admin reset (they keep their parent settings)
        fresh = { ...(acc || { created: Date.now() }), pw: await hashSecret(password), tokens: [] };
      }
      // the password is right, so if this name is still playing somewhere (a refresh, another window) this login replaces it
      game.handle(conn, { ...msg, takeOver: true }); // the game checks everything else (admin code, park full)
      if (!conn.standId) return; // the game said no, and told the player why
      conn.key = key;
      conns.add(conn);
      const account = fresh || acc;
      const token = crypto.randomBytes(24).toString('hex');
      account.tokens = [sha(token), ...account.tokens].slice(0, 10);
      accounts[key] = account;
      await store.putAccount(key, account);
      conn.send({ type: 'loggedIn', key, token, newAccount: !!fresh });
      await sendAccount(conn);
    } finally {
      conn.joining = false;
    }
  }

  // ---------- 💎 Shard Shop messages ----------
  async function handle(conn, msg, ip) {
    if (msg.type === 'join') { await join(conn, msg, ip); return true; }
    const err = text => conn.send({ type: 'error', text });
    const me = game.whoIs(conn);

    if (msg.type === 'adminResetPassword') {
      // 👑 a player forgot their password: the next time they join they pick a new one
      if (!me?.admin) return true;
      const key = cleanName(msg.name).toLowerCase();
      if (!accounts[key]) return err(`${msg.name} doesn't have a password yet.`), true;
      if (game.whoIs([...conns].find(c => c.key === key) || {})) return err(`${msg.name} is playing right now. Reset it when they're offline.`), true;
      // with no password, the next time they join they pick a new one
      accounts[key] = { ...accounts[key], pw: null, tokens: [] };
      await store.putAccount(key, accounts[key]);
      conn.send({ type: 'admin', text: `🔑 ${msg.name}'s password was reset. They pick a new one next time they join.` });
      return true;
    }
    if (!['shopOpen', 'setParent', 'parentUpdate', 'buyShards'].includes(msg.type)) return false;
    if (!conn.key || !me) return true;
    const acc = accounts[conn.key];

    if (msg.type === 'shopOpen') { await sendAccount(conn); return true; }
    if (!canShop(conn)) return err('The Shard Shop isn\'t open yet.'), true;

    if (msg.type === 'setParent') {
      // the first time: a parent gives their email and picks a PIN
      if (acc.parent) return err('A parent is already set up. Use Parent settings to change it.'), true;
      const email = String(msg.email || '').trim().toLowerCase();
      const pin = String(msg.pin || '');
      if (!EMAIL_RE.test(email)) return err('Type the parent\'s email address.'), true;
      if (!/^\d{4,8}$/.test(pin)) return err('The parent PIN has to be 4 to 8 numbers.'), true;
      if (!msg.agree) return err('A parent has to tick the box first.'), true;
      acc.parent = { email, pin: await hashSecret(pin), limitUsd: MONTHLY_LIMIT_USD, since: Date.now() };
      await store.putAccount(conn.key, acc);
      conn.send({ type: 'shopNote', text: '👪 Parent set up! Receipts go to that email.' });
      await sendAccount(conn);
      return true;
    }

    if (msg.type === 'parentUpdate') {
      // change the monthly limit or the email: needs the parent PIN
      if (!acc.parent) return true;
      const id = 'pin:' + conn.key;
      if (locked(id)) return err('Too many wrong PINs. Wait 10 minutes.'), true;
      if (!await checkSecret(String(msg.pin || ''), acc.parent.pin)) { failed(id); return err('Wrong parent PIN.'), true; }
      if (msg.limitUsd !== undefined && msg.limitUsd !== '') {
        const limit = Math.floor(Number(msg.limitUsd));
        if (!(limit >= 0 && limit <= MAX_LIMIT_USD)) return err(`The monthly limit can be $0 to $${MAX_LIMIT_USD}.`), true;
        acc.parent.limitUsd = limit;
      }
      if (msg.email) {
        const email = String(msg.email).trim().toLowerCase();
        if (!EMAIL_RE.test(email)) return err('That email doesn\'t look right.'), true;
        acc.parent.email = email;
      }
      await store.putAccount(conn.key, acc);
      conn.send({ type: 'shopNote', text: `👪 Saved! Monthly limit: $${acc.parent.limitUsd}.` });
      await sendAccount(conn);
      return true;
    }

    if (msg.type === 'buyShards') {
      const pack = SHARD_PACKS.find(p => p.id === msg.pack);
      if (!pack) return true;
      if (!acc.parent) return err('A parent has to set up purchases first.'), true;
      const spent = await store.monthSpend(conn.key) + pendingCents(conn.key);
      if (spent + pack.usd * 100 > acc.parent.limitUsd * 100) {
        return err(`That's over the monthly limit ($${acc.parent.limitUsd}). A parent can change it in Parent settings.`), true;
      }
      try {
        const base = baseUrl();
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: pack.usd * 100,
            product_data: { name: `${pack.shards.toLocaleString('en-US')} Shards`, description: `Ice Cream Tycoon shards for ${me.name}` } } }],
          customer_email: acc.parent.email,
          client_reference_id: conn.key,
          metadata: { key: conn.key, pack: pack.id },
          payment_intent_data: { metadata: { key: conn.key, pack: pack.id } },
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // the checkout page works for 30 minutes
          success_url: `${base}/?paid=1`,
          cancel_url: `${base}/?cancelled=1`,
        });
        pending[conn.key] = [...(pending[conn.key] || []), { cents: pack.usd * 100, until: Date.now() + 31 * 60e3, session: session.id }];
        console.log(`[shop] ${conn.key} started a checkout for ${pack.id} (${session.id})`);
        conn.send({ type: 'checkout', url: session.url });
      } catch (e) {
        console.error('[shop] Stripe checkout failed:', e.message);
        err('The shop couldn\'t reach the payment company. Try again in a minute.');
      }
      return true;
    }
    return true;
  }

  function leave(conn) { conns.delete(conn); }

  // ---------- 🔔 Stripe tells us about payments and refunds ----------
  async function webhook(req, res) {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 1e6) { res.writeHead(413); return res.end(); } chunks.push(c); }
    const raw = Buffer.concat(chunks);
    let event;
    try {
      if (!stripe || !WEBHOOK_SECRET) throw new Error('payments are not set up');
      event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], WEBHOOK_SECRET);
    } catch (e) {
      console.error('[shop] webhook refused:', e.message);
      res.writeHead(400); return res.end('Bad signature');
    }
    try {
      const obj = event.data.object;
      if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && obj.payment_status === 'paid') {
        const key = obj.metadata && obj.metadata.key;
        const pack = SHARD_PACKS.find(p => p.id === (obj.metadata && obj.metadata.pack));
        pending[key] = (pending[key] || []).filter(p => p.session !== obj.id);
        if (!pack || obj.amount_total !== pack.usd * 100 || !accounts[key]) {
          console.error(`[shop] payment ${obj.id} doesn't match a pack or player; check it in Stripe`);
        } else if (await store.addPurchase({ session: obj.id, key, pack: pack.id, cents: obj.amount_total, shards: pack.shards, intent: obj.payment_intent })) {
          // only the first time Stripe tells us (it can send the same event twice)
          game.addShards(key, pack.shards);
          await persist();
          console.log(`[shop] ${key} bought ${pack.shards} shards ($${pack.usd}, ${obj.id})`);
          tellKey(key);
        }
      } else if (event.type === 'checkout.session.expired') {
        const key = obj.metadata && obj.metadata.key;
        if (key) { pending[key] = (pending[key] || []).filter(p => p.session !== obj.id); tellKey(key); }
      } else if (event.type === 'charge.refunded') {
        // a refund takes back the shards (part of a refund takes back part of them)
        const p = await store.purchaseByIntent(obj.payment_intent);
        if (p && obj.amount > 0) {
          const back = Math.min(p.shards, Math.round(p.shards * obj.amount_refunded / obj.amount));
          if (back > p.refundedShards) {
            game.addShards(p.key, -(back - p.refundedShards));
            await store.setRefundedShards(p.session, back);
            await persist();
            console.log(`[shop] refund: took back ${back - p.refundedShards} shards from ${p.key}`);
            tellKey(p.key);
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"received":true}');
    } catch (e) {
      // something went wrong on our side: Stripe will send the event again later
      console.error('[shop] webhook failed:', e);
      res.writeHead(500); res.end();
    }
  }

  return { handle, leave, webhook, enabled: !!stripe };
}

module.exports = { createShop };
