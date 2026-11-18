import type { RenderState } from './scene';
import { cellCenter, slotCenter } from './scene';
import { referenceFrame, referencePoint, REFERENCE_HEIGHT, REFERENCE_WIDTH } from './reference-projection';
import type { Cell, Player } from './rules';

type Sprite = { canvas: HTMLCanvasElement; x: number; y: number; anchorX: number; anchorY: number; pixels: Uint8ClampedArray };

/** Fixed-camera image-based scene: the original pixels stay intact outside changing game objects. */
export class ReferenceScene {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private original = new Image();
  private clean = new Image();
  private pawns: Sprite[] = [];
  private stock: Sprite[][] = [[], []];
  private fenceGrain = document.createElement('canvas');
  private ready = false;
  enabled = false;
  private wanted = false;

  constructor(stage: HTMLElement, private reverse = false) {
    this.canvas.className = 'reference-scene';
    this.canvas.style.display = 'none';
    stage.append(this.canvas);
    const loaded = () => {
      if (this.ready) return;
      if (!this.original.complete || !this.original.naturalWidth || !this.clean.complete || !this.clean.naturalWidth) return;
      this.prepareSprites();
      this.ready = true;
      this.setEnabled(this.wanted);
    };
    this.original.onload = this.clean.onload = loaded;
    this.original.src = reverse ? new URL('./assets/reference-jade-v2.png', import.meta.url).href : new URL('./assets/reference-table.png', import.meta.url).href;
    this.clean.src = reverse ? new URL('./assets/reference-jade-empty.png', import.meta.url).href : new URL('./assets/reference-clean.png', import.meta.url).href;
  }

  setEnabled(wanted: boolean) {
    this.wanted = wanted;
    this.enabled = this.ready && wanted;
    this.canvas.style.display = this.enabled ? 'block' : 'none';
    document.body.classList.toggle('image-scene', !!document.querySelector('.reference-scene[style*="display: block"]'));
    if (this.enabled) {
      const frame = referenceFrame(innerWidth, innerHeight);
      document.body.style.setProperty('--reference-scale', String(frame.scale));
      document.body.style.setProperty('--reference-x', `${frame.x}px`);
      document.body.style.setProperty('--reference-y', `${frame.y}px`);
    }
  }

  resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2_000_000 / (innerWidth * innerHeight)));
    this.canvas.width = Math.round(innerWidth * ratio);
    this.canvas.height = Math.round(innerHeight * ratio);
    this.canvas.style.width = `${innerWidth}px`;
    this.canvas.style.height = `${innerHeight}px`;
  }

  private sprite(x: number, y: number, w: number, h: number, path: Path2D, anchorX: number, anchorY: number): Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(-x, -y);
    ctx.clip(path);
    ctx.drawImage(this.original, 0, 0);
    return { canvas, x, y, anchorX: anchorX - x, anchorY: anchorY - y, pixels: ctx.getImageData(0, 0, w, h).data };
  }

  private prepareSprites() {
    if (this.reverse) {
      const near = new Path2D('M800 665 C790 665 783 672 783 682 C783 689 786 694 790 697 L786 701 C784 708 778 713 774 719 C769 724 769 731 773 736 C779 744 791 746 800 746 C813 746 825 742 828 735 C831 728 827 721 822 716 C817 711 814 706 813 700 L810 697 C815 693 817 688 817 682 C817 672 810 665 800 665 Z');
      const far = new Path2D('M794 196 C785 196 779 202 779 211 C779 218 782 223 786 225 L783 230 C782 239 778 244 773 249 C768 254 769 261 774 265 C779 269 788 271 795 271 C807 271 816 266 817 260 C818 255 815 250 810 246 C806 242 804 237 804 230 L802 225 C807 222 809 217 809 211 C809 202 803 196 794 196 Z');
      const hitSprite = (x: number, y: number, w: number, h: number, path: Path2D, anchorX: number, anchorY: number): Sprite => {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.translate(-x, -y);
        ctx.fillStyle = '#fff';
        ctx.fill(path);
        return { canvas, x, y, anchorX: anchorX - x, anchorY: anchorY - y, pixels: ctx.getImageData(0, 0, w, h).data };
      };
      this.pawns = [hitSprite(765, 663, 70, 87, near, 800, 735), hitSprite(764, 193, 64, 81, far, 795, 256)];
      for (let i = 0; i < 10; i++) {
        const topX = 70 + i * 26.55, botX = 53 + i * 27.15;
        const p = new Path2D();
        p.moveTo(topX - 1, 675); p.lineTo(topX + 10, 675); p.lineTo(botX + 10, 755);
        p.lineTo(botX + 10, 768); p.lineTo(botX - 1, 768); p.lineTo(botX - 1, 755); p.closePath();
        this.stock[0].push(this.sprite(Math.floor(botX) - 2, 674, 34, 96, p, botX, 768));
        const fTopX = 1239 + i * 24.8, fBotX = 1248 + i * 25.25;
        const f = new Path2D();
        f.moveTo(fTopX - 1, 299); f.lineTo(fTopX + 10, 299); f.lineTo(fBotX + 10, 359);
        f.lineTo(fBotX + 10, 371); f.lineTo(fBotX - 1, 371); f.lineTo(fBotX - 1, 359); f.closePath();
        this.stock[1].push(this.sprite(Math.floor(fTopX) - 2, 298, 26, 75, f, fBotX, 371));
      }
      this.fenceGrain.width = 68; this.fenceGrain.height = 8;
      const g = this.fenceGrain.getContext('2d')!; g.translate(68, 0); g.rotate(Math.PI / 2); g.drawImage(this.original, 68, 680, 8, 68, 0, 0, 8, 68);
      return;
    }
    // These paths mask photographed source pixels; they do not draw replacement pawn artwork.
    const white = new Path2D('M799 668 C809 668 817 676 817 686 C817 693 813 699 808 702 L810 706 C818 711 826 718 827 729 C828 740 817 747 799 747 C783 747 772 741 772 731 C772 720 779 713 787 707 L789 702 C784 699 781 693 781 686 C781 676 789 668 799 668 Z');
    const jade = new Path2D('M794 196 C785 196 779 202 779 211 C779 218 782 223 786 225 L782 227 L783 230 C782 239 778 243 773 248 C769 252 768 256 770 260 C772 266 783 270 795 270 C807 270 816 266 817 260 C818 255 815 250 810 246 C806 242 804 237 804 230 L805 227 L802 225 C807 222 809 217 809 211 C809 202 803 196 794 196 Z');
    this.pawns = [this.sprite(765, 665, 69, 90, white, 799, 737), this.sprite(764, 193, 64, 81, jade, 795, 256)];
    const whiteContext = this.pawns[0].canvas.getContext('2d')!;
    const whitePixels = whiteContext.getImageData(0, 0, 69, 90);
    for (let i = 0; i < whitePixels.data.length; i += 4) {
      const red = whitePixels.data[i], green = whitePixels.data[i + 1];
      whitePixels.data[i + 3] *= Math.max(0, Math.min(1, (38 - red + green) / 8, (red - 65) / 35));
    }
    whiteContext.putImageData(whitePixels, 0, 0);
    this.pawns[0].pixels = whitePixels.data;
    this.fenceGrain.width = 68; this.fenceGrain.height = 8;
    const grainContext = this.fenceGrain.getContext('2d')!;
    grainContext.translate(68, 0); grainContext.rotate(Math.PI / 2);
    grainContext.drawImage(this.original, 60, 710, 8, 68, 0, 0, 8, 68);
    for (let i = 0; i < 10; i++) {
      const near = new Path2D();
      const farX = 58 + i * 26.8, nearX = 38 + i * 27.5;
      near.moveTo(farX, 705); near.lineTo(farX + 11, 705); near.lineTo(farX + 18, 716);
      near.lineTo(nearX + 17, 801); near.lineTo(nearX + 5, 801); near.lineTo(nearX, 789); near.closePath();
      this.stock[0].push(this.sprite(nearX - 2, 702, 48, 103, near, nearX, 801));
      const topX = 1238 + i * 25.1, bottomX = 1250 + i * 25.7;
      const far = new Path2D();
      far.moveTo(topX, 303); far.lineTo(topX + 11, 303); far.lineTo(bottomX + 18, 359);
      far.lineTo(bottomX + 16, 374); far.lineTo(bottomX + 4, 374); far.lineTo(bottomX, 360); far.closePath();
      this.stock[1].push(this.sprite(topX - 2, 300, 48, 78, far, bottomX, 374));
    }
  }

  private patch(x: number, y: number, width: number, height: number, clip?: Path2D) {
    const c = this.ctx;
    c.save();
    if (clip) c.clip(clip);
    c.drawImage(this.clean, x * this.clean.naturalWidth / REFERENCE_WIDTH, y * this.clean.naturalHeight / REFERENCE_HEIGHT,
      width * this.clean.naturalWidth / REFERENCE_WIDTH, height * this.clean.naturalHeight / REFERENCE_HEIGHT, x, y, width, height);
    c.restore();
  }

  hitPawn(x: number, y: number, pawns: [Cell, Cell]): Player | null {
    const nearFirst = ([0, 1] as const).slice().sort((a, b) => pawns[a].r - pawns[b].r);
    for (const owner of nearFirst) {
      const cell = pawns[owner], sprite = this.pawns[owner];
      const at = cellCenter(cell.c, cell.r), p = referencePoint(at.x, at.z);
      const initialZ = owner === 0 ? 4 : -4;
      const initial = referencePoint(0, initialZ);
      const scale = Math.abs(referencePoint(at.x + 1, at.z).x - p.x) / Math.abs(referencePoint(1, initialZ).x - initial.x);
      const native = cell.c === 4 && cell.r === (owner === 0 ? 0 : 8);
      const left = native ? sprite.x : p.x - sprite.anchorX * scale, top = native ? sprite.y : p.y - sprite.anchorY * scale;
      const px = Math.floor((x - left) / (native ? 1 : scale)), py = Math.floor((y - top) / (native ? 1 : scale));
      if (px >= 0 && py >= 0 && px < sprite.canvas.width && py < sprite.canvas.height && sprite.pixels[(py * sprite.canvas.width + px) * 4 + 3] > 64) return owner;
    }
    return null;
  }

  private clearCell(column: number, row: number) {
    const centre = cellCenter(column, row);
    const corners = [referencePoint(centre.x - 0.5, centre.z - 0.5), referencePoint(centre.x + 0.5, centre.z - 0.5),
      referencePoint(centre.x + 0.5, centre.z + 0.5), referencePoint(centre.x - 0.5, centre.z + 0.5)];
    const path = new Path2D();
    corners.forEach((p, i) => { if (i === 0) path.moveTo(p.x, p.y); else path.lineTo(p.x, p.y); });
    path.closePath();
    const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
    this.patch(x, y, Math.max(...corners.map(p => p.x)) - x, Math.max(...corners.map(p => p.y)) - y, path);
  }

  private hud() {
    const text = (id: string) => document.getElementById(id)?.textContent || '';
    const visible = !document.getElementById('hud')!.classList.contains('hidden');
    if (!visible) { this.patch(0, 0, REFERENCE_WIDTH, 115); return; }
    const c = this.ctx;
    this.patch(0, 0, REFERENCE_WIDTH, 60);
    for (const player of [0, 1] as const) {
      const right = player === 1, edge = right ? REFERENCE_WIDTH - 50 : 50;
      c.fillStyle = player === 0 ? '#f2e9cf' : '#68b4ad';
      c.beginPath(); c.arc(right ? REFERENCE_WIDTH - 30 : 30, 29, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f6efe2'; c.textAlign = right ? 'right' : 'left'; c.font = 'bold 19px Georgia';
      c.fillText(text('color-' + player), edge, 27, 200);
      c.font = '13px Manrope'; c.fillStyle = 'rgba(246,239,226,.74)';
      c.fillText(right ? `${text('fences-1')} · ${text('name-1')}` : `${text('name-0')} · ${text('fences-0')}`, edge, 49, 200);
      c.fillStyle = document.getElementById('side-' + player)!.classList.contains('live') ? '#f6efe2' : 'rgba(246,239,226,.74)';
      c.textAlign = right ? 'left' : 'right'; c.font = 'bold 28px monospace';
      c.fillText(text('time-' + player), right ? REFERENCE_WIDTH - 335 : 335, 40, 110);
    }
    const turn = text('turn');
    {
      c.textAlign = 'center'; c.fillStyle = '#f6efe2';
      c.font = turn.length > 30 ? '22px Georgia' : 'bold 28px Georgia';
      c.fillText(turn, 793, 37, 860);
    }
    this.patch(1417, 65, 156, 44);
  }

  render(s: RenderState) {
    if (!this.enabled) return;
    const c = this.ctx, frame = referenceFrame(innerWidth, innerHeight);
    const ratioX = this.canvas.width / innerWidth, ratioY = this.canvas.height / innerHeight;
    c.setTransform(ratioX, 0, 0, ratioY, 0, 0);
    c.fillStyle = '#1a100b'; c.fillRect(0, 0, innerWidth, innerHeight);
    c.translate(frame.x, frame.y); c.scale(frame.scale, frame.scale);
    c.drawImage(this.original, 0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
    const dynamic = !this.reverse;
    const initialLegal = s.showLegal && s.legal.length === 3 && s.legal.every(p => (p.r === 0 && (p.c === 3 || p.c === 5)) || (p.c === 4 && p.r === 1));
    if (dynamic && (!initialLegal || dynamic)) {
      for (const [column, row] of [[3, 0], [4, 1], [5, 0]]) this.clearCell(column, row);
    }
    if (dynamic) { this.clearCell(4, 0); this.clearCell(4, 1); this.patch(762, 190, 72, 85); }
    for (const owner of [0, 1] as const) {
      const remaining = Math.max(0, s.remaining[owner] - (s.drag?.kind === 'fence' && s.drag.owner === owner ? 1 : 0));
      const start = owner === 0 ? 0 : 10 - remaining;
      const end = owner === 0 ? remaining : 10;
      if (remaining < 10) {
        const polygon = this.reverse
          ? new Path2D(owner === 0 ? 'M50 672 L322 672 L306 769 L34 769 Z' : 'M1232 298 L1492 298 L1506 372 L1246 372 Z')
          : new Path2D(owner === 0 ? 'M53 697 L316 697 L307 809 L25 809 Z' : 'M1231 299 L1490 299 L1511 380 L1248 381 Z');
        if (this.reverse) {
          if (owner === 0) this.patch(32, 670, 292, 101, polygon);
          else this.patch(1230, 296, 278, 78, polygon);
        } else {
          if (owner === 0) this.patch(24, 696, 295, 115, polygon);
          else this.patch(1230, 298, 283, 85, polygon);
        }
        for (let i = start; i < end; i++) { const sprite = this.stock[owner][i]; c.drawImage(sprite.canvas, sprite.x, sprite.y); }
      }
    }
    if ((!initialLegal || dynamic) && s.showLegal) for (const cell of s.legal) {
      const p = cellCenter(cell.c, cell.r), point = referencePoint(p.x, p.z);
      c.fillStyle = '#f5dfb3'; c.beginPath(); c.ellipse(point.x, point.y, 5, 4, 0, 0, Math.PI * 2); c.fill();
    }
    const drag = s.drag;
    if (drag?.kind === 'pawn') {
      if (drag.cell) {
        const p = cellCenter(drag.cell.c, drag.cell.r), point = referencePoint(p.x, p.z);
        c.fillStyle = drag.legal ? 'rgba(57,183,102,.3)' : 'rgba(220,70,60,.3)';
        c.fillRect(point.x - 30, point.y - 20, 60, 40);
      }
    } else if (drag?.kind === 'fence') {
      if (drag.slot) {
        const p = slotCenter(drag.slot.c, drag.slot.r);
        const a = referencePoint(p.x - (drag.o === 'h' ? 0.93 : 0), p.z - (drag.o === 'v' ? 0.93 : 0));
        const b = referencePoint(p.x + (drag.o === 'h' ? 0.93 : 0), p.z + (drag.o === 'v' ? 0.93 : 0));
        c.save(); c.strokeStyle = drag.legal ? '#45dc82' : '#f15b50'; c.lineWidth = 10;
        c.lineCap = 'round'; c.shadowColor = c.strokeStyle; c.shadowBlur = 12;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.restore();
      }
    }
    if (s.cursor) {
      const p = referencePoint(s.cursor.x, s.cursor.z);
      c.strokeStyle = s.drag ? s.drag.legal ? '#8ee0b0' : '#f0a090' : 'rgba(255,241,220,.8)';
      c.lineWidth = 2; c.beginPath(); c.ellipse(p.x, p.y, 10, 6, 0, 0, Math.PI * 2); c.stroke();
    }
    this.hud();
  }
}
