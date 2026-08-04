// introConstants.ts — Shared constants + the text→rain-cell rasterizer for the
// new Bazaar intro cinematic. Ported from design-reference/IntroSequence/scene.jsx.

// Fixed internal design space. The cinematic is authored at 1920×1080 and the
// IntroStage *cover*-scales it (scale = max(W/1920, H/1080)) so it fills the
// actual dApp window at ANY aspect — landscape, square, or portrait — with no
// letterbox bars (only ambient rain at the margins is cropped). The eye and all
// cards are centre-clustered, so they stay visible at every aspect.
export const STAGE_W = 1920;
export const STAGE_H = 1080;
export const INTRO_BG = "#080604";
export const ORANGE = "#ff9030";

export const RAIN_CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*<>{}[]=/\\|~^";

export const CRYPTIC_CHARS = "アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF#$%&*<>/\\|=";

// Card 1 lines (translate from cryptic → English during the dock phase).
export const TRANSLATION_LINES = [
  "> SIGNAL ACQUIRED. DECRYPTING IDENT…",
  "> STRANGER PROTOCOL ENGAGED.",
  "> WHO APPROACHES THE BAZAAR?",
];
export const BAR_LABEL_CRYPTIC = "INITIATING TRANSLATION PROTOCOL";
export const BAR_LABEL_SUCCESS = "TRANSLATION PROTOCOL SUCCESSFUL";

// Deterministic pseudo-random — always returns 0..1.
export function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  const v = x - Math.floor(x);
  return v < 0 ? v + 1 : v;
}

// Time-varying cryptic glyph (re-rolls every ~CHURN_PERIOD).
const CHURN_PERIOD = 0.06;
export function churnCryptic(seed: number, t: number): string {
  const tick = Math.floor(t / CHURN_PERIOD);
  const s = Math.sin((seed + tick * 17) * 12.9898 + (seed + tick) * 78.233) * 43758.5453;
  const f = s - Math.floor(s);
  return CRYPTIC_CHARS[Math.floor(f * CRYPTIC_CHARS.length)];
}

// ── Text-to-cells rasterizer ──────────────────────────────────────────────────
// Draws text into a hidden canvas, then samples each FS-pitch rain cell to see
// whether the text covers it. Used for "form text out of matrix rain" effects.
const _rasterCanvas: HTMLCanvasElement | null =
  typeof document !== "undefined" ? document.createElement("canvas") : null;
const _rasterCache = new Map<string, RasterResult>();

export interface RasterResult {
  cells: Set<number>;
  bbox: { minR: number; maxR: number; minC: number; maxC: number } | null;
}

interface RasterLine { text: string; fontPx: number; weight?: number; letterSpacing?: number; }
interface RasterOpts { centerXpx: number; centerYpx: number; FS: number; lineGapPx?: number; }

export function cachedRasterize(key: string, fn: () => RasterResult): RasterResult {
  const cached = _rasterCache.get(key);
  if (cached) return cached;
  const v = fn();
  _rasterCache.set(key, v);
  return v;
}

export function rasterizeTextToCells(lines: RasterLine[], opts: RasterOpts): RasterResult {
  if (!_rasterCanvas) return { cells: new Set(), bbox: null };
  const { centerXpx, centerYpx, FS, lineGapPx = 6 } = opts;
  const cols = Math.ceil(STAGE_W / FS);
  const rows = Math.ceil(STAGE_H / FS);

  const ctx = _rasterCanvas.getContext("2d")!;
  let totalH = 0, maxW = 0;
  const measured = lines.map((l) => {
    ctx.font = `${l.weight || 400} ${l.fontPx}px "Frontier Disket Mono", ui-monospace, monospace`;
    const m = ctx.measureText(l.text);
    const ascent = m.actualBoundingBoxAscent || l.fontPx * 0.8;
    const descent = m.actualBoundingBoxDescent || l.fontPx * 0.2;
    const h = ascent + descent;
    const w = m.width + (l.letterSpacing || 0) * Math.max(0, l.text.length - 1);
    totalH += h;
    if (w > maxW) maxW = w;
    return { ...l, w, h, ascent, descent };
  });
  totalH += lineGapPx * Math.max(0, lines.length - 1);

  const margin = 8;
  _rasterCanvas.width = Math.min(STAGE_W, Math.ceil(maxW + margin * 2));
  _rasterCanvas.height = Math.min(STAGE_H, Math.ceil(totalH + margin * 2));
  ctx.clearRect(0, 0, _rasterCanvas.width, _rasterCanvas.height);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  let y = margin;
  for (const l of measured) {
    ctx.font = `${l.weight || 400} ${l.fontPx}px "Frontier Disket Mono", ui-monospace, monospace`;
    const lineX = margin + (maxW - l.w) / 2;
    if (l.letterSpacing) {
      let cursorX = lineX;
      for (const ch of l.text) {
        ctx.fillText(ch, cursorX, y + l.ascent);
        cursorX += ctx.measureText(ch).width + l.letterSpacing;
      }
    } else {
      ctx.fillText(l.text, lineX, y + l.ascent);
    }
    y += l.h + lineGapPx;
  }

  const rasterLeftPx = centerXpx - _rasterCanvas.width / 2;
  const rasterTopPx = centerYpx - _rasterCanvas.height / 2;

  const img = ctx.getImageData(0, 0, _rasterCanvas.width, _rasterCanvas.height).data;
  const cells = new Set<number>();
  let minR = rows, maxR = -1, minC = cols, maxC = -1;
  const startC = Math.max(0, Math.floor(rasterLeftPx / FS));
  const endC = Math.min(cols - 1, Math.ceil((rasterLeftPx + _rasterCanvas.width) / FS));
  const startR = Math.max(0, Math.floor(rasterTopPx / FS));
  const endR = Math.min(rows - 1, Math.ceil((rasterTopPx + _rasterCanvas.height) / FS));

  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      const cellX0 = c * FS, cellY0 = r * FS;
      const rx0 = Math.max(0, Math.floor(cellX0 - rasterLeftPx));
      const ry0 = Math.max(0, Math.floor(cellY0 - rasterTopPx));
      const rx1 = Math.min(_rasterCanvas.width, rx0 + FS);
      const ry1 = Math.min(_rasterCanvas.height, ry0 + FS);
      let hits = 0, samples = 0;
      const STEP = 2;
      for (let py = ry0; py < ry1; py += STEP) {
        for (let px = rx0; px < rx1; px += STEP) {
          const idx = (py * _rasterCanvas.width + px) * 4 + 3;
          if (img[idx] > 40) hits++;
          samples++;
        }
      }
      if (samples > 0 && hits / samples >= 0.5) {
        cells.add(r * 10000 + c);
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  return { cells, bbox: maxR >= 0 ? { minR, maxR, minC, maxC } : null };
}

// ── HAL ref shape (shared between useHal, the rain grid and the sequence) ──────
export interface HalRef {
  shape: Set<number>;
  inside: Set<number>;
  iris: Set<number>;
  glow: number;
  formation: Map<number, number>;
  formed: boolean;
  eyeCx_stage: number;
  eyeCy_stage: number;
  eyeR_stage: number;
  triggered: boolean;
  triggerStart: number;
  dynamicPulses?: number[];
  activeWaves?: { radius: number; strength: number }[];
  waveRadius?: number;
  waveStrength?: number;
  waveCx?: number;
  waveCy?: number;
  firstWaveRadius?: number;
  cardCutout?: {
    x: number; y: number; w: number; h: number;
    tNow: number; tFreeze: number; tFall: number; tClear: number; tRelease: number;
  } | null;
  proceedShape?: Set<number> | null;
  proceedOpacity?: number;
  proceedHover?: boolean;
  scanShape?: Set<number> | null;
  scanOpacity?: number;
  dissolveK?: number;
}
