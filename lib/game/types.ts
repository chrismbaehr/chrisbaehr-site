export type Phase = "tutorial" | "playing" | "transition" | "summary";

export type CutOutcome = "correct" | "near" | "noPam" | "wrong" | "miss";

export interface Rng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
}

export interface Site {
  id: number;
  sequence: string;
  pam: string;
  hasPam: boolean;
  mismatches: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cutAtMs: number | null;
}

export interface InputState {
  pointerX: number | null;
  pointerY: number | null;
  pointerActive: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  moveUp: boolean;
  moveDown: boolean;
  keyboardEnabled: boolean;
  cutRequested: boolean;
}

export interface GameViewport {
  width: number;
  height: number;
  trackY: number;
}

export interface RoundConfig {
  label: string;
  durationMs: number;
  baseSpeed: number;
  speedRamp: number;
  spawnBaseMs: number;
  spawnMinMs: number;
  nearBase: number;
  nearRamp: number;
  wrongBase: number;
  pamRate: number;
}

export interface GameStats {
  score: number;
  evaluatedCuts: number;
  correctCuts: number;
  nearCuts: number;
  wrongCuts: number;
  pamViolations: number;
  offTargetCuts: number;
  bestStreak: number;
  currentStreak: number;
}

export interface HudMessage {
  text: string;
  tone: "good" | "warn" | "bad" | "info";
  expiresAtMs: number;
}

export interface GameState {
  seed: number;
  rng: Rng;
  phase: Phase;
  roundIndex: number;
  roundConfigs: readonly RoundConfig[];
  roundGuides: string[];
  roundElapsedMs: number;
  transitionMsLeft: number;
  spawnCooldownMs: number;
  trackOffsetPx: number;
  enzymeX: number;
  enzymeY: number;
  enzymeRadius: number;
  enzymeSpeed: number;
  sites: Site[];
  nextSiteId: number;
  stats: GameStats;
  message: HudMessage | null;
  reducedMotion: boolean;
  lastCutOutcome: CutOutcome | null;
  lastCutMs: number;
  completedRoundAccuracies: number[];
}

export interface RoundSummary {
  score: number;
  accuracyPercent: number;
  offTargetCuts: number;
  pamViolations: number;
  bestStreak: number;
  roundsCompleted: number;
}
