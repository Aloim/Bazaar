// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/** BazaarCore shop creation + lifecycle TX builders. Trade builders (buildWTSBuy, buildWTBFill, buildDEExchange) live in shop-trade-tx.ts (TFP1.5-L1 split). */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { PACKAGE_IDS, SHARED_OBJECTS, MODULES, WORLD_PACKAGE_ID, v36Enabled } from "../../constants";
import {
  type CharOwnerCapRef,
  escrowItemsForShopCreation,    // Phase 3: bifurcated escrow helper (Option B)
} from "./shop-escrow-helpers";
import { type SSUOwnerCapRef, borrowSSUOwnerCap, returnSSUOwnerCap } from "./ssu-receiving-tx";

// Re-export trade builders so existing "@bazaar/shared/tx/bazaarcore/shop-tx" import paths continue to resolve.
export { buildWTSBuy, buildWTBFill, buildDEExchange } from "./shop-trade-tx";

/** ItemRef — minimal item type/quantity reference used in shop close operations. */
export type ItemRef = { typeId: number; quantity: number };

/**
 * EscrowListingRef — identifies a single item escrow slot for pre-move shop creation
 * or post-move payout.  Used in the escrow loops of buildCreateWTSShop, buildCreateDEShop,
 * buildCreateFreeShop (seller deposits items into SSU open inventory before listing),
 * and buildWTSBuy, buildDEExchange (buyer receives items from open inventory after trade).
 */
export interface EscrowListingRef {
  typeId:   number;
  quantity: number;
}

// ── Shop Creation ──────────────────────────────────────────────────────────────

/**
 * V36 B1.2: the generic `create_wts_shop`/`create_de_shop` were demoted to public(package)
 * and `create_wtb_shop` was deleted — replaced by type-guarded public entries that enforce
 * the bazaar-type guard + (Easy) tribe shop-limit (AUD-ET-12). FE retargets to:
 *   _notribe (bt 0) · _easy (bt 1, +tribe_gov at slot 2, after gov) · _advanced (bt 2).
 * On V35 (flag OFF) the original generic entry is used — byte-identical to the live ABI.
 * Returns { entry, easy }; `easy` means splice tribe_gov in right after gov.
 */
function shopCreateRouting(
  base: "create_wts_shop" | "create_wtb_shop" | "create_de_shop",
  bazaarType: number,
): { entry: string; easy: boolean } {
  if (!v36Enabled()) return { entry: base, easy: false };
  if (bazaarType === 1) return { entry: `${base}_easy`, easy: true };
  if (bazaarType === 2) {
    if (base === "create_wtb_shop") {
      throw new Error(
        "Advanced WTB shops route via bazaar_economy::wtb_pool_ops::create_wtb_shop_advanced, not buildCreateWTBShop",
      );
    }
    return { entry: `${base}_advanced`, easy: false };
  }
  return { entry: `${base}_notribe`, easy: false };
}

/** Create a Want-To-Sell shop. Move: bazar::create_wts_shop. R6.7.6: members at slot 3. Phase 8: +position_x/y. */
export function buildCreateWTSShop(params: {
  bazaarType: number;
  title: string;
  ssuId: string;
  ssuGovId: string;            // R3.5 — resolved via useSSUGovId hook
  /** V36 only — Easy tribe's TribeGovernance id; required when bazaarType === 1. */
  tribeGovId?: string;
  memberRegistryId: string;    // R6.7.8: &MemberRegistry at slot 3
  tribeId: number;
  itemTypeIds: number[];
  quantities: number[];
  pricesEve: number[];
  expiryMs: number;
  /** Optional: escrow items from seller's SSU into open inventory before listing. */
  escrowItems?: EscrowListingRef[];
  /** Required when escrowItems provided — Character cap for borrow/return pattern. */
  charCapRef?: CharOwnerCapRef;
  /** Required when escrowItems provided — Character ID for owner operations. */
  characterId?: string;
  /** NEW (Phase 3): when true, withdraw from Main Storage via OwnerCap<StorageUnit>.
   *  When false/undefined, withdraw from Player Locker via OwnerCap<Character>.
   *  Optional — defaults to false (backward-compatible). */
  asOwner?: boolean;
  /** NEW (Phase 3): SSUOwnerCapRef resolved via resolveSSUOwnerCap. Required iff asOwner === true. */
  ssuOwnerCapRef?: SSUOwnerCapRef;
  /** Phase 8: shop beacon grid position (Godot world units). */
  positionX: number;
  positionY: number;
}): Transaction {
  const tx = new Transaction();
  // Pre-move escrow loop: bifurcated by asOwner (Phase 3).
  if (params.escrowItems?.length && params.characterId) {
    escrowItemsForShopCreation(tx, { ssuId: params.ssuId, characterId: params.characterId, escrowItems: params.escrowItems, asOwner: !!params.asOwner, charCapRef: params.charCapRef, ssuOwnerCapRef: params.ssuOwnerCapRef });
  }
  const { entry, easy } = shopCreateRouting("create_wts_shop", params.bazaarType);
  if (easy && !params.tribeGovId) throw new Error("create_wts_shop_easy (V36) requires tribeGovId");
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.BAZAR}::${entry}`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),                   // registry: &mut BazarRegistry
      tx.object(params.ssuGovId),                                 // gov: &SSUGovernance (R3.5)
      ...(easy ? [tx.object(params.tribeGovId!)] : []),           // tribe_gov (slot 2, V36 Easy)
      tx.object(params.memberRegistryId),                         // members: &MemberRegistry
      tx.pure.u8(params.bazaarType),                              // bazaar_type: u8
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.title))),
      tx.pure.address(params.ssuId),                              // ssu_id: address
      tx.pure.u64(BigInt(params.tribeId)),                        // tribe_id: u64
      tx.pure.vector("u64", params.itemTypeIds.map(BigInt)),      // item_type_ids
      tx.pure.vector("u64", params.quantities.map(BigInt)),       // quantities
      tx.pure.vector("u64", params.pricesEve.map(BigInt)),        // prices_eve
      tx.pure.u64(BigInt(params.expiryMs)),                       // expiry_ms: u64
      tx.pure.u64(BigInt(params.positionX)),                      // position_x: u64
      tx.pure.u64(BigInt(params.positionY)),                      // position_y: u64
      tx.object("0x6"),                                           // clock: &Clock
    ],
  });
  return tx;
}

/**
 * Create a Want-To-Buy shop.
 * Move: bazaar_core::bazar::create_wtb_shop
 * Sig: (registry, gov, bazaar_type, title, ssu_id, tribe_id, item_type_ids,
 *        quantities, prices_eve, members, prepay: Coin<SUI>, expiry_ms, clock, ctx)
 * R6.7.6: members &MemberRegistry added at slot 10 (after prices_eve, before prepay).
 */
export function buildCreateWTBShop(
params: {
  bazaarType: number;
  title: string;
  ssuId: string;
  ssuGovId: string;            // R3.5 — resolved via useSSUGovId hook
  /** V36 only — Easy tribe's TribeGovernance id; required when bazaarType === 1 (Advanced throws). */
  tribeGovId?: string;
  memberRegistryId: string;    // R6.7.8: &MemberRegistry at slot 10
  tribeId: number;
  itemTypeIds: number[];
  quantities: number[];
  pricesEve: number[];
  escrowAmountMist: number;
  /** Pre-split Coin<EVE> TransactionArgument from splitEveCoin(). */
  prepayEve: TransactionArgument;
  expiryMs: number;
  /** Phase 8: shop beacon grid position (Godot world units). */
  positionX: number;
  positionY: number;
},
tx: Transaction,
): Transaction {
  const { entry, easy } = shopCreateRouting("create_wtb_shop", params.bazaarType);
  if (easy && !params.tribeGovId) throw new Error("create_wtb_shop_easy (V36) requires tribeGovId");
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.BAZAR}::${entry}`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.object(params.ssuGovId),                                 // gov: &SSUGovernance (R3.5)
      ...(easy ? [tx.object(params.tribeGovId!)] : []),           // tribe_gov (slot 2, V36 Easy)
      tx.pure.u8(params.bazaarType),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.title))),
      tx.pure.address(params.ssuId),
      tx.pure.u64(BigInt(params.tribeId)),
      tx.pure.vector("u64", params.itemTypeIds.map(BigInt)),
      tx.pure.vector("u64", params.quantities.map(BigInt)),
      tx.pure.vector("u64", params.pricesEve.map(BigInt)),
      tx.object(params.memberRegistryId),                         // members: &MemberRegistry
      params.prepayEve,                                           // prepay: Coin<EVE>
      tx.pure.u64(BigInt(params.expiryMs)),
      tx.pure.u64(BigInt(params.positionX)),                      // position_x: u64
      tx.pure.u64(BigInt(params.positionY)),                      // position_y: u64
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * Create a Direct Exchange shop.
 * Move: bazaar_core::bazar::create_de_shop
 * Sig: (registry, gov, members, bazaar_type, title, ssu_id, tribe_id,
 *        offer_item_type_ids, offer_quantities, request_item_type_ids, request_quantities,
 *        offer_per_lots, expiry_ms, clock, ctx)
 * R6.7.6: members &MemberRegistry added at slot 3 (after gov).
 * Bundle-ratio model: `offerPerLot` offered items trade for `requestedQty` requested items
 * per bundle; `offeredQty` (total escrow) must be a whole multiple of `offerPerLot`.
 */
export function buildCreateDEShop(params: {
  bazaarType: number;
  title: string;
  ssuId: string;
  ssuGovId: string;            // R3.5 — resolved via useSSUGovId hook
  /** V36 only — Easy tribe's TribeGovernance id; required when bazaarType === 1. */
  tribeGovId?: string;
  memberRegistryId: string;    // R6.7.8: &MemberRegistry at slot 3
  tribeId: number;
  pairs: { offeredTypeId: number; offeredQty: number; requestedTypeId: number; requestedQty: number; offerPerLot: number }[];
  expiryMs: number;
  /** Optional: escrow offered items from seller's SSU before listing. */
  escrowItems?: EscrowListingRef[];
  /** Required when escrowItems provided — Character cap for borrow/return pattern. */
  charCapRef?: CharOwnerCapRef;
  /** Required when escrowItems provided — Character ID for owner operations. */
  characterId?: string;
  /** NEW (Phase 3): when true, withdraw from Main Storage via OwnerCap<StorageUnit>. */
  asOwner?: boolean;
  /** NEW (Phase 3): SSUOwnerCapRef resolved via resolveSSUOwnerCap. Required iff asOwner === true. */
  ssuOwnerCapRef?: SSUOwnerCapRef;
  /** Phase 8: shop beacon grid position (Godot world units). */
  positionX: number;
  positionY: number;
}): Transaction {
  const tx = new Transaction();
  // Pre-move escrow loop: bifurcated by asOwner (Phase 3).
  if (params.escrowItems?.length && params.characterId) {
    escrowItemsForShopCreation(tx, { ssuId: params.ssuId, characterId: params.characterId, escrowItems: params.escrowItems, asOwner: !!params.asOwner, charCapRef: params.charCapRef, ssuOwnerCapRef: params.ssuOwnerCapRef });
  }
  const offerTypeIds  = params.pairs.map(p => BigInt(p.offeredTypeId));
  const offerQtys     = params.pairs.map(p => BigInt(p.offeredQty));
  const reqTypeIds    = params.pairs.map(p => BigInt(p.requestedTypeId));
  const reqQtys       = params.pairs.map(p => BigInt(p.requestedQty));
  const offerPerLots  = params.pairs.map(p => BigInt(Math.max(1, p.offerPerLot || 1)));
  const { entry, easy } = shopCreateRouting("create_de_shop", params.bazaarType);
  if (easy && !params.tribeGovId) throw new Error("create_de_shop_easy (V36) requires tribeGovId");
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.BAZAR}::${entry}`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.object(params.ssuGovId),                                 // gov: &SSUGovernance (R3.5)
      ...(easy ? [tx.object(params.tribeGovId!)] : []),           // tribe_gov (slot 2, V36 Easy)
      tx.object(params.memberRegistryId),                         // members: &MemberRegistry
      tx.pure.u8(params.bazaarType),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.title))),
      tx.pure.address(params.ssuId),
      tx.pure.u64(BigInt(params.tribeId)),
      tx.pure.vector("u64", offerTypeIds),
      tx.pure.vector("u64", offerQtys),
      tx.pure.vector("u64", reqTypeIds),
      tx.pure.vector("u64", reqQtys),
      tx.pure.vector("u64", offerPerLots),                        // offer_per_lots: vector<u64> (bundle sizes)
      tx.pure.u64(BigInt(params.expiryMs)),
      tx.pure.u64(BigInt(params.positionX)),                      // position_x: u64
      tx.pure.u64(BigInt(params.positionY)),                      // position_y: u64
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * Close a shop (owner only).
 *
 * Dispatches to one of two Move entry functions based on tier:
 *   ssuOwnerCapRef present → bazar_close::close_shop_as_ssu_owner (Main Storage)
 *   ssuOwnerCapRef absent  → bazar_close::close_shop              (Player Locker)
 *
 * The V11 split (TFP Phase 3.4) replaced the single 9-arg Option<OwnerCap> entry
 * function because the on-chain `world::access::OwnerCap` lacks the `store` ability,
 * which `Option<T>` requires. The SSU-owner variant takes `&OwnerCap<StorageUnit>`
 * by reference; references don't need any abilities.
 *
 * charCapRef is ALWAYS required (needed for recipient_character arg + borrow pattern).
 */
export function buildCloseShop(params: {
  shopId:          string;
  ssuGovId:        string;
  ssuId:           string;            // &mut StorageUnit
  characterId:     string;            // recipient_character: &Character
  wtbEscrowPoolId: string;            // pool: &mut WtbEscrowPool
  /** Legacy param — unused. close_shop / close_shop_as_ssu_owner only read
   *  the recipient character's address; no OwnerCap<Character> borrow is needed. */
  charCapRef?:     CharOwnerCapRef;
  ssuOwnerCapRef?: SSUOwnerCapRef;    // present = SSU owner → Main Storage path
}): Transaction {
  const tx = new Transaction();

  // recipient_character is passed as `tx.object(characterId)` — the live Character
  // shared object. Earlier revisions borrowed `OwnerCap<Character>` via
  // `charBorrowOwnerCap` and passed THAT as recipient_character, which produced
  // the on-chain CommandArgumentError { arg_idx: 4, kind: TypeMismatch } at the
  // close_shop / close_shop_as_ssu_owner call (Move expects &Character, not the
  // cap). Move-side only reads `character::character_address(recipient_character)`,
  // so no borrow ceremony is required.
  if (params.ssuOwnerCapRef) {
    // --- SSU-owner path: borrow OwnerCap<StorageUnit>, dispatch to close_shop_as_ssu_owner ---
    const { ownerCap: ssuOwnerCap, receipt: ssuReceipt } = borrowSSUOwnerCap(
      tx,
      params.characterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );

    tx.moveCall({
      // V38 split: bazar_close moved bazaar_core → bazaar_shop_ops (module name unchanged).
      target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::bazar_close::close_shop_as_ssu_owner`,
      arguments: [
        tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),  // registry: &mut BazarRegistry
        tx.pure.id(params.shopId),                  // shop_id: ID
        tx.object(params.ssuGovId),                 // gov: &SSUGovernance
        tx.object(params.ssuId),                    // ssu: &mut StorageUnit
        tx.object(params.characterId),              // recipient_character: &Character
        ssuOwnerCap,                                // ssu_owner_cap: &OwnerCap<StorageUnit>
        tx.object(params.wtbEscrowPoolId),          // pool: &mut WtbEscrowPool
        tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (before clock)
        tx.object("0x6"),                           // clock: &Clock
      ],
    });

    returnSSUOwnerCap(tx, params.characterId, ssuOwnerCap, ssuReceipt);
  } else {
    // --- Non-SSU-owner path: dispatch to close_shop (Player Locker) ---
    tx.moveCall({
      // V38 split: bazar_close moved bazaar_core → bazaar_shop_ops (module name unchanged).
      target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::bazar_close::close_shop`,
      arguments: [
        tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),  // registry: &mut BazarRegistry
        tx.pure.id(params.shopId),                  // shop_id: ID
        tx.object(params.ssuGovId),                 // gov: &SSUGovernance
        tx.object(params.ssuId),                    // ssu: &mut StorageUnit
        tx.object(params.characterId),              // recipient_character: &Character
        tx.object(params.wtbEscrowPoolId),          // pool: &mut WtbEscrowPool
        tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (before clock)
        tx.object("0x6"),                           // clock: &Clock
      ],
    });
  }

  return tx;
}

/**
 * Create a Free (zero-price) shop.
 * Move: bazaar_core::bazar_free::create_free_shop  (V26 D8 — relocated from `bazar` module)
 * Sig: (registry, gov, members, bazaar_type, title, ssu_id, tribe_id,
 *        item_type_ids, quantities, expiry_ms, clock, ctx): ID
 * R6.7.6: members &MemberRegistry added at slot 3 (after gov).
 *
 * DA-001 resolution: No prices_eve parameter — Move synthesises all-zero prices internally.
 * Differs from create_wts_shop which requires explicit prices_eve.
 * Returns the new shop's ID (via PTB result, not auto-transferred).
 */
export function buildCreateFreeShop(params: {
  bazaarType: number;
  title: string;
  ssuId: string;
  ssuGovId: string;            // R3.5 — resolved via useSSUGovId hook
  memberRegistryId: string;    // R6.7.8: &MemberRegistry at slot 3
  tribeId: number;
  itemTypeIds: number[];
  quantities: number[];
  expiryMs: number;
  /** Optional: escrow items from seller's SSU into open inventory before listing. */
  escrowItems?: EscrowListingRef[];
  /** Required when escrowItems provided — Character cap for borrow/return pattern. */
  charCapRef?: CharOwnerCapRef;
  /** Required when escrowItems provided — Character ID for owner operations. */
  characterId?: string;
  /** NEW (Phase 3): when true, withdraw from Main Storage via OwnerCap<StorageUnit>. */
  asOwner?: boolean;
  /** NEW (Phase 3): SSUOwnerCapRef resolved via resolveSSUOwnerCap. Required iff asOwner === true. */
  ssuOwnerCapRef?: SSUOwnerCapRef;
  /** Phase 8: shop beacon grid position (Godot world units). */
  positionX: number;
  positionY: number;
  /** V25: PTB-result handle to a Coin<EVE> to use as the giveaway pool. Required
   *  argument; pass `coin::zero<EVE>` (via splitEveCoin / coin::zero helper) when
   *  no coin giveaway is configured. */
  prepayCoin: ReturnType<Transaction["splitCoins"]> | { kind: "Input"; index: number };
  /** V25: per-claim amount in raw MIST. 0 when no coin giveaway. Move asserts
   *  `prepay >= coin_claim_amount` and `coin_claim_amount > 0` when prepay > 0. */
  coinClaimAmountMist: number;
}, tx: Transaction): Transaction {
  // Pre-move escrow loop: bifurcated by asOwner (Phase 3).
  if (params.escrowItems?.length && params.characterId) {
    escrowItemsForShopCreation(tx, { ssuId: params.ssuId, characterId: params.characterId, escrowItems: params.escrowItems, asOwner: !!params.asOwner, charCapRef: params.charCapRef, ssuOwnerCapRef: params.ssuOwnerCapRef });
  }
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.BAZAR_FREE}::create_free_shop`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),                                     // registry: &mut BazarRegistry
      tx.object(params.ssuGovId),                                                   // gov: &SSUGovernance (R3.5)
      tx.object(params.memberRegistryId),                                           // members: &MemberRegistry (slot 3)
      tx.pure.u8(params.bazaarType),                                                // bazaar_type: u8
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.title))),     // title: vector<u8>
      tx.pure.address(params.ssuId),                                                // ssu_id: address
      tx.pure.u64(BigInt(params.tribeId)),                                          // tribe_id: u64
      tx.pure.vector("u64", params.itemTypeIds.map(BigInt)),                        // item_type_ids: vector<u64>
      tx.pure.vector("u64", params.quantities.map(BigInt)),                         // quantities: vector<u64>
      tx.pure.u64(BigInt(params.expiryMs)),                                         // expiry_ms: u64
      tx.pure.u64(BigInt(params.positionX)),                                        // position_x: u64
      tx.pure.u64(BigInt(params.positionY)),                                        // position_y: u64
      params.prepayCoin,                                                             // V25: prepay: Coin<EVE>
      tx.pure.u64(BigInt(params.coinClaimAmountMist)),                               // V25: coin_claim_amount: u64
      tx.object("0x6"),                                                             // clock: &Clock
    ],
  });
  return tx;
}

/**
 * Update the price_eve for a single shop listing by index.
 * Move: bazaar_core::bazar::update_shop_listing
 * Sig: (registry: &mut BazarRegistry, shop_id: ID, listing_idx: u64,
 *       new_price_eve: u64, ctx: &mut TxContext)
 *
 * V9: shop passed by ID (not mutable ref); registry prepended.
 * Owner-only — Move asserts shop.owner == tx_context::sender(ctx) internally.
 */
export function buildUpdateShopListing(params: {
  shopId: string;
  ssuGovId: string;            // R3.5 — resolved via useSSUGovId hook (SA-R4.3-05)
  listingIdx: number;
  newPriceEve: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.BAZAR}::update_shop_listing`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),    // registry: &mut BazarRegistry (V9)
      tx.pure.id(params.shopId),                   // shop_id: ID  (V9: by-ID)
      tx.object(params.ssuGovId),                  // gov: &SSUGovernance (R3.5)
      tx.pure.u64(BigInt(params.listingIdx)),      // listing_idx: u64
      tx.pure.u64(BigInt(params.newPriceEve)),     // new_price_eve: u64
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
