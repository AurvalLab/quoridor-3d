/**
 * Opening roll. Each player throws two dice from their own side of the board.
 * The higher total moves first. A tie is thrown again.
 *
 * The motion follows the same idea as the Oimo dice in Spute/3d-dice-three-js:
 * a heavy gravity, a bouncing rigid cube, spin, then a rest on the table.
 * This solver stays in plain TypeScript so the room service and the browser
 * step the same throw and agree on the faces. No three.js here.
 */
import type { Player } from './rules';

export const DIE_HALF = 0.3;
export const BOARD_Y = 0.08;
const STEP = 1 / 120;
const GRAVITY = -32;
const MASS = 0.9;
const INERTIA = MASS * (DIE_HALF * 2) ** 2 / 6;
const INV_M = 1 / MASS;
const INV_I = 1 / INERTIA;
const LIMIT = 3.55;
const GAP = 0.48;
const MAX_ATTEMPTS = 8;

export interface DiePose {
  owner: Player;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Top face once this throw has settled. Null while the die is still tumbling. */
  face: number | null;
}

export interface RollAttempt {
  faces: [number, number, number, number];
  totals: [number, number];
}

export interface OpeningResult {
  seed: number;
  attempts: RollAttempt[];
  first: Player;
}

interface V3 { x: number; y: number; z: number }
interface Quat { x: number; y: number; z: number; w: number }
interface Die {
  owner: Player;
  p: V3;
  v: V3;
  q: Quat;
  w: V3;
}

const CORNERS: V3[] = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
  CORNERS.push({ x: x * DIE_HALF, y: y * DIE_HALF, z: z * DIE_HALF });
}

const FACE_AXIS: { v: V3; face: number }[] = [
  { v: { x: 0, y: 1, z: 0 }, face: 1 },
  { v: { x: 0, y: -1, z: 0 }, face: 6 },
  { v: { x: 0, y: 0, z: 1 }, face: 2 },
  { v: { x: 0, y: 0, z: -1 }, face: 5 },
  { v: { x: 1, y: 0, z: 0 }, face: 3 },
  { v: { x: -1, y: 0, z: 0 }, face: 4 },
];

const UP: V3 = { x: 0, y: 1, z: 0 };

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function winnerOf(totals: [number, number]): Player | null {
  if (totals[0] === totals[1]) return null;
  return totals[0] > totals[1] ? 0 : 1;
}

function qnorm(q: Quat): Quat {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  const s = q.w < 0 ? -1 / l : 1 / l;
  return { x: q.x * s, y: q.y * s, z: q.z * s, w: q.w * s };
}

function qmul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function rotateVec(q: Quat, v: V3): V3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function add(a: V3, b: V3): V3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function randomQuat(rng: () => number): Quat {
  const u1 = rng();
  const u2 = rng() * Math.PI * 2;
  const u3 = rng() * Math.PI * 2;
  const s1 = Math.sqrt(1 - u1);
  const s2 = Math.sqrt(u1);
  return qnorm({ x: s1 * Math.sin(u2), y: s1 * Math.cos(u2), z: s2 * Math.sin(u3), w: s2 * Math.cos(u3) });
}

function quatFromTo(from: V3, to: V3): Quat {
  const dot = from.x * to.x + from.y * to.y + from.z * to.z;
  if (dot > 0.9999) return { x: 0, y: 0, z: 0, w: 1 };
  if (dot < -0.9999) {
    const ax = Math.abs(from.x) < 0.9 ? 1 : 0;
    const az = ax ? 0 : 1;
    const cx = from.y * az - from.z * 0;
    const cy = from.z * ax - from.x * az;
    const cz = from.x * 0 - from.y * ax;
    const l = Math.hypot(cx, cy, cz) || 1;
    return { x: cx / l, y: cy / l, z: cz / l, w: 0 };
  }
  return qnorm({
    x: from.y * to.z - from.z * to.y,
    y: from.z * to.x - from.x * to.z,
    z: from.x * to.y - from.y * to.x,
    w: 1 + dot,
  });
}

function topFace(q: Quat): { face: number; normal: V3 } {
  let face = 1;
  let normal = UP;
  let best = -2;
  for (const axis of FACE_AXIS) {
    const world = rotateVec(q, axis.v);
    if (world.y > best) { best = world.y; face = axis.face; normal = world; }
  }
  return { face, normal };
}

/** 180° around Y, so a die follows the board when Jade's view is mirrored. */
export function flipDiePose(d: DiePose): DiePose {
  const q = qnorm(qmul({ x: 0, y: 1, z: 0, w: 0 }, { x: d.qx, y: d.qy, z: d.qz, w: d.qw }));
  return { ...d, x: -d.x, z: -d.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
}

function impulse(d: Die, point: V3, normal: V3, restitution: number, friction: number): number {
  const rx = point.x - d.p.x;
  const ry = point.y - d.p.y;
  const rz = point.z - d.p.z;
  const vx = d.v.x + (d.w.y * rz - d.w.z * ry);
  const vy = d.v.y + (d.w.z * rx - d.w.x * rz);
  const vz = d.v.z + (d.w.x * ry - d.w.y * rx);
  const vn = vx * normal.x + vy * normal.y + vz * normal.z;
  if (vn >= -0.02) return 0;
  const cx = ry * normal.z - rz * normal.y;
  const cy = rz * normal.x - rx * normal.z;
  const cz = rx * normal.y - ry * normal.x;
  const denom = INV_M + INV_I * (cx * cx + cy * cy + cz * cz);
  const e = Math.abs(vn) < 1.15 ? 0.04 : restitution;
  const j = -(1 + e) * vn / denom;
  d.v.x += normal.x * j * INV_M;
  d.v.y += normal.y * j * INV_M;
  d.v.z += normal.z * j * INV_M;
  d.w.x += cx * j * INV_I;
  d.w.y += cy * j * INV_I;
  d.w.z += cz * j * INV_I;

  let tx = vx - normal.x * vn;
  let ty = vy - normal.y * vn;
  let tz = vz - normal.z * vn;
  const speed = Math.hypot(tx, ty, tz);
  if (speed > 1e-4) {
    tx /= speed; ty /= speed; tz /= speed;
    const fx = ry * tz - rz * ty;
    const fy = rz * tx - rx * tz;
    const fz = rx * ty - ry * tx;
    const td = INV_M + INV_I * (fx * fx + fy * fy + fz * fz);
    let jt = -speed / td;
    const cap = friction * j;
    if (jt < -cap) jt = -cap;
    if (jt > cap) jt = cap;
    d.v.x += tx * jt * INV_M;
    d.v.y += ty * jt * INV_M;
    d.v.z += tz * jt * INV_M;
    d.w.x += fx * jt * INV_I;
    d.w.y += fy * jt * INV_I;
    d.w.z += fz * jt * INV_I;
  }
  return j;
}

function worldCorners(d: Die): V3[] {
  return CORNERS.map(local => add(d.p, rotateVec(d.q, local)));
}

function collideFloor(d: Die): number {
  let deepest: V3 | null = null;
  let depth = 0;
  for (const corner of worldCorners(d)) {
    const pen = BOARD_Y - corner.y;
    if (pen > depth) { depth = pen; deepest = corner; }
  }
  if (!deepest || depth <= 0) return 0;
  const lift = Math.min(depth, 0.06);
  d.p.y += lift;
  deepest.y += lift;
  const vn = d.v.y + (d.w.z * (deepest.x - d.p.x) - d.w.x * (deepest.z - d.p.z));
  const bounce = vn < -1.4 ? 0.36 : 0;
  return impulse(d, deepest, UP, bounce, 0.92);
}

function clampAxis(d: Die, axis: 'x' | 'z', min: number, max: number): number {
  const value = d.p[axis];
  if (value >= min && value <= max) return 0;
  const normal: V3 = axis === 'x'
    ? { x: value < min ? 1 : -1, y: 0, z: 0 }
    : { x: 0, y: 0, z: value < min ? 1 : -1 };
  d.p[axis] = value < min ? min : max;
  return impulse(d, { x: d.p.x, y: Math.max(d.p.y, BOARD_Y + DIE_HALF), z: d.p.z }, normal, 0.18, 0.45);
}

function collideBounds(d: Die): number {
  if (d.p.y > BOARD_Y + 0.95) return 0;
  let hit = clampAxis(d, 'x', -LIMIT, LIMIT);
  hit += d.owner === 0 ? clampAxis(d, 'z', GAP, LIMIT) : clampAxis(d, 'z', -LIMIT, -GAP);
  return hit;
}

function collidePair(a: Die, b: Die): number {
  const dx = b.p.x - a.p.x;
  const dy = b.p.y - a.p.y;
  const dz = b.p.z - a.p.z;
  const dist = Math.hypot(dx, dy, dz) || 1e-6;
  const min = DIE_HALF * 2 * 0.96;
  if (dist >= min) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  const pen = min - dist;
  const shove = ny > 0.65 ? 1.4 : 0.5;
  a.p.x -= nx * pen * shove;
  a.p.y -= ny * pen * 0.5;
  a.p.z -= nz * pen * shove;
  b.p.x += nx * pen * shove;
  b.p.y += ny * pen * 0.5;
  b.p.z += nz * pen * shove;
  const rvx = b.v.x - a.v.x;
  const rvy = b.v.y - a.v.y;
  const rvz = b.v.z - a.v.z;
  const vn = rvx * nx + rvy * ny + rvz * nz;
  if (vn > 0) return 0;
  const j = -(1 + 0.2) * vn / (INV_M * 2);
  a.v.x -= nx * j * INV_M;
  a.v.y -= ny * j * INV_M;
  a.v.z -= nz * j * INV_M;
  b.v.x += nx * j * INV_M;
  b.v.y += ny * j * INV_M;
  b.v.z += nz * j * INV_M;
  if (ny > 0.45) {
    const side = Math.abs(nx) > Math.abs(nz) ? nz : nx;
    const sign = side >= 0 ? 1 : -1;
    a.v.x -= sign * 0.4;
    b.v.x += sign * 0.4;
  }
  return j;
}

function assistFlat(d: Die, dt: number) {
  const speed = Math.hypot(d.v.x, d.v.y, d.v.z);
  const spin = Math.hypot(d.w.x, d.w.y, d.w.z);
  if (speed > 2.4 || spin > 8) return;
  const { normal } = topFace(d.q);
  if (normal.y < 0.55) return;
  const gain = (normal.y > 0.85 ? 42 : 16) * dt;
  d.w.x += -normal.z * gain;
  d.w.z += normal.x * gain;
  if (speed < 1.2) {
    d.v.x *= 0.92;
    d.v.z *= 0.92;
    d.w.y *= 0.9;
  }
}

function integrate(d: Die, dt: number) {
  d.v.y += GRAVITY * dt;
  const drag = Math.exp(-0.85 * dt);
  const spinDrag = Math.exp(-1.15 * dt);
  d.v.x *= drag; d.v.y *= drag; d.v.z *= drag;
  d.w.x *= spinDrag; d.w.y *= spinDrag; d.w.z *= spinDrag;
  d.p.x += d.v.x * dt;
  d.p.y += d.v.y * dt;
  d.p.z += d.v.z * dt;
  const mag = Math.hypot(d.w.x, d.w.y, d.w.z);
  if (mag > 1e-6) {
    const half = mag * dt * 0.5;
    const s = Math.sin(half) / mag;
    d.q = qnorm(qmul({ x: d.w.x * s, y: d.w.y * s, z: d.w.z * s, w: Math.cos(half) }, d.q));
  }
  assistFlat(d, dt);
}

function resting(d: Die): boolean {
  if (Math.hypot(d.v.x, d.v.y, d.v.z) > 0.38) return false;
  if (Math.hypot(d.w.x, d.w.y, d.w.z) > 0.9) return false;
  let minY = Infinity;
  for (const corner of worldCorners(d)) minY = Math.min(minY, corner.y);
  return minY < BOARD_Y + 0.045 && d.p.y < BOARD_Y + DIE_HALF + 0.2;
}

function settleDie(d: Die) {
  const { normal } = topFace(d.q);
  d.q = qnorm(qmul(quatFromTo(normal, UP), d.q));
  d.v = { x: 0, y: 0, z: 0 };
  d.w = { x: 0, y: 0, z: 0 };
  let minY = Infinity;
  for (const corner of worldCorners(d)) minY = Math.min(minY, corner.y);
  d.p.y += BOARD_Y - minY;
  d.p.x = Math.max(-LIMIT, Math.min(LIMIT, d.p.x));
  d.p.z = d.owner === 0 ? Math.max(GAP, Math.min(LIMIT, d.p.z)) : Math.max(-LIMIT, Math.min(-GAP, d.p.z));
}

function throwDice(rng: () => number): Die[] {
  const dice: Die[] = [];
  for (const owner of [0, 1] as const) {
    const sign = owner === 0 ? 1 : -1;
    for (let i = 0; i < 2; i++) {
      const spread = i === 0 ? -1.2 : 1.2;
      dice.push({
        owner,
        p: { x: spread + (rng() - 0.5) * 0.28, y: 1.55 + rng() * 0.28, z: sign * (5.15 + rng() * 0.18) },
        v: { x: (rng() - 0.5) * 1.5, y: 3.1 + rng() * 0.7, z: -sign * (6.8 + rng() * 0.7) },
        q: randomQuat(rng),
        w: { x: (rng() - 0.5) * 18, y: (rng() - 0.5) * 18, z: (rng() - 0.5) * 18 },
      });
    }
  }
  return dice;
}

export function openingCaption(roll: { attempts: RollAttempt[]; settled: boolean; first: Player | null }, chinese: boolean): string {
  const names = chinese ? ['月牙白', '翡翠绿'] : ['Moon White', 'Jade Green'];
  const intro = chinese ? '双方各掷两枚骰子，点数高者先行。' : 'Both sides roll two dice. Higher total moves first.';
  const last = roll.attempts[roll.attempts.length - 1];
  // The first throw is still in the air. A later throw keeps the tie that caused it on screen.
  if (!last) return intro;
  const score = `${names[0]} ${last.totals[0]}  ·  ${names[1]} ${last.totals[1]}`;
  if (!roll.settled || roll.first === null) {
    return chinese ? `${score}  ·  平局，双方再掷。` : `${score}  ·  Tie. Both sides roll again.`;
  }
  return chinese
    ? `${score}  ·  ${names[roll.first]}先行。`
    : `${score}  ·  ${names[roll.first]} moves first.`;
}

/**
 * One ceremony. Step it with real frame time on the client, or all at once
 * on the server. The same seed always produces the same faces.
 */
export class DiceRoll {
  readonly seed: number;
  readonly attempts: RollAttempt[] = [];
  settled = false;
  done = false;
  first: Player | null = null;
  /** Strongest contact this step, for the wooden tick. */
  impact = 0;
  private rng: () => number;
  private dice: Die[] = [];
  private acc = 0;
  private rest = 0;
  private simTime = 0;
  private hold = 0;
  private asleep = false;
  private throws = 0;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.launch();
  }

  private launch() {
    this.dice = throwDice(this.rng);
    this.settled = false;
    this.asleep = false;
    this.rest = 0;
    this.simTime = 0;
    this.hold = 0;
    this.throws++;
    this.first = null;
  }

  private freeze() {
    for (const die of this.dice) settleDie(die);
    const faces = this.dice.map(die => topFace(die.q).face) as [number, number, number, number];
    const totals: [number, number] = [faces[0] + faces[1], faces[2] + faces[3]];
    this.attempts.push({ faces, totals });
    this.first = winnerOf(totals);
    this.settled = true;
    this.asleep = true;
  }

  private substep(dt: number) {
    let hit = 0;
    for (const die of this.dice) integrate(die, dt);
    for (let iter = 0; iter < 3; iter++) {
      for (const die of this.dice) {
        hit += collideFloor(die);
        hit += collideBounds(die);
      }
      hit += collidePair(this.dice[0], this.dice[1]);
      hit += collidePair(this.dice[2], this.dice[3]);
    }
    this.simTime += dt;
    if (this.dice.every(resting)) this.rest += dt;
    else this.rest = 0;
    const calm = this.dice.every(die => Math.hypot(die.v.x, die.v.y, die.v.z) < 0.7 && topFace(die.q).normal.y > 0.93);
  if (this.rest > 0.12 || (calm && this.simTime > 0.85) || this.simTime > 2.6) this.freeze();
    this.impact = Math.max(this.impact, hit);
  }

  step(dt: number): number {
    this.impact = 0;
    if (this.done) return 0;
    if (!this.asleep) {
      this.acc += Math.max(0, dt);
      let guard = 0;
      while (this.acc >= STEP && !this.asleep && guard++ < 2400) {
        this.substep(STEP);
        this.acc -= STEP;
      }
      return this.impact;
    }
    this.hold += dt;
    const pause = this.first === null ? 0.95 : 1.25;
    if (this.hold < pause) return 0;
    if (this.first === null && this.throws < MAX_ATTEMPTS) {
      this.launch();
      return 0;
    }
    this.first = this.first ?? 0;
    this.done = true;
    return 0;
  }

  poses(): DiePose[] {
    return this.dice.map(die => ({
      owner: die.owner,
      x: die.p.x, y: die.p.y, z: die.p.z,
      qx: die.q.x, qy: die.q.y, qz: die.q.z, qw: die.q.w,
      face: this.settled ? topFace(die.q).face : null,
    }));
  }
}

export function playOut(seed: number): OpeningResult {
  const roll = new DiceRoll(seed);
  for (let i = 0; i < 120 * 45 && !roll.done; i++) roll.step(STEP);
  if (!roll.done || roll.first === null) throw new Error(`opening roll ${seed} did not finish`);
  return {
    seed: seed >>> 0,
    attempts: roll.attempts.map(attempt => ({ faces: [...attempt.faces], totals: [...attempt.totals] })),
    first: roll.first,
  };
}

const seedCache = new Map<string, number>();

/** A seed whose ceremony ends with `first`, optionally after at least one tie. */
export function seedFor(first: Player, ties = false): number {
  const key = `${first}:${ties}`;
  const cached = seedCache.get(key);
  if (cached !== undefined) return cached;
  for (let seed = 1; seed < 8000; seed++) {
    const opening = playOut(seed);
    if (opening.first === first && (opening.attempts.length > 1) === ties) {
      seedCache.set(key, seed);
      return seed;
    }
  }
  throw new Error(`no opening seed for ${key}`);
}
