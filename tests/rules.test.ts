import { describe, expect, it } from 'vitest';
import {
  createGame, distanceToGoal, fenceProblem, legalMoves, movePawn, placeFence, releaseDrag, startGame,
  toggled, type Cell,
} from '../src/rules';

const keys = (cells: Cell[]) => cells.map((c) => `${c.c},${c.r}`).sort();

describe('movement', () => {
  it('starts in the centre of each baseline with ten fences', () => {
    const g = createGame();
    startGame(g);
    expect(g.pawns).toEqual([{ c: 4, r: 0 }, { c: 4, r: 8 }]);
    expect(g.remaining).toEqual([10, 10]);
    expect(distanceToGoal(g, 0)).toBe(8);
    expect(distanceToGoal(g, 1)).toBe(8);
  });

  it('steps one square orthogonally, and not off the board or through a fence', () => {
    const g = createGame();
    startGame(g);
    expect(keys(legalMoves(g, 0))).toEqual(keys([{ c: 4, r: 1 }, { c: 3, r: 0 }, { c: 5, r: 0 }]));
    expect(placeFence(g, { c: 3, r: 0, o: 'h' })).toBe(true);
    g.turn = 0;
    expect(keys(legalMoves(g, 0))).toEqual(keys([{ c: 3, r: 0 }, { c: 5, r: 0 }]));
    expect(movePawn(g, { c: 4, r: 1 })).toBe(false);
    expect(g.pawns[0]).toEqual({ c: 4, r: 0 });
  });

  it('jumps straight over an adjacent pawn', () => {
    const g = createGame();
    startGame(g);
    g.pawns[0] = { c: 4, r: 4 };
    g.pawns[1] = { c: 4, r: 5 };
    expect(keys(legalMoves(g, 0))).toEqual(keys([
      { c: 4, r: 6 }, { c: 4, r: 3 }, { c: 3, r: 4 }, { c: 5, r: 4 },
    ]));
  });

  it('jumps diagonally when a fence or the board edge is behind the opponent', () => {
    const g = createGame();
    startGame(g);
    g.pawns[0] = { c: 4, r: 4 };
    g.pawns[1] = { c: 4, r: 5 };
    g.fences.push({ c: 4, r: 5, o: 'h', owner: 1 });
    expect(keys(legalMoves(g, 0))).toEqual(keys([
      { c: 5, r: 5 }, { c: 3, r: 5 }, { c: 4, r: 3 }, { c: 3, r: 4 }, { c: 5, r: 4 },
    ]));

    g.fences.push({ c: 4, r: 4, o: 'v', owner: 0 });
    expect(legalMoves(g, 0).some((m) => m.c === 5 && m.r === 5)).toBe(false);
    expect(legalMoves(g, 0).some((m) => m.c === 3 && m.r === 5)).toBe(true);

    g.pawns[0] = { c: 4, r: 7 };
    g.pawns[1] = { c: 4, r: 8 };
    g.fences = [];
    const edge = legalMoves(g, 0);
    expect(edge.some((m) => m.c === 4 && m.r === 8)).toBe(false);
    expect(keys(edge.filter((m) => m.r === 8))).toEqual(keys([{ c: 3, r: 8 }, { c: 5, r: 8 }]));
  });

  it('does not jump across a fence, and a side fence blocks one diagonal', () => {
    const g = createGame();
    startGame(g);
    g.pawns[0] = { c: 4, r: 4 };
    g.pawns[1] = { c: 4, r: 5 };
    g.fences.push({ c: 3, r: 4, o: 'h', owner: 0 });
    expect(legalMoves(g, 0).some((m) => m.r === 5 || m.r === 6)).toBe(false);

    g.fences = [{ c: 0, r: 5, o: 'h', owner: 1 }];
    g.pawns[0] = { c: 0, r: 4 };
    g.pawns[1] = { c: 0, r: 5 };
    const side = legalMoves(g, 0).filter((m) => m.r === 5);
    expect(side).toEqual([{ c: 1, r: 5 }]);
  });

  it('reaching the far rank wins, and the loser cannot play on', () => {
    const g = createGame();
    startGame(g);
    g.pawns[0] = { c: 4, r: 7 };
    g.pawns[1] = { c: 0, r: 4 };
    expect(movePawn(g, { c: 4, r: 8 })).toBe(true);
    expect(g.winner).toBe(0);
    expect(g.phase).toBe('results');
    expect(movePawn(g, { c: 4, r: 7 })).toBe(false);
    expect(placeFence(g, { c: 0, r: 0, o: 'h' })).toBe(false);
  });
});

describe('fences', () => {
  it('rejects overlap, a cross, and a fence off the grid, and allows a T', () => {
    const g = createGame();
    startGame(g);
    expect(placeFence(g, { c: 0, r: 0, o: 'h' })).toBe(true);
    g.turn = 0;
    expect(fenceProblem(g, { c: 1, r: 0, o: 'h' })).toBe('overlap');
    expect(fenceProblem(g, { c: 0, r: 0, o: 'v' })).toBe('cross');
    expect(fenceProblem(g, { c: 8, r: 0, o: 'h' })).toBe('bounds');
    expect(fenceProblem(g, { c: 2, r: 0, o: 'h' })).toBeNull();
    // H(0,0) meets V(1,0) at an endpoint. That T is legal.
    expect(fenceProblem(g, { c: 1, r: 0, o: 'v' })).toBeNull();
    expect(placeFence(g, { c: 1, r: 0, o: 'v' })).toBe(true);
    expect(g.remaining[0]).toBe(8);
    expect(g.turn).toBe(1);
  });

  it('rejects a fence that seals one pawn even when the other can still get home', () => {
    const g = createGame();
    startGame(g);
    g.fences.push({ c: 3, r: 0, o: 'v', owner: 1 });
    g.fences.push({ c: 4, r: 0, o: 'h', owner: 1 });
    expect(distanceToGoal(g, 0)).not.toBe(Infinity);
    expect(fenceProblem(g, { c: 5, r: 0, o: 'v' })).toBe('blocked');
    expect(placeFence(g, { c: 5, r: 0, o: 'v' })).toBe(false);
    expect(g.fences).toHaveLength(2);
    expect(g.remaining[0]).toBe(10);

    // The same pocket, built the other way, leaves player 1 a way down the side.
    g.fences.push({ c: 5, r: 0, o: 'v', owner: 0 });
    expect(distanceToGoal(g, 0)).toBe(Infinity);
    expect(distanceToGoal(g, 1)).not.toBe(Infinity);
  });

  it('a fence that only lengthens the walk is legal, and the eleventh is not', () => {
    const g = createGame();
    startGame(g);
    expect(fenceProblem(g, { c: 4, r: 3, o: 'h' })).toBeNull();
    expect(placeFence(g, { c: 4, r: 3, o: 'h' })).toBe(true);
    expect(distanceToGoal(g, 0)).toBeGreaterThan(8);
    g.remaining = [0, 10];
    g.turn = 0;
    expect(fenceProblem(g, { c: 0, r: 4, o: 'v' })).toBe('stock');
  });

  it('refuses an illegal drop and keeps the earlier position', () => {
    const g = createGame();
    startGame(g);
    g.fences.push({ c: 0, r: 0, o: 'h', owner: 1 });
    const before = g.moves;
    expect(releaseDrag(g, { kind: 'pawn' }, { kind: 'cell', c: 4, r: 2 }).reason).toBe('illegal-move');
    expect(releaseDrag(g, { kind: 'fence', o: 'h' }, { kind: 'slot', c: 1, r: 0 }).reason).toBe('overlap');
    expect(releaseDrag(g, { kind: 'fence', o: 'v' }, { kind: 'slot', c: 0, r: 0 }).reason).toBe('cross');
    expect(releaseDrag(g, { kind: 'fence', o: 'h' }, { kind: 'none' }).reason).toBe('off-board');
    expect(g.moves).toBe(before);
    expect(g.pawns[0]).toEqual({ c: 4, r: 0 });

    expect(releaseDrag(g, { kind: 'pawn' }, { kind: 'cell', c: 4, r: 1 }).ok).toBe(true);
    expect(g.pawns[0]).toEqual({ c: 4, r: 1 });
    expect(g.turn).toBe(1);
  });

  it('rotates a fence between the two orientations', () => {
    expect(toggled('v')).toBe('h');
    expect(toggled('h')).toBe('v');
  });
});
