// Boss arenas: the egg, the boss, its attacks, and the rewards (chest, scroll, scuba gear, rocket).
'use strict';

const CAVE_BOSS = { rabbit: 'deer', sand: 'scorpion', coral: 'squid', crystal: 'spider' };
const teleMat = () => new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
let fightArena = null; // the arena whose fight is on

function createArena(L, caveId) {
  const bossId = CAVE_BOSS[caveId];
  const cfg = BOSSES[bossId];
  const A = {
    L, caveId, bossId, cfg, group: L.group,
    boss: { model: makeBossModel(bossId, PLANET), pos: new THREE.Vector3(), yaw: Math.PI, state: 'sleep', t: 0, hp: 1, maxHp: 1, cooldown: 2, attack: null, phase2: false, flashT: 0, zzzT: 0, walk: 0, hitPlayer: false, chargeDir: new THREE.Vector3(), lastAttack: '', leapFrom: new THREE.Vector3(), leapTo: new THREE.Vector3() },
    egg: eggMesh(1, cfg.egg), eggHome: new THREE.Vector3(CAVE.pedestal.x, CAVE.floor + 1, CAVE.pedestal.z), eggState: 'pedestal', eggFly: null,
    chest: makeChestModel(CHESTS[cfg.chest].color), chestState: 'hidden',
    scroll: makeScrollModel(), scrollState: 'hidden',
    scuba: bossId === 'scorpion' ? makeScubaModel() : null, scubaState: 'hidden',
    telegraphs: [], projectiles: [], falling: [], hearts: [], heartMarks: [],
    armed: false, defeated: false, barrier: [], web: null,
  };
  L.group.add(A.boss.model.root, A.egg, A.chest.root, A.scroll);
  A.chest.root.position.set(CAVE.chest.x, CAVE.floor, CAVE.chest.z);
  A.chest.root.rotation.y = Math.PI;
  A.scroll.position.set(CAVE.scroll.x, CAVE.floor + 0.6, CAVE.scroll.z);
  if (A.scuba) { A.scuba.position.set(CAVE.scroll.x - 8, CAVE.floor, CAVE.scroll.z); L.group.add(A.scuba); }
  if (bossId === 'spider') {
    A.web = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), new THREE.MeshBasicMaterial({ color: 0xf4f4ff }));
    A.web.visible = false;
    L.group.add(A.web);
  }
  resetArena(A);
  return A;
}

function bossLevelMult(A) { return 1 + 0.3 * (save.beaten[A.bossId] || 0); }

function resetArena(A) {
  const b = A.boss, cfg = A.cfg;
  clearAttacks(A);
  b.maxHp = Math.round(cfg.hp * bossLevelMult(A));
  b.hp = b.maxHp;
  b.attack = null; b.phase2 = false; b.cooldown = 2; b.t = 0; b.yaw = Math.PI;
  b.model.flash(false);
  b.model.root.visible = true;
  b.model.root.rotation.set(0, Math.PI, 0);
  b.pos.set(CAVE.bossSpot.x, CAVE.floor, CAVE.bossSpot.z);
  if (A.bossId === 'scorpion') { b.state = 'hidden'; b.pos.set(CAVE.bossSpot.x, CAVE.floor, CAVE.bossSpot.z - 2); }
  else if (A.bossId === 'spider') { b.state = 'hidden'; b.pos.set(CAVE.room.x, CAVE.floor + 30, CAVE.room.z); }
  else b.state = 'sleep';
  if (A.bossId === 'squid') b.pos.y = CAVE.floor + 2;
  A.eggState = 'pedestal'; A.eggFly = null;
  A.egg.visible = true; A.egg.position.copy(A.eggHome);
  A.chestState = 'hidden'; A.chest.root.visible = false; A.chest.lid.rotation.x = 0;
  A.scrollState = 'hidden'; A.scroll.visible = false;
  if (A.scuba) { A.scubaState = 'hidden'; A.scuba.visible = false; }
  A.armed = false; A.defeated = false;
  A.heartMarks = [0.75, 0.5, 0.25];
  if (A.web) A.web.visible = false;
  if (player.eggHeld) player.eggHeld = null;
  setBarrier(A, false);
  if (fightArena === A) { fightArena = null; $('bossbar').hidden = true; }
  poseBoss(A, 1, true);
}

function onEnterArena(A) {
  const leftovers = A.defeated && (A.eggState !== 'taken' || A.chestState !== 'opened' || A.scrollState === 'ready' || A.scubaState === 'ready');
  if (!leftovers) resetArena(A);
}
function arenaHere() { return G.level && G.level.arena ? G.level.arena : null; }

function clearAttacks(A) {
  for (const list of [A.telegraphs, A.projectiles, A.falling, A.hearts]) { list.forEach(t => A.group.remove(t.mesh)); list.length = 0; }
  A.boss.emergeCircle = null;
}

function setBarrier(A, on) {
  const w = A.L.world;
  if (on) {
    A.barrier = [];
    for (const z of CAVE.barrierZ) for (let x = 20; x < 52; x++) for (let y = CAVE.floor; y < CAVE.floor + 9; y++)
      if (w.get(x, y, z) === B.AIR) { w.set(x, y, z, A.L.world.style.barrier); A.barrier.push([x, y, z]); }
  } else {
    if (!A.barrier.length) return;
    for (const [x, y, z] of A.barrier) w.set(x, y, z, B.AIR);
    A.barrier = [];
  }
  const done = new Set();
  for (let x = 20; x < 52; x += 4) for (const z of CAVE.barrierZ) {
    const key = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    if (!done.has(key)) { done.add(key); w.rebuildAt(x, z); }
  }
}

// ---------- the egg and the fight starting ----------
function nearEggSpot(A) { return Math.hypot(player.pos.x - A.eggHome.x, player.pos.z - A.eggHome.z) < 3.3; }
function canPickEgg(A) { return A && A.eggState === 'pedestal' && !A.eggFly && nearEggSpot(A) && !fightArena && !G.cutscene; }

function pickUpEgg(A) {
  if (A.defeated) {
    // the egg is yours now
    A.eggState = 'taken'; A.egg.visible = false;
    save.eggs[A.cfg.egg] = (save.eggs[A.cfg.egg] || 0) + 1;
    writeSave(); sfx('pickup'); updateHotbar();
    showToast(`You got the ${EGGS[A.cfg.egg].name}! Take it home to hatch it.`, 3);
    return;
  }
  player.eggHeld = A.cfg.egg;
  A.egg.visible = false;
  A.eggState = 'held';
  sfx('pickup');
  if (A.bossId === 'deer') {
    showToast('You picked up the egg...');
    setTimeout(() => { wakeBoss(A); setTimeout(() => dropEgg(A, `The egg falls out of your hands! Beat the ${A.cfg.name} to win it!`), 900); }, 600);
  } else {
    A.armed = { x: player.pos.x, z: player.pos.z };
    showToast(A.bossId === 'scorpion' ? 'You got the egg! There\'s no boss here... is there?' : A.bossId === 'squid' ? 'Shhh... don\'t wake the King.' : 'Got it! Now get out of here...', 2.5);
  }
}
function dropEgg(A, msg) {
  player.eggHeld = null;
  A.egg.visible = true;
  A.eggFly = { from: playerCenter().add(new THREE.Vector3(0, 0.4, 0)), t: 0, dur: 0.7 };
  A.eggState = 'pedestal';
  if (msg) showToast(msg, 2.6);
}

// waiting for you to walk away with the egg
function checkArmed(A) {
  if (!A.armed || G.cutscene) return;
  if (A.defeated || fightArena) { A.armed = false; return; }
  if (A.bossId === 'spider') {
    if (player.pos.z < CAVE.roomDoorZ + 1) { A.armed = false; spiderCutscene(A); }
    return;
  }
  if (Math.hypot(player.pos.x - A.armed.x, player.pos.z - A.armed.z) > 4) {
    A.armed = false;
    if (A.bossId === 'scorpion') scorpionCutscene(A); else squidCutscene(A);
  }
}

function faceAngleToward(x, z) { // camera yaw that looks from the player toward (x, z)
  return Math.atan2(-(x - player.pos.x), -(z - player.pos.z));
}

function scorpionCutscene(A) {
  const b = A.boss;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  playCutscene({
    dur: 6.2, camDist: 6.5,
    events: [
      [0, cs => { cs.walk = { dx: fx, dz: fz, speed: 2.4 }; }],
      [1.2, cs => { cs.walk = null; sfx('rumble'); G.shake = 0.6; showToast('*rumble rumble*', 1.5); }],
      [1.4, cs => { G.shake = 0.8; }],
      [2.3, cs => { cs.turnTo(faceAngleToward(b.pos.x, b.pos.z), 1.0); }],
      [3.3, cs => { sfx('rumble'); G.shake = 1.2; b.state = 'emerge'; b.t = 0; b.model.root.visible = true; }],
      [4.6, cs => { sfx('roar'); G.shake = 1; showToast(`A ${A.cfg.name.toUpperCase()}!!!`, 2); }],
      [5.6, cs => { dropEgg(A, `You dropped the egg! Beat the ${A.cfg.name} to win it!`); }],
    ],
    onEnd: () => startFight(A),
  });
}
function squidCutscene(A) {
  const b = A.boss;
  playCutscene({
    dur: 4.8, camDist: 7,
    events: [
      [0, cs => { sfx('rumble'); G.shake = 0.4; }],
      [0.6, cs => { cs.turnTo(faceAngleToward(b.pos.x, b.pos.z), 1.0); }],
      [1.8, cs => { b.state = 'wake'; b.t = 0; sfx('roar'); G.shake = 0.8; showToast(`The ${A.cfg.name} wakes up!!!`, 2); }],
      [4.0, cs => { dropEgg(A, `The egg slips away! Beat the ${A.cfg.name} to win it!`); }],
    ],
    onEnd: () => startFight(A),
  });
}
function spiderCutscene(A) {
  const b = A.boss;
  playCutscene({
    dur: 8.4, camDist: 7.5,
    events: [
      [0, cs => { sfx('screech'); showToast('*SCREEEECH*', 1.4); }],
      [0.4, cs => { cs.turnTo(faceAngleToward(CAVE.room.x, CAVE.room.z), 1.1); }],
      [1.6, cs => { sfx('rumble'); G.shake = 1.0; showToast('The walls are shaking!', 1.6); }],
      [2.4, cs => { G.shake = 1.2; for (let i = 0; i < 20; i++) burst(new THREE.Vector3(CAVE.room.x + (Math.random() - 0.5) * 30, CAVE.floor + 10 + Math.random() * 5, CAVE.room.z + (Math.random() - 0.5) * 30), 0x6a5f86, 3, 2, 0.25, 1.2); }],
      [3.0, cs => { b.state = 'emerge'; b.t = 0; b.model.root.visible = true; cs.lookAt = b.pos; cs.pitch = 0.05; }],
      [3.1, cs => { cs.walk = { dx: 0, dz: 1, speed: 2.5 }; }],
      [5.0, cs => { cs.walk = null; }],
      [6.0, cs => { sfx('screech'); sfx('roar'); G.shake = 1.2; showToast(`THE ${A.cfg.name.toUpperCase()}!!!`, 2); cs.lookAt = null; cs.pitch = null; }],
      [7.6, cs => { dropEgg(A, 'You dropped the egg! This is the final boss. Good luck!'); }],
    ],
    onEnd: () => startFight(A),
  });
}

function wakeBoss(A) {
  const b = A.boss;
  if (b.state !== 'sleep') return;
  b.state = 'wake'; b.t = 0;
  sfx(A.bossId === 'deer' ? 'bellow' : 'roar');
  G.shake = 0.8;
  showToast(`The ${A.cfg.name} wakes up!!!`, 2);
  startFight(A);
}

function startFight(A) {
  if (fightArena === A) return;
  fightArena = A;
  setBarrier(A, true);
  $('bossbar').hidden = false;
  const lvl = (save.beaten[A.bossId] || 0);
  $('bossName').textContent = A.cfg.name + (lvl ? ` · Rematch ${lvl + 1}` : '');
  if (A.boss.state === 'sleep' || A.boss.state === 'emerge' || A.boss.state === 'hidden') { /* wake/emerge animation finishes first */ }
}

// ---------- telegraphs ----------
function addCircle(A, x, z, r, dur, onDone) {
  const grp = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.18, r, 40), teleMat());
  ring.material.opacity = 0.85;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), teleMat());
  grp.add(ring, fill);
  grp.rotation.x = -Math.PI / 2;
  grp.position.set(x, CAVE.floor + 0.04, z);
  fill.scale.setScalar(0.01);
  A.group.add(grp);
  const t = { mesh: grp, fill, t: 0, dur, onDone, x, z, r };
  A.telegraphs.push(t);
  return t;
}
function addLine(A, x, z, dirX, dirZ, len, width, dur) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len), teleMat());
  m.material.opacity = 0.4;
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(dirX, dirZ) + Math.PI;
  m.position.set(x + dirX * len / 2, CAVE.floor + 0.05, z + dirZ * len / 2);
  A.group.add(m);
  A.telegraphs.push({ mesh: m, fill: null, t: 0, dur, onDone: null });
}
function updateTelegraphs(A, dt) {
  for (let i = A.telegraphs.length - 1; i >= 0; i--) {
    const t = A.telegraphs[i];
    t.t += dt;
    const p = Math.min(1, t.t / t.dur);
    if (t.fill) { t.fill.scale.setScalar(Math.max(0.01, p)); t.fill.material.opacity = 0.2 + p * 0.3; }
    else t.mesh.material.opacity = 0.25 + Math.sin(t.t * 20) * 0.12;
    if (p >= 1) {
      A.group.remove(t.mesh);
      A.telegraphs.splice(i, 1);
      if (t.onDone) t.onDone(t);
    }
  }
}

// ---------- hurting the player ----------
function playerCenter() {
  const a = player.mounted ? pet : player;
  return new THREE.Vector3(a.pos.x, a.pos.y + (player.mounted ? pet.model.saddleY + 0.5 : 0.9), a.pos.z);
}
function hurtPlayer(A, amount, fromX, fromZ, knock = 9) {
  if (player.invuln > 0 || G.dead || G.cutscene) return;
  const dmg = Math.max(1, Math.round(amount * A.cfg.mult * bossLevelMult(A) * (1 - ARMORS[save.armor].block)));
  player.hp = Math.max(0, player.hp - dmg);
  player.invuln = 0.75;
  sfx('hurt');
  G.shake = Math.max(G.shake, 0.35);
  const c = playerCenter();
  damageNumber('-' + dmg, c.clone().add(new THREE.Vector3(0, 1, 0)), 'hurt');
  const flash = $('hurtFlash');
  flash.style.opacity = 1;
  setTimeout(() => { flash.style.opacity = 0; }, 120);
  const a = player.mounted ? pet : player;
  const dx = c.x - fromX, dz = c.z - fromZ, d = Math.hypot(dx, dz) || 1;
  a.vel.x = dx / d * knock; a.vel.z = dz / d * knock; a.vel.y = 5;
  a.lockT = 0.25;
  updateHearts();
  if (player.hp <= 0) knockedOut(A);
}
function grounded() { const a = player.mounted ? pet : player; return a.onGround; }
function inCircle(t, extra = 0.3) { const p = playerCenter(); return Math.hypot(p.x - t.x, p.z - t.z) < t.r + extra; }

// ---------- attacks ----------
function bossForward(b) { return new THREE.Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw)); }

function startAttack(A, name) {
  const b = A.boss, cfg = A.cfg;
  b.attack = name; b.state = 'windup'; b.t = 0; b.hitPlayer = false; b.lastAttack = name;
  const fast = b.phase2 ? 0.78 : 1;
  const pc = playerCenter();
  const extra = Math.min(3, save.beaten[A.bossId] || 0);
  if (name === 'charge') {
    b.chargeDir.set(pc.x - b.pos.x, 0, pc.z - b.pos.z).normalize();
    b.yaw = Math.atan2(b.chargeDir.x, b.chargeDir.z);
    b.windup = 0.9 * fast;
    addLine(A, b.pos.x, b.pos.z, b.chargeDir.x, b.chargeDir.z, 20, 3.2, b.windup);
    sfx('charge');
  } else if (name === 'stomp' || name === 'spin') {
    b.windup = (name === 'spin' ? 1.1 : 1.0) * fast;
    const r = name === 'spin' ? 6.5 : 4.8;
    addCircle(A, b.pos.x, b.pos.z, r, b.windup, t => {
      sfx('slam'); G.shake = 0.8;
      burst(new THREE.Vector3(t.x, CAVE.floor + 0.3, t.z), 0x8a7a6a, 26, 7, 0.25, 0.8);
      if (inCircle(t) && (grounded() || name === 'spin')) hurtPlayer(A, 3, t.x, t.z, 12);
    });
  } else if (name === 'pinch') {
    const f = bossForward(b);
    b.windup = 0.75 * fast;
    addCircle(A, b.pos.x + f.x * 3.4, b.pos.z + f.z * 3.4, 3.4, b.windup, t => {
      sfx('slam'); G.shake = 0.5;
      burst(new THREE.Vector3(t.x, CAVE.floor + 0.3, t.z), 0xe0c070, 18, 5, 0.22, 0.7);
      if (inCircle(t)) hurtPlayer(A, 3, t.x, t.z, 10);
    });
  } else if (name === 'sting') {
    b.windup = 0.95 * fast;
    addCircle(A, pc.x, pc.z, 2.1, b.windup, t => {
      sfx('slam'); G.shake = 0.5;
      burst(new THREE.Vector3(t.x, CAVE.floor + 0.3, t.z), 0xb4ff4a, 14, 5, 0.18, 0.6);
      if (inCircle(t)) hurtPlayer(A, 4, t.x, t.z, 10);
    });
  } else if (name === 'leap') {
    b.windup = 0.55 * fast;
    b.leapFrom.copy(b.pos);
    b.leapTo.set(pc.x, CAVE.floor, pc.z);
    clampToRoom(b.leapTo, 5);
    addCircle(A, b.leapTo.x, b.leapTo.z, 3.4, b.windup + 0.9, t => {
      sfx('slam'); G.shake = 1;
      burst(new THREE.Vector3(t.x, CAVE.floor + 0.3, t.z), 0x8a7a6a, 26, 7, 0.25, 0.8);
      if (inCircle(t)) hurtPlayer(A, 4, t.x, t.z, 12);
    });
  } else if (name === 'burrow') {
    b.windup = 0.6;
    sfx('rumble');
  } else if (name === 'shots' || name === 'ink' || name === 'web') {
    b.windup = 0.7 * fast;
  } else if (name === 'tentacles') {
    b.windup = 0.6;
    sfx('roar');
    const n = 4 + extra + (b.phase2 ? 2 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = i === 0 ? 0 : 2 + Math.random() * 6;
      const x = pc.x + Math.cos(a) * r, z = pc.z + Math.sin(a) * r;
      if (!inRoom(x, z, 2)) continue;
      addCircle(A, x, z, 1.8, 1.0 + i * 0.15, t => {
        sfx('slam');
        const m = box(0.9, 4, 0.9, pixMat(0xc8345a), t.x, CAVE.floor - 2, t.z);
        A.group.add(m);
        A.falling.push({ mesh: m, t: 0, kind: 'tentacle' });
        if (inCircle(t)) hurtPlayer(A, 3, t.x, t.z, 9);
      });
    }
  } else if (name === 'rain') {
    b.windup = 0.6;
    sfx('roar');
    const spots = [[pc.x, pc.z]];
    for (let i = 0; i < 5 + extra; i++) {
      const a = Math.random() * TAU, r = 2.5 + Math.random() * 6;
      spots.push([pc.x + Math.cos(a) * r, pc.z + Math.sin(a) * r]);
    }
    spots.forEach(([x, z], i) => {
      if (!inRoom(x, z, 2)) return;
      const delay = 1.1 + i * 0.12;
      addCircle(A, x, z, 1.7, delay, t => {
        burst(new THREE.Vector3(t.x, CAVE.floor + 0.4, t.z), cfg.rainColor, 14, 5, 0.2, 0.6);
        sfx('shatter');
        if (inCircle(t, 0.2)) hurtPlayer(A, 2.5, t.x, t.z, 6);
      });
      const mesh = box(0.7, A.bossId === 'squid' ? 0.7 : 1.4, 0.7, pixMat(cfg.rainColor, { glow: A.bossId !== 'deer' }));
      mesh.position.set(x, CAVE.floor + 14, z);
      A.group.add(mesh);
      A.falling.push({ mesh, t: 0, start: delay - 0.4, dur: 0.4, kind: 'drop' });
    });
  }
}

function inRoom(x, z, margin) { return Math.hypot(x - CAVE.room.x, z - CAVE.room.z) < CAVE.room.r - margin; }
function clampToRoom(v, margin) {
  const R = CAVE.room, d = Math.hypot(v.x - R.x, v.z - R.z), m = R.r - margin;
  if (d > m) { v.x = R.x + (v.x - R.x) / d * m; v.z = R.z + (v.z - R.z) / d * m; }
}

function bossAct(A) {
  const b = A.boss, cfg = A.cfg;
  b.state = 'act'; b.t = 0;
  if (b.attack === 'shots' || b.attack === 'ink' || b.attack === 'web') {
    const pc = playerCenter();
    const from = new THREE.Vector3(b.pos.x, b.pos.y + cfg.height * 0.6, b.pos.z).addScaledVector(bossForward(b), cfg.radius);
    const n = (b.phase2 ? 5 : 3) + Math.min(2, save.beaten[A.bossId] || 0);
    const base = Math.atan2(pc.x - from.x, pc.z - from.z);
    const dist = Math.hypot(pc.x - from.x, pc.z - from.z);
    const speed = b.attack === 'web' ? 11 : 13;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.2;
      const vy = (pc.y - from.y) / Math.max(0.5, dist / speed);
      const col = b.attack === 'ink' ? 0x1a1a2a : cfg.shotColor;
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(b.attack === 'web' ? 0.5 : 0.4), pixMat(col, { glow: b.attack !== 'ink' }));
      mesh.position.copy(from);
      A.group.add(mesh);
      A.projectiles.push({ mesh, vel: new THREE.Vector3(Math.sin(a) * speed, vy, Math.cos(a) * speed), life: 3, kind: b.attack, col });
    }
    sfx('shard');
  } else if (b.attack === 'charge') sfx(A.bossId === 'deer' ? 'bellow' : 'roar');
  else if (b.attack === 'burrow') { b.state = 'burrowed'; b.t = 0; }
}

function updateProjectiles(A, dt) {
  const w = A.L.world;
  for (let i = A.projectiles.length - 1; i >= 0; i--) {
    const p = A.projectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.y += dt * 10;
    const pos = p.mesh.position;
    let gone = p.life <= 0;
    if (!gone && pos.distanceTo(playerCenter()) < 1.0) {
      gone = true;
      if (p.kind === 'web') { player.slowT = 2.5; showToast('You\'re stuck in a web! Slow...', 1.2); hurtPlayer(A, 1, pos.x - p.vel.x, pos.z - p.vel.z, 2); }
      else { hurtPlayer(A, 2, pos.x - p.vel.x, pos.z - p.vel.z, 6); if (p.kind === 'ink') inkScreen(); }
    }
    if (!gone && (w.solid(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)) || pos.y < CAVE.floor)) gone = true;
    if (gone) {
      burst(pos, p.col, 8, 4, 0.12, 0.5);
      sfx('shatter');
      A.group.remove(p.mesh);
      A.projectiles.splice(i, 1);
    }
  }
  for (let i = A.falling.length - 1; i >= 0; i--) {
    const f = A.falling[i];
    f.t += dt;
    if (f.kind === 'tentacle') {
      const p = f.t / 0.9;
      f.mesh.position.y = CAVE.floor - 2 + Math.sin(Math.min(1, p) * Math.PI) * 3.6;
      if (p >= 1) { A.group.remove(f.mesh); A.falling.splice(i, 1); }
      continue;
    }
    const p = (f.t - f.start) / f.dur;
    if (p < 0) continue;
    f.mesh.position.y = CAVE.floor + 14 - Math.min(1, p) * 13.2;
    if (p >= 1) { A.group.remove(f.mesh); A.falling.splice(i, 1); }
  }
}
function inkScreen() {
  const el = $('ink');
  el.style.transition = 'none'; el.style.opacity = 0.92;
  requestAnimationFrame(() => { el.style.transition = 'opacity 2.2s ease-in'; el.style.opacity = 0; });
}

// ---------- heart pickups during the fight ----------
function spawnHeart(A) {
  const a = Math.random() * TAU, r = 6 + Math.random() * 9;
  const m = makeHeartModel();
  m.position.set(CAVE.room.x + Math.cos(a) * r, CAVE.floor + 1, CAVE.room.z + Math.sin(a) * r);
  A.group.add(m);
  A.hearts.push({ mesh: m });
  burst(m.position, 0xff3b4f, 10, 3, 0.12, 0.8);
}
function updateHearts3D(A, dt) {
  for (let i = A.hearts.length - 1; i >= 0; i--) {
    const h = A.hearts[i];
    h.mesh.rotation.y += dt * 2;
    h.mesh.position.y = CAVE.floor + 1 + Math.sin(G.time * 3 + i) * 0.15;
    const c = playerCenter();
    if (Math.hypot(c.x - h.mesh.position.x, c.z - h.mesh.position.z) < 1.4) {
      player.hp = Math.min(player.maxHp, player.hp + 8);
      updateHearts(); sfx('pickup');
      damageNumber('+8', h.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)));
      A.group.remove(h.mesh); A.hearts.splice(i, 1);
    }
  }
}

// ---------- the boss brain ----------
function updateArena(A, dt) {
  const b = A.boss, cfg = A.cfg;
  b.t += dt;
  const pc = playerCenter();
  const dx = pc.x - b.pos.x, dz = pc.z - b.pos.z, dist = Math.hypot(dx, dz);

  // the egg
  if (A.eggFly) {
    const f = A.eggFly;
    f.t += dt;
    const p = Math.min(1, f.t / f.dur);
    A.egg.position.lerpVectors(f.from, A.eggHome, p);
    A.egg.position.y += Math.sin(p * Math.PI) * 2;
    if (p >= 1) A.eggFly = null;
  } else if (A.egg.visible) {
    A.egg.position.y = A.eggHome.y + Math.sin(G.time * 2) * 0.08;
    A.egg.rotation.y += dt * 0.6;
    if (Math.random() < dt * 3) burst(A.egg.position.clone().add(new THREE.Vector3((Math.random() - 0.5), 0.4 + Math.random() * 0.6, (Math.random() - 0.5))), EGGS[cfg.egg].spotA, 1, 0.6, 0.08, 1.2, -0.5);
  }
  checkArmed(A);
  // rewards bob and sparkle
  if (A.scrollState === 'ready') { A.scroll.rotation.y += dt; A.scroll.position.y = CAVE.floor + 0.8 + Math.sin(G.time * 2) * 0.12; }
  if (A.scubaState === 'ready') { A.scuba.rotation.y += dt; if (Math.random() < dt * 4) burst(A.scuba.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0x7ad8ff, 1, 1, 0.08, 0.8, -1); }
  if (A.chestState === 'ready' && Math.random() < dt * 5) burst(A.chest.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5), 1, (Math.random() - 0.5))), 0xffcf4a, 1, 1.2, 0.08, 0.8, -1);

  const st = b.state;
  if (st === 'chase') {
    b.yaw = turnToward(b.yaw, Math.atan2(dx, dz), dt * (b.phase2 ? 4 : 3));
    const speed = cfg.speed * (b.phase2 ? 1.3 : 1) * (1 + 0.1 * (save.beaten[A.bossId] || 0));
    if (dist > cfg.radius + 1.6) { b.pos.addScaledVector(bossForward(b), speed * dt); b.walk += dt * speed * 1.4; }
    b.cooldown -= dt;
    if (b.cooldown <= 0) {
      const list = Object.entries(cfg.attacks);
      if (b.phase2) for (const [k, v] of Object.entries(cfg.phase2)) list.push([k, v]);
      let a = weightedPick(list.map(([k, v]) => [k, v * ((k === 'stomp' || k === 'pinch' || k === 'spin') && dist > 7 ? 0.2 : 1)]));
      if (a === b.lastAttack && Math.random() < 0.5) a = weightedPick(list);
      if (A.bossId === 'squid' && a === 'shots') a = 'ink';
      startAttack(A, a);
    }
  } else if (st === 'windup') {
    if (b.attack !== 'charge' && b.attack !== 'leap') b.yaw = turnToward(b.yaw, Math.atan2(dx, dz), dt * 2);
    if (b.attack === 'leap') b.yaw = turnToward(b.yaw, Math.atan2(b.leapTo.x - b.pos.x, b.leapTo.z - b.pos.z), dt * 6);
    if (b.t >= b.windup) bossAct(A);
  } else if (st === 'act') {
    const at = b.attack;
    if (at === 'charge') {
      b.walk += dt * 14;
      b.pos.addScaledVector(b.chargeDir, (15 + (save.beaten[A.bossId] || 0)) * dt);
      if (Math.random() < dt * 20) burst(new THREE.Vector3(b.pos.x, CAVE.floor + 0.2, b.pos.z), 0x8a7a6a, 2, 2, 0.25, 0.5);
      if (!b.hitPlayer && dist < cfg.radius + 0.8) { b.hitPlayer = true; hurtPlayer(A, 4, b.pos.x, b.pos.z, 14); }
      if (!inRoom(b.pos.x, b.pos.z, 4.5)) {
        b.state = 'stunned'; b.t = 0; G.shake = 0.9; sfx('slam');
        burst(new THREE.Vector3(b.pos.x, CAVE.floor + 3, b.pos.z).addScaledVector(b.chargeDir, 1.5), 0xffcf4a, 22, 6, 0.3, 0.8);
        showToast(`The ${cfg.name} bonked the wall! Hit it now!`, 1.6);
      } else if (b.t > 1.5) toChase(A);
    } else if (at === 'leap') {
      const p = Math.min(1, b.t / 0.9);
      b.pos.lerpVectors(b.leapFrom, b.leapTo, p);
      b.pos.y = CAVE.floor + Math.sin(p * Math.PI) * 6 + (A.bossId === 'squid' ? 1.5 : 0);
      if (p >= 1) { b.pos.y = CAVE.floor + (A.bossId === 'squid' ? 1.5 : 0); if (b.t > 1.4) toChase(A); }
    } else if (b.t > (at === 'spin' ? 1.0 : at === 'rain' || at === 'tentacles' ? 1.3 : 0.8)) toChase(A);
  } else if (st === 'burrowed') {
    // hidden under the sand, sneaking toward you
    if (b.t < 1.6) {
      b.pos.x += dx / (dist || 1) * Math.min(dist, 9 * dt); b.pos.z += dz / (dist || 1) * Math.min(dist, 9 * dt);
      if (Math.random() < dt * 25) burst(new THREE.Vector3(b.pos.x, CAVE.floor + 0.1, b.pos.z), 0xe0c070, 2, 2.5, 0.2, 0.6);
    } else if (!b.emergeCircle) {
      b.emergeCircle = addCircle(A, b.pos.x, b.pos.z, 3, 0.9, t => {
        sfx('roar'); G.shake = 1; burst(new THREE.Vector3(t.x, CAVE.floor + 0.5, t.z), 0xe0c070, 30, 8, 0.25, 0.9);
        if (inCircle(t)) hurtPlayer(A, 4, t.x, t.z, 12);
        b.emergeCircle = null; b.state = 'act'; b.attack = 'emerged'; b.t = 0;
      });
    }
  } else if (st === 'stunned') {
    if (Math.random() < dt * 8) burst(new THREE.Vector3(b.pos.x, b.pos.y + cfg.height + 0.5, b.pos.z), 0xffcf4a, 1, 1.5, 0.15, 0.6, 0);
    if (b.t > 2.0) toChase(A);
  } else if (st === 'sleep') {
    b.zzzT -= dt;
    if (b.zzzT <= 0) {
      b.zzzT = 1.0;
      floatSprite(textSprite('Z', '#bfe6ff', 1.2 + Math.random() * 0.6, null), new THREE.Vector3(b.pos.x + 0.6, b.pos.y + cfg.height * 0.8, b.pos.z - 1), new THREE.Vector3(0.3, 0.9, 0), 2.2);
    }
  } else if (st === 'wake') {
    if (b.t > 2.0) { b.state = 'chase'; b.t = 0; b.cooldown = 1.2; }
  } else if (st === 'emerge') {
    if (A.bossId === 'scorpion') {
      if (Math.random() < dt * 30) burst(new THREE.Vector3(b.pos.x + (Math.random() - 0.5) * 5, CAVE.floor + 0.3, b.pos.z + (Math.random() - 0.5) * 5), 0xe0c070, 2, 5, 0.25, 0.9);
      if (b.t > 2.6 && fightArena === A) { b.state = 'chase'; b.t = 0; b.cooldown = 1.5; }
    } else {
      const p = Math.min(1, b.t / 2.6);
      b.pos.y = CAVE.floor + 28 * (1 - p) * (1 - p);
      if (b.t > 3.4 && fightArena === A) { b.state = 'chase'; b.t = 0; b.cooldown = 1.5; }
    }
  } else if (st === 'dying') {
    if (Math.random() < dt * 25) burst(new THREE.Vector3(b.pos.x + (Math.random() - 0.5) * 3, b.pos.y + 1 + Math.random() * 3, b.pos.z + (Math.random() - 0.5) * 3), EGGS[cfg.egg].spotA, 3, 5, 0.25, 0.8);
    if (b.t > 1.8) bossDefeated(A);
  }

  if (st !== 'gone' && st !== 'hidden' && st !== 'burrowed' && st !== 'sleep') {
    clampToRoom(b.pos, 4.5);
    const a = player.mounted ? pet : player;
    const pdx = a.pos.x - b.pos.x, pdz = a.pos.z - b.pos.z, pd = Math.hypot(pdx, pdz), minD = cfg.radius + a.hw;
    if (pd < minD && pd > 0.01 && Math.abs(a.pos.y - b.pos.y) < cfg.height) {
      const nx = b.pos.x + pdx / pd * minD, nz = b.pos.z + pdz / pd * minD;
      if (!collidesAt(G.world, nx, a.pos.y, nz, a.hw, player.mounted ? mountedHeight() : a.h)) { a.pos.x = nx; a.pos.z = nz; }
    }
  }
  if (st === 'sleep' && dist < cfg.radius + 0.6 && !player.mounted) {
    player.pos.x = b.pos.x + dx / dist * (cfg.radius + 0.8); player.pos.z = b.pos.z + dz / dist * (cfg.radius + 0.8);
  }
  if (b.flashT > 0) { b.flashT -= dt; if (b.flashT <= 0) b.model.flash(false); }
  poseBoss(A, dt);
  updateTelegraphs(A, dt);
  updateProjectiles(A, dt);
  updateHearts3D(A, dt);
  if (fightArena === A) $('bossFill').style.width = (b.hp / b.maxHp * 100) + '%';
}

function toChase(A) {
  const b = A.boss;
  b.state = 'chase'; b.t = 0;
  b.cooldown = (b.phase2 ? 1.0 : 1.6) + Math.random() * 0.6 - Math.min(0.5, (save.beaten[A.bossId] || 0) * 0.15);
  if (A.bossId !== 'squid') b.pos.y = CAVE.floor;
}

// ---------- poses (how each boss moves) ----------
function smoothTo(obj, prop, target, k) { obj[prop] += (target - obj[prop]) * k; }
function poseBoss(A, dt, snap) {
  const b = A.boss, M = b.model, P = M.P, st = b.state, at = b.attack;
  const k = snap ? 1 : 1 - Math.exp(-dt * 10);
  const p = b.windup ? Math.min(1, b.t / b.windup) : 0;
  const sw = Math.sin(b.walk);
  M.root.visible = st !== 'gone' && st !== 'hidden' && st !== 'burrowed';
  M.root.position.copy(b.pos);
  M.root.rotation.y = b.yaw;
  if (st === 'dying') { M.root.position.x += (Math.random() - 0.5) * 0.3; M.inner.rotation.z = Math.min(1.4, b.t); }
  else M.inner.rotation.z = 0;
  if (A.bossId === 'deer') {
    const sleep = st === 'sleep', wakeP = st === 'wake' ? Math.min(1, b.t / 1.8) : 1;
    const fold = sleep ? 1 : st === 'wake' ? 1 - wakeP : 0;
    smoothTo(M.inner.position, 'y', -2.2 * fold + (st === 'chase' || (st === 'act' && at === 'charge') ? Math.abs(sw) * 0.25 : 0), k);
    const legSwing = st === 'chase' || (st === 'act' && at === 'charge') ? sw * (at === 'charge' && st === 'act' ? 0.9 : 0.5) : 0;
    P.legs.forEach((l, i) => smoothTo(l.rotation, 'x', fold ? (i < 2 ? -1.5 : 1.5) * fold : (i === 0 || i === 3 ? legSwing : -legSwing), k));
    let neck = sleep ? 1.3 : 0.35, rear = 0;
    if (at === 'charge' && (st === 'windup' || st === 'act')) neck = 1.25;
    if (at === 'stomp' && st === 'windup') rear = -0.7 * p;
    if (at === 'stomp' && st === 'act') rear = 0.15;
    if (at === 'leap' && st === 'act') rear = -0.3;
    if (st === 'stunned') neck = 0.9 + Math.sin(G.time * 8) * 0.2;
    smoothTo(P.neck.rotation, 'x', neck, k);
    smoothTo(M.inner.rotation, 'x', rear, k);
    P.eyes.forEach(e => e.material.color.setHex(sleep ? 0x2a2a2a : 0xffffff));
  } else if (A.bossId === 'scorpion') {
    const emergeP = st === 'emerge' ? Math.min(1, b.t / 1.6) : 1;
    M.root.position.y = b.pos.y - 4 * (1 - emergeP);
    if (st === 'act' && at === 'emerged') M.root.position.y = b.pos.y - 3 * Math.max(0, 1 - b.t * 3);
    P.legs.forEach((l, i) => { l.rotation.y = (st === 'chase' || (st === 'act' && at === 'charge')) ? Math.sin(b.walk * 1.6 + i * 1.2) * 0.4 : 0; });
    let arm = -0.35, jaw = 0.0, tail0 = -0.9, tailN = -0.5;
    if (at === 'pinch' && st === 'windup') { arm = 0.3; jaw = 0.6 * p; }
    if (at === 'pinch' && st === 'act') { arm = -0.1; jaw = 0; }
    if (at === 'sting' && st === 'windup') { tail0 = -1.4; tailN = -0.65; }
    if (at === 'sting' && st === 'act') { tail0 = -0.3; tailN = -0.35; }
    if (st === 'stunned') { tail0 = -0.4; tailN = -0.2; }
    P.claws.forEach((c, i) => { smoothTo(c.arm.rotation, 'y', (i ? 1 : -1) * arm, k); smoothTo(c.jaw.rotation, 'y', (i ? -1 : 1) * jaw, k); });
    P.tailSegs.forEach((s, i) => smoothTo(s.rotation, 'x', i === 0 ? tail0 : tailN, k * (at === 'sting' && st === 'act' ? 2.5 : 1)));
  } else if (A.bossId === 'squid') {
    const sleep = st === 'sleep';
    P.lids.forEach(l => { l.visible = sleep; });
    const bob = sleep ? 0 : Math.sin(G.time * 2) * 0.3;
    M.root.position.y = b.pos.y + bob + (st === 'wake' ? Math.min(1, b.t) * 0.8 : 0);
    if (at === 'spin' && st === 'act') M.root.rotation.y = b.yaw + b.t * 14;
    const raise = (at === 'tentacles' || at === 'rain') && (st === 'windup' || st === 'act') ? -0.6 : 0;
    P.tentacles.forEach((tt, i) => tt.joints.forEach((j, n) => {
      const sx = sleep ? 0.15 * n : (Math.sin(G.time * 3 + i + n) * 0.25 * (n + 1) * 0.5 + raise * (n === 0 ? 1 : 0.4));
      j.rotation.x = sx * Math.cos(tt.a) + (at === 'spin' && st === 'windup' ? 0.6 : 0) * (n === 0 ? 1 : 0);
      j.rotation.z = -sx * Math.sin(tt.a);
    }));
  } else if (A.bossId === 'spider') {
    if (A.web) {
      const show = st === 'emerge' || st === 'hidden';
      A.web.visible = show && M.root.visible;
      const top = CAVE.floor + 34, bottom = b.pos.y + 3.5;
      A.web.scale.y = Math.max(0.1, top - bottom);
      A.web.position.set(b.pos.x, (top + bottom) / 2, b.pos.z - 1.2);
    }
    const moving = st === 'chase' || (st === 'act' && at === 'charge');
    P.legs.forEach((l, i) => { l.rotation.y = l.userData.baseY + (moving ? Math.sin(b.walk * 1.8 + i * 1.3) * 0.35 : 0); });
    let crouch = 0, front = 0;
    if ((at === 'leap' || at === 'stomp') && st === 'windup') crouch = -0.6 * p;
    if (at === 'stomp' && st === 'windup') front = -0.9 * p;
    if (at === 'leap' && st === 'act') crouch = 0.3;
    if (st === 'emerge') crouch = 0.4;
    smoothTo(M.inner.position, 'y', crouch, k);
    [0, 1].forEach(i => smoothTo(P.legs[i].rotation, 'x', front, k));
    smoothTo(M.inner.rotation, 'x', st === 'stunned' ? 0.25 + Math.sin(G.time * 8) * 0.1 : 0, k);
  }
}

// ---------- hitting the boss ----------
function bossHere() { const A = arenaHere(); return A && !['gone', 'dying', 'hidden', 'burrowed'].includes(A.boss.state) ? A : null; }
function bossAimPoint() { const A = bossHere(); return A ? new THREE.Vector3(A.boss.pos.x, A.boss.pos.y + A.cfg.height * 0.45, A.boss.pos.z) : null; }
function bossInReach(reach) {
  const A = bossHere();
  if (!A) return null;
  const c = playerCenter(), b = A.boss;
  const dx = b.pos.x - c.x, dz = b.pos.z - c.z, d = Math.hypot(dx, dz);
  if (d - A.cfg.radius > reach || Math.abs(c.y - (b.pos.y + A.cfg.height * 0.4)) > A.cfg.height) return null;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  return ((dx * fx + dz * fz) / (d || 1) > 0.15 || d < A.cfg.radius + 1) ? A : null;
}
function bulletHitsBoss(p, dmg) {
  const A = bossHere();
  if (!A) return false;
  const b = A.boss;
  if (Math.hypot(p.x - b.pos.x, p.z - b.pos.z) < A.cfg.radius + 0.4 && p.y > b.pos.y - 0.5 && p.y < b.pos.y + A.cfg.height + 0.5) { damageBoss(A, dmg); return true; }
  return false;
}
function damageBoss(A, base) {
  const b = A.boss;
  if (b.state === 'sleep') { wakeBoss(A); return; }
  if (b.state === 'wake' || b.state === 'emerge' || b.state === 'dying' || b.state === 'gone') return;
  const stunned = b.state === 'stunned';
  const crit = stunned || Math.random() < 0.1;
  const dmg = Math.round(base * (crit ? 1.6 : 1));
  b.hp = Math.max(0, b.hp - dmg);
  b.flashT = 0.12; b.model.flash(true);
  sfx('hit');
  const hitPos = new THREE.Vector3(b.pos.x, b.pos.y + A.cfg.height * 0.5 + Math.random(), b.pos.z);
  burst(hitPos, EGGS[A.cfg.egg].spotA, 6, 4, 0.15, 0.5);
  damageNumber(dmg + (crit ? '!' : ''), hitPos.clone().add(new THREE.Vector3(0, 1.5, 0)), crit ? 'crit' : '');
  while (A.heartMarks.length && b.hp / b.maxHp <= A.heartMarks[0]) { A.heartMarks.shift(); spawnHeart(A); }
  if (!b.phase2 && b.hp <= b.maxHp / 2 && b.hp > 0) {
    b.phase2 = true;
    showToast(`The ${A.cfg.name} is ANGRY!`, 2);
    G.shake = 0.7; sfx('roar');
  }
  if (b.hp <= 0) {
    b.state = 'dying'; b.t = 0; clearAttacks(A);
    if (A.bossId !== 'squid') b.pos.y = CAVE.floor;
    sfx('roar');
    showToast(`You beat the ${A.cfg.name}!!!`, 2.4);
  }
}

function bossDefeated(A) {
  const b = A.boss;
  if (b.state === 'gone') return;
  b.state = 'gone';
  for (let i = 0; i < 4; i++) burst(new THREE.Vector3(b.pos.x, b.pos.y + 2, b.pos.z), [0xffcf4a, EGGS[A.cfg.egg].spotA, EGGS[A.cfg.egg].spotB, 0xffffff][i], 25, 9, 0.28, 1.3);
  G.shake = 1; sfx('slam'); sfx('win');
  fightArena = null;
  $('bossbar').hidden = true;
  setBarrier(A, false);
  A.defeated = true;
  const first = !save.beaten[A.bossId];
  save.beaten[A.bossId] = (save.beaten[A.bossId] || 0) + 1;
  const coins = first ? A.cfg.coins : Math.round(A.cfg.coins * 0.6);
  addCoins(coins);
  damageNumber(`+${coins} coins`, new THREE.Vector3(b.pos.x, b.pos.y + 4, b.pos.z), 'crit');
  setTimeout(() => showToast(`+${coins} COINS! Spend them at the village shop.`, 2.6), 3900);
  const idx = BOSS_ORDER.indexOf(A.bossId);
  if (save.progress === idx) save.progress = idx + 1;
  writeSave();
  setTimeout(() => {
    A.chestState = 'ready'; A.chest.root.visible = true; A.chest.lid.rotation.x = 0;
    burst(new THREE.Vector3(CAVE.chest.x, CAVE.floor + 0.6, CAVE.chest.z), 0xffcf4a, 30, 5, 0.18, 1.2);
    sfx('chest');
    if (A.cfg.scroll && first) { A.scrollState = 'ready'; A.scroll.visible = true; }
    if (A.scuba && !save.scuba) { A.scubaState = 'ready'; A.scuba.visible = true; }
    if (A.bossId === 'spider' && !save.rocket) {
      save.rocket = true; writeSave();
      updateHotbar();
      setTimeout(() => showToast('You got a ROCKET SHIP! It\'s in your hotbar. Hold it outside and tap to fly to another planet!', 4.5), 6800);
    }
    showToast('A treasure chest appeared! Grab the egg too!', 2.6);
  }, 1200);
}

// ---------- knocked out ----------
function knockedOut(A) {
  G.dead = true;
  clearAttacks(A);
  setTimeout(() => {
    $('deathTip').textContent = deathTips[Math.floor(Math.random() * deathTips.length)];
    $('deathText').textContent = `The ${A.cfg.name} won this time. Try again!`;
    openModal('death');
  }, 600);
}
const deathTips = [
  'Tip: Red circles show where an attack will land. Get out of them!',
  'Tip: When a boss charges and hits the wall, it gets dizzy. That\'s the best time to hit it.',
  'Tip: Grab the floating hearts during the fight to heal.',
  'Tip: Ride your pet in the fight to dodge faster. Press R near your pet.',
  'Tip: Better armor from treasure chests blocks more damage.',
];
function respawnAfterKO() {
  closeModal();
  G.dead = false;
  player.hp = player.maxHp;
  player.invuln = 1.5;
  player.slowT = 0;
  updateHearts();
  const A = arenaHere();
  if (A) resetArena(A);
  placeActors(CAVE.start.x, null, CAVE.start.z + 2, Math.PI);
}
