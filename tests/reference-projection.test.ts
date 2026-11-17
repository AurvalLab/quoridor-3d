import { describe, expect, it } from 'vitest';
import { referenceFrame, referencePoint, referenceStockAt, referenceWorld, REFERENCE_STOCK } from '../src/reference-projection';

describe('reference scene input calibration', () => {
  it('matches the measured corners of the supplied image', () => {
    for (const [x, z, px, py] of [[-4.5, -4.5, 484, 231], [4.5, -4.5, 1107, 231], [4.5, 4.5, 1196, 760], [-4.5, 4.5, 406, 760]]) {
      const point = referencePoint(x, z);
      expect(point.x).toBeCloseTo(px, 8);
      expect(point.y).toBeCloseTo(py, 8);
    }
  });

  it('round-trips every cell and fence slot through the image projection', () => {
    for (let z = -4; z <= 4; z += 0.5) for (let x = -4; x <= 4; x += 0.5) {
      const p = referencePoint(x, z), result = referenceWorld(p.x, p.y)!;
      expect(result.x).toBeCloseTo(x, 8);
      expect(result.z).toBeCloseTo(z, 8);
    }
  });

  it('keeps photographed stock hit areas aligned independently of the 3D racks', () => {
    for (const owner of [0, 1] as const) {
      const p = REFERENCE_STOCK[owner], world = referenceWorld(p.x, p.y)!;
      const result = referencePoint(world.x, world.z);
      expect(referenceStockAt(result.x, result.y)).toBe(owner);
    }
    expect(referenceStockAt(800, 500)).toBe(null);
    expect(referenceStockAt(1200, 200)).toBe(null);
  });

  it('fits the full composition without cropping in wide or narrow viewports', () => {
    for (const [width, height] of [[1586, 992], [1440, 900], [1920, 1080], [375, 812]]) {
      const frame = referenceFrame(width, height);
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.x + 1586 * frame.scale).toBeLessThanOrEqual(width + 1e-6);
      expect(frame.y + 992 * frame.scale).toBeLessThanOrEqual(height + 1e-6);
    }
  });
});
