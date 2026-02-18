import { createSite, createRoundGuidesFromRng } from "@/lib/game/generator";
import { consumeCutRequest } from "@/lib/game/input";
import { createRng, normalizeSeed } from "@/lib/game/rng";
import { classifyCut } from "@/lib/game/sequence";
import type {
  CutOutcome,
  GameState,
  GameViewport,
  InputState,
  RoundConfig,
  RoundSummary,
  Site,
} from "@/lib/game/types";

const GUIDE_LENGTH = 16;

export const ROUND_CONFIGS: readonly RoundConfig[] = [
  {
    label: "Round 1",
    durationMs: 45000,
    baseSpeed: 96,
    speedRamp: 28,
    spawnBaseMs: 1480,
    spawnMinMs: 860,
    nearBase: 0.32,
    nearRamp: 0.14,
    wrongBase: 0.28,
    pamRate: 0.74,
  },
  {
    label: "Round 2",
    durationMs: 60000,
    baseSpeed: 122,
    speedRamp: 42,
    spawnBaseMs: 1320,
    spawnMinMs: 700,
    nearBase: 0.38,
    nearRamp: 0.2,
    wrongBase: 0.36,
    pamRate: 0.7,
  },
  {
    label: "Round 3",
    durationMs: 70000,
    baseSpeed: 152,
    speedRamp: 56,
    spawnBaseMs: 1180,
    spawnMinMs: 560,
    nearBase: 0.44,
    nearRamp: 0.22,
    wrongBase: 0.42,
    pamRate: 0.67,
  },
];

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const setMessage = (
  state: GameState,
  text: string,
  tone: "good" | "warn" | "bad" | "info",
  nowMs: number,
): void => {
  state.message = { text, tone, expiresAtMs: nowMs + 1700 };
};

const resetRound = (state: GameState, viewport: GameViewport): void => {
  state.roundElapsedMs = 0;
  state.spawnCooldownMs = 600;
  state.sites = [];
  state.enzymeX = clamp(160, state.enzymeRadius + 12, viewport.width - state.enzymeRadius - 12);
  state.enzymeY = clamp(viewport.trackY, state.enzymeRadius + 20, viewport.height - state.enzymeRadius - 20);
  state.trackOffsetPx = 0;
};

const scoreCut = (state: GameState, outcome: CutOutcome, nowMs: number): void => {
  state.lastCutOutcome = outcome;
  state.lastCutMs = nowMs;

  if (outcome === "miss") {
    setMessage(state, "No site aligned for a cut.", "info", nowMs);
    return;
  }

  state.stats.evaluatedCuts += 1;

  if (outcome === "correct") {
    state.stats.score += 100;
    state.stats.correctCuts += 1;
    state.stats.currentStreak += 1;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.currentStreak);
    setMessage(state, "+100 perfect on-target cut.", "good", nowMs);
    return;
  }

  state.stats.currentStreak = 0;

  if (outcome === "near") {
    state.stats.score += 20;
    state.stats.nearCuts += 1;
    state.stats.offTargetCuts += 1;
    setMessage(state, "+20 near match, off-target risk.", "warn", nowMs);
    return;
  }

  if (outcome === "noPam") {
    state.stats.score -= 50;
    state.stats.pamViolations += 1;
    setMessage(state, "-50 PAM missing: NGG required.", "bad", nowMs);
    return;
  }

  state.stats.score -= 100;
  state.stats.wrongCuts += 1;
  state.stats.offTargetCuts += 1;
  setMessage(state, "-100 off-target cut.", "bad", nowMs);
};

const findActiveSite = (state: GameState): { index: number; site: Site } | null => {
  const enzymeRadius = state.enzymeRadius;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let idx = 0; idx < state.sites.length; idx += 1) {
    const site = state.sites[idx];
    const dx = Math.abs(site.x - state.enzymeX);
    const dy = Math.abs(site.y - state.enzymeY);
    const overlapX = dx <= site.width * 0.5 + enzymeRadius;
    const overlapY = dy <= site.height * 0.5 + enzymeRadius;

    if (!overlapX || !overlapY) {
      continue;
    }

    const distance = dx + dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = idx;
    }
  }

  if (bestIndex < 0) {
    return null;
  }

  return { index: bestIndex, site: state.sites[bestIndex] };
};

const applyCutAttempt = (state: GameState, nowMs: number): void => {
  const activeSite = findActiveSite(state);

  if (!activeSite) {
    scoreCut(state, "miss", nowMs);
    return;
  }

  const guide = state.roundGuides[state.roundIndex];
  const outcome = classifyCut(guide, activeSite.site.sequence, activeSite.site.pam);
  state.sites.splice(activeSite.index, 1);
  scoreCut(state, outcome, nowMs);
};

const beginRound = (state: GameState, roundIndex: number, viewport: GameViewport): void => {
  state.roundIndex = roundIndex;
  state.phase = "playing";
  resetRound(state, viewport);
};

const finishRound = (state: GameState): void => {
  const totalCuts = state.stats.evaluatedCuts;
  const accuracy = totalCuts === 0 ? 0 : (state.stats.correctCuts / totalCuts) * 100;
  state.completedRoundAccuracies[state.roundIndex] = accuracy;

  if (state.roundIndex >= state.roundConfigs.length - 1) {
    state.phase = "summary";
    state.sites = [];
    return;
  }

  state.phase = "transition";
  state.transitionMsLeft = 2600;
  state.sites = [];
};

const getRoundProgress = (state: GameState): number => {
  const currentRound = state.roundConfigs[state.roundIndex];
  return clamp(state.roundElapsedMs / currentRound.durationMs, 0, 1);
};

const updateEnzymePosition = (
  state: GameState,
  input: InputState,
  deltaMs: number,
  viewport: GameViewport,
): void => {
  const keyboardX = Number(input.moveRight) - Number(input.moveLeft);
  const keyboardY = Number(input.moveDown) - Number(input.moveUp);
  const usedKeyboard = input.keyboardEnabled && (keyboardX !== 0 || keyboardY !== 0);

  if (usedKeyboard) {
    const dt = deltaMs / 1000;
    state.enzymeX += keyboardX * state.enzymeSpeed * dt;
    state.enzymeY += keyboardY * state.enzymeSpeed * dt;
  } else if (input.pointerX !== null && input.pointerY !== null) {
    state.enzymeX = input.pointerX;
    state.enzymeY = input.pointerY;
  }

  state.enzymeX = clamp(state.enzymeX, state.enzymeRadius + 8, viewport.width - state.enzymeRadius - 8);
  state.enzymeY = clamp(state.enzymeY, state.enzymeRadius + 8, viewport.height - state.enzymeRadius - 8);
};

export const createGameState = (opts: {
  seedInput: number | string;
  reducedMotion: boolean;
  viewport: GameViewport;
}): GameState => {
  const seed = normalizeSeed(opts.seedInput);
  const rng = createRng(seed);

  return {
    seed,
    rng,
    phase: "tutorial",
    roundIndex: 0,
    roundConfigs: ROUND_CONFIGS,
    roundGuides: createRoundGuidesFromRng(rng, ROUND_CONFIGS.length, GUIDE_LENGTH),
    roundElapsedMs: 0,
    transitionMsLeft: 0,
    spawnCooldownMs: 0,
    trackOffsetPx: 0,
    enzymeX: clamp(160, 32, opts.viewport.width - 32),
    enzymeY: clamp(opts.viewport.trackY, 32, opts.viewport.height - 32),
    enzymeRadius: 18,
    enzymeSpeed: 300,
    sites: [],
    nextSiteId: 1,
    stats: {
      score: 0,
      evaluatedCuts: 0,
      correctCuts: 0,
      nearCuts: 0,
      wrongCuts: 0,
      pamViolations: 0,
      offTargetCuts: 0,
      bestStreak: 0,
      currentStreak: 0,
    },
    message: null,
    reducedMotion: opts.reducedMotion,
    lastCutOutcome: null,
    lastCutMs: 0,
    completedRoundAccuracies: [],
  };
};

export const startGame = (state: GameState, viewport: GameViewport): void => {
  beginRound(state, 0, viewport);
  state.message = null;
};

export const resetGame = (
  seedInput: number | string,
  reducedMotion: boolean,
  viewport: GameViewport,
): GameState => {
  return createGameState({ seedInput, reducedMotion, viewport });
};

export const updateGameState = (
  state: GameState,
  input: InputState,
  deltaMs: number,
  nowMs: number,
  viewport: GameViewport,
): void => {
  if (state.message && state.message.expiresAtMs <= nowMs) {
    state.message = null;
  }

  if (state.phase === "tutorial" || state.phase === "summary") {
    return;
  }

  if (state.phase === "transition") {
    state.transitionMsLeft -= deltaMs;
    if (state.transitionMsLeft <= 0) {
      beginRound(state, state.roundIndex + 1, viewport);
    }
    return;
  }

  updateEnzymePosition(state, input, deltaMs, viewport);

  const round = state.roundConfigs[state.roundIndex];
  const progress = getRoundProgress(state);
  const speed = round.baseSpeed + progress * round.speedRamp;
  state.trackOffsetPx = (state.trackOffsetPx + speed * (deltaMs / 1000)) % 56;

  state.spawnCooldownMs -= deltaMs;
  const spawnInterval = Math.max(round.spawnMinMs, round.spawnBaseMs - progress * 520);

  while (state.spawnCooldownMs <= 0) {
    state.sites.push(createSite(state, round, progress, viewport.width, viewport.trackY));
    state.nextSiteId += 1;
    state.spawnCooldownMs += spawnInterval;
  }

  for (let idx = state.sites.length - 1; idx >= 0; idx -= 1) {
    const site = state.sites[idx];
    site.x -= speed * (deltaMs / 1000);

    if (site.x + site.width * 0.5 < -8) {
      state.sites.splice(idx, 1);
    }
  }

  if (consumeCutRequest(input)) {
    applyCutAttempt(state, nowMs);
  }

  state.roundElapsedMs += deltaMs;

  if (state.roundElapsedMs >= round.durationMs) {
    finishRound(state);
  }
};

export const getRoundSummary = (state: GameState): RoundSummary => {
  const accuracyPercent =
    state.stats.evaluatedCuts === 0
      ? 0
      : Math.round((state.stats.correctCuts / state.stats.evaluatedCuts) * 1000) / 10;

  return {
    score: state.stats.score,
    accuracyPercent,
    offTargetCuts: state.stats.offTargetCuts,
    pamViolations: state.stats.pamViolations,
    bestStreak: state.stats.bestStreak,
    roundsCompleted: state.phase === "summary" ? state.roundConfigs.length : state.roundIndex,
  };
};

export const getGuideForCurrentRound = (state: GameState): string => state.roundGuides[state.roundIndex] ?? state.roundGuides[0];

export const getTimeLeftSeconds = (state: GameState): number => {
  if (state.phase !== "playing") {
    return 0;
  }

  const config = state.roundConfigs[state.roundIndex];
  return Math.max(0, Math.ceil((config.durationMs - state.roundElapsedMs) / 1000));
};
