import { describe, expect, it } from 'vitest';
import { HandPointer, pinchPoint } from '../src/hand-pointer';
import { LANDMARK as L, syntheticHand, SYNTHETIC_POSES as P, toScreen } from '../src/hand-gesture-kit';
import { REGION } from '../src/input';

describe('GODHAND-style geometric pinch and stable grip point', () => {
  for (const handedness of ['Left', 'Right'] as const) {
    it(`${handedness} closing fingers does not move the cursor, but moving the palm does`, () => {
      const pointer = new HandPointer();
      const rest = syntheticHand(0.5, 0.5, P.relaxed, { handedness });
      const first = pointer.update(rest.landmarks, 16 / 9, 0, REGION, true);
      let last = first;
      for (let i = 1; i <= 30; i++) {
        const pinch = Math.min(1, i / 10);
        const pose = { curl: P.relaxed.curl.map((v, j) => v + (P.pinch.curl[j] - v) * pinch) as typeof P.pinch.curl, pinch };
        const h = syntheticHand(0.5, 0.5, pose, { handedness });
        last = pointer.update(h.landmarks, 16 / 9, i / 30, REGION, true);
      }
      const closed = syntheticHand(0.5, 0.5, P.pinch, { handedness });
      const raw = toScreen(pinchPoint(closed.landmarks), REGION), rawRest = toScreen(pinchPoint(rest.landmarks), REGION);
      expect(Math.hypot(raw.x - rawRest.x, raw.y - rawRest.y)).toBeGreaterThan(0.03);
      expect(Math.hypot(last.screen.x - first.screen.x, last.screen.y - first.screen.y)).toBeLessThan(0.015);
      expect(last.pinching).toBe(true);
      const moved = closed.landmarks.map((p) => ({ ...p, x: p.x + 0.072, y: p.y + 0.07 }));
      const carried = pointer.update(moved, 16 / 9, 31 / 30, REGION, true);
      expect(carried.screen.x - last.screen.x).toBeCloseTo(0.1, 5);
      expect(carried.screen.y - last.screen.y).toBeCloseTo(0.1, 5);
    });
  }

  it('uses a 0.28/0.42 palm-normalised gap with hysteresis', () => {
    const pointer = new HandPointer();
    const points = syntheticHand(0.5, 0.5, P.pinch).landmarks;
    const dist = (a: number, b: number) => Math.hypot((points[a].x - points[b].x) * 16 / 9, points[a].y - points[b].y, (points[a].z - points[b].z) * 16 / 9 * 0.6);
    const palm = Math.max(dist(L.WRIST, L.MIDDLE_MCP), dist(L.INDEX_MCP, L.PINKY_MCP) / 0.65);
    const states = [0.36, 0.27, 0.36, 0.41, 0.43].map((gap, i) => {
      const sample = points.map((p) => ({ ...p }));
      sample[L.THUMB_TIP] = { ...sample[L.INDEX_TIP], x: sample[L.INDEX_TIP].x + gap * palm / (16 / 9) };
      return pointer.update(sample, 16 / 9, i / 30, REGION, false).pinching;
    });
    expect(states).toEqual([false, true, true, true, false]);
  });

  it('requires fingertip contact, not a thumb near a folded index finger', () => {
    const pointer = new HandPointer();
    const fist = syntheticHand(0.5, 0.5, P.fist);
    expect(pointer.update(fist.landmarks, 16 / 9, 0, REGION, true).pinching).toBe(false);
  });
});
