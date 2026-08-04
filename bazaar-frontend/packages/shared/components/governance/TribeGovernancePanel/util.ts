// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeGovernancePanel — shared type aliases and formatters.
 * Pure utility: no React, no hook imports, no side-effects.
 *
 * R6.6.4c — OS-33 (TribeGovernancePanel port)
 */

// ── Main tab discriminant ──────────────────────────────────────────────────────

export type TribeGovTab = "moderation" | "admin" | "superadmin" | "owner";

// ── Moderation sub-tab discriminant ───────────────────────────────────────────

export type TribeModSubTab = "shops" | "bans";

// ── SuperAdmin sub-tab discriminant ───────────────────────────────────────────

export type TribeSASubTab =
  | "taxes"
  | "widgets"
  | "assets"
  | "storage"
  | "txlog"
  | "vault"
  | "tribe-settings"
  | "accessibility"
  | "caps-revocation";

// ── Formatters ────────────────────────────────────────────────────────────────

/** Format a basis-points value as a human-readable percentage string. */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
