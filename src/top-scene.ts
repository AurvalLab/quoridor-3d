import { referenceFrame, REFERENCE_HEIGHT, REFERENCE_WIDTH } from './reference-projection';
import type { RenderState } from './scene';
import type { Player } from './rules';

/** The complete overhead artwork, with inventory restored from the full boxes. */
export class TopScene {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private empty = new Image();
  private full = new Image();

  constructor(stage: HTMLElement) {
    this.canvas.style.zIndex = '0';
    this.canvas.style.display = 'none';
    stage.append(this.canvas);
    this.empty.src = new URL('./assets/top-empty-v2.png', import.meta.url).href;
    this.full.src = new URL('./assets/top-full-stock.png', import.meta.url).href;
  }

  setEnabled(wanted: boolean) {
    const ready = wanted && this.empty.complete && !!this.empty.naturalWidth && this.full.complete && !!this.full.naturalWidth;
    this.canvas.style.display = ready ? 'block' : 'none';
    return ready;
  }

  render(s: RenderState, player: Player) {
    const width = innerWidth, height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2_000_000 / (width * height)));
    const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
    }
    this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    const c = this.ctx, frame = referenceFrame(width, height);
    c.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    c.fillStyle = '#1a100b'; c.fillRect(0, 0, width, height);
    c.translate(frame.x, frame.y); c.scale(frame.scale, frame.scale);
    if (player === 1) { c.translate(REFERENCE_WIDTH, REFERENCE_HEIGHT); c.rotate(Math.PI); }
    c.drawImage(this.empty, 0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
    for (const owner of [0, 1] as const) {
      const count = Math.max(0, s.remaining[owner] - (s.drag?.kind === 'fence' && s.drag.owner === owner ? 1 : 0));
      for (let i = 0; i < count; i++) {
        const x = (owner === 0 ? 118 : 1232) + i * 24.6, y = owner === 0 ? 753 : 298;
        c.drawImage(this.full, x, y, 16, 102, x, y, 16, 102);
      }
    }
  }
}
