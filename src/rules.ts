/**
 * Quoridor rules, with no DOM and no three.js, so they can be unit-tested and driven by the bot.
 *
 * The board is 9×9. Columns increase to the right, rows increase toward player 0's goal.
 * Player 0 starts on row 0 and must reach row 8. Player 1 starts on row 8 and must reach row 0.
 * A fence sits on an 8×8 grid of crossings and covers two segments, horizontal or vertical.
 * Endpoint touches (a T) are legal. Sharing a segment, or crossing at the same centre, is not.
 * A fence is also illegal when it leaves either pawn with no route to its goal. That route
 * ignores the other pawn, because a pawn can be jumped.
 */

export const SIZE = 9;
export const GAPS = 8;
export const FENCE_COUNT = 10;

export type Player = 0 | 1;
export type Orientation = 'h' | 'v';
export type Phase = 'title' | 'play' | 'results';
export type Mode = 'ai' | 'hotseat';

export interface Cell { c: number; r: number }

export interface Fence {
  c: number;
  r: number;
  o: Orientation;
  owner: Player;
}

export interface Game {
  phase: Phase;
  mode: Mode;
  pawns: [Cell, Cell];
  fences: Fence[];
  remaining: [number, number];
  turn: Player;
  winner: Player | null;
  moves: number;
}

export type FenceIssue = 'bounds' | 'stock' | 'overlap' | 'cross' | 'blocked';

export type Drag = { kind: 'pawn' } | { kind: 'fence'; o: Orientation };

export type Aim =
  | { kind: 'cell'; c: number; r: number }
  | { kind: 'slot'; c: number; r: number }
  | { kind: 'none' };

const DIRS: Cell[] = [
  { c: 0, r: 1 },
  { c: 0, r: -1 },
  { c: -1, r: 0 },
  { c: 1, r: 0 },
];

export const GOAL_ROW: Record<Player, number> = { 0: SIZE - 1, 1: 0 };

export function other(p: Player): Player {
  return p === 0 ? 1 : 0;
}

export function onBoard(c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < SIZE && r < SIZE;
}

export function inGap(c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < GAPS && r < GAPS;
}

export function createGame(mode: Mode = 'ai'): Game {
  return {
    phase: 'title',
    mode,
    pawns: [{ c: 4, r: 0 }, { c: 4, r: 8 }],
    fences: [],
    remaining: [FENCE_COUNT, FENCE_COUNT],
    turn: 0,
    winner: null,
    moves: 0,
  };
}

export function startGame(g: Game, mode: Mode = g.mode) {
  const fresh = createGame(mode);
  fresh.phase = 'play';
  Object.assign(g, fresh);
  g.pawns = fresh.pawns;
  g.fences = fresh.fences;
  g.remaining = fresh.remaining;
}

function edgeKey(c: number, r: number, c2: number, r2: number): string {
  const a = c + r * SIZE;
  const b = c2 + r2 * SIZE;
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Movement edges removed by these fences. An optional extra fence is included, for previews. */
export function blockedEdges(fences: readonly Fence[], extra?: { c: number; r: number; o: Orientation }): Set<string> {
  const out = new Set<string>();
  const add = (f: { c: number; r: number; o: Orientation }) => {
    if (f.o === 'h') {
      out.add(edgeKey(f.c, f.r, f.c, f.r + 1));
      out.add(edgeKey(f.c + 1, f.r, f.c + 1, f.r + 1));
    } else {
      out.add(edgeKey(f.c, f.r, f.c + 1, f.r));
      out.add(edgeKey(f.c, f.r + 1, f.c + 1, f.r + 1));
    }
  };
  for (const f of fences) add(f);
  if (extra) add(extra);
  return out;
}

function sharesSegment(a: { c: number; r: number; o: Orientation }, b: { c: number; r: number; o: Orientation }): boolean {
  if (a.o !== b.o) return false;
  if (a.o === 'h') return a.r === b.r && Math.abs(a.c - b.c) < 2;
  return a.c === b.c && Math.abs(a.r - b.r) < 2;
}

function crossesAtCentre(a: { c: number; r: number; o: Orientation }, b: { c: number; r: number; o: Orientation }): boolean {
  return a.o !== b.o && a.c === b.c && a.r === b.r;
}

/** Breadth-first route to the goal, fences only. Pawns do not block it. */
export function distanceToGoal(g: Game, player: Player, extra?: { c: number; r: number; o: Orientation }): number {
  const blocked = blockedEdges(g.fences, extra);
  const start = g.pawns[player];
  const goal = GOAL_ROW[player];
  const seen = new Set<number>([start.c + start.r * SIZE]);
  const q: { c: number; r: number; d: number }[] = [{ c: start.c, r: start.r, d: 0 }];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    if (cur.r === goal) return cur.d;
    for (const dir of DIRS) {
      const c = cur.c + dir.c;
      const r = cur.r + dir.r;
      if (!onBoard(c, r)) continue;
      if (blocked.has(edgeKey(cur.c, cur.r, c, r))) continue;
      const id = c + r * SIZE;
      if (seen.has(id)) continue;
      seen.add(id);
      q.push({ c, r, d: cur.d + 1 });
    }
  }
  return Infinity;
}

export function fenceProblem(g: Game, f: { c: number; r: number; o: Orientation }): FenceIssue | null {
  if (!inGap(f.c, f.r)) return 'bounds';
  if (g.remaining[g.turn] <= 0) return 'stock';
  for (const have of g.fences) {
    if (sharesSegment(have, f)) return 'overlap';
    if (crossesAtCentre(have, f)) return 'cross';
  }
  if (distanceToGoal(g, 0, f) === Infinity || distanceToGoal(g, 1, f) === Infinity) return 'blocked';
  return null;
}

export function legalMoves(g: Game, player: Player = g.turn): Cell[] {
  const me = g.pawns[player];
  const opp = g.pawns[other(player)];
  const blocked = blockedEdges(g.fences);
  const out: Cell[] = [];
  const add = (c: number, r: number) => {
    if (!out.some((cell) => cell.c === c && cell.r === r)) out.push({ c, r });
  };
  for (const dir of DIRS) {
    const nc = me.c + dir.c;
    const nr = me.r + dir.r;
    if (!onBoard(nc, nr)) continue;
    if (blocked.has(edgeKey(me.c, me.r, nc, nr))) continue;
    const occupied = nc === opp.c && nr === opp.r;
    if (!occupied) {
      add(nc, nr);
      continue;
    }
    const bc = opp.c + dir.c;
    const br = opp.r + dir.r;
    const beyondOpen = onBoard(bc, br) && !blocked.has(edgeKey(opp.c, opp.r, bc, br));
    if (beyondOpen) {
      add(bc, br);
      continue;
    }
    // Fence, or the edge of the board, sits behind the opponent: step to either side of them.
    const sides = dir.c === 0 ? [{ c: 1, r: 0 }, { c: -1, r: 0 }] : [{ c: 0, r: 1 }, { c: 0, r: -1 }];
    for (const side of sides) {
      const sc = opp.c + side.c;
      const sr = opp.r + side.r;
      if (!onBoard(sc, sr)) continue;
      if (blocked.has(edgeKey(opp.c, opp.r, sc, sr))) continue;
      add(sc, sr);
    }
  }
  return out;
}

export function isLegalMove(g: Game, cell: Cell, player: Player = g.turn): boolean {
  return legalMoves(g, player).some((m) => m.c === cell.c && m.r === cell.r);
}

export function movePawn(g: Game, cell: Cell): boolean {
  if (g.phase !== 'play') return false;
  if (!isLegalMove(g, cell, g.turn)) return false;
  g.pawns[g.turn] = { c: cell.c, r: cell.r };
  g.moves++;
  if (cell.r === GOAL_ROW[g.turn]) {
    g.winner = g.turn;
    g.phase = 'results';
    return true;
  }
  g.turn = other(g.turn);
  return true;
}

export function placeFence(g: Game, f: { c: number; r: number; o: Orientation }): boolean {
  if (g.phase !== 'play') return false;
  if (fenceProblem(g, f)) return false;
  g.fences.push({ c: f.c, r: f.r, o: f.o, owner: g.turn });
  g.remaining[g.turn]--;
  g.moves++;
  g.turn = other(g.turn);
  return true;
}

/** Drop a carried pawn or fence. Illegal aims leave the game untouched. */
export function releaseDrag(g: Game, drag: Drag, aim: Aim): { ok: boolean; reason: string } {
  if (g.phase !== 'play') return { ok: false, reason: 'over' };
  if (drag.kind === 'pawn') {
    if (aim.kind !== 'cell') return { ok: false, reason: 'off-board' };
    return movePawn(g, aim) ? { ok: true, reason: 'ok' } : { ok: false, reason: 'illegal-move' };
  }
  if (aim.kind !== 'slot') return { ok: false, reason: 'off-board' };
  const problem = fenceProblem(g, { c: aim.c, r: aim.r, o: drag.o });
  if (problem) return { ok: false, reason: problem };
  placeFence(g, { c: aim.c, r: aim.r, o: drag.o });
  return { ok: true, reason: 'ok' };
}

export function toggled(o: Orientation): Orientation {
  return o === 'h' ? 'v' : 'h';
}
