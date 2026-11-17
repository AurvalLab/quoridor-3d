import { describe, expect, it } from 'vitest';
import { clockValues, createClock, formatTime, syncClock } from '../src/clock';
import { advanceRoom, createRoom, joinRoom, roomCommand, snapshot, syncRoomClock } from '../src/room';

describe('player elapsed clocks', () => {
  it('counts only the active player, freezes the other and resumes without double counting', () => {
    const clock = createClock();
    expect(clockValues(clock, 1000)).toEqual([0, 0]);
    syncClock(clock, 0, 1000);
    expect(syncClock(clock, 0, 3000)).toBe(false);
    expect(clockValues(clock, 4000)).toEqual([3000, 0]);
    syncClock(clock, 1, 4000);
    expect(clockValues(clock, 6500)).toEqual([3000, 2500]);
    syncClock(clock, null, 6500);
    expect(clockValues(clock, 50_000)).toEqual([3000, 2500]);
    syncClock(clock, 1, 50_000);
    expect(clockValues(clock, 51_000)).toEqual([3000, 3500]);
  });

  it('formats zero, minute boundaries and long games without wrapping to zero', () => {
    expect(formatTime(-500)).toBe('00:00');
    expect(formatTime(999)).toBe('00:00');
    expect(formatTime(60_000)).toBe('01:00');
    expect(formatTime(3_600_000)).toBe('60:00');
    expect(clockValues({ elapsed: [0, 0], running: 0, since: 10 }, 0)).toEqual([0, 0]);
  });

  it('authoritatively pauses rooms on disconnect, restores the same time and resets on mutual rematch', () => {
    const room = createRoom('a'), both: [boolean, boolean] = [true, true];
    joinRoom(room, undefined, 'b');
    roomCommand(room, 0, { type: 'ready', id: '1' }, both, 1000);
    roomCommand(room, 1, { type: 'ready', id: '2' }, both, 2000);
    roomCommand(room, 0, { type: 'action', id: '3', revision: room.revision, action: { type: 'pawn', c: 4, r: 1 } }, both, 5000);
    expect(snapshot(room, both, 6000).clock).toEqual({ elapsed: [3000, 1000], running: 1 });
    syncRoomClock(room, [true, false], 7000);
    expect(snapshot(room, [true, false], 50_000).clock).toEqual({ elapsed: [3000, 2000], running: null });
    const restored = structuredClone(room);
    syncRoomClock(restored, both, 50_000);
    expect(snapshot(restored, both, 51_000).clock.elapsed).toEqual([3000, 3000]);
    restored.game.phase = 'results';
    syncRoomClock(restored, both, 52_000);
    expect(snapshot(restored, both, 100_000).clock).toEqual({ elapsed: [3000, 4000], running: null });
    roomCommand(restored, 0, { type: 'rematch', id: '4' }, both, 100_000);
    expect(restored.game.phase).toBe('results');
    roomCommand(restored, 1, { type: 'rematch', id: '5' }, both, 101_000);
    expect(snapshot(restored, both, 101_000).clock).toEqual({ elapsed: [0, 0], running: 0 });
    expect(advanceRoom(restored, both, 102_000)).toBe(false);
  });
});
