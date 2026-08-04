// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — CeremonyLockOverlay.
 *
 * A full-screen, input-blocking lock layer rendered ABOVE the Godot canvas and
 * every React surface (via `createPortal` to `document.body` with a near-max
 * z-index). It mounts whenever a Warning announcement is currently active
 * (`useDAppActionsEnabled().blockingWarning != null`) — NOT only when a gated
 * transaction is attempted (that is `<ActionBlockedModal />`'s job).
 *
 * Why a separate proactive layer:
 *   - The top-of-page `<AnnouncementBanner />` renders BEHIND the Godot canvas
 *     (the canvas is a full-viewport absolutely-positioned surface), so the
 *     ceremony notice was effectively invisible in the bazaar apps.
 *   - During the ceremony every mutating bazaar action is blocked on chain
 *     (Warning gate). This overlay makes that visible AND captures all pointer
 *     / keyboard input so the player physically cannot interact with the frozen
 *     world beneath — input in the bazaar is rendered invalid for the duration.
 *
 * DappHub-EXEMPT: this component imports `useDAppActionsEnabled` and is mounted
 * ONLY in the 3 bazaar apps (NoTribe / Easy / Advanced). DappHub must stay
 * functional so admin can drive the ceremony — see the vitest static grep at
 * `packages/shared/__tests__/dapphub-exempt.test.ts`.
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import type React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDAppActionsEnabled } from "../../hooks/announcements/useDAppActionsEnabled";
import { Z } from "../../constants/zIndex";

// Near-max z-index (Z.LOCK, 2e9) so the lock sits above EVERY other surface on
// the documented scale, toasts included — UpdateCeremony invariant, do not lower.
const LOCK_Z_INDEX = Z.LOCK;

const BACKDROP_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: LOCK_Z_INDEX,
  background:
    "radial-gradient(circle at 50% 40%, rgba(40, 16, 4, 0.82), rgba(4, 3, 2, 0.96))",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
  boxSizing: "border-box",
  fontFamily: "monospace",
  // Capture EVERY pointer + wheel event so the world beneath is uninteractable.
  pointerEvents: "auto",
};

const PANEL_STYLE: React.CSSProperties = {
  position: "relative",
  maxWidth: "640px",
  width: "100%",
  background: "rgba(18, 12, 8, 0.97)",
  border: "2px solid rgba(255, 110, 60, 0.85)",
  boxShadow:
    "0 0 0 1px rgba(255, 110, 60, 0.25), 0 0 48px rgba(255, 90, 40, 0.45), inset 0 0 32px rgba(255, 90, 40, 0.08)",
  borderRadius: "10px",
  padding: "2rem 2.25rem 2.25rem",
  textAlign: "center",
  color: "#ffe3d6",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "1rem",
};

const ICON_STYLE: React.CSSProperties = {
  fontSize: "3.2rem",
  lineHeight: 1,
  filter: "drop-shadow(0 0 12px rgba(255, 120, 60, 0.7))",
};

const KICKER_STYLE: React.CSSProperties = {
  fontSize: "0.75rem",
  letterSpacing: "0.35em",
  textTransform: "uppercase",
  color: "#ff9a78",
  opacity: 0.9,
};

const TITLE_STYLE: React.CSSProperties = {
  fontSize: "1.7rem",
  fontWeight: 700,
  lineHeight: 1.2,
  color: "#ffb79f",
  textShadow: "0 0 18px rgba(255, 90, 40, 0.5)",
  margin: 0,
};

const BODY_STYLE: React.CSSProperties = {
  fontSize: "1rem",
  lineHeight: 1.5,
  color: "#f2d8cc",
  maxWidth: "52ch",
};

const META_STYLE: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "#ffc6b0",
  opacity: 0.85,
};

const NOTE_STYLE: React.CSSProperties = {
  marginTop: "0.35rem",
  fontSize: "0.8rem",
  fontStyle: "italic",
  opacity: 0.7,
  color: "#f0d2c6",
};

function humanizeMsFromNow(targetMs: number): string {
  const deltaMs = targetMs - Date.now();
  if (deltaMs <= 0) return "any moment now";
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "in less than a minute";
  if (minutes < 60) return `in ~${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ~${hours} h`;
  const days = Math.round(hours / 24);
  return `in ~${days} d`;
}

export function CeremonyLockOverlay() {
  const { blockingWarning } = useDAppActionsEnabled();

  // Re-render every 30s so the "resumes ~X min" label stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!blockingWarning) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [blockingWarning]);

  // Block page scroll while the lock is up.
  useEffect(() => {
    if (!blockingWarning) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [blockingWarning]);

  if (!blockingWarning) return null;
  if (typeof document === "undefined") return null;

  const node = (
    <div
      style={BACKDROP_STYLE}
      data-testid="ceremony-lock-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ceremony-lock-title"
      // Swallow keydown so hotkeys / movement keys don't reach Godot beneath.
      onKeyDown={(e) => e.stopPropagation()}
      tabIndex={-1}
    >
      <div style={PANEL_STYLE}>
        <span style={ICON_STYLE} aria-hidden="true">⚠</span>
        <div style={KICKER_STYLE}>Bazaar Locked</div>
        <h1 id="ceremony-lock-title" style={TITLE_STYLE}>{blockingWarning.title}</h1>
        <div style={BODY_STYLE}>{blockingWarning.body}</div>
        <div style={META_STYLE}>
          Estimated to resume {humanizeMsFromNow(blockingWarning.showUntilMs)}.
        </div>
        <div style={NOTE_STYLE}>
          The bazaar will unlock automatically once the update completes — no action needed.
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

export default CeremonyLockOverlay;

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
