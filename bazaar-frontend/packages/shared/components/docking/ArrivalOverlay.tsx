// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ArrivalOverlay — "Docking Procedure completed. / Airlock opening." arrival sequence.
 *
 * Timing extracted from Bazar1 GodotGameWrapper.tsx lines 129–217:
 *   - Master tick: 45ms setInterval (line 164)
 *   - Pause1: > 8 ticks = 9×45 = 405ms (line 151)
 *   - Pause2: > 15 ticks = 16×45 = 720ms (line 158)
 *   - Fade duration: 1200ms ease-out (line 162 + 181)
 *   - LINE1: "Docking Procedure completed." (line 132)
 *   - LINE2: "Airlock opening." (line 133)
 *
 * Belongs to @bazaar/shared — zero app-specific imports (Constitution I.3).
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useEffect, useCallback } from "react";
import { Z } from "@bazaar/shared/constants/zIndex";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ArrivalOverlayProps {
  /** Fires exactly once after the fadeMs fade-out completes. */
  onComplete: () => void;
  /** If true, show a "Skip" button during lines/pauses (hidden during fade). */
  showSkip?: boolean;
  /** Override LINE1 text. Default: "Docking Procedure completed." */
  line1?: string;
  /** Override LINE2 text. Default: "Airlock opening." */
  line2?: string;
  /** Master tick interval in ms. Default: 45 (Bazar1 line 164). */
  tickMs?: number;
  /** Pause1 length in ticks. Default: 8 (Bazar1 line 151: pauseCount > 8). */
  pause1Ticks?: number;
  /** Pause2 length in ticks. Default: 15 (Bazar1 line 158: pauseCount > 15). */
  pause2Ticks?: number;
  /** Fade-out CSS transition duration in ms. Default: 1200 (Bazar1 line 162). */
  fadeMs?: number;
}

const DEFAULT_LINE1 = "Docking Procedure completed.";
const DEFAULT_LINE2 = "Airlock opening.";
const DEFAULT_TICK_MS = 45;
const DEFAULT_PAUSE1_TICKS = 8;
const DEFAULT_PAUSE2_TICKS = 15;
const DEFAULT_FADE_MS = 1200;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ArrivalOverlay({
  onComplete,
  showSkip = false,
  line1 = DEFAULT_LINE1,
  line2 = DEFAULT_LINE2,
  tickMs = DEFAULT_TICK_MS,
  pause1Ticks = DEFAULT_PAUSE1_TICKS,
  pause2Ticks = DEFAULT_PAUSE2_TICKS,
  fadeMs = DEFAULT_FADE_MS,
}: ArrivalOverlayProps) {
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    let idx = 0;
    let phase: "line1" | "pause1" | "line2" | "pause2" | "fade" | "done" = "line1";
    let pauseCount = 0;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;

    const iv = setInterval(() => {
      if (phase === "line1") {
        idx++;
        if (idx > line1.length) {
          phase = "pause1";
          pauseCount = 0;
        } else {
          setD1(line1.slice(0, idx));
        }
      } else if (phase === "pause1") {
        pauseCount++;
        if (pauseCount > pause1Ticks) {
          phase = "line2";
          idx = 0;
        }
      } else if (phase === "line2") {
        idx++;
        if (idx > line2.length) {
          phase = "pause2";
          pauseCount = 0;
        } else {
          setD2(line2.slice(0, idx));
        }
      } else if (phase === "pause2") {
        pauseCount++;
        if (pauseCount > pause2Ticks) {
          phase = "fade";
          setFadeOut(true);
        }
      } else if (phase === "fade") {
        phase = "done";
        clearInterval(iv);
        fadeTimer = setTimeout(onComplete, fadeMs);
      }
    }, tickMs);

    return () => {
      clearInterval(iv);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
    // onComplete + timing constants treated as mount-time constants.
    // Consumer MUST stabilize onComplete with useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skip: clear running sequence and fire onComplete immediately.
  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: Z.FULLSCREEN,
        gap: "0.6rem",
        opacity: fadeOut ? 0 : 1,
        transition: `opacity ${fadeMs}ms ease-out`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.2rem",
          color: "#ccc",
          letterSpacing: "0.15em",
          textShadow: "0 0 8px rgba(255,255,255,0.3)",
          minHeight: "1.6em",
        }}
      >
        {d1}
        {d1.length > 0 && d1.length < line1.length && (
          <span style={{ opacity: 0.7 }}>_</span>
        )}
      </div>

      {d2.length > 0 && (
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.2rem",
            color: "var(--accent, #cc7000)",
            letterSpacing: "0.15em",
            textShadow: "0 0 10px rgba(204,112,0,0.5)",
            minHeight: "1.6em",
          }}
        >
          {d2}
          {d2.length < line2.length && (
            <span style={{ opacity: 0.7 }}>_</span>
          )}
        </div>
      )}

      {showSkip && !fadeOut && (
        <button
          className="btn btn--ghost btn--sm godot-skip-btn"
          style={{ pointerEvents: "auto" }}
          onClick={handleSkip}
        >
          Skip
        </button>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
