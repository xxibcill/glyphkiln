import { describe, expect, it } from "vitest";

import { PRNG_ALGORITHM, createSeededRandom } from "../src/index.js";

describe("seeded randomness", () => {
  it("publishes a stable algorithm identifier", () => {
    expect(PRNG_ALGORITHM).toBe("xoshiro128**/sha256-seed-v1");
  });

  it.each([
    {
      seed: "glyphkiln",
      expected: [3978375345, 944851084, 3189784840, 525328402, 500520451, 68289798],
    },
    {
      seed: "",
      expected: [2352176578, 3995682531, 789331166, 3278704162, 3534728208, 3569834582],
    },
  ])("matches the published vector for '$seed'", ({ seed, expected }) => {
    const random = createSeededRandom(seed);
    expect(expected.map(() => random.nextUint32())).toEqual(expected);
  });

  it("provides deterministic ranges, picks, and forks", () => {
    const first = createSeededRandom("utilities");
    const second = createSeededRandom("utilities");
    expect(first.integer(4, 9)).toBe(second.integer(4, 9));
    expect(first.float(-2, 3)).toBe(second.float(-2, 3));
    expect(first.pick(["a", "b", "c"])).toBe(second.pick(["a", "b", "c"]));
    expect(first.fork("child").nextUint32()).toBe(second.fork("child").nextUint32());
  });

  it("rejects invalid utility arguments", () => {
    const random = createSeededRandom("invalid");
    expect(() => random.integer(2, 1)).toThrow(RangeError);
    expect(() => random.boolean(1.1)).toThrow(RangeError);
    expect(() => random.pick([])).toThrow(RangeError);
  });
});
