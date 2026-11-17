import { describe, expect, it } from 'vitest';
import { BOARD_Y, COIN_RADIUS, DIE_HALF, DiceRoll, flipDiePose, openingCaption, playOut, rotateVec, seedFor, winnerOf } from '../src/dice';

function forward(roll: DiceRoll) {
  for (let i = 0; i < 120 * 40 && !roll.done; i++) roll.step(1 / 120);
  return roll;
}

describe('opening coin toss', () => {
  it('awards first move from the coin face and re-flips an edge-stand tie', () => {
    expect(winnerOf([1, 0])).toBe(0);
    expect(winnerOf([0, 1])).toBe(1);
    expect(winnerOf([1, 1])).toBeNull();

    const pale = playOut(seedFor(0));
    const jade = playOut(seedFor(1));
    const tied = playOut(seedFor(0, true));

    expect(pale.first).toBe(0);
    expect(pale.attempts).toHaveLength(1);
    expect(pale.attempts[0].totals).toEqual([1, 0]);

    expect(jade.first).toBe(1);
    expect(jade.attempts.at(-1)!.totals).toEqual([0, 1]);

    expect(tied.attempts.length).toBeGreaterThan(1);
    expect(tied.attempts.slice(0, -1).every(attempt => attempt.totals[0] === attempt.totals[1])).toBe(true);
    expect(tied.attempts.at(-1)!.totals[0]).not.toBe(tied.attempts.at(-1)!.totals[1]);
    expect(tied.first).toBe(winnerOf(tied.attempts.at(-1)!.totals));
  });

  it('keeps the scripted local seed on Moon White', () => {
    expect(playOut(42).first).toBe(0);
    expect(playOut(42).attempts).toHaveLength(1);
  });

  it('is the same ceremony for the same seed', () => {
    expect(playOut(42)).toEqual(playOut(42));
    const roll = forward(new DiceRoll(42));
    expect(roll.attempts).toEqual(playOut(42).attempts);
    expect(roll.first).toBe(playOut(42).first);
  });

  it('lands centered and flat with the winning face straight up, or on edge for a tie before re-flipping', () => {
    const axes = [
      { v: { x: 0, y: 1, z: 0 }, face: 1 },
      { v: { x: 0, y: -1, z: 0 }, face: 2 },
    ] as const;

    for (const seed of [seedFor(0), seedFor(1), 42, 3, 11, 28]) {
      const roll = new DiceRoll(seed);
      for (let i = 0; i < 60; i++) roll.step(1 / 120); // 0.5s: mid-flight
      expect(roll.settled, `seed ${seed} mid-flight`).toBe(false);
      const [airPose] = roll.poses();
      expect(airPose.y).toBeGreaterThan(2.0);
      expect(airPose.face).toBeNull();

      for (let i = 0; i < 84; i++) roll.step(1 / 120); // 1.2s total: still bouncing/spinning
      expect(roll.settled, `seed ${seed} before 1.8s`).toBe(false);

      let prevPose = roll.poses()[0];
      for (let i = 0; i < 120 * 8 && !roll.settled; i++) {
        prevPose = roll.poses()[0];
        roll.step(1 / 120);
      }
      expect(roll.settled, `seed ${seed}`).toBe(true);
      const poses = roll.poses();
      expect(poses).toHaveLength(1);
      const pose = poses[0];
      expect(prevPose.y).toBeLessThan(BOARD_Y + DIE_HALF + 0.08);
      expect(pose.y).toBeGreaterThan(BOARD_Y + DIE_HALF * 0.8);
      expect(pose.y).toBeLessThan(BOARD_Y + DIE_HALF + 0.05);
      expect(Math.abs(pose.x)).toBeLessThan(0.8);
      expect(Math.abs(pose.z)).toBeLessThan(0.8);
      const expectedFace = roll.first === 0 ? 1 : 2;
      expect(pose.face).toBe(expectedFace);
      const q = { x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw };
      const top = axes.map(axis => ({ face: axis.face, y: rotateVec(q, axis.v).y })).sort((a, b) => b.y - a.y)[0];
      expect(top.face).toBe(pose.face);
      expect(top.y).toBeGreaterThan(0.98);
    }

    for (const tieSeed of [seedFor(0, true), seedFor(1, true)]) {
      const roll = new DiceRoll(tieSeed);
      for (let i = 0; i < 120 * 8 && !roll.settled; i++) roll.step(1 / 120);
      expect(roll.settled).toBe(true);
      expect(roll.first).toBeNull();
      const [tiePose] = roll.poses();
      expect(tiePose.face).toBeNull();
      expect(tiePose.y).toBeGreaterThan(BOARD_Y + COIN_RADIUS * 0.9);
      forward(roll);
      expect(roll.done).toBe(true);
      expect(roll.first).not.toBeNull();
      const [finalPose] = roll.poses();
      expect(finalPose.face).toBe(roll.first === 0 ? 1 : 2);
      expect(finalPose.y).toBeCloseTo(BOARD_Y + DIE_HALF, 2);
    }
  });

  it('clearly announces first and second player in both Chinese and English', () => {
    expect(openingCaption({ attempts: [], settled: false, first: null }, false))
      .toBe('Flipping the opening coin for first move…');
    expect(openingCaption({ attempts: [], settled: false, first: null }, true))
      .toBe('抛掷先手硬币，决定双方先后手……');
    expect(openingCaption({ attempts: [{ faces: [1, 0, 2, 0], totals: [1, 1] }], settled: true, first: null }, false))
      .toContain('restart');
    expect(openingCaption({ attempts: [{ faces: [1, 0, 2, 0], totals: [1, 1] }], settled: true, first: null }, true))
      .toContain('重新开始');

    expect(openingCaption({ attempts: [{ faces: [1, 0, 0, 0], totals: [1, 0] }], settled: true, first: 0 }, false, 0))
      .toContain('You go first as Moon White');
    expect(openingCaption({ attempts: [{ faces: [1, 0, 0, 0], totals: [1, 0] }], settled: true, first: 0 }, false, 1))
      .toContain('You go second');
    expect(openingCaption({ attempts: [{ faces: [1, 0, 0, 0], totals: [1, 0] }], settled: true, first: 0 }, true, 0))
      .toContain('你是先手');
    expect(openingCaption({ attempts: [{ faces: [0, 0, 2, 0], totals: [0, 1] }], settled: true, first: 1 }, false, 0))
      .toContain('Jade Green view');
    expect(openingCaption({ attempts: [{ faces: [0, 0, 2, 0], totals: [0, 1] }], settled: true, first: 1 }, true, 0))
      .toContain('切换至翡翠绿视角');
    expect(openingCaption({ attempts: [{ faces: [0, 0, 2, 0], totals: [0, 1] }], settled: true, first: 1 }, true, null))
      .toContain('切换至翡翠绿视角');

    const mirrored = flipDiePose(flipDiePose({
      owner: 1, x: 0.2, y: 0.175, z: -0.1, qx: 1, qy: 0, qz: 0, qw: 0, face: 2,
    }));
    expect(mirrored.x).toBeCloseTo(0.2, 5);
    expect(mirrored.z).toBeCloseTo(-0.1, 5);
    expect(mirrored.face).toBe(2);
  });

  it('holds on edgeStand with manualRethrow until rethrow() is invoked', () => {
    const roll = new DiceRoll(seedFor(0, true), true);
    for (let i = 0; i < 120 * 10; i++) roll.step(1 / 120);
    expect(roll.settled).toBe(true);
    expect(roll.edgeStand).toBe(true);
    expect(roll.done).toBe(false);
    expect(roll.poses()[0].edge).toBe(true);
    expect(roll.rethrow()).toBe(true);
    expect(roll.edgeStand).toBe(false);
    forward(roll);
    expect(roll.done).toBe(true);
    expect(roll.first).toBe(0);
    expect(roll.poses()[0].edge).toBe(false);
  });

  it('lets either colour win often enough that the coin toss is not fixed', () => {
    let pale = 0;
    let jade = 0;
    for (let seed = 1; seed <= 80; seed++) {
      if (playOut(seed).first === 0) pale++;
      else jade++;
    }
    expect(pale).toBeGreaterThan(20);
    expect(jade).toBeGreaterThan(20);
  });
});
