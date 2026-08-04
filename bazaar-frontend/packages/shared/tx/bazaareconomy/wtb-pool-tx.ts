// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy WTB-pool TX builders (V21 — Advanced WTB tribe-token escrow).
 *
 * Closes Documentation/legacycode.md § "V20 Session 3" GAP-DESIGN rows 01, 03, 04.
 *
 * Builders:
 *   buildBootstrapTribeTokenWtbPool  — per-SSU pool bootstrap (one-shot, anyone may call)
 *   buildCreateWtbShopAdvanced       — Advanced WTB create (ledger burn + pool credit)
 *   buildRefundWtbPoolResidue        — close-path refund (PTB step BEFORE close_shop / force_close)
 *
 * Move modules:
 *   bazaar_economy::tribe_token_wtb_pool
 *   bazaar_economy::wtb_pool_ops
 *
 * Pattern A (params, tx) — single Transaction allows PTB-chaining with close fns.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, SHARED_OBJECTS } from "../../constants";

// ── buildBootstrapTribeTokenWtbPool ──────────────────────────────────────────

/**
 * Per-SSU bootstrap of the TribeTokenWtbPool shared object. Called by the SSU
 * owner once, AFTER `bootstrap_ssu_objects` (atomic-9) and BEFORE first
 * Advanced WTB shop creation.
 *
 * Idempotency: NOT enforced on-chain — repeat calls create orphan pools.
 * FE indexes the `TribeTokenWtbPoolCreated` event to resolve the canonical
 * pool_id by ssu_id.
 *
 * Move: bazaar_economy::tribe_token_wtb_pool::bootstrap_tribe_token_wtb_pool
 * Sig:  (ssu_gov: &SSUGovernance, ctx: &mut TxContext)
 */
export function buildBootstrapTribeTokenWtbPool(
  params: { ssuGovId: string },
  tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_TOKEN_WTB_POOL}::bootstrap_tribe_token_wtb_pool`,
    arguments: [
      tx.object(params.ssuGovId),
    ],
  });
  return tx;
}

// ── buildCreateWtbShopAdvanced ───────────────────────────────────────────────

/**
 * Create an Advanced WTB shop using the V21 tribe-token escrow pool flow:
 *   1. Wraps `bazar::create_wtb_shop` with a zero-balance Coin<EVE>.
 *   2. Burns `gross = sum(price*qty)` from sender's tribe-token ledger row.
 *   3. Credits the pool for the new shop_id.
 *
 * Replaces the V20-S3 `coin::zero<EVE>` placeholder for Advanced. All NoTribe/Easy
 * WTB creates still go through `buildCreateWTBShop`.
 *
 * Move: bazaar_economy::wtb_pool_ops::create_wtb_shop_advanced
 * Sig:  (registry: &mut BazarRegistry, ssu_gov: &SSUGovernance,
 *        members: &MemberRegistry, pool: &mut TribeTokenWtbPool,
 *        ledger: &mut TribeTokenLedger, title: vector<u8>,
 *        ssu_id: address, tribe_id: u64,
 *        item_type_ids: vector<u64>, quantities: vector<u64>, prices_eve: vector<u64>,
 *        expiry_ms: u64, position_x: u64, position_y: u64,
 *        clock: &Clock, ctx: &mut TxContext)
 */
export function buildCreateWtbShopAdvanced(
  params: {
    title: string;
    ssuId: string;
    ssuGovId: string;
    memberRegistryId: string;
    poolId: string;
    ledgerId: string;
    tribeId: number;
    itemTypeIds: number[];
    quantities: number[];
    pricesEve: number[];
    expiryMs: number;
    positionX: number;
    positionY: number;
  },
  tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.WTB_POOL_OPS}::create_wtb_shop_advanced`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.object(params.ssuGovId),
      tx.object(params.memberRegistryId),
      tx.object(params.poolId),
      tx.object(params.ledgerId),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.title))),
      tx.pure.address(params.ssuId),
      tx.pure.u64(BigInt(params.tribeId)),
      tx.pure.vector("u64", params.itemTypeIds.map(BigInt)),
      tx.pure.vector("u64", params.quantities.map(BigInt)),
      tx.pure.vector("u64", params.pricesEve.map(BigInt)),
      tx.pure.u64(BigInt(params.expiryMs)),
      tx.pure.u64(BigInt(params.positionX)),
      tx.pure.u64(BigInt(params.positionY)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildRefundWtbPoolResidue ────────────────────────────────────────────────

/**
 * Refund pool residue for `shop_id` back to the shop owner's tribe-token ledger row.
 *
 * Idempotent — emits no event and is a no-op if the pool has no entry for shop_id.
 * Call as a PTB step BEFORE `bazar_close::close_shop[_as_ssu_owner]` /
 * `shop_moderation::force_close_shop_*` so close paths in bazaar_core stay
 * EVE-only (Article I.3 — bazaar_core cannot import bazaar_economy).
 *
 * Move: bazaar_economy::wtb_pool_ops::refund_wtb_pool_residue
 * Sig:  (registry: &mut BazarRegistry, ssu_gov: &SSUGovernance,
 *        pool: &mut TribeTokenWtbPool, ledger: &mut TribeTokenLedger,
 *        shop_id: ID, clock: &Clock, ctx: &mut TxContext)
 */
export function buildRefundWtbPoolResidue(
  params: {
    ssuGovId: string;
    poolId: string;
    ledgerId: string;
    shopId: string;
  },
  tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.WTB_POOL_OPS}::refund_wtb_pool_residue`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.object(params.ssuGovId),
      tx.object(params.poolId),
      tx.object(params.ledgerId),
      tx.pure.id(params.shopId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
