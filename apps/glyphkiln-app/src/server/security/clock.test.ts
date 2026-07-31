import { describe, expect, it } from "vitest";

import { INVITATION_DURATION_MS, SESSION_DURATION_MS, systemClock } from "./clock";

describe("authentication time primitives", () => {
  it("uses explicit session and invitation durations", () => {
    expect(SESSION_DURATION_MS).toBe(30 * 24 * 60 * 60 * 1_000);
    expect(INVITATION_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1_000);
  });

  it("returns the current time as a fresh Date", () => {
    const before = Date.now();
    const first = systemClock.now();
    const second = systemClock.now();
    const after = Date.now();

    expect(first).not.toBe(second);
    expect(first.getTime()).toBeGreaterThanOrEqual(before);
    expect(first.getTime()).toBeLessThanOrEqual(after);
  });
});
