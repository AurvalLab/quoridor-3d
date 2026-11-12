// The gestures this game asks for must be recognised from synthetic hands through the real engine,
// for both hands. The pinch latch is the same hysteresis the grab latch is built on.
import { describe, expect, it } from 'vitest';
import { GestureEngine, syntheticHand, SYNTHETIC_POSES as P, type HandPose } from '../src/hand-gesture-kit';
import { tiltFromVertical } from '../src/grab';
import { PinchLatch } from '../src/pinch';

const run = (pose: HandPose, handedness: 'Left' | 'Right' = 'Right', frames = 12) => {
  const e = new GestureEngine({ pose: { experimental: false } });
  let f = e.update([syntheticHand(0.5, 0.5, pose, { handedness })], 0);
  for (let i = 1; i < frames; i++) f = e.update([syntheticHand(0.5, 0.5, pose, { handedness })], i * 33);
  return f.hands[0];
};

describe('gestures', () => {
  for (const hand of ['Left', 'Right'] as const) {
    it(`${hand} pinch reads as a strong pinch, an open hand as none`, () => {
      expect(run(P.pinch, hand).pinch).toBeGreaterThan(0.75);
      expect(run(P.open, hand).pinch).toBeLessThan(0.3);
    });

    it(`${hand} fist, pinch and open palm are the poses the game uses to carry a piece`, () => {
      expect(run(P.fist, hand).pose).toBe('fist');
      expect(run(P.open, hand).pose).toBe('open');
      expect(run(P.pinch, hand).pinch).toBeGreaterThan(0.75);
      expect(run(P.open, hand).features.openness).toBeGreaterThan(0.7);
    });

    it(`${hand} palm roll is readable on the features the fence follows`, () => {
      const flat = run(P.open, hand);
      const turned = run({ ...P.open, roll: Math.PI / 2 }, hand);
      expect(tiltFromVertical(flat.features.roll)).toBeLessThan(0.35);
      expect(tiltFromVertical(turned.features.roll)).toBeGreaterThan(1);
    });
  }

  it('the latch gives one press and one release for a pinch with jitter', () => {
    const l = new PinchLatch();
    const edges = [0.1, 0.4, 0.65, 0.55, 0.7, 0.45, 0.5, 0.3, 0.4, 0.2].map((p) => l.update(p)).filter(Boolean);
    expect(edges).toEqual(['press', 'release']);
  });
});
