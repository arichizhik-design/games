'use strict';
// Blocky Rivals: a first-person arena shooter with blocky avatars.
// Sizes are in "studs" like Roblox: a character is about 5.2 studs tall.

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

// ---------- weapons ----------
// dmg per bullet, head = headshot multiplier, rate = seconds between shots, spread/ads in radians,
// zoom = how much aiming zooms, eff = range where bots still hit well, pref = distance bots like to fight at
const WEAPONS = {
  ar:       { name: 'Assault Rifle', short: 'AR', type: 'gun', dmg: 20, head: 1.5, rate: 0.1, mag: 30, reload: 2.0, auto: true,
              spread: 0.02, ads: 0.004, zoom: 1.35, recoil: 0.011, range: 300, fall: [90, 0.7], eff: 70, pref: 35,
              snd: { f: 2600, d: 0.12, t: 140 }, desc: 'Full auto. Good at every range.' },
  burst:    { name: 'Burst Rifle', short: 'BURST', type: 'gun', dmg: 24, head: 1.5, rate: 0.42, burst: 3, burstGap: 0.07, mag: 24,
              reload: 2.1, spread: 0.014, ads: 0.002, zoom: 1.45, recoil: 0.009, range: 300, fall: [110, 0.75], eff: 85, pref: 40,
              snd: { f: 3200, d: 0.1, t: 180 }, desc: '3 bullets every click. Very accurate.' },
  shotgun:  { name: 'Shotgun', short: 'SHOTGUN', type: 'gun', dmg: 11, pellets: 9, head: 1.3, rate: 0.85, mag: 6, reload: 2.4,
              spread: 0.075, ads: 0.055, zoom: 1.15, recoil: 0.05, range: 120, fall: [18, 0.3], eff: 18, pref: 9, speed: 1.05,
              snd: { f: 1500, d: 0.35, t: 90 }, desc: 'Huge damage up close.' },
  sniper:   { name: 'Sniper', short: 'SNIPER', type: 'gun', dmg: 90, head: 2.0, rate: 1.4, mag: 5, reload: 2.8,
              spread: 0.08, ads: 0, zoom: 4, scope: true, recoil: 0.07, range: 600, eff: 250, pref: 70, speed: 0.9,
              snd: { f: 1800, d: 0.5, t: 70 }, desc: 'Aim with right click. Headshots one-shot.' },
  crossbow: { name: 'Crossbow', short: 'CROSSBOW', type: 'gun', dmg: 80, head: 1.6, rate: 0.5, mag: 1, reload: 1.15,
              spread: 0.03, ads: 0, zoom: 2.4, scope: true, recoil: 0.03, range: 400, eff: 120, pref: 45, speed: 0.95,
              snd: { f: 900, d: 0.15, t: 320 }, desc: 'One bolt at a time. Headshots eliminate.' },
  handgun:  { name: 'Handgun', short: 'PISTOL', type: 'gun', pistol: true, dmg: 22, head: 1.6, rate: 0.16, mag: 12, reload: 1.3,
              spread: 0.012, ads: 0.004, zoom: 1.25, recoil: 0.02, range: 250, fall: [60, 0.7], eff: 45, pref: 25, speed: 1.08,
              snd: { f: 3000, d: 0.1, t: 200 }, desc: 'Quick and reliable backup.' },
  revolver: { name: 'Revolver', short: 'REVOLVER', type: 'gun', pistol: true, dmg: 48, head: 1.6, rate: 0.5, mag: 6, reload: 2.2,
              spread: 0.01, ads: 0.002, zoom: 1.3, recoil: 0.055, range: 300, fall: [80, 0.75], eff: 60, pref: 30, speed: 1.05,
              snd: { f: 2000, d: 0.25, t: 110 }, desc: 'Slow but hits really hard.' },
  uzi:      { name: 'Uzi', short: 'UZI', type: 'gun', pistol: true, dmg: 13, head: 1.4, rate: 0.06, mag: 30, reload: 1.6, auto: true,
              spread: 0.035, ads: 0.02, zoom: 1.15, recoil: 0.008, range: 200, fall: [40, 0.6], eff: 35, pref: 15, speed: 1.1,
              snd: { f: 3500, d: 0.07, t: 220 }, desc: 'Sprays bullets super fast.' },
  shorty:   { name: 'Shorty', short: 'SHORTY', type: 'gun', pistol: true, dmg: 10, pellets: 8, head: 1.3, rate: 0.28, mag: 2, reload: 1.7,
              spread: 0.09, ads: 0.07, zoom: 1.1, recoil: 0.06, range: 90, fall: [14, 0.25], eff: 14, pref: 8, speed: 1.08,
              snd: { f: 1300, d: 0.3, t: 80 }, desc: 'Tiny double barrel. Two huge blasts up close.' },
  katana:   { name: 'Katana', short: 'KATANA', type: 'melee', dmg: 55, rate: 0.6, reach: 7, speed: 1.15, desc: 'Two slashes eliminate. Fast to run with.' },
  knife:    { name: 'Knife', short: 'KNIFE', type: 'melee', dmg: 40, rate: 0.35, reach: 5.5, speed: 1.22, desc: 'Fastest swings and fastest running.' },
  grenade:  { name: 'Grenade', short: 'GRENADE', type: 'grenade', count: 2, rate: 0.8, desc: 'Throw it and it explodes after 2 seconds.' },
  medkit:   { name: 'Medkit', short: 'MEDKIT', type: 'medkit', count: 1, rate: 1, desc: 'Heals 50 health. Takes 1 second.' },
  jumppad:  { name: 'Jump Pad', short: 'JUMP PAD', type: 'pad', count: 2, rate: 0.8, desc: 'Throw it down, step on it and fly way up high.' },
};
const SLOTS = [
  { key: 'primary', label: 'Primary', list: ['ar', 'burst', 'shotgun', 'sniper', 'crossbow'] },
  { key: 'secondary', label: 'Secondary', list: ['handgun', 'revolver', 'uzi', 'shorty'] },
  { key: 'melee', label: 'Melee', list: ['katana', 'knife'] },
  { key: 'utility', label: 'Utility', list: ['grenade', 'medkit', 'jumppad'] },
];
const BOT_GUNS = ['ar', 'ar', 'burst', 'shotgun', 'sniper', 'handgun', 'revolver', 'uzi', 'shorty', 'crossbow'];
const DIFF = {
  easy:   { acc: 0.3,  react: 0.75, head: 0.08, turn: 4,  strafe: 0.5, fireMul: 1.4 },
  normal: { acc: 0.46, react: 0.45, head: 0.15, turn: 7,  strafe: 0.8, fireMul: 1.12 },
  hard:   { acc: 0.64, react: 0.26, head: 0.24, turn: 11, strafe: 1,   fireMul: 1 },
};
const BOT_NAMES = ['BaconHair99', 'Noob_Slayer', 'xX_Sn1per_Xx', 'Guest_1337', 'PizzaKnight', 'BlockyBoi', 'ObbyKing',
  'TurboTaco', 'Builderman_Jr', 'CoolKid2012', 'LavaJumper', 'StudMuffin'];

// ---------- avatar options ----------
const SKINS = ['#f5cd30', '#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#a3e36b'];
const CLOTHES = ['#2f6fdf', '#e53b3b', '#2d8a3e', '#111418', '#f2f2f2', '#ff8a1f', '#8e44ad', '#ff6fb5', '#1abc9c', '#f1c40f', '#6b4f2d', '#7f8c8d'];
const HAIR_COLORS = ['#5a3a1e', '#1b1b1b', '#e8c25a', '#b5502b', '#e53b3b', '#2f6fdf', '#8e44ad', '#f2f2f2'];
const HAIRS = { none: 'None', bacon: 'Bacon hair', spiky: 'Spiky', long: 'Long hair', cap: 'Cap', beanie: 'Beanie',
  cowboy: 'Cowboy hat', crown: 'Crown', headphones: 'Headphones', ninja: 'Ninja band' };
const FACES = { smile: 'Smile', grin: 'Grin', cool: 'Shades', angry: 'Angry', wink: 'Wink', chill: 'Chill' };
const DEFAULT_LOOK = { skin: '#f5cd30', shirt: '#2f6fdf', pants: '#2d8a3e', sleeves: 'tee', hair: 'bacon', hairColor: '#5a3a1e', face: 'smile' };
const NOOB_LOOK = { skin: '#f5cd30', shirt: '#2f6fdf', pants: '#2d8a3e', sleeves: 'none', hair: 'none', hairColor: '#5a3a1e', face: 'smile' };
function randomLook() {
  return { skin: pick(SKINS.slice(0, 7)), shirt: pick(CLOTHES), pants: pick(CLOTHES), sleeves: pick(['tee', 'long', 'long']),
    hair: pick(Object.keys(HAIRS)), hairColor: pick(HAIR_COLORS), face: pick(Object.keys(FACES)) };
}

// ---------- weapon skins (wraps) and charms ----------
const RARITY = {
  common:    { name: 'Common', color: '#b7c3cc', weight: 45 },
  rare:      { name: 'Rare', color: '#4aa3ff', weight: 30 },
  epic:      { name: 'Epic', color: '#b45cff', weight: 17 },
  legendary: { name: 'Legendary', color: '#ffc93c', weight: 8 },
};
const WRAPS = {
  default:   { name: 'Default', rarity: 'common' },
  camo:      { name: 'Camo', rarity: 'common' },
  bubblegum: { name: 'Bubblegum', rarity: 'common' },
  ice:       { name: 'Ice', rarity: 'rare' },
  midnight:  { name: 'Midnight', rarity: 'rare' },
  lava:      { name: 'Lava', rarity: 'epic' },
  toxic:     { name: 'Toxic', rarity: 'epic' },
  gold:      { name: 'Gold', rarity: 'legendary' },
  galaxy:    { name: 'Galaxy', rarity: 'legendary' },
  inferno:   { name: 'Inferno', rarity: 'legendary' },
};
const CHARMS = {
  none:    { name: 'No charm', rarity: 'common' },
  pin:     { name: 'Bowling Pin', rarity: 'common' },
  duck:    { name: 'Rubber Duck', rarity: 'common' },
  heart:   { name: 'Heart', rarity: 'rare' },
  fire:    { name: 'Fire', rarity: 'rare' },
  skull:   { name: 'Skull', rarity: 'epic' },
  star:    { name: 'Star', rarity: 'epic' },
  diamond: { name: 'Diamond', rarity: 'legendary' },
};
const CASES = {
  wrap:  { name: 'Wrap Case', price: 150, items: WRAPS, kind: 'wraps', desc: 'A skin for your weapons: Galaxy, Lava, Gold and more.' },
  charm: { name: 'Charm Case', price: 100, items: CHARMS, kind: 'charms', desc: 'A little charm that hangs off your weapon.' },
};

// ---------- saved settings ----------
const save = { look: { ...DEFAULT_LOOK }, loadout: { primary: 'ar', secondary: 'handgun', melee: 'katana', utility: 'grenade' },
  sens: 1, diff: 'normal', mode: 'duel', autoShoot: true, coins: 300, owned: { wraps: ['default'], charms: ['none'] }, wraps: {}, charms: {} };
try {
  const s = JSON.parse(localStorage.getItem('blockyRivals') || 'null');
  if (s) {
    if (s.look) for (const k in DEFAULT_LOOK) if (typeof s.look[k] === 'string') save.look[k] = s.look[k];
    if (s.loadout) for (const sl of SLOTS) if (sl.list.includes(s.loadout[sl.key])) save.loadout[sl.key] = s.loadout[sl.key];
    if (s.sens >= 0.2 && s.sens <= 3) save.sens = s.sens;
    if (DIFF[s.diff]) save.diff = s.diff;
    if (typeof s.autoShoot === 'boolean') save.autoShoot = s.autoShoot;
    if (s.mode === 'duel' || s.mode === 'ffa') save.mode = s.mode;
    if (s.coins >= 0) save.coins = Math.floor(s.coins);
    if (s.owned) for (const k of ['wraps', 'charms']) if (Array.isArray(s.owned[k])) {
      const all = k === 'wraps' ? WRAPS : CHARMS;
      for (const id of s.owned[k]) if (all[id] && !save.owned[k].includes(id)) save.owned[k].push(id);
    }
    for (const k of ['wraps', 'charms']) if (s[k]) for (const w in s[k]) if (WEAPONS[w] && save.owned[k].includes(s[k][w])) save[k][w] = s[k][w];
  }
} catch (e) { /* no saved settings */ }
function addCoins(n) { save.coins += n; persist(); }
function persist() { try { localStorage.setItem('blockyRivals', JSON.stringify(save)); } catch (e) { /* storage blocked */ } }

// ---------- audio ----------
let actx = null, master = null, noiseBuf = null;
function ac() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = 0.45; master.connect(actx.destination);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { actx = null; return null; }
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function noise(dur, freq, vol, type = 'lowpass', q = 0.7, delay = 0) {
  const c = ac(); if (!c || vol < 0.005) return;
  const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.05);
}
function tone(freq, dur, vol, type = 'square', slide = 0, delay = 0) {
  const c = ac(); if (!c || vol < 0.005) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  shot(key, vol = 1) { const s = WEAPONS[key].snd; noise(s.d, s.f, 0.55 * vol); tone(s.t, 0.09, 0.3 * vol, 'sine', -s.t * 0.6); },
  empty() { tone(1100, 0.03, 0.08); },
  reload() { tone(320, 0.05, 0.1); tone(520, 0.05, 0.1, 'square', 0, 0.3); },
  hit(head) { if (head) tone(1500, 0.14, 0.16, 'sine'); else tone(750, 0.05, 0.1, 'triangle'); },
  kill() { tone(660, 0.1, 0.16); tone(990, 0.18, 0.16, 'square', 0, 0.09); },
  hurt() { noise(0.12, 500, 0.35); },
  boom(vol = 1) { noise(1, 380, 1.1 * vol); tone(70, 0.7, 0.6 * vol, 'sine', -45); },
  swing() { noise(0.16, 2800, 0.3, 'bandpass', 2); },
  beep(f) { tone(f, 0.16, 0.14); },
  heal() { tone(520, 0.15, 0.12, 'sine', 300); },
  boing() { tone(180, 0.35, 0.25, 'sine', 600); },
  tick() { tone(1200, 0.03, 0.06); },
  reveal(r) { const f = { common: 500, rare: 650, epic: 800, legendary: 1000 }[r]; tone(f, 0.15, 0.15); tone(f * 1.5, 0.3, 0.15, 'square', 0, 0.12); },
};

// ---------- renderer and scenes ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
$('game').appendChild(renderer.domElement);

const SKY = 0x9ad8ff;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 140, 340);
const camera = new THREE.PerspectiveCamera(80, 1, 0.05, 800);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6a7060, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(60, 110, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 10, far: 300 });
sun.shadow.bias = -0.0008;
scene.add(sun);

// the gun in your hands is drawn in its own pass so it never pokes through walls
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6a7060, 0.85));
const vmSun = new THREE.DirectionalLight(0xffffff, 0.7); vmSun.position.set(1, 3, 2); vmScene.add(vmSun);
const vmRoot = new THREE.Group(); vmScene.add(vmRoot);
const vmLight = new THREE.PointLight(0xffc060, 0, 6); vmScene.add(vmLight);

// menu preview: your avatar on a podium
const pScene = new THREE.Scene();
pScene.background = new THREE.Color(SKY);
const pCam = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
pScene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6a7060, 0.8));
const pSun = new THREE.DirectionalLight(0xffffff, 0.8); pSun.position.set(6, 12, 10); pSun.castShadow = true; pScene.add(pSun);
const podium = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.6, 40), new THREE.MeshLambertMaterial({ color: 0xff4d5a }));
podium.position.y = -0.3; podium.receiveShadow = true; pScene.add(podium);
const pFloor = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 0.2, 40), new THREE.MeshLambertMaterial({ color: 0x8fc8e8 }));
pFloor.position.y = -0.7; pScene.add(pFloor);
let pAvatar = null, pSpin = 0.5, pDrag = null, previewKey = null, pGun = null;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = vmCam.aspect = w / h; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
  const narrow = w <= 700;
  pCam.aspect = w / h;
  // keep the avatar in the space the menu panel doesn't cover
  pCam.setViewOffset(w, h, narrow ? 0 : -Math.min(220, w * 0.2), narrow ? h * 0.3 : 0, w, h);
  pCam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- textures and materials ----------
function makeTileTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; g.fillRect(Math.random() * 64, Math.random() * 64, 3, 3); }
  g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 61, 61);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const tileTex = makeTileTexture();
const tileMats = {}, plainMats = {};
const tileMat = c => tileMats[c] || (tileMats[c] = new THREE.MeshLambertMaterial({ color: c, map: tileTex }));
const lam = c => plainMats[c] || (plainMats[c] = new THREE.MeshLambertMaterial({ color: c }));

// a box whose texture repeats every 4 studs instead of stretching
function tiledBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] / 4, uv.getY(k) * dims[f][1] / 4);
  }
  return g;
}

// ---------- avatars ----------
function faceTexture(face, skin) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 128;
  const g = c.getContext('2d'), cx = 192;
  g.fillStyle = skin; g.fillRect(0, 0, 384, 128);
  g.fillStyle = g.strokeStyle = '#111'; g.lineWidth = 5; g.lineCap = 'round';
  const eye = (x, y) => { g.beginPath(); g.ellipse(x, y, 6, 11, 0, 0, Math.PI * 2); g.fill(); };
  const arc = (x, y, r, a, b) => { g.beginPath(); g.arc(x, y, r, a, b); g.stroke(); };
  switch (face) {
    case 'grin':
      eye(cx - 20, 50); eye(cx + 20, 50);
      g.beginPath(); g.moveTo(cx - 26, 70); g.arc(cx, 70, 26, 0, Math.PI); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.fillRect(cx - 20, 71, 40, 8);
      break;
    case 'cool':
      g.beginPath(); g.roundRect ? g.roundRect(cx - 44, 40, 38, 22, 6) : g.rect(cx - 44, 40, 38, 22); g.fill();
      g.beginPath(); g.roundRect ? g.roundRect(cx + 6, 40, 38, 22, 6) : g.rect(cx + 6, 40, 38, 22); g.fill();
      g.fillRect(cx - 8, 44, 16, 4);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(cx - 38, 44, 10, 4); g.fillRect(cx + 12, 44, 10, 4);
      arc(cx + 6, 70, 18, 0.25 * Math.PI, 0.75 * Math.PI);
      break;
    case 'angry':
      eye(cx - 20, 54); eye(cx + 20, 54);
      g.beginPath(); g.moveTo(cx - 36, 34); g.lineTo(cx - 10, 42); g.moveTo(cx + 36, 34); g.lineTo(cx + 10, 42); g.stroke();
      arc(cx, 98, 18, 1.2 * Math.PI, 1.8 * Math.PI);
      break;
    case 'wink':
      eye(cx - 20, 50); arc(cx + 20, 54, 9, 1.1 * Math.PI, 1.9 * Math.PI);
      arc(cx, 66, 24, 0.15 * Math.PI, 0.85 * Math.PI);
      break;
    case 'chill':
      arc(cx - 20, 56, 9, 1.1 * Math.PI, 1.9 * Math.PI); arc(cx + 20, 56, 9, 1.1 * Math.PI, 1.9 * Math.PI);
      arc(cx, 68, 16, 0.2 * Math.PI, 0.8 * Math.PI);
      break;
    default:
      eye(cx - 20, 50); eye(cx + 20, 50);
      arc(cx, 66, 24, 0.15 * Math.PI, 0.85 * Math.PI);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function addHair(head, look) {
  const hc = look.hairColor, m = lam(hc);
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true; head.add(mesh); return mesh;
  };
  const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
  switch (look.hair) {
    case 'bacon':
      add(cyl(0.66, 0.66, 0.32), m, 0, 1.12, -0.02);
      add(new THREE.BoxGeometry(1.24, 0.9, 0.34), m, 0, 0.82, -0.47);
      for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.34, 0.3, 0.3), m, i * 0.25, 1.06 + Math.abs(i) * -0.03, 0.47, rand(-0.4, 0.4), 0, rand(-0.5, 0.5));
      for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.32, 0.28, 0.32), m, rand(-0.45, 0.45), 1.3, rand(-0.45, 0.35), rand(0, 1), rand(0, 1), 0);
      break;
    case 'spiky':
      add(cyl(0.65, 0.65, 0.25), m, 0, 1.1, 0);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, r = i === 8 ? 0 : 0.38;
        add(new THREE.ConeGeometry(0.2, 0.6, 6), m, Math.sin(a) * r, 1.42, Math.cos(a) * r - 0.05, Math.cos(a) * r * 0.9, 0, -Math.sin(a) * r * 0.9);
      }
      break;
    case 'long':
      add(cyl(0.67, 0.67, 0.3), m, 0, 1.12, 0);
      add(new THREE.BoxGeometry(1.3, 1.7, 0.36), m, 0, 0.55, -0.5);
      add(new THREE.BoxGeometry(0.22, 1.2, 0.8), m, 0.6, 0.75, -0.15);
      add(new THREE.BoxGeometry(0.22, 1.2, 0.8), m, -0.6, 0.75, -0.15);
      add(new THREE.BoxGeometry(1.1, 0.22, 0.25), m, 0, 1.12, 0.5);
      break;
    case 'cap':
      add(cyl(0.63, 0.66, 0.4), m, 0, 1.12, 0);
      add(new THREE.BoxGeometry(0.95, 0.08, 0.62), m, 0, 0.98, 0.78);
      add(new THREE.SphereGeometry(0.08, 8, 6), lam('#ffffff'), 0, 1.33, 0);
      break;
    case 'beanie':
      add(cyl(0.6, 0.67, 0.6), m, 0, 1.08, 0);
      add(cyl(0.68, 0.68, 0.16), lam('#f2f2f2'), 0, 0.84, 0);
      add(new THREE.SphereGeometry(0.2, 10, 8), lam('#f2f2f2'), 0, 1.44, 0);
      break;
    case 'cowboy':
      add(cyl(1.2, 1.2, 0.08, 28), m, 0, 1.1, 0);
      add(cyl(0.5, 0.62, 0.6), m, 0, 1.42, 0);
      add(cyl(0.63, 0.63, 0.12), lam('#1b1b1b'), 0, 1.18, 0);
      break;
    case 'crown': {
      const gold = lam('#ffcc22');
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16, 1, true), gold, 0, 1.36, 0);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(new THREE.ConeGeometry(0.12, 0.3, 4), gold, Math.sin(a) * 0.47, 1.65, Math.cos(a) * 0.47); }
      add(new THREE.SphereGeometry(0.09, 8, 6), lam('#e53b3b'), 0, 1.38, 0.5);
      break;
    }
    case 'headphones':
      add(new THREE.TorusGeometry(0.7, 0.07, 6, 20, Math.PI), m, 0, 0.62, 0, 0, 0, 0);
      add(cyl(0.26, 0.26, 0.2), lam('#1b1b1b'), 0.68, 0.6, 0, 0, 0, Math.PI / 2);
      add(cyl(0.26, 0.26, 0.2), lam('#1b1b1b'), -0.68, 0.6, 0, 0, 0, Math.PI / 2);
      break;
    case 'ninja':
      add(cyl(0.635, 0.635, 0.22), m, 0, 0.92, 0);
      add(new THREE.BoxGeometry(0.12, 0.5, 0.12), m, 0.12, 0.7, -0.68, 0.5, 0, 0.3);
      add(new THREE.BoxGeometry(0.12, 0.5, 0.12), m, -0.1, 0.68, -0.68, 0.6, 0, -0.2);
      break;
  }
}

// Builds a blocky avatar with normal body proportions (head about the width of an arm-and-a-half, not a bobble head).
// The avatar faces +z. Its right side is -x.
function buildAvatar(look) {
  const skin = lam(look.skin), shirt = lam(look.shirt), pants = lam(look.pants);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const parts = [];
  const mk = (geo, mat, part, parent, y) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
    m.position.y = y; m.userData.part = part; parent.add(m); parts.push(m); return m;
  };
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.5 * side, 2.0, 0); body.add(hip);
    mk(new THREE.BoxGeometry(0.97, 1.05, 0.97), pants, 'body', hip, -0.525);
    const knee = new THREE.Group(); knee.position.y = -1.05; hip.add(knee);
    mk(new THREE.BoxGeometry(0.97, 0.95, 0.97), pants, 'body', knee, -0.475);
    legs.push({ hip, knee });
  }
  const torso = new THREE.Group(); torso.position.y = 2.0; body.add(torso);
  mk(new THREE.BoxGeometry(2, 0.36, 1), pants, 'body', torso, 0.18);
  mk(new THREE.BoxGeometry(2, 1.64, 1), shirt, 'body', torso, 1.18);
  const arms = [];
  const sleeveLower = look.sleeves === 'long' ? shirt : skin, sleeveUpper = look.sleeves === 'none' ? skin : shirt;
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(1.5 * side, 1.85, 0); torso.add(shoulder);
    mk(new THREE.BoxGeometry(0.96, 1.0, 0.96), sleeveUpper, 'body', shoulder, -0.35);
    const elbow = new THREE.Group(); elbow.position.y = -0.85; shoulder.add(elbow);
    mk(new THREE.BoxGeometry(0.94, 0.75, 0.94), sleeveLower, 'body', elbow, -0.375);
    const hand = new THREE.Group(); hand.position.y = -0.75; elbow.add(hand);
    mk(new THREE.BoxGeometry(0.9, 0.32, 0.9), skin, 'body', hand, -0.16);
    arms.push({ shoulder, elbow, hand });
  }
  const neck = new THREE.Group(); neck.position.y = 2.0; torso.add(neck);
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(look.face, look.skin) });
  const headGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.2, 28, 1, false, -Math.PI, Math.PI * 2);
  mk(headGeo, [faceMat, skin, skin], 'head', neck, 0.62);
  addHair(neck, look);
  return { root, body, torso, legs, arms, neck, parts, gun: null, gunKey: null };
}

// hold: 'rifle' | 'pistol' | 'melee' | 'throw' | 'none'
function poseAvatar(av, o) {
  const s = Math.sin(o.phase), amp = 0.85 * o.move;
  const [r, l] = av.arms;
  if (o.air) {
    av.legs[0].hip.rotation.x = -0.45; av.legs[0].knee.rotation.x = 0.7;
    av.legs[1].hip.rotation.x = 0.25; av.legs[1].knee.rotation.x = 0.35;
  } else {
    av.legs[0].hip.rotation.x = s * amp; av.legs[1].hip.rotation.x = -s * amp;
    av.legs[0].knee.rotation.x = Math.max(0, s) * amp * 1.1; av.legs[1].knee.rotation.x = Math.max(0, -s) * amp * 1.1;
  }
  av.body.position.y = Math.abs(Math.cos(o.phase)) * 0.12 * o.move;
  const p = o.pitch || 0, kick = o.kick || 0;
  r.elbow.rotation.set(0, 0, 0); l.elbow.rotation.set(0, 0, 0);
  if (o.hold === 'rifle') {
    r.shoulder.rotation.set(-Math.PI / 2 - p + kick, 0, 0.12);
    l.shoulder.rotation.set(-Math.PI / 2 - p + 0.15 + kick, 0, -0.62);
  } else if (o.hold === 'pistol') {
    r.shoulder.rotation.set(-Math.PI / 2 - p + kick, 0, 0.32);
    l.shoulder.rotation.set(-Math.PI / 2 - p + kick, 0, -0.32);
  } else if (o.hold === 'melee') {
    const sw = o.swing || 0; // 1 → 0 during a swing
    r.shoulder.rotation.set(-1.0 - p * 0.5 - Math.sin(sw * Math.PI) * 1.4, 0, 0.15 + sw * 0.5);
    r.elbow.rotation.x = -0.5;
    l.shoulder.rotation.set(s * amp * 0.7, 0, -0.08);
  } else {
    r.shoulder.rotation.set(-s * amp * 0.8, 0, 0.08);
    l.shoulder.rotation.set(s * amp * 0.8, 0, -0.08);
  }
  av.neck.rotation.x = -p * 0.55;
  av.torso.rotation.x = -p * 0.12;
}

// ---------- gun models (grip at the origin, barrel pointing +z) ----------
// skins are drawn on a canvas once, then shared by every weapon that wears them
const wrapMats = {};
function wrapMaterial(id) {
  if (!id || id === 'default' || !WRAPS[id]) return null;
  if (wrapMats[id]) return wrapMats[id];
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  const dots = (n, col, max) => { for (let i = 0; i < n; i++) { g.fillStyle = col; const r = Math.random() * max; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, r, 0, 7); g.fill(); } };
  let glow = 0;
  switch (id) {
    case 'galaxy':
      g.fillStyle = '#1a0b4a'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 14; i++) blob(rand(0, 256), rand(0, 256), rand(40, 110), pick(['rgba(140,60,255,.7)', 'rgba(60,90,255,.7)', 'rgba(230,140,255,.55)', 'rgba(255,255,255,.25)']));
      dots(160, '#fff', 1.6); dots(14, '#fff', 3);
      glow = 0.55; break;
    case 'lava':
      g.fillStyle = '#ff7a10'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 10; i++) blob(rand(0, 256), rand(0, 256), rand(30, 70), 'rgba(255,220,60,.8)');
      for (let i = 0; i < 10; i++) blob(rand(0, 256), rand(0, 256), rand(30, 60), 'rgba(170,20,0,.7)');
      g.strokeStyle = '#3a0800'; g.lineWidth = 4; g.lineJoin = 'round';
      for (let i = 0; i < 26; i++) {
        let x = rand(0, 256), y = rand(0, 256); g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += rand(-45, 45); y += rand(-45, 45); g.lineTo(x, y); }
        g.stroke();
      }
      glow = 0.5; break;
    case 'inferno':
      g.fillStyle = '#1a0c00'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 34; i++) {
        g.strokeStyle = pick(['#ffb31a', '#ff8c00', '#ffd84d', '#e06a00']); g.lineWidth = rand(4, 13);
        const y0 = rand(-20, 276), f = rand(0.02, 0.05), ph = rand(0, 6), amp = rand(8, 30);
        g.beginPath(); for (let x = 0; x <= 256; x += 8) g[x ? 'lineTo' : 'moveTo'](x, y0 + Math.sin(x * f + ph) * amp); g.stroke();
      }
      glow = 0.35; break;
    case 'toxic':
      g.fillStyle = '#2e7d10'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 18; i++) blob(rand(0, 256), rand(0, 256), rand(20, 60), 'rgba(170,255,60,.85)');
      dots(40, 'rgba(10,40,0,.6)', 8);
      glow = 0.45; break;
    case 'gold': {
      const gr = g.createLinearGradient(0, 0, 256, 256);
      ['#8a6100', '#ffd75a', '#b88400', '#fff2b0', '#c99300', '#ffd75a'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col));
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      glow = 0.25; break;
    }
    case 'ice':
      g.fillStyle = '#9fdcff'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 10; i++) blob(rand(0, 256), rand(0, 256), rand(30, 80), 'rgba(255,255,255,.7)');
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2;
      for (let i = 0; i < 18; i++) { g.beginPath(); const x = rand(0, 256), y = rand(0, 256); g.moveTo(x, y); g.lineTo(x + rand(-60, 60), y + rand(-60, 60)); g.stroke(); }
      glow = 0.2; break;
    case 'midnight':
      g.fillStyle = '#0b0f1e'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#2f7bff'; g.lineWidth = 3;
      for (let i = 0; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
      glow = 0.35; break;
    case 'camo':
      g.fillStyle = '#5c6b3a'; g.fillRect(0, 0, 256, 256);
      for (const col of ['#3f4a26', '#8a8455', '#2b2b1c']) for (let i = 0; i < 14; i++) { g.fillStyle = col; g.beginPath(); g.ellipse(rand(0, 256), rand(0, 256), rand(14, 40), rand(10, 26), rand(0, 3), 0, 7); g.fill(); }
      break;
    case 'bubblegum':
      g.fillStyle = '#ff7cc8'; g.fillRect(0, 0, 256, 256);
      dots(60, '#ffffff', 7); dots(30, '#7fd8ff', 6);
      break;
  }
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.MeshLambertMaterial({ map: t });
  if (glow) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = t; m.emissiveIntensity = glow; }
  return (wrapMats[id] = m);
}

// a little charm on a chain; its pivot is where it hooks onto the weapon
function charmModel(id) {
  if (!id || id === 'none' || !CHARMS[id]) return null;
  const pivot = new THREE.Group(), obj = new THREE.Group();
  const add = (geo, col, x, y, z, basic) => {
    const m = new THREE.Mesh(geo, basic ? new THREE.MeshBasicMaterial({ color: col }) : lam(col));
    m.position.set(x, y, z); obj.add(m); return m;
  };
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 12), lam('#c9ced6'));
  ring.position.y = -0.06; pivot.add(ring);
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), lam('#c9ced6'));
  chain.position.y = -0.2; pivot.add(chain);
  obj.position.y = -0.32; pivot.add(obj);
  switch (id) {
    case 'pin':
      add(new THREE.CylinderGeometry(0.05, 0.1, 0.32, 10), '#ffffff', 0, -0.2, 0);
      add(new THREE.SphereGeometry(0.07, 10, 8), '#ffffff', 0, -0.02, 0);
      add(new THREE.CylinderGeometry(0.058, 0.062, 0.035, 10), '#e53b3b', 0, -0.09, 0);
      add(new THREE.CylinderGeometry(0.066, 0.07, 0.035, 10), '#e53b3b', 0, -0.14, 0);
      break;
    case 'duck':
      add(new THREE.SphereGeometry(0.14, 12, 10), '#ffd21f', 0, -0.2, 0).scale.set(1, 0.8, 1.2);
      add(new THREE.SphereGeometry(0.09, 10, 8), '#ffd21f', 0, -0.06, 0.07);
      add(new THREE.BoxGeometry(0.07, 0.03, 0.08), '#ff8a1f', 0, -0.07, 0.17);
      break;
    case 'heart':
      add(new THREE.SphereGeometry(0.08, 10, 8), '#ff3b6b', -0.06, -0.1, 0);
      add(new THREE.SphereGeometry(0.08, 10, 8), '#ff3b6b', 0.06, -0.1, 0);
      add(new THREE.ConeGeometry(0.135, 0.18, 4), '#ff3b6b', 0, -0.22, 0).rotation.set(Math.PI, Math.PI / 4, 0);
      break;
    case 'fire':
      add(new THREE.ConeGeometry(0.12, 0.32, 7), '#ff5a10', 0, -0.16, 0, true);
      add(new THREE.ConeGeometry(0.07, 0.2, 7), '#ffd23c', 0, -0.2, 0.02, true);
      break;
    case 'skull':
      add(new THREE.BoxGeometry(0.2, 0.18, 0.18), '#f2efe6', 0, -0.13, 0);
      add(new THREE.BoxGeometry(0.14, 0.06, 0.14), '#f2efe6', 0, -0.24, 0.01);
      add(new THREE.BoxGeometry(0.05, 0.05, 0.02), '#111', -0.045, -0.13, 0.09);
      add(new THREE.BoxGeometry(0.05, 0.05, 0.02), '#111', 0.045, -0.13, 0.09);
      break;
    case 'star': {
      const sh = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 0.07 : 0.16; sh[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r, Math.cos(a) * r); }
      const m = add(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }), '#ffcc22', 0, -0.17, -0.025);
      m.material = new THREE.MeshLambertMaterial({ color: '#ffcc22', emissive: '#664400' });
      break;
    }
    case 'diamond': {
      const m = add(new THREE.OctahedronGeometry(0.14), '#6ff0ff', 0, -0.16, 0);
      m.scale.y = 1.4; m.material = new THREE.MeshLambertMaterial({ color: '#6ff0ff', emissive: '#1a7a90' });
      break;
    }
  }
  pivot.userData.isCharm = true;
  return pivot;
}

function gunModel(key, wrap, charm) {
  const g = new THREE.Group();
  const skin = wrapMaterial(wrap);
  const B = (w, h, d, c, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skin || lam(c)); m.position.set(x, y, z); m.rotation.x = rx;
    m.castShadow = true; g.add(m); return m;
  };
  const C = (r, len, c, x, y, z, seg = 12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), skin || lam(c)); m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  const charmAt = new V3(0.16, 0.2, -0.15);
  const ring = (x, y, z, r, c) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 14), skin || lam(c)); m.position.set(x, y, z); g.add(m); return m; };
  // little grey screw heads on both sides
  const screw = (y, z) => { for (const sd of [1, -1]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), lam('#8e939b')); m.rotation.z = Math.PI / 2; m.position.set(0.165 * sd, y, z); g.add(m); } };
  const muzzle = new THREE.Object3D(); g.add(muzzle);
  let sightY = 0.5;
  const fore = new V3(0, 0.05, 1.2);
  switch (key) {
    case 'ar': {
      // orange SCAR-style rifle with black slots, ring sights and a black curved mag
      const o = '#f0a845', k = '#151515';
      B(0.3, 0.36, 2.0, o, 0, 0.42, 0.55); B(0.28, 0.3, 1.0, o, 0, 0.14, 0.2);
      B(0.32, 0.07, 0.4, k, 0, 0.5, 0.95); B(0.32, 0.07, 0.4, k, 0, 0.5, 1.45); B(0.32, 0.07, 0.25, k, 0, 0.36, 1.2);
      B(0.3, 0.3, 0.7, o, 0, 0.4, 1.9); B(0.12, 0.06, 2.2, k, 0, 0.63, 0.85);
      C(0.07, 1.3, k, 0, 0.42, 2.85); C(0.1, 0.35, k, 0, 0.42, 3.4);
      ring(0, 0.82, 2.0, 0.1, k); B(0.05, 0.14, 0.05, k, 0, 0.7, 2.0);
      ring(0, 0.82, -0.05, 0.1, k); B(0.05, 0.14, 0.05, k, 0, 0.7, -0.05);
      B(0.24, 0.62, 0.36, k, 0, -0.26, 0.68, 0.25); B(0.24, 0.42, 0.34, k, 0, -0.68, 0.84, 0.5);
      B(0.25, 0.04, 0.3, '#2c2c2c', 0, -0.4, 0.72, 0.25);
      B(0.24, 0.6, 0.3, o, 0, -0.25, -0.05, -0.3); B(0.06, 0.06, 0.42, k, 0, -0.06, 0.28);
      B(0.26, 0.4, 0.9, o, 0, 0.35, -0.75); B(0.24, 0.4, 0.55, o, 0, -0.02, -1.0); B(0.28, 0.82, 0.14, k, 0, 0.18, -1.27);
      screw(0.3, 0.25); screw(0.3, 0.6); screw(0.1, 0.05);
      muzzle.position.set(0, 0.42, 3.6); sightY = 0.82; fore.set(0, 0.3, 1.85); charmAt.set(0.17, 0.32, 0.0);
      break;
    }
    case 'burst': {
      // FAMAS-style bullpup with a big carry handle loop on top
      const o = '#4f5664', k = '#141414';
      B(0.32, 0.5, 1.5, o, 0, 0.32, -0.35); B(0.3, 0.4, 0.9, o, 0, 0.36, 0.8); B(0.3, 0.32, 0.6, o, 0, 0.32, 1.5);
      B(0.14, 0.5, 0.22, o, 0, 0.8, -0.75); B(0.14, 0.42, 0.2, o, 0, 0.76, 1.15); B(0.16, 0.16, 2.1, o, 0, 1.06, 0.2);
      B(0.04, 0.2, 0.06, k, 0, 0.92, 1.05);
      C(0.07, 1.1, k, 0, 0.34, 2.3); C(0.1, 0.3, k, 0, 0.34, 2.85);
      B(0.26, 0.6, 0.34, k, 0, -0.18, -0.7, 0.12); B(0.27, 0.04, 0.3, '#2c2c2c', 0, -0.25, -0.7, 0.12); B(0.27, 0.04, 0.3, '#2c2c2c', 0, -0.05, -0.68, 0.12);
      B(0.22, 0.55, 0.28, k, 0, -0.2, 0, -0.25); B(0.06, 0.06, 0.45, k, 0, -0.05, 0.3);
      B(0.3, 0.55, 0.5, o, 0, 0.25, -1.25); B(0.32, 0.62, 0.12, k, 0, 0.25, -1.55);
      screw(0.32, -0.2); screw(0.32, 0.6);
      muzzle.position.set(0, 0.34, 3.0); sightY = 1.0; fore.set(0, 0.28, 1.4); charmAt.set(0.18, 0.2, -0.3);
      break;
    }
    case 'sniper': {
      // green AWP-style rifle: thumbhole stock, black mag, long black scope
      const o = '#5fa22a', k = '#141414';
      B(0.3, 0.45, 1.6, o, 0, 0.2, 0.4); B(0.28, 0.38, 1.6, o, 0, 0.26, 1.95); B(0.31, 0.06, 1.2, k, 0, 0.32, 2.05);
      C(0.075, 2.4, k, 0, 0.4, 3.5); C(0.1, 0.3, k, 0, 0.4, 4.6);
      C(0.13, 1.7, k, 0, 0.92, 0.6); C(0.2, 0.55, k, 0, 0.92, 1.6); C(0.17, 0.4, k, 0, 0.92, -0.35);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
      lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.92, 1.89); g.add(lens);
      B(0.16, 0.22, 0.16, k, 0, 1.12, 0.6); B(0.22, 0.16, 0.16, k, 0.15, 0.92, 0.6);
      B(0.12, 0.3, 0.16, k, 0, 0.6, 0.15); B(0.12, 0.3, 0.16, k, 0, 0.6, 1.05);
      B(0.3, 0.06, 0.06, k, 0.2, 0.42, 0.05); B(0.1, 0.1, 0.1, k, 0.36, 0.38, 0.05);
      B(0.26, 0.5, 0.45, k, 0, -0.18, 0.7); B(0.27, 0.35, 0.04, '#2c2c2c', 0, -0.2, 0.62); B(0.27, 0.35, 0.04, '#2c2c2c', 0, -0.2, 0.78);
      B(0.26, 0.6, 0.3, o, 0, -0.15, -0.1, -0.3); B(0.28, 0.32, 1.3, o, 0, 0.3, -1.0);
      B(0.28, 0.26, 0.85, o, 0, -0.45, -1.15); B(0.28, 0.95, 0.35, o, 0, -0.05, -1.55); B(0.3, 1.0, 0.12, k, 0, -0.05, -1.78);
      screw(0.3, 0.1); screw(0.1, 1.0); screw(-0.05, 0.3); screw(-0.4, -1.2); screw(0.32, 1.95);
      muzzle.position.set(0, 0.4, 4.75); sightY = 0.92; fore.set(0, 0.25, 1.7); charmAt.set(0.17, 0.25, 0.25);
      break;
    }
    case 'crossbow': {
      // dark crossbow with bent limbs, strings, a scope and a bolt that disappears when fired
      const o = '#2c2e33', l = '#45484e', k = '#111';
      B(0.26, 0.3, 3.0, o, 0, 0.3, 0.6); B(0.16, 0.08, 2.4, l, 0, 0.48, 0.9);
      for (const sd of [1, -1]) {
        const limbBox = B(1.7, 0.14, 0.24, o, 0.8 * sd, 0.34, 1.85); limbBox.rotation.y = 0.35 * sd;
        const tipBox = B(0.5, 0.18, 0.26, l, 1.62 * sd, 0.34, 1.42); tipBox.rotation.y = 0.9 * sd;
        g.add(limb(new V3(1.75 * sd, 0.4, 1.3), new V3(0, 0.52, 0.45), 0.03, lam(k)));
        g.add(limb(new V3(1.6 * sd, 0.3, 1.45), new V3(0.3 * sd, 0.15, 1.85), 0.03, lam(k)));
      }
      const bolt = C(0.04, 1.5, '#5a3a1e', 0, 0.56, 1.2);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 6), lam('#c9ced6')); tip.rotation.x = Math.PI / 2; tip.position.set(0, 0.56, 2.05); g.add(tip);
      bolt.add(tip); tip.position.set(0, 0.85, 0); tip.rotation.set(0, 0, 0);
      C(0.11, 1.2, k, 0, 0.9, 0.3); C(0.17, 0.4, k, 0, 0.9, 1.0); C(0.14, 0.3, k, 0, 0.9, -0.4);
      B(0.1, 0.32, 0.14, k, 0, 0.62, 0.0); B(0.1, 0.32, 0.14, k, 0, 0.62, 0.7);
      B(0.2, 0.3, 0.6, o, 0, 0.05, 1.3); B(0.24, 0.6, 0.3, o, 0, -0.2, -0.05, -0.3);
      B(0.26, 0.5, 0.9, o, 0, 0.2, -1.2); B(0.28, 0.7, 0.14, k, 0, 0.12, -1.7);
      screw(0.3, 0.2); screw(0.3, 1.0);
      muzzle.position.set(0, 0.56, 2.1); sightY = 0.9; fore.set(0, 0.15, 1.3); charmAt.set(0.15, 0.2, 0.3);
      g.userData.bolt = bolt;
      break;
    }
    case 'handgun':
      B(0.24, 0.34, 1.15, '#2d3036', 0, 0.3, 0.35); B(0.22, 0.6, 0.3, '#1c1e22', 0, -0.05, -0.05, -0.2);
      B(0.08, 0.08, 0.1, '#ff8a1f', 0, 0.5, 0.85);
      muzzle.position.set(0, 0.32, 0.95); sightY = 0.5; fore.set(0, -0.1, 0.05);
      break;
    case 'revolver':
      // long silver barrel with a rib on top, a fat cylinder and a black grip, like the Rivals one
      C(0.11, 1.35, '#d4d8de', 0, 0.42, 0.95, 10); B(0.08, 0.1, 1.35, '#c4c9d0', 0, 0.55, 0.95);
      B(0.2, 0.2, 0.3, '#c4c9d0', 0, 0.3, 0.5); C(0.24, 0.45, '#b9bec6', 0, 0.36, 0.12, 8);
      C(0.06, 0.48, '#8d939b', 0.13, 0.36, 0.12, 8);
      B(0.22, 0.42, 0.5, '#d4d8de', 0, 0.36, -0.28); B(0.08, 0.16, 0.14, '#9aa0a8', 0, 0.6, -0.45, 0.6);
      B(0.08, 0.06, 0.28, '#3a3d42', 0, 0.06, 0.15);
      B(0.24, 0.8, 0.34, '#141414', 0, -0.22, -0.42, -0.4); C(0.05, 0.26, '#6a6f78', 0.12, -0.42, -0.5, 8);
      muzzle.position.set(0, 0.42, 1.66); sightY = 0.6; fore.set(0, -0.15, -0.3); charmAt.set(0.18, 0.18, -0.1);
      break;
    case 'shorty':
      // sawed-off double barrel
      C(0.13, 1.1, '#2c2f35', -0.13, 0.42, 0.75, 8); C(0.13, 1.1, '#2c2f35', 0.13, 0.42, 0.75, 8);
      B(0.5, 0.1, 0.18, '#2c2f35', 0, 0.42, 1.25); B(0.5, 0.1, 0.18, '#2c2f35', 0, 0.42, 0.45);
      B(0.4, 0.3, 0.9, '#7b4a25', 0, 0.2, 0.55); B(0.34, 0.36, 0.42, '#2c2f35', 0, 0.3, 0.0);
      B(0.28, 0.85, 0.36, '#7b4a25', 0, -0.2, -0.32, -0.45);
      muzzle.position.set(0, 0.42, 1.35); sightY = 0.62; fore.set(0, -0.05, 0.6); charmAt.set(0.24, 0.18, -0.05);
      break;
    case 'uzi':
      B(0.26, 0.42, 1.2, '#2a2c30', 0, 0.3, 0.35); C(0.06, 0.4, '#1a1b1e', 0, 0.36, 1.1);
      B(0.2, 0.9, 0.24, '#1a1b1e', 0, -0.25, 0.08); B(0.08, 0.12, 0.16, '#ffd166', 0, 0.56, 0.1);
      muzzle.position.set(0, 0.36, 1.32); sightY = 0.56; fore.set(0, -0.1, 0.0);
      break;
    case 'katana':
      B(0.07, 0.24, 3.4, '#dfe6ee', 0, 0, 2.1); B(0.08, 0.06, 3.4, '#ffffff', 0, 0.12, 2.1);
      B(0.5, 0.14, 0.14, '#ffcc22', 0, 0, 0.36); B(0.14, 0.18, 0.9, '#b8202a', 0, 0, -0.05);
      muzzle.position.set(0, 0, 3.6);
      break;
    case 'knife': {
      // combat knife: long pointed blade, small guard, ridged black handle
      B(0.06, 0.3, 1.25, '#d5dbe2', 0, 0.02, 0.98); B(0.065, 0.06, 1.25, '#f4f6f8', 0, 0.16, 0.98);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 4), skin || lam('#d5dbe2'));
      tip.rotation.x = Math.PI / 2; tip.scale.set(0.4, 1, 1); tip.position.set(0, 0.02, 1.8); g.add(tip);
      B(0.14, 0.42, 0.08, '#1d1d1f', 0, 0, 0.34);
      for (let i = 0; i < 4; i++) B(0.2, 0.22, 0.1, '#1d1d1f', 0, 0, 0.2 - i * 0.16);
      B(0.16, 0.18, 0.7, '#2a2a2c', 0, 0, -0.04); B(0.2, 0.22, 0.12, '#1d1d1f', 0, 0, -0.42);
      muzzle.position.set(0, 0, 2); charmAt.set(0.1, -0.05, -0.45);
      break;
    }
    case 'grenade': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), skin || lam('#3c6b2f')); m.scale.set(1, 1.12, 1); m.position.set(0, 0.05, 0.15); g.add(m);
      B(0.18, 0.2, 0.18, '#2b2b2b', 0, 0.48, 0.15); B(0.06, 0.06, 0.36, '#bbb', 0.14, 0.46, 0.28);
      const pin = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), lam('#c9ced6')); pin.position.set(-0.16, 0.5, 0.15); g.add(pin);
      charmAt.set(-0.16, 0.42, 0.15);
      break;
    }
    case 'jumppad': {
      const pad = jumpPadModel(skin); pad.scale.setScalar(0.32); pad.position.set(0, 0.1, 0.4); pad.rotation.x = -0.9; g.add(pad);
      charmAt.set(0.5, 0.0, 0.4);
      break;
    }
    case 'medkit':
      B(0.9, 0.6, 0.7, '#f2f2f2', 0, 0.1, 0.3); B(0.92, 0.14, 0.4, '#e53b3b', 0, 0.12, 0.3); B(0.92, 0.4, 0.14, '#e53b3b', 0, 0.12, 0.3);
      break;
  }
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
  flash.scale.set(1, 1, 2.2); flash.visible = false; muzzle.add(flash);
  let charmObj = null;
  if (WEAPONS[key].type !== 'medkit') {
    charmObj = charmModel(charm);
    if (charmObj) { charmObj.position.copy(charmAt); g.add(charmObj); }
  }
  g.userData = { muzzle, flash, sightY, fore, charm: charmObj, bolt: g.userData.bolt };
  return g;
}

// grey plate with glowing blue panels; 4 studs across
function jumpPadModel(skin) {
  const g = new THREE.Group();
  const base = skin || lam('#b9bfc8'), glow = new THREE.MeshBasicMaterial({ color: 0x55dcff });
  const box = (w, h, d, m, x, y, z, ry = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = true; b.receiveShadow = true; g.add(b); return b; };
  box(4, 0.3, 4, base, 0, 0.15, 0);
  box(1.6, 0.06, 1.6, glow, 0, 0.32, 0, Math.PI / 4).scale.set(0.8, 1, 0.8);
  box(1.3, 0.06, 1.3, glow, 0, 0.33, 0);
  for (const [x, z] of [[1.75, 1.75], [-1.75, 1.75], [1.75, -1.75], [-1.75, -1.75]]) box(0.7, 0.4, 0.7, base, x, 0.2, z);
  for (const [x, z, r] of [[0, 1.55, 0], [0, -1.55, 0], [1.55, 0, Math.PI / 2], [-1.55, 0, Math.PI / 2]]) box(1.6, 0.05, 0.3, glow, x, 0.32, z, r);
  return g;
}

function holdType(key) {
  const w = WEAPONS[key];
  if (w.type === 'melee') return 'melee';
  if (w.type !== 'gun') return 'pistol';
  return w.pistol ? 'pistol' : 'rifle';
}
function setAvatarGun(av, key, wrap, charm) {
  const id = key + '/' + (wrap || '') + '/' + (charm || '');
  if (av.gunKey === id) return;
  if (av.gun) av.gun.parent.remove(av.gun);
  const gun = gunModel(key, wrap, charm);
  gun.rotation.x = Math.PI / 2;
  gun.position.y = -0.18;
  gun.scale.setScalar(0.9);
  av.arms[0].hand.add(gun);
  av.gun = gun; av.gunKey = id;
}

// ---------- the arena ----------
const boxes = [], worldMeshes = [];
function block(x, y, z, w, h, d, color) {
  const m = new THREE.Mesh(tiledBox(w, h, d), tileMat(color));
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
  scene.add(m); worldMeshes.push(m);
  boxes.push({ min: new V3(x - w / 2, y, z - d / 2), max: new V3(x + w / 2, y + h, z + d / 2) });
}
// both teams get the same cover: everything is mirrored through the middle
function sym(x, y, z, w, h, d, color) { block(x, y, z, w, h, d, color); block(-x, y, -z, w, h, d, color); }

function buildArena() {
  const W = 150, D = 100;
  block(0, -1, 0, W + 40, 1, D + 40, '#8f99a3');
  block(0, 0, D / 2 + 1, W + 4, 16, 2, '#d9d1c1'); block(0, 0, -D / 2 - 1, W + 4, 16, 2, '#d9d1c1');
  block(W / 2 + 1, 0, 0, 2, 16, D, '#d9d1c1'); block(-W / 2 - 1, 0, 0, 2, 16, D, '#d9d1c1');
  // invisible walls above the edge, so a jump pad can't send you out of the arena
  for (const [x, z, w, d] of [[0, D / 2 + 1, W + 4, 2], [0, -D / 2 - 1, W + 4, 2], [W / 2 + 1, 0, 2, D], [-W / 2 - 1, 0, 2, D]])
    boxes.push({ min: new V3(x - w / 2, 16, z - d / 2), max: new V3(x + w / 2, 90, z + d / 2) });
  // middle tower with stairs on two sides
  block(0, 0, 0, 14, 5, 14, '#f0a830');
  for (let i = 1; i <= 4; i++) sym(7 + (5 - i) * 1.3 - 0.65, 0, 0, 1.3, i, 5, '#f7c35c');
  block(0, 5, 5.6, 7, 2.6, 1, '#d98a1a'); block(0, 5, -5.6, 7, 2.6, 1, '#d98a1a');
  // spawn cover
  // spawn cover with a gap in the middle so you can run straight out
  sym(61, 0, 4.5, 1.5, 3.4, 4, '#e05d5d'); sym(61, 0, -4.5, 1.5, 3.4, 4, '#e05d5d');
  sym(66, 0, 22, 8, 6, 1.5, '#5b7bd5'); sym(66, 0, -22, 8, 6, 1.5, '#5b7bd5');
  // big walls make lanes
  sym(32, 0, 20, 3, 12, 18, '#5b7bd5'); sym(32, 0, -22, 3, 12, 14, '#5b7bd5');
  sym(18, 0, 38, 20, 12, 3, '#8f6bd8');
  // low walls you can shoot over
  sym(46, 0, 2, 1.5, 3.4, 14, '#e05d5d'); sym(14, 0, 24, 14, 3.4, 1.5, '#e05d5d'); sym(14, 0, -26, 14, 3.4, 1.5, '#e05d5d');
  // crates
  const crate = '#b67b3e', crate2 = '#9c6630';
  sym(52, 0, 30, 4, 4, 4, crate); sym(56, 0, -34, 4, 4, 4, crate); sym(56, 4, -34, 3, 3, 3, crate2);
  sym(40, 0, 40, 5, 4, 5, crate2); sym(22, 0, 10, 4, 4, 4, crate); sym(24, 0, -12, 3, 3, 3, crate2);
  sym(44, 0, -40, 6, 6, 6, '#7a8a99'); sym(48, 0, 16, 4, 4, 4, crate); sym(6, 0, 44, 4, 4, 4, crate);
  // pillars
  sym(10, 0, 34, 3, 14, 3, '#8a8f99'); sym(38, 0, 8, 3, 14, 3, '#8a8f99');

  // decoration outside the walls (not solid)
  const deco = (geo, color, x, y, z) => { const m = new THREE.Mesh(geo, lam(color)); m.position.set(x, y, z); scene.add(m); return m; };
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2, r = rand(105, 125), x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r;
    deco(new THREE.BoxGeometry(2, 8, 2), '#7a5230', x, 4, z);
    deco(new THREE.BoxGeometry(9, 8, 9), pick(['#3f9b4a', '#4fb35a', '#358a40']), x, 11, z);
  }
  for (let i = 0; i < 14; i++) {
    const c = deco(new THREE.BoxGeometry(rand(20, 40), rand(4, 7), rand(12, 22)), '#ffffff', rand(-260, 260), rand(85, 120), rand(-260, 260));
    c.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  }
}
buildArena();

const DUEL_SPAWNS = [{ x: -68, z: 0, yaw: -Math.PI / 2 }, { x: 68, z: 0, yaw: Math.PI / 2 }];
const FFA_SPAWNS = [[-68, 0], [68, 0], [-60, 40], [60, -40], [-60, -40], [60, 40], [0, 42], [0, -42], [-25, 0], [25, 0],
  [-42, -14], [42, 14], [-26, 44], [26, -44]];
const NAV = [];
for (let x = -68; x <= 68; x += 8) for (let z = -44; z <= 44; z += 8) NAV.push(new V3(x, 0, z));

// ---------- movement and collisions ----------
const R = 1.0, H = 5.3, EYE = 4.75, GRAV = 95, JUMP = 31, WALK = 17, STEP = 1.15;
function hitBox(p) {
  for (const b of boxes) {
    if (p.x + R > b.min.x && p.x - R < b.max.x && p.z + R > b.min.z && p.z - R < b.max.z && p.y + H > b.min.y && p.y < b.max.y) return b;
  }
  return null;
}
function moveAxis(f, ax, d) {
  if (!d) return;
  f.pos[ax] += d;
  const b = hitBox(f.pos);
  if (!b) return;
  if (ax === 'y') {
    if (d < 0) { f.pos.y = b.max.y; f.onGround = true; } else f.pos.y = b.min.y - H - 0.001;
    f.vel.y = 0; return;
  }
  const rise = b.max.y - f.pos.y;
  if (rise > 0 && rise <= STEP && f.vel.y <= 0.1) {
    const oy = f.pos.y; f.pos.y = b.max.y + 0.001;
    if (!hitBox(f.pos)) return;
    f.pos.y = oy;
  }
  f.pos[ax] = d > 0 ? b.min[ax] - R - 0.001 : b.max[ax] + R + 0.001;
  f.vel[ax] = 0; f.blocked = true;
}
function physicsMove(f, wx, wz, speed, jump, dt) {
  const k = Math.min(1, (f.onGround ? 14 : 3.5) * dt);
  f.vel.x = lerp(f.vel.x, wx * speed, k); f.vel.z = lerp(f.vel.z, wz * speed, k);
  if (jump && f.onGround) { f.vel.y = JUMP; f.onGround = false; }
  f.vel.y = Math.max(f.vel.y - GRAV * dt, -120);
  f.blocked = false;
  moveAxis(f, 'x', f.vel.x * dt); moveAxis(f, 'z', f.vel.z * dt);
  f.onGround = false; moveAxis(f, 'y', f.vel.y * dt);
}

// ---------- game state ----------
const game = { state: 'menu', mode: save.mode, diff: save.diff, t: 0, round: 1, score: [0, 0], goal: 5, over: false, paused: false };
let clock = 0; // game time in seconds, stops while paused
let fighters = [], player = null;
const input = { keys: {}, fire: false, aim: false, jump: false, moveX: 0, moveY: 0, lastSlot: 1, tapFire: 0 };
let adsAmt = 0, shake = 0, recoilDebt = 0, vmKick = 0, swingT = 0, healT = 0;

function makeFighter(name, look, isPlayer) {
  const f = { name, look, isPlayer, pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, hp: 100, alive: true, onGround: false,
    blocked: false, kills: 0, deaths: 0, phase: 0, deadT: 0, respawnAt: 0, lastHurt: -99, kick: 0, flashT: 0,
    loadout: [], slot: 0, ammo: {}, util: 0, reloadT: 0, nextFire: 0, swapT: 0, burstLeft: 0, burstNext: 0, swingT: 0,
    target: null, visible: false, seeT: 0, think: 0, strafeDir: 1, strafeT: 0, goal: null, goalT: 0, stuckT: 0, alertT: -99 };
  f.avatar = buildAvatar(look);
  for (const p of f.avatar.parts) p.userData.fighter = f;
  scene.add(f.avatar.root);
  return f;
}
function refill(f) {
  f.hp = 100; f.alive = true; f.deadT = 0; f.vel.set(0, 0, 0); f.reloadT = 0; f.burstLeft = 0; f.swapT = 0; f.nextFire = 0;
  for (const k of f.loadout) if (WEAPONS[k].type === 'gun') f.ammo[k] = WEAPONS[k].mag;
  f.util = f.loadout[3] ? WEAPONS[f.loadout[3]].count : 0;
  f.avatar.body.rotation.set(0, 0, 0); f.avatar.root.position.y = 0;
  f.avatar.root.visible = !f.isPlayer;
  setSlot(f, 0, true);
}
function setSlot(f, i, instant) {
  if (i === f.slot && !instant) return;
  if (f.loadout[i] === undefined) return;
  if (!instant && f.isPlayer) input.lastSlot = f.slot;
  f.slot = i; f.reloadT = 0; f.burstLeft = 0; f.swapT = instant ? 0 : 0.35; healT = f.isPlayer ? 0 : healT;
  const k = f.loadout[i];
  setAvatarGun(f.avatar, k, f.isPlayer ? save.wraps[k] : f.wrap, f.isPlayer ? save.charms[k] : f.charm);
  if (f.isPlayer) { buildViewmodel(); updateSlotsHud(); }
}
const curKey = f => f.loadout[f.slot];

function clearMatch() {
  for (const f of fighters) scene.remove(f.avatar.root);
  fighters = []; player = null;
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  $('killfeed').innerHTML = ''; $('dmgNums').innerHTML = ''; dmgNums.length = 0;
}

function startMatch() {
  clearMatch();
  game.mode = save.mode; game.diff = save.diff; game.score = [0, 0]; game.round = 1; game.over = false;
  game.goal = game.mode === 'duel' ? 5 : 15;
  player = makeFighter('You', save.look, true);
  player.loadout = SLOTS.map(s => save.loadout[s.key]);
  fighters.push(player);
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const nBots = game.mode === 'duel' ? 1 : 5;
  for (let i = 0; i < nBots; i++) {
    const b = makeFighter(names[i], randomLook(), false);
    b.wrap = pick(Object.keys(WRAPS)); b.charm = pick(Object.keys(CHARMS));
    b.loadout = [pick(BOT_GUNS)];
    fighters.push(b);
  }
  game.state = 'countdown';
  if (game.mode === 'duel') beginRound();
  else {
    const used = [];
    for (const f of fighters) { refill(f); placeAtSpawn(f, used); }
    game.state = 'countdown'; game.t = 4; game.beep = 4;
    showBig('FREE FOR ALL', 'First to 15 eliminations');
  }
  showHud(true);
  // keys go to the game, not the button you just clicked
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  try { window.focus(); } catch (e) { /* not allowed */ }
  if (isTouch) setAimToggle(false);
  else setTimeout(() => { if (lockBlocked && playing()) killNotice('Hold the mouse button and drag to look around. Move with WASD or the arrow keys.', 6); }, 400);
  updateSlotsHud();
  lockPointer();
}
function beginRound() {
  for (let i = 0; i < 2; i++) {
    const f = fighters[i], s = DUEL_SPAWNS[i];
    refill(f); f.pos.set(s.x, 0, s.z); f.yaw = s.yaw; f.pitch = 0;
    if (!f.isPlayer) { f.loadout = [pick(BOT_GUNS)]; refill(f); }
  }
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  game.state = 'countdown'; game.t = 4; game.beep = 4;
  const mp = game.score.some(s => s === game.goal - 1);
  showBig(`ROUND ${game.round}`, mp ? 'MATCH POINT' : `vs ${fighters[1].name} · ${WEAPONS[fighters[1].loadout[0]].name}`);
}
function placeAtSpawn(f, used = []) {
  // the spawn farthest from everyone else
  let best = null, bestD = -1;
  for (const [x, z] of FFA_SPAWNS) {
    let d = 1e9;
    for (const o of fighters) if (o !== f && o.alive && !used.includes(o)) d = Math.min(d, Math.hypot(o.pos.x - x, o.pos.z - z));
    for (const u of used) d = Math.min(d, Math.hypot(u.pos.x - x, u.pos.z - z));
    d += Math.random() * 8;
    if (d > bestD) { bestD = d; best = [x, z]; }
  }
  f.pos.set(best[0], 0, best[1]);
  f.yaw = Math.atan2(best[0], best[1]); // face the middle
  f.pitch = 0;
  used.push(f);
}

// ---------- effects ----------
const tracers = [], sparks = [], booms = [], grenades = [], dmgNums = [];
const tracerGeo = new THREE.BoxGeometry(0.06, 0.06, 1);
function tracer(from, to, color = 0xffe7a0) {
  let t = tracers.find(t => !t.mesh.visible);
  if (!t) {
    t = { mesh: new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true })), life: 0 };
    scene.add(t.mesh); tracers.push(t);
  }
  const len = from.distanceTo(to);
  t.mesh.material.color.set(color);
  t.mesh.position.copy(from).lerp(to, 0.5);
  t.mesh.scale.set(1, 1, len);
  t.mesh.lookAt(to);
  t.mesh.visible = true; t.life = 0.07; t.mesh.material.opacity = 0.9;
}
const sparkGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
function burst(point, color, n = 6, speed = 10) {
  for (let i = 0; i < n; i++) {
    let s = sparks.find(s => !s.mesh.visible);
    if (!s) { s = { mesh: new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color })), vel: new V3(), life: 0 }; scene.add(s.mesh); sparks.push(s); }
    s.mesh.material.color.set(color);
    s.mesh.position.copy(point); s.mesh.visible = true; s.life = rand(0.25, 0.5);
    s.vel.set(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(speed);
  }
}
function explosionFx(pos) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true }));
  m.position.copy(pos); scene.add(m);
  booms.push({ mesh: m, life: 0 });
  burst(pos, 0x555555, 14, 22); burst(pos, 0xffb040, 10, 26);
}
function updateEffects(dt) {
  for (const t of tracers) if (t.mesh.visible) { t.life -= dt; t.mesh.material.opacity = Math.max(0, t.life / 0.07); if (t.life <= 0) t.mesh.visible = false; }
  for (const s of sparks) if (s.mesh.visible) {
    s.life -= dt; s.vel.y -= 40 * dt; s.mesh.position.addScaledVector(s.vel, dt);
    if (s.life <= 0) s.mesh.visible = false;
  }
  for (let i = booms.length - 1; i >= 0; i--) {
    const b = booms[i]; b.life += dt;
    const k = b.life / 0.4;
    b.mesh.scale.setScalar(1 + k * 9); b.mesh.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); booms.splice(i, 1); }
  }
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const d = dmgNums[i]; d.life -= dt; d.pos.y += dt * 2;
    const s = toScreen(d.pos);
    if (!s || d.life <= 0) { if (d.life <= 0) { d.el.remove(); dmgNums.splice(i, 1); } else d.el.style.display = 'none'; continue; }
    d.el.style.display = ''; d.el.style.left = s.x + 'px'; d.el.style.top = s.y + 'px'; d.el.style.opacity = Math.min(1, d.life * 2.5);
  }
}
const tmpV = new V3();
function toScreen(v) {
  tmpV.copy(v).project(camera);
  if (tmpV.z > 1) return null;
  return { x: (tmpV.x + 1) / 2 * window.innerWidth, y: (1 - tmpV.y) / 2 * window.innerHeight };
}
function damageNumber(pos, amount, head) {
  const el = document.createElement('div');
  el.textContent = amount; if (head) el.className = 'head';
  $('dmgNums').appendChild(el);
  dmgNums.push({ el, pos: pos.clone().add(new V3(rand(-0.6, 0.6), 0.5, rand(-0.6, 0.6))), life: 0.8 });
}

// ---------- damage and eliminations ----------
function chest(f) { return new V3(f.pos.x, f.pos.y + 3.3, f.pos.z); }
function headPos(f) { return new V3(f.pos.x, f.pos.y + 4.65, f.pos.z); }
const ray = new THREE.Raycaster();
function blockedBetween(a, b) {
  const d = b.clone().sub(a), len = d.length();
  ray.set(a, d.divideScalar(len)); ray.far = len;
  return ray.intersectObjects(worldMeshes, false).length > 0;
}

function damage(target, amount, attacker, key, head) {
  if (!target.alive || game.state !== 'fight') return;
  amount = Math.max(1, Math.round(amount));
  target.hp -= amount; target.lastHurt = clock;
  if (target.isPlayer) {
    sfx.hurt(); flashVignette(); if (attacker && attacker !== target) damageDir(attacker);
    shake = Math.max(shake, 0.25);
  } else {
    target.alertT = clock + 2.5;
    if (attacker && attacker !== target && attacker.alive && !target.visible) { target.goal = attacker.pos.clone(); target.goalT = 4; }
  }
  if (attacker && attacker.isPlayer && target !== attacker) {
    hitmarker(head); sfx.hit(head); damageNumber(headPos(target), amount, head);
  }
  if (target.hp <= 0) eliminate(target, attacker, key, head);
}

function eliminate(victim, killer, key, head) {
  victim.hp = 0; victim.alive = false; victim.deaths++; victim.deadT = 0;
  victim.avatar.root.visible = true;
  if (victim.avatar.gun) victim.avatar.gun.visible = true;
  if (killer && killer !== victim) killer.kills++;
  addKillfeed(killer, victim, key, head);
  if (killer && killer.isPlayer && victim !== killer) {
    const c = head ? 15 : 10; addCoins(c);
    sfx.kill(); killNotice(`ELIMINATED ${victim.name}${head ? ' · HEADSHOT' : ''}  +${c} 🪙`);
  }
  if (victim.isPlayer) {
    adsAmt = 0; healT = 0;
    showBig('ELIMINATED', killer && killer !== victim ? `by ${killer.name} · ${Math.ceil(killer.hp)} HP left` : 'Oops!');
  }
  if (game.mode === 'duel') {
    const winner = victim === fighters[0] ? 1 : 0;
    game.score[winner]++;
    game.state = 'roundEnd'; game.t = 3;
    if (!victim.isPlayer) { addCoins(20); showBig('ROUND WON', `${game.score[0]} - ${game.score[1]}  ·  +20 🪙`); }
    else $('smallMsg').textContent += ` · ${game.score[0]} - ${game.score[1]}`;
  } else {
    victim.respawnAt = clock + 3;
    if (killer && killer.kills >= game.goal) { game.state = 'roundEnd'; game.t = 2.5; game.over = true; showBig(killer.isPlayer ? 'YOU WIN!' : `${killer.name} WINS`, ''); }
  }
}

// ---------- HUD ----------
let vigT = 0, hmT = 0, killT = 0, bigT = 0;
function showHud(on) { $('hud').classList.toggle('hidden', !on); $('touch').classList.toggle('hidden', !(on && isTouch)); }
function showBig(big, small, time = 2.2) { $('bigMsg').textContent = big; $('smallMsg').textContent = small; bigT = time; }
function killNotice(text, time = 1.6) { const k = $('killMsg'); k.textContent = text; killT = time; }
function hitmarker(head) { $('hitmarker').classList.toggle('head', !!head); hmT = 0.18; }
function flashVignette() { vigT = 0.5; }
function damageDir(attacker) {
  const dx = attacker.pos.x - player.pos.x, dz = attacker.pos.z - player.pos.z;
  const fwd = dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw);
  const right = dx * Math.cos(player.yaw) + dz * -Math.sin(player.yaw);
  const el = document.createElement('div'); el.className = 'ddir';
  el.style.transform = `rotate(${Math.atan2(right, fwd)}rad)`;
  $('dmgDirs').appendChild(el);
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900 }).onfinish = () => el.remove();
}
function addKillfeed(killer, victim, key, head) {
  const row = document.createElement('div');
  const name = f => `<span class="${f.isPlayer ? 'me' : ''}">${f.name}</span>`;
  row.innerHTML = killer && killer !== victim
    ? `${name(killer)}<span class="w">${WEAPONS[key] ? WEAPONS[key].short : ''}${head ? ' ◎' : ''}</span>${name(victim)}`
    : `${name(victim)}<span class="w">✕</span>`;
  const kf = $('killfeed'); kf.prepend(row);
  while (kf.children.length > 5) kf.lastChild.remove();
  setTimeout(() => row.remove(), 5000);
}
function updateSlotsHud() {
  if (!player) return;
  const el = $('slots'); el.innerHTML = '';
  player.loadout.forEach((k, i) => {
    const w = WEAPONS[k], d = document.createElement('div');
    d.className = 'slot' + (i === player.slot ? ' on' : '') + (i === 3 && player.util <= 0 ? ' empty' : '');
    d.innerHTML = `<span class="k">${i + 1}</span><span class="ic">${['🔫', '🔫', '🗡️', { medkit: '➕', pad: '⏫', grenade: '💣' }[w.type]][i]}</span>${w.short}${i === 3 ? ' ×' + player.util : ''}`;
    el.appendChild(d);
  });
}
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).innerHTML = v; } }
function updateHud(dt) {
  const f = player;
  setText('hpNum', String(Math.max(0, Math.ceil(f.hp))));
  $('hpFill').style.width = Math.max(0, f.hp) + '%';
  $('hpFill').style.background = f.hp > 50 ? '' : f.hp > 25 ? 'linear-gradient(#ffd166,#e0a020)' : 'linear-gradient(#ff6b6b,#d02a2a)';
  const key = curKey(f), w = WEAPONS[key];
  setText('wName', w.name);
  if (w.type === 'gun') setText('ammoNum', `${f.ammo[key]}<small> / ${w.mag}</small>`);
  else if (w.type === 'melee') setText('ammoNum', '∞');
  else setText('ammoNum', `${f.util}<small> left</small>`);
  const rb = $('reloadBar');
  const busy = f.reloadT > 0 ? 1 - f.reloadT / w.reload : healT > 0 ? 1 - healT : -1;
  rb.style.visibility = busy >= 0 ? 'visible' : 'hidden';
  if (busy >= 0) $('reloadFill').style.width = busy * 100 + '%';

  if (game.mode === 'duel') {
    setText('scoreTop', `<div class="sbox me"><small>YOU</small>${game.score[0]}</div><div class="sround">ROUND ${game.round}<br>First to ${game.goal}</div><div class="sbox them"><small>${fighters[1].name}</small>${game.score[1]}</div>`);
  } else {
    const top = fighters.slice().sort((a, b) => b.kills - a.kills);
    const rank = top.indexOf(player) + 1;
    setText('scoreTop', `<div class="sbox me"><small>YOU · #${rank}</small>${player.kills}</div><div class="sround">First to ${game.goal}</div><div class="sbox them"><small>${top[0] === player ? top[1].name : top[0].name}</small>${top[0] === player ? top[1].kills : top[0].kills}</div>`);
  }

  // crosshair spreads out when your shots will
  const scoped = w.scope && adsAmt > 0.85;
  $('scope').style.display = scoped ? 'block' : 'none';
  const showCh = f.alive && w.type !== 'medkit' && !scoped;
  $('crosshair').classList.toggle('target', onTarget);
  $('crosshair').style.display = showCh ? '' : 'none';
  if (showCh) {
    const sp = w.type === 'gun' ? currentSpread(w) : 0.01;
    const gap = 4 + Math.tan(sp) * (window.innerHeight / 2) / Math.tan(camera.fov * Math.PI / 360);
    const ch = $('crosshair').children;
    ch[0].style.top = (-gap - 9) + 'px'; ch[1].style.top = gap + 'px';
    ch[2].style.left = (-gap - 9) + 'px'; ch[3].style.left = gap + 'px';
  }

  hmT -= dt; $('hitmarker').style.opacity = hmT > 0 ? 1 : 0;
  vigT -= dt;
  const low = f.alive && f.hp < 35 ? 0.35 + Math.sin(clock * 6) * 0.1 : 0;
  $('vignette').style.opacity = Math.max(low, vigT * 1.6, f.alive ? 0 : 0.6);
  killT -= dt; $('killMsg').style.opacity = clamp(killT * 2, 0, 1);
  bigT -= dt; $('center').style.opacity = clamp(bigT * 2, 0, 1);
}

// ---------- your weapon (viewmodel) ----------
let vmHold = null, vmGun = null;
const VM_SCALE = 0.22, VM_HIP = new V3(0.3, -0.3, -0.6);
function limb(from, to, thick, mat) {
  const d = to.clone().sub(from), m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, d.length()), mat);
  m.position.copy(from).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new V3(0, 0, 1), d.normalize());
  return m;
}
function buildViewmodel() {
  if (vmHold) vmRoot.remove(vmHold);
  const key = curKey(player), w = WEAPONS[key], look = player.look;
  vmHold = new THREE.Group(); vmHold.rotation.y = Math.PI; vmHold.scale.setScalar(VM_SCALE);
  vmGun = gunModel(key, save.wraps[key], save.charms[key]); vmHold.add(vmGun);
  const skin = lam(look.skin), sleeve = lam(look.sleeves === 'long' ? look.shirt : look.skin), shirt = lam(look.sleeves === 'none' ? look.skin : look.shirt);
  // right hand on the grip, arm going back towards the bottom right of the screen
  const rHand = new V3(0, -0.15, -0.05), rElbow = new V3(-1.3, -1.9, -2.6), rShoulder = new V3(-2.2, -3.6, -5);
  vmHold.add(limb(rHand, rElbow, 0.62, sleeve), limb(rElbow, rShoulder, 0.7, shirt));
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.62), skin); hand.position.copy(rHand); vmHold.add(hand);
  if (w.type === 'gun' || w.type === 'medkit') {
    // left hand under the front of the gun
    const lHand = vmGun.userData.fore.clone().add(new V3(0, -0.2, 0));
    const lElbow = w.pistol || w.type === 'medkit' ? new V3(1.4, -1.7, -2.2) : new V3(1.6, -1.6, -0.6);
    const lShoulder = lElbow.clone().add(new V3(1.2, -1.8, -3));
    vmHold.add(limb(lHand, lElbow, 0.6, sleeve), limb(lElbow, lShoulder, 0.68, shirt));
    const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.62), skin); h2.position.copy(lHand); vmHold.add(h2);
  }
  vmRoot.add(vmHold);
  vmRoot.position.copy(VM_HIP);
}
const muzzleWorld = new V3();
function playerMuzzle() {
  if (vmGun && vmRoot.visible) {
    vmGun.userData.muzzle.getWorldPosition(muzzleWorld);
    return muzzleWorld.applyMatrix4(camera.matrixWorld);
  }
  camera.getWorldPosition(muzzleWorld);
  return muzzleWorld.add(new V3(0, -0.3, 0));
}

// ---------- shooting ----------
function currentSpread(w) {
  const f = player, sp = Math.hypot(f.vel.x, f.vel.z) / WALK;
  let s = lerp(w.spread, w.ads, adsAmt) + sp * 0.022 * (1 - adsAmt * 0.6);
  if (!f.onGround) s += 0.035;
  return s;
}
function falloff(w, d) {
  if (!w.fall) return 1;
  const [r, min] = w.fall;
  return d <= r ? 1 : Math.max(min, 1 - (d - r) / (r * 1.5) * (1 - min));
}
function hittables(except) {
  const list = worldMeshes.slice();
  for (const f of fighters) if (f !== except && f.alive) list.push(...f.avatar.parts);
  return list;
}
const camDir = new V3(), camRight = new V3(), camUp = new V3(), camPos = new V3();
function playerFire() {
  const f = player, key = curKey(f), w = WEAPONS[key];
  f.ammo[key]--;
  camera.updateMatrixWorld();
  camera.getWorldDirection(camDir); camera.getWorldPosition(camPos);
  camRight.crossVectors(camDir, UP).normalize(); camUp.crossVectors(camRight, camDir);
  const spread = currentSpread(w), muzzle = playerMuzzle().clone(), list = hittables(f);
  for (const o of fighters) o.avatar.root.updateMatrixWorld(true);
  const hits = new Map();
  for (let p = 0; p < (w.pellets || 1); p++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const d = camDir.clone().addScaledVector(camRight, Math.cos(a) * r).addScaledVector(camUp, Math.sin(a) * r).normalize();
    ray.set(camPos, d); ray.far = w.range;
    const hs = ray.intersectObjects(list, false);
    let end;
    if (hs.length) {
      const h = hs[0]; end = h.point;
      const tf = h.object.userData.fighter;
      if (tf) {
        const head = h.object.userData.part === 'head';
        const e = hits.get(tf) || { dmg: 0, head: false };
        e.dmg += w.dmg * (head ? w.head : 1) * falloff(w, h.distance); e.head = e.head || head;
        hits.set(tf, e);
        burst(h.point, head ? 0xff4d5a : 0xffd166, 3, 6);
      } else burst(h.point, 0x8a8a8a, 4, 7);
    } else end = camPos.clone().addScaledVector(d, w.range);
    if (p < 4) tracer(muzzle, end);
  }
  for (const [tf, e] of hits) damage(tf, e.dmg, f, key, e.head);
  sfx.shot(key);
  const kick = w.recoil * (1 - adsAmt * 0.4);
  f.pitch += kick; recoilDebt += kick * 0.55; f.yaw += rand(-1, 1) * kick * 0.25;
  vmKick = Math.min(1, vmKick + (w.pellets || w.scope || w.dmg > 40 ? 1 : 0.45));
  f.flashT = 0.05;
  shake = Math.max(shake, w.recoil * 2);
}
function playerMelee() {
  const f = player, key = curKey(f), w = WEAPONS[key];
  swingT = 1; sfx.swing();
  camera.getWorldDirection(camDir); camera.getWorldPosition(camPos);
  for (const o of fighters) o.avatar.root.updateMatrixWorld(true);
  // a few rays in a small fan so swings are forgiving
  const list = hittables(f);
  for (const off of [0, -0.12, 0.12, -0.25, 0.25]) {
    const d = camDir.clone().applyAxisAngle(UP, off);
    ray.set(camPos, d); ray.far = w.reach;
    const h = ray.intersectObjects(list, false)[0];
    if (h && h.object.userData.fighter) { damage(h.object.userData.fighter, w.dmg, f, key, false); burst(h.point, 0xffd166, 4, 6); return; }
    if (h) { burst(h.point, 0x8a8a8a, 3, 5); return; }
  }
}
function throwGrenade(f, pad) {
  camera.getWorldDirection(camDir); camera.getWorldPosition(camPos);
  const mesh = pad ? jumpPadModel(wrapMaterial(save.wraps.jumppad)) : gunModel('grenade', save.wraps.grenade, save.charms.grenade);
  mesh.position.copy(camPos).addScaledVector(camDir, 1.6);
  scene.add(mesh);
  const vel = camDir.clone().multiplyScalar(pad ? 34 : 48).add(new V3(0, 9, 0)).addScaledVector(f.vel, 0.5);
  grenades.push({ mesh, pos: mesh.position, vel, t: pad ? 25 : 2, owner: f, pad, landed: false });
  sfx.swing();
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t -= dt;
    if (g.pad && g.landed) {
      // anyone who steps on a jump pad flies up
      for (const f of fighters) {
        if (f.alive && Math.abs(f.pos.x - g.pos.x) < 2.3 && Math.abs(f.pos.z - g.pos.z) < 2.3 && f.pos.y > g.pos.y - 0.6 && f.pos.y < g.pos.y + 1 && f.vel.y <= 1) {
          f.vel.y = 62; f.onGround = false;
          if (f.isPlayer || (player && player.pos.distanceTo(f.pos) < 40)) sfx.boing();
        }
      }
      g.mesh.children.forEach(c => { if (c.material && c.material.type === 'MeshBasicMaterial') c.material.color.setHSL(0.53, 1, 0.6 + Math.sin(clock * 6) * 0.1); });
      if (g.t <= 0) { scene.remove(g.mesh); grenades.splice(i, 1); }
      continue;
    }
    g.vel.y -= GRAV * dt;
    for (const ax of ['x', 'y', 'z']) {
      const old = g.pos[ax]; g.pos[ax] += g.vel[ax] * dt;
      if (insideBox(g.pos, 0.3)) {
        g.pos[ax] = old;
        if (g.pad && ax === 'y' && g.vel.y < 0) {
          // land flat on whatever is underneath
          let top = 0;
          for (const b of boxes) if (g.pos.x > b.min.x && g.pos.x < b.max.x && g.pos.z > b.min.z && g.pos.z < b.max.z && b.max.y <= g.pos.y + 0.5) top = Math.max(top, b.max.y);
          g.pos.y = top; g.landed = true; g.vel.set(0, 0, 0); g.mesh.rotation.set(0, 0, 0);
          break;
        }
        g.vel[ax] *= -0.4;
        if (ax === 'y') { g.vel.x *= 0.7; g.vel.z *= 0.7; }
      }
    }
    if (!g.landed) g.mesh.rotation.x += dt * 8;
    if (!g.pad && g.t <= 0) { explode(g.pos.clone(), g.owner); scene.remove(g.mesh); grenades.splice(i, 1); }
  }
}
function insideBox(p, r) {
  for (const b of boxes) if (p.x + r > b.min.x && p.x - r < b.max.x && p.y + r > b.min.y && p.y - r < b.max.y && p.z + r > b.min.z && p.z - r < b.max.z) return true;
  return false;
}
function explode(pos, owner) {
  explosionFx(pos);
  const dp = player ? player.pos.distanceTo(pos) : 99;
  sfx.boom(clamp(1.4 - dp / 90, 0.2, 1));
  shake = Math.max(shake, clamp(1.6 - dp / 25, 0, 1.2));
  const RAD = 15;
  for (const f of fighters) {
    if (!f.alive) continue;
    const c = chest(f), d = c.distanceTo(pos);
    if (d > RAD) continue;
    let dmg = 100 * Math.pow(1 - d / RAD, 0.7);
    if (blockedBetween(pos.clone().add(new V3(0, 0.5, 0)), c)) dmg *= 0.25;
    if (f === owner) dmg *= 0.5;
    if (dmg >= 1) damage(f, dmg, owner, 'grenade', false);
  }
}

// ---------- auto shoot ----------
let onTarget = false;
function enemyInSights(w) {
  const f = player;
  camPos.set(f.pos.x, f.pos.y + EYE, f.pos.z);
  camDir.set(-Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), -Math.cos(f.yaw) * Math.cos(f.pitch));
  ray.set(camPos, camDir);
  ray.far = w.type === 'melee' ? w.reach : Math.min(w.range, (w.eff || 60) * 2.5);
  const h = ray.intersectObjects(hittables(f), false)[0];
  return !!(h && h.object.userData.fighter);
}

// ---------- player update ----------
function updatePlayer(dt) {
  const f = player, key = curKey(f), w = WEAPONS[key];
  const frozen = game.state === 'countdown';
  // moving
  const k = input.keys;
  let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + input.moveX;
  let mz = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + input.moveY;
  const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
  const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
  const wx = -sy * mz + cy * mx, wz = -cy * mz - sy * mx;
  const sprint = (input.keys.ShiftLeft || input.keys.ShiftRight || input.moveY > 0.95) && mz > 0.3 && adsAmt < 0.3;
  const speed = frozen ? 0 : WALK * (w.speed || 1) * (1 - adsAmt * 0.35) * (sprint ? 1.3 : 1) * (healT > 0 ? 0.5 : 1);
  physicsMove(f, wx, wz, speed, input.jump && !frozen, dt);
  input.jump = false;
  if (f.pos.y < -30) { f.pos.set(DUEL_SPAWNS[0].x, 0, 0); f.vel.set(0, 0, 0); }

  // recoil slowly settles back
  const rec = Math.min(recoilDebt, dt * 0.6);
  f.pitch -= rec; recoilDebt -= rec;
  f.pitch = clamp(f.pitch, -1.5, 1.5);

  // weapon
  if (f.swapT > 0) f.swapT -= dt;
  if (f.reloadT > 0) { f.reloadT -= dt; if (f.reloadT <= 0) f.ammo[key] = w.mag; }
  if (healT > 0) {
    healT -= dt;
    if (healT <= 0) { f.hp = Math.min(100, f.hp + 50); f.util--; sfx.heal(); updateSlotsHud(); if (f.util <= 0) setSlot(f, 0); }
  }
  const canAct = !frozen && f.swapT <= 0 && healT <= 0;
  // auto shoot on touch screens: fire by itself while the crosshair is on an enemy (head or body)
  onTarget = (w.type === 'gun' || w.type === 'melee') && !frozen && enemyInSights(w);
  const auto = isTouch && save.autoShoot && onTarget && f.reloadT <= 0;
  const wantAds = input.aim && w.type === 'gun' && f.reloadT <= 0 && f.swapT <= 0;
  adsAmt = clamp(adsAmt + (wantAds ? 1 : -1) * dt * (w.scope ? 6 : 9), 0, 1);

  if (f.burstLeft > 0 && clock >= f.burstNext) {
    if (f.ammo[key] > 0) playerFire();
    f.burstLeft--; f.burstNext = clock + w.burstGap;
  }
  if ((input.fire || clock < input.tapFire || auto) && canAct && clock >= f.nextFire && f.burstLeft === 0) {
    input.tapFire = 0;
    if (w.type === 'gun') {
      if (f.reloadT > 0) { /* still reloading */ } else if (f.ammo[key] > 0) {
        playerFire();
        if (w.burst) { f.burstLeft = w.burst - 1; f.burstNext = clock + w.burstGap; }
        f.nextFire = clock + w.rate;
        if (!w.auto) input.fire = false;
      } else { sfx.empty(); startReload(f); input.fire = false; }
    } else if (w.type === 'melee') {
      playerMelee(); f.nextFire = clock + w.rate;
    } else if (w.type === 'grenade' || w.type === 'pad') {
      if (f.util > 0) { throwGrenade(f, w.type === 'pad'); f.util--; f.nextFire = clock + w.rate; updateSlotsHud(); swingT = 1; }
      input.fire = false;
      if (f.util <= 0 || input.quickNade) setTimeout(() => { if (player === f && curKey(f) === key && f.alive) setSlot(f, input.lastSlot === 3 ? 0 : input.lastSlot); }, 450);
      input.quickNade = false;
    } else if (w.type === 'medkit') {
      if (f.util > 0 && f.hp < 100) healT = 1;
      input.fire = false;
    }
  }
  if (w.type === 'gun' && f.ammo[key] === 0 && f.reloadT <= 0 && f.burstLeft === 0 && clock >= f.nextFire) startReload(f);
}
function startReload(f) {
  const key = curKey(f), w = WEAPONS[key];
  if (w.type !== 'gun' || f.reloadT > 0 || f.ammo[key] >= w.mag) return;
  f.reloadT = w.reload; f.burstLeft = 0;
  if (f.isPlayer) sfx.reload();
}

// ---------- bots ----------
function angleTo(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function canSee(a, b) {
  const eye = new V3(a.pos.x, a.pos.y + EYE, a.pos.z);
  return !blockedBetween(eye, headPos(b)) || !blockedBetween(eye, chest(b));
}
function updateBot(b, dt) {
  const D = DIFF[game.diff], key = curKey(b), w = WEAPONS[key];
  const frozen = game.state === 'countdown';
  if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) b.ammo[key] = w.mag; }
  if (b.flashT > 0) b.flashT -= dt;

  b.think -= dt;
  if (b.think <= 0) {
    b.think = rand(0.12, 0.22);
    let best = null, bd = 1e9;
    for (const e of fighters) {
      if (e === b || !e.alive) continue;
      const dx = e.pos.x - b.pos.x, dz = e.pos.z - b.pos.z, d = Math.hypot(dx, dz);
      const inView = Math.abs(angleTo(b.yaw, Math.atan2(-dx, -dz))) < 1.05 || d < 12 || clock < b.alertT;
      if (d < bd && d < 260 && inView && canSee(b, e)) { best = e; bd = d; }
    }
    if (best !== b.target) { b.target = best; b.seeT = 0; }
    b.visible = !!best;
  }
  let wx = 0, wz = 0, jump = false;
  const speed = WALK * (w.speed || 1) * 0.9;
  const t = b.target;
  if (t && b.visible && t.alive) {
    b.seeT += dt;
    const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz);
    b.yaw += clamp(angleTo(b.yaw, want), -D.turn * dt, D.turn * dt);
    b.pitch = Math.atan2(t.pos.y + 3.6 - (b.pos.y + EYE), dist);
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    const fwd = dist > w.pref + 8 ? 1 : dist < w.pref - 8 ? -0.7 : 0;
    b.strafeT -= dt;
    if (b.strafeT <= 0 || b.blocked) { b.strafeDir = Math.random() < 0.2 ? 0 : (b.strafeDir >= 0 ? -1 : 1); b.strafeT = rand(0.5, 1.6); }
    const st = b.strafeDir * D.strafe;
    wx = fx * fwd + rx * st; wz = fz * fwd + rz * st;
    if (b.onGround && Math.random() < dt * 0.45 * D.strafe) jump = true;
    b.goal = t.pos.clone(); b.goalT = 4;
    if (!frozen && b.seeT > D.react + (w.scope ? 0.5 : 0) && Math.abs(angleTo(b.yaw, want)) < 0.25) botFire(b, t, dist, D);
  } else {
    // go find someone
    b.goalT -= dt;
    if (!b.goal || b.goalT <= 0 || Math.hypot(b.goal.x - b.pos.x, b.goal.z - b.pos.z) < 4) {
      const enemies = fighters.filter(e => e !== b && e.alive);
      if (enemies.length && Math.random() < 0.7) {
        const e = enemies.reduce((m, e) => (e.pos.distanceTo(b.pos) < m.pos.distanceTo(b.pos) ? e : m));
        b.goal = e.pos.clone();
      } else b.goal = pick(NAV).clone();
      b.goalT = rand(3, 6);
    }
    const dx = b.goal.x - b.pos.x, dz = b.goal.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    wx = dx / d; wz = dz / d;
    b.yaw += clamp(angleTo(b.yaw, Math.atan2(-dx, -dz)), -5 * dt, 5 * dt);
    b.pitch *= 0.9;
    if (b.blocked) {
      b.stuckT += dt;
      if (b.onGround) jump = true;
      if (b.stuckT > 0.7) { b.goal = pick(NAV).clone(); b.goalT = 2.5; b.stuckT = 0; }
    } else b.stuckT = Math.max(0, b.stuckT - dt);
    if (w.type === 'gun' && b.ammo[key] < w.mag && b.reloadT <= 0) b.reloadT = w.reload;
  }
  physicsMove(b, frozen ? 0 : wx, frozen ? 0 : wz, speed, jump && !frozen, dt);
  if (b.pos.y < -30) placeAtSpawn(b);
}
function botFire(b, t, dist, D) {
  const key = curKey(b), w = WEAPONS[key];
  if (b.reloadT > 0 || clock < b.nextFire) return;
  if (b.ammo[key] <= 0) { b.reloadT = w.reload; return; }
  const shots = w.burst || 1;
  b.ammo[key] = Math.max(0, b.ammo[key] - shots);
  b.nextFire = clock + (w.rate + (w.burst ? w.burstGap * 2 : 0)) * D.fireMul * (w.auto ? 1 : 1.25);
  let p = D.acc;
  if (dist > w.eff) p *= w.eff / dist;
  if (Math.hypot(t.vel.x, t.vel.z) > 12) p *= 0.8;
  if (!t.onGround) p *= 0.8;
  const muzzle = new V3();
  b.avatar.root.updateMatrixWorld(true);
  if (b.avatar.gun) b.avatar.gun.userData.muzzle.getWorldPosition(muzzle); else muzzle.copy(chest(b));
  let total = 0, head = false;
  for (let s = 0; s < shots; s++) {
    for (let i = 0; i < (w.pellets || 1); i++) {
      const hit = Math.random() < (w.pellets ? Math.min(0.95, p * (dist < 12 ? 1.6 : 1)) : p);
      const hd = hit && !w.pellets && Math.random() < D.head * (w.scope ? 0.5 : 1);
      if (hit) { total += w.dmg * (hd ? w.head : 1) * falloff(w, dist); head = head || hd; }
      if (i < 3) {
        const aim = (hd ? headPos(t) : chest(t)).add(hit ? new V3(rand(-0.4, 0.4), rand(-0.6, 0.6), rand(-0.4, 0.4)) : new V3(rand(-3, 3), rand(-2, 3), rand(-3, 3)));
        const end = aim.sub(muzzle).normalize().multiplyScalar(dist + (hit ? 0 : 30)).add(muzzle);
        tracer(muzzle, end, 0xffb070);
      }
    }
  }
  b.flashT = 0.06; b.kick = 1;
  const dp = player.alive ? b.pos.distanceTo(player.pos) : 60;
  sfx.shot(key, clamp(1.1 - dp / 160, 0.12, 0.9));
  if (total > 0) damage(t, total, b, key, head);
}

// ---------- animating everyone ----------
function animateFighter(f, dt) {
  const av = f.avatar;
  av.root.position.set(f.pos.x, f.pos.y, f.pos.z);
  av.root.rotation.y = f.yaw + Math.PI;
  if (!f.alive) {
    f.deadT += dt;
    av.body.rotation.x = -Math.min(1, f.deadT * 3) * Math.PI / 2;
    av.body.position.y = Math.min(1, f.deadT * 3) * 0.5;
    if (f.deadT > 2.2) av.root.position.y = f.pos.y - (f.deadT - 2.2) * 3;
    if (f.deadT > 3.5) av.root.visible = false;
    return;
  }
  const sp = Math.hypot(f.vel.x, f.vel.z);
  f.phase += dt * sp * 0.55;
  f.kick = Math.max(0, f.kick - dt * 8);
  f.swingT = Math.max(0, f.swingT - dt * 3);
  poseAvatar(av, { phase: f.phase, move: clamp(sp / WALK, 0, 1.2), pitch: f.pitch, hold: holdType(curKey(f)),
    air: !f.onGround, kick: f.kick * 0.15, swing: f.swingT });
  if (av.gun) av.gun.userData.flash.visible = f.flashT > 0;
}

// ---------- main loop ----------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  renderer.clear();
  if (game.state === 'menu') { renderMenu(dt); return; }
  if (!game.paused) step(dt);
  renderGame(dt);
}

function step(dt) {
  clock += dt;
  game.t -= dt;
  if (game.state === 'countdown') {
    const n = Math.ceil(game.t);
    if (n < game.beep && n > 0) { game.beep = n; sfx.beep(520); $('bigMsg').textContent = String(n); bigT = 1; }
    if (game.t <= 0) { game.state = 'fight'; showBig('FIGHT!', '', 0.8); sfx.beep(880); }
  } else if (game.state === 'roundEnd' && game.t <= 0) {
    if (game.mode === 'duel') {
      if (game.score.some(s => s >= game.goal)) endMatch(); else { game.round++; beginRound(); }
    } else if (game.over) endMatch();
    else game.state = 'fight';
  }
  if (game.state === 'over') return;

  if (player.alive) updatePlayer(dt);
  for (const f of fighters) {
    if (!f.isPlayer && f.alive) updateBot(f, dt);
    // free for all: come back after a few seconds
    if (!f.alive && game.mode === 'ffa' && !game.over && clock >= f.respawnAt) {
      if (!f.isPlayer) f.loadout = [pick(BOT_GUNS)];
      refill(f);
      placeAtSpawn(f);
      if (f.isPlayer) { recoilDebt = 0; showBig('', '', 0); buildViewmodel(); updateSlotsHud(); }
    }
    // free for all: health comes back if you stay out of trouble
    if (f.alive && game.mode === 'ffa' && clock - f.lastHurt > 5 && f.hp < 100) f.hp = Math.min(100, f.hp + dt * 20);
    animateFighter(f, dt);
  }
  updateGrenades(dt);
  updateEffects(dt);
  updateHud(dt);
}

function renderGame(dt) {
  const f = player;
  if (f.alive) {
    camera.position.set(f.pos.x, f.pos.y + EYE, f.pos.z);
    camera.rotation.set(f.pitch, f.yaw, 0);
  } else {
    // watch whoever got you
    const killer = fighters.find(o => o !== f && o.alive && o.target === f) || fighters.find(o => o !== f && o.alive);
    const look = killer ? chest(killer) : chest(f);
    const want = chest(f).add(new V3(0, 6, 0)).add(look.clone().sub(chest(f)).setY(0).normalize().multiplyScalar(-6));
    camera.position.lerp(want, Math.min(1, dt * 3));
    camera.lookAt(look);
  }
  if (shake > 0) {
    camera.position.add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * 0.12));
    shake = Math.max(0, shake - dt * 3);
  }
  const w = WEAPONS[curKey(f)];
  const fov = 80 / lerp(1, w.zoom || 1, adsAmt);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  renderer.render(scene, camera);

  // your hands and weapon
  vmRoot.visible = f.alive && !(w.scope && adsAmt > 0.85);
  if (vmRoot.visible && vmHold) {
    animateViewmodel(dt, w);
    renderer.clearDepth();
    renderer.render(vmScene, vmCam);
  }
}
let bob = 0;
function animateViewmodel(dt, w) {
  const f = player, sp = Math.hypot(f.vel.x, f.vel.z) / WALK;
  bob += dt * sp * 9;
  vmKick = Math.max(0, vmKick - dt * 7);
  swingT = Math.max(0, swingT - dt * (w.type === 'melee' ? 1 / w.rate : 3));
  const ads = new V3(0, -vmGun.userData.sightY * VM_SCALE, -0.5);
  const p = VM_HIP.clone().lerp(ads, adsAmt);
  const bobAmt = (1 - adsAmt * 0.8) * (f.onGround ? 1 : 0.3);
  p.x += Math.sin(bob) * 0.02 * sp * bobAmt; p.y += Math.abs(Math.cos(bob)) * 0.018 * sp * bobAmt;
  p.z += vmKick * 0.09;
  let rx = vmKick * 0.12, ry = 0, rz = 0;
  if (f.reloadT > 0) {
    const k = Math.sin((1 - f.reloadT / w.reload) * Math.PI);
    p.y -= k * 0.16; rx -= k * 0.5; rz += k * 0.4;
  }
  if (healT > 0) { p.y -= 0.08; rx += 0.3; }
  if (f.swapT > 0) p.y -= (f.swapT / 0.35) * 0.4;
  if (w.type === 'melee') {
    rx += 0.5;
    const s = Math.sin(swingT * Math.PI);
    rx -= s * 1.3; ry += s * 0.9; rz += s * 0.5; p.x -= s * 0.25;
  } else if (w.type === 'grenade' || w.type === 'pad') {
    const s = Math.sin(swingT * Math.PI); rx -= s * 1.2; p.z -= s * 0.2;
  }
  vmRoot.position.copy(p);
  // the crossbow bolt is only there when it's loaded
  if (vmGun.userData.bolt) vmGun.userData.bolt.visible = f.ammo[curKey(f)] > 0 && f.reloadT <= 0;
  // charms swing when you move, turn and shoot
  const ch = vmGun.userData.charm;
  if (ch) {
    const turn = clamp((f.yaw - (f.lastYaw ?? f.yaw)) / Math.max(dt, 0.001), -6, 6);
    f.lastYaw = f.yaw;
    ch.rotation.z = lerp(ch.rotation.z, Math.sin(bob * 0.5) * 0.35 * sp - turn * 0.08, Math.min(1, dt * 8));
    ch.rotation.x = lerp(ch.rotation.x, vmKick * 0.9 + Math.cos(bob * 0.5) * 0.15 * sp + (f.onGround ? 0 : 0.3), Math.min(1, dt * 8));
  }
  vmRoot.rotation.set(rx, ry, rz);
  const flashOn = f.flashT > 0;
  f.flashT -= dt;
  vmGun.userData.flash.visible = flashOn;
  vmLight.intensity = flashOn ? 2.5 : 0;
  if (flashOn) vmGun.userData.muzzle.getWorldPosition(vmLight.position);
  vmCam.fov = 70 - adsAmt * 10; vmCam.updateProjectionMatrix();
}

function endMatch() {
  game.state = 'over';
  showHud(false);
  unlockPointer();
  const t = $('endTitle'), body = $('endBody');
  if (game.mode === 'duel') {
    const won = game.score[0] > game.score[1];
    const c = won ? 100 : 25; addCoins(c);
    t.textContent = won ? '🏆 VICTORY' : '💀 DEFEAT';
    body.innerHTML = `<p style="font-size:28px;font-weight:900;margin:4px 0 10px">${game.score[0]} - ${game.score[1]}</p><p>vs ${fighters[1].name}</p><p class="coinsWon">+${c} 🪙 coins</p>`;
  } else {
    const top = fighters.slice().sort((a, b) => b.kills - a.kills);
    const c = top[0] === player ? 100 : 25; addCoins(c);
    t.textContent = top[0] === player ? '🏆 YOU WIN!' : `${top[0].name} wins`;
    body.innerHTML = `<p class="coinsWon">+${c} 🪙 coins</p><table>` + top.map((f, i) => `<tr class="${f.isPlayer ? 'me' : ''}"><td>${i + 1}. ${f.name}</td><td>${f.kills} / ${f.deaths}</td></tr>`).join('') + '</table>';
  }
  $('endScreen').classList.remove('hidden');
}
function toMenu() {
  clearMatch();
  game.state = 'menu'; game.paused = false;
  ['endScreen', 'pause'].forEach(id => $(id).classList.add('hidden'));
  $('menu').classList.remove('hidden');
  showHud(false);
  unlockPointer();
  refreshPreview();
  buildLoadoutTab(); buildCasesTab(); updateCoins();
}

// ---------- menu ----------
function renderMenu(dt) {
  if (!pDrag) pSpin += dt * 0.4;
  if (pAvatar) {
    pAvatar.root.rotation.y = pSpin;
    pAvatar.phase = (pAvatar.phase || 0) + dt;
    poseAvatar(pAvatar, { phase: 0, move: 0, pitch: Math.sin(pAvatar.phase * 0.8) * 0.06 - 0.05, hold: holdType(previewKey || save.loadout.primary) });
    pAvatar.body.position.y = Math.sin(pAvatar.phase * 2) * 0.03;
  }
  if (pGun) {
    pGun.rotation.set(0.15, -Math.PI / 2 + Math.sin(performance.now() / 1400) * 0.7, -0.45);
    const ch = pGun.children[0].userData.charm;
    if (ch) ch.rotation.z = Math.sin(performance.now() / 300) * 0.25;
  }
  pCam.position.set(0, 3.6, 15); pCam.lookAt(0.6, 2.7, 0);
  renderer.render(pScene, pCam);
}
function refreshPreview() {
  if (pAvatar) pScene.remove(pAvatar.root);
  pAvatar = buildAvatar(save.look);
  const k = previewKey || save.loadout.primary;
  setAvatarGun(pAvatar, k, save.wraps[k], save.charms[k]);
  pAvatar.root.position.x = -1.6;
  // big weapon showcase next to the avatar
  if (pGun) pScene.remove(pGun);
  const inner = gunModel(k, save.wraps[k], save.charms[k]);
  const bb = new THREE.Box3().setFromObject(inner), size = bb.getSize(new V3()), mid = bb.getCenter(new V3());
  inner.position.sub(mid);
  pGun = new THREE.Group(); pGun.add(inner);
  pGun.scale.setScalar(4.4 / Math.max(size.x, size.y, size.z, 0.8));
  pGun.position.set(3.6, 3.3, 0);
  pScene.add(pGun);
  pScene.add(pAvatar.root);
}

function buildLoadoutTab() {
  const el = $('tab-loadout'); el.innerHTML = '';
  const bar = (label, v) => `<div class="stat"><span>${label}</span><i><em style="width:${clamp(v, 0.04, 1) * 100}%"></em></i></div>`;
  for (const s of SLOTS) {
    el.insertAdjacentHTML('beforeend', `<div class="label">${s.label}</div>`);
    const grid = document.createElement('div'); grid.className = 'wgrid';
    for (const k of s.list) {
      const w = WEAPONS[k], b = document.createElement('button');
      b.className = 'wcard' + (save.loadout[s.key] === k ? ' on' : '');
      let stats = '';
      if (w.type === 'gun') {
        const dps = w.dmg * (w.pellets || 1) * (w.burst || 1) / w.rate;
        stats = bar('Damage', w.dmg * (w.pellets || 1) / 100) + bar('Speed', dps / 260) + bar('Range', (w.eff || 30) / 120);
      } else if (w.type === 'melee') stats = bar('Damage', w.dmg / 100) + bar('Speed', 0.3 / w.rate);
      b.innerHTML = `<b>${w.name}</b><small>${w.desc}</small>${stats}`;
      b.onclick = () => { save.loadout[s.key] = k; previewKey = k; persist(); buildLoadoutTab(); refreshPreview(); };
      grid.appendChild(b);
    }
    el.appendChild(grid);
    // skin and charm for the weapon picked in this slot
    const k = save.loadout[s.key];
    const pickRow = (label, kind, all) => {
      const row = document.createElement('div'); row.className = 'cosmetics';
      row.innerHTML = `<span>${label}</span>`;
      for (const id of Object.keys(all).filter(id => save.owned[kind].includes(id))) {
        const cur = (save[kind][k] || (kind === 'wraps' ? 'default' : 'none')) === id;
        const b = document.createElement('button');
        b.className = 'chip' + (cur ? ' on' : '');
        b.style.setProperty('--r', RARITY[all[id].rarity].color);
        b.textContent = all[id].name;
        b.onclick = () => { save[kind][k] = id; previewKey = k; persist(); buildLoadoutTab(); refreshPreview(); };
        row.appendChild(b);
      }
      if (save.owned[kind].length === 1) row.insertAdjacentHTML('beforeend', '<small>Open cases to get more</small>');
      el.appendChild(row);
    };
    if (WEAPONS[k].type !== 'medkit') { pickRow('Skin', 'wraps', WRAPS); pickRow('Charm', 'charms', CHARMS); }
  }
}

// ---------- cases ----------
let opening = false;
function updateCoins() { document.querySelectorAll('.coinCount').forEach(e => { e.textContent = save.coins.toLocaleString(); }); }
function rollItem(items) {
  const ids = Object.keys(items).filter(id => id !== 'default' && id !== 'none');
  let total = 0;
  for (const id of ids) total += RARITY[items[id].rarity].weight;
  let r = Math.random() * total;
  for (const id of ids) { r -= RARITY[items[id].rarity].weight; if (r <= 0) return id; }
  return ids[ids.length - 1];
}
function buildCasesTab() {
  const el = $('tab-cases'); el.innerHTML = '';
  el.insertAdjacentHTML('beforeend', `<p class="coinLine">You have <b class="coinCount"></b> 🪙 coins. Get more by eliminating bots (+10, headshot +15), winning duel rounds (+20) and finishing matches (+25, win +100).</p>`);
  for (const id in CASES) {
    const c = CASES[id], box = document.createElement('div'); box.className = 'case';
    const odds = Object.keys(RARITY).map(r => {
      const names = Object.keys(c.items).filter(i => i !== 'default' && i !== 'none' && c.items[i].rarity === r).map(i => c.items[i].name);
      return `<span style="color:${RARITY[r].color}">${names.join(', ')}</span>`;
    }).join(' · ');
    box.innerHTML = `<div class="caseTop"><b>${c.name}</b><button class="openBtn">Open · ${c.price} 🪙</button></div><small>${c.desc}</small><div class="odds">${odds}</div><div class="reel"></div>`;
    const btn = box.querySelector('.openBtn'), reel = box.querySelector('.reel');
    btn.disabled = save.coins < c.price;
    btn.onclick = () => {
      if (opening || save.coins < c.price) return;
      opening = true; ac();
      addCoins(-c.price); updateCoins();
      document.querySelectorAll('.openBtn').forEach(b => { b.disabled = true; });
      const won = rollItem(c.items), names = Object.keys(c.items).filter(i => i !== 'default' && i !== 'none');
      let n = 0, delay = 50;
      const spin = () => {
        n++;
        const show = n > 24 ? won : pick(names), it = c.items[show];
        reel.innerHTML = `<div class="reelItem" style="--r:${RARITY[it.rarity].color}">${it.name}</div>`;
        if (n <= 24) { sfx.tick(); delay *= 1.1; setTimeout(spin, delay); return; }
        const dupe = save.owned[c.kind].includes(won);
        if (dupe) addCoins(Math.floor(c.price / 2)); else save.owned[c.kind].push(won);
        persist(); sfx.reveal(it.rarity);
        reel.innerHTML = `<div class="reelItem won" style="--r:${RARITY[it.rarity].color}"><small>${RARITY[it.rarity].name}</small>${it.name}<em>${dupe ? `You already had it: +${Math.floor(c.price / 2)} 🪙 back` : 'New! Put it on a weapon in Loadout.'}</em></div>`;
        opening = false; buildLoadoutTab();
        updateCoins();
        document.querySelectorAll('.openBtn').forEach((b, i) => { b.disabled = save.coins < CASES[Object.keys(CASES)[i]].price; });
      };
      spin();
    };
    el.appendChild(box);
  }
  const have = document.createElement('div'); have.className = 'collection';
  const list = (kind, all) => Object.keys(all).filter(i => i !== 'default' && i !== 'none')
    .map(i => `<span class="chip${save.owned[kind].includes(i) ? ' on' : ' locked'}" style="--r:${RARITY[all[i].rarity].color}">${save.owned[kind].includes(i) ? '' : '🔒 '}${all[i].name}</span>`).join('');
  have.innerHTML = `<div class="label">Your skins</div><div class="row">${list('wraps', WRAPS)}</div><div class="label">Your charms</div><div class="row">${list('charms', CHARMS)}</div>`;
  el.appendChild(have);
  updateCoins();
}
function buildAvatarTab() {
  const el = $('tab-avatar'); el.innerHTML = '';
  const L = save.look;
  const set = (k, v) => { L[k] = v; persist(); buildAvatarTab(); refreshPreview(); };
  const swatches = (label, key, colors) => {
    el.insertAdjacentHTML('beforeend', `<div class="label">${label}</div>`);
    const row = document.createElement('div'); row.className = 'swatches';
    for (const c of colors) {
      const b = document.createElement('button'); b.className = 'sw' + (L[key] === c ? ' on' : ''); b.style.background = c;
      b.onclick = () => set(key, c); row.appendChild(b);
    }
    el.appendChild(row);
  };
  const options = (label, key, opts) => {
    el.insertAdjacentHTML('beforeend', `<div class="label">${label}</div>`);
    const row = document.createElement('div'); row.className = 'row';
    for (const k in opts) {
      const b = document.createElement('button'); b.className = 'opt' + (L[key] === k ? ' on' : ''); b.textContent = opts[k];
      b.onclick = () => set(key, k); row.appendChild(b);
    }
    el.appendChild(row);
  };
  swatches('Skin', 'skin', SKINS);
  swatches('Shirt', 'shirt', CLOTHES);
  options('Sleeves', 'sleeves', { tee: 'T-shirt', long: 'Long sleeves', none: 'No sleeves' });
  swatches('Pants', 'pants', CLOTHES);
  options('Hair / hat', 'hair', HAIRS);
  swatches('Hair / hat color', 'hairColor', HAIR_COLORS);
  options('Face', 'face', FACES);
  const row = document.createElement('div'); row.className = 'row'; row.style.marginTop = '16px';
  const btn = (text, fn) => { const b = document.createElement('button'); b.className = 'opt'; b.textContent = text; b.onclick = fn; row.appendChild(b); };
  btn('🎲 Random', () => { save.look = randomLook(); persist(); buildAvatarTab(); refreshPreview(); });
  btn('Classic noob', () => { save.look = { ...NOOB_LOOK }; persist(); buildAvatarTab(); refreshPreview(); });
  btn('Reset', () => { save.look = { ...DEFAULT_LOOK }; persist(); buildAvatarTab(); refreshPreview(); });
  el.appendChild(row);
}
function syncPlayTab() {
  document.querySelectorAll('#autoRow button').forEach(b => b.classList.toggle('on', (b.dataset.auto === 'on') === save.autoShoot));
  document.querySelectorAll('#modeRow button').forEach(b => b.classList.toggle('on', b.dataset.mode === save.mode));
  document.querySelectorAll('#diffRow button').forEach(b => b.classList.toggle('on', b.dataset.diff === save.diff));
  $('sens').value = save.sens; $('sensVal').textContent = save.sens.toFixed(1);
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  for (const t of ['play', 'loadout', 'avatar', 'cases']) $('tab-' + t).classList.toggle('hidden', t !== b.dataset.tab);
  if (b.dataset.tab === 'cases' && !opening) buildCasesTab();
});
document.querySelectorAll('#modeRow button').forEach(b => b.onclick = () => { save.mode = b.dataset.mode; persist(); syncPlayTab(); });
document.querySelectorAll('#diffRow button').forEach(b => b.onclick = () => { save.diff = b.dataset.diff; persist(); syncPlayTab(); });
document.querySelectorAll('#autoRow button').forEach(b => b.onclick = () => { save.autoShoot = b.dataset.auto === 'on'; persist(); syncPlayTab(); });
$('sens').oninput = e => { save.sens = parseFloat(e.target.value); persist(); syncPlayTab(); };
$('startBtn').onclick = () => { ac(); $('menu').classList.add('hidden'); startMatch(); };
$('againBtn').onclick = () => { $('endScreen').classList.add('hidden'); startMatch(); };
$('menuBtn').onclick = toMenu;
$('quitBtn').onclick = toMenu;
$('resumeBtn').onclick = () => { resume(); };

// spin the preview avatar by dragging
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', e => { if (game.state === 'menu') pDrag = { x: e.clientX, spin: pSpin }; });
window.addEventListener('pointermove', e => { if (pDrag) pSpin = pDrag.spin + (e.clientX - pDrag.x) * 0.012; });
window.addEventListener('pointerup', () => { pDrag = null; });

// ---------- input: keyboard and mouse ----------
// phones and tablets start in touch mode; any touch switches it on later too
let isTouch = matchMedia('(pointer: coarse)').matches;
function setTouchMode() {
  isTouch = true;
  $('help').innerHTML = 'Drag on the left side to move. Drag on the right side to look, tap it to shoot (or hold FIRE). With auto shoot on, your gun fires by itself when the crosshair is on an enemy. Tap AIM to aim, tap it again to stop. ⇄ switches weapon.';
  if (!$('hud').classList.contains('hidden')) $('touch').classList.remove('hidden');
}
if (isTouch) setTouchMode();
const playing = () => game.state !== 'menu' && game.state !== 'over';
// Some pages (like the shared game link) don't allow locking the mouse.
// Then you hold a mouse button and drag to look instead.
let lockBlocked = false, lastTouch = 0;
function lockPointer() {
  if (isTouch || lockBlocked || !canvas.requestPointerLock) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { lockBlocked = true; }); } catch (e) { lockBlocked = true; }
}
document.addEventListener('pointerlockerror', () => { lockBlocked = true; });
function unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }
function pause() { if (!playing() || game.paused) return; game.paused = true; input.fire = false; if (!isTouch) input.aim = false; $('pause').classList.remove('hidden'); }
function resume() { game.paused = false; $('pause').classList.add('hidden'); lockPointer(); }
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && playing() && !isTouch) pause(); });
canvas.addEventListener('click', () => { if (playing() && !isTouch && !document.pointerLockElement && !game.paused) lockPointer(); });

function look(dx, dy, scale) {
  if (!player || !player.alive || game.paused) return;
  const z = lerp(1, WEAPONS[curKey(player)].zoom || 1, adsAmt);
  player.yaw -= dx * scale * save.sens / z;
  player.pitch = clamp(player.pitch - dy * scale * save.sens / z, -1.5, 1.5);
}
const fromTouch = () => performance.now() - lastTouch < 1000;
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) look(e.movementX, e.movementY, 0.0022);
  else if (playing() && e.buttons && !fromTouch()) look(e.movementX, e.movementY, 0.004);
});
canvas.addEventListener('mousedown', e => {
  if (!playing() || game.paused || fromTouch()) return;
  if (!document.pointerLockElement && !lockBlocked) return; // this click asks to lock the mouse
  if (e.button === 0) input.fire = true;
  if (e.button === 2) input.aim = true;
});
window.addEventListener('mouseup', e => { if (e.button === 0) input.fire = false; if (e.button === 2) input.aim = false; });
window.addEventListener('contextmenu', e => { if (playing()) e.preventDefault(); });
window.addEventListener('wheel', e => {
  if (!playing() || !player || !player.alive) return;
  setSlot(player, (player.slot + (e.deltaY > 0 ? 1 : 3)) % 4);
});
window.addEventListener('keydown', e => {
  if (!playing()) return;
  input.keys[e.code] = true;
  if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
  if (!player || !player.alive || game.paused) return;
  if (e.code === 'KeyR') startReload(player);
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (n >= 0) setSlot(player, n);
  if (e.code === 'KeyQ') setSlot(player, input.lastSlot);
  if (e.code === 'KeyG' && ['grenade', 'pad'].includes(WEAPONS[player.loadout[3]].type) && player.util > 0) { setSlot(player, 3); player.swapT = 0.15; input.fire = true; input.quickNade = true; }
  if (e.code === 'KeyP') pause();
});
window.addEventListener('keyup', e => { input.keys[e.code] = false; });
window.addEventListener('blur', () => { input.keys = {}; input.fire = false; if (!isTouch) input.aim = false; });

// ---------- input: touch ----------
function setAimToggle(on) { input.aim = on; $('tAim').classList.toggle('on', on); }
{
  const stick = $('stick'), knob = $('knob');
  let stickId = null, lookId = null, lastLook = null, lookStart = null;
  const btn = (id, down, up) => {
    const el = $(id);
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); ac(); down(); }, { passive: false });
    el.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); if (up) up(); }, { passive: false });
  };
  btn('tFire', () => { input.fire = true; }, () => { input.fire = false; });
  // tap AIM once to aim, tap again to stop
  btn('tAim', () => setAimToggle(!input.aim));
  btn('tJump', () => { input.jump = true; });
  btn('tReload', () => { if (player) startReload(player); });
  btn('tSwap', () => { if (player && player.alive) setSlot(player, (player.slot + 1) % 4); });
  btn('tPause', () => pause());
  // the joystick jumps to wherever your thumb lands on the left side
  let stickCenter = null;
  const setStick = t => {
    const max = stick.offsetWidth / 2;
    let dx = t.clientX - stickCenter.x, dy = t.clientY - stickCenter.y;
    const m = Math.hypot(dx, dy);
    if (m > max) { dx *= max / m; dy *= max / m; }
    input.moveX = dx / max; input.moveY = -dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const resetStick = () => { stick.style.left = stick.style.top = stick.style.bottom = ''; knob.style.transform = ''; input.moveX = input.moveY = 0; };
  window.addEventListener('touchstart', e => {
    lastTouch = performance.now();
    if (!isTouch) setTouchMode();
    if (!playing() || game.paused) return;
    ac();
    for (const t of e.changedTouches) {
      if (stickId === null && t.clientX < window.innerWidth * 0.4) {
        stickId = t.identifier;
        const half = stick.offsetWidth / 2;
        stick.style.left = (t.clientX - half) + 'px'; stick.style.top = (t.clientY - half) + 'px'; stick.style.bottom = 'auto';
        stickCenter = { x: t.clientX, y: t.clientY };
        setStick(t);
      } else if (lookId === null && t.clientX >= window.innerWidth * 0.4) {
        lookId = t.identifier; lastLook = { x: t.clientX, y: t.clientY };
        lookStart = { x: t.clientX, y: t.clientY, time: performance.now(), moved: 0 };
      }
    }
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    lastTouch = performance.now();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) setStick(t);
      if (t.identifier === lookId) {
        look(t.clientX - lastLook.x, t.clientY - lastLook.y, 0.0055);
        lastLook = { x: t.clientX, y: t.clientY };
        lookStart.moved = Math.max(lookStart.moved, Math.hypot(t.clientX - lookStart.x, t.clientY - lookStart.y));
      }
    }
    if (playing()) e.preventDefault();
  }, { passive: false });
  const endTouch = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; resetStick(); }
      if (t.identifier === lookId) {
        lookId = null;
        // a quick tap without dragging shoots
        if (e.type === 'touchend' && lookStart && lookStart.moved < 14 && performance.now() - lookStart.time < 300) input.tapFire = clock + 0.3;
      }
    }
  };
  window.addEventListener('touchend', endTouch); window.addEventListener('touchcancel', endTouch);
}

// ---------- start ----------
resize();
syncPlayTab();
buildLoadoutTab();
buildAvatarTab();
buildCasesTab();
refreshPreview();
requestAnimationFrame(frame);
// for automated checks
window.__game = { game, input, get player() { return player; }, get fighters() { return fighters; }, startMatch, WEAPONS };
