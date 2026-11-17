import type { Player } from './rules';

export interface Clock { elapsed: [number, number]; running: Player | null; since: number }
export const createClock = (): Clock => ({ elapsed: [0, 0], running: null, since: 0 });
export function clockValues(clock: Clock, now: number): [number, number] {
  const values: [number, number] = [...clock.elapsed];
  if (clock.running !== null) values[clock.running] += Math.max(0, now - clock.since);
  return values;
}
export function syncClock(clock: Clock, running: Player | null, now: number): boolean {
  if (clock.running === running) return false;
  clock.elapsed = clockValues(clock, now);
  clock.running = running;
  clock.since = now;
  return true;
}
export function formatTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
