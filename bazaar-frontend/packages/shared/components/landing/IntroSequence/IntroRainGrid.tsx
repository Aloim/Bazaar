// IntroRainGrid.tsx — Unified matrix-rain canvas for the intro cinematic.
// All 4 stream directions write to one cell grid; the HAL eye, the card cutout
// (freeze→fall→empty), shockwaves, and the rain-formed PROCEED/scan text are
// composited in. Ported from design-reference/IntroSequence/scene.jsx.

import { useEffect, useRef } from "react";
import { STAGE_W, STAGE_H, RAIN_CHARS, type HalRef } from "./introConstants";

export interface StreamSpec {
  direction: "up" | "down" | "left" | "right";
  speedScale?: number;
  trail?: number;
  charSwap?: number;
  persist?: boolean;
  color?: string;
}

interface Cell {
  ch: string; b: number; c?: string; head?: boolean;
  persist?: boolean; persistUntil?: number;
  frozen?: boolean; frozenChar?: string; frozenAt?: number;
}

export const INTRO_RAIN_STREAMS: StreamSpec[] = [
  { direction: "left", speedScale: 0.6, trail: 14, persist: true },
  { direction: "right", speedScale: 0.6, trail: 14, persist: true },
  { direction: "down", speedScale: 1.0, trail: 18 },
];

export default function IntroRainGrid({ streams, halRef }: { streams: StreamSpec[]; halRef: React.MutableRefObject<HalRef> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const FS = 14;
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;

    const cols = Math.ceil(STAGE_W / FS);
    const rows = Math.ceil(STAGE_H / FS);
    const grid: Cell[] = Array.from({ length: rows * cols }, () => ({ ch: " ", b: 0, c: "orange" }));
    const cellAt = (r: number, c: number) => grid[r * cols + c];

    const streamStates = streams.map((s) => {
      const horizontal = s.direction === "left" || s.direction === "right";
      const negative = s.direction === "up" || s.direction === "left";
      const lengthCells = horizontal ? cols : rows;
      const laneCount = horizontal ? rows : cols;
      return {
        spec: s, horizontal, negative, lengthCells, laneCount,
        lanes: Array.from({ length: laneCount }, () => ({
          pos: negative ? lengthCells + Math.random() * lengthCells : -Math.random() * lengthCells,
          speed: (0.3 + Math.random() * 0.7) * (s.speedScale || 1),
          chars: Array.from({ length: lengthCells + 10 }, () => RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)]),
        })),
      };
    });

    let lastFrame = 0;
    const tick = (time: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (time - lastFrame < 33) return;
      lastFrame = time;

      const hal = halRef.current;
      const cutout = hal ? hal.cardCutout : null;
      const firstWaveR = hal ? (hal.firstWaveRadius ?? -1) : -1;
      const halWaveCx = hal ? (hal.waveCx ?? STAGE_W / 2) : STAGE_W / 2;
      const halWaveCy = hal ? (hal.waveCy ?? STAGE_H / 2) : STAGE_H / 2;
      let cutoutPhase: "none" | "wave-freeze" | "fall" | "empty" | "released" = "none";
      let cutMinR = -1, cutMaxR = -1, cutMinC = -1, cutMaxC = -1, cutFallK = 0;
      if (cutout) {
        const ct = cutout.tNow;
        if (ct >= cutout.tRelease) cutoutPhase = "released";
        else if (ct >= cutout.tClear) cutoutPhase = "empty";
        else if (ct >= cutout.tFall) { cutoutPhase = "fall"; cutFallK = Math.min(1, (ct - cutout.tFall) / Math.max(0.001, cutout.tClear - cutout.tFall)); }
        else if (ct >= cutout.tFreeze) cutoutPhase = "wave-freeze";
        cutMinC = Math.max(0, Math.floor(cutout.x / FS));
        cutMaxC = Math.min(cols - 1, Math.ceil((cutout.x + cutout.w) / FS));
        cutMinR = Math.max(0, Math.floor(cutout.y / FS));
        cutMaxR = Math.min(rows - 1, Math.ceil((cutout.y + cutout.h) / FS));
      }
      const cellWaveCovered = (r: number, c: number) => {
        if (firstWaveR <= 0) return false;
        const px = c * FS + FS / 2, py = r * FS + FS / 2;
        const dx = px - halWaveCx, dy = py - halWaveCy;
        return dx * dx + dy * dy <= firstWaveR * firstWaveR;
      };

      // 1) decay
      for (let i = 0; i < grid.length; i++) {
        const cell = grid[i];
        if (cutoutPhase === "wave-freeze" || cutoutPhase === "fall") {
          const r = Math.floor(i / cols), c = i - r * cols;
          if (r >= cutMinR && r <= cutMaxR && c >= cutMinC && c <= cutMaxC) {
            if (cutoutPhase === "wave-freeze") {
              if (!cell.frozen && cellWaveCovered(r, c)) {
                cell.frozen = true;
                const glyphIdx = ((r * 137 + c * 53) % RAIN_CHARS.length + RAIN_CHARS.length) % RAIN_CHARS.length;
                cell.frozenChar = cell.ch && cell.ch !== " " ? cell.ch : RAIN_CHARS[glyphIdx];
                cell.frozenAt = time;
              }
              if (cell.frozen) continue;
            } else { continue; }
          }
        }
        if (cutoutPhase === "empty") {
          const r = Math.floor(i / cols), c = i - r * cols;
          if (r >= cutMinR && r <= cutMaxR && c >= cutMinC && c <= cutMaxC) { cell.b = 0; cell.ch = " "; cell.frozen = false; continue; }
        }
        if (cutoutPhase === "released" && cell.frozen) cell.frozen = false;
        if (cell.persistUntil && time < cell.persistUntil) continue;
        if (cell.persistUntil && time >= cell.persistUntil) cell.persistUntil = 0;
        if (cell.persist) continue;
        if (cell.b > 0) cell.b *= 0.92;
        if (cell.b < 0.02) { cell.b = 0; cell.ch = " "; }
      }

      const halShape = hal ? hal.shape : null;
      const halInside = hal ? hal.inside : null;
      const halIris = hal ? hal.iris : null;
      const halGlow = hal ? hal.glow : 0;
      const formation = hal ? hal.formation : null;
      const halProceed = hal ? hal.proceedShape : null;
      const halProceedOp = hal ? (hal.proceedOpacity ?? 0) : 0;
      const halProceedHover = hal ? !!hal.proceedHover : false;
      const halScan = hal ? hal.scanShape : null;
      const halScanOp = hal ? (hal.scanOpacity ?? 0) : 0;
      const waveRadius = hal ? (hal.waveRadius ?? -1) : -1;
      const waveStrength = hal ? (hal.waveStrength ?? 0) : 0;
      const waveCx = hal ? (hal.waveCx ?? STAGE_W / 2) : STAGE_W / 2;
      const waveCy = hal ? (hal.waveCy ?? STAGE_H / 2) : STAGE_H / 2;
      const activeWaves = hal ? (hal.activeWaves || null) : null;
      const WAVE_BAND = 90;

      // 2) advance streams
      for (const st of streamStates) {
        const { horizontal, negative, lengthCells, lanes, spec } = st;
        const trailLen = spec.trail || 18;
        const charSwap = spec.charSwap ?? 0.02;
        for (let i = 0; i < lanes.length; i++) {
          const lane = lanes[i];
          lane.pos += negative ? -lane.speed : lane.speed;
          const headIdx = Math.floor(lane.pos);
          for (let j = 0; j < trailLen; j++) {
            const cellIdx = negative ? headIdx + j : headIdx - j;
            if (cellIdx < 0 || cellIdx >= lengthCells) continue;
            const r = horizontal ? i : cellIdx;
            const c = horizontal ? cellIdx : i;
            if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
            if (cutoutPhase !== "none" && cutoutPhase !== "released" && r >= cutMinR && r <= cutMaxR && c >= cutMinC && c <= cutMaxC) {
              if (cutoutPhase === "fall" || cutoutPhase === "empty") continue;
              if (cutoutPhase === "wave-freeze" && cellAt(r, c).frozen) continue;
            }
            const charIdx = ((cellIdx + i * 7) % lane.chars.length + lane.chars.length) % lane.chars.length;
            if (Math.random() < charSwap) lane.chars[charIdx] = RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)];
            let b: number;
            if (spec.persist) b = j === 0 ? 1.0 : 0.7;
            else if (j === 0) b = 1.0;
            else if (j === 1) b = 0.85;
            else b = Math.max(0.08, 0.7 - j * 0.05);
            const cell = cellAt(r, c);
            const wasPersistent = cell.persist || (cell.persistUntil != null && time < cell.persistUntil);
            cell.ch = lane.chars[charIdx];
            cell.b = b;
            cell.c = spec.color || "orange";
            cell.head = j === 0;
            cell.persist = !!spec.persist;
            if (!spec.persist && wasPersistent) cell.persistUntil = time + 5000;
            else if (spec.persist) cell.persistUntil = 0;
          }
          if (negative ? headIdx < -25 : headIdx > lengthCells + 25) {
            lane.pos = negative ? lengthCells + 15 + Math.random() * 15 : Math.random() * -15;
            lane.speed = (0.3 + Math.random() * 0.7) * (spec.speedScale || 1);
          }
        }
      }

      // 3) render
      ctx.fillStyle = "#080604";
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      const FONT_BUMP_MAX = 5;
      const fontByBump: string[] = [];
      for (let i = 0; i <= FONT_BUMP_MAX; i++) fontByBump.push(`${FS + i}px "Frontier Disket Mono", ui-monospace, monospace`);
      ctx.font = fontByBump[0];
      let curBump = 0;
      const useFontBump = (bump: number) => { if (bump !== curBump) { ctx.font = fontByBump[bump]; curBump = bump; } };

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = grid[r * cols + c];
          const key = r * 10000 + c;
          const isShape = halShape && halShape.has(key);
          const isIris = halIris && halIris.has(key);
          const isInside = halInside && halInside.has(key);
          const isProceed = halProceed && halProceed.has(key);
          const isScan = halScan && halScan.has(key);

          const cellInCutout = cutoutPhase !== "none" && cutoutPhase !== "released" && r >= cutMinR && r <= cutMaxR && c >= cutMinC && c <= cutMaxC;
          if (cellInCutout) {
            if (cutoutPhase === "empty") continue;
            if (cutoutPhase === "wave-freeze") {
              if (cell.frozen) {
                const ch = cell.frozenChar || cell.ch;
                if (!ch || ch === " ") continue;
                const flick = 0.92 + 0.08 * Math.sin((r * 7 + c * 11) + time * 0.012);
                ctx.fillStyle = `rgba(255,144,48,${flick * 0.3})`;
                useFontBump(0);
                ctx.fillText(ch, c * FS, (r + 1) * FS - 2);
                continue;
              }
            }
            if (cutoutPhase === "fall") {
              const ch = cell.frozenChar || cell.ch;
              if (!ch || ch === " ") continue;
              const maxDiag = Math.max(1, (cutMaxR - cutMinR) + (cutMaxC - cutMinC));
              const diagFrac = ((r - cutMinR) + (c - cutMinC)) / maxDiag;
              const startDelay = diagFrac * 0.7;
              const cellJit = (((r * 73 + c * 131) % 100) / 100 - 0.5) * 0.08;
              const localK = Math.max(0, Math.min(1, (cutFallK - startDelay - cellJit) / 0.3));
              if (localK <= 0) {
                const flick = 0.92 + 0.08 * Math.sin((r * 7 + c * 11) + time * 0.012);
                ctx.fillStyle = `rgba(255,144,48,${flick * 0.3})`;
                useFontBump(0);
                ctx.fillText(ch, c * FS, (r + 1) * FS - 2);
                continue;
              }
              const h2 = ((r * 191 + c * 53) % 1000) / 1000;
              const h3 = ((r * 29 + c * 311) % 1000) / 1000;
              const h4 = ((r * 419 + c * 17) % 1000) / 1000;
              const h5 = ((r * 251 + c * 89) % 1000) / 1000;
              const speedMul = 0.7 + h4 * 0.6;
              const fallY = localK * localK * (260 + h3 * 140) * speedMul;
              const driftX = (h2 - 0.5) * 22 * localK;
              const swayX = Math.sin(h3 * Math.PI * 2 + localK * 6) * 3.5 * localK;
              let drawCh = ch;
              if (localK > 0.15) {
                const flipRate = 60 + h5 * 80;
                const flipIdx = Math.floor(time / flipRate + h5 * 100 + r * 3 + c * 7);
                drawCh = RAIN_CHARS[((flipIdx % RAIN_CHARS.length) + RAIN_CHARS.length) % RAIN_CHARS.length];
              }
              const tintK = Math.min(1, localK * 1.3);
              const op = 1 - localK * 0.85;
              const rC = Math.round(255 + (210 - 255) * tintK);
              const gC = Math.round(144 + (120 - 144) * tintK);
              const bC = Math.round(48 + (40 - 48) * tintK);
              ctx.fillStyle = `rgba(${rC},${gC},${bC},${op})`;
              useFontBump(0);
              ctx.fillText(drawCh, c * FS + driftX + swayX, (r + 1) * FS - 2 + fallY);
              continue;
            }
          }

          if (!isShape && !isIris && !isProceed && !isScan && cell.b <= 0) continue;

          let waveTint = 0;
          if (activeWaves && activeWaves.length > 0) {
            const cellPx = c * FS + FS / 2, cellPy = r * FS + FS / 2;
            const dxw = cellPx - waveCx, dyw = cellPy - waveCy;
            const distW = Math.sqrt(dxw * dxw + dyw * dyw);
            for (let wi = 0; wi < activeWaves.length; wi++) {
              const wv = activeWaves[wi];
              const offset = Math.abs(distW - wv.radius);
              if (offset < WAVE_BAND) { const k = 1 - offset / WAVE_BAND; waveTint += k * k * wv.strength; }
            }
            if (waveTint > 1) waveTint = 1;
          } else if (waveRadius > 0 && waveStrength > 0) {
            const cellPx = c * FS + FS / 2, cellPy = r * FS + FS / 2;
            const dxw = cellPx - waveCx, dyw = cellPy - waveCy;
            const distW = Math.sqrt(dxw * dxw + dyw * dyw);
            const offset = Math.abs(distW - waveRadius);
            if (offset < WAVE_BAND) { const k = 1 - offset / WAVE_BAND; waveTint = k * k * waveStrength; }
          }
          const bump = Math.round(waveTint * FONT_BUMP_MAX);
          const dy = Math.round(bump * 0.5);
          const dx = -Math.round(bump * 0.5);

          let cellForm = 1;
          if ((isShape || isIris) && formation) cellForm = formation.get(key) ?? 0;
          const flickerRoll = (Math.sin((r * 13 + c * 31 + Math.floor(time / 120)) * 0.913) + 1) * 0.5;
          const renderAsEye = flickerRoll < cellForm;

          if (isProceed && halProceedOp > 0.02 && !isShape && !isIris) {
            const baseAlpha = halProceedHover ? 1.0 : 0.5;
            const a = baseAlpha * Math.min(1, halProceedOp);
            const ch = cell.ch && cell.ch !== " " ? cell.ch : RAIN_CHARS[(r * 17 + c * 23 + Math.floor(time / 80)) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            useFontBump(halProceedHover ? 1 : 0);
            ctx.fillText(ch, c * FS + dx, (r + 1) * FS - 2 + dy);
            continue;
          }
          if (isScan && halScanOp > 0.02 && !isShape && !isIris) {
            const a = 0.85 * Math.min(1, halScanOp);
            const ch = cell.ch && cell.ch !== " " ? cell.ch : RAIN_CHARS[(r * 17 + c * 23 + Math.floor(time / 80)) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            useFontBump(0);
            ctx.fillText(ch, c * FS + dx, (r + 1) * FS - 2 + dy);
            continue;
          }
          if (isIris && renderAsEye) {
            const a = 0.9 + 0.1 * halGlow;
            const ch = cell.ch && cell.ch !== " " ? cell.ch : RAIN_CHARS[(r * 7 + c * 13) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            useFontBump(bump);
            ctx.fillText(ch, c * FS + dx, (r + 1) * FS - 2 + dy);
            continue;
          }
          if (isShape && renderAsEye) {
            const a = 0.85 + 0.15 * halGlow;
            const ch = cell.ch && cell.ch !== " " ? cell.ch : RAIN_CHARS[(r * 11 + c * 17 + Math.floor(time / 200)) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            useFontBump(bump);
            ctx.fillText(ch, c * FS + dx, (r + 1) * FS - 2 + dy);
            continue;
          }
          if (cell.b <= 0) {
            if (waveTint > 0.05) {
              const ch = cell.ch && cell.ch !== " " ? cell.ch : RAIN_CHARS[(r * 11 + c * 17 + Math.floor(time / 200)) % RAIN_CHARS.length];
              ctx.fillStyle = `rgba(255,255,255,${0.55 * waveTint})`;
              useFontBump(bump);
              ctx.fillText(ch, c * FS + dx, (r + 1) * FS - 2 + dy);
            }
            continue;
          }
          const b = cell.b;
          let baseR: number, baseG: number, baseB: number, baseA: number;
          if (cell.head) {
            if (isInside) { baseR = 255; baseG = 180; baseB = 80; baseA = 0.6 * b + 0.2; }
            else { baseR = 255; baseG = 255; baseB = 255; baseA = 0.4 * b + 0.08; }
          } else if (b > 0.7) { baseR = 255; baseG = 180; baseB = 80; baseA = b; }
          else if (b > 0.4) { baseR = 210; baseG = 120; baseB = 40; baseA = b; }
          else { baseR = 140; baseG = 70; baseB = 25; baseA = b; }
          if (waveTint > 0) {
            const w = waveTint;
            baseR = Math.round(baseR + (255 - baseR) * w);
            baseG = Math.round(baseG + (255 - baseG) * w);
            baseB = Math.round(baseB + (255 - baseB) * w);
            baseA = Math.min(1, baseA + 0.5 * w);
          }
          ctx.fillStyle = `rgba(${baseR},${baseG},${baseB},${baseA})`;
          useFontBump(bump);
          ctx.fillText(cell.ch, c * FS + dx, (r + 1) * FS - 2 + dy);
        }
      }
      useFontBump(0);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [streams, halRef]);

  return <canvas ref={ref} data-intro-rain="" style={{ position: "absolute", inset: 0, width: STAGE_W, height: STAGE_H }} />;
}
