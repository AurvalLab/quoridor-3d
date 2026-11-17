import { describe, expect, it } from 'vitest';
import { advanceRoom, createRoom, joinRoom, parseCommand, roomCommand, seatFor, snapshot } from '../src/room';

const both: [boolean, boolean] = [true, true];
function playing() {
  const room = createRoom('host-secret');
  joinRoom(room, undefined, 'guest-secret');
  roomCommand(room, 0, { type: 'ready', id: 'r0' }, both);
  roomCommand(room, 1, { type: 'ready', id: 'r1' }, both);
  return room;
}

describe('authoritative two-seat room', () => {
  it('switches colors before the guest joins without changing either credential seat', () => {
    const room = createRoom('host-secret');
    expect(roomCommand(room, 0, { type: 'swap', id: 'swap', revision: room.revision }, [true, false])).toBeNull();
    expect(room.sides).toEqual([1, 0]);
    expect(joinRoom(room, undefined, 'guest-secret')).toEqual({ player: 1, token: 'guest-secret' });
    expect(joinRoom(room, 'host-secret', 'unused')).toEqual({ player: 0, token: 'host-secret' });
    expect(seatFor(room, 'guest-secret')).toBe(1);
    expect(snapshot(room, both).sides).toEqual([1, 0]);
  });

  it('locks sides while someone is ready, and allows cancellation before the round starts', () => {
    const room = createRoom('host');
    joinRoom(room, undefined, 'guest');
    roomCommand(room, 0, { type: 'ready', id: 'ready' }, both);
    expect(roomCommand(room, 1, { type: 'swap', id: 'locked', revision: room.revision }, both)).toBe('side-locked');
    roomCommand(room, 0, { type: 'unready', id: 'cancel' }, both);
    expect(room.ready).toEqual([false, false]);
    expect(roomCommand(room, 1, { type: 'swap', id: 'swap', revision: room.revision }, both)).toBeNull();
    expect(room.sides).toEqual([1, 0]);
  });

  it('authorizes actions by chosen color and preserves that color for rematches', () => {
    const room = createRoom('host');
    joinRoom(room, undefined, 'guest');
    roomCommand(room, 0, { type: 'swap', id: 'swap', revision: room.revision }, both);
    roomCommand(room, 0, { type: 'ready', id: 'r0' }, both);
    roomCommand(room, 1, { type: 'ready', id: 'r1' }, both);
    const move = { type: 'action' as const, id: 'm', revision: room.revision, action: { type: 'pawn' as const, c: 4, r: 1 } };
    expect(roomCommand(room, 0, move, both)).toBe('not-your-turn');
    expect(roomCommand(room, 1, move, both)).toBeNull();
    expect(roomCommand(room, 0, { ...move, revision: room.revision, action: { type: 'pawn', c: 4, r: 7 } }, both)).toBeNull();
    expect(room.game.pawns).toEqual([{ c: 4, r: 1 }, { c: 4, r: 7 }]);
    expect(roomCommand(room, 0, { type: 'swap', id: 'late', revision: room.revision }, both)).toBe('side-locked');
    room.game.phase = 'results';
    roomCommand(room, 0, { type: 'rematch', id: 'a' }, both);
    roomCommand(room, 1, { type: 'rematch', id: 'b' }, both);
    expect(room.sides).toEqual([1, 0]);
    expect(room.game.turn).toBe(0);
  });

  it('rejects a simultaneous stale switch instead of switching both players back', () => {
    const room = createRoom('host');
    const revision = room.revision;
    roomCommand(room, 0, { type: 'swap', id: 'a', revision }, both);
    expect(roomCommand(room, 1, { type: 'swap', id: 'b', revision }, both)).toBe('stale');
    expect(room.sides).toEqual([1, 0]);
  });
  it('reserves exactly two seats and permits authenticated resume of either', () => {
    const room = createRoom('host-secret');
    expect(joinRoom(room, undefined, 'guest-secret')).toEqual({ player: 1, token: 'guest-secret' });
    expect(joinRoom(room, undefined, 'third')).toBe('full');
    expect(joinRoom(room, 'host-secret', 'unused')).toEqual({ player: 0, token: 'host-secret' });
    expect(joinRoom(room, 'guest-secret', 'unused')).toEqual({ player: 1, token: 'guest-secret' });
    expect(joinRoom(room, 'forged', 'unused')).toBe('credentials');
    expect(seatFor(room, '')).toBeNull();
  });

  it('never assigns a free seat to an invalid resume credential', () => {
    const room = createRoom('host-secret');
    expect(joinRoom(room, 'forged', 'unused')).toBe('credentials');
    expect(room.tokens[1]).toBeNull();
  });

  it('sends detached snapshots without either credential', () => {
    const room = playing();
    const state = snapshot(room, both);
    expect(JSON.stringify(state)).not.toContain('secret');
    state.game.pawns[0].r = 7;
    state.ready[0] = false;
    expect(room.game.pawns[0].r).toBe(0);
    expect(room.ready[0]).toBe(true);
  });

  it('starts only when both players are ready and online, including after reconnection', () => {
    const room = createRoom('host');
    joinRoom(room, undefined, 'guest');
    roomCommand(room, 0, { type: 'ready', id: '1' }, both);
    expect(room.game.phase).toBe('title');
    roomCommand(room, 1, { type: 'ready', id: '2' }, [true, false]);
    expect(room.game.phase).toBe('title');
    expect(advanceRoom(room, both)).toBe(true);
    expect(room.game.phase).toBe('play');
    expect(advanceRoom(room, both)).toBe(false);
  });

  it('uses the socket seat, revision and original movement rules', () => {
    const room = playing();
    const command = { type: 'action' as const, id: 'move', revision: room.revision, action: { type: 'pawn' as const, c: 4, r: 1 } };
    expect(roomCommand(room, 1, command, both)).toBe('not-your-turn');
    expect(roomCommand(room, 0, { ...command, revision: 0 }, both)).toBe('stale');
    expect(roomCommand(room, 0, { ...command, action: { type: 'pawn', c: 4, r: 8 } }, both)).toBe('illegal');
    expect(roomCommand(room, 0, command, both)).toBeNull();
    expect(room.game.moves).toBe(1);
    expect(room.game.turn).toBe(1);
    expect(roomCommand(room, 0, command, both)).toBe('not-your-turn');
    expect(room.game.moves).toBe(1);
  });

  it('rejects stale actions even after the turn cycles back', () => {
    const room = playing();
    const oldRevision = room.revision;
    roomCommand(room, 0, { type: 'action', id: '1', revision: room.revision, action: { type: 'pawn', c: 4, r: 1 } }, both);
    roomCommand(room, 1, { type: 'action', id: '2', revision: room.revision, action: { type: 'pawn', c: 4, r: 7 } }, both);
    expect(roomCommand(room, 0, { type: 'action', id: '3', revision: oldRevision, action: { type: 'pawn', c: 4, r: 2 } }, both)).toBe('stale');
    expect(room.game.moves).toBe(2);
  });

  it('pauses commits while disconnected and resumes without resetting the board', () => {
    const room = playing();
    const command = { type: 'action' as const, id: '1', revision: room.revision, action: { type: 'fence' as const, c: 0, r: 0, o: 'h' as const } };
    const before = structuredClone(room);
    expect(roomCommand(room, 0, command, [true, false])).toBe('opponent-offline');
    expect(room).toEqual(before);
    expect(roomCommand(room, 0, command, both)).toBeNull();
    expect(room.game.fences).toEqual([{ c: 0, r: 0, o: 'h', owner: 0 }]);
    expect(room.game.remaining).toEqual([9, 10]);
    expect(roomCommand(room, 1, { ...command, revision: room.revision }, both)).toBe('illegal');
    expect(room.game.moves).toBe(1);
  });

  it('requires both rematch votes, increments round/revision, and resets only then', () => {
    const room = playing();
    expect(roomCommand(room, 0, { type: 'rematch', id: 'early' }, both)).toBe('not-ready');
    room.game.pawns[0] = { c: 4, r: 7 };
    room.game.pawns[1] = { c: 0, r: 4 };
    roomCommand(room, 0, { type: 'action', id: 'win', revision: room.revision, action: { type: 'pawn', c: 4, r: 8 } }, both);
    expect(room.game.winner).toBe(0);
    const oldRevision = room.revision;
    roomCommand(room, 0, { type: 'rematch', id: 'first' }, both);
    expect(room.game.phase).toBe('results');
    roomCommand(room, 1, { type: 'rematch', id: 'second' }, [true, false]);
    expect(room.game.phase).toBe('results');
    advanceRoom(room, both);
    expect(room.game.phase).toBe('play');
    expect(room.game.moves).toBe(0);
    expect(room.game.winner).toBeNull();
    expect(room.game.remaining).toEqual([10, 10]);
    expect(room.round).toBe(2);
    expect(room.revision).toBeGreaterThan(oldRevision);
    expect(room.rematch).toEqual([false, false]);
  });
});

describe('untrusted WebSocket messages', () => {
  it.each([null, [], {}, { type: 'ready' }, { type: 'ready', id: '' }, { type: 'ready', id: 'x'.repeat(65) }, { type: 'swap', id: 'a' },
    { type: 'action', id: '1', revision: -1, action: { type: 'pawn', c: 4, r: 1 } },
    { type: 'action', id: '1', revision: 1, action: { type: 'pawn', c: 4.5, r: 1 } },
    { type: 'action', id: '1', revision: 1, action: { type: 'pawn', c: 9, r: 1 } },
    { type: 'action', id: '1', revision: 1, action: { type: 'fence', c: 8, r: 1, o: 'h' } },
    { type: 'action', id: '1', revision: 1, action: { type: 'fence', c: 4, r: 1, o: 'diagonal' } },
  ])('rejects malformed message %#', value => { expect(parseCommand(value)).toBeNull(); });

  it('strips injected ownership and state fields', () => {
    expect(parseCommand({ type: 'action', id: '1', revision: 2, player: 1, game: {}, action: { type: 'fence', c: 4, r: 1, o: 'v', owner: 1 } }))
      .toEqual({ type: 'action', id: '1', revision: 2, action: { type: 'fence', c: 4, r: 1, o: 'v' } });
  });
});
