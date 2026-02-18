"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Fraunces, Instrument_Sans } from "next/font/google";
import Link from "next/link";
import styles from "./game.module.css";
import { applyKeyState, clearPointer, createInputState, requestCut, setPointer } from "@/lib/game/input";
import { renderGameFrame } from "@/lib/game/render";
import {
  createGameState,
  getGuideForCurrentRound,
  getRoundSummary,
  getTimeLeftSeconds,
  resetGame,
  startGame,
  updateGameState,
} from "@/lib/game/state";
import type { GameState, GameViewport, HudMessage, Phase } from "@/lib/game/types";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument-sans",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-fraunces",
});

interface HudState {
  phase: Phase;
  roundLabel: string;
  roundIndex: number;
  totalRounds: number;
  guide: string;
  score: number;
  timeLeftSeconds: number;
  message: HudMessage | null;
  summary: ReturnType<typeof getRoundSummary> | null;
  nextRoundLabel: string | null;
}

interface PointerDownRecord {
  id: number;
  startX: number;
  startY: number;
  startMs: number;
  moved: boolean;
}

const FALLBACK_VIEWPORT: GameViewport = {
  width: 320,
  height: 360,
  trackY: 210,
};
const DEFAULT_SEED = "crispr-seed-1";

const getDefaultSeedText = (): string => String(Math.floor(Date.now() / 1000));

const computeViewport = (width: number): GameViewport => {
  const clampedWidth = Math.max(280, Math.floor(width));
  const height = clampedWidth < 640 ? 360 : 430;
  return {
    width: clampedWidth,
    height,
    trackY: Math.round(height * 0.58),
  };
};

const snapshotHud = (state: GameState): HudState => {
  const nextRoundLabel =
    state.phase === "transition" && state.roundIndex + 1 < state.roundConfigs.length
      ? state.roundConfigs[state.roundIndex + 1].label
      : null;

  return {
    phase: state.phase,
    roundLabel: state.roundConfigs[state.roundIndex]?.label ?? "Round 1",
    roundIndex: state.roundIndex + 1,
    totalRounds: state.roundConfigs.length,
    guide: getGuideForCurrentRound(state),
    score: state.stats.score,
    timeLeftSeconds: getTimeLeftSeconds(state),
    message: state.message,
    summary: state.phase === "summary" ? getRoundSummary(state) : null,
    nextRoundLabel,
  };
};

const mapPointerToCanvas = (
  event: ReactPointerEvent<HTMLCanvasElement>,
): { x: number; y: number } => {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return { x, y };
};

export default function GamePage() {
  const initialGameState = useMemo(
    () =>
      createGameState({
        seedInput: DEFAULT_SEED,
        reducedMotion: false,
        viewport: FALLBACK_VIEWPORT,
      }),
    [],
  );

  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef(createInputState());
  const viewportRef = useRef<GameViewport>(FALLBACK_VIEWPORT);
  const pointerDownRef = useRef<PointerDownRecord | null>(null);
  const stateRef = useRef<GameState | null>(initialGameState);

  const [seedText, setSeedText] = useState(DEFAULT_SEED);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [keyboardEnabled, setKeyboardEnabled] = useState(true);
  const [hud, setHud] = useState<HudState>(() => snapshotHud(initialGameState));

  useEffect(() => {
    inputRef.current.keyboardEnabled = keyboardEnabled;
  }, [keyboardEnabled]);

  useEffect(() => {
    if (stateRef.current) {
      stateRef.current.reducedMotion = reducedMotion;
    }
  }, [reducedMotion]);

  useEffect(() => {
    const node = canvasWrapRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextViewport = computeViewport(entry.contentRect.width);
      viewportRef.current = nextViewport;

      const runtime = stateRef.current;
      if (runtime) {
        runtime.enzymeX = Math.min(runtime.enzymeX, nextViewport.width - runtime.enzymeRadius - 8);
        runtime.enzymeY = Math.min(runtime.enzymeY, nextViewport.height - runtime.enzymeRadius - 8);
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!inputRef.current.keyboardEnabled) {
        return;
      }

      const key = event.key;
      if (key === " " && event.repeat) {
        event.preventDefault();
        return;
      }

      const handled = applyKeyState(inputRef.current, key, true);
      if (handled) {
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!inputRef.current.keyboardEnabled) {
        return;
      }

      const handled = applyKeyState(inputRef.current, event.key, false);
      if (handled) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let animationFrame = 0;
    let lastFrameMs = 0;
    let lastHudFrame = 0;

    const renderLoop = (nowMs: number) => {
      const state = stateRef.current;
      if (!state) {
        animationFrame = window.requestAnimationFrame(renderLoop);
        return;
      }

      const viewport = viewportRef.current;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const targetWidth = Math.floor(viewport.width * dpr);
      const targetHeight = Math.floor(viewport.height * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const deltaMs = lastFrameMs === 0 ? 16 : Math.min(42, nowMs - lastFrameMs);
      lastFrameMs = nowMs;

      updateGameState(state, inputRef.current, deltaMs, nowMs, viewport);
      renderGameFrame(ctx, state, viewport, { nowMs });

      if (nowMs - lastHudFrame > 100) {
        setHud(snapshotHud(state));
        lastHudFrame = nowMs;
      }

      animationFrame = window.requestAnimationFrame(renderLoop);
    };

    animationFrame = window.requestAnimationFrame(renderLoop);
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  const applySeed = () => {
    const nextSeed = seedText.trim() || getDefaultSeedText();
    const freshState = resetGame(nextSeed, reducedMotion, viewportRef.current);
    stateRef.current = freshState;
    setSeedText(nextSeed);
    setHud(snapshotHud(freshState));

    const url = new URL(window.location.href);
    url.searchParams.set("seed", nextSeed);
    window.history.replaceState(null, "", url);
  };

  const startFromTutorial = () => {
    if (!stateRef.current) {
      return;
    }
    startGame(stateRef.current, viewportRef.current);
    setHud(snapshotHud(stateRef.current));
  };

  const restartRoundSet = () => {
    const nextSeed = seedText.trim() || getDefaultSeedText();
    const freshState = resetGame(nextSeed, reducedMotion, viewportRef.current);
    stateRef.current = freshState;
    setHud(snapshotHud(freshState));
  };

  const messageClassName = useMemo(() => {
    if (!hud.message) {
      return styles.message;
    }

    if (hud.message.tone === "good") {
      return `${styles.message} ${styles.messageGood}`;
    }

    if (hud.message.tone === "warn") {
      return `${styles.message} ${styles.messageWarn}`;
    }

    if (hud.message.tone === "bad") {
      return `${styles.message} ${styles.messageBad}`;
    }

    return styles.message;
  }, [hud.message]);

  return (
    <div className={`${styles.page} ${instrumentSans.variable} ${fraunces.variable}`}>
      <a className={styles.skipLink} href="#main">Skip to content</a>

      <header className={styles.header} aria-label="Primary">
        <nav className={styles.navWrap}>
          <Link className={styles.brand} href="/index.html#top" aria-label="Chris Baehr home">
            <svg className={styles.brandIcon} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              <path d="M16 3c-1.1 5.8-4.7 9.9-9.8 12.2 2.7.8 5.2.8 7.3.2-.8 2.5-2.2 4.6-4.4 6.6 4.9-.5 8.5-3.3 10.8-8.2 2.3 2.1 3.8 5.1 4.3 8.8 2.4-5.2 2.5-10.1.2-14.6C22.5 5.5 19.6 3.9 16 3Z" />
            </svg>
            <span className={styles.brandMark}>CB</span>
          </Link>
          <ul className={styles.navLinks}>
            <li><Link href="/index.html#work">My Work</Link></li>
            <li><Link href="/index.html#about">About</Link></li>
            <li><Link href="/index.html#contact">Contact</Link></li>
            <li><Link href="/free-time.html">Fun</Link></li>
            <li><a href="https://www.linkedin.com/in/chris-m-baehr-berkeley">LinkedIn</a></li>
            <li><a href="https://scholar.google.com/citations?user=3DOPwlEAAAAJ&amp;hl=en">Scholar</a></li>
          </ul>
        </nav>
      </header>

      <main id="main" className={styles.main}>
        <section className={styles.hero} aria-labelledby="game-title">
          <p className={styles.eyebrow}>Mini-game</p>
          <h1 id="game-title">Cas Chase: Cut the right site, dodge off-targets.</h1>
          <p className={styles.heroLead}>
            Drag or move your Cas enzyme over DNA sites, then cut. Perfect guide matches with a valid PAM score highest,
            near matches warn for off-target risk, and no-PAM cuts are penalized.
          </p>
          <div className={styles.controls}>
            <div className={styles.seedControl}>
              <label htmlFor="seed-input">Seed</label>
              <input
                id="seed-input"
                type="text"
                value={seedText}
                onChange={(event) => setSeedText(event.target.value)}
                aria-label="Deterministic random seed"
              />
              <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={applySeed}>
                Apply seed
              </button>
            </div>
            <div className={styles.toggleGroup}>
              <button
                className={styles.toggleButton}
                type="button"
                aria-pressed={reducedMotion}
                onClick={() => setReducedMotion((prev) => !prev)}
              >
                Reduced motion: {reducedMotion ? "On" : "Off"}
              </button>
              <button
                className={styles.toggleButton}
                type="button"
                aria-pressed={keyboardEnabled}
                onClick={() => setKeyboardEnabled((prev) => !prev)}
              >
                Keyboard controls: {keyboardEnabled ? "On" : "Off"}
              </button>
            </div>
          </div>
        </section>

        <section className={styles.gameShell} aria-label="CRISPR targeting game">
          <div className={styles.hudTop}>
            <div className={styles.hudChip}>
              Guide RNA
              <span className={styles.hudValue}>{hud.guide || "-"}</span>
            </div>
            <div className={styles.hudChip}>
              Round
              <span className={styles.hudValue}>{hud.roundLabel}</span>
            </div>
            <div className={styles.hudChip}>
              Time left
              <span className={styles.hudValue}>{hud.timeLeftSeconds}s</span>
            </div>
            <div className={styles.hudChip}>
              Score
              <span className={styles.hudValue}>{hud.score}</span>
            </div>
          </div>

          <div className={styles.canvasWrap} ref={canvasWrapRef}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              aria-label="DNA targeting game canvas"
              onPointerDown={(event) => {
                const { x, y } = mapPointerToCanvas(event);
                event.currentTarget.setPointerCapture(event.pointerId);
                setPointer(inputRef.current, x, y, true);
                pointerDownRef.current = {
                  id: event.pointerId,
                  startX: x,
                  startY: y,
                  startMs: performance.now(),
                  moved: false,
                };
              }}
              onPointerMove={(event) => {
                const { x, y } = mapPointerToCanvas(event);
                const current = pointerDownRef.current;
                if (current && current.id === event.pointerId) {
                  const distance = Math.hypot(x - current.startX, y - current.startY);
                  if (distance > 10) {
                    current.moved = true;
                  }
                }

                const isMouse = event.pointerType === "mouse";
                setPointer(inputRef.current, x, y, isMouse || inputRef.current.pointerActive);
              }}
              onPointerUp={(event) => {
                const current = pointerDownRef.current;
                const nowMs = performance.now();
                if (current && current.id === event.pointerId) {
                  const wasTap = !current.moved && nowMs - current.startMs < 260;
                  if ((event.pointerType === "mouse" && event.button === 0) || (event.pointerType !== "mouse" && wasTap)) {
                    requestCut(inputRef.current);
                  }
                }

                pointerDownRef.current = null;
                clearPointer(inputRef.current);
              }}
              onPointerCancel={() => {
                pointerDownRef.current = null;
                clearPointer(inputRef.current);
              }}
            />

            {hud.phase === "tutorial" ? (
              <div className={styles.overlay}>
                <div className={styles.overlayCard}>
                  <h2>Quick tutorial</h2>
                  <p>
                    You are guiding a Cas enzyme over moving DNA sites. Each site has a candidate sequence and an adjacent
                    PAM. Your guide RNA is shown at the top.
                  </p>
                  <ul>
                    <li>Perfect guide match with an NGG PAM: +100.</li>
                    <li>1-2 mismatches with PAM: +20 and flagged as off-target risk.</li>
                    <li>No valid PAM: -50, even if the sequence matches.</li>
                    <li>3+ mismatches: -100 for an off-target cut.</li>
                  </ul>
                  <p>
                    Controls: move with mouse or touch drag. Keyboard mode uses arrow keys or WASD. Cut using click,
                    tap, Space, or the cut button.
                  </p>
                  <div className={styles.overlayActions}>
                    <button className={styles.button} type="button" onClick={startFromTutorial}>
                      Start round 1
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {hud.phase === "transition" ? (
              <div className={styles.overlay}>
                <div className={styles.overlayCard}>
                  <h2>Round complete</h2>
                  <p>Great pace. Next up: {hud.nextRoundLabel ?? "Next round"}.</p>
                </div>
              </div>
            ) : null}

            {hud.phase === "summary" && hud.summary ? (
              <div className={styles.overlay}>
                <div className={styles.overlayCard}>
                  <h2>Run summary</h2>
                  <ul>
                    <li>Accuracy: {hud.summary.accuracyPercent}%</li>
                    <li>Off-target cuts: {hud.summary.offTargetCuts}</li>
                    <li>PAM violations: {hud.summary.pamViolations}</li>
                    <li>Best on-target streak: {hud.summary.bestStreak}</li>
                    <li>Total score: {hud.summary.score}</li>
                  </ul>
                  <div className={styles.overlayActions}>
                    <button className={styles.button} type="button" onClick={restartRoundSet}>
                      Play again
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className={styles.hudBottom}>
            <p className={messageClassName}>
              {hud.message?.text ?? "Move over a site, then cut. Targets speed up each round."}
            </p>
            <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => requestCut(inputRef.current)}>
              Cut (click / tap / space)
            </button>
          </div>
        </section>

        <details className={styles.scienceNotes}>
          <summary>Science notes</summary>
          <ul>
            <li>This game simplifies targeting to sequence matching and PAM checks; real editing depends on chromatin, delivery, and cell state.</li>
            <li>PAM is modeled as NGG for a SpCas9-like rule; different nucleases use different PAM or PFS constraints.</li>
            <li>Mismatches are treated uniformly, but biological tolerance depends on mismatch position and local sequence context.</li>
            <li>All on-canvas sites are equal-length toy targets; real genomes include indels, SNPs, and structural variation.</li>
            <li>Cut outcomes are instant in the game; in vivo editing has kinetics, expression windows, and repair pathway effects.</li>
            <li>Off-target risk here is sequence-only; practical risk also depends on concentration, exposure time, and tissue distribution.</li>
            <li>Guide quality in practice involves additional filters: GC balance, secondary structure, and predicted accessibility.</li>
            <li>Scoring is educational and not predictive of therapeutic performance.</li>
          </ul>
        </details>
      </main>

      <footer className={styles.footer}>
        <p>Chris Baehr</p>
        <p>Last updated: 2026-02-18</p>
      </footer>
    </div>
  );
}
