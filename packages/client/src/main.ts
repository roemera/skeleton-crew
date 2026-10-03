import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  PART_LABEL, PHYSICS_HZ, RENDER_HEIGHT, RENDER_WIDTH, SEAT_CODES, SEAT_CRAWLING, SHELL_SPEED, STATE_HZ,
  ZONE_LABEL, generateMap, hullZone, type HitZone, type Part, type Phase, type ServerMsg,
} from '@skeleton-crew/shared';
import { Pipeline } from './render/pipeline';
import { World } from './world';
import { buildTankModel, TRACK_TEXTURE_LENGTH } from './models/tank';
import { TankSim } from './sim/tank';
import { Seats, SEATS } from './seats/seats';
import { Input } from './input';
import { Hud, HUD_COLORS } from './ui/hud';
import { Gun } from './sim/gun';
import { Shells, type HitOutcome, type ShellHit } from './sim/shells';
import { LoaderStation } from './ui/loader';
import { Fx } from './fx';
import { Audio } from './audio';
import { Targets } from './targets';
import { Remotes } from './remotes';
import { Net } from './net';
import { Menu } from './ui/menu';

const params = new URLSearchParams(location.search);
// ?offline skips the menu (practice). ?join=host&name=X&password=Y joins a server directly.
// ?test hides the click-to-play panel (headless browsers cannot lock the pointer).
const TEST_MODE = params.has('test');
const STEP = 1 / PHYSICS_HZ;
const DEG = Math.PI / 180;

// View settings per seat (vertical fov in degrees).
const DRIVER_FOV = 50;
const DRIVER_LOOK = 20 * DEG;
const DRIVER_SLIT_SHIFT = 51; // px: screen centre (135) minus slit centre (84)
const GUNNER_FOV = { '2X': 18, '4X': 9 } as const;
const LOOKOUT_FOV = 60;
const BINOCULAR_FOV = 10;
const MOUSE_SENS = 0.0025; // rad per pixel at 60 deg fov
const RECOIL_IMPULSE = 9000; // N*s
const MESSAGE_TIME = 2.5; // s

type Welcome = Extract<ServerMsg, { t: 'welcome' }>;

async function start() {
  await RAPIER.init();
  const menu = new Menu();
  let error = '';
  for (;;) {
    const choice = params.has('offline')
      ? ({ mode: 'offline' } as const)
      : params.has('join')
        ? ({ mode: 'online', server: params.get('join')!, name: params.get('name') ?? 'TEST', password: params.get('password') ?? '' } as const)
        : await menu.join(error);
    if (choice.mode === 'offline') {
      menu.hide();
      return runGame(menu, Number(params.get('seed') ?? 1337), null, null);
    }
    try {
      const { net, welcome } = await Net.connect(choice.server, choice.name, choice.password);
      return runGame(menu, welcome.seed, net, welcome);
    } catch (e) {
      error = String(e).toUpperCase();
      if (params.has('join')) params.delete('join'); // fall back to the menu
    }
  }
}

function runGame(menu: Menu, seed: number, net: Net | null, welcome: Welcome | null) {
  const viewCanvas = document.getElementById('view') as HTMLCanvasElement;
  const hudCanvas = document.getElementById('hud') as HTMLCanvasElement;

  // Letterbox both canvases to 16:9; the browser scales them up with nearest-neighbour.
  let box = { left: 0, top: 0, width: 1, height: 1 };
  const layout = () => {
    const scale = Math.min(innerWidth / RENDER_WIDTH, innerHeight / RENDER_HEIGHT);
    const width = Math.floor(RENDER_WIDTH * scale), height = Math.floor(RENDER_HEIGHT * scale);
    box = { left: Math.floor((innerWidth - width) / 2), top: Math.floor((innerHeight - height) / 2), width, height };
    for (const c of [viewCanvas, hudCanvas]) {
      Object.assign(c.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${width}px`, height: `${height}px` });
    }
  };
  layout();
  addEventListener('resize', layout);

  const pipeline = new Pipeline(viewCanvas);
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.timestep = STEP;
  const map = generateMap(seed);
  const world = new World(map, physics);

  const spawn = map.spawns[welcome?.spawn ?? 0];
  const tank = new TankSim(physics, spawn, map.heightAt(spawn.x, spawn.z));
  const model = buildTankModel();
  world.scene.add(model.root);

  const seats = new Seats();
  const hud = new Hud(hudCanvas);
  const gun = new Gun();
  const loader = new LoaderStation();
  const fx = new Fx(world.scene);
  const audio = new Audio();
  const engine = audio.loop('engine');
  // Offline: practice targets. Online: other players.
  const targets = net ? null : new Targets(physics, world.scene, map, spawn, audio, fx);
  const remotes = net ? new Remotes(physics, world.scene, audio) : null;
  let phase: Phase = welcome?.phase ?? 'live';
  const playing = () => phase === 'live';

  let message: { text: string; color: string; until: number } | null = null;
  const say = (text: string, color: string) => (message = { text, color, until: time + MESSAGE_TIME });

  const shells = new Shells(physics, (_shell, hit) => onShellHit(hit));

  /** Decide what a shell hit does. Fences and trees break and let it through; everything else stops it. */
  function onShellHit(hit: ShellHit): HitOutcome {
    const broken = world.shellHit(hit.collider.handle, hit.dir);
    if (broken && broken.kind !== 'wall') return 'pass';
    const remote = remotes?.find(hit.collider) ?? null;
    const found = targets?.find(hit.collider) ?? null;
    if (!broken && hit.collider.isSensor() && !found && !remote) return 'pass'; // some other sensor
    fx.explosion(hit.point, found || remote ? 1.2 : 1);
    audio.play('explosion', { pos: hit.point });
    if (remote) audio.play('impact', { pos: hit.point }); // damage over the network comes in milestone 4
    if (found && targets) {
      audio.play('impact', { pos: hit.point });
      const { target, role } = found;
      if (target.deadFor > 0) return 'stop';
      let zone: HitZone;
      if (role === 'barrel') zone = 'barrel';
      else if (role === 'turret') zone = hit.normal.y > 0.7 ? 'top' : 'turret';
      else {
        // Surface normal in the target's hull frame.
        const r = target.sim.body.rotation();
        const local = hit.normal.clone().applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w).invert());
        zone = hullZone(local.x, local.y, local.z);
      }
      const res = target.sim.damage.applyHit(zone, Math.random());
      if (res.broke) target.sim.onPartBroken(res.broke);
      let text = `HIT ${ZONE_LABEL[res.zone]} -${res.damage}`;
      if (res.broke) text += ` ${PART_LABEL[res.broke]} BROKEN`;
      if (res.destroyed) {
        text = `TARGET DESTROYED (${ZONE_LABEL[res.zone]})`;
        targets.destroy(target);
      }
      say(text, res.destroyed ? HUD_COLORS.lime : HUD_COLORS.yellow);
      lastHit = { zone: res.zone, damage: res.damage, broke: res.broke, destroyed: res.destroyed };
    }
    return 'stop';
  }
  let lastHit: { zone: HitZone; damage: number; broke: Part | null; destroyed: boolean } | null = null;

  function fire() {
    if (tank.isBroken('gun')) {
      audio.play('dry');
      say('GUN BROKEN', HUD_COLORS.red);
      return;
    }
    if (!gun.fire()) {
      audio.play('dry');
      say(gun.shellInBreech ? 'BREECH OPEN - LOADER MUST CLOSE IT' : 'NOT LOADED', HUD_COLORS.red);
      return;
    }
    const pos = new THREE.Vector3(), dir = new THREE.Vector3();
    tank.muzzle(pos, dir);
    const v = tank.body.linvel();
    shells.spawn(pos, dir.clone().multiplyScalar(SHELL_SPEED).add(new THREE.Vector3(v.x, v.y, v.z)), tank.body);
    tank.recoil(dir, RECOIL_IMPULSE);
    fx.muzzleFlash(pos, dir);
    audio.play('cannon');
    setTimeout(() => audio.play('clank', { rate: 0.8 }), 350); // casing hits the floor
    shotsFired++;
  }
  let shotsFired = 0;
  const input = new Input(viewCanvas, (cx, cy) => [
    Math.floor(((cx - box.left) / box.width) * RENDER_WIDTH),
    Math.floor(((cy - box.top) / box.height) * RENDER_HEIGHT),
  ]);
  const camera = new THREE.PerspectiveCamera(DRIVER_FOV, RENDER_WIDTH / RENDER_HEIGHT, 0.1, 1200);

  // Per-seat view state.
  const look = {
    driver: { yaw: 0, pitch: 0 },
    lookout: { yaw: 0, pitch: -0.1 },
  };
  let gunnerZoom: keyof typeof GUNNER_FOV = '2X';

  addEventListener('mousedown', () => {
    audio.unlock();
    if (playing() && seats.current !== 'loader') input.lock();
  });

  // --- Network ---
  let sendTimer = 0;
  if (net && remotes) {
    const showLobby = (players: Parameters<Menu['lobby']>[0], countdown: number) =>
      menu.lobby(players, phase, countdown, net.id, (ready) => net.setReady(ready));
    if (phase !== 'live') showLobby(welcome!.players, 0);
    else menu.hide();
    net.onMessage = (msg) => {
      if (msg.t === 'lobby') {
        phase = msg.phase;
        if (phase === 'live') menu.hide();
        else {
          input.unlock();
          showLobby(msg.players, msg.countdown);
        }
      } else if (msg.t === 'spawn') {
        const sp = map.spawns[msg.spawn];
        tank.teleport(sp, map.heightAt(sp.x, sp.z));
        tank.damage.reset();
        gun.reset();
        seats.current = seats.target = 'driver';
        seats.remaining = 0;
        say('GO GO GO', HUD_COLORS.lime);
      } else if (msg.t === 'left') {
        remotes.remove(msg.id);
      }
    };
    net.onState = (st) => remotes.receive(st, time);
    net.onClose = (reason) => {
      input.unlock();
      menu.join(`DISCONNECTED: ${reason.toUpperCase()}`).then(() => location.reload());
    };
  }

  function sendState(dt: number) {
    if (!net || !playing()) return;
    sendTimer += dt;
    if (sendTimer < 1 / STATE_HZ) return;
    sendTimer %= 1 / STATE_HZ;
    const p = tank.body.translation(), q = tank.body.rotation(), v = tank.body.linvel();
    net.sendState({
      id: 0,
      seat: seats.current ? SEAT_CODES.indexOf(seats.current) : SEAT_CRAWLING,
      pos: [p.x, p.y, p.z],
      quat: [q.x, q.y, q.z, q.w],
      vel: [v.x, v.y, v.z],
      turretYaw: tank.turretYaw,
      gunPitch: tank.gunPitch,
    });
  }

  const hullPos = new THREE.Vector3(), hullQuat = new THREE.Quaternion();
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  let acc = 0, last = performance.now() / 1000, time = 0;

  function handleInput() {
    if (!playing()) {
      // Lobby/countdown: tank parked, input ignored.
      input.takePresses();
      input.takeClicks();
      input.takeMouse();
      tank.brake = true;
      return;
    }
    for (const code of input.takePresses()) {
      audio.unlock();
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
      if (n >= 0 && seats.current !== SEATS[n] && !(seats.switching && seats.target === SEATS[n])) {
        seats.request(SEATS[n]);
        loader.cancel();
        // Grab the mouse now, while the key press still counts as a user gesture.
        if (SEATS[n] !== 'loader') input.lock();
        audio.play('crawl');
      }
      if (seats.current === 'loader' && code === 'Space') {
        if (gun.breechOpen ? gun.close() : ((gun.breechOpen = true), true)) audio.play('breech');
      }
      // Dev key: break a random part on your own tank to see its effect.
      if (code === 'F8') {
        const parts: Part[] = ['tracks', 'engine', 'turretRing', 'gun', 'optics'];
        const part = parts[Math.floor(Math.random() * parts.length)];
        tank.damage.breakPart(part);
        tank.onPartBroken(part);
        say(`DEV: ${PART_LABEL[part]} BROKEN`, HUD_COLORS.red);
      }
      if (seats.current === 'driver') {
        if (code === 'KeyW') tank.throttleUp();
        if (code === 'KeyS') tank.throttleDown();
        if (code === 'KeyA') tank.steerBy(-1);
        if (code === 'KeyD') tank.steerBy(1);
        if (code === 'KeyX') tank.centreSteer();
      }
    }
    // Brake only while held in the driver seat; levers stay put when you leave.
    tank.brake = seats.current === 'driver' && input.isHeld('Space');

    const clicks = input.takeClicks();
    if (clicks.length) audio.unlock();
    const [dx, dy] = input.takeMouse();
    // A click that captures the mouse is not also a game action (no firing on the grab click).
    const rmb = clicks.some((c) => c.button === 2 && c.locked);
    const lmb = clicks.some((c) => c.button === 0 && c.locked);
    switch (seats.current) {
      case 'driver':
        look.driver.yaw = clamp(look.driver.yaw - dx * MOUSE_SENS, DRIVER_LOOK);
        look.driver.pitch = clamp(look.driver.pitch - dy * MOUSE_SENS, DRIVER_LOOK / 2);
        break;
      case 'gunner': {
        const sens = MOUSE_SENS * (GUNNER_FOV[gunnerZoom] / 60) * (input.isHeld('ShiftLeft') ? 0.3 : 1);
        tank.aimBy(-dx * sens, -dy * sens);
        if (rmb) gunnerZoom = gunnerZoom === '2X' ? '4X' : '2X';
        if (lmb) fire();
        break;
      }
      case 'loader': {
        const ev = loader.update(input.mouseX, input.mouseY, input.mouseButtons.has(0), gun);
        if (ev === 'grab') audio.play('clank', { rate: 1.4, volume: 0.5 });
        if (ev === 'loaded') audio.play('clank', { rate: 0.7 });
        if (ev === 'rejected') say(gun.shellInBreech ? 'ALREADY LOADED' : 'BREECH IS CLOSED', HUD_COLORS.red);
        break;
      }
      case 'lookout': {
        const fov = input.mouseButtons.has(2) ? BINOCULAR_FOV : LOOKOUT_FOV;
        look.lookout.yaw -= dx * MOUSE_SENS * (fov / 60);
        look.lookout.pitch = clamp(look.lookout.pitch - dy * MOUSE_SENS * (fov / 60), 1.2);
        break;
      }
    }
    // The loader needs a free cursor.
    if (seats.current === 'loader') input.unlock();
  }

  function placeCamera(): { fov: number; zoom: string; viewHeading: number } {
    model.root.visible = seats.current === 'lookout';
    // The driver's slit sits above screen centre: shift the view window so the horizon lands in it.
    if (seats.current === 'driver') camera.setViewOffset(RENDER_WIDTH, RENDER_HEIGHT, 0, DRIVER_SLIT_SHIFT, RENDER_WIDTH, RENDER_HEIGHT);
    else camera.clearViewOffset();
    let fov = DRIVER_FOV, zoom = '';
    switch (seats.current) {
      case 'driver':
        camera.position.copy(tmpV.set(-0.75, 0.25, -3.3).applyQuaternion(hullQuat).add(hullPos));
        camera.quaternion.copy(hullQuat).multiply(tmpQ.setFromEuler(tmpE.set(look.driver.pitch, look.driver.yaw, 0)));
        break;
      case 'gunner':
        camera.position.copy(model.gun.localToWorld(tmpV.set(0.55, 0.3, -0.4)));
        model.gun.getWorldQuaternion(camera.quaternion);
        fov = GUNNER_FOV[gunnerZoom];
        zoom = gunnerZoom;
        break;
      case 'lookout': {
        camera.position.copy(model.turret.localToWorld(tmpV.set(0.5, 1.35, 0.4)));
        camera.quaternion.copy(hullQuat).multiply(tmpQ.setFromEuler(tmpE.set(look.lookout.pitch, look.lookout.yaw, 0)));
        const zoomed = input.mouseButtons.has(2);
        fov = zoomed ? BINOCULAR_FOV : LOOKOUT_FOV;
        zoom = zoomed ? '6X' : '1X';
        break;
      }
    }
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const dir = camera.getWorldDirection(tmpV);
    return { fov, zoom, viewHeading: compass(dir.x, dir.z) };
  }

  function frame() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - last);
    last = now;
    time += dt;

    handleInput();
    seats.update(dt);
    remotes?.update(time, dt);
    acc += dt;
    while (acc >= STEP) {
      tank.step(STEP);
      targets?.step(STEP);
      physics.step();
      world.checkBreaks(tank.hullCollider, Math.abs(tank.speed));
      shells.step(STEP);
      acc -= STEP;
    }
    if (gun.update(dt) && seats.current === 'loader') audio.play('clank', { rate: 1.2, volume: 0.4 });
    world.update(dt);
    targets?.update(dt);
    sendState(dt);
    fx.syncTracers(shells.live);
    fx.update(dt);
    if (message && time > message.until) message = null;

    // Sync the tank model.
    tank.pose(hullPos, hullQuat);
    model.root.position.copy(hullPos);
    model.root.quaternion.copy(hullQuat);
    model.turret.rotation.y = tank.turretYaw;
    model.gun.rotation.x = tank.gunPitch;
    model.trackMaps[0].offset.y += (tank.trackSpeed[0] * dt) / TRACK_TEXTURE_LENGTH;
    model.trackMaps[1].offset.y += (tank.trackSpeed[1] * dt) / TRACK_TEXTURE_LENGTH;
    model.root.updateMatrixWorld(true);

    const view = placeCamera();
    audio.setInside(seats.current !== 'lookout');
    audio.setListener(camera);
    engine.setRate(0.6 + Math.abs(tank.speed) / 12);
    engine.setVolume(0.35);
    const seesOutside = seats.current === 'driver' || seats.current === 'gunner' || seats.current === 'lookout';
    if (seesOutside) pipeline.render(world.scene, camera);
    else pipeline.clear(0x000000);

    const fwd = tmpV.set(0, 0, -1).applyQuaternion(hullQuat);
    hud.draw({
      seats, tank, time,
      locked: input.locked || TEST_MODE || !playing(),
      everLocked: input.everLocked,
      fovDeg: view.fov,
      zoomLabel: view.zoom,
      heading: compass(fwd.x, fwd.z),
      viewHeading: view.viewHeading,
      mouse: [input.mouseX, input.mouseY],
      gun,
      loader,
      message,
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Handle for debugging and automated checks.
  (window as unknown as { __game: unknown }).__game = {
    THREE, tank, seats, map, physics, look, world, gun, targets, remotes, shells, fire, net,
    get phase() { return phase; },
    /** Point the gun at a world position, compensating for hull tilt and shell drop (for tests). */
    aimAt(x: number, y: number, z: number) {
      tank.pose(hullPos, hullQuat);
      const local = new THREE.Vector3(x, y, z).sub(hullPos).applyQuaternion(hullQuat.clone().invert()).sub(new THREE.Vector3(0, 1.1, 0.4));
      const range = Math.hypot(local.x, local.z);
      tank.turretYawCmd = Math.atan2(-local.x, -local.z);
      tank.gunPitchCmd = Math.atan2(local.y, range) + (9.81 * range) / (2 * SHELL_SPEED * SHELL_SPEED);
      return range;
    },
    get lastHit() { return lastHit; },
    get shotsFired() { return shotsFired; },
    get message() { return message; },
  };
}

function clamp(v: number, limit: number) {
  return Math.max(-limit, Math.min(limit, v));
}
/** Compass bearing in degrees, 0 = north (-z), 90 = east (+x). */
function compass(x: number, z: number) {
  return ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;
}

start();
