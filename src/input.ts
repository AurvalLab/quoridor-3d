/**
 * Every input source becomes the same hand: a screen point, a pinch, an openness, a palm roll.
 *
 *  - Camera: MediaPipe through the kit. A palm-local grip point stays still as the fingers close;
 *    toScreen maps a comfortable camera region onto the screen.
 *  - Mouse and touch: the pointer directly controls pickup and release.
 *    Right-click or R turns a fence.
 *  - Bot: src/bot.ts fills `bot` and it is injected the same way.
 *
 * Pointer and bot hands are real synthetic landmarks, so the game reads one pose, one roll, one pinch.
 */
import {
  createHands, fromScreen, syntheticHand, SYNTHETIC_POSES,
  type Hands, type HandInput, type HandPose, type Region, type Vec3,
} from './hand-gesture-kit';
import { HandPointer, pinchPoint } from './hand-pointer';

/** The part of the camera image that maps onto the whole screen. */
export const REGION: Region = { x0: 0.14, x1: 0.86, y0: 0.1, y1: 0.8 };

export type Mode = 'none' | 'camera' | 'pointer' | 'bot';
export type Shape = 'open' | 'pinch' | 'fist';

export interface HandView {
  /** Stabilized grip point on screen, 0..1, top to bottom. */
  screen: { x: number; y: number };
  pinch: number;
  pinching: boolean;
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

export class Input {
  readonly hands: Hands;
  mode: Mode = 'none';
  hand: HandView | null = null;
  /** Set by the bot each frame. */
  bot: BotHand | null = null;
  private ptr = { x: 0.5, y: 0.62, down: false, seen: false, id: -1 };
  private rotateQueued = false;
  /** A plain right-click sends both pointerdown and contextmenu. Dragging only sends contextmenu. */
  private pointerRotateAt = 0;
  private handPointer = new HandPointer();
  private handId = -1;
  private lastHandAt = -Infinity;

  constructor(video: HTMLVideoElement, el: HTMLElement) {
    this.hands = createHands({
      video,
      config: { pose: { experimental: false } },
      numHands: 1,
      onFrame: (f) => {
        if (this.mode === 'pointer') return;
        const h = f.hands[0];
        if (h && h.id !== this.handId) {
          this.handPointer = new HandPointer();
          this.handId = h.id;
        }
        if (h) this.lastHandAt = performance.now();
        const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
        this.hand = h ? {
          ...this.handPointer.update(h.landmarks, aspect, f.t / 1000, REGION, this.mode === 'camera'),
          openness: h.features.openness,
          roll: h.features.roll,
          pose: h.pose,
          landmarks: h.landmarks,
        } : null;
      },
    });
    const onUi = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, .card');
    const move = (e: PointerEvent) => {
      if (this.ptr.down && e.pointerId !== this.ptr.id) return;
      if (onUi(e.target)) return;
      this.ptr.x = e.clientX / innerWidth;
      this.ptr.y = e.clientY / innerHeight;
      this.ptr.seen = true;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { this.rotateQueued = true; this.pointerRotateAt = performance.now(); e.preventDefault(); return; }
      if (e.button !== 0 || onUi(e.target)) return;
      if (this.ptr.down) return;
      move(e);
      this.ptr.down = true;
      this.ptr.id = e.pointerId;
      el.setPointerCapture?.(e.pointerId);
    });
    const up = (e: PointerEvent) => { if (e.button === 0 && e.pointerId === this.ptr.id) { move(e); this.ptr.down = false; this.ptr.id = -1; } };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => { if (e.pointerId === this.ptr.id) { this.ptr.down = false; this.ptr.seen = false; this.ptr.id = -1; } });
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

  consumeRotate(): boolean {
    const v = this.rotateQueued;
    this.rotateQueued = false;
    return v;
  }

  async startCamera() { await this.hands.startCamera(); this.setMode('camera'); }

  setMode(m: Mode) {
    this.handPointer = new HandPointer();
    this.handId = -1;
    this.hand = null;
    this.ptr.down = false;
    this.ptr.id = -1;
    this.mode = m;
    this.hands.inject(m === 'camera' ? null : []);
  }

  update(_dt: number) {
    if (this.mode === 'camera') {
      if (performance.now() - this.lastHandAt > 150) this.hand = null;
      return;
    }
    if (this.mode === 'pointer') {
      const p = this.ptr;
      this.hand = p.seen ? { screen: { x: p.x, y: p.y }, pinch: Number(p.down), pinching: p.down,
        openness: Number(!p.down), roll: 0, pose: null, landmarks: [] } : null;
      return;
    }
    const out: HandInput[] = [];
    if (this.mode === 'bot' && this.bot) {
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
    const hand = syntheticHand(c.x, c.y, pose, { scale: 0.17 });
    const mid = pinchPoint(hand.landmarks);
    // The kit anchors syntheticHand at the palm; this game aims at the two fingertips.
    hand.landmarks = hand.landmarks.map((p) => ({ ...p, x: p.x + c.x - mid.x, y: p.y + c.y - mid.y }));
    return hand;
  }
}
