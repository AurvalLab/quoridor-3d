/**
 * ?bot=1. A synthetic player that picks pieces up and sets them down through the real gesture
 * engine: move to the pawn or the stack, close the hand, carry, open the palm. The first carry
 * is a miss, on purpose, so a red square shows up and the drop is refused.
 */
import { chooseAction } from './ai';
import { legalMoves, type Cell, type Game } from './rules';
import type { BotHand, Shape } from './input';

export interface Point { x: number; y: number }
export interface Projector {
  cell: (c: number, r: number) => Point;
  slot: (c: number, r: number) => Point;
  stock: (player: 0 | 1) => Point;
}

interface Plan {
  from: Point;
  to: Point;
  roll: number;
  useFist: boolean;
}

type Step = 'seek' | 'close' | 'carry' | 'open' | 'settle';

export class Bot {
  x = 0.5;
  y = 0.7;
  pinch = 0;
  roll = 0;
  shape: Shape = 'open';
  private step: Step = 'seek';
  private stepT = 0;
  private dwell = 0;
  private plan: Plan | null = null;
  private didMiss = false;
  private grabs = 0;
  private resultsT = 0;

  update(g: Game, dt: number, project: Projector, aspect: number): BotHand {
    if (g.phase === 'results') {
      this.plan = null;
      this.resultsT += dt;
      const pinching = this.resultsT > 2.3 && this.resultsT < 2.7;
      this.pinch = pinching ? 1 : 0;
      this.shape = pinching ? 'pinch' : 'open';
      this.roll = 0;
      return this.out();
    }
    this.resultsT = 0;
    if (g.phase !== 'play' || g.turn !== 0) {
      this.plan = null;
      this.step = 'seek';
      this.shape = 'open';
      this.pinch = 0;
      this.roll = 0;
      return this.out();
    }
    if (!this.plan) {
      this.plan = this.nextPlan(g, project);
      this.step = 'seek';
      this.stepT = 0;
      this.dwell = 0;
    }
    const plan = this.plan;
    this.roll = plan.roll;
    this.stepT += dt;
    const closed: Shape = plan.useFist ? 'fist' : 'pinch';

    if (this.step === 'seek') {
      this.shape = 'open';
      this.pinch = 0;
      if (this.approach(plan.from, dt, aspect)) { this.step = 'close'; this.stepT = 0; }
    } else if (this.step === 'close') {
      this.shape = closed;
      this.pinch = 1;
      this.x = plan.from.x;
      this.y = plan.from.y;
      if (this.stepT > 0.32) { this.step = 'carry'; this.stepT = 0; this.dwell = 0; }
    } else if (this.step === 'carry') {
      this.shape = closed;
      this.pinch = 1;
      if (this.approach(plan.to, dt, aspect)) this.dwell += dt;
      else this.dwell = 0;
      if (this.dwell > 0.24) { this.step = 'open'; this.stepT = 0; }
    } else if (this.step === 'open') {
      this.shape = 'open';
      this.pinch = 0;
      this.x = plan.to.x;
      this.y = plan.to.y;
      if (this.stepT > 0.3) { this.step = 'settle'; this.stepT = 0; }
    } else {
      this.shape = 'open';
      this.pinch = 0;
      if (this.stepT > 0.06) { this.plan = null; this.step = 'seek'; }
    }
    return this.out();
  }

  private nextPlan(g: Game, project: Projector): Plan {
    this.grabs++;
    const useFist = this.grabs % 3 === 0;
    if (!this.didMiss) {
      this.didMiss = true;
      const from = g.pawns[0];
      const bad = badCell(g, from);
      return { from: project.cell(from.c, from.r), to: project.cell(bad.c, bad.r), roll: 0, useFist };
    }
    const action = chooseAction(g);
    if (!action || action.type === 'pawn') {
      const to = action && action.type === 'pawn' ? action : (legalMoves(g, 0)[0] ?? g.pawns[0]);
      return { from: project.cell(g.pawns[0].c, g.pawns[0].r), to: project.cell(to.c, to.r), roll: 0, useFist };
    }
    return {
      from: project.stock(0),
      to: project.slot(action.c, action.r),
      roll: action.o === 'h' ? Math.PI / 2 : 0,
      useFist: false,
    };
  }

  /** Move in screen-heights per second, so a wide window is not a faster hand. */
  private approach(target: Point, dt: number, aspect: number): boolean {
    const dx = (target.x - this.x) * aspect;
    const dy = target.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, 2.6 * dt);
    if (d > 1e-4) {
      this.x += (dx / d) * step / aspect;
      this.y += (dy / d) * step;
    }
    return d < 0.02;
  }

  private out(): BotHand {
    return { x: this.x, y: this.y, pinch: this.pinch, roll: this.roll, shape: this.shape };
  }
}

function badCell(g: Game, from: Cell): Cell {
  const legal = legalMoves(g, 0);
  const candidates = [
    { c: from.c, r: from.r + 2 },
    { c: from.c + 2, r: from.r },
    { c: 0, r: 0 },
  ];
  for (const cell of candidates) {
    if (cell.c < 0 || cell.r < 0 || cell.c > 8 || cell.r > 8) continue;
    if (cell.c === from.c && cell.r === from.r) continue;
    if (!legal.some((m) => m.c === cell.c && m.r === cell.r)) return cell;
  }
  return { c: 0, r: 0 };
}
