import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GrabLatch } from '../src/grab';
import { Input, REGION } from '../src/input';
import { fromScreen, screenHandLandmarks, SYNTHETIC_POSES as P, type HandInput, type HandPose } from '../src/hand-gesture-kit';

let tick: FrameRequestCallback;
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { tick = cb; return 1; });
  vi.stubGlobal('addEventListener', vi.fn());
  vi.stubGlobal('Element', class {});
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 1000);
});
afterEach(() => vi.unstubAllGlobals());

describe('two-finger input through the real gesture engine', () => {
  for (const handedness of ['Left', 'Right'] as const) {
    it(`${handedness} aims at the fingertips and releases without opening the palm`, () => {
      const input = new Input({} as HTMLVideoElement, new EventTarget() as unknown as HTMLElement);
      const grip = new GrabLatch();
      const c = fromScreen({ x: 0.4, y: 0.6 }, REGION);
      const edges: string[] = [];
      const feed = (pose: HandPose) => {
        const hand: HandInput = { landmarks: screenHandLandmarks(c.x, c.y, pose, { handedness }), handedness };
        for (let i = 0; i < 20; i++) {
          input.hands.feed([[hand]]);
          const edge = grip.update(input.hand, 1 / 30);
          if (edge) edges.push(edge);
        }
      };
      feed({ curl: [0, 0.5, 1, 1, 1], pinch: 1 });
      expect(input.hand!.screen.x).toBeCloseTo(0.4, 3);
      expect(input.hand!.screen.y).toBeCloseTo(0.6, 3);
      expect(grip.holding).toBe(true);
      feed({ curl: [0, 0.5, 1, 1, 1], pinch: 0 });
      expect(input.hand!.openness).toBeLessThan(0.62);
      expect(edges).toEqual(['grab', 'release']);
      expect(grip.holding).toBe(false);
    });

    it(`${handedness} fist alone does not grab`, () => {
      const input = new Input({} as HTMLVideoElement, new EventTarget() as unknown as HTMLElement);
      const grip = new GrabLatch();
      const hand: HandInput = { landmarks: screenHandLandmarks(0.5, 0.5, P.fist, { handedness }), handedness };
      for (let i = 0; i < 20; i++) {
        input.hands.feed([[hand]]);
        expect(grip.update(input.hand, 1 / 30)).toBeNull();
      }
      expect(grip.holding).toBe(false);
    });
  }

  it('mouse aiming stays at the pointer while pinching and releasing', () => {
    const el = new EventTarget();
    const input = new Input({} as HTMLVideoElement, el as unknown as HTMLElement);
    input.setMode('pointer');
    const event = (name: string) => {
      const e = new Event(name);
      Object.assign(e, { clientX: 400, clientY: 600, button: 0, pointerType: 'mouse' });
      el.dispatchEvent(e);
    };
    let t = performance.now();
    for (const name of ['pointermove', 'pointerdown', 'pointerup']) {
      event(name);
      for (let i = 0; i < 20; i++) { input.update(1 / 30); tick(t += 1000 / 30); }
      expect(input.hand!.screen.x).toBeCloseTo(0.4, 2);
      expect(input.hand!.screen.y).toBeCloseTo(0.6, 2);
    }
  });

  it('touch grabs immediately at the finger and cancels without dropping', () => {
    const el = new EventTarget();
    const input = new Input({} as HTMLVideoElement, el as unknown as HTMLElement);
    input.setMode('pointer');
    const event = (name: string, x: number, y: number) => {
      const e = new Event(name);
      Object.assign(e, { clientX: x, clientY: y, button: 0, pointerType: 'touch', pointerId: 7 });
      el.dispatchEvent(e);
      input.update(1 / 60);
    };
    event('pointerdown', 400, 600);
    expect(input.hand?.pinching).toBe(true);
    expect(input.hand?.screen).toEqual({ x: 0.4, y: 0.6 });
    event('pointermove', 500, 300);
    expect(input.hand?.screen).toEqual({ x: 0.5, y: 0.3 });
    event('pointercancel', 500, 300);
    expect(input.hand).toBeNull();
  });

  it('expires a frozen camera sample instead of leaving a piece stuck to it', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const input = new Input({} as HTMLVideoElement, new EventTarget() as unknown as HTMLElement);
    input.setMode('camera');
    input.hands.feed([[{ landmarks: screenHandLandmarks(0.5, 0.5, P.pinch), handedness: 'Right' }]]);
    expect(input.hand?.pinching).toBe(true);
    now.mockReturnValue(1170);
    input.update(1 / 60);
    expect(input.hand).toBeNull();
    now.mockRestore();
  });
});
