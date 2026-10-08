// Blocky models: the player, pets, the Crystal Golem, the guide, the dummy, the chest and the egg.
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

// ---------- weapons and armour ----------
const WEAPONS = [
  { id: 'bat', name: 'Baseball Bat', dmg: 5, cd: 0.42, icon: 'bat' },
  { id: 'stone', name: 'Stone Sword', dmg: 8, cd: 0.40, icon: 'stoneSword' },
  { id: 'crystal', name: 'Crystal Sword', dmg: 12, cd: 0.38, icon: 'crystalSword' },
  { id: 'hammer', name: 'Golem Hammer', dmg: 18, cd: 0.5, icon: 'hammer' },
  { id: 'rainbow', name: 'Rainbow Blade', dmg: 25, cd: 0.34, icon: 'rainbow' },
];
const ARMORS = [
  { name: 'No armor', block: 0, color: 0 },
  { name: 'Leather Armor', block: 0.25, color: 0x8a5a32 },
  { name: 'Iron Armor', block: 0.4, color: 0xd0d4dc },
  { name: 'Crystal Armor', block: 0.55, color: 0x5ff0e6 },
  { name: 'Golem Armor', block: 0.7, color: 0x9a6bd8 },
];

function weaponMesh(id) {
  const g = new THREE.Group();
  if (id === 'bat') {
    box(0.08, 0.08, 0.38, pixMat(0x6b4426), 0, 0, 0.12, g);
    box(0.13, 0.13, 0.5, pixMat(0xc9955a), 0, 0, 0.55, g);
    box(0.1, 0.1, 0.06, pixMat(0x3a2a1a), 0, 0, -0.08, g);
  } else if (id === 'stone' || id === 'crystal') {
    const blade = id === 'stone' ? pixMat(0xa8a8a8) : pixMat(0x5ff0e6, { glow: true });
    box(0.07, 0.07, 0.24, pixMat(0x5a3a22), 0, 0, 0.02, g);
    box(0.34, 0.07, 0.07, id === 'stone' ? pixMat(0x5a5a5a) : pixMat(0xb77bff, { glow: true }), 0, 0, 0.16, g);
    box(0.05, id === 'stone' ? 0.1 : 0.14, 0.72, blade, 0, 0, 0.55, g);
  } else if (id === 'hammer') {
    box(0.08, 0.08, 0.85, pixMat(0x5a3a22), 0, 0, 0.32, g);
    box(0.36, 0.36, 0.5, pixMat(0x6a5f86), 0, 0, 0.78, g);
    box(0.38, 0.12, 0.12, pixMat(0xb77bff, { glow: true }), 0, 0.12, 0.78, g);
  } else if (id === 'rainbow') {
    box(0.07, 0.07, 0.24, pixMat(0x333333), 0, 0, 0.02, g);
    box(0.36, 0.07, 0.07, pixMat(0xffffff, { glow: true }), 0, 0, 0.16, g);
    const cols = [0xff5577, 0xffa94a, 0xffe95a, 0x6be06b, 0x5ff0e6, 0x7a7bff, 0xc07bff];
    cols.forEach((c, i) => box(0.06, 0.15, 0.12, pixMat(c, { glow: true }), 0, 0, 0.25 + i * 0.11, g));
  } else if (id === 'egg') {
    const egg = eggMesh(0.32);
    egg.position.set(0, -0.12, 0.1);
    g.add(egg);
  }
  return g;
}

function eggMesh(size = 1) {
  const g = new THREE.Group();
  const shell = pixMat(0xefe8ff, { spread: 0.1 });
  const rows = [0.5, 0.72, 0.8, 0.74, 0.56, 0.32];
  rows.forEach((w, i) => box(w * size, 0.2 * size, w * size, shell, 0, (0.1 + i * 0.2) * size, 0, g));
  const spotA = pixMat(0xb77bff, { glow: true }), spotB = pixMat(0x5ff0e6, { glow: true });
  box(0.16 * size, 0.16 * size, 0.04 * size, spotA, 0.15 * size, 0.5 * size, 0.4 * size, g);
  box(0.14 * size, 0.14 * size, 0.04 * size, spotB, -0.2 * size, 0.78 * size, 0.38 * size, g);
  box(0.04 * size, 0.16 * size, 0.16 * size, spotB, 0.41 * size, 0.42 * size, -0.1 * size, g);
  box(0.04 * size, 0.12 * size, 0.12 * size, spotA, -0.37 * size, 0.62 * size, 0.1 * size, g);
  box(0.12 * size, 0.12 * size, 0.04 * size, spotA, 0.05 * size, 0.3 * size, -0.41 * size, g);
  return g;
}

// ---------- the player ----------
function makePlayerModel() {
  const P = 1.8 / 32; // one "pixel"
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
    box(1 * P, 1 * P, 0.4 * P, eye, x * P + Math.sign(x) * 0 * P, 3.5 * P, 4.15 * P, head);
  });
  box(3 * P, 0.8 * P, 0.3 * P, mouth, 0, 1.6 * P, 4.1 * P, head);

  // armour pieces, recoloured when the player gets new armour
  const armorMat = new THREE.MeshLambertMaterial({ map: pixelTexture(0xffffff, 0.25), color: 0xffffff });
  const armor = [];
  armor.push(box(9 * P, 3 * P, 9 * P, armorMat, 0, 7.6 * P, 0, head));
  armor.push(box(9 * P, 7 * P, 1.6 * P, armorMat, 0, 4.4 * P, -3.9 * P, head));
  armor.push(box(9 * P, 10 * P, 5 * P, armorMat, 0, 19 * P, 0, root));
  arms.forEach(a => armor.push(box(5 * P, 5 * P, 5 * P, armorMat, 0, -0.2 * P, 0, a)));
  legs.forEach(l => { armor.push(box(4.7 * P, 6 * P, 4.7 * P, armorMat, 0, -3 * P, 0, l)); armor.push(box(4.8 * P, 3 * P, 4.8 * P, armorMat, 0, -10.6 * P, 0, l)); });

  const hand = pivot(0, -10.5 * P, 0.4 * P, arms[1]);
  hand.rotation.x = -0.5;
  let held = null, heldId = null;
  return {
    root, legs, arms, head, body, hand,
    setArmor(tier) {
      const a = ARMORS[tier];
      armor.forEach(m => { m.visible = tier > 0; });
      if (tier > 0) armorMat.color.setHex(a.color);
      armorMat.emissive = new THREE.Color(tier === 3 ? 0x0c3a38 : 0x000000);
    },
    setHeld(id) {
      if (id === heldId) return;
      if (held) hand.remove(held);
      heldId = id;
      held = id ? weaponMesh(id) : null;
      if (held) hand.add(held);
    },
  };
}

// ---------- pets ----------
const RARITY = {
  Starter: '#b9b0d8', Common: '#f0f0f0', Uncommon: '#6be06b', Rare: '#4aa8ff', Epic: '#c07bff', Legendary: '#ffcf4a',
};
const PET_SPECIES = {
  turtle: { name: 'Pebble the Turtle', rarity: 'Starter', speed: 7, shape: 'turtle', scale: 1.05,
    c: { shell: 0x6b8a3a, top: 0x4f6b2a, skin: 0x8cc65a, belly: 0xd8c87a } },
  bunny: { name: 'Crystal Bunny', rarity: 'Common', speed: 9, shape: 'bunny', scale: 1.25,
    c: { body: 0xf2f0ff, ear: 0x5ff0e6, nose: 0xff9ab0 } },
  fox: { name: 'Gem Fox', rarity: 'Uncommon', speed: 10.5, shape: 'quad', scale: 1.15,
    c: { body: 0xe8782a, belly: 0xfff1e0, ear: 0x3a2010, tip: 0xffffff, gem: 0x5ff0e6 } },
  wolf: { name: 'Shadow Wolf', rarity: 'Rare', speed: 12, shape: 'quad', scale: 1.3,
    c: { body: 0x3a3448, belly: 0x5a5470, ear: 0x241f30, tip: 0x241f30, gem: 0xc07bff, eye: 0xc07bff } },
  dragon: { name: 'Amethyst Dragon', rarity: 'Epic', speed: 14, shape: 'dragon', scale: 1.45,
    c: { body: 0x8a4fd8, belly: 0xd8b0ff, wing: 0x5a2a9a, horn: 0xf0e0ff, eye: 0x5ff0e6 } },
  rainbow: { name: 'Rainbow Dragon', rarity: 'Legendary', speed: 17, shape: 'dragon', scale: 1.65, rainbow: true,
    c: { body: 0xff5577, belly: 0xffe95a, wing: 0x5ff0e6, horn: 0xffffff, eye: 0xffffff } },
};
const EGG_ODDS = [['bunny', 45], ['fox', 28], ['wolf', 17], ['dragon', 8], ['rainbow', 2]];

function makePetModel(speciesId) {
  const sp = PET_SPECIES[speciesId];
  const c = sp.c;
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(sp.scale);
  root.add(inner);
  const legs = [];
  let tail = null, head = null, wings = [], ears = [];
  let saddle = 0.9, halfW = 0.4, height = 1.0;
  const eyeMat = c.eye ? pixMat(c.eye, { glow: true }) : pixMat(0x1a1a1a, { spread: 0 });
  const eyes = (parent, y, z, gap) => [-1, 1].forEach(s => box(0.09, 0.09, 0.03, eyeMat, s * gap, y, z, parent));

  if (sp.shape === 'turtle') {
    box(1.0, 0.42, 1.15, pixMat(c.shell), 0, 0.55, 0, inner);
    box(0.78, 0.14, 0.92, pixMat(c.top), 0, 0.82, 0, inner);
    box(0.94, 0.12, 1.08, pixMat(c.belly), 0, 0.3, 0, inner);
    head = pivot(0, 0.5, 0.62, inner);
    box(0.36, 0.34, 0.38, pixMat(c.skin), 0, 0, 0.16, head);
    eyes(head, 0.06, 0.36, 0.1);
    box(0.14, 0.04, 0.03, pixMat(0x2a3a1a, { spread: 0 }), 0, -0.07, 0.36, head);
    [[-0.38, 0.4], [0.38, 0.4], [-0.38, -0.4], [0.38, -0.4]].forEach(([x, z]) => {
      const p = pivot(x, 0.34, z, inner);
      box(0.24, 0.3, 0.24, pixMat(c.skin), 0, -0.14, 0, p);
      legs.push(p);
    });
    tail = pivot(0, 0.4, -0.58, inner);
    box(0.12, 0.1, 0.18, pixMat(c.skin), 0, 0, -0.08, tail);
    saddle = 0.88; halfW = 0.5; height = 0.9;
  } else if (sp.shape === 'bunny') {
    const fur = pixMat(c.body, { spread: 0.08 });
    box(0.55, 0.48, 0.72, fur, 0, 0.45, -0.05, inner);
    head = pivot(0, 0.72, 0.32, inner);
    box(0.44, 0.4, 0.4, fur, 0, 0.05, 0.08, head);
    eyes(head, 0.1, 0.29, 0.12);
    box(0.08, 0.06, 0.03, pixMat(c.nose, { spread: 0 }), 0, -0.02, 0.29, head);
    [-0.1, 0.1].forEach(x => {
      const e = pivot(x, 0.24, 0, head);
      box(0.1, 0.42, 0.07, fur, 0, 0.2, 0, e);
      box(0.06, 0.3, 0.02, pixMat(c.ear, { glow: true }), 0, 0.22, 0.04, e);
      ears.push(e);
    });
    [[-0.17, 0.2], [0.17, 0.2], [-0.19, -0.25], [0.19, -0.25]].forEach(([x, z], i) => {
      const p = pivot(x, 0.24, z, inner);
      box(0.15, 0.24, i > 1 ? 0.3 : 0.15, fur, 0, -0.11, i > 1 ? 0.05 : 0, p);
      legs.push(p);
    });
    tail = pivot(0, 0.5, -0.42, inner);
    box(0.2, 0.2, 0.16, pixMat(0xffffff, { spread: 0.05 }), 0, 0, 0, tail);
    saddle = 0.72; halfW = 0.32; height = 0.95;
  } else {
    // four-legged: fox, wolf and dragons
    const dragon = sp.shape === 'dragon';
    const rainbowCols = [0xff5577, 0xffa94a, 0xffe95a, 0x6be06b, 0x5ff0e6, 0x7a7bff, 0xc07bff];
    const bodyMat = pixMat(c.body), bellyMat = pixMat(c.belly);
    const bl = dragon ? 1.35 : 1.1;
    box(dragon ? 0.78 : 0.62, 0.55, bl, bodyMat, 0, 0.78, 0, inner);
    box(dragon ? 0.6 : 0.5, 0.1, bl * 0.85, bellyMat, 0, 0.5, 0, inner);
    if (sp.rainbow) rainbowCols.forEach((col, i) => box(0.8, 0.08, 0.16, pixMat(col, { glow: true }), 0, 1.06, -0.55 + i * 0.17, inner));
    head = pivot(0, dragon ? 1.12 : 1.0, bl / 2 + 0.05, inner);
    if (dragon) box(0.3, 0.3, 0.35, bodyMat, 0, -0.08, -0.05, head);
    box(0.5, 0.44, 0.46, bodyMat, 0, 0.08, 0.2, head);
    box(0.3, 0.22, 0.26, dragon ? bodyMat : bellyMat, 0, -0.04, 0.52, head);
    box(0.1, 0.07, 0.04, pixMat(0x1a1a1a, { spread: 0 }), 0, 0.04, 0.66, head);
    eyes(head, 0.15, 0.44, 0.13);
    if (dragon) {
      [-0.15, 0.15].forEach(x => { const h = box(0.08, 0.3, 0.08, pixMat(c.horn), x, 0.42, 0.05, head); h.rotation.x = -0.5; });
    } else {
      [-0.16, 0.16].forEach(x => { ears.push(box(0.14, 0.2, 0.08, pixMat(c.ear), x, 0.38, 0.12, head)); });
      if (c.gem) box(0.1, 0.1, 0.04, pixMat(c.gem, { glow: true }), 0, 0.22, 0.44, head);
    }
    const lz = bl / 2 - 0.18;
    [[-0.2, lz], [0.2, lz], [-0.2, -lz], [0.2, -lz]].forEach(([x, z]) => {
      const p = pivot(x, 0.52, z, inner);
      box(0.18, 0.52, 0.18, bodyMat, 0, -0.24, 0, p);
      legs.push(p);
    });
    tail = pivot(0, 0.9, -bl / 2, inner);
    const tl = dragon ? 0.9 : 0.6;
    box(dragon ? 0.2 : 0.22, dragon ? 0.2 : 0.22, tl, bodyMat, 0, 0, -tl / 2, tail);
    if (!dragon) box(0.24, 0.24, 0.18, pixMat(c.tip), 0, 0, -tl, tail);
    else box(0.3, 0.06, 0.26, pixMat(c.wing), 0, 0, -tl, tail);
    tail.rotation.x = dragon ? 0.2 : 0.6;
    if (dragon) {
      [-1, 1].forEach(s => {
        const wp = pivot(s * 0.38, 1.02, 0.15, inner);
        const wm = pixMat(c.wing);
        box(0.95, 0.05, 0.62, wm, s * 0.5, 0, 0, wp);
        box(0.5, 0.05, 0.3, wm, s * 1.05, 0, -0.12, wp);
        if (sp.rainbow) box(0.9, 0.06, 0.1, pixMat(rainbowCols[s > 0 ? 4 : 1], { glow: true }), s * 0.6, 0.02, 0.28, wp);
        wings.push(wp);
      });
    }
    saddle = 1.08; halfW = dragon ? 0.45 : 0.36; height = 1.25;
  }
  const S = sp.scale;
  let phase = 0;
  return {
    root, inner, head, legs, tail, wings, ears, species: sp,
    saddleY: saddle * S, halfW: halfW * S, height: height * S,
    animate(dt, speed, t, ridden) {
      phase += dt * (4 + speed * 1.4);
      const k = Math.min(1, speed / 3);
      const sw = Math.sin(phase) * 0.8 * k;
      if (sp.shape === 'bunny') {
        const hop = Math.abs(Math.sin(phase * 0.6)) * 0.35 * k;
        inner.position.y = hop;
        legs.forEach((l, i) => { l.rotation.x = (i < 2 ? -1 : 1) * hop * 1.6; });
        ears.forEach((e, i) => { e.rotation.x = -0.2 - hop * 0.8 + Math.sin(t * 2 + i) * 0.05; });
      } else {
        legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? sw : -sw); });
        inner.position.y = Math.abs(Math.sin(phase)) * 0.04 * k;
      }
      if (tail) tail.rotation.y = Math.sin(t * (speed > 0.5 ? 9 : 4)) * 0.35;
      if (head) head.rotation.x = ridden ? -0.05 : Math.sin(t * 1.3) * 0.06;
      wings.forEach((wg, i) => { wg.rotation.z = (i ? -1 : 1) * (0.25 + Math.sin(t * (speed > 1 ? 10 : 2.5)) * (speed > 1 ? 0.55 : 0.18)); });
    },
  };
}

// ---------- the Crystal Golem ----------
function makeGolemModel() {
  const root = new THREE.Group();
  const stone = pixMat(0x6a5f86, { spread: 0.22 }), dark = pixMat(0x4a4060, { spread: 0.22 });
  const crystalA = pixMat(0x5ff0e6, { glow: true }), crystalB = pixMat(0xb77bff, { glow: true });
  const mats = [stone, dark];
  const legs = [-0.85, 0.85].map(x => {
    const p = pivot(x, 1.8, 0, root);
    box(1.15, 1.8, 1.15, dark, 0, -0.9, 0, p);
    box(1.3, 0.4, 1.4, stone, 0, -1.6, 0.1, p);
    return p;
  });
  const upper = pivot(0, 1.8, 0, root);
  box(3.2, 2.5, 1.9, stone, 0, 1.25, 0, upper);
  box(2.4, 1.0, 0.3, dark, 0, 1.0, 0.98, upper);
  // crystals growing out of the back and shoulders
  [[-0.9, 2.3, -1.0, 0.4, 1.4], [0.2, 2.6, -1.0, 0.5, 1.8], [1.0, 2.1, -1.0, 0.35, 1.1], [-0.3, 1.5, -1.05, 0.3, 0.9]].forEach(([x, y, z, s, h], i) => {
    const m = box(s, h, s, i % 2 ? crystalB : crystalA, x, y, z, upper);
    m.rotation.x = -0.5; m.rotation.z = (i - 1.5) * 0.25;
  });
  const head = pivot(0, 2.5, 0.25, upper);
  box(1.55, 1.3, 1.45, stone, 0, 0.62, 0, head);
  box(1.6, 0.3, 0.3, dark, 0, 1.0, 0.65, head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222233 });
  const eyes = [-0.36, 0.36].map(x => box(0.34, 0.2, 0.06, eyeMat, x, 0.66, 0.74, head));
  box(0.7, 0.16, 0.06, dark, 0, 0.25, 0.74, head);
  const crown = box(0.35, 0.7, 0.35, crystalA, 0, 1.5, -0.1, head);
  crown.rotation.z = 0.2;
  const arms = [-1, 1].map(s => {
    const p = pivot(s * 2.05, 2.3, 0, upper);
    box(1.0, 2.6, 1.0, dark, 0, -1.2, 0, p);
    box(1.35, 1.1, 1.35, stone, 0, -2.9, 0.05, p);
    box(1.15, 0.9, 1.15, stone, 0, 0.1, 0, p);
    const c = box(0.4, 0.9, 0.4, s < 0 ? crystalB : crystalA, s * 0.25, 0.85, 0, p);
    c.rotation.z = -s * 0.4;
    return p;
  });
  root.traverse(o => { if (o.isMesh) o.userData.golem = true; });
  return {
    root, upper, head, arms, legs, eyes, eyeMat, mats,
    setAwake(on) { eyeMat.color.setHex(on ? 0x7ffff4 : 0x222233); },
    flash(on) { mats.forEach(m => m.emissive.setHex(on ? 0x881111 : 0x000000)); },
  };
}

// ---------- the guide, the dummy and the chest ----------
function makeVillagerModel() {
  const P = 1.9 / 32;
  const root = new THREE.Group();
  const robe = pixMat(0x7a5a3a), skin = pixMat(0xc98a5a), apron = pixMat(0x4f8a3a);
  box(8 * P, 22 * P, 6 * P, robe, 0, 11 * P, 0, root);
  box(6 * P, 14 * P, 0.6 * P, apron, 0, 9 * P, 3.2 * P, root);
  box(12 * P, 4 * P, 5 * P, robe, 0, 18 * P, 2.5 * P, root); // crossed arms
  box(4 * P, 4 * P, 5.2 * P, skin, 0, 18 * P, 2.6 * P, root);
  const head = pivot(0, 22 * P, 0, root);
  box(8 * P, 10 * P, 8 * P, skin, 0, 5 * P, 0, head);
  box(2 * P, 4 * P, 2 * P, pixMat(0xb0784a), 0, 3 * P, 5 * P, head); // the big nose
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

function makeChestModel() {
  const root = new THREE.Group();
  const wood = pixMat(0x9a6a30), trim = pixMat(0x4a3018), gold = pixMat(0xffcf4a, { glow: true });
  box(0.9, 0.55, 0.9, wood, 0, 0.275, 0, root);
  box(0.94, 0.08, 0.94, trim, 0, 0.55, 0, root);
  const lid = pivot(0, 0.58, -0.45, root);
  box(0.92, 0.3, 0.92, wood, 0, 0.15, 0.46, lid);
  box(0.96, 0.06, 0.96, trim, 0, 0.3, 0.46, lid);
  box(0.16, 0.22, 0.06, gold, 0, -0.02, 0.93, lid);
  return { root, lid };
}
