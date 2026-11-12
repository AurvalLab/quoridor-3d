import { describe, expect, it } from 'vitest';
import { GRAB_HOLD_S, GrabLatch, LOST_GRACE_S, RollLatch, tiltFromVertical } from '../src/grab';

const closed = { pinch: 0.75, openness: 0.2, pose: 'pinch' as const };
const fist = { pinch: 0.2, openness: 0.05, pose: 'fist' as const };
const open = { pinch: 0.1, openness: 0.9, pose: 'open' as const };

describe('grab latch', () => {
  it('a pinch or a fist grabs once it has been held, and a brush does not', () => {
    const pinch = new GrabLatch();
    expect(pinch.update(closed, GRAB_HOLD_S * 0.4)).toBeNull();
    expect(pinch.update({ pinch: 0.5, openness: 0.4, pose: null }, 0.05)).toBeNull();
    expect(pinch.update(closed, GRAB_HOLD_S)).toBe('grab');

    const brushed = new GrabLatch();
    expect(brushed.update(closed, GRAB_HOLD_S * 0.5)).toBeNull();
    expect(brushed.update(open, 0.05)).toBeNull();
    expect(brushed.update(closed, GRAB_HOLD_S * 0.7)).toBeNull();

    const byFist = new GrabLatch();
    expect(byFist.update(fist, GRAB_HOLD_S)).toBe('grab');
  });

  it('an open palm places the piece, but not before it has been carried', () => {
    const l = new GrabLatch();
    expect(l.update(fist, GRAB_HOLD_S)).toBe('grab');
    expect(l.update(open, 0.08)).toBeNull();
    expect(l.update(open, 0.2)).toBe('release');
    expect(l.holding).toBe(false);
  });

  it('jitter between the two pinch thresholds does not flap', () => {
    const l = new GrabLatch();
    const edges = [0.1, 0.5, 0.72, 0.5, 0.66, 0.48].map((pinch) => l.update({ pinch, openness: 0.4, pose: null }, GRAB_HOLD_S));
    expect(edges.filter(Boolean)).toEqual(['grab']);
    expect(l.update({ pinch: 0.5, openness: 0.4, pose: null }, 0.3)).toBeNull();
    expect(l.holding).toBe(true);
    expect(l.update(open, 0.2)).toBe('release');
  });

  it('a hand that disappears cancels the carry instead of dropping it', () => {
    const l = new GrabLatch();
    expect(l.update(closed, GRAB_HOLD_S)).toBe('grab');
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
