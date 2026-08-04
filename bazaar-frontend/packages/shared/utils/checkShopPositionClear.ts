// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// EconomyFixplan Phase 8 — pre-flight Chebyshev exclusion-zone check.
// Mirrors Move-side bazaar_core::bazar_position::assert_shop_position_clear.
// EXCLUSION_ZONE_RADIUS = 3 — two shops must be at Chebyshev distance >= 3 on the same SSU.

export interface ShopPos {
  positionX: number;
  positionY: number;
  isActive: boolean;
}

export const EXCLUSION_ZONE_RADIUS = 3;

/**
 * Returns null if placement at playerPos is clear of all active shops on the SSU,
 * or a user-friendly error string otherwise. Pre-V10 shops parsed from Sui may not
 * carry positionX/Y yet — we treat undefined as 0 (matches Move-side defensive read
 * for the migration window).
 */
export function checkShopPositionClear(
  playerPos: { x: number; y: number } | null | undefined,
  activeShopsOnSsu: ShopPos[],
  exclusionRadius: number = EXCLUSION_ZONE_RADIUS,
): string | null {
  if (!playerPos) {
    return "Player position not available yet — wait a moment and retry.";
  }
  if (playerPos.x === 0 && playerPos.y === 0) {
    return "Player position not available yet — wait a moment and retry.";
  }
  for (const s of activeShopsOnSsu) {
    if (!s.isActive) continue;
    const dx = Math.abs(playerPos.x - (s.positionX ?? 0));
    const dy = Math.abs(playerPos.y - (s.positionY ?? 0));
    const cheb = Math.max(dx, dy);
    if (cheb < exclusionRadius) {
      return "There is already a shop within 2 units of this position — move your character and try again.";
    }
  }
  return null;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
