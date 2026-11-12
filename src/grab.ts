/**
 * Anti-mis-touch for picking a piece up and putting it down.
 *
 * Tracking flickers, and a board game punishes a stray drop. The thresholds match the starter:
 * a pinch grabs at 0.6 and lets go at 0.35, so a value wobbling in between does not flap.
 * A fist counts as a grab too. Putting the piece down takes an open palm, not merely a looser pinch.
 *
 * Time gates, on top of the thresholds:
 *  - the closed shape must hold for GRAB_HOLD_S before anything lifts
 *  - the piece must be carried for CARRY_MIN_S before an open palm can place it
 *  - the open palm itself must hold for RELEASE_HOLD_S
 *  - if the hand vanishes mid-carry, wait LOST_GRACE_S and then cancel, rather than dropping wherever
 *    the last good frame happened to be
 */
import { PINCH_OFF, PINCH_ON } from './pinch';
import type { Orientation } from './rules';

export const GRAB_HOLD_S = 0.12;
export const RELEASE_HOLD_S = 0.1;
export const CARRY_MIN_S = 0.18;
export const LOST_GRACE_S = 0.4;
/** Mean finger extension that reads as an open palm. */
export const OPEN_PALM = 0.62;

/** Radians away from "fingers up" before a held fence turns horizontal, and back. */
export const ROLL_TO_H = 0.62;
export const ROLL_TO_V = 0.38;

export interface GripSample {
  pinch: number;
  openness: number;
  pose: string | null;
}

export class GrabLatch {
  holding = false;
  private arming = false;
  private closeT = 0;
  private openT = 0;
  private carried = 0;
  private missing = 0;

  update(sample: GripSample | null, dt: number): 'grab' | 'release' | 'cancel' | null {
    if (!sample) {
      this.missing += dt;
      this.closeT = 0;
      this.openT = 0;
      if (this.holding && this.missing >= LOST_GRACE_S) {
        this.reset();
        return 'cancel';
      }
      if (!this.holding) this.arming = false;
      return null;
    }
    this.missing = 0;
    const fist = sample.pose === 'fist';
    const closing = sample.pinch >= PINCH_ON || fist;
    const unclosing = sample.pinch <= PINCH_OFF && !fist;

    if (!this.holding) {
      if (closing) this.arming = true;
      else if (unclosing) this.arming = false;
      this.closeT = this.arming ? this.closeT + dt : 0;
      if (this.closeT >= GRAB_HOLD_S) {
        this.holding = true;
        this.carried = 0;
        this.openT = 0;
        this.closeT = 0;
        return 'grab';
      }
      return null;
    }

    this.carried += dt;
    const opening = sample.pinch <= PINCH_OFF && sample.openness >= OPEN_PALM;
    this.openT = opening ? this.openT + dt : 0;
    if (this.carried >= CARRY_MIN_S && this.openT >= RELEASE_HOLD_S) {
      this.reset();
      return 'release';
    }
    return null;
  }

  reset() {
    this.holding = false;
    this.arming = false;
    this.closeT = 0;
    this.openT = 0;
    this.carried = 0;
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
