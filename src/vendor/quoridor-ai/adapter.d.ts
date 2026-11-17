import type { Game } from '../../rules';
import type { Action } from '../../ai';
export function search(game: Game, simulations: number): Action;
export function toUpstream(game: Game): any;
export function fromUpstream(move: [number[] | null, number[] | null, number[] | null]): Action;
