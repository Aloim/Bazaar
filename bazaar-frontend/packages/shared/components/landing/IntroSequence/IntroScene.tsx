// IntroScene.tsx — Composition + chrome for the intro cinematic, plus the
// 1920×1080 auto-scaling stage (window-size independent). Wires the HAL eye,
// the rain grid and the translation sequence together and exposes the three
// production callbacks. Ported from design-reference/IntroSequence/scene.jsx.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { STAGE_W, STAGE_H, INTRO_BG, ORANGE, rand } from "./introConstants";
import IntroRainGrid, { INTRO_RAIN_STREAMS } from "./IntroRainGrid";
import { useHal } from "./useHal";
import TranslationSequence from "./TranslationSequence";

// ── Real-time hook (throttled ~10fps) for the ambient flicker effects ─────────
function useTime(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0, last = 0;
    const t0 = performance.now();
    const loop = (now: number) => { raf = requestAnimationFrame(loop); if (now - last < 100) return; last = now; setT((now - t0) / 1000); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

// ── ASCII file fragments ──────────────────────────────────────────────────────
const FRAGMENT_CHARS = "01ABCDEF /\\|<>{}[]=#$%&*+-_:;.,?!~^abcdef0123456789";
const FRAGMENT_HEADERS = [
  "> READ /sys/cache.dat", "> EXEC node-7B", "> AUTH key=0xA13F", "> DECRYPT block.04",
  "> LINK lev-7::core", "> BIND port:0x4A", "> FETCH manifest", "> PARSE 0x00FE",
  "> WRITE buffer.b", "> SYNC checksum", "> SCAN region.q", "> LOAD module.x9",
];

interface Fragment { id: number; t0: number; life: number; x: number; y: number; cols: number; rows: number; fontSize: number; lineH: number; depth: number; header: string; body: string[]; glitchy: boolean; }

function makeFragmentBody(rows: number, cols: number, seed: number): string[] {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let s = "";
    for (let c = 0; c < cols; c++) { const v = rand(seed * 31 + r * 13 + c); s += FRAGMENT_CHARS[Math.floor(v * FRAGMENT_CHARS.length)]; }
    lines.push(s);
  }
  return lines;
}

function generateFragments(count: number, totalDuration: number): Fragment[] {
  const out: Fragment[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = rand(i * 7 + 1) * (totalDuration - 3);
    const life = 0.6 + rand(i * 11 + 3) * 2.1;
    const sizeRoll = rand(i * 53 + 19);
    let fontSize: number, depth: number;
    if (sizeRoll < 0.35) { fontSize = 7; depth = 0.3; }
    else if (sizeRoll < 0.6) { fontSize = 9; depth = 0.55; }
    else if (sizeRoll < 0.85) { fontSize = 11; depth = 0.75; }
    else { fontSize = 14; depth = 1.0; }
    const cols = 14 + Math.floor(rand(i * 17 + 5) * 22);
    const rows = 3 + Math.floor(rand(i * 23 + 9) * 5);
    const lineH = Math.round(fontSize * 1.15);
    const charW = Math.max(5, Math.round(fontSize * 0.62));
    const x = 60 + rand(i * 29 + 11) * Math.max(100, STAGE_W - 120 - cols * charW);
    const y = 60 + rand(i * 31 + 13) * Math.max(100, STAGE_H - 120 - rows * lineH - 30);
    const headerIdx = Math.floor(rand(i * 41 + 17) * FRAGMENT_HEADERS.length);
    const glitchy = rand(i * 67 + 23) < 0.4;
    out.push({ id: i, t0, life, x, y, cols, rows, fontSize, lineH, depth, header: FRAGMENT_HEADERS[headerIdx], body: makeFragmentBody(rows, cols, i + 1), glitchy });
  }
  return out;
}

const FRAGMENTS = generateFragments(14, 30);

function FileFragments() {
  const t = useTime();
  // Loop the fragment field every 28s so the ambient effect never goes silent.
  const lt = t % 28;
  return (
    <>
      {FRAGMENTS.map((f) => {
        const local = lt - f.t0;
        if (local < 0 || local > f.life) return null;
        const inDur = 0.12, outDur = 0.22;
        let opacity: number;
        if (local < inDur) { const p = local / inDur; opacity = p * (rand(Math.floor(t * 60) + f.id) > 0.3 ? 1 : 0.3); }
        else if (local > f.life - outDur) { const p = (local - (f.life - outDur)) / outDur; opacity = (1 - p) * (rand(Math.floor(t * 90) + f.id * 3) > 0.25 ? 1 : 0.4); }
        else opacity = 0.85 + 0.15 * (rand(Math.floor(t * 30) + f.id * 5) - 0.5);
        opacity = Math.max(0, Math.min(1, opacity || 0));
        const scrambleRow = Math.floor(rand(f.id * 19 + Math.floor(t * 6)) * f.rows);
        const lines = f.body.map((ln, idx) => {
          if (idx === scrambleRow) { let s = ""; for (let c = 0; c < f.cols; c++) { const v = rand(f.id * 1000 + Math.floor(t * 60) + c); s += FRAGMENT_CHARS[Math.floor(v * FRAGMENT_CHARS.length)]; } return s; }
          return ln;
        });
        return (
          <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, opacity: opacity * (0.18 + f.depth * 0.32), fontFamily: '"Frontier Disket Mono", "JetBrains Mono", ui-monospace, monospace', fontSize: f.fontSize, lineHeight: f.lineH + "px", letterSpacing: "0.05em", whiteSpace: "pre", pointerEvents: "none", mixBlendMode: "screen", color: `rgba(210,120,40,${0.6 + f.depth * 0.3})` }}>
            <div style={{ color: `rgba(210,120,40,${0.6 + f.depth * 0.3})`, fontWeight: 700, fontSize: f.fontSize, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 2 }}>{f.header}</div>
            {lines.map((ln, i) => <div key={i}>{ln}</div>)}
          </div>
        );
      })}
    </>
  );
}

function Overlays() {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 40%, rgba(8,6,4,0.7) 100%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)", pointerEvents: "none" }} />
    </>
  );
}

function CRTFlicker() {
  const t = useTime();
  const wobble = Math.sin(t * 33) * 0.012 + Math.sin(t * 71.3) * 0.008 + Math.sin(t * 11.7) * 0.006;
  const glitchSeed = Math.floor(t * 0.7);
  const glitch = (Math.sin(glitchSeed * 12.9898) * 43758.5453) % 1;
  const isGlitch = Math.abs(glitch) > 0.93;
  const brightness = 1 + wobble + (isGlitch ? 0.18 * (Math.sin(t * 60) > 0 ? 1 : -0.6) : 0);
  const tearSeed = Math.floor(t * 1.3);
  const tearRand = (Math.sin(tearSeed * 91.345) * 13247.123) % 1;
  const showTear = Math.abs(tearRand) > 0.88;
  const tearY = ((Math.sin(tearSeed * 27.7) * 0.5 + 0.5) * STAGE_H) | 0;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "#000", opacity: Math.max(0, 1 - brightness) * 0.6, mixBlendMode: "multiply" }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "#fff", opacity: Math.max(0, brightness - 1) * 0.18, mixBlendMode: "screen" }} />
      {showTear && <div style={{ position: "absolute", left: 0, right: 0, top: tearY, height: 2, background: "rgba(255,220,180,0.4)", pointerEvents: "none", mixBlendMode: "screen" }} />}
      {isGlitch && <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "rgba(255,170,80,0.04)", mixBlendMode: "screen" }} />}
    </>
  );
}

function FrameChrome() {
  const corner = (style: CSSProperties) => <div style={{ position: "absolute", width: 60, height: 60, borderColor: ORANGE, borderStyle: "solid", ...style }} />;
  const sideNotch = (style: CSSProperties) => <div style={{ position: "absolute", width: 18, height: 60, borderColor: ORANGE, borderStyle: "solid", ...style }} />;
  return (
    <>
      {corner({ top: 30, left: 30, borderWidth: "2px 0 0 2px" })}
      {corner({ top: 30, right: 30, borderWidth: "2px 2px 0 0" })}
      {corner({ bottom: 30, left: 30, borderWidth: "0 0 2px 2px" })}
      {corner({ bottom: 30, right: 30, borderWidth: "0 2px 2px 0" })}
      {sideNotch({ top: "50%", left: 30, transform: "translateY(-50%)", borderWidth: "2px 0 2px 2px" })}
      {sideNotch({ top: "50%", right: 30, transform: "translateY(-50%)", borderWidth: "2px 2px 2px 0" })}
    </>
  );
}

// Skip — ALWAYS shown. Returning (already-registered) users jump straight to Godot.
// New/unregistered users are auto-registered (same STRANGER-registration PTB as
// Consent) and then enter; while that TX runs the button shows a pending state.
function SkipToBazaar({ onSkip, isRegistered, pending }: { onSkip: () => void; isRegistered: boolean; pending: boolean }) {
  const [hover, setHover] = useState(false);
  const label = pending ? "Registering…" : isRegistered ? "Skip to Bazaar" : "Skip Intro";
  return (
    <div style={{ position: "absolute", right: 110, bottom: 70, zIndex: 35 }}>
      <button type="button" onClick={onSkip} disabled={pending} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
        pointerEvents: pending ? "none" : "auto", opacity: pending ? 0.7 : 1, fontFamily: '"Frontier Disket Mono", ui-monospace, monospace', fontSize: "0.95rem", letterSpacing: "0.12em", textTransform: "uppercase",
        color: hover ? "rgba(255, 235, 180, 1)" : "rgba(255, 200, 130, 0.85)", background: hover ? "rgba(204, 112, 0, 0.18)" : "rgba(8, 6, 4, 0.55)",
        border: `1px solid ${hover ? "rgba(255, 200, 110, 0.95)" : "rgba(204, 112, 0, 0.55)"}`, borderRadius: 3, padding: "8px 18px", cursor: pending ? "wait" : "pointer",
        textShadow: "0 0 8px rgba(255, 180, 80, 0.5)", boxShadow: hover ? "0 0 22px rgba(255, 180, 80, 0.35), inset 0 0 14px rgba(255, 180, 80, 0.10)" : "0 0 14px rgba(204, 112, 0, 0.18), inset 0 0 12px rgba(204, 112, 0, 0.06)",
        transition: "background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s", display: "inline-flex", alignItems: "center", gap: 10,
      }}>
        <span>{label}</span>{!pending && <span style={{ opacity: 0.85 }}>›</span>}
      </button>
    </div>
  );
}

export interface IntroSceneProps {
  onConsent: () => void;
  onProceed: () => void;
  onSkip: () => void;
  isRegistered: boolean;
  skipPending: boolean;
  walletShort: string;
  playerName: string;
}

function Scene({ onConsent, onProceed, onSkip, isRegistered, walletShort, playerName }: IntroSceneProps) {
  const { halRef, triggered } = useHal(true);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: INTRO_BG }} />
      <IntroRainGrid streams={INTRO_RAIN_STREAMS} halRef={halRef} />
      <FileFragments />
      <TranslationSequence halRef={halRef} triggered={triggered} onConsent={onConsent} onProceed={onProceed} walletShort={walletShort} playerName={playerName} />
      <Overlays />
      <CRTFlicker />
    </>
  );
}

// 1920×1080 stage COVER-scaled to fill the actual dApp window at any aspect
// (landscape / square / portrait) — no letterbox bars; only ambient rain at the
// margins is cropped. The eye + cards are centre-clustered so they stay visible.
// The frame chrome + Skip button live in the full-window layer so they hug the
// real window edges rather than the cropped stage edges.
export default function IntroScene(props: IntroSceneProps) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.max(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", zIndex: 30 }}>
      <div data-intro-stage="" style={{ position: "absolute", top: "50%", left: "50%", width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center center", background: INTRO_BG, color: "#ff9030", fontFamily: '"Frontier Disket Mono", ui-monospace, monospace' }}>
        <Scene {...props} />
      </div>
      <FrameChrome />
      <SkipToBazaar onSkip={props.onSkip} isRegistered={props.isRegistered} pending={props.skipPending} />
    </div>
  );
}
