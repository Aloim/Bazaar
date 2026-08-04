// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * DockingText — Typewriter loading message rendered during Godot canvas load.
 *
 * Timing extracted from Bazar1 GodotGameWrapper.tsx lines 99–127:
 *   - 300ms pre-typewriter delay (line 108)
 *   - 40ms per-character interval (line 113)
 *   - Text: "Docking Procedure commencing... One moment." (line 102)
 *
 * Belongs to @bazaar/shared — zero app-specific imports (Constitution I.3).
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useEffect } from "react";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DockingTextProps {
  /** Override the default docking message. Default: Bazar1's exact string. */
  text?: string;
  /** Pre-typewriter delay in ms. Default: 300 (Bazar1 line 108). */
  startDelayMs?: number;
  /** Per-character interval in ms. Default: 40 (Bazar1 line 113). */
  charIntervalMs?: number;
  /** Additional className for the root span. */
  className?: string;
  /** Fires once when the last character has been displayed. */
  onComplete?: () => void;
}

const DEFAULT_TEXT = "Docking Procedure commencing... One moment.";
const DEFAULT_START_DELAY_MS = 300;
const DEFAULT_CHAR_INTERVAL_MS = 40;

// ── Component ─────────────────────────────────────────────────────────────────

export default function DockingText({
  text = DEFAULT_TEXT,
  startDelayMs = DEFAULT_START_DELAY_MS,
  charIntervalMs = DEFAULT_CHAR_INTERVAL_MS,
  className,
  onComplete,
}: DockingTextProps) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    let idx = 0;
    let iv: ReturnType<typeof setInterval> | null = null;

    const delay = setTimeout(() => {
      iv = setInterval(() => {
        idx++;
        setDisplayed(text.slice(0, idx));
        if (idx >= text.length) {
          if (iv) clearInterval(iv);
          iv = null;
          onComplete?.();
        }
      }, charIntervalMs);
    }, startDelayMs);

    return () => {
      clearTimeout(delay);
      if (iv) clearInterval(iv);
    };
    // onComplete intentionally excluded from deps — consumer MUST stabilize with useCallback.
    // text, startDelayMs, charIntervalMs are treated as mount-time constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typing = displayed.length < text.length;

  return (
    <span className={`godot-loading-overlay__text${className ? ` ${className}` : ""}`}>
      {displayed}
      {typing && <span style={{ opacity: 0.7 }}>_</span>}
    </span>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
