import type { CutOutcome, GameState, GameViewport, Site } from "@/lib/game/types";

interface RenderOpts {
  nowMs: number;
}

type SpriteStatus = "idle" | "loading" | "ready" | "error";

type SpriteKind = "default" | "click";

const SPRITE_CANDIDATES: Record<SpriteKind, readonly string[]> = {
  default: [
    "/assets/cas9-sprite.png",
    "/assets/cas9-cursor.png",
    "/assets/cas9-sprite.webp",
  ],
  click: [
    "/assets/cas9-sprite-click.png",
    "/assets/cas9-cursor-click.png",
  ],
};

const spriteStatusMap: Record<SpriteKind, SpriteStatus> = {
  default: "idle",
  click: "idle",
};

const spriteMap: Record<SpriteKind, HTMLCanvasElement | null> = {
  default: null,
  click: null,
};

const spriteIndexMap: Record<SpriteKind, number> = {
  default: 0,
  click: 0,
};

const sanitizeSpriteImage = (image: HTMLImageElement): HTMLCanvasElement => {
  const source = document.createElement("canvas");
  source.width = image.naturalWidth || image.width;
  source.height = image.naturalHeight || image.height;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) {
    return source;
  }

  sourceCtx.drawImage(image, 0, 0);
  const imageData = sourceCtx.getImageData(0, 0, source.width, source.height);
  const data = imageData.data;

  const isCheckerPixel = (r: number, g: number, b: number): boolean => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const spread = max - min;
    // Transparent-grid backgrounds tend to be near-neutral grays.
    return spread <= 14 && max >= 85 && min <= 238;
  };

  for (let idx = 0; idx < data.length; idx += 4) {
    const alpha = data[idx + 3];
    if (alpha === 0) {
      continue;
    }

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    if (isCheckerPixel(r, g, b)) {
      data[idx + 3] = 0;
    }
  }

  sourceCtx.putImageData(imageData, 0, 0);

  const cleanedData = sourceCtx.getImageData(0, 0, source.width, source.height).data;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const idx = (y * source.width + x) * 4 + 3;
      if (cleanedData[idx] > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return source;
  }

  const cropped = document.createElement("canvas");
  cropped.width = maxX - minX + 1;
  cropped.height = maxY - minY + 1;
  const croppedCtx = cropped.getContext("2d");
  if (!croppedCtx) {
    return source;
  }
  croppedCtx.drawImage(
    source,
    minX,
    minY,
    cropped.width,
    cropped.height,
    0,
    0,
    cropped.width,
    cropped.height,
  );

  return cropped;
};

const loadSpriteCandidate = (kind: SpriteKind): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (spriteIndexMap[kind] >= SPRITE_CANDIDATES[kind].length) {
    spriteStatusMap[kind] = "error";
    spriteMap[kind] = null;
    return;
  }

  const next = new window.Image();
  const src = SPRITE_CANDIDATES[kind][spriteIndexMap[kind]];
  spriteStatusMap[kind] = "loading";
  next.onload = () => {
    spriteMap[kind] = sanitizeSpriteImage(next);
    spriteStatusMap[kind] = "ready";
  };
  next.onerror = () => {
    spriteIndexMap[kind] += 1;
    loadSpriteCandidate(kind);
  };
  next.src = src;
};

const getLoadedSprite = (kind: SpriteKind): HTMLCanvasElement | null => {
  if (spriteStatusMap[kind] === "ready" && spriteMap[kind]) {
    return spriteMap[kind];
  }
  if (spriteStatusMap[kind] === "idle") {
    loadSpriteCandidate(kind);
  }
  return null;
};

const drawPanel = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  border: string,
): void => {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
};

const getSiteColors = (site: Site): { fill: string; border: string } => {
  if (!site.hasPam) {
    return { fill: "#37212d", border: "#ff6483" };
  }

  if (site.mismatches === 0) {
    return { fill: "#173c38", border: "#34f4cf" };
  }

  if (site.mismatches <= 2) {
    return { fill: "#3c341f", border: "#ffd166" };
  }

  return { fill: "#2a2441", border: "#af8dff" };
};

const drawTrack = (ctx: CanvasRenderingContext2D, state: GameState, viewport: GameViewport): void => {
  ctx.fillStyle = "#0f1f3a";
  ctx.fillRect(0, viewport.trackY - 20, viewport.width, 40);

  ctx.strokeStyle = "#58c4ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, viewport.trackY);
  ctx.lineTo(viewport.width, viewport.trackY);
  ctx.stroke();

  const markerWidth = 24;
  const spacing = 56;
  ctx.fillStyle = "rgba(88, 196, 255, 0.35)";

  for (let x = -spacing; x <= viewport.width + spacing; x += spacing) {
    const shifted = x - state.trackOffsetPx;
    ctx.fillRect(shifted, viewport.trackY - 7, markerWidth, 14);
  }
};

const drawSite = (
  ctx: CanvasRenderingContext2D,
  site: Site,
  state: GameState,
): void => {
  const left = Math.floor(site.x - site.width * 0.5);
  const top = Math.floor(site.y - site.height * 0.5);
  const colors = getSiteColors(site);

  drawPanel(ctx, left, top, site.width, site.height, colors.fill, colors.border);

  ctx.fillStyle = "#e8f4ff";
  ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(site.sequence, left + 10, site.y);

  const pamWidth = 46;
  const pamLeft = left + site.width - pamWidth - 8;
  drawPanel(
    ctx,
    pamLeft,
    top + 8,
    pamWidth,
    site.height - 16,
    site.hasPam ? "#0f3a46" : "#401f2a",
    site.hasPam ? "#58c4ff" : "#ff6483",
  );

  ctx.fillStyle = "#e8f4ff";
  ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText(site.pam, pamLeft + 10, site.y);

  const dx = Math.abs(state.enzymeX - site.x);
  const dy = Math.abs(state.enzymeY - site.y);
  const inRange = dx <= site.width * 0.5 + state.enzymeRadius && dy <= site.height * 0.5 + state.enzymeRadius;

  if (inRange) {
    ctx.strokeStyle = "#34f4cf";
    ctx.lineWidth = 2;
    ctx.strokeRect(left - 4, top - 4, site.width + 8, site.height + 8);
  }
};

const outcomeColor = (outcome: CutOutcome | null): { r: number; g: number; b: number } => {
  if (outcome === "correct") {
    return { r: 52, g: 244, b: 207 };
  }
  if (outcome === "near") {
    return { r: 255, g: 209, b: 102 };
  }
  if (outcome === "noPam" || outcome === "wrong") {
    return { r: 255, g: 100, b: 131 };
  }
  return { r: 88, g: 196, b: 255 };
};

const drawEnzyme = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: GameViewport,
  nowMs: number,
): void => {
  const radius = state.enzymeRadius;
  const x = Math.floor(state.enzymeX);
  const y = Math.floor(state.enzymeY);
  const size = radius * 2;

  const clickWindowActive = nowMs - state.lastCutMs < 170;

  if (!state.reducedMotion && clickWindowActive) {
    const fade = 1 - (nowMs - state.lastCutMs) / 220;
    const color = outcomeColor(state.lastCutOutcome);
    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.35 * fade})`;
    ctx.fillRect(x - radius - 10, y - radius - 10, size + 20, size + 20);
  }

  const loadedSprite =
    (clickWindowActive ? getLoadedSprite("click") : null) ??
    getLoadedSprite("default");
  if (loadedSprite) {
    const spriteSize = Math.max(56, radius * 3);
    const spriteX = Math.floor(x - spriteSize * 0.5);
    const spriteY = Math.floor(y - spriteSize * 0.5);

    ctx.drawImage(loadedSprite, spriteX, spriteY, spriteSize, spriteSize);

    ctx.strokeStyle = "#34f4cf";
    ctx.lineWidth = 2;
    ctx.strokeRect(spriteX - 4, spriteY - 4, spriteSize + 8, spriteSize + 8);
  } else {
    drawPanel(ctx, x - radius, y - radius, size, size, "#193250", "#58c4ff");

    ctx.fillStyle = "#34f4cf";
    ctx.fillRect(x - 2, y - radius - 8, 4, 6);
    ctx.fillRect(x - 2, y + radius + 2, 4, 6);
    ctx.fillRect(x - radius - 8, y - 2, 6, 4);
    ctx.fillRect(x + radius + 2, y - 2, 6, 4);

    ctx.fillStyle = "#effbff";
    ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CAS", x, y);
    ctx.textAlign = "start";
  }

  ctx.strokeStyle = "rgba(52, 244, 207, 0.32)";
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

  const bgGradient = ctx.createLinearGradient(0, 0, 0, viewport.height);
  bgGradient.addColorStop(0, "#101b35");
  bgGradient.addColorStop(0.45, "#0b142a");
  bgGradient.addColorStop(1, "#070d1b");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  drawTrack(ctx, state, viewport);

  for (const site of state.sites) {
    drawSite(ctx, site, state);
  }

  drawEnzyme(ctx, state, viewport, opts.nowMs);
};
