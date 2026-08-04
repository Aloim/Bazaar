// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * shopTier.ts — Bazaar-type-aware shop visibility tiers.
 *
 * Classifies every shop RELATIVE to the current app's SSU context into one of
 * three tiers, each with a colour. Same shop → different tier when viewed from a
 * different SSU, so each bazaar app colours independently.
 *
 *   OWN   (yellow/orange) — shop.ssuId === current SSU. Listed first.
 *   TRIBE (blue)          — current=NoTribe → any NoTribe shop (NoTribe has no
 *                           tribe network, so the whole NoTribe set IS the tribe);
 *                           current=Easy/Advanced → shop.tribeId === current tribe.
 *   OTHER (red)           — everything else.
 *
 * Pure module (type-only import) so it is trivially unit-testable and carries no
 * runtime deps. Consumed by the shop filter (Phase 1), Godot beacon colouring
 * (Phase 2), and the global inventory view (Phase 4).
 */

import type { BazaarTypeName } from "../hooks/useBazaarType";

export type ShopTier = "own" | "tribe" | "other";

/** On-chain bazaar_type u8 for NoTribe (mirrors BAZAAR_TYPE_NUM.NOTRIBE). */
export const BAZAAR_TYPE_NOTRIBE = 0;

/** The current app's SSU context, against which shops are classified. */
export interface ShopTierContext {
  /** The current SSU object id (SSU_OBJECT_ID). */
  currentSsuId:      string;
  /** Resolved bazaar type of the current SSU, or null while loading/unregistered. */
  currentBazaarType: BazaarTypeName | null;
  /** Numeric tribe id of the current SSU (0/null for NoTribe). */
  currentTribeId:    number | null;
}

/** Minimal structural shape a shop must expose to be classified. Both the
 *  bazaarcore and bazar1 `Shop` types satisfy this, so callers can pass either. */
export interface ShopTierInput {
  ssuId:       string;
  bazaarType?: number;
  tribeId?:    number;
}

/**
 * Classify a shop into a visibility tier relative to the current SSU context.
 * OWN takes precedence over TRIBE; anything unmatched is OTHER.
 */
export function classifyShopTier(shop: ShopTierInput, ctx: ShopTierContext): ShopTier {
  // OWN — same SSU as the current app instance.
  if (ctx.currentSsuId && shop.ssuId && shop.ssuId === ctx.currentSsuId) {
    return "own";
  }

  // TRIBE — bazaar-type-dependent.
  if (ctx.currentBazaarType === "NoTribe") {
    // NoTribe has no tribe network: the whole NoTribe shop set is the "tribe".
    if (shop.bazaarType === BAZAAR_TYPE_NOTRIBE) return "tribe";
  } else if (ctx.currentBazaarType === "Easy" || ctx.currentBazaarType === "Advanced") {
    // Easy/Advanced: only shops belonging to the SAME tribe.
    if (
      ctx.currentTribeId != null && ctx.currentTribeId !== 0 &&
      shop.tribeId != null && shop.tribeId === ctx.currentTribeId
    ) {
      return "tribe";
    }
  }

  // OTHER — everything else.
  return "other";
}

/** Tier display order (own first). */
export const TIER_ORDER: ShopTier[] = ["own", "tribe", "other"];

/** Tier → colour. OWN reuses the existing warm beacon hue. */
export const TIER_COLOR: Record<ShopTier, string> = {
  own:   "#e0a64b", // amber/orange — your SSU
  tribe: "#4a8fd4", // blue — tribe network
  other: "#cc4b4b", // red — every other bazaar
};

/** Tier → short label for the Shop Filter UI. */
export const TIER_LABEL: Record<ShopTier, string> = {
  own:   "My SSU",
  tribe: "Tribe",
  other: "All others",
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
