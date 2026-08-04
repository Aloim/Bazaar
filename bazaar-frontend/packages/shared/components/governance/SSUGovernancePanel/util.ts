// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * SSUGovernancePanel shared utilities — R6.6.4b OS-32
 *
 * Pure utility: type aliases, formatters. No React/hook imports.
 * Verbatim from Bazar1 SSUGovernancePanel.tsx lines 56, 2053-2055,
 * plus new type aliases for the 10-file split.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

// ── Tab key type aliases (shared across sibling files) ────────────────────────

/** Main tab keys for SSUGovernancePanel. */
export type SSUGovTab = "moderation" | "admin" | "superadmin" | "owner";

/** Sub-tab keys for the Owner cluster. */
export type OwnerSubTab = "info" | "bazarauth" | "wtbpool";

/** Sub-tab keys for the SuperAdmin cluster. */
export type SASubTab = "taxes" | "caps" | "wallets" | "currencylog" | "itemlog";

/** Sub-tab keys for the Moderation cluster. */
export type ModSubTab = "shops" | "bans";

// ── Formatters ────────────────────────────────────────────────────────────────

/**
 * Format a raw bigint (tribe ID) as a decimal string.
 * Verbatim from Bazar1 SSUGovernancePanel.tsx:2053-2055.
 */
export function formatTribe(raw: bigint): string {
  return raw.toString(10);
}

/**
 * Abbreviate a 0x-prefixed address for display.
 * Shows first 6 + last 4 characters.
 */
export function formatAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
