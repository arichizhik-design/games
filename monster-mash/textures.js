// Pixel textures, all drawn on canvases when the game loads (no image files needed).
'use strict';

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE = 16;
const ATLAS_SLOTS = 48;
const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, LOG_SIDE: 5, LOG_TOP: 6, LEAVES: 7, WATER: 8,
  CAVE: 9, CRYSTAL: 10, AMETHYST: 11, PLANKS: 12, COBBLE: 13, PATH: 14, HAY: 15, ORE: 16, BEDROCK: 17,
  ROOF: 18, MOSS: 19, WINDOW: 20, SANDSTONE: 21, SANDSTONE_TOP: 22, CACTUS_SIDE: 23, CACTUS_TOP: 24,
  CORAL_PINK: 25, CORAL_ORANGE: 26, CORAL_BLUE: 27, SEA_LANTERN: 28, GOLD: 29, GLOWSHROOM: 30, MUD: 31, ROOTS: 32,
  KELP: 33, LANTERN: 34, WOOL_RED: 35, WOOL_WHITE: 36,
  SNOW_TOP: 37, SNOW_SIDE: 38, ICE: 39, PINE: 40, ASH_TOP: 41, ASH_SIDE: 42, BASALT: 43, MAGMA: 44, RED_SAND: 45,
};

function shade(hex, f) {
  const r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((hex & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

// fills a 16x16 tile with a base colour and random lighter/darker pixels
function noiseTile(ctx, ox, base, spread, rng) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    ctx.fillStyle = shade(base, 1 + (rng() - 0.5) * spread);
    ctx.fillRect(ox + x, y, 1, 1);
  }
}

function drawAtlas() {
  const c = document.createElement('canvas');
  c.width = TILE * ATLAS_SLOTS; c.height = TILE;
  const ctx = c.getContext('2d');
  const rng = makeRng(1234);
  const at = i => i * TILE;
  const px = (ox, x, y, col) => { ctx.fillStyle = col; ctx.fillRect(ox + x, y, 1, 1); };

  noiseTile(ctx, at(T.GRASS_TOP), 0x5fa83a, 0.35, rng);
  noiseTile(ctx, at(T.DIRT), 0x8a5a36, 0.35, rng);
  // grass side: dirt with a ragged green top
  noiseTile(ctx, at(T.GRASS_SIDE), 0x8a5a36, 0.35, rng);
  for (let x = 0; x < TILE; x++) {
    const h = 3 + Math.floor(rng() * 3);
    for (let y = 0; y < h; y++) px(at(T.GRASS_SIDE), x, y, shade(0x5fa83a, 0.85 + rng() * 0.3));
  }
  noiseTile(ctx, at(T.STONE), 0x8c8c8c, 0.3, rng);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rng() * 14), y = Math.floor(rng() * 15);
    px(at(T.STONE), x, y, shade(0x8c8c8c, 0.7)); px(at(T.STONE), x + 1, y, shade(0x8c8c8c, 0.7));
  }
  noiseTile(ctx, at(T.SAND), 0xe0d39a, 0.18, rng);
  // log side: vertical bark stripes
  for (let x = 0; x < TILE; x++) {
    const f = x % 4 === 0 ? 0.7 : 1;
    for (let y = 0; y < TILE; y++) px(at(T.LOG_SIDE), x, y, shade(0x6b4a2b, f * (0.9 + rng() * 0.2)));
  }
  // log top: rings
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    const col = d > 6.5 ? 0x6b4a2b : (Math.floor(d) % 2 ? 0xb8925a : 0xa07a46);
    px(at(T.LOG_TOP), x, y, shade(col, 0.92 + rng() * 0.16));
  }
  noiseTile(ctx, at(T.LEAVES), 0x3f8a2a, 0.6, rng);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const f = 0.9 + 0.1 * Math.sin((x + y * 0.5) * 0.9) + (rng() - 0.5) * 0.08;
    px(at(T.WATER), x, y, shade(0x3a6fd8, f));
  }
  noiseTile(ctx, at(T.CAVE), 0x4a4060, 0.3, rng);
  for (let i = 0; i < 9; i++) px(at(T.CAVE), Math.floor(rng() * 16), Math.floor(rng() * 16), shade(0x4a4060, 0.65));
  // crystals: bright facets
  const crystal = (slot, base) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const facet = ((x + y) >> 2) % 2 ? 1.12 : 0.88;
      const edge = (x === 0 || y === 0 || x === 15 || y === 15) ? 0.7 : 1;
      px(at(slot), x, y, shade(base, facet * edge * (0.95 + rng() * 0.1)));
    }
    for (let i = 0; i < 5; i++) px(at(slot), 2 + Math.floor(rng() * 12), 2 + Math.floor(rng() * 12), '#ffffff');
  };
  crystal(T.CRYSTAL, 0x52e6dc);
  crystal(T.AMETHYST, 0xa86bff);
  // planks: horizontal boards
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const seam = y % 4 === 3 || (x === ((y >> 2) % 2 ? 5 : 12));
    px(at(T.PLANKS), x, y, shade(0xb0844c, seam ? 0.7 : 0.92 + rng() * 0.16));
  }
  // cobble: blobby stones
  noiseTile(ctx, at(T.COBBLE), 0x7a7a7a, 0.25, rng);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rng() * 15), y = Math.floor(rng() * 15);
    px(at(T.COBBLE), x, y, shade(0x7a7a7a, 0.55)); px(at(T.COBBLE), x + 1, y + 1, shade(0x7a7a7a, 1.3));
  }
  noiseTile(ctx, at(T.PATH), 0x9a8a6a, 0.4, rng);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const f = (y + (x >> 2)) % 3 === 0 ? 0.75 : 1;
    px(at(T.HAY), x, y, shade(0xd8b43a, f * (0.92 + rng() * 0.16)));
  }
  // crystal ore: cave stone with crystal specks
  noiseTile(ctx, at(T.ORE), 0x4a4060, 0.3, rng);
  for (let i = 0; i < 6; i++) {
    const x = 1 + Math.floor(rng() * 13), y = 1 + Math.floor(rng() * 13);
    const col = i % 2 ? '#5ff0e6' : '#c08cff';
    px(at(T.ORE), x, y, col); px(at(T.ORE), x + 1, y, col); px(at(T.ORE), x, y + 1, col);
  }
  noiseTile(ctx, at(T.BEDROCK), 0x2a2433, 0.7, rng);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const f = y % 4 === 3 ? 0.65 : ((x + (y >> 2) * 3) % 8 === 0 ? 0.75 : 1);
    px(at(T.ROOF), x, y, shade(0xa8432f, f * (0.92 + rng() * 0.16)));
  }
  noiseTile(ctx, at(T.MOSS), 0x3c6a5e, 0.35, rng);
  // window: plank frame with glass
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const frame = x < 2 || x > 13 || y < 2 || y > 13 || x === 7 || x === 8 || y === 7 || y === 8;
    px(at(T.WINDOW), x, y, frame ? shade(0x7a5530, 0.9 + rng() * 0.2) : shade(0xa9d8f0, (x + y) % 9 === 0 ? 1.15 : 0.95));
  }

  // sandstone: layered bands
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const band = y < 3 ? 1.08 : (y > 12 ? 0.82 : (y % 5 === 0 ? 0.88 : 1));
    px(at(T.SANDSTONE), x, y, shade(0xd8c088, band * (0.95 + rng() * 0.1)));
  }
  noiseTile(ctx, at(T.SANDSTONE_TOP), 0xdcc48c, 0.12, rng);
  // cactus: ridges with little spines
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const ridge = x % 4 === 1 ? 0.75 : 1;
    px(at(T.CACTUS_SIDE), x, y, shade(0x3f9a3a, ridge * (0.92 + rng() * 0.16)));
    if (x % 4 === 3 && y % 5 === 2) px(at(T.CACTUS_SIDE), x, y, '#f0f0c0');
  }
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    px(at(T.CACTUS_TOP), x, y, shade(edge ? 0x2f7a2a : 0x5ab84a, 0.92 + rng() * 0.16));
  }
  // coral: bumpy blobs
  const coral = (slot, base) => {
    noiseTile(ctx, at(slot), base, 0.25, rng);
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rng() * 15), y = Math.floor(rng() * 15);
      px(at(slot), x, y, shade(base, 1.35)); px(at(slot), x + 1, y + 1, shade(base, 0.6));
    }
  };
  coral(T.CORAL_PINK, 0xff6a9a); coral(T.CORAL_ORANGE, 0xff9a3a); coral(T.CORAL_BLUE, 0x3a8ad8);
  // sea lantern: glowing panes
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const frame = x < 2 || y < 2 || x > 13 || y > 13 || ((x + y) % 7 === 0);
    px(at(T.SEA_LANTERN), x, y, frame ? shade(0x9ad8e0, 0.9 + rng() * 0.1) : shade(0xe8fff8, 0.95 + rng() * 0.1));
  }
  // gold block
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const edge = x === 0 || y === 0 ? 1.25 : (x === 15 || y === 15 ? 0.7 : 1);
    px(at(T.GOLD), x, y, shade(0xf2c230, edge * (0.92 + rng() * 0.14)));
  }
  for (let i = 0; i < 6; i++) px(at(T.GOLD), 2 + Math.floor(rng() * 12), 2 + Math.floor(rng() * 12), '#fff6c0');
  // glowing mushroom cap
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(at(T.GLOWSHROOM), x, y, shade(0x5ad8ff, 0.85 + rng() * 0.3));
  for (let i = 0; i < 8; i++) px(at(T.GLOWSHROOM), Math.floor(rng() * 16), Math.floor(rng() * 16), '#ffffff');
  noiseTile(ctx, at(T.MUD), 0x5a3a24, 0.35, rng);
  // roots: dark dirt with winding roots
  noiseTile(ctx, at(T.ROOTS), 0x5a3a24, 0.3, rng);
  for (let k = 0; k < 3; k++) {
    let x = Math.floor(rng() * 16);
    for (let y = 0; y < TILE; y++) { px(at(T.ROOTS), x, y, shade(0xb08a5a, 0.9 + rng() * 0.2)); if (rng() < 0.4) x = (x + (rng() < 0.5 ? 15 : 1)) % 16; }
  }
  // kelp
  noiseTile(ctx, at(T.KELP), 0x2a6a3a, 0.3, rng);
  for (let x = 2; x < 16; x += 5) for (let y = 0; y < TILE; y++) px(at(T.KELP), x, y, shade(0x4a9a4a, 0.9 + rng() * 0.2));
  // lantern
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const frame = x < 3 || x > 12 || y < 2 || y > 13;
    px(at(T.LANTERN), x, y, frame ? shade(0x4a3a2a, 0.9 + rng() * 0.2) : shade(0xffb84a, 0.9 + rng() * 0.2));
  }
  noiseTile(ctx, at(T.SNOW_TOP), 0xf4f8ff, 0.06, rng);
  noiseTile(ctx, at(T.SNOW_SIDE), 0x8a5a36, 0.35, rng);
  for (let x = 0; x < TILE; x++) { const h = 3 + Math.floor(rng() * 3); for (let y = 0; y < h; y++) px(at(T.SNOW_SIDE), x, y, shade(0xf4f8ff, 0.94 + rng() * 0.06)); }
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(at(T.ICE), x, y, shade(0x9ad8f8, ((x * 3 + y) % 11 === 0 ? 1.18 : 0.96) + rng() * 0.05));
  noiseTile(ctx, at(T.PINE), 0x2a5a3a, 0.5, rng);
  for (let i = 0; i < 18; i++) px(at(T.PINE), Math.floor(rng() * 16), Math.floor(rng() * 6), '#eef6ff');
  noiseTile(ctx, at(T.ASH_TOP), 0x4a4446, 0.35, rng);
  noiseTile(ctx, at(T.ASH_SIDE), 0x3a2a24, 0.35, rng);
  for (let x = 0; x < TILE; x++) { const h = 2 + Math.floor(rng() * 3); for (let y = 0; y < h; y++) px(at(T.ASH_SIDE), x, y, shade(0x4a4446, 0.9 + rng() * 0.2)); }
  noiseTile(ctx, at(T.BASALT), 0x2e2a30, 0.3, rng);
  for (let y = 0; y < TILE; y += 4) for (let x = 0; x < TILE; x++) px(at(T.BASALT), x, y, shade(0x2e2a30, 0.7));
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const crack = ((x + Math.floor(y / 3)) % 5 === 0) || ((y + Math.floor(x / 4)) % 6 === 0);
    px(at(T.MAGMA), x, y, crack ? shade(0xffd04a, 0.9 + rng() * 0.2) : shade(0xc8341a, 0.85 + rng() * 0.25));
  }
  noiseTile(ctx, at(T.RED_SAND), 0xc8643a, 0.2, rng);
  noiseTile(ctx, at(T.WOOL_RED), 0xd8343a, 0.15, rng);
  noiseTile(ctx, at(T.WOOL_WHITE), 0xf0f0f0, 0.08, rng);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

// small speckled texture for mob/character boxes so they look pixelly too
const pixelMatCache = new Map();
function pixelTexture(hex, spread = 0.18, size = 8) {
  const key = hex + ':' + spread + ':' + size;
  if (pixelMatCache.has(key)) return pixelMatCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const rng = makeRng(hex ^ 0x9e3779b9);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    ctx.fillStyle = shade(hex, 1 + (rng() - 0.5) * spread);
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  pixelMatCache.set(key, tex);
  return tex;
}

function pixMat(hex, opts = {}) {
  if (opts.glow) {
    return new THREE.MeshBasicMaterial({ map: pixelTexture(hex, 0.25), transparent: !!opts.opacity, opacity: opts.opacity || 1 });
  }
  return new THREE.MeshLambertMaterial({ map: pixelTexture(hex, opts.spread ?? 0.18) });
}

// a text label that floats over things (names, Zzz)
function textSprite(text, color = '#ffffff', scale = 1, bg = 'rgba(0,0,0,0.45)') {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = 'bold 44px "Pixelify Sans", "Trebuchet MS", sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w; c.height = 64;
  ctx.font = font;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, 64); }
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 17, 36);
  ctx.fillStyle = color;
  ctx.fillText(text, 14, 33);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale * w / 64 * 0.5, scale * 0.5, 1);
  return s;
}

// ---- pixel icons for the hotbar and menus ----
function iconCanvas(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  const p = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  draw(p, ctx);
  return c;
}
const RAINBOW_HEX = ['#ff5577', '#ffa94a', '#ffe95a', '#6be06b', '#5ff0e6', '#7a7bff', '#c07bff'];

// a diagonal tool: handle from bottom-left, head toward top-right
function diagonalIcon(handle, head, headLen, width, extra) {
  return iconCanvas(p => {
    for (let i = 0; i < 14; i++) {
      const x = 1 + i, y = 14 - i;
      const isHead = i >= 14 - headLen;
      const col = isHead ? (head === 'rainbow' ? RAINBOW_HEX[i % 7] : head) : handle;
      const w = isHead ? width : 1;
      for (let k = 0; k < w; k++) { p(x + k, y, col); p(x, y - k, col); }
      p(x + 1, y + 1, 'rgba(0,0,0,0.35)');
    }
    if (extra) extra(p);
  });
}
function gunIcon(body, glow) {
  return iconCanvas(p => {
    for (let x = 2; x < 14; x++) for (let y = 5; y < 9; y++) p(x, y, y === 5 ? '#888' : body);
    for (let x = 13; x < 15; x++) for (let y = 6; y < 8; y++) p(x, y, glow === 'rainbow' ? RAINBOW_HEX[x % 7] : glow);
    for (let y = 9; y < 14; y++) for (let x = 3; x < 6; x++) p(x, y, '#3a2a1a');
    p(7, 9, body); p(7, 10, body); p(8, 10, body);
    for (let x = 6; x < 12; x++) p(x, 6, glow === 'rainbow' ? RAINBOW_HEX[x % 7] : glow);
  });
}
function weaponIcon(id) {
  const w = WEAPONS[id];
  const [a, b] = w.icon;
  if (w.kind === 'gun') return gunIcon(a, b);
  if (id === 'bat') return diagonalIcon(a, b, 8, 2);
  if (id === 'spear' || id === 'trident') return diagonalIcon(a, b, 4, 1, p => {
    if (id === 'trident') { p(11, 1, b); p(14, 4, b); p(10, 2, b); p(13, 5, b); } else { p(13, 0, b); p(15, 2, b); }
  });
  return diagonalIcon(a, b, 10, 2, p => { for (let k = -2; k <= 2; k++) p(5 + k, 10 + k, '#5a5a5a'); });
}
function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

const ICONS = {
  egg: (type) => iconCanvas(p => {
    const e = EGGS[type || 'forest'];
    const rows = [[6, 9], [5, 10], [4, 11], [4, 11], [3, 12], [3, 12], [3, 12], [3, 12], [3, 12], [4, 11], [4, 11], [5, 10]];
    rows.forEach(([a, b], i) => { for (let x = a; x <= b; x++) p(x, i + 2, x === a || x === b ? '#2a2a3a' : hex(e.shell)); });
    p(6, 5, hex(e.spotA)); p(7, 5, hex(e.spotA)); p(9, 8, hex(e.spotB)); p(10, 8, hex(e.spotB)); p(9, 9, hex(e.spotB)); p(6, 11, hex(e.spotA));
    p(5, 4, '#ffffff');
  }),
  heart: (full) => iconCanvas(p => {
    const shape = ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...'];
    shape.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      let col = '#2a0d12';
      if (full === 1) col = '#ff3b4f'; else if (full === 0.5 && x < 4) col = '#ff3b4f';
      p(x * 2, y * 2 + 1, col); p(x * 2 + 1, y * 2 + 1, col); p(x * 2, y * 2 + 2, col); p(x * 2 + 1, y * 2 + 2, col);
    }));
    if (full) { p(2, 3, '#ffb3bc'); p(3, 3, '#ffb3bc'); }
  }),
  armor: (col) => iconCanvas(p => {
    const shape = ['##....##', '########', '########', '.######.', '.######.', '.######.', '..####..'];
    shape.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      const c = (x + y) % 5 === 0 ? 'rgba(255,255,255,0.35)' : col;
      p(x * 2, y * 2 + 1, col); p(x * 2 + 1, y * 2 + 1, c); p(x * 2, y * 2 + 2, col); p(x * 2 + 1, y * 2 + 2, col);
    }));
  }),
  scroll: () => iconCanvas(p => {
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) p(x, y, '#f0deb0');
    for (let x = 2; x < 14; x++) { p(x, 2, '#a07a40'); p(x, 13, '#a07a40'); }
    for (let y = 5; y < 12; y += 2) for (let x = 5; x < 11; x++) if ((x + y) % 4) p(x, y, '#6b4a2b');
  }),
  scuba: () => iconCanvas(p => {
    for (let y = 4; y < 10; y++) for (let x = 2; x < 14; x++) p(x, y, (y === 4 || y === 9 || x === 2 || x === 13 || x === 7 || x === 8) ? '#2a2a3a' : '#7ad8ff');
    for (const x of [0, 1, 14, 15]) p(x, 6, '#ffcf4a');
    p(4, 5, '#ffffff'); p(10, 5, '#ffffff');
  }),
};
