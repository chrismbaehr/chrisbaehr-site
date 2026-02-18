import type { CutOutcome, GameState, GameViewport, Site } from "@/lib/game/types";

interface RenderOpts {
  nowMs: number;
}

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const getSiteColors = (site: Site): { fill: string; border: string } => {
  if (!site.hasPam) {
    return { fill: "rgba(235, 215, 206, 0.95)", border: "#9a5338" };
  }

  if (site.mismatches === 0) {
    return { fill: "rgba(218, 236, 226, 0.96)", border: "#2d5e48" };
  }

  if (site.mismatches <= 2) {
    return { fill: "rgba(240, 229, 198, 0.96)", border: "#7a6524" };
  }

  return { fill: "rgba(232, 218, 214, 0.96)", border: "#855149" };
};

const drawTrack = (ctx: CanvasRenderingContext2D, state: GameState, viewport: GameViewport): void => {
  ctx.strokeStyle = "rgba(47, 84, 69, 0.26)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, viewport.trackY);
  ctx.lineTo(viewport.width, viewport.trackY);
  ctx.stroke();

  const markerWidth = 24;
  const spacing = 56;
  ctx.fillStyle = "rgba(47, 84, 69, 0.2)";

  for (let x = -spacing; x <= viewport.width + spacing; x += spacing) {
    const shifted = x - state.trackOffsetPx;
    ctx.fillRect(shifted, viewport.trackY - 8, markerWidth, 16);
  }
};

const drawSite = (
  ctx: CanvasRenderingContext2D,
  site: Site,
  state: GameState,
): void => {
  const left = site.x - site.width * 0.5;
  const top = site.y - site.height * 0.5;
  const colors = getSiteColors(site);

  drawRoundedRect(ctx, left, top, site.width, site.height, 10);
  ctx.fillStyle = colors.fill;
  ctx.fill();
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#1f3b2f";
  ctx.font = "600 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(site.sequence, left + 10, site.y);

  const pamWidth = 44;
  const pamLeft = left + site.width - pamWidth - 9;
  drawRoundedRect(ctx, pamLeft, top + 10, pamWidth, site.height - 20, 7);
  ctx.fillStyle = site.hasPam ? "rgba(36, 71, 56, 0.16)" : "rgba(154, 83, 56, 0.2)";
  ctx.fill();
  ctx.strokeStyle = site.hasPam ? "rgba(36, 71, 56, 0.48)" : "rgba(154, 83, 56, 0.6)";
  ctx.stroke();

  ctx.fillStyle = "#1f3b2f";
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText(site.pam, pamLeft + 10, site.y);

  const dx = Math.abs(state.enzymeX - site.x);
  const dy = Math.abs(state.enzymeY - site.y);
  const inRange = dx <= site.width * 0.5 + state.enzymeRadius && dy <= site.height * 0.5 + state.enzymeRadius;

  if (inRange) {
    drawRoundedRect(ctx, left - 2, top - 2, site.width + 4, site.height + 4, 12);
    ctx.strokeStyle = "rgba(45, 94, 72, 0.62)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
};

const outcomeColor = (outcome: CutOutcome | null): string => {
  if (outcome === "correct") {
    return "rgba(45, 94, 72, 0.44)";
  }
  if (outcome === "near") {
    return "rgba(122, 101, 36, 0.44)";
  }
  if (outcome === "noPam" || outcome === "wrong") {
    return "rgba(154, 83, 56, 0.42)";
  }
  return "rgba(47, 84, 69, 0.24)";
};

const drawEnzyme = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: GameViewport,
  nowMs: number,
): void => {
  const radius = state.enzymeRadius;
  const x = state.enzymeX;
  const y = state.enzymeY;

  if (!state.reducedMotion && nowMs - state.lastCutMs < 220) {
    const fade = 1 - (nowMs - state.lastCutMs) / 220;
    ctx.beginPath();
    ctx.arc(x, y, radius + 18, 0, Math.PI * 2);
    ctx.fillStyle = outcomeColor(state.lastCutOutcome).replace("0.44", String(0.44 * fade));
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#244738";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 13px 'Instrument Sans', 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Cas", x, y - 1);
  ctx.textAlign = "start";

  ctx.strokeStyle = "rgba(36, 71, 56, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(viewport.width, y);
  ctx.stroke();
};

export const renderGameFrame = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: GameViewport,
  opts: RenderOpts,
): void => {
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.58)";
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  drawTrack(ctx, state, viewport);

  for (const site of state.sites) {
    drawSite(ctx, site, state);
  }

  drawEnzyme(ctx, state, viewport, opts.nowMs);
};
