// MatrixBackdrop.tsx — Animated matrix-rain canvas with an idle HAL "eye"
// formed from rain glyphs, plus CRT flicker overlays and frame chrome.
// Ported from design-reference/BazaarDappHub/matrix-rain.jsx. Sized for the
// 1920×1080 HubStage; the eye's pupil follows the cursor when nearby.

import { useEffect, useRef, useState, type CSSProperties } from "react";

const STAGE_W = 1920;
const STAGE_H = 1080;
const BG = "#080604";
const ORANGE = "#ff9030";

const RAIN_CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*<>{}[]=/\\|~^";

interface HalState {
  shape: Set<number>;
  inside: Set<number>;
  iris: Set<number>;
  formation: Map<number, number>;
  glow: number;
  formed: boolean;
}

// Tiny rAF time hook (throttled ~10fps) for the rare flicker/tear effects.
function useTime(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 100) return;
      last = now;
      setT((now - t0) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

interface StreamSpec {
  direction: "up" | "down" | "left" | "right";
  speedScale?: number;
  trail?: number;
  charSwap?: number;
  persist?: boolean;
}

interface RainCell { ch: string; b: number; head?: boolean; persist?: boolean; persistUntil?: number; }

function MatrixRainGrid({ streams, halRef }: { streams: StreamSpec[]; halRef: React.MutableRefObject<HalState> }) {
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
    const grid: RainCell[] = Array.from({ length: rows * cols }, () => ({ ch: " ", b: 0 }));
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

      for (let i = 0; i < grid.length; i++) {
        const cell = grid[i];
        if (cell.persistUntil && time < cell.persistUntil) continue;
        if (cell.persistUntil && time >= cell.persistUntil) cell.persistUntil = 0;
        if (cell.persist) continue;
        if (cell.b > 0) cell.b *= 0.92;
        if (cell.b < 0.02) { cell.b = 0; cell.ch = " "; }
      }

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

      const hal = halRef.current;
      const halShape = hal ? hal.shape : null;
      const halInside = hal ? hal.inside : null;
      const halIris = hal ? hal.iris : null;
      const halGlow = hal ? hal.glow : 0;
      const formation = hal ? hal.formation : null;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      ctx.font = `${FS}px "Frontier Disket Mono", ui-monospace, monospace`;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = grid[r * cols + c];
          const key = r * 10000 + c;
          const isShape = halShape && halShape.has(key);
          const isIris = halIris && halIris.has(key);
          const isInside = halInside && halInside.has(key);

          let cellForm = 1;
          if ((isShape || isIris) && formation) cellForm = formation.get(key) ?? 0;
          const flicker = (Math.sin((r * 13 + c * 31 + Math.floor(time / 120)) * 0.913) + 1) * 0.5;
          const renderAsEye = flicker < cellForm;

          if (isIris && renderAsEye) {
            const a = 0.9 + 0.1 * halGlow;
            const ch = cell.ch && cell.ch !== " " ? cell.ch : RAIN_CHARS[(r * 7 + c * 13) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fillText(ch, c * FS, (r + 1) * FS - 2);
            continue;
          }
          if (isShape && renderAsEye) {
            const a = 0.85 + 0.15 * halGlow;
            const ch = cell.ch && cell.ch !== " " ? cell.ch : RAIN_CHARS[(r * 11 + c * 17 + Math.floor(time / 200)) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fillText(ch, c * FS, (r + 1) * FS - 2);
            continue;
          }
          if (cell.b <= 0) continue;
          const b = cell.b;
          let baseR: number, baseG: number, baseB: number, baseA: number;
          if (cell.head) {
            if (isInside) { baseR = 255; baseG = 180; baseB = 80; baseA = 0.6 * b + 0.2; }
            else { baseR = 255; baseG = 255; baseB = 255; baseA = 0.4 * b + 0.08; }
          } else if (b > 0.7) { baseR = 255; baseG = 180; baseB = 80; baseA = b; }
          else if (b > 0.4) { baseR = 210; baseG = 120; baseB = 40; baseA = b; }
          else { baseR = 140; baseG = 70; baseB = 25; baseA = b; }
          ctx.fillStyle = `rgba(${baseR},${baseG},${baseB},${baseA})`;
          ctx.fillText(cell.ch, c * FS, (r + 1) * FS - 2);
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [streams, halRef]);

  return <canvas ref={ref} data-hub-rain="" style={{ position: "absolute", inset: 0, width: STAGE_W, height: STAGE_H }} />;
}

const RAIN_STREAMS: StreamSpec[] = [
  { direction: "left", speedScale: 0.6, trail: 14, persist: true },
  { direction: "right", speedScale: 0.6, trail: 14, persist: true },
  { direction: "down", speedScale: 1.0, trail: 18 },
];

function SquareFlicker() {
  const t = useTime();
  const squares: { x: number; y: number; w: number; h: number; alpha: number; key: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const seedT = Math.floor(t * 1.6 + i * 100);
    const r1 = (Math.sin(seedT * 12.9898 + i * 78.233) * 43758.5453) % 1;
    const r2 = (Math.sin(seedT * 39.346 + i * 11.135) * 27183.123) % 1;
    const r3 = (Math.sin(seedT * 91.534 + i * 47.901) * 15731.987) % 1;
    const r4 = (Math.sin(seedT * 73.156 + i * 19.876) * 11119.555) % 1;
    const r5 = (Math.sin(seedT * 54.321 + i * 33.111) * 88887.111) % 1;
    if (Math.abs(r1) < 0.93) continue;
    const w = 14 + Math.floor(Math.abs(r2) * 60);
    const h = 14 + Math.floor(Math.abs(r3) * 28);
    const x = Math.floor(Math.abs(r4) * (STAGE_W - w));
    const y = Math.floor(Math.abs(r5) * (STAGE_H - h));
    const phase = (t * 1.6 + i * 100) - seedT;
    const alpha = phase < 0.15 ? 0.7 + Math.abs(r2) * 0.3 : phase < 0.3 ? 0.4 : 0;
    if (alpha <= 0) continue;
    squares.push({ x, y, w, h, alpha, key: `${seedT}-${i}` });
  }
  return (
    <>
      {squares.map((s) => (
        <div key={s.key} style={{
          position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h,
          background: `rgba(255,170,70,${s.alpha})`, mixBlendMode: "screen", pointerEvents: "none",
        }} />
      ))}
    </>
  );
}

function CRTTear() {
  const t = useTime();
  const seed = Math.floor(t * 1.3);
  const r1 = (Math.sin(seed * 91.345) * 13247.123) % 1;
  const r2 = Math.sin(seed * 27.7) * 0.5 + 0.5;
  if (Math.abs(r1) <= 0.85) return null;
  const y = Math.floor(r2 * STAGE_H);
  const phase = (t * 1.3) - seed;
  const alpha = phase < 0.08 ? 0.7 : phase < 0.16 ? 0.4 : 0;
  if (alpha <= 0) return null;
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, top: y, height: 2,
      background: `rgba(255,220,180,${alpha})`, mixBlendMode: "screen", pointerEvents: "none",
    }} />
  );
}

function Overlays() {
  return (
    <>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 40%, rgba(8,6,4,0.7) 100%)",
      }} />
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)",
      }} />
    </>
  );
}

export function FrameChrome() {
  const corner = (key: string, style: CSSProperties) => (
    <div key={key} style={{ position: "absolute", width: 60, height: 60, borderColor: ORANGE, borderStyle: "solid", pointerEvents: "none", ...style }} />
  );
  const sideNotch = (key: string, style: CSSProperties) => (
    <div key={key} style={{ position: "absolute", width: 18, height: 60, borderColor: ORANGE, borderStyle: "solid", pointerEvents: "none", ...style }} />
  );
  return (
    <>
      {corner("tl", { top: 30, left: 30, borderWidth: "2px 0 0 2px" })}
      {corner("tr", { top: 30, right: 30, borderWidth: "2px 2px 0 0" })}
      {corner("bl", { bottom: 30, left: 30, borderWidth: "0 0 2px 2px" })}
      {corner("br", { bottom: 30, right: 30, borderWidth: "0 2px 2px 0" })}
      {sideNotch("sl", { top: "50%", left: 30, transform: "translateY(-50%)", borderWidth: "2px 0 2px 2px" })}
      {sideNotch("sr", { top: "50%", right: 30, transform: "translateY(-50%)", borderWidth: "2px 2px 2px 0" })}
    </>
  );
}

// The eye now lives in the DOM (HubChrome <Eye/>) as the menu centrepiece, so the
// rain backdrop is pure rain — an empty HAL ref keeps MatrixRainGrid's eye
// branches inert.
const EMPTY_HAL: HalState = { shape: new Set(), inside: new Set(), iris: new Set(), formation: new Map(), glow: 0, formed: false };

export function MatrixBackdrop() {
  const halRef = useRef<HalState>(EMPTY_HAL);
  return (
    <>
      <MatrixRainGrid streams={RAIN_STREAMS} halRef={halRef} />
      <SquareFlicker />
      <CRTTear />
      <Overlays />
    </>
  );
}
