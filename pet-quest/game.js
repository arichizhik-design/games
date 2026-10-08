// Core game: renderer, levels, input, physics, the player and the pet.
'use strict';

const $ = id => document.getElementById(id);
const RUN_SPEED = 5.5, GRAVITY = 28, JUMP_V = 9.2;
const TAU = Math.PI * 2;

// ---------- saved progress ----------
const SAVE_KEY = 'pet-quest-save-v1';
function defaultSave() {
  return { step: 0, pets: ['turtle'], active: 0, weapon: 0, armor: 0, eggs: 0, golemLevel: 0, golemsBeaten: 0, dummyHits: 0 };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && Array.isArray(s.pets) && s.pets.length) return Object.assign(defaultSave(), s);
  } catch (e) { /* no saved game */ }
  return defaultSave();
}
let save = loadSave();
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } }

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
  running: false, paused: false, time: 0, modal: null, transitioning: false, dead: false,
  level: null, levels: {}, world: null,
  slot: 0, shake: 0, inFight: false, golemDefeatedThisVisit: false, chestOpened: false,
  movedDist: 0, regenT: 0,
};
const cam = { yaw: Math.PI * 0.75, pitch: 0.35 };

function makeEntity(hw, h) {
  return { pos: new THREE.Vector3(), vel: new THREE.Vector3(), hw, h, onGround: false, blocked: false, inWater: false, facing: 0, lockT: 0 };
}
const player = Object.assign(makeEntity(0.3, 1.8), { hp: 20, maxHp: 20, invuln: 0, swingT: 0, swingCd: 0, mounted: false, walkPhase: 0, model: null, eggHeld: false });
const pet = Object.assign(makeEntity(0.4, 1), { model: null, speed: 7, stuckT: 0, lastDist: 0, species: 'turtle' });

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
  e.vel.y -= GRAVITY * (e.inWater ? 0.35 : 1) * dt;
  if (e.inWater) e.vel.y = Math.max(e.vel.y, -3);
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

// moving into a one-block step: hop up it automatically (like auto-jump)
function autoJump(e, world, dirX, dirZ, h = e.h) {
  if (!e.blocked || !e.onGround) return;
  const len = Math.hypot(dirX, dirZ);
  if (len < 0.01) return;
  const ax = e.pos.x + (dirX / len) * 0.45, az = e.pos.z + (dirZ / len) * 0.45;
  if (!collidesAt(world, ax, e.pos.y + 1.05, az, e.hw, h)) e.vel.y = JUMP_V;
}

// ---------- input ----------
const keys = {};
const touch = { active: false, moveX: 0, moveZ: 0, jump: false, attack: false };
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

function frozen() { return G.modal || dialogState || G.transitioning || G.dead || G.paused; }

// ---------- levels ----------
function makeLevel(world, setup) {
  const group = new THREE.Group();
  group.add(world.group);
  const level = { world, group, update: () => {} };
  setup(level);
  return level;
}

let gus, dummy, golem, nestEgg, chest, beacon, portalMat, clouds, caveLight, barrierBlocks = [];

function buildLevels() {
  const over = generateOverworld();
  over.buildAll(blockMat, waterMat);
  G.levels.overworld = makeLevel(over, L => {
    L.sky = 0x9ad0ff;
    L.fog = new THREE.Fog(0x9ad0ff, 55, 165);
    L.group.add(new THREE.HemisphereLight(0xdff0ff, 0x5a7a3a, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.65);
    sun.position.set(60, 120, 30);
    L.group.add(sun);
    // guide and training dummy
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
    // purple beam over the mountain so you can always see where the caves are
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xb77bff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    beacon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 160, 1.6), beamMat);
    beacon.position.set(OVER.mountain.x, over.groundAt(OVER.mountain.x, OVER.mountain.z) + 80, OVER.mountain.z);
    L.group.add(beacon);
    const sign = textSprite('CRYSTAL CAVES', '#5ff0e6', 2.2);
    sign.position.set(OVER.caveDoor.x - 1.5, OVER.caveFloor + 7.4, OVER.caveDoor.z + 0.5);
    L.group.add(sign);
    // the dark doorway at the end of the tunnel
    portalMat = new THREE.MeshBasicMaterial({ map: swirlTexture(), transparent: true, opacity: 0.95 });
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), portalMat);
    portal.position.set(OVER.caveDoor.x + 12.95, OVER.caveFloor + 2.5, OVER.caveDoor.z + 0.5);
    portal.rotation.y = -Math.PI / 2;
    L.group.add(portal);
    // blocky clouds
    clouds = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, fog: false });
    const rng = makeRng(7);
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(8 + rng() * 14, 2, 6 + rng() * 10), cloudMat);
      c.position.set(rng() * 230 - 30, 62 + rng() * 6, rng() * 230 - 30);
      clouds.add(c);
    }
    L.group.add(clouds);
    L.update = dt => {
      clouds.children.forEach(c => { c.position.x += dt * 1.3; if (c.position.x > 200) c.position.x = -40; });
      portalMat.map.rotation += dt * 0.8;
      gus.mark.visible = save.step === 1 || save.step === 4;
      gus.mark.position.y = 2.95 + Math.sin(G.time * 3) * 0.1;
      // Gus turns to look at you
      const a = Math.atan2(player.pos.x - gus.root.position.x, player.pos.z - gus.root.position.z);
      gus.head.rotation.y = THREE.MathUtils.clamp(angleDiff(a, gus.root.rotation.y), -0.9, 0.9);
      dummy.wobbleV += (-dummy.wobble * 60 - dummy.wobbleV * 6) * dt;
      dummy.wobble += dummy.wobbleV * dt;
      dummy.body.rotation.z = dummy.wobble;
    };
  });

  const cave = generateCave();
  cave.buildAll(blockMat, waterMat);
  G.levels.cave = makeLevel(cave, L => {
    L.sky = 0x0b0816;
    L.fog = new THREE.Fog(0x0b0816, 14, 60);
    L.group.add(new THREE.AmbientLight(0x9a8ac8, 0.6));
    caveLight = new THREE.PointLight(0xffd9a0, 0.9, 14);
    L.group.add(caveLight);
    const nestLight = new THREE.PointLight(0xb77bff, 1.4, 22);
    nestLight.position.set(CAVE.nest.x, CAVE.floor + 3, CAVE.nest.z);
    L.group.add(nestLight);
    const roomLight = new THREE.PointLight(0x5ff0e6, 0.8, 30);
    roomLight.position.set(CAVE.room.x, CAVE.floor + 8, CAVE.room.z - 6);
    L.group.add(roomLight);
    golem = makeGolem();
    L.group.add(golem.model.root);
    nestEgg = eggMesh(1);
    nestEgg.home = new THREE.Vector3(CAVE.nest.x, CAVE.floor + 1, CAVE.nest.z);
    nestEgg.position.copy(nestEgg.home);
    L.group.add(nestEgg);
    chest = makeChestModel();
    chest.root.position.set(CAVE.chest.x, CAVE.floor, CAVE.chest.z);
    chest.root.rotation.y = Math.PI;
    chest.root.visible = false;
    L.group.add(chest.root);
    // light from the way out
    const exitGlow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55 }));
    exitGlow.position.set(CAVE.start.x, CAVE.floor + 2, 1.02);
    L.group.add(exitGlow);
    const outSign = textSprite('Way out', '#bfe6ff', 0.9);
    outSign.position.set(CAVE.start.x, CAVE.floor + 4.5, 1.6);
    L.group.add(outSign);
    L.update = dt => {
      caveLight.position.set(player.pos.x, player.pos.y + 2.2, player.pos.z);
      updateGolem(dt);
    };
  });
}

function swirlTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = x - 32, dy = y - 32, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const v = (Math.sin(a * 3 + d * 0.35) + 1) / 2;
    ctx.fillStyle = `rgb(${Math.round(30 + v * 90)},${Math.round(12 + v * 30)},${Math.round(60 + v * 120)})`;
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
}

function placeActors(x, z, yaw) {
  const w = G.world;
  player.mounted = false;
  player.pos.set(x, w.groundAt(x, z, w.name === 'cave' ? CAVE.floor + 1 : w.H - 1), z);
  player.vel.set(0, 0, 0);
  cam.yaw = yaw;
  player.facing = yaw + Math.PI;
  placePetNearPlayer();
}

function placePetNearPlayer() {
  const w = G.world;
  const side = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)).multiplyScalar(1.8);
  for (const k of [1, -1, 0.5, 0]) {
    const x = player.pos.x + side.x * k + (k === 0 ? 1.5 : 0), z = player.pos.z + side.z * k;
    const y = Math.max(player.pos.y, 0);
    if (!collidesAt(w, x, y, z, pet.hw, pet.h)) { pet.pos.set(x, y, z); pet.vel.set(0, 0, 0); return; }
  }
  pet.pos.copy(player.pos);
}

function travel(to) {
  if (G.transitioning) return;
  G.transitioning = true;
  $('fade').classList.add('on');
  sfx('whoosh');
  setTimeout(() => {
    if (to === 'cave') {
      setLevel('cave');
      onEnterCave();
      placeActors(CAVE.start.x, CAVE.start.z, Math.PI);
    } else {
      setLevel('overworld');
      onLeaveCave();
      placeActors(OVER.caveDoor.x - 4, OVER.caveDoor.z + 0.5, Math.PI / 2);
    }
    if (G.wasMounted) { mountPet(true); G.wasMounted = false; }
    $('fade').classList.remove('on');
    setTimeout(() => { G.transitioning = false; }, 250);
  }, 480);
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
    if (!collidesAt(G.world, x, pet.pos.y + (s === 0 ? pet.model.saddleY : 0), z, player.hw, player.h)) {
      player.pos.set(x, pet.pos.y + (s === 0 ? pet.model.saddleY : 0), z); break;
    }
  }
  player.vel.set(0, 0, 0);
  sfx('ride');
}
function toggleRide() {
  if (frozen() || !pet.model) return;
  if (player.mounted) { dismount(); return; }
  const d = Math.hypot(pet.pos.x - player.pos.x, pet.pos.z - player.pos.z);
  if (d < 3.2) mountPet();
  else showToast(`Walk closer to ${petShortName()} to ride`);
}
function petShortName() { return pet.species === 'turtle' ? 'Pebble' : 'your ' + PET_SPECIES[pet.species].name.split(' ').slice(-1)[0]; }

// ---------- update: player, pet, camera ----------
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
function turnToward(cur, target, rate) { return cur + angleDiff(target, cur) * Math.min(1, rate); }

function updateMovement(dt) {
  const w = G.world;
  const inp = moveInput();
  const fwdX = -Math.sin(cam.yaw), fwdZ = -Math.cos(cam.yaw);
  const rightX = Math.cos(cam.yaw), rightZ = -Math.sin(cam.yaw);
  let dx = fwdX * inp.z + rightX * inp.x, dz = fwdZ * inp.z + rightZ * inp.x;
  const wantJump = keys.Space || touch.jump;
  const actor = player.mounted ? pet : player;
  const h = player.mounted ? mountedHeight() : player.h;
  let speed = player.mounted ? pet.speed : RUN_SPEED;
  if (actor.inWater) speed *= 0.6;
  if (actor.lockT > 0) { actor.lockT -= dt; dx = dz = 0; }
  const accel = actor.onGround ? 14 : 5;
  const k = 1 - Math.exp(-accel * dt);
  if (actor.lockT <= 0) {
    actor.vel.x += (dx * speed - actor.vel.x) * k;
    actor.vel.z += (dz * speed - actor.vel.z) * k;
  }
  if (wantJump && actor.onGround) { actor.vel.y = JUMP_V; }
  if (wantJump && actor.inWater) actor.vel.y = 4;
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
  } else {
    updatePetFollow(dt);
  }
  if (actor.pos.y < -8) respawnHere();
  return hs;
}

function updatePetFollow(dt) {
  const w = G.world;
  const dx = player.pos.x - pet.pos.x, dz = player.pos.z - pet.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 30 || Math.abs(player.pos.y - pet.pos.y) > 12) { placePetNearPlayer(); return; }
  // walk to a spot beside the player (seen from the camera) so the pet doesn't block the view
  const sx = player.pos.x + Math.cos(cam.yaw) * 1.8 - Math.sin(cam.yaw) * 0.4 - pet.pos.x;
  const sz = player.pos.z - Math.sin(cam.yaw) * 1.8 - Math.cos(cam.yaw) * 0.4 - pet.pos.z;
  const sd = Math.hypot(sx, sz);
  let tx = 0, tz = 0;
  if (dist > 7) { tx = dx / dist * pet.speed * 1.2; tz = dz / dist * pet.speed * 1.2; }
  else if (sd > 0.8) {
    const sp = Math.min(pet.speed, sd * 3);
    tx = sx / sd * sp; tz = sz / sd * sp;
  }
  const k = 1 - Math.exp(-(pet.onGround ? 10 : 4) * dt);
  pet.vel.x += (tx - pet.vel.x) * k;
  pet.vel.z += (tz - pet.vel.z) * k;
  stepEntity(pet, dt, w);
  autoJump(pet, w, tx, tz);
  if (Math.hypot(tx, tz) > 0.3) pet.facing = turnToward(pet.facing, Math.atan2(tx, tz), dt * 8);
  else pet.facing = turnToward(pet.facing, Math.atan2(dx, dz), dt * 2);
  // stuck behind something? hop over to the player
  if (dist > 6 && Math.hypot(pet.vel.x, pet.vel.z) < 0.6) { pet.stuckT += dt; if (pet.stuckT > 1.6) { placePetNearPlayer(); pet.stuckT = 0; } }
  else pet.stuckT = 0;
}

function respawnHere() {
  if (G.world.name === 'cave') placeActors(CAVE.start.x, CAVE.start.z, Math.PI);
  else placeActors(OVER.spawn.x, OVER.spawn.z, cam.yaw);
}

function updatePlayerModel(dt, hs) {
  const m = player.model;
  m.root.position.copy(player.pos);
  m.root.rotation.y = player.facing;
  player.walkPhase += dt * hs * 1.9;
  const sw = player.mounted ? 0 : Math.sin(player.walkPhase) * Math.min(1, hs / 3) * 0.9;
  if (player.mounted) {
    m.legs.forEach((l, i) => { l.rotation.x = -1.35; l.rotation.z = (i ? -1 : 1) * 0.35; });
    m.arms[0].rotation.x = -0.5;
  } else {
    m.legs.forEach((l, i) => { l.rotation.x = i ? -sw : sw; l.rotation.z = 0; });
    m.arms[0].rotation.x = -sw;
  }
  if (player.swingT > 0) {
    const p = 1 - player.swingT / 0.25;
    m.arms[1].rotation.x = -2.7 + Math.sin(p * Math.PI / 2) * 2.4;
    player.swingT -= dt;
  } else {
    m.arms[1].rotation.x = player.mounted ? -0.6 : (player.eggHeld ? -1.0 : sw * 0.8 - 0.15);
  }
  m.head.rotation.x = THREE.MathUtils.clamp(-cam.pitch * 0.4, -0.4, 0.4);
  // blink red when hurt
  m.root.visible = !(player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0);
  const item = player.eggHeld ? 'egg' : selectedItem();
  m.setHeld(item === 'weapon' ? WEAPONS[save.weapon].id : item);
}

function updatePetModel(dt) {
  const m = pet.model;
  m.root.position.copy(pet.pos);
  m.root.rotation.y = pet.facing;
  m.animate(dt, Math.hypot(pet.vel.x, pet.vel.z), G.time, player.mounted);
}

const camTarget = new THREE.Vector3(), camDir = new THREE.Vector3();
function updateCamera(dt) {
  const ax = player.mounted ? pet : player;
  const headY = player.mounted ? pet.model.saddleY + 1.35 : 1.55;
  camTarget.set(ax.pos.x, ax.pos.y + headY, ax.pos.z);
  if (keys.ArrowLeft) cam.yaw += dt * 2.4;
  if (keys.ArrowRight) cam.yaw -= dt * 2.4;
  camDir.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  const want = player.mounted ? 7 : 5.5;
  const hit = G.world.raycast(camTarget, camDir, want + 0.3);
  const d = hit === null ? want : Math.max(0.5, hit - 0.35);
  camera.position.copy(camTarget).addScaledVector(camDir, d);
  if (G.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * G.shake;
    camera.position.y += (Math.random() - 0.5) * G.shake;
    G.shake = Math.max(0, G.shake - dt * 2.2);
  }
  camera.lookAt(camTarget);
}

// ---------- particles, floating sprites, damage numbers ----------
const particles = [];
const partGeo = new THREE.BoxGeometry(1, 1, 1);
const partMats = new Map();
function partMat(color) {
  if (!partMats.has(color)) partMats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true }));
  return partMats.get(color);
}
function burst(pos, color, n = 10, speed = 4, size = 0.15, life = 0.7, gravity = 12) {
  for (let i = 0; i < n && particles.length < 500; i++) {
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
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
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
    case 'slam': noise(0.5, 0.45, 220); tone(70, 0.4, 'square', 0.15, 30); break;
    case 'shard': tone(900, 0.14, 'triangle', 0.08, 1500); break;
    case 'shatter': noise(0.15, 0.12, 3000, 'highpass'); tone(1600, 0.08, 'triangle', 0.05, 2400); break;
    case 'pickup': tone(660, 0.1, 'square', 0.08); tone(990, 0.14, 'square', 0.08, null, 0.09); break;
    case 'chest': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.07, null, i * 0.1)); break;
    case 'hatch': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, null, i * 0.08)); break;
    case 'win': [523, 523, 523, 698, 880, 1046].forEach((f, i) => tone(f, i === 5 ? 0.5 : 0.14, 'square', 0.08, null, [0, 0.12, 0.24, 0.4, 0.58, 0.76][i])); break;
    case 'ride': tone(420, 0.08, 'square', 0.07, 640); break;
    case 'step': tone(520, 0.12, 'triangle', 0.07, 780); break;
    case 'whoosh': noise(0.5, 0.15, 600, 'bandpass'); break;
    case 'charge': noise(0.6, 0.2, 500, 'bandpass'); tone(120, 0.6, 'sawtooth', 0.06, 240); break;
  }
}
