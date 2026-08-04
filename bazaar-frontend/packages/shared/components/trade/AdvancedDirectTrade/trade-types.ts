// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V26 D6 — Advanced DirectTrade shared types.
 *
 * Currency-only in v1: EVE + tribe-token. Item exchange is queued for V27.
 */

export type AdvancedTab = "create" | "requests";

/** Form-side draft type for the Create tab. All EVE amounts in MIST (bigint),
 *  all token amounts in display units (string for parse via parseTribeAmount). */
export interface AdvancedTradeDraft {
  receiver: string;
  offerEveMist: bigint;
  offerTokensDisplay: string;
  requestEveMist: bigint;
  requestTokensDisplay: string;
  expiryHours: number;     // converted to expiryMs at submit
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
