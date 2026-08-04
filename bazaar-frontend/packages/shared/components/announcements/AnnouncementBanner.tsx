// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — top-of-page announcement banner.
 *
 * Consumes `DAppAnnouncementsContext` and renders each currently-visible
 * announcement (`show_from_ms <= now <= show_until_ms`) as a stacked banner.
 *
 *   - Info (tier=0): blue tint, dismissible per-id via localStorage flag
 *     `bazaar-announcement-dismissed-{id}` (persisted; re-show only when
 *     admin posts a fresh row).
 *   - Warning (tier=1): red/orange tint, NOT dismissible.
 *
 * Mount in every `App.tsx` as the first child of the root layout (above
 * `<WalletBar />`). In the bazaar apps the proactive full-screen
 * `<CeremonyLockOverlay />` is the prominent Warning surface; this banner is
 * the lightweight reminder strip (and the only Warning surface in DappHub,
 * which is exempt from the lock).
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import { useEffect, useMemo, useState } from "react";
import { useDAppAnnouncementsContext } from "../../contexts/DAppAnnouncementsContext";
import type { Announcement } from "../../types/announcement";

const DISMISS_KEY_PREFIX = "bazaar-announcement-dismissed-";

export interface AnnouncementBannerProps {
  /** Retained for back-compat with the DappHub mount; no longer alters render
   *  (the explanatory subtitle was removed). */
  isDAppHub?: boolean;
}

function isDismissed(id: number): boolean {
  try {
    return localStorage.getItem(`${DISMISS_KEY_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

function markDismissed(id: number): void {
  try {
    localStorage.setItem(`${DISMISS_KEY_PREFIX}${id}`, "1");
  } catch {
    /* ignore quota / private-browsing rejection */
  }
}

function isVisibleNow(a: Announcement, now: number): boolean {
  return a.showFromMs <= now && now <= a.showUntilMs;
}

const ROW_BASE: React.CSSProperties = {
  padding: "0.55rem 1rem",
  display: "flex",
  alignItems: "flex-start",
  gap: "0.85rem",
  fontFamily: "monospace",
  fontSize: "0.85rem",
  borderBottom: "1px solid currentColor",
  width: "100%",
  boxSizing: "border-box",
};

const TIER_INFO_STYLE: React.CSSProperties = {
  background: "rgba(74, 158, 222, 0.08)",
  borderBottom: "1px solid rgba(74, 158, 222, 0.4)",
  color: "#9bccef",
};

const TIER_WARNING_STYLE: React.CSSProperties = {
  background: "rgba(255, 100, 60, 0.12)",
  borderBottom: "1px solid rgba(255, 100, 60, 0.6)",
  color: "#ffb09a",
};

const ICON_STYLE: React.CSSProperties = {
  fontSize: "1.1rem",
  lineHeight: "1.2",
  flexShrink: 0,
};

const BODY_STYLE: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
};

const TITLE_STYLE: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "0.9rem",
};

const DISMISS_BTN_STYLE: React.CSSProperties = {
  background: "transparent",
  border: "1px solid currentColor",
  color: "currentColor",
  padding: "0.1rem 0.45rem",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: "0.75rem",
  flexShrink: 0,
};

export function AnnouncementBanner(_props: AnnouncementBannerProps = {}) {
  const { announcements } = useDAppAnnouncementsContext();
  const [dismissTick, setDismissTick] = useState(0);

  // Recompute visibility on every poll cadence (provider state-change triggers
  // re-render) AND every 30s wall-clock so a show_until_ms boundary tick
  // doesn't leave a stale banner up.
  const [, setWallTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setWallTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const visible = useMemo(() => {
    const now = Date.now();
    return announcements
      .filter((a) => isVisibleNow(a, now))
      .filter((a) => !(a.tier === 0 && isDismissed(a.id)));
    // dismissTick is referenced to force recompute after a dismiss click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements, dismissTick]);

  if (visible.length === 0) return null;

  return (
    <div role="status" aria-live="polite" data-testid="announcement-banner">
      {visible.map((a) => {
        const tierStyle = a.tier === 1 ? TIER_WARNING_STYLE : TIER_INFO_STYLE;
        const isWarning = a.tier === 1;
        const icon = isWarning ? "⚠" : "ℹ";
        return (
          <div key={a.id} style={{ ...ROW_BASE, ...tierStyle }}>
            <span style={ICON_STYLE} aria-hidden="true">{icon}</span>
            <div style={BODY_STYLE}>
              <div style={TITLE_STYLE}>{a.title}</div>
              <div>{a.body}</div>
            </div>
            {!isWarning && (
              <button
                style={DISMISS_BTN_STYLE}
                onClick={() => {
                  markDismissed(a.id);
                  setDismissTick((t) => t + 1);
                }}
                aria-label="Dismiss announcement"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default AnnouncementBanner;

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
