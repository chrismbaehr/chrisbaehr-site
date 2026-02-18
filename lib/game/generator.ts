import type { GameState, Rng, RoundConfig, Site } from "@/lib/game/types";
import { countMismatches, hasValidPam } from "@/lib/game/sequence";

const BASES = ["A", "C", "G", "T"] as const;

const randomBase = (rng: Rng): string => rng.pick(BASES);

export const randomSequence = (rng: Rng, length: number): string => {
  let sequence = "";
  for (let idx = 0; idx < length; idx += 1) {
    sequence += randomBase(rng);
  }
  return sequence;
};

export const mutateSequence = (rng: Rng, source: string, mismatches: number): string => {
  const chars = source.split("");
  const used = new Set<number>();
  const maxMismatches = Math.min(mismatches, chars.length);

  while (used.size < maxMismatches) {
    const pos = rng.int(0, chars.length - 1);
    if (used.has(pos)) {
      continue;
    }
    used.add(pos);

    const original = chars[pos];
    const options = BASES.filter((base) => base !== original);
    chars[pos] = rng.pick(options);
  }

  return chars.join("");
};

const createPam = (rng: Rng, forceValid: boolean): string => {
  if (forceValid) {
    return `${randomBase(rng)}GG`;
  }

  let pam = "";
  while (pam.length !== 3 || hasValidPam(pam)) {
    pam = `${randomBase(rng)}${randomBase(rng)}${randomBase(rng)}`;
  }
  return pam;
};

const getMismatchTarget = (
  state: GameState,
  round: RoundConfig,
  progress: number,
): { mismatchCount: number; isNear: boolean } => {
  const nearChance = Math.min(0.82, round.nearBase + progress * round.nearRamp);
  const wrongChance = Math.min(0.9, round.wrongBase + progress * 0.1);
  const draw = state.rng.next();

  if (draw < 0.14) {
    return { mismatchCount: 0, isNear: false };
  }

  if (draw < 0.14 + nearChance) {
    return { mismatchCount: state.rng.int(1, 2), isNear: true };
  }

  if (draw < 0.14 + nearChance + wrongChance) {
    return { mismatchCount: state.rng.int(3, 6), isNear: false };
  }

  return { mismatchCount: state.rng.int(7, 10), isNear: false };
};

export const createSite = (
  state: GameState,
  round: RoundConfig,
  progress: number,
  viewportWidth: number,
  trackY: number,
): Site => {
  const guide = state.roundGuides[state.roundIndex];
  const length = guide.length;
  const { mismatchCount } = getMismatchTarget(state, round, progress);
  const sequence = mismatchCount === 0 ? guide : mutateSequence(state.rng, guide, mismatchCount);
  const hasPam = state.rng.next() < round.pamRate;
  const pam = createPam(state.rng, hasPam);

  const computedMismatches = countMismatches(guide, sequence);
  const charWidth = 10;
  const width = Math.max(158, length * charWidth + 64);
  const height = 58;

  return {
    id: state.nextSiteId,
    sequence,
    pam,
    hasPam: hasValidPam(pam),
    mismatches: computedMismatches,
    x: viewportWidth + width * 0.8,
    y: trackY + state.rng.int(-72, 72),
    width,
    height,
    cutAtMs: null,
  };
};

export const createRoundGuides = (state: GameState, rounds: number, length: number): string[] => {
  const guides: string[] = [];

  for (let idx = 0; idx < rounds; idx += 1) {
    guides.push(randomSequence(state.rng, length));
  }

  return guides;
};

export const createRoundGuidesFromRng = (rng: Rng, rounds: number, length: number): string[] => {
  const guides: string[] = [];

  for (let idx = 0; idx < rounds; idx += 1) {
    guides.push(randomSequence(rng, length));
  }

  return guides;
};
