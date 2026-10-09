// Core game: renderer, levels, travel, input, physics, the player, the pet, bullets, particles and sounds.
'use strict';

const $ = id => document.getElementById(id);
const RUN_SPEED = 5.5, GRAVITY = 28, JUMP_V = 9.2, SWIM_SPEED = 4.6;
const TAU = Math.PI * 2;
const BLOCKS_PER_MILE = 100;

// ---------- saved progress ----------
// each player name has its own save on this device
const SAVE_KEY = 'monster-mash-save-v1';
const LAST_NAME_KEY = 'monster-mash-last-name';
let playerName = '';
function saveKey(name) { return SAVE_KEY + ':' + name.trim().toLowerCase(); }
function defaultSave() {
  return {
    step: 0, radar: false, progress: 0, beaten: {}, weapons: ['bat'], weapon: 'bat', armor: 0,
    eggs: {}, pets: ['turtle'], active: 0, scuba: false, rocket: false, scrolls: [], dummyHits: 0,
    coins: 0, decor: [], planet: 'island', planetData: {},
  };
}
function readSave(key) {
  try {
    const s = JSON.parse(localStorage.getItem(key));
    if (s && Array.isArray(s.pets) && s.pets.length) return Object.assign(defaultSave(), s);
  } catch (e) { /* no saved game */ }
  return null;
}
function loadSave(name) {
  if (!name) return defaultSave();
  let s = readSave(saveKey(name));
  if (!s) {
    // a game saved before names existed goes to the first name typed in
    s = readSave(SAVE_KEY);
    if (s) { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage blocked */ } }
  }
  return s || defaultSave();
}
function hasSave(name) { return !!(name && readSave(saveKey(name))); }
function lastName() { try { return localStorage.getItem(LAST_NAME_KEY) || ''; } catch (e) { return ''; } }
let save = defaultSave();
function writeSave() {
  if (!playerName) return;
  save.planetData[save.planet] = { progress: save.progress, beaten: save.beaten, scrolls: save.scrolls };
  try { localStorage.setItem(saveKey(playerName), JSON.stringify(save)); localStorage.setItem(LAST_NAME_KEY, playerName); } catch (e) { /* storage blocked */ }
}
// each planet has its own boss progress
function loadPlanetState(pid) {
  if (save.planet && save.planet !== pid) save.planetData[save.planet] = { progress: save.progress, beaten: save.beaten, scrolls: save.scrolls };
  const pd = save.planetData[pid] || (pid === 'island' && !save.planetData.island ? { progress: save.progress, beaten: save.beaten, scrolls: save.scrolls } : {});
  save.planet = pid;
  save.progress = pd.progress || 0; save.beaten = pd.beaten || {}; save.scrolls = pd.scrolls || [];
}
function planetUnlocked(pid) {
  const i = PLANET_ORDER.indexOf(pid);
  if (i <= 0) return true;
  const prev = PLANET_ORDER[i - 1];
  const pd = prev === save.planet ? { progress: save.progress } : save.planetData[prev];
  return !!(pd && pd.progress >= 4) || isAdmin();
}
function addCoins(n) { save.coins = (save.coins || 0) + n; writeSave(); if (typeof updateCoins === 'function') updateCoins(); }

// typing the name Ari gives admin powers: the best weapons, armor and pet
const ADMIN_NAME = 'ari';
function isAdmin() { return playerName.trim().toLowerCase() === ADMIN_NAME; }
function applyAdmin() {
  for (const id of ['magmaAxe', 'sunBeam']) if (!save.weapons.includes(id)) save.weapons.push(id);
  save.weapon = 'sunBeam';
  save.armor = ARMORS.length - 1;
  if (!save.pets.includes('infernoSpiderRainbow')) save.pets.push('infernoSpiderRainbow');
  save.active = save.pets.indexOf('infernoSpiderRainbow');
  save.rocket = true;
  save.admin = true;
}
function eggCount() { return Object.values(save.eggs).reduce((a, b) => a + b, 0); }

// ---------- renderer ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 320);
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const atlas = drawAtlas();
const blockMat = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true });
const waterMat = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false });

// ---------- game state ----------
const G = {
  running: false, paused: false, time: 0, modal: null, transitioning: false, dead: false, cutscene: null,
  level: null, levels: {}, world: null, slot: 0, shake: 0, movedDist: 0, regenT: 0, diveT: 0, whalesDone: false,
};
const cam = { yaw: 0, pitch: 0.35, pitchOverride: null };

function makeEntity(hw, h) {
  return { pos: new THREE.Vector3(), vel: new THREE.Vector3(), hw, h, onGround: false, blocked: false, inWater: false, facing: 0, lockT: 0 };
}
const player = Object.assign(makeEntity(0.3, 1.8), { hp: 20, maxHp: 20, invuln: 0, swingT: 0, swingCd: 0, mounted: false, walkPhase: 0, model: null, eggHeld: null, slowT: 0 });
const pet = Object.assign(makeEntity(0.4, 1), { model: null, speed: 7, stuckT: 0, species: 'turtle' });

// ---------- physics ----------
function collidesAt(world, x, y, z, hw, h) {
  const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - 1e-6);
  const y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-6);
  const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw - 1e-6);
  for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++)
    if (world.solid(xx, yy, zz)) return true;
  return false;
}

function stepEntity(e, dt, world, h = e.h) {
  const feet = world.get(Math.floor(e.pos.x), Math.floor(e.pos.y + 0.3), Math.floor(e.pos.z));
  e.inWater = feet === B.WATER;
  e.vel.y -= GRAVITY * (e.inWater ? 0.3 : 1) * dt;
  if (e.inWater) e.vel.y = Math.max(e.vel.y, e.diving ? -7 : -3);
  e.vel.y = Math.max(e.vel.y, -40);
  const mx = e.vel.x * dt, my = e.vel.y * dt, mz = e.vel.z * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(my), Math.abs(mz)) / 0.2));
  e.onGround = false; e.blocked = false;
  for (let i = 0; i < steps; i++) {
    e.pos.x += mx / steps;
    if (collidesAt(world, e.pos.x, e.pos.y, e.pos.z, e.hw, h)) { e.pos.x -= mx / steps; e.blocked = true; }
    e.pos.z += mz / steps;
    if (collidesAt(world, e.pos.x, e.pos.y, e.pos.z, e.hw, h)) { e.pos.z -= mz / steps; e.blocked = true; }
    e.pos.y += my / steps;
    if (collidesAt(world, e.pos.x, e.pos.y, e.pos.z, e.hw, h)) {
      if (my < 0) { e.pos.y = Math.floor(e.pos.y) + 1; e.onGround = true; }
      else e.pos.y = Math.floor(e.pos.y + h) - h - 0.001;
      e.vel.y = 0;
    }
  }
  if (!e.onGround && e.vel.y <= 0 && collidesAt(world, e.pos.x, e.pos.y - 0.05, e.pos.z, e.hw, h)) e.onGround = true;
}

function autoJump(e, world, dirX, dirZ, h = e.h) {
  if (!e.blocked || !(e.onGround || e.inWater)) return;
  const len = Math.hypot(dirX, dirZ);
  if (len < 0.01) return;
  const ax = e.pos.x + (dirX / len) * 0.45, az = e.pos.z + (dirZ / len) * 0.45;
  if (!collidesAt(world, ax, e.pos.y + 1.05, az, e.hw, h)) e.vel.y = JUMP_V;
}

// ---------- input ----------
const keys = {};
const touch = { active: false, moveX: 0, moveZ: 0, jump: false, attack: false, down: false };
const mouse = { locked: false, fallback: false, down: false, dragged: false, lastX: 0, lastY: 0, attackHeld: false };

function moveInput() {
  let x = 0, z = 0;
  if (keys.KeyW || keys.ArrowUp) z += 1;
  if (keys.KeyS || keys.ArrowDown) z -= 1;
  if (keys.KeyA) x -= 1;
  if (keys.KeyD) x += 1;
  x += touch.moveX; z += touch.moveZ;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return { x, z };
}

function frozen() { return G.modal || dialogState || G.transitioning || G.dead || G.paused || G.cutscene; }

// ---------- levels ----------
let gus, dummy, incubator, shopkeeper, clouds, caveLight, buoy, decorGroup;
const portalMats = [];
const decorModels = {};

// build every place on a planet (throws away the old planet's meshes first)
function buildLevels(pid = 'island') {
  for (const k in G.levels) {
    G.levels[k].group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    if (G.level === G.levels[k]) scene.remove(G.level.group);
  }
  G.levels = {}; G.level = null; portalMats.length = 0;
  PLANET = pid;
  setupLayout(pid);
  setPlanetBosses(pid);
  const over = generateOverworld();
  over.buildAll(blockMat, waterMat);
  G.levels.overworld = makeOverworldLevel(over);
  for (const id of ['rabbit', 'sand', 'coral', 'crystal']) {
    const w = generateBossCave(id);
    w.buildAll(blockMat, waterMat);
    G.levels[id] = makeCaveLevel(w, id);
  }
  const deep = generateDeep();
  deep.buildAll(blockMat, waterMat);
  G.levels.deep = makeDeepLevel(deep);
}

function makeOverworldLevel(over) {
  const LY = OVER.layout;
  const L = { world: over, group: new THREE.Group(), sky: LY.sky, fog: new THREE.Fog(LY.sky, 55, 170) };
  L.group.add(over.group);
  L.group.add(new THREE.HemisphereLight(0xdff0ff, LY.ground, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 0.65);
  sun.position.set(60, 120, 30);
  L.group.add(sun);
  gus = makeVillagerModel();
  gus.root.position.set(OVER.guide.x, over.groundAt(OVER.guide.x, OVER.guide.z), OVER.guide.z);
  gus.root.rotation.y = Math.PI / 2;
  const tag = textSprite('Guide Gus', '#ffcf4a', 0.9);
  tag.position.y = 2.45; gus.root.add(tag);
  gus.mark = textSprite('!', '#ffcf4a', 1.4, null);
  gus.mark.position.y = 2.95; gus.root.add(gus.mark);
  L.group.add(gus.root);
  dummy = makeDummyModel();
  dummy.root.position.set(OVER.dummy.x, over.groundAt(OVER.dummy.x, OVER.dummy.z), OVER.dummy.z);
  dummy.root.rotation.y = -Math.PI / 2;
  dummy.wobble = 0; dummy.wobbleV = 0;
  L.group.add(dummy.root);
  // your house: a sign, the bed and the egg incubator
  const H = OVER.home;
  const homeSign = textSprite('YOUR HOUSE', '#ffcf4a', 1.3);
  homeSign.position.set(H.x0 + H.sx / 2, OVER.village.h + 4.2, H.z0 + H.sz + 0.6);
  L.group.add(homeSign);
  incubator = makeIncubatorModel();
  incubator.position.set(OVER.incubator.x, OVER.village.h, OVER.incubator.z);
  L.group.add(incubator);
  const incEggs = {};
  for (const type in EGGS) { const e = eggMesh(0.75, type); e.position.set(0, 0.42, 0); e.visible = false; incubator.add(e); incEggs[type] = e; }
  const incLight = new THREE.PointLight(0xffcf4a, 0.8, 6);
  incLight.position.set(OVER.incubator.x, OVER.village.h + 1.5, OVER.incubator.z);
  L.group.add(incLight);
  const incTag = textSprite('Egg Incubator', '#ffe9a0', 0.7);
  incTag.position.set(OVER.incubator.x, OVER.village.h + 2, OVER.incubator.z);
  L.group.add(incTag);
  // the shop at the end of the street
  const S = OVER.shop;
  const shopSign = textSprite('SHOP', '#7aff9a', 1.6);
  shopSign.position.set(S.x0 - 0.4, OVER.village.h + 4.4, S.z0 + S.sz / 2);
  L.group.add(shopSign);
  shopkeeper = makeVillagerModel();
  shopkeeper.root.position.set(OVER.shopkeeper.x, OVER.village.h, OVER.shopkeeper.z);
  shopkeeper.root.rotation.y = -Math.PI / 2;
  const skTag = textSprite('Shopkeeper Sue', '#7aff9a', 0.85);
  skTag.position.y = 2.45; shopkeeper.root.add(skTag);
  L.group.add(shopkeeper.root);
  // decorations you've bought, inside your house
  decorGroup = new THREE.Group();
  L.group.add(decorGroup);
  for (const d of DECOR) {
    const m = makeDecorModel(d.id);
    const [x, y, z, ry] = decorSpot(d.id);
    m.position.set(x, y, z); m.rotation.y = ry;
    decorGroup.add(m); decorModels[d.id] = m;
  }
  updateDecor();
  // doors: a sign over each, and a swirly portal at the end of each tunnel
  for (const id in DOORS) {
    const d = DOORS[id];
    const sign = textSprite(d.label, d.color, 2);
    sign.position.set(d.x + 0.5 - d.dir[0], d.floor + d.h + 2.2, d.z + 0.5 - d.dir[1]);
    L.group.add(sign);
    const mat = new THREE.MeshBasicMaterial({ map: swirlTexture(id), transparent: true, opacity: 0.95 });
    portalMats.push(mat);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), mat);
    portal.position.set(d.portal.x, d.floor + d.h / 2, d.portal.z);
    portal.rotation.y = Math.atan2(-d.dir[0], -d.dir[1]);
    L.group.add(portal);
  }
  // a purple beam over the crystal mountain
  const beamMat = new THREE.MeshBasicMaterial({ color: LY.beam, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.6, 160, 1.6), beamMat);
  beam.position.set(OVER.mountain.x, over.groundAt(OVER.mountain.x, OVER.mountain.z) + 80, OVER.mountain.z);
  L.group.add(beam);
  buoy = makeBuoyModel();
  buoy.position.set(OVER.diveSpot.x, OVER.water - 0.3, OVER.diveSpot.z);
  L.group.add(buoy);
  const diveSign = textSprite('DIVE SPOT', '#7ad8ff', 1.4);
  diveSign.position.set(OVER.diveSpot.x, OVER.water + 3.2, OVER.diveSpot.z);
  L.group.add(diveSign);
  clouds = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, fog: false });
  const rng = makeRng(7);
  for (let i = 0; i < 34; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(8 + rng() * 14, 2, 6 + rng() * 10), cloudMat);
    c.position.set(rng() * 280 - 40, 64 + rng() * 6, rng() * 280 - 40);
    clouds.add(c);
  }
  L.group.add(clouds);
  L.update = dt => {
    clouds.children.forEach(c => { c.position.x += dt * 1.3; if (c.position.x > 250) c.position.x = -40; });
    portalMats.forEach(m => { m.map.rotation += dt * 0.8; });
    gus.mark.visible = save.step === 1 || save.step === 4;
    gus.mark.position.y = 2.95 + Math.sin(G.time * 3) * 0.1;
    const a = Math.atan2(player.pos.x - gus.root.position.x, player.pos.z - gus.root.position.z);
    gus.head.rotation.y = THREE.MathUtils.clamp(angleDiff(a, gus.root.rotation.y), -0.9, 0.9);
    dummy.wobbleV += (-dummy.wobble * 60 - dummy.wobbleV * 6) * dt;
    dummy.wobble += dummy.wobbleV * dt;
    dummy.body.rotation.z = dummy.wobble;
    const fish = decorModels.fishTank && decorModels.fishTank.userData.fish;
    if (fish) fish.forEach((f, i) => { f.position.x = Math.sin(G.time * (0.8 + i * 0.3) + i) * 0.45; f.rotation.y = Math.cos(G.time * (0.8 + i * 0.3) + i) > 0 ? 0 : Math.PI; });
    if (decorModels.disco) decorModels.disco.userData.ball.rotation.y += dt * 1.5;
    if (decorModels.tv) decorModels.tv.userData.screen.material.color.setHSL((G.time * 0.1) % 1, 0.6, 0.5);
    shopkeeper.head.rotation.y = THREE.MathUtils.clamp(angleDiff(Math.atan2(player.pos.x - shopkeeper.root.position.x, player.pos.z - shopkeeper.root.position.z), shopkeeper.root.rotation.y), -0.9, 0.9);
    buoy.position.y = OVER.water - 0.3 + Math.sin(G.time * 1.5) * 0.12;
    buoy.rotation.z = Math.sin(G.time * 1.1) * 0.08;
    const showType = Object.keys(EGGS).find(k => save.eggs[k] > 0);
    for (const type in incEggs) { incEggs[type].visible = type === showType; incEggs[type].rotation.z = Math.sin(G.time * 6) * 0.08; }
    if (eggCount() > 0 && Math.random() < dt * 3) burst(new THREE.Vector3(OVER.incubator.x + (Math.random() - 0.5), OVER.village.h + 1.6, OVER.incubator.z + (Math.random() - 0.5)), 0xffcf4a, 1, 0.6, 0.07, 1, -0.5);
  };
  return L;
}

// where each decoration goes in your house: [x, y, z, turn]
function decorSpot(id) {
  const H = OVER.home, f = OVER.village.h, x = H.x0, z = H.z0;
  return {
    flower: [x + 1.5, f, z + 7.5, 0], rug: [x + 7, f, z + 4.5, 0], lamp: [x + 11.4, f, z + 1.6, 0],
    bookshelf: [x + 5.5, f, z + 1.35, 0], couch: [x + 7.5, f, z + 7.45, Math.PI], painting: [x + 8.8, f + 1.7, z + 1.06, 0],
    fishTank: [x + 10.8, f, z + 7.4, Math.PI], tv: [x + 1.4, f, z + 4.5, Math.PI / 2], trophy: [x + 10, f, z + 1.4, 0],
    rainbowBed: [x + 1.5, f - 0.5, z + 1.5, 0], statue: [x + 15, f, z + 1.5, -Math.PI / 2], disco: [x + 7, f + 2.6, z + 4.5, 0],
  }[id];
}
function updateDecor() { for (const id in decorModels) decorModels[id].visible = (save.decor || []).includes(id); }

function makeCaveLevel(w, id) {
  const st = w.style;
  const L = { world: w, group: new THREE.Group(), sky: st.sky, fog: new THREE.Fog(st.fog[0], st.fog[1], st.fog[2]), id };
  L.group.add(w.group);
  L.group.add(new THREE.AmbientLight(0xb0a0d0, 0.65));
  L.light = new THREE.PointLight(0xffd9a0, 0.9, 14);
  L.group.add(L.light);
  const lc = new THREE.Color(st.light[0][0], st.light[0][1], st.light[0][2]);
  const roomLight = new THREE.PointLight(lc, 1.1, 32);
  roomLight.position.set(CAVE.room.x, CAVE.floor + 8, CAVE.room.z);
  L.group.add(roomLight);
  // hanging vines
  if (w.vines.length) {
    const vineMat = pixMat(0x3f8a2a, { spread: 0.4 }), leafMat = pixMat(0x5ab84a, { spread: 0.3 });
    for (const v of w.vines) {
      const m = box(0.12, v.len, 0.12, vineMat, v.x, v.top - v.len / 2, v.z, L.group);
      for (let y = 0.4; y < v.len; y += 0.7) box(0.26, 0.12, 0.04, leafMat, v.x + (y % 1.4 > 0.7 ? 0.08 : -0.08), v.top - y, v.z, L.group);
      m.userData.vine = true;
    }
  }
  // sunlight through the hole in the roof
  if (st.sunHole) {
    const skyDisk = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, fog: false }));
    skyDisk.rotation.x = Math.PI / 2;
    skyDisk.position.set(CAVE.room.x, w.H + 0.5, CAVE.room.z);
    L.group.add(skyDisk);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.6, w.H - CAVE.floor, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    beam.position.set(CAVE.room.x, (w.H + CAVE.floor) / 2, CAVE.room.z);
    L.group.add(beam);
    const sunLight = new THREE.PointLight(0xfff0c0, 1.4, 20);
    sunLight.position.set(CAVE.room.x, CAVE.floor + 6, CAVE.room.z);
    L.group.add(sunLight);
  }
  const exitGlow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55 }));
  exitGlow.position.set(CAVE.start.x, CAVE.floor + 2, 1.02);
  L.group.add(exitGlow);
  const outSign = textSprite('Way out', '#bfe6ff', 0.9);
  outSign.position.set(CAVE.start.x, CAVE.floor + 4.5, 1.6);
  L.group.add(outSign);
  L.arena = createArena(L, id);
  L.update = dt => {
    L.light.position.set(player.pos.x, player.pos.y + 2.2, player.pos.z);
    updateArena(L.arena, dt);
  };
  return L;
}

function makeDeepLevel(w) {
  const L = { world: w, group: new THREE.Group(), sky: 0x2a7fd0, fog: new THREE.Fog(0x2a7fd0, 6, 48) };
  L.group.add(w.group);
  L.group.add(new THREE.HemisphereLight(0x9ad8ff, 0x0a2a4a, 0.9));
  L.whales = [makeWhaleModel(), makeWhaleModel()];
  L.whales.forEach(m => { m.visible = false; L.group.add(m); });
  L.coralCave = makeCoralCaveModel();
  L.coralCave.visible = false;
  L.group.add(L.coralCave);
  const top = new THREE.Color(0x2a7fd0), bottom = new THREE.Color(0x041228);
  L.update = dt => {
    const d = THREE.MathUtils.clamp(1 - player.pos.y / DEEP.top, 0, 1);
    scene.background.copy(top).lerp(bottom, d);
    scene.fog.color.copy(scene.background);
    if (Math.random() < dt * 12) {
      const p = new THREE.Vector3(player.pos.x + (Math.random() - 0.5) * 14, player.pos.y - 4 + Math.random() * 8, player.pos.z + (Math.random() - 0.5) * 14);
      burst(p, 0xd8f4ff, 1, 0.5, 0.1, 2.5, -2.5);
    }
    L.whales.forEach(m => { if (m.visible) m.userData.tail.rotation.x = Math.sin(G.time * 3) * 0.3; });
    if (L.coralCave.visible) {
      const c = L.coralCave.position;
      const a = player.mounted ? pet : player;
      if (Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 4.5 && Math.abs(a.pos.y - c.y) < 5) travel('coral');
    }
  };
  return L;
}

function swirlTexture(id) {
  const tint = { rabbit: [70, 40, 20], sand: [90, 60, 20], crystal: [40, 15, 70] }[id] || [40, 15, 70];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = x - 32, dy = y - 32, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const v = (Math.sin(a * 3 + d * 0.35) + 1) / 2;
    ctx.fillStyle = `rgb(${Math.round(tint[0] * (0.4 + v))},${Math.round(tint[1] * (0.4 + v))},${Math.round(tint[2] * (0.4 + v * 1.4))})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.center.set(0.5, 0.5);
  return t;
}

function setLevel(name) {
  if (G.level) scene.remove(G.level.group);
  G.level = G.levels[name];
  G.world = G.level.world;
  scene.add(G.level.group);
  scene.background = new THREE.Color(G.level.sky);
  scene.fog = G.level.fog;
  scene.fog.color.setHex(G.level.fog.color.getHex());
}

function placeActors(x, y, z, yaw) {
  const w = G.world;
  player.mounted = false;
  player.pos.set(x, y === null ? w.groundAt(x, z, w.name === 'overworld' ? w.H - 1 : CAVE.floor + 1) : y, z);
  player.vel.set(0, 0, 0);
  cam.yaw = yaw;
  player.facing = yaw + Math.PI;
  placePetNearPlayer();
}

function placePetNearPlayer() {
  const w = G.world;
  const side = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)).multiplyScalar(pet.model ? 1.3 + pet.model.halfW * 2 : 1.8);
  for (const k of [1, -1, 0.5, 0]) {
    const x = player.pos.x + side.x * k + (k === 0 ? 1.5 : 0), z = player.pos.z + side.z * k;
    const y = Math.max(player.pos.y, 0);
    if (!collidesAt(w, x, y, z, pet.hw, pet.h)) { pet.pos.set(x, y, z); pet.vel.set(0, 0, 0); return; }
  }
  pet.pos.copy(player.pos);
}

// go to another place: 'overworld' (needs `from`), a cave id, or 'deep'
function travel(to, from) {
  if (G.transitioning) return;
  G.transitioning = true;
  const wasMounted = player.mounted;
  $('fade').classList.add('on');
  sfx('whoosh');
  const prev = G.world ? G.world.name : null;
  setTimeout(() => {
    clearBullets();
    if (to === 'overworld') {
      setLevel('overworld');
      const src = from || prev;
      if (DOORS[src]) {
        const d = DOORS[src];
        placeActors(d.outside.x, null, d.outside.z, Math.atan2(d.dir[0], d.dir[1]));
      } else placeActors(OVER.beach.x, null, OVER.beach.z, Math.PI / 2 - Math.PI);
    } else if (to === 'deep') {
      setLevel('deep');
      G.diveT = 0;
      placeActors(DEEP.W / 2, DEEP.top, DEEP.D / 2, Math.PI);
      resetDeep();
    } else {
      setLevel(to);
      placeActors(CAVE.start.x, null, CAVE.start.z, Math.PI);
      onEnterArena(G.level.arena);
    }
    if (wasMounted && to !== 'deep') mountPet(true);
    $('fade').classList.remove('on');
    setTimeout(() => { G.transitioning = false; }, 250);
  }, 480);
}

function resetDeep() {
  const L = G.levels.deep;
  G.whalesDone = false;
  L.whales.forEach(m => { m.visible = false; });
  L.coralCave.visible = false;
}

// ---------- pets ----------
function spawnPet(speciesId) {
  const wasMounted = player.mounted;
  if (pet.model) pet.model.root.parent?.remove(pet.model.root);
  pet.species = speciesId;
  pet.model = makePetModel(speciesId);
  pet.speed = PET_SPECIES[speciesId].speed;
  pet.hw = Math.min(0.6, pet.model.halfW);
  pet.h = pet.model.height;
  scene.add(pet.model.root);
  if (wasMounted && G.world && collidesAt(G.world, pet.pos.x, pet.pos.y, pet.pos.z, pet.hw, mountedHeight())) dismount();
}
function mountedHeight() { return pet.model.saddleY + 1.25; }

function mountPet(silent) {
  if (!pet.model) return;
  if (G.world.name === 'deep') { if (!silent) showToast('You can\'t ride in the deep ocean. Just swim!'); return; }
  if (collidesAt(G.world, pet.pos.x, pet.pos.y, pet.pos.z, pet.hw, mountedHeight())) { if (!silent) showToast('No room to ride here'); return; }
  player.mounted = true;
  pet.vel.set(0, 0, 0);
  if (!silent) sfx('ride');
  if (save.step === 3) setStep(4);
}
function dismount() {
  player.mounted = false;
  const side = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  for (const s of [1, -1, 0]) {
    const x = pet.pos.x + side.x * s * 1.2, z = pet.pos.z + side.z * s * 1.2;
    const y = pet.pos.y + (s === 0 ? pet.model.saddleY : 0);
    if (!collidesAt(G.world, x, y, z, player.hw, player.h)) { player.pos.set(x, y, z); break; }
  }
  player.vel.set(0, 0, 0);
  sfx('ride');
}
function toggleRide() {
  if (frozen() || !pet.model) return;
  if (player.mounted) { dismount(); return; }
  if (player.eggHeld) { showToast('Your hands are full with the egg!'); return; }
  const d = Math.hypot(pet.pos.x - player.pos.x, pet.pos.z - player.pos.z);
  if (d < 2.6 + pet.model.halfW) mountPet();
  else showToast(`Walk closer to ${petShortName()} to ride`);
}
function petShortName() { return pet.species === 'turtle' ? 'Pebble' : 'your ' + PET_SPECIES[pet.species].name.split(' ').slice(-1)[0]; }

// ---------- movement ----------
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
function turnToward(cur, target, rate) { return cur + angleDiff(target, cur) * Math.min(1, rate); }

// player-controlled movement (from keys, joystick or a cutscene)
function updateMovement(dt, dx, dz, wantJump, wantDown, speedOverride) {
  const w = G.world;
  const actor = player.mounted ? pet : player;
  const h = player.mounted ? mountedHeight() : player.h;
  let speed = speedOverride || (player.mounted ? pet.speed : RUN_SPEED);
  if (actor.inWater && !speedOverride) speed = player.mounted ? Math.max(SWIM_SPEED, speed * 0.6) : SWIM_SPEED;
  if (player.slowT > 0) { speed *= 0.45; player.slowT -= dt; }
  if (actor.lockT > 0) { actor.lockT -= dt; dx = dz = 0; }
  const accel = actor.onGround ? 14 : (actor.inWater ? 8 : 5);
  const k = 1 - Math.exp(-accel * dt);
  if (actor.lockT <= 0) {
    actor.vel.x += (dx * speed - actor.vel.x) * k;
    actor.vel.z += (dz * speed - actor.vel.z) * k;
  }
  // water: scuba gear lets you dive, without it you float
  actor.diving = false;
  if (actor.inWater) {
    const canDive = save.scuba || w.name === 'deep';
    if (wantJump) actor.vel.y = 4.5;
    else if (wantDown && canDive) { actor.vel.y = -7; actor.diving = true; }
    if (!canDive && w.name === 'overworld' && actor.pos.y < OVER.water - 1.4) actor.vel.y = Math.max(actor.vel.y, 3);
  } else if (wantJump && actor.onGround) actor.vel.y = JUMP_V;
  stepEntity(actor, dt, w, h);
  autoJump(actor, w, dx, dz, h);
  const moving = Math.hypot(dx, dz) > 0.1;
  if (moving) actor.facing = turnToward(actor.facing, Math.atan2(dx, dz), dt * 12);
  if (player.swingT > 0 && !player.mounted) player.facing = turnToward(player.facing, cam.yaw + Math.PI, dt * 25);
  const hs = Math.hypot(actor.vel.x, actor.vel.z);
  if (save.step === 0) { G.movedDist += hs * dt; if (G.movedDist > 4) setStep(1); }
  if (player.mounted) {
    player.pos.set(pet.pos.x, pet.pos.y + pet.model.saddleY - 0.62, pet.pos.z);
    player.facing = pet.facing;
  } else updatePetFollow(dt);
  if (actor.pos.y < -8) respawnHere();
  return hs;
}

function controlPlayer(dt) {
  const inp = moveInput();
  const fwdX = -Math.sin(cam.yaw), fwdZ = -Math.cos(cam.yaw);
  const rightX = Math.cos(cam.yaw), rightZ = -Math.sin(cam.yaw);
  const dx = fwdX * inp.z + rightX * inp.x, dz = fwdZ * inp.z + rightZ * inp.x;
  return updateMovement(dt, dx, dz, keys.Space || touch.jump, keys.ShiftLeft || keys.ShiftRight || keys.KeyC || touch.down);
}

function updatePetFollow(dt) {
  const w = G.world;
  const dx = player.pos.x - pet.pos.x, dz = player.pos.z - pet.pos.z;
  const dist = Math.hypot(dx, dz);
  // in the deep ocean pets just swim along beside you
  if (w.name === 'deep') {
    const tx = player.pos.x + Math.cos(cam.yaw) * 1.8, ty = player.pos.y + 0.3, tz = player.pos.z - Math.sin(cam.yaw) * 1.8;
    const k = 1 - Math.exp(-dt * 3);
    pet.pos.x += (tx - pet.pos.x) * k; pet.pos.y += (ty - pet.pos.y) * k; pet.pos.z += (tz - pet.pos.z) * k;
    pet.vel.set(player.vel.x, 0, player.vel.z);
    pet.facing = turnToward(pet.facing, player.facing, dt * 4);
    return;
  }
  if (dist > 30 || Math.abs(player.pos.y - pet.pos.y) > 12) { placePetNearPlayer(); return; }
  const off = 1.3 + pet.model.halfW * 2;
  const sx = player.pos.x + Math.cos(cam.yaw) * off - Math.sin(cam.yaw) * 0.4 - pet.pos.x;
  const sz = player.pos.z - Math.sin(cam.yaw) * off - Math.cos(cam.yaw) * 0.4 - pet.pos.z;
  const sd = Math.hypot(sx, sz);
  let tx = 0, tz = 0;
  if (dist > 7 + pet.model.halfW) { tx = dx / dist * pet.speed * 1.2; tz = dz / dist * pet.speed * 1.2; }
  else if (sd > 0.8) { const sp = Math.min(pet.speed, sd * 3); tx = sx / sd * sp; tz = sz / sd * sp; }
  const k = 1 - Math.exp(-(pet.onGround ? 10 : 4) * dt);
  pet.vel.x += (tx - pet.vel.x) * k;
  pet.vel.z += (tz - pet.vel.z) * k;
  if (pet.inWater && player.pos.y > pet.pos.y + 0.5) pet.vel.y = Math.max(pet.vel.y, 3);
  stepEntity(pet, dt, w);
  autoJump(pet, w, tx, tz);
  if (Math.hypot(tx, tz) > 0.3) pet.facing = turnToward(pet.facing, Math.atan2(tx, tz), dt * 8);
  else pet.facing = turnToward(pet.facing, Math.atan2(dx, dz), dt * 2);
  if (dist > 6 && Math.hypot(pet.vel.x, pet.vel.z) < 0.6) { pet.stuckT += dt; if (pet.stuckT > 1.6) { placePetNearPlayer(); pet.stuckT = 0; } }
  else pet.stuckT = 0;
}

function respawnHere() {
  if (G.world.name === 'overworld') placeActors(OVER.spawn.x, null, OVER.spawn.z, cam.yaw);
  else if (G.world.name === 'deep') placeActors(DEEP.W / 2, DEEP.top, DEEP.D / 2, cam.yaw);
  else placeActors(CAVE.start.x, null, CAVE.start.z, Math.PI);
}

function updatePlayerModel(dt, hs) {
  const m = player.model;
  m.root.position.copy(player.pos);
  m.root.rotation.y = player.facing;
  player.walkPhase += dt * hs * 1.9;
  const swimming = player.inWater && !player.onGround && !player.mounted;
  const sw = player.mounted ? 0 : Math.sin(player.walkPhase) * Math.min(1, hs / 3) * 0.9;
  if (player.mounted) {
    m.legs.forEach((l, i) => { l.rotation.x = -1.35; l.rotation.z = (i ? -1 : 1) * 0.35; });
    m.arms[0].rotation.x = -0.5;
  } else if (swimming) {
    const kick = Math.sin(G.time * 8) * 0.5;
    m.legs.forEach((l, i) => { l.rotation.x = i ? kick : -kick; l.rotation.z = 0; });
    m.arms[0].rotation.x = -2.6 + Math.sin(G.time * 4) * 0.4;
  } else {
    m.legs.forEach((l, i) => { l.rotation.x = i ? -sw : sw; l.rotation.z = 0; });
    m.arms[0].rotation.x = -sw;
  }
  if (player.swingT > 0) {
    const p = 1 - player.swingT / 0.25;
    const gun = WEAPONS[save.weapon] && WEAPONS[save.weapon].kind === 'gun' && selectedItem() === 'weapon';
    m.arms[1].rotation.x = gun ? -1.5 - Math.sin(p * Math.PI) * 0.25 : -2.7 + Math.sin(p * Math.PI / 2) * 2.4;
    player.swingT -= dt;
  } else {
    const gun = WEAPONS[save.weapon] && WEAPONS[save.weapon].kind === 'gun' && selectedItem() === 'weapon';
    m.arms[1].rotation.x = player.mounted ? -0.6 : (player.eggHeld ? -1.0 : gun ? -1.3 : sw * 0.8 - 0.15);
  }
  m.head.rotation.x = THREE.MathUtils.clamp(-cam.pitch * 0.4, -0.4, 0.4);
  m.root.visible = !G.hidePlayer && !(player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0);
  m.setScuba(save.scuba && (G.world.name === 'deep' || player.inWater));
  const item = player.eggHeld ? 'egg:' + player.eggHeld : selectedItem();
  m.setHeld(item === 'weapon' ? save.weapon : item);
}

function updatePetModel(dt) {
  const m = pet.model;
  m.root.position.copy(pet.pos);
  m.root.rotation.y = pet.facing;
  m.animate(dt, Math.hypot(pet.vel.x, pet.vel.z), G.time);
}

const camTarget = new THREE.Vector3(), camDir = new THREE.Vector3();
function updateCamera(dt) {
  const ax = player.mounted ? pet : player;
  const headY = player.mounted ? pet.model.saddleY + 1.35 : 1.55;
  camTarget.set(ax.pos.x, ax.pos.y + headY, ax.pos.z);
  if (!G.cutscene) {
    if (keys.ArrowLeft) cam.yaw += dt * 2.4;
    if (keys.ArrowRight) cam.yaw -= dt * 2.4;
  }
  const pitch = cam.pitchOverride ?? cam.pitch;
  camDir.set(Math.sin(cam.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(cam.yaw) * Math.cos(pitch));
  const want = G.cutscene && G.cutscene.camDist ? G.cutscene.camDist : (player.mounted ? 5 + pet.model.saddleY * 0.9 : 5.5);
  const hit = G.world.raycast(camTarget, camDir, want + 0.3);
  const d = hit === null ? want : Math.max(0.5, hit - 0.35);
  camera.position.copy(camTarget).addScaledVector(camDir, d);
  if (G.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * G.shake;
    camera.position.y += (Math.random() - 0.5) * G.shake;
    G.shake = Math.max(0, G.shake - dt * 2.2);
  }
  if (G.cutscene && G.cutscene.camPos) camera.position.copy(G.cutscene.camPos);
  camera.lookAt(G.cutscene && G.cutscene.lookAt ? G.cutscene.lookAt : camTarget);
}

// ---------- bullets (guns) ----------
const bullets = [];
const bulletGeo = new THREE.BoxGeometry(0.16, 0.16, 0.7);
function shoot(weaponId) {
  const w = WEAPONS[weaponId];
  const from = playerCenter().add(new THREE.Vector3(0, 0.35, 0));
  // aim straight ahead, nudged toward the boss if it's roughly in front
  const dir = new THREE.Vector3(-Math.sin(cam.yaw), -Math.sin(cam.pitch) * 0.5 + 0.05, -Math.cos(cam.yaw)).normalize();
  const target = bossAimPoint();
  if (target) {
    const to = target.clone().sub(from).normalize();
    if (to.dot(dir) > 0.7) dir.copy(to);
  }
  const col = weaponId === 'rainbow' ? RAINBOW[Math.floor(Math.random() * 7)] : w.color;
  const m = new THREE.Mesh(bulletGeo, partMat(col));
  m.position.copy(from);
  m.lookAt(from.clone().add(dir));
  scene.add(m);
  bullets.push({ m, vel: dir.multiplyScalar(w.speed), life: 1.6, dmg: w.dmg, col });
  sfx('shoot');
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.m.position.addScaledVector(b.vel, dt);
    const p = b.m.position;
    let gone = b.life <= 0 || G.world.solid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    if (!gone && bulletHitsBoss(p, b.dmg)) gone = true;
    if (!gone && G.world.name === 'overworld' && p.distanceTo(dummy.root.position.clone().add(new THREE.Vector3(0, 1.3, 0))) < 0.8) {
      gone = true; dummy.wobbleV += 9; sfx('thud');
    }
    if (gone) { burst(p, b.col, 5, 3, 0.1, 0.4); scene.remove(b.m); bullets.splice(i, 1); }
  }
}
function clearBullets() { bullets.forEach(b => scene.remove(b.m)); bullets.length = 0; }

// ---------- particles, floating sprites, damage numbers ----------
const particles = [];
const partGeo = new THREE.BoxGeometry(1, 1, 1);
const partMats = new Map();
function partMat(color) {
  if (!partMats.has(color)) partMats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true }));
  return partMats.get(color);
}
function burst(pos, color, n = 10, speed = 4, size = 0.15, life = 0.7, gravity = 12) {
  for (let i = 0; i < n && particles.length < 600; i++) {
    const m = new THREE.Mesh(partGeo, partMat(color));
    m.position.copy(pos);
    m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
    scene.add(m);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    particles.push({ m, v, life: life * (0.6 + Math.random() * 0.6), max: life, gravity, size: m.scale.x });
  }
}
const floaters = [];
function floatSprite(sprite, pos, vel, life) {
  sprite.position.copy(pos);
  scene.add(sprite);
  floaters.push({ s: sprite, v: vel, life, max: life });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); continue; }
    p.v.y -= p.gravity * dt;
    p.m.position.addScaledVector(p.v, dt);
    p.m.scale.setScalar(p.size * Math.min(1, p.life / p.max * 1.5));
    p.m.rotation.x += dt * 5; p.m.rotation.y += dt * 4;
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    if (f.life <= 0) { scene.remove(f.s); f.s.material.map?.dispose(); f.s.material.dispose(); floaters.splice(i, 1); continue; }
    f.s.position.addScaledVector(f.v, dt);
    f.s.material.opacity = Math.min(1, f.life / f.max * 2);
  }
}
const dmgNums = [];
function damageNumber(text, pos, cls = '') {
  const el = document.createElement('div');
  el.className = 'dmg ' + cls;
  el.textContent = text;
  document.body.appendChild(el);
  dmgNums.push({ el, pos: pos.clone(), life: 0.9 });
}
const tmpV = new THREE.Vector3();
function updateDamageNumbers(dt) {
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const d = dmgNums[i];
    d.life -= dt;
    d.pos.y += dt * 1.6;
    if (d.life <= 0) { d.el.remove(); dmgNums.splice(i, 1); continue; }
    tmpV.copy(d.pos).project(camera);
    if (tmpV.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = '';
    d.el.style.left = ((tmpV.x + 1) / 2 * window.innerWidth) + 'px';
    d.el.style.top = ((1 - tmpV.y) / 2 * window.innerHeight) + 'px';
    d.el.style.opacity = Math.min(1, d.life * 2.5);
  }
}

// ---------- sound (tiny synth, no files) ----------
let actx = null;
function initAudio() {
  if (actx) return;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
}
function tone(freq, dur, type = 'square', vol = 0.12, slide = null, delay = 0) {
  if (!actx) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(actx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
let noiseBuf = null;
function noise(dur, vol = 0.2, freq = 1200, type = 'lowpass', delay = 0) {
  if (!actx) return;
  if (!noiseBuf) {
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = actx.currentTime + delay;
  const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(actx.destination);
  src.start(t0); src.stop(t0 + dur + 0.02);
}
function sfx(name) {
  switch (name) {
    case 'swing': noise(0.09, 0.12, 2500, 'highpass'); break;
    case 'hit': tone(200, 0.1, 'square', 0.13, 90); noise(0.08, 0.18, 900); break;
    case 'thud': tone(140, 0.08, 'triangle', 0.15, 80); break;
    case 'hurt': tone(330, 0.22, 'sawtooth', 0.1, 140); break;
    case 'roar': noise(1.1, 0.35, 380); tone(95, 1.0, 'sawtooth', 0.12, 45); break;
    case 'bellow': tone(180, 0.9, 'sawtooth', 0.1, 90); noise(0.8, 0.15, 500); break;
    case 'screech': tone(1400, 0.9, 'sawtooth', 0.08, 2600); tone(1900, 0.7, 'square', 0.04, 900, 0.2); noise(0.8, 0.15, 3000, 'highpass'); break;
    case 'rumble': noise(1.8, 0.4, 120); tone(45, 1.6, 'sawtooth', 0.12, 35); break;
    case 'slam': noise(0.5, 0.45, 220); tone(70, 0.4, 'square', 0.15, 30); break;
    case 'shard': tone(900, 0.14, 'triangle', 0.08, 1500); break;
    case 'shatter': noise(0.15, 0.12, 3000, 'highpass'); tone(1600, 0.08, 'triangle', 0.05, 2400); break;
    case 'shoot': tone(880, 0.09, 'square', 0.06, 220); noise(0.05, 0.08, 4000, 'highpass'); break;
    case 'splash': noise(0.4, 0.2, 1500, 'bandpass'); break;
    case 'pickup': tone(660, 0.1, 'square', 0.08); tone(990, 0.14, 'square', 0.08, null, 0.09); break;
    case 'tick': tone(1200, 0.03, 'square', 0.04); break;
    case 'chest': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.07, null, i * 0.1)); break;
    case 'prize': [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'square', 0.08, null, i * 0.09)); break;
    case 'hatch': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, null, i * 0.08)); break;
    case 'win': [523, 523, 523, 698, 880, 1046].forEach((f, i) => tone(f, i === 5 ? 0.5 : 0.14, 'square', 0.08, null, [0, 0.12, 0.24, 0.4, 0.58, 0.76][i])); break;
    case 'whale': tone(220, 1.6, 'sine', 0.15, 140); tone(330, 1.2, 'sine', 0.08, 260, 0.5); break;
    case 'ride': tone(420, 0.08, 'square', 0.07, 640); break;
    case 'step': tone(520, 0.12, 'triangle', 0.07, 780); break;
    case 'whoosh': noise(0.5, 0.15, 600, 'bandpass'); break;
    case 'charge': noise(0.6, 0.2, 500, 'bandpass'); tone(120, 0.6, 'sawtooth', 0.06, 240); break;
    case 'blastoff': noise(3, 0.4, 300); tone(60, 3, 'sawtooth', 0.12, 200); break;
  }
}
