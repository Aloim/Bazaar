// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useRef } from "react";
import { PACKAGE_ID } from "@bazaar/shared/constants";

// ── HAL 9000 orb — three glow frames (dim / normal / bright) ──────────────

const ORB_DIM = `
      ░░░▄▄▄░░░
    ░▄▀░░░░░▀▄░
   ░█░░░░░░░░░█░
   █░░░░◎░░░░░█
   ░█░░░░░░░░░█░
    ░▀▄░░░░░▄▀░
      ░░░▀▀▀░░░
`.trimStart();

const ORB_MID = `
      ▒▒▒▄▄▄▒▒▒
    ▒▄▀▒▒▒▒▒▀▄▒
   ▒█▒▒▒▒▒▒▒▒▒█▒
   █▒▒▒▒◉▒▒▒▒▒█
   ▒█▒▒▒▒▒▒▒▒▒█▒
    ▒▀▄▒▒▒▒▒▄▀▒
      ▒▒▒▀▀▀▒▒▒
`.trimStart();

const ORB_BRIGHT = `
      ▓▓▓▄▄▄▓▓▓
    ▓▄▀▓▓▓▓▓▀▄▓
   ▓█▓▓▓▓▓▓▓▓▓█▓
   █▓▓▓▓●▓▓▓▓▓█
   ▓█▓▓▓▓▓▓▓▓▓█▓
    ▓▀▄▓▓▓▓▓▄▀▓
      ▓▓▓▀▀▀▓▓▓
`.trimStart();

const ORB_FRAMES = [ORB_DIM, ORB_MID, ORB_BRIGHT];

// ── Types ─────────────────────────────────────────────────────────────────

type ModalPhase =
  | "choice"     // initial state — two buttons available
  | "disagreed"  // Refuse clicked — only Consent remains, title retyped
  | "scanning"   // Consent clicked — 1.5 s fast-pulse
  | "recorded";  // Identity markers recorded — 1 s then calls onRegistered

interface Props {
  walletAddress: string;
  onRegistered:  () => void;
}

// ── useTypewriter ─────────────────────────────────────────────────────────

function useTypewriter(fullText: string, speedMs = 45, startDelay = 400): string {
  const [displayed, setDisplayed] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDisplayed("");
    let idx = 0;

    const delayTimer = setTimeout(() => {
      timerRef.current = setInterval(() => {
        idx++;
        if (idx > fullText.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }
        setDisplayed(fullText.slice(0, idx));
      }, speedMs);
    }, startDelay);

    return () => {
      clearTimeout(delayTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fullText, speedMs, startDelay]);

  return displayed;
}

// ── StrangerGateModal ─────────────────────────────────────────────────────

/**
 * StrangerGateModal — blocking modal for unidentified wallets.
 *
 * Stores consent in localStorage only (key "bazar-identified" = walletAddress).
 * The actual on-chain register_stranger call is deferred to the user's first
 * real transaction via maybeRegisterStranger() in tx/autoRegister.ts.
 */
export default function StrangerGateModal({ walletAddress, onRegistered }: Props) {
  const [phase, setPhase]       = useState<ModalPhase>("choice");
  const [artVisible, setArtVisible] = useState(false);
  const [orbFrame, setOrbFrame] = useState(1); // 0=dim 1=mid 2=bright

  // Fade-in art on mount
  useEffect(() => {
    const t = setTimeout(() => setArtVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Typewriter title
  const titleText =
    phase === "disagreed"
      ? "ACCESS ONLY THROUGH IDENTIFICATION GRANTED."
      : "STRANGER, IDENTIFY!";
  const typedTitle  = useTypewriter(titleText, 45, artVisible ? 600 : 400);
  const titleDone   = typedTitle.length >= titleText.length;
  const isTyping    = typedTitle.length > 0 && !titleDone;

  // Orb pulse — slow while typing, fast during scanning
  useEffect(() => {
    const isFast = phase === "scanning";
    const intervalMs = isFast ? 120 : 400;

    if (!isTyping && phase !== "scanning") {
      setOrbFrame(1); // settled on mid when idle
      return;
    }

    const interval = setInterval(() => {
      setOrbFrame(prev => (prev + 1) % ORB_FRAMES.length);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isTyping, phase]);

  // Body text
  const bodyText: string | null =
    !titleDone ? null :
    phase === "choice"    ? "This installation requires all visitors to be Scanned and Identified. Your Ship is unknown. Consent to identification procedure!" :
    phase === "disagreed" ? "Identification refused. Consent to identification procedure to proceed." :
    phase === "scanning"  ? "Scanning vessel signature\u2026" :
    phase === "recorded"  ? "Identity markers recorded." :
    null;

  const bodyWarn = phase === "disagreed";

  // ── Handlers ───────────────────────────────────────────────────────────

  async function handleConsent() {
    setPhase("scanning");
    await new Promise<void>(r => setTimeout(r, 1500));
    setPhase("recorded");
    await new Promise<void>(r => setTimeout(r, 1000));
    localStorage.setItem(`bazar-identified-${PACKAGE_ID}`, walletAddress);
    onRegistered();
  }

  function handleRefuse() {
    setPhase("disagreed");
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay modal-overlay--blocking" aria-modal="true" role="dialog">
      <div className="modal stranger-gate" onClick={e => e.stopPropagation()}>

        {/* Orb */}
        <pre
          className="stranger-gate__art"
          style={{
            opacity:    artVisible ? 1 : 0,
            transition: "opacity 0.8s ease-in",
            color:      "var(--accent)",
          }}
        >
          {ORB_FRAMES[orbFrame]}
        </pre>

        {/* Title */}
        <div className="stranger-gate__header">
          <h2 className="stranger-gate__title">
            {typedTitle}
            <span className="stranger-gate__cursor">_</span>
          </h2>
        </div>

        {/* Body */}
        {bodyText && (
          <p className={`stranger-gate__body${bodyWarn ? " stranger-gate__body--warn" : ""}`}>
            {bodyText}
          </p>
        )}

        {/* Actions (shown only after title finishes and not scanning/recorded) */}
        {titleDone && phase !== "scanning" && phase !== "recorded" && (
          <div className="stranger-gate__actions">
            <button className="btn btn--primary" onClick={handleConsent}>
              Consent to Scan
            </button>
            {phase === "choice" && (
              <button className="btn btn--ghost" onClick={handleRefuse}>
                Refuse
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
