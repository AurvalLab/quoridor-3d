import { LANDMARK as L, clamp01, toScreen, type Region, type Vec3 } from './hand-gesture-kit';

// GODHAND uses a palm-normalised gap and a palm-local grip offset, independent of pose labels.
export const PINCH_GAP_ON = 0.28;
export const PINCH_GAP_OFF = 0.42;

export function pinchPoint(points: Vec3[]) {
  const a = points[L.THUMB_TIP], b = points[L.INDEX_TIP];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export class HandPointer {
  private pinching = false;
  private lastT = -Infinity;
  private lastGap = 0;
  private gapSpeed = 0;
  private across = 0;
  private along = 0;

  update(points: Vec3[], aspect: number, t: number, region: Region, stabilize: boolean) {
    const dt = Math.min(0.1, Math.max(0.001, t - this.lastT));
    const fresh = t - this.lastT > 0.3;
    const distance = (a: number, b: number) => Math.hypot(
      (points[a].x - points[b].x) * aspect,
      points[a].y - points[b].y,
      (points[a].z - points[b].z) * aspect * 0.6,
    );
    const palmSize = Math.max(distance(L.WRIST, L.MIDDLE_MCP), distance(L.INDEX_MCP, L.PINKY_MCP) / 0.65, 1e-6);
    const gap = distance(L.THUMB_TIP, L.INDEX_TIP) / palmSize;
    const fingertipContact = distance(L.THUMB_TIP, L.INDEX_TIP) < 0.8 * distance(L.THUMB_TIP, L.INDEX_PIP);
    const indexReach = distance(L.WRIST, L.INDEX_TIP) / Math.max(distance(L.WRIST, L.INDEX_PIP), 1e-6);
    this.pinching = this.pinching && !fresh
      ? gap <= PINCH_GAP_OFF
      : gap < PINCH_GAP_ON && fingertipContact && indexReach > 0.78;

    const mid = pinchPoint(points);
    let aim = mid;
    if (stabilize) {
      const wrist = points[L.WRIST], knuckle = points[L.INDEX_MCP], middle = points[L.MIDDLE_MCP];
      const dx = (middle.x - wrist.x) * aspect, dy = middle.y - wrist.y;
      const size = Math.max(Math.hypot(dx, dy), 1e-6);
      const ux = dx / size, uy = dy / size;
      const mx = (mid.x - knuckle.x) * aspect, my = mid.y - knuckle.y;
      const across = (-uy * mx + ux * my) / size;
      const along = (ux * mx + uy * my) / size;
      if (fresh) {
        this.across = across;
        this.along = along;
        this.gapSpeed = 0;
      } else {
        this.gapSpeed += (1 - Math.exp(-dt / 0.05)) * (Math.abs(gap - this.lastGap) / dt - this.gapSpeed);
        const freeze = this.pinching ? 1 : Math.max(clamp01((0.75 - gap) / (0.75 - PINCH_GAP_ON)), clamp01((this.gapSpeed - 0.8) / 1.7));
        const follow = (1 - Math.exp(-dt / 0.09)) * (1 - freeze);
        this.across += follow * (across - this.across);
        this.along += follow * (along - this.along);
      }
      // Follow palm translation, rotation and scale; closing the fingers alone cannot drag the cursor.
      aim = {
        x: knuckle.x + size * (-uy * this.across + ux * this.along) / aspect,
        y: knuckle.y + size * (ux * this.across + uy * this.along),
      };
    }
    this.lastT = t;
    this.lastGap = gap;
    return { screen: toScreen(aim, region), pinching: this.pinching, pinch: clamp01((0.9 - gap) / 0.72) };
  }
}
