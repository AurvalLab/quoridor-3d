/**
 * Anti-mis-touch for picking a piece up and putting it down.
 *
 * Grab immediately on the geometric pinch, like GODHAND; tolerate a brief separation before release.
 *  - if the hand vanishes mid-carry, wait LOST_GRACE_S and then cancel, rather than dropping wherever
 *    the last good frame happened to be
 */
import type { Orientation } from './rules';

export const RELEASE_HOLD_S = 0.12;
export const LOST_GRACE_S = 0.12;

/** Radians away from "fingers up" before a held fence turns horizontal, and back. */
export const ROLL_TO_H = 0.62;
export const ROLL_TO_V = 0.38;

export interface GripSample {
  pinching: boolean;
}

export class GrabLatch {
  holding = false;
  private openT = 0;
  private missing = 0;

  update(sample: GripSample | null, dt: number): 'grab' | 'release' | 'cancel' | null {
    if (!sample) {
      this.missing += dt;
      this.openT = 0;
      if (this.holding && this.missing >= LOST_GRACE_S) {
        this.reset();
        return 'cancel';
      }
      return null;
    }
    this.missing = 0;
    if (!this.holding) {
      if (sample.pinching) {
        this.holding = true;
        this.openT = 0;
        return 'grab';
      }
      return null;
    }

    this.openT = sample.pinching ? 0 : this.openT + dt;
    if (this.openT >= RELEASE_HOLD_S) {
      this.reset();
      return 'release';
    }
    return null;
  }

  reset() {
    this.holding = false;
    this.openT = 0;
    this.missing = 0;
  }
}

/** 0 = fingers up or down (a vertical fence), π/2 = fingers to the side (a horizontal fence). */
export function tiltFromVertical(roll: number): number {
  const mod = Math.abs(roll) % Math.PI;
  return mod > Math.PI / 2 ? Math.PI - mod : mod;
}

export class RollLatch {
  o: Orientation = 'v';

  update(roll: number): Orientation {
    const tilt = tiltFromVertical(roll);
    if (this.o === 'v' && tilt >= ROLL_TO_H) this.o = 'h';
    else if (this.o === 'h' && tilt <= ROLL_TO_V) this.o = 'v';
    return this.o;
  }

  reset() { this.o = 'v'; }
}
