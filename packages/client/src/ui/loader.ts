import type { Gun } from '../sim/gun';

// Loader station layout, in low-res screen pixels (480x270). The HUD draws from the same numbers.
export const RACK = { x: 24, y: 40, w: 170, h: 170 };
export const SHELL = { x: 40, w: 128, h: 14, y0: 50, gap: 26 }; // slot i at y0 + i*gap
export const BREECH = { x: 280, y: 70, w: 150, h: 110, cx: 355, cy: 125, r: 26 };
const DROP_RADIUS = 40;

export type LoaderEvent = 'grab' | 'loaded' | 'returned' | 'rejected';

/** Drag a shell from the rack and drop it into the open breech. */
export class LoaderStation {
  dragging = false;
  dragX = 0;
  dragY = 0;
  private wasDown = false;

  /** Slot rectangle for rack position i (top to bottom). */
  static slot(i: number) {
    return { x: SHELL.x, y: SHELL.y0 + i * SHELL.gap, w: SHELL.w, h: SHELL.h };
  }

  update(mouseX: number, mouseY: number, down: boolean, gun: Gun): LoaderEvent | null {
    let ev: LoaderEvent | null = null;
    const pressed = down && !this.wasDown, released = !down && this.wasDown;
    this.wasDown = down;
    this.dragX = mouseX;
    this.dragY = mouseY;

    if (pressed && !this.dragging) {
      // The rack fills from the top: shells occupy slots 0..rack-1.
      for (let i = 0; i < gun.rack; i++) {
        const r = LoaderStation.slot(i);
        if (mouseX >= r.x - 4 && mouseX <= r.x + r.w + 22 && mouseY >= r.y - 4 && mouseY <= r.y + r.h + 4) {
          this.dragging = true;
          ev = 'grab';
          break;
        }
      }
    } else if (released && this.dragging) {
      this.dragging = false;
      const overBreech = Math.hypot(mouseX - BREECH.cx, mouseY - BREECH.cy) < DROP_RADIUS;
      if (overBreech) ev = gun.load() ? 'loaded' : 'rejected';
      else ev = 'returned';
    }
    return ev;
  }

  cancel() {
    this.dragging = false;
  }
}
