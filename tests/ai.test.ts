import { describe, expect, it } from 'vitest';
import { applyAction, chooseAction } from '../src/ai';
import { createGame, distanceToGoal, fenceProblem, startGame } from '../src/rules';

describe('heuristic', () => {
  it('steps toward the goal from the opening', () => {
    const g = createGame();
    startGame(g, 'ai');
    expect(chooseAction(g)).toEqual({ type: 'pawn', c: 4, r: 1 });
  });

  it('takes a win on its turn', () => {
    const g = createGame();
    startGame(g, 'ai');
    g.pawns[0] = { c: 4, r: 7 };
    g.pawns[1] = { c: 0, r: 5 };
    expect(chooseAction(g)).toEqual({ type: 'pawn', c: 4, r: 8 });
    g.pawns[0] = { c: 7, r: 4 };
    g.pawns[1] = { c: 2, r: 1 };
    g.turn = 1;
    expect(chooseAction(g)).toEqual({ type: 'pawn', c: 2, r: 0 });
  });

  it('spends a fence to stop a pawn that would finish next turn', () => {
    const g = createGame();
    startGame(g, 'ai');
    g.pawns[0] = { c: 4, r: 7 };
    g.pawns[1] = { c: 0, r: 3 };
    g.turn = 1;
    const action = chooseAction(g);
    expect(action?.type).toBe('fence');
    expect(action && fenceProblem(g, action.type === 'fence' ? action : { c: 0, r: 0, o: 'h' })).toBeNull();
    expect(applyAction(g, action!)).toBe(true);
    expect(distanceToGoal(g, 0)).toBeGreaterThan(1);
  });

  it('never offers an illegal action', () => {
    const g = createGame();
    startGame(g, 'ai');
    g.fences.push({ c: 3, r: 0, o: 'v', owner: 1 }, { c: 4, r: 0, o: 'h', owner: 1 });
    const action = chooseAction(g);
    expect(action).not.toBeNull();
    expect(applyAction(g, action!)).toBe(true);
  });
});
