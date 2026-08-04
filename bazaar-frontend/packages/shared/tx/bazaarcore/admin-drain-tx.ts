// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — BazaarCore admin TX builders.
 *
 * Targets the 4 DAppOwnerCap-gated drain entries on `bazaar_core`:
 *   - `bazar_admin_drain::close_all_shops_batch` (Phase B entry 1)
 *   - `wtb_escrow_pool::refund_wtb_escrow_pool_batch` (Phase B entry 2)
 *   - `trade::cancel_trade_proposals_batch` (Phase B entry 3)
 *   - `ssu_admin_drain::drain_ssu_eve` (Variant B per-SSU)
 *
 * All take `vector<ID>` page args; FE paginates in MAX_BATCH_ROWS=100 chunks.
 * BatchDrainSummary is emitted once per call.
 *
 * File limit: 500 lines | Constitution Article XIV.4 (exempt under UpdateCeremonyPlan).
 */

import { Transaction } from "@mysten/sui/transactions";
import {
  PACKAGE_IDS,
  MODULES,
  SHARED_OBJECTS,
  SUI_CLOCK_ID,
} from "@bazaar/shared/constants";

// ─── close_all_shops_batch ───────────────────────────────────────────────────

/**
 * Force-close every shop in `shopIds` belonging to the SSU identified by
 * `ssuGovId`. Reuses `shop_moderation::force_close_shop_internal` per row —
 * SSU-owner-owned shops are pre-skipped (the primitive aborts on them).
 *
 * Move: bazaar_core::bazar_admin_drain::close_all_shops_batch
 */
export function buildCloseAllShopsBatch(
  params: {
    ownerCapId: string;
    bazarRegistryId?: string;
    ssuGovId: string;
    ssuId: string;                  // StorageUnit shared object ID
    recipientCharacterId: string;   // Character object (the owner of every shop in shopIds)
    wtbEscrowPoolId: string;
    shopIds: string[];
    /** When true (ceremony drain), SSU-owner-owned shops are NOT skipped; their
     *  items route to the owner's Player Locker. The recipientCharacter MUST be
     *  the owner of every shop in shopIds (Move asserts recipient == owner). */
    allowSsuOwner?: boolean;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    // V38 split: bazar_admin_drain moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.BAZAR_ADMIN_DRAIN}::close_all_shops_batch`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.bazarRegistryId ?? SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.object(params.ssuGovId),
      tx.object(params.ssuId),
      tx.object(params.recipientCharacterId),
      tx.object(params.wtbEscrowPoolId),
      tx.pure.vector("address", params.shopIds),
      tx.pure.bool(params.allowSsuOwner ?? false),
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (after allow_ssu_owner, before clock)
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── refund_wtb_escrow_pool_batch ────────────────────────────────────────────

/**
 * Drain WTB escrow pool deposits to their originating shop owners. Idempotent:
 * silent skip on ids not present in pool or absent from BazarRegistry.
 *
 * Move: bazaar_core::wtb_escrow_pool::refund_wtb_escrow_pool_batch
 */
export function buildRefundWtbEscrowPoolBatch(
  params: {
    ownerCapId: string;
    wtbEscrowPoolId: string;
    bazarRegistryId?: string;
    shopIds: string[];
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.WTB_ESCROW_POOL}::refund_wtb_escrow_pool_batch`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.wtbEscrowPoolId),
      tx.object(params.bazarRegistryId ?? SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.pure.vector("address", params.shopIds),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── cancel_trade_proposals_batch ────────────────────────────────────────────

/**
 * Admin cancels every still-PENDING DirectTrade proposal in `proposalIds`.
 * Refunds proposer EVE escrow + emits TradeCancelled per row.
 *
 * Move: bazaar_mission::trade::cancel_trade_proposals_batch (V35 split)
 */
export function buildCancelTradeProposalsBatch(
  params: {
    ownerCapId: string;
    tradeRegistryId?: string;
    proposalIds: string[];
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.TRADE}::cancel_trade_proposals_batch`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.tradeRegistryId ?? SHARED_OBJECTS.TRADE_REGISTRY),
      tx.pure.vector("address", params.proposalIds),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── drain_ssu_eve (Variant B per-SSU emergency) ─────────────────────────────

/**
 * Variant B emergency — drain the SSUGovernance.tax_wallet to `recipient`.
 * One call per SSU; FE auto-iterates SSUs. Emits EmergencySSUEveDrained
 * unconditionally (even at zero balance) for audit.
 *
 * Move: bazaar_core::ssu_admin_drain::drain_ssu_eve
 */
export function buildDrainSsuEve(
  params: {
    ownerCapId: string;
    ssuGovId: string;
    recipient: string;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_ADMIN_DRAIN}::drain_ssu_eve`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.pure.address(params.recipient),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
