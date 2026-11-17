import { applyAction, type Action } from './ai';
import { playOut, type OpeningResult } from './dice';
import { createGame, startGame, type Game, type Player } from './rules';
import { clockValues, createClock, syncClock, type Clock } from './clock';

export const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
export interface RoomData {
  sides: [Player, Player];
  clock: Clock;
  tokens: [string, string | null];
  ready: [boolean, boolean];
  rematch: [boolean, boolean];
  game: Game;
  revision: number;
  round: number;
  /** The ceremony that awarded `game.turn`. Null until the first round starts. */
  opening: OpeningResult | null;
  /** Consumed the next time a round begins. Tests pin it; live rooms leave it unset. */
  pendingSeed?: number;
}
export interface RoomSnapshot {
  sides: [Player, Player];
  clock: Pick<Clock, 'elapsed' | 'running'>;
  game: Game;
  ready: [boolean, boolean];
  rematch: [boolean, boolean];
  connected: [boolean, boolean];
  joined: [boolean, boolean];
  revision: number;
  round: number;
  opening: OpeningResult | null;
}
export type RoomCommand =
  | { type: 'ready'; id: string }
  | { type: 'unready'; id: string }
  | { type: 'swap'; id: string; revision: number }
  | { type: 'rematch'; id: string }
  | { type: 'action'; id: string; revision: number; action: Action };
export type RoomError = 'full' | 'credentials' | 'not-found' | 'not-ready' | 'opponent-offline'
  | 'not-your-turn' | 'stale' | 'illegal' | 'over' | 'message' | 'rate-limit' | 'unavailable' | 'side-locked';
export type RoomMessage =
  | { type: 'state'; snapshot: RoomSnapshot; ack?: string }
  | { type: 'error'; code: RoomError; ack?: string };

export function createRoom(token: string): RoomData {
  return { sides: [0, 1], clock: createClock(), tokens: [token, null], ready: [false, false], rematch: [false, false], game: createGame('online'), revision: 0, round: 1, opening: null };
}

export function seatFor(room: RoomData, token: string): Player | null {
  return token === room.tokens[0] ? 0 : token && token === room.tokens[1] ? 1 : null;
}

export function joinRoom(room: RoomData, token: string | undefined, newToken: string): { player: Player; token: string } | RoomError {
  if (token !== undefined) {
    const player = seatFor(room, token);
    return player === null ? 'credentials' : { player, token };
  }
  if (room.tokens[1]) return 'full';
  room.tokens[1] = newToken;
  room.revision++;
  return { player: 1, token: newToken };
}

export function snapshot(room: RoomData, connected: [boolean, boolean], now = Date.now()): RoomSnapshot {
  // A detached public copy: seat credentials must never be sent to the opponent.
  return structuredClone({ sides: room.sides, clock: { elapsed: clockValues(room.clock, now), running: room.clock.running }, game: room.game, ready: room.ready, rematch: room.rematch, connected,
    joined: [true, room.tokens[1] !== null], revision: room.revision, round: room.round, opening: room.opening ?? null });
}

export function parseCommand(value: unknown): RoomCommand | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || v.id.length < 1 || v.id.length > 64) return null;
  if (v.type === 'ready' || v.type === 'unready' || v.type === 'rematch') return { type: v.type, id: v.id };
  if (v.type === 'swap' && Number.isSafeInteger(v.revision) && (v.revision as number) >= 0) return { type: 'swap', id: v.id, revision: v.revision as number };
  if (v.type !== 'action' || !Number.isSafeInteger(v.revision) || (v.revision as number) < 0) return null;
  if (!v.action || typeof v.action !== 'object') return null;
  const a = v.action as Record<string, unknown>;
  if (!Number.isInteger(a.c) || !Number.isInteger(a.r)) return null;
  const c = a.c as number, r = a.r as number;
  if (a.type === 'pawn' && c >= 0 && c < 9 && r >= 0 && r < 9) {
    return { type: 'action', id: v.id, revision: v.revision as number, action: { type: 'pawn', c, r } };
  }
  if (a.type === 'fence' && c >= 0 && c < 8 && r >= 0 && r < 8 && (a.o === 'h' || a.o === 'v')) {
    return { type: 'action', id: v.id, revision: v.revision as number, action: { type: 'fence', c, r, o: a.o } };
  }
  return null;
}

export function roomCommand(room: RoomData, player: Player, command: RoomCommand, connected: [boolean, boolean], now = Date.now()): RoomError | null {
  if (command.type === 'swap') {
    if (room.game.phase !== 'title' || room.ready.some(Boolean)) return 'side-locked';
    if (command.revision !== room.revision) return 'stale';
    room.sides = [room.sides[1], room.sides[0]];
  } else if (command.type === 'ready' || command.type === 'unready') {
    if (room.game.phase !== 'title') return 'over';
    room.ready[player] = command.type === 'ready';
  } else if (command.type === 'rematch') {
    if (room.game.phase !== 'results') return 'not-ready';
    room.rematch[player] = true;
  } else {
    if (!connected.every(Boolean)) return 'opponent-offline';
    if (room.game.phase !== 'play') return 'not-ready';
    if (room.game.turn !== room.sides[player]) return 'not-your-turn';
    if (command.revision !== room.revision) return 'stale';
    if (!applyAction(room.game, command.action)) return 'illegal';
  }
  advanceRoom(room, connected, now);
  syncRoomClock(room, connected, now);
  room.revision++;
  return null;
}

function openRound(room: RoomData, connected: [boolean, boolean], now: number) {
  const seed = room.pendingSeed ?? ((Math.random() * 0x100000000) >>> 0);
  delete room.pendingSeed;
  room.opening = playOut(seed);
  startGame(room.game, 'online', room.opening.first);
  room.clock = createClock();
  syncRoomClock(room, connected, now);
}

export function advanceRoom(room: RoomData, connected: [boolean, boolean], now = Date.now()): boolean {
  if (!connected.every(Boolean)) return false;
  if (room.game.phase === 'title' && room.ready.every(Boolean)) {
    openRound(room, connected, now);
    return true;
  }
  if (room.game.phase === 'results' && room.rematch.every(Boolean)) {
    openRound(room, connected, now);
    room.rematch = [false, false];
    room.round++;
    return true;
  }
  return false;
}

export function syncRoomClock(room: RoomData, connected: [boolean, boolean], now = Date.now()): boolean {
  return syncClock(room.clock, room.game.phase === 'play' && connected.every(Boolean) ? room.game.turn : null, now);
}
