import { createHash } from "node:crypto";

export const PRNG_ALGORITHM = "xoshiro128**/sha256-seed-v1" as const;

export type SeededRandom = {
  nextUint32(): number;
  next(): number;
  float(min?: number, max?: number): number;
  integer(min: number, maxInclusive: number): number;
  boolean(probability?: number): boolean;
  pick<T>(items: readonly T[]): T;
  fork(label: string): SeededRandom;
};

export function createSeededRandom(seed: string): SeededRandom {
  const state = seedState(seed);
  return {
    nextUint32(): number {
      const result = Math.imul(rotateLeft(Math.imul(state[1], 5), 7), 9) >>> 0;
      const temporary = (state[1] << 9) >>> 0;

      state[2] = (state[2] ^ state[0]) >>> 0;
      state[3] = (state[3] ^ state[1]) >>> 0;
      state[1] = (state[1] ^ state[2]) >>> 0;
      state[0] = (state[0] ^ state[3]) >>> 0;
      state[2] = (state[2] ^ temporary) >>> 0;
      state[3] = rotateLeft(state[3], 11);
      return result;
    },
    next(): number {
      return this.nextUint32() / 0x1_0000_0000;
    },
    float(min = 0, max = 1): number {
      return min + (max - min) * this.next();
    },
    integer(min: number, maxInclusive: number): number {
      if (
        !Number.isInteger(min) ||
        !Number.isInteger(maxInclusive) ||
        min > maxInclusive
      ) {
        throw new RangeError("integer() requires an ordered integer range.");
      }
      return min + Math.floor(this.next() * (maxInclusive - min + 1));
    },
    boolean(probability = 0.5): boolean {
      if (probability < 0 || probability > 1) {
        throw new RangeError("boolean() probability must be between 0 and 1.");
      }
      return this.next() < probability;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError("pick() requires at least one item.");
      }
      return items[this.integer(0, items.length - 1)]!;
    },
    fork(label: string): SeededRandom {
      return createSeededRandom(`${seed}\u0000${label}`);
    },
  };
}

function seedState(seed: string): [number, number, number, number] {
  const digest = createHash("sha256").update(seed, "utf8").digest();
  const state: [number, number, number, number] = [
    digest.readUInt32LE(0),
    digest.readUInt32LE(4),
    digest.readUInt32LE(8),
    digest.readUInt32LE(12),
  ];
  if (state.every((value) => value === 0)) {
    state[0] = 0x9e37_79b9;
  }
  return state;
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}
