import { RACK_REFILL_TIME, RACK_SIZE, STORAGE_SIZE } from '@skeleton-crew/shared';

/**
 * The breech and the ammunition. One shell type.
 * Fire -> breech opens, casing ejected -> loader drags a shell in -> loader closes the breech -> ready.
 */
export class Gun {
  breechOpen = false;
  shellInBreech = true; // you spawn with a loaded gun
  rack = RACK_SIZE;
  storage = STORAGE_SIZE;
  private refill = 0;

  get ready() {
    return this.shellInBreech && !this.breechOpen;
  }
  get canLoad() {
    return this.breechOpen && !this.shellInBreech && this.rack > 0;
  }

  /** Returns true if a shell was fired. */
  fire(): boolean {
    if (!this.ready) return false;
    this.shellInBreech = false;
    this.breechOpen = true; // the empty casing is thrown out
    return true;
  }

  /** The loader pushes a shell from the rack into the open breech. */
  load(): boolean {
    if (!this.canLoad) return false;
    this.rack--;
    this.shellInBreech = true;
    return true;
  }

  /** The loader slams the breech shut. Closing it empty is allowed (and pointless). */
  close(): boolean {
    if (!this.breechOpen) return false;
    this.breechOpen = false;
    return true;
  }

  /** The rack refills from storage on its own. Returns true when a shell was added. */
  update(dt: number): boolean {
    if (this.rack >= RACK_SIZE || this.storage <= 0) {
      this.refill = 0;
      return false;
    }
    this.refill += dt;
    if (this.refill < RACK_REFILL_TIME) return false;
    this.refill -= RACK_REFILL_TIME;
    this.rack++;
    this.storage--;
    return true;
  }

  /** 0..1 progress of the next rack refill. */
  get refillProgress() {
    return this.rack >= RACK_SIZE || this.storage <= 0 ? 0 : this.refill / RACK_REFILL_TIME;
  }

  reset() {
    Object.assign(this, { breechOpen: false, shellInBreech: true, rack: RACK_SIZE, storage: STORAGE_SIZE, refill: 0 });
  }
}
