/**
 * Turns the engine's continuous pinch strength (0..1) into clean press / release edges.
 *
 * Two thresholds (hysteresis) so a pinch held near one value doesn't flicker on and off, and a low "on" threshold
 * because real pinches rarely reach 1: people stop when the fingertips touch, and tracking softens the gap.
 */
export const PINCH_ON = 0.6;
export const PINCH_OFF = 0.35;

export class PinchLatch {
  down = false;
  /** Feed the pinch strength each frame; returns 'press', 'release' or null. */
  update(pinch: number): 'press' | 'release' | null {
    if (!this.down && pinch >= PINCH_ON) { this.down = true; return 'press'; }
    if (this.down && pinch <= PINCH_OFF) { this.down = false; return 'release'; }
    return null;
  }
  reset() { this.down = false; }
}
