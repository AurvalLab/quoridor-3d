import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/ai';
import { createGame, legalMoves, placeFence, startGame } from '../src/rules';
import { fromUpstream, search, toUpstream } from '../src/vendor/quoridor-ai/adapter.js';

describe('upstream MCTS adapter', () => {
  it('maps pawn moves and both wall orientations to the same board', () => {
    const game = createGame();
    startGame(game);
    expect(placeFence(game, { c: 2, r: 1, o: 'h' })).toBe(true);
    expect(placeFence(game, { c: 5, r: 6, o: 'v' })).toBe(true);
    const converted = toUpstream(game);
    expect(converted.board.walls.horizontal[6][2]).toBe(true);
    expect(converted.board.walls.vertical[1][5]).toBe(true);
    expect(converted.pawn0.numberOfLeftWalls).toBe(9);
    expect(converted.pawn1.numberOfLeftWalls).toBe(9);
    const moves = legalMoves(game).map(p => `${p.c},${p.r}`).sort();
    const upstreamMoves = converted.getArrOfValidNextPositionTuples().map(([r, c]: number[]) => `${c},${8-r}`).sort();
    expect(upstreamMoves).toEqual(moves);
    expect(fromUpstream([null, [6, 2], null])).toEqual({ type: 'fence', c: 2, r: 1, o: 'h' });
    expect(fromUpstream([null, null, [1, 5]])).toEqual({ type: 'fence', c: 5, r: 6, o: 'v' });
  });

  it('returns a legal move after running MCTS', () => {
    const game = createGame();
    startGame(game);
    expect(applyAction(game, { type: 'pawn', c: 4, r: 1 })).toBe(true);
    expect(applyAction(game, { type: 'pawn', c: 4, r: 7 })).toBe(true);
    const action = search(game, 20);
    expect(applyAction(game, action)).toBe(true);
  });

  it('acts for AI as either Jade second (even move count) or Moon White first', () => {
    const game = createGame('ai');
    startGame(game, 'ai', 1);
    game.pawns = [{ c: 4, r: 4 }, { c: 4, r: 5 }];
    game.moves = 8;
    expect(toUpstream(game).pawnIndexOfTurn).toBe(1);
    for (let trial = 0; trial < 3; trial++) {
      const action = search(game, 500);
      expect(applyAction(structuredClone(game), action)).toBe(true);
      if (action.type === 'pawn') {
        expect(action.r).toBeLessThan(game.pawns[1].r);
      }
    }

    const whiteAi = createGame('ai');
    startGame(whiteAi, 'ai', 0);
    expect(toUpstream(whiteAi).pawnIndexOfTurn).toBe(0);
    const whiteAction = search(whiteAi, 500);
    expect(applyAction(structuredClone(whiteAi), whiteAction)).toBe(true);
    if (whiteAction.type === 'pawn') {
      expect(whiteAction.r).toBeGreaterThan(whiteAi.pawns[0].r);
    }
  });
});
