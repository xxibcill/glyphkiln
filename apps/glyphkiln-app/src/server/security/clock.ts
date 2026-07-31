const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export const SESSION_DURATION_MS = 30 * MILLISECONDS_PER_DAY;
export const INVITATION_DURATION_MS = 7 * MILLISECONDS_PER_DAY;

export type Clock = {
  now(): Date;
};

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
});
