import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS_HZ, RENDER_HEIGHT, RENDER_WIDTH, generateMap } from '@skeleton-crew/shared';
import { Pipeline } from './render/pipeline';
import { World } from './world';
import { buildTankModel } from './models/tank';
import { TankSim } from './sim/tank';
import { Seats, SEATS } from './seats/seats';
import { Input } from './input';
import { Hud } from './ui/hud';

const params = new URLSearchParams(location.search);
const MAP_SEED = Number(params.get('seed') ?? 1337);
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

async function start() {
  await RAPIER.init();
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
  const map = generateMap(MAP_SEED);
  const world = new World(map, physics);

  const spawn = map.spawns[0];
  const tank = new TankSim(physics, spawn, map.heightAt(spawn.x, spawn.z));
  const model = buildTankModel();
  world.scene.add(model.root);

  const seats = new Seats();
  const hud = new Hud(hudCanvas);
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
    if (seats.current !== 'loader') input.lock();
  });

  const hullPos = new THREE.Vector3(), hullQuat = new THREE.Quaternion();
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  let acc = 0, last = performance.now() / 1000, time = 0;

  function handleInput() {
    for (const code of input.takePresses()) {
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
      if (n >= 0) seats.request(SEATS[n]);
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
    const [dx, dy] = input.takeMouse();
    const rmb = clicks.some((c) => c.button === 2);
    switch (seats.current) {
      case 'driver':
        look.driver.yaw = clamp(look.driver.yaw - dx * MOUSE_SENS, DRIVER_LOOK);
        look.driver.pitch = clamp(look.driver.pitch - dy * MOUSE_SENS, DRIVER_LOOK / 2);
        break;
      case 'gunner': {
        const sens = MOUSE_SENS * (GUNNER_FOV[gunnerZoom] / 60) * (input.isHeld('ShiftLeft') ? 0.3 : 1);
        tank.aimBy(-dx * sens, -dy * sens);
        if (rmb) gunnerZoom = gunnerZoom === '2X' ? '4X' : '2X';
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
    acc += dt;
    while (acc >= STEP) {
      tank.step(STEP);
      physics.step();
      world.checkBreaks(tank.hullCollider, Math.abs(tank.speed));
      acc -= STEP;
    }
    world.update(dt);

    // Sync the tank model.
    tank.pose(hullPos, hullQuat);
    model.root.position.copy(hullPos);
    model.root.quaternion.copy(hullQuat);
    model.turret.rotation.y = tank.turretYaw;
    model.gun.rotation.x = tank.gunPitch;
    model.trackMaps[0].offset.x -= tank.trackSpeed[0] * dt * 0.25;
    model.trackMaps[1].offset.x -= tank.trackSpeed[1] * dt * 0.25;
    model.root.updateMatrixWorld(true);

    const view = placeCamera();
    const seesOutside = seats.current === 'driver' || seats.current === 'gunner' || seats.current === 'lookout';
    if (seesOutside) pipeline.render(world.scene, camera);
    else pipeline.clear(0x000000);

    const fwd = tmpV.set(0, 0, -1).applyQuaternion(hullQuat);
    hud.draw({
      seats, tank, time,
      locked: input.locked || TEST_MODE,
      fovDeg: view.fov,
      zoomLabel: view.zoom,
      heading: compass(fwd.x, fwd.z),
      viewHeading: view.viewHeading,
      mouse: [input.mouseX, input.mouseY],
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Handle for debugging and automated checks.
  (window as unknown as { __game: unknown }).__game = { tank, seats, map, physics, look, world };
}

function clamp(v: number, limit: number) {
  return Math.max(-limit, Math.min(limit, v));
}
/** Compass bearing in degrees, 0 = north (-z), 90 = east (+x). */
function compass(x: number, z: number) {
  return ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;
}

start();
