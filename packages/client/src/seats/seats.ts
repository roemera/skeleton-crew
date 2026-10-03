import { SEAT_SWITCH_TIME } from '@skeleton-crew/shared';

export type Seat = 'driver' | 'gunner' | 'loader' | 'lookout';
export const SEATS: Seat[] = ['driver', 'gunner', 'loader', 'lookout'];

/**
 * You are in one seat at a time. Switching takes SEAT_SWITCH_TIME whatever the seat;
 * while crawling you control nothing. Picking a new seat mid-crawl restarts the timer.
 */
export class Seats {
  current: Seat | null = 'driver';
  target: Seat = 'driver';
  remaining = 0;

  get switching() {
    return this.current === null;
  }
  /** 0..1 progress of the current crawl. */
  get progress() {
    return 1 - this.remaining / SEAT_SWITCH_TIME;
  }

  request(seat: Seat) {
    if (this.current === seat) return;
    if (this.switching && this.target === seat) return;
    this.current = null;
    this.target = seat;
    this.remaining = SEAT_SWITCH_TIME;
  }

  update(dt: number) {
    if (!this.switching) return;
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.current = this.target;
    }
  }
}
