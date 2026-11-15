// Injected clock (design.md "Clock"). Core code never reads time itself.

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** ISO 8601 UTC with milliseconds (FM-R12.6). */
export function isoNow(clock: Clock): string {
  return clock.now().toISOString();
}
