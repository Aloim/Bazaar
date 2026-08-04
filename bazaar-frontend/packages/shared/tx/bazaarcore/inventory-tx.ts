// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore inventory TX builders — buildBatchClaimUnclaimed, buildFreeClaim, buildWithdrawItems.
 *
 * NOTE: buildClaimUnclaimedItem was removed (APM-FP2-C-06). The canonical single-claim
 * builder lives in tx/claims.ts and is re-exported from tx/index.ts directly.
 *
 * G-17 resolution: buildBatchClaimUnclaimed uses PTB multi-call pattern (no Move batch function).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, SHARED_OBJECTS, v36Enabled } from "../../constants";

// NOTE: buildClaimUnclaimedItem removed — canonical version lives in tx/claims.ts
// (APM-FP2-C-06 fix: eliminated duplicate export that caused TS collision).

// ── buildBatchClaimUnclaimed ───────────────────────────────────────────────────

/**
 * Claim multiple unclaimed items in a single PTB.
 * Move: Calls claim_unclaimed_item N times within one PTB (G-17 PTB workaround).
 * No batch Move function exists — each shopId gets its own moveCall in the same Transaction.
 *
 * userStorageId — shared UserStorage object for the SSU.
 * shopIds       — array of shopId keys from UnclaimedItem records to claim.
 */
export function buildBatchClaimUnclaimed(params: {
  userStorageId: string;
  shopIds: string[];
}): Transaction {
  const tx = new Transaction();
  for (const shopId of params.shopIds) {
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.USER_STORAGE}::claim_unclaimed_item`,
      arguments: [
        tx.object(params.userStorageId),
        tx.pure.id(shopId),
        tx.object("0x6"),
      ],
    });
  }
  return tx;
}

// ── buildFreeClaim ─────────────────────────────────────────────────────────────

/**
 * Claim free items from a Free shop listing (no payment required).
 * Move: bazaar_core::shop_ops_de::free_claim
 * Sig: (registry: &mut BazarRegistry, shop_id: ID, listing_idx: u64, quantity: u64,
 *        gov: &SSUGovernance, members: &MemberRegistry,
 *        storage: &mut UserStorage, clock: &Clock, ctx: &mut TxContext)
 *
 * DA-003 resolution: Function lives in shop_ops_de.move (post R6.7.6 split).
 * V9: registry prepended; shop passed by ID not mutable ref.
 * PTB module path: bazaar_core::shop_ops_de::free_claim.
 * Checks membership::is_banned — aborts if the caller is banned in the SSU.
 * Writes to UserStorage via store_purchased_items. Emits PurchaseEvent with zero monetary fields.
 * ssuGovId         — SSUGovernance shared object ID (immutable; gov slot 4 in Move).
 * memberRegistryId — MemberRegistry shared object for the shop's SSU.
 * userStorageId    — UserStorage shared object for this SSU.
 * R6.7.8: ssuGovId param added (was missing; gov is slot 4 in Move sig).
 * R6.7.8: module retargeted from shop_ops → shop_ops_de.
 */
export function buildFreeClaim(params: {
  shopId: string;
  listingIdx: number;
  quantity: number;
  ssuGovId: string;            // R6.7.8: gov: &SSUGovernance slot 4 (was missing)
  memberRegistryId: string;
  userStorageId: string;
  /** V36 only — bazaar type of the shop's SSU. When 1 (Easy) routes to free_claim_tribe. */
  bazaarType?: number;
  /** V36 only — Easy tribe's TribeGovernance id; required when bazaarType === 1. */
  tribeGovId?: string;
}): Transaction {
  const tx = new Transaction();
  // R-B: Easy FREE item-claims route to the tribe-aware entry (tribe-global ban enforced).
  const easyV36 = v36Enabled() && params.bazaarType === 1;
  if (easyV36 && !params.tribeGovId) {
    throw new Error("free_claim_tribe (V36 Easy) requires tribeGovId");
  }
  tx.moveCall({
    // V38 split: free_claim[_tribe] moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_OPS_DE}::${easyV36 ? "free_claim_tribe" : "free_claim"}`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),    // registry: &mut BazarRegistry (V9)
      tx.pure.id(params.shopId),                   // shop_id: ID  (V9)
      tx.pure.u64(BigInt(params.listingIdx)),
      tx.pure.u64(BigInt(params.quantity)),
      tx.object(params.ssuGovId),               // gov: &SSUGovernance (slot 4)
      ...(easyV36 ? [tx.object(params.tribeGovId!)] : []), // tribe_gov (slot 5, V36 Easy)
      tx.object(params.memberRegistryId),
      tx.object(params.userStorageId),
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (before clock)
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * V25 — NoTribe / Easy FREE-shop coin (EVE) giveaway claim.
 * Move: bazaar_core::shop_ops_de::free_coin_claim
 * Sig:  (registry, shop_id, gov: &SSUGovernance, members: &MemberRegistry,
 *        clock: &Clock, ctx)
 * Single-claim per wallet (anti-double via Shop.coin_claimers vector).
 * Pays Shop.coin_claim_amount from Shop.escrowed_eve to the sender's wallet.
 * Advanced bazaars must use bazaar_economy::free_token_claim_advanced instead.
 */
export function buildFreeCoinClaim(params: {
  shopId: string;
  ssuGovId: string;
  memberRegistryId: string;
  /** V36 only — bazaar type of the shop's SSU. When 1 (Easy) routes to free_coin_claim_tribe. */
  bazaarType?: number;
  /** V36 only — Easy tribe's TribeGovernance id; required when bazaarType === 1. */
  tribeGovId?: string;
}): Transaction {
  const tx = new Transaction();
  // R-B: Easy FREE coin-claims route to the tribe-aware entry (tribe-global ban enforced).
  const easyV36 = v36Enabled() && params.bazaarType === 1;
  if (easyV36 && !params.tribeGovId) {
    throw new Error("free_coin_claim_tribe (V36 Easy) requires tribeGovId");
  }
  tx.moveCall({
    // V38 split: free_coin_claim[_tribe] moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_OPS_DE}::${easyV36 ? "free_coin_claim_tribe" : "free_coin_claim"}`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.pure.id(params.shopId),
      tx.object(params.ssuGovId),
      ...(easyV36 ? [tx.object(params.tribeGovId!)] : []), // tribe_gov (slot 3, V36 Easy)
      tx.object(params.memberRegistryId),
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (before clock)
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildWithdrawItems ─────────────────────────────────────────────────────────

/**
 * Withdraw stored inventory items by their item_type_id keys.
 * Move: bazaar_core::user_storage::withdraw_items
 * Sig: (storage: &mut UserStorage, item_type_ids: vector<u64>,
 *        clock: &Clock, ctx: &mut TxContext)
 *
 * C5/GAS-03 (V39): deposits is now Table<address, Table<u64, StoredItem>> keyed by
 * item_type_id, so withdraw is BY KEY (item_type_id), not by positional vector index.
 * Each key removes that type's whole StoredItem row (all-or-nothing per type). Does
 * NOT return a Coin — the in-game item credit happens via the EVE Frontier world layer.
 * Frontend must supply a non-empty itemTypeIds array. Wire type unchanged (vector<u64>).
 * userStorageId — UserStorage shared object for this SSU.
 */
export function buildWithdrawItems(params: {
  userStorageId: string;
  itemTypeIds: number[];
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.USER_STORAGE}::withdraw_items`,
    arguments: [
      tx.object(params.userStorageId),
      tx.pure.vector("u64", params.itemTypeIds.map(BigInt)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
