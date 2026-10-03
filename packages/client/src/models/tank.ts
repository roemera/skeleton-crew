import * as THREE from 'three';
import { BARREL_LENGTH, HULL_HALF } from '@skeleton-crew/shared';
import { GUN_OFFSET, TURRET_OFFSET } from '../sim/tank';
import { tex } from '../render/textures';
import { wobble } from '../render/pipeline';

/** Metres of track covered by one copy of the track texture (4 tread links). */
export const TRACK_TEXTURE_LENGTH = 1.4;

export interface TankModel {
  root: THREE.Group; // hull frame: origin at hull centre, forward -z
  turret: THREE.Group; // rotates about y
  gun: THREE.Group; // pivot at the mantlet, rotates about x
  trackMaps: [THREE.Texture, THREE.Texture]; // left, right (scrolled by track speed)
}


const mat = (map: THREE.Texture) => wobble(new THREE.MeshLambertMaterial({ map, flatShading: true }));

export function buildTankModel(): TankModel {
  const root = new THREE.Group();
  const { x: hx, y: hy, z: hz } = HULL_HALF;

  const hullMat = mat(tex.hull());
  const hull = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 - 0.6, hy * 2, hz * 2), hullMat);
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 - 0.6, 0.25, 1.6), mat(tex.hazard()));
  glacis.position.set(0, hy - 0.1, -hz + 0.5);
  glacis.rotation.x = 0.45;
  root.add(hull, glacis);

  const trackMaps: THREE.Texture[] = [];
  for (const side of [-1, 1]) {
    const map = tex.track();
    trackMaps.push(map);
    const geo = new THREE.BoxGeometry(0.75, 1.1, hz * 2 + 0.3);
    // Texture v follows the track's length on every face, so the tread lines run across it.
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + pos.getY(i), pos.getZ(i) / TRACK_TEXTURE_LENGTH);
    const track = new THREE.Mesh(geo, mat(map));
    track.position.set(side * (hx - 0.3), -hy - 0.15, 0);
    root.add(track);
  }

  const turret = new THREE.Group();
  turret.position.copy(TURRET_OFFSET);
  const turretMat = mat(tex.turret());
  const turretBox = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.8), turretMat);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 6), mat(tex.hazard()));
  hatch.position.set(0.5, 0.55, 0.4);
  turret.add(turretBox, hatch);

  const gun = new THREE.Group();
  gun.position.copy(GUN_OFFSET);
  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.5), turretMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, BARREL_LENGTH, 6), mat(tex.hazard()));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -BARREL_LENGTH / 2;
  gun.add(mantlet, barrel);
  turret.add(gun);
  root.add(turret);

  return { root, turret, gun, trackMaps: trackMaps as [THREE.Texture, THREE.Texture] };
}
