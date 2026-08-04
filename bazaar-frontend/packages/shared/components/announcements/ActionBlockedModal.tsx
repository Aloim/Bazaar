// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — ActionBlockedModal.
 *
 * Renders via `createPortal` to `document.body` so it sits above the Godot
 * canvas and every other UI surface. Opens when `useGatedTransaction.executeGated`
 * has thrown `ActionBlockedError` (the hook calls `signalBlocked` to set
 * `blockedWarning` on the DAppAnnouncementsContext). Auto-closes when the
 * underlying Warning is cleared on chain (the context resets `blockedWarning`
 * to null on the next poll).
 *
 * No close X. Backdrop clicks do NOT dismiss. Single "Refresh status" button
 * triggers `useDAppAnnouncements.refetch()` — if admin has since cleared the
 * Warning, the modal unmounts on the next poll tick.
 *
 * Mounted in 3 bazaar apps (NoTribe / Easy / Advanced) only. DappHub omits
 * this mount — admin needs DappHub functional during the ceremony.
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import type React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDAppAnnouncementsContext } from "../../contexts/DAppAnnouncementsContext";
import { Z } from "../../constants/zIndex";

const BACKDROP_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.6)",
  zIndex: Z.GATE,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "monospace",
};

const MODAL_STYLE: React.CSSProperties = {
  background: "#15191e",
  border: "1px solid rgba(255, 100, 60, 0.6)",
  color: "#e8e8e8",
  padding: "1.25rem 1.5rem",
  maxWidth: "520px",
  width: "90%",
  boxShadow: "0 0 24px rgba(255, 100, 60, 0.25)",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  color: "#ffb09a",
  fontWeight: 600,
  fontSize: "1rem",
};

const TITLE_STYLE: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "0.95rem",
  color: "#ffb09a",
};

const BODY_STYLE: React.CSSProperties = {
  fontSize: "0.85rem",
  lineHeight: 1.4,
};

const META_STYLE: React.CSSProperties = {
  fontSize: "0.75rem",
  opacity: 0.7,
  fontStyle: "italic",
};

const BUTTON_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
};

const REFRESH_BTN_STYLE: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255, 100, 60, 0.6)",
  color: "#ffb09a",
  padding: "0.35rem 0.85rem",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: "0.8rem",
};

function humanizeMsFromNow(targetMs: number): string {
  const deltaMs = targetMs - Date.now();
  if (deltaMs <= 0) return "imminent — refresh to confirm";
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "in less than a minute";
  if (minutes < 60) return `in ~${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ~${hours} h`;
  const days = Math.round(hours / 24);
  return `in ~${days} d`;
}

export function ActionBlockedModal() {
  const { blockedWarning, refetch } = useDAppAnnouncementsContext();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Throttle wall-clock human label so "in ~35 min" updates as time passes.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!blockedWarning) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [blockedWarning]);

  if (!blockedWarning) return null;

  const handleRefresh = () => {
    setIsRefreshing(true);
    try {
      refetch();
    } finally {
      // refetch is synchronous-side-effect (bumps a tick); finish state on next macrotask.
      window.setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const node = (
    <div style={BACKDROP_STYLE} data-testid="action-blocked-modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="action-blocked-title" style={MODAL_STYLE}>
        <div id="action-blocked-title" style={HEADER_STYLE}>
          <span aria-hidden="true">⚠</span>
          <span>Bazaar actions temporarily disabled</span>
        </div>
        <div style={TITLE_STYLE}>{blockedWarning.title}</div>
        <div style={BODY_STYLE}>{blockedWarning.body}</div>
        <div style={META_STYLE}>
          Estimated resume: {humanizeMsFromNow(blockedWarning.showUntilMs)}
        </div>
        <div style={BUTTON_ROW_STYLE}>
          <button
            style={REFRESH_BTN_STYLE}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing…" : "Refresh status"}
          </button>
        </div>
      </div>
    </div>
  );

  // SSR-safe portal target lookup.
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

export default ActionBlockedModal;

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
