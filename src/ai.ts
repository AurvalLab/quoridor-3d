/**
 * One-ply heuristic. It walks a shortest path to its own goal. It spends a fence only when the
 * other pawn is closer than it is, and close to finishing: the fence has to push that pawn back
 * without (unless they would win immediately) making its own walk longer.
 * Every returned action is legal. Ties keep the earliest candidate, so the choice is stable.
 */
import {
  distanceToGoal, fenceProblem, legalMoves, movePawn, other, placeFence,
  type Game, type Orientation, type Player,
} from './rules';

export type Action =
  | { type: 'pawn'; c: number; r: number }
  | { type: 'fence'; c: number; r: number; o: Orientation };

export function cloneGame(g: Game): Game {
  return {
    ...g,
    pawns: [{ ...g.pawns[0] }, { ...g.pawns[1] }],
    fences: g.fences.map((f) => ({ ...f })),
    remaining: [g.remaining[0], g.remaining[1]],
  };
}

function blockingFence(g: Game, me: Player): Action | null {
  const opp = other(me);
  const opD = distanceToGoal(g, opp);
  const myD = distanceToGoal(g, me);
  const spent = 10 - g.remaining[me];
  // Block only a pawn that would finish on its next turn, and only twice, so a game still ends.
  if (opD > 1 || spent >= 2 || g.remaining[me] <= 0) return null;
  if (opD >= myD && myD <= 1) return null;
  let block: Action | null = null;
  let bestGain = opD <= 1 ? 0 : 1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      for (const o of ['h', 'v'] as const) {
        if (fenceProblem(g, { c, r, o })) continue;
        const extra = { c, r, o };
        const nd = distanceToGoal(g, opp, extra);
        const md = distanceToGoal(g, me, extra);
        // A last-ditch block may cost a few steps. Anything earlier must not.
        if (opD > 1 && md > myD) continue;
        if (opD <= 1 && md > myD + 6) continue;
        const gain = nd - opD;
        if (gain > bestGain) {
          bestGain = gain;
          block = { type: 'fence', c, r, o };
        }
      }
    }
  }
  return block;
}

export function chooseAction(g: Game): Action | null {
  if (g.phase !== 'play') return null;
  const me = g.turn;
  const opp = other(me);
  const moves = legalMoves(g, me);

  for (const m of moves) {
    const trial = cloneGame(g);
    movePawn(trial, m);
    if (trial.winner === me) return { type: 'pawn', c: m.c, r: m.r };
  }

  const block = blockingFence(g, me);
  if (block) return block;

  let best: Action | null = null;
  let bestD = Infinity;
  let bestOpp = -1;
  for (const m of moves) {
    const trial = cloneGame(g);
    movePawn(trial, m);
    const d = trial.winner === me ? 0 : distanceToGoal(trial, me);
    const od = distanceToGoal(trial, opp);
    if (d < bestD || (d === bestD && od > bestOpp)) {
      bestD = d;
      bestOpp = od;
      best = { type: 'pawn', c: m.c, r: m.r };
    }
  }
  return best;
}

export function applyAction(g: Game, action: Action): boolean {
  if (action.type === 'pawn') return movePawn(g, { c: action.c, r: action.r });
  return placeFence(g, action);
}
