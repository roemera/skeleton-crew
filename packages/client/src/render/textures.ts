import * as THREE from 'three';
import { makeRng } from '@skeleton-crew/shared';

// All textures are tiny canvases drawn at startup: unfiltered, badly tiled, loud.

type Draw = (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void;

function canvasTexture(size: number, seed: number, draw: Draw): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size, makeRng(seed).next);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, rnd: () => number, colors: string[], count: number) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 1 + Math.floor(rnd() * 2), 1);
  }
}

export const tex = {
  grass: () =>
    canvasTexture(32, 1, (ctx, s, r) => {
      ctx.fillStyle = '#5bd12a';
      ctx.fillRect(0, 0, s, s);
      // a sickly checker under the speckle
      ctx.fillStyle = '#7ef03c';
      for (let y = 0; y < s; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < s; x += 16) ctx.fillRect(x, y, 8, 8);
      speckle(ctx, s, r, ['#ff3df2', '#e8ff1a', '#2a8f1a', '#00ffd0'], 70);
    }),
  rock: () =>
    canvasTexture(16, 2, (ctx, s, r) => {
      ctx.fillStyle = '#b02cff';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, r, ['#ff4fd8', '#5b0fa8', '#ffe600'], 60);
    }),
  hazard: () =>
    canvasTexture(16, 3, (ctx, s) => {
      ctx.fillStyle = '#ffe600';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#1a1a1a';
      for (let i = -s; i < s * 2; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 4, 0);
        ctx.lineTo(i + 4 - s, s);
        ctx.lineTo(i - s, s);
        ctx.fill();
      }
    }),
  hull: () =>
    canvasTexture(32, 4, (ctx, s, r) => {
      ctx.fillStyle = '#ff2fa8';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#ffe600';
      ctx.fillRect(0, 12, s, 4);
      ctx.fillStyle = '#7a0050';
      for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(r() * s), Math.floor(r() * s), 2, 2); // rivets
      speckle(ctx, s, r, ['#ff79c9', '#c8007a'], 40);
    }),
  turret: () =>
    canvasTexture(32, 5, (ctx, s, r) => {
      ctx.fillStyle = '#9dff00';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#ff2fa8';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('666', 4, 20);
      speckle(ctx, s, r, ['#3d7a00', '#e8ff1a'], 50);
    }),
  track: () =>
    canvasTexture(16, 6, (ctx, s) => {
      // u runs across the track, v along it (see the track UVs in models/tank.ts).
      // Grooves run along the track like a belt; lime cross ticks show it moving.
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#00ffd0';
      for (let x = 0; x < s; x += 4) ctx.fillRect(x, 0, 1, s);
      ctx.fillStyle = '#b6ff00';
      for (const y of [0, 8]) for (let x = 1; x < s; x += 4) ctx.fillRect(x, y, 2, 2);
    }),
  building: () =>
    canvasTexture(32, 7, (ctx, s, r) => {
      ctx.fillStyle = '#ffe600';
      ctx.fillRect(0, 0, s, s);
      // windows that look like smeared faces
      for (let y = 4; y < s; y += 14) {
        for (let x = 3; x < s; x += 10) {
          ctx.fillStyle = '#00b3ff';
          ctx.fillRect(x, y, 6, 8);
          ctx.fillStyle = '#ff2fa8';
          ctx.fillRect(x + 1, y + 2, 1, 1);
          ctx.fillRect(x + 4, y + 2, 1, 1);
          ctx.fillRect(x + 1, y + 5, 4, 1);
        }
      }
      speckle(ctx, s, r, ['#c9a800', '#fff27a'], 50);
    }),
  roof: () =>
    canvasTexture(16, 8, (ctx, s, r) => {
      ctx.fillStyle = '#ff3b1f';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#a3170a';
      for (let y = 0; y < s; y += 3) ctx.fillRect(0, y, s, 1);
      speckle(ctx, s, r, ['#ffe600'], 8);
    }),
  bark: () =>
    canvasTexture(8, 9, (ctx, s, r) => {
      ctx.fillStyle = '#7a3cff';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, r, ['#2b0a6b', '#ff79c9'], 20);
    }),
  leaves: () =>
    canvasTexture(16, 10, (ctx, s, r) => {
      ctx.fillStyle = '#00ffd0';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, r, ['#008f75', '#e8ff1a', '#ff2fa8'], 60);
    }),
  brick: () =>
    canvasTexture(16, 11, (ctx, s, r) => {
      ctx.fillStyle = '#ff7a00';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#5a1a00';
      for (let y = 0; y < s; y += 4) {
        ctx.fillRect(0, y, s, 1);
        for (let x = (y / 4) % 2 ? 0 : 4; x < s; x += 8) ctx.fillRect(x, y, 1, 4);
      }
      speckle(ctx, s, r, ['#ffd000'], 10);
    }),
  fence: () =>
    canvasTexture(16, 12, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#ff0040';
      for (let x = 0; x < s; x += 4) ctx.fillRect(x, 0, 2, s);
    }),
};
