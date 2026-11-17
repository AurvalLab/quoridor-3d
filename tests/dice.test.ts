import { describe, expect, it } from 'vitest';
import { BOARD_Y, DIE_HALF, DiceRoll, flipDiePose, openingCaption, playOut, rotateVec, seedFor, winnerOf } from '../src/dice';

function forward(roll: DiceRoll) {
  for (let i = 0; i < 120 * 40 && !roll.done; i++) roll.step(1 / 120);
  return roll;
}

describe('opening roll', () => {
  it('gives the first move to the higher two-dice total and rerolls a tie', () => {
    expect(winnerOf([9, 4])).toBe(0);
    expect(winnerOf([3, 8])).toBe(1);
    expect(winnerOf([7, 7])).toBeNull();
    const pale = playOut(seedFor(0));
    const jade = playOut(seedFor(1));
    const tied = playOut(seedFor(0, true));
    expect(pale.first).toBe(0);
    expect(pale.attempts).toHaveLength(1);
    expect(pale.attempts[0].totals[0]).toBeGreaterThan(pale.attempts[0].totals[1]);
    expect(jade.first).toBe(1);
    expect(jade.attempts.at(-1)!.totals[1]).toBeGreaterThan(jade.attempts.at(-1)!.totals[0]);
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

  it('lands each pair on its own half, flat, with a readable face', () => {
    for (const seed of [seedFor(0), seedFor(1), seedFor(0, true), 3, 11, 28]) {
      const roll = new DiceRoll(seed);
      for (let i = 0; i < 120 * 8 && !roll.settled; i++) roll.step(1 / 120);
      expect(roll.settled, `seed ${seed}`).toBe(true);
      const poses = roll.poses();
      expect(poses.map(pose => pose.face)).toEqual([...roll.attempts[0].faces]);
      poses.forEach((pose, index) => {
        const owner = index < 2 ? 0 : 1;
        expect(pose.owner).toBe(owner);
        expect(pose.y).toBeGreaterThan(BOARD_Y + DIE_HALF * 0.8);
        expect(pose.y).toBeLessThan(BOARD_Y + DIE_HALF + 0.08);
        expect(Math.abs(pose.x)).toBeLessThan(3.7);
        expect(owner === 0 ? pose.z : -pose.z).toBeGreaterThan(0.35);
        const axes = [
          { v: { x: 0, y: 1, z: 0 }, face: 1 }, { v: { x: 0, y: -1, z: 0 }, face: 6 },
          { v: { x: 0, y: 0, z: 1 }, face: 2 }, { v: { x: 0, y: 0, z: -1 }, face: 5 },
          { v: { x: 1, y: 0, z: 0 }, face: 3 }, { v: { x: -1, y: 0, z: 0 }, face: 4 },
        ];
        const q = { x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw };
        const top = axes.map(axis => ({ face: axis.face, y: rotateVec(q, axis.v).y })).sort((a, b) => b.y - a.y)[0];
        expect(top.face).toBe(pose.face);
        expect(top.y).toBeGreaterThan(0.98);
      });
    }
  });

  it('keeps the tie on screen and then names the winner', () => {
    expect(openingCaption({ attempts: [], settled: false, first: null }, false))
      .toBe('Both sides roll two dice. Higher total moves first.');
    expect(openingCaption({ attempts: [{ faces: [3, 4, 2, 5], totals: [7, 7] }], settled: true, first: null }, false))
      .toContain('Tie');
    expect(openingCaption({ attempts: [{ faces: [6, 5, 1, 2], totals: [11, 3] }], settled: true, first: 0 }, true))
      .toContain('月牙白先行');
    const mirrored = flipDiePose(flipDiePose({
      owner: 1, x: 1.2, y: 0.4, z: -2, qx: 0.1, qy: 0.2, qz: 0.3, qw: 0.9, face: 4,
    }));
    expect(mirrored.x).toBeCloseTo(1.2, 5);
    expect(mirrored.z).toBeCloseTo(-2, 5);
    expect(mirrored.face).toBe(4);
  });

  it('lets either colour win often enough that the throw is not fixed', () => {
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
