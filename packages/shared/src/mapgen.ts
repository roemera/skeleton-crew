import { MAP_CELLS, MAP_SIZE } from './constants.ts';
import { makeNoise2, makeRng } from './rng.ts';

export type MapObjectKind = 'rock' | 'building' | 'silo' | 'tree' | 'fence' | 'wall';

export interface MapObject {
  id: number; // fixed, from generation order; used by `break` messages
  kind: MapObjectKind;
  x: number;
  y: number; // ground height at the object's base
  z: number;
  rotY: number;
  size: [number, number, number]; // full extents (w, h, d)
  destructible: boolean;
}

export interface Spawn {
  x: number;
  z: number;
  rotY: number;
}

export interface GameMap {
  seed: number;
  size: number; // m per side
  cells: number; // grid cells per side; heights has (cells+1)^2 entries
  heights: Float32Array; // row-major: heights[iz * (cells+1) + ix]
  objects: MapObject[];
  spawns: Spawn[];
  heightAt(x: number, z: number): number;
}

const FARM = { x: 120, z: -120, r: 70 };
const RIDGE = { ax: -330, az: 140, bx: 260, bz: 300, width: 28, height: 24 };

export function generateMap(seed: number): GameMap {
  const rng = makeRng(seed);
  const noise = makeNoise2(seed);
  const n = MAP_CELLS + 1;
  const step = MAP_SIZE / MAP_CELLS;
  const half = MAP_SIZE / 2;
  const heights = new Float32Array(n * n);

  const rawHeight = (x: number, z: number) => {
    let h = 26 * noise(x / 260 + 10, z / 260 + 10, 4) - 13;
    // Rock ridge: a raised band along a segment.
    const d = distToSegment(x, z, RIDGE.ax, RIDGE.az, RIDGE.bx, RIDGE.bz);
    h += RIDGE.height * Math.exp(-((d / RIDGE.width) ** 2)) * (0.6 + 0.8 * noise(x / 40, z / 40, 2));
    // Raise the rim so the map reads as a bowl.
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge > half - 60) h += ((edge - (half - 60)) / 60) ** 2 * 35;
    return h;
  };

  // Farm sits on flat ground: blend toward the height at its centre.
  const farmH = rawHeight(FARM.x, FARM.z);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = -half + ix * step, z = -half + iz * step;
      let h = rawHeight(x, z);
      const fd = Math.hypot(x - FARM.x, z - FARM.z);
      const t = clamp01((fd - FARM.r) / 40);
      h = farmH + (h - farmH) * t * t * (3 - 2 * t);
      heights[iz * n + ix] = h;
    }
  }

  const heightAt = (x: number, z: number) => {
    const fx = clamp((x + half) / step, 0, MAP_CELLS - 1e-6);
    const fz = clamp((z + half) / step, 0, MAP_CELLS - 1e-6);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const h00 = heights[iz * n + ix], h10 = heights[iz * n + ix + 1];
    const h01 = heights[(iz + 1) * n + ix], h11 = heights[(iz + 1) * n + ix + 1];
    return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
  };

  const objects: MapObject[] = [];
  const add = (kind: MapObjectKind, x: number, z: number, rotY: number, size: [number, number, number], destructible: boolean) => {
    objects.push({ id: objects.length, kind, x, y: heightAt(x, z), z, rotY, size, destructible });
  };
  const inFarm = (x: number, z: number, pad = 0) => Math.hypot(x - FARM.x, z - FARM.z) < FARM.r + pad;
  const inBounds = (x: number, z: number, pad: number) => Math.abs(x) < half - pad && Math.abs(z) < half - pad;

  // Farm buildings.
  const farmRot = rng.range(-0.3, 0.3);
  const local = (lx: number, lz: number) => {
    const c = Math.cos(farmRot), s = Math.sin(farmRot);
    return [FARM.x + lx * c + lz * s, FARM.z - lx * s + lz * c] as const;
  };
  const farmBuildings: Array<[number, number, number, number, number]> = [
    [-18, -10, 16, 9, 11], // barn
    [14, -14, 10, 6, 8], // house
    [12, 16, 8, 4, 6], // shed
    [-20, 18, 12, 5, 7], // workshop
  ];
  for (const [lx, lz, w, h, d] of farmBuildings) {
    const [x, z] = local(lx, lz);
    add('building', x, z, farmRot, [w, h, d], false);
  }
  {
    const [x, z] = local(-2, -26);
    add('silo', x, z, 0, [6, 14, 6], false);
  }
  // Fence rectangle around the farm, with gaps for gates.
  const fw = 44, fd = 36, seg = 4;
  for (let i = -fw; i < fw; i += seg) {
    if (Math.abs(i + seg / 2) < 6) continue; // gate
    for (const side of [-fd, fd]) {
      const [x, z] = local(i + seg / 2, side);
      add('fence', x, z, farmRot, [seg, 1.2, 0.2], true);
    }
  }
  for (let i = -fd; i < fd; i += seg) {
    if (Math.abs(i + seg / 2) < 6) continue;
    for (const side of [-fw, fw]) {
      const [x, z] = local(side, i + seg / 2);
      add('fence', x, z, farmRot + Math.PI / 2, [seg, 1.2, 0.2], true);
    }
  }

  // Rocks: scattered, denser along the ridge.
  for (let i = 0; i < 70; i++) {
    let x: number, z: number;
    if (i < 30) {
      const t = rng.next();
      x = RIDGE.ax + (RIDGE.bx - RIDGE.ax) * t + rng.range(-30, 30);
      z = RIDGE.az + (RIDGE.bz - RIDGE.az) * t + rng.range(-30, 30);
    } else {
      x = rng.range(-half + 70, half - 70);
      z = rng.range(-half + 70, half - 70);
    }
    if (inFarm(x, z, 15)) continue;
    const s = rng.range(2, 7);
    add('rock', x, z, rng.range(0, Math.PI * 2), [s * rng.range(1, 1.8), s * rng.range(0.6, 1.2), s], false);
  }

  // Tree patches.
  for (let p = 0; p < 7; p++) {
    const cx = rng.range(-half + 100, half - 100), cz = rng.range(-half + 100, half - 100);
    if (inFarm(cx, cz, 50)) continue;
    const count = rng.int(12, 24);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2), r = 32 * Math.sqrt(rng.next());
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!inBounds(x, z, 60)) continue;
      const h = rng.range(6, 11);
      add('tree', x, z, rng.range(0, Math.PI * 2), [h * 0.35, h, h * 0.35], true);
    }
  }

  // Small walls: some near the farm, some in the open.
  for (let i = 0; i < 14; i++) {
    const near = i < 6;
    const a = rng.range(0, Math.PI * 2);
    const x = near ? FARM.x + Math.cos(a) * rng.range(55, 75) : rng.range(-half + 90, half - 90);
    const z = near ? FARM.z + Math.sin(a) * rng.range(55, 75) : rng.range(-half + 90, half - 90);
    add('wall', x, z, rng.range(0, Math.PI), [6, 2, 0.6], true);
  }

  // Spawns: 8 on an outer ring, 4 inside, all facing the centre.
  const spawns: Spawn[] = [];
  const ring = (count: number, radius: number, offset: number) => {
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      // Tank forward is -z; face the map centre.
      spawns.push({ x, z, rotY: Math.atan2(x, z) });
    }
  };
  ring(8, 360, 0.2);
  ring(4, 170, 0.9);
  // Keep spawns clear of objects.
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (spawns.some((s) => Math.hypot(s.x - o.x, s.z - o.z) < 14)) objects.splice(i, 1);
  }
  objects.forEach((o, i) => (o.id = i));

  return { seed, size: MAP_SIZE, cells: MAP_CELLS, heights, objects, spawns, heightAt };
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number) {
  return clamp(v, 0, 1);
}
function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
