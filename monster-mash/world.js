// Block worlds: the island (overworld), the four boss caves and the deep ocean.
'use strict';

const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, LOG: 5, LEAVES: 6, WATER: 7, CAVE: 8, CRYSTAL: 9,
  AMETHYST: 10, PLANKS: 11, COBBLE: 12, PATH: 13, HAY: 14, ORE: 15, BEDROCK: 16, ROOF: 17, MOSS: 18, WINDOW: 19,
  SANDSTONE: 20, CACTUS: 21, CORAL_PINK: 22, CORAL_ORANGE: 23, CORAL_BLUE: 24, SEA_LANTERN: 25, GOLD: 26,
  GLOWSHROOM: 27, MUD: 28, ROOTS: 29, KELP: 30, LANTERN: 31, WOOL_RED: 32, WOOL_WHITE: 33,
  SNOW: 34, ICE: 35, PINE: 36, ASH: 37, BASALT: 38, MAGMA: 39, RED_SAND: 40,
};
// [top, side, bottom] tiles for each block
const BLOCK_TILES = {
  [B.GRASS]: [T.GRASS_TOP, T.GRASS_SIDE, T.DIRT], [B.DIRT]: [T.DIRT, T.DIRT, T.DIRT],
  [B.STONE]: [T.STONE, T.STONE, T.STONE], [B.SAND]: [T.SAND, T.SAND, T.SAND],
  [B.LOG]: [T.LOG_TOP, T.LOG_SIDE, T.LOG_TOP], [B.LEAVES]: [T.LEAVES, T.LEAVES, T.LEAVES],
  [B.WATER]: [T.WATER, T.WATER, T.WATER], [B.CAVE]: [T.CAVE, T.CAVE, T.CAVE],
  [B.CRYSTAL]: [T.CRYSTAL, T.CRYSTAL, T.CRYSTAL], [B.AMETHYST]: [T.AMETHYST, T.AMETHYST, T.AMETHYST],
  [B.PLANKS]: [T.PLANKS, T.PLANKS, T.PLANKS], [B.COBBLE]: [T.COBBLE, T.COBBLE, T.COBBLE],
  [B.PATH]: [T.PATH, T.DIRT, T.DIRT], [B.HAY]: [T.HAY, T.HAY, T.HAY], [B.ORE]: [T.ORE, T.ORE, T.ORE],
  [B.BEDROCK]: [T.BEDROCK, T.BEDROCK, T.BEDROCK], [B.ROOF]: [T.ROOF, T.ROOF, T.ROOF],
  [B.MOSS]: [T.MOSS, T.CAVE, T.CAVE], [B.WINDOW]: [T.WINDOW, T.WINDOW, T.WINDOW],
  [B.SANDSTONE]: [T.SANDSTONE_TOP, T.SANDSTONE, T.SANDSTONE_TOP], [B.CACTUS]: [T.CACTUS_TOP, T.CACTUS_SIDE, T.CACTUS_TOP],
  [B.CORAL_PINK]: [T.CORAL_PINK, T.CORAL_PINK, T.CORAL_PINK], [B.CORAL_ORANGE]: [T.CORAL_ORANGE, T.CORAL_ORANGE, T.CORAL_ORANGE],
  [B.CORAL_BLUE]: [T.CORAL_BLUE, T.CORAL_BLUE, T.CORAL_BLUE], [B.SEA_LANTERN]: [T.SEA_LANTERN, T.SEA_LANTERN, T.SEA_LANTERN],
  [B.GOLD]: [T.GOLD, T.GOLD, T.GOLD], [B.GLOWSHROOM]: [T.GLOWSHROOM, T.GLOWSHROOM, T.GLOWSHROOM],
  [B.MUD]: [T.MUD, T.MUD, T.MUD], [B.ROOTS]: [T.ROOTS, T.ROOTS, T.ROOTS], [B.KELP]: [T.KELP, T.KELP, T.KELP],
  [B.LANTERN]: [T.LANTERN, T.LANTERN, T.LANTERN], [B.WOOL_RED]: [T.WOOL_RED, T.WOOL_RED, T.WOOL_RED],
  [B.WOOL_WHITE]: [T.WOOL_WHITE, T.WOOL_WHITE, T.WOOL_WHITE],
  [B.SNOW]: [T.SNOW_TOP, T.SNOW_SIDE, T.DIRT], [B.ICE]: [T.ICE, T.ICE, T.ICE], [B.PINE]: [T.PINE, T.PINE, T.PINE],
  [B.ASH]: [T.ASH_TOP, T.ASH_SIDE, T.BASALT], [B.BASALT]: [T.BASALT, T.BASALT, T.BASALT], [B.MAGMA]: [T.MAGMA, T.MAGMA, T.MAGMA],
  [B.RED_SAND]: [T.RED_SAND, T.RED_SAND, T.RED_SAND],
};
const GLOWS = new Set([B.CRYSTAL, B.AMETHYST, B.SEA_LANTERN, B.GOLD, B.GLOWSHROOM, B.LANTERN, B.MAGMA]);

// face table: direction, the 4 corners and their uvs (two triangles: 0 1 2, 2 1 3)
const FACES = [
  { dir: [-1, 0, 0], side: 1, shade: 0.8, corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { dir: [1, 0, 0], side: 1, shade: 0.8, corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { dir: [0, -1, 0], side: 2, shade: 0.55, corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { dir: [0, 1, 0], side: 0, shade: 1.0, corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { dir: [0, 0, -1], side: 1, shade: 0.68, corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { dir: [0, 0, 1], side: 1, shade: 0.68, corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
];
const AO_LEVELS = [0.42, 0.62, 0.82, 1.0];
const CHUNK = 16;

class World {
  constructor(name, w, h, d) {
    this.name = name; this.W = w; this.H = h; this.D = d;
    this.blocks = new Uint8Array(w * h * d);
    this.lights = [];          // {x,y,z,r,g,b,radius} baked into block colours
    this.ambient = [1, 1, 1];  // light level everywhere
    this.group = new THREE.Group();
    this.chunks = new Map();
  }
  idx(x, y, z) { return (y * this.D + z) * this.W + x; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.W && y < this.H && z < this.D; }
  get(x, y, z) { return this.inside(x, y, z) ? this.blocks[this.idx(x, y, z)] : (y < 0 ? B.BEDROCK : B.AIR); }
  set(x, y, z, b) { if (this.inside(x, y, z)) this.blocks[this.idx(x, y, z)] = b; }
  // solid for walking into: outside the map counts as a wall so nobody walks off the edge
  solid(x, y, z) {
    if (x < 0 || z < 0 || x >= this.W || z >= this.D || y < 0) return true;
    if (y >= this.H) return false;
    const b = this.blocks[this.idx(x, y, z)];
    return b !== B.AIR && b !== B.WATER;
  }
  opaque(x, y, z) { const b = this.get(x, y, z); return b !== B.AIR && b !== B.WATER; }
  // highest solid block's top at a column
  groundAt(x, z, fromY = this.H - 1) {
    x = Math.floor(x); z = Math.floor(z);
    for (let y = Math.min(this.H - 1, Math.floor(fromY)); y >= 0; y--) if (this.solid(x, y, z) && this.inside(x, y, z)) return y + 1;
    return 0;
  }

  lightAt(x, y, z) {
    let r = this.ambient[0], g = this.ambient[1], b = this.ambient[2];
    for (const L of this.lights) {
      const dx = x - L.x, dy = y - L.y, dz = z - L.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > L.radius * L.radius) continue;
      const f = 1 - Math.sqrt(d2) / L.radius;
      r += L.r * f * f; g += L.g * f * f; b += L.b * f * f;
    }
    return [Math.min(1.15, r), Math.min(1.15, g), Math.min(1.15, b)];
  }

  buildAll(material, waterMaterial) {
    this.material = material; this.waterMaterial = waterMaterial;
    for (let cz = 0; cz < Math.ceil(this.D / CHUNK); cz++)
      for (let cx = 0; cx < Math.ceil(this.W / CHUNK); cx++) this.buildChunk(cx, cz);
  }

  rebuildAt(x, z) { this.buildChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK)); }

  buildChunk(cx, cz) {
    const key = cx + ',' + cz;
    const old = this.chunks.get(key);
    if (old) { for (const m of old) { this.group.remove(m); m.geometry.dispose(); } }
    const solidBuf = { pos: [], uv: [], col: [], idx: [] };
    const waterBuf = { pos: [], uv: [], col: [], idx: [] };
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const x1 = Math.min(this.W, x0 + CHUNK), z1 = Math.min(this.D, z0 + CHUNK);
    const eps = 0.02 / ATLAS_SLOTS;
    for (let y = 0; y < this.H; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const b = this.blocks[this.idx(x, y, z)];
      if (b === B.AIR) continue;
      const isWater = b === B.WATER;
      const tiles = BLOCK_TILES[b];
      const glow = GLOWS.has(b);
      for (const f of FACES) {
        const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2];
        const nb = this.get(nx, ny, nz);
        if (isWater) { if (this.skipWater || nb !== B.AIR || f.dir[1] !== 1) continue; }
        else if (nb !== B.AIR && nb !== B.WATER) continue;
        if (!isWater && ny < 0) continue;
        const buf = isWater ? waterBuf : solidBuf;
        const tile = tiles[f.side];
        const u0 = tile / ATLAS_SLOTS + eps, u1 = (tile + 1) / ATLAS_SLOTS - eps;
        const light = glow ? [1.1, 1.1, 1.1] : this.lightAt(nx + 0.5, ny + 0.5, nz + 0.5);
        const base = buf.pos.length / 3;
        const ao = [];
        for (const c of f.corners) {
          let vy = y + c[1];
          if (isWater) vy -= 0.12;
          buf.pos.push(x + c[0], vy, z + c[2]);
          buf.uv.push(c[3] ? u1 : u0, c[4]);
          let a = 3;
          if (!glow && !isWater) {
            // ambient occlusion: look at the blocks touching this corner in front of the face
            const off = [c[0] * 2 - 1, c[1] * 2 - 1, c[2] * 2 - 1];
            const axes = [0, 1, 2].filter(i => f.dir[i] === 0);
            const p = [nx, ny, nz];
            const s1 = [...p]; s1[axes[0]] += off[axes[0]];
            const s2 = [...p]; s2[axes[1]] += off[axes[1]];
            const cc = [...p]; cc[axes[0]] += off[axes[0]]; cc[axes[1]] += off[axes[1]];
            const o1 = this.opaque(...s1) ? 1 : 0, o2 = this.opaque(...s2) ? 1 : 0, o3 = this.opaque(...cc) ? 1 : 0;
            a = (o1 && o2) ? 0 : 3 - (o1 + o2 + o3);
          }
          ao.push(a);
          const k = f.shade * AO_LEVELS[a];
          buf.col.push(light[0] * k, light[1] * k, light[2] * k);
        }
        if (ao[0] + ao[3] > ao[1] + ao[2]) buf.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        else buf.idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
      }
    }
    const meshes = [];
    const make = (buf, mat) => {
      if (!buf.idx.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
      g.setIndex(buf.idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      this.group.add(m);
      meshes.push(m);
    };
    make(solidBuf, this.material);
    make(waterBuf, this.waterMaterial);
    this.chunks.set(key, meshes);
  }

  // first solid block between two points (for the camera), returns the distance or null
  raycast(from, dir, maxDist) {
    const step = 0.1;
    for (let t = 0; t < maxDist; t += step) {
      const x = from.x + dir.x * t, y = from.y + dir.y * t, z = from.z + dir.z * t;
      if (y < this.H && this.solid(Math.floor(x), Math.floor(y), Math.floor(z))) return t;
    }
    return null;
  }
}

// ---------- noise ----------
function valueNoise2D(seed) {
  const rng = makeRng(seed);
  const perm = new Uint8Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rng(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const at = (x, z) => vals[perm[(perm[x & 255] + z) & 255]];
  const smooth = t => t * t * (3 - 2 * t);
  const n = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = smooth(x - xi), zf = smooth(z - zi);
    const a = at(xi, zi), b = at(xi + 1, zi), c = at(xi, zi + 1), d = at(xi + 1, zi + 1);
    return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
  };
  return (x, z, oct = 4) => {
    let s = 0, amp = 1, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) { s += n(x * f, z * f) * amp; tot += amp; amp *= 0.5; f *= 2; }
    return s / tot;
  };
}

// ---------- the planets' overworlds ----------
// every planet has a village, woods, a desert, a sea and a crystal mountain, in different far-apart spots
const MAP = { W: 288, H: 50, D: 288, water: 13 };
const LAYOUTS = {
  island: {
    village: { x: 128, z: 164 }, forest: { x: 120, z: 50, r: 46 }, desert: { x: 222, z: 244, r: 50 }, mountain: { x: 258, z: 110, r: 30 },
    ocean: 'west', dive: { x: 22, z: 164 },
    doors: { rabbit: { x: 120, z: 36, dir: [0, -1], mound: { x: 120, z: 27 } }, sand: { x: 208, z: 250, dir: [1, 0], mound: { x: 220, z: 250 } }, crystal: { x: 232, z: 110, dir: [1, 0] } },
    sky: 0x9ad0ff, ground: 0x5a7a3a, beam: 0xb77bff, seed: 77,
    pal: { grass: 'GRASS', dirt: 'DIRT', beach: 'SAND', desertTop: 'SAND', desertSub: 'SANDSTONE', stone: 'STONE', leaves: 'LEAVES', cactus: 'CACTUS', desertPath: 'SANDSTONE', palms: true },
    doorLook: { rabbit: ['ROOTS', 'DIRT', 'RABBIT HOLE', '#c9955a'], sand: ['SANDSTONE', 'SANDSTONE', 'SAND CAVE', '#ffcf4a'], crystal: ['AMETHYST', 'CAVE', 'CRYSTAL CAVES', '#5ff0e6'] },
  },
  frost: {
    village: { x: 160, z: 124 }, forest: { x: 168, z: 238, r: 46 }, desert: { x: 66, z: 48, r: 50 }, mountain: { x: 30, z: 200, r: 30 },
    ocean: 'east', dive: { x: 266, z: 124 },
    doors: { rabbit: { x: 168, z: 252, dir: [0, 1], mound: { x: 168, z: 261 } }, sand: { x: 80, z: 40, dir: [-1, 0], mound: { x: 68, z: 40 } }, crystal: { x: 56, z: 200, dir: [-1, 0] } },
    sky: 0xcfe6f6, ground: 0xe8f0f8, beam: 0x9ae8ff, seed: 131,
    pal: { grass: 'SNOW', dirt: 'DIRT', beach: 'SNOW', desertTop: 'ICE', desertSub: 'SNOW', stone: 'STONE', leaves: 'PINE', cactus: 'ICE', desertPath: 'SNOW', palms: false },
    doorLook: { rabbit: ['ICE', 'SNOW', 'SNOW BURROW', '#bfeeff'], sand: ['ICE', 'ICE', 'ICE CAVE', '#9ae8ff'], crystal: ['CRYSTAL', 'STONE', 'ICE CAVES', '#5ff0e6'] },
  },
  lava: {
    village: { x: 144, z: 110 }, forest: { x: 44, z: 64, r: 44 }, desert: { x: 240, z: 70, r: 48 }, mountain: { x: 244, z: 208, r: 30 },
    ocean: 'south', dive: { x: 144, z: 266 },
    doors: { rabbit: { x: 44, z: 76, dir: [0, -1], mound: { x: 44, z: 67 } }, sand: { x: 228, z: 70, dir: [1, 0], mound: { x: 240, z: 70 } }, crystal: { x: 218, z: 208, dir: [1, 0] } },
    sky: 0x7a3a2a, ground: 0x3a2a24, beam: 0xff7a2a, seed: 211,
    pal: { grass: 'ASH', dirt: 'BASALT', beach: 'RED_SAND', desertTop: 'RED_SAND', desertSub: 'SANDSTONE', stone: 'BASALT', leaves: null, cactus: 'MAGMA', desertPath: 'BASALT', palms: false },
    doorLook: { rabbit: ['MAGMA', 'BASALT', 'ASH BURROW', '#ff9a4a'], sand: ['MAGMA', 'RED_SAND', 'LAVA TUBE', '#ffcf4a'], crystal: ['MAGMA', 'BASALT', 'FIRE CAVES', '#ff7a2a'] },
  },
};
const DOOR_SIZE = { rabbit: { len: 9, w: 3, h: 4, mr: 13, mh: 12 }, sand: { len: 11, w: 5, h: 5, mr: 15, mh: 13 }, crystal: { len: 13, w: 5, h: 5 } };

let OVER = null, DOORS = null;
// fill OVER and DOORS for a planet (positions of everything on its overworld)
function setupLayout(pid) {
  const L = LAYOUTS[pid], V = L.village;
  const pal = {};
  for (const k in L.pal) pal[k] = typeof L.pal[k] === 'string' ? B[L.pal[k]] : L.pal[k];
  const home = { x0: V.x - 24, z0: V.z - 5, sx: 13, sz: 9 };
  OVER = Object.assign({}, MAP, {
    pid, layout: L, pal,
    village: { x: V.x, z: V.z, h: 16 },
    spawn: { x: V.x + 0.5, z: V.z + 8.5 },
    guide: { x: V.x - 4.5, z: V.z + 3.5 },
    dummy: { x: V.x + 2.5, z: V.z + 11.5 },
    home, incubator: { x: home.x0 + 3.5, z: home.z0 + 4.5 }, bed: { x: home.x0 + 1, z: home.z0 + 1 },
    shop: { x0: V.x + 30, z0: V.z - 5, sx: 9, sz: 9 }, shopkeeper: { x: V.x + 32.5, z: V.z + 0.5 },
    forest: L.forest, desert: L.desert, mountain: L.mountain, ocean: L.ocean,
    diveSpot: { x: L.dive.x + 0.5, z: L.dive.z + 0.5 },
  });
  // where you come back out of the coral cave: on the shore between the village and the dive spot
  const dvx = V.x - L.dive.x, dvz = V.z - L.dive.z, dl = Math.hypot(dvx, dvz);
  OVER.beach = { x: L.dive.x + dvx / dl * 46 + 0.5, z: L.dive.z + dvz / dl * 46 + 0.5 };
  DOORS = {};
  for (const id in L.doors) {
    const d = L.doors[id], sz = DOOR_SIZE[id], look = L.doorLook[id];
    DOORS[id] = { x: d.x, z: d.z, dir: d.dir, floor: 17, len: sz.len, w: sz.w, h: sz.h, frame: B[look[0]], wall: B[look[1]],
      mound: d.mound ? { x: d.mound.x, z: d.mound.z, r: sz.mr, h: sz.mh } : null, label: look[2], color: look[3] };
  }
}
// how far into the sea a spot is (0 or less means on land)
function oceanDepth(x, z) {
  if (OVER.ocean === 'west') return 60 - x;
  if (OVER.ocean === 'east') return x - (MAP.W - 60);
  return z - (MAP.D - 60);
}

function smooth01(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }

function generateOverworld() {
  const w = new World('overworld', OVER.W, OVER.H, OVER.D);
  const L = OVER.layout, pal = OVER.pal;
  const noise = valueNoise2D(L.seed), noise2 = valueNoise2D(L.seed + 14);
  const rng = makeRng(L.seed * 55);
  const heights = new Int16Array(w.W * w.D);
  const biome = new Uint8Array(w.W * w.D); // 0 plains, 1 woods, 2 desert, 3 sea
  const V = OVER.village, M = OVER.mountain, Dz = OVER.desert, Fo = OVER.forest;
  const vx0 = V.x - 28, vx1 = V.x + 42, vzr = 16;
  for (let z = 0; z < w.D; z++) for (let x = 0; x < w.W; x++) {
    let h = 15 + (noise(x / 40, z / 40) - 0.5) * 14 + (noise2(x / 12, z / 12) - 0.5) * 3;
    const dw = smooth01((Dz.r - Math.hypot(x - Dz.x, z - Dz.z)) / 14);
    h = lerp(h, 16 + (noise2(x / 16, z / 8) - 0.5) * 7, dw);
    const ow = smooth01(oceanDepth(x, z) / 16);
    h = lerp(h, 4 + noise2(x / 9, z / 9) * 2.5, ow);
    // the village is a long flat strip: your house, the square, the street and the shop
    const vdx = Math.max(vx0 - x, 0, x - vx1), vdz = Math.max(Math.abs(z - V.z) - vzr, 0), dv = Math.hypot(vdx, vdz);
    if (dv < 10) h = lerp(V.h, h, smooth01(dv / 10));
    const dm = Math.hypot(x - M.x, z - M.z);
    if (dm < M.r) h += Math.pow(1 - dm / M.r, 1.15) * 26 + (noise2(x / 6, z / 6) - 0.5) * 4;
    for (const id in DOORS) {
      const d = DOORS[id];
      if (d.mound) {
        const dd = Math.hypot(x - d.mound.x, z - d.mound.z);
        if (dd < d.mound.r) h = Math.max(h, d.floor + Math.pow(1 - dd / d.mound.r, 0.7) * d.mound.h);
      }
      const fx = d.x - d.dir[0] * 4, fz = d.z - d.dir[1] * 4;
      const dc = Math.hypot(x - fx, z - fz);
      if (dc < 11) h = lerp(d.floor, h, smooth01((dc - 6) / 5));
    }
    const edge = Math.min(x, z, w.W - 1 - x, w.D - 1 - z);
    if (edge < 8 && ow < 0.5) h += (8 - edge) * 1.6;
    heights[z * w.W + x] = Math.max(3, Math.min(w.H - 6, Math.round(h)));
    biome[z * w.W + x] = ow > 0.5 ? 3 : dw > 0.45 ? 2 : Math.hypot(x - Fo.x, z - Fo.z) < Fo.r ? 1 : 0;
  }
  for (let z = 0; z < w.D; z++) for (let x = 0; x < w.W; x++) {
    const h = heights[z * w.W + x], bi = biome[z * w.W + x];
    const dm = Math.hypot(x - M.x, z - M.z);
    const rocky = dm < M.r * 0.78 && h > 22;
    const shore = bi === 3 || h <= OVER.water + 1;
    for (let y = 0; y < h; y++) {
      let b = pal.stone;
      if (y === 0) b = B.BEDROCK;
      else if (y >= h - 1) b = rocky ? (rng() < 0.08 ? B.ORE : pal.stone) : bi === 2 ? pal.desertTop : shore ? pal.beach : pal.grass;
      else if (y >= h - 4) b = rocky ? pal.stone : bi === 2 ? (y < h - 2 ? pal.desertSub : pal.desertTop) : shore ? pal.beach : pal.dirt;
      else if (rocky && rng() < 0.05) b = B.ORE;
      w.set(x, y, z, b);
    }
    for (let y = h; y < OVER.water; y++) w.set(x, y, z, B.WATER);
    if (h > 34 && dm < 10 && rng() < 0.18) w.set(x, h, z, rng() < 0.5 ? B.CRYSTAL : B.AMETHYST);
  }

  // gravel paths from the village to every place (a wooden pier over the water to the dive spot)
  const pathCells = new Set();
  const out = id => [DOORS[id].x - DOORS[id].dir[0] * 4, DOORS[id].z - DOORS[id].dir[1] * 4];
  const paths = [
    [[V.x, V.z], [(V.x + out('rabbit')[0]) / 2 + 6, (V.z + out('rabbit')[1]) / 2], out('rabbit')],
    [[V.x, V.z], [(V.x + out('sand')[0]) / 2, (V.z + out('sand')[1]) / 2 + 6], out('sand')],
    [[V.x, V.z], [(V.x + out('crystal')[0]) / 2 - 5, (V.z + out('crystal')[1]) / 2], out('crystal')],
    [[V.x, V.z], [(V.x + OVER.diveSpot.x) / 2, (V.z + OVER.diveSpot.z) / 2 + 4], [OVER.diveSpot.x + Math.sign(V.x - OVER.diveSpot.x) * 3, OVER.diveSpot.z + Math.sign(V.z - OVER.diveSpot.z) * 3]],
  ];
  for (const pts of paths) for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const px = ax + (bx - ax) * t + Math.sin(t * 6 + i) * 2, pz = az + (bz - az) * t + Math.cos(t * 5 + i) * 1.5;
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) pathCells.add(Math.round(px + ox) + ',' + Math.round(pz + oz));
    }
  }
  for (const key of pathCells) {
    const [x, z] = key.split(',').map(Number);
    if (!w.inside(x, 0, z)) continue;
    const h = heights[z * w.W + x];
    if (h <= OVER.water) { w.set(x, OVER.water - 1, z, B.PLANKS); if (h < OVER.water - 1) w.set(x, OVER.water - 2, z, B.LOG); }
    else if (biome[z * w.W + x] === 2) w.set(x, h - 1, z, pal.desertPath);
    else w.set(x, h - 1, z, B.PATH);
  }

  // the village: square and well, your house to the west, a street of houses to the east, and the shop at the end
  for (let z = V.z - 5; z <= V.z + 5; z++) for (let x = V.x - 5; x <= V.x + 5; x++) w.set(x, V.h - 1, z, B.COBBLE);
  for (let x = V.x - 12; x <= V.x + 30; x++) for (let z = V.z - 1; z <= V.z + 1; z++) w.set(x, V.h - 1, z, B.COBBLE);
  for (let z = V.z - 1; z <= V.z + 1; z++) for (let x = V.x - 1; x <= V.x + 1; x++) {
    if (x === V.x && z === V.z) { w.set(x, V.h - 1, z, B.WATER); continue; }
    w.set(x, V.h, z, B.COBBLE);
  }
  const H = OVER.home;
  buildHouse(w, H.x0, H.z0, H.sx, H.sz, V.h, 'x+');
  w.set(OVER.bed.x, V.h, OVER.bed.z, B.WOOL_RED); w.set(OVER.bed.x + 1, V.h, OVER.bed.z, B.WOOL_WHITE);
  buildHouse(w, V.x + 8, V.z - 10, 6, 7, V.h, 'z+');
  buildHouse(w, V.x + 18, V.z - 10, 7, 7, V.h, 'z+');
  buildHouse(w, V.x + 8, V.z + 4, 7, 6, V.h, 'z-');
  buildHouse(w, V.x + 19, V.z + 4, 6, 6, V.h, 'z-');
  const S = OVER.shop;
  buildHouse(w, S.x0, S.z0, S.sx, S.sz, V.h, 'x-');
  for (let i = -3; i <= 3; i++) w.set(Math.floor(OVER.dummy.x) - 3, V.h, Math.floor(OVER.dummy.z) + i, i % 3 === 0 ? B.LOG : B.AIR);

  for (const id in DOORS) carveDoor(w, DOORS[id]);

  // trees: thick in the woods, a few on the plains, palms on island beaches, cacti (or ice spikes, or magma) in the desert
  const trees = [];
  const free = (x, z, r) => !trees.some(t => Math.abs(t[0] - x) < r && Math.abs(t[1] - z) < r);
  const nearPath = (x, z) => { for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) if (pathCells.has((x + ox) + ',' + (z + oz))) return true; return false; };
  const nearDoor = (x, z) => Object.values(DOORS).some(d => Math.hypot(x - d.x, z - d.z) < 10 || (d.mound && Math.hypot(x - d.mound.x, z - d.mound.z) < d.mound.r + 2));
  const inVillage = (x, z) => x > vx0 - 4 && x < vx1 + 4 && Math.abs(z - V.z) < vzr + 4;
  for (let tries = 0; tries < 16000; tries++) {
    const x = 6 + Math.floor(rng() * (w.W - 12)), z = 6 + Math.floor(rng() * (w.D - 12));
    const bi = biome[z * w.W + x], h = heights[z * w.W + x];
    if (inVillage(x, z) || Math.hypot(x - M.x, z - M.z) < M.r - 4 || nearDoor(x, z) || nearPath(x, z)) continue;
    if (bi === 1 || (bi === 0 && rng() < 0.15)) {
      if (h <= OVER.water + 1 || w.get(x, h - 1, z) !== pal.grass || !free(x, z, bi === 1 ? 3.6 : 5)) continue;
      trees.push([x, z]);
      const th = (bi === 1 ? 5 : 4) + Math.floor(rng() * 3);
      for (let y = h; y < h + th; y++) w.set(x, y, z, B.LOG);
      if (!pal.leaves) {
        // burnt trees: bare branches with glowing tips
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1]]) { w.set(x + ox, h + th - 2, z + oz, B.LOG); if (rng() < 0.5) w.set(x + ox * 2, h + th - 1, z + oz * 2, B.MAGMA); }
        continue;
      }
      const pine = pal.leaves === B.PINE;
      for (let y = h + th - (pine ? 4 : 2); y <= h + th + 1; y++) {
        const r = pine ? Math.max(0, Math.min(2, Math.floor((h + th + 1 - y) / 1.5))) : (y >= h + th ? 1 : 2);
        for (let ox = -r; ox <= r; ox++) for (let oz = -r; oz <= r; oz++) {
          if (Math.abs(ox) === r && Math.abs(oz) === r && r > 0 && (y === h + th + 1 || rng() < 0.5)) continue;
          if (w.get(x + ox, y, z + oz) === B.AIR) w.set(x + ox, y, z + oz, pal.leaves);
        }
      }
    } else if (bi === 2 && rng() < 0.12 && free(x, z, 6)) {
      trees.push([x, z]);
      const ch = 2 + Math.floor(rng() * 3);
      for (let y = h; y < h + ch; y++) w.set(x, y, z, pal.cactus);
    } else if (pal.palms && bi === 3 && h > OVER.water && h <= OVER.water + 2 && rng() < 0.3 && free(x, z, 7)) {
      trees.push([x, z]);
      const th = 5 + Math.floor(rng() * 2);
      for (let y = h; y < h + th; y++) w.set(x + (y - h > 3 ? 1 : 0), y, z, B.LOG);
      const tx = x + 1, ty = h + th;
      w.set(tx, ty, z, B.LEAVES);
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) w.set(tx + ox, ty - (Math.abs(ox) + Math.abs(oz) > 1 ? 1 : 0), z + oz, B.LEAVES);
    }
  }
  w.heights = heights;
  w.biome = biome;
  return w;
}

function carveDoor(w, d) {
  const [dx, dz] = d.dir, px = -dz, pz = dx; // px/pz: sideways
  const half = (d.w - 1) / 2;
  for (let i = -3; i <= d.len; i++) for (let s = -half - 1; s <= half + 1; s++) {
    const x = d.x + dx * i + px * s, z = d.z + dz * i + pz * s;
    const wall = Math.abs(s) > half;
    for (let y = d.floor - 1; y <= d.floor + d.h; y++) {
      const top = y === d.floor + d.h, bottom = y === d.floor - 1;
      if (i < 0) { if (!wall && !bottom && !top) w.set(x, y, z, B.AIR); continue; }
      if (bottom) { w.set(x, y, z, d.wall === B.DIRT ? B.MUD : B.COBBLE); continue; }
      if (wall || top) { w.set(x, y, z, i === 0 ? d.frame : d.wall); continue; }
      w.set(x, y, z, i === d.len ? B.BEDROCK : B.AIR);
    }
  }
  d.trigger = { x: d.x + dx * (d.len - 1.5) + 0.5, z: d.z + dz * (d.len - 1.5) + 0.5 };
  d.portal = { x: d.x + dx * (d.len - 0.05) + 0.5 - dx * 0.5, z: d.z + dz * (d.len - 0.05) + 0.5 - dz * 0.5 };
  d.outside = { x: d.x - dx * 4 + 0.5, z: d.z - dz * 4 + 0.5 };
}

function buildHouse(w, x0, z0, sx, sz, floor, door = 'z+') {
  for (let x = x0; x < x0 + sx; x++) for (let z = z0; z < z0 + sz; z++) {
    w.set(x, floor - 1, z, B.PLANKS);
    for (let y = floor; y < floor + 3; y++) {
      const edgeX = x === x0 || x === x0 + sx - 1, edgeZ = z === z0 || z === z0 + sz - 1;
      if (!edgeX && !edgeZ) { w.set(x, y, z, B.AIR); continue; }
      let b = (edgeX && edgeZ) ? B.LOG : B.PLANKS;
      if (y === floor + 1 && !(edgeX && edgeZ) && ((edgeX && (z - z0) % 3 === 1) || (edgeZ && (x - x0) % 3 === 1))) b = B.WINDOW;
      w.set(x, y, z, b);
    }
  }
  const mx = x0 + Math.floor(sx / 2), mz = z0 + Math.floor(sz / 2);
  const [dx, dz] = door === 'z+' ? [mx, z0 + sz - 1] : door === 'z-' ? [mx, z0] : door === 'x-' ? [x0, mz] : [x0 + sx - 1, mz];
  w.set(dx, floor, dz, B.AIR); w.set(dx, floor + 1, dz, B.AIR);
  for (let layer = 0; ; layer++) {
    const za = z0 - 1 + layer, zb = z0 + sz - layer, y = floor + 3 + layer;
    if (za > zb) break;
    for (let x = x0 - 1; x <= x0 + sx; x++) {
      if (zb - za <= 1) { for (let z = za; z <= zb; z++) w.set(x, y, z, B.ROOF); continue; }
      w.set(x, y, za, B.ROOF); w.set(x, y, zb, B.ROOF);
    }
    if (zb - za > 1) for (let z = za + 1; z < zb; z++) { w.set(x0, y, z, B.PLANKS); w.set(x0 + sx - 1, y, z, B.PLANKS); }
  }
}

// ---------- boss caves (all share one layout: a tunnel, then a big round room) ----------
const CAVE = {
  W: 72, H: 40, D: 112, floor: 5,
  start: { x: 36.5, z: 6.5 },
  exitZ: 2.6,
  room: { x: 36, z: 76, r: 23 },
  roomDoorZ: 52,
  pedestal: { x: 36.5, z: 80.5 },
  bossSpot: { x: 36.5, z: 89.5 },
  chest: { x: 36.5, z: 72.5 },
  scroll: { x: 40.5, z: 72.5 },
  barrierZ: [49, 50],
};

const CAVE_STYLES = {
  rabbit: {
    walls: [[B.MUD, 5], [B.DIRT, 4], [B.ROOTS, 2]], floor: [[B.DIRT, 6], [B.MUD, 2], [B.MOSS, 1]],
    glow: [B.GLOWSHROOM, B.GLOWSHROOM], light: [[0.25, 0.5, 0.65], [0.35, 0.55, 0.4]], ambient: [0.3, 0.24, 0.18],
    vines: true, barrier: B.ROOTS, sky: 0x140c06, fog: [0x140c06, 14, 60],
  },
  sand: {
    walls: [[B.SANDSTONE, 8], [B.SAND, 2]], floor: [[B.SAND, 1]],
    glow: [B.LANTERN, B.GOLD], light: [[0.75, 0.5, 0.2], [0.6, 0.5, 0.2]], ambient: [0.32, 0.26, 0.18],
    barrier: B.SANDSTONE, sky: 0x1a1206, fog: [0x1a1206, 14, 60],
  },
  coral: {
    walls: [[B.CORAL_PINK, 3], [B.CORAL_ORANGE, 2], [B.CORAL_BLUE, 3], [B.SAND, 1]], floor: [[B.SAND, 5], [B.CORAL_BLUE, 1]],
    glow: [B.SEA_LANTERN, B.SEA_LANTERN], light: [[0.35, 0.65, 0.75], [0.5, 0.45, 0.7]], ambient: [0.2, 0.28, 0.4],
    pools: true, throne: true, barrier: B.CORAL_PINK, sky: 0x06142a, fog: [0x06142a, 14, 60],
  },
  crystal: {
    walls: [[B.CAVE, 30], [B.ORE, 1]], floor: [[B.CAVE, 3], [B.MOSS, 1]],
    glow: [B.CRYSTAL, B.AMETHYST], light: [[0.25, 0.75, 0.72], [0.55, 0.3, 0.8]], ambient: [0.2, 0.18, 0.3],
    spires: true, sunHole: true, barrier: B.AMETHYST, sky: 0x0b0816, fog: [0x0b0816, 14, 60],
  },
};

function generateBossCave(id) {
  const st = Object.assign({}, CAVE_STYLES[id], (CAVE_PLANET_STYLES[OVER.pid] || {})[id] || {});
  const w = new World(id, CAVE.W, CAVE.H, CAVE.D);
  w.ambient = st.ambient;
  w.style = st;
  w.vines = [];
  const rng = makeRng(id.length * 977 + 13);
  const noise = valueNoise2D(id.charCodeAt(0) * 7);
  const pickW = list => weightedPick(list.map(([b, n]) => [b, n]));
  for (let i = 0; i < w.blocks.length; i++) w.blocks[i] = pickW(st.walls);
  for (let z = 0; z < w.D; z++) for (let x = 0; x < w.W; x++) w.set(x, 0, z, B.BEDROCK);
  const F = CAVE.floor;
  const carve = (cx, cy, cz, rx, ry, rz) => {
    for (let y = Math.max(F, Math.floor(cy - ry)); y <= cy + ry; y++)
      for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2;
          if (d < 1 && x > 1 && z > 0 && x < w.W - 2 && z < w.D - 2 && y < w.H - 2) w.set(x, y, z, B.AIR);
        }
  };
  const tunnelX = z => CAVE.start.x + Math.sin(z / 9) * 5 * Math.min(1, z / 12) * Math.max(0, Math.min(1, (CAVE.roomDoorZ - z) / 10));
  for (let z = 1; z < CAVE.roomDoorZ + 4; z += 0.5) carve(tunnelX(z), F + 2.5, z, 3.4, 3.6, 2);
  const R = CAVE.room;
  for (let y = F; y < F + 17; y++) for (let z = R.z - R.r - 4; z <= R.z + R.r + 4; z++) for (let x = R.x - R.r - 4; x <= R.x + R.r + 4; x++) {
    const ang = Math.atan2(z - R.z, x - R.x);
    const wall = R.r + (noise(Math.cos(ang) * 3 + 10, Math.sin(ang) * 3 + y / 6) - 0.5) * 6;
    const hfrac = (y - F) / 16;
    const rr = wall * Math.sqrt(Math.max(0, 1 - hfrac * hfrac));
    if (Math.hypot(x + 0.5 - R.x, z + 0.5 - R.z) < Math.max(hfrac < 0.4 ? R.r - 2 : 0, rr)) w.set(x, y, z, B.AIR);
  }
  // floor
  for (let z = 0; z < w.D; z++) for (let x = 0; x < w.W; x++) {
    if (w.get(x, F, z) !== B.AIR) continue;
    w.set(x, F - 1, z, pickW(st.floor));
    if (st.pools && Math.hypot(x - R.x, z - R.z) < R.r - 3 && Math.hypot(x - R.x, z - R.z) > 9 && noise(x / 4 + 30, z / 4) > 0.68) w.set(x, F - 1, z, B.WATER);
  }
  // glowing clusters along the tunnel and around the room, each one a light
  const addCluster = (x, y, z, k) => {
    const kind = st.glow[k], col = st.light[k];
    w.lights.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, r: col[0], g: col[1], b: col[2], radius: 9 });
    w.set(x, y, z, kind);
    for (let i = 0; i < 4; i++) {
      const ox = Math.floor(rng() * 3) - 1, oy = Math.floor(rng() * 3) - 1, oz = Math.floor(rng() * 3) - 1;
      if (w.get(x + ox, y + oy, z + oz) !== B.AIR) w.set(x + ox, y + oy, z + oz, kind);
    }
  };
  for (let z = 6; z < CAVE.roomDoorZ; z += 5) {
    const side = (z / 5) % 2 < 1 ? -1 : 1;
    const cx = Math.round(tunnelX(z) + side * 3.6);
    for (let x = cx; Math.abs(x - cx) < 4; x += side) if (w.get(x, F + 2, z) !== B.AIR) { addCluster(x, F + 2 + (z % 3), z, z % 10 < 5 ? 0 : 1); break; }
  }
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2 + rng() * 0.2;
    const yy = F + 1 + Math.floor(rng() * 9);
    for (let rr = R.r - 6; rr < R.r + 6; rr++) {
      const x = Math.round(R.x + Math.cos(ang) * rr), z = Math.round(R.z + Math.sin(ang) * rr);
      if (w.get(x, yy, z) !== B.AIR) { if (z > CAVE.roomDoorZ + 2 || Math.abs(x - R.x) > 6) addCluster(x, yy, z, i % 2); break; }
    }
  }
  if (st.spires) {
    for (let i = 0; i < 9; i++) {
      const ang = rng() * Math.PI * 2;
      const x = Math.round(R.x + Math.cos(ang) * (R.r - 3)), z = Math.round(R.z + Math.sin(ang) * (R.r - 3));
      if (z < CAVE.roomDoorZ + 6 && Math.abs(x - R.x) < 8) continue;
      const kind = i % 2 ? B.CRYSTAL : B.AMETHYST, h = 3 + Math.floor(rng() * 5);
      for (let y = F; y < F + h; y++) { w.set(x, y, z, kind); if (y < F + h / 2) { w.set(x + 1, y, z, kind); w.set(x, y, z + 1, kind); } }
      w.lights.push({ x: x + 0.5, y: F + h / 2, z: z + 0.5, r: 0.35, g: 0.5, b: 0.8, radius: 11 });
    }
  }
  // the sky hole: a shaft straight up through the roof
  if (st.sunHole) {
    for (let y = F + 8; y < w.H; y++) for (let z = R.z - 6; z <= R.z + 6; z++) for (let x = R.x - 6; x <= R.x + 6; x++)
      if (Math.hypot(x + 0.5 - R.x, z + 0.5 - R.z) < 4.6 + (y > F + 20 ? 0.6 : 0)) w.set(x, y, z, B.AIR);
    w.lights.push({ x: R.x, y: F + 6, z: R.z, r: 0.95, g: 0.85, b: 0.6, radius: 16 });
  }
  // the pedestal for the egg
  const P = CAVE.pedestal;
  for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) {
    const d = Math.hypot(x, z);
    if (d > 2.3) continue;
    const bx = Math.floor(P.x) + x, bz = Math.floor(P.z) + z;
    w.set(bx, F, bz, st.throne ? B.GOLD : (id === 'rabbit' ? B.HAY : id === 'sand' ? B.SANDSTONE : B.COBBLE));
  }
  w.lights.push({ x: P.x, y: F + 2, z: P.z, r: 0.45, g: 0.4, b: 0.45, radius: 9 });
  // King Squid's golden throne
  if (st.throne) {
    const tx = Math.floor(CAVE.bossSpot.x), tz = Math.floor(CAVE.bossSpot.z);
    for (let x = tx - 3; x <= tx + 3; x++) for (let z = tz - 2; z <= tz + 3; z++) {
      w.set(x, F, z, B.GOLD); w.set(x, F + 1, z, B.GOLD);
      if (z >= tz + 2) for (let y = F + 2; y < F + 8 + (Math.abs(x - tx) < 2 ? 2 : 0); y++) w.set(x, y, z, B.GOLD);
      if (Math.abs(x - tx) === 3 && z < tz + 2) { w.set(x, F + 2, z, B.GOLD); w.set(x, F + 3, z, B.GOLD); }
    }
    w.lights.push({ x: tx + 0.5, y: F + 4, z: tz - 1, r: 0.7, g: 0.6, b: 0.25, radius: 12 });
  }
  // vines hanging from the roof (drawn as models, you can walk through them)
  if (st.vines !== false && st.vines) {
    for (let z = 3; z < w.D - 3; z += 1) for (let x = 3; x < w.W - 3; x += 1) {
      if (rng() > (z < CAVE.roomDoorZ ? 0.22 : 0.05)) continue;
      let y = F + 1; while (y < w.H - 2 && w.get(x, y, z) === B.AIR) y++;
      if (y >= w.H - 2 || y < F + 3) continue;
      const len = Math.min(y - F - 2.2, 1.5 + rng() * 4);
      if (len > 0.8) w.vines.push({ x: x + 0.5 + (rng() - 0.5) * 0.6, top: y, z: z + 0.5 + (rng() - 0.5) * 0.6, len });
    }
  }
  w.lights.push({ x: CAVE.start.x, y: F + 2, z: 3, r: 0.4, g: 0.35, b: 0.3, radius: 8 });
  for (let x = -1; x <= 1; x++) for (let y = 0; y < 4; y++) w.set(Math.floor(CAVE.start.x) + x, F + y, 0, B.BEDROCK);
  return w;
}

// the other planets' caves use their own blocks and lights
const CAVE_PLANET_STYLES = {
  frost: {
    rabbit: { walls: [[B.ICE, 4], [B.STONE, 3], [B.SNOW, 2]], floor: [[B.SNOW, 4], [B.ICE, 1]], glow: [B.SEA_LANTERN, B.CRYSTAL], light: [[0.35, 0.6, 0.8], [0.25, 0.7, 0.75]], ambient: [0.26, 0.3, 0.38], barrier: B.ICE, sky: 0x0c1824, fog: [0x0c1824, 14, 60] },
    sand: { walls: [[B.ICE, 6], [B.SNOW, 2]], floor: [[B.SNOW, 1]], glow: [B.SEA_LANTERN, B.SEA_LANTERN], light: [[0.4, 0.6, 0.8], [0.4, 0.55, 0.8]], ambient: [0.3, 0.34, 0.42], barrier: B.ICE, sky: 0x0c1824, fog: [0x0c1824, 14, 60] },
    coral: { walls: [[B.CORAL_BLUE, 4], [B.ICE, 3], [B.CORAL_PINK, 1]], floor: [[B.SNOW, 4], [B.ICE, 1]], barrier: B.ICE },
    crystal: { walls: [[B.ICE, 10], [B.STONE, 10], [B.ORE, 1]], floor: [[B.SNOW, 2], [B.ICE, 1]], glow: [B.CRYSTAL, B.SEA_LANTERN], light: [[0.3, 0.7, 0.8], [0.4, 0.55, 0.8]], ambient: [0.22, 0.26, 0.34], barrier: B.ICE },
  },
  lava: {
    rabbit: { walls: [[B.BASALT, 5], [B.ASH, 3], [B.MAGMA, 1]], floor: [[B.ASH, 3], [B.BASALT, 2]], glow: [B.MAGMA, B.LANTERN], light: [[0.8, 0.35, 0.15], [0.75, 0.5, 0.2]], ambient: [0.3, 0.18, 0.14], vines: false, barrier: B.BASALT, sky: 0x1a0806, fog: [0x1a0806, 14, 60] },
    sand: { walls: [[B.RED_SAND, 4], [B.SANDSTONE, 3], [B.BASALT, 2]], floor: [[B.RED_SAND, 1]], glow: [B.MAGMA, B.LANTERN], light: [[0.8, 0.35, 0.15], [0.75, 0.5, 0.2]], ambient: [0.32, 0.2, 0.14], barrier: B.BASALT, sky: 0x1a0806, fog: [0x1a0806, 14, 60] },
    coral: { walls: [[B.BASALT, 4], [B.CORAL_ORANGE, 3], [B.MAGMA, 1]], floor: [[B.BASALT, 3], [B.RED_SAND, 2]], glow: [B.MAGMA, B.SEA_LANTERN], light: [[0.8, 0.4, 0.2], [0.5, 0.45, 0.6]], ambient: [0.28, 0.2, 0.2], barrier: B.BASALT },
    crystal: { walls: [[B.BASALT, 20], [B.ORE, 1]], floor: [[B.BASALT, 3], [B.ASH, 1]], glow: [B.MAGMA, B.AMETHYST], light: [[0.85, 0.35, 0.15], [0.55, 0.3, 0.8]], ambient: [0.24, 0.16, 0.16], barrier: B.BASALT, sky: 0x140606, fog: [0x140606, 14, 60] },
  },
};

// ---------- the deep ocean: a tall column of water with a sandy floor ----------
const DEEP = { W: 64, H: 140, D: 64, top: 130, floorY: 6, cutsceneY: 30, diveSeconds: 30 };

function generateDeep() {
  const w = new World('deep', DEEP.W, DEEP.H, DEEP.D);
  w.skipWater = true;
  w.ambient = [0.28, 0.42, 0.6];
  const rng = makeRng(321);
  const noise = valueNoise2D(55);
  for (let z = 0; z < w.D; z++) for (let x = 0; x < w.W; x++) {
    const h = DEEP.floorY - 2 + Math.round(noise(x / 8, z / 8) * 4);
    for (let y = 0; y < w.H; y++) w.set(x, y, z, y === 0 ? B.BEDROCK : y < h ? (OVER.pid === 'frost' ? B.SNOW : OVER.pid === 'lava' ? B.BASALT : B.SAND) : B.WATER);
    if (rng() < 0.03) { const kh = 3 + Math.floor(rng() * 8); for (let y = h; y < h + kh; y++) w.set(x, y, z, B.KELP); }
    else if (rng() < 0.02) { const c = [B.CORAL_PINK, B.CORAL_ORANGE, B.CORAL_BLUE][Math.floor(rng() * 3)]; w.set(x, h, z, c); if (rng() < 0.5) w.set(x, h + 1, z, c); }
    else if (rng() < 0.004) { w.set(x, h, z, B.SEA_LANTERN); w.lights.push({ x: x + 0.5, y: h + 1, z: z + 0.5, r: 0.3, g: 0.5, b: 0.6, radius: 10 }); }
  }
  return w;
}
