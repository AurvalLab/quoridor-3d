import { describe, expect, it } from 'vitest';
import { applyAction, chooseAction } from '../src/ai';
import { createGame, startGame } from '../src/rules';

describe('a machine-versus-machine game', () => {
  it('ends with a winner before the fences run out', () => {
    const g = createGame();
    startGame(g, 'ai');
    let guard = 0;
    while (g.phase === 'play' && guard < 40) {
      const action = chooseAction(g);
      expect(action).not.toBeNull();
      expect(applyAction(g, action!)).toBe(true);
      guard++;
      }
    expect(g.phase).toBe('results');
    expect(g.winner).not.toBeNull();
    expect(g.moves).toBeGreaterThan(8);
    expect(g.moves).toBeLessThan(30);
    expect(g.fences.length).toBeLessThan(6);
  });
});
