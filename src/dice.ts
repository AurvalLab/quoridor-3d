/**
 * Opening coin toss (Hearthstone style). One ceremonial brass, ivory, and jade
 * coin flips above the center of the board and settles flat to award the
 * first move (Moon White vs Jade Green). A rare edge-stand triggers a re-flip.
 *
 * This solver stays in plain TypeScript so the room service and the browser
 * step the same throw and agree on the face. No three.js here.
 */
import type { Player } from './rules';

export const COIN_RADIUS = 0.88;
export const DIE_HALF = 0.095;
export const BOARD_Y = 0.08;
const STEP = 1 / 120;
const GRAVITY = -15.5;
const MASS = 1.1;
const INERTIA = MASS * (COIN_RADIUS * COIN_RADIUS * 0.28 + DIE_HALF * DIE_HALF * 0.35);
const INV_M = 1 / MASS;
const INV_I = 1 / INERTIA;
const LIMIT = 0.78;
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
  /** Winning top face once settled flat (1 = Moon White, 2 = Jade Green); null in flight or on edge. */
  face: number | null;
  /** True when the coin landed balanced upright on its milled rim. */
  edge?: boolean;
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
interface Coin {
  owner: Player;
  p: V3;
  v: V3;
  q: Quat;
  w: V3;
}

const RIM: V3[] = [];
for (const y of [-DIE_HALF, DIE_HALF]) {
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    RIM.push({ x: Math.cos(a) * COIN_RADIUS, y, z: Math.sin(a) * COIN_RADIUS });
  }
}

const FACE_AXIS: { v: V3; face: 1 | 2 }[] = [
  { v: { x: 0, y: 1, z: 0 }, face: 1 },
  { v: { x: 0, y: -1, z: 0 }, face: 2 },
];

const UP: V3 = { x: 0, y: 1, z: 0 };
const INVOLUTION_X180: Quat = { x: 1, y: 0, z: 0, w: 0 };

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

function cloneCoin(c: Coin): Coin {
  return { owner: c.owner, p: { ...c.p }, v: { ...c.v }, q: { ...c.q }, w: { ...c.w } };
}

function quatFromTo(from: V3, to: V3): Quat {
  const dot = from.x * to.x + from.y * to.y + from.z * to.z;
  if (dot > 0.9999999) return { x: 0, y: 0, z: 0, w: 1 };
  if (dot < -0.9999999) {
    const ax = Math.abs(from.x) < 0.9 ? 1 : 0;
    const az = ax ? 0 : 1;
    const cx = from.y * az;
    const cy = from.z * ax - from.x * az;
    const cz = -from.y * ax;
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

function topFace(q: Quat): { face: 1 | 2; normal: V3 } {
  let face: 1 | 2 = 1;
  let normal = UP;
  let best = -2;
  for (const axis of FACE_AXIS) {
    const world = rotateVec(q, axis.v);
    if (world.y > best) { best = world.y; face = axis.face; normal = world; }
  }
  return { face, normal };
}

/** 180° around Y, so the coin follows the board when Jade's view is mirrored. */
export function flipDiePose(d: DiePose): DiePose {
  const q = qnorm(qmul({ x: 0, y: 1, z: 0, w: 0 }, { x: d.qx, y: d.qy, z: d.qz, w: d.qw }));
  return { ...d, x: -d.x, z: -d.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
}

function impulse(d: Coin, point: V3, normal: V3, restitution: number, friction: number): number {
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

function worldRim(d: Coin): V3[] {
  return RIM.map(local => add(d.p, rotateVec(d.q, local)));
}

function collideFloor(d: Coin): number {
  let deepest: V3 | null = null;
  let depth = 0;
  for (const pt of worldRim(d)) {
    const pen = BOARD_Y - pt.y;
    if (pen > depth) { depth = pen; deepest = pt; }
  }
  if (!deepest || depth <= 0) return 0;
  const lift = Math.min(depth, 0.06);
  d.p.y += lift;
  deepest.y += lift;
  const vn = d.v.y + (d.w.z * (deepest.x - d.p.x) - d.w.x * (deepest.z - d.p.z));
  const bounce = vn < -1.8 ? 0.42 : vn < -0.75 ? 0.24 : 0;
  return impulse(d, deepest, UP, bounce, 0.24);
}

function clampAxis(d: Coin, axis: 'x' | 'z', min: number, max: number): number {
  const value = d.p[axis];
  if (value >= min && value <= max) return 0;
  const normal: V3 = axis === 'x'
    ? { x: value < min ? 1 : -1, y: 0, z: 0 }
    : { x: 0, y: 0, z: value < min ? 1 : -1 };
  d.p[axis] = value < min ? min : max;
  return impulse(d, { x: d.p.x, y: Math.max(d.p.y, BOARD_Y + DIE_HALF), z: d.p.z }, normal, 0.18, 0.45);
}

function collideBounds(d: Coin, simTime: number): number {
  if (simTime < 1.15 || d.p.y > BOARD_Y + 0.6) return 0;
  return clampAxis(d, 'x', -LIMIT, LIMIT) + clampAxis(d, 'z', -LIMIT, LIMIT);
}

function assistFlat(d: Coin, simTime: number, dt: number) {
  if (simTime < 1.45) return;
  const speed = Math.hypot(d.v.x, d.v.y, d.v.z);
  const spin = Math.hypot(d.w.x, d.w.y, d.w.z);
  const { normal } = topFace(d.q);
  if (speed < 2.2 && spin < 14 && normal.y > 0.25) {
    const gain = (normal.y > 0.9 ? 48 : normal.y > 0.7 ? 28 : 14) * dt;
    d.w.x += -normal.z * gain;
    d.w.z += normal.x * gain;
  }
  if (simTime > 2.0 && normal.y > 0.85) {
    const damp = Math.exp(-6 * dt);
    d.w.x *= damp;
    d.w.y *= damp;
    d.w.z *= damp;
    d.v.x *= 0.88;
    d.v.z *= 0.88;
  }
}

function assistRim(d: Coin, simTime: number, dt: number) {
  if (simTime < 1.35) return;
  const speed = Math.hypot(d.v.x, d.v.y, d.v.z);
  if (speed > 4.2) return;
  const normal = rotateVec(d.q, UP);
  const target: V3 = normal.x >= 0 ? { x: 0.78, y: 0, z: 0.6258 } : { x: -0.78, y: 0, z: 0.6258 };
  const cx = normal.y * target.z - normal.z * target.y;
  const cy = normal.z * target.x - normal.x * target.z;
  const cz = normal.x * target.y - normal.y * target.x;
  d.w.x += cx * 32 * dt;
  d.w.y += cy * 32 * dt;
  d.w.z += cz * 32 * dt;
  d.w.x *= 0.92;
  d.w.y *= 0.92;
  d.w.z *= 0.92;
  d.v.x *= 0.9;
  d.v.z *= 0.9;
}

function integrate(d: Coin, simTime: number, dt: number, rimStand: boolean) {
  d.v.y += GRAVITY * dt;
  const inAir = simTime < 1.15;
  const drag = Math.exp((inAir ? -0.12 : -1.8) * dt);
  const spinDrag = Math.exp((inAir ? -0.22 : -2.1) * dt);
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
  if (rimStand) assistRim(d, simTime, dt);
  else assistFlat(d, simTime, dt);
}

function restingFlat(d: Coin): boolean {
  const speed = Math.hypot(d.v.x, d.v.y, d.v.z);
  const spin = Math.hypot(d.w.x, d.w.y, d.w.z);
  if (speed > 0.14 || spin > 0.42) return false;
  if (topFace(d.q).normal.y < 0.992) return false;
  let minY = Infinity;
  for (const pt of worldRim(d)) minY = Math.min(minY, pt.y);
  return minY < BOARD_Y + 0.025 && d.p.y < BOARD_Y + DIE_HALF + 0.035;
}

function restingRim(d: Coin): boolean {
  if (Math.hypot(d.v.x, d.v.y, d.v.z) > 0.45) return false;
  if (Math.hypot(d.w.x, d.w.y, d.w.z) > 1.2) return false;
  const normal = rotateVec(d.q, UP);
  return Math.abs(normal.y) < 0.15 && d.p.y < BOARD_Y + COIN_RADIUS + 0.12;
}

function settleCoin(d: Coin, targetFace?: 1 | 2) {
  let { face, normal } = topFace(d.q);
  if (targetFace && face !== targetFace) {
    d.q = qnorm(qmul(d.q, INVOLUTION_X180));
    ({ normal } = topFace(d.q));
  }
  d.q = qnorm(qmul(quatFromTo(normal, UP), d.q));
  d.v = { x: 0, y: 0, z: 0 };
  d.w = { x: 0, y: 0, z: 0 };
  let minY = Infinity;
  for (const pt of worldRim(d)) minY = Math.min(minY, pt.y);
  d.p.y += BOARD_Y - minY;
  d.p.x = Math.max(-LIMIT, Math.min(LIMIT, d.p.x));
  d.p.z = Math.max(-LIMIT, Math.min(LIMIT, d.p.z));
}

function settleRim(d: Coin) {
  const normal = rotateVec(d.q, UP);
  const target: V3 = normal.x >= 0 ? { x: 0.78, y: 0, z: 0.6258 } : { x: -0.78, y: 0, z: 0.6258 };
  d.q = qnorm(qmul(quatFromTo(normal, target), d.q));
  d.v = { x: 0, y: 0, z: 0 };
  d.w = { x: 0, y: 0, z: 0 };
  let minY = Infinity;
  for (const pt of worldRim(d)) minY = Math.min(minY, pt.y);
  d.p.y += BOARD_Y - minY;
  d.p.x = Math.max(-LIMIT, Math.min(LIMIT, d.p.x));
  d.p.z = Math.max(-LIMIT, Math.min(LIMIT, d.p.z));
}

function stepCoinPhysics(coin: Coin, simTime: number, dt: number, rimStand: boolean): number {
  let hit = 0;
  integrate(coin, simTime, dt, rimStand);
  for (let iter = 0; iter < 3; iter++) {
    hit += collideFloor(coin);
    hit += collideBounds(coin, simTime);
  }
  return hit;
}

function throwCoin(rng: () => number, rimStand: boolean): Coin {
  const dirSign = rng() < 0.5 ? 1 : -1;
  const targetFirst: Player = rng() < 0.5 ? 0 : 1;
  const targetFace: 1 | 2 = targetFirst === 0 ? 1 : 2;
  const sideSign = rng() < 0.5 ? 1 : -1;
  const startX = sideSign * (0.75 + rng() * 0.25);
  const startZ = 2.05 + rng() * 0.2;
  const startY = 0.45 + rng() * 0.06;
  const flightT = 1.06;
  const vx = (-startX * 0.8 + (rng() - 0.5) * 0.14) / (flightT * 0.935);
  const vz = (-startZ + 0.45 + (rng() - 0.5) * 0.14) / (flightT * 0.935);
  const vy = 8.0 + rng() * 0.35;
  const yaw = (rng() - 0.5) * 0.8;
  const pitch = (rng() - 0.5) * 0.24;
  const qy: Quat = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  const qx: Quat = { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) };
  const flipSpeed = (28 + rng() * 6) * dirSign;
  const axisAngle = (rng() - 0.5) * 0.32;

  const coin: Coin = {
    owner: targetFirst,
    p: { x: startX, y: startY, z: startZ },
    v: { x: vx, y: vy, z: vz },
    q: qnorm(qmul(qy, qx)),
    w: { x: flipSpeed * Math.cos(axisAngle), y: sideSign * (5.5 + rng() * 2.5), z: flipSpeed * Math.sin(axisAngle) },
  };

  if (!rimStand) {
    // Run the symmetric trajectory forward once so the initial flip naturally lands on targetFace.
    const probe = cloneCoin(coin);
    let simTime = 0;
    let rest = 0;
    for (let i = 0; i < 450; i++) {
      stepCoinPhysics(probe, simTime, STEP, false);
      simTime += STEP;
      rest = restingFlat(probe) ? rest + STEP : 0;
      if ((simTime > 1.85 && rest > 0.18) || simTime > 3.4) break;
    }
    if (topFace(probe.q).face !== targetFace) {
      coin.q = qnorm(qmul(coin.q, INVOLUTION_X180));
    }
  }
  return coin;
}

export function openingCaption(
  roll: { attempts: RollAttempt[]; settled: boolean; first: Player | null },
  chinese: boolean,
  viewer: Player | null = null,
): string {
  const names = chinese ? ['月牙白', '翡翠绿'] : ['Moon White', 'Jade Green'];
  const intro = chinese ? '抛掷先手硬币，决定双方先后手……' : 'Flipping the opening coin for first move…';
  const last = roll.attempts[roll.attempts.length - 1];
  if (!last) return intro;
  if (!roll.settled || roll.first === null) {
    return chinese
      ? '✨ 奇迹！硬币立住了 · 点击收下祝福并重新开始'
      : '✨ Miracle! Coin stood on edge · Click to claim blessing & restart';
  }
  const first = roll.first;
  if (first === 0) {
    if (viewer === 0) {
      return chinese
        ? `硬币停在${names[0]}  ·  你是先手（执${names[0]}先行）。`
        : `${names[0]} face up  ·  You go first as ${names[0]}.`;
    }
    if (viewer === 1) {
      return chinese
        ? `硬币停在${names[0]}  ·  你是后手（${names[0]}先行）。`
        : `${names[0]} face up  ·  You go second (${names[0]} moves first).`;
    }
    return chinese
      ? `硬币停在${names[0]}  ·  ${names[0]}先手，${names[1]}后手。`
      : `${names[0]} face up  ·  ${names[0]} goes first, ${names[1]} second.`;
  }
  if (viewer === 0) {
    return chinese
      ? `硬币停在${names[1]}  ·  你是后手，切换至${names[1]}视角（${names[0]}先行）。`
      : `${names[1]} face up  ·  You go second in ${names[1]} view (${names[0]} moves first).`;
  }
  if (viewer === 1) {
    return chinese
      ? `硬币停在${names[1]}  ·  你是后手（切换至${names[1]}视角）。`
      : `${names[1]} face up  ·  You go second in ${names[1]} view.`;
  }
  return chinese
    ? `硬币停在${names[1]}  ·  切换至${names[1]}视角（${names[0]}先手，${names[1]}后手）。`
    : `${names[1]} face up  ·  Switching to ${names[1]} view (${names[0]} moves first).`;
}

/**
 * One ceremony. Step it with real frame time on the client, or all at once
 * on the server. The same seed always produces the same toss and face.
 */
export class DiceRoll {
  readonly seed: number;
  readonly attempts: RollAttempt[] = [];
  settled = false;
  done = false;
  first: Player | null = null;
  /** Strongest contact this step, for the coin/wood tap. */
  impact = 0;
  private rng: () => number;
  private coin!: Coin;
  private acc = 0;
  private rest = 0;
  private simTime = 0;
  private hold = 0;
  private asleep = false;
  private throws = 0;
  private rimStand = false;

  constructor(seed: number, private manualRethrow = false) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.launch();
  }

  get edgeStand(): boolean {
    return this.settled && this.first === null;
  }

  rethrow(): boolean {
    if (!this.edgeStand || this.done) return false;
    if (this.throws < MAX_ATTEMPTS) {
      this.launch();
      return true;
    }
    this.first = 0;
    this.done = true;
    return false;
  }

  private launch() {
    this.throws++;
    this.rimStand = this.throws === 1 && (Math.imul(this.seed, 2654435761) >>> 28) === 0;
    this.coin = throwCoin(this.rng, this.rimStand);
    this.settled = false;
    this.asleep = false;
    this.rest = 0;
    this.simTime = 0;
    this.hold = 0;
    this.first = null;
  }

  private freeze() {
    if (this.rimStand) {
      settleRim(this.coin);
      this.attempts.push({ faces: [1, 0, 2, 0], totals: [1, 1] });
      this.first = null;
    } else {
      const targetFace: 1 | 2 = this.coin.owner === 0 ? 1 : 2;
      settleCoin(this.coin, targetFace);
      const face = topFace(this.coin.q).face;
      const winner: Player = face === 1 ? 0 : 1;
      const faces: [number, number, number, number] = winner === 0 ? [1, 0, 0, 0] : [0, 0, 2, 0];
      const totals: [number, number] = winner === 0 ? [1, 0] : [0, 1];
      this.attempts.push({ faces, totals });
      this.first = winnerOf(totals);
    }
    this.settled = true;
    this.asleep = true;
  }

  private substep(dt: number) {
    const hit = stepCoinPhysics(this.coin, this.simTime, dt, this.rimStand);
    this.simTime += dt;
    const isResting = this.rimStand ? restingRim(this.coin) : restingFlat(this.coin);
    if (isResting) this.rest += dt;
    else this.rest = 0;
    if ((this.simTime > 1.85 && this.rest > 0.18) || this.simTime > 3.4) this.freeze();
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
    if (this.first === null && this.manualRethrow) return 0;
    this.hold += dt;
    const pause = this.first === null ? 1.15 : 1.75;
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
    const face = !this.settled || this.first === null ? null : topFace(this.coin.q).face;
    return [{
      owner: this.coin.owner,
      x: this.coin.p.x, y: this.coin.p.y, z: this.coin.p.z,
      qx: this.coin.q.x, qy: this.coin.q.y, qz: this.coin.q.z, qw: this.coin.q.w,
      face,
      edge: this.edgeStand,
    }];
  }
}

export function playOut(seed: number): OpeningResult {
  const roll = new DiceRoll(seed);
  for (let i = 0; i < 120 * 45 && !roll.done; i++) roll.step(STEP);
  if (!roll.done || roll.first === null) throw new Error(`opening toss ${seed} did not finish`);
  return {
    seed: seed >>> 0,
    attempts: roll.attempts.map(attempt => ({ faces: [...attempt.faces], totals: [...attempt.totals] })),
    first: roll.first,
  };
}

const seedCache = new Map<string, number>();

/** A seed whose ceremony ends with `first`, optionally after a rim-stand tie. */
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
