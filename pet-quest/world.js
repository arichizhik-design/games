// Block worlds: the overworld and the Crystal Caves. Each is a grid of blocks turned into meshes.
'use strict';

const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, LOG: 5, LEAVES: 6, WATER: 7, CAVE: 8, CRYSTAL: 9,
  AMETHYST: 10, PLANKS: 11, COBBLE: 12, PATH: 13, HAY: 14, ORE: 15, BEDROCK: 16, ROOF: 17, MOSS: 18, WINDOW: 19,
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
};
const GLOWS = new Set([B.CRYSTAL, B.AMETHYST]);

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
        if (isWater) { if (nb !== B.AIR || f.dir[1] !== 1) continue; }
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

// ---------- the overworld ----------
const OVER = {
  W: 168, H: 52, D: 168,
  spawn: { x: 40.5, z: 46.5 },
  village: { x: 40, z: 40, r: 15, h: 16 },
  guide: { x: 36.5, z: 40.5 },
  dummy: { x: 47.5, z: 37.5 },
  mountain: { x: 132, z: 130, r: 32 },
  caveDoor: { x: 107, z: 130 },     // where the tunnel into the mountain starts
  caveTrigger: { x: 113.5, z: 130.5 }, // walking past here takes you into the caves
  caveFloor: 17,
  water: 13,
};

function generateOverworld() {
  const w = new World('overworld', OVER.W, OVER.H, OVER.D);
  const noise = valueNoise2D(77), noise2 = valueNoise2D(91);
  const rng = makeRng(4242);
  const heights = new Int16Array(w.W * w.D);
  const V = OVER.village, M = OVER.mountain;
  for (let z = 0; z < w.D; z++) for (let x = 0; x < w.W; x++) {
    let h = 15 + (noise(x / 38, z / 38) - 0.5) * 16 + (noise2(x / 12, z / 12) - 0.5) * 3;
    // flat village
    const dv = Math.hypot(x - V.x, z - V.z);
    if (dv < V.r + 10) { const t = Math.max(0, Math.min(1, (dv - V.r) / 10)); h = V.h * (1 - t) + h * t; }
    // the crystal mountain
    const dm = Math.hypot(x - M.x, z - M.z);
    if (dm < M.r) h += Math.pow(1 - dm / M.r, 1.15) * 26 + (noise2(x / 6, z / 6) - 0.5) * 4;
    // flat ground in front of the cave
    const dc = Math.hypot(x - (OVER.caveDoor.x - 4), z - OVER.caveDoor.z);
    if (dc < 12) { const t = Math.max(0, Math.min(1, (dc - 7) / 5)); h = OVER.caveFloor * (1 - t) + h * t; }
    // gentle edge so the map ends in hills
    const edge = Math.min(x, z, w.W - 1 - x, w.D - 1 - z);
    if (edge < 8) h += (8 - edge) * 1.6;
    heights[z * w.W + x] = Math.max(3, Math.min(w.H - 6, Math.round(h)));
  }
  for (let z = 0; z < w.D; z++) for (let x = 0; x < w.W; x++) {
    const h = heights[z * w.W + x];
    const dm = Math.hypot(x - M.x, z - M.z);
    const rocky = dm < M.r * 0.75 && h > 22;
    for (let y = 0; y < h; y++) {
      let b = B.STONE;
      if (y === 0) b = B.BEDROCK;
      else if (y >= h - 1) b = rocky ? (rng() < 0.08 ? B.ORE : B.STONE) : (h <= OVER.water + 1 ? B.SAND : B.GRASS);
      else if (y >= h - 4) b = rocky ? B.STONE : (h <= OVER.water + 1 ? B.SAND : B.DIRT);
      else if (rocky && rng() < 0.05) b = B.ORE;
      w.set(x, y, z, b);
    }
    for (let y = h; y < OVER.water; y++) w.set(x, y, z, B.WATER);
    if (h > 34 && dm < 10 && rng() < 0.18) w.set(x, h, z, rng() < 0.5 ? B.CRYSTAL : B.AMETHYST);
  }

  // gravel path from the village to the cave, with plank bridges over water
  const pathPts = [[V.x + 2, V.z + 8], [70, 70], [86, 104], [OVER.caveDoor.x - 6, OVER.caveDoor.z]];
  const pathCells = new Set();
  for (let i = 0; i < pathPts.length - 1; i++) {
    const [ax, az] = pathPts[i], [bx, bz] = pathPts[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const px = ax + (bx - ax) * t + Math.sin(t * 7 + i) * 2.5, pz = az + (bz - az) * t;
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) pathCells.add(Math.round(px + ox) + ',' + Math.round(pz + oz));
    }
  }
  for (const key of pathCells) {
    const [x, z] = key.split(',').map(Number);
    if (!w.inside(x, 0, z)) continue;
    const h = heights[z * w.W + x];
    if (h <= OVER.water) {
      w.set(x, OVER.water - 1, z, B.PLANKS);
      if (h < OVER.water - 1) { w.set(x, OVER.water - 2, z, B.LOG); }
    } else w.set(x, h - 1, z, B.PATH);
  }
  // village square and houses
  for (let z = V.z - 4; z <= V.z + 4; z++) for (let x = V.x - 4; x <= V.x + 4; x++) w.set(x, V.h - 1, z, B.COBBLE);
  buildHouse(w, V.x - 12, V.z - 9, 7, 6, V.h);
  buildHouse(w, V.x + 6, V.z - 12, 6, 7, V.h);
  buildHouse(w, V.x - 11, V.z + 6, 6, 6, V.h);
  // well in the middle of the square
  for (let z = V.z - 1; z <= V.z + 1; z++) for (let x = V.x - 1; x <= V.x + 1; x++) {
    if (x === V.x && z === V.z) { w.set(x, V.h - 1, z, B.WATER); continue; }
    w.set(x, V.h, z, B.COBBLE);
  }
  // fence posts by the training dummy
  for (let i = -3; i <= 3; i++) { w.set(OVER.dummy.x - 3 | 0, V.h, (OVER.dummy.z | 0) + i, i % 3 === 0 ? B.LOG : B.AIR); }

  // the cave mouth: carve a tunnel into the mountain and frame it with crystals
  const cd = OVER.caveDoor, fl = OVER.caveFloor;
  for (let x = cd.x - 3; x <= cd.x + 12; x++) for (let z = cd.z - 2; z <= cd.z + 2; z++) {
    for (let y = fl; y < fl + 5; y++) w.set(x, y, z, B.AIR);
    w.set(x, fl - 1, z, B.COBBLE);
  }
  for (let x = cd.x - 1; x <= cd.x + 12; x++) {
    for (let y = fl - 1; y <= fl + 5; y++) {
      if (w.get(x, y, cd.z - 3) !== B.AIR || x < cd.x + 2) w.set(x, y, cd.z - 3, x === cd.x - 1 ? B.AMETHYST : B.CAVE);
      if (w.get(x, y, cd.z + 3) !== B.AIR || x < cd.x + 2) w.set(x, y, cd.z + 3, x === cd.x - 1 ? B.AMETHYST : B.CAVE);
    }
    for (let z = cd.z - 3; z <= cd.z + 3; z++) w.set(x, fl + 5, z, x === cd.x - 1 ? B.CRYSTAL : B.CAVE);
  }
  for (let y = fl; y < fl + 5; y++) for (let z = cd.z - 2; z <= cd.z + 2; z++) w.set(cd.x + 13, y, z, B.BEDROCK);

  // trees
  const trees = [];
  for (let tries = 0; tries < 2600 && trees.length < 150; tries++) {
    const x = 6 + Math.floor(rng() * (w.W - 12)), z = 6 + Math.floor(rng() * (w.D - 12));
    if (Math.hypot(x - V.x, z - V.z) < V.r + 3) continue;
    if (Math.hypot(x - M.x, z - M.z) < M.r - 4) continue;
    if (Math.hypot(x - cd.x, z - cd.z) < 12) continue;
    let nearPath = false;
    for (let ox = -2; ox <= 2 && !nearPath; ox++) for (let oz = -2; oz <= 2; oz++) if (pathCells.has((x + ox) + ',' + (z + oz))) { nearPath = true; break; }
    if (nearPath) continue;
    const h = heights[z * w.W + x];
    if (h <= OVER.water + 1 || w.get(x, h - 1, z) !== B.GRASS) continue;
    if (trees.some(t => Math.abs(t[0] - x) < 4 && Math.abs(t[1] - z) < 4)) continue;
    trees.push([x, z]);
    const th = 4 + Math.floor(rng() * 3);
    for (let y = h; y < h + th; y++) w.set(x, y, z, B.LOG);
    for (let y = h + th - 2; y <= h + th + 1; y++) {
      const r = y >= h + th ? 1 : 2;
      for (let ox = -r; ox <= r; ox++) for (let oz = -r; oz <= r; oz++) {
        if (Math.abs(ox) === r && Math.abs(oz) === r && (y === h + th + 1 || rng() < 0.5)) continue;
        if (w.get(x + ox, y, z + oz) === B.AIR) w.set(x + ox, y, z + oz, B.LEAVES);
      }
    }
  }
  w.heights = heights;
  return w;
}

function buildHouse(w, x0, z0, sx, sz, floor) {
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
  // door on the +z side
  const dx = x0 + Math.floor(sx / 2);
  w.set(dx, floor, z0 + sz - 1, B.AIR); w.set(dx, floor + 1, z0 + sz - 1, B.AIR);
  // stepped roof: each layer steps in one block from both long sides, gable walls close the ends
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

// ---------- the Crystal Caves ----------
const CAVE = {
  W: 72, H: 36, D: 112,
  floor: 5,
  start: { x: 36.5, z: 6.5 },
  exitZ: 2.6,
  room: { x: 36, z: 76, r: 23 },
  roomDoorZ: 52,       // tunnel meets the room around here
  nest: { x: 36.5, z: 82.5 },
  golem: { x: 36.5, z: 90.5 },
  chest: { x: 36.5, z: 75.5 },
  barrierZ: [49, 50],
};

function generateCave() {
  const w = new World('cave', CAVE.W, CAVE.H, CAVE.D);
  w.ambient = [0.2, 0.18, 0.3];
  const rng = makeRng(999);
  const noise = valueNoise2D(5);
  w.blocks.fill(B.CAVE);
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
  // winding tunnel
  const tunnelX = z => CAVE.start.x + Math.sin(z / 9) * 5 * Math.min(1, z / 12) * Math.max(0, Math.min(1, (CAVE.roomDoorZ - z) / 10));
  for (let z = 1; z < CAVE.roomDoorZ + 4; z += 0.5) carve(tunnelX(z), F + 2.5, z, 3.4, 3.6, 2);
  // the big room: a dome with bumpy walls
  const R = CAVE.room;
  for (let y = F; y < F + 17; y++) for (let z = R.z - R.r - 4; z <= R.z + R.r + 4; z++) for (let x = R.x - R.r - 4; x <= R.x + R.r + 4; x++) {
    const ang = Math.atan2(z - R.z, x - R.x);
    const wall = R.r + (noise(Math.cos(ang) * 3 + 10, Math.sin(ang) * 3 + y / 6) - 0.5) * 6;
    const hfrac = (y - F) / 16;
    const rr = wall * Math.sqrt(Math.max(0, 1 - hfrac * hfrac));
    if (Math.hypot(x + 0.5 - R.x, z + 0.5 - R.z) < Math.max(hfrac < 0.4 ? R.r - 2 : 0, rr)) w.set(x, y, z, B.AIR);
  }
  // moss on the room floor, ore in the walls
  for (let z = 0; z < w.D; z++) for (let x = 0; x < w.W; x++) {
    if (w.get(x, F, z) === B.AIR && Math.hypot(x - R.x, z - R.z) < R.r && noise(x / 5, z / 5) > 0.55) w.set(x, F - 1, z, B.MOSS);
  }
  for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === B.CAVE && rng() < 0.03) w.blocks[i] = B.ORE;

  // crystal clusters on walls and ceiling, each one is a light
  const addCluster = (x, y, z, kind) => {
    const col = kind === B.CRYSTAL ? [0.25, 0.75, 0.72] : [0.55, 0.3, 0.8];
    w.lights.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, r: col[0], g: col[1], b: col[2], radius: 9 });
    w.set(x, y, z, kind);
    for (let k = 0; k < 4; k++) {
      const ox = Math.floor(rng() * 3) - 1, oy = Math.floor(rng() * 3) - 1, oz = Math.floor(rng() * 3) - 1;
      if (w.get(x + ox, y + oy, z + oz) !== B.AIR) w.set(x + ox, y + oy, z + oz, kind);
    }
  };
  // along the tunnel
  for (let z = 6; z < CAVE.roomDoorZ; z += 5) {
    const side = (z / 5) % 2 < 1 ? -1 : 1;
    const cx = Math.round(tunnelX(z) + side * 3.6);
    for (let x = cx; Math.abs(x - cx) < 4; x += side) if (w.get(x, F + 2, z) !== B.AIR) { addCluster(x, F + 2 + (z % 3), z, z % 10 < 5 ? B.CRYSTAL : B.AMETHYST); break; }
  }
  // around the room
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2 + rng() * 0.2;
    const yy = F + 1 + Math.floor(rng() * 9);
    for (let rr = R.r - 6; rr < R.r + 6; rr++) {
      const x = Math.round(R.x + Math.cos(ang) * rr), z = Math.round(R.z + Math.sin(ang) * rr);
      if (w.get(x, yy, z) !== B.AIR) { if (z > CAVE.roomDoorZ + 2 || Math.abs(x - R.x) > 6) addCluster(x, yy, z, i % 2 ? B.CRYSTAL : B.AMETHYST); break; }
    }
  }
  // crystal spires from the floor near the walls
  for (let i = 0; i < 9; i++) {
    const ang = rng() * Math.PI * 2;
    const x = Math.round(R.x + Math.cos(ang) * (R.r - 3)), z = Math.round(R.z + Math.sin(ang) * (R.r - 3));
    if (z < CAVE.roomDoorZ + 6 && Math.abs(x - R.x) < 8) continue;
    const kind = i % 2 ? B.CRYSTAL : B.AMETHYST, h = 3 + Math.floor(rng() * 5);
    for (let y = F; y < F + h; y++) { w.set(x, y, z, kind); if (y < F + h / 2) { w.set(x + 1, y, z, kind); w.set(x, y, z + 1, kind); } }
    w.lights.push({ x: x + 0.5, y: F + h / 2, z: z + 0.5, r: 0.35, g: 0.5, b: 0.8, radius: 11 });
  }
  // stalactites from the ceiling
  for (let i = 0; i < 14; i++) {
    const x = Math.round(R.x + (rng() - 0.5) * R.r * 1.4), z = Math.round(R.z + (rng() - 0.5) * R.r * 1.4);
    let y = F + 16; while (y > F && w.get(x, y, z) !== B.AIR) y--;
    if (y <= F + 8) continue;
    const kind = i % 2 ? B.CRYSTAL : B.AMETHYST;
    for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) w.set(x, y - k, z, kind);
    w.lights.push({ x: x + 0.5, y: y - 1, z: z + 0.5, r: 0.3, g: 0.35, b: 0.6, radius: 10 });
  }
  // the nest: a raised ring with hay in the middle
  const N = CAVE.nest;
  for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) {
    const d = Math.hypot(x, z);
    if (d > 3.3) continue;
    const bx = Math.floor(N.x) + x, bz = Math.floor(N.z) + z;
    w.set(bx, F, bz, d < 1.6 ? B.HAY : B.COBBLE);
    if (d >= 2.4) w.set(bx, F + 1, bz, B.COBBLE);
  }
  w.lights.push({ x: N.x, y: F + 2, z: N.z, r: 0.45, g: 0.4, b: 0.6, radius: 10 });
  // a soft glow at the entrance
  w.lights.push({ x: CAVE.start.x, y: F + 2, z: 3, r: 0.4, g: 0.35, b: 0.3, radius: 8 });
  // the way out
  for (let x = -1; x <= 1; x++) for (let y = 0; y < 4; y++) w.set(Math.floor(CAVE.start.x) + x, F + y, 0, B.BEDROCK);
  return w;
}
