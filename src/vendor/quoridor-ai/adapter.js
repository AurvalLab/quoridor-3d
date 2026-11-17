import { Game } from './game.js';
import { AI } from './ai.js';

// Upstream rows run in the opposite direction to this game's rows.
export function toUpstream(game) {
  const result = new Game(true);
  for (const fence of game.fences) {
    result.turn = fence.owner;
    result.doMove(fence.o === 'h'
      ? [null, [7 - fence.r, fence.c], null]
      : [null, null, [7 - fence.r, fence.c]]);
  }
  for (let i = 0; i < 2; i++) {
    result.board.pawns[i].position.row = 8 - game.pawns[i].r;
    result.board.pawns[i].position.col = game.pawns[i].c;
    result.board.pawns[i].numberOfLeftWalls = game.remaining[i];
  }
  result.turn = game.moves;
  return result;
}

export function fromUpstream(move) {
  if (move[0]) return { type: 'pawn', r: 8 - move[0][0], c: move[0][1] };
  const wall = move[1] || move[2];
  return { type: 'fence', r: 7 - wall[0], c: wall[1], o: move[1] ? 'h' : 'v' };
}

export function search(game, simulations) {
  return fromUpstream(new AI(simulations, 0.2).chooseNextMove(toUpstream(game)));
}
