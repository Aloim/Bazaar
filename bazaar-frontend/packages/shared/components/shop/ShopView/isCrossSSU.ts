// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/ShopView.tsx (lines 8-11; split for 500-line guard, section: isCrossSSU utility).
// Re-imported into ./index.tsx.

import type { Shop } from "@bazaar/shared/types";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";

/** True when the shop's items are stored at a different SSU than the current one. */
export function isCrossSSU(shop: Shop): boolean {
  return !!(shop.ssuId && SSU_OBJECT_ID && shop.ssuId !== SSU_OBJECT_ID);
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
