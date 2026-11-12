/**
 * Every input source becomes the same hand: a screen point, a pinch, an openness, a palm roll.
 *
 *  - Camera: MediaPipe through the kit. The palm centre goes through toScreen, so the edges of the
 *    frame are never required.
 *  - Mouse and touch: a synthetic hand at the pointer. Holding the button closes into a pinch.
 *    Right-click or R turns a fence. Touch uses the same path; the on-screen button calls requestRotate.
 *  - Bot: src/bot.ts fills `bot` and it is injected the same way.
 *
 * Pointer and bot hands are real synthetic landmarks, so the game reads one pose, one roll, one pinch.
 */
import {
  createHands, fromScreen, toScreen, syntheticHand, SYNTHETIC_POSES,
  type Hands, type HandInput, type HandPose, type Region, type Vec3,
} from './hand-gesture-kit';

/** The part of the camera image that maps onto the whole screen. */
export const REGION: Region = { x0: 0.14, x1: 0.86, y0: 0.1, y1: 0.8 };

export type Mode = 'none' | 'camera' | 'pointer' | 'bot';
export type Shape = 'open' | 'pinch' | 'fist';

export interface HandView {
  /** Palm centre on screen, 0..1, top to bottom. */
  screen: { x: number; y: number };
  pinch: number;
  openness: number;
  /** Radians. 0 is fingers up. */
  roll: number;
  pose: string | null;
  landmarks: Vec3[];
}

export interface BotHand {
  x: number;
  y: number;
  pinch: number;
  roll: number;
  shape: Shape;
}

/** Seconds for a held mouse button to close the pinch fully. */
const POINTER_PINCH_S = 0.08;

export class Input {
  readonly hands: Hands;
  mode: Mode = 'none';
  hand: HandView | null = null;
  /** Set by the bot each frame. */
  bot: BotHand | null = null;
  private ptr = { x: 0.5, y: 0.62, down: false, pinch: 0, seen: false, touch: false };
  private rotateQueued = false;
  /** A plain right-click sends both pointerdown and contextmenu. Dragging only sends contextmenu. */
  private pointerRotateAt = 0;

  constructor(video: HTMLVideoElement, el: HTMLElement) {
    this.hands = createHands({
      video,
      config: { pose: { experimental: false } },
      numHands: 1,
      onFrame: (f) => {
        const h = f.hands[0];
        this.hand = h ? {
          screen: toScreen(h.features.center, REGION),
          pinch: h.pinch,
          openness: h.features.openness,
          roll: h.features.roll,
          pose: h.pose,
          landmarks: h.landmarks,
        } : null;
      },
    });
    const onUi = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, .card');
    const move = (e: PointerEvent) => {
      if (onUi(e.target)) return;
      this.ptr.x = e.clientX / innerWidth;
      this.ptr.y = e.clientY / innerHeight;
      this.ptr.seen = true;
      this.ptr.touch = e.pointerType === 'touch';
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { this.rotateQueued = true; this.pointerRotateAt = performance.now(); e.preventDefault(); return; }
      if (e.button !== 0 || onUi(e.target)) return;
      move(e);
      this.ptr.down = true;
    });
    const up = (e: PointerEvent) => { if (e.button === 0) this.ptr.down = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { this.ptr.down = false; });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // While the left button is held, Chromium skips the button-2 pointerdown and only fires this.
      if (performance.now() - this.pointerRotateAt > 400) this.rotateQueued = true;
    });
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'r' || e.key === 'R') this.rotateQueued = true;
    });
  }

  /** The on-screen "turn fence" control. One tap, one turn. */
  requestRotate() { this.rotateQueued = true; }

  consumeRotate(): boolean {
    const v = this.rotateQueued;
    this.rotateQueued = false;
    return v;
  }

  async startCamera() { await this.hands.startCamera(); this.setMode('camera'); }

  setMode(m: Mode) {
    this.mode = m;
    this.hands.inject(m === 'camera' ? null : []);
  }

  update(dt: number) {
    if (this.mode === 'camera') return;
    const out: HandInput[] = [];
    if (this.mode === 'pointer' && this.ptr.seen) {
      const p = this.ptr;
      p.pinch = p.down ? Math.min(1, p.pinch + dt / POINTER_PINCH_S) : Math.max(0, p.pinch - dt / POINTER_PINCH_S);
      // The hand sits a little above a finger, so the finger doesn't cover the square it means.
      out.push(this.synth(p.x, p.touch ? p.y - 0.08 : p.y, 'pinch', p.pinch, 0));
    } else if (this.mode === 'bot' && this.bot) {
      const b = this.bot;
      out.push(this.synth(b.x, b.y, b.shape, b.shape === 'open' ? 0 : 1, b.roll));
    }
    this.hands.inject(out);
  }

  private synth(sx: number, sy: number, shape: Shape, pinch: number, roll: number): HandInput {
    const open = SYNTHETIC_POSES.open;
    const pin = SYNTHETIC_POSES.pinch;
    const blended: HandPose = {
      curl: open.curl.map((v, i) => v + (pin.curl[i] - v) * pinch) as HandPose['curl'],
      pinch,
      roll,
    };
    const pose = shape === 'fist' ? { ...SYNTHETIC_POSES.fist, roll } : blended;
    const c = fromScreen({ x: sx, y: sy }, REGION);
    return syntheticHand(c.x, c.y, pose, { scale: 0.17 });
  }
}
