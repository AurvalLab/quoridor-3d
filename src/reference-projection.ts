export const REFERENCE_WIDTH = 1586;
export const REFERENCE_HEIGHT = 992;

// Measured outer corners of the nine-by-nine playing surface in the supplied artwork.
const [x0, y0, x1, y1, x2, y2, x3, y3] = [484, 231, 1107, 231, 1196, 760, 406, 760];
const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
const det = dx1 * dy2 - dx2 * dy1;
const g = (dx3 * dy2 - dx2 * dy3) / det;
const h = (dx1 * dy3 - dx3 * dy1) / det;
const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;

export function referencePoint(x: number, z: number) {
  const u = x / 9 + 0.5, v = z / 9 + 0.5;
  const w = g * u + h * v + 1;
  return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
}

export function referenceWorld(x: number, y: number) {
  const aa = a - x * g, bb = b - x * h, cc = d - y * g, dd = e - y * h;
  const ee = x - c, ff = y - f, denominator = aa * dd - bb * cc;
  if (Math.abs(denominator) < 1e-9) return null;
  return { x: ((ee * dd - bb * ff) / denominator - 0.5) * 9, z: ((aa * ff - ee * cc) / denominator - 0.5) * 9 };
}

export function referenceFrame(width: number, height: number) {
  const scale = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
  return { scale, x: (width - REFERENCE_WIDTH * scale) / 2, y: (height - REFERENCE_HEIGHT * scale) / 2 };
}

export const REFERENCE_STOCK = [{ x: 172, y: 755 }, { x: 1368, y: 343 }] as const;

export function referenceStockAt(x: number, y: number): 0 | 1 | null {
  if (x >= 25 && x <= 322 && y >= 694 && y <= 819) return 0;
  if (x >= 1230 && x <= 1510 && y >= 300 && y <= 389) return 1;
  return null;
}
