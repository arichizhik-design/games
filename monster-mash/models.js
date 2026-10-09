// Blocky models: the player, pets, bosses, Guide Gus, the dummy, chests, eggs, whales, the rocket and more.
'use strict';

function box(w, h, d, mat, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function pivot(x, y, z, parent) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}
const RAINBOW = [0xff5577, 0xffa94a, 0xffe95a, 0x6be06b, 0x5ff0e6, 0x7a7bff, 0xc07bff];

// ---------- items ----------
function weaponMesh(id) {
  const g = new THREE.Group();
  if (id && id.startsWith('egg:')) {
    const egg = eggMesh(0.32, id.slice(4));
    egg.position.set(0, -0.12, 0.1);
    g.add(egg);
    return g;
  }
  const w = WEAPONS[id];
  if (!w) return g;
  const col = c => c === 'rainbow' ? 0xffffff : parseInt(c.slice(1), 16);
  const handle = pixMat(col(w.icon[0])), head = col(w.icon[1]);
  if (id === 'bat') {
    box(0.08, 0.08, 0.38, pixMat(0x6b4426), 0, 0, 0.12, g);
    box(0.13, 0.13, 0.5, pixMat(0xc9955a), 0, 0, 0.55, g);
  } else if (id === 'spear' || id === 'trident') {
    box(0.06, 0.06, 1.2, handle, 0, 0, 0.45, g);
    const tip = pixMat(head, { glow: id === 'trident' });
    if (id === 'spear') { box(0.12, 0.12, 0.25, tip, 0, 0, 1.12, g); box(0.05, 0.05, 0.15, tip, 0, 0, 1.3, g); }
    else { box(0.42, 0.06, 0.06, tip, 0, 0, 1.05, g); [-0.18, 0, 0.18].forEach(x => box(0.05, 0.05, 0.3, tip, x, 0, 1.2, g)); }
  } else if (w.kind === 'gun') {
    box(0.14, 0.18, 0.55, pixMat(0x555560), 0, 0.05, 0.3, g);
    box(0.1, 0.22, 0.12, pixMat(0x3a2a1a), 0, -0.12, 0.08, g);
    if (id === 'rainbow') RAINBOW.forEach((c, i) => box(0.16, 0.06, 0.07, pixMat(c, { glow: true }), 0, 0.16, 0.08 + i * 0.07, g));
    else box(0.16, 0.06, 0.4, pixMat(w.color, { glow: true }), 0, 0.16, 0.3, g);
    box(0.08, 0.08, 0.12, pixMat(id === 'rainbow' ? 0xffffff : w.color, { glow: true }), 0, 0.06, 0.62, g);
  } else {
    box(0.07, 0.07, 0.24, handle, 0, 0, 0.02, g);
    box(0.34, 0.07, 0.07, pixMat(0x5a5a5a), 0, 0, 0.16, g);
    box(0.05, 0.12, 0.72, pixMat(head, { glow: id === 'diamond' || id === 'gold' }), 0, 0, 0.55, g);
  }
  return g;
}

function eggMesh(size = 1, type = 'forest') {
  const e = EGGS[type];
  const g = new THREE.Group();
  const shell = pixMat(e.shell, { spread: 0.1 });
  const rows = [0.5, 0.72, 0.8, 0.74, 0.56, 0.32];
  rows.forEach((w, i) => box(w * size, 0.2 * size, w * size, shell, 0, (0.1 + i * 0.2) * size, 0, g));
  const spotA = pixMat(e.spotA, { glow: true }), spotB = pixMat(e.spotB, { glow: true });
  box(0.16 * size, 0.16 * size, 0.04 * size, spotA, 0.15 * size, 0.5 * size, 0.4 * size, g);
  box(0.14 * size, 0.14 * size, 0.04 * size, spotB, -0.2 * size, 0.78 * size, 0.38 * size, g);
  box(0.04 * size, 0.16 * size, 0.16 * size, spotB, 0.41 * size, 0.42 * size, -0.1 * size, g);
  box(0.04 * size, 0.12 * size, 0.12 * size, spotA, -0.37 * size, 0.62 * size, 0.1 * size, g);
  box(0.12 * size, 0.12 * size, 0.04 * size, spotA, 0.05 * size, 0.3 * size, -0.41 * size, g);
  return g;
}

// ---------- the player ----------
function makePlayerModel() {
  const P = 1.8 / 32;
  const root = new THREE.Group();
  const skin = pixMat(0xe0a878), shirt = pixMat(0x3fb6c9), pants = pixMat(0x33407a), shoe = pixMat(0x4a4a4a);
  const hair = pixMat(0x5a3a1e);
  const legs = [-2, 2].map(x => {
    const p = pivot(x * P, 12 * P, 0, root);
    box(4 * P, 12 * P, 4 * P, pants, 0, -6 * P, 0, p);
    box(4.2 * P, 2 * P, 4.2 * P, shoe, 0, -11 * P, 0, p);
    return p;
  });
  const body = box(8 * P, 12 * P, 4 * P, shirt, 0, 18 * P, 0, root);
  const arms = [-6, 6].map(x => {
    const p = pivot(x * P, 22 * P, 0, root);
    box(4 * P, 4 * P, 4.1 * P, shirt, 0, 0, 0, p);
    box(4 * P, 8 * P, 4 * P, skin, 0, -6 * P, 0, p);
    return p;
  });
  const head = pivot(0, 24 * P, 0, root);
  box(8 * P, 8 * P, 8 * P, skin, 0, 4 * P, 0, head);
  box(8.4 * P, 2.4 * P, 8.4 * P, hair, 0, 7.4 * P, 0, head);
  box(8.4 * P, 6 * P, 1.5 * P, hair, 0, 4.6 * P, -3.6 * P, head);
  const white = pixMat(0xffffff, { spread: 0 }), eye = pixMat(0x3a5ad8, { spread: 0 }), mouth = pixMat(0x8a4a3a, { spread: 0 });
  [-2, 2].forEach(x => {
    box(2 * P, 1 * P, 0.3 * P, white, x * P - Math.sign(x) * 0.5 * P, 3.5 * P, 4.1 * P, head);
    box(1 * P, 1 * P, 0.4 * P, eye, x * P, 3.5 * P, 4.15 * P, head);
  });
  box(3 * P, 0.8 * P, 0.3 * P, mouth, 0, 1.6 * P, 4.1 * P, head);
  const armorMat = new THREE.MeshLambertMaterial({ map: pixelTexture(0xffffff, 0.25), color: 0xffffff });
  const armor = [];
  armor.push(box(9 * P, 3 * P, 9 * P, armorMat, 0, 7.6 * P, 0, head));
  armor.push(box(9 * P, 7 * P, 1.6 * P, armorMat, 0, 4.4 * P, -3.9 * P, head));
  armor.push(box(9 * P, 10 * P, 5 * P, armorMat, 0, 19 * P, 0, root));
  arms.forEach(a => armor.push(box(5 * P, 5 * P, 5 * P, armorMat, 0, -0.2 * P, 0, a)));
  legs.forEach(l => { armor.push(box(4.7 * P, 6 * P, 4.7 * P, armorMat, 0, -3 * P, 0, l)); armor.push(box(4.8 * P, 3 * P, 4.8 * P, armorMat, 0, -10.6 * P, 0, l)); });
  // scuba mask and air tank
  const mask = box(8.8 * P, 3.6 * P, 1.4 * P, new THREE.MeshBasicMaterial({ color: 0x7ad8ff, transparent: true, opacity: 0.7 }), 0, 4 * P, 4.5 * P, head);
  const strap = box(8.9 * P, 1.2 * P, 8.9 * P, pixMat(0x2a2a3a), 0, 4 * P, 0, head);
  const tank = box(5 * P, 10 * P, 3 * P, pixMat(0xffcf4a), 0, 18 * P, -3.6 * P, root);
  const scubaParts = [mask, strap, tank];
  const hand = pivot(0, -10.5 * P, 0.4 * P, arms[1]);
  hand.rotation.x = -0.5;
  let held = null, heldId = null;
  return {
    root, legs, arms, head, body, hand,
    setArmor(tier) {
      armor.forEach(m => { m.visible = tier > 0; });
      if (tier > 0) armorMat.color.setHex(ARMORS[tier].color);
      armorMat.emissive = new THREE.Color(tier >= 4 ? 0x103a40 : 0x000000);
    },
    setScuba(on) { scubaParts.forEach(m => { m.visible = on; }); },
    setHeld(id) {
      if (id === heldId) return;
      if (held) hand.remove(held);
      heldId = id;
      held = id === 'rocket' ? makeRocketItem() : id ? weaponMesh(id) : null;
      if (held) {
        if (id && WEAPONS[id] && WEAPONS[id].kind === 'gun') held.rotation.x = 0.5;
        hand.add(held);
      }
    },
  };
}

// ---------- creature builders (used for pets, and scaled up for bosses) ----------
function colorFor(sp, key, i = 0) { return sp.rainbow ? RAINBOW[i % RAINBOW.length] : sp.c[key]; }

function buildTurtle(inner, c) {
  const P = {};
  box(1.0, 0.42, 1.15, pixMat(c.shell), 0, 0.55, 0, inner);
  box(0.78, 0.14, 0.92, pixMat(c.top), 0, 0.82, 0, inner);
  box(0.94, 0.12, 1.08, pixMat(c.belly), 0, 0.3, 0, inner);
  P.head = pivot(0, 0.5, 0.62, inner);
  box(0.36, 0.34, 0.38, pixMat(c.skin), 0, 0, 0.16, P.head);
  eyePair(P.head, 0.06, 0.36, 0.1, 0x1a1a1a);
  P.legs = [[-0.38, 0.4], [0.38, 0.4], [-0.38, -0.4], [0.38, -0.4]].map(([x, z]) => {
    const p = pivot(x, 0.34, z, inner); box(0.24, 0.3, 0.24, pixMat(c.skin), 0, -0.14, 0, p); return p;
  });
  P.tail = pivot(0, 0.4, -0.58, inner);
  box(0.12, 0.1, 0.18, pixMat(c.skin), 0, 0, -0.08, P.tail);
  return Object.assign(P, { saddle: 0.88, halfW: 0.5, height: 0.9 });
}
function eyePair(parent, y, z, gap, col, glow = false, size = 0.09) {
  const m = glow ? pixMat(col, { glow: true }) : pixMat(col, { spread: 0 });
  return [-1, 1].map(s => box(size, size, 0.03, m, s * gap, y, z, parent));
}
function buildBunny(inner, c) {
  const P = { ears: [] };
  const fur = pixMat(c.body, { spread: 0.1 });
  box(0.55, 0.48, 0.72, fur, 0, 0.45, -0.05, inner);
  box(0.4, 0.3, 0.5, pixMat(0xf4ece0, { spread: 0.05 }), 0, 0.32, 0.02, inner);
  P.head = pivot(0, 0.72, 0.32, inner);
  box(0.44, 0.4, 0.4, fur, 0, 0.05, 0.08, P.head);
  eyePair(P.head, 0.1, 0.29, 0.12, 0x1a1a1a);
  box(0.08, 0.06, 0.03, pixMat(c.nose, { spread: 0 }), 0, -0.02, 0.29, P.head);
  [-0.1, 0.1].forEach(x => {
    const e = pivot(x, 0.24, 0, P.head);
    box(0.1, 0.42, 0.07, fur, 0, 0.2, 0, e);
    box(0.06, 0.3, 0.02, pixMat(c.ear), 0, 0.22, 0.04, e);
    P.ears.push(e);
  });
  P.legs = [[-0.17, 0.2], [0.17, 0.2], [-0.19, -0.25], [0.19, -0.25]].map(([x, z], i) => {
    const p = pivot(x, 0.24, z, inner); box(0.15, 0.24, i > 1 ? 0.3 : 0.15, fur, 0, -0.11, i > 1 ? 0.05 : 0, p); return p;
  });
  P.tail = pivot(0, 0.5, -0.42, inner);
  box(0.2, 0.2, 0.16, pixMat(0xffffff, { spread: 0.05 }), 0, 0, 0, P.tail);
  P.hop = true;
  return Object.assign(P, { saddle: 0.72, halfW: 0.32, height: 0.95 });
}
function buildQuad(inner, c, opt = {}) {
  const P = { ears: [] };
  const bodyMat = pixMat(c.body), bellyMat = pixMat(c.belly);
  const bl = 1.1;
  box(0.62, 0.55, bl, bodyMat, 0, 0.78, 0, inner);
  box(0.5, 0.1, bl * 0.85, bellyMat, 0, 0.5, 0, inner);
  if (opt.hump) { box(0.5, 0.35, 0.45, bodyMat, 0, 1.18, -0.1, inner); }
  P.head = pivot(0, opt.hump ? 1.2 : 1.0, bl / 2 + 0.05, inner);
  box(0.5, 0.44, 0.46, bodyMat, 0, 0.08, 0.2, P.head);
  box(0.3, 0.22, 0.26, bellyMat, 0, -0.04, 0.52, P.head);
  box(0.1, 0.07, 0.04, pixMat(0x1a1a1a, { spread: 0 }), 0, 0.04, 0.66, P.head);
  eyePair(P.head, 0.15, 0.44, 0.13, c.eye || 0x1a1a1a, !!c.eye);
  const earH = opt.bigEars ? 0.42 : 0.2, earW = opt.bigEars ? 0.22 : 0.14;
  [-0.16, 0.16].forEach(x => P.ears.push(box(earW, earH, 0.08, pixMat(c.ear), x * (opt.bigEars ? 1.2 : 1), 0.3 + earH / 2, 0.12, P.head)));
  const lz = bl / 2 - 0.18;
  P.legs = [[-0.2, lz], [0.2, lz], [-0.2, -lz], [0.2, -lz]].map(([x, z]) => {
    const p = pivot(x, 0.52, z, inner); box(0.18, opt.hump ? 0.6 : 0.52, 0.18, bodyMat, 0, -0.24, 0, p); return p;
  });
  P.tail = pivot(0, 0.9, -bl / 2, inner);
  box(0.22, 0.22, 0.6, bodyMat, 0, 0, -0.3, P.tail);
  box(0.24, 0.24, 0.18, pixMat(c.tip), 0, 0, -0.6, P.tail);
  P.tail.rotation.x = opt.hump ? -0.6 : 0.6;
  return Object.assign(P, { saddle: opt.hump ? 1.35 : 1.08, halfW: 0.36, height: 1.25 });
}
function buildDeer(inner, c, opt = {}) {
  const P = {};
  const fur = pixMat(c.body), belly = pixMat(c.belly), spot = pixMat(c.spot, { spread: 0 });
  box(0.6, 0.55, 1.15, fur, 0, 1.05, 0, inner);
  box(0.5, 0.12, 0.95, belly, 0, 0.78, 0, inner);
  [[-0.15, 0.2], [0.12, -0.15], [0.05, 0.35], [-0.1, -0.35]].forEach(([x, z]) => box(0.1, 0.03, 0.1, spot, x, 1.33, z, inner));
  P.neck = pivot(0, 1.2, 0.5, inner);
  box(0.26, 0.62, 0.26, fur, 0, 0.28, 0, P.neck);
  P.neck.rotation.x = 0.35;
  P.head = pivot(0, 0.6, 0.05, P.neck);
  box(0.34, 0.32, 0.5, fur, 0, 0.05, 0.12, P.head);
  box(0.22, 0.18, 0.18, belly, 0, -0.04, 0.42, P.head);
  box(0.08, 0.06, 0.04, pixMat(0x1a1a1a, { spread: 0 }), 0, 0.02, 0.52, P.head);
  P.eyes = eyePair(P.head, 0.1, 0.32, 0.15, opt.eyeGlow || 0x1a1a1a, !!opt.eyeGlow);
  [-0.2, 0.2].forEach(x => { const e = box(0.18, 0.1, 0.06, fur, x, 0.16, -0.05, P.head); e.rotation.z = x > 0 ? -0.4 : 0.4; });
  if (opt.antlers) {
    const am = pixMat(c.antler);
    [-1, 1].forEach(s => {
      const a = pivot(s * 0.1, 0.2, -0.02, P.head);
      const beam = box(0.06, 0.55, 0.06, am, 0, 0.27, 0, a); beam.rotation.z = -s * 0.5;
      box(0.05, 0.3, 0.05, am, s * 0.28, 0.5, 0.05, a).rotation.z = -s * 0.1;
      box(0.05, 0.25, 0.05, am, s * 0.15, 0.32, 0.12, a).rotation.x = 0.6;
      box(0.05, 0.28, 0.05, am, s * 0.36, 0.7, -0.02, a).rotation.z = -s * 0.7;
      if (opt.moss) box(0.1, 0.08, 0.1, pixMat(0x4f9a3a), s * 0.25, 0.42, 0, a);
    });
  }
  P.legs = [[-0.2, 0.42], [0.2, 0.42], [-0.2, -0.42], [0.2, -0.42]].map(([x, z]) => {
    const p = pivot(x, 0.82, z, inner); box(0.13, 0.82, 0.13, fur, 0, -0.41, 0, p); box(0.15, 0.1, 0.15, pixMat(0x3a2a1a), 0, -0.78, 0, p); return p;
  });
  P.tail = pivot(0, 1.2, -0.58, inner);
  box(0.14, 0.18, 0.1, pixMat(0xffffff, { spread: 0.05 }), 0, 0, -0.04, P.tail);
  return Object.assign(P, { saddle: 1.33, halfW: 0.35, height: 1.5 });
}
function buildScorpion(inner, c, sp = { c }) {
  const P = { legs: [], tailSegs: [], claws: [] };
  const body = pixMat(c.body), dark = pixMat(c.dark);
  box(0.8, 0.32, 1.0, body, 0, 0.42, 0, inner);
  box(0.6, 0.12, 0.8, dark, 0, 0.62, -0.05, inner);
  P.head = pivot(0, 0.42, 0.5, inner);
  box(0.55, 0.26, 0.3, body, 0, 0, 0.1, P.head);
  P.eyes = eyePair(P.head, 0.1, 0.26, 0.1, 0x1a1a1a);
  [-1, 1].forEach(s => {
    const arm = pivot(s * 0.32, 0.45, 0.45, inner);
    box(0.14, 0.14, 0.5, body, 0, 0, 0.25, arm);
    const claw = pivot(0, 0, 0.55, arm);
    box(0.3, 0.2, 0.35, dark, 0, 0, 0.15, claw);
    const jaw = pivot(s * 0.08, 0, 0.3, claw);
    box(0.1, 0.12, 0.3, dark, 0, 0, 0.12, jaw);
    box(0.1, 0.12, 0.3, body, -s * 0.12, 0, 0.42, claw);
    arm.rotation.y = -s * 0.35;
    P.claws.push({ arm, claw, jaw });
  });
  for (let i = 0; i < 3; i++) [-1, 1].forEach(s => {
    const p = pivot(s * 0.4, 0.42, 0.25 - i * 0.28, inner);
    const seg = box(0.55, 0.09, 0.09, dark, s * 0.27, 0, 0, p);
    box(0.09, 0.36, 0.09, dark, s * 0.52, -0.18, 0, p);
    p.rotation.z = s * 0.25;
    P.legs.push(p);
  });
  let parent = pivot(0, 0.5, -0.5, inner), prev = parent;
  P.tailRoot = parent;
  for (let i = 0; i < 5; i++) {
    const seg = box(0.24 - i * 0.02, 0.22 - i * 0.02, 0.32, body, 0, 0, -0.16, prev);
    const next = pivot(0, 0, -0.3, prev);
    P.tailSegs.push(prev);
    prev = next;
  }
  const sting = pixMat(c.sting, { glow: true });
  box(0.16, 0.16, 0.28, dark, 0, 0, -0.12, prev);
  const st = box(0.06, 0.06, 0.24, sting, 0, -0.08, -0.32, prev); st.rotation.x = 0.6;
  P.sting = prev;
  P.tailSegs.forEach((sgm, i) => { sgm.rotation.x = i === 0 ? -0.9 : -0.5; });
  return Object.assign(P, { saddle: 0.75, halfW: 0.5, height: 0.8 });
}
function buildFish(inner, c, opt = {}) {
  const P = {};
  const body = pixMat(c.body), belly = pixMat(c.belly), fin = pixMat(c.fin);
  box(0.55, 0.5, 1.3, body, 0, 0.75, 0, inner);
  box(0.45, 0.14, 1.1, belly, 0, 0.53, 0.05, inner);
  P.head = pivot(0, 0.75, 0.65, inner);
  box(0.45, 0.4, 0.35, body, 0, 0, 0.15, P.head);
  if (opt.shark) { box(0.4, 0.1, 0.1, pixMat(0xffffff, { spread: 0 }), 0, -0.13, 0.33, P.head); }
  else box(0.2, 0.14, 0.3, body, 0, -0.06, 0.42, P.head);
  eyePair(P.head, 0.06, 0.33, 0.18, 0x1a1a1a);
  const dorsal = box(0.08, opt.shark ? 0.45 : 0.3, 0.35, fin, 0, 1.12, -0.05, inner);
  dorsal.rotation.x = -0.35;
  [-1, 1].forEach(s => { const f = box(0.35, 0.05, 0.22, fin, s * 0.38, 0.6, 0.25, inner); f.rotation.z = s * 0.3; });
  P.tail = pivot(0, 0.75, -0.65, inner);
  box(0.25, 0.25, 0.4, body, 0, 0, -0.2, P.tail);
  box(opt.shark ? 0.1 : 0.7, opt.shark ? 0.6 : 0.08, 0.25, fin, 0, 0, -0.45, P.tail);
  P.legs = [];
  P.floats = 0.55;
  return Object.assign(P, { saddle: 1.0, halfW: 0.35, height: 1.05 });
}
function buildSquid(inner, c, opt = {}) {
  const P = { tentacles: [] };
  const body = pixMat(c.body), dark = pixMat(c.dark);
  const rows = [[0.72, 0.6], [0.66, 0.9], [0.56, 1.2], [0.42, 1.5], [0.26, 1.75]];
  rows.forEach(([w, y], i) => box(w, 0.32, w, i % 2 ? dark : body, 0, y, 0, inner));
  [-1, 1].forEach(s => { const f = box(0.36, 0.3, 0.08, body, s * 0.25, 1.65, 0, inner); f.rotation.z = s * 0.6; });
  P.head = pivot(0, 0.62, 0, inner);
  P.eyes = [-1, 1].map(s => {
    const e = box(0.2, 0.2, 0.06, pixMat(c.eye, { spread: 0 }), s * 0.2, 0.05, 0.37, P.head);
    box(0.1, 0.12, 0.04, pixMat(0x111111, { spread: 0 }), 0, 0, 0.03, e);
    return e;
  });
  P.lids = [-1, 1].map(s => box(0.22, 0.22, 0.04, dark, s * 0.2, 0.05, 0.39, P.head));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    let prev = pivot(Math.sin(a) * 0.26, 0.45, Math.cos(a) * 0.26, inner);
    const t = [prev];
    for (let k = 0; k < 3; k++) {
      box(0.13 - k * 0.025, 0.32, 0.13 - k * 0.025, k % 2 ? dark : body, 0, -0.16, 0, prev);
      const nx = pivot(0, -0.3, 0, prev);
      t.push(nx); prev = nx;
    }
    P.tentacles.push({ a, joints: t });
  }
  if (opt.crown) {
    const gold = pixMat(0xffd24a, { glow: true });
    box(0.36, 0.1, 0.36, gold, 0, 1.97, 0, inner);
    [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]].forEach(([x, z]) => box(0.07, 0.16, 0.07, gold, x, 2.1, z, inner));
    box(0.08, 0.08, 0.08, pixMat(0xff3b4f, { glow: true }), 0, 2.0, 0.19, inner);
  }
  P.legs = [];
  P.floats = 0.9;
  return Object.assign(P, { saddle: 1.95, halfW: 0.4, height: 2.0 });
}
function buildSpider(inner, sp, opt = {}) {
  const c = sp.c;
  const P = { legs: [], knees: [] };
  const body = pixMat(colorFor(sp, 'body', 0)), leg = pixMat(colorFor(sp, 'leg', 4));
  box(0.85, 0.62, 0.95, body, 0, 0.62, -0.55, inner);
  box(0.55, 0.36, 0.55, body, 0, 0.5, 0.15, inner);
  P.head = pivot(0, 0.5, 0.45, inner);
  box(0.42, 0.32, 0.28, body, 0, 0, 0.08, P.head);
  const eye = pixMat(c.eye, { glow: true });
  [[-0.12, 0.08], [0.12, 0.08], [-0.05, 0.12], [0.05, 0.12], [-0.17, 0], [0.17, 0], [-0.08, -0.02], [0.08, -0.02]].forEach(([x, y]) => box(0.05, 0.05, 0.03, eye, x, y, 0.23, P.head));
  [-0.06, 0.06].forEach(x => box(0.05, 0.14, 0.05, pixMat(0xf4f4f4), x, -0.15, 0.2, P.head));
  const gem = c => pixMat(c, { glow: true });
  const gems = sp.rainbow ? RAINBOW : [c.gem, c.gem, 0xb77bff];
  [[-0.2, 0.98, -0.5, 0.18, 0.3], [0.18, 1.0, -0.65, 0.2, 0.36], [0, 1.05, -0.35, 0.14, 0.24], [0.05, 0.95, -0.85, 0.15, 0.22]].forEach(([x, y, z, s, h], i) => {
    const m = box(s, h, s, gem(gems[i % gems.length]), x, y, z, inner); m.rotation.z = (i - 1.5) * 0.3;
  });
  [0.32, 0.14, -0.04, -0.22].forEach((z, i) => [-1, 1].forEach(s => {
    const p = pivot(s * 0.26, 0.55, z, inner);
    const legCol = sp.rainbow ? pixMat(RAINBOW[(i * 2 + (s > 0 ? 1 : 0)) % 7]) : leg;
    box(0.55, 0.08, 0.08, legCol, s * 0.27, 0, 0, p);
    const knee = pivot(s * 0.54, 0, 0, p);
    box(0.08, 0.7, 0.08, legCol, 0, -0.33, 0, knee);
    p.rotation.z = s * 0.7; knee.rotation.z = -s * 0.7;
    p.rotation.y = -s * (i - 1.5) * 0.3;
    p.userData.baseY = p.rotation.y;
    P.legs.push(p); P.knees.push(knee);
  }));
  return Object.assign(P, { saddle: 1.0, halfW: 0.45, height: 1.1 });
}

function buildCreature(inner, sp) {
  switch (sp.shape) {
    case 'turtle': return buildTurtle(inner, sp.c);
    case 'bunny': return buildBunny(inner, sp.c);
    case 'deer': return buildDeer(inner, sp.c);
    case 'scorpion': return buildScorpion(inner, sp.c);
    case 'fish': return buildFish(inner, sp.c, { shark: sp.shark });
    case 'squid': return buildSquid(inner, sp.c);
    case 'spider': return buildSpider(inner, sp);
    default: return buildQuad(inner, sp.c, { hump: sp.hump, bigEars: sp.bigEars });
  }
}

// shared walking/idle animation for creatures
function animateCreature(P, inner, dt, speed, t, state) {
  state.phase = (state.phase || 0) + dt * (4 + speed * 1.4);
  const k = Math.min(1, speed / 3);
  const sw = Math.sin(state.phase) * 0.8 * k;
  if (P.hop) {
    const hop = Math.abs(Math.sin(state.phase * 0.6)) * 0.35 * k;
    inner.position.y = hop;
    P.legs.forEach((l, i) => { l.rotation.x = (i < 2 ? -1 : 1) * hop * 1.6; });
    P.ears.forEach((e, i) => { e.rotation.x = -0.2 - hop * 0.8 + Math.sin(t * 2 + i) * 0.05; });
  } else if (P.knees) {
    P.legs.forEach((l, i) => { l.rotation.y = l.userData.baseY + Math.sin(state.phase * 1.4 + i * 1.3) * 0.35 * k; });
    inner.position.y = Math.abs(Math.sin(state.phase * 1.4)) * 0.03 * k;
  } else if (P.tentacles) {
    P.tentacles.forEach((tt, i) => tt.joints.forEach((j, n) => {
      j.rotation.x = Math.sin(t * 3 + i + n) * 0.25 * (n + 1) * 0.5 + Math.cos(tt.a) * 0.2 * n;
      j.rotation.z = -Math.sin(tt.a) * 0.2 * n;
    }));
    inner.position.y = P.floats + Math.sin(t * 2) * 0.12;
  } else if (P.floats) {
    inner.position.y = P.floats + Math.sin(t * 2.4) * 0.12;
    if (P.tail) P.tail.rotation.y = Math.sin(t * (speed > 0.5 ? 10 : 3)) * 0.45;
  } else {
    P.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? sw : -sw); });
    inner.position.y = Math.abs(Math.sin(state.phase)) * 0.04 * k;
  }
  if (P.tailSegs) P.tailSegs.forEach((s, i) => { s.rotation.y = Math.sin(t * 2 + i) * 0.08; });
  if (P.tail && !P.floats) P.tail.rotation.y = Math.sin(t * (speed > 0.5 ? 9 : 4)) * 0.35;
  if (P.head && !P.neck) P.head.rotation.x = Math.sin(t * 1.3) * 0.06;
}

function makePetModel(speciesId) {
  const sp = PET_SPECIES[speciesId];
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(sp.scale);
  root.add(inner);
  const P = buildCreature(inner, sp);
  const S = sp.scale;
  const state = {};
  if (P.floats) inner.position.y = P.floats;
  return {
    root, inner, parts: P, species: sp,
    saddleY: (P.saddle + (P.floats || 0)) * S, halfW: P.halfW * S, height: (P.height + (P.floats || 0)) * S,
    animate(dt, speed, t) { animateCreature(P, inner, dt, speed, t, state); },
  };
}

// ---------- bosses ----------
const BOSS_COLORS = {
  island: { deer: [0x8a5a2a, 0xe0c8a0, 0xfff4e0, 0xd8c8a0, 0x7aff7a], scorpion: [0xd9822b, 0x8a4a1a, 0xb4ff4a], squid: [0xc8345a, 0x7a1a3a, 0xfff4c0], spider: [0x2a2440, 0x3a3456, 0x5ff0e6, 0xff4a6a] },
  frost: { deer: [0xe8f4ff, 0xbfd8ee, 0x9ad8ff, 0x9ae8ff, 0x5ff0e6], scorpion: [0x8ad0f0, 0x2a5a8a, 0xffffff], squid: [0x5a8ad8, 0x2a4a8a, 0xffffff], spider: [0xd8ecff, 0x9ac8f0, 0x5ff0e6, 0x2a5aff] },
  lava: { deer: [0x2a1a14, 0x5a2a1a, 0xff7a2a, 0xff7a2a, 0xfff07a], scorpion: [0x2a1a1a, 0xc8341a, 0xfff07a], squid: [0xff6a2a, 0x8a2a10, 0xfff07a], spider: [0x2a1410, 0x5a2a1a, 0xff7a2a, 0xfff07a] },
};
function makeBossModel(id, pid = 'island') {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const c = BOSS_COLORS[pid][id];
  let P;
  if (id === 'deer') {
    inner.scale.setScalar(3.3);
    P = buildDeer(inner, { body: c[0], belly: c[1], spot: c[2], antler: c[3] }, { antlers: true, moss: pid === 'island', eyeGlow: c[4] });
  } else if (id === 'scorpion') {
    inner.scale.setScalar(3.2);
    P = buildScorpion(inner, { body: c[0], dark: c[1], sting: c[2] });
  } else if (id === 'squid') {
    inner.scale.setScalar(3.0);
    P = buildSquid(inner, { body: c[0], dark: c[1], eye: c[2] }, { crown: true });
  } else {
    inner.scale.setScalar(3.4);
    P = buildSpider(inner, { c: { body: c[0], leg: c[1], gem: c[2], eye: c[3] } });
  }
  const own = [];
  root.traverse(o => { if (o.isMesh && o.material.isMeshLambertMaterial && !own.includes(o.material)) own.push(o.material); });
  return {
    root, inner, P, id, state: {},
    flash(on) { own.forEach(m => m.emissive.setHex(on ? 0x881111 : 0x000000)); },
  };
}

// ---------- people and things ----------
function makeVillagerModel() {
  const P = 1.9 / 32;
  const root = new THREE.Group();
  const robe = pixMat(0x7a5a3a), skin = pixMat(0xc98a5a), apron = pixMat(0x4f8a3a);
  box(8 * P, 22 * P, 6 * P, robe, 0, 11 * P, 0, root);
  box(6 * P, 14 * P, 0.6 * P, apron, 0, 9 * P, 3.2 * P, root);
  box(12 * P, 4 * P, 5 * P, robe, 0, 18 * P, 2.5 * P, root);
  box(4 * P, 4 * P, 5.2 * P, skin, 0, 18 * P, 2.6 * P, root);
  const head = pivot(0, 22 * P, 0, root);
  box(8 * P, 10 * P, 8 * P, skin, 0, 5 * P, 0, head);
  box(2 * P, 4 * P, 2 * P, pixMat(0xb0784a), 0, 3 * P, 5 * P, head);
  box(8.4 * P, 1.6 * P, 8.4 * P, pixMat(0x5a5a5a), 0, 6.6 * P, 0, head);
  box(8.4 * P, 2 * P, 8.4 * P, pixMat(0x7a7a7a), 0, 10 * P, 0, head);
  [-2, 2].forEach(x => box(1.4 * P, 1.2 * P, 0.4 * P, pixMat(0x2a6a2a, { spread: 0 }), x * P, 6.2 * P, 4.1 * P, head));
  return { root, head };
}

function makeDummyModel() {
  const root = new THREE.Group();
  const hay = pixMat(0xd8b43a, { spread: 0.3 }), wood = pixMat(0x6b4a2b);
  box(0.18, 1.0, 0.18, wood, 0, 0.5, 0, root);
  const body = pivot(0, 0.9, 0, root);
  box(0.6, 0.75, 0.4, hay, 0, 0.38, 0, body);
  box(1.3, 0.14, 0.14, wood, 0, 0.55, 0, body);
  box(0.42, 0.42, 0.42, hay, 0, 0.98, 0, body);
  box(0.3, 0.06, 0.03, pixMat(0x7a2a1a, { spread: 0 }), 0, 0.92, 0.22, body);
  [-0.09, 0.09].forEach(x => box(0.06, 0.06, 0.03, pixMat(0x1a1a1a, { spread: 0 }), x, 1.04, 0.22, body));
  return { root, body };
}

function makeChestModel(color = 0x9a6a30) {
  const root = new THREE.Group();
  const wood = pixMat(color), trim = pixMat(0x4a3018), gold = pixMat(0xffcf4a, { glow: true });
  box(0.9, 0.55, 0.9, wood, 0, 0.275, 0, root);
  box(0.94, 0.08, 0.94, trim, 0, 0.55, 0, root);
  const lid = pivot(0, 0.58, -0.45, root);
  box(0.92, 0.3, 0.92, wood, 0, 0.15, 0.46, lid);
  box(0.96, 0.06, 0.96, trim, 0, 0.3, 0.46, lid);
  box(0.16, 0.22, 0.06, gold, 0, -0.02, 0.93, lid);
  root.scale.setScalar(1.3);
  return { root, lid };
}

function makeScrollModel() {
  const g = new THREE.Group();
  box(0.5, 0.12, 0.12, pixMat(0xf0deb0), 0, 0, 0, g);
  box(0.08, 0.16, 0.16, pixMat(0xa07a40), -0.27, 0, 0, g);
  box(0.08, 0.16, 0.16, pixMat(0xa07a40), 0.27, 0, 0, g);
  box(0.06, 0.13, 0.13, pixMat(0xd8343a), 0, 0, 0, g);
  return g;
}
function makeScubaModel() {
  const g = new THREE.Group();
  box(0.5, 0.2, 0.08, new THREE.MeshBasicMaterial({ color: 0x7ad8ff }), 0, 0.5, 0.15, g);
  box(0.54, 0.08, 0.3, pixMat(0x2a2a3a), 0, 0.5, 0, g);
  box(0.25, 0.55, 0.22, pixMat(0xffcf4a), 0, 0.28, -0.2, g);
  return g;
}
function makeHeartModel() {
  const g = new THREE.Group();
  const m = pixMat(0xff3b4f, { glow: true });
  [[-0.12, 0.1], [0.12, 0.1]].forEach(([x, y]) => box(0.22, 0.2, 0.12, m, x, y, 0, g));
  box(0.3, 0.2, 0.12, m, 0, -0.04, 0, g);
  box(0.12, 0.12, 0.12, m, 0, -0.18, 0, g);
  return g;
}
function makeIncubatorModel() {
  const g = new THREE.Group();
  box(1.2, 0.3, 1.2, pixMat(0xffcf4a, { glow: true }), 0, 0.15, 0, g);
  box(1.0, 0.12, 1.0, pixMat(0xd8b43a), 0, 0.36, 0, g);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.0), new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.25, depthWrite: false }));
  glass.position.y = 0.87; g.add(glass);
  box(1.06, 0.08, 1.06, pixMat(0xffcf4a, { glow: true }), 0, 1.34, 0, g);
  return g;
}
function makeWhaleModel() {
  const g = new THREE.Group();
  const body = pixMat(0x4a7ab8), belly = pixMat(0xe0ecf8);
  box(4, 3.4, 10, body, 0, 0, 0, g);
  box(3.4, 1.2, 8.5, belly, 0, -1.6, 0.4, g);
  box(3.4, 2.6, 2, body, 0, 0.2, 5.5, g);
  [-1, 1].forEach(s => { const f = box(2.6, 0.3, 1.4, body, s * 2.6, -1, 1.5, g); f.rotation.z = s * 0.4; });
  [-1, 1].forEach(s => box(0.3, 0.4, 0.4, pixMat(0x111111, { spread: 0 }), s * 1.75, 0.3, 4.6, g));
  const tail = pivot(0, 0, -5, g);
  box(1.6, 1.4, 3, body, 0, 0, -1.5, tail);
  box(5, 0.3, 1.6, body, 0, 0, -3.2, tail);
  g.userData.tail = tail;
  return g;
}
function makeCoralCaveModel() {
  const g = new THREE.Group();
  const cols = [0xff6a9a, 0xff9a3a, 0x3a8ad8, 0xc07bff];
  const rng = makeRng(17);
  for (let i = 0; i < 26; i++) {
    const a = i / 25 * Math.PI;
    const r = 4.5 + rng() * 0.8;
    const s = 1.2 + rng() * 1.2;
    box(s, s, s * 1.4, pixMat(cols[i % 4]), Math.cos(a) * r, Math.sin(a) * r, (rng() - 0.5) * 1.5, g);
  }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(4, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x050a18 }));
  hole.position.z = 0.4; g.add(hole);
  [-3.8, 3.8].forEach(x => box(0.8, 0.8, 0.8, pixMat(0xe8fff8, { glow: true }), x, 0.4, 1.2, g));
  return g;
}
function makeRocketModel() {
  const g = new THREE.Group();
  const white = pixMat(0xf0f0f4), red = pixMat(0xd8343a), dark = pixMat(0x3a3a4a);
  box(2.2, 6, 2.2, white, 0, 4, 0, g);
  box(2.4, 0.4, 2.4, red, 0, 2.5, 0, g);
  box(1.7, 1.2, 1.7, red, 0, 7.6, 0, g);
  box(1.1, 0.9, 1.1, red, 0, 8.6, 0, g);
  box(0.5, 0.7, 0.5, red, 0, 9.4, 0, g);
  box(1.0, 1.0, 0.2, pixMat(0x7ad8ff, { glow: true }), 0, 5.4, 1.15, g);
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([x, z]) => box(x ? 1.2 : 0.3, 2.2, z ? 1.2 : 0.3, red, x * 1.5, 1.6, z * 1.5, g));
  box(1.4, 0.8, 1.4, dark, 0, 0.6, 0, g);
  return g;
}
function makeBuoyModel() {
  const g = new THREE.Group();
  box(0.9, 0.7, 0.9, pixMat(0xd8343a), 0, 0.2, 0, g);
  box(0.95, 0.25, 0.95, pixMat(0xf0f0f0), 0, 0.6, 0, g);
  box(0.12, 1.4, 0.12, pixMat(0x3a3a4a), 0, 1.3, 0, g);
  box(0.3, 0.3, 0.3, pixMat(0xffcf4a, { glow: true }), 0, 2.1, 0, g);
  return g;
}

// a little rocket to hold in your hand
function makeRocketItem() {
  const g = makeRocketModel();
  g.scale.setScalar(0.09);
  g.rotation.x = Math.PI / 2;
  g.position.set(0, 0, 0.3);
  const w = new THREE.Group(); w.add(g);
  return w;
}

// ---------- house decorations ----------
function makeDecorModel(id) {
  const g = new THREE.Group();
  const m = (c, o) => pixMat(c, o);
  switch (id) {
    case 'flower':
      box(0.45, 0.4, 0.45, m(0xa85a32), 0, 0.2, 0, g);
      box(0.06, 0.4, 0.06, m(0x3f8a2a), 0, 0.6, 0, g);
      [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]].forEach(([x, z]) => box(0.14, 0.12, 0.14, m(0xff6a9a), x, 0.85, z, g));
      box(0.12, 0.12, 0.12, m(0xffe95a, { glow: true }), 0, 0.86, 0, g);
      break;
    case 'rug':
      box(3, 0.05, 2, m(0xc8344a), 0, 0.03, 0, g);
      box(2.4, 0.06, 1.4, m(0xffcf4a), 0, 0.04, 0, g);
      box(1.6, 0.07, 0.7, m(0x3a8ad8), 0, 0.05, 0, g);
      break;
    case 'lamp':
      box(0.3, 0.1, 0.3, m(0x3a3a3a), 0, 0.05, 0, g);
      box(0.08, 1.2, 0.08, m(0x3a3a3a), 0, 0.65, 0, g);
      box(0.5, 0.35, 0.5, m(0xfff0b0, { glow: true }), 0, 1.35, 0, g);
      break;
    case 'bookshelf':
      box(2, 2.2, 0.6, m(0x8a5a32), 0, 1.1, 0, g);
      [0.5, 1.2, 1.9].forEach((y, r) => { for (let i = 0; i < 7; i++) box(0.2, 0.45, 0.4, m([0xd8343a, 0x3a8ad8, 0x4f9a3a, 0xffcf4a, 0x8a4ad8][(i + r) % 5]), -0.75 + i * 0.25, y, 0.12, g); });
      break;
    case 'couch':
      box(2.4, 0.5, 0.9, m(0x5a7ad8), 0, 0.35, 0, g);
      box(2.4, 0.7, 0.3, m(0x4a6ac8), 0, 0.85, -0.35, g);
      [-1.1, 1.1].forEach(x => box(0.25, 0.75, 0.9, m(0x4a6ac8), x, 0.5, 0, g));
      break;
    case 'painting':
      box(1.6, 1.1, 0.08, m(0x8a5a32), 0, 0, 0, g);
      box(1.4, 0.9, 0.1, m(0x7ab8f0), 0, 0, 0.01, g);
      box(1.4, 0.3, 0.12, m(0x4f9a3a), 0, -0.3, 0.01, g);
      box(0.25, 0.25, 0.13, m(0xffe95a, { glow: true }), 0.4, 0.2, 0.01, g);
      break;
    case 'fishTank': {
      box(1.4, 0.15, 0.7, m(0x3a3a3a), 0, 0.5, 0, g);
      box(0.15, 0.5, 0.15, m(0x3a3a3a), -0.6, 0.25, 0, g); box(0.15, 0.5, 0.15, m(0x3a3a3a), 0.6, 0.25, 0, g);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.6), new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.45 }));
      glass.position.y = 0.98; g.add(glass);
      g.userData.fish = [box(0.18, 0.12, 0.06, m(0xff9a3a, { glow: true }), 0, 1.0, 0, g), box(0.15, 0.1, 0.06, m(0xffe95a, { glow: true }), 0.3, 0.85, 0.1, g)];
      break;
    }
    case 'tv':
      box(1.8, 0.5, 0.6, m(0x5a3a22), 0, 0.25, 0, g);
      box(1.6, 1.0, 0.1, m(0x1a1a1a), 0, 1.05, 0, g);
      g.userData.screen = box(1.45, 0.85, 0.11, new THREE.MeshBasicMaterial({ color: 0x3a8ad8 }), 0, 1.05, 0.01, g);
      break;
    case 'trophy':
      box(1.6, 1.6, 0.6, m(0x8a5a32), 0, 0.8, 0, g);
      [-0.45, 0, 0.45].forEach((x, i) => {
        box(0.22, 0.08, 0.22, m(0xffcf4a, { glow: true }), x, 1.0, 0.05, g);
        box(0.14, 0.3, 0.14, m(0xffcf4a, { glow: true }), x, 1.2, 0.05, g);
        box(0.26, 0.12, 0.26, m(0xffcf4a, { glow: true }), x, 1.4, 0.05, g);
      });
      box(0.3, 0.3, 0.1, m([0x7aff7a][0], { glow: true }), 0, 0.5, 0.3, g);
      break;
    case 'rainbowBed':
      RAINBOW.forEach((c, i) => box(2, 0.12, 0.14, m(c, { glow: true }), 0.5, 1.02, -0.43 + i * 0.145, g));
      break;
    case 'statue':
      box(1.4, 0.6, 1.4, m(0xd8d8d8), 0, 0.3, 0, g);
      { const t = new THREE.Group(); buildTurtle(t, { shell: 0xffcf4a, top: 0xffe07a, skin: 0xf0c040, belly: 0xffe9a0 }); t.scale.setScalar(1.5); t.position.y = 0.6; g.add(t);
        t.traverse(o => { if (o.isMesh) o.material = pixMat(0xffcf4a, { glow: true }); }); }
      break;
    case 'disco': {
      box(0.04, 0.6, 0.04, m(0x3a3a3a), 0, 0.3, 0, g);
      const ball = new THREE.Group(); ball.position.y = -0.2; g.add(ball);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box(0.18, 0.18, 0.18, m(RAINBOW[i % 7], { glow: true }), Math.cos(a) * 0.3, (i % 3 - 1) * 0.2, Math.sin(a) * 0.3, ball); }
      box(0.45, 0.45, 0.45, m(0xd8d8e8, { glow: true }), 0, 0, 0, ball);
      g.userData.ball = ball;
      break;
    }
  }
  return g;
}
