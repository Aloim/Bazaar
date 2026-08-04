// bazaar-frontend | TX builder for the paginated depreciated-shop EVE refund and delist entry
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V41 SSU depreciation — Phase B shop-prune TX builder.
 * Move: bazaar_shop_ops::ssu_depreciation_ops::prune_depreciated_shops_page.
 * PERMISSIONLESS (gated on gov.is_depreciated, not a cap) — mirrors
 * bazar_admin_drain's pagination convention (page <= 100 shop_ids).
 *
 * Documentation/plans/implementation/ssu-depreciation-prune-plan.md §2.3.
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, SHARED_OBJECTS, SUI_CLOCK_ID } from "../../constants";

export interface PruneDepreciatedShopsPageParams {
  ssuGovId: string;
  wtbEscrowPoolId: string;
  bazarRegistryId?: string;
  /** Page of shop ids belonging to ssuGovId's SSU (<=100). */
  shopIds: string[];
}

/**
 * Move: bazaar_shop_ops::ssu_depreciation_ops::prune_depreciated_shops_page(
 *   registry, gov, pool, shop_ids, cap_store, clock, ctx).
 * Aborts E_NOT_DEPRECIATED(1) if the certificate has not been set yet;
 * E_SHOP_WRONG_SSU(2) on a caller-composed-page bug; E_PAGINATION_ZERO(3) /
 * E_BATCH_TOO_LARGE(4) on the page bound; E_POOL_WRONG_SSU(5) if `pool` does not
 * belong to this SSU. Per-row idempotent (already-inactive / absent shops skip).
 */
export function buildPruneDepreciatedShopsPage(
  params: PruneDepreciatedShopsPageParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SSU_DEPRECIATION_OPS}::prune_depreciated_shops_page`,
    arguments: [
      tx.object(params.bazarRegistryId ?? SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.object(params.ssuGovId),
      tx.object(params.wtbEscrowPoolId),
      tx.pure.vector("address", params.shopIds),
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
