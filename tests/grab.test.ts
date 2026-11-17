import { describe, expect, it } from 'vitest';
import { GrabLatch, LOST_GRACE_S, RELEASE_HOLD_S, RollLatch, tiltFromVertical } from '../src/grab';

const closed = { pinching: true };
const open = { pinching: false };

describe('grab latch', () => {
  it('grabs on the first pinch frame with no hold or minimum carry delay', () => {
    const l = new GrabLatch();
    expect(l.update(open, 1 / 60)).toBeNull();
    expect(l.update(closed, 1 / 60)).toBe('grab');
    expect(l.update(closed, 1 / 60)).toBeNull();
    expect(l.update(open, RELEASE_HOLD_S)).toBe('release');
  });

  it('a short separation does not drop, and re-pinching resets the release timer', () => {
    const l = new GrabLatch();
    expect(l.update(closed, 1 / 60)).toBe('grab');
    expect(l.update(open, RELEASE_HOLD_S * 0.6)).toBeNull();
    expect(l.update(closed, 1 / 60)).toBeNull();
    expect(l.update(open, RELEASE_HOLD_S * 0.6)).toBeNull();
    expect(l.holding).toBe(true);
    expect(l.update(open, RELEASE_HOLD_S * 0.5)).toBe('release');
    expect(l.holding).toBe(false);
  });

  it('a hand that disappears cancels the carry instead of dropping it', () => {
    const l = new GrabLatch();
    expect(l.update(closed, 1 / 60)).toBe('grab');
    expect(l.update(null, LOST_GRACE_S * 0.5)).toBeNull();
    expect(l.holding).toBe(true);
    expect(l.update(closed, 0.02)).toBeNull();
    expect(l.update(null, LOST_GRACE_S)).toBe('cancel');
    expect(l.holding).toBe(false);
  });
});

describe('fence roll', () => {
  it('maps palm roll to horizontal or vertical, with a dead zone so it does not flicker', () => {
    expect(tiltFromVertical(0)).toBeCloseTo(0);
    expect(tiltFromVertical(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(tiltFromVertical(Math.PI)).toBeCloseTo(0);
    expect(tiltFromVertical(-Math.PI / 2)).toBeCloseTo(Math.PI / 2);

    const roll = new RollLatch();
    expect(roll.update(0)).toBe('v');
    expect(roll.update(0.5)).toBe('v');
    expect(roll.update(0.9)).toBe('h');
    expect(roll.update(0.5)).toBe('h');
    expect(roll.update(0.2)).toBe('v');
    expect(roll.update(-1.2)).toBe('h');
  });
});
