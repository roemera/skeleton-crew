import { PART_LABEL, RENDER_HEIGHT as H, RENDER_WIDTH as W, STORAGE_SIZE, THROTTLE_STEPS, TANK_HEALTH } from '@skeleton-crew/shared';
import type { Seat, Seats } from '../seats/seats';
import type { TankSim } from '../sim/tank';
import type { Gun } from '../sim/gun';
import { BREECH, LoaderStation, RACK, SHELL } from './loader';
import { accuracy } from './menu';
import type { Score } from '@skeleton-crew/shared';
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
  everLocked: boolean; // the full instructions show only until the first time you climb in
  fovDeg: number; // vertical fov of the current view
  zoomLabel: string;
  heading: number; // degrees, hull forward, 0 = north (-z)
  viewHeading: number; // degrees, where the camera looks
  mouse: [number, number];
  gun: Gun;
  loader: LoaderStation;
  message: { text: string; color: string } | null; // short-lived feedback ("HIT SIDE HULL")
  scores: Score[] | null; // shown while Tab is held (online only)
  myId: number;
  dead: { killer: string; zone: string; respawnIn: number } | null;
  protectedFor: number; // s of spawn protection left
  hurt: number; // 0..1 red flash after being hit
  subtitle: string | null; // the crew's gibberish
}

export const HUD_COLORS = C;

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
    if (s.dead) {
      // The death camera fills the screen; no seat view.
    } else if (seat === null) this.drawCrawl(s);
    else if (seat === 'driver') this.drawDriver(s);
    else if (seat === 'gunner') this.drawGunner(s);
    else if (seat === 'loader') this.drawLoader(s);
    else this.drawLookout(s);
    if (seat !== null && !s.dead) this.drawDamage(s);
    if (s.hurt > 0) {
      ctx.fillStyle = `rgba(255,31,61,${(0.6 * s.hurt).toFixed(2)})`;
      for (const [x, y, w, h] of [[0, 0, W, 8], [0, H - 8, W, 8], [0, 0, 8, H], [W - 8, 0, 8, H]]) ctx.fillRect(x, y, w, h);
    }
    if (s.protectedFor > 0 && !s.dead) {
      ctx.fillStyle = C.black;
      ctx.fillRect(176, 18, 128, 11);
      drawText(ctx, `SPAWN PROTECTION ${Math.ceil(s.protectedFor)}S`, 240, 21, C.cyan, 1, 'center');
    }
    if (s.message && seat !== null) {
      const w = s.message.text.length * 4 + 6;
      ctx.fillStyle = C.black;
      ctx.fillRect(240 - w / 2, 222, w, 11);
      drawText(ctx, s.message.text, 240, 225, s.message.color, 1, 'center');
    }
    this.drawSeatBar(s);
    if (s.subtitle && !s.dead) {
      const w = s.subtitle.length * 4 + 6;
      ctx.fillStyle = C.black;
      ctx.fillRect(240 - w / 2, 236, w, 10);
      drawText(ctx, s.subtitle, 240, 238, C.white, 1, 'center');
    }
    if (s.dead) this.drawDead(s);
    if (s.scores) this.drawScores(s.scores, s.myId);
    if (!s.locked && seat !== 'loader') {
      if (s.everLocked) this.drawGrabMouse();
      else this.drawClickToPlay();
    }
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
    const g = s.gun;
    const [status, color] = s.tank.isBroken('gun')
      ? ['GUN BROKEN', C.red]
      : g.ready
        ? ['READY - LMB FIRE', C.lime]
        : g.shellInBreech
          ? ['LOADED, BREECH OPEN', C.yellow]
          : ['EMPTY - GO LOAD', C.red];
    drawText(ctx, status, 380, 234, color);
    if (s.tank.isBroken('optics')) this.drawStatic(cx - r, cy - r, r * 2, r * 2, s.time);
  }

  /** Broken optics: snow over the sight. */
  private drawStatic(x: number, y: number, w: number, h: number, time: number) {
    const ctx = this.ctx;
    let seed = Math.floor(time * 12) * 7919;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < (w * h) / 6; i++) {
      ctx.fillStyle = rnd() < 0.5 ? C.white : C.black;
      ctx.fillRect(x + Math.floor(rnd() * w), y + Math.floor(rnd() * h), 2, 1);
    }
  }

  /** Health and broken parts: warning lights, shown in every seat. */
  private drawDamage(s: HudState) {
    const ctx = this.ctx;
    const d = s.tank.damage;
    ctx.fillStyle = C.black;
    ctx.fillRect(4, 4, 74, 9 + d.broken.size * 9);
    ctx.fillStyle = C.purple;
    ctx.fillRect(6, 6, 70, 5);
    ctx.fillStyle = d.health > 50 ? C.lime : d.health > 25 ? C.yellow : C.red;
    ctx.fillRect(6, 6, Math.round((70 * d.health) / TANK_HEALTH), 5);
    let y = 14;
    const blink = Math.floor(s.time * 4) % 2 === 0;
    for (const [part, t] of d.broken) {
      drawText(ctx, `${PART_LABEL[part]} ${Math.ceil(t)}S`, 6, y, blink ? C.red : C.yellow);
      y += 9;
    }
  }

  // --- Loader: no view outside. Shell rack and breech. ---
  private drawLoader(s: HudState) {
    const ctx = this.ctx;
    const g = s.gun, ld = s.loader;
    ctx.fillStyle = this.quilt;
    ctx.fillRect(0, 0, W, H);
    // flickering tube light
    const flick = Math.floor(s.time * 12) % 7 === 0;
    ctx.fillStyle = flick ? C.white : C.cyan;
    ctx.fillRect(140, 8, 200, 6);

    // Rack: shells fill from the top.
    ctx.fillStyle = C.black;
    ctx.fillRect(RACK.x, RACK.y, RACK.w, RACK.h);
    drawText(ctx, 'RACK', RACK.x + RACK.w / 2, 30, C.yellow, 2, 'center');
    for (let i = 0; i < 6; i++) {
      const r = LoaderStation.slot(i);
      const held = ld.dragging && i === g.rack - 1;
      if (i < g.rack && !held) this.drawShell(r.x, r.y);
      else {
        ctx.fillStyle = C.purple;
        ctx.fillRect(r.x, r.y + 5, r.w + 18, 4);
      }
    }
    // Refill from storage
    ctx.fillStyle = C.purple;
    ctx.fillRect(RACK.x + 10, RACK.y + RACK.h - 8, RACK.w - 20, 4);
    ctx.fillStyle = C.lime;
    ctx.fillRect(RACK.x + 10, RACK.y + RACK.h - 8, Math.round((RACK.w - 20) * g.refillProgress), 4);
    drawText(ctx, `RACK ${g.rack}   STORE ${g.storage}/${STORAGE_SIZE}`, RACK.x + RACK.w / 2, 220, C.white, 1, 'center');

    // Breech
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(BREECH.x, BREECH.y, BREECH.w, BREECH.h);
    ctx.fillStyle = C.lime;
    ctx.fillRect(BREECH.x, BREECH.y, BREECH.w, 4);
    ctx.fillStyle = C.black;
    ctx.beginPath();
    ctx.arc(BREECH.cx, BREECH.cy, BREECH.r, 0, Math.PI * 2);
    ctx.fill();
    if (g.shellInBreech) {
      // shell base seen end-on
      ctx.fillStyle = C.yellow;
      ctx.beginPath();
      ctx.arc(BREECH.cx, BREECH.cy, BREECH.r - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9a800';
      ctx.fillRect(BREECH.cx - 3, BREECH.cy - 3, 6, 6);
    }
    if (!g.breechOpen) {
      // breech block slid across
      ctx.fillStyle = '#6a6a6a';
      ctx.fillRect(BREECH.cx - 34, BREECH.cy - 34, 68, 68);
      ctx.fillStyle = C.yellow;
      for (let i = 0; i < 68; i += 8) ctx.fillRect(BREECH.cx - 34 + i, BREECH.cy - 34, 4, 4);
    }
    const breechText = g.breechOpen ? (g.shellInBreech ? 'LOADED - SPACE TO CLOSE' : 'OPEN - DROP A SHELL IN') : g.shellInBreech ? 'CLOSED - READY' : 'CLOSED EMPTY - SPACE OPENS';
    drawText(ctx, breechText, BREECH.cx, 190, g.ready ? C.lime : C.yellow, 1, 'center');
    if (s.tank.isBroken('gun')) drawText(ctx, 'GUN BROKEN', BREECH.cx, 200, C.red, 1, 'center');

    // Dragged shell follows the cursor
    const [mx, my] = s.mouse;
    if (ld.dragging) this.drawShell(mx - SHELL.w / 2, my - SHELL.h / 2);
    ctx.fillStyle = C.lime;
    ctx.fillRect(mx - 3, my, 7, 1);
    ctx.fillRect(mx, my - 3, 1, 7);
  }

  private drawShell(x: number, y: number) {
    const ctx = this.ctx;
    ctx.fillStyle = C.yellow;
    ctx.fillRect(x, y, SHELL.w, SHELL.h);
    ctx.fillStyle = '#c9a800';
    ctx.fillRect(x, y + SHELL.h - 3, SHELL.w, 3);
    ctx.fillStyle = C.red;
    ctx.fillRect(x + SHELL.w, y + 2, 18, SHELL.h - 4);
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
      if (s.tank.isBroken('optics')) this.drawStatic(W / 2 - 160, H / 2 - 100, 320, 200, s.time);
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

  /** Dead: a cursed screen. Stuttering red noise, a skull made of text, the killer's name. */
  private drawDead(s: HudState) {
    const ctx = this.ctx;
    const d = s.dead!;
    const f = Math.floor(s.time * 8);
    // Translucent, so the death camera shows through.
    ctx.fillStyle = f % 2 ? 'rgba(58,0,8,0.55)' : 'rgba(20,0,26,0.45)';
    ctx.fillRect(0, 0, W, H - 13);
    let seed = f * 9973;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rnd() < 0.5 ? C.red : C.pinkDark;
      ctx.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * (H - 13)), 3, 1);
    }
    const jx = (f % 3) - 1, jy = ((f * 7) % 3) - 1;
    const skull = ['  ######  ', ' ######## ', '## #### ##', '##########', ' ### ## ###', '  ######  ', '  # # # # '];
    skull.forEach((row, i) => drawText(ctx, row.replace(/#/g, '*'), 240 + jx, 40 + i * 8 + jy, C.white, 1, 'center'));
    drawText(ctx, 'YOU DIED', 240 + jx, 110 + jy, C.yellow, 4, 'center');
    drawText(ctx, `KILLED BY ${d.killer}`, 240, 140, C.pink, 2, 'center');
    drawText(ctx, `(${d.zone})`, 240, 156, C.white, 1, 'center');
    drawText(ctx, `CRAWLING OUT OF A NEW TANK IN ${Math.max(0, Math.ceil(d.respawnIn))}`, 240, 176, C.lime, 1, 'center');
  }

  /** Tab: kills, deaths, accuracy. */
  private drawScores(scores: Score[], myId: number) {
    const ctx = this.ctx;
    const h = 28 + scores.length * 12;
    ctx.fillStyle = C.black;
    ctx.fillRect(120, 40, 240, h);
    ctx.fillStyle = C.yellow;
    ctx.fillRect(120, 40, 240, 2);
    drawText(ctx, 'TANK', 130, 48, C.yellow);
    drawText(ctx, 'KILLS  DEATHS  HIT', 350, 48, C.yellow, 1, 'right');
    scores.forEach((sc, i) => {
      const y = 62 + i * 12;
      const color = sc.id === myId ? C.lime : C.white;
      drawText(ctx, sc.name, 130, y, color);
      drawText(ctx, `${String(sc.kills).padStart(5)}  ${String(sc.deaths).padStart(6)}  ${accuracy(sc).padStart(4)}`, 350, y, color, 1, 'right');
    });
  }

  /** After the first time: a small strip, not the whole instructions panel. */
  private drawGrabMouse() {
    const ctx = this.ctx;
    ctx.fillStyle = C.black;
    ctx.fillRect(150, 30, 180, 11);
    drawText(ctx, 'CLICK TO GRAB THE MOUSE', 240, 33, C.yellow, 1, 'center');
  }

  private drawClickToPlay() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(20,0,26,0.85)';
    ctx.fillRect(40, 40, 400, 130);
    drawText(ctx, 'SKELETON CREW', 240, 52, C.pink, 3, 'center');
    drawText(ctx, 'CLICK TO CLIMB IN', 240, 80, C.lime, 2, 'center');
    const help = [
      '1-4 CHANGE SEAT (2 SECONDS, ANY SEAT)',
      'DRIVER: W/S THROTTLE  A/D STEER  X CENTRE  SPACE BRAKE',
      'GUNNER: MOUSE AIM  LMB FIRE  RMB ZOOM  SHIFT FINE',
      'LOADER: DRAG A SHELL INTO THE BREECH  SPACE OPENS/CLOSES',
      'LOOKOUT: MOUSE LOOK  RMB BINOCULARS',
    ];
    help.forEach((line, i) => drawText(ctx, line, 240, 104 + i * 10, C.yellow, 1, 'center'));
  }
}
