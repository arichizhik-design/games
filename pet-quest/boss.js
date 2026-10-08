// The Crystal Golem boss fight.
'use strict';

const telegraphs = [], projectiles = [], falling = [];
const teleMat = () => new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });

function makeGolem() {
  return {
    model: makeGolemModel(), pos: new THREE.Vector3(CAVE.golem.x, CAVE.floor, CAVE.golem.z), yaw: Math.PI,
    state: 'sleep', t: 0, hp: 1, maxHp: 1, cooldown: 2, attack: null, phase2: false, flashT: 0, zzzT: 0,
    walk: 0, hitPlayer: false, chargeDir: new THREE.Vector3(), lastAttack: '',
    pose: { rootY: -0.9, legs: -1.45, upper: 0.35, head: 0.45, armL: -0.6, armR: -0.6, armZ: 0.1 },
  };
}

function golemLevel() { return save.golemLevel; }
function golemMult() { return 1 + 0.25 * golemLevel(); }

function resetGolem() {
  const g = golem;
  g.pos.set(CAVE.golem.x, CAVE.floor, CAVE.golem.z);
  g.yaw = Math.PI;
  g.state = 'sleep'; g.t = 0; g.attack = null; g.phase2 = false; g.cooldown = 2;
  g.maxHp = Math.round(220 * (1 + 0.5 * golemLevel()));
  g.hp = g.maxHp;
  g.model.root.visible = true;
  g.model.setAwake(false);
  g.model.flash(false);
  Object.assign(g.pose, { rootY: -0.9, legs: -1.45, upper: 0.35, head: 0.45, armL: -0.6, armR: -0.6, armZ: 0.1 });
  nestEgg.visible = true;
  nestEgg.position.copy(nestEgg.home);
  nestEgg.flying = null;
  chest.root.visible = false;
  chest.lid.rotation.x = 0;
  G.chestOpened = false;
  G.inFight = false;
  player.eggHeld = false;
  clearAttacks();
  setBarrier(false);
  $('bossbar').hidden = true;
}

function clearAttacks() {
  for (const t of telegraphs) G.levels.cave.group.remove(t.mesh);
  for (const p of projectiles) G.levels.cave.group.remove(p.mesh);
  for (const f of falling) G.levels.cave.group.remove(f.mesh);
  telegraphs.length = projectiles.length = falling.length = 0;
}

function onEnterCave() {
  if (G.golemDefeatedThisVisit || golem.state !== 'sleep' || golem.hp <= 0) resetGolem();
  G.golemDefeatedThisVisit = false;
  if (save.step >= 2 && save.step < 6) setStep(6);
}
function onLeaveCave() {
  if (G.inFight) resetGolem();
}

// crystal wall across the tunnel while you fight, so nobody runs away mid-battle
function setBarrier(on) {
  const w = G.levels.cave.world;
  if (on) {
    barrierBlocks = [];
    for (const z of CAVE.barrierZ) for (let x = 20; x < 52; x++) for (let y = CAVE.floor; y < CAVE.floor + 9; y++) {
      if (w.get(x, y, z) === B.AIR) { w.set(x, y, z, B.AMETHYST); barrierBlocks.push([x, y, z]); }
    }
  } else {
    for (const [x, y, z] of barrierBlocks) w.set(x, y, z, B.AIR);
    if (!barrierBlocks.length) return;
    barrierBlocks = [];
  }
  const chunksDone = new Set();
  for (let x = 20; x < 52; x += 4) for (const z of CAVE.barrierZ) {
    const key = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    if (!chunksDone.has(key)) { chunksDone.add(key); w.rebuildAt(x, z); }
  }
}

// ---------- the egg ----------
function nearEgg() {
  return G.world.name === 'cave' && nestEgg.visible && !nestEgg.flying && golem.state === 'sleep' &&
    Math.hypot(player.pos.x - nestEgg.home.x, player.pos.z - nestEgg.home.z) < 2.8;
}
function pickUpEgg() {
  player.eggHeld = true;
  nestEgg.visible = false;
  sfx('pickup');
  showToast('You picked up the Crystal Egg...');
  setTimeout(() => {
    wakeGolem();
    setTimeout(() => {
      // it slips right out of your hands and rolls back to the nest
      player.eggHeld = false;
      nestEgg.visible = true;
      nestEgg.flying = { from: new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), to: nestEgg.home.clone(), t: 0, dur: 0.7, toPlayer: false };
      showToast('The egg falls out of your hands! Beat the Golem to win it!');
    }, 900);
  }, 650);
}

function wakeGolem() {
  if (golem.state !== 'sleep') return;
  golem.state = 'wake'; golem.t = 0;
  golem.model.setAwake(true);
  G.inFight = true;
  G.shake = 0.9;
  sfx('roar');
  showToast('The Crystal Golem wakes up!!!', 2);
  setBarrier(true);
  $('bossbar').hidden = false;
  $('bossName').textContent = `Crystal Golem · Level ${golemLevel() + 1}`;
  if (save.step < 8) setStep(8);
}

// ---------- telegraphs (red warnings on the floor) ----------
function addCircle(x, z, r, dur, onDone) {
  const grp = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.18, r, 40), teleMat());
  ring.material.opacity = 0.85;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), teleMat());
  grp.add(ring, fill);
  grp.rotation.x = -Math.PI / 2;
  grp.position.set(x, CAVE.floor + 0.04, z);
  fill.scale.setScalar(0.01);
  G.levels.cave.group.add(grp);
  telegraphs.push({ mesh: grp, fill, t: 0, dur, onDone, x, z, r });
}
function addLine(x, z, dirX, dirZ, len, width, dur) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len), teleMat());
  m.material.opacity = 0.4;
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(dirX, dirZ) + Math.PI;
  m.position.set(x + dirX * len / 2, CAVE.floor + 0.05, z + dirZ * len / 2);
  G.levels.cave.group.add(m);
  telegraphs.push({ mesh: m, fill: null, t: 0, dur, onDone: null });
}
function updateTelegraphs(dt) {
  for (let i = telegraphs.length - 1; i >= 0; i--) {
    const t = telegraphs[i];
    t.t += dt;
    const p = Math.min(1, t.t / t.dur);
    if (t.fill) { t.fill.scale.setScalar(Math.max(0.01, p)); t.fill.material.opacity = 0.2 + p * 0.3; }
    else t.mesh.material.opacity = 0.25 + Math.sin(t.t * 20) * 0.12;
    if (p >= 1) {
      G.levels.cave.group.remove(t.mesh);
      telegraphs.splice(i, 1);
      if (t.onDone) t.onDone(t);
    }
  }
}

// ---------- hurting the player ----------
function playerCenter() {
  const a = player.mounted ? pet : player;
  return new THREE.Vector3(a.pos.x, a.pos.y + (player.mounted ? pet.model.saddleY + 0.5 : 0.9), a.pos.z);
}
function hurtPlayer(amount, fromX, fromZ, knock = 9) {
  if (player.invuln > 0 || G.dead) return;
  const dmg = Math.max(1, Math.round(amount * golemMult() * (1 - ARMORS[save.armor].block)));
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
  if (player.hp <= 0) knockedOut();
}

// ---------- attacks ----------
function golemForward() { return new THREE.Vector3(Math.sin(golem.yaw), 0, Math.cos(golem.yaw)); }

function startAttack(name) {
  const g = golem;
  g.attack = name; g.state = 'windup'; g.t = 0; g.hitPlayer = false; g.lastAttack = name;
  const fast = g.phase2 ? 0.78 : 1;
  if (name === 'slam') {
    const f = golemForward();
    const cx = g.pos.x + f.x * 2.6, cz = g.pos.z + f.z * 2.6;
    g.windup = 0.95 * fast;
    addCircle(cx, cz, 4.3, g.windup, t => {
      sfx('slam'); G.shake = 0.8;
      burst(new THREE.Vector3(t.x, CAVE.floor + 0.3, t.z), 0xb77bff, 26, 7, 0.25, 0.8);
      burst(new THREE.Vector3(t.x, CAVE.floor + 0.3, t.z), 0x8a7aa8, 18, 5, 0.3, 0.8);
      const pc = playerCenter();
      const a = player.mounted ? pet : player;
      const grounded = a.onGround;
      if (Math.hypot(pc.x - t.x, pc.z - t.z) < t.r + 0.3 && grounded) hurtPlayer(4, t.x, t.z, 11);
    });
  } else if (name === 'shards') {
    g.windup = 0.75 * fast;
  } else if (name === 'charge') {
    const pc = playerCenter();
    g.chargeDir.set(pc.x - g.pos.x, 0, pc.z - g.pos.z).normalize();
    g.yaw = Math.atan2(g.chargeDir.x, g.chargeDir.z);
    g.windup = 0.9 * fast;
    addLine(g.pos.x, g.pos.z, g.chargeDir.x, g.chargeDir.z, 20, 3.2, g.windup);
    sfx('charge');
  } else if (name === 'rain') {
    g.windup = 0.6;
    sfx('roar');
    const pc = playerCenter();
    const spots = [[pc.x, pc.z]];
    for (let i = 0; i < 5 + golemLevel(); i++) {
      const a = Math.random() * TAU, r = 2.5 + Math.random() * 6;
      spots.push([pc.x + Math.cos(a) * r, pc.z + Math.sin(a) * r]);
    }
    spots.forEach(([x, z], i) => {
      if (Math.hypot(x - CAVE.room.x, z - CAVE.room.z) > CAVE.room.r - 2) return;
      const delay = 1.1 + i * 0.12;
      addCircle(x, z, 1.7, delay, t => {
        burst(new THREE.Vector3(t.x, CAVE.floor + 0.4, t.z), 0xb77bff, 14, 5, 0.2, 0.6);
        sfx('shatter');
        const p2 = playerCenter();
        if (Math.hypot(p2.x - t.x, p2.z - t.z) < 1.9) hurtPlayer(3, t.x, t.z, 6);
      });
      const crystalMesh = box(0.7, 1.8, 0.7, pixMat(i % 2 ? 0x5ff0e6 : 0xb77bff, { glow: true }));
      crystalMesh.position.set(x, CAVE.floor + 14, z);
      G.levels.cave.group.add(crystalMesh);
      falling.push({ mesh: crystalMesh, t: 0, start: delay - 0.4, dur: 0.4 });
    });
  }
}

function golemAct() {
  const g = golem;
  g.state = 'act'; g.t = 0;
  if (g.attack === 'shards') {
    const pc = playerCenter();
    const hand = new THREE.Vector3(g.pos.x, CAVE.floor + 5, g.pos.z).addScaledVector(golemForward(), 1.5);
    const n = (g.phase2 ? 5 : 3) + Math.min(2, golemLevel());
    const base = Math.atan2(pc.x - hand.x, pc.z - hand.z);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.2;
      const dist = Math.hypot(pc.x - hand.x, pc.z - hand.z);
      const speed = 13;
      const vy = ((pc.y - hand.y) / Math.max(0.5, dist / speed));
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), pixMat(i % 2 ? 0x5ff0e6 : 0xb77bff, { glow: true }));
      mesh.position.copy(hand);
      mesh.scale.set(0.8, 1.5, 0.8);
      G.levels.cave.group.add(mesh);
      projectiles.push({ mesh, vel: new THREE.Vector3(Math.sin(a) * speed, vy, Math.cos(a) * speed), life: 3 });
    }
    sfx('shard');
  } else if (g.attack === 'charge') {
    sfx('roar');
  }
}

function updateProjectiles(dt) {
  const w = G.levels.cave.world;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.y += dt * 10;
    const pos = p.mesh.position;
    let gone = p.life <= 0;
    if (!gone && pos.distanceTo(playerCenter()) < 1.0) { hurtPlayer(2, pos.x - p.vel.x, pos.z - p.vel.z, 6); gone = true; }
    if (!gone && (w.solid(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)) || pos.y < CAVE.floor)) gone = true;
    if (gone) {
      burst(pos, 0x5ff0e6, 8, 4, 0.12, 0.5);
      sfx('shatter');
      G.levels.cave.group.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
  for (let i = falling.length - 1; i >= 0; i--) {
    const f = falling[i];
    f.t += dt;
    const p = (f.t - f.start) / f.dur;
    if (p < 0) continue;
    f.mesh.position.y = CAVE.floor + 14 - Math.min(1, p) * 13.2;
    if (p >= 1) { G.levels.cave.group.remove(f.mesh); falling.splice(i, 1); }
  }
}

// ---------- the golem's brain ----------
function updateGolem(dt) {
  const g = golem, m = g.model, P = g.pose;
  g.t += dt;
  const target = {};
  const pc = playerCenter();
  const dx = pc.x - g.pos.x, dz = pc.z - g.pos.z, dist = Math.hypot(dx, dz);
  const R = CAVE.room;

  // the egg on the nest bobs and glows; it can fly back to the nest or to you
  if (nestEgg.flying) {
    const f = nestEgg.flying;
    f.t += dt;
    const p = Math.min(1, f.t / f.dur);
    const to = f.toPlayer ? playerCenter() : f.to;
    nestEgg.position.lerpVectors(f.from, to, p);
    nestEgg.position.y += Math.sin(p * Math.PI) * 2;
    if (p >= 1) {
      nestEgg.flying = null;
      if (f.toPlayer) { nestEgg.visible = false; onEggWon(); }
    }
  } else if (nestEgg.visible) {
    nestEgg.position.y = nestEgg.home.y + Math.sin(G.time * 2) * 0.08;
    nestEgg.rotation.y += dt * 0.6;
    if (Math.random() < dt * 3) burst(nestEgg.position.clone().add(new THREE.Vector3((Math.random() - 0.5), 0.4 + Math.random() * 0.6, (Math.random() - 0.5))), Math.random() < 0.5 ? 0x5ff0e6 : 0xb77bff, 1, 0.6, 0.08, 1.2, -0.5);
  }

  if (g.state === 'gone') { m.root.visible = false; }
  else if (g.state === 'sleep') {
    Object.assign(target, { rootY: -0.9, legs: -1.45, upper: 0.35 + Math.sin(G.time * 1.4) * 0.03, head: 0.5, armL: -0.6, armR: -0.6, armZ: 0.1 });
    g.zzzT -= dt;
    if (g.zzzT <= 0) {
      g.zzzT = 1.0;
      const head = new THREE.Vector3(); m.head.getWorldPosition(head);
      floatSprite(textSprite('Z', '#bfe6ff', 1.2 + Math.random() * 0.6, null), head.add(new THREE.Vector3(0.6, 1.6, 0.3)), new THREE.Vector3(0.3, 0.9, 0), 2.2);
    }
  } else if (g.state === 'wake') {
    const p = Math.min(1, g.t / 2.2);
    Object.assign(target, { rootY: -0.9 * (1 - p), legs: -1.45 * (1 - p), upper: 0.35 - p * 0.45, head: 0.5 - p * 0.9, armL: -0.6 - p * 1.8, armR: -0.6 - p * 1.8, armZ: 0.1 + p * 0.3 });
    if (g.t > 2.2) { g.state = 'chase'; g.t = 0; g.cooldown = 1.2; }
  } else if (g.state === 'chase') {
    g.yaw = turnToward(g.yaw, Math.atan2(dx, dz), dt * (g.phase2 ? 4 : 3));
    const speed = (2.6 + golemLevel() * 0.25) * (g.phase2 ? 1.3 : 1);
    if (dist > 3.6) {
      const f = golemForward();
      g.pos.addScaledVector(f, speed * dt);
      g.walk += dt * speed * 1.4;
    }
    const sw = Math.sin(g.walk) * 0.5;
    Object.assign(target, { rootY: Math.abs(Math.sin(g.walk)) * 0.12, legs: sw, upper: 0.08, head: 0, armL: -sw * 0.7, armR: sw * 0.7, armZ: 0.12 });
    g.cooldown -= dt;
    if (g.cooldown <= 0) {
      const pick = [];
      if (dist < 6) pick.push('slam', 'slam', 'slam', 'shards');
      else pick.push('shards', 'shards', 'charge', 'charge');
      if (dist >= 6 || Math.random() < 0.3) pick.push('charge');
      if (g.phase2) pick.push('rain', 'rain');
      let a = pick[Math.floor(Math.random() * pick.length)];
      if (a === g.lastAttack && Math.random() < 0.5) a = pick[Math.floor(Math.random() * pick.length)];
      startAttack(a);
    }
  } else if (g.state === 'windup') {
    if (g.attack !== 'charge') g.yaw = turnToward(g.yaw, Math.atan2(dx, dz), dt * 2);
    const p = Math.min(1, g.t / g.windup);
    if (g.attack === 'slam') Object.assign(target, { rootY: 0, legs: 0, upper: -0.2 * p, head: -0.2, armL: -3.0 * p, armR: -3.0 * p, armZ: 0.05 });
    else if (g.attack === 'shards') Object.assign(target, { rootY: 0, legs: 0, upper: -0.1, head: -0.1, armL: -0.3, armR: -2.9 * p, armZ: 0.2 });
    else if (g.attack === 'charge') Object.assign(target, { rootY: -0.2 * p, legs: 0.3, upper: 0.5 * p, head: -0.3, armL: 0.7 * p, armR: 0.7 * p, armZ: 0.3 });
    else Object.assign(target, { rootY: 0, legs: 0, upper: -0.3, head: -0.6, armL: -2.6, armR: -2.6, armZ: 0.6 });
    if (g.t >= g.windup) golemAct();
  } else if (g.state === 'act') {
    if (g.attack === 'slam') {
      Object.assign(target, { rootY: -0.3, legs: 0.2, upper: 0.45, head: 0.1, armL: -0.9, armR: -0.9, armZ: 0.05 });
      if (g.t > 0.9) toChase();
    } else if (g.attack === 'shards') {
      Object.assign(target, { rootY: 0, legs: 0, upper: 0.15, head: 0, armL: -0.3, armR: -1.2, armZ: 0.2 });
      if (g.t > 0.7) toChase();
    } else if (g.attack === 'charge') {
      g.walk += dt * 14;
      const sw = Math.sin(g.walk) * 0.8;
      Object.assign(target, { rootY: Math.abs(Math.sin(g.walk)) * 0.25, legs: sw, upper: 0.55, head: -0.35, armL: 0.8, armR: 0.8, armZ: 0.3 });
      g.pos.addScaledVector(g.chargeDir, (15 + golemLevel()) * dt);
      if (Math.random() < dt * 20) burst(new THREE.Vector3(g.pos.x, CAVE.floor + 0.2, g.pos.z), 0x8a7aa8, 2, 2, 0.25, 0.5);
      if (!g.hitPlayer && dist < 2.4) { g.hitPlayer = true; hurtPlayer(5, g.pos.x, g.pos.z, 14); }
      if (Math.hypot(g.pos.x - R.x, g.pos.z - R.z) > R.r - 4.5) {
        g.state = 'stunned'; g.t = 0; G.shake = 0.9; sfx('slam');
        burst(new THREE.Vector3(g.pos.x, CAVE.floor + 3, g.pos.z).addScaledVector(g.chargeDir, 1.5), 0xb77bff, 22, 6, 0.3, 0.8);
        showToast('The Golem bonked the wall! Hit it now!', 1.6);
      } else if (g.t > 1.5) toChase();
    } else if (g.attack === 'rain') {
      Object.assign(target, { rootY: 0, legs: 0, upper: -0.3, head: -0.6, armL: -2.6, armR: -2.6, armZ: 0.6 });
      if (g.t > 1.2) toChase();
    }
  } else if (g.state === 'stunned') {
    Object.assign(target, { rootY: -0.4, legs: 0.3, upper: 0.6, head: 0.4 + Math.sin(G.time * 8) * 0.2, armL: 0.1, armR: 0.1, armZ: 0.4 });
    if (Math.random() < dt * 8) {
      const head = new THREE.Vector3(); m.head.getWorldPosition(head);
      burst(head.add(new THREE.Vector3(0, 1.6, 0)), 0xffcf4a, 1, 1.5, 0.15, 0.6, 0);
    }
    if (g.t > 2.0) toChase();
  } else if (g.state === 'dying') {
    Object.assign(target, { rootY: -0.6 * Math.min(1, g.t), legs: 0, upper: 0.6, head: 0.6, armL: 0, armR: 0, armZ: 0.5 });
    m.root.position.x = g.pos.x + (Math.random() - 0.5) * 0.3;
    if (Math.random() < dt * 25) burst(new THREE.Vector3(g.pos.x + (Math.random() - 0.5) * 3, CAVE.floor + 1 + Math.random() * 4, g.pos.z + (Math.random() - 0.5) * 2), Math.random() < 0.5 ? 0x5ff0e6 : 0xb77bff, 3, 5, 0.25, 0.8);
    if (g.t > 1.8) golemShatter();
  }

  // keep the golem in the room and out of the player
  const rd = Math.hypot(g.pos.x - R.x, g.pos.z - R.z), maxR = R.r - 4.5;
  if (rd > maxR) { g.pos.x = R.x + (g.pos.x - R.x) / rd * maxR; g.pos.z = R.z + (g.pos.z - R.z) / rd * maxR; }
  if (g.state !== 'gone' && g.state !== 'sleep') {
    const a = player.mounted ? pet : player;
    const pdx = a.pos.x - g.pos.x, pdz = a.pos.z - g.pos.z, pd = Math.hypot(pdx, pdz), minD = 2.1 + a.hw;
    if (pd < minD && pd > 0.01 && a.pos.y < CAVE.floor + 5) {
      const nx = g.pos.x + pdx / pd * minD, nz = g.pos.z + pdz / pd * minD;
      if (!collidesAt(G.world, nx, a.pos.y, nz, a.hw, player.mounted ? mountedHeight() : a.h)) { a.pos.x = nx; a.pos.z = nz; }
    }
  }
  if (g.state === 'sleep' && dist < 2.4 + 0.3 && !player.mounted) {
    // walking into a sleeping golem just bumps you back
    const a = player;
    a.pos.x = g.pos.x + dx / dist * 2.7; a.pos.z = g.pos.z + dz / dist * 2.7;
  }

  // smooth the pose and apply it
  const k = 1 - Math.exp(-dt * (g.state === 'act' && g.attack === 'slam' ? 30 : 9));
  for (const key in target) P[key] += (target[key] - P[key]) * k;
  if (g.state !== 'dying') m.root.position.x = g.pos.x;
  m.root.position.set(m.root.position.x, g.pos.y + P.rootY, g.pos.z);
  m.root.rotation.y = g.yaw;
  m.legs[0].rotation.x = P.legs; m.legs[1].rotation.x = g.state === 'sleep' || g.state === 'wake' ? P.legs : -P.legs;
  m.upper.rotation.x = P.upper;
  m.head.rotation.x = P.head;
  m.arms[0].rotation.x = P.armL; m.arms[1].rotation.x = P.armR;
  m.arms[0].rotation.z = -P.armZ; m.arms[1].rotation.z = P.armZ;
  if (g.flashT > 0) { g.flashT -= dt; if (g.flashT <= 0) m.flash(false); }

  updateTelegraphs(dt);
  updateProjectiles(dt);
  if (G.inFight) $('bossFill').style.width = (g.hp / g.maxHp * 100) + '%';
}

function toChase() {
  golem.state = 'chase'; golem.t = 0;
  golem.cooldown = (golem.phase2 ? 1.0 : 1.6) + Math.random() * 0.6 - golemLevel() * 0.1;
}

// ---------- hitting the golem ----------
function golemInReach() {
  if (G.world.name !== 'cave' || golem.state === 'gone' || golem.state === 'dying') return false;
  const c = playerCenter();
  const dx = golem.pos.x - c.x, dz = golem.pos.z - c.z, d = Math.hypot(dx, dz);
  if (d > 4.6) return false;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  return (dx * fx + dz * fz) / (d || 1) > 0.15 || d < 2.6;
}
function hitGolem() {
  const g = golem;
  if (g.state === 'gone' || g.state === 'dying') return;
  if (g.state === 'sleep') { wakeGolem(); }
  const stunned = g.state === 'stunned';
  const base = WEAPONS[save.weapon].dmg;
  const crit = stunned || Math.random() < 0.1;
  const dmg = Math.round(base * (crit ? 1.6 : 1));
  if (g.state === 'wake') return;
  g.hp = Math.max(0, g.hp - dmg);
  g.flashT = 0.12; g.model.flash(true);
  sfx('hit');
  const hitPos = new THREE.Vector3(g.pos.x, CAVE.floor + 3 + Math.random(), g.pos.z);
  burst(hitPos, 0xb77bff, 6, 4, 0.15, 0.5);
  damageNumber((crit ? '' : '') + dmg + (crit ? '!' : ''), hitPos.clone().add(new THREE.Vector3(0, 1.5, 0)), crit ? 'crit' : '');
  if (!g.phase2 && g.hp <= g.maxHp / 2 && g.hp > 0) {
    g.phase2 = true;
    showToast('The Golem is angry! Crystals will fall from the ceiling!', 2.2);
    G.shake = 0.7; sfx('roar');
  }
  if (g.hp <= 0) {
    g.state = 'dying'; g.t = 0; clearAttacks();
    sfx('roar');
    showToast('You beat the Crystal Golem!!!', 2.4);
  }
}

function golemShatter() {
  const g = golem;
  if (g.state === 'gone') return;
  g.state = 'gone';
  const parts = [];
  g.model.root.traverse(o => { if (o.isMesh) parts.push(o); });
  for (const o of parts) {
    const wp = new THREE.Vector3(); o.getWorldPosition(wp);
    burst(wp, o.material.color ? (o.material.map ? 0x6a5f86 : o.material.color.getHex()) : 0x6a5f86, 4, 8, 0.4, 1.2);
  }
  burst(new THREE.Vector3(g.pos.x, CAVE.floor + 3, g.pos.z), 0x5ff0e6, 40, 10, 0.3, 1.4);
  burst(new THREE.Vector3(g.pos.x, CAVE.floor + 3, g.pos.z), 0xb77bff, 40, 10, 0.3, 1.4);
  G.shake = 1; sfx('slam'); sfx('win');
  g.model.root.visible = false;
  G.inFight = false;
  $('bossbar').hidden = true;
  setBarrier(false);
  save.golemsBeaten++;
  save.golemLevel++;
  G.golemDefeatedThisVisit = true;
  writeSave();
  // the egg flies to you and a treasure chest appears
  nestEgg.visible = true;
  nestEgg.flying = { from: nestEgg.position.clone(), to: null, t: 0, dur: 1.0, toPlayer: true };
  setTimeout(() => {
    chest.root.visible = true;
    chest.lid.rotation.x = 0;
    G.chestOpened = false;
    burst(new THREE.Vector3(CAVE.chest.x, CAVE.floor + 0.6, CAVE.chest.z), 0xffcf4a, 30, 5, 0.18, 1.2);
    sfx('chest');
    showToast('A treasure chest appeared!', 2);
  }, 1300);
}

function onEggWon() {
  save.eggs++;
  writeSave();
  sfx('pickup');
  showToast('You got the Crystal Egg!', 2.2);
  updateHotbar();
  if (save.step < 9) setStep(9);
}

// ---------- knocked out ----------
function knockedOut() {
  G.dead = true;
  clearAttacks();
  setTimeout(() => {
    $('deathTip').textContent = deathTips[Math.floor(Math.random() * deathTips.length)];
    openModal('death');
  }, 600);
}
const deathTips = [
  'Tip: Red circles mean the Golem is about to slam there. Run out, or jump right when it hits!',
  'Tip: When the Golem charges and hits the wall, it gets dizzy. That\'s the best time to hit it.',
  'Tip: Ride your pet in the fight to dodge faster. Press R near your pet.',
  'Tip: Open treasure chests to get armor. Armor blocks some of the damage.',
];
function respawnAfterKO() {
  closeModal();
  G.dead = false;
  player.hp = player.maxHp;
  player.invuln = 1.5;
  updateHearts();
  resetGolem();
  placeActors(CAVE.start.x, CAVE.start.z + 2, Math.PI);
  if (save.step === 8) setStep(7);
}
