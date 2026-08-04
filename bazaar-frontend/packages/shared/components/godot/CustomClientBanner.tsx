// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/components/godot/CustomClientBanner — 6-state status banner.
 *
 * State matrix (Q9 compliance — copy strings are STATIC LITERALS, zero URL interpolation):
 *
 *   default        → null (hidden, zero visual regression in stub era)
 *   ssu            → orange, "This bazaar uses a custom client. Set by SSU owner."
 *   tribe          → orange, "This bazaar uses a custom client. Set by tribe leader."
 *   dev-override   → red,    "Developer override active for this SSU. Affects only your browser."
 *                            + "Clear override" button
 *   failover       → yellow, "Custom client unreachable — using default client instead."
 *                            + "Retry" button
 *   pending-update → blue,   "Bazaar client updated. Reload to apply."
 *                            + "Reload" button + "Dismiss" button
 *                            (takes priority over source when hasPendingUpdate is true)
 *
 * Styles injected inline (one TSX file keeps diff scoped per OQ-FA-1 default).
 * Bazar1 palette conventions: --accent orange, --warn yellow, --err red, blue custom.
 *
 * Phase: AP2-E / FP1-30
 * File limit: 500 lines | Constitution Article XIV.4
 */

import React from "react";
import type { ResolvedSource } from "../../godot/url-resolver";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CustomClientBannerProps {
  /** Resolved source from resolveGodotUrl. "default" renders nothing. */
  source: ResolvedSource;
  /** When true, banner shows "pending-update" state (takes priority over source). */
  hasPendingUpdate?: boolean;
  /** Invoked when user clicks Retry (source === "failover"). */
  onRetry?: () => void;
  /** Invoked when user clicks Clear override (source === "dev-override"). */
  onClearOverride?: () => void;
  /** Invoked when user clicks Reload (hasPendingUpdate). window.location.reload() caller. */
  onReload?: () => void;
  /** Invoked when user clicks Dismiss (hasPendingUpdate). */
  onDismissPending?: () => void;
}

// ── Inline styles ─────────────────────────────────────────────────────────────

const BANNER_BASE: React.CSSProperties = {
  padding: "0.4rem 1rem",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "1rem",
  fontFamily: "monospace",
  fontSize: "0.85rem",
  borderBottom: "1px solid currentColor",
  width: "100%",
  boxSizing: "border-box",
};

const COLOR_STYLES: Record<string, React.CSSProperties> = {
  orange: { background: "rgba(204,112,0,0.15)", color: "#cc7000" },
  red:    { background: "rgba(200,60,60,0.18)",  color: "#e55555" },
  yellow: { background: "rgba(220,180,40,0.18)", color: "#dccc33" },
  blue:   { background: "rgba(40,120,220,0.18)", color: "#4af" },
};

const BTN_STYLE: React.CSSProperties = {
  background: "transparent",
  border: "1px solid currentColor",
  color: "currentColor",
  padding: "0.15rem 0.6rem",
  fontFamily: "monospace",
  fontSize: "0.75rem",
  cursor: "pointer",
};

// ── Config table ──────────────────────────────────────────────────────────────

interface BannerConfig {
  colorKey: string;
  copy: string;
}

// Q9 compliance: ALL copy values are static literals. No template interpolation.
const SOURCE_CONFIG: Record<Exclude<ResolvedSource, "default">, BannerConfig> = {
  ssu: {
    colorKey: "orange",
    copy: "This bazaar uses a custom client. Set by SSU owner.",
  },
  tribe: {
    colorKey: "orange",
    copy: "This bazaar uses a custom client. Set by tribe leader.",
  },
  "dev-override": {
    colorKey: "red",
    copy: "Developer override active for this SSU. Affects only your browser.",
  },
  failover: {
    colorKey: "yellow",
    copy: "Custom client unreachable — using default client instead.",
  },
};

const PENDING_CONFIG: BannerConfig = {
  colorKey: "blue",
  copy: "Bazaar client updated. Reload to apply.",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function CustomClientBanner({
  source,
  hasPendingUpdate = false,
  onRetry,
  onClearOverride,
  onReload,
  onDismissPending,
}: CustomClientBannerProps) {
  // "default" source with no pending update → render nothing.
  if (source === "default" && !hasPendingUpdate) return null;

  // pending-update takes priority over current source (SDC-030-01 absorbed into banner).
  if (hasPendingUpdate) {
    const style = { ...BANNER_BASE, ...COLOR_STYLES[PENDING_CONFIG.colorKey] };
    return (
      <div style={style} role="status" aria-live="polite">
        <span>{PENDING_CONFIG.copy}</span>
        {onReload && (
          <button style={BTN_STYLE} onClick={onReload}>
            Reload
          </button>
        )}
        {onDismissPending && (
          <button style={BTN_STYLE} onClick={onDismissPending}>
            Dismiss
          </button>
        )}
      </div>
    );
  }

  // source is not "default" here (guarded above).
  const config = SOURCE_CONFIG[source as Exclude<ResolvedSource, "default">];
  const style = { ...BANNER_BASE, ...COLOR_STYLES[config.colorKey] };

  return (
    <div style={style} role="status" aria-live="polite">
      <span>{config.copy}</span>
      {source === "dev-override" && onClearOverride && (
        <button style={BTN_STYLE} onClick={onClearOverride}>
          Clear override
        </button>
      )}
      {source === "failover" && onRetry && (
        <button style={BTN_STYLE} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
