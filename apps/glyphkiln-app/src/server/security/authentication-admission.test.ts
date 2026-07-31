import { describe, expect, it } from "vitest";

import { AuthenticationWorkLimiter } from "./authentication-admission";

describe("AuthenticationWorkLimiter", () => {
  it("bounds concurrent memory-hard work and releases capacity after completion", async () => {
    const limiter = new AuthenticationWorkLimiter({ maximumConcurrent: 1 });
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = limiter.run("source-one", async () => {
      await blocked;
      return "first";
    });

    await expect(
      limiter.run("source-two", () => Promise.resolve("second")),
    ).resolves.toEqual({ accepted: false });
    release?.();
    await expect(first).resolves.toEqual({ accepted: true, value: "first" });
    await expect(
      limiter.run("source-two", () => Promise.resolve("third")),
    ).resolves.toEqual({ accepted: true, value: "third" });
  });

  it("enforces source and global attempt budgets with bounded state", async () => {
    let now = 1_000;
    const limiter = new AuthenticationWorkLimiter({
      maximumConcurrent: 2,
      globalAttempts: 3,
      globalWindowMilliseconds: 1_000,
      sourceAttempts: 2,
      sourceWindowMilliseconds: 2_000,
      maximumSourcePartitions: 2,
      now: () => now,
    });
    const operation = () => Promise.resolve("accepted");

    await expect(limiter.run("source-a", operation)).resolves.toMatchObject({
      accepted: true,
    });
    await expect(limiter.run("source-a", operation)).resolves.toMatchObject({
      accepted: true,
    });
    await expect(limiter.run("source-a", operation)).resolves.toEqual({
      accepted: false,
    });
    await expect(limiter.run("source-b", operation)).resolves.toMatchObject({
      accepted: true,
    });
    await expect(limiter.run("source-c", operation)).resolves.toEqual({
      accepted: false,
    });

    now += 2_001;
    await expect(limiter.run("source-c", operation)).resolves.toMatchObject({
      accepted: true,
    });
  });
});
