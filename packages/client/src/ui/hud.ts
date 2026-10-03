import { RENDER_HEIGHT as H, RENDER_WIDTH as W, THROTTLE_STEPS } from '@skeleton-crew/shared';
import type { Seat, Seats } from '../seats/seats';
import type { TankSim } from '../sim/tank';
import { drawText } from './font';

// Garish palette.
const C = {
  pink: '#ff4fd8',
  pinkDark: '#a3127f',
  lime: '#b6ff00',
  yellow: '#ffe600',
  cyan: '#00ffe1',
  red: '#ff1f3d',
  black: '#14001a',
  white: '#ffffff',
  purple: '#5b0fa8',
};

export const SEAT_LABEL: Record<Seat, string> = { driver: 'DRIVER', gunner: 'GUNNER', loader: 'LOADER', lookout: 'LOOKOUT' };
const THROTTLE_LABEL = ['R FULL', 'R 1/2', 'STOP', '1/4', '1/2', 'FULL'];

export interface HudState {
  seats: Seats;
  tank: TankSim;
  time: number;
  locked: boolean;
  fovDeg: number; // vertical fov of the current view
  zoomLabel: string;
  heading: number; // degrees, hull forward, 0 = north (-z)
  viewHeading: number; // degrees, where the camera looks
  mouse: [number, number];
}

export class Hud {
  private ctx: CanvasRenderingContext2D;
  private quilt: CanvasPattern;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    // Padded neon wall: diamond quilting.
    const q = document.createElement('canvas');
    q.width = q.height = 8;
    const qc = q.getContext('2d')!;
    qc.fillStyle = C.pink;
    qc.fillRect(0, 0, 8, 8);
    qc.fillStyle = C.pinkDark;
    for (let i = 0; i < 8; i++) {
      qc.fillRect(i, i, 1, 1);
      qc.fillRect(7 - i, i, 1, 1);
    }
    this.quilt = this.ctx.createPattern(q, 'repeat')!;
  }

  draw(s: HudState) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    const seat = s.seats.current;
    if (seat === null) this.drawCrawl(s);
    else if (seat === 'driver') this.drawDriver(s);
    else if (seat === 'gunner') this.drawGunner(s);
    else if (seat === 'loader') this.drawLoader(s);
    else this.drawLookout(s);
    this.drawSeatBar(s);
    if (!s.locked && seat !== 'loader') this.drawClickToPlay();
  }

  // --- Driver: a narrow slit in a padded pink wall, levers below ---
  private drawDriver(s: HudState) {
    const ctx = this.ctx;
    const slit = { x: 60, y: 62, w: 360, h: 44 };
    ctx.fillStyle = this.quilt;
    ctx.fillRect(0, 0, W, H);
    ctx.clearRect(slit.x, slit.y, slit.w, slit.h);
    // hazard frame round the slit
    ctx.fillStyle = C.yellow;
    ctx.fillRect(slit.x - 4, slit.y - 4, slit.w + 8, 4);
    ctx.fillRect(slit.x - 4, slit.y + slit.h, slit.w + 8, 4);
    ctx.fillRect(slit.x - 4, slit.y, 4, slit.h);
    ctx.fillRect(slit.x + slit.w, slit.y, 4, slit.h);
    ctx.fillStyle = C.black;
    for (let x = slit.x - 4; x < slit.x + slit.w + 4; x += 8) {
      ctx.fillRect(x, slit.y - 4, 4, 4);
      ctx.fillRect(x + 4, slit.y + slit.h, 4, 4);
    }

    // Dashboard
    ctx.fillStyle = C.purple;
    ctx.fillRect(16, 128, 448, 122);
    ctx.fillStyle = C.black;
    ctx.fillRect(20, 132, 440, 114);

    // Throttle lever: vertical slot with notches.
    const tx = 70, ty0 = 150, tStep = 16;
    drawText(ctx, 'THROTTLE W/S', tx, 136, C.yellow, 1, 'center');
    ctx.fillStyle = C.purple;
    ctx.fillRect(tx - 2, ty0, 4, tStep * (THROTTLE_STEPS.length - 1) + 4);
    for (let i = 0; i < THROTTLE_STEPS.length; i++) {
      const y = ty0 + (THROTTLE_STEPS.length - 1 - i) * tStep;
      const on = i === s.tank.throttleIdx;
      drawText(ctx, THROTTLE_LABEL[i], tx + 12, y, on ? C.lime : C.pink);
      if (on) {
        ctx.fillStyle = C.lime;
        ctx.fillRect(tx - 8, y - 1, 16, 7);
      }
    }

    // Steering lever: horizontal slot, 9 notches.
    const sx = 240, sy = 172;
    drawText(ctx, 'STEER A/D  X=CENTRE', sx, 136, C.yellow, 1, 'center');
    ctx.fillStyle = C.purple;
    ctx.fillRect(sx - 66, sy, 132, 4);
    for (let i = -4; i <= 4; i++) {
      ctx.fillStyle = i === 0 ? C.yellow : C.pink;
      ctx.fillRect(sx + i * 16 - 1, sy + 7, 2, i === 0 ? 6 : 3);
    }
    const knob = sx + s.tank.steer * 64;
    ctx.fillStyle = C.lime;
    ctx.fillRect(knob - 4, sy - 8, 8, 20);
    drawText(ctx, 'L', sx - 74, sy, C.pink);
    drawText(ctx, 'R', sx + 72, sy, C.pink);
    if (s.tank.brake) drawText(ctx, 'BRAKE', sx, 200, C.red, 2, 'center');

    // Speed + heading
    const kmh = Math.round(Math.abs(s.tank.speed) * 3.6);
    drawText(ctx, String(kmh).padStart(2, '0'), 400, 150, C.cyan, 4, 'center');
    drawText(ctx, 'KM/H', 400, 174, C.cyan, 1, 'center');
    drawText(ctx, 'HDG ' + String(Math.round(s.heading)).padStart(3, '0'), 400, 196, C.yellow, 1, 'center');
    if (s.tank.grounded < 0.3) drawText(ctx, 'AIRBORNE?!', 400, 210, C.red, 1, 'center');
  }

  // --- Gunner: a round sight, everything else black ---
  private drawGunner(s: HudState) {
    const ctx = this.ctx;
    const cx = W / 2, cy = H / 2 - 6, r = 112;
    ctx.fillStyle = C.black;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.strokeStyle = C.lime;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Reticle: chevron + stadia line + range marks for shell drop. Dark, to read on bright ground.
    ctx.fillStyle = C.black;
    ctx.fillRect(cx - 60, cy, 50, 1);
    ctx.fillRect(cx + 10, cy, 50, 1);
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(cx - i, cy + i, 1, 1);
      ctx.fillRect(cx + i, cy + i, 1, 1);
    }
    const pxPerRad = H / ((s.fovDeg * Math.PI) / 180);
    for (const m of [200, 400, 600, 800, 1000]) {
      const drop = (9.81 * m) / (2 * 600 * 600); // small-angle shell drop, rad
      const y = Math.round(cy + drop * pxPerRad) + 8;
      ctx.fillRect(cx - 3, y, 7, 1);
      drawText(ctx, String(m / 100), cx + 6, y - 2, C.black);
    }

    // Commanded aim (turret lags behind the mouse at 24 deg/s).
    const dYaw = s.tank.turretYawCmd - s.tank.turretYaw;
    const dPitch = s.tank.gunPitchCmd - s.tank.gunPitch;
    const ax = cx - dYaw * pxPerRad, ay = cy - dPitch * pxPerRad;
    if (Math.hypot(ax - cx, ay - cy) > 2) {
      ctx.strokeStyle = C.pink;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(Math.max(cx - r, Math.min(cx + r, ax))) - 3, Math.round(Math.max(cy - r, Math.min(cy + r, ay))) - 3, 7, 7);
    }

    // Turret direction relative to the hull.
    const hx = 46, hy = 222;
    ctx.fillStyle = C.purple;
    ctx.fillRect(hx - 7, hy - 12, 14, 24);
    ctx.strokeStyle = C.yellow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.sin(s.tank.turretYaw) * 18, hy - Math.cos(s.tank.turretYaw) * 18);
    ctx.stroke();
    drawText(ctx, 'TURRET', hx, 240, C.yellow, 1, 'center');

    const elev = (s.tank.gunPitch * 180) / Math.PI;
    drawText(ctx, 'ELEV ' + (elev >= 0 ? '+' : '') + elev.toFixed(1), 380, 214, C.lime);
    drawText(ctx, 'ZOOM ' + s.zoomLabel + ' (RMB)', 380, 224, C.lime);
    drawText(ctx, 'BREECH EMPTY', 380, 234, C.red);
  }

  // --- Loader: no view outside. Shell rack and breech. ---
  private drawLoader(s: HudState) {
    const ctx = this.ctx;
    ctx.fillStyle = this.quilt;
    ctx.fillRect(0, 0, W, H);
    // flickering tube light
    const flick = Math.floor(s.time * 12) % 7 === 0;
    ctx.fillStyle = flick ? C.white : C.cyan;
    ctx.fillRect(140, 8, 200, 6);

    // Rack
    ctx.fillStyle = C.black;
    ctx.fillRect(24, 40, 170, 170);
    drawText(ctx, 'RACK', 109, 30, C.yellow, 2, 'center');
    for (let i = 0; i < 6; i++) {
      const y = 50 + i * 26;
      ctx.fillStyle = C.yellow;
      ctx.fillRect(40, y, 110, 14);
      ctx.fillStyle = C.red;
      ctx.fillRect(150, y + 2, 18, 10);
      ctx.fillStyle = '#c9a800';
      ctx.fillRect(40, y + 11, 110, 3);
    }

    // Breech
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(280, 70, 150, 110);
    ctx.fillStyle = C.black;
    ctx.beginPath();
    ctx.arc(355, 125, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.lime;
    ctx.fillRect(280, 70, 150, 4);
    drawText(ctx, 'BREECH OPEN', 355, 190, C.yellow, 2, 'center');

    drawText(ctx, 'RACK 6   STORE 30', 109, 220, C.white, 1, 'center');
    drawText(ctx, 'DRAG-TO-LOAD ARRIVES IN MILESTONE 2', 240, 236, C.black, 1, 'center');

    // Free cursor
    const [mx, my] = s.mouse;
    ctx.fillStyle = C.lime;
    ctx.fillRect(mx - 3, my, 7, 1);
    ctx.fillRect(mx, my - 3, 1, 7);
  }

  // --- Lookout: head out of the hatch ---
  private drawLookout(s: HudState) {
    const ctx = this.ctx;
    if (s.zoomLabel === '6X') {
      // binocular mask: two overlapping circles
      ctx.fillStyle = C.black;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(W / 2 - 60, H / 2, 100, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(W / 2 + 60, H / 2, 100, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // hatch rim along the bottom
      ctx.fillStyle = C.black;
      ctx.beginPath();
      ctx.ellipse(W / 2, H + 120, 300, 150, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.yellow;
      ctx.beginPath();
      ctx.ellipse(W / 2, H + 120, 300, 150, 0, Math.PI, Math.PI * 2);
      ctx.ellipse(W / 2, H + 120, 296, 146, 0, Math.PI * 2, Math.PI, true);
      ctx.fill();
    }
    // Compass strip
    ctx.fillStyle = C.black;
    ctx.fillRect(140, 4, 200, 12);
    const names: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let hdg = 0; hdg < 360; hdg += 5) {
      const diff = ((hdg - s.viewHeading + 540) % 360) - 180;
      if (Math.abs(diff) > 96) continue;
      const x = Math.round(240 + diff);
      if (names[hdg] !== undefined) drawText(ctx, names[hdg], x, 7, C.yellow, 1, 'center');
      else if (hdg % 15 === 0) {
        ctx.fillStyle = C.lime;
        ctx.fillRect(x, 9, 1, 3);
      }
    }
    ctx.fillStyle = C.red;
    ctx.fillRect(239, 16, 3, 3);
    ctx.fillStyle = C.black;
    ctx.fillRect(408, 4, 68, 12);
    ctx.fillRect(6, 234, 134, 11);
    drawText(ctx, 'RMB BINOCULARS', 472, 7, C.yellow, 1, 'right');
    drawText(ctx, 'HEAD OUT: SHELLS KILL YOU', 10, 237, C.red);
  }

  // --- Crawling between seats: stuttering neon tunnel ---
  private drawCrawl(s: HudState) {
    const ctx = this.ctx;
    const f = Math.floor(s.time * 12); // 12 fps stutter
    ctx.fillStyle = C.black;
    ctx.fillRect(0, 0, W, H);
    const colors = [C.pink, C.lime, C.yellow, C.cyan, C.purple];
    for (let i = 0; i < 14; i++) {
      const y = ((i * 37 + f * 9) % (H + 40)) - 20;
      const jitter = ((f * 7 + i * 13) % 9) - 4;
      ctx.fillStyle = colors[(i + f) % colors.length];
      ctx.fillRect(0, y + jitter, W, 6 + (i % 3) * 4);
    }
    // a hand reaching forward
    const hx = 200 + ((f * 5) % 11) - 5, hy = 160 + ((f * 3) % 7);
    ctx.fillStyle = '#ffd0b0';
    ctx.fillRect(hx, hy, 50, 26);
    for (let k = 0; k < 4; k++) ctx.fillRect(hx + 50, hy + k * 7, 18, 5);
    ctx.fillStyle = C.black;
    ctx.fillRect(110, 100, 260, 40);
    drawText(ctx, 'CRAWLING TO ' + SEAT_LABEL[s.seats.target], 240, 106, C.yellow, 2, 'center');
    ctx.fillStyle = C.purple;
    ctx.fillRect(130, 126, 220, 8);
    ctx.fillStyle = C.lime;
    ctx.fillRect(130, 126, Math.round(220 * s.seats.progress), 8);
  }

  private drawSeatBar(s: HudState) {
    const ctx = this.ctx;
    const seats: Seat[] = ['driver', 'gunner', 'loader', 'lookout'];
    ctx.fillStyle = C.black;
    ctx.fillRect(0, H - 13, W, 13);
    seats.forEach((seat, i) => {
      const x = 4 + i * 62;
      const isCur = s.seats.current === seat;
      const isTarget = s.seats.switching && s.seats.target === seat;
      const blink = Math.floor(s.time * 6) % 2 === 0;
      ctx.fillStyle = isCur ? C.lime : isTarget && blink ? C.yellow : C.purple;
      ctx.fillRect(x, H - 11, 58, 9);
      drawText(ctx, `${i + 1} ${SEAT_LABEL[seat]}`, x + 29, H - 9, isCur || (isTarget && blink) ? C.black : C.pink, 1, 'center');
    });
    // Lever state is always known: you set it.
    const steerArrows = s.tank.steer === 0 ? '--' : (s.tank.steer < 0 ? '<' : '>').repeat(Math.round(Math.abs(s.tank.steer) * 4));
    drawText(ctx, `THR ${THROTTLE_LABEL[s.tank.throttleIdx]}  STR ${steerArrows}`, W - 4, H - 9, C.cyan, 1, 'right');
  }

  private drawClickToPlay() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(20,0,26,0.85)';
    ctx.fillRect(60, 40, 360, 120);
    drawText(ctx, 'SKELETON CREW', 240, 52, C.pink, 3, 'center');
    drawText(ctx, 'CLICK TO CLIMB IN', 240, 80, C.lime, 2, 'center');
    const help = [
      '1-4 CHANGE SEAT (2 SECONDS, ANY SEAT)',
      'DRIVER: W/S THROTTLE  A/D STEER  X CENTRE  SPACE BRAKE',
      'GUNNER: MOUSE AIM  RMB ZOOM  SHIFT FINE',
      'LOOKOUT: MOUSE LOOK  RMB BINOCULARS',
    ];
    help.forEach((line, i) => drawText(ctx, line, 240, 104 + i * 10, C.yellow, 1, 'center'));
  }
}
