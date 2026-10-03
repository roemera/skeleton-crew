import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { INTERP_DELAY, SEAT_CODES, type TankState } from '@skeleton-crew/shared';
import { TankSim } from './sim/tank';
import { buildTankModel, TRACK_TEXTURE_LENGTH, type TankModel } from './models/tank';
import type { Audio, Loop } from './audio';

// Other players' tanks: drawn INTERP_DELAY in the past, smoothed between the last two updates.

interface Snap {
  t: number; // local receive time, s
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  vel: THREE.Vector3;
  turretYaw: number;
  gunPitch: number;
  seat: number;
}

const MAX_EXTRAPOLATE = 0.25; // s: keep moving a tank whose updates stopped, but not for long
const HEAD = new THREE.MeshLambertMaterial({ color: 0xffd0b0 });

export interface Remote {
  id: number;
  sim: TankSim;
  model: TankModel;
  head: THREE.Mesh; // pokes out of the hatch when that player is lookout
  engine: Loop;
  snaps: Snap[];
}

export class Remotes {
  readonly byId = new Map<number, Remote>();

  constructor(private physics: RAPIER.World, private scene: THREE.Scene, private audio: Audio) {}

  receive(s: TankState, now: number) {
    let r = this.byId.get(s.id);
    if (!r) r = this.add(s);
    r.snaps.push({
      t: now,
      pos: new THREE.Vector3(...s.pos),
      quat: new THREE.Quaternion(...s.quat),
      vel: new THREE.Vector3(...s.vel),
      turretYaw: s.turretYaw,
      gunPitch: s.gunPitch,
      seat: s.seat,
    });
    if (r.snaps.length > 30) r.snaps.shift();
  }

  private add(s: TankState): Remote {
    const sim = new TankSim(this.physics, { x: s.pos[0], z: s.pos[2], rotY: 0 }, s.pos[1] - 2.2, true);
    const model = buildTankModel();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), HEAD);
    head.position.set(0.5, 0.75, 0.4);
    model.turret.add(head);
    this.scene.add(model.root);
    const engine = this.audio.loop('engine', new THREE.Vector3(...s.pos));
    const r: Remote = { id: s.id, sim, model, head, engine, snaps: [] };
    this.byId.set(s.id, r);
    return r;
  }

  remove(id: number) {
    const r = this.byId.get(id);
    if (!r) return;
    this.scene.remove(r.model.root);
    this.physics.removeRigidBody(r.sim.body);
    r.engine.stop();
    this.byId.delete(id);
  }

  clear() {
    for (const id of [...this.byId.keys()]) this.remove(id);
  }

  /** Find the remote tank a collider belongs to. */
  find(collider: RAPIER.Collider) {
    for (const r of this.byId.values()) {
      const role = r.sim.roleOf(collider);
      if (role) return { remote: r, role };
    }
    return null;
  }

  /** Pose every remote tank for render time `now - INTERP_DELAY`. Call once per frame, before physics. */
  update(now: number, dt: number) {
    const t = now - INTERP_DELAY;
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
    for (const r of this.byId.values()) {
      const s = r.snaps;
      if (s.length === 0) continue;
      while (s.length > 2 && s[1].t <= t) s.shift(); // keep the pair around t
      let yaw: number, pitch: number, seat: number, speed: number;
      if (s.length >= 2 && t >= s[0].t && t <= s[1].t) {
        const k = (t - s[0].t) / Math.max(1e-6, s[1].t - s[0].t);
        pos.lerpVectors(s[0].pos, s[1].pos, k);
        quat.slerpQuaternions(s[0].quat, s[1].quat, k);
        yaw = lerpAngle(s[0].turretYaw, s[1].turretYaw, k);
        pitch = s[0].gunPitch + (s[1].gunPitch - s[0].gunPitch) * k;
        seat = s[1].seat;
        speed = s[1].vel.length();
      } else {
        // Before the first update or past the newest: hold, or coast a little on its velocity.
        const last = t < s[0].t ? s[0] : s[s.length - 1];
        const ahead = Math.min(MAX_EXTRAPOLATE, Math.max(0, t - last.t));
        pos.copy(last.pos).addScaledVector(last.vel, ahead);
        quat.copy(last.quat);
        yaw = last.turretYaw;
        pitch = last.gunPitch;
        seat = last.seat;
        speed = last.vel.length();
      }
      r.sim.body.setNextKinematicTranslation(pos);
      r.sim.body.setNextKinematicRotation(quat);
      r.sim.setTurret(yaw, pitch);
      r.model.root.position.copy(pos);
      r.model.root.quaternion.copy(quat);
      r.model.turret.rotation.y = yaw;
      r.model.gun.rotation.x = pitch;
      r.head.visible = SEAT_CODES[seat] === 'lookout';
      // Cursed but cheap: both tracks scroll at hull speed.
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
      const v = s[s.length - 1].vel.dot(fwd);
      for (const m of r.model.trackMaps) m.offset.y += (v * dt) / TRACK_TEXTURE_LENGTH;
      r.engine.setPosition(pos);
      r.engine.setRate(0.6 + speed / 12);
    }
  }
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
