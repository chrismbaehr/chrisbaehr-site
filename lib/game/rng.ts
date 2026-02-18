import type { Rng } from "@/lib/game/types";

const MASK_32_BIT = 0xffffffff;

const hashSeed = (seedInput: number | string): number => {
  const raw = typeof seedInput === "number" ? String(seedInput) : seedInput;
  let hash = 2166136261;

  for (let idx = 0; idx < raw.length; idx += 1) {
    hash ^= raw.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) || 1;
};

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) & MASK_32_BIT;
    let next = Math.imul(state ^ (state >>> 15), state | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
};

export const normalizeSeed = (seedInput: number | string): number => hashSeed(seedInput);

export const createRng = (seedInput: number | string): Rng => {
  const seed = hashSeed(seedInput);
  const nextRaw = mulberry32(seed);

  return {
    next: () => nextRaw(),
    int: (min: number, max: number) => {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return Math.floor(nextRaw() * (hi - lo + 1)) + lo;
    },
    pick: <T>(items: readonly T[]) => {
      const index = Math.floor(nextRaw() * items.length);
      return items[Math.min(index, items.length - 1)];
    },
  };
};
