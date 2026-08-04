// TranslationSequence.tsx — The interactive card flow of the intro cinematic.
// Fires on first cursor entry into the eye trigger zone. Card 1 ("WHO APPROACHES
// THE BAZAAR?") → "Me." (identity) → Consent / Refuse → (Accept) → Scanning →
// PROCEED (formed from rain) → click. Ported from
// design-reference/IntroSequence/scene.jsx.
//
// PRODUCTION WIRING (the only divergence from the prototype):
//   - onConsent() fires the real STRANGER registration TX (Consent + Accept).
//   - onProceed() advances into the Godot world (after PROCEED click + fade).
//   - walletShort / playerName replace the placeholder strings.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  STAGE_W, STAGE_H, CRYPTIC_CHARS, TRANSLATION_LINES, BAR_LABEL_CRYPTIC, BAR_LABEL_SUCCESS,
  churnCryptic, cachedRasterize, rasterizeTextToCells, type HalRef,
} from "./introConstants";

interface Props {
  halRef: React.MutableRefObject<HalRef>;
  triggered: boolean;
  onConsent: () => void;
  onProceed: () => void;
  walletShort: string;
  playerName: string;
}

export default function TranslationSequence({ halRef, triggered, onConsent, onProceed, walletShort, playerName }: Props) {
  const [now, setNow] = useState(0);
  const [, setClickTick] = useState(0);
  const startRef = useRef(0);
  const meClickRef = useRef<number | null>(null);
  const consentClickRef = useRef<number | null>(null);
  const refuseClickRef = useRef<number | null>(null);
  const consent2ClickRef = useRef<number | null>(null);
  const proceedClickRef = useRef<number | null>(null);
  const card1Ref = useRef<HTMLDivElement>(null);
  const [card1Dims, setCard1Dims] = useState({ w: 620, h: 240 });
  const [proceedHover, setProceedHover] = useState(false);
  const eyePosRef = useRef({ cx: STAGE_W / 2, cy: STAGE_H / 2, r: 130 });

  useLayoutEffect(() => {
    if (!card1Ref.current) return;
    const r = card1Ref.current.getBoundingClientRect();
    const stage = card1Ref.current.closest("[data-intro-stage]") || document.body;
    const sr = stage.getBoundingClientRect();
    const sx = sr.width / STAGE_W, sy = sr.height / STAGE_H;
    const w = sx > 0 ? r.width / sx : r.width;
    const h = sy > 0 ? r.height / sy : r.height;
    if (Math.abs(w - card1Dims.w) > 4 || Math.abs(h - card1Dims.h) > 4) setCard1Dims({ w, h });
  });

  const registerClick = (ref: React.MutableRefObject<number | null>, pulseTimes: number[]) => {
    if (ref.current != null) return;
    const tNow = (performance.now() - startRef.current) / 1000;
    ref.current = tNow;
    halRef.current.dynamicPulses = halRef.current.dynamicPulses || [];
    for (const dt of pulseTimes) halRef.current.dynamicPulses.push(tNow + dt);
    setClickTick((x) => x + 1);
  };

  useEffect(() => {
    if (!triggered) return;
    startRef.current = performance.now();
    if (halRef.current) {
      eyePosRef.current = { cx: halRef.current.eyeCx_stage, cy: halRef.current.eyeCy_stage, r: halRef.current.eyeR_stage };
    }
    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); setNow((performance.now() - startRef.current) / 1000); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [triggered, halRef]);

  if (!triggered) return null;
  const t = now;

  // Phase timing constants (seconds-after-trigger).
  const T_CARD_APPEAR = 7.8, T_CARD_TURNON_END = 8.4, T_BAR_APPEAR = 10.5, T_BAR_LABEL_DONE = 11.8;
  const T_FILL_END = 15.8, T_TRANSLATE_BAR_END = 17.1, T_DOCK_START = 17.3, T_DOCK_END = 18.3;
  const T_BAR_DISSOLVE_START = 20.1, T_BAR_DISSOLVE_END = 21.1;
  const CARD_CHAR_PERIOD = 0.025, CARD_LINE_STAGGER = 0.55, BAR_CHAR_PERIOD = 0.042, BAR_FLIP_DUR = 0.3;
  const CARD_FLIP_PERIOD = 0.054, CARD_FLIP_DUR = 1.05;

  // Card-area rain cutout.
  const consT_early = consentClickRef.current, cons2T_early = consent2ClickRef.current, proceedT_early = proceedClickRef.current;
  const CUTOUT_INSET_X = -10, CUTOUT_INSET_Y = 40;
  const CUTOUT_W = Math.max(80, card1Dims.w - CUTOUT_INSET_X * 2);
  const CUTOUT_H = Math.max(60, card1Dims.h - CUTOUT_INSET_Y * 2);
  const _cardX = STAGE_W / 2, _cardY = STAGE_H / 2 + 140;
  const cutoutX = _cardX - CUTOUT_W / 2;
  const cutoutY = _cardY + CUTOUT_INSET_Y - 28;
  const T_CUTOUT_FREEZE = 2.3, T_CUTOUT_FALL = 5.3, T_CUTOUT_CLEAR = 6.8;
  let cutoutRelease = Infinity;
  if (consT_early != null) cutoutRelease = consT_early + 1.0;
  else if (cons2T_early != null) cutoutRelease = cons2T_early + 1.0;
  if (proceedT_early != null) cutoutRelease = Math.min(cutoutRelease, proceedT_early);
  halRef.current.cardCutout = {
    x: cutoutX, y: cutoutY, w: CUTOUT_W, h: CUTOUT_H, tNow: t,
    tFreeze: T_CUTOUT_FREEZE, tFall: T_CUTOUT_FALL, tClear: T_CUTOUT_CLEAR, tRelease: cutoutRelease,
  };

  if (t < T_CARD_APPEAR) {
    // Still keep scan/proceed channels cleared.
    halRef.current.proceedShape = null; halRef.current.proceedOpacity = 0;
    halRef.current.scanShape = null; halRef.current.scanOpacity = 0;
    return null;
  }

  const meT = meClickRef.current, consT = consentClickRef.current, refT = refuseClickRef.current;
  const cons2T = consent2ClickRef.current, proceedT = proceedClickRef.current;

  const CARD1_DISSOLVE_DUR = 1.1;
  const card1DissolveK = meT == null ? 0 : Math.max(0, Math.min(1, (t - meT) / CARD1_DISSOLVE_DUR));
  const card1Gone = card1DissolveK >= 1;

  const T_CARD2_START = meT == null ? Infinity : meT + 1.1;
  const T_CARD2_WRITE_BEGIN = meT == null ? Infinity : meT + 2.0;
  const card2K = meT == null ? 0 : Math.max(0, Math.min(1, (t - T_CARD2_START) / 0.7));
  const card2EaseK = card2K * card2K * (3 - 2 * card2K);
  const card2DissolveStart = consT != null ? consT + 1.0 : refT != null ? refT + 0.6 : Infinity;
  const card2DissolveDur = consT != null ? 1.2 : 1.0;
  const card2DissolveK = !isFinite(card2DissolveStart) ? 0 : Math.max(0, Math.min(1, (t - card2DissolveStart) / card2DissolveDur));
  const card2Gone = card2DissolveK >= 1;

  const T_CARD3_START = refT == null ? Infinity : refT + 1.6;
  const card3K = refT == null ? 0 : Math.max(0, Math.min(1, (t - T_CARD3_START) / 0.7));
  const card3EaseK = card3K * card3K * (3 - 2 * card3K);
  const card3DissolveStart = cons2T == null ? Infinity : cons2T + 1.0;
  const card3DissolveK = !isFinite(card3DissolveStart) ? 0 : Math.max(0, Math.min(1, (t - card3DissolveStart) / 1.2));
  const card3Gone = card3DissolveK >= 1;

  const finalConsentT = consT != null && refT == null ? consT : cons2T != null ? cons2T : null;
  const T_SCAN_ANCHOR = finalConsentT == null ? Infinity : finalConsentT === consT ? consT! + 2.2 : cons2T! + 2.2;
  const T_SCAN_TYPE_START = T_SCAN_ANCHOR + 0.4;
  const T_SCAN_HOLD_END = T_SCAN_ANCHOR + 5.0 + 0.4;
  const T_SCAN_DISSOLVE_END = T_SCAN_HOLD_END + 0.6;
  const T_DONE_TYPE_START = T_SCAN_DISSOLVE_END + 0.2;
  const T_DONE_HOLD_END = T_DONE_TYPE_START + 1.8;
  const T_DONE_DISSOLVE_END = T_DONE_HOLD_END + 0.6;
  const T_PROCEED_FORM_START = finalConsentT == null ? Infinity : T_DONE_DISSOLVE_END + 0.2;
  const proceedFormK = finalConsentT == null ? 0 : Math.max(0, Math.min(1, (t - T_PROCEED_FORM_START) / 1.4));

  const cardX = STAGE_W / 2, cardY = STAGE_H / 2 + 140;

  // ── Card 1 render ─────────────────────────────────────────────────────────
  const cardT = t - T_CARD_APPEAR;
  const turnOn = Math.min(1, cardT / (T_CARD_TURNON_END - T_CARD_APPEAR));
  const scaleY = turnOn < 0.3 ? (turnOn / 0.3) * 0.008
    : turnOn < 0.6 ? 0.008 + ((turnOn - 0.3) / 0.3) * (1.02 - 0.008)
    : turnOn < 0.8 ? 1.02 - ((turnOn - 0.6) / 0.2) * 0.04
    : 0.98 + ((turnOn - 0.8) / 0.2) * 0.02;
  const scaleX = turnOn < 0.3 ? turnOn / 0.3 : 1;
  const brightness = turnOn < 0.3 ? 3 : turnOn < 0.6 ? 2.5 - ((turnOn - 0.3) / 0.3) * 1.2 : 1.3 - ((turnOn - 0.6) / 0.4) * 0.3;
  const contentOp = Math.max(0, Math.min(1, (turnOn - 0.5) / 0.5));

  function renderCardLine(line: string, lineIdx: number, dissolveK = 0) {
    const lineStart = T_CARD_TURNON_END + lineIdx * CARD_LINE_STAGGER;
    return (
      <div key={lineIdx} style={{ fontFamily: '"Frontier Disket Mono", ui-monospace, monospace', fontSize: "1rem", color: "rgba(255, 180, 80, 0.95)", letterSpacing: "0.06em", textShadow: "0 0 6px rgba(255, 144, 48, 0.45)", whiteSpace: "pre", minHeight: "1.4em" }}>
        {line.split("").map((ch, ci) => {
          if (dissolveK > 0) {
            const globalIdx = lineIdx * 30 + ci;
            const charK = Math.max(0, Math.min(1, (dissolveK - globalIdx * 0.008) / 0.6));
            if (charK > 0) {
              if (ch === " ") return <span key={ci}> </span>;
              const fallY = charK * (180 + (ci % 4) * 40);
              const glyph = CRYPTIC_CHARS[Math.floor(t * 22 + ci * 9 + lineIdx * 3) % CRYPTIC_CHARS.length];
              return <span key={ci} style={{ display: "inline-block", transform: `translateY(${fallY}px)`, opacity: 1 - charK, color: "rgba(255, 180, 80, 0.95)" }}>{glyph}</span>;
            }
          }
          const writeT = lineStart + ci * CARD_CHAR_PERIOD;
          const writeAge = t - writeT;
          if (writeAge < 0) return <span key={ci} style={{ opacity: 0 }}>{ch}</span>;
          const translateStartT = T_DOCK_START + lineIdx * 0.15 + ci * CARD_FLIP_PERIOD;
          const translateAge = t - translateStartT;
          if (ch === " ") return <span key={ci}> </span>;
          if (translateAge >= CARD_FLIP_DUR) return <span key={ci}>{ch}</span>;
          if (translateAge >= 0 && translateAge < CARD_FLIP_DUR) {
            const churnIdx = Math.floor(translateAge * 14 + ci * 7) % CRYPTIC_CHARS.length;
            return <span key={ci} style={{ color: "rgba(255, 220, 130, 1)", textShadow: "0 0 8px rgba(255, 200, 80, 0.85)" }}>{CRYPTIC_CHARS[churnIdx]}</span>;
          }
          if (writeAge < 0.18) {
            const churnIdx = Math.floor(writeAge * 60 + ci * 13) % CRYPTIC_CHARS.length;
            return <span key={ci} style={{ color: "rgba(255, 200, 110, 0.95)" }}>{CRYPTIC_CHARS[churnIdx]}</span>;
          }
          return <span key={ci}>{churnCryptic(lineIdx * 1000 + ci, t)}</span>;
        })}
      </div>
    );
  }

  const cardEl = card1Gone ? null : (
    <div ref={card1Ref} style={{
      position: "absolute", left: cardX, top: cardY,
      transform: `translate(-50%, 0) scaleX(${scaleX}) scaleY(${scaleY}) translateY(${card1DissolveK * 60}px)`,
      transformOrigin: "center center", filter: `brightness(${Math.max(1, brightness)})`,
      background: "rgba(5, 5, 5, 0.92)", border: "1px solid rgba(204, 112, 0, 0.45)", borderRadius: 6,
      boxShadow: "0 0 30px rgba(204, 112, 0, 0.18), inset 0 0 20px rgba(0, 0, 0, 0.5)",
      padding: "1.6rem 2.4rem", minWidth: 560,
      opacity: Math.min(1, turnOn * 1.6) * (1 - card1DissolveK * card1DissolveK), zIndex: 28, pointerEvents: "none",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: contentOp }}>
        {TRANSLATION_LINES.map((line, idx) => renderCardLine(line, idx, card1DissolveK))}
        {(() => {
          const T_ANSWER_APPEAR = T_BAR_DISSOLVE_END + 0.2;
          const ageA = t - T_ANSWER_APPEAR;
          if (ageA < 0) return null;
          const fadeIn = Math.min(1, ageA / 0.5);
          const showCursor = Math.floor(t * 2) % 2 === 0;
          const meClicked = meClickRef.current != null;
          const btnFall = card1DissolveK * 200;
          const btnOp = 1 - card1DissolveK;
          return (
            <div style={{ marginTop: 6, opacity: fadeIn * btnOp, display: "flex", alignItems: "baseline", gap: 10, transform: `translateX(${(1 - fadeIn) * -8}px) translateY(${btnFall}px)` }}>
              <span style={{ color: "rgba(255, 220, 130, 0.55)", userSelect: "none" }}>›</span>
              <button type="button" onClick={() => registerClick(meClickRef, [0])} disabled={meClicked} style={{
                pointerEvents: "auto", background: "rgba(204, 112, 0, 0.08)", border: "1px solid rgba(204, 112, 0, 0.55)", borderRadius: 3,
                color: "rgba(255, 220, 150, 0.95)", font: "inherit", letterSpacing: "0.04em", padding: "6px 14px",
                cursor: meClicked ? "default" : "pointer", textShadow: "0 0 8px rgba(255, 180, 80, 0.5)",
                boxShadow: "0 0 14px rgba(204, 112, 0, 0.18), inset 0 0 12px rgba(204, 112, 0, 0.08)", transition: "background 0.15s, box-shadow 0.15s, border-color 0.15s",
              }}>
                <span style={{ color: "rgba(255, 235, 180, 1)" }}>Me.</span>
                <span style={{ marginLeft: 10, color: "rgba(255, 200, 110, 0.85)", letterSpacing: "0.06em" }}>{walletShort}</span>
                <span style={{ marginLeft: 8, opacity: showCursor ? 1 : 0, color: "rgba(255, 220, 150, 0.9)" }}>▎</span>
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );

  // ── Bar render ────────────────────────────────────────────────────────────
  let barEl: React.ReactNode = null;
  if (t >= T_BAR_APPEAR && t < T_BAR_DISSOLVE_END) {
    const startX = cardX, startY = cardY + 30, endX = cardX, endY = cardY + 230;
    let dockK = 0;
    if (t >= T_DOCK_START) { dockK = Math.min(1, (t - T_DOCK_START) / (T_DOCK_END - T_DOCK_START)); dockK = dockK * dockK * (3 - 2 * dockK); }
    const posX = startX + (endX - startX) * dockK, posY = startY + (endY - startY) * dockK;
    const barW = 400, barH = 3, labelSize = 1.35;
    const appearOp = Math.min(1, (t - T_BAR_APPEAR) / 0.35);
    let dissolveOp = 1;
    if (t >= T_BAR_DISSOLVE_START) { const dk = Math.min(1, (t - T_BAR_DISSOLVE_START) / (T_BAR_DISSOLVE_END - T_BAR_DISSOLVE_START)); dissolveOp = 1 - Math.max(0, (dk - 0.25) / 0.75); }
    let fillPct = 0;
    if (t >= T_BAR_LABEL_DONE) { const k = (t - T_BAR_LABEL_DONE) / (T_FILL_END - T_BAR_LABEL_DONE); const c = Math.max(0, Math.min(1, k)); fillPct = c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2; }

    const renderBarLabel = () => {
      const targetTextNow = t >= T_FILL_END ? BAR_LABEL_SUCCESS : BAR_LABEL_CRYPTIC;
      return targetTextNow.split("").map((ch, ci) => {
        const writeT = T_BAR_APPEAR + 0.35 + ci * BAR_CHAR_PERIOD;
        const writeAge = t - writeT;
        if (writeAge < 0) return <span key={ci} style={{ opacity: 0 }}>{ch}</span>;
        const translateStartT = T_FILL_END + ci * (BAR_CHAR_PERIOD * 0.9);
        const translateAge = t - translateStartT;
        if (ch === " ") return <span key={ci}> </span>;
        if (translateAge >= BAR_FLIP_DUR) return <span key={ci}>{ch}</span>;
        if (translateAge >= 0 && translateAge < BAR_FLIP_DUR) {
          const churnIdx = Math.floor(translateAge * 38 + ci * 11) % CRYPTIC_CHARS.length;
          return <span key={ci} style={{ color: "rgba(255, 220, 130, 1)", textShadow: "0 0 9px rgba(255, 200, 80, 0.9)" }}>{CRYPTIC_CHARS[churnIdx]}</span>;
        }
        if (writeAge < 0.18) { const churnIdx = Math.floor(writeAge * 60 + ci * 13) % CRYPTIC_CHARS.length; return <span key={ci}>{CRYPTIC_CHARS[churnIdx]}</span>; }
        return <span key={ci}>{churnCryptic(99000 + ci, t)}</span>;
      });
    };

    const successPulse = t >= T_TRANSLATE_BAR_END && t < T_DOCK_START ? Math.sin(((t - T_TRANSLATE_BAR_END) / (T_DOCK_START - T_TRANSLATE_BAR_END)) * Math.PI) : 0;
    const labelGlow = `0 0 ${6 + successPulse * 12}px rgba(255, ${144 + successPulse * 36}, 48, ${0.4 + successPulse * 0.45})`;

    barEl = (
      <div style={{ position: "absolute", left: posX, top: posY, transform: "translate(-50%, -50%)", opacity: appearOp * dissolveOp, zIndex: 30, pointerEvents: "none" }}>
        <div style={{ background: "rgba(5, 5, 5, 0.95)", border: "1px solid rgba(204, 112, 0, 0.55)", borderRadius: 6, boxShadow: "0 0 36px rgba(204, 112, 0, 0.28), 0 8px 24px rgba(0,0,0,0.6), inset 0 0 24px rgba(0, 0, 0, 0.55)", padding: `${2.0 - dockK * 1.5}rem ${2.0 - dockK * 1.2}rem`, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 - dockK * 12 }}>
          <div style={{ fontFamily: '"Frontier Disket Mono", ui-monospace, monospace', fontWeight: 700, color: "rgba(255, 180, 80, 0.95)", letterSpacing: "0.14em", textShadow: labelGlow, fontSize: labelSize + "rem", whiteSpace: "nowrap" }}>
            {(() => {
              if (t >= T_BAR_DISSOLVE_START) {
                const dk = Math.min(1, (t - T_BAR_DISSOLVE_START) / (T_BAR_DISSOLVE_END - T_BAR_DISSOLVE_START));
                return BAR_LABEL_SUCCESS.split("").map((ch, ci) => {
                  const charK = Math.max(0, Math.min(1, (dk - ci * 0.012) / 0.55));
                  if (ch === " ") return <span key={ci}> </span>;
                  const fallY = charK * (180 + (ci % 5) * 30);
                  const glyph = charK > 0.05 ? CRYPTIC_CHARS[Math.floor(t * 18 + ci * 7) % CRYPTIC_CHARS.length] : ch;
                  return <span key={ci} style={{ display: "inline-block", transform: `translateY(${fallY}px)`, opacity: 1 - charK, color: charK > 0.1 ? "rgba(255, 180, 80, 0.9)" : undefined }}>{glyph}</span>;
                });
              }
              return renderBarLabel();
            })()}
          </div>
          <div style={{ width: barW, height: barH, background: "rgba(255, 144, 48, 0.12)", borderRadius: 1, overflow: "hidden" }}>
            <div style={{ width: `${fillPct * 100}%`, height: "100%", background: "linear-gradient(90deg, #ff9030, #d27828)", boxShadow: "0 0 8px rgba(255, 144, 48, 0.6)", transition: "width 0.05s linear" }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Card 2 (Consent prompt) ───────────────────────────────────────────────
  let card2El: React.ReactNode = null;
  if (meT != null && t >= T_CARD2_START && !card2Gone) {
    const k = card2EaseK;
    const scaleNow = 0.85 + k * (1.05 - 0.85);
    const yOffset = (1 - k) * 60;
    const opIn = Math.min(1, k * 1.3);
    const dk = card2DissolveK;
    const fallShift = dk * 60;
    const opOut = 1 - dk * dk;
    const consentClicked = consT != null, refuseClicked = refT != null, anyClicked = consentClicked || refuseClicked;
    const CARD2_LINE_STAGGER = 0.55, CARD2_CHAR_PERIOD = 0.022;
    const lineSpecs = [
      { text: `> ${walletShort}`, bold: true, size: "1.3rem", indent: 0 },
      { text: "consent to scan", bold: false, size: "0.95rem", indent: 18 },
    ];

    const renderC2Line = (spec: typeof lineSpecs[number], lineIdx: number) => {
      const { text, bold, size, indent = 0 } = spec;
      const lineStart = T_CARD2_WRITE_BEGIN + lineIdx * CARD2_LINE_STAGGER;
      return (
        <div key={lineIdx} style={{ fontFamily: '"Frontier Disket Mono", ui-monospace, monospace', fontSize: size, fontWeight: bold ? 700 : 400, color: "rgba(255, 180, 80, 0.95)", letterSpacing: bold ? "0.08em" : "0.05em", textShadow: bold ? "0 0 9px rgba(255, 144, 48, 0.6)" : "0 0 6px rgba(255, 144, 48, 0.4)", whiteSpace: "pre", minHeight: "1.4em", paddingLeft: indent }}>
          {text.split("").map((ch, ci) => {
            if (dk > 0) {
              const globalIdx = lineIdx * 30 + ci;
              const charK = Math.max(0, Math.min(1, (dk - globalIdx * 0.006) / 0.7));
              if (charK > 0) {
                if (ch === " ") return <span key={ci}> </span>;
                const fallY = charK * (220 + (ci % 4) * 40);
                const glyph = CRYPTIC_CHARS[Math.floor(t * 22 + ci * 9 + lineIdx * 3) % CRYPTIC_CHARS.length];
                return <span key={ci} style={{ display: "inline-block", transform: `translateY(${fallY}px) rotate(${(charK * 30 * (ci % 2 ? 1 : -1)).toFixed(1)}deg)`, opacity: 1 - charK }}>{glyph}</span>;
              }
            }
            const writeAge = t - (lineStart + ci * CARD2_CHAR_PERIOD);
            if (writeAge < 0) return <span key={ci} style={{ opacity: 0 }}>{ch}</span>;
            if (ch === " ") return <span key={ci}> </span>;
            if (writeAge < 0.18) { const churnIdx = Math.floor(writeAge * 60 + ci * 13) % CRYPTIC_CHARS.length; return <span key={ci} style={{ color: "rgba(255, 200, 110, 0.95)" }}>{CRYPTIC_CHARS[churnIdx]}</span>; }
            return <span key={ci}>{ch}</span>;
          })}
        </div>
      );
    };

    const T_C2_BUTTONS = T_CARD2_WRITE_BEGIN + lineSpecs.length * CARD2_LINE_STAGGER + 0.2;
    const buttonsOp = Math.max(0, Math.min(1, (t - T_C2_BUTTONS) / 0.5));
    const buttonsFall = dk * 200, buttonsFadeOut = 1 - dk;

    card2El = (
      <div style={{ position: "absolute", left: cardX, top: cardY, transform: `translate(-50%, ${yOffset}px) scale(${scaleNow}) translateY(${fallShift}px)`, transformOrigin: "center top", background: "rgba(5, 5, 5, 0.92)", border: "1px solid rgba(204, 112, 0, 0.55)", borderRadius: 6, boxShadow: "0 0 36px rgba(204, 112, 0, 0.28), inset 0 0 24px rgba(0, 0, 0, 0.55)", padding: "1.4rem 2.2rem", minWidth: 480, opacity: opIn * opOut, zIndex: 28, pointerEvents: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lineSpecs.map((spec, i) => renderC2Line(spec, i))}
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, opacity: buttonsOp * buttonsFadeOut, transform: `translateY(${(1 - buttonsOp) * -8 + buttonsFall}px)`, alignItems: "flex-start" }}>
            {[
              { label: "› Consent", ref: consentClickRef, primary: true, onClick: () => { registerClick(consentClickRef, [0, 0.18, 0.36]); onConsent(); } },
              { label: "› Refuse", ref: refuseClickRef, primary: false, onClick: () => registerClick(refuseClickRef, [0]) },
            ].map(({ label, ref, primary, onClick }) => {
              const clicked = ref.current != null;
              const baseBorder = primary ? "rgba(255, 180, 80, 0.55)" : "rgba(204, 112, 0, 0.35)";
              return (
                <button key={label} type="button" onClick={onClick} disabled={anyClicked} style={{ pointerEvents: "auto", background: clicked ? "rgba(255, 180, 80, 0.18)" : "transparent", border: `1px solid ${clicked ? "rgba(255, 220, 130, 0.95)" : baseBorder}`, borderRadius: 2, color: primary ? "rgba(255, 220, 150, 0.95)" : "rgba(255, 200, 130, 0.78)", font: "inherit", fontFamily: '"Frontier Disket Mono", ui-monospace, monospace', fontSize: "0.95rem", letterSpacing: "0.05em", padding: "5px 14px", cursor: anyClicked ? "default" : "pointer", textShadow: primary ? "0 0 8px rgba(255, 180, 80, 0.5)" : "0 0 6px rgba(204, 112, 0, 0.35)", transition: "background 0.15s, color 0.15s, border-color 0.15s", textAlign: "left", minWidth: 180 }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Card 3 (BAZAAR INSISTS, after Refuse) ─────────────────────────────────
  let card3El: React.ReactNode = null;
  if (refT != null && t >= T_CARD3_START && !card3Gone) {
    const k = card3EaseK;
    const scaleNow = 0.85 + k * (1.0 - 0.85);
    const yOffset = (1 - k) * 40;
    const opIn = Math.min(1, k * 1.3);
    const dk = card3DissolveK;
    const fallShift = dk * 60, opOut = 1 - dk * dk;
    const T_C3_WRITE_BEGIN = T_CARD3_START + 0.2;
    const CARD3_LINE_STAGGER = 0.55, CARD3_CHAR_PERIOD = 0.022;
    const lineSpecs = [
      { text: "> Scan nonoptional", bold: true, size: "1.1rem", indent: 0 },
      { text: "To dock this Bazaar, scan is mandatory", bold: false, size: "0.9rem", indent: 16 },
    ];

    const renderC3Line = (spec: typeof lineSpecs[number], lineIdx: number) => {
      const { text, bold, size, indent = 0 } = spec;
      const lineStart = T_C3_WRITE_BEGIN + lineIdx * CARD3_LINE_STAGGER;
      const lineColor = bold ? "rgba(255, 140, 60, 1)" : "rgba(255, 170, 90, 0.85)";
      const lineGlow = bold ? "0 0 9px rgba(255, 100, 30, 0.7)" : "0 0 6px rgba(255, 120, 40, 0.45)";
      return (
        <div key={lineIdx} style={{ fontFamily: '"Frontier Disket Mono", ui-monospace, monospace', fontSize: size, fontWeight: bold ? 700 : 400, color: lineColor, letterSpacing: bold ? "0.08em" : "0.05em", textShadow: lineGlow, whiteSpace: "pre", minHeight: "1.4em", paddingLeft: indent }}>
          {text.split("").map((ch, ci) => {
            if (dk > 0) {
              const globalIdx = lineIdx * 30 + ci;
              const charK = Math.max(0, Math.min(1, (dk - globalIdx * 0.006) / 0.7));
              if (charK > 0) {
                if (ch === " ") return <span key={ci}> </span>;
                const fallY = charK * (220 + (ci % 4) * 40);
                const glyph = CRYPTIC_CHARS[Math.floor(t * 22 + ci * 9 + lineIdx * 3) % CRYPTIC_CHARS.length];
                return <span key={ci} style={{ display: "inline-block", transform: `translateY(${fallY}px) rotate(${(charK * 30 * (ci % 2 ? 1 : -1)).toFixed(1)}deg)`, opacity: 1 - charK }}>{glyph}</span>;
              }
            }
            const writeAge = t - (lineStart + ci * CARD3_CHAR_PERIOD);
            if (writeAge < 0) return <span key={ci} style={{ opacity: 0 }}>{ch}</span>;
            if (ch === " ") return <span key={ci}> </span>;
            if (writeAge < 0.18) { const churnIdx = Math.floor(writeAge * 60 + ci * 13) % CRYPTIC_CHARS.length; return <span key={ci}>{CRYPTIC_CHARS[churnIdx]}</span>; }
            return <span key={ci}>{ch}</span>;
          })}
        </div>
      );
    };

    const T_C3_BUTTON = T_C3_WRITE_BEGIN + lineSpecs.length * CARD3_LINE_STAGGER + 0.2;
    const btnOp = Math.max(0, Math.min(1, (t - T_C3_BUTTON) / 0.5));
    const btnFall = dk * 200, btnFadeOut = 1 - dk;
    const consent2Clicked = cons2T != null;

    card3El = (
      <div style={{ position: "absolute", left: STAGE_W / 2, top: STAGE_H / 2 + 140, transform: `translate(-50%, 0) translateY(${yOffset}px) scale(${scaleNow}) translateY(${fallShift}px)`, transformOrigin: "center top", background: "rgba(8, 4, 2, 0.94)", border: "1px solid rgba(255, 100, 40, 0.55)", borderRadius: 6, boxShadow: "0 0 36px rgba(255, 100, 40, 0.28), inset 0 0 24px rgba(0, 0, 0, 0.6)", padding: "1.2rem 1.8rem", minWidth: 380, opacity: opIn * opOut, zIndex: 28, pointerEvents: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lineSpecs.map((spec, i) => renderC3Line(spec, i))}
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, opacity: btnOp * btnFadeOut, transform: `translateY(${(1 - btnOp) * -8 + btnFall}px)`, alignItems: "flex-start" }}>
            <button type="button" onClick={() => { registerClick(consent2ClickRef, [0, 0.18, 0.36]); onConsent(); }} disabled={consent2Clicked} style={{ pointerEvents: "auto", background: consent2Clicked ? "rgba(255, 180, 80, 0.18)" : "transparent", border: `1px solid ${consent2Clicked ? "rgba(255, 220, 130, 0.95)" : "rgba(255, 140, 60, 0.55)"}`, borderRadius: 2, color: "rgba(255, 200, 130, 0.95)", font: "inherit", fontFamily: '"Frontier Disket Mono", ui-monospace, monospace', fontSize: "0.95rem", letterSpacing: "0.05em", padding: "5px 14px", cursor: consent2Clicked ? "default" : "pointer", textShadow: "0 0 8px rgba(255, 140, 60, 0.5)", transition: "background 0.15s, color 0.15s, border-color 0.15s", textAlign: "left", minWidth: 160 }}>› Accept</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Scanning sequence (rain-rendered) ─────────────────────────────────────
  const SCAN_FONT_PX = 96, SCAN_LETTER_SP = 8, SCAN_FS = 14;
  const scanCenterX = STAGE_W / 2, scanCenterY = STAGE_H / 2 + 140 + 140;
  let scanPhrase = "", scanOpacity = 0;
  if (finalConsentT != null) {
    if (t >= T_SCAN_TYPE_START && t < T_SCAN_DISSOLVE_END) {
      const base = "Scanning", typeDur = 0.9, typeAge = t - T_SCAN_TYPE_START;
      const baseShown = Math.max(0, Math.min(base.length, Math.floor((typeAge / typeDur) * base.length)));
      let dotPhase = "";
      if (baseShown >= base.length) { const dotCycleAge = typeAge - typeDur; dotPhase = ".".repeat(Math.floor(dotCycleAge * 3) % 4); }
      scanPhrase = base + dotPhase;
      scanOpacity = t < T_SCAN_HOLD_END ? Math.min(1, (t - T_SCAN_TYPE_START) / 0.3) : 1 - Math.min(1, (t - T_SCAN_HOLD_END) / 0.6);
    } else if (t >= T_DONE_TYPE_START && t < T_DONE_DISSOLVE_END) {
      const base = "Scan complete", typeDur = 1.0, typeAge = t - T_DONE_TYPE_START;
      const shown = Math.max(0, Math.min(base.length, Math.floor((typeAge / typeDur) * base.length)));
      scanPhrase = base.slice(0, shown);
      scanOpacity = t < T_DONE_HOLD_END ? Math.min(1, (t - T_DONE_TYPE_START) / 0.3) : 1 - Math.min(1, (t - T_DONE_HOLD_END) / 0.6);
    }
  }
  if (scanPhrase && scanOpacity > 0) {
    const key = `SCAN-${SCAN_FONT_PX}-700-${SCAN_LETTER_SP}-${scanPhrase}`;
    const scanRaster = cachedRasterize(key, () => rasterizeTextToCells([{ text: scanPhrase, fontPx: SCAN_FONT_PX, weight: 700, letterSpacing: SCAN_LETTER_SP }], { centerXpx: scanCenterX, centerYpx: scanCenterY, FS: SCAN_FS, lineGapPx: 0 }));
    halRef.current.scanShape = scanRaster.cells;
    halRef.current.scanOpacity = scanOpacity;
  } else {
    halRef.current.scanShape = null;
    halRef.current.scanOpacity = 0;
  }

  // ── PROCEED ───────────────────────────────────────────────────────────────
  let proceedEl: React.ReactNode = null;
  if (finalConsentT != null && t >= T_PROCEED_FORM_START) {
    const k = proceedFormK;
    const headerSpecs = [
      { text: playerName, bold: true, size: "1.6rem" },
      { text: "Proceed with Docking", bold: false, size: "1.05rem" },
    ];
    const renderProceedLine = (spec: typeof headerSpecs[number], lineIdx: number) => {
      const { text, bold, size } = spec;
      const lineOffset = lineIdx * 0.25;
      return (
        <div key={lineIdx} style={{ fontFamily: '"Frontier Disket Mono", ui-monospace, monospace', fontSize: size, fontWeight: bold ? 700 : 400, color: "rgba(255, 220, 150, 1)", letterSpacing: bold ? "0.08em" : "0.05em", textShadow: bold ? "0 0 11px rgba(255, 180, 80, 0.7)" : "0 0 7px rgba(255, 180, 80, 0.5)", whiteSpace: "pre", textAlign: "center" }}>
          {text.split("").map((ch, ci) => {
            const charK = Math.max(0, Math.min(1, (k - lineOffset - ci * 0.012) / 0.55));
            if (charK <= 0.05) return <span key={ci} style={{ opacity: 0 }}>{ch}</span>;
            if (charK < 1) { const glyph = CRYPTIC_CHARS[Math.floor(t * 24 + ci * 11 + lineIdx * 7) % CRYPTIC_CHARS.length]; return <span key={ci} style={{ opacity: charK, color: "rgba(255, 200, 110, 0.95)" }}>{ch === " " ? " " : glyph}</span>; }
            return <span key={ci}>{ch}</span>;
          })}
        </div>
      );
    };

    const fullyFormed = k >= 1;
    const proceedClicked = proceedT != null;
    const T_PROCEED_BUTTON = T_PROCEED_FORM_START + 1.4 + 0.4;
    const btnOp = Math.max(0, Math.min(1, (t - T_PROCEED_BUTTON) / 1.0));
    const headerCx = STAGE_W / 2, headerCy = STAGE_H / 2 + 140;
    const FS = 14, procCenterX = STAGE_W / 2, procCenterY = headerCy + 140;
    const procRaster = fullyFormed
      ? cachedRasterize("PROCEED-144-700-12-v2", () => rasterizeTextToCells([{ text: "PROCEED", fontPx: 144, weight: 700, letterSpacing: 12 }], { centerXpx: procCenterX, centerYpx: procCenterY, FS, lineGapPx: 0 }))
      : { cells: new Set<number>(), bbox: null };
    const PROCEED_DISSOLVE_DUR = 2.25;
    const dissolveK = proceedT != null ? Math.min(1, Math.max(0, (t - proceedT) / PROCEED_DISSOLVE_DUR)) : 0;
    const dissolveInv = 1 - dissolveK;

    halRef.current.proceedShape = procRaster.cells;
    halRef.current.proceedOpacity = btnOp * dissolveInv;
    halRef.current.proceedHover = proceedHover && !proceedClicked;
    halRef.current.dissolveK = dissolveK;

    const hitBox = procRaster.bbox && {
      left: procRaster.bbox.minC * FS - 12, top: procRaster.bbox.minR * FS - 8,
      width: (procRaster.bbox.maxC - procRaster.bbox.minC + 1) * FS + 24,
      height: (procRaster.bbox.maxR - procRaster.bbox.minR + 1) * FS + 16,
    };

    proceedEl = (
      <>
        <div style={{ position: "absolute", left: headerCx, top: headerCy, transform: "translate(-50%, -50%)", zIndex: 28, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, opacity: Math.min(1, k * 1.2) * dissolveInv }}>
          {headerSpecs.map((spec, i) => renderProceedLine(spec, i))}
        </div>
        {fullyFormed && hitBox && (
          <div onMouseEnter={() => setProceedHover(true)} onMouseLeave={() => setProceedHover(false)} onClick={() => { if (proceedClicked) return; setProceedHover(false); registerClick(proceedClickRef, [0, 0.2, 0.4]); onProceed(); }} style={{ position: "absolute", left: hitBox.left, top: hitBox.top, width: hitBox.width, height: hitBox.height, zIndex: 28, cursor: proceedClicked ? "default" : "pointer", background: "transparent", opacity: btnOp }} />
        )}
      </>
    );
  } else {
    halRef.current.proceedShape = null;
    halRef.current.proceedOpacity = 0;
    halRef.current.proceedHover = false;
  }

  // ── Fade-to-black after PROCEED ───────────────────────────────────────────
  let fadeEl: React.ReactNode = null;
  if (proceedT != null) {
    const fk = Math.min(1, Math.max(0, (t - proceedT - 0.6) / 1.4));
    if (fk > 0) fadeEl = <div style={{ position: "absolute", left: 0, top: 0, width: STAGE_W, height: STAGE_H, background: "#000", opacity: fk, zIndex: 40, pointerEvents: "none" }} />;
  }

  return (
    <>
      {cardEl}
      {card2El}
      {card3El}
      {proceedEl}
      {barEl}
      {fadeEl}
    </>
  );
}
