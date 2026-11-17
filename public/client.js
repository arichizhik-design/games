(() => {
  const { WEATHERS, GLASS_EVENT, CHRISTMAS_ADMINS_ONLY, RARITIES, FLAVORS, TOPPINGS, PETS, MAX_PETS, PET_MAX_LEVEL, petUpgradeCost, petBoostAt, LUCKY_BLOCKS, UPGRADES, upgradeCost, spaceCost, MUTATIONS,
    MUTATION_CHANCE, HOTBAR_SIZE, STORAGE_SIZE, AVATAR, SCOOP_SLOWEST, SCOOP_FASTEST, scoopSpeedup, spacesPerBuy,
    CYBER, CYBER_ADMINS_ONLY, CYBER_PASS, GLASS_ADMINS_ONLY, GLASS_PASS, SHARD_SCOOPS, SHARD_WEEKLY, MAX_STACK, PET_SELL, sellPrice, GAME_PASSES, ICE_CREAM_PRICES, shopCost } = window.GameData;
  const { SHOP, AVATAR_SHOP, PET_SHOP, SELL_SHOP, REACH, MAX_WORN, chestPos, tubPos } = window.Engine;
  const mutationById = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));
  const flavorById = Object.fromEntries(FLAVORS.map(f => [f.id, f]));
  const toppingById = Object.fromEntries(TOPPINGS.map(t => [t.id, t]));
  const itemById = { ...flavorById, ...toppingById }; // hotbar/Inventory things: ice cream tubs and toppings
  const petById = Object.fromEntries(PETS.map(p => [p.id, p]));
  // admin toppings are so big they show as x1,000 instead of +99900%
  const pct = n => n >= 99 ? `x${Math.round(n + 1).toLocaleString('en-US')}` : `+${Math.round(n * 100)}%`;
  // pets always show as +N%, so a bigger boost always looks bigger (the Kitsune's +10,000% beats +1,100%)
  const petPct = n => `+${Math.round(n * 100).toLocaleString('en-US')}%`;

  const canvas = document.getElementById('canvas');
  let ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  let ws = null;
  let myId = null;
  let world = { width: 1800, height: 1070 };
  let slots = [];
  let stands = [];
  const customers = new Map(); // id -> { ...server data, dx, dy (display position) }
  const others = new Map();    // stand id -> display position of other players' characters
  const floaters = [];
  const ambient = []; // falling sparkles during a mutation event
  const particles = [];
  let view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0 };
  let spaceBtn = null; // Extra Space button area (world coords) while it's showing
  let gameEvent = { id: null, ids: [], left: 0, next: 0 }; // mutation events going on now
  let parkWeathers = []; // ⛅ [{ id, left }]: the weather events going on now (several can play at once)
  const activeMuts = () => (gameEvent.ids || []).map(id => mutationById[id]).filter(Boolean);
  let shop = { stock: {}, left: 0 };

  // your character (moved here in the browser, then sent to the server)
  const player = { x: 0, y: 0, placed: false, facing: 1, moving: false };
  let walkTarget = null; // { x, y, reach, action } when walking somewhere you tapped
  const keys = new Set();
  let hand = -1;         // selected hotbar slot
  let openWindow = null; // 'shop' | 'inventory' | null
  let iAmAdmin = false;   // admins also see the admin-only ice creams in the Flavor guide
  // flavors shown in the Flavor guide, and flavors sold in the shop
  // ⚡ in the online game only admins can see the Cyber stuff for now (the server says so when you join)
  let seeCyber = !CYBER_ADMINS_ONLY;
  let seeGlass = !GLASS_ADMINS_ONLY; // 🔮 the Glass Event (online: admins only until it drops)
  let seeXmas = !CHRISTMAS_ADMINS_ONLY; // 🎄 the Christmas Event (online: admins only until it drops)
  const canSee = x => (seeCyber || (x.rarity !== 'cyber' && x.id !== 'cyber' && x.event !== 'cyber')) &&
    (seeGlass || (x.rarity !== 'glass' && x.id !== 'glass' && x.event !== 'glass')) &&
    (seeXmas || (x.rarity !== 'christmas' && x.id !== 'christmas' && x.event !== 'christmas'));
  const guideFlavors = () => FLAVORS.filter(f => (!f.adminOnly || iAmAdmin) && canSee(f));
  const shopFlavors = () => FLAVORS.filter(canSee); // admin ice creams only show up when an admin puts them in the shop

  // ---------- helpers ----------
  // huge amounts: Qa (quadrillion), Qi, Sx, Sp, Oc, No, Dc (decillion), then Ud, Dd, Td … Vg (vigintillion) … all the
  // way to Ce (centillion, a 1 with 303 zeros), the biggest money there is
  const BIG = (() => {
    const units = ['', 'U', 'D', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'];
    const tens = ['', 'd', 'vg', 'tg', 'qag', 'qig', 'sxg', 'spg', 'ocg', 'nog'], Tens = ['', 'Dc', 'Vg', 'Tg', 'Qag', 'Qig', 'Sxg', 'Spg', 'Ocg', 'Nog'];
    const out = [];
    for (let d = 4; d <= 100; d++) { // d = which "-illion": 4 = quadrillion (1e15), 10 = decillion (1e33), 100 = centillion
      const name = d === 100 ? 'Ce' : d < 10 ? units[d] : units[d % 10] ? units[d % 10] + tens[Math.floor(d / 10)] : Tens[d / 10];
      out.push([Number(`1e${3 * d + 3}`), name]);
    }
    return out.reverse();
  })();
  function fmt(n) {
    if (!isFinite(n)) return '$∞';
    for (const [v, s] of BIG) if (n >= v * 0.999995) return '$' + +(n / v).toFixed(2) + s;
    if (n >= 1e12 || n >= 1e9 && +(n / 1e9).toFixed(2) >= 1000) return '$' + +(n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + +(n / 1e9).toFixed(2) + 'B';
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

  const growText = sec => sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec}s`;

  // mutations shimmer through their colors
  function mutColor(m, time) {
    return m.colors[Math.floor(time * 5) % m.colors.length];
  }
  const mutGradient = m => `linear-gradient(90deg, ${m.colors.join(', ')}${m.colors.length < 2 ? ', ' + m.colors[0] : ''})`;

  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  const me = () => stands.find(s => s.id === myId);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const isSecretHidden = (f, s) => f.rarity === 'secret' && !(s && s.seen.includes(f.id));
  const heldItem = () => { const s = me(); return s && hand >= 0 ? s.hotbar[hand] : null; };

  // HTML icon of an ice cream cone for the hotbar, inventory and shop
  // ✨ every topping glows in its own neon color
  const NEON = { sprinkles: '#ff4fd8', gummies: '#ff8a00', syrup: '#ff5e3a', caramel: '#ffb300', whipped: '#7df9ff',
    cookies: '#c77dff', cherry: '#ff1744', waffle: '#ffd60a', goldflakes: '#ffe600', diamonddust: '#00f5ff',
    stardust: '#b388ff', planets: '#4d7cff', dragonfire: '#ff5e00', royalcrown: '#ffd43b', lightning: '#fff700', galaxydust: '#9d4dff' };
  const neonRgb = hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16)).join(', ');

  function iconHtml(flavorId) {
    if (toppingById[flavorId]) return `<div class="icon topping" style="--neon:${NEON[flavorId] || '#ff4fd8'}">${toppingById[flavorId].emoji}</div>`;
    const f = flavorById[flavorId];
    const fx = f.effect ? ` fx-${f.effect}` : '';
    return `<div class="icon${fx}"><div class="ball" style="background:${f.color}"></div><div class="cone"></div></div>`;
  }

  // ---------- joining ----------
  // (plain click/Enter handlers instead of a <form>: preview windows often block form submits)
  let joining = false;
  let adminCode = ''; // the secret admin code; saved on this device once it's right
  const ADMIN_NAMES = ['coolkid', 'james']; // admins who need a secret admin code
  // each admin's code is saved on this device under their own name
  const typedName = () => $('nameInput').value.trim().toLowerCase();
  const codeKey = () => 'icecream-admin-code:' + typedName();
  const savedCode = () => { try { return localStorage.getItem(codeKey()) || ''; } catch (e) { return ''; } };

  // show the admin code box when someone types the admin name on a device that doesn't know the code yet
  function updateCodeBox() {
    const isAdmin = ADMIN_NAMES.includes(typedName());
    $('adminCodeRow').classList.toggle('hidden', !isAdmin || !!savedCode());
  }
  $('nameInput').addEventListener('input', updateCodeBox);

  // your progress backup from the server, kept on this device (it brings your progress back after an update)
  const nameKey = name => name.replace(/[^\w \-]/g, '').trim().slice(0, 16).toLowerCase();
  function loadBackup(name) {
    try { return JSON.parse(localStorage.getItem('icecream-backup:' + nameKey(name))) || null; } catch (e) { return null; }
  }

  // 🔑 a device that logged in once remembers it (a "remember me" token, not the password)
  const tokenKey = name => 'icecream-token:' + nameKey(name);
  const savedToken = name => { try { return localStorage.getItem(tokenKey(name)) || ''; } catch (e) { return ''; } };
  function updatePasswordBox() {
    if (window.SOLO) return;
    const remembered = !!savedToken($('nameInput').value);
    $('passwordInput').placeholder = remembered ? 'Password (remembered on this device)' : 'Password';
  }
  $('nameInput').addEventListener('input', updatePasswordBox);

  function join() {
    const name = $('nameInput').value.trim();
    if (!name) { $('joinError').textContent = 'Type your name first!'; return; }
    if (joining) return;
    joining = true;
    adminCode = $('adminCodeInput').value.trim() || savedCode();
    try { localStorage.setItem('icecream-name', name); } catch (e) {}
    connect(name);
  }
  $('passwordInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); join(); } });
  $('adminCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); join(); } });
  $('joinBtn').addEventListener('click', join);
  $('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); join(); } });
  try { $('nameInput').value = localStorage.getItem('icecream-name') || ''; } catch (e) {}
  updateCodeBox();
  if (window.SOLO) {
    document.querySelector('.hint').textContent =
      'Single-player version: your progress is saved in this browser.';
    $('passwordRow').classList.add('hidden');
    document.querySelector('.policyLink').classList.add('hidden');
  }
  updatePasswordBox();
  // back from Stripe's payment page: join again right away if this device is remembered
  const backFromStripe = new URLSearchParams(location.search);
  const stripeReturn = backFromStripe.has('paid') ? 'paid' : backFromStripe.has('cancelled') ? 'cancelled' : null;
  if (stripeReturn || backFromStripe.has('rejoin')) {
    history.replaceState(null, '', location.pathname);
    if (!window.SOLO && $('nameInput').value && savedToken($('nameInput').value)) setTimeout(join, 50);
  }

  // a random id saved on this device, so admin names stay locked to the device that first used them
  function deviceId() {
    try {
      let d = localStorage.getItem('icecream-device');
      if (!d) {
        d = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('icecream-device', d);
      }
      return d;
    } catch (e) { return ''; }
  }

  function connect(name) {
    $('joinError').textContent = '';
    if (window.SOLO) return startSolo(name);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    const password = $('passwordInput').value;
    ws.onopen = () => send({ type: 'join', name, device: deviceId(), adminCode, backup: loadBackup(name),
      password, token: password ? '' : savedToken(name) });
    ws.onmessage = e => {
      try { onMessage(JSON.parse(e.data)); } catch (err) { console.error('Message problem (the game keeps going):', err); }
    };
    ws.onclose = () => {
      if (myId) reconnect();
      else {
        joining = false;
        if (!$('joinError').textContent) $('joinError').textContent = 'Could not connect to the server.';
      }
    };
  }

  // the server restarted (an update) or the internet blinked: wait until the server is back, then
  // reload the page (so everyone gets the newest version) and join again by themselves
  function reconnect() {
    $('reconnecting').classList.remove('hidden');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const tryNow = () => {
      const test = new WebSocket(`${proto}://${location.host}`);
      test.onopen = () => { test.close(); location.href = location.pathname + '?rejoin=1'; };
      test.onerror = () => setTimeout(tryNow, 2000);
    };
    setTimeout(tryNow, 1500);
  }

  // Single-file version: run the game engine right here in the browser, saving to this device
  function startSolo(name) {
    const SAVE_KEY = 'icecream-solo-saves';
    let saves = {};
    try { saves = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) {}
    const game = window.Engine.createGame({ saves });
    const conn = { send: msg => onMessage(JSON.parse(JSON.stringify(msg))) };
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
    send({ type: 'join', name, device: deviceId(), adminCode });
  }

  function onMessage(msg) {
    const s = me();
    switch (msg.type) {
      case 'welcome':
        myId = msg.id;
        world = msg.world;
        slots = msg.slots;
        $('join').classList.add('hidden');
        $('game').classList.remove('hidden');
        iAmAdmin = !!msg.admin;
        seeCyber = msg.cyber !== false;
        seeGlass = msg.glass !== false;
        seeXmas = msg.christmas !== false;
        buildStore();
        buildPanel();
        buildHotbar();
        $('testTools').classList.toggle('hidden', !msg.admin); // test buttons are for admins only
        $('adminPanel').classList.toggle('hidden', !msg.admin);
        // remember the admin code on this device, so next time just the name is enough
        if (msg.admin && adminCode) { try { localStorage.setItem(codeKey(), adminCode); } catch (e) {} }
        resize();
        if (!tourDone()) startTour(); // everyone new on this device goes through the tour first
        else if (!msg.returning && !tutorialDone()) startTutorial();
        else if (msg.admin) toast('👑 Admin mode! You have $1T and admin commands.');
        if (tour.on) { /* the tour explains everything */ }
        else if (msg.restored) toast('Welcome back! The game was updated, and your progress came back with you.');
        else if (msg.returning || tutorialDone()) toast(msg.returning ? 'Welcome back! Your stand is open again.'
          : 'Welcome! Walk with the arrow keys or tap where you want to go.');
        break;
      case 'error':
        if (myId) toast(msg.text);
        else {
          $('joinError').textContent = msg.text;
          joining = false;
          if (msg.needPassword) {
            // the remembered login didn't work (or there isn't one): ask for the password
            try { localStorage.removeItem(tokenKey($('nameInput').value)); } catch (e) {}
            updatePasswordBox();
            $('passwordInput').value = '';
            $('passwordInput').placeholder = msg.newAccount ? 'Pick a password' : 'Password';
            $('passwordInput').focus();
          }
          if (msg.needCode) {
            // the saved code didn't work (or there isn't one): ask for it
            try { localStorage.removeItem(codeKey()); } catch (e) {}
            $('adminCodeRow').classList.remove('hidden');
            $('adminCodeInput').value = '';
            $('adminCodeInput').focus();
          }
        }
        break;
      case 'backup':
        try { localStorage.setItem('icecream-backup:' + msg.key, JSON.stringify(msg.blob)); } catch (e) {}
        break;
      case 'admin':
        toast('👑 ' + msg.text);
        break;
      case 'announce':
        showAnnouncement(msg.from, msg.text);
        break;
      case 'players':
        if (openWindow === 'ban') showPlayers(msg.players);
        break;
      case 'chat':
        addChat(msg);
        break;
      case 'gift':
        toast(`🎁 ${msg.from} gave you ${describe(msg.bundle)}!`);
        confetti(player.x, player.y - 30, 30);
        break;
      case 'giftSent':
        toast(`🎁 You gave ${msg.to} ${describe(msg.bundle)}!`);
        giftRefresh = true; // redraw the gift window once the new counts arrive
        break;
      case 'tradeOffer':
        showTradeOffer(msg);
        break;
      case 'tradeSent':
        toast(`📨 Offer sent to ${msg.to}! Waiting for them to answer…`);
        break;
      case 'tradeDone':
        toast(msg.text);
        if (msg.ok) { confetti(player.x, player.y - 30, 30); giftRefresh = true; }
        break;
      case 'passPrize':
        toast('⚡ Prize claimed!');
        confetti(player.x, player.y - 30, 30);
        break;
      case 'gamePassDone': {
        const gp = GAME_PASSES.find(g => g.id === msg.id);
        toast(msg.id === 'icecream' ? `🍦 You got a ${flavorById[msg.flavor].name}!`
          : msg.id === 'premium' ? '⚡ Premium Cyber Pass unlocked! Open the Pass to claim the better prizes.'
          : `${gp.emoji} ${gp.name} done!`);
        if (openWindow === 'store') updateStore();
        confetti(player.x, player.y - 30, 25);
        break;
      }
      case 'petGot':
        revealPet(msg);
        break;
      case 'loggedIn':
        try { localStorage.setItem(tokenKey(msg.key), msg.token); } catch (e) {}
        $('passwordInput').value = '';
        if (msg.newAccount) toast('🔑 Your password is set. Remember it! This device will remember you.');
        if (stripeReturn === 'paid') toast('💎 Thank you! Your shards show up as soon as the payment goes through.');
        if (stripeReturn === 'cancelled') toast('Purchase cancelled. Nothing was charged.');
        break;
      case 'account':
        account = msg;
        $('shardShopBtn').classList.toggle('hidden', !msg.shop);
        if (openWindow === 'shardshop') renderShardShop();
        break;
      case 'checkout':
        toast('Going to the secure payment page…');
        location.href = msg.url;
        break;
      case 'shopNote':
        toast(msg.text);
        break;
      case 'shardsChanged':
        toast(msg.amount > 0 ? `💎 +${msg.amount.toLocaleString()} shards! Thank you!` : `💎 ${(-msg.amount).toLocaleString()} shards were taken back (refund).`);
        if (msg.amount > 0) confetti(player.x, player.y - 30, 40);
        break;
      case 'adminSpawned': {
        // 👑 whatever an admin spawns pops up on everyone's screen
        const thing = msg.pet ? petById[msg.pet] : itemById[msg.item];
        if (!thing) break;
        const where = msg.where === 'block' ? ' from a lucky block' : msg.where === 'stand' ? ' on their stand' : '';
        const el = $('spawnPop');
        el.querySelector('.spIcon').innerHTML = msg.pet ? petIcon(thing) : iconHtml(thing.id);
        el.querySelector('.spText').textContent = `👑 ${msg.by} spawned ${msg.count > 1 ? msg.count + ' ' : ''}${thing.name}${where}!`;
        el.classList.remove('hidden');
        el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
        clearTimeout(el.t);
        el.t = setTimeout(() => el.classList.add('hidden'), 4500);
        break;
      }
      case 'kicked':
        // this name logged in somewhere else (another window or device), so this one stops
        myId = null;
        $('joinError').textContent = 'You joined with this name in another window or device, so this one stopped.';
        $('game').classList.add('hidden');
        $('join').classList.remove('hidden');
        joining = false;
        if (ws) ws.close();
        break;
      case 'refresh':
        // 🔄 an admin refreshed everyone: reload and join again right away
        toast(`🔄 ${msg.by} is refreshing the game for everyone…`);
        setTimeout(() => { location.href = location.pathname + (window.SOLO ? '' : '?rejoin=1'); }, 1500);
        break;
      case 'shardsGift':
        toast(`🎁 ${msg.from} gave you 💎 ${msg.amount.toLocaleString()} shards!`);
        confetti(player.x, player.y - 30, 30);
        break;
      case 'sold': {
        const thing = msg.kind === 'pet' ? petById[msg.id] : itemById[msg.id];
        toast(`💰 Sold ${msg.count} ${thing.name} for ${fmt(msg.money)}!`);
        confetti(player.x, player.y - 30, 12);
        break;
      }
      case 'petUpgraded': {
        const p = petById[msg.pet];
        toast(`⬆️ ${p.name} is now level ${msg.level}! It gives ${petPct(petBoostAt(p, msg.level))} money.`);
        confetti(player.x, player.y - 30, 16);
        break;
      }
      case 'petReleased':
        toast(`👋 You let go of your ${petById[msg.pet].name}.`);
        break;
      case 'blockGot':
        revealItem(msg);
        break;
      case 'boughtTopping': {
        const t = toppingById[msg.topping];
        toast(`You bought ${msg.count} ${t.name}! Hold it and tap an ice cream on your stand.`);
        break;
      }
      case 'banned':
        closeWindows();
        hand = -1;
        $('bannedText').textContent = (msg.self ? 'You banned yourself.' : `${msg.by} (admin) banned you.`) +
          ' You lost everything and have to start over from the beginning.';
        $('bannedModal').classList.remove('hidden');
        break;
      case 'weatherStart': {
        const w = WEATHERS[msg.id];
        toast(msg.by ? `${w.emoji} ${w.name}! ${msg.by} started a weather event.` : `${w.emoji} ${w.name}! A weather event is passing over the park.`);
        break;
      }
      case 'state':
        stands = msg.stands;
        gameEvent = msg.event;
        parkWeathers = msg.weathers || [];
        shop = msg.shop;
        if (msg.cyber) cyberState = msg.cyber;
        if (msg.glass) glassState = msg.glass;
        if (msg.christmas) xmasState = msg.christmas;
        if (CYBER) updateCyber();
        if (!player.placed && me()) {
          player.x = me().x; player.y = me().y; player.placed = true;
        }
        syncCustomers(msg.customers);
        updatePanel();
        updateHotbar();
        if (openWindow === 'shop') { updateShop(); updateToppings(); }
        if (openWindow === 'petshop') updatePetShop();
        if (openWindow === 'sell') updateSell();
        if (openWindow === 'pets') updatePets();
        if (openWindow === 'petup') updatePetUp();
        if (openWindow === 'inventory') updateInventory();
        if (openWindow === 'gift' && giftRefresh && giftTo !== null) { giftRefresh = false; showGiftItems(); }
        break;
      case 'sale':
        onSale(msg);
        break;
      case 'bought': {
        const f = flavorById[msg.flavor];
        toast(`You bought ${f.name}! Hold it and place it on your stand.`);
        tut.bought = true;
        break;
      }
      case 'placed': {
        const f = flavorById[msg.flavor];
        if (msg.topping) {
          const t = toppingById[msg.topping];
          toast(`${t.emoji} ${t.name} on ${f.name}! Its scoops now sell for ${pct(t.bonus)}${t.bonus >= 99 ? '' : ' more'}.`);
          if (s) confetti(slots[s.slot].x, slots[s.slot].y, 12);
          break;
        }
        toast(`${f.name} is growing! Ready in ${growText(RARITIES[f.rarity].growSec)}.`);
        tut.placed = true;
        if (s) confetti(slots[s.slot].x, slots[s.slot].y, 12);
        break;
      }
      case 'restock':
        toast('🛒 The Supplies Shop has new ice cream stock!');
        break;
      case 'mutationStart': {
        const m = mutationById[msg.mutation];
        toast(m.id === 'rainbow'
          ? `🌈 A RAINBOW appeared! Scoops can turn Rainbow (x${m.mult} money)!`
          : `${m.emoji} ${m.name} mutation has started! Scoops can turn ${m.name} (x${m.mult} money)!`);
        for (const sl of slots) confetti(sl.x, sl.y - 40, 12);
        break;
      }
      case 'mutationEnd':
        toast(`The ${mutationById[msg.mutation].name} mutation is over.`);
        break;
      case 'spaceAdded':
        toast(`+${msg.added || 3} flavor space${msg.added === 1 ? '' : 's'}! Your stand now holds ${msg.spaces} tubs.` +
          (spaceCost(msg.spaces, seeCyber) === null ? ' That\'s the most!' : ''));
        if (s) confetti(slots[s.slot].x, slots[s.slot].y - 40, 40);
        break;
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
    const muts = (msg.mutations || (msg.mutation ? [msg.mutation] : [])).map(id => mutationById[id]);
    muts.forEach((m, k) => {
      floaters.push({ x: slot.x, y: slot.y - (msg.golden ? 60 : 36) - k * 22, text: `${m.emoji} ${m.name.toUpperCase()} x${m.mult}!`,
        mutation: m, size: 19, t: 0 });
    });
    if (muts.length > 1) {
      const total = muts.reduce((p, m) => p * m.mult, 1);
      floaters.push({ x: slot.x, y: slot.y - (msg.golden ? 60 : 36) - muts.length * 22, text: `COMBO x${total.toLocaleString()}!`,
        color: '#ff2e7e', size: 21, t: 0 });
    }
    if (muts.length && msg.standId === myId) confetti(slot.x, slot.y - 40, 20 * muts.length);
    if (msg.standId === myId && rarity.order >= 4) confetti(slot.x, slot.y - 40, 25);
  }

  // All Server Talk: a big message from an admin at the top of everyone's screen
  let announceTimer = null;
  function showAnnouncement(from, text) {
    const el = $('announce');
    el.querySelector('.annFrom').textContent = `📢 ${from} (admin) says:`;
    el.querySelector('.annText').textContent = text;
    el.classList.add('hidden');
    void el.offsetWidth; // restart the pop animation
    el.classList.remove('hidden');
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => el.classList.add('hidden'), 4000 + text.length * 60);
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
    makeRoboArt();
    const fl = $('flavors');
    fl.innerHTML = '';
    for (const f of guideFlavors()) {
      const r = RARITIES[f.rarity];
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="scoop"></div>
        <div class="info">
          <div class="name"></div>
          <div class="meta"><span class="badge ${f.rarity}" style="background-color:${r.color}">${r.name}</span>
            ${fmt(f.price)} / scoop · grows in ${growText(r.growSec)} · <b class="speedTag">⏱️ -${scoopSpeedup(f)}s</b></div>
        </div>`;
      fl.appendChild(row);
      f.row = row;
    }

    const mu = $('mutations');
    mu.innerHTML = '';
    for (const m of MUTATIONS.filter(canSee)) {
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

    // shop window rows
    const list = $('shopList');
    list.innerHTML = '';
    for (const f of shopFlavors()) {
      const r = RARITIES[f.rarity];
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="iconWrap"></div>
        <div class="info">
          <div class="name"></div>
          <div class="meta"><span class="badge ${f.rarity}" style="background-color:${r.color}">${r.name}</span>
            ${fmt(f.price)} / scoop · grows in ${growText(r.growSec)} · <b class="speedTag">⏱️ -${scoopSpeedup(f)}s</b></div>
          <div class="stock"></div>
        </div>
        <button>${fmt(shopCost(f))}</button>`;
      row.querySelector('button').addEventListener('click', () => send({ type: 'buy', flavor: f.id }));
      list.appendChild(row);
      f.shopRow = row;
    }

    // inventory window slots
    const grid = $('invGrid');
    grid.innerHTML = '';
    for (let i = 0; i < STORAGE_SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'slot';
      cell.addEventListener('click', () => send({ type: 'moveItem', from: 'storage', index: i }));
      grid.appendChild(cell);
    }
  }

  function updatePanel() {
    const s = me();
    if (!s) return;
    $('money').textContent = fmt(s.money);
    const filled = s.tubs.filter(Boolean).length;
    $('stats').textContent = `${s.sold} scoops sold · ${fmt(s.totalEarned)} earned · ` +
      `${filled}/${s.spaces} stand spaces used`;
    $('serveBar').style.width = Math.min(100, s.serve * 100) + '%';
    const info = $('scoopInfo');
    if (s.scoopEvery) {
      info.className = 'ok';
      info.textContent = `⏱️ You sell 1 scoop every ${s.scoopEvery} second${s.scoopEvery === 1 ? '' : 's'}` +
        (s.scoopEvery === SCOOP_FASTEST ? ' (the fastest!)' : '');
    } else {
      info.className = 'none';
      info.textContent = s.tubs.some(Boolean) ? '🌱 Your ice cream is still growing. Sales start when it\'s ready!'
        : '🛒 No ice cream on your stand, so no sales! Buy some at the Supplies Shop.';
    }
    $('shopTimerSide').textContent = `🛒 Shop restocks in ${clock(shop.left)}`;

    for (const f of guideFlavors()) {
      const hidden = isSecretHidden(f, s);
      f.row.querySelector('.name').textContent = hidden ? '???' : f.name;
      const dot = f.row.querySelector('.scoop');
      dot.style.background = hidden ? '#222' : f.color;
      dot.className = 'scoop' + (!hidden && f.effect ? ` fx-${f.effect}` : '');
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
    const evs = activeMuts();
    const ev = evs[0];
    box.classList.toggle('active', !!ev);
    // light-colored mutations get dark text so it stays readable
    const light = evs.length === 1 && ['diamond', 'gold', 'sakura', 'cyber', 'glass', 'cereal', 'frostbite', 'aura', 'tornado', 'prismatic'].includes(ev.id);
    box.style.color = light ? '#5a4300' : '';
    box.style.textShadow = light ? '0 1px 2px rgba(255,255,255,0.8)' : '';
    if (evs.length > 1) {
      box.style.background = `linear-gradient(90deg, ${evs.map(m => m.colors[0]).join(', ')})`;
      box.innerHTML = `<div class="big">${evs.map(m => m.emoji).join(' ')} ${evs.length} MUTATIONS!</div>
        ${evs.map(m => `${m.name} x${m.mult}`).join(' · ')}<br>Each one has a ${Math.round(MUTATION_CHANCE * 100)}% chance, and they stack! · ${clock(gameEvent.left)} left`;
    } else if (ev) {
      box.style.background = mutGradient(ev);
      box.innerHTML = `<div class="big">${ev.emoji} ${ev.name.toUpperCase()} MUTATION!</div>
        ${Math.round(MUTATION_CHANCE * 100)}% of scoops turn ${ev.name} (x${ev.mult}) · ${clock(gameEvent.left)} left`;
    } else {
      box.style.background = '';
      box.textContent = `Next mutation in ${clock(gameEvent.next)}`;
    }
    for (const m of MUTATIONS.filter(canSee)) {
      const n = s.mutations[m.id] || 0;
      m.row.querySelector('.count').textContent = n ? `${n} sold` : 'not yet';
      m.row.classList.toggle('active-mut', (gameEvent.ids || []).includes(m.id));
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

  // ---------- hotbar (10 see-through slots at the bottom) ----------
  function buildHotbar() {
    const bar = $('hotbar');
    bar.innerHTML = '';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'slot';
      cell.innerHTML = `<span class="key">${(i + 1) % 10}</span><div class="content"></div>`;
      cell.addEventListener('click', () => {
        if (openWindow === 'inventory') send({ type: 'moveItem', from: 'hotbar', index: i });
        else selectHand(hand === i ? -1 : i);
      });
      bar.appendChild(cell);
    }
  }

  function selectHand(i) {
    hand = i;
    send({ type: 'hold', slot: i });
    updateHotbar();
    const item = heldItem();
    if (item && toppingById[item.flavor]) toast(`Holding ${itemById[item.flavor].name}. Tap an ice cream on your stand to put it on top.`);
    else if (item) toast(`Holding ${itemById[item.flavor].name}. Tap a dashed space on your stand to place it.`);
  }

  function slotHtml(item) {
    return item ? `${iconHtml(item.flavor)}${item.count > 1 ? `<span class="count">${item.count}</span>` : ''}` : '';
  }

  function updateHotbar() {
    const s = me();
    if (!s) return;
    [...$('hotbar').children].forEach((cell, i) => {
      const item = s.hotbar[i];
      const html = slotHtml(item);
      const content = cell.querySelector('.content');
      if (content.innerHTML !== html) content.innerHTML = html;
      cell.classList.toggle('selected', i === hand && !!item);
      cell.title = item ? itemById[item.flavor].name : '';
    });
    $('handLabel').textContent = heldItem() ? `In hand: ${itemById[heldItem().flavor].name}` : '';
  }

  // ---------- shop and inventory windows ----------
  function openShop() {
    closeWindows();
    openWindow = 'shop';
    $('shopModal').classList.remove('hidden');
    updateShop();
    updateToppings();
  }

  function openInventory() {
    closeWindows();
    openWindow = 'inventory';
    $('invModal').classList.remove('hidden');
    updateInventory();
  }

  function closeWindows() {
    openWindow = null;
    $('shopModal').classList.add('hidden');
    $('invModal').classList.add('hidden');
    $('avatarModal').classList.add('hidden');
    $('banModal').classList.add('hidden');
    $('giftModal').classList.add('hidden');
    $('petShopModal').classList.add('hidden');
    $('sellModal').classList.add('hidden');
    $('shardShopModal').classList.add('hidden');
    $('petsModal').classList.add('hidden');
    $('petUpModal').classList.add('hidden');
    $('adminPetsModal').classList.add('hidden');
    $('passModal').classList.add('hidden');
    $('growModal').classList.add('hidden');
    $('giftShardsModal').classList.add('hidden');
    $('storeModal').classList.add('hidden');
  }

  // ---------- Ban Players (admins) ----------
  let banSure = null; // the player whose Ban button was pressed once ("Sure?")

  function openBan() {
    closeWindows();
    openWindow = 'ban';
    banSure = null;
    $('banList').innerHTML = '<div class="sub">Loading players…</div>';
    $('banModal').classList.remove('hidden');
    send({ type: 'adminPlayers' });
  }

  function showPlayers(players) {
    const list = $('banList');
    list.innerHTML = '';
    if (!players.length) list.innerHTML = '<div class="sub">No players yet.</div>';
    for (const pl of players) {
      const row = document.createElement('div');
      row.className = 'row';
      const who = document.createElement('div');
      who.className = 'who';
      who.innerHTML = `<div class="name"></div><div class="status">${pl.online ? '🟢 Playing now' : '⚪ Away'} · ${fmt(pl.money)}</div>`;
      const mine = me();
      who.querySelector('.name').textContent = pl.name + (mine && mine.name.toLowerCase() === pl.key ? ' (you)' : '');
      row.appendChild(who);
      if (pl.admin) row.insertAdjacentHTML('beforeend', '<span class="adminTag">👑 Admin</span>');
      {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = banSure === pl.key ? 'Sure? Ban!' : 'Ban';
        b.classList.toggle('sure', banSure === pl.key);
        // tap once to get "Sure?", tap again to ban
        b.addEventListener('click', () => {
          if (banSure === pl.key) { banSure = null; send({ type: 'adminBan', key: pl.key }); }
          else { banSure = pl.key; showPlayers(players); }
        });
        row.appendChild(b);
      }
      list.appendChild(row);
    }
  }
  $('banBtn').addEventListener('click', openBan);
  $('banClose').addEventListener('click', closeWindows);
  $('bannedOk').addEventListener('click', () => $('bannedModal').classList.add('hidden'));

  // ---------- 🎁 Gift & 🤝 Trade: give or swap money, ice cream, toppings and pets ----------
  let giftTo = null;     // the stand id of the player you picked
  let giftMode = 'gift'; // 'gift' or 'trade'
  let giftRefresh = false;
  let tradeOffer = null; // a trade someone offered you, waiting for your answer

  // "5k", "2.5m", "1b", "3t" or "1,000,000" -> a number
  // the money names you can type: k, m, b, t, q (and qa), qi, sx … dc, ud … ce
  const MONEY_WORDS = { '': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12, q: 1e15, ...Object.fromEntries(BIG.map(([v, s]) => [s.toLowerCase(), v])) };
  function parseMoney(text) {
    const m = String(text || '').replace(/[,$\s]/g, '').toLowerCase().match(/^(\d*\.?\d+)([a-z]*)$/);
    if (!m || !(m[2] in MONEY_WORDS)) return 0;
    return Math.floor(Number(m[1]) * MONEY_WORDS[m[2]]);
  }

  // what someone has: { items: { id: count }, pets: { id: count } }
  function stuffOf(st) {
    const items = {}, pets = {};
    for (const it of [...st.hotbar, ...st.storage]) if (it) items[it.flavor] = (items[it.flavor] || 0) + it.count;
    for (const id of st.pets || []) pets[id] = (pets[id] || 0) + 1;
    return { items, pets };
  }

  const itemName = id => itemById[id].name;
  function describe(b) {
    const parts = [];
    if (b.money) parts.push(fmt(b.money));
    for (const [id, n] of Object.entries(b.items || {})) parts.push(`${n} ${itemName(id)}`);
    for (const [id, n] of Object.entries(b.pets || {})) parts.push(`${n} ${petById[id].emoji} ${petById[id].name}`);
    return parts.join(', ') || 'nothing';
  }

  function openGift() {
    closeWindows();
    openWindow = 'gift';
    $('giftModal').classList.remove('hidden');
    showGiftPlayers();
  }

  function showGiftPlayers() {
    giftTo = null;
    $('giftSub').textContent = 'Who do you want to gift or trade with?';
    const body = $('giftBody');
    body.innerHTML = '';
    const others = stands.filter(st => st.id !== myId);
    if (!others.length) body.innerHTML = '<div class="sub">No one else is playing right now. Invite a friend!</div>';
    for (const st of others) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="who"><div class="name"></div><div class="meta">🟢 Playing now</div></div>
        <button type="button">Pick</button>`;
      row.querySelector('.name').textContent = (st.admin ? '👑 ' : '') + st.name;
      row.querySelector('button').addEventListener('click', () => { giftTo = st.id; showGiftItems(); });
      body.appendChild(row);
    }
  }

  // a list of number boxes for everything someone has; returns a function that reads the picked bundle
  function buildPicker(parent, owner, emptyText) {
    const { items, pets } = stuffOf(owner);
    const rows = [];
    const addRow = (html, max, read) => {
      const row = document.createElement('div');
      row.className = 'row pickRow';
      row.innerHTML = html + `<input type="number" min="0" max="${max}" value="0"><button type="button" class="maxBtn">All</button>`;
      const input = row.querySelector('input');
      row.querySelector('.maxBtn').addEventListener('click', () => { input.value = max; });
      parent.appendChild(row);
      rows.push({ input, max, read });
      return row;
    };

    // money: type any amount, like 500, 25k, 3m or 1t
    const moneyRow = document.createElement('div');
    moneyRow.className = 'row pickRow';
    moneyRow.innerHTML = `<div class="petEmoji">💵</div><div class="info"><div class="name">Money</div>
      <div class="meta">Has ${fmt(owner.money)} · type 500, 25k, 3m, 1b or 1t</div></div>
      <input type="text" placeholder="0" inputmode="decimal"><button type="button" class="maxBtn">All</button>`;
    const moneyInput = moneyRow.querySelector('input');
    moneyRow.querySelector('.maxBtn').addEventListener('click', () => { moneyInput.value = Math.floor(owner.money); });
    parent.appendChild(moneyRow);

    const ids = [...FLAVORS, ...TOPPINGS].map(f => f.id).filter(id => items[id]);
    for (const id of ids) {
      const f = itemById[id];
      const r = RARITIES[f.rarity];
      const badge = r ? `<span class="badge ${f.rarity}" style="background-color:${r.color}">${r.name}</span>`
        : `<span class="bonus">${pct(f.bonus)} topping</span>`;
      const row = addRow(`<div class="iconWrap">${iconHtml(id)}</div>
        <div class="info"><div class="name"></div><div class="meta">${badge} Has ${items[id]}</div></div>`, items[id], n => ['items', id, n]);
      row.querySelector('.name').textContent = f.name;
    }
    const petIds = PETS.map(p => p.id).filter(id => pets[id]).reverse();
    for (const id of petIds) {
      const p = petById[id];
      const r = RARITIES[p.rarity];
      addRow(`<div class="petEmoji">${petIcon(p)}</div><div class="info"><div class="name">${p.name}</div>
        <div class="meta"><span class="badge ${p.rarity}" style="background-color:${r.color}">${r.name}</span>
        Pet · Has ${pets[id]}${(owner.worn || []).includes(id) ? ' · wearing it' : ''}</div></div>`, pets[id], n => ['pets', id, n]);
    }
    if (!ids.length && !petIds.length) parent.insertAdjacentHTML('beforeend', `<div class="sub">${emptyText}</div>`);

    return () => {
      const b = { money: Math.min(parseMoney(moneyInput.value), Math.floor(owner.money)), items: {}, pets: {} };
      for (const r of rows) {
        const n = Math.min(r.max, Math.max(0, Math.floor(Number(r.input.value) || 0)));
        if (n > 0) { const [kind, id] = r.read(n); b[kind][id] = n; }
      }
      return b;
    };
  }

  const bundleEmpty = b => !b.money && !Object.keys(b.items).length && !Object.keys(b.pets).length;

  function showGiftItems() {
    const target = stands.find(st => st.id === giftTo);
    const mine = me();
    if (!target || !mine) return showGiftPlayers();
    const body = $('giftBody');
    body.innerHTML = '';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'backBtn';
    back.textContent = '← Pick someone else';
    back.addEventListener('click', showGiftPlayers);
    body.appendChild(back);

    const tabs = document.createElement('div');
    tabs.className = 'giftTabs';
    tabs.innerHTML = `<button type="button" data-mode="gift">🎁 Gift</button><button type="button" data-mode="buy">💰 Buy</button>` +
      `<button type="button" data-mode="trade">🤝 Trade</button>`;
    tabs.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.mode === giftMode);
      b.addEventListener('click', () => { giftMode = b.dataset.mode; showGiftItems(); });
    });
    body.appendChild(tabs);

    if (giftMode === 'gift') {
      $('giftSub').textContent = `Pick how much of anything to give ${target.name}, then press Send.`;
      body.insertAdjacentHTML('beforeend', '<h3>🎁 Your stuff</h3>');
      const read = buildPicker(body, mine, "You don't have any ice cream, toppings or pets yet.");
      const sendBtn = document.createElement('button');
      sendBtn.type = 'button';
      sendBtn.className = 'sendBig';
      sendBtn.textContent = `🎁 Send gift to ${target.name}`;
      sendBtn.addEventListener('click', () => {
        const give = read();
        if (bundleEmpty(give)) return toast('Type how much to give first (or press All).');
        send({ type: 'gift', to: giftTo, give });
      });
      body.appendChild(sendBtn);
    } else if (giftMode === 'buy') {
      // 💰 buy their ice cream: pick how many and type your price; they say yes or no
      $('giftSub').textContent = `Buy ${target.name}'s ice cream! Pick how many, type how much money you'll pay, and they decide.`;
      body.insertAdjacentHTML('beforeend', `<h3>🍦 ${target.name.replace(/</g, '')}'s ice cream <span class="sub">(you have ${fmt(mine.money)})</span></h3>`);
      const { items } = stuffOf(target);
      const ids = FLAVORS.map(f => f.id).filter(id => items[id]);
      if (!ids.length) body.insertAdjacentHTML('beforeend', `<div class="sub">${target.name.replace(/</g, '')} doesn't have any ice cream in their hotbar or Inventory right now.</div>`);
      for (const id of ids) {
        const f = flavorById[id], r = RARITIES[f.rarity];
        const row = document.createElement('div');
        row.className = 'row buyRow';
        row.innerHTML = `<div class="iconWrap">${iconHtml(id)}</div>
          <div class="info"><div class="name"></div>
            <div class="meta"><span class="badge ${f.rarity}" style="background-color:${r.color}">${r.name}</span> They have ${items[id]}
              ${f.cost ? ` · shop price ${fmt(f.cost)}` : ''}</div></div>
          <div class="buyInputs"><label>How many <input class="buyCount" type="number" min="1" max="${items[id]}" value="1"></label>
            <label>Your price $ <input class="buyPrice" type="text" inputmode="decimal" placeholder="500, 25k, 1m"></label></div>
          <button type="button">💰 Offer</button>`;
        row.querySelector('.name').textContent = f.name;
        row.querySelector('button').addEventListener('click', () => {
          const count = Math.min(items[id], Math.max(1, Math.floor(Number(row.querySelector('.buyCount').value) || 1)));
          const price = parseMoney(row.querySelector('.buyPrice').value);
          if (price <= 0) return toast('Type how much money you want to pay.');
          if (price > mine.money) return toast("You don't have that much money!");
          send({ type: 'tradeOffer', kind: 'buy', to: giftTo, give: { money: price, items: {}, pets: {} },
            get: { money: 0, items: { [id]: count }, pets: {} } });
        });
        body.appendChild(row);
      }
    } else {
      $('giftSub').textContent = `Pick what you give and what you want back. ${target.name} has to say yes!`;
      body.insertAdjacentHTML('beforeend', '<h3>📤 You give</h3>');
      const readGive = buildPicker(body, mine, "You don't have any ice cream, toppings or pets yet.");
      const theirs = document.createElement('div');
      theirs.className = 'theirs';
      theirs.insertAdjacentHTML('beforeend', `<h3>📥 You want from ${target.name.replace(/</g, '')}</h3>`);
      body.appendChild(theirs);
      const readGet = buildPicker(theirs, target, `${target.name} doesn't have any ice cream, toppings or pets yet.`);
      const sendBtn = document.createElement('button');
      sendBtn.type = 'button';
      sendBtn.className = 'sendBig';
      sendBtn.textContent = `🤝 Send trade offer to ${target.name}`;
      sendBtn.addEventListener('click', () => {
        const give = readGive(), get = readGet();
        if (bundleEmpty(give) && bundleEmpty(get)) return toast('Pick what to trade first.');
        send({ type: 'tradeOffer', to: giftTo, give, get });
      });
      body.appendChild(sendBtn);
    }
  }
  $('giftBtn').addEventListener('click', openGift);
  $('giftClose').addEventListener('click', closeWindows);

  // someone offered you a trade
  function showTradeOffer(msg) {
    tradeOffer = msg;
    const buying = msg.kind === 'buy';
    $('tradeTitle').textContent = buying ? '💰 Someone wants to buy your ice cream!' : '🤝 Trade offer!';
    $('tradeFrom').textContent = buying ? `${msg.from} wants to buy your ice cream. Do you want to sell?` : `${msg.from} wants to trade with you:`;
    $('tradeYes').textContent = buying ? '✅ Sell' : '✅ Accept';
    const lines = b => {
      const parts = describe(b).split(', ');
      return parts.map(p => `<div class="line">• ${p.replace(/</g, '&lt;')}</div>`).join('');
    };
    $('tradeGet').innerHTML = lines(msg.give);
    $('tradeGive').innerHTML = lines(msg.get);
    $('tradeModal').classList.remove('hidden');
  }
  function answerTrade(accept) {
    if (tradeOffer) send({ type: 'tradeReply', id: tradeOffer.id, accept });
    tradeOffer = null;
    $('tradeModal').classList.add('hidden');
  }
  $('tradeYes').addEventListener('click', () => answerTrade(true));
  $('tradeNo').addEventListener('click', () => answerTrade(false));

  // ---------- 🛒 Supplies Shop: Ice Cream / Toppings squares ----------
  function showShopTab(tab) {
    $('tabIce').classList.toggle('on', tab === 'ice');
    $('tabTop').classList.toggle('on', tab === 'top');
    $('icePane').classList.toggle('hidden', tab !== 'ice');
    $('topPane').classList.toggle('hidden', tab !== 'top');
  }
  $('tabIce').addEventListener('click', () => showShopTab('ice'));
  $('tabTop').addEventListener('click', () => showShopTab('top'));

  for (const t of TOPPINGS) {
    if (t.adminOnly) continue; // 👑 admin toppings are never in the shop
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="iconWrap">${iconHtml(t.id)}</div>
      <div class="info"><div class="name">${t.name}</div>
        <div class="meta"><span class="bonus">${pct(t.bonus)} money</span> per scoop of the ice cream it's on</div></div>
      <div class="buyBtns"><button type="button" data-n="1">${fmt(t.cost)}</button><button type="button" data-n="10">x10</button></div>`;
    row.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => send({ type: 'buyTopping', topping: t.id, count: Number(b.dataset.n) })));
    $('topList').appendChild(row);
    t.row = row;
  }
  function updateToppings() {
    const s = me();
    if (!s) return;
    for (const t of TOPPINGS) {
      if (!t.row) continue;
      const [one, ten] = t.row.querySelectorAll('button');
      one.disabled = s.money < t.cost;
      ten.disabled = s.money < t.cost * 10;
    }
  }

  // ---------- ⚡ Cyber Event: the Cyber Pass and Game Passes (online: admins only for now) ----------
  // lucky block colors (fancy ones get a CSS class instead)
  const fancyBlock = b => ['rainbow', 'infinity', 'cyber', 'glass', 'beasts', 'christmas'].includes(b.color) ? b.color : '';
  const blockBg = b => fancyBlock(b) ? '' : `background:${b.color}`;
  let cyberState = { on: false, endsAt: 0 };
  const cyberIsOn = () => CYBER && cyberState.on;
  let glassState = { on: false, endsAt: null };
  const glassIsOn = () => seeGlass && glassState.on;
  let xmasState = { on: false, endsAt: null };
  const xmasIsOn = () => seeXmas && xmasState.on;
  const evOn = ev => ev === 'glass' ? glassIsOn() : ev === 'christmas' ? xmasIsOn() : cyberIsOn();
  const evEnds = ev => { const at = ({ glass: glassState, christmas: xmasState }[ev] || cyberState).endsAt; return at ? 'ends in ' + timeLeft(at) : 'being tested by admins'; };
  function timeLeft(at) {
    const sec = Math.max(0, Math.floor((at - Date.now()) / 1000));
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${sec % 60}s`;
  }
  const blockById = Object.fromEntries(LUCKY_BLOCKS.map(b => [b.id, b]));

  function prizeHtml(p) {
    if (p.money) return { icon: '💵', name: fmt(p.money) };
    if (p.item) {
      const it = itemById[p.item];
      return { icon: iconHtml(p.item), name: `${p.count > 1 ? p.count + ' ' : ''}${it.name}` };
    }
    const b = blockById[p.block];
    return { icon: `<div class="luckyBlock ${fancyBlock(b)}" style="${blockBg(b)}"></div>`,
      name: `${p.count > 1 ? p.count + ' ' : ''}${b.name}${p.count > 1 ? 's' : ''}` };
  }

  // the pass window works for both events: ⚡ Cyber Pass and 🔮 Glass Pass
  let passEv = 'cyber';
  const PASSES = { cyber: CYBER_PASS, glass: GLASS_PASS };
  const passOf = (s, ev) => ev === 'glass'
    ? { xp: s.glassXP || 0, claimed: s.glassClaimed, premium: !!s.premiumGlass }
    : { xp: s.passXP || 0, claimed: s.passClaimed, premium: !!s.premiumPass };
  const passTiles = { free: [], premium: [] };
  function buildPass() {
    for (const row of ['free', 'premium']) {
      const box = $(row === 'free' ? 'passFree' : 'passPremium');
      box.innerHTML = '';
      passTiles[row] = [];
      PASSES[passEv][row].forEach((p, i) => {
        const h = prizeHtml(p);
        const tile = document.createElement('div');
        tile.className = 'passTile';
        tile.innerHTML = `<div class="prizeIcon">${h.icon}</div><div class="prizeName">${h.name}</div>
          <div class="prizeAt">${p.at} scoops</div><button type="button"></button>`;
        const ev = passEv;
        tile.querySelector('button').addEventListener('click', () => send({ type: 'passClaim', event: ev, row, tier: i }));
        box.appendChild(tile);
        passTiles[row][i] = tile;
      });
    }
    const glass = passEv === 'glass';
    $('passModal').classList.toggle('glassTheme', glass);
    $('passModal').querySelector('.modalTitle').textContent = glass ? '🔮 Glass Pass' : '⚡ Cyber Pass';
    $('passModal').querySelector('.passLabel.premium').firstChild.textContent = glass ? '🔮 PREMIUM PRIZES ' : '⚡ PREMIUM PRIZES ';
    $('passPremiumNote').dataset.state = '';
  }

  function updatePass() {
    const s = me();
    if (!s) return;
    const ps = passOf(s, passEv), evName = passEv === 'glass' ? 'Glass Event' : 'Cyber Event';
    $('passTimer').textContent = evOn(passEv) ? `${evName} ${evEnds(passEv)}` : `The ${evName} is over.`;
    $('passXP').textContent = `You've sold ${ps.xp} scoops during the ${evName}. Sell more to unlock prizes!`;
    const premium = ps.premium;
    $('passPremium').classList.toggle('locked', !premium);
    const note = $('passPremiumNote');
    const want = premium ? '✅ You have it!' : '🔒 Needs the Premium Pass';
    if (note.dataset.state !== String(premium)) {
      note.dataset.state = String(premium);
      note.innerHTML = premium ? want : `${want} <button type="button">Get it</button>`;
      const b = note.querySelector('button');
      if (b) b.addEventListener('click', openStore);
    }
    for (const row of ['free', 'premium']) {
      PASSES[passEv][row].forEach((p, i) => {
        const claimed = (ps.claimed?.[row] || []).includes(i);
        const unlocked = ps.xp >= p.at && (row === 'free' || premium);
        // a prize that won't fit: say so on the button instead of failing quietly
        const noRoom = p.item && ![...s.hotbar, ...s.storage].some(x => !x || (x.flavor === p.item && x.count < MAX_STACK));
        const noPets = p.block && s.pets.length + (p.count || 1) > MAX_PETS;
        const text = claimed ? '✓ Claimed' : !unlocked ? (row === 'premium' && !premium ? '🔒 Premium' : `🔒 ${p.at - ps.xp} more`)
          : noRoom ? '🎒 Make room' : noPets ? '🐾 Pets full' : 'Claim!';
        const tile = passTiles[row][i];
        const btn = tile.querySelector('button');
        if (btn.textContent !== text) btn.textContent = text;
        btn.title = noRoom ? 'Your hotbar and Inventory are full. Move or use something, then claim it.' : noPets ? 'Let a pet go in My Pets first.' : '';
        btn.disabled = claimed || !unlocked || noRoom || noPets;
        tile.classList.toggle('claimed', claimed);
        tile.classList.toggle('ready', unlocked && !claimed);
      });
    }
  }

  function openPass(ev = 'cyber') {
    closeWindows();
    if (passEv !== ev || !passTiles.free.length) { passEv = ev; buildPass(); }
    openWindow = 'pass';
    $('passModal').classList.remove('hidden');
    updatePass();
  }

  function buildStore() {
    const list = $('storeList');
    list.innerHTML = '';
    for (const gp of GAME_PASSES) {
      gp.row = null;
      if (!canSee(gp)) continue;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="gpEmoji">${gp.emoji}</div>
        <div class="info"><div class="name">${gp.name}</div><div class="meta">${gp.desc}</div>
          <div class="gpPrice">${gp.shards ? `💎 ${gp.shards} shards` : '💎 49 to 299 shards'}</div></div>`;
      let pick = null;
      if (gp.id === 'icecream') {
        pick = document.createElement('select');
        for (const f of FLAVORS.filter(f => !f.adminOnly && ICE_CREAM_PRICES[f.rarity] && canSee(f))) {
          const o = document.createElement('option');
          o.value = f.id;
          o.textContent = `${f.name} (💎 ${ICE_CREAM_PRICES[f.rarity]})`;
          pick.appendChild(o);
        }
        row.querySelector('.info').appendChild(pick);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.addEventListener('click', () => send({ type: 'gamePass', id: gp.id, flavor: pick ? pick.value : undefined }));
      if (pick) pick.addEventListener('change', updateStore);
      gp.pick = pick;
      row.appendChild(b);
      list.appendChild(row);
      gp.row = row;
    }
  }

  function openStore() {
    closeWindows();
    openWindow = 'store';
    $('storeModal').classList.remove('hidden');
    updateStore();
  }
  const shardText = s => iAmAdmin ? '∞' : (s.shards || 0).toLocaleString();
  function updateStore() {
    const s = me();
    if (!s) return;
    $('storeShards').textContent = `💎 You have ${shardText(s)} shards` +
      (iAmAdmin ? ' (admins have unlimited)' : ` · get 1 for every ${SHARD_SCOOPS} scoops you sell (up to ${SHARD_WEEKLY} a week)`);
    for (const gp of GAME_PASSES) {
      if (!gp.row) continue;
      const b = gp.row.querySelector('button');
      const price = gp.pick ? ICE_CREAM_PRICES[flavorById[gp.pick.value].rarity] : gp.shards;
      const owned = (gp.id === 'premium' && s.premiumPass) || (gp.id === 'premiumGlass' && s.premiumGlass);
      const text = owned ? '✅ You have it' : `Buy 💎 ${price}`;
      if (b.textContent !== text) b.textContent = text;
      b.disabled = owned || (!iAmAdmin && (s.shards || 0) < price);
    }
  }

  // ⚡ the launch moment: once per visit, when the event is on (or the moment it starts)
  let launchShown = false, glassLaunchShown = false, xmasLaunchShown = false;
  // 🐲 the Mythic Beasts Block and the Pet Upgrade Shop come out with the Glass Event drop and stay after
  const droppedNow = () => Date.now() >= GLASS_EVENT.start || glassIsOn();
  function showCyberLaunch(ev = 'cyber') {
    if (ev === 'glass') glassLaunchShown = true; else if (ev === 'christmas') xmasLaunchShown = true; else launchShown = true;
    const el = $('cyberLaunch');
    const glass = ev === 'glass', xmas = ev === 'christmas';
    el.classList.toggle('glassLaunch', glass);
    el.classList.toggle('xmasLaunch', xmas);
    const title = el.querySelector('.clTitle');
    title.textContent = title.dataset.text = xmas ? '🎄 MERRY CHRISTMAS! 🎄' : glass ? '🔮 THE GLASS EVENT IS HERE! 🔮' : '⚡ CYBER EVENT IS HERE! ⚡';
    el.querySelector('.clSub').textContent = xmas
      ? `Christmas Block · Santa's Reindeer · Candy Cane Swirl ice cream · a giant Christmas tree · a present every day · Santa suit · Christmas mutation · ${evEnds('christmas')}`
      : glass
      ? `NEW: 🐲 Mythic Beasts Block · ⬆️ Pet Upgrade Shop · Glass Block · Glass Wolf · Glass Ice Cream · Glass Storms · glass customers pay x2 · Glass Pass · ${evEnds('glass')}`
      : `Cyber Block · Cyber Whale · Robo Ice Cream · Cyber Storms · Robo customers pay x2 · ${evEnds('cyber')}`;
    el.classList.remove('hidden');
    clearTimeout(showCyberLaunch.t);
    showCyberLaunch.t = setTimeout(() => el.classList.add('hidden'), 6000);
  }
  $('dailyGiftBtn').addEventListener('click', () => send({ type: 'eventGift', event: 'cyber' }));
  $('glassGiftBtn').addEventListener('click', () => send({ type: 'eventGift', event: 'glass' }));
  $('xmasGiftBtn').addEventListener('click', () => send({ type: 'eventGift', event: 'christmas' }));
  $('glassPassBtn').addEventListener('click', () => openPass('glass'));
  $('cyberLaunch').addEventListener('click', () => $('cyberLaunch').classList.add('hidden'));
  function updateCyber() {
    if (!launchShown && seeCyber && cyberIsOn() && myId) showCyberLaunch();
    else if (!glassLaunchShown && glassIsOn() && myId && $('cyberLaunch').classList.contains('hidden')) showCyberLaunch('glass');
    else if (!xmasLaunchShown && xmasIsOn() && myId && $('cyberLaunch').classList.contains('hidden')) showCyberLaunch('christmas');
    $('cyberBtns').classList.toggle('hidden', !seeCyber);
    const s = me();
    if (s && seeCyber) $('storeBtn').textContent = `💎 ${shardText(s)} · Game Passes`;
    $('passBtn').classList.toggle('hidden', !cyberIsOn());
    const today = Math.floor(Date.now() / 86400e3), meNow = me();
    $('dailyGiftBtn').classList.toggle('hidden', !cyberIsOn() || !meNow || meNow.giftDay === today);
    $('glassPassBtn').classList.toggle('hidden', !glassIsOn());
    $('petUpBtn').classList.toggle('hidden', !droppedNow());
    $('glassGiftBtn').classList.toggle('hidden', !glassIsOn() || !meNow || meNow.glassGiftDay === today);
    $('xmasGiftBtn').classList.toggle('hidden', !xmasIsOn() || !meNow || meNow.xmasGiftDay === today);
    if (openWindow === 'pass') { if (evOn(passEv)) updatePass(); else closeWindows(); }
    if (openWindow === 'store') updateStore();
  }

  if (CYBER) {
    buildPass();
    buildStore();
    $('passBtn').addEventListener('click', () => openPass('cyber'));
    $('passClose').addEventListener('click', closeWindows);
    $('storeBtn').addEventListener('click', openStore);
    $('storeClose').addEventListener('click', closeWindows);
  }

  // ---------- 🐾 Pet Shop, lucky blocks and your pets ----------
  for (const b of LUCKY_BLOCKS) {
    const row = document.createElement('div');
    row.className = 'row';
    const odds = Object.entries(b.odds).map(([r, c]) =>
      `<b style="color:${RARITIES[r].color === '#111111' ? '#000' : RARITIES[r].color}">${RARITIES[r].name} ${c}%</b>`).join(' · ');
    row.innerHTML = `<div class="luckyBlock ${fancyBlock(b)}" style="${blockBg(b)}"></div>
      <div class="info"><div class="name">${b.name} ${b.event ? `<span class="eventTag ${b.event}">${{ glass: '🔮 GLASS EVENT', christmas: '🎄 CHRISTMAS' }[b.event] || '⚡ CYBER EVENT'} · <span class="left"></span></span>` : ''}</div>
        <div class="odds">${odds}</div></div>
      <button type="button">${fmt(b.cost)}</button>`;
    row.querySelector('button').addEventListener('click', () => send({ type: 'buyBlock', block: b.id }));
    $('blockList').appendChild(row);
    b.row = row;
  }

  function openPetShop() {
    closeWindows();
    openWindow = 'petshop';
    $('petShopModal').classList.remove('hidden');
    updatePetShop();
  }
  function updatePetShop() {
    const s = me();
    if (!s) return;
    for (const b of LUCKY_BLOCKS) {
      // when you have the most pets you can, the button says so (let some go in My Pets to make room)
      const full = s.pets.length >= MAX_PETS;
      $('petsFullNote').classList.toggle('hidden', !full);
      const btn = b.row.querySelector('button');
      btn.disabled = s.money < b.cost || full;
      btn.textContent = full ? 'Pets full' : fmt(b.cost);
      btn.title = full ? `You have ${MAX_PETS} pets, the most you can have. Let some go in 🐾 My Pets to make room.` : '';
      if (b.drop) b.row.classList.toggle('hidden', !droppedNow());
      // event blocks are only in the shop while their event is on
      if (b.event) {
        b.row.classList.toggle('hidden', !evOn(b.event));
        const left = b.row.querySelector('.left');
        if (left) left.textContent = evEnds(b.event);
      }
    }
  }
  $('petShopClose').addEventListener('click', closeWindows);

  // the lucky block shakes, then pops open to show your new pet
  let revealTimer = null;
  // a lucky block that opens with an ice cream or topping (admins' Give in Lucky Block)
  function revealItem(msg) {
    const it = itemById[msg.item];
    revealPet({ ...msg, show: {
      icon: `<div class="revealItem">${iconHtml(it.id)}</div>`, name: it.name,
      rarity: RARITIES[it.rarity] || { name: 'Topping', color: '#ff6fa5', order: 3 }, rarityId: it.rarity || 'topping',
      line: flavorById[it.id] ? `${fmt(it.price)} a scoop · it's in your hotbar or Inventory` : `${pct(it.bonus)} money · it's in your hotbar or Inventory`,
    } });
  }

  function revealPet(msg) {
    const pet = petById[msg.pet];
    const show = msg.show || { icon: petIcon(pet), name: pet.name, rarity: RARITIES[pet.rarity], rarityId: pet.rarity,
      line: `${petPct(pet.boost)} money from every scoop` + (msg.equipped ? ' · it\'s following you now!' : '') };
    const r = show.rarity;
    const block = LUCKY_BLOCKS.find(b => b.id === msg.block);
    const el = $('revealBlock');
    el.className = 'luckyBlock shake ' + fancyBlock(block);
    el.style.cssText = blockBg(block);
    el.classList.remove('hidden');
    $('revealPet').classList.add('hidden');
    $('revealOk').classList.add('hidden');
    $('revealModal').classList.remove('hidden');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      el.classList.add('hidden');
      const box = $('revealPet');
      if (block && (block.color === 'cyber' || block.color === 'glass')) {
        // ⚡ the Cyber Block bursts open with a flash and shockwaves; 🔮 the Glass Block shatters into rainbow shards
        const m = $('revealModal'), cls = block.color === 'glass' ? 'glassBoom' : 'cyberBoom';
        m.classList.remove('cyberBoom', 'glassBoom'); void m.offsetWidth; m.classList.add(cls);
      }
      box.querySelector('.revealEmoji').innerHTML = show.icon;
      const badge = box.querySelector('.revealRarity');
      badge.textContent = r.name.toUpperCase();
      badge.style.background = r.color;
      badge.className = 'revealRarity ' + show.rarityId;
      box.querySelector('.revealName').textContent = show.name;
      box.querySelector('.revealBoost').textContent = show.line;
      box.classList.remove('hidden');
      $('revealOk').classList.remove('hidden');
      const s = me();
      if (s) confetti(player.x, player.y - 40, 15 + r.order * 15);
    }, 1400);
  }
  $('revealOk').addEventListener('click', () => $('revealModal').classList.add('hidden'));

  // ---------- 💎 Shard Shop (real money through Stripe; online game only) ----------
  let account = null;
  function openShardShop() {
    closeWindows();
    openWindow = 'shardshop';
    $('shardShopModal').classList.remove('hidden');
    renderShardShop();
    send({ type: 'shopOpen' }); // get the newest numbers
  }
  function renderShardShop() {
    const box = $('shardShopBody');
    const a = account;
    if (!a || !a.shop) { box.innerHTML = '<p class="sub">The Shard Shop isn\'t open yet.</p>'; return; }
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let html = a.testMode ? `<div class="shopTest">🧪 <b>TEST MODE:</b> no real money. Pay with the test card
      <b>4242 4242 4242 4242</b>, any future date, any 3 numbers.</div>` : '';
    if (!a.hasParent) {
      html += `<p><b>👪 Ask a parent!</b> Shards cost real money, so a parent has to set this up once.</p>
        <div class="parentForm">
          <label>Parent's email (receipts go here)<input id="parentEmail" type="email" maxlength="120" autocomplete="email"></label>
          <label>Parent PIN, 4 to 8 numbers (to change settings later; don't tell the kids!)<input id="parentPin" type="password" inputmode="numeric" maxlength="8"></label>
          <label>Type the PIN again<input id="parentPin2" type="password" inputmode="numeric" maxlength="8"></label>
          <label><input id="parentAgree" type="checkbox"> I'm the parent or guardian, and I allow purchases up to the monthly limit ($50 to start).</label>
          <button id="parentSave" type="button">👪 Set up purchases</button>
        </div>`;
    } else {
      const left = Math.max(0, a.limitUsd - a.spentUsd);
      html += `<p class="shopSpent">This month: $${a.spentUsd.toFixed(2).replace('.00', '')} of $${a.limitUsd} spent</p><div class="packGrid">`;
      for (const p of a.packs) {
        const over = p.usd > left;
        html += `<button type="button" class="packBtn" data-pack="${p.id}" ${over ? 'disabled title="Over the monthly limit"' : ''}>
          <span class="gems">💎 ${p.shards.toLocaleString()}</span><span class="usd">$${p.usd}</span>
          ${p.bonus ? `<span class="bonus">+${p.bonus}% bonus</span>` : ''}</button>`;
      }
      html += `</div>
        <div class="shopSection"><h3>👪 Parent settings</h3>
          <p class="sub">Receipts go to ${esc(a.parentEmail)}. Change the monthly limit or the email with the parent PIN.</p>
          <div class="parentForm">
            <label>New monthly limit in $ (0 to ${a.maxLimitUsd})<input id="limitInput" type="number" min="0" max="${a.maxLimitUsd}" placeholder="${a.limitUsd}"></label>
            <label>New parent email (optional)<input id="emailInput" type="email" maxlength="120"></label>
            <label>Parent PIN<input id="pinInput" type="password" inputmode="numeric" maxlength="8"></label>
            <button id="parentUpdate" type="button">Save</button>
          </div></div>`;
    }
    if (a.purchases && a.purchases.length) {
      html += '<div class="shopSection"><h3>🧾 Purchases</h3>' + a.purchases.map(p =>
        `<div class="purchaseRow">${new Date(p.at).toLocaleDateString()} · $${p.usd} · 💎 ${p.shards.toLocaleString()}` +
        (p.refunded ? ` <span class="refunded">(refunded${p.refunded < p.shards ? ` ${p.refunded}` : ''})</span>` : '') + '</div>').join('') + '</div>';
    }
    html += '<p class="sub"><a href="/policy" target="_blank">Shop, refunds &amp; contact</a></p>';
    box.innerHTML = html;
    const btn = id => box.querySelector('#' + id);
    if (btn('parentSave')) btn('parentSave').addEventListener('click', () => {
      const pin = btn('parentPin').value;
      if (pin !== btn('parentPin2').value) return toast('The two PINs are different.');
      send({ type: 'setParent', email: btn('parentEmail').value, pin, agree: btn('parentAgree').checked });
    });
    if (btn('parentUpdate')) btn('parentUpdate').addEventListener('click', () =>
      send({ type: 'parentUpdate', pin: btn('pinInput').value, limitUsd: btn('limitInput').value, email: btn('emailInput').value }));
    for (const b of box.querySelectorAll('.packBtn')) b.addEventListener('click', () => {
      const p = a.packs.find(x => x.id === b.dataset.pack);
      if (confirm(`Buy 💎 ${p.shards.toLocaleString()} shards for $${p.usd}? Ask a parent first! You'll go to Stripe's secure payment page.`)) {
        b.disabled = true;
        send({ type: 'buyShards', pack: p.id });
      }
    });
  }
  $('shardShopBtn').addEventListener('click', openShardShop);
  $('shardShopClose').addEventListener('click', closeWindows);

  // ---------- 💰 Sell Shop ----------
  function openSell() {
    closeWindows();
    openWindow = 'sell';
    sellKey = '';
    $('sellModal').classList.remove('hidden');
    updateSell();
  }
  let sellKey = '';
  const countOf = (list, id) => list.filter(x => x === id).length;
  function sellRow(icon, name, sub, each, have, send1, sendAll) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="sellIcon">${icon}</div>
      <div class="info"><div class="name"></div><div class="meta">${sub}</div>
        <div class="sellEach">${fmt(each)} each · you have ${have}</div></div>
      <div class="sellBtns"><button type="button">Sell 1</button>${have > 1 ? '<button type="button" class="all">Sell all</button>' : ''}</div>`;
    row.querySelector('.name').textContent = name;
    const [b1, ball] = row.querySelectorAll('button');
    b1.addEventListener('click', send1);
    if (ball) ball.addEventListener('click', sendAll);
    return row;
  }
  function updateSell() {
    const s = me();
    if (!s) return;
    const items = {};
    for (const x of [...s.hotbar, ...s.storage]) if (x) items[x.flavor] = (items[x.flavor] || 0) + x.count;
    const pets = {};
    for (const id of s.pets) pets[id] = (pets[id] || 0) + 1;
    const key = JSON.stringify([items, pets, s.worn]);
    if (key === sellKey) return; // only redraw when something changed
    sellKey = key;
    const sellIt = (kind, id, count) => send({ type: 'sell', kind, id, count });
    const il = $('sellItems');
    il.innerHTML = '';
    for (const [id, n] of Object.entries(items).sort((a, b) => sellPrice(itemById[b[0]]) - sellPrice(itemById[a[0]]))) {
      const it = itemById[id];
      if (toppingById[id] && it.adminOnly) continue; // 👑 admin toppings can't be sold
      const sub = toppingById[id] ? 'Topping' : `${RARITIES[it.rarity].name} ice cream`;
      il.appendChild(sellRow(iconHtml(id), it.name, sub, sellPrice(it), n, () => sellIt('item', id, 1), () => sellIt('item', id, n)));
    }
    if (!il.children.length) il.innerHTML = '<p class="sub">No ice cream or toppings in your hotbar or Inventory. (Ice cream on your stand has to be taken off first.)</p>';
    const pl = $('sellPets');
    pl.innerHTML = '';
    for (const [id, n] of Object.entries(pets).sort((a, b) => PET_SELL[petById[b[0]].rarity] - PET_SELL[petById[a[0]].rarity])) {
      const p = petById[id], r = RARITIES[p.rarity];
      const wearing = countOf(s.worn, id);
      const ask = (count) => {
        const rare = r.order >= 5;
        if ((rare || wearing) && !confirm(`Sell ${count} ${p.name} for ${fmt(PET_SELL[p.rarity] * count)}?` + (wearing ? ' (You\'re wearing it!)' : '') + ' It will be gone for good.')) return;
        sellIt('pet', id, count);
      };
      const sub = `<span class="badge ${p.rarity}" style="background-color:${r.color}">${r.name}</span>` + (wearing ? ' · wearing' : '');
      pl.appendChild(sellRow(petIcon(p), p.name, sub, PET_SELL[p.rarity], n, () => ask(1), () => ask(n)));
    }
    if (!pl.children.length) pl.innerHTML = '<p class="sub">You don\'t have any pets yet.</p>';
  }
  $('sellClose').addEventListener('click', closeWindows);

  // My Pets: wear the one you like
  let petsKey = '';
  function openPets() {
    closeWindows();
    openWindow = 'pets';
    petsKey = '';
    $('petsModal').classList.remove('hidden');
    updatePets();
  }
  function updatePets() {
    const s = me();
    if (!s) return;
    const worn = s.worn || [];
    const key = s.pets.join() + '|' + worn.join() + '|' + JSON.stringify(s.petLevels || {});
    if (key === petsKey) return;
    petsKey = key;
    const boost = worn.reduce((sum, id) => sum + petPower(s, id), 0);
    $('petsSub').textContent = `You have ${s.pets.length}/${MAX_PETS} pets. Wearing ${worn.length}/${MAX_WORN}` +
      (worn.length ? `: they give you ${petPct(boost)} money from every scoop!` : '. Tap Wear on a pet, or press Equip Best.') +
      (s.pets.length ? '' : ' Get pets from lucky blocks at the 🐾 Pet Shop.');
    $('equipBestBtn').disabled = !s.pets.length;
    const list = $('petsList');
    list.innerHTML = '';
    // every pet gets its own card, best first; the ones you wear are marked
    const wornLeft = {};
    for (const id of worn) wornLeft[id] = (wornLeft[id] || 0) + 1;
    const sorted = [...s.pets].sort((a, b) => petPower(s, b) - petPower(s, a));
    for (const id of sorted) {
      const p = petById[id], r = RARITIES[p.rarity];
      const on = wornLeft[id] > 0;
      if (on) wornLeft[id]--;
      const card = document.createElement('div');
      card.className = 'petCard' + (on ? ' equipped' : '');
      card.innerHTML = `<div class="petEmoji">${petIcon(p)}</div><div class="name">${p.name}</div>
        <span class="badge ${p.rarity}" style="background-color:${r.color}">${r.name}</span>
        <div class="boost">${petPct(petPower(s, id))} money${s.petLevels?.[id] ? ` · ⬆️ Lv ${s.petLevels[id]}` : ''}</div>
        <button type="button">${on ? 'Take off' : 'Wear'}</button>
        <button type="button" class="letGo">Let go</button>`;
      card.querySelector('.letGo').addEventListener('click', () => {
        if (confirm(`Let go of your ${p.name}? It will be gone for good.`)) send({ type: 'releasePet', pet: id });
      });
      const btn = card.querySelector('button');
      btn.disabled = !on && worn.length >= MAX_WORN;
      btn.title = btn.disabled ? `You can wear ${MAX_WORN} pets at once. Take one off first.` : '';
      btn.addEventListener('click', () => send({ type: 'equipPet', pet: id, on: !on }));
      list.appendChild(card);
    }
  }
  // ⬆️ Pet Upgrade Shop: one row for each kind of pet you own
  const petPower = (s, id) => petBoostAt(petById[id], s.petLevels?.[id]);
  let petUpKey = '';
  function openPetUp() {
    closeWindows();
    openWindow = 'petup';
    petUpKey = '';
    $('petUpModal').classList.remove('hidden');
    updatePetUp();
  }
  function updatePetUp() {
    const s = me();
    if (!s) return;
    const kinds = [...new Set(s.pets)].sort((a, b) => petPower(s, b) - petPower(s, a));
    const key = kinds.join() + '|' + JSON.stringify(s.petLevels || {}) + '|' + kinds.map(id => {
      const lvl = s.petLevels?.[id] || 0;
      return lvl < PET_MAX_LEVEL && s.money >= petUpgradeCost(petById[id], lvl) ? 1 : 0;
    }).join('');
    if (key === petUpKey) return;
    petUpKey = key;
    const list = $('petUpList');
    list.innerHTML = kinds.length ? '' : '<p class="sub">You don\'t have any pets yet. Get some from lucky blocks at the 🐾 Pet Shop!</p>';
    for (const id of kinds) {
      const p = petById[id], r = RARITIES[p.rarity], lvl = s.petLevels?.[id] || 0, max = lvl >= PET_MAX_LEVEL;
      const cost = max ? 0 : petUpgradeCost(p, lvl);
      const row = document.createElement('div');
      row.className = 'row petRow';
      row.innerHTML = `<div class="petEmoji">${petIcon(p)}</div>
        <div class="info"><div class="name">${p.name} <span class="lvl">Lv ${lvl}</span></div>
          <div class="meta"><span class="badge ${p.rarity}" style="background-color:${r.color}">${r.name}</span>
            <span class="boost">${petPct(petBoostAt(p, lvl))}${max ? ' (max!)' : ` → ${petPct(petBoostAt(p, lvl + 1))}`} money</span></div>
          <div class="stars">${'★'.repeat(lvl)}${'☆'.repeat(PET_MAX_LEVEL - lvl)}</div></div>
        <button type="button">${max ? 'MAX' : '⬆️ ' + fmt(cost)}</button>`;
      const btn = row.querySelector('button');
      btn.disabled = max || s.money < cost;
      btn.addEventListener('click', () => send({ type: 'upgradePet', pet: id }));
      list.appendChild(row);
    }
  }
  $('petUpBtn').addEventListener('click', openPetUp);
  $('petUpClose').addEventListener('click', closeWindows);

  $('equipBestBtn').addEventListener('click', () => { send({ type: 'equipBest' }); toast(`⭐ Wearing your ${MAX_WORN} best pets!`); });
  $('petsBtn').addEventListener('click', openPets);
  $('petsClose').addEventListener('click', closeWindows);

  // 👑 admins: spawn any pet into your own pets
  let adminPetPick = null;
  function openAdminPets() {
    closeWindows();
    openWindow = 'adminpets';
    $('adminPetsModal').classList.remove('hidden');
    const list = $('adminPetsList');
    list.innerHTML = '';
    for (const p of PETS) { // most common first, rarest last
      const r = RARITIES[p.rarity];
      const row = document.createElement('div');
      row.className = 'row petRow' + (adminPetPick === p.id ? ' picked' : '');
      row.innerHTML = `<div class="petEmoji">${petIcon(p)}</div>
        <div class="info"><div class="name">${p.name}</div>
          <div class="meta"><span class="badge ${p.rarity}" style="background-color:${r.color}">${r.name}</span>
            <span class="boost">${petPct(p.boost)} money</span></div></div>`;
      row.addEventListener('click', () => {
        adminPetPick = p.id;
        list.querySelectorAll('.petRow').forEach(x => x.classList.remove('picked'));
        row.classList.add('picked');
        $('adminPetSpawn').disabled = false;
        $('adminPetSpawn').textContent = `Spawn ${p.emoji} ${p.name}`;
      });
      list.appendChild(row);
    }
  }
  $('adminPetsBtn').addEventListener('click', openAdminPets);
  $('adminPetsClose').addEventListener('click', closeWindows);
  $('adminPetSpawn').addEventListener('click', () => {
    if (adminPetPick) send({ type: 'adminSpawnPet', pet: adminPetPick, count: Number($('adminPetCount').value) || 1 });
  });

  // ---------- 💬 Chat (top left) ----------
  const STAND_COLORS = id => (stands.find(st => st.id === id) || {}).color;

  function addChat(msg) {
    const log = $('chatLog');
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
    const line = document.createElement('div');
    line.className = 'msg';
    const from = document.createElement('span');
    from.className = 'from' + (msg.admin ? ' admin' : '');
    from.textContent = (msg.admin ? '👑 ' : '') + msg.from + ': ';
    if (!msg.admin && STAND_COLORS(msg.id)) from.style.color = STAND_COLORS(msg.id);
    line.appendChild(from);
    line.appendChild(document.createTextNode(msg.text));
    log.appendChild(line);
    while (log.children.length > 50) log.firstChild.remove();
    if (atBottom || msg.id === myId) log.scrollTop = log.scrollHeight;
    // a new message pops the chat open again
    if (msg.id !== myId) $('chat').classList.remove('collapsed');
  }

  function sendChat() {
    const text = $('chatInput').value.trim();
    if (!text) return $('chatInput').blur();
    send({ type: 'chat', text });
    $('chatInput').value = '';
  }
  $('chatSend').addEventListener('click', sendChat);
  $('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    else if (e.key === 'Escape') $('chatInput').blur();
  });
  $('chatToggle').addEventListener('click', () => $('chat').classList.toggle('collapsed'));
  $('chatLog').innerHTML = '<div class="msg hint">Say hi to everyone in the park! Press Enter to chat.</div>';
  if (window.innerWidth < 700) $('chat').classList.add('collapsed');

  // ---------- 📖 Tutorial: a guide card and a bouncing arrow for new players ----------
  const tut = { step: -1, bought: false, placed: false, start: null };
  const myStandPos = () => { const s = me(); return s ? slots[s.slot] : null; };
  const SHOP_DOOR = () => ({ x: SHOP.x, y: SHOP.y + 90 });
  const TUT_STEPS = [
    { text: '👋 Let\'s open your stand! Walk with the <b>arrow keys</b> (or W A S D), or <b>tap</b> where you want to go.',
      done: () => tut.start && dist(player, tut.start) > 80 },
    { text: '🛒 Your stand is empty, so nobody can buy anything yet. Walk to the <b>Supplies Shop</b> in the middle of the park. Follow the arrow!',
      target: SHOP_DOOR, done: () => dist(player, SHOP_DOOR()) <= REACH || tut.bought },
    { text: '💵 Tap the shop and buy a tub of ice cream. <b>Vanilla, Chocolate and Banana cost $10</b>, and you have $20.',
      target: () => SHOP, done: () => tut.bought },
    { text: '✋ Your tub is in your <b>hotbar</b> at the bottom. Tap it (or press its number key) to hold it.',
      hotbar: true, done: () => !!heldItem() || tut.placed },
    { text: '🏪 Walk back to your stand and tap a <b>dashed space</b> to put your ice cream in.',
      target: myStandPos, done: () => tut.placed },
    { text: `⏱️ Your ice cream is growing! When it's ready, a customer buys <b>1 scoop every ${SCOOP_SLOWEST} seconds</b>.
      Every extra ice cream makes it faster: <b>1 second</b> each, <b>2 seconds</b> for flavors over $1,000,
      <b>3 seconds</b> over $10,000, down to <b>1 scoop a second</b>. Wait for your first sale!`,
      target: myStandPos, onShow: () => { tut.sold0 = me()?.sold || 0; }, done: () => (me()?.sold || 0) > tut.sold0 },
    { text: '🎉 Your first sale! Buy more ice cream to sell faster. Also try: 🍒 <b>toppings</b>, 🎒 the <b>chest</b> (your Inventory), ' +
      '🐾 the <b>Pet Shop</b>, 👕 the <b>Avatar Shop</b>, 🎁 <b>Gift &amp; Trade</b>, 💬 <b>chat</b>, and 🌈 <b>mutations</b>!', last: true },
  ];

  function tutorialDone() { try { return !!localStorage.getItem('icecream-tutorial-done'); } catch (e) { return false; } }

  function startTutorial() {
    tut.bought = tut.placed = false;
    showTutStep(0);
  }

  function showTutStep(i) {
    tut.step = i;
    tut.start = player.placed ? { x: player.x, y: player.y } : null;
    const st = TUT_STEPS[i];
    $('tutorial').classList.remove('hidden');
    $('tutorial').querySelector('.tutStep').textContent = `Tutorial · Step ${i + 1} of ${TUT_STEPS.length}`;
    $('tutorial').querySelector('.tutText').innerHTML = st.text;
    $('tutNext').classList.toggle('hidden', !st.last);
    $('tutSkip').classList.toggle('hidden', !!st.last);
    $('hotbar').classList.toggle('tutGlow', !!st.hotbar);
    if (st.onShow) st.onShow();
  }

  function endTutorial() {
    tut.step = -1;
    $('tutorial').classList.add('hidden');
    $('hotbar').classList.remove('tutGlow');
    try { localStorage.setItem('icecream-tutorial-done', '1'); } catch (e) {}
  }

  function updateTutorial() {
    const st = TUT_STEPS[tut.step];
    if (!st || st.last || !me() || !player.placed) return;
    if (!tut.start) tut.start = { x: player.x, y: player.y };
    if (st.done()) {
      confetti(player.x, player.y - 40, 16);
      showTutStep(tut.step + 1);
    }
  }

  // a bouncing arrow over where to go, plus a little pointer next to you when it's far away
  function drawTutorialArrow(time) {
    const st = TUT_STEPS[tut.step];
    const t = st && st.target && st.target();
    if (!t) return;
    const bob = Math.sin(time * 6) * 8;
    const ax = t.x, ay = t.y - 110 + bob;
    ctx.fillStyle = '#ff3b82';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ax, ay + 30); ctx.lineTo(ax - 22, ay + 6); ctx.lineTo(ax - 9, ay + 6); ctx.lineTo(ax - 9, ay - 22);
    ctx.lineTo(ax + 9, ay - 22); ctx.lineTo(ax + 9, ay + 6); ctx.lineTo(ax + 22, ay + 6); ctx.closePath();
    ctx.stroke(); ctx.fill();
    const d = dist(player, t);
    if (d > 220) {
      const a = Math.atan2(t.y - player.y, t.x - player.x);
      ctx.save();
      ctx.translate(player.x + Math.cos(a) * 55, player.y - 25 + Math.sin(a) * 55);
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(16 + bob / 2, 0); ctx.lineTo(-8, -12); ctx.lineTo(-8, 12); ctx.closePath();
      ctx.stroke(); ctx.fill();
      ctx.restore();
    }
  }

  $('tutSkip').addEventListener('click', endTutorial);
  $('tutNext').addEventListener('click', endTutorial);
  $('tutBtn').addEventListener('click', () => startTour(true));

  // ---------- 📖 the click-through tour: the camera flies to each place and spotlights it ----------
  const box = (p, w, h, dy = 0) => p && { x: p.x - w / 2, y: p.y - h / 2 + dy, w, h };
  const TOUR = [
    { title: '🍦 Welcome to Ice Cream Tycoon!',
      text: `You run your own ice cream stand: customers buy scoops and you get money.<br>
        <b>Your stand starts empty</b>, and with no ice cream nobody can buy anything. You get <b>$20</b> to start.<br>
        Click <b>Next</b> to see how everything works.`,
      world: () => box(myStandPos(), 310, 210, -30) },
    { title: '🛒 The Supplies Shop',
      text: `In the middle of the park. Walk here and tap it to <b>buy tubs of ice cream</b>
        (Vanilla, Chocolate and Banana cost $10). It also sells 🍒 toppings that make scoops worth more.`,
      world: () => box(SHOP, 320, 270, -20) },
    { title: '🏪 Put it in your store',
      text: `Back at your stand, pick the tub in your <b>hotbar</b> (the boxes at the bottom), then tap a
        <b>dashed space</b> on your stand. The ice cream grows for a bit, then customers buy it automatically.`,
      world: () => box(myStandPos(), 310, 210, -30) },
    { title: '⏱️ How fast you sell',
      text: `<ul>
        <li><b>1 ice cream</b> on your stand: 1 scoop sold every <b>${SCOOP_SLOWEST} seconds</b></li>
        <li>Every extra ice cream: <b>1 second faster</b></li>
        <li>Flavors that cost <b>over $1,000</b>: <b>2 seconds faster</b></li>
        <li>Flavors that cost <b>over $10,000</b>: <b>3 seconds faster</b></li>
        <li>The fastest is <b>1 scoop every second</b></li>
        <li><b>No ice cream = no sales!</b> (Growing ice cream starts counting once it's ready.)</li></ul>`,
      world: () => box(myStandPos(), 310, 210, -30) },
    { title: '⭐ Specialty ice creams',
      text: `Rare flavors cost a lot of money, but they sell for much more and make your stand faster.
        Look for <b class="speedTag">⏱️ -2s</b> and <b class="speedTag">⏱️ -3s</b> in the shop. New stock comes every 3 minutes.`,
      world: () => box(SHOP, 320, 270, -20) },
    { title: '💬 Chat',
      text: 'Talk to everyone in the park here. Press <b>Enter</b> to start typing. Be nice!',
      dom: '#chat' },
    { title: '🐾 The Pet Shop',
      text: `Open lucky blocks to get pets. You can wear <b>3 pets</b>: they follow you around and make every
        scoop worth more. The rarest pets are amazing!`,
      world: () => box(PET_SHOP, 300, 250, -20) },
    { title: '💰 The Sell Shop',
      text: `At the bottom of the park. Sell ice cream, toppings and pets you don't need for money.`,
      world: () => box(SELL_SHOP, 260, 230, -10) },
    { title: '👕 The Avatar Shop',
      text: `Change your shirt, pants, hat and face, then press <b>Save</b>. You're ready:
        now go buy your first ice cream! (You can see this again with the 📖 Tutorial button.)`,
      world: () => box(AVATAR_SHOP, 260, 230, -10), last: true },
  ];
  const tour = { on: false, i: 0, focus: null };
  const tourDone = () => { try { return !!localStorage.getItem('icecream-tour-done'); } catch (e) { return false; } };

  function startTour() {
    closeWindows();
    tour.on = true;
    $('tutorial').classList.add('hidden');
    $('tour').classList.remove('hidden');
    showTourStep(0);
  }

  function showTourStep(i) {
    tour.i = i;
    const st = TOUR[i];
    $('tour').querySelector('.tourStep').textContent = `Step ${i + 1} of ${TOUR.length}`;
    $('tour').querySelector('.tourTitle').textContent = st.title;
    $('tour').querySelector('.tourText').innerHTML = st.text;
    $('tourBack').style.visibility = i ? 'visible' : 'hidden';
    $('tourNext').textContent = st.last ? "Let's play! 🍦" : 'Next ▶';
    placeTour();
  }

  function endTour() {
    tour.on = false;
    tour.focus = null;
    cam.back = true;
    $('tour').classList.add('hidden');
    try { localStorage.setItem('icecream-tour-done', '1'); } catch (e) {}
    startTutorial(); // then the step-by-step guide while you play
  }

  // move the spotlight ring (and the card) onto this step's place; runs every frame while the tour is on
  function placeTour() {
    if (!tour.on) return;
    const st = TOUR[tour.i];
    const ring = $('tourRing'), card = $('tourCard');
    let r = null;
    if (st.world) {
      const b = st.world();
      if (b) {
        tour.focus = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const c = canvas.getBoundingClientRect();
        r = { left: c.left + view.ox + b.x * view.scale, top: c.top + view.oy + b.y * view.scale, width: b.w * view.scale, height: b.h * view.scale };
      }
    } else if (st.dom) {
      tour.focus = null;
      const e = document.querySelector(st.dom);
      if (e) { const q = e.getBoundingClientRect(); r = { left: q.left - 8, top: q.top - 8, width: q.width + 16, height: q.height + 16 }; }
    }
    if (r) Object.assign(ring.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', opacity: 1 });
    else Object.assign(ring.style, { left: '50%', top: '50%', width: '0px', height: '0px', opacity: 0.99 });
    // the card goes where it doesn't cover the spotlight
    const low = r && r.top + r.height / 2 > window.innerHeight * 0.5;
    card.classList.toggle('atTop', !!low);
  }

  $('tourNext').addEventListener('click', () => { if (TOUR[tour.i].last) endTour(); else showTourStep(tour.i + 1); });
  $('tourBack').addEventListener('click', () => { if (tour.i > 0) showTourStep(tour.i - 1); });
  window.addEventListener('resize', placeTour);

  // ---------- Avatar Shop ----------
  const AVATAR_LABELS = {
    hat: { cap: 'Cap', none: 'No hat', tophat: 'Top hat', beanie: 'Beanie', party: 'Party hat',
      cowboy: 'Cowboy hat', wizard: 'Wizard hat', bunny: 'Bunny ears', cone: 'Ice cream hat', robo: '📡 Robo antennas', glass: '👑 Crystal crown', santa: '🎅 Santa hat' },
    face: { happy: 'Happy', cool: 'Sunglasses', wink: 'Wink', silly: 'Silly', wow: 'Wow', robo: '🤖 Robo visor', glass: '🔮 Prism mask', santa: '🎅 Santa glasses' },
  };
  const AVATAR_PARTS = [['shirt', 'Shirt'], ['pants', 'Pants'], ['skin', 'Skin'], ['hat', 'Hat'], ['face', 'Face']];

  // you try things on first; nothing changes until you press Save
  let avatarDraft = null;
  function openAvatar() {
    closeWindows();
    openWindow = 'avatar';
    const s = me();
    avatarDraft = s ? { ...s.avatar } : null;
    $('avatarModal').classList.remove('hidden');
    buildAvatarOptions();
  }

  function saveAvatar() {
    if (!avatarDraft) return;
    send({ type: 'setAvatar', avatar: avatarDraft });
    const s = me();
    if (s) { s.avatar = { ...avatarDraft }; confetti(player.x, player.y - 40, 25); }
    toast('💾 Saved! This is your new look.');
    closeWindows();
  }

  function buildAvatarOptions() {
    const s = me();
    if (!s || !avatarDraft) return;
    const box = $('avatarOptions');
    const changed = Object.keys(avatarDraft).some(k => avatarDraft[k] !== s.avatar[k]);
    $('avatarSave').textContent = changed ? '💾 Save' : '💾 Save (no changes yet)';
    box.innerHTML = '';
    for (const [part, label] of AVATAR_PARTS) {
      const row = document.createElement('div');
      row.className = 'avRow';
      row.innerHTML = `<div class="avLabel">${label}</div>`;
      const opts = document.createElement('div');
      opts.className = 'avOpts';
      for (const value of AVATAR[part].filter(v => (seeCyber || v !== 'robo') && (seeGlass || v !== 'glass') && (seeXmas || v !== 'santa'))) {
        const b = document.createElement('button');
        b.type = 'button';
        const isColor = part === 'shirt' || part === 'pants' || part === 'skin';
        b.className = 'avOpt' + (isColor ? ' swatch' : '') + (avatarDraft[part] === value ? ' on' : '');
        if (isColor) {
          if (value === 'robo') b.classList.add('robo'); // a piece of polished robot armor
          if (value === 'glass') b.classList.add('glass'); // a piece of rainbow glass
          else if (value === 'santa') b.classList.add('santa'); // 🎅 red Santa cloth with white fluff
          else b.style.background = value === 'stand' ? s.color : value;
          b.title = value === 'stand' ? 'Your stand color' : value === 'robo' ? 'Robo' : value === 'glass' ? 'Glass' : value === 'santa' ? 'Santa' : '';
        } else b.textContent = AVATAR_LABELS[part][value];
        b.addEventListener('click', () => {
          avatarDraft[part] = value; // try it on in the preview; Save makes it your look
          buildAvatarOptions();
        });
        opts.appendChild(b);
      }
      row.appendChild(opts);
      box.appendChild(row);
    }
  }

  // a big picture of your character in the Avatar Shop window
  function drawAvatarPreview(time) {
    const c = $('avatarPreview');
    const s = me();
    if (!s || openWindow !== 'avatar') return;
    const pctx = c.getContext('2d');
    const saved = ctx;
    ctx = pctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffe3ee';
    ctx.beginPath(); ctx.arc(c.width / 2, c.height / 2 + 10, 62, 0, Math.PI * 2); ctx.fill();
    ctx.translate(c.width / 2, c.height / 2 + 30);
    ctx.scale(2.2, 2.2);
    drawPlayer({ x: 0, y: 0, facing: 1, moving: false, color: s.color, avatar: avatarDraft || s.avatar, name: '', admin: s.admin }, time);
    ctx = saved;
  }
  $('shopClose').addEventListener('click', closeWindows);
  $('invClose').addEventListener('click', closeWindows);
  $('avatarClose').addEventListener('click', closeWindows);
  $('avatarSave').addEventListener('click', saveAvatar);

  function updateShop() {
    const s = me();
    if (!s) return;
    $('shopTimer').textContent = `New stock in ${clock(shop.left)}`;
    for (const f of shopFlavors()) {
      const row = f.shopRow;
      const left = (shop.stock[f.id] || 0) - (s.bought[f.id] || 0);
      const hidden = isSecretHidden(f, s);
      row.querySelector('.name').textContent = hidden ? '???' : f.name;
      const wrap = row.querySelector('.iconWrap');
      const icon = hidden ? '<div class="icon mystery">?</div>' : iconHtml(f.id);
      if (wrap.innerHTML !== icon) wrap.innerHTML = icon;
      const stock = row.querySelector('.stock');
      stock.textContent = left > 0 ? `x${left} in stock` : 'Out of stock';
      stock.className = 'stock ' + (left > 0 ? 'in' : 'out');
      row.classList.toggle('soldout', left <= 0);
      row.querySelector('button').disabled = left <= 0 || s.money < shopCost(f);
      if (f.adminOnly) row.classList.toggle('hidden', !(shop.stock[f.id] > 0));
    }
  }

  function updateInventory() {
    const s = me();
    if (!s) return;
    [...$('invGrid').children].forEach((cell, i) => {
      const html = slotHtml(s.storage[i]);
      if (cell.innerHTML !== html) cell.innerHTML = html;
    });
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
  $('testRestockBtn').addEventListener('click', () => send({ type: 'testRestock' }));
  // 🌱 Grow all: pick anyone playing (you too), and all the ice cream on their stand grows right now
  function openGrow() {
    closeWindows();
    openWindow = 'grow';
    $('growModal').classList.remove('hidden');
    const list = $('growList');
    list.innerHTML = '';
    const people = [...stands].sort((a, b) => (b.id === myId) - (a.id === myId)); // you first
    for (const st of people) {
      const growing = st.tubs.filter(t => t && t.grow > 0).length, total = st.tubs.filter(Boolean).length;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="who"><div class="name"></div>
        <div class="meta">${total} ice cream on their stand · ${growing ? `${growing} still growing` : 'all grown'}</div></div>
        <button type="button">🌱 Grow</button>`;
      row.querySelector('.name').textContent = (st.admin ? '👑 ' : '') + st.name + (st.id === myId ? ' (you)' : '');
      row.querySelector('button').addEventListener('click', () => { send({ type: 'adminGrow', to: st.id }); setTimeout(openGrow, 300); });
      list.appendChild(row);
    }
  }
  $('testGrowBtn').addEventListener('click', openGrow);

  // 💎 admins: give shards to anyone playing
  function openGiftShards() {
    closeWindows();
    openWindow = 'giftshards';
    $('giftShardsModal').classList.remove('hidden');
    const list = $('giftShardsList');
    list.innerHTML = '';
    for (const st of stands.filter(st => st.id !== myId)) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="who"><div class="name"></div>
        <div class="meta">${st.admin ? 'admin: unlimited shards' : `has 💎 ${(st.shards || 0).toLocaleString()}`}</div></div>
        <input type="number" min="1" max="1000000" value="100" ${st.admin ? 'disabled' : ''}>
        <button type="button" ${st.admin ? 'disabled' : ''}>💎 Give</button>`;
      row.querySelector('.name').textContent = (st.admin ? '👑 ' : '') + st.name;
      row.querySelector('button').addEventListener('click', () => {
        const amount = Math.floor(Number(row.querySelector('input').value) || 0);
        if (amount < 1) return toast('Type how many shards to give.');
        if (amount > 5000 && !confirm(`Give ${amount.toLocaleString()} shards to ${st.name}? That's a lot!`)) return;
        send({ type: 'adminGiftShards', to: st.id, amount });
        setTimeout(openGiftShards, 300);
      });
      list.appendChild(row);
    }
    if (!list.children.length) list.innerHTML = '<p class="sub">Nobody else is playing right now.</p>';
  }
  $('giftShardsBtn').addEventListener('click', openGiftShards);
  $('giftShardsClose').addEventListener('click', closeWindows);
  $('growClose').addEventListener('click', closeWindows);
  $('growEveryone').addEventListener('click', () => { send({ type: 'adminGrow', all: true }); setTimeout(openGrow, 300); });

  // ---------- admin commands (only work for admin names like "coolkid") ----------
  for (const f of FLAVORS) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = (f.adminOnly ? '👑 ' : '') + f.name;
    $('adminFlavor').appendChild(opt);
  }
  for (const t of TOPPINGS) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = (t.adminOnly ? '👑 ' : '') + `${t.emoji} ${t.name}`;
    $('adminFlavor').appendChild(opt);
  }
  document.querySelectorAll('#adminPanel [data-money]').forEach(btn =>
    btn.addEventListener('click', () => send({ type: 'adminMoney', amount: Number(btn.dataset.money) })));
  $('adminGiveBtn').addEventListener('click', () =>
    send({ type: 'adminGive', flavor: $('adminFlavor').value, count: Number($('adminCount').value) }));
  $('adminEndBtn').addEventListener('click', () => send({ type: 'adminEndMutation' }));
  // ⛅ weather events
  for (const [id, w] of Object.entries(WEATHERS)) {
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'mutChip weatherChip';
    chip.textContent = `${w.emoji} ${w.name}`;
    chip.title = `The ${petById[id].name}'s weather`;
    chip.addEventListener('click', () => send({ type: 'adminWeather', id }));
    $('adminWeatherChips').appendChild(chip);
  }
  $('adminWeatherOff').addEventListener('click', () => send({ type: 'adminWeather', id: 'off' }));
  // "/weather spirit", "/weather moonlit night", "/weather cosmic stag" all work
  const findWeather = t => Object.keys(WEATHERS).find(id => squash(id) === squash(t) || squash(WEATHERS[id].name).includes(squash(t)) ||
    squash(petById[id].name).includes(squash(t)));
  // 🎁 Give in Lucky Block: whatever you type comes out of a lucky block
  function giveInBlock() {
    const text = $('adminBlockInput').value.trim();
    if (!text) return toast('Type a pet or ice cream first, like dragon or void.');
    const pet = PETS.find(p => squash(p.id) === squash(text) || squash(p.name) === squash(text));
    const item = !pet && (findFlavor(text) || findTopping(text));
    if (!pet && !item) return toast(`"${text}" isn't a pet or ice cream. Try dragon, unicorn, void or cherry.`);
    send(pet ? { type: 'adminBlockGive', pet: pet.id } : { type: 'adminBlockGive', item: item.id });
    $('adminBlockInput').value = '';
  }
  $('adminBlockBtn').addEventListener('click', giveInBlock);
  $('adminBlockInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); giveInBlock(); } });
  $('refreshAllBtn').addEventListener('click', () => {
    if (confirm('Refresh the game for everyone playing? Their progress is saved, and they come right back in.')) send({ type: 'adminRefreshAll' });
  });
  $('adminShopBtn').addEventListener('click', () =>
    send({ type: 'adminShopSpawn', flavor: $('adminFlavor').value, count: Number($('adminCount').value) }));
  $('talkBtn').addEventListener('click', () => {
    $('talkRow').classList.toggle('hidden');
    if (!$('talkRow').classList.contains('hidden')) $('talkInput').focus();
  });
  function sendTalk() {
    const text = $('talkInput').value.trim();
    if (!text) return;
    send({ type: 'adminAnnounce', text });
    $('talkInput').value = '';
  }
  $('talkSend').addEventListener('click', sendTalk);
  $('talkInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendTalk(); } });
  $('adminSpawnBtn').addEventListener('click', () =>
    send({ type: 'adminSpawn', flavor: $('adminFlavor').value, count: Number($('adminCount').value) }));
  // pick several mutations, then turn them all on together
  const pickedMuts = new Set();
  for (const m of MUTATIONS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'mutChip';
    chip.textContent = `${m.emoji} ${m.name}`;
    chip.addEventListener('click', () => {
      if (pickedMuts.has(m.id)) pickedMuts.delete(m.id); else pickedMuts.add(m.id);
      chip.classList.toggle('on', pickedMuts.has(m.id));
    });
    $('adminMutChips').appendChild(chip);
  }
  $('adminMutBtn').addEventListener('click', () => {
    if (!pickedMuts.size) return toast('Tap some mutations first, then press Turn on.');
    send({ type: 'adminMutations', ids: [...pickedMuts] });
  });

  const squash = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const findTopping = t => TOPPINGS.find(f => squash(f.id) === squash(t) || squash(f.name) === squash(t));
  const findFlavor = t => FLAVORS.find(f => squash(f.id) === squash(t) || squash(f.name) === squash(t));
  const findMutation = t => MUTATIONS.find(m => squash(m.id) === squash(t) || squash(m.name) === squash(t));

  function parseAmount(t) {
    const m = String(t || '').toLowerCase().replace(/[$,]/g, '').match(/^(\d+(?:\.\d+)?)([a-z]*)$/);
    if (!m || !(m[2] in MONEY_WORDS)) return NaN;
    return Number(m[1]) * MONEY_WORDS[m[2]];
  }

  function runCommand(line) {
    const [cmd, ...args] = line.trim().replace(/^[/;:]/, '').split(/\s+/);
    switch ((cmd || '').toLowerCase()) {
      case 'money': {
        const amount = parseAmount(args[0]);
        if (!(amount > 0)) return toast('Try: /money 5t (k, m, b or t)');
        return send({ type: 'adminMoney', amount });
      }
      case 'give': {
        // the flavor name can have spaces: /give cookie dough 5
        let count = 1;
        if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) count = Number(args.pop());
        const f = findFlavor(args.join(' ')) || findTopping(args.join(' '));
        if (!f) return toast('Try: /give rainbow 5 (any flavor or topping name)');
        return send({ type: 'adminGive', flavor: f.id, count });
      }
      case 'shop': { // put any ice cream in the Supplies Shop: /shop void 3
        let count = 1;
        if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) count = Number(args.pop());
        const f = findFlavor(args.join(' '));
        if (!f) return toast('Try: /shop void 3 (any ice cream name)');
        return send({ type: 'adminShopSpawn', flavor: f.id, count });
      }
      case 'weather': {
        const t = args.join(' ');
        if (['off', 'stop', 'end'].includes(squash(t))) return send({ type: 'adminWeather', id: 'off' });
        const id = t && findWeather(t);
        if (!id) return toast('Try: /weather spirit, /weather moonlit, /weather heat … or /weather off');
        return send({ type: 'adminWeather', id });
      }
      case 'pet': case 'pets': {
        // put any pet in your pets: /pet dragon 2
        let count = 1;
        if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) count = Number(args.pop());
        const p = PETS.find(x => squash(x.id) === squash(args.join(' ')) || squash(x.name) === squash(args.join(' ')));
        if (!p) return toast('Try: /pet dragon (any pet name)');
        return send({ type: 'adminSpawnPet', pet: p.id, count });
      }
      case 'spawn': {
        // put an ice cream straight on your stand, fully grown: /spawn void 3
        let count = 1;
        if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) count = Number(args.pop());
        const f = findFlavor(args.join(' '));
        if (!f) return toast('Try: /spawn void 3 (any flavor name)');
        return send({ type: 'adminSpawn', flavor: f.id, count });
      }
      case 'glass': { // /glass on, /glass off, /glass auto (turn the Glass Event on or off to test it)
        const mode = (args[0] || '').toLowerCase();
        if (!['on', 'off', 'auto'].includes(mode)) return toast('Try: /glass on, /glass off or /glass auto');
        return send({ type: 'adminGlass', mode });
      }
      case 'christmas': case 'xmas': { // /christmas on, /christmas off, /christmas auto (turn the Christmas Event on or off)
        const mode = (args[0] || '').toLowerCase();
        if (!['on', 'off', 'auto'].includes(mode)) return toast('Try: /christmas on, /christmas off or /christmas auto');
        return send({ type: 'adminChristmas', mode });
      }
      case 'cyber': { // /cyber on, /cyber off, /cyber auto (turn the Cyber Event on or off to test it)
        if (!CYBER) return toast('The Cyber Event is only in the test file for now.');
        const mode = squash(args[0] || '');
        if (!['on', 'off', 'auto'].includes(mode)) return toast('Try: /cyber on, /cyber off or /cyber auto');
        return send({ type: 'adminCyber', mode });
      }
      case 'mutation': case 'mutations': case 'mutate': {
        if (squash(args[0]) === 'end' || squash(args[0]) === 'stop') return send({ type: 'adminEndMutation' });
        if (!args.length) return send({ type: 'testMutation' });
        // several at once: /mutation rainbow meteor sakura
        const words = args.join(' ').split(/[\s,+]+/).filter(Boolean);
        const ids = [];
        for (let i = 0; i < words.length; i++) {
          let found = null;
          for (let j = Math.min(words.length, i + 3); j > i && !found; j--) {
            const m = findMutation(words.slice(i, j).join(' '));
            if (m) { found = m; i = j - 1; }
          }
          if (!found) return toast(`"${words[i]}" isn't a mutation. Try: /mutation rainbow meteor sakura`);
          ids.push(found.id);
        }
        return send({ type: 'adminMutations', ids });
      }
      case 'say': case 'talk': {
        const text = line.trim().replace(/^[/;:]?\S+\s*/, '');
        if (!text) return toast('Try: /say Hello everyone!');
        return send({ type: 'adminAnnounce', text });
      }
      case 'restock': return send({ type: 'testRestock' });
      case 'grow': return send({ type: 'testGrow' });
      case 'resetpass': { // a player forgot their password: /resetpass bobby
        if (!args.length) return toast('Try: /resetpass bobby');
        return send({ type: 'adminResetPassword', name: args.join(' ') });
      }
      default:
        return toast('Commands: /say hi · /money 5t · /give mint 10 · /spawn void 3 · /mutation rainbow meteor · /mutation end · /restock · /grow');
    }
  }
  function runTypedCommand() {
    if (!$('adminCmd').value.trim()) return;
    runCommand($('adminCmd').value);
    $('adminCmd').value = '';
    $('adminCmd').blur();
  }
  $('adminRunBtn').addEventListener('click', runTypedCommand);
  $('adminCmd').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runTypedCommand(); } });

  const MOVE_KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };

  document.addEventListener('keydown', e => {
    if (!myId || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
    if (tour.on) {
      if (e.code === 'Enter' || e.code === 'ArrowRight' || e.code === 'Space') { e.preventDefault(); $('tourNext').click(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); $('tourBack').click(); }
      return;
    }
    if (MOVE_KEYS[e.code]) {
      e.preventDefault();
      keys.add(e.code);
      walkTarget = null;
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) scoop();
    } else if (/^Digit\d$/.test(e.code)) {
      const i = (Number(e.code.slice(5)) + 9) % 10; // 1..9 -> 0..8, 0 -> 9
      selectHand(hand === i ? -1 : i);
    } else if (e.code === 'Enter') {
      e.preventDefault();
      $('chat').classList.remove('collapsed');
      $('chatInput').focus();
    } else if (e.code === 'Escape') {
      closeWindows();
      selectHand(-1);
    }
  });
  document.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // walk to a spot, then do something there (tapping things that are far away)
  function goDo(target, reach, action) {
    if (dist(player, target) <= reach) { walkTarget = null; action(); return; }
    walkTarget = { x: target.x, y: target.y, reach, action };
  }

  const near = (p, extra = 0) => dist(player, p) <= REACH - 30 + extra;
  const inRect = (wx, wy, r) => wx > r.x && wx < r.x + r.w && wy > r.y && wy < r.y + r.h;

  canvas.addEventListener('pointerdown', e => {
    const s = me();
    if (!s) return;
    const rect = canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left - view.ox) / view.scale;
    const wy = (e.clientY - rect.top - view.oy) / view.scale;
    const slot = slots[s.slot];
    const stub = { x: slot.x, y: slot.y };

    if (spaceBtn && inRect(wx, wy, spaceBtn)) return send({ type: 'buySpace' });

    // the Inventory chest (and its button) on your plot
    const chest = chestPos(slot);
    if (inRect(wx, wy, { x: chest.x - 45, y: chest.y - 62, w: 90, h: 90 })) {
      return goDo(chest, REACH - 40, openInventory);
    }
    // the Avatar Shop
    if (inRect(wx, wy, { x: AVATAR_SHOP.x - 110, y: AVATAR_SHOP.y - 95, w: 220, h: 185 })) {
      return goDo({ x: AVATAR_SHOP.x, y: AVATAR_SHOP.y + 85 }, 60, openAvatar);
    }
    // the Sell Shop
    if (inRect(wx, wy, { x: SELL_SHOP.x - 120, y: SELL_SHOP.y - 100, w: 240, h: 190 })) {
      return goDo({ x: SELL_SHOP.x, y: SELL_SHOP.y + 90 }, 60, openSell);
    }
    // the Pet Shop
    if (inRect(wx, wy, { x: PET_SHOP.x - 130, y: PET_SHOP.y - 100, w: 260, h: 190 })) {
      return goDo({ x: PET_SHOP.x, y: PET_SHOP.y + 90 }, 60, openPetShop);
    }
    // the Supplies Shop
    if (inRect(wx, wy, { x: SHOP.x - 150, y: SHOP.y - 100, w: 300, h: 200 })) {
      return goDo({ x: SHOP.x, y: SHOP.y + 90 }, 60, openShop);
    }
    // a space on your stand
    for (let i = 0; i < s.spaces; i++) {
      const p = tubPos(slot, i, s.spaces);
      if (Math.hypot(wx - p.x, wy - p.y) < 13 * p.s) {
        const tub = s.tubs[i];
        if (tub && heldItem() && toppingById[heldItem().flavor]) {
          return goDo(stub, REACH - 40, () => send({ type: 'place', space: i }));
        }
        if (heldItem() && !tub) return goDo(stub, REACH - 40, () => send({ type: 'place', space: i }));
        if (tub) return goDo(stub, REACH - 40, () => send({ type: 'takeOut', space: i }));
        return toast('Pick an ice cream in your hotbar, then tap a dashed space to place it.');
      }
    }
    // the rest of your stand: place into the first empty space
    if (heldItem() && Math.abs(wx - slot.x) < 95 && wy > slot.y - 70 && wy < slot.y + 65) {
      return goDo(stub, REACH - 40, () => send({ type: 'place', space: -1 }));
    }
    // anywhere else: walk there
    walkTarget = { x: wx, y: wy, reach: 4, action: null };
  });

  // ---------- movement ----------
  const PLAYER_SPEED = 260;
  let sendTimer = 0;
  let lastSent = { x: -1, y: -1 };

  function updatePlayer(dt) {
    if (!player.placed) return;
    let vx = 0, vy = 0;
    for (const k of keys) { vx += MOVE_KEYS[k][0]; vy += MOVE_KEYS[k][1]; }
    if (!vx && !vy && walkTarget) {
      const dx = walkTarget.x - player.x, dy = walkTarget.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d <= Math.max(walkTarget.reach, PLAYER_SPEED * dt)) {
        const action = walkTarget.action;
        walkTarget = null;
        if (action) action();
      } else { vx = dx / d; vy = dy / d; }
    }
    const len = Math.hypot(vx, vy);
    player.moving = len > 0;
    if (len > 0) {
      player.x = Math.max(10, Math.min(world.width - 10, player.x + (vx / len) * PLAYER_SPEED * dt));
      player.y = Math.max(20, Math.min(world.height - 10, player.y + (vy / len) * PLAYER_SPEED * dt));
      if (vx) player.facing = vx > 0 ? 1 : -1;
    }

    sendTimer -= dt;
    if (sendTimer <= 0 && (Math.abs(player.x - lastSent.x) > 1 || Math.abs(player.y - lastSent.y) > 1)) {
      send({ type: 'move', x: Math.round(player.x), y: Math.round(player.y) });
      lastSent = { x: player.x, y: player.y };
      sendTimer = 0.1;
    }

    // close windows when you walk away
    const s = me();
    if (openWindow === 'shop' && dist(player, { x: SHOP.x, y: SHOP.y + 90 }) > REACH) closeWindows();
    if (openWindow === 'avatar' && dist(player, { x: AVATAR_SHOP.x, y: AVATAR_SHOP.y + 85 }) > REACH) closeWindows();
    if (openWindow === 'petshop' && dist(player, { x: PET_SHOP.x, y: PET_SHOP.y + 90 }) > REACH) closeWindows();
    if (openWindow === 'sell' && dist(player, { x: SELL_SHOP.x, y: SELL_SHOP.y + 90 }) > REACH) closeWindows();
    if (openWindow === 'inventory' && s && !near(chestPos(slots[s.slot]), 40)) closeWindows();
  }

  // ---------- rendering ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.w = rect.width; view.h = rect.height;
    // zoom so about 860 x 620 of the park is visible
    view.scale = Math.max(rect.width / 860, rect.height / 620);
  }
  window.addEventListener('resize', resize);

  // the camera follows your character
  const cam = { x: null, y: null, back: false };
  function updateCamera(dt = 0) {
    // follow your character; during the tour, fly to what it's showing (and glide back after)
    const want = tour.on && tour.focus ? tour.focus : player;
    if (cam.x !== null && (tour.on || cam.back)) {
      const k = Math.min(1, dt * 4);
      cam.x += (want.x - cam.x) * k; cam.y += (want.y - cam.y) * k;
      if (!tour.on && Math.hypot(want.x - cam.x, want.y - cam.y) < 3) cam.back = false;
    } else { cam.x = want.x; cam.y = want.y; }
    const sw = world.width * view.scale, sh = world.height * view.scale;
    const ox = view.w / 2 - cam.x * view.scale, oy = view.h / 2 - cam.y * view.scale;
    view.ox = sw <= view.w ? (view.w - sw) / 2 : Math.min(0, Math.max(view.w - sw, ox));
    view.oy = sh <= view.h ? (view.h - sh) / 2 : Math.min(0, Math.max(view.h - sh, oy));
  }

  // a lighter (k > 0) or darker (k < 0) version of a #rrggbb color
  const tintCache = {};
  function tint(hex, k) {
    const key = hex + k;
    if (tintCache[key]) return tintCache[key];
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const ch = i => {
      const c = parseInt(hex.slice(i, i + 2), 16);
      return Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
    };
    return (tintCache[key] = `rgb(${ch(1)}, ${ch(3)}, ${ch(5)})`);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) return ctx.roundRect(x, y, w, h, r);
    // older browsers without roundRect
    r = Math.min(Array.isArray(r) ? r[0] : r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPark(time) {
    ctx.fillStyle = '#8fd16a';
    ctx.fillRect(0, 0, world.width, world.height);
    // grass tufts
    ctx.fillStyle = '#7cc257';
    for (let i = 0; i < 170; i++) {
      const x = (i * 397) % world.width, y = (i * 263) % world.height;
      ctx.beginPath(); ctx.ellipse(x, y, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ecd9b0';
    // paths between rows of stands
    for (let i = 0; i < slots.length; i += 4) {
      ctx.fillRect(0, slots[i].y + 75, world.width, 115);
    }
    // the shop plaza down the middle of the park, with stone tiles
    const px = SHOP.x - 245, pw = 490;
    ctx.fillStyle = '#e8d3a8';
    ctx.fillRect(px, 0, pw, world.height);
    ctx.strokeStyle = 'rgba(160, 120, 70, 0.18)';
    ctx.lineWidth = 2;
    for (let y = 0; y < world.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke();
      for (let x = px + ((y / 40) % 2) * 30; x < px + pw; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 40); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#c9a66b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, world.height); ctx.moveTo(px + pw, 0); ctx.lineTo(px + pw, world.height); ctx.stroke();
    // flowers along the plaza edges
    for (let y = 30; y < world.height; y += 75) {
      for (const x of [px + 12, px + pw - 12]) {
        ctx.fillStyle = ['#ff6b6b', '#fcc419', '#cc5de8', '#4dabf7'][(y / 75 | 0) % 4];
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * Math.PI * 2;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#fff3bf';
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // trees in the gaps between stands
    for (let i = 0; i < slots.length; i += 4) {
      for (const x of [22, 326, 1473, 1778]) drawTree(x, slots[i].y - 40);
    }
    for (const x of [60, 200, 340, 520, 1280, 1460, 1600, 1740]) drawTree(x, 40);
  }

  function drawTree(x, y) {
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(x - 4, y, 8, 18);
    ctx.fillStyle = '#4c9a3a';
    ctx.beginPath(); ctx.arc(x, y - 4, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5db347';
    ctx.beginPath(); ctx.arc(x - 6, y - 10, 10, 0, Math.PI * 2); ctx.fill();
  }

  function drawShop(time) {
    const { x, y } = SHOP;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 72, 150, 14, 0, 0, Math.PI * 2); ctx.fill();
    // building
    ctx.fillStyle = '#fff4e6';
    roundRect(x - 130, y - 40, 260, 110, 8); ctx.fill();
    ctx.strokeStyle = '#d9a35b'; ctx.lineWidth = 3; ctx.stroke();
    // door and windows
    ctx.fillStyle = '#b5651d';
    roundRect(x - 22, y + 10, 44, 60, 6); ctx.fill();
    ctx.fillStyle = '#9ad7ff';
    roundRect(x - 110, y + 5, 60, 40, 6); ctx.fill();
    roundRect(x + 50, y + 5, 60, 40, 6); ctx.fill();
    // ice cream tubs in the windows
    ['#ff8fab', '#a8e6cf', '#fff3c4', '#6b3e26'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x - 98 + (i % 2) * 36 + (i > 1 ? 160 : 0), y + 34, 9, Math.PI, 0); ctx.fill();
    });
    // roof
    ctx.fillStyle = '#ff6fa5';
    ctx.beginPath();
    ctx.moveTo(x - 150, y - 38); ctx.lineTo(x, y - 100); ctx.lineTo(x + 150, y - 38);
    ctx.fill();
    // giant cone on the roof
    drawCone(x, y - 108, { color: '#ffb3cf' }, 22);
    // sign
    ctx.fillStyle = '#fff';
    roundRect(x - 95, y - 66, 190, 26, 8); ctx.fill();
    ctx.strokeStyle = '#ff6fa5'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#e0457b';
    ctx.font = 'bold 16px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText('SUPPLIES SHOP', x, y - 47);
    // restock timer
    ctx.fillStyle = 'rgba(40, 20, 35, 0.8)';
    roundRect(x - 80, y + 78, 160, 24, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Trebuchet MS';
    ctx.fillText(`New stock in ${clock(shop.left)}`, x, y + 95);
    if (dist(player, { x, y: y + 90 }) <= REACH && openWindow !== 'shop') {
      drawBubbleButton(x, y + 128, '🛒 Tap the shop: ice cream & toppings', '#ff6fa5', time);
    }
  }

  function drawBubbleButton(x, y, text, color, time) {
    ctx.font = 'bold 14px Trebuchet MS';
    const w = ctx.measureText(text).width + 20;
    const bob = Math.sin(time * 4) * 2;
    ctx.fillStyle = color;
    roundRect(x - w / 2, y - 13 + bob, w, 26, 10); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 5 + bob);
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
    ctx.fillText('Empty plot', slot.x, slot.y + 6);
    ctx.restore();
  }

  function drawChest(s, time) {
    const slot = slots[s.slot];
    const { x, y } = chestPos(slot);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 22, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a0662d';
    roundRect(x - 24, y - 6, 48, 28, 4); ctx.fill();
    ctx.fillStyle = '#c47f3a';
    roundRect(x - 24, y - 18, 48, 14, [8, 8, 2, 2]); ctx.fill();
    ctx.fillStyle = '#ffd43b';
    ctx.fillRect(x - 4, y - 8, 8, 9);
    ctx.strokeStyle = '#6e4317'; ctx.lineWidth = 2;
    roundRect(x - 24, y - 18, 48, 40, 4); ctx.stroke();
    if (s.id === myId) {
      // the Inventory button on your plot
      ctx.font = 'bold 13px Trebuchet MS';
      const text = '🎒 Inventory';
      const w = ctx.measureText(text).width + 16;
      const glow = near({ x, y }, 40) ? 1 : 0.85;
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#845ef7';
      roundRect(x - w / 2, y - 50, w, 24, 9); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y - 33);
      ctx.globalAlpha = 1;
    }
  }

  function drawTub(s, i, slot, time, holding) {
    // smaller tubs when the stand has lots of spaces
    const p = tubPos(slot, i, s.spaces);
    ctx.save();
    ctx.translate(p.x, p.y); ctx.scale(p.s, p.s); ctx.translate(-p.x, -p.y);
    drawTubAt(s, i, p, time, holding);
    ctx.restore();
  }

  function drawTubAt(s, i, p, time, holding) {
    const tub = s.tubs[i];
    const mine = s.id === myId;
    if (!tub) {
      if (mine && holding === 'tub') {
        // moving dashed outline: "you can place your ice cream here"
        ctx.strokeStyle = '#ff2e7e';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.lineDashOffset = -time * 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, 10.5 + Math.sin(time * 5) * 0.8, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    const f = flavorById[tub.flavor];
    const total = RARITIES[f.rarity].growSec;
    const progress = tub.grow > 0 ? 1 - tub.grow / total : 1;
    // tub
    ctx.fillStyle = '#e9ecef';
    roundRect(p.x - 9, p.y, 18, 9, 2); ctx.fill();
    // scoop grows bigger until it's ready; special effects show once it's grown
    const sr = 3 + 6.5 * progress;
    const ready = tub.grow <= 0;
    if (ready && f.effect) drawFlavorFx(f, p.x, p.y - sr * 0.3, sr * 0.85, true, i);
    fillScoop(ready ? f : { color: f.color }, p.x, p.y + 1, sr, true);
    if (ready && f.effect) drawFlavorFx(f, p.x, p.y - sr * 0.3, sr * 0.85, false, i);
    if (tub.topping) drawTopping(tub.topping, p.x, p.y - sr * 0.55, sr, time, i);
    if (mine && holding === 'topping' && !tub.topping) {
      // dashed ring: "you can put your topping on this one"
      ctx.strokeStyle = '#ff2e7e';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.lineDashOffset = -time * 12;
      ctx.beginPath(); ctx.arc(p.x, p.y - 1, 13 + Math.sin(time * 5) * 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    if (tub.grow > 0) {
      ctx.strokeStyle = '#2fb344';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y + 2, 12, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
      if (mine) {
        ctx.font = 'bold 9px Trebuchet MS';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1b5e20';
        ctx.fillText(tub.grow >= 60 ? `${Math.ceil(tub.grow / 60)}m` : `${Math.ceil(tub.grow)}s`, p.x, p.y - 10);
      }
    }
  }

  // ---------- 🐾 pets in the park, with their effects ----------
  const petPos = new Map();      // stand id -> where their pet is drawn
  const petParticles = [];
  const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

  function petSpark(x, y, o) {
    if (petParticles.length > 400) return;
    petParticles.push({ x, y, vx: 0, vy: -20, t: 0, life: 1, size: 3, color: '#fff', shape: 'dot', ...o });
  }

  // a hue (0-360) as '255, 0, 0' for glow()
  function hueRgb(h) {
    const f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return `${f(0)}, ${f(8)}, ${f(4)}`;
  }

  // pets move like real animals: walkers trot and sit, bunnies hop, penguins waddle,
  // birds and dragons flap in the air, and sea creatures swim through it
  const PET_SIZE = { candysnake: 1.35, reindeer: 1.3, voidkraken: 1.4, cosmicstag: 1.5, ancientmammoth: 1.6, swampleviathan: 1.5, stormbison: 1.55, galaxyshark: 1.35, solarlion: 1.25, metalrhino: 1.25, dragon: 1.45, cyberwhale: 1.8, glasswolf: 1.7, glasselephant: 1.35, glassrhino: 1.25, glasscroc: 1.3, rex: 1.5, shark: 1.4, dove: 1.3, dragonking: 1.6, infinity: 1.75 };

  // ⚡ the Cyber look: glowing cyan cracks between dark armor plates, a glowing ring core, and crackling lightning
  const CYAN = '#2ee8ff';
  function seam(pts, w = 1) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = CYAN; ctx.shadowBlur = 6 * w;
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1.3 * w;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#d9fdff'; ctx.lineWidth = 0.45 * w; ctx.stroke();
    ctx.restore();
  }
  function cyberRing(x, y, r) {
    ctx.save();
    ctx.fillStyle = '#0b1116';
    ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = CYAN; ctx.shadowBlur = r * 3;
    ctx.strokeStyle = CYAN; ctx.lineWidth = r * 0.45;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#d9fdff'; ctx.lineWidth = r * 0.16;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // a glowing hexagon outline (for shields, rings and sparks)
  function hexagon(x, y, r, rot = 0, w = 1, alpha = 1, plain = false) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y); ctx.rotate(rot);
    const pts = [];
    for (let k = 0; k <= 6; k++) pts.push([Math.cos(k * Math.PI / 3) * r, Math.sin(k * Math.PI / 3) * r]);
    if (plain) { // no blur: fast enough to draw lots of them
      ctx.strokeStyle = CYAN; ctx.lineWidth = 1.6 * w;
      ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
    } else seam(pts, w);
    ctx.restore();
  }
  // a thick plasma beam that fades out at the end
  function plasmaBeam(x1, y1, x2, y2, w) {
    ctx.save();
    ctx.lineCap = 'round';
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, 'rgba(46, 232, 255, 0.95)'); g.addColorStop(0.7, 'rgba(46, 232, 255, 0.55)'); g.addColorStop(1, 'rgba(46, 232, 255, 0)');
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.shadowColor = CYAN; ctx.shadowBlur = w * 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const core = ctx.createLinearGradient(x1, y1, x2, y2);
    core.addColorStop(0, 'rgba(255,255,255,0.95)'); core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = core; ctx.lineWidth = w * 0.35; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  // a jagged lightning bolt (it's different every frame, so it crackles)
  function zap(x1, y1, x2, y2, jit = 4, w = 1) {
    const pts = [[x1, y1]], n = 6;
    for (let i = 1; i < n; i++) pts.push([x1 + (x2 - x1) * i / n + (Math.random() - 0.5) * jit * 2, y1 + (y2 - y1) * i / n + (Math.random() - 0.5) * jit * 2]);
    pts.push([x2, y2]);
    seam(pts, w);
  }

  // ⚡ the Cyber Block pets: the animal made of dark armor with glowing cyan cracks and a glowing ring core.
  // Each one is drawn once into a picture, then reused.
  const cyberSprites = {};
  function makeCyberPet(emoji) {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const saved = ctx;
    ctx = c.getContext('2d');
    ctx.font = `120px ${EMOJI_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.filter = 'grayscale(1) brightness(0.5) contrast(1.4)';
    ctx.fillText(emoji, 80, 140);
    ctx.filter = 'none';
    // everything below only paints on the animal itself
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(10, 60, 80, 0.35)';
    ctx.fillRect(0, 0, 160, 160);
    seam([[0, 92], [30, 86], [50, 96], [80, 88], [108, 98], [160, 90]], 3);
    seam([[50, 96], [44, 66], [54, 34]], 2.6);
    seam([[108, 98], [114, 126], [104, 152]], 2.6);
    seam([[80, 88], [86, 56], [80, 24]], 2.4);
    seam([[14, 120], [40, 126], [66, 136]], 2.2);
    seam([[118, 60], [136, 70], [150, 112]], 2.2);
    cyberRing(80, 100, 10);
    ctx = saved;
    return c;
  }
  function cyberPetModel(id, emoji) {
    return time => {
      if (!cyberSprites[id]) cyberSprites[id] = makeCyberPet(emoji);
      ctx.drawImage(cyberSprites[id], -20, -25, 40, 40);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(time * 4);
      glow(0, -5, 6, '46, 232, 255', 1);
      ctx.restore();
    };
  }

  // ⚡ the Cyber Whale, the best pet: the whale (like the Cosmic Whale) made of dark armor
  // with glowing cyan cracks and a glowing ring core. It's drawn once into a picture, then reused.
  let cyberWhaleSprite = null;
  function makeCyberWhale() {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const saved = ctx;
    ctx = c.getContext('2d');
    // the whale, darkened into gunmetal armor
    ctx.font = `120px ${EMOJI_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.filter = 'grayscale(1) brightness(0.5) contrast(1.4)';
    ctx.fillText('🐋', 80, 140);
    ctx.filter = 'none';
    // everything below only paints on the whale itself
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(10, 60, 80, 0.35)';
    ctx.fillRect(0, 0, 160, 160);
    seam([[0, 92], [30, 88], [44, 96], [70, 90], [96, 98], [124, 92], [160, 96]], 3.2);
    seam([[44, 96], [40, 70], [48, 40]], 3);
    seam([[96, 98], [104, 126], [98, 150]], 3);
    seam([[124, 92], [132, 64], [150, 54]], 2.6);
    seam([[16, 118], [40, 122], [64, 132]], 2.4);
    seam([[70, 90], [76, 60], [72, 30]], 2.4);
    cyberRing(82, 104, 11);
    ctx = saved;
    return c;
  }
  function drawCyberWhale(time) {
    if (!cyberWhaleSprite) cyberWhaleSprite = makeCyberWhale();
    // drawn where the emoji would be: centered, with its bottom at y = 10
    ctx.drawImage(cyberWhaleSprite, -20, -25, 40, 40);
    // the ring core pulses
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(time * 4);
    glow(0.5, -5, 7, '46, 232, 255', 1);
    ctx.restore();
  }
  // pets drawn as pictures instead of their emoji
  // 🔮 the Glass look: the animal made of see-through glass, with rainbow light bending through it,
  // bright streaks where the light hits, and a twinkle that slides across it
  const glassSprites = {};
  function makeGlassPet(emoji) {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const saved = ctx;
    ctx = c.getContext('2d');
    ctx.font = `120px ${EMOJI_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.filter = 'grayscale(1) brightness(1.55) contrast(0.75)';
    ctx.fillText(emoji, 80, 140);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-atop'; // everything below only paints on the animal itself
    ctx.fillStyle = 'rgba(165, 216, 255, 0.45)';    // a pale blue glass tint
    ctx.fillRect(0, 0, 160, 160);
    const rainbow = ctx.createLinearGradient(0, 160, 160, 0); // light splitting into colors inside the glass
    [0, 50, 120, 200, 280, 330].forEach((h, i, a) => rainbow.addColorStop(i / (a.length - 1), `hsla(${h}, 100%, 70%, 0.3)`));
    ctx.fillStyle = rainbow;
    ctx.fillRect(0, 0, 160, 160);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';       // bright streaks where the light hits
    ctx.beginPath(); ctx.moveTo(30, 20); ctx.lineTo(56, 20); ctx.lineTo(16, 150); ctx.lineTo(-10, 150); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath(); ctx.moveTo(78, 20); ctx.lineTo(88, 20); ctx.lineTo(48, 150); ctx.lineTo(38, 150); ctx.fill();
    ctx = saved;
    return c;
  }
  function glassPetModel(id, emoji, best) {
    return time => {
      if (!glassSprites[id]) glassSprites[id] = makeGlassPet(emoji);
      ctx.save();
      ctx.globalAlpha = 0.8;                             // you can see through it
      ctx.shadowColor = 'rgba(255, 255, 255, 0.95)'; ctx.shadowBlur = 5; // its glassy edge
      if (best) ctx.filter = `hue-rotate(${Math.sin(time * 1.5) * 40}deg) saturate(1.4)`; // the best one shimmers
      ctx.drawImage(glassSprites[id], -20, -25, 40, 40);
      ctx.restore();
      // a twinkle sliding across the glass
      const t = (time * 0.6) % 2;
      if (t < 1) star(-14 + t * 28, -18 + t * 14, 2.2 + Math.sin(t * Math.PI) * 1.5, '#ffffff');
    };
  }
  // a little piece of glass (for the glass pets, storms and the Glass Block)
  function glassShard(x, y, s, rot, hue, alpha = 1) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= alpha;
    ctx.fillStyle = `hsla(${hue}, 100%, 85%, 0.55)`;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'; ctx.lineWidth = Math.max(0.6, s * 0.12);
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.55, s * 0.6); ctx.lineTo(-s * 0.45, s * 0.35); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }


  // 🐲 elemental beasts: the emoji gets painted like the pictures (fire, ice crystal, void, chrome, galaxy, spirit…)
  // body = the painted animal, veins = glowing lines that pulse on top of it, rim = the color of its glowing outline
  const BEAST_LOOKS = {
    unicorn:     { colors: ['#ffffff', '#ffe3fa', '#e5dbff'], keep: 0.55, veins: 'rainbow', rim: 'rainbow' },
    icephoenix:  { colors: ['#ffffff', '#99e9f2', '#1c7ed6'], veins: 'frost', rim: '#74c0fc' },
    leviathan:   { colors: ['#3bc9db', '#1864ab', '#0b1d51'], veins: 'waves', rim: '#22b8cf' },
    frostdragon: { colors: ['#ffffff', '#a5d8ff', '#4263eb'], veins: 'crystal', rim: '#91a7ff' },
    voidbear:    { colors: ['#9c36b5', '#3b0a6b', '#0a0014'], dark: 0.5, veins: 'cracks', rim: '#d63cff' },
    crystalfox:  { colors: ['#ffffff', '#c5f6fa', '#3bc9db'], veins: 'crystal', rim: '#66d9e8' },
    solarlion:   { colors: ['#fff3bf', '#ffb000', '#e8590c'], veins: 'flames', rim: '#ff922b' },
    metalrhino:  { colors: ['#f8f9fa', '#868e96', '#212529'], veins: 'chrome', rim: '#74c0fc' },
    galaxyshark: { colors: ['#748ffc', '#5f3dc4', '#1a0b4d'], dark: 0.3, veins: 'stars', rim: '#b197fc' },
    spirittiger: { colors: ['#e3fafc', '#66d9e8', '#1098ad'], veins: 'stripes', rim: '#3bc9db' },
    voidkraken:  { colors: ['#e64980', '#7b2cbf', '#10002b'], dark: 0.35, veins: 'spots', rim: '#ff2bd6' },
    // 🌙 the 4 Astral beasts
    cosmicstag:     { colors: ['#e5dbff', '#5f3dc4', '#1a0b4d'], dark: 0.15, veins: 'stars', rim: '#b197fc' },
    ancientmammoth: { colors: ['#e7f5ff', '#4dabf7', '#1c3d5a'], veins: 'crystal', rim: '#74c0fc' },
    swampleviathan: { colors: ['#d8f5a2', '#2b8a3e', '#0b2e0b'], veins: 'spots', rim: '#69db7c' },
    stormbison:     { colors: ['#dee2e6', '#5c7cfa', '#1b2238'], veins: 'cracks', veinColor: '#a5d8ff', rim: '#74c0fc' },
    // 🎄 the Christmas Block pets
    gingercat:    { colors: ['#ffe8cc', '#c2692e', '#6b3410'], veins: 'icing', rim: '#ffd43b' },
    santapenguin: { colors: ['#ffffff', '#ffc9c9', '#1a1a2e'], keep: 0.4, veins: 'lights', rim: '#ff6b6b' },
    arcticfox:    { colors: ['#ffffff', '#e7f5ff', '#a5d8ff'], bright: 0.55, veins: 'frost', rim: '#a5d8ff' },
    nutcracker:   { colors: ['#ffd8a8', '#c92a2a', '#5c1a00'], veins: 'chrome', rim: '#ffd43b' },
    snowseal:     { colors: ['#ffffff', '#d0ebff', '#748ffc'], keep: 0.3, veins: 'lights', rim: '#74c0fc' },
    polarbear:    { colors: ['#ffffff', '#f1f3f5', '#a5d8ff'], bright: 0.5, veins: 'lights', rim: '#ffd43b' },
    frostyowl:    { colors: ['#ffffff', '#d0ebff', '#4dabf7'], bright: 0.4, veins: 'frost', rim: '#a5d8ff' },
    reindeer:     { colors: ['#ffe8cc', '#a0522d', '#4a2410'], veins: 'lights', rim: '#ffd43b' },
    // ✨ every regular pet gets painted too (the cute common ones keep some of their own colors)
    puppy:      { colors: ['#fff4e6', '#ffa94d', '#c2410c'], keep: 0.6, veins: 'spots', rim: '#ff8787' },
    kitty:      { colors: ['#fff0f6', '#f783ac', '#862e9c'], keep: 0.6, veins: 'stripes', rim: '#f783ac' },
    bunny:      { colors: ['#ffffff', '#ffdeeb', '#e599f7'], keep: 0.6, veins: 'stars', rim: '#faa2c1' },
    fox:        { colors: ['#fff3bf', '#ff6b00', '#7a1f00'], keep: 0.3, veins: 'flames', rim: '#ff6b00' },
    panda:      { colors: ['#ffffff', '#b2f2bb', '#2b8a3e'], keep: 0.5, veins: 'stripes', rim: '#51cf66' },
    penguin:    { colors: ['#ffffff', '#a5d8ff', '#1c3d5a'], keep: 0.3, veins: 'frost', rim: '#74c0fc' },
    owl:        { colors: ['#e5dbff', '#5c7cfa', '#1a1b4b'], veins: 'stars', rim: '#748ffc' },
    kraken:     { colors: ['#c5f6fa', '#1098ad', '#0b2e3d'], veins: 'waves', rim: '#3bc9db' },
    lion:       { colors: ['#e5dbff', '#7048e8', '#1a0b4d'], veins: 'stars', rim: '#9775fa' },
    rex:        { colors: ['#ffe066', '#ff4500', '#3b0d00'], dark: 0.15, veins: 'flames', rim: '#ff4500' },
    shark:      { colors: ['#e7f5ff', '#4dabf7', '#0b1d51'], veins: 'cracks', veinColor: '#d0ebff', rim: '#4dabf7' },
    dove:       { colors: ['#ffffff', '#fff3bf', '#ffd43b'], bright: 0.6, veins: 'stars', rim: '#ffe066' },
    dragonking: { colors: ['#fff3bf', '#fcc419', '#a35f00'], veins: 'chrome', rim: '#ffd43b' },
    infinity:   { colors: ['#ffffff', '#ff8cc6', '#7048e8'], veins: 'rainbow', rim: 'rainbow' },
  };
  const beastSprites = {};
  function makeBeast(emoji, look) {
    const S = 160, mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
    const mask = mk(), body = mk(), veins = mk();
    const m = mask.getContext('2d');
    m.font = `120px ${EMOJI_FONT}`; m.textAlign = 'center'; m.textBaseline = 'bottom';
    m.fillText(emoji, 80, 140);
    // shading only (gray), so the new colors keep the animal's shape and details
    const g = body.getContext('2d');
    const img = m.getImageData(0, 0, S, S), d = img.data, keep = look.keep || 0;
    const orig = new Uint8ClampedArray(d);
    for (let i = 0; i < d.length; i += 4) {
      let l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      l = Math.min(1, Math.max(0, (l - 0.5) * 1.35 + 0.55)); // more contrast
      d[i] = d[i + 1] = d[i + 2] = l * 255;
    }
    g.putImageData(img, 0, 0);
    // the new colors: light on top, dark underneath, keeping the shading
    const grad = g.createLinearGradient(30, 20, 130, 150);
    look.colors.forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
    g.globalCompositeOperation = 'multiply'; g.fillStyle = grad; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'screen'; g.globalAlpha = look.bright || 0.35; g.fillRect(0, 0, S, S); g.globalAlpha = 1;
    if (look.dark) { g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(20, 0, 40, ${look.dark})`; g.fillRect(0, 0, S, S); }
    if (keep) { // a bit of the original colors stays (the unicorn keeps its pink mane)
      const o = mk(), oc = o.getContext('2d'), oi = oc.createImageData(S, S); oi.data.set(orig); oc.putImageData(oi, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = keep; g.drawImage(o, 0, 0); g.globalAlpha = 1;
    }
    // the texture of its element, drawn on the body (bright) and copied as glowing veins
    const v = veins.getContext('2d');
    const rnd = (k => () => ((k = (k * 9301 + 49297) % 233280) / 233280))(emoji.codePointAt(0) % 1000 + look.colors[0].length);
    const tex = (c, glow) => {
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      switch (look.veins) {
        case 'crystal': case 'frost': // sharp crystal facets with bright edges
          for (let k = 0; k < 14; k++) {
            const x = 25 + rnd() * 110, y = 25 + rnd() * 110, sz = 8 + rnd() * 16;
            c.strokeStyle = glow ? '#e3fafc' : 'rgba(255,255,255,0.75)'; c.lineWidth = glow ? 2 : 1.5;
            c.fillStyle = `rgba(255,255,255,${glow ? 0 : 0.18})`;
            c.beginPath(); c.moveTo(x, y - sz); c.lineTo(x + sz * 0.6, y); c.lineTo(x, y + sz * 0.8); c.lineTo(x - sz * 0.6, y); c.closePath(); c.fill(); c.stroke();
          }
          if (!glow) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.moveTo(40, 20); c.lineTo(60, 20); c.lineTo(25, 150); c.lineTo(5, 150); c.fill(); }
          break;
        case 'flames': // flame streaks licking upward
          for (let k = 0; k < 12; k++) {
            const x = 20 + rnd() * 120, y = 60 + rnd() * 90, h = 20 + rnd() * 30;
            c.fillStyle = glow ? (k % 2 ? '#ffd43b' : '#ff6b00') : `rgba(255, ${150 + k * 8}, 0, 0.28)`;
            c.beginPath(); c.moveTo(x - 6, y); c.quadraticCurveTo(x - 4, y - h * 0.6, x + (rnd() - 0.5) * 8, y - h); c.quadraticCurveTo(x + 4, y - h * 0.6, x + 6, y); c.fill();
          }
          break;
        case 'cracks': // glowing cracks of void energy
          for (let k = 0; k < 7; k++) {
            let x = 20 + rnd() * 120, y = 20 + rnd() * 120;
            c.strokeStyle = look.veinColor || (glow ? '#f783ff' : '#da77f2'); c.lineWidth = glow ? 2.5 : 1.8;
            c.beginPath(); c.moveTo(x, y);
            for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; c.lineTo(x, y); }
            c.stroke();
          }
          for (let k = 0; k < 18; k++) { c.fillStyle = '#ffffff'; c.fillRect(20 + rnd() * 120, 20 + rnd() * 120, 1.6, 1.6); }
          break;
        case 'chrome': // shiny metal bands, plates and rivets
          for (let k = 0; k < 5; k++) {
            const y = 30 + k * 24;
            c.fillStyle = glow ? 'rgba(116, 192, 252, 0.0)' : 'rgba(255,255,255,0.35)'; c.fillRect(0, y, S, 5);
            c.strokeStyle = glow ? '#74c0fc' : 'rgba(0,0,0,0.35)'; c.lineWidth = glow ? 1.5 : 1;
            c.beginPath(); c.moveTo(0, y + 12); c.lineTo(S, y + 12); c.stroke();
          }
          for (let k = 0; k < 14; k++) { c.fillStyle = glow ? '#a5d8ff' : '#dee2e6'; c.beginPath(); c.arc(20 + rnd() * 120, 20 + rnd() * 120, 2.2, 0, Math.PI * 2); c.fill(); }
          break;
        case 'stars': { // a whole galaxy inside it
          if (!glow) for (let k = 0; k < 3; k++) {
            const x = 30 + rnd() * 100, y = 30 + rnd() * 100, rg = c.createRadialGradient(x, y, 0, x, y, 40);
            rg.addColorStop(0, ['rgba(255, 80, 200, 0.55)', 'rgba(80, 160, 255, 0.5)', 'rgba(180, 100, 255, 0.5)'][k]); rg.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = rg; c.fillRect(0, 0, S, S);
          }
          for (let k = 0; k < (glow ? 26 : 50); k++) {
            const x = 15 + rnd() * 130, y = 15 + rnd() * 130, sz = rnd() * (glow ? 2.6 : 1.6) + 0.6;
            c.fillStyle = k % 5 ? '#ffffff' : '#ffd43b'; c.beginPath(); c.arc(x, y, sz, 0, Math.PI * 2); c.fill();
          }
          break;
        }
        case 'stripes': // glowing spirit stripes
          for (let k = 0; k < 9; k++) {
            const x = 25 + k * 13 + rnd() * 6;
            c.strokeStyle = glow ? '#99e9f2' : 'rgba(16, 152, 173, 0.75)'; c.lineWidth = glow ? 3 : 4;
            c.beginPath(); c.moveTo(x, 30 + rnd() * 20); c.quadraticCurveTo(x + 10, 80, x - 4, 120 + rnd() * 20); c.stroke();
          }
          break;
        case 'waves': // glowing ocean patterns
          for (let k = 0; k < 6; k++) {
            const y = 35 + k * 18;
            c.strokeStyle = glow ? '#66d9e8' : 'rgba(153, 233, 242, 0.5)'; c.lineWidth = glow ? 2 : 2.5;
            c.beginPath(); for (let x = 0; x <= S; x += 8) c.lineTo(x, y + Math.sin(x / 12 + k) * 5); c.stroke();
          }
          for (let k = 0; k < 10; k++) { c.fillStyle = '#c5f6fa'; c.beginPath(); c.arc(20 + rnd() * 120, 20 + rnd() * 120, 2.5, 0, Math.PI * 2); c.fill(); }
          break;
        case 'spots': // glowing spots and rings
          for (let k = 0; k < 12; k++) {
            const x = 20 + rnd() * 120, y = 25 + rnd() * 115, rr = 3 + rnd() * 6;
            c.strokeStyle = look.rim; c.fillStyle = glow ? look.rim : 'rgba(255,255,255,0.25)'; c.lineWidth = 2;
            c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); glow ? c.stroke() : c.fill();
          }
          break;
        case 'lights': // 🎄 a string of colored Christmas lights wrapped around it
          for (let k = 0; k < 3; k++) {
            const y0 = 45 + k * 32;
            c.strokeStyle = glow ? 'rgba(0,0,0,0)' : '#2b8a3e'; c.lineWidth = 2;
            c.beginPath(); for (let x = 0; x <= S; x += 10) c.lineTo(x, y0 + Math.sin(x / 18 + k) * 8); c.stroke();
            for (let x = 8; x <= S; x += 18) {
              c.fillStyle = ['#ff3b3b', '#ffd43b', '#40c057', '#4dabf7', '#ff6bd6'][(x / 18 + k) % 5 | 0];
              c.beginPath(); c.arc(x, y0 + Math.sin(x / 18 + k) * 8 + 4, glow ? 5 : 4, 0, Math.PI * 2); c.fill();
            }
          }
          break;
        case 'icing': // 🍪 white gingerbread icing swirls and candy buttons
          c.strokeStyle = '#ffffff'; c.lineWidth = glow ? 2 : 3;
          for (let k = 0; k < 6; k++) { const y0 = 30 + k * 20; c.beginPath(); for (let x = 20; x <= 140; x += 8) c.lineTo(x, y0 + (x % 16 ? 4 : -4)); c.stroke(); }
          for (let k = 0; k < 5; k++) { c.fillStyle = ['#e03131', '#40c057', '#ffd43b'][k % 3]; c.beginPath(); c.arc(60 + k * 9, 70 + k * 12, glow ? 4 : 5, 0, Math.PI * 2); c.fill(); }
          break;
        case 'rainbow': { // rainbow streaks through the mane and tail
          for (let k = 0; k < 6; k++) {
            c.strokeStyle = `hsla(${k * 55}, 100%, 65%, ${glow ? 0.9 : 0.4})`; c.lineWidth = glow ? 3 : 6;
            c.beginPath(); c.moveTo(10, 40 + k * 12); c.quadraticCurveTo(80, 10 + k * 14, 150, 60 + k * 10); c.stroke();
          }
          break;
        }
      }
      c.restore();
    };
    g.globalCompositeOperation = 'source-over';
    tex(g, false);
    tex(v, true);
    // keep everything only on the animal
    for (const c of [g, v]) { c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0); }
    return { body, veins };
  }
  // draws a beast: its glowing outline, the painted body and pulsing glowing veins
  function drawBeast(id, look, time, seed, x = 0, y = 0, size = 40) {
    const pet = petById[id];
    if (!beastSprites[id]) beastSprites[id] = makeBeast(pet.emoji, look);
    const { body, veins } = beastSprites[id];
    const rim = look.rim === 'rainbow' ? `hsl(${(time * 120) % 360}, 100%, 65%)` : look.rim;
    ctx.save();
    ctx.shadowColor = rim; ctx.shadowBlur = 10 + 4 * Math.sin(time * 4 + seed);
    ctx.drawImage(body, x - size / 2, y - size * 0.625, size, size);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 3 + seed);
    ctx.drawImage(veins, x - size / 2, y - size * 0.625, size, size);
    ctx.restore();
  }

  const PET_MODELS = { cyberwhale: drawCyberWhale };
  for (const p of PETS) {
    const look = BEAST_LOOKS[p.id] || BEAST_LOOKS[p.fx];
    if (look) PET_MODELS[p.id] = (time, seed) => drawBeast(p.id, look, time, seed);
  }
  // 🍭 a little candy cane (white with red stripes), for the Candy Cane Snake's effects
  function drawCandyCane(x, y, size, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.lineCap = 'round';
    const path = () => { ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(0, -size * 0.3); ctx.arc(-size * 0.35, -size * 0.3, size * 0.35, 0, Math.PI, true); };
    ctx.lineWidth = size * 0.36 + 1.6; ctx.strokeStyle = 'rgba(140, 20, 30, 0.7)'; path(); ctx.stroke(); // an outline
    ctx.lineWidth = size * 0.36; ctx.strokeStyle = '#ffffff'; path(); ctx.stroke();
    ctx.strokeStyle = '#e8202a'; ctx.setLineDash([size * 0.28, size * 0.28]); path(); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }
  // 🍭 Candy Cane Snake: one smooth body that tapers to a pointy tail, striped red and white like a candy cane, slithering
  // in an S with its head lifted a little; a real snake head (wider than the neck, a pointed snout, an eye, a forked tongue)
  PET_MODELS.candysnake = (time, seed, flying, moving) => {
    const N = 44, mid = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N; // 0 = neck (behind the head), 1 = tail tip
      const wave = Math.sin(f * Math.PI * 2.2 - time * (moving ? 9 : 3.5) + seed) * (2.5 + f * 3.5) * Math.min(1, f / 0.15);
      const lift = f < 0.25 ? -Math.pow(1 - f / 0.25, 2) * 6 : 0; // the head end lifts up a little
      mid.push([-14 + f * 46, 5 + wave + lift, f]);
    }
    const width = f => f < 0.06 ? 7.6 : 0.8 + 9 * Math.pow(1 - f, 0.7);
    // the two edges of the body
    const L = [], R = [];
    mid.forEach(([px, py, f], i) => {
      const a = mid[Math.max(0, i - 1)], b = mid[Math.min(N, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
      const w = width(f) / 2;
      L.push([px + ty * w, py - tx * w]); R.push([px - ty * w, py + tx * w]);
    });
    ctx.save();
    // candy stripes: bands across the body, joined so it's one smooth shape
    for (let i = 0; i < N; i++) {
      const col = Math.floor(i / 3) % 2 ? '#e8202a' : '#ffffff';
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(...L[i]); ctx.lineTo(...L[i + 1]); ctx.lineTo(...R[i + 1]); ctx.lineTo(...R[i]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // a soft shadow along the belly and a candy shine along the back
    ctx.strokeStyle = 'rgba(120, 10, 20, 0.25)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); R.slice(1, N - 2).forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    ctx.beginPath(); mid.slice(1, N - 6).forEach(([px, py], i) => { const q = [(px + L[i + 1][0]) / 2, (py + L[i + 1][1]) / 2]; i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.stroke();
    // the outline
    ctx.strokeStyle = 'rgba(130, 15, 25, 0.8)'; ctx.lineWidth = 0.8; ctx.lineJoin = 'round';
    ctx.beginPath(); L.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); for (let i = N; i >= 0; i--) ctx.lineTo(...R[i]); ctx.stroke();
    // the head: wider than the neck, with a rounded pointed snout
    const [nx, ny] = mid[0], [ax, ay] = mid[2];
    let dx = nx - ax, dy = ny - ay; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl; // pointing forward
    const ux = dy, uy = -dx; // sideways (the negative side is up, so the eye and red cap are on top)
    const HS = 1.2; // head size
    const P = (fw, side) => [nx + dx * fw * HS + ux * side * HS, ny + dy * fw * HS + uy * side * HS];
    // a real snake head: wide jaws at the back (much wider than the neck) narrowing to a rounded snout
    const head = new Path2D();
    head.moveTo(...P(0, -3.2));
    head.bezierCurveTo(...P(1, -6.8), ...P(5, -7), ...P(8, -5.4));
    head.bezierCurveTo(...P(11.5, -3.6), ...P(14.5, -2.2), ...P(15, 0));
    head.bezierCurveTo(...P(14.6, 2), ...P(11.5, 3.6), ...P(8, 5.2));
    head.bezierCurveTo(...P(5, 6.8), ...P(1, 6.6), ...P(0, 3.2));
    head.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(head); // the white jaw underneath
    ctx.save(); ctx.clip(head);
    ctx.fillStyle = '#e8202a'; // the red top of its head
    ctx.beginPath(); ctx.moveTo(...P(-2, -10)); ctx.lineTo(...P(17, -10)); ctx.lineTo(...P(17, 0.2)); ctx.quadraticCurveTo(...P(8, 1.2), ...P(-2, 0.8)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; // a white candy stripe across the top
    ctx.beginPath(); ctx.moveTo(...P(3, -10)); ctx.lineTo(...P(5.2, -10)); ctx.lineTo(...P(4.6, 1)); ctx.lineTo(...P(2.4, 1)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120, 10, 20, 0.35)'; ctx.lineWidth = 0.5; // a few scales on top
    for (const [f, sd] of [[8.5, -3.4], [10.5, -2.6], [7, -1.2], [11.5, -0.8]]) { const [qx, qy] = P(f, sd); ctx.beginPath(); ctx.arc(qx, qy, 0.9, 0, Math.PI); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(110, 10, 20, 0.85)'; ctx.lineWidth = 0.9; ctx.stroke(head);
    // the mouth line along the jaw
    ctx.strokeStyle = 'rgba(110, 10, 20, 0.8)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(...P(14.6, 0.9)); ctx.quadraticCurveTo(...P(10, 2.6), ...P(5.5, 2.4)); ctx.stroke();
    // nostrils
    ctx.fillStyle = 'rgba(80, 0, 10, 0.85)';
    for (const sd of [-1, 0.2]) { const [qx, qy] = P(13.6, sd); ctx.beginPath(); ctx.arc(qx, qy, 0.38, 0, Math.PI * 2); ctx.fill(); }
    // the eye: gold with a skinny slit pupil, under a frowny brow ridge
    const [ex, ey] = P(9, -2.7);
    ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#5c0a0a'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.ellipse(ex, ey, 2.1, 1.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(ex, ey, 0.5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex - 0.8, ey - 0.8, 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a0d16'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(...P(6.6, -4.9)); ctx.quadraticCurveTo(...P(9, -5.4), ...P(11.4, -3.6)); ctx.stroke();
    if ((time + seed) % 1.4 < 0.35) { // the forked tongue flicks out
      const [t0x, t0y] = P(15, 0.6), [t1x, t1y] = P(19, 0.8), [fax, fay] = P(21, -0.8), [fbx, fby] = P(21, 2.4);
      ctx.strokeStyle = '#e8202a'; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(t0x, t0y); ctx.lineTo(t1x, t1y); ctx.lineTo(fax, fay); ctx.moveTo(t1x, t1y); ctx.lineTo(fbx, fby); ctx.stroke();
    }
    ctx.restore();
  };
  // 🦌 Santa's Reindeer: a glowing red nose and a little red sleigh full of presents behind it
  PET_MODELS.reindeer = (time, seed) => {
    // the sleigh (behind it, so drawn first)
    ctx.save();
    ctx.translate(26, 6);
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-4, -4); ctx.stroke(); // the reins
    [['#e03131', -3, -14], ['#2f9e44', 3, -16], ['#4dabf7', 8, -13]].forEach(([c, dx, dy]) => {
      ctx.fillStyle = c; ctx.fillRect(dx - 3, dy, 6, 6);
      ctx.fillStyle = '#ffd43b'; ctx.fillRect(dx - 0.6, dy, 1.2, 6); ctx.fillRect(dx - 3, dy + 2.4, 6, 1.2);
    });
    ctx.fillStyle = '#c92a2a'; ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(12, -8); ctx.quadraticCurveTo(16, -8, 14, 0); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(14, 3); ctx.quadraticCurveTo(18, 3, 17, -1); ctx.stroke();
    ctx.restore();
    drawBeast('reindeer', BEAST_LOOKS.reindeer, time, seed);
    // the red nose, glowing on and off
    const n = 0.65 + 0.35 * Math.sin(time * 5 + seed);
    glow(-17, -16, 9, '255, 40, 40', 0.9 * n);
    ctx.fillStyle = '#ff2b2b'; ctx.beginPath(); ctx.arc(-17, -16, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-17.6, -16.7, 0.7, 0, Math.PI * 2); ctx.fill();
  };
  // 🦌 Cosmic Stag: its antlers glow with twinkling stars at the tips
  PET_MODELS.cosmicstag = (time, seed) => {
    drawBeast('cosmicstag', BEAST_LOOKS.cosmicstag, time, seed);
    glow(-6, -30, 12, '177, 151, 250', 0.6);
    [[-10.7, -32], [-5.9, -32], [-2.1, -28.8], [-8, -25.6], [-3.7, -25]].forEach(([x, y], k) => {
      const tw = 0.6 + 0.4 * Math.sin(time * 4 + k * 1.3 + seed);
      glow(x, y, 4, '208, 191, 255', 0.8 * tw);
      star(x, y, 2.2 * tw + 0.6, '#ffffff');
    });
  };



  for (const p of PETS) if (p.fx === 'cyber') PET_MODELS[p.id] = cyberPetModel(p.id, p.emoji);
  for (const p of PETS) if (p.fx === 'glass' || p.fx === 'glasswolf') PET_MODELS[p.id] = glassPetModel(p.id, p.emoji, p.fx === 'glasswolf');

  // pictures of the low-poly pets for the pet lists (made once each)
  const petIcons = {};
  function petIcon(p) {
    if (!PET_MODELS[p.id]) return p.emoji;
    if (!petIcons[p.id]) {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const saved = ctx;
      ctx = c.getContext('2d');
      ctx.translate(46, 72); ctx.scale(1.7, 1.7);
      PET_MODELS[p.id](0.6, 0, false);
      ctx = saved;
      petIcons[p.id] = c.toDataURL();
    }
    return `<img class="petImg" src="${petIcons[p.id]}" alt="${p.name}">`;
  }

  // fire (or rainbow fire) out of the pet's mouth
  function breathe(x, y, facing, colors, rnd) {
    for (let k = 0; k < 4; k++) {
      petSpark(x + facing * 22, y - 12, { shape: 'flame', color: colors[k % colors.length],
        vx: facing * (140 + Math.random() * 120), vy: rnd() * 60 - 10, life: 0.45, size: 4 + Math.random() * 5 });
    }
  }

  function drawPet(pet, pp, time, dt, seed) {
    const r = RARITIES[pet.rarity];
    const big = PET_SIZE[pet.id] || (r.order >= 4 ? 1.15 : 1);
    const rnd = () => Math.random() - 0.5;
    const chance = k => Math.random() < dt * k;
    const wave = Math.sin(pp.step * Math.PI); // -1..1 once per step

    // how it moves
    let alt = 0, bob = 0, tilt = 0, sx = 1, sy = 1;
    switch (pet.kind) {
      case 'fly':
        alt = 26 + Math.sin(time * 2.2 + seed) * 5;
        sy = 1 + Math.sin(time * (pp.moving ? 18 : 11) + seed) * 0.07; // flapping wings
        tilt = pp.moving ? 0.16 : 0;
        break;
      case 'swim':
        alt = 16 + Math.sin(time * 1.5 + seed) * 4;
        tilt = Math.sin(time * 2 + seed) * 0.12 + (pp.moving ? 0.08 : 0);
        sx = 1 + Math.sin(time * 4 + seed) * 0.03;
        break;
      case 'hop': {
        const ph = (pp.moving ? pp.step * 0.5 : (time + seed) / 3) % 1; // idle bunnies still hop now and then
        const up = pp.moving || ph < 0.25 ? Math.sin(Math.min(1, ph * (pp.moving ? 1 : 4)) * Math.PI) : 0;
        bob = up * (pp.moving ? 14 : 6);
        if (up < 0.15) { sy = 0.9; sx = 1.08; } // squish when it lands
        break;
      }
      case 'waddle':
        if (pp.moving) { tilt = wave * 0.2; bob = Math.abs(wave) * 2; }
        else sy = 1 + Math.sin(time * 2.5 + seed) * 0.03;
        break;
      default: // walk
        if (pp.moving) { bob = Math.abs(wave) * 5; tilt = wave * 0.06; }
        else if (pp.still > 3) { sy = 0.93; sx = 1.04; } // sits down when you stand still
        else sy = 1 + Math.sin(time * 2.5 + seed) * 0.035; // breathing
    }
    const x = pp.x, y = pp.y - alt - bob;

    // shadow on the ground (smaller and lighter when it's up in the air)
    const lift = Math.min(1, (alt + bob) / 60);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.22 * (1 - lift * 0.6)})`;
    ctx.beginPath(); ctx.ellipse(pp.x, pp.y + 10, 12 * big * (1 - lift * 0.4), 4 * (1 - lift * 0.3), 0, 0, Math.PI * 2); ctx.fill();

    // effects behind the pet
    switch (pet.fx) {
      case 'hearts': if (chance(1.5)) petSpark(x + rnd() * 16, y - 12, { shape: 'heart', color: '#ff6b9a', vy: -25, life: 1.4, size: 7 }); break;
      case 'embers': glow(x, y - 4, 22, '255, 140, 40', 0.5);
        if (chance(8)) petSpark(x + rnd() * 18, y, { color: Math.random() < 0.5 ? '#ff922b' : '#ffd43b', vy: -40, vx: rnd() * 20, size: 2.5 }); break;
      case 'leaves': if (chance(3)) petSpark(x + rnd() * 26, y - 20, { shape: 'leaf', color: '#51cf66', vy: 18, vx: rnd() * 30, life: 1.6, size: 4 }); break;
      case 'snow': glow(x, y - 4, 26, '160, 230, 255', 0.55);
        if (chance(6)) petSpark(x + rnd() * 34, y - 24, { shape: 'flake', color: '#fff', vy: 22, vx: rnd() * 10, life: 1.6, size: 3 }); break;
      case 'moon': glow(x, y - 4, 30, '70, 80, 190', 0.55); {
          const a = time * 1.5 + seed;
          ctx.fillStyle = '#fff3bf';
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 24, y - 6 + Math.sin(a) * 10, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3b4cca';
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 24 + 2.5, y - 7 + Math.sin(a) * 10, 4.2, 0, Math.PI * 2); ctx.fill();
          if (chance(3)) petSpark(x + rnd() * 40, y - 10 + rnd() * 30, { shape: 'star', color: '#fff', vy: 0, life: 0.8, size: 3 });
        } break;
      case 'unicorn': {
        // 🦄 Rainbow Unicorn: a rainbow aura, a rainbow trail behind it, a little rainbow arching over it and star bursts
        glow(x, y - 6, 40, hueRgb((time * 120) % 360), 0.55);
        if (chance(30)) petSpark(x - pp.facing * 12 + rnd() * 6, y + rnd() * 10, { color: `hsl(${(time * 300) % 360},100%,60%)`, vy: 5, vx: -pp.facing * 30, life: 1, size: 4.5 });
        const arc = (time + seed) % 4;
        if (arc < 1.5) {
          ctx.save(); ctx.globalAlpha = Math.sin(arc / 1.5 * Math.PI) * 0.7;
          ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'].forEach((c, k) => {
            ctx.strokeStyle = c; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(x, y + 4, 34 - k * 3, Math.PI, Math.PI * 2); ctx.stroke();
          });
          ctx.restore();
        }
        if (chance(5)) petSpark(x + rnd() * 40, y - 14 + rnd() * 20, { shape: 'star', color: `hsl(${Math.random() * 360}, 100%, 75%)`, vy: -8, life: 0.8, size: 4 });
        break;
      }
      case 'icephoenix': {
        // 🧊 Ice Phoenix: cold blue flames, glowing frost wings, snowflakes and an icy breath
        glow(x, y - 4, 44, '120, 200, 255', 0.6);
        glow(x, y - 4, 22, '230, 250, 255', 0.6);
        const flap = Math.sin(time * 10 + seed) * 0.35;
        ctx.save();
        for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
          const a = -Math.PI / 2 + side * (0.7 + k * 0.28 + flap);
          ctx.strokeStyle = `rgba(${k % 2 ? '165, 216, 255' : '230, 250, 255'}, 0.55)`; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + Math.cos(a) * (40 - k * 4), y - 10 + Math.sin(a) * (40 - k * 4)); ctx.stroke();
        }
        ctx.restore();
        if (chance(26)) petSpark(x + rnd() * 22, y + 2, { shape: 'flame', color: Math.random() < 0.5 ? '#74c0fc' : '#e7f5ff', vy: -60, vx: rnd() * 20, life: 0.6, size: 5 });
        if (chance(4)) petSpark(x + rnd() * 50, y - 10, { shape: 'flake', color: '#fff', vy: 20, vx: rnd() * 20, life: 1.5, size: 3.5 });
        if ((time + seed) % 4.5 < 0.9) breathe(x, y, pp.facing, ['#e7f5ff', '#a5d8ff', '#4dabf7'], rnd);
        break;
      }
      case 'leviathan': {
        // 🐋 Leviathan Whale: a deep ocean swirl, glowing water rings, bubbles and a giant water spout
        glow(x, y - 4, 56, '20, 90, 200', 0.6);
        glow(x, y - 4, 30, '100, 220, 255', 0.45);
        ctx.save(); ctx.translate(x, y + 2); ctx.scale(1, 0.35);
        for (let k = 0; k < 3; k++) {
          ctx.strokeStyle = `rgba(116, 192, 252, ${0.5 - k * 0.12})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, 34 + k * 10, time * (k % 2 ? 1.5 : -1.5) + k, time * (k % 2 ? 1.5 : -1.5) + k + 4.4); ctx.stroke();
        }
        ctx.restore();
        if (chance(10)) petSpark(x + rnd() * 50, y + 6, { shape: 'bubble', color: '#a5d8ff', vy: -30, vx: rnd() * 10, life: 1.5, size: 2 + Math.random() * 4 });
        const spout = (time + seed) % 4;
        if (spout < 1.2) for (let k = 0; k < 3; k++) {
          petSpark(x - pp.facing * 4 + rnd() * 6, y - 22, { color: k ? '#a5d8ff' : '#ffffff', vx: rnd() * 80, vy: -90 - Math.random() * 60, life: 0.7, size: 3 });
        }
        break;
      }
      case 'frostdragon': {
        // 🐉 Frost Dragon: an icy blue aura, ice crystals circling it, snow, frost on the ground and freezing breath
        const pulse = 1 + Math.sin(time * 4) * 0.12;
        glow(x, y - 8, 64 * pulse, '80, 170, 255', 0.55);
        glow(x, y - 8, 32 * pulse, '235, 250, 255', 0.55);
        for (let k = 0; k < 8; k++) {
          const a = -time * 2 + k * Math.PI / 4;
          glassShard(x + Math.cos(a) * 44, y - 8 + Math.sin(a) * 17, 5, a * 2, 195 + (k % 2) * 15);
        }
        ctx.save(); ctx.translate(pp.x, pp.y + 9); ctx.scale(1, 0.3);
        ctx.fillStyle = 'rgba(231, 245, 255, 0.45)'; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (chance(8)) petSpark(x + rnd() * 60, y - 30, { shape: 'flake', color: '#fff', vy: 26, vx: rnd() * 20, life: 1.6, size: 4 });
        if ((time + seed) % 4 < 1.1) breathe(x, y, pp.facing, ['#ffffff', '#d0ebff', '#74c0fc', '#1c7ed6'], rnd);
        break;
      }
      case 'bubbles': glow(x, y - 4, 32, '50, 150, 255', 0.55);
        if (chance(6)) petSpark(x + rnd() * 30, y + 6, { shape: 'bubble', color: '#a5d8ff', vy: -30, vx: rnd() * 10, life: 1.5, size: 2 + Math.random() * 3 }); break;
      case 'galaxy': glow(x, y - 4, 38, '120, 60, 255', 0.65);
        for (let k = 0; k < 3; k++) {
          const a = time * 2 + k * 2.094 + seed;
          star(x + Math.cos(a) * 28, y - 4 + Math.sin(a) * 12, 4, ['#fff', '#ffd43b', '#ff8cc6'][k]);
        }
        if (chance(5)) petSpark(x + rnd() * 50, y - 10 + rnd() * 40, { shape: 'star', color: '#e5dbff', vy: 0, life: 0.8, size: 3 }); break;
      case 'lava': {
        // 🦖 Lava Rex: a glowing lava pool under it, dripping magma, and burning footprints
        glow(pp.x, pp.y + 8, 46, '255, 70, 0', 0.55);
        glow(x, y - 10, 50, '255, 120, 0', 0.45);
        if (chance(10)) petSpark(x + rnd() * 30, y - 6, { shape: 'flame', color: Math.random() < 0.5 ? '#ff3d00' : '#ff9100', vy: 50, vx: rnd() * 10, life: 0.6, size: 3.5 });
        if (chance(14)) petSpark(x + rnd() * 40, y, { color: '#ffd166', vy: -50, vx: rnd() * 30, life: 0.9, size: 2 });
        if (pp.moving && chance(5)) petSpark(pp.x + rnd() * 10, pp.y + 10, { shape: 'print', color: '#ff5400', vy: 0, life: 1.6, size: 4 });
        if ((time + seed) % 5 < 0.9) breathe(x, y + 4, pp.facing, ['#ff1f00', '#ff7b00', '#ffcc00'], rnd);
        break;
      }
      case 'thunder': {
        // 🦈 Thunder Shark: crackling electric aura and lightning bolts
        glow(x, y - 6, 52 * (1 + Math.sin(time * 9) * 0.08), '60, 170, 255', 0.6);
        glow(x, y - 6, 26, '220, 245, 255', 0.5);
        if (chance(4)) {
          const a = Math.random() * Math.PI * 2, len = 35 + Math.random() * 30;
          const pts = [];
          for (let k = 0; k <= 5; k++) pts.push([Math.cos(a) * len * k / 5 + rnd() * 12, Math.sin(a) * len * k / 5 * 0.7 + rnd() * 12]);
          petSpark(x, y - 6, { shape: 'bolt', pts, color: '#e7f5ff', vy: 0, life: 0.18 });
        }
        if (chance(15)) petSpark(x + rnd() * 50, y - 6 + rnd() * 30, { shape: 'star', color: '#74c0fc', vy: 0, life: 0.3, size: 3 });
        break;
      }
      case 'holy': {
        // 🕊️ Angel Dove: soft light rays, a golden halo and falling feathers
        ctx.save();
        ctx.translate(x, y - 6);
        ctx.rotate(time * 0.5);
        for (let k = 0; k < 10; k++) {
          ctx.rotate(Math.PI / 5);
          ctx.fillStyle = 'rgba(255, 240, 180, 0.22)';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, 70); ctx.lineTo(6, 70); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        glow(x, y - 6, 46, '255, 250, 220', 0.75);
        if (chance(3)) petSpark(x + rnd() * 50, y - 30, { shape: 'leaf', color: '#ffffff', vy: 16, vx: rnd() * 20, life: 2, size: 4.5 });
        if (chance(6)) petSpark(x + rnd() * 60, y - 6 + rnd() * 40, { shape: 'star', color: '#ffe066', vy: -6, life: 0.9, size: 3 });
        break;
      }
      case 'king': {
        // 🐲 Dragon King: royal golden flames, a roar shockwave and golden fire breath
        const pulse = 1 + Math.sin(time * 4) * 0.1;
        glow(x, y - 8, 70 * pulse, '255, 190, 0', 0.55);
        glow(x, y - 8, 36 * pulse, '255, 255, 220', 0.55);
        for (let k = 0; k < 10; k++) {
          const a = time * 2 + k * Math.PI / 5;
          glow(x + Math.cos(a) * 48, y - 8 + Math.sin(a) * 18, 8, k % 2 ? '255, 230, 120' : '255, 160, 0', 0.95);
        }
        if (chance(16)) petSpark(x + rnd() * 50, y + 4, { shape: 'flame', color: Math.random() < 0.5 ? '#ffd43b' : '#fff3bf', vy: -70, vx: rnd() * 30, life: 0.8, size: 5 });
        const roar = (time + seed) % 3.5;
        if (roar < dt) petSpark(x, y - 8, { shape: 'ring', color: '#ffd43b', vy: 0, life: 0.8, size: 20, grow: 110 });
        if (roar < 1) breathe(x, y, pp.facing, ['#fff3bf', '#ffd43b', '#ffa94d'], rnd);
        break;
      }
      case 'voidbear': {
        // 🐻 Void Bear: dark purple smoke and little black holes circling it
        glow(x, y - 6, 44, '110, 30, 200', 0.6);
        for (let k = 0; k < 3; k++) {
          const a = time * 1.6 + k * 2.09 + seed, hx = x + Math.cos(a) * 30, hy = y - 8 + Math.sin(a) * 12;
          glow(hx, hy, 12, '200, 80, 255', 0.6);
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
        }
        if (chance(12)) petSpark(x + rnd() * 30, y + 4, { shape: 'smoke', color: 'rgba(60, 10, 90, 0.5)', vy: -18, vx: rnd() * 14, life: 1.3, size: 7 });
        break;
      }
      case 'crystalfox': {
        // 🦊 Crystal Fox: icy crystal shards floating around it and frosty twinkles
        glow(x, y - 6, 38, '150, 230, 255', 0.55);
        for (let k = 0; k < 4; k++) {
          const a = time * 1.8 + k * Math.PI / 2 + seed;
          glassShard(x + Math.cos(a) * 28, y - 10 + Math.sin(a) * 11, 4.5, a * 2, 190 + k * 8);
        }
        if (chance(8)) petSpark(x + rnd() * 40, y - 10 + rnd() * 26, { shape: 'star', color: '#e3fafc', vy: -6, life: 0.7, size: 3 });
        if (pp.moving && chance(8)) petSpark(pp.x + rnd() * 10, pp.y + 8, { shape: 'flake', color: '#d0ebff', vy: 0, life: 1, size: 3 });
        break;
      }
      case 'solarlion': {
        // 🦁 Solar Lion: a blazing sun corona behind it and solar flares bursting out
        ctx.save(); ctx.translate(x, y - 10); ctx.rotate(time * 0.8);
        for (let k = 0; k < 14; k++) {
          ctx.rotate(Math.PI / 7);
          const len = 36 + 8 * Math.sin(time * 6 + k);
          ctx.fillStyle = k % 2 ? 'rgba(255, 170, 0, 0.6)' : 'rgba(255, 230, 80, 0.6)';
          ctx.beginPath(); ctx.moveTo(-4, 14); ctx.lineTo(0, len); ctx.lineTo(4, 14); ctx.fill();
        }
        ctx.restore();
        glow(x, y - 10, 50, '255, 200, 0', 0.65);
        if ((time + seed) % 3 < dt) petSpark(x, y - 10, { shape: 'ring', color: '#ffd43b', vy: 0, life: 0.8, size: 16, grow: 120 });
        if (chance(14)) petSpark(x + rnd() * 30, y - 4, { shape: 'flame', color: Math.random() < 0.5 ? '#ffd43b' : '#ff922b', vy: -55, vx: rnd() * 30, life: 0.7, size: 4 });
        break;
      }
      case 'metalrhino': {
        // 🦏 Metal Rhino: a shine sliding across its armor, blue electric glints and sparks when it charges
        glow(x, y - 6, 36, '173, 181, 189', 0.55);
        const sh = (time * 0.8 + seed) % 2;
        if (sh < 1) star(x - 16 + sh * 32, y - 18, 4 + Math.sin(sh * Math.PI) * 3, '#ffffff');
        if (chance(2)) {
          const a = Math.random() * Math.PI * 2;
          zap(x + Math.cos(a) * 16, y - 10 + Math.sin(a) * 10, x + Math.cos(a) * 34, y - 10 + Math.sin(a) * 18, 4, 1);
        }
        if (pp.moving && chance(16)) petSpark(pp.x - pp.facing * 12, pp.y + 8, { color: Math.random() < 0.5 ? '#ffd43b' : '#fff', vx: -pp.facing * 80 + rnd() * 40, vy: -50 - Math.random() * 40, life: 0.5, size: 2 });
        break;
      }
      case 'galaxyshark': {
        // 🦈 Galaxy Shark: a nebula glow, a trail of stars and two little planets orbiting it
        glow(x, y - 4, 52, '120, 60, 255', 0.6);
        glow(x + 8, y, 30, '255, 80, 200', 0.4);
        for (let k = 0; k < 2; k++) {
          const a = time * 1.4 + k * Math.PI + seed, px = x + Math.cos(a) * 40, py = y - 4 + Math.sin(a) * 14;
          ctx.fillStyle = k ? '#ff922b' : '#748ffc'; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(px, py, 8, 2.5, -0.3, 0, Math.PI * 2); ctx.stroke();
        }
        if (chance(20)) petSpark(x - pp.facing * 20 + rnd() * 10, y + rnd() * 16, { shape: 'star', color: Math.random() < 0.5 ? '#fff' : '#e5dbff', vx: -pp.facing * 20, vy: 0, life: 1, size: 3 });
        break;
      }
      case 'spirittiger': {
        // 🐯 Spirit Tiger: a ghostly blue glow, floating spirit flames and a see-through copy that follows it
        glow(x, y - 6, 48, '100, 220, 255', 0.5);
        for (let k = 0; k < 4; k++) {
          const a = time * 1.3 + k * Math.PI / 2 + seed, fx = x + Math.cos(a) * 32, fy = y - 12 + Math.sin(a * 2) * 8;
          glow(fx, fy, 10, '120, 240, 255', 0.8);
          ctx.fillStyle = 'rgba(200, 250, 255, 0.85)'; ctx.beginPath(); ctx.arc(fx, fy, 3, 0, Math.PI * 2); ctx.fill();
        }
        if (chance(10)) petSpark(x + rnd() * 30, y - 6, { shape: 'smoke', color: 'rgba(150, 240, 255, 0.35)', vy: -25, vx: rnd() * 10, life: 1, size: 5 });
        break;
      }
      case 'voidkraken': {
        // 🐙 Void Kraken: a swirling purple portal under it pulling sparks in, and dark tentacles of light
        ctx.save(); ctx.translate(x, y + 12); ctx.scale(1, 0.4);
        for (let k = 0; k < 3; k++) {
          ctx.strokeStyle = `rgba(${k % 2 ? '255, 43, 214' : '170, 90, 255'}, 0.65)`; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(0, 0, 22 + k * 10, -time * 3 + k * 2, -time * 3 + k * 2 + 4); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(10, 0, 30, 0.8)'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        glow(x, y - 4, 50, '139, 44, 255', 0.5);
        ctx.save(); ctx.strokeStyle = 'rgba(200, 120, 255, 0.55)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let k = 0; k < 5; k++) {
          const a = Math.PI * 0.15 + k * Math.PI * 0.175;
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + Math.cos(a) * 30 + Math.sin(time * 3 + k) * 10, y + 14, x + Math.cos(a) * 44, y + 6 + Math.sin(time * 4 + k) * 8);
          ctx.stroke();
        }
        ctx.restore();
        if (chance(12)) {
          const a = Math.random() * Math.PI * 2;
          petSpark(x + Math.cos(a) * 60, y + 12 + Math.sin(a) * 24, { color: Math.random() < 0.5 ? '#c77dff' : '#ff2bd6', vx: -Math.cos(a) * 80, vy: -Math.sin(a) * 30, life: 0.7, size: 2.5 });
        }
        break;
      }
      case 'xmas': {
        // 🎄 the Christmas Block pets: twinkling Christmas lights circling them, snowy sparkles and (rarer ones) presents
        const lvl = { legendary: 1, mythic: 2, secret: 3, celestial: 4 }[pet.rarity] || 1;
        glow(x, y - 8, 32 + lvl * 8, '255, 212, 59', 0.3 + 0.05 * lvl);
        const n = 5 + lvl * 2;
        for (let k = 0; k < n; k++) {
          const a = time * 1.1 + k * Math.PI * 2 / n + seed, lx = x + Math.cos(a) * (26 + lvl * 4), ly = y - 10 + Math.sin(a) * (10 + lvl);
          const on = Math.sin(time * 4 + k * 1.7) > -0.2;
          const col = ['224, 49, 49', '47, 158, 68', '255, 212, 59', '77, 171, 247', '255, 107, 214'][k % 5];
          if (on) glow(lx, ly, 6, col, 0.9);
          ctx.fillStyle = `rgb(${col})`; ctx.beginPath(); ctx.arc(lx, ly, 1.8, 0, Math.PI * 2); ctx.fill();
        }
        if (chance(3 + lvl)) petSpark(x + rnd() * 40, y - 20 + rnd() * 20, { shape: 'flake', color: '#ffffff', vy: -6, life: 1.2, size: 3 });
        if (lvl >= 3 && (time + seed) % 4 < dt) for (let k = 0; k < 4; k++) petSpark(x, y - 14, { shape: 'bit', text: '🎁', color: '#fff', vx: rnd() * 120, vy: -60 - Math.random() * 60, life: 1, size: 9 });
        break;
      }
      case 'candysnake': {
        // 🍭 Candy Cane Snake, the best Christmas pet: a striped candy ring on the ground, mini candy canes and peppermint
        // swirls spinning around it, a sugar trail, and every few seconds a big candy burst
        glow(x, y - 8, 60, '255, 77, 77', 0.35);
        glow(x, y - 8, 30, '255, 255, 255', 0.4);
        ctx.save(); ctx.translate(pp.x, pp.y + 9); ctx.scale(1, 0.32);
        ctx.strokeStyle = 'rgba(255, 212, 59, 0.55)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        for (let k = 0; k < 10; k++) { const a = time * 0.8 + k * Math.PI / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * 48, Math.sin(a) * 48, 2.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        for (let k = 0; k < 3; k++) { // mini candy canes
          const a = time * 1.3 + k * 2.09 + seed;
          drawCandyCane(x + Math.cos(a) * 44, y - 14 + Math.sin(a) * 16, 11, Math.sin(time * 3 + k * 2) * 0.35); // always hook-up, just rocking
        }
        for (let k = 0; k < 2; k++) { // peppermint swirls
          const a = -time * 1.7 + k * Math.PI + seed, px = x + Math.cos(a) * 30, py = y - 30 + Math.sin(a) * 9;
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#e8202a';
          for (let j = 0; j < 4; j++) { const s0 = time * 5 + j * Math.PI / 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, 5.5, s0, s0 + Math.PI / 4); ctx.fill(); }
        }
        if (chance(10)) petSpark(x + rnd() * 50, y - 20 + rnd() * 30, { shape: 'star', color: Math.random() < 0.5 ? '#ffffff' : '#ff8787', vy: -10, life: 0.9, size: 3 });
        if (pp.moving && chance(10)) petSpark(pp.x - pp.facing * 26 + rnd() * 8, pp.y + 6, { shape: 'star', color: '#fff', vy: -3, life: 1, size: 2.5 });
        if ((time + seed) % 4 < dt) {
          petSpark(pp.x, pp.y + 9, { shape: 'ring', color: '#e8202a', vy: 0, life: 0.8, size: 14, grow: 160 });
          petSpark(pp.x, pp.y + 9, { shape: 'ring', color: '#ffffff', vy: 0, life: 0.8, size: 8, grow: 120 });
          for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; petSpark(x, y - 18, { shape: 'bit', text: k % 2 ? '🍬' : '🍭', color: '#fff', vx: Math.cos(a) * 150, vy: Math.sin(a) * 100 - 40, life: 1, size: 11 }); }
        }
        break;
      }
      case 'reindeer': {
        // 🦌 Santa's Reindeer: a golden glow, jingle-bell sparkles, a trail of magic gold stars,
        // and every few seconds a burst of presents and snow pops out
        glow(x, y - 10, 60, '255, 212, 59', 0.45);
        glow(x, y - 10, 30, '255, 255, 230', 0.4);
        for (let k = 0; k < 3; k++) {
          const a = time * 2 + k * 2.09 + seed, bx = x + Math.cos(a) * 36, by = y - 14 + Math.sin(a) * 13;
          glow(bx, by, 7, '255, 212, 59', 0.8);
          ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#8a5a00'; ctx.fillRect(bx - 1.5, by + 0.5, 3, 0.8);
        }
        if (chance(pp.moving ? 18 : 6)) petSpark(pp.x - pp.facing * 20 + rnd() * 10, pp.y - Math.random() * 20, { shape: 'star', color: Math.random() < 0.5 ? '#ffd43b' : '#fff3bf', vx: -pp.facing * 20, vy: -10, life: 1.2, size: 3.5 });
        if ((time + seed) % 4.5 < dt) {
          petSpark(pp.x, pp.y + 9, { shape: 'ring', color: '#ffd43b', vy: 0, life: 0.9, size: 14, grow: 150 });
          for (let k = 0; k < 6; k++) petSpark(x, y - 16, { shape: 'bit', text: '🎁', color: '#fff', vx: rnd() * 180, vy: -80 - Math.random() * 80, life: 1.1, size: 11 });
          for (let k = 0; k < 8; k++) petSpark(x, y - 16, { shape: 'flake', color: '#fff', vx: rnd() * 160, vy: -Math.random() * 120, life: 1, size: 4 });
        }
        break;
      }
      case 'cosmicstag': {
        // 🦌 Cosmic Stag: a galaxy glow, a constellation circling it, star footprints and a starburst
        glow(x, y - 12, 62, '120, 80, 255', 0.5);
        glow(x, y - 12, 30, '220, 210, 255', 0.4);
        const pts = [];
        for (let k = 0; k < 6; k++) {
          const a = time * 0.9 + k * Math.PI / 3 + seed;
          pts.push([x + Math.cos(a) * 46, y - 14 + Math.sin(a) * 17 + Math.sin(time * 2 + k) * 3]);
        }
        ctx.strokeStyle = 'rgba(208, 191, 255, 0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); pts.forEach(([px, py], k) => k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.stroke();
        pts.forEach(([px, py], k) => star(px, py, 3.5 + Math.sin(time * 5 + k), k % 2 ? '#ffffff' : '#ffd43b'));
        if (pp.moving && chance(10)) petSpark(pp.x + rnd() * 10, pp.y + 8, { shape: 'star', color: '#e5dbff', vy: -4, life: 1.4, size: 3.5 });
        if (chance(6)) petSpark(x + rnd() * 50, y - 20 + rnd() * 30, { shape: 'star', color: Math.random() < 0.5 ? '#fff' : '#b197fc', vy: -8, life: 1, size: 3 });
        if ((time + seed) % 4 < dt) {
          petSpark(pp.x, pp.y + 9, { shape: 'ring', color: '#b197fc', vy: 0, life: 0.9, size: 14, grow: 160 });
          for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; petSpark(x, y - 30, { shape: 'star', color: k % 2 ? '#fff' : '#ffd43b', vx: Math.cos(a) * 140, vy: Math.sin(a) * 100, life: 0.8, size: 4 }); }
        }
        break;
      }
      case 'stormbison': {
        // 🦬 Storm Bison: its own thundercloud above it, lightning striking down at it, wind when it charges
        glow(x, y - 10, 54, '92, 124, 250', 0.45);
        const cy = y - 62;
        ctx.fillStyle = 'rgba(52, 58, 64, 0.85)';
        for (const [dx, dy, rr] of [[-18, 4, 13], [0, -2, 17], [18, 4, 13], [8, 8, 11], [-8, 8, 11]]) { ctx.beginPath(); ctx.arc(x + dx, cy + dy, rr, 0, Math.PI * 2); ctx.fill(); }
        const strike = (time + seed) % 2.6;
        if (strike < 0.25) {
          zap(x + rnd() * 20, cy + 10, x + rnd() * 10, y - 16, 10, 2.5);
          glow(x, y - 16, 50, '200, 220, 255', 0.6 * (1 - strike / 0.25));
          if (strike < dt) petSpark(pp.x, pp.y + 9, { shape: 'ring', color: '#a5d8ff', vy: 0, life: 0.7, size: 12, grow: 140 });
        }
        if (chance(3)) { const a = Math.random() * Math.PI * 2; zap(x + Math.cos(a) * 16, y - 10 + Math.sin(a) * 10, x + Math.cos(a) * 34, y - 10 + Math.sin(a) * 18, 4, 1); }
        if (pp.moving && chance(10)) petSpark(pp.x - pp.facing * 20, pp.y - Math.random() * 30, { shape: 'smoke', color: 'rgba(222, 226, 230, 0.5)', vx: -pp.facing * 60, vy: 0, life: 0.6, size: 4 });
        break;
      }
      case 'ancientmammoth': {
        // 🦣 Ancient Mammoth, the best pet: an aurora over it, ice crystals circling it, frost under its feet and a freezing stomp
        for (let b = 0; b < 3; b++) {
          ctx.strokeStyle = `hsla(${150 + b * 40}, 100%, 70%, 0.45)`; ctx.lineWidth = 6;
          ctx.beginPath(); for (let k = -40; k <= 40; k += 8) ctx.lineTo(x + k, y - 58 - b * 7 + Math.sin(k / 12 + time * 2 + b) * 5); ctx.stroke();
        }
        glow(x, y - 10, 54, '116, 192, 252', 0.5);
        for (let k = 0; k < 6; k++) { const a = -time * 1.2 + k * Math.PI / 3; glassShard(x + Math.cos(a) * 44, y - 10 + Math.sin(a) * 16, 4.5, a * 2, 195 + (k % 2) * 15); }
        ctx.save(); ctx.translate(pp.x, pp.y + 9); ctx.scale(1, 0.3);
        ctx.fillStyle = 'rgba(231, 245, 255, 0.5)'; ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if ((time + seed) % 3.5 < dt) {
          petSpark(pp.x, pp.y + 9, { shape: 'ring', color: '#d0ebff', vy: 0, life: 0.9, size: 14, grow: 150 });
          for (let k = 0; k < 8; k++) petSpark(pp.x, pp.y + 6, { shape: 'flake', color: '#fff', vx: rnd() * 180, vy: -Math.random() * 100, life: 0.9, size: 4 });
        }
        break;
      }
      case 'swampleviathan': {
        // 🐊 Swamp Leviathan: a bubbling toxic swamp under it, green mist, glowing green eyes and poison drips
        glow(pp.x, pp.y + 8, 52, '64, 192, 87', 0.55);
        ctx.save(); ctx.translate(pp.x, pp.y + 9); ctx.scale(1, 0.32);
        ctx.fillStyle = 'rgba(43, 138, 62, 0.6)'; ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(180, 255, 120, 0.5)'; ctx.beginPath(); ctx.arc(-14, -8, 14, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (chance(10)) petSpark(pp.x + rnd() * 70, pp.y + 8, { shape: 'bubble', color: '#b6ff3f', vy: -22, life: 0.9, size: 2 + Math.random() * 4 });
        if (chance(5)) petSpark(x + rnd() * 60, y - 4, { shape: 'smoke', color: 'rgba(124, 255, 0, 0.22)', vx: rnd() * 20, vy: -10, life: 1.6, size: 9 });
        if (chance(3)) petSpark(x + rnd() * 30, y - 6, { shape: 'flame', color: '#7cff00', vy: 40, life: 0.6, size: 3 });
        break;
      }
      case 'glass': {
        // 🔮 the Glass Block pets: sparkles, spinning shards and rainbow light (the rarer the pet, the more of it)
        const lvl = { legendary: 1, mythic: 2, secret: 3, celestial: 4 }[pet.rarity] || 1;
        const gx = pp.x, gy = pp.y + 9;
        // light shining through it makes a rainbow spot on the ground
        ctx.save();
        ctx.translate(gx, gy); ctx.scale(1, 0.3);
        for (let k = 0; k < 5; k++) {
          ctx.strokeStyle = `hsla(${(k * 60 + time * 40) % 360}, 100%, 70%, ${0.22 + 0.04 * lvl})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, 14 + k * 4 + lvl * 4, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
        glow(x, y - 12, 30 + 10 * lvl, '208, 235, 255', 0.25 + 0.04 * lvl);
        // glass shards floating around it
        for (let k = 0; k < lvl + 1; k++) {
          const a = time * 1.4 + k * Math.PI * 2 / (lvl + 1) + seed;
          glassShard(x + Math.cos(a) * (24 + 5 * lvl), y - 14 + Math.sin(a) * 10, 3 + lvl * 0.6, a * 2, (k * 70 + time * 50) % 360);
        }
        // rainbow light beams fanning out of it (mythic and up)
        if (lvl >= 2) {
          ctx.save();
          ctx.globalAlpha = 0.18 + 0.1 * Math.sin(time * 3 + seed);
          for (let k = 0; k < 6; k++) {
            const a = -Math.PI / 2 + (k - 2.5) * 0.18 + Math.sin(time) * 0.1;
            ctx.strokeStyle = `hsl(${k * 55}, 100%, 65%)`; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + Math.cos(a) * (40 + 10 * lvl), y - 14 + Math.sin(a) * (40 + 10 * lvl)); ctx.stroke();
          }
          ctx.restore();
        }
        if (chance(4 + 3 * lvl)) petSpark(x + rnd() * 44, y - 10 + rnd() * 30, { shape: 'star', color: Math.random() < 0.5 ? '#fff' : '#d0ebff', vy: -6, life: 0.9, size: 2.5 });
        // secret and up: a chime of light now and then; celestial: a beam of light from the sky
        const beat = (time + seed) % 4;
        if (lvl >= 3 && beat < dt) {
          petSpark(gx, gy, { shape: 'ring', color: '#e7f5ff', vy: 0, life: 0.8, size: 12, grow: 110 });
          for (let k = 0; k < 6; k++) petSpark(x, y - 14, { shape: 'shard', vx: rnd() * 160, vy: rnd() * 140 - 40, life: 0.8, size: 3, hue: k * 60 });
        }
        if (lvl >= 4 && beat < 0.5) {
          const g = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
          ['rgba(255,140,200,0)', 'rgba(255,255,255,0.45)', 'rgba(140,220,255,0)'].forEach((c, i) => g.addColorStop(i / 2, c));
          ctx.fillStyle = g;
          ctx.globalAlpha = 1 - beat / 0.5;
          ctx.fillRect(x - 16, y - 220, 32, 205);
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'glasswolf': {
        // 🐺 Glass Wolf, the best Glass pet: a crystal mane of rainbow shards, a rainbow howl that rings up into the sky,
        // rainbow paw prints, orbiting glass shards, light from the sky, and it shatters and puts itself back together
        const gx = pp.x, gy = pp.y + 9;
        // a spinning prism circle of light on the ground
        ctx.save();
        ctx.translate(gx, gy); ctx.scale(1, 0.32);
        for (let k = 0; k < 7; k++) {
          ctx.strokeStyle = `hsla(${(k * 50 + time * 80) % 360}, 100%, 70%, 0.45)`;
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(0, 0, 30 + k * 7, time + k, time + k + Math.PI * 1.4); ctx.stroke();
        }
        ctx.restore();
        // a spiky crystal mane around its head, glowing in rainbow colors
        const hx = x + pp.facing * 6, hy = y - 22;
        for (let k = 0; k < 9; k++) {
          const a = -Math.PI * 0.95 + k * Math.PI * 0.95 / 8 + Math.sin(time * 3 + k) * 0.06;
          const len = 26 + 6 * Math.sin(time * 4 + k * 1.3);
          glassShard(hx + Math.cos(a) * len * 0.75, hy + Math.sin(a) * len * 0.75, 6, a + Math.PI / 2, (k * 40 + time * 60) % 360);
        }
        glow(x, y - 14, 90, '208, 235, 255', 0.36);
        glow(x, y - 14, 42, '255, 255, 255', 0.32);
        // the rainbow howl: every few seconds it howls and rainbow rings of sound float up into the sky
        const howl = (time + seed) % 4;
        if (howl < 1.6) {
          const f = pp.facing, mx = x + f * 14, my = y - 30;
          for (let k = 0; k < 4; k++) {
            const r = ((howl * 60 + k * 22) % 90) + 8, fade = 1 - r / 98;
            ctx.strokeStyle = `hsla(${(k * 80 + time * 120) % 360}, 100%, 70%, ${0.8 * fade})`; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(mx + f * r * 0.35, my - r, r * 0.55, r * 0.22, f * -0.5, 0, Math.PI * 2); ctx.stroke();
          }
          const g = ctx.createLinearGradient(mx, my, mx + f * 40, my - 170);
          g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, `hsla(${(time * 120) % 360}, 100%, 70%, 0)`);
          ctx.strokeStyle = g; ctx.lineWidth = 7; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + f * 40, my - 170); ctx.stroke(); ctx.lineCap = 'butt';
          glow(mx, my, 18, '255, 255, 255', 0.8);
          if (chance(14)) petSpark(mx + rnd() * 20, my - Math.random() * 100, { shape: 'star', color: `hsl(${Math.random() * 360}, 100%, 80%)`, vy: -30, life: 0.8, size: 3 });
        }
        // rainbow paw prints where it walks
        if (pp.moving && chance(6)) petSpark(pp.x + rnd() * 8, pp.y + 6, { shape: 'print', color: `hsla(${Math.random() * 360}, 100%, 75%, 0.7)`, vx: 0, vy: 0, life: 1.4, size: 3 });
        // big glass shards orbiting it, joined by threads of light
        const pts = [];
        for (let k = 0; k < 6; k++) {
          const a = time * 1.2 + k * Math.PI / 3 + seed;
          const ox = x + Math.cos(a) * 62, oy = y - 16 + Math.sin(a) * 22;
          pts.push([ox, oy]);
          glassShard(ox, oy, 7, a * 1.5, (k * 60 + time * 60) % 360);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.stroke();
        if (chance(16)) petSpark(x + rnd() * 100, y - 10 + rnd() * 60, { shape: 'star', color: `hsl(${Math.random() * 360}, 100%, 85%)`, vy: -8, life: 1, size: 3 });
        if (pp.moving && chance(10)) petSpark(pp.x + rnd() * 20, pp.y + 4, { shape: 'shard', vy: -20, vx: rnd() * 20, life: 1, size: 3, hue: Math.random() * 360 });
        // light from the sky every few seconds
        const beam = (time + seed * 0.7) % 4.5;
        if (beam < 0.6) {
          const g = ctx.createLinearGradient(x - 26, 0, x + 26, 0);
          ['rgba(255,120,200,0)', 'rgba(255,255,255,0.6)', 'rgba(120,220,255,0)'].forEach((c, i) => g.addColorStop(i / 2, c));
          ctx.fillStyle = g;
          ctx.globalAlpha = 1 - beam / 0.6;
          ctx.fillRect(x - 26, y - 260, 52, 245);
          ctx.globalAlpha = 1;
          if (beam < dt) petSpark(gx, gy, { shape: 'ring', color: '#ffffff', vy: 0, life: 1, size: 18, grow: 200 });
        }
        // it shatters into rainbow shards and puts itself back together
        const shatter = (time + seed) % 6;
        if (shatter < dt) {
          for (let k = 0; k < 22; k++) petSpark(x, y - 16, { shape: 'shard', vx: rnd() * 320, vy: rnd() * 260 - 60, life: 0.9, size: 4 + Math.random() * 3, hue: k * 17, spin: 9 });
          petSpark(x, y - 16, { shape: 'ring', color: '#e7f5ff', vy: 0, life: 0.7, size: 16, grow: 160 });
        }
        break;
      }
      case 'cyber': {
        // ⚡ the Cyber Block pets: cyan cyber power (the rarer the pet, the more of it)
        const lvl = { legendary: 1, mythic: 2, secret: 3, celestial: 4 }[pet.rarity] || 1;
        const gx = pp.x, gy = pp.y + 9;
        glow(gx, gy, 30 + 12 * lvl, '46, 232, 255', 0.22);
        ctx.save();
        ctx.translate(gx, gy); ctx.scale(1, 0.32);
        hexagon(0, 0, 22 + 6 * lvl, time * 0.9, 1, 0.8, true);
        if (lvl >= 2) hexagon(0, 0, 12 + 4 * lvl, -time * 1.4, 0.8, 0.6, true);
        ctx.restore();
        glow(x, y - 12, (34 + 12 * lvl) * (1 + Math.sin(time * 5) * 0.08), '46, 232, 255', 0.22 + 0.04 * lvl);
        // energy orbs flying around it (mythic and up)
        for (let k = 0; k < lvl - 1; k++) {
          const a = time * 2 + k * Math.PI * 2 / (lvl - 1) + seed;
          const ox = x + Math.cos(a) * (30 + 4 * lvl), oy = y - 14 + Math.sin(a) * 12;
          glow(ox, oy, 10, '46, 232, 255', 0.6);
          cyberRing(ox, oy, 2.4);
          if (lvl >= 3 && Math.random() < 0.25) zap(ox, oy, x + rnd() * 10, y - 12, 4, 0.7);
        }
        // little lightning crackles
        if (Math.random() < 0.12 * lvl) {
          const a = Math.random() * Math.PI * 2;
          zap(x + Math.cos(a) * 16, y - 12 + Math.sin(a) * 10, x + Math.cos(a + 0.4) * (28 + 6 * lvl), y - 12 + Math.sin(a + 0.4) * (16 + 3 * lvl), 3);
        }
        if (chance(3 + 3 * lvl)) petSpark(x + rnd() * 40, y + 4, { shape: 'hex', color: CYAN, vy: -40, vx: rnd() * 10, life: 1.2, size: 1.5 + Math.random() * 2 });
        // secret and up: an energy pulse every few seconds; celestial: a lightning strike from the sky too
        const beat = (time + seed) % 4;
        if (lvl >= 3 && beat < dt) petSpark(gx, gy, { shape: 'ring', color: CYAN, vy: 0, life: 0.8, size: 12, grow: 120 });
        if (lvl >= 4 && beat < 0.18) {
          zap(x + rnd() * 40, y - 180, x, y - 18, 14, 2);
          glow(x, y - 18, 80, '217, 253, 255', 0.45 * (1 - beat / 0.18));
        }
        break;
      }
      case 'cyberwhale': {
        // ⚡ Cyber Whale, the best pet: EPIC cyber power all around it
        const pulse = 1 + Math.sin(time * 5) * 0.1;
        const gx = pp.x, gy = pp.y + 9;
        // a glowing circuit platform on the ground with spinning hexagon rings
        glow(gx, gy, 85, '46, 232, 255', 0.3);
        ctx.save();
        ctx.translate(gx, gy); ctx.scale(1, 0.32);
        hexagon(0, 0, 62, time * 0.7, 1.4, 0.9);
        hexagon(0, 0, 44, -time * 1.2, 1, 0.75);
        for (let k = 0; k < 12; k++) {
          const a = k * Math.PI / 6 + time * 0.7;
          seam([[Math.cos(a) * 64, Math.sin(a) * 64], [Math.cos(a) * 74, Math.sin(a) * 74]], 0.8);
        }
        ctx.restore();
        // the big energy aura
        glow(x, y - 12, 100 * pulse, '46, 232, 255', 0.42);
        glow(x, y - 12, 48, '217, 253, 255', 0.38);
        // three energy orbs flying around it, linked to it by lightning
        for (let k = 0; k < 3; k++) {
          const a = time * 1.8 + k * 2.094 + seed;
          const ox = x + Math.cos(a) * 58, oy = y - 16 + Math.sin(a) * 20;
          glow(ox, oy, 16, '46, 232, 255', 0.7);
          cyberRing(ox, oy, 3.2);
          if (Math.random() < 0.45) zap(ox, oy, x + rnd() * 16, y - 14 + rnd() * 10, 5, 0.9);
        }
        // crackling lightning close around its body
        if (Math.random() < 0.8) {
          for (let k = 0; k < 2; k++) {
            const a = Math.random() * Math.PI * 2, r1 = 22 + Math.random() * 8, r2 = 42 + Math.random() * 20;
            zap(x + Math.cos(a) * r1, y - 12 + Math.sin(a) * r1 * 0.7, x + Math.cos(a + 0.4) * r2, y - 12 + Math.sin(a + 0.4) * r2 * 0.6, 4);
          }
        }
        // glowing hexagon sparks rising up
        if (chance(14)) petSpark(x + rnd() * 90, y + 6, { shape: 'hex', color: CYAN, vy: -45, vx: rnd() * 10, life: 1.4, size: 2 + Math.random() * 3 });
        // every few seconds: a giant lightning bolt strikes it from the sky
        const strike = (time + seed * 0.7) % 4.5;
        if (strike < 0.22) {
          zap(x + rnd() * 60, y - 230, x, y - 20, 22, 3);
          zap(x + rnd() * 80, y - 200, x + rnd() * 10, y - 30, 16, 1.8);
          glow(x, y - 20, 140, '217, 253, 255', 0.55 * (1 - strike / 0.22));
          if (strike < dt) {
            petSpark(gx, gy, { shape: 'ring', color: CYAN, vy: 0, life: 1, size: 18, grow: 220 });
            for (let k = 0; k < 14; k++) petSpark(x, y - 16, { shape: 'hex', color: k % 2 ? '#d9fdff' : CYAN, vx: rnd() * 260, vy: rnd() * 200 - 60, life: 0.8, size: 3 });
          }
        }
        // a plasma spout from its blowhole, and a plasma beam from its mouth
        const beam = (time + seed) % 3.4;
        if (beam < 1.1) {
          const grow = Math.min(1, beam * 4), f = pp.facing, wv = 7 + Math.sin(time * 40) * 1.5;
          const bx = x - f * 4 * big, by = y - 22 * big;
          plasmaBeam(bx, by, bx + Math.sin(time * 9) * 6, by - 110 * grow, wv * 1.2);
          for (let k = 0; k < 2; k++) {
            petSpark(bx, by - 100 * grow, { shape: 'hex', color: k ? CYAN : '#d9fdff', vx: rnd() * 140, vy: -40 + Math.random() * 120, life: 0.9, size: 2.5 });
          }
          plasmaBeam(x + f * 18 * big, y - 4 * big, x + f * (18 * big + 140 * grow), y + 2, wv);
        }
        break;
      }
      case 'infinity': {
        // ♾️ Infinity Dragon, the best pet: a rainbow galaxy around it, rainbow fire and color waves
        const hue = (time * 90) % 360;
        glow(x, y - 8, 80, hueRgb(hue), 0.5);
        glow(x, y - 8, 50, hueRgb((hue + 120) % 360), 0.45);
        glow(x, y - 8, 26, '255, 255, 255', 0.6);
        for (let k = 0; k < 12; k++) {
          const a = time * (k % 2 ? 1.6 : -2.2) + k * Math.PI / 6;
          const rad = k % 2 ? 58 : 40;
          star(x + Math.cos(a) * rad, y - 8 + Math.sin(a) * rad * 0.4, 4.5, `hsl(${(hue + k * 30) % 360}, 100%, 65%)`);
        }
        if (chance(25)) petSpark(x + rnd() * 70, y - 8 + rnd() * 40, { shape: 'star', color: `hsl(${Math.random() * 360}, 100%, 70%)`, vy: -10, life: 0.9, size: 3 });
        const beat = (time + seed) % 3;
        if (beat < dt) petSpark(x, y - 8, { shape: 'ring', color: `hsl(${hue}, 100%, 60%)`, vy: 0, life: 1, size: 24, grow: 140 });
        if (beat < 1.1) breathe(x, y, pp.facing, [0, 60, 120, 200, 280].map(h => `hsl(${(hue + h) % 360}, 100%, 60%)`), rnd);
        break;
      }
    }

    // the pet itself
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt * pp.facing);
    ctx.scale(-pp.turn * big * sx, big * sy); // pet emojis face left; turn smoothly to face where they go
    if (pet.fx === 'infinity') ctx.filter = `hue-rotate(${(time * 90) % 360}deg) saturate(1.6)`;
    if (pet.fx === 'spirittiger') ctx.globalAlpha *= 0.75 + 0.15 * Math.sin(time * 3 + seed); // a see-through spirit
    if (pet.fx === 'cyberwhale' && Math.random() < 0.04) ctx.translate((Math.random() - 0.5) * 6, 0); // a little glitch
    ctx.font = `30px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // emoji pets get a soft glow in their rarity color (low-poly pets are drawn from many pieces, so they skip it)
    if (r.order >= 2 && !PET_MODELS[pet.id]) { ctx.shadowColor = r.color === '#111111' ? '#ff5a00' : r.color; ctx.shadowBlur = 14; }
    if (pet.fx === 'cyberwhale' && pp.moving) {
      // glowing ghost copies trailing behind it when it moves
      for (const [off, a] of [[16, 0.22], [30, 0.1]]) {
        ctx.save(); ctx.globalAlpha = a; ctx.translate(off, 0);
        PET_MODELS[pet.id](time - off * 0.01, seed, true, true);
        ctx.restore();
      }
    }
    if (pet.fx === 'glasswolf' && (time + seed) % 6 < 0.35) ctx.globalAlpha *= 0.15; // shattered for a moment
    if (PET_MODELS[pet.id]) PET_MODELS[pet.id](time, seed, pet.kind === 'fly' || pet.kind === 'swim', pp.moving);
    else ctx.fillText(pet.emoji, 0, 10); // drawn from its feet, so squishing and sitting look right
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
    if (pet.fx === 'holy') {
      ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3;
      ctx.shadowColor = '#ffd43b'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.ellipse(x, y - 30 * big - 4, 11, 4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (pet.fx === 'xmas' || pet.fx === 'reindeer' || pet.fx === 'candysnake') {
      // 🎅 a little Santa hat (the snake's head is up on top of its candy cane hook, out in front)
      const snake = pet.fx === 'candysnake';
      const hx = snake ? x + pp.facing * 15 * big : x - pp.facing * 6 * big, hy = y - (snake ? 15.5 : 28) * big; // the snake's is on the back of its head
      ctx.fillStyle = '#e03131';
      ctx.beginPath(); ctx.moveTo(hx - 8, hy + 3); ctx.quadraticCurveTo(hx - 2, hy - 14, hx + pp.facing * -9, hy - 9); ctx.lineTo(hx + 8, hy + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(hx, hy + 3, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + pp.facing * -9, hy - 9, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    if (pet.fx === 'king') {
      // a golden crown on the Dragon King
      const cy = y - 30 * big - 2, cx = x;
      ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#e8a200'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 11, cy + 6); ctx.lineTo(cx - 11, cy - 6); ctx.lineTo(cx - 5, cy); ctx.lineTo(cx, cy - 9);
      ctx.lineTo(cx + 5, cy); ctx.lineTo(cx + 11, cy - 6); ctx.lineTo(cx + 11, cy + 6); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e03131'; ctx.beginPath(); ctx.arc(cx, cy + 2, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPetParticles(dt) {
    for (let i = petParticles.length - 1; i >= 0; i--) {
      const p = petParticles[i];
      p.t += dt;
      if (p.t > p.life) { petParticles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      switch (p.shape) {
        case 'heart':
          ctx.font = `bold ${p.size * 2}px sans-serif`; ctx.textAlign = 'center';
          ctx.fillText(p.infinity ? '∞' : p.radiation ? '☢' : '♥', p.x, p.y);
          break;
        case 'leaf':
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size / 2, p.t * 4, 0, Math.PI * 2); ctx.fill();
          break;
        case 'flake':
          ctx.strokeStyle = p.color; ctx.lineWidth = 1.2;
          for (let k = 0; k < 3; k++) {
            const an = k * Math.PI / 3;
            ctx.beginPath(); ctx.moveTo(p.x - Math.cos(an) * p.size, p.y - Math.sin(an) * p.size);
            ctx.lineTo(p.x + Math.cos(an) * p.size, p.y + Math.sin(an) * p.size); ctx.stroke();
          }
          break;
        case 'star': star(p.x, p.y, p.size * (0.5 + a), p.color); break;
        case 'bubble':
          ctx.strokeStyle = p.color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'smoke':
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.t), 0, Math.PI * 2); ctx.fill();
          break;
        case 'flame':
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
          break;
        case 'bit': // a flying 0 or 1
          ctx.font = `bold ${p.size}px monospace`; ctx.textAlign = 'center';
          ctx.fillText(p.text, p.x, p.y);
          break;
        case 'print': // a burning footprint
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
          break;
        case 'shard': // a spinning piece of glass
          glassShard(p.x, p.y, p.size, (p.rot || 0) + p.t * (p.spin || 5), p.hue || 200, 1);
          break;
        case 'hex': // a little glowing hexagon spark
          hexagon(p.x, p.y, p.size, p.t * 3, 0.6, a);
          break;
        case 'ring': // a shockwave
          ctx.strokeStyle = p.color; ctx.lineWidth = 4 * a;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size + p.t * p.grow, (p.size + p.t * p.grow) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'bolt': // lightning
          ctx.strokeStyle = p.color; ctx.lineWidth = 2.2;
          ctx.shadowColor = '#4dabf7'; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          for (const [bx, by] of p.pts) ctx.lineTo(p.x + bx, p.y + by);
          ctx.stroke(); ctx.shadowBlur = 0;
          break;
        default:
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // a topping sitting on a scoop
  function drawTopping(id, x, y, r, time, seed = 0) {
    const neon = NEON[id] || '#ff4fd8', rgb = neonRgb(neon);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4 + seed * 1.7);
    ctx.save();
    // neon halo behind the topping
    const halo = ctx.createRadialGradient(x, y - 1, 0, x, y - 1, r * 1.5);
    halo.addColorStop(0, `rgba(${rgb}, ${0.35 + 0.25 * pulse})`);
    halo.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y - 1, r * 1.5, 0, Math.PI * 2); ctx.fill();
    // the topping itself glows (toppings with their own glow keep it)
    ctx.shadowColor = neon; ctx.shadowBlur = 5 + 5 * pulse;
    switch (id) {
      case 'sprinkles':
        ['#ff6b6b', '#4dabf7', '#fcc419', '#51cf66', '#cc5de8'].forEach((c, k) => {
          ctx.strokeStyle = c; ctx.lineWidth = 1.4;
          const a = k * 1.3 + seed, d = r * 0.5;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6);
          ctx.lineTo(x + Math.cos(a) * d + 2, y + Math.sin(a) * d * 0.6 + 1); ctx.stroke();
        });
        break;
      case 'syrup':
        ctx.fillStyle = '#5a2e14';
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.75, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - r * 0.5, y, 1.6, r * 0.6); ctx.fillRect(x + r * 0.3, y, 1.6, r * 0.45);
        break;
      case 'whipped':
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e9ecef'; ctx.lineWidth = 0.8;
        for (const [dx, dy, rr] of [[0, 0, 0.5], [-0.25, -0.35, 0.35], [0.2, -0.6, 0.25]]) {
          ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        break;
      case 'cherry':
        ctx.strokeStyle = '#2b8a3e'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.quadraticCurveTo(x + 2, y - 7, x + 4, y - 8); ctx.stroke();
        ctx.fillStyle = '#e3002b';
        ctx.beginPath(); ctx.arc(x, y - 1, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(x - 1, y - 2, 1, 0, Math.PI * 2); ctx.fill();
        break;
      case 'goldflakes':
        ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 6;
        for (let k = 0; k < 4; k++) {
          const a = k * 1.7 + seed + time;
          ctx.fillStyle = k % 2 ? '#ffd700' : '#fff3a0';
          ctx.fillRect(x + Math.cos(a) * r * 0.5 - 1, y + Math.sin(a) * r * 0.3 - 1, 2.2, 2.2);
        }
        break;
      case 'stardust':
        ctx.shadowColor = '#b197fc'; ctx.shadowBlur = 8;
        for (let k = 0; k < 3; k++) {
          const a = time * 2 + k * 2.1 + seed;
          star(x + Math.cos(a) * r * 0.9, y - 2 + Math.sin(a) * r * 0.5, 2.6, k % 2 ? '#e5dbff' : '#b197fc');
        }
        break;
      case 'royalcrown': // 👑 a tiny gold crown with a shine
        ctx.shadowColor = '#ffd43b'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#b07800'; ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x - 4, y + 1); ctx.lineTo(x - 4, y - 3); ctx.lineTo(x - 2, y - 1); ctx.lineTo(x, y - 4.5);
        ctx.lineTo(x + 2, y - 1); ctx.lineTo(x + 4, y - 3); ctx.lineTo(x + 4, y + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#e03131'; ctx.beginPath(); ctx.arc(x, y - 0.5, 0.9, 0, Math.PI * 2); ctx.fill();
        if (Math.sin(time * 4 + seed) > 0.3) star(x + 3, y - 4, 1.8, '#ffffff');
        break;
      case 'lightning': // ⚡ yellow bolts that flash
        ctx.shadowColor = '#fff36b'; ctx.shadowBlur = 10;
        ctx.strokeStyle = Math.sin(time * 10 + seed) > 0 ? '#fff36b' : '#ffffff'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
        for (const dx of [-r * 0.4, r * 0.4]) {
          ctx.beginPath(); ctx.moveTo(x + dx + 1, y - 5); ctx.lineTo(x + dx - 1, y - 1.5); ctx.lineTo(x + dx + 1, y - 1.5); ctx.lineTo(x + dx - 1, y + 2); ctx.stroke();
        }
        break;
      case 'galaxydust': // 🌌 a little spinning galaxy with stars
        ctx.shadowColor = '#9775fa'; ctx.shadowBlur = 10;
        for (let k = 0; k < 2; k++) {
          ctx.strokeStyle = k ? '#e5dbff' : '#7048e8'; ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let j = 0; j <= 10; j++) {
            const a = time * 2 + k * Math.PI + j * 0.45, d = j * 0.45;
            ctx.lineTo(x + Math.cos(a) * d, y - 2 + Math.sin(a) * d * 0.6);
          }
          ctx.stroke();
        }
        for (let k = 0; k < 3; k++) {
          const a = -time * 1.5 + k * 2.1 + seed;
          star(x + Math.cos(a) * r * 0.8, y - 2 + Math.sin(a) * r * 0.45, 1.6, k % 2 ? '#ffffff' : '#d0bfff');
        }
        break;
      case 'gummies':
        ['#ff6b6b', '#fcc419', '#51cf66'].forEach((c, k) => {
          const gx = x + (k - 1) * r * 0.45, gy = y - (k === 1 ? 2 : 0);
          ctx.fillStyle = c;
          ctx.beginPath(); ctx.ellipse(gx, gy, 1.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(gx, gy - 2.4, 1.3, 0, Math.PI * 2); ctx.fill();
        });
        break;
      case 'caramel':
        ctx.strokeStyle = '#d9822b'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - r * 0.7, y);
        for (let k = 1; k <= 6; k++) ctx.lineTo(x - r * 0.7 + k * r * 0.23, y + (k % 2 ? -r * 0.25 : r * 0.1));
        ctx.stroke();
        ctx.fillStyle = '#d9822b';
        ctx.fillRect(x - r * 0.2, y, 1.6, r * 0.55);
        break;
      case 'cookies':
        for (let k = 0; k < 5; k++) {
          const a = k * 1.25 + seed;
          ctx.fillStyle = k % 2 ? '#3b2a20' : '#5c4033';
          ctx.fillRect(x + Math.cos(a) * r * 0.55 - 1.2, y + Math.sin(a) * r * 0.3 - 1.2, 2.4, 2);
        }
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(x - 1, y - 1, 2, 1.2);
        break;
      case 'waffle':
        ctx.fillStyle = '#e0a458'; ctx.strokeStyle = '#a0662a'; ctx.lineWidth = 0.6;
        for (const [dx, dy, rot] of [[-0.4, 0, 0.3], [0.35, -0.2, -0.4]]) {
          ctx.save(); ctx.translate(x + dx * r, y + dy * r); ctx.rotate(rot);
          ctx.fillRect(-2.5, -2.5, 5, 5); ctx.strokeRect(-2.5, -2.5, 5, 5);
          ctx.beginPath(); ctx.moveTo(0, -2.5); ctx.lineTo(0, 2.5); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.stroke();
          ctx.restore();
        }
        break;
      case 'diamonddust':
        ctx.shadowColor = '#a5f3ff'; ctx.shadowBlur = 7;
        for (let k = 0; k < 4; k++) {
          const a = k * 1.6 + seed + time * 0.8, dx = x + Math.cos(a) * r * 0.55, dy = y + Math.sin(a) * r * 0.3;
          ctx.fillStyle = k % 2 ? '#e3fafc' : '#66d9e8';
          ctx.beginPath(); ctx.moveTo(dx, dy - 2.2); ctx.lineTo(dx + 1.5, dy); ctx.lineTo(dx, dy + 2.2); ctx.lineTo(dx - 1.5, dy); ctx.fill();
        }
        break;
      case 'planets':
        for (let k = 0; k < 2; k++) {
          const a = time * 1.5 + k * Math.PI + seed, px = x + Math.cos(a) * r * 0.7, py = y - 2 + Math.sin(a) * r * 0.35;
          ctx.fillStyle = k ? '#ff922b' : '#748ffc';
          ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.ellipse(px, py, 3.6, 1, -0.3, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      case 'dragonfire':
        ctx.shadowColor = '#ff6b00'; ctx.shadowBlur = 10;
        for (let k = 0; k < 3; k++) {
          const fx = x + (k - 1) * r * 0.45, h = 4 + 2 * Math.sin(time * 9 + k * 2 + seed);
          ctx.fillStyle = k === 1 ? '#ffd43b' : '#ff6b00';
          ctx.beginPath(); ctx.moveTo(fx - 1.8, y); ctx.quadraticCurveTo(fx, y - h * 1.6, fx + 1.8, y); ctx.fill();
        }
        break;
    }
    // a flickering neon ring and two neon sparks zooming around it
    ctx.shadowColor = neon; ctx.shadowBlur = 8;
    ctx.strokeStyle = `rgba(${rgb}, ${Math.sin(time * 23 + seed) > -0.85 ? 0.55 + 0.35 * pulse : 0.15})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(x, y + 0.5, r * 0.95, r * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 2; k++) {
      const a = time * 3 + k * Math.PI + seed;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.95, y + 0.5 + Math.sin(a) * r * 0.32, 0.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function star(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, rr = k % 2 ? r * 0.35 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }

  function drawStand(s, time) {
    const slot = slots[s.slot];
    const { x, y } = slot;
    const mine = s.id === myId;

    // the plot's ground
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(x - 150, y - 125, 300, 195, 16); ctx.fill();
    ctx.strokeStyle = s.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
    ctx.stroke(); ctx.globalAlpha = 1;

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
    ctx.fillRect(x - 85, y + 48, 170, 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2;
    roundRect(x - 85, y, 170, 60, 6); ctx.stroke();

    // flavor spaces
    const held = mine ? heldItem() : null;
    const holding = held ? (toppingById[held.flavor] ? 'topping' : 'tub') : null;
    for (let i = 0; i < s.spaces; i++) drawTub(s, i, slot, time, holding);

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

    if (mine) {
      spaceBtn = null;
      const cost = !s.tubs.includes(null) ? spaceCost(s.spaces, seeCyber) : null;
      if (cost !== null) {
        // stand is full: show the Extra Space button on top of it
        const text = `Extra Space +${spacesPerBuy(s.spaces, seeCyber)} (${fmt(cost)})`;
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
      } else if (!s.tubs.some(Boolean)) {
        drawBubbleButton(x, ay - 54, 'Buy ice cream at the shop!', '#ff6fa5', time);
      }
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
    if (flavor.effect) drawFlavorFx(flavor, cx, cy, r, true);
    fillScoop(flavor, cx, cy, r, false);
    if (flavor.effect) drawFlavorFx(flavor, cx, cy, r, false);
  }

  // ---------- flavor effects (Phoenix Fire flames, Galaxy stars, Void aura...) ----------
  const SHERBET = ['#ff8a5c', '#ffd56b', '#ff9ad5', '#9be08a'];
  let nowSec = 0; // set every frame

  // ⚡ Robo Ice Cream: a polished chrome ball with panel lines, little bolts, one glowing crack
  // and a glowing core, lit from the top left like real metal
  function drawRoboScoop(x, y, r, outline) {
    ctx.save();
    // chrome: bright highlight, the sky reflected on top, a dark horizon band, the ground reflected underneath
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x, y, r * 1.05);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, '#dfe7ee'); g.addColorStop(0.45, '#8d9aa6');
    g.addColorStop(0.7, '#3d4852'); g.addColorStop(0.9, '#1a2026'); g.addColorStop(1, '#0d1115');
    ctx.fillStyle = g;
    outline(); ctx.fill();
    outline(); ctx.clip();
    const band = ctx.createLinearGradient(0, y - r, 0, y + r);
    band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.46, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(10,14,18,0.55)'); band.addColorStop(0.58, 'rgba(10,14,18,0.15)');
    band.addColorStop(0.8, 'rgba(140,160,175,0.25)'); band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    // panel lines: one around the middle and one over the top, each with a light edge so they look cut in
    const lw = Math.max(0.4, r * 0.05);
    const line = (draw, dark) => { ctx.beginPath(); draw(); ctx.strokeStyle = dark ? 'rgba(8,10,12,0.75)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = lw; ctx.stroke(); };
    for (const [dy, dark] of [[0, true], [lw, false]]) {
      line(() => ctx.ellipse(x, y + r * 0.12 + dy, r, r * 0.32, 0, 0, Math.PI), dark);
      line(() => ctx.ellipse(x - r * 0.08 + dy, y, r * 0.38, r, 0, -Math.PI / 2, Math.PI / 2), dark);
    }
    // bolts along the panel lines
    if (r > 6) {
      for (const a of [0.55, 1.45, 2.35]) {
        const bx = x + Math.cos(a) * r * 0.86, by = y + r * 0.12 + Math.sin(a) * r * 0.28;
        ctx.fillStyle = '#20272e'; ctx.beginPath(); ctx.arc(bx, by, r * 0.07, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c9d3dc'; ctx.beginPath(); ctx.arc(bx - r * 0.02, by - r * 0.02, r * 0.035, 0, Math.PI * 2); ctx.fill();
      }
    }
    // one thin glowing crack
    seam([[x + r * 0.25, y - r], [x + r * 0.35, y - r * 0.55], [x + r * 0.62, y - r * 0.35]], Math.max(0.3, r * 0.06));
    // cyan light bouncing off the bottom edge
    ctx.strokeStyle = 'rgba(46,232,255,0.55)'; ctx.lineWidth = r * 0.12;
    ctx.beginPath(); ctx.arc(x, y, r * 0.97, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.restore();
    // the glowing core: a little lens with light inside
    const cx = x + r * 0.18, cy = y + r * 0.42, cr = r * 0.22;
    ctx.save();
    ctx.fillStyle = '#0b1116';
    ctx.beginPath(); ctx.arc(cx, cy, cr * 1.3, 0, Math.PI * 2); ctx.fill();
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    core.addColorStop(0, '#ffffff'); core.addColorStop(0.35, '#b8faff'); core.addColorStop(0.7, CYAN); core.addColorStop(1, 'rgba(46,232,255,0.2)');
    ctx.shadowColor = CYAN; ctx.shadowBlur = r * 0.6;
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // the shiny spot where the light hits
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.42, y - r * 0.5, r * 0.2, r * 0.11, -0.6, 0, Math.PI * 2); ctx.fill();
  }

  // 🔮 Glass Ice Cream: a see-through glass ball with a rainbow edge, facets, tiny bubbles and a bright shine
  function drawGlassScoop(x, y, r, outline) {
    ctx.save();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.85)'); g.addColorStop(0.5, 'rgba(208, 235, 255, 0.55)');
    g.addColorStop(1, 'rgba(116, 192, 252, 0.6)');
    ctx.fillStyle = g;
    outline(); ctx.fill();
    outline(); ctx.clip();
    // light splitting into a rainbow inside the glass
    const rb = ctx.createLinearGradient(x - r, y + r, x + r, y - r);
    [0, 60, 130, 200, 280].forEach((h, i, a) => rb.addColorStop(i / (a.length - 1), `hsla(${(h + nowSec * 30) % 360}, 100%, 70%, 0.3)`));
    ctx.fillStyle = rb;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    // facets (flat cut faces) and tiny bubbles
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = Math.max(0.4, r * 0.05);
    ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.1); ctx.lineTo(x - r * 0.2, y - r * 0.3); ctx.lineTo(x + r, y + r * 0.05);
    ctx.moveTo(x - r * 0.2, y - r * 0.3); ctx.lineTo(x + r * 0.1, y + r); ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (const [bx, by, br] of [[0.35, 0.35, 0.07], [0.5, 0.05, 0.05], [-0.2, 0.55, 0.06]]) {
      ctx.beginPath(); ctx.arc(x + bx * r, y + by * r, br * r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // a rainbow edge and a white rim, like the edge of real glass
    ctx.save();
    ctx.lineWidth = Math.max(0.6, r * 0.09);
    ctx.strokeStyle = `hsla(${(nowSec * 90) % 360}, 100%, 70%, 0.7)`;
    outline(); ctx.stroke();
    ctx.lineWidth = Math.max(0.4, r * 0.04); ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    outline(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.22, r * 0.11, -0.6, 0, Math.PI * 2); ctx.fill();
  }

  // pictures of the Robo things for the shops (made once, the same drawing as in the park)
  let roboArt = null;
  function makeRoboArt() {
    if (roboArt) return roboArt;
    const paint = (w, h, draw) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const saved = ctx;
      ctx = c.getContext('2d');
      draw();
      ctx = saved;
      return c.toDataURL();
    };
    roboArt = {
      // the Robo Ice Cream ball for the shop, hotbar and Inventory
      scoop: paint(72, 72, () => drawRoboScoop(36, 36, 32, () => { ctx.beginPath(); ctx.arc(36, 36, 32, 0, Math.PI * 2); })),
      // a round piece of armor for the Avatar Shop swatches
      metal: paint(72, 72, () => {
        const g = ctx.createLinearGradient(6, 6, 66, 66);
        g.addColorStop(0, '#9aa7b4'); g.addColorStop(0.35, '#4a5763'); g.addColorStop(0.65, '#2c343c'); g.addColorStop(1, '#151b21');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(36, 36, 34, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(36, 36, 34, 0, Math.PI * 2); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; // brushed metal
        for (let i = -72; i < 72; i += 3) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 72, 72); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(8,10,12,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(72, 42); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(72, 44); ctx.stroke();
        seam([[14, 54], [24, 46], [22, 38]], 1.4);
        ctx.restore();
        for (const [bx, by] of [[18, 20], [54, 24], [50, 56]]) {
          ctx.fillStyle = '#151b21'; ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#c9d3dc'; ctx.beginPath(); ctx.arc(bx - 0.8, by - 0.8, 1.5, 0, Math.PI * 2); ctx.fill();
        }
        cyberRing(40, 46, 5);
      }),
    };
    // 🔮 the Glass things for the shops
    roboArt.glassScoop = paint(72, 72, () => drawGlassScoop(36, 36, 32, () => { ctx.beginPath(); ctx.arc(36, 36, 32, 0, Math.PI * 2); }));
    roboArt.glassPiece = paint(72, 72, () => {
      const g = ctx.createLinearGradient(6, 6, 66, 66);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, 'rgba(208,235,255,0.75)'); g.addColorStop(1, 'rgba(116,192,252,0.85)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(36, 36, 34, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(36, 36, 34, 0, Math.PI * 2); ctx.clip();
      const rb = ctx.createLinearGradient(0, 72, 72, 0);
      [0, 60, 130, 200, 280].forEach((h, i, a) => rb.addColorStop(i / (a.length - 1), `hsla(${h}, 100%, 70%, 0.45)`));
      ctx.fillStyle = rb; ctx.fillRect(0, 0, 72, 72);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(30, 26); ctx.lineTo(72, 38); ctx.moveTo(30, 26); ctx.lineTo(40, 72); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.ellipse(22, 20, 10, 5, -0.6, 0, Math.PI * 2); ctx.fill();
    });
    document.documentElement.style.setProperty('--glass-scoop', `url(${roboArt.glassScoop})`);
    document.documentElement.style.setProperty('--glass-piece', `url(${roboArt.glassPiece})`);
    document.documentElement.style.setProperty('--robo-scoop', `url(${roboArt.scoop})`);
    document.documentElement.style.setProperty('--robo-metal', `url(${roboArt.metal})`);
    return roboArt;
  }

  // a scoop: full circle, or the top half (ice cream in a tub)
  function fillScoop(f, x, y, r, half) {
    const outline = () => { ctx.beginPath(); if (half) ctx.arc(x, y, r, Math.PI, 0); else ctx.arc(x, y, r, 0, Math.PI * 2); };
    const stripes = f.stripes || (f.effect === 'sherbet' ? SHERBET : null);
    if (stripes) {
      // striped scoop (Rainbow Sherbet, or the Rainbow mutation)
      ctx.save();
      outline(); ctx.closePath(); ctx.clip();
      const band = (2 * r) / stripes.length;
      stripes.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x - r, y - r + i * band, 2 * r, band + 0.5); });
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; // shine
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (f.effect === 'robo') { drawRoboScoop(x, y, r, outline); return; }
    if (f.effect === 'glass') { drawGlassScoop(x, y, r, outline); return; }
    if (f.effect === 'candycane') {
      // 🎄 Candy Cane Swirl: red and white candy stripes spinning, with a minty shine
      ctx.fillStyle = '#ffffff'; outline(); ctx.fill();
      ctx.save(); outline(); ctx.clip();
      ctx.translate(x, y); ctx.rotate(nowSec * 0.8);
      ctx.fillStyle = '#e03131';
      for (let k = -4; k <= 4; k++) { ctx.beginPath(); ctx.rect(k * r * 0.5 - r * 0.12, -r * 2, r * 0.24, r * 4); ctx.fill(); }
      ctx.restore();
      ctx.save(); outline(); ctx.clip();
      ctx.fillStyle = 'rgba(178, 242, 187, 0.35)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (f.effect === 'infinity') {
      // Infinity Swirl: every color swirling around and slowly spinning
      const spin = nowSec * 1.5;
      let g;
      if (ctx.createConicGradient) {
        g = ctx.createConicGradient(spin, x, y);
        [0, 50, 110, 180, 250, 310, 360].forEach((h, i, a) => g.addColorStop(i / (a.length - 1), `hsl(${h}, 100%, 62%)`));
      } else {
        g = ctx.createLinearGradient(x - r, y, x + r, y);
        [0, 60, 120, 200, 280].forEach((h, i, a) => g.addColorStop(i / (a.length - 1), `hsl(${(h + nowSec * 90) % 360}, 100%, 62%)`));
      }
      ctx.fillStyle = g;
      outline(); ctx.fill();
      // a white swirl and shine on top
      ctx.save();
      outline(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(0.6, r * 0.14);
      ctx.beginPath(); ctx.arc(x, y, r * 0.5, spin, spin + Math.PI * 1.3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (f.effect === 'void') {
      // pitch-black middle fading to deep purple, with tiny stars inside
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, '#000000');
      g.addColorStop(0.55, '#12002e');
      g.addColorStop(1, '#5a1fb8');
      ctx.fillStyle = g;
      outline(); ctx.fill();
      ctx.save();
      outline(); ctx.clip();
      for (let k = 0; k < 6; k++) {
        const a = nowSec * 0.6 + k * 1.05, d = r * (0.25 + (k % 3) * 0.22);
        ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(nowSec * 3 + k))})`;
        ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.6, r * 0.09), Math.max(0.6, r * 0.09));
      }
      ctx.restore();
      return;
    }
    if (f.effect === 'prism') {
      // Prism Swirl: a spinning rainbow swirl
      ctx.save();
      outline(); ctx.clip();
      for (let k = 0; k < 12; k++) {
        const a0 = nowSec * 2 + (k / 12) * Math.PI * 2;
        ctx.fillStyle = `hsl(${k * 30}, 95%, 62%)`;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 1.1, a0, a0 + Math.PI / 6 + 0.02); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (f.effect === 'blackhole') {
      // Black Hole: a dark swirl pulled into a pitch black middle
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, '#000000'); g.addColorStop(0.45, '#000000'); g.addColorStop(0.8, '#4c1d95'); g.addColorStop(1, '#c084fc');
      ctx.fillStyle = g;
      outline(); ctx.fill();
      ctx.save(); outline(); ctx.clip();
      ctx.strokeStyle = 'rgba(216, 180, 254, 0.7)'; ctx.lineWidth = Math.max(0.5, r * 0.08);
      for (let k = 0; k < 3; k++) {
        const a0 = -nowSec * 2.5 + k * 2.09;
        ctx.beginPath();
        for (let j = 0; j <= 12; j++) {
          const a = a0 + j * 0.35, d = r * (1 - j / 14);
          ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
        }
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (f.effect === 'diamond') {
      // Diamond Freeze: icy white-blue facets that catch the light
      const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c5f6fa'); g.addColorStop(1, '#66d9e8');
      ctx.fillStyle = g;
      outline(); ctx.fill();
      ctx.save(); outline(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(0.5, r * 0.06);
      ctx.beginPath();
      ctx.moveTo(x - r, y - r * 0.2); ctx.lineTo(x, y - r); ctx.lineTo(x + r, y - r * 0.2);
      ctx.moveTo(x - r * 0.5, y - r * 0.6); ctx.lineTo(x, y + r); ctx.lineTo(x + r * 0.5, y - r * 0.6);
      ctx.stroke();
      const shine = (nowSec * 0.8) % 2 - 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + (shine - 0.5) * r * 2.4, y - r, r * 0.3, r * 2);
      ctx.restore();
      return;
    }
    if (f.effect === 'ghost') {
      // Ghost Swirl: a see-through, softly glowing scoop that fades in and out
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(nowSec * 2);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#a5b4fc');
      ctx.fillStyle = g;
      outline(); ctx.fill();
      ctx.restore();
      return;
    }
    if (f.effect === 'nova' || f.effect === 'storm' || f.effect === 'crown') {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      const stops = { nova: ['#ffffff', '#ffe066', '#ff8a00'], storm: ['#8aa0c8', '#3b4a6b', '#1b2238'],
        crown: ['#fffbe0', '#ffcf33', '#c98a00'] }[f.effect];
      stops.forEach((c, k) => g.addColorStop(k / 2, c));
      ctx.fillStyle = g;
      outline(); ctx.fill();
      return;
    }
    if (f.effect === 'stars') {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, '#8a6cff');
      g.addColorStop(1, f.color);
      ctx.fillStyle = g;
    } else ctx.fillStyle = f.color;
    outline(); ctx.fill();
  }

  // soft glow; rgb like '255, 30, 0' (fades to the same color, so no grey edge)
  function glow(x, y, radius, rgb, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }

  function sparkle(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y - s * 0.25); ctx.lineTo(x + s, y);
    ctx.lineTo(x + s * 0.25, y + s * 0.25); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y + s * 0.25);
    ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.25, y - s * 0.25);
    ctx.fill();
  }

  function flame(x, baseY, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - w, baseY);
    ctx.quadraticCurveTo(x - w * 0.9, baseY - h * 0.6, x, baseY - h);
    ctx.quadraticCurveTo(x + w * 0.9, baseY - h * 0.6, x + w, baseY);
    ctx.closePath();
    ctx.fill();
  }

  // dots floating up and fading (embers, bubbles)
  function risers(x, y, r, t, color, n) {
    for (let k = 0; k < n; k++) {
      const ph = (t * 0.7 + k / n) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + Math.sin(t * 3 + k * 2.1) * r * 0.7, y - r * 0.8 - ph * r * 3, Math.max(0.6, r * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // things circling around the scoop
  function orbit(x, y, r, t, color, n, size) {
    for (let k = 0; k < n; k++) {
      const a = t * 2 + (k / n) * Math.PI * 2;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 0.7, size, 0, Math.PI * 2); ctx.fill();
    }
  }

  // back = true draws glows behind the scoop, false draws sparkles on top
  function drawFlavorFx(f, x, y, r, back, seed = 0) {
    const t = nowSec + seed * 0.37;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    switch (f.effect) {
      case 'fire': // Phoenix Fire: red glow, flickering flames and rising embers
        if (back) {
          glow(x, y, r * 3.2, '255, 30, 0', 0.55 + 0.3 * pulse);
          for (let k = -1; k <= 1; k++) {
            const h = r * (2.1 + 0.7 * Math.sin(t * 13 + k * 2)) * (k ? 0.75 : 1);
            flame(x + k * r * 0.6, y - r * 0.2, r * 0.5, h, '#ff3a00');
            flame(x + k * r * 0.6, y - r * 0.2, r * 0.3, h * 0.7, k ? '#ff9a00' : '#ffe14d');
          }
        } else risers(x, y, r, t, '#ffb000', 3);
        break;
      case 'void': // Cosmic Void, the best ice cream: a tiny black hole
        if (back) {
          // big pulsing purple glow
          glow(x, y, r * 4.2, '120, 0, 220', 0.5 + 0.3 * pulse);
          glow(x, y, r * 2.2, '255, 80, 230', 0.25 + 0.15 * pulse);
          // swirling disk: two glowing spiral arms spinning around
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(1, 0.45);
          ctx.rotate(t * 1.6);
          ctx.lineCap = 'round';
          for (let arm = 0; arm < 2; arm++) {
            ctx.rotate(Math.PI);
            for (let k = 0; k < 10; k++) {
              const a0 = k * 0.32, rad = r * (2.4 - k * 0.12);
              ctx.strokeStyle = `rgba(${200 + k * 5}, ${110 + k * 10}, 255, ${0.85 - k * 0.07})`;
              ctx.lineWidth = Math.max(1, r * (0.32 - k * 0.02));
              ctx.beginPath(); ctx.arc(0, 0, rad, a0, a0 + 0.4); ctx.stroke();
            }
          }
          ctx.restore();
        } else {
          // sparkles getting pulled in, spinning faster as they fall toward the middle
          for (let k = 0; k < 7; k++) {
            const ph = (t * 0.45 + k / 7) % 1;
            const a = k * 0.9 + t * 1.2 + ph * 5;
            const rad = r * 3 * (1 - ph);
            ctx.globalAlpha = Math.min(1, ph * 2) * (1 - ph * 0.3);
            ctx.fillStyle = k % 2 ? '#e8d0ff' : '#ff9cf5';
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.5, Math.max(0.7, r * 0.14), 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
          // bright edge of the black hole
          ctx.strokeStyle = `rgba(230, 180, 255, ${0.6 + 0.4 * pulse})`;
          ctx.lineWidth = Math.max(1, r * 0.13);
          ctx.beginPath(); ctx.arc(x, y, r * 1.02, 0, Math.PI * 2); ctx.stroke();
          sparkle(x - r * 0.35, y - r * 0.35, r * 0.35 * pulse, '#ffffff');
        }
        break;
      case 'stars': // Galaxy Swirl: purple glow and twinkling stars
        if (back) glow(x, y, r * 2.4, '120, 80, 255', 0.5);
        else for (let k = 0; k < 3; k++) {
          const tw = 0.5 + 0.5 * Math.sin(t * 5 + k * 2);
          sparkle(x + [-0.4, 0.35, 0][k] * r, y + [-0.2, 0.1, -0.55][k] * r, r * 0.28 * tw, '#ffffff');
        }
        break;
      case 'gold': // Golden Caramel: warm golden glow and a shiny glint
        if (back) glow(x, y, r * 2.4, '255, 200, 0', 0.45 + 0.25 * pulse);
        else sparkle(x + r * 0.35, y - r * 0.4, r * 0.55 * Math.max(0, Math.sin(t * 3)), '#ffffff');
        break;
      case 'dragon': // Dragon Fruit: pink glow with little black seeds
        if (back) glow(x, y, r * 2.2, '255, 60, 172', 0.45);
        else {
          ctx.fillStyle = '#2b0a1a';
          for (const [dx, dy] of [[-0.4, -0.2], [0.3, -0.45], [0.1, 0.1], [-0.1, -0.6], [0.5, 0]]) {
            ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r, r * 0.08, r * 0.13, 0.4, 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      case 'unicorn': // Unicorn Dream: color-changing glow and pastel sparkles
        if (back) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
          const hue = (t * 90) % 360;
          g.addColorStop(0, `hsla(${hue}, 90%, 75%, 0.65)`);
          g.addColorStop(1, `hsla(${hue}, 90%, 75%, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
        }
        else {
          sparkle(x + Math.cos(t * 2) * r * 1.3, y + Math.sin(t * 2) * r * 0.8, r * 0.35, '#fff6a8');
          sparkle(x - Math.cos(t * 2) * r * 1.3, y - Math.sin(t * 2) * r * 0.8, r * 0.3, '#ffc6f5');
        }
        break;
      case 'fluff': // Cotton Candy: soft fluffy puffs
        if (back) {
          ctx.fillStyle = 'rgba(255, 190, 235, 0.6)';
          for (let k = 0; k < 3; k++) {
            const a = k * 2.1 + Math.sin(t) * 0.3;
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.6, r * 0.55, 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      case 'crown': // 👑 Crown Jewel: royal gold glow, a little crown and shining gems
        if (back) glow(x, y, r * 3, '255, 200, 40', 0.55 + 0.25 * pulse);
        else {
          const cy = y - r * 1.15, w = r * 0.8;
          ctx.fillStyle = '#ffd43b';
          ctx.strokeStyle = '#b07800'; ctx.lineWidth = Math.max(0.6, r * 0.06);
          ctx.beginPath();
          ctx.moveTo(x - w, cy + r * 0.35); ctx.lineTo(x - w, cy - r * 0.25); ctx.lineTo(x - w * 0.5, cy + r * 0.05);
          ctx.lineTo(x, cy - r * 0.45); ctx.lineTo(x + w * 0.5, cy + r * 0.05); ctx.lineTo(x + w, cy - r * 0.25);
          ctx.lineTo(x + w, cy + r * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
          [['#e03131', -0.45], ['#1c7ed6', 0], ['#2fb344', 0.45]].forEach(([c, dx]) => {
            ctx.fillStyle = c;
            ctx.beginPath(); ctx.arc(x + dx * r, y + r * 0.1, r * 0.16, 0, Math.PI * 2); ctx.fill();
          });
          sparkle(x + r * 0.5, y - r * 0.4, r * 0.45 * Math.max(0, Math.sin(t * 3)), '#ffffff');
        }
        break;
      case 'storm': // 🌩️ Storm Cloud: dark cloud puffs, rain and lightning flashes
        if (back) {
          const flash = Math.sin(t * 6) > 0.85;
          if (flash) glow(x, y, r * 3.4, '200, 220, 255', 0.8);
          ctx.fillStyle = '#4b5a7d';
          for (const [dx, dy, s] of [[-0.8, -0.8, 0.55], [0, -1.05, 0.65], [0.8, -0.8, 0.55]]) {
            ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, s * r, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          ctx.strokeStyle = 'rgba(160, 200, 255, 0.85)';
          ctx.lineWidth = Math.max(0.6, r * 0.07);
          for (let k = 0; k < 3; k++) {
            const ph = (t * 1.5 + k / 3) % 1;
            const dx = (k - 1) * r * 0.6;
            ctx.beginPath(); ctx.moveTo(x + dx, y + r * (0.9 + ph)); ctx.lineTo(x + dx - r * 0.1, y + r * (1.2 + ph)); ctx.stroke();
          }
          if (Math.sin(t * 6) > 0.6) {
            ctx.strokeStyle = '#fff36b';
            ctx.lineWidth = Math.max(1, r * 0.14);
            ctx.beginPath();
            ctx.moveTo(x + r * 0.2, y - r * 1.4); ctx.lineTo(x - r * 0.15, y - r * 0.5);
            ctx.lineTo(x + r * 0.15, y - r * 0.45); ctx.lineTo(x - r * 0.2, y + r * 0.4);
            ctx.stroke();
          }
        }
        break;
      case 'nova': // 💥 Supernova: a blinding star with shock rings bursting outward
        if (back) {
          glow(x, y, r * 3.6, '255, 170, 40', 0.6 + 0.3 * pulse);
          glow(x, y, r * 1.8, '255, 255, 255', 0.8);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * 0.6);
          ctx.fillStyle = 'rgba(255, 230, 150, 0.6)';
          for (let k = 0; k < 12; k++) {
            ctx.rotate(Math.PI / 6);
            const len = r * (2.2 + 0.6 * Math.sin(t * 5 + k));
            ctx.beginPath(); ctx.moveTo(-r * 0.12, 0); ctx.lineTo(0, len); ctx.lineTo(r * 0.12, 0); ctx.fill();
          }
          ctx.restore();
        } else {
          for (let k = 0; k < 2; k++) {
            const ph = (t * 0.8 + k / 2) % 1;
            ctx.strokeStyle = `rgba(255, 200, 80, ${1 - ph})`;
            ctx.lineWidth = Math.max(0.6, r * 0.12 * (1 - ph));
            ctx.beginPath(); ctx.arc(x, y, r * (1 + ph * 2.2), 0, Math.PI * 2); ctx.stroke();
          }
        }
        break;
      case 'blackhole': // 🕳️ Black Hole: a purple glow and a spinning ring, with sparkles getting sucked in
        if (back) {
          glow(x, y, r * 3.4, '124, 58, 237', 0.5 + 0.25 * pulse);
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.2);
          ctx.strokeStyle = 'rgba(232, 121, 249, 0.75)'; ctx.lineWidth = Math.max(0.6, r * 0.14);
          ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        } else {
          for (let k = 0; k < 5; k++) {
            const ph = (t * 0.7 + k / 5) % 1, a = k * 1.26 + ph * 4, d = r * 2.4 * (1 - ph);
            ctx.fillStyle = `rgba(243, 232, 255, ${ph})`;
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, Math.max(0.4, r * 0.12), 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      case 'diamond': // 💎 Diamond Freeze: a frosty glow, and little diamonds twinkling around it
        if (back) glow(x, y, r * 3, '153, 233, 242', 0.5 + 0.25 * pulse);
        else {
          for (let k = 0; k < 4; k++) {
            const a = t * 1.2 + k * 1.57, dx = x + Math.cos(a) * r * 1.6, dy = y + Math.sin(a) * r * 0.8, s = r * 0.3;
            ctx.fillStyle = k % 2 ? '#e3fafc' : '#66d9e8';
            ctx.beginPath(); ctx.moveTo(dx, dy - s); ctx.lineTo(dx + s * 0.7, dy); ctx.lineTo(dx, dy + s); ctx.lineTo(dx - s * 0.7, dy); ctx.fill();
          }
          sparkle(x - r * 0.4, y - r * 0.5, r * 0.45 * Math.max(0, Math.sin(t * 3)), '#ffffff');
        }
        break;
      case 'ghost': // 👻 Ghost Swirl: a misty glow and a little ghost floating around it
        if (back) glow(x, y, r * 3, '199, 210, 254', 0.35 + 0.25 * pulse);
        else {
          const gx = x + Math.cos(t * 1.3) * r * 1.6, gy = y - r * 0.6 + Math.sin(t * 2.6) * r * 0.4, s = r * 0.42;
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(gx, gy, s, Math.PI, 0);
          ctx.lineTo(gx + s, gy + s);
          for (let k = 0; k < 3; k++) ctx.lineTo(gx + s - (k + 0.5) * s * 2 / 3, gy + s * (k % 2 ? 1 : 0.6));
          ctx.lineTo(gx - s, gy + s); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#212529';
          ctx.beginPath(); ctx.arc(gx - s * 0.35, gy - s * 0.1, s * 0.15, 0, Math.PI * 2); ctx.arc(gx + s * 0.35, gy - s * 0.1, s * 0.15, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        break;
      case 'prism': // 🌈 Prism Swirl: rainbow glow and sparkles in every color circling it
        if (back) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
          const hue = (t * 100) % 360;
          g.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.6)`);
          g.addColorStop(1, `hsla(${hue}, 100%, 65%, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
        } else {
          for (let k = 0; k < 6; k++) {
            const a = t * 1.8 + (k / 6) * Math.PI * 2;
            sparkle(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 0.8, r * 0.3, `hsl(${k * 60}, 100%, 70%)`);
          }
        }
        break;
      case 'candycane': // 🎄 Candy Cane Swirl: a warm golden glow, a little candy cane and twinkling Christmas lights around it
        if (back) glow(x, y, r * 3.2, '255, 212, 59', 0.4 + 0.2 * pulse);
        else {
          ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, r * 0.22);
          const cx = x + r * 1.2, cy = y - r * 0.6;
          for (const [col, dash] of [['#ffffff', []], ['#e03131', [r * 0.25, r * 0.25]]]) {
            ctx.strokeStyle = col; ctx.setLineDash(dash);
            ctx.beginPath(); ctx.moveTo(cx, cy + r * 1.1); ctx.lineTo(cx, cy); ctx.arc(cx - r * 0.3, cy, r * 0.3, 0, Math.PI, true); ctx.stroke();
          }
          ctx.setLineDash([]); ctx.restore();
          for (let k = 0; k < 5; k++) {
            const a = t * 1.2 + k * 1.26;
            ctx.fillStyle = ['#e03131', '#2f9e44', '#ffd43b', '#4dabf7', '#ff6bd6'][k];
            if (Math.sin(t * 6 + k * 2) > -0.3) glow(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 0.7, r * 0.5, ['224, 49, 49', '47, 158, 68', '255, 212, 59', '77, 171, 247', '255, 107, 214'][k], 0.9);
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 0.7, Math.max(0.6, r * 0.18), 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      case 'glass': // 🔮 Glass Ice Cream: a soft rainbow glow, little glass shards circling it, and twinkles
        if (back) {
          glow(x, y, r * 3.4, '208, 235, 255', 0.45 + 0.2 * pulse);
          glow(x, y, r * 2, `${hueRgb((t * 60) % 360)}`, 0.18);
        } else {
          for (let k = 0; k < 3; k++) {
            const a = t * 2 + k * 2.094;
            glassShard(x + Math.cos(a) * r * 1.7, y + Math.sin(a) * r * 0.7, r * 0.32, a * 2, (k * 120 + t * 60) % 360);
          }
          if (Math.random() < 0.3) star(x + (Math.random() - 0.5) * r * 3, y + (Math.random() - 0.5) * r * 2.4, r * 0.25, '#ffffff');
        }
        break;
      case 'robo': // ⚡ Robo Ice Cream: a big cyan glow, two spinning energy rings with sparks on them, and lightning
        if (back) {
          glow(x, y, r * 3.8, '46, 232, 255', 0.4 + 0.25 * pulse);
          glow(x, y, r * 1.8, '217, 253, 255', 0.25 + 0.2 * pulse);
        } else {
          const w = Math.max(0.35, r * 0.07);
          for (const [tilt, speed] of [[0.5, 3], [-0.6, -2.4]]) {
            ctx.save();
            ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(1, 0.32);
            ctx.globalAlpha = 0.75;
            ctx.strokeStyle = CYAN; ctx.lineWidth = w * 1.4; ctx.shadowColor = CYAN; ctx.shadowBlur = r * 0.6;
            ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
            const a = t * speed;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.7, Math.sin(a) * r * 1.7, r * 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
          if (Math.random() < 0.6) {
            const a = Math.random() * Math.PI * 2;
            zap(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, x + Math.cos(a + 0.5) * r * 2.4, y + Math.sin(a + 0.5) * r * 2.4, r * 0.3, w * 1.2);
          }
        }
        break;
      case 'infinity': // ♾️ Infinity Swirl, the best ice cream: color-changing glow and stars flying in an infinity loop
        if (back) {
          const hue = (t * 80) % 360;
          glow(x, y, r * 4.5, hueRgb(hue), 0.45 + 0.25 * pulse);
          glow(x, y, r * 2.4, hueRgb((hue + 150) % 360), 0.35);
          // the infinity (figure 8) path
          const loop = u => { const d = 1 + Math.sin(u) ** 2; return [x + r * 2.6 * Math.cos(u) / d, y - r * 0.2 + r * 2.6 * Math.sin(u) * Math.cos(u) / d]; };
          ctx.strokeStyle = `hsla(${hue}, 100%, 75%, 0.35)`;
          ctx.lineWidth = Math.max(0.5, r * 0.1);
          ctx.beginPath();
          for (let k = 0; k <= 40; k++) { const [px, py] = loop(k / 40 * Math.PI * 2); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          ctx.stroke();
          for (let k = 0; k < 3; k++) {
            const [px, py] = loop(t * 2 + k * 2.094);
            sparkle(px, py, r * 0.45, `hsl(${(hue + k * 120) % 360}, 100%, 80%)`);
          }
        } else sparkle(x + r * 0.3, y - r * 0.55, r * 0.45 * (0.4 + 0.6 * pulse), '#ffffff');
        break;
      case 'berries': // Blueberry: little blueberries on top
        if (!back) {
          ctx.fillStyle = '#2d3a8c';
          for (const [dx, dy] of [[-0.35, -0.35], [0.3, -0.45], [0.05, -0.05]]) {
            ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * 0.17, 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      case 'bubble': // Bubblegum: a bubble that slowly grows, then pops
        if (!back) {
          const g = (t * 0.45) % 1, br = r * (0.15 + 0.75 * g);
          ctx.save();
          ctx.globalAlpha = g > 0.92 ? 0 : 0.8;
          ctx.fillStyle = '#ffc2e2'; ctx.strokeStyle = '#ff7ab8'; ctx.lineWidth = Math.max(0.6, r * 0.08);
          ctx.beginPath(); ctx.arc(x + r * 0.75 + br * 0.6, y - r * 0.1, br, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.beginPath(); ctx.arc(x + r * 0.75 + br * 0.35, y - r * 0.1 - br * 0.35, br * 0.22, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        break;
      case 'shine': // Mango Tango: warm sunny glow with slowly turning rays
        if (back) {
          glow(x, y, r * 2.6, '255, 170, 0', 0.35 + 0.2 * pulse);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * 0.8);
          ctx.fillStyle = 'rgba(255, 200, 60, 0.4)';
          for (let k = 0; k < 8; k++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath(); ctx.moveTo(-r * 0.18, r * 1.05); ctx.lineTo(r * 0.18, r * 1.05); ctx.lineTo(0, r * 2); ctx.fill();
          }
          ctx.restore();
        } else sparkle(x + r * 0.35, y - r * 0.45, r * 0.35 * (0.4 + 0.6 * pulse), '#fff6d0');
        break;
      case 'lava': // Lava Swirl: hot glow, a dark cooling swirl and dripping lava
        if (back) glow(x, y, r * 2.8, '255, 80, 0', 0.4 + 0.25 * pulse);
        else {
          ctx.strokeStyle = 'rgba(90, 20, 0, 0.7)';
          ctx.lineWidth = Math.max(0.6, r * 0.12);
          ctx.beginPath(); ctx.arc(x, y - r * 0.15, r * 0.55, t * 1.5, t * 1.5 + Math.PI * 1.2); ctx.stroke();
          const drip = (t * 0.8) % 1;
          ctx.fillStyle = '#ffb000';
          ctx.beginPath(); ctx.arc(x - r * 0.55, y + r * 0.3 + drip * r * 0.9, r * 0.14 * (1 - drip * 0.5), 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'aurora': // Frozen Aurora: a glow that shifts green, blue and purple, with icy sparkles
        if (back) glow(x, y, r * 3, hueRgb(140 + 70 * (1 + Math.sin(t * 1.2))), 0.45 + 0.15 * pulse);
        else sparkle(x - r * 0.4, y - r * 0.5, r * 0.4 * (0.4 + 0.6 * pulse), '#e6fcff');
        break;
      case 'frost': // Mint Chip: icy sparkle
        if (!back) sparkle(x + r * 0.4, y - r * 0.45, r * 0.4 * (0.4 + 0.6 * pulse), '#ffffff');
        break;
      case 'chips': // Cookie Dough: chocolate chunks
        if (!back) {
          ctx.fillStyle = '#5a3a1e';
          for (const [dx, dy] of [[-0.4, -0.3], [0.35, -0.4], [0.05, 0.05], [0.45, 0.1]]) {
            ctx.fillRect(x + dx * r - r * 0.12, y + dy * r - r * 0.12, r * 0.24, r * 0.24);
          }
        }
        break;
    }
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
    if (c.glass) {
      // 🔮 a glass customer (pays double): a see-through body and head with rainbow light inside, and sparkles
      glow(x, y - 6, 22, '208, 235, 255', 0.35);
      ctx.save();
      ctx.globalAlpha = 0.75;
      const g = ctx.createLinearGradient(x - 9, y - 22, x + 9, y + 12);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, `hsla(${(time * 60 + c.id * 40) % 360}, 100%, 85%, 0.7)`); g.addColorStop(1, 'rgba(116,192,252,0.8)');
      ctx.fillStyle = g;
      roundRect(x - 9, y - 6, 18, 18, 6); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 13, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.8;
      ctx.stroke(); roundRect(x - 9, y - 6, 18, 18, 6); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#1c7ed6';
      ctx.fillRect(x - 3.5, y - 15, 2, 2.5); ctx.fillRect(x + 1.5, y - 15, 2, 2.5);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.ellipse(x - 3, y - 17, 2.5, 1.2, -0.6, 0, Math.PI * 2); ctx.fill();
      if ((time * 2 + c.id) % 1 < 0.15) star(x + 7, y - 18, 2.5, '#ffffff');
      ctx.fillStyle = '#1971c2'; ctx.font = 'bold 7px Trebuchet MS'; ctx.textAlign = 'center';
      ctx.fillText('x2', x + 12, y - 22);
    } else if (c.robo) {
      // ⚡ a robot customer (pays double): a metal body, a square head, a glowing visor and an antenna
      glow(x, y - 6, 22, '46, 232, 255', 0.25);
      const g = ctx.createLinearGradient(x - 9, y - 6, x + 9, y + 12);
      g.addColorStop(0, '#8d9aa6'); g.addColorStop(1, '#2c343c');
      ctx.fillStyle = g;
      roundRect(x - 9, y - 6, 18, 18, 4); ctx.fill();
      cyberRing(x, y + 2, 2);
      ctx.fillStyle = '#4a5763';
      roundRect(x - 7.5, y - 21, 15, 14, 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 6.5, y - 20, 5, 2.5);
      ctx.fillStyle = '#1b2430'; roundRect(x - 5.5, y - 17, 11, 4.5, 1.5); ctx.fill();
      ctx.fillStyle = CYAN; ctx.fillRect(x - 4 + (Math.sin(time * 3 + c.id) + 1) * 3, y - 16, 2.5, 2.5);
      ctx.fillStyle = '#6b7a88'; ctx.fillRect(x - 0.5, y - 27, 1, 6);
      cyberRing(x, y - 28, 1.4);
      ctx.fillStyle = CYAN; ctx.font = 'bold 7px Trebuchet MS'; ctx.textAlign = 'center';
      ctx.fillText('x2', x + 12, y - 22);
    } else {
    ctx.fillStyle = c.golden ? '#ffd700' : SHIRTS[c.look % SHIRTS.length];
    roundRect(x - 9, y - 6, 18, 18, 6); ctx.fill();
    ctx.fillStyle = SKINS[c.look % SKINS.length];
    ctx.beginPath(); ctx.arc(x, y - 13, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 3.5, y - 15, 2, 2.5);
    ctx.fillRect(x + 1.5, y - 15, 2, 2.5);
    }
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
      const col = mutScoopColor(m, time + c.id);
      ctx.fillStyle = m.id === 'rainbow' ? 'rgba(255,255,255,0.8)' : col;
      ctx.globalAlpha = 0.5 + (m.id === 'rainbow' ? 0.2 * Math.sin(time * 3 + c.id) : 0);
      ctx.beginPath(); ctx.arc(x + 12, y - 4, 11, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      drawCone(x + 12, y - 2, m.id === 'rainbow' ? { stripes: m.colors } : { color: col }, 7);
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

  // 😎 Aura Farming: a huge aura of golden and purple flames around every player
  function drawAura(time, seed, px, py) {
    glow(0, -10, 70, '255, 212, 59', 0.35 + 0.1 * Math.sin(time * 4 + seed));
    glow(0, -10, 45, '177, 151, 252', 0.3);
    for (let k = 0; k < 9; k++) {
      const x = (k - 4) * 6.5, h = 55 + 18 * Math.sin(time * 9 + k * 1.7 + seed) - Math.abs(k - 4) * 6;
      ctx.globalAlpha = 0.45;
      flame(x, 18, 9, h, k % 2 ? '#b197fc' : '#ffd43b');
    }
    ctx.globalAlpha = 1;
    if (Math.random() < 0.2) petSpark(px + (Math.random() - 0.5) * 40, py - Math.random() * 40, { shape: 'star', color: Math.random() < 0.5 ? '#ffd43b' : '#e5dbff', vx: 0, vy: -50, life: 0.8, size: 2.5 });
  }

  // a player's character: bigger than customers, dressed the way they picked in the Avatar Shop
  function drawPlayer(p, time) {
    const av = p.avatar || {};
    const ROBO = { shirt: '#2c343c', pants: '#1f262e', skin: '#3a444e' }; // ⚡ robo parts are dark armor with glowing cyan cracks
    const GLASS = 'rgba(200, 232, 255, 0.62)';                             // 🔮 glass parts are see-through
    const shirt = !av.shirt || av.shirt === 'stand' ? p.color : av.shirt === 'robo' ? ROBO.shirt : av.shirt === 'glass' ? GLASS : av.shirt === 'santa' ? '#d62828' : av.shirt;
    const skin = av.skin === 'robo' ? ROBO.skin : av.skin === 'glass' ? GLASS : av.skin === 'santa' ? '#ffd8c2' : av.skin || '#f8d5b8';
    const bounce = p.moving ? Math.abs(Math.sin(time * 12)) * 3 : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (activeMuts().some(m => m.id === 'aura')) drawAura(time, p.id || 0, p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 18, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    const roboParts = ['shirt', 'pants', 'skin', 'hat', 'face'].filter(k => av[k] === 'robo').length;
    if (roboParts) {
      // ⚡ robo parts glow, and a full robot crackles with lightning
      glow(0, -18, 26 + roboParts * 4, '46, 232, 255', 0.08 * roboParts);
      if (roboParts >= 4 && Math.random() < 0.3) {
        const a = Math.random() * Math.PI * 2;
        zap(Math.cos(a) * 14, -18 + Math.sin(a) * 18, Math.cos(a + 0.6) * 28, -18 + Math.sin(a + 0.6) * 30, 4, 0.8);
      }
      if (p.moving && Math.random() < 0.2) petSpark(p.x + (Math.random() - 0.5) * 12, p.y + 16, { shape: 'hex', color: CYAN, vy: -30, life: 0.6, size: 2 });
    }
    ctx.scale(1.7 * (p.facing || 1), 1.7);
    const y = -bounce / 1.7;
    const roboLegs = av.pants === 'robo', roboBody = av.shirt === 'robo', roboHead = av.skin === 'robo';
    const pants = roboLegs ? ROBO.pants : av.pants === 'glass' ? GLASS : av.pants === 'santa' ? '#b71c1c' : av.pants || '#3b3b58';
    const glassParts = ['shirt', 'pants', 'skin', 'hat', 'face'].filter(k => av[k] === 'glass').length;
    if (glassParts) {
      // 🔮 glass parts shine, and someone all made of glass twinkles with rainbow light
      glow(0, y - 10, (24 + glassParts * 4) / 1.7, '208, 235, 255', 0.08 * glassParts);
      if (glassParts >= 4 && Math.random() < 0.15) petSpark(p.x + (Math.random() - 0.5) * 30, p.y - 20 - Math.random() * 30,
        { shape: 'star', color: `hsl(${Math.random() * 360}, 100%, 85%)`, vy: -10, life: 0.8, size: 2.5 });
    }
    const swing = p.moving ? Math.sin(time * 12) : 0; // arms and legs swing while walking
    // a little shading makes everyone look rounder: lighter on top, darker underneath
    const shaded = (color, x1, y1, x2, y2, k = 0.22) => {
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, tint(color, k)); g.addColorStop(1, tint(color, -k));
      return g;
    };
    // legs and shoes
    for (const [lx, ph] of [[-6, 1], [1, -1]]) {
      const step = swing * ph * 1.2;
      ctx.fillStyle = shaded(pants, lx, y + 6, lx + 5, y + 12);
      ctx.fillRect(lx, y + 6, 5, 5.5 - Math.max(0, step) * 0.5);
      ctx.fillStyle = roboLegs ? '#151b21' : '#2b2b2b'; // shoes (robo: metal feet)
      roundRect(lx - 0.5 + (ph > 0 ? 0 : 0.5), y + 10.5 - Math.max(0, step) * 0.5, 6, 2.6, [1, 2, 1, 1]); ctx.fill();
      if (roboLegs) { ctx.fillStyle = '#5c6b7a'; ctx.beginPath(); ctx.arc(lx + 2.5, y + 8, 1, 0, Math.PI * 2); ctx.fill(); } // knee joint
    }
    if (roboLegs) { seam([[-5, y + 7], [-3.5, y + 9], [-4, y + 10.5]], 0.45); seam([[2, y + 7], [3.5, y + 9], [3, y + 10.5]], 0.45); }
    // arms: the back one behind the body, the front one in front (it holds your ice cream)
    const armColor = roboBody ? ROBO.shirt : shirt, hand = roboBody ? '#5c6b7a' : skin;
    const holding = !!p.item;
    const arm = (front) => {
      ctx.save();
      ctx.translate(front ? 6.5 : -6.5, y - 4.5);
      ctx.rotate(front && holding ? -0.95 : swing * (front ? 0.5 : -0.5));
      ctx.fillStyle = front ? armColor : tint(armColor, -0.25);
      roundRect(-1.8, 0, 3.6, 8.5, 1.8); ctx.fill();
      ctx.fillStyle = front ? hand : tint(hand, -0.2);
      ctx.beginPath(); ctx.arc(0, 9, 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    arm(false);
    // body
    ctx.fillStyle = shaded(shirt, -9, y - 7, 9, y + 8);
    roundRect(-9, y - 7, 18, 15, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6; ctx.stroke();
    if (roboBody) {
      // a chest plate and shoulder pads with glowing cyan cracks and a glowing ring core
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(-6, y - 5, 12, 9, 2); ctx.fill();
      ctx.fillStyle = '#46525e';
      roundRect(-9.5, y - 7.5, 5, 3.5, 1.5); ctx.fill(); roundRect(4.5, y - 7.5, 5, 3.5, 1.5); ctx.fill();
      seam([[-9, y - 3], [-4, y - 2.5], [-2.5, y - 6]], 0.5);
      seam([[9, y - 2], [4, y - 3], [3, y - 6.5]], 0.5);
      seam([[-6, y + 7.5], [-3, y + 3], [3, y + 3.5], [6, y + 7.5]], 0.5);
      cyberRing(0, y, 2.1 + Math.sin(time * 4) * 0.15);
    } else {
      // a collar
      ctx.fillStyle = tint(shirt, -0.3);
      ctx.beginPath(); ctx.moveTo(-3.5, y - 7); ctx.lineTo(0, y - 4.5); ctx.lineTo(3.5, y - 7); ctx.closePath(); ctx.fill();
    }
    arm(true);
    if (av.shirt === 'santa') {
      // 🎅 the Santa suit: fluffy white trim, a black belt with a gold buckle, and white buttons
      ctx.fillStyle = '#ffffff';
      roundRect(-9, y + 5.5, 18, 2.5, 1.2); ctx.fill();
      ctx.fillRect(-0.9, y - 6.5, 1.8, 12);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-9, y + 1.5, 18, 2.5);
      ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 0.8; ctx.strokeRect(-2, y + 1.3, 4, 2.9);
      ctx.fillStyle = '#ffffff';
      for (const by of [y - 4, y - 1.5]) { ctx.beginPath(); ctx.arc(2.5, by, 0.7, 0, Math.PI * 2); ctx.fill(); }
    }
    if (av.shirt === 'glass') {
      // light streaks and a rainbow shimmer on the glass shirt
      ctx.save();
      roundRect(-9, y - 7, 18, 15, 5); ctx.clip();
      ctx.fillStyle = `hsla(${(time * 60) % 360}, 100%, 80%, 0.35)`;
      ctx.fillRect(-9, y + 1, 18, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.moveTo(-6, y - 7); ctx.lineTo(-3, y - 7); ctx.lineTo(-8, y + 8); ctx.lineTo(-10, y + 8); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.7;
      roundRect(-9, y - 7, 18, 15, 5); ctx.stroke();
    }
    // head
    if (roboHead) {
      // ⚡ a square metal robot head with bolts, panel lines and glowing cyan cracks
      ctx.fillStyle = '#20272e';
      ctx.fillRect(-2.5, y - 8, 5, 2); // neck joint
      ctx.fillStyle = shaded('#4a5763', -8, y - 22, 8, y - 7, 0.3);
      roundRect(-8, y - 22, 16, 15, 2.5); ctx.fill();
      ctx.strokeStyle = '#151b21'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; // shine on the metal
      roundRect(-7, y - 21, 6, 3, 1.5); ctx.fill();
      ctx.fillStyle = '#2a323a'; // an ear bolt on the side
      roundRect(-10, y - 17, 2.5, 5, 1); ctx.fill();
      ctx.fillStyle = '#8a99a8';
      for (const [bx, by] of [[-6.3, y - 20.3], [6.3, y - 20.3], [-6.3, y - 8.7], [6.3, y - 8.7]]) { ctx.beginPath(); ctx.arc(bx, by, 0.7, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(-8, y - 11); ctx.lineTo(8, y - 11); ctx.stroke();
      seam([[-7.5, y - 18.5], [-4, y - 19], [-2.5, y - 21.5]], 0.45);
      seam([[-7.5, y - 10], [-4.5, y - 12.5], [-7.8, y - 14]], 0.45);
    } else {
      ctx.fillStyle = tint(skin, -0.12);
      ctx.fillRect(-2.5, y - 8, 5, 2); // neck
      const g = ctx.createRadialGradient(-2.5, y - 17, 1, 0, y - 14, 9);
      g.addColorStop(0, tint(skin, 0.15)); g.addColorStop(1, tint(skin, -0.12));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, y - 14, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tint(skin, -0.15); // an ear
      ctx.beginPath(); ctx.ellipse(-1.5, y - 13.5, 1.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      // hair shows when there's no hat
      const hatNow = av.hat || 'cap';
      if (hatNow === 'none' || (p.admin && hatNow === 'cap')) {
        ctx.fillStyle = '#4a2f1d';
        ctx.beginPath(); ctx.arc(0, y - 15, 8.3, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(-7.8, y - 13); ctx.fill();
      }
      ctx.fillStyle = av.skin === 'santa' ? 'rgba(255, 90, 110, 0.5)' : 'rgba(255, 120, 140, 0.25)'; // rosy cheek
      ctx.beginPath(); ctx.arc(6, y - 11.5, 1.5, 0, Math.PI * 2); ctx.fill();
      if (av.skin === 'santa') {
        // 🎅 a big fluffy white beard and mustache
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(-5, y - 12); ctx.quadraticCurveTo(-6, y - 2, 2, y - 1); ctx.quadraticCurveTo(9, y - 3, 8.5, y - 11); ctx.closePath(); ctx.fill();
        for (const [bx, by, br] of [[-3, y - 5, 2.5], [1, y - 3, 2.8], [5, y - 5, 2.5]]) { ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#f1f3f5';
        ctx.beginPath(); ctx.ellipse(5, y - 10.5, 3.2, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    drawFace(av.face || 'happy', y, time);
    // admins wear their crown unless they picked a special hat in the Avatar Shop
    const hat = av.hat || 'cap';
    const crown = p.admin && (hat === 'cap' || hat === 'none');
    drawHat(crown ? 'none' : hat, y, shirt);
    // the ice cream in your hand
    if (p.item && toppingById[p.item.flavor]) {
      ctx.font = '9px serif';
      ctx.textAlign = 'center';
      ctx.fillText(toppingById[p.item.flavor].emoji, 13, y + 2);
    } else if (p.item) drawCone(13, y - 1, flavorById[p.item.flavor], 6);
    if (crown) {
      // golden crown
      ctx.fillStyle = '#ffd43b';
      ctx.strokeStyle = '#e8a200'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-7, y - 20); ctx.lineTo(-7, y - 28); ctx.lineTo(-3.5, y - 24);
      ctx.lineTo(0, y - 30); ctx.lineTo(3.5, y - 24); ctx.lineTo(7, y - 28); ctx.lineTo(7, y - 20);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    if (!p.name) return;

    ctx.font = 'bold 13px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    const label = p.admin ? `👑 ${p.name} [ADMIN]` : p.name;
    const ly = p.admin || ['tophat', 'wizard', 'bunny', 'party', 'cone'].includes(av.hat) ? p.y - 66 : p.y - 46;
    ctx.strokeText(label, p.x, ly);
    ctx.fillStyle = p.admin ? '#e8a200' : p.isMe ? '#e0457b' : '#3a2a35';
    ctx.fillText(label, p.x, ly);
  }

  function drawFace(face, y, time) {
    if (face === 'glass') {
      // 🔮 a prism mask: a band of glass across the eyes with rainbow light moving through it
      const g = ctx.createLinearGradient(-1, 0, 9, 0);
      const h = (nowSec * 90) % 360;
      [0, 60, 140, 220].forEach((d, i, a) => g.addColorStop(i / (a.length - 1), `hsla(${(h + d) % 360}, 100%, 75%, 0.85)`));
      ctx.fillStyle = g;
      roundRect(-1, y - 17.5, 10, 4.5, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle = '#1c3b5a';
      ctx.beginPath(); ctx.arc(3, y - 15.2, 0.9, 0, Math.PI * 2); ctx.arc(6.5, y - 15.2, 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(5, y - 11.5, 2, 0.2, Math.PI - 0.2); ctx.stroke();
      return;
    }
    if (face === 'santa') {
      // 🎅 happy eyes behind little round gold glasses
      drawFace('happy', y, time);
      ctx.strokeStyle = '#e8a200'; ctx.lineWidth = 0.6;
      for (const ex of [3, 6.5]) { ctx.beginPath(); ctx.arc(ex, y - 14, 2, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(5, y - 14); ctx.lineTo(4.5, y - 14); ctx.stroke();
      return;
    }
    if (face === 'robo') {
      // a glowing visor instead of eyes
      ctx.fillStyle = '#1b2430';
      roundRect(-1, y - 18, 9.5, 5, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(46, 232, 255, 0.18)'; // the visor glass
      roundRect(-0.5, y - 17.5, 8.5, 4, 1.2); ctx.fill();
      ctx.fillStyle = CYAN;
      ctx.shadowColor = CYAN; ctx.shadowBlur = 5;
      const scan = (Math.sin(time * 3) + 1) / 2 * 5.5;
      ctx.fillRect(0 + scan, y - 16.8, 2.5, 2.6);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; // a reflection
      ctx.fillRect(5.5, y - 17.3, 1.6, 0.8);
      ctx.fillStyle = '#5c6b7a';
      ctx.fillRect(2, y - 10.5, 6, 1.2);
      return;
    }
    ctx.fillStyle = '#222';
    if (face === 'cool') {
      // sunglasses
      ctx.fillRect(0.5, y - 16.5, 8, 3.5);
      ctx.fillRect(-2, y - 16, 3, 1);
    } else if (face === 'wink') {
      ctx.fillRect(2, y - 15, 2, 2.5);
      ctx.fillRect(5, y - 14, 3, 1.2);
    } else if (face === 'wow') {
      ctx.beginPath(); ctx.arc(3, y - 14, 1.5, 0, Math.PI * 2); ctx.arc(6.5, y - 14, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, y - 10, 1.4, 0, Math.PI * 2); ctx.fill();
      return;
    } else {
      // eyes: a white with a dark pupil looking the way you face
      for (const ex of [3, 6.5]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(ex, y - 14, 1.4, 1.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(ex + 0.4, y - 13.8, 0.95, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (face === 'silly') {
      ctx.fillStyle = '#ff6b8a';
      ctx.beginPath(); ctx.arc(5, y - 9.5, 1.6, 0, Math.PI); ctx.fill();
    }
    // smile
    ctx.strokeStyle = '#222'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(5, y - 11.5, 2, 0.2, Math.PI - 0.2); ctx.stroke();
  }

  function drawHat(hat, y, shirt) {
    switch (hat) {
      case 'santa': { // 🎅 a floppy red Santa hat with white fluffy trim and a pom-pom
        ctx.fillStyle = '#d62828';
        ctx.beginPath(); ctx.moveTo(-8, y - 19); ctx.quadraticCurveTo(-4, y - 33, 6, y - 30); ctx.quadraticCurveTo(11, y - 28, 12, y - 22);
        ctx.lineTo(8, y - 19); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath(); ctx.moveTo(2, y - 20); ctx.quadraticCurveTo(6, y - 28, 11, y - 23); ctx.lineTo(8, y - 19); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff';
        roundRect(-9, y - 21.5, 18, 4, 2); ctx.fill();
        ctx.beginPath(); ctx.arc(12, y - 22, 2.6, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'glass': { // 🔮 a crystal crown: see-through glass points with rainbow light and a twinkle
        const pts = [[-7, -21], [-6, -28], [-3.5, -23.5], [0, -31], [3.5, -23.5], [6, -28], [7, -21]];
        ctx.save();
        const g = ctx.createLinearGradient(-7, y - 31, 7, y - 21);
        g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, `hsla(${(nowSec * 80) % 360}, 100%, 82%, 0.75)`); g.addColorStop(1, 'rgba(116,192,252,0.85)');
        ctx.fillStyle = g;
        ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, y + py) : ctx.moveTo(px, y + py)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.6; ctx.stroke();
        ctx.restore();
        if (nowSec % 1.5 < 0.25) star(0, y - 31, 2, '#ffffff');
        break;
      }
      case 'robo': // two robot antennas with glowing tips that blink one after the other
        for (const [ax, tilt, ph] of [[-4, -0.25, 0], [4, 0.25, Math.PI]]) {
          ctx.save();
          ctx.translate(ax, y - 21.5);
          ctx.fillStyle = '#20272e';
          roundRect(-2, -1, 4, 2, 1); ctx.fill(); // the base
          ctx.rotate(tilt);
          ctx.fillStyle = '#6b7a88';
          ctx.fillRect(-0.5, -8, 1, 8);
          cyberRing(0, -9.2, 1.3 + Math.sin(nowSec * 6 + ph) * 0.25);
          ctx.restore();
        }
        break;
      case 'cap':
        ctx.fillStyle = shirt;
        ctx.beginPath(); ctx.arc(0, y - 16, 8, Math.PI, 0); ctx.fill();
        ctx.fillRect(0, y - 17, 11, 3);
        break;
      case 'tophat':
        ctx.fillStyle = '#222';
        ctx.fillRect(-9, y - 21, 18, 2.5);
        ctx.fillRect(-6, y - 33, 12, 12);
        ctx.fillStyle = '#e03131';
        ctx.fillRect(-6, y - 24, 12, 2.5);
        break;
      case 'beanie':
        ctx.fillStyle = '#4dabf7';
        ctx.beginPath(); ctx.arc(0, y - 16, 8.5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#1c7ed6';
        ctx.fillRect(-8.5, y - 18, 17, 3);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, y - 25, 2.5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'party':
        ctx.fillStyle = '#cc5de8';
        ctx.beginPath(); ctx.moveTo(-6, y - 20); ctx.lineTo(0, y - 36); ctx.lineTo(6, y - 20); ctx.fill();
        ctx.fillStyle = '#ffd43b';
        ctx.beginPath(); ctx.arc(0, y - 36, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(-3, y - 28, 6, 2);
        break;
      case 'cowboy':
        ctx.fillStyle = '#a0662d';
        ctx.beginPath(); ctx.ellipse(0, y - 20, 13, 3, 0, 0, Math.PI * 2); ctx.fill();
        roundRect(-6, y - 29, 12, 9, 3); ctx.fill();
        ctx.fillStyle = '#5c3d2e';
        ctx.fillRect(-6, y - 23, 12, 2);
        break;
      case 'wizard':
        ctx.fillStyle = '#5f3dc4';
        ctx.beginPath(); ctx.moveTo(-10, y - 19); ctx.lineTo(2, y - 40); ctx.lineTo(10, y - 19); ctx.fill();
        ctx.fillStyle = '#ffd43b';
        ctx.beginPath(); ctx.arc(0, y - 28, 1.6, 0, Math.PI * 2); ctx.arc(3, y - 23, 1.2, 0, Math.PI * 2); ctx.fill();
        break;
      case 'bunny':
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(-4, y - 28, 2.8, 8, -0.15, 0, Math.PI * 2); ctx.ellipse(4, y - 28, 2.8, 8, 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffb3c6';
        ctx.beginPath(); ctx.ellipse(-4, y - 28, 1.3, 5.5, -0.15, 0, Math.PI * 2); ctx.ellipse(4, y - 28, 1.3, 5.5, 0.15, 0, Math.PI * 2); ctx.fill();
        break;
      case 'cone':
        // a giant ice cream cone hat
        ctx.fillStyle = '#d9a35b';
        ctx.beginPath(); ctx.moveTo(-6, y - 20); ctx.lineTo(6, y - 20); ctx.lineTo(0, y - 9); ctx.fill();
        ctx.fillStyle = '#ff8fab';
        ctx.beginPath(); ctx.arc(0, y - 25, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e03131';
        ctx.beginPath(); ctx.arc(1, y - 33, 2, 0, Math.PI * 2); ctx.fill();
        break;
    }
  }

  // the Avatar Shop building at the bottom of the plaza
  function drawAvatarShop(time) {
    const { x, y } = AVATAR_SHOP;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 70, 115, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e7f5ff';
    roundRect(x - 95, y - 35, 190, 105, 8); ctx.fill();
    ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 3; ctx.stroke();
    // door
    ctx.fillStyle = '#1c7ed6';
    roundRect(x - 18, y + 15, 36, 55, 6); ctx.fill();
    // window with clothes on hangers
    ctx.fillStyle = '#9ad7ff';
    roundRect(x - 85, y - 15, 55, 45, 6); ctx.fill();
    roundRect(x + 30, y - 15, 55, 45, 6); ctx.fill();
    [['#ff6b6b', x - 72], ['#51cf66', x - 52], ['#fcc419', x + 45], ['#cc5de8', x + 65]].forEach(([c, sx]) => {
      ctx.fillStyle = c;
      roundRect(sx - 7, y - 4, 14, 16, 3); ctx.fill();
    });
    // tiny top hat in the window
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 64, y + 20, 12, 3); ctx.fillRect(x - 61, y + 12, 6, 8);
    // roof
    ctx.fillStyle = '#4dabf7';
    ctx.beginPath(); ctx.moveTo(x - 110, y - 33); ctx.lineTo(x, y - 85); ctx.lineTo(x + 110, y - 33); ctx.fill();
    // sign
    ctx.fillStyle = '#fff';
    roundRect(x - 75, y - 60, 150, 26, 8); ctx.fill();
    ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#1c7ed6';
    ctx.font = 'bold 15px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText('👕 AVATAR SHOP', x, y - 41);
    if (dist(player, { x, y: y + 85 }) <= REACH && openWindow !== 'avatar') {
      drawBubbleButton(x, y + 98, '👕 Tap to change your look', '#4dabf7', time);
    }
  }

  // 💰 the Sell Shop building at the bottom of the plaza
  // 🎄 the Christmas Event in the park: a giant Christmas tree with lights and a star, presents under it, and a snowman
  function drawChristmasPark(time) {
    const tx = 1075, ty = 700;
    // snow on the ground around them
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (const [x, y, rx, ry] of [[tx, ty + 4, 70, 18], [725, ty + 4, 40, 12]]) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
    glow(tx, ty - 70, 120, '255, 212, 59', 0.25 + 0.08 * Math.sin(time * 2));
    // the trunk and three layers of branches
    ctx.fillStyle = '#6b3f1d'; ctx.fillRect(tx - 9, ty - 18, 18, 20);
    [[ty - 10, 62, 50], [ty - 48, 50, 46], [ty - 82, 38, 42]].forEach(([by, w, h], k) => {
      const g = ctx.createLinearGradient(tx - w, 0, tx + w, 0);
      g.addColorStop(0, '#1b5e20'); g.addColorStop(0.5, '#2f9e44'); g.addColorStop(1, '#1b5e20');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(tx - w, by); ctx.lineTo(tx, by - h); ctx.lineTo(tx + w, by); ctx.quadraticCurveTo(tx, by + 8, tx - w, by); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; // snow on the branches
      ctx.beginPath(); ctx.moveTo(tx - w * 0.9, by - 2); ctx.quadraticCurveTo(tx - w * 0.5, by - 8, tx - w * 0.2, by - 3); ctx.quadraticCurveTo(tx, by - 6, tx + w * 0.3, by - 3); ctx.lineTo(tx + w * 0.3, by - 1); ctx.quadraticCurveTo(tx, by + 2, tx - w * 0.9, by); ctx.fill();
    });
    // a garland of twinkling lights winding up the tree
    const cols = ['224, 49, 49', '255, 212, 59', '77, 171, 247', '64, 192, 87', '255, 107, 214'];
    for (let k = 0; k < 26; k++) {
      const f = k / 26, ly = ty - 14 - f * 112, half = (1 - f) * 52 + 6;
      const lx = tx + Math.sin(f * Math.PI * 7) * half * 0.85;
      const on = Math.sin(time * 3 + k * 1.3) > -0.3;
      if (on) glow(lx, ly, 7, cols[k % 5], 0.9);
      ctx.fillStyle = `rgb(${cols[k % 5]})`; ctx.beginPath(); ctx.arc(lx, ly, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // ornaments
    [[-30, -30, '#e03131'], [25, -38, '#ffd43b'], [-14, -66, '#4dabf7'], [16, -82, '#e03131'], [0, -104, '#ffd43b'], [-36, -14, '#cc5de8'], [34, -16, '#4dabf7']]
      .forEach(([dx, dy, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(tx + dx, ty + dy, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(tx + dx - 1.4, ty + dy - 1.4, 1.3, 0, Math.PI * 2); ctx.fill(); });
    // the star on top
    const sy = ty - 132;
    glow(tx, sy, 30, '255, 230, 120', 0.7 + 0.2 * Math.sin(time * 3));
    ctx.save(); ctx.translate(tx, sy); ctx.rotate(Math.sin(time) * 0.1);
    ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#e8a200'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 6 : 14; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    // presents under it
    [[-52, 6, 22, 18, '#e03131', '#ffd43b'], [-26, 10, 18, 14, '#2f9e44', '#e03131'], [30, 8, 24, 16, '#4dabf7', '#ffffff'], [56, 10, 16, 14, '#cc5de8', '#ffd43b']]
      .forEach(([dx, dy, w, h, c, rib]) => {
        const px = tx + dx, py = ty + dy;
        ctx.fillStyle = c; ctx.fillRect(px - w / 2, py - h, w, h);
        ctx.fillStyle = rib; ctx.fillRect(px - 1.5, py - h, 3, h); ctx.fillRect(px - w / 2, py - h / 2 - 1.5, w, 3);
        ctx.beginPath(); ctx.ellipse(px - 4, py - h - 2, 4, 2.5, -0.4, 0, Math.PI * 2); ctx.ellipse(px + 4, py - h - 2, 4, 2.5, 0.4, 0, Math.PI * 2); ctx.fill();
      });
    // the snowman, waving
    const sx = 725, sb = ty;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#d0ebff'; ctx.lineWidth = 1.5;
    for (const [dy, rr] of [[-18, 20], [-50, 15], [-74, 11]]) { ctx.beginPath(); ctx.arc(sx, sb + dy, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(sx - 4, sb - 77, 1.6, 0, Math.PI * 2); ctx.arc(sx + 4, sb - 77, 1.6, 0, Math.PI * 2); ctx.fill();
    for (const dy of [-55, -47, -39]) { ctx.beginPath(); ctx.arc(sx, sb + dy, 1.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ff922b'; ctx.beginPath(); ctx.moveTo(sx, sb - 73); ctx.lineTo(sx + 12, sb - 71); ctx.lineTo(sx, sb - 70); ctx.fill();
    ctx.fillStyle = '#e03131'; ctx.fillRect(sx - 12, sb - 64, 24, 5); ctx.fillRect(sx + 5, sb - 64, 5, 14); // a scarf
    ctx.fillStyle = '#212529'; ctx.fillRect(sx - 9, sb - 86, 18, 3); ctx.fillRect(sx - 6, sb - 100, 12, 14); // a top hat
    ctx.strokeStyle = '#6b3f1d'; ctx.lineWidth = 2;
    const wave = Math.sin(time * 4) * 0.4;
    ctx.beginPath(); ctx.moveTo(sx - 14, sb - 52); ctx.lineTo(sx - 30, sb - 62); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 14, sb - 52); ctx.lineTo(sx + 28, sb - 66 - wave * 12); ctx.stroke();
    ctx.font = 'bold 13px Trebuchet MS'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText('🎄 Merry Christmas!', tx, ty + 34);
    ctx.fillStyle = '#c92a2a'; ctx.fillText('🎄 Merry Christmas!', tx, ty + 34);
  }

  function drawSellShop(time) {
    const { x, y } = SELL_SHOP;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 70, 125, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ebfbee';
    roundRect(x - 105, y - 35, 210, 105, 8); ctx.fill();
    ctx.strokeStyle = '#2f9e44'; ctx.lineWidth = 3; ctx.stroke();
    // door
    ctx.fillStyle = '#2b8a3e';
    roundRect(x - 18, y + 15, 36, 55, 6); ctx.fill();
    ctx.fillStyle = '#ffd43b';
    ctx.beginPath(); ctx.arc(x + 10, y + 44, 2.5, 0, Math.PI * 2); ctx.fill();
    // windows: a pile of coins and a money bag
    ctx.fillStyle = '#9ad7ff';
    roundRect(x - 92, y - 15, 58, 45, 6); ctx.fill();
    roundRect(x + 34, y - 15, 58, 45, 6); ctx.fill();
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k % 2 ? '#fcc419' : '#ffd43b';
      ctx.beginPath(); ctx.ellipse(x - 63, y + 24 - k * 4, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8a200'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.fillText('💰', x + 63, y + 22 + Math.sin(time * 3) * 2);
    // roof
    ctx.fillStyle = '#2f9e44';
    ctx.beginPath(); ctx.moveTo(x - 122, y - 33); ctx.lineTo(x, y - 88); ctx.lineTo(x + 122, y - 33); ctx.fill();
    // a spinning coin on the roof
    const sq = Math.abs(Math.cos(time * 2.5));
    ctx.fillStyle = '#ffd43b';
    ctx.beginPath(); ctx.ellipse(x, y - 102, 13 * sq + 1, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e8a200'; ctx.lineWidth = 2; ctx.stroke();
    if (sq > 0.4) { ctx.fillStyle = '#e8a200'; ctx.font = 'bold 15px Trebuchet MS'; ctx.fillText('$', x, y - 97); }
    // sign
    ctx.fillStyle = '#fff';
    roundRect(x - 70, y - 62, 140, 26, 8); ctx.fill();
    ctx.strokeStyle = '#2f9e44'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#2b8a3e';
    ctx.font = 'bold 15px Trebuchet MS';
    ctx.fillText('💰 SELL SHOP', x, y - 43);
    if (dist(player, { x, y: y + 90 }) <= REACH && openWindow !== 'sell') {
      drawBubbleButton(x, y + 98, '💰 Tap to sell your stuff', '#2f9e44', time);
    }
  }

  function drawPetShop(time) {
    const { x, y } = PET_SHOP;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 72, 140, 13, 0, 0, Math.PI * 2); ctx.fill();
    // building
    ctx.fillStyle = '#fff4e0';
    roundRect(x - 120, y - 35, 240, 105, 8); ctx.fill();
    ctx.strokeStyle = '#f08c00'; ctx.lineWidth = 3; ctx.stroke();
    // door with a paw print
    ctx.fillStyle = '#d9480f';
    roundRect(x - 20, y + 15, 40, 55, 6); ctx.fill();
    ctx.fillStyle = '#ffd8a8';
    ctx.beginPath(); ctx.arc(x, y + 44, 6, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - 7 + k * 7, y + 34, 3, 0, Math.PI * 2); ctx.fill(); }
    // windows with lucky blocks that bounce
    ctx.fillStyle = '#9ad7ff';
    roundRect(x - 105, y - 12, 70, 48, 6); ctx.fill();
    roundRect(x + 35, y - 12, 70, 48, 6); ctx.fill();
    const blockColors = ['#b07a3e', '#fcc419', '#66d9e8', null];
    blockColors.forEach((c, k) => {
      const bx = (k < 2 ? x - 88 : x + 52) + (k % 2) * 34, by = y + 8 + Math.sin(time * 4 + k) * 3;
      if (c) ctx.fillStyle = c;
      else {
        const g = ctx.createLinearGradient(bx - 10, 0, bx + 10, 0);
        ['#ff4040', '#ffee00', '#39d353', '#3d9bff', '#ff4fd8'].forEach((cc, i, a) => g.addColorStop(i / (a.length - 1), cc));
        ctx.fillStyle = g;
      }
      roundRect(bx - 10, by - 10, 20, 20, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px Trebuchet MS';
      ctx.textAlign = 'center';
      ctx.fillText('?', bx, by + 5);
    });
    // roof
    ctx.fillStyle = '#f08c00';
    ctx.beginPath(); ctx.moveTo(x - 138, y - 33); ctx.lineTo(x, y - 92); ctx.lineTo(x + 138, y - 33); ctx.fill();
    // a little dragon on the roof
    ctx.font = '34px serif';
    ctx.fillText('🐉', x, y - 92 + Math.sin(time * 2) * 3);
    // sign
    ctx.fillStyle = '#fff';
    roundRect(x - 75, y - 64, 150, 26, 8); ctx.fill();
    ctx.strokeStyle = '#f08c00'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#d9480f';
    ctx.font = 'bold 15px Trebuchet MS';
    ctx.fillText('🐾 PET SHOP', x, y - 45);
    if (dist(player, { x, y: y + 90 }) <= REACH && openWindow !== 'petshop') {
      drawBubbleButton(x, y + 98, '🐾 Tap to open lucky blocks', '#f08c00', time);
    }
  }

  // colored sky, falling sparkles and a banner while a mutation is happening
  // the color of a mutated scoop (Impossible cycles through every color)
  function mutScoopColor(m, time) {
    if (m.id === 'impossible') return `hsl(${(time * 240) % 360}, 100%, 60%)`;
    if (m.id === 'prismatic') return `hsl(${(time * 160) % 360}, 100%, 78%)`;
    return mutColor(m, time);
  }

  const pickColor = m => m.colors[Math.floor(Math.random() * m.colors.length)];

  function drawEventEffects(time, dt) {
    const muts = activeMuts();
    // with several mutations going, each one gets a share of the tint and sparkles
    const share = 1 / Math.max(1, muts.length);
    for (const m of muts) drawOneMutation(m, time, dt * Math.max(share, 0.5), share);
    drawMutFx(time, dt);
    drawAmbient(time, dt);
  }

  function drawOneMutation(m, time, dt, share) {
    if (m.id === 'rainbow') {
      drawMutationExtras(m, time, dt, share); // no rain: only Gold, Galaxy and Meteor Shower have things falling
    } else if (m) {
      const tint = ({ impossible: 0.1, sakura: 0.08, galaxy: 0.32, meteor: 0.12, cyber: 0.3, glass: 0.12, cereal: 0.1, frostbite: 0.18,
        inferno: 0.12, radioactive: 0.12, tornado: 0.14, vampire: 0.45, aura: 0.07, darkmatter: 0.5, prismatic: 0.16, christmas: 0.08 }[m.id] ?? 0.13) * Math.max(share, 0.5);
      const TINT = { cyber: '#04121c', cereal: '#fff3c4', vampire: '#1a0005', darkmatter: '#07000f', tornado: '#495057' };
      if (tint) {
        ctx.globalAlpha = tint;
        ctx.fillStyle = m.id === 'impossible' || m.id === 'prismatic' ? `hsl(${(time * (m.id === 'prismatic' ? 40 : 120)) % 360}, 100%, ${m.id === 'prismatic' ? 80 : 50}%)` : TINT[m.id] || m.colors[0];
        ctx.fillRect(0, 0, world.width, world.height);
        ctx.globalAlpha = 1;
      }
      // only Gold, Galaxy and Meteor Shower drop things from the sky (and Cyber sparks float up, Glass Storms drop shards)
      const rate = m.id === 'meteor' ? 1.5 : ['gold', 'galaxy', 'impossible', 'cyber', 'glass'].includes(m.id) ? 20 : 0; // fewer of the big meteors
      for (let i = 0; i < 2; i++) {
        if (Math.random() >= dt * rate) continue;
        const p = { x: Math.random() * world.width, y: -10, vy: 40 + Math.random() * 60,
          vx: (Math.random() - 0.5) * 30, r: 2 + Math.random() * 3, color: pickColor(m), shape: 'dot' };
        if (m.id === 'sakura') { p.shape = 'petal'; p.r += 2; p.vy *= 0.6; p.vx += 25; }      // drifting cherry blossoms
        if (m.id === 'gold') { p.shape = 'coin'; p.r += 2; p.spin = 3 + Math.random() * 5; }  // spinning gold coins
        if (m.id === 'diamond') { p.shape = 'gem'; p.r += 2.5; p.rot = Math.random() * 6; }  // tumbling diamonds
        if (m.id === 'galaxy') { p.shape = 'twinkle'; p.r += 1; p.vy *= 0.35; }              // slow twinkling stars
        if (m.id === 'cyber') {                                                             // glowing cyan sparks floating up
          Object.assign(p, { y: world.height + 10, vy: -(30 + Math.random() * 50), color: Math.random() < 0.7 ? CYAN : '#d9fdff', r: 1.5 + Math.random() * 2.5 });
        }
        if (m.id === 'glass') {                                                             // glass shards drifting down and spinning
          Object.assign(p, { shape: 'shard', r: 3 + Math.random() * 4, vy: 35 + Math.random() * 40, hue: Math.random() * 360, rot: Math.random() * 6 });
        }
        if (m.id === 'meteor') {                                                            // big flaming meteors
          Object.assign(p, { x: world.width * 0.2 + Math.random() * world.width, y: -20, vx: -220 - Math.random() * 80, vy: 340 + Math.random() * 80,
            shape: 'meteor', r: 6 + Math.random() * 6, life: 4 });
        }
        if (m.id === 'impossible') {
          // sparks fly out in every direction
          const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
          Object.assign(p, { y: Math.random() * world.height, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 1.5, color: `hsl(${Math.random() * 360}, 100%, 60%)` });
        }
        ambient.push(p);
      }
      if (m.id === 'impossible') drawGlitch(time);
      drawMutationExtras(m, time, dt, share);
      if (m.id === 'cyber') drawCyberGrid(time, share);
      if (m.id === 'glass') drawGlassStorm(time, share);
    }
  }

  function drawAmbient(time, dt) {
    for (let i = ambient.length - 1; i >= 0; i--) {
      const p = ambient[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life !== undefined) p.life -= dt;
      if (p.y > world.height + 20 || p.y < -20 || p.x > world.width + 30 || p.life <= 0) { ambient.splice(i, 1); continue; }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life !== undefined ? Math.min(0.9, p.life) : 0.8;
      if (p.shape === 'shard') {
        glassShard(p.x + Math.sin(time + i) * 10, p.y, p.r, p.rot + time * 2, (p.hue + time * 40) % 360);
      } else if (p.shape === 'code') {
        ctx.font = `bold ${p.r * 1.6}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.shape === 'petal') {
        // a pink petal tumbling in the wind
        ctx.save();
        ctx.translate(p.x + Math.sin(time * 1.5 + i) * 14, p.y);
        ctx.rotate(time * 2 + i);
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.ellipse(-p.r * 0.3, 0, p.r * 0.35, p.r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (p.shape === 'coin') {
        // a gold coin spinning as it falls
        const w = Math.abs(Math.cos(time * p.spin + i)) * p.r + 0.6;
        ctx.fillStyle = '#e8a200';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, w, p.r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd43b';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, w * 0.75, p.r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        if (w > p.r * 0.8 && Math.sin(time * 6 + i) > 0.7) star(p.x - w * 0.3, p.y - p.r * 0.3, p.r * 0.8, '#ffffff');
      } else if (p.shape === 'gem') {
        // a sparkly diamond tumbling down
        ctx.save();
        ctx.translate(p.x + Math.sin(time + i) * 8, p.y); ctx.rotate(p.rot + time * 1.5);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.lineTo(p.r * 0.7, -p.r * 0.2); ctx.lineTo(0, p.r * 1.1); ctx.lineTo(-p.r * 0.7, -p.r * 0.2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.lineTo(p.r * 0.7, -p.r * 0.2); ctx.lineTo(0, -p.r * 0.1); ctx.closePath(); ctx.fill();
        ctx.restore();
        if (Math.sin(time * 5 + i * 3) > 0.92) star(p.x, p.y, p.r * 1.4, '#ffffff');
      } else if (p.shape === 'twinkle') {
        star(p.x, p.y, p.r * (0.6 + 0.6 * Math.abs(Math.sin(time * 3 + i))), i % 3 ? '#ffffff' : p.color);
      } else if (p.shape === 'meteor') {
        // a flaming rock with a fading tail behind it
        const sp = Math.hypot(p.vx, p.vy), tx = -p.vx / sp, ty = -p.vy / sp, len = 90;
        const tail = ctx.createLinearGradient(p.x, p.y, p.x + tx * len, p.y + ty * len);
        tail.addColorStop(0, 'rgba(255,200,60,0.9)');
        tail.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.strokeStyle = tail; ctx.lineWidth = p.r * 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + tx * len, p.y + ty * len); ctx.stroke();
        ctx.lineCap = 'butt';
        glow(p.x, p.y, p.r * 3, '255, 120, 0', 0.6);
        ctx.fillStyle = '#5c2a00';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd43b';
        ctx.beginPath(); ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.7 + 0.3 * Math.sin(time * 8 + i)), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ✨ the cooler parts of every regular event (Cyber and Glass have their own big storms)
  const mutFx = []; // effects that last a little while: bursts, whirlwinds, portals, craters…
  function addMutFx(fx) { if (mutFx.length < 120) mutFx.push({ t: 0, ...fx }); }
  // a random spot in the park; most of them on your screen, so you see the effects
  function randSpot() {
    if (Math.random() < 0.65) {
      const x0 = -view.ox / view.scale, y0 = -view.oy / view.scale, w = view.w / view.scale, h = view.h / view.scale;
      return { x: Math.max(30, Math.min(world.width - 30, x0 + 40 + Math.random() * (w - 80))),
        y: Math.max(120, Math.min(world.height - 30, y0 + 120 + Math.random() * (h - 160))) };
    }
    return { x: 60 + Math.random() * (world.width - 120), y: 220 + Math.random() * (world.height - 260) };
  }

  function drawMutationExtras(m, time, dt, share) {
    const k = Math.max(share, 0.5);
    const chance = n => Math.random() < n * dt * k;
    ctx.save();
    switch (m.id) {
      case 'gold': {
        // 🪙 golden sunbeams sweeping over the park, and coin fountains bursting out of the ground
        for (let b = 0; b < 2; b++) {
          const sx = ((time * 90 + b * 900) % (world.width + 800)) - 400;
          const g = ctx.createLinearGradient(sx - 140, 0, sx + 140, 0);
          g.addColorStop(0, 'rgba(255, 215, 0, 0)'); g.addColorStop(0.5, `rgba(255, 225, 90, ${0.18 * k})`); g.addColorStop(1, 'rgba(255, 215, 0, 0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(sx - 70, 0); ctx.lineTo(sx + 70, 0); ctx.lineTo(sx + 300, world.height); ctx.lineTo(sx + 60, world.height); ctx.fill();
        }
        if (chance(1.2)) {
          const p = randSpot();
          petSpark(p.x, p.y, { shape: 'ring', color: '#ffd43b', vy: 0, life: 0.8, size: 10, grow: 120 });
          for (let i = 0; i < 10; i++) petSpark(p.x, p.y, { shape: 'star', color: i % 2 ? '#ffd43b' : '#fff3a0', vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 160, life: 1, size: 4 });
          addMutFx({ kind: 'coins', x: p.x, y: p.y, life: 1.2 });
        }
        if (chance(3)) star(Math.random() * world.width, Math.random() * world.height, 2 + Math.random() * 3, '#fff3a0');
        break;
      }
      case 'sakura': {
        // 🌸 gusts of wind, petal whirlwinds and flowers blooming on the ground
        if (chance(0.6)) addMutFx({ kind: 'gust', x: -200, y: 150 + Math.random() * (world.height - 200), life: 3, len: 160 + Math.random() * 120 });
        // petals blowing sideways across the park in the breeze (not falling)
        if (chance(12)) ambient.push({ x: -10, y: 60 + Math.random() * (world.height - 80), vx: 90 + Math.random() * 80, vy: (Math.random() - 0.5) * 12,
          r: 4 + Math.random() * 3, color: pickColor(m), shape: 'petal', life: (world.width + 20) / 90 });
        if (chance(0.5)) addMutFx({ kind: 'whirl', ...randSpot(), life: 4 });
        if (chance(3)) addMutFx({ kind: 'bloom', ...randSpot(), life: 2.5, size: 6 + Math.random() * 6 });
        break;
      }
      case 'diamond': {
        // 💎 crystals growing out of the ground, light glints all over, and diamonds shattering into shards and frost
        if (chance(4)) addMutFx({ kind: 'crystal', ...randSpot(), life: 3.5, size: 10 + Math.random() * 10 });
        if (chance(10)) addMutFx({ kind: 'glint', x: Math.random() * world.width, y: Math.random() * world.height, life: 0.7, size: 6 + Math.random() * 8 });
        if (chance(1.2)) {
          const p = randSpot();
          petSpark(p.x, p.y, { shape: 'ring', color: '#b9f2ff', vy: 0, life: 0.9, size: 8, grow: 150 });
          for (let i = 0; i < 12; i++) petSpark(p.x, p.y, { shape: 'shard', vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 200, life: 0.9, size: 3.5, hue: 185 + Math.random() * 30 });
          for (let i = 0; i < 4; i++) petSpark(p.x, p.y, { shape: 'flake', color: '#e8fdff', vx: (Math.random() - 0.5) * 80, vy: -30 - Math.random() * 40, life: 1.4, size: 5 });
        }
        break;
      }
      case 'galaxy': {
        // 🪐 colorful space clouds, a ringed planet floating by, and shooting stars
        for (let n = 0; n < 3; n++) {
          const nx = ((time * 12 + n * 700) % (world.width + 600)) - 300, ny = 200 + n * 300 + Math.sin(time * 0.3 + n) * 60;
          const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, 260);
          g.addColorStop(0, `rgba(${['123, 60, 255', '255, 102, 217', '60, 140, 255'][n]}, ${0.16 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(nx, ny, 260, 0, Math.PI * 2); ctx.fill();
        }
        const px = ((time * 20) % (world.width + 400)) - 200, py = 110 + Math.sin(time * 0.4) * 20;
        ctx.globalAlpha = 0.85 * k;
        const pg = ctx.createRadialGradient(px - 12, py - 12, 4, px, py, 40);
        pg.addColorStop(0, '#ffb3ec'); pg.addColorStop(1, '#5a1fb8');
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 40, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd6f5'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(px, py, 70, 16, -0.3, Math.PI * 0.05, Math.PI * 0.95, true); ctx.stroke();
        ctx.globalAlpha = 1;
        if (chance(2)) addMutFx({ kind: 'shooting', x: Math.random() * world.width, y: Math.random() * world.height * 0.5, life: 0.8 });
        break;
      }
      case 'rainbow': {
        // 🌈 rainbow bubbles floating up and bursts of rainbow stars (the big rainbow is drawn with the sky)
        if (chance(4)) {
          const p = randSpot();
          petSpark(p.x, p.y, { shape: 'bubble', color: `hsl(${Math.random() * 360}, 100%, 65%)`, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, life: 3, size: 4 + Math.random() * 6 });
        }
        if (chance(0.4)) {
          const p = randSpot();
          for (let i = 0; i < 14; i++) petSpark(p.x, p.y, { shape: 'star', color: `hsl(${i * 26}, 100%, 62%)`, vx: Math.cos(i * 0.45) * 140, vy: Math.sin(i * 0.45) * 140 - 40, life: 0.9, size: 4 });
        }
        break;
      }
      case 'meteor': {
        // ☄️ the sky glows red, embers float up, and meteors crash into the park
        const g = ctx.createLinearGradient(0, 0, 0, 300);
        g.addColorStop(0, `rgba(255, 70, 0, ${0.3 * k})`); g.addColorStop(1, 'rgba(255, 70, 0, 0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, world.width, 300);
        if (chance(6)) petSpark(Math.random() * world.width, world.height * (0.3 + Math.random() * 0.7),
          { shape: 'flame', color: Math.random() < 0.5 ? '#ff6b00' : '#ffd43b', vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 40, life: 1.6, size: 2.5 });
        if (chance(0.8)) addMutFx({ kind: 'crash', ...randSpot(), life: 4 });
        break;
      }
      case 'cereal': {
        // 🥣 giant cereal bowls pop up and splash colorful loops and milk everywhere
        if (chance(3.5)) addMutFx({ kind: 'bowl', ...randSpot(), life: 3 });
        if (chance(3)) {
          const p = randSpot();
          for (let i = 0; i < 6; i++) petSpark(p.x, p.y, { shape: 'bubble', color: '#ffffff', vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 100, life: 0.6, size: 2 + Math.random() * 2 });
        }
        break;
      }
      case 'frostbite': {
        // ❄️ frost around the edges, ice spikes bursting out of the ground and icy mist drifting by
        const edge = 90;
        for (const [x0, y0, x1, y1] of [[0, 0, edge, 0], [world.width, 0, world.width - edge, 0], [0, 0, 0, edge], [0, world.height, 0, world.height - edge]]) {
          const g = ctx.createLinearGradient(x0, y0, x1, y1);
          g.addColorStop(0, `rgba(231, 245, 255, ${0.55 * k})`); g.addColorStop(1, 'rgba(231, 245, 255, 0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, world.width, world.height);
        }
        if (chance(7)) addMutFx({ kind: 'icespike', ...randSpot(), life: 3, size: 12 + Math.random() * 10 });
        if (chance(0.8)) addMutFx({ kind: 'mist', x: -150, y: 100 + Math.random() * (world.height - 150), life: 7, size: 60 + Math.random() * 50 });
        break;
      }
      case 'inferno': {
        // 🔥 fire pillars blast out of the ground, the ground cracks with lava, and embers float up
        if (chance(6)) addMutFx({ kind: 'firepillar', ...randSpot(), life: 1.6 });
        if (chance(3)) addMutFx({ kind: 'lavacrack', ...randSpot(), life: 4, seed: Math.random() * 100 });
        if (chance(10)) petSpark(Math.random() * world.width, world.height * Math.random(),
          { shape: 'flame', color: Math.random() < 0.5 ? '#ff4500' : '#ffb000', vx: (Math.random() - 0.5) * 20, vy: -50 - Math.random() * 40, life: 1.4, size: 2.5 });
        break;
      }
      case 'radioactive': {
        // ☢️ bubbling toxic puddles, glowing green gas and radiation rings pulsing out
        if (chance(4)) addMutFx({ kind: 'puddle', ...randSpot(), life: 5, size: 24 + Math.random() * 20 });
        if (chance(0.6)) {
          const p = randSpot();
          petSpark(p.x, p.y, { shape: 'ring', color: '#7cff00', vy: 0, life: 1.2, size: 10, grow: 170 });
          petSpark(p.x, p.y - 5, { shape: 'heart', infinity: false, radiation: true, color: '#d4ff3f', vy: -20, life: 1.5, size: 9 });
        }
        if (chance(2)) petSpark(Math.random() * world.width, Math.random() * world.height,
          { shape: 'smoke', color: 'rgba(124, 255, 0, 0.18)', vx: 15, vy: -8, life: 3, size: 14 });
        break;
      }
      case 'tornado': {
        // 🌪️ big tornadoes spin across the park with stuff flying around them, and wind streaks
        if (chance(0.8) && mutFx.filter(f => f.kind === 'twister').length < 5) {
          const left = Math.random() < 0.5;
          addMutFx({ kind: 'twister', ...randSpot(), vx: (left ? 1 : -1) * (70 + Math.random() * 50), life: 30 });
        }
        if (chance(3)) addMutFx({ kind: 'gust', x: -200, y: 80 + Math.random() * (world.height - 100), life: 2.5, len: 120 + Math.random() * 120, color: '#f1f3f5' });
        break;
      }
      case 'vampire': {
        // 🧛 night falls: a big blood moon, bats flying across, red mist and glowing eyes in the dark
        const mx = (view.w * 0.78 - view.ox) / view.scale, my = (90 - view.oy) / view.scale; // stays in the sky on your screen
        glow(mx, my, 220, '255, 40, 40', 0.35 * k);
        ctx.globalAlpha = 0.9 * k; ctx.fillStyle = '#ff4d4d';
        ctx.beginPath(); ctx.arc(mx, my, 60, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(150, 0, 0, 0.45)';
        for (const [dx, dy, rr] of [[-18, -12, 12], [15, 10, 9], [-5, 22, 6]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, rr, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        if (chance(6)) addMutFx({ kind: 'bat', x: Math.random() < 0.5 ? -30 : world.width + 30, y: 60 + Math.random() * (world.height - 120), life: 9, seed: Math.random() * 10 });
        if (chance(2.5)) addMutFx({ kind: 'eyes', ...randSpot(), life: 2.5 });
        if (chance(1.5)) petSpark(Math.random() * world.width, Math.random() * world.height, { shape: 'smoke', color: 'rgba(200, 0, 30, 0.15)', vx: 10, vy: -5, life: 3, size: 16 });
        break;
      }
      case 'aura': {
        // 😎 everyone glows with a huge aura (see drawPlayer), pillars of light and "+AURA" popping up
        if (chance(2.5)) addMutFx({ kind: 'pillar', ...randSpot(), life: 1.5, hue: Math.random() < 0.5 ? 45 : 265 });
        if (chance(4)) addMutFx({ kind: 'auratext', ...randSpot(), life: 1.6, text: `+${[100, 500, 1000, 9999, 1e6][Math.floor(Math.random() * 5)].toLocaleString('en-US')} AURA` });
        break;
      }
      case 'darkmatter': {
        // 🌑 tiny black holes pull purple light into them, and cracks of dark energy split the air
        if (chance(1.5) && mutFx.filter(f => f.kind === 'void').length < 8) addMutFx({ kind: 'void', ...randSpot(), life: 6 });
        if (chance(3)) {
          const p = randSpot(), pts = [];
          let cx = 0, cy = 0;
          for (let j = 0; j < 6; j++) { cx += (Math.random() - 0.5) * 50; cy += 10 + Math.random() * 20; pts.push([cx, cy]); }
          petSpark(p.x, p.y - 60, { shape: 'bolt', color: '#c77dff', pts, vx: 0, vy: 0, life: 0.4 });
        }
        break;
      }
      case 'christmas': {
        // 🎄 strings of Christmas lights across the sky, presents popping open everywhere and golden twinkles
        for (let row = 0; row < 2; row++) {
          const y0 = 40 + row * 60;
          ctx.strokeStyle = 'rgba(33, 37, 41, 0.6)'; ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let x = 0; x <= world.width; x += 20) ctx.lineTo(x, y0 + Math.abs(Math.sin((x + row * 90) / 180 * Math.PI)) * 30);
          ctx.stroke();
          for (let x = 15, k = 0; x <= world.width; x += 45, k++) {
            const ly = y0 + Math.abs(Math.sin((x + row * 90) / 180 * Math.PI)) * 30 + 5;
            const col = ['224, 49, 49', '255, 212, 59', '64, 192, 87', '77, 171, 247', '255, 107, 214'][(k + row) % 5];
            if (Math.sin(time * 3 + k * 1.1 + row) > -0.3) glow(x, ly, 14, col, 0.8);
            ctx.fillStyle = `rgb(${col})`; ctx.beginPath(); ctx.ellipse(x, ly, 3.5, 5, 0, 0, Math.PI * 2); ctx.fill();
          }
        }
        if (chance(2.5)) addMutFx({ kind: 'present', ...randSpot(), life: 2.2, color: ['#e03131', '#2f9e44', '#4dabf7', '#cc5de8'][Math.floor(Math.random() * 4)] });
        if (chance(4)) { const p = randSpot(); star(p.x, p.y, 4, Math.random() < 0.5 ? '#ffd43b' : '#ffffff'); }
        break;
      }
      case 'prismatic': {
        // 💠 the best mutation: giant floating prism crystals shooting rainbow beams, a rainbow aurora across the sky,
        // and rainbow sparkle bursts all over
        for (let b = 0; b < 3; b++) { // aurora ribbons
          ctx.globalAlpha = 0.38 * k;
          ctx.strokeStyle = `hsl(${(time * 50 + b * 120) % 360}, 100%, 75%)`; ctx.lineWidth = 30;
          ctx.beginPath();
          for (let x = 0; x <= world.width; x += 40) ctx.lineTo(x, 70 + b * 34 + Math.sin(x / 160 + time + b) * 26);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (chance(2) && mutFx.filter(f => f.kind === 'prism').length < 9) addMutFx({ kind: 'prism', ...randSpot(), life: 5, size: 18 + Math.random() * 14 });
        if (chance(5)) {
          const p = randSpot();
          petSpark(p.x, p.y, { shape: 'ring', color: `hsl(${Math.random() * 360}, 100%, 80%)`, vy: 0, life: 0.8, size: 8, grow: 140 });
          for (let i = 0; i < 12; i++) petSpark(p.x, p.y, { shape: 'star', color: `hsl(${i * 30}, 100%, 75%)`, vx: Math.cos(i * 0.52) * 150, vy: Math.sin(i * 0.52) * 150, life: 0.8, size: 4 });
        }
        break;
      }
      case 'impossible': {
        // ♾️ swirling portals open and close, and floating infinity signs
        if (chance(0.8)) addMutFx({ kind: 'portal', ...randSpot(), life: 4 });
        if (chance(5)) {
          const p = randSpot();
          petSpark(p.x, p.y, { shape: 'heart', text: '', color: `hsl(${Math.random() * 360}, 100%, 65%)`, vx: 0, vy: -25, life: 2, size: 7, infinity: true });
        }
        break;
      }
    }
    ctx.restore();
  }

  function drawMutFx(time, dt) {
    for (let i = mutFx.length - 1; i >= 0; i--) {
      const f = mutFx[i];
      f.t += dt;
      if (f.t >= f.life) { mutFx.splice(i, 1); continue; }
      const a = 1 - f.t / f.life;
      ctx.save();
      switch (f.kind) {
        case 'coins': // coins shooting up out of the ground like a fountain
          for (let c = 0; c < 6; c++) {
            const tt = f.t * 1.3, dx = (c - 2.5) * 22 * tt, dy = -260 * tt + 300 * tt * tt;
            const w = Math.abs(Math.cos(time * 8 + c)) * 5 + 0.6;
            ctx.globalAlpha = a; ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#e8a200'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.ellipse(f.x + dx, f.y + dy, w, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          }
          break;
        case 'gust': { // a pink swoosh of wind blowing across the park
          const x = f.x + f.t * 700;
          ctx.globalAlpha = Math.min(1, a * 2) * 0.55; ctx.strokeStyle = f.color || '#ffe3ef'; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath();
          for (let j = 0; j <= 10; j++) ctx.lineTo(x - j * f.len / 10, f.y + Math.sin(j * 0.7 + time * 4) * 8);
          ctx.stroke();
          break;
        }
        case 'whirl': // a little tornado of petals spinning in one spot
          for (let j = 0; j < 14; j++) {
            const an = time * 5 + j * 0.9, h = j * 7, rr = 6 + j * 2.2;
            ctx.globalAlpha = Math.min(1, a * 2, f.t * 2) * 0.9; ctx.fillStyle = j % 2 ? '#ffb7d5' : '#ff8fbf';
            ctx.beginPath(); ctx.ellipse(f.x + Math.cos(an) * rr, f.y - h + Math.sin(an) * rr * 0.3, 4, 2.4, an, 0, Math.PI * 2); ctx.fill();
          }
          break;
        case 'bloom': { // a cherry blossom opening up on the ground
          const open = Math.min(1, f.t * 2), r = f.size * open;
          ctx.globalAlpha = Math.min(1, a * 2);
          for (let j = 0; j < 5; j++) {
            const an = j * Math.PI * 2 / 5 + f.t;
            ctx.fillStyle = '#ffb7d5';
            ctx.beginPath(); ctx.ellipse(f.x + Math.cos(an) * r * 0.7, f.y + Math.sin(an) * r * 0.7, r * 0.6, r * 0.4, an, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.25, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'shooting': { // a shooting star streaking across the sky
          const x = f.x + f.t * 900, y = f.y + f.t * 380;
          const g = ctx.createLinearGradient(x, y, x - 120, y - 50);
          g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255, 102, 217, 0)');
          ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 120, y - 50); ctx.stroke();
          star(x, y, 5, '#ffffff');
          break;
        }
        case 'crash': { // a meteor drops, then a boom, a shockwave and a glowing crater
          const fall = 0.6;
          if (f.t < fall) {
            const k2 = f.t / fall, mx = f.x + 260 * (1 - k2), my = f.y - 500 * (1 - k2);
            glow(mx, my, 30, '255, 120, 0', 0.7);
            ctx.strokeStyle = 'rgba(255, 180, 60, 0.8)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 70, my - 130); ctx.stroke();
            ctx.fillStyle = '#5c2a00'; ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill();
          } else {
            if (!f.boom) {
              f.boom = true;
              petSpark(f.x, f.y, { shape: 'ring', color: '#ff6b00', vy: 0, life: 0.8, size: 12, grow: 220 });
              for (let j = 0; j < 16; j++) petSpark(f.x, f.y, { shape: 'flame', color: j % 2 ? '#ff6b00' : '#ffd43b', vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 240, life: 0.9, size: 4 });
              for (let j = 0; j < 5; j++) petSpark(f.x, f.y, { shape: 'smoke', color: 'rgba(80, 60, 50, 0.5)', vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 20, life: 1.8, size: 8 });
            }
            const c = 1 - (f.t - fall) / (f.life - fall);
            glow(f.x, f.y, 40, '255, 90, 0', 0.5 * c);
            ctx.globalAlpha = c * 0.7; ctx.fillStyle = '#3b2314';
            ctx.beginPath(); ctx.ellipse(f.x, f.y, 26, 10, 0, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'crystal': { // a diamond crystal cluster grows out of the ground, sparkles, then breaks into shards
          const up = Math.min(1, f.t * 1.5), h = f.size * up;
          ctx.globalAlpha = Math.min(1, a * 3) * 0.85;
          for (const [dx, sc, lean] of [[-0.55, 0.7, -0.35], [0, 1, 0], [0.55, 0.6, 0.35]]) {
            const bx = f.x + dx * f.size * 0.6, hh = h * sc * 1.6, w = f.size * 0.28 * sc;
            ctx.save(); ctx.translate(bx, f.y); ctx.rotate(lean);
            const g = ctx.createLinearGradient(-w, 0, w, 0);
            g.addColorStop(0, '#7fdcff'); g.addColorStop(0.5, '#e8fdff'); g.addColorStop(1, '#b9f2ff');
            ctx.fillStyle = g; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(-w, -hh * 0.75); ctx.lineTo(0, -hh); ctx.lineTo(w, -hh * 0.75); ctx.lineTo(w, 0); ctx.closePath();
            ctx.fill(); ctx.stroke();
            ctx.restore();
          }
          glow(f.x, f.y - h * 0.8, f.size * 1.8, '185, 242, 255', 0.4 * Math.min(1, a * 3));
          if (Math.sin(time * 6 + f.x) > 0.8) star(f.x + 3, f.y - h * 1.3, 4, '#ffffff');
          if (!f.broke && f.t > f.life - 0.35) {
            f.broke = true;
            for (let j = 0; j < 10; j++) petSpark(f.x, f.y - h * 0.8, { shape: 'shard', vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 180, life: 0.8, size: 3, hue: 185 + Math.random() * 30 });
          }
          break;
        }
        case 'glint': { // a bright twinkle of light, like the sun catching a diamond
          const l = f.size * Math.sin(a * Math.PI);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(f.x - l, f.y); ctx.lineTo(f.x + l, f.y); ctx.moveTo(f.x, f.y - l); ctx.lineTo(f.x, f.y + l); ctx.stroke();
          glow(f.x, f.y, l * 1.6 + 1, '185, 242, 255', 0.6);
          break;
        }
        case 'bowl': { // a giant cereal bowl: loops jump out of it in arcs and milk splashes
          const up = Math.min(1, f.t * 3, a * 4);
          ctx.globalAlpha = up;
          ctx.fillStyle = '#4dabf7'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 26, 10, 0, 0, Math.PI); ctx.fill();
          ctx.beginPath(); ctx.moveTo(f.x - 26, f.y); ctx.quadraticCurveTo(f.x, f.y + 34, f.x + 26, f.y); ctx.fill();
          ctx.fillStyle = '#fffdf5'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
          for (let j = 0; j < 7; j++) {
            const tt = ((f.t * 1.2 + j / 7) % 1), dir = j % 2 ? 1 : -1;
            const lx = f.x + dir * (10 + j * 5) * tt, ly = f.y - 4 - 90 * tt + 110 * tt * tt;
            ctx.strokeStyle = ['#ff6b6b', '#fcc419', '#51cf66', '#4dabf7', '#cc5de8'][j % 5]; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.stroke();
          }
          break;
        }
        case 'icespike': { // jagged ice spikes burst out of the ground, then crack away
          const up = Math.min(1, f.t * 4), fade = Math.min(1, a * 3);
          ctx.globalAlpha = fade * 0.9;
          for (const [dx, sc, lean] of [[-0.7, 0.6, -0.5], [-0.25, 0.9, -0.15], [0.2, 1.1, 0.1], [0.65, 0.7, 0.45]]) {
            const hh = f.size * 2.4 * sc * up, w = f.size * 0.22;
            ctx.save(); ctx.translate(f.x + dx * f.size, f.y); ctx.rotate(lean);
            const g = ctx.createLinearGradient(0, 0, 0, -hh);
            g.addColorStop(0, '#74c0fc'); g.addColorStop(1, '#ffffff');
            ctx.fillStyle = g; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(0, -hh); ctx.lineTo(w, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
          }
          if (f.t < 0.1 && !f.burst) { f.burst = true; for (let j = 0; j < 6; j++) petSpark(f.x, f.y, { shape: 'flake', color: '#e7f5ff', vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 120, life: 1, size: 4 }); }
          break;
        }
        case 'mist': { // a cold white cloud drifting across
          const x = f.x + f.t * 120;
          ctx.globalAlpha = Math.min(1, a * 2, f.t) * 0.35;
          for (let j = 0; j < 4; j++) {
            const g = ctx.createRadialGradient(x + j * f.size * 0.6, f.y, 0, x + j * f.size * 0.6, f.y, f.size);
            g.addColorStop(0, '#ffffff'); g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + j * f.size * 0.6, f.y, f.size, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'firepillar': { // a pillar of fire shooting up out of the ground
          const h = 140 * Math.sin(Math.min(1, f.t / f.life) * Math.PI);
          glow(f.x, f.y - h / 2, 60, '255, 100, 0', 0.5 * a);
          for (let j = -1; j <= 1; j++) {
            flame(f.x + j * 9, f.y, 12, h * (j ? 0.7 : 1) * (0.9 + 0.1 * Math.sin(time * 20 + j)), '#ff4500');
            flame(f.x + j * 9, f.y, 7, h * (j ? 0.5 : 0.75), '#ffd43b');
          }
          ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#3b1206';
          ctx.beginPath(); ctx.ellipse(f.x, f.y + 2, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'lavacrack': { // a glowing crack of lava in the ground
          ctx.globalAlpha = Math.min(1, f.t * 2, a * 2);
          ctx.shadowColor = '#ff4500'; ctx.shadowBlur = 14;
          ctx.strokeStyle = '#ff8a00'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(f.x - 40, f.y);
          for (let j = 1; j <= 6; j++) ctx.lineTo(f.x - 40 + j * 13, f.y + Math.sin(f.seed + j * 2.3) * 8);
          ctx.stroke();
          ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 1; ctx.stroke();
          break;
        }
        case 'puddle': { // a bubbling toxic green puddle
          const sz = f.size * Math.min(1, f.t * 2), fade = Math.min(1, a * 3);
          glow(f.x, f.y, sz * 2, '124, 255, 0', 0.35 * fade);
          ctx.globalAlpha = fade * 0.85; ctx.fillStyle = '#5cd600';
          ctx.beginPath(); ctx.ellipse(f.x, f.y, sz, sz * 0.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#b6ff3f';
          ctx.beginPath(); ctx.ellipse(f.x - sz * 0.3, f.y - sz * 0.08, sz * 0.35, sz * 0.12, 0, 0, Math.PI * 2); ctx.fill();
          if (Math.random() < 0.15) petSpark(f.x + (Math.random() - 0.5) * sz, f.y, { shape: 'bubble', color: '#b6ff3f', vy: -25, life: 0.8, size: 2 + Math.random() * 3 });
          break;
        }
        case 'twister': { // a big tornado spinning across the park, with leaves and stuff whirling around it
          f.x += f.vx * dt;
          if (f.x < -150 || f.x > world.width + 150) { f.t = f.life; break; }
          const sway = Math.sin(time * 1.5 + f.y) * 14;
          for (let j = 0; j < 14; j++) {
            const yy = f.y - j * 14, w = 8 + j * 4.5, xx = f.x + sway * (j / 14) + Math.sin(time * 6 + j) * 4;
            ctx.globalAlpha = 0.5; ctx.strokeStyle = j % 2 ? '#e9ecef' : '#868e96'; ctx.lineWidth = 4.5;
            ctx.beginPath(); ctx.ellipse(xx, yy, w, w * 0.25, 0, time * 8 + j, time * 8 + j + 4.6); ctx.stroke();
          }
          ctx.globalAlpha = 0.9;
          for (let j = 0; j < 6; j++) {
            const an = time * 5 + j * 1.05, hh = (j * 31) % 170;
            ctx.fillStyle = ['#51cf66', '#8d5524', '#fcc419'][j % 3];
            ctx.fillRect(f.x + Math.cos(an) * (14 + hh * 0.35), f.y - hh + Math.sin(an) * 6, 4, 3);
          }
          ctx.globalAlpha = 0.25; ctx.fillStyle = '#495057';
          ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'bat': { // a bat flapping across the night
          if (f.vx === undefined) f.vx = f.x < 0 ? 140 + Math.random() * 60 : -140 - Math.random() * 60;
          f.x += f.vx * dt;
          const by = f.y + Math.sin(time * 3 + f.seed) * 20, flap = Math.sin(time * 18 + f.seed) * 0.8;
          ctx.fillStyle = '#1a0005'; ctx.globalAlpha = 0.95;
          for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(f.x, by);
            ctx.quadraticCurveTo(f.x + side * 8, by - 8 * flap - 4, f.x + side * 16, by - 6 * flap);
            ctx.quadraticCurveTo(f.x + side * 10, by + 2, f.x, by + 2); ctx.fill();
          }
          ctx.beginPath(); ctx.arc(f.x, by, 3.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ff2b2b'; ctx.fillRect(f.x - 1.6, by - 1, 1, 1); ctx.fillRect(f.x + 0.6, by - 1, 1, 1);
          break;
        }
        case 'eyes': { // glowing red eyes blinking in the dark
          const open = Math.sin(Math.min(1, f.t / f.life) * Math.PI);
          ctx.globalAlpha = open; ctx.fillStyle = '#ff1a1a'; ctx.shadowColor = '#ff1a1a'; ctx.shadowBlur = 10;
          for (const dx of [-6, 6]) { ctx.beginPath(); ctx.ellipse(f.x + dx, f.y, 3, 2 * open, 0, 0, Math.PI * 2); ctx.fill(); }
          break;
        }
        case 'pillar': { // a pillar of aura light shooting into the sky
          const w = 30 * Math.sin(Math.min(1, f.t / f.life) * Math.PI);
          const g = ctx.createLinearGradient(f.x - w, 0, f.x + w, 0);
          g.addColorStop(0, `hsla(${f.hue}, 100%, 70%, 0)`); g.addColorStop(0.5, `hsla(${f.hue}, 100%, 85%, 0.6)`); g.addColorStop(1, `hsla(${f.hue}, 100%, 70%, 0)`);
          ctx.fillStyle = g; ctx.fillRect(f.x - w, f.y - 400, w * 2, 400);
          glow(f.x, f.y, 50, f.hue === 45 ? '255, 212, 59' : '177, 151, 252', 0.5 * a);
          break;
        }
        case 'auratext': { // "+1,000 AURA" floating up
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.font = 'bold 16px Trebuchet MS'; ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40, 20, 60, 0.8)';
          ctx.strokeText(f.text, f.x, f.y - f.t * 40);
          ctx.fillStyle = `hsl(${(time * 200) % 360}, 100%, 75%)`;
          ctx.fillText(f.text, f.x, f.y - f.t * 40);
          break;
        }
        case 'void': { // a tiny black hole pulling purple light into it
          const open = Math.min(1, f.t, a * 2), R = 26 * open;
          glow(f.x, f.y, R * 3.5 + 1, '139, 44, 255', 0.45 * open);
          for (let j = 0; j < 3; j++) {
            ctx.strokeStyle = `rgba(${j % 2 ? '255, 43, 214' : '199, 125, 255'}, ${0.7 * open})`; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.ellipse(f.x, f.y, R * (1.5 + j * 0.5), R * (0.5 + j * 0.15), 0.3, -time * 3 + j * 2, -time * 3 + j * 2 + 3.6); ctx.stroke();
          }
          ctx.globalAlpha = open; ctx.fillStyle = '#000000';
          ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.6 + 0.1, 0, Math.PI * 2); ctx.fill();
          if (Math.random() < 0.5) {
            const an = Math.random() * Math.PI * 2, d = 90;
            petSpark(f.x + Math.cos(an) * d, f.y + Math.sin(an) * d * 0.5, { color: Math.random() < 0.5 ? '#c77dff' : '#ff2bd6', vx: -Math.cos(an) * d * 1.4, vy: -Math.sin(an) * d * 0.7, life: 0.7, size: 2 });
          }
          break;
        }
        case 'present': { // a present pops up out of the snow, its lid flies off and stars burst out
          const up = Math.min(1, f.t * 4), lid = Math.max(0, f.t - 0.6) * 120;
          ctx.globalAlpha = Math.min(1, a * 3);
          const w = 22 * up, h = 18 * up;
          ctx.fillStyle = f.color; ctx.fillRect(f.x - w / 2, f.y - h, w, h);
          ctx.fillStyle = '#ffd43b'; ctx.fillRect(f.x - 2, f.y - h, 4, h);
          ctx.save(); ctx.translate(f.x, f.y - h - 3 - lid); ctx.rotate(Math.min(1, lid / 60) * 0.8);
          ctx.fillStyle = f.color; ctx.fillRect(-w / 2 - 2, -3, w + 4, 6);
          ctx.fillStyle = '#ffd43b'; ctx.fillRect(-2, -3, 4, 6);
          ctx.beginPath(); ctx.ellipse(-4, -5, 4, 2.5, -0.4, 0, Math.PI * 2); ctx.ellipse(4, -5, 4, 2.5, 0.4, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          if (f.t > 0.6 && !f.burst) {
            f.burst = true;
            for (let j = 0; j < 10; j++) petSpark(f.x, f.y - h, { shape: 'star', color: j % 2 ? '#ffd43b' : '#ffffff', vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 120, life: 0.9, size: 4 });
          }
          break;
        }
        case 'prism': { // a giant crystal prism floating and spinning, shooting rainbow beams out of it
          const open = Math.min(1, f.t * 1.5, a * 3), S = f.size * open, by = f.y - 50 + Math.sin(time * 2 + f.x) * 8;
          ctx.globalAlpha = 0.5 * open;
          for (let j = 0; j < 7; j++) {
            const an = time * 0.8 + j * Math.PI * 2 / 7;
            ctx.strokeStyle = `hsl(${j * 51}, 100%, 70%)`; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(f.x, by); ctx.lineTo(f.x + Math.cos(an) * S * 6, by + Math.sin(an) * S * 3); ctx.stroke();
          }
          glow(f.x, by, S * 3, hueRgb((time * 80) % 360), 0.5 * open);
          ctx.globalAlpha = 0.9 * open;
          ctx.save(); ctx.translate(f.x, by); ctx.rotate(Math.sin(time * 1.5 + f.x) * 0.3);
          const g = ctx.createLinearGradient(-S, -S, S, S);
          [0, 60, 130, 200, 280].forEach((h, i, arr) => g.addColorStop(i / (arr.length - 1), `hsla(${(h + time * 60) % 360}, 100%, 85%, 0.9)`));
          ctx.fillStyle = g; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, -S * 1.4); ctx.lineTo(S * 0.8, 0); ctx.lineTo(0, S * 1.4); ctx.lineTo(-S * 0.8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-S * 0.8, 0); ctx.lineTo(S * 0.8, 0); ctx.moveTo(0, -S * 1.4); ctx.lineTo(0, S * 1.4); ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 0.25 * open; ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, S * 0.8, S * 0.25, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'portal': { // a swirling rainbow portal
          const open = Math.min(1, f.t * 1.5, a * 3), R = 34 * open;
          for (let j = 0; j < 4 && R - j * 7 > 0; j++) {
            ctx.globalAlpha = 0.6 * open;
            ctx.strokeStyle = `hsl(${(time * 200 + j * 90) % 360}, 100%, 60%)`; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(f.x, f.y, R - j * 7, (R - j * 7) * 0.45, 0, time * 4 + j, time * 4 + j + 4.5); ctx.stroke();
          }
          ctx.globalAlpha = 0.5 * open; ctx.fillStyle = '#12002b';
          ctx.beginPath(); ctx.ellipse(f.x, f.y, R * 0.35, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
          if (Math.random() < 0.3) petSpark(f.x, f.y, { color: `hsl(${Math.random() * 360}, 100%, 65%)`, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 120, life: 0.7, size: 2.5 });
          break;
        }
      }
      ctx.restore();
    }
  }

  // ⚡ Cyber mutation: blue lightning striking all over the park
  const cyberBolts = [];
  let cyberFlash = 0;
  // 🔮 Glass Storm: rainbow light beams sweep across the park and the ground twinkles
  function drawGlassStorm(time, share) {
    const k = Math.max(share, 0.5);
    ctx.save();
    for (let b = 0; b < 3; b++) {
      const sx = ((time * 120 + b * 700) % (world.width + 800)) - 400;
      const g = ctx.createLinearGradient(sx - 120, 0, sx + 120, 0);
      [0, 60, 130, 200, 280].forEach((h, i, a) => g.addColorStop(i / (a.length - 1), `hsla(${(h + time * 30) % 360}, 100%, 75%, 0)`));
      g.addColorStop(0.5, `hsla(${(b * 120 + time * 30) % 360}, 100%, 80%, ${0.16 * k})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - 60, 0); ctx.lineTo(sx + 60, 0); ctx.lineTo(sx + 260, world.height); ctx.lineTo(sx + 20, world.height);
      ctx.fill();
    }
    ctx.restore();
    if (Math.random() < 0.6 * k) star(Math.random() * world.width, Math.random() * world.height, 2 + Math.random() * 3, `hsl(${Math.random() * 360}, 100%, 88%)`);
    if (Math.random() < 0.03 * k) {
      const x2 = Math.random() * world.width, y2 = 200 + Math.random() * (world.height - 220);
      petSpark(x2, y2, { shape: 'ring', color: '#e7f5ff', vy: 0, life: 1, size: 16, grow: 200 });
      for (let i = 0; i < 12; i++) petSpark(x2, y2, { shape: 'shard', vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 240, life: 0.9, size: 3.5, hue: i * 30 });
    }
  }

  function drawCyberGrid(time, share) {
    const k = Math.max(share, 0.5);
    // a glowing hexagon wave slowly sweeping across the whole park
    const sweep = ((time * 160) % (world.width + 600)) - 300;
    for (let y = 30; y < world.height; y += 70) {
      for (let dx = -2; dx <= 2; dx++) {
        const hx = sweep + dx * 60 + ((y / 70) % 2) * 30;
        hexagon(hx, y, 26, 0, 1, (1 - Math.abs(dx) / 2.5) * 0.35 * k, true);
      }
    }
    // lightning strikes: big bolts from the sky with branches, a shockwave and sparks where they land
    if (Math.random() < 0.07 * k) {
      const x2 = Math.random() * world.width, y2 = 200 + Math.random() * (world.height - 220);
      cyberBolts.push({ x: x2 + (Math.random() - 0.5) * 200, y: -20, x2, y2, life: 0.4, big: Math.random() < 0.2 });
      if (cyberBolts[cyberBolts.length - 1].big) {
        cyberFlash = Math.max(cyberFlash, 0.12); // a soft flash (gentle and not too often, so it never strobes)
        petSpark(x2, y2, { shape: 'ring', color: CYAN, vy: 0, life: 1, size: 20, grow: 260 });
        for (let i = 0; i < 16; i++) petSpark(x2, y2, { shape: 'hex', color: i % 2 ? '#d9fdff' : CYAN, vx: (Math.random() - 0.5) * 320, vy: -Math.random() * 260, life: 0.9, size: 3 });
      }
    }
    for (let i = cyberBolts.length - 1; i >= 0; i--) {
      const bolt = cyberBolts[i];
      bolt.life -= 1 / 60;
      if (bolt.life <= 0) { cyberBolts.splice(i, 1); continue; }
      const w = bolt.big ? 3.2 : 2;
      glow(bolt.x2, bolt.y2, bolt.big ? 120 : 60, '46, 232, 255', 0.35);
      zap(bolt.x, bolt.y, bolt.x2, bolt.y2, 26, w);
      for (let b = 0; b < (bolt.big ? 3 : 1); b++) {
        const f = 0.3 + Math.random() * 0.5, mx = bolt.x + (bolt.x2 - bolt.x) * f, my = bolt.y + (bolt.y2 - bolt.y) * f;
        zap(mx, my, mx + (Math.random() - 0.5) * 140, my + 50 + Math.random() * 90, 12, w * 0.55); // branches
      }
    }
    // sparks crackling on the ground here and there
    if (Math.random() < 0.25 * k) {
      const sx = Math.random() * world.width, sy = Math.random() * world.height;
      zap(sx, sy, sx + (Math.random() - 0.5) * 50, sy + (Math.random() - 0.5) * 30, 6, 0.9);
    }
    if (cyberFlash > 0) {
      ctx.fillStyle = `rgba(160, 245, 255, ${cyberFlash})`;
      ctx.fillRect(0, 0, world.width, world.height);
      cyberFlash = Math.max(0, cyberFlash - 0.012);
    }
  }

  // Impossible mutation: the world glitches with soft colored bars (changes a few times a second, not flashing)
  function drawGlitch(time) {
    let seed = Math.floor(time * 4) * 9301;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let k = 0; k < 5; k++) {
      ctx.globalAlpha = 0.08 + rand() * 0.07;
      ctx.fillStyle = `hsl(${rand() * 360}, 100%, 55%)`;
      ctx.fillRect(0, rand() * world.height, world.width, 6 + rand() * 30);
    }
    ctx.globalAlpha = 1;
  }

  // ⛅ weather events (admins start them): each Mythic Beast has its own weather that covers everyone's screen
  const PET_WEATHER = {
    voidbear:    { name: '🌌 Void Storm',    tint: '30, 0, 60',    alpha: 0.22 },
    crystalfox:  { name: '💎 Crystal Breeze', tint: '200, 240, 255', alpha: 0.14 },
    solarlion:   { name: '☀️ Heat Wave',      tint: '255, 170, 40',  alpha: 0.13 },
    metalrhino:  { name: '⚙️ Iron Storm',     tint: '90, 100, 115',  alpha: 0.16 },
    galaxyshark: { name: '🌠 Starry Night',   tint: '20, 10, 70',    alpha: 0.3 },
    spirittiger: { name: '👻 Spirit Mist',    tint: '120, 230, 255', alpha: 0.14 },
    voidkraken:  { name: '🌊 Abyss Tide',     tint: '20, 0, 50',     alpha: 0.28 },
    cosmicstag:     { name: '🌙 Moonlit Night', tint: '25, 15, 70',   alpha: 0.3 },
    stormbison:     { name: '⛈️ Thunderstorm',  tint: '15, 20, 45',   alpha: 0.38 },
    ancientmammoth: { name: '🧊 Ice Age',       tint: '200, 235, 255', alpha: 0.22 },
    swampleviathan: { name: '☠️ Toxic Swamp',   tint: '40, 90, 20',   alpha: 0.26 },
  };
  const weatherParts = [];
  function drawPetWeather(time, dt) {
    const list = parkWeathers.filter(x => PET_WEATHER[x.id]);
    // bits from a weather that ended disappear with it
    for (let i = weatherParts.length - 1; i >= 0; i--) if (!list.some(x => x.id === weatherParts[i].w)) weatherParts.splice(i, 1);
    if (!list.length) return;
    const W = view.w, H = view.h, share = 1 / Math.sqrt(list.length);
    ctx.save();
    for (const { id } of list) drawOneWeather(id, time, dt, W, H, share);
    drawWeatherParts(time, dt, W, H);
    // the weather names under the top of the screen
    ctx.font = 'bold 13px Trebuchet MS'; ctx.textAlign = 'center';
    let label = list.map(x => `${PET_WEATHER[x.id].name} ${clock(x.left)}`).join('  ·  ');
    // too many to fit: just the emojis
    if (ctx.measureText(label).width > W - 40) label = `⛅ ${list.length} weathers: ${list.map(x => PET_WEATHER[x.id].name.split(' ')[0]).join(' ')} · ${clock(Math.max(...list.map(x => x.left)))}`;
    const lw = ctx.measureText(label).width + 20, ly = activeMuts().length ? 48 : 10;
    ctx.fillStyle = 'rgba(30, 15, 40, 0.6)'; roundRect(W / 2 - lw / 2, ly, lw, 22, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, W / 2, ly + 15);
    ctx.restore();
  }
  function drawOneWeather(id, time, dt, W, H, share) {
    const w = PET_WEATHER[id];
    const chance = k => Math.random() < dt * k * share, add = p => { if (weatherParts.length < 260) weatherParts.push({ t: 0, w: id, ...p }); };
    // the sky color, stronger at the edges
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, `rgba(${w.tint}, ${w.alpha * 0.5 * share})`); v.addColorStop(1, `rgba(${w.tint}, ${w.alpha * 1.6 * share})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    switch (id) {
      case 'voidbear': // void motes floating up, and purple cracks flashing at the edges
        if (chance(10)) add({ kind: 'mote', x: Math.random() * W, y: H + 10, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 40, life: 6, color: Math.random() < 0.5 ? '#da77f2' : '#000' });
        if (chance(0.5)) add({ kind: 'crack', x: Math.random() < 0.5 ? Math.random() * 120 : W - Math.random() * 120, y: Math.random() * H, life: 0.5, seed: Math.random() * 9 });
        break;
      case 'crystalfox': // crystal shards drifting sideways and glinting
        if (chance(10)) add({ kind: 'shard', x: Math.random() * W, y: Math.random() * H, vx: 50 + Math.random() * 60, vy: (Math.random() - 0.5) * 15, life: 20, hue: 185 + Math.random() * 25 });
        break;
      case 'solarlion': { // sun rays from the corner and heat shimmer
        ctx.save(); ctx.translate(W, 0);
        for (let k = 0; k < 7; k++) {
          const a = Math.PI * 0.55 + k * 0.12 + Math.sin(time * 0.5 + k) * 0.02;
          const g = ctx.createLinearGradient(0, 0, Math.cos(a) * H * 1.2, Math.sin(a) * H * 1.2);
          g.addColorStop(0, 'rgba(255, 230, 120, 0.28)'); g.addColorStop(1, 'rgba(255, 230, 120, 0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a - 0.04) * H * 1.2, Math.sin(a - 0.04) * H * 1.2); ctx.lineTo(Math.cos(a + 0.04) * H * 1.2, Math.sin(a + 0.04) * H * 1.2); ctx.fill();
        }
        ctx.restore();
        glow(W, 0, 160, '255, 220, 100', 0.5);
        if (chance(4)) add({ kind: 'heat', x: Math.random() * W, y: H * (0.4 + Math.random() * 0.6), life: 2.5 });
        break;
      }
      case 'metalrhino': // metal sparks flying across, and spinning gears in the corners
        if (chance(12)) add({ kind: 'spark', x: -10, y: Math.random() * H, vx: 250 + Math.random() * 200, vy: (Math.random() - 0.5) * 60, life: 4 });
        for (const [gx, gy, r0, dir] of [[0, H, 70, 1], [W, H, 50, -1]]) {
          ctx.save(); ctx.translate(gx, gy); ctx.rotate(time * 0.6 * dir); ctx.fillStyle = 'rgba(134, 142, 150, 0.45)';
          ctx.beginPath();
          for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, rr = k % 2 ? r0 : r0 * 1.18; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          ctx.fill(); ctx.restore();
        }
        break;
      case 'galaxyshark': // twinkling stars all over and shooting stars
        if (chance(14)) add({ kind: 'twinkle', x: Math.random() * W, y: Math.random() * H, life: 2 });
        if (chance(0.6)) add({ kind: 'shoot', x: Math.random() * W * 0.7, y: Math.random() * H * 0.4, life: 0.9 });
        break;
      case 'spirittiger': // ghostly mist rolling and spirit wisps rising
        if (chance(1.2)) add({ kind: 'mist', x: -150, y: Math.random() * H, vx: 40 + Math.random() * 30, life: 14, size: 80 + Math.random() * 80 });
        if (chance(7)) add({ kind: 'wisp', x: Math.random() * W, y: H + 10, vx: 0, vy: -40 - Math.random() * 30, life: 8 });
        break;
      case 'voidkraken': // rising bubbles and big tentacle shadows waving from the bottom
        if (chance(10)) add({ kind: 'bubble', x: Math.random() * W, y: H + 10, vx: 0, vy: -50 - Math.random() * 50, life: 10, size: 2 + Math.random() * 6 });
        ctx.fillStyle = 'rgba(40, 0, 70, 0.4)';
        for (let k = 0; k < 4; k++) {
          const bx = W * (0.1 + k * 0.27), sw = Math.sin(time * 1.2 + k * 1.7) * 40;
          ctx.beginPath(); ctx.moveTo(bx - 25, H);
          ctx.quadraticCurveTo(bx + sw, H - 110, bx + sw * 1.6, H - 170 - k * 10);
          ctx.quadraticCurveTo(bx + sw + 8, H - 100, bx + 25, H); ctx.fill();
        }
        break;
      case 'stormbison': { // dark storm clouds, lightning bolts striking and wind streaks (no rain)
        ctx.fillStyle = 'rgba(33, 37, 41, 0.55)';
        for (let k = 0; k < 9; k++) { const cx = ((k * 140 + time * 18) % (W + 200)) - 100; ctx.beginPath(); ctx.arc(cx, 10 + (k % 3) * 14, 60, 0, Math.PI * 2); ctx.fill(); }
        if (chance(0.8)) add({ kind: 'bolt', x: Math.random() * W, y: H * (0.4 + Math.random() * 0.5), life: 0.35 });
        if (chance(5)) add({ kind: 'wind', x: -150, y: Math.random() * H, vx: 600 + Math.random() * 300, life: 2 });
        break;
      }
      case 'ancientmammoth': { // frost creeping in, icicles hanging from the top, aurora ribbons and cold mist
        for (let b = 0; b < 3; b++) {
          ctx.strokeStyle = `hsla(${150 + b * 40}, 100%, 70%, 0.3)`; ctx.lineWidth = 22;
          ctx.beginPath(); for (let x = 0; x <= W; x += 30) ctx.lineTo(x, 60 + b * 26 + Math.sin(x / 120 + time * 0.8 + b) * 18); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(231, 245, 255, 0.85)';
        for (let x = 10; x < W; x += 34) { const h = 18 + ((x * 7) % 26); ctx.beginPath(); ctx.moveTo(x - 7, 0); ctx.lineTo(x, h); ctx.lineTo(x + 7, 0); ctx.fill(); }
        if (chance(1)) add({ kind: 'mist', x: -150, y: Math.random() * H, vx: 40 + Math.random() * 30, life: 14, size: 80 + Math.random() * 80 });
        if (chance(3)) add({ kind: 'twinkle', x: Math.random() * W, y: Math.random() * H, life: 1.5 });
        break;
      }
      case 'swampleviathan': { // green fog rolling, toxic bubbles rising from the bottom and glowing swamp lights
        if (chance(1.5)) add({ kind: 'fog', x: -200, y: H * (0.3 + Math.random() * 0.7), vx: 30 + Math.random() * 30, life: 16, size: 100 + Math.random() * 90 });
        if (chance(9)) add({ kind: 'bubble', x: Math.random() * W, y: H + 10, vx: 0, vy: -40 - Math.random() * 40, life: 10, size: 2 + Math.random() * 6, color: 'rgba(182, 255, 63, 0.7)' });
        if (chance(3)) add({ kind: 'swamplight', x: Math.random() * W, y: H * (0.3 + Math.random() * 0.7), life: 3 });
        break;
      }
      case 'cosmicstag': { // a huge glowing moon, paper lanterns floating up and foxfire
        const mx = W * 0.82, my = H * 0.16;
        glow(mx, my, 150, '255, 243, 191', 0.45);
        ctx.fillStyle = 'rgba(255, 249, 219, 0.9)'; ctx.beginPath(); ctx.arc(mx, my, 42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(230, 220, 180, 0.6)';
        for (const [dx, dy, rr] of [[-12, -8, 8], [10, 12, 6], [14, -14, 4]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, rr, 0, Math.PI * 2); ctx.fill(); }
        if (chance(1.5)) add({ kind: 'lantern', x: Math.random() * W, y: H + 20, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 20, life: 25 });
        if (chance(4)) add({ kind: 'foxfire', x: Math.random() * W, y: Math.random() * H, life: 2.5 });
        break;
      }
    }
  }
  function drawWeatherParts(time, dt, W, H) {
    for (let i = weatherParts.length - 1; i >= 0; i--) {
      const p = weatherParts[i];
      p.t += dt;
      if (p.vx) p.x += p.vx * dt;
      if (p.vy) p.y += p.vy * dt;
      if (p.t >= p.life || p.x > W + 200 || p.y < -40) { weatherParts.splice(i, 1); continue; }
      const a = Math.min(1, p.t * 2, (p.life - p.t) * 2);
      ctx.globalAlpha = a;
      switch (p.kind) {
        case 'mote': ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x + Math.sin(time + i) * 6, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
          if (p.color !== '#000') glow(p.x, p.y, 8, '218, 119, 242', 0.5); break;
        case 'crack': {
          ctx.strokeStyle = '#e599f7'; ctx.lineWidth = 2; ctx.shadowColor = '#be4bdb'; ctx.shadowBlur = 10;
          let x = p.x, y = p.y; ctx.beginPath(); ctx.moveTo(x, y);
          for (let k = 0; k < 5; k++) { x += Math.sin(p.seed + k * 2) * 25; y += 18; ctx.lineTo(x, y); }
          ctx.stroke(); ctx.shadowBlur = 0; break;
        }
        case 'shard': glassShard(p.x, p.y + Math.sin(time * 2 + i) * 8, 6, time * 2 + i, p.hue, 0.9);
          if (Math.sin(time * 5 + i) > 0.9) star(p.x, p.y, 6, '#ffffff'); break;
        case 'heat': {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'; ctx.lineWidth = 2; ctx.beginPath();
          for (let k = 0; k <= 8; k++) ctx.lineTo(p.x + k * 8, p.y - p.t * 20 + Math.sin(time * 8 + k) * 3);
          ctx.stroke(); break;
        }
        case 'spark': ctx.strokeStyle = Math.random() < 0.5 ? '#ffd43b' : '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke(); break;
        case 'twinkle': star(p.x, p.y, 2 + 3 * Math.sin(p.t / p.life * Math.PI), Math.random() < 0.1 ? '#ffd43b' : '#ffffff'); break;
        case 'shoot': {
          const x = p.x + p.t * 600, y = p.y + p.t * 260;
          const g = ctx.createLinearGradient(x, y, x - 110, y - 48);
          g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(177, 151, 250, 0)');
          ctx.strokeStyle = g; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 110, y - 48); ctx.stroke();
          star(x, y, 4, '#fff'); break;
        }
        case 'mist': {
          ctx.globalAlpha = a * 0.3;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, '#e3fafc'); g.addColorStop(1, 'rgba(227, 250, 252, 0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); break;
        }
        case 'wisp': glow(p.x + Math.sin(time * 2 + i) * 12, p.y, 12, '120, 240, 255', 0.8);
          ctx.fillStyle = '#e3fafc'; ctx.beginPath(); ctx.arc(p.x + Math.sin(time * 2 + i) * 12, p.y, 2.5, 0, Math.PI * 2); ctx.fill(); break;
        case 'bolt': { // a lightning strike from the sky with a flash
          let bx = p.x + (Math.random() - 0.5) * 30, by = -10;
          ctx.strokeStyle = '#e7f5ff'; ctx.lineWidth = 3; ctx.shadowColor = '#74c0fc'; ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.moveTo(bx, by);
          while (by < p.y) { bx += (Math.random() - 0.5) * 50; by += 30 + Math.random() * 30; ctx.lineTo(bx, Math.min(by, p.y)); }
          ctx.stroke(); ctx.shadowBlur = 0;
          ctx.fillStyle = `rgba(200, 220, 255, ${0.12 * a})`; ctx.fillRect(0, 0, W, H);
          break;
        }
        case 'wind': ctx.strokeStyle = 'rgba(222, 226, 230, 0.5)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 120, p.y + 6); ctx.stroke(); break;
        case 'fog': {
          ctx.globalAlpha = a * 0.35;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, '#94d82d'); g.addColorStop(1, 'rgba(148, 216, 45, 0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); break;
        }
        case 'swamplight': glow(p.x + Math.sin(time * 2 + i) * 10, p.y, 12, '180, 255, 80', 0.8 * Math.sin(p.t / p.life * Math.PI)); break;
        case 'bubble': ctx.strokeStyle = p.color || 'rgba(165, 216, 255, 0.7)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p.x + Math.sin(time * 2 + i) * 5, p.y, p.size, 0, Math.PI * 2); ctx.stroke(); break;
        case 'lantern': { // a glowing paper lantern drifting up
          const x = p.x + Math.sin(time + i) * 10;
          glow(x, p.y, 26, '255, 160, 60', 0.6);
          ctx.fillStyle = '#ff8c42'; ctx.beginPath(); ctx.ellipse(x, p.y, 8, 11, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffd8a8'; ctx.beginPath(); ctx.ellipse(x, p.y, 4, 8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#5c2a00'; ctx.fillRect(x - 5, p.y - 12, 10, 2); ctx.fillRect(x - 5, p.y + 10, 10, 2);
          break;
        }
        case 'foxfire': glow(p.x, p.y, 14, Math.random() < 0.5 ? '116, 192, 252' : '177, 151, 250', 0.7 * Math.sin(p.t / p.life * Math.PI)); break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // the mutation banner stays at the top of the screen (screen coordinates)
  function drawEventBanner(time) {
    const muts = activeMuts();
    const m = muts[0];
    if (!m) return;
    const text = muts.length > 1
      ? `${muts.map(x => `${x.emoji} ${x.name.toUpperCase()}`).join(' + ')} · ${clock(gameEvent.left)}`
      : `${m.emoji} ${m.name.toUpperCase()} MUTATION · x${m.mult} · ${clock(gameEvent.left)}`;
    ctx.font = 'bold 16px Trebuchet MS';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 30;
    ctx.fillStyle = 'rgba(30, 15, 25, 0.75)';
    roundRect(view.w / 2 - w / 2, 8, w, 32, 12); ctx.fill();
    ctx.strokeStyle = mutScoopColor(m, time); ctx.lineWidth = 3; ctx.stroke();
    if (muts.some(x => x.id === 'impossible')) {
      // glitchy text
      const j = Math.sin(time * 20) * 1.5;
      ctx.fillStyle = 'rgba(0,255,255,0.8)'; ctx.fillText(text, view.w / 2 - 2 + j, 30);
      ctx.fillStyle = 'rgba(255,0,255,0.8)'; ctx.fillText(text, view.w / 2 + 2 - j, 30);
    }
    ctx.fillStyle = '#fff';
    ctx.fillText(text, view.w / 2, 30);
  }

  // Rainbow mutation: warm sunlight and a big rainbow across the park
  function drawRainbowSky(time) {
    const sun = ctx.createRadialGradient(world.width * 0.9, -40, 20, world.width * 0.9, -40, 700);
    sun.addColorStop(0, 'rgba(255, 244, 200, 0.45)');
    sun.addColorStop(1, 'rgba(255, 244, 200, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, world.width, world.height);

    const fade = Math.min(1, (300 - gameEvent.left) / 4 + 0.15, gameEvent.left / 4); // fade in and out
    const shimmer = 0.03 * Math.sin(time * 0.8);
    drawRainbowArc(world.width / 2, world.height + 120, world.width * 0.62, 150, (0.34 + shimmer) * fade);
    drawRainbowArc(world.width / 2, world.height + 120, world.width * 0.62 + 190, 100, (0.12 + shimmer / 2) * fade); // faint double rainbow
  }

  let last = performance.now();
  // draw every frame; if something goes wrong in one frame, the game keeps going instead of freezing
  let frameErrors = 0;
  function frame(now) {
    try {
      drawFrame(now);
    } catch (e) {
      if (frameErrors++ < 3) console.error('Drawing problem (the game keeps going):', e);
      last = now;
      if (ctx.reset) ctx.reset(); else ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    requestAnimationFrame(frame);
  }
  function drawFrame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    nowSec = time;

    updatePlayer(dt);
    updateCamera(dt);
    if (tour.on) placeTour();

    ctx.fillStyle = '#6fb34c';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.beginPath(); ctx.rect(0, 0, world.width, world.height); ctx.clip();

    drawPark(time);
    const ids = gameEvent.ids || [];
    if (ids.includes('rainbow')) drawRainbowSky(time); // behind everything, like a real rainbow
    drawShop(time);
    drawAvatarShop(time);
    drawPetShop(time);
    drawSellShop(time);
    if (xmasIsOn()) drawChristmasPark(time);
    const used = new Set(stands.map(s => s.slot));
    slots.forEach((slot, i) => { if (!used.has(i)) drawEmptySlot(slot); });
    for (const s of stands) drawStand(s, time);
    for (const s of stands) drawChest(s, time);

    // smooth customers and other players toward their latest server position
    const k = Math.min(1, dt * 10);
    const entities = [];
    for (const c of customers.values()) {
      c.dx += (c.x - c.dx) * k; c.dy += (c.y - c.dy) * k;
      entities.push({ y: c.dy, draw: () => drawCustomer(c, time) });
    }
    for (const s of stands) {
      if (s.id === myId) {
        if (!player.placed) continue;
        const p = { x: player.x, y: player.y, facing: player.facing, moving: player.moving,
          color: s.color, name: s.name, item: heldItem(), isMe: true, admin: s.admin, avatar: s.avatar };
        entities.push({ y: p.y, draw: () => drawPlayer(p, time) });
        continue;
      }
      let o = others.get(s.id);
      if (!o) { o = { x: s.x, y: s.y, facing: 1 }; others.set(s.id, o); }
      const nx = o.x + (s.x - o.x) * k;
      o.moving = Math.abs(nx - o.x) + Math.abs(s.y - o.y) > 0.5;
      if (Math.abs(nx - o.x) > 0.3) o.facing = nx > o.x ? 1 : -1;
      o.x = nx; o.y += (s.y - o.y) * k;
      const p = { ...o, color: s.color, name: s.name, item: s.hand >= 0 ? s.hotbar[s.hand] : null, admin: s.admin, avatar: s.avatar };
      entities.push({ y: o.y, draw: () => drawPlayer(p, time) });
    }
    // your pets follow you in a little line
    const shown = new Set();
    for (const s of stands) {
      const owner = s.id === myId ? (player.placed ? player : null) : others.get(s.id);
      if (!owner) continue;
      let lead = owner;
      (s.worn || []).forEach((id, k) => {
        const pet = petById[id];
        if (!pet) return;
        const key = s.id + ':' + k;
        let pp = petPos.get(key);
        // the first pet follows you, the next one follows that pet, and so on (big pets keep more space)
        const gap = (k ? 30 : 24) + 16 * (PET_SIZE[pet.id] || 1);
        const tx = lead.x - (owner.facing || 1) * gap, ty = lead.y + (k ? 2 : 8);
        if (!pp) { pp = { x: tx, y: ty, facing: 1, turn: 1, speed: 0, step: 0, still: 0, chasing: false }; petPos.set(key, pp); }
        const dx = tx - pp.x, dy = ty - pp.y, d = Math.hypot(dx, dy);
        // like a real pet: it waits when it's close, then trots to catch up (faster when far behind)
        if (d > 45) pp.chasing = true;
        else if (d < 8) pp.chasing = false;
        const want = pp.chasing ? Math.min(420, Math.max(70, d * 3.5)) : 0;
        pp.speed += (want - pp.speed) * Math.min(1, dt * 6);
        if (d > 0.5 && pp.speed > 1) {
          const stepLen = Math.min(d, pp.speed * dt);
          pp.x += dx / d * stepLen; pp.y += dy / d * stepLen;
        }
        if (d > 600) { pp.x = tx; pp.y = ty; } // teleported (new round, far away): jump along
        pp.moving = pp.speed > 25;
        pp.step += dt * Math.min(pp.speed, 300) / 45;
        if (pp.moving) {
          pp.still = 0;
          if (Math.abs(dx) > 4) pp.facing = dx > 0 ? 1 : -1;
        } else {
          pp.still += dt;
          // waiting: look at its owner, and look around now and then
          if (Math.abs(owner.x - pp.x) > 6) pp.facing = owner.x > pp.x ? 1 : -1;
          if (pp.still > 2 && (time + s.id * 1.7 + k * 2.3) % 6 < 0.9) pp.facing = -pp.facing;
        }
        pp.turn += (pp.facing - pp.turn) * Math.min(1, dt * 9);
        shown.add(key);
        entities.push({ y: pp.y - 1, draw: () => drawPet(pet, pp, time, dt, s.id + k * 7) });
        lead = pp;
      });
    }
    for (const key of petPos.keys()) if (!shown.has(key)) petPos.delete(key);
    entities.sort((a, b) => a.y - b.y);
    for (const e of entities) e.draw();

    // where you're walking to
    if (walkTarget && !walkTarget.action) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(walkTarget.x, walkTarget.y, 12, 5, 0, 0, Math.PI * 2); ctx.stroke();
    }

    drawPetParticles(dt);
    drawEventEffects(time, dt);
    if (tut.step >= 0) { updateTutorial(); drawTutorialArrow(time); }

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
      } else ctx.fillStyle = f.mutation ? mutScoopColor(f.mutation, time) : f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 40);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
    drawPetWeather(time, dt);
    drawEventBanner(time);
    drawAvatarPreview(time);
  }
  requestAnimationFrame(frame);
  window.__icecream = { view, player, home: () => myStandPos(), send, // for automated tests
    drawPetModel(id, canvasEl, time = 0.6) { // draws one low-poly pet big, to check how it looks
      const saved = ctx; ctx = canvasEl.getContext('2d');
      ctx.translate(canvasEl.width / 2, canvasEl.height * 0.78); ctx.scale(canvasEl.width / 48, canvasEl.width / 48);
      PET_MODELS[id](time, 0, false); ctx = saved;
    } }; // for automated tests
})();
