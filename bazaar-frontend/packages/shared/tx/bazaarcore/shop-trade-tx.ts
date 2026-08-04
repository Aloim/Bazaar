// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore shop trade builders.
 *
 * Split from shop-tx.ts as TFP1.5-L1 closure (Phase 1.6 of Temporaryfixplan,
 * 2026-05-08). Houses the three trade-execution builders (buildWTSBuy,
 * buildWTBFill, buildDEExchange) and their shared `isEmptyOrZeroId` guard.
 *
 * Shop CREATION builders (buildCreateWTSShop, buildCreateWTBShop, buildCreateDEShop,
 * buildCreateFreeShop) and lifecycle (buildCloseShop, buildUpdateShopListing) remain
 * in shop-tx.ts. The barrel index.ts continues to re-export everything via shop-tx.ts
 * (which now re-exports the trade fns from this file) — so no consumer paths change.
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { PACKAGE_IDS, SHARED_OBJECTS, MODULES } from "../../constants";
import {
  ssuWithdrawFromOpenInventory,
  ssuDepositToOwned,
  ssuDepositByOwnerSU,             // V27 Wave 3 W3-3: Main-Storage deposit path
  type CharOwnerCapRef,
  buildFillerWithdrawLoop,          // Phase 4: filler-side withdraw loop for WTB fill
  borrowSSUOwnerCap,                // V27 Wave 3 W3-3: SSU owner cap borrow
  returnSSUOwnerCap,                // V27 Wave 3 W3-3
} from "./shop-escrow-helpers";
import type { SSUOwnerCapRef } from "./ssu-receiving-tx";
import { buildDEBarterItemFlow } from "./shop-item-flows";
import type { EscrowListingRef } from "./shop-tx";

/** Returns true when the id is absent, empty, or a normalised 0x0…0 address. */
function isEmptyOrZeroId(id: string | undefined | null): boolean {
  if (!id) return true;
  return /^0x0+$/.test(id);
}

/**
 * Buy from a WTS shop.
 * Move: bazaar_core::shop_ops_wts::wts_buy_notribe OR wts_buy_tribe (chosen by bazaarType).
 * FULL PARAMETER LIST per actual Move signatures (G-14 resolution):
 *   notribe: (shop, listing_idx, quantity, payment, ssu_gov, admin, dapp_tax_wallet, dapp_config, member_registry, storage, clock, ctx)
 *   tribe:   (shop, listing_idx, quantity, payment, ssu_gov, tribe_gov, admin, dapp_tax_wallet, dapp_config, member_registry, storage, clock, ctx)
 * R6.7.6: member_registry threaded after dapp_config; module retargeted to shop_ops_wts.
 */
export function buildWTSBuy(
params: {
  shopId: string;
  listingIdx: number;
  quantity: number;
  paymentAmountMist: number;
  /** Pre-split Coin<EVE> from splitEveCoin(walletAddress, amount, tx). */
  paymentCoin: TransactionArgument;
  ssuGovId: string;
  memberRegistryId: string;    // R6.7.8: &MemberRegistry threaded after dapp_config
  userStorageId: string;
  bazaarType: "notribe" | "easy";
  tribeGovId?: string;
  /** Optional: items buyer receives from open inventory post-trade. */
  payoutItems?: EscrowListingRef[];
  /** Required when payoutItems provided — buyer's Character ID. */
  characterId?: string;
  /** Required when payoutItems provided — buyer's SSU ID to receive items into. */
  ssuId?: string;
  /** V27 Wave 3 W3-3: when the buyer IS the SSU owner, route the post-buy
   *  payout to Main Storage via deposit_by_owner<StorageUnit> instead of
   *  deposit_to_owned<BazarAuth> (Player Locker). */
  asSSUOwner?: boolean;
  ssuOwnerCapRef?: SSUOwnerCapRef;
},
tx: Transaction,
): Transaction {
  if (isEmptyOrZeroId(params.userStorageId)) {
    throw new Error('[buildWTSBuy] userStorageId is empty — resolve via useSSUSharedObjects before calling this builder.');
  }
  if (isEmptyOrZeroId(params.memberRegistryId)) {
    throw new Error('[buildWTSBuy] memberRegistryId is empty — resolve via useSSUSharedObjects before calling this builder.');
  }
  const isEasy = params.bazaarType === "easy";
  // V36 (AUD-ET-12): the Easy entry wts_buy_tribe takes `tribe_gov: &mut TribeGovernance`
  // immediately after ssu_gov. Omitting it silently shifts every trailing shared object onto
  // the wrong parameter slot → the RPC rejects with "Mutable parameter provided, immutable
  // parameter expected". Fail loud here instead (resolve via useTribeGovId at the call site).
  if (isEasy && !params.tribeGovId) {
    throw new Error('[buildWTSBuy] Easy-tribe buy requires tribeGovId (wts_buy_tribe takes &mut TribeGovernance) — resolve via useTribeGovId before calling.');
  }
  const fnName = isEasy ? "wts_buy_tribe" : "wts_buy_notribe";
  const baseArgs = [
    tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),        // registry: &mut BazarRegistry (V9)
    tx.pure.id(params.shopId),                       // shop_id: ID  (V9)
    tx.pure.u64(BigInt(params.listingIdx)),
    tx.pure.u64(BigInt(params.quantity)),
    params.paymentCoin,
    tx.object(params.ssuGovId),
  ];
  const tribeArg = isEasy && params.tribeGovId ? [tx.object(params.tribeGovId)] : [];
  const tailArgs = [
    tx.object(SHARED_OBJECTS.BAZAAR_CORE_ADMIN),
    tx.object(SHARED_OBJECTS.TAX_WALLET),
    tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
    tx.object(params.memberRegistryId),                           // member_registry (after dapp_config)
    tx.object(params.userStorageId),
    tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE),                 // V38: cap_store: &ShopOpsCapStore (before clock)
    tx.object("0x6"),
  ];
  tx.moveCall({
    // V38 split: wts_buy_* moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_OPS_WTS}::${fnName}`,
    arguments: [...baseArgs, ...tribeArg, ...tailArgs],
  });
  // Post-move payout loop: withdraw purchased items from open inventory into buyer's SSU.
  if (params.payoutItems?.length && params.characterId && params.ssuId) {
    // W3-3 (V27): SSU-owner branch deposits to Main Storage via owner-cap path.
    // Non-owner branch keeps the existing deposit_to_owned<BazarAuth> Player-Locker path.
    if (params.asSSUOwner) {
      if (!params.ssuOwnerCapRef) {
        throw new Error(
          "[buildWTSBuy] asSSUOwner=true requires ssuOwnerCapRef. " +
          "Resolve via resolveSSUOwnerCap before calling.",
        );
      }
      const { ownerCap, receipt } = borrowSSUOwnerCap(
        tx, params.characterId,
        params.ssuOwnerCapRef.ssuCapId,
        params.ssuOwnerCapRef.ssuCapVersion,
        params.ssuOwnerCapRef.ssuCapDigest,
      );
      for (const slot of params.payoutItems) {
        const item = ssuWithdrawFromOpenInventory(tx, params.ssuId, params.characterId, slot.typeId, slot.quantity);
        ssuDepositByOwnerSU(tx, params.ssuId, params.characterId, ownerCap, item);
      }
      returnSSUOwnerCap(tx, params.characterId, ownerCap, receipt);
    } else {
      for (const slot of params.payoutItems) {
        const item = ssuWithdrawFromOpenInventory(tx, params.ssuId, params.characterId, slot.typeId, slot.quantity);
        ssuDepositToOwned(tx, params.ssuId, params.characterId, item);
      }
    }
  }
  return tx;
}

/**
 * Phase 4: WTB fill — single-PTB filler-locker → recipient-locker direct deposit.
 * Move (notribe/tribe): wtb_fill_*(registry, shop_id, listing_idx, quantity, ssu_gov,
 *   [tribe_gov,] admin, dapp_tax_wallet, dapp_config, member_registry,
 *   ssu, items, recipient_character, clock, ctx). Move performs deposit_to_owned
 *   internally after asserting recipient == shop.owner (E_RECIPIENT_NOT_SHOP_OWNER=16).
 * (AUD-NT-18: the V13-removed pool arg + its deprecated wtbEscrowPoolId param are
 *  gone — live WTB custody is Shop.escrowed_eve.)
 */
export function buildWTBFill(params: {
  shopId:               string;
  listingIdx:           number;
  quantity:             number;
  ssuGovId:             string;
  memberRegistryId:     string;        // &MemberRegistry
  ssuId:                string;        // REQUIRED (Phase 4): &mut StorageUnit for filler withdraw + Move deposit
  bazaarType:           "notribe" | "easy";
  tribeGovId?:          string;
  // Phase 4: filler-side withdraw inputs — ALL REQUIRED (DC-FE1: promoted from optional).
  fillItems:            EscrowListingRef[];   // RENAMED from escrowItems (DC-FE1)
  charCapRef:           CharOwnerCapRef;       // REQUIRED
  characterId:          string;                // REQUIRED — filler's Character ID
  // Phase 4: recipient resolution (NEW REQUIRED).
  recipientCharacterId: string;                // WTB shop owner's Character shared-object ID
  /** V27 Wave 3 W3-4 (filler side): when the filler IS the SSU owner, withdraw
   *  from Main Storage via OwnerCap<StorageUnit> instead of Player Locker. */
  asSSUOwner?:    boolean;
  ssuOwnerCapRef?: SSUOwnerCapRef;
}): Transaction {
  // V36 (AUD-ET-12): wtb_fill_tribe takes `tribe_gov` after ssu_gov — see buildWTSBuy note.
  // Checked up-front (before any withdraw work) so it fails fast and loud.
  if (params.bazaarType === "easy" && !params.tribeGovId) {
    throw new Error('[buildWTBFill] Easy-tribe fill requires tribeGovId (wtb_fill_tribe takes &mut TribeGovernance) — resolve via useTribeGovId before calling.');
  }
  const tx = new Transaction();
  // FE PTB withdraws filler items; Move deposits internally (security: no FE deposit_to_owned).
  const items = buildFillerWithdrawLoop(tx, {
    ssuId:      params.ssuId,
    characterId: params.characterId,
    fillItems:  params.fillItems,
    charCapRef: params.charCapRef,
    asSSUOwner: params.asSSUOwner,
    ssuOwnerCapRef: params.ssuOwnerCapRef,
  });
  const itemsVec = tx.makeMoveVec({ elements: items });
  const isEasy = params.bazaarType === "easy";
  const fnName = isEasy ? "wtb_fill_tribe" : "wtb_fill_notribe";
  const baseArgs = [
    tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
    tx.pure.id(params.shopId),
    tx.pure.u64(BigInt(params.listingIdx)),
    tx.pure.u64(BigInt(params.quantity)),
    tx.object(params.ssuGovId),
  ];
  const tribeArg = isEasy && params.tribeGovId ? [tx.object(params.tribeGovId)] : [];
  // V13: pool arg removed — wtb_fill_* drains payout from Shop.escrowed_eve directly.
  const tailArgs = [
    tx.object(SHARED_OBJECTS.BAZAAR_CORE_ADMIN),
    tx.object(SHARED_OBJECTS.TAX_WALLET),
    tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
    tx.object(params.memberRegistryId),
    tx.object(params.ssuId),                         // ssu: &mut StorageUnit
    itemsVec,                                        // items: vector<Item>
    tx.object(params.recipientCharacterId),          // recipient_character: &Character
    tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE),    // V38: cap_store: &ShopOpsCapStore (before clock)
    tx.object("0x6"),
  ];
  tx.moveCall({
    // V38 split: wtb_fill_* moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_OPS_WTB}::${fnName}`,
    arguments: [...baseArgs, ...tribeArg, ...tailArgs],
  });
  return tx;
}

/**
 * Perform a Direct Exchange — TRUE BARTER (parity with the Advanced ledger DE):
 * the exchanger GIVES the requested items to the shop owner and RECEIVES the
 * offered items, plus pays the flat EVE fee. Item movement is FE-side (give-leg +
 * Open-Storage payout), routed to Main Storage when the exchanger is the SSU owner.
 *
 * Move: bazaar_core::shop_ops_de::de_exchange_notribe OR de_exchange_tribe.
 * V31 partial DE: pair_idx identifies the pair; `units` = offered items taken
 * (1..remaining stock). (AUD-NT-18: the stale "no units param" note removed.)
 * notribe: (registry, shop_id, pair_idx, units, de_fee_payment, ssu_gov, admin, dapp_tax_wallet, dapp_config, member_registry, storage, clock, ctx)
 * tribe:   same + tribe_gov after ssu_gov
 * R6.7.6: member_registry threaded after dapp_config; module retargeted to shop_ops_de.
 *
 * SECURITY: the give-leg is FE-side and NOT validated by the Move call (same trust
 * model as Advanced DE / WTB EFP10-S1). Move-side barter enforcement is deferred.
 */
export function buildDEExchange(
params: {
  shopId: string;
  pairIdx: number;
  /** V31 partial DE — number of offered items the exchanger takes (1..remaining). */
  units: number;
  feeAmountMist: number;
  /** Pre-split Coin<EVE> from splitEveCoin(walletAddress, BigInt(feeAmountMist), tx). */
  feePaymentCoin: TransactionArgument;
  ssuGovId: string;
  memberRegistryId: string;    // R6.7.8: &MemberRegistry threaded after dapp_config
  userStorageId: string;
  bazaarType: "notribe" | "easy";
  tribeGovId?: string;
  /** Offered items the exchanger receives from Open Storage post-trade. */
  payoutItems?: EscrowListingRef[];
  /** Requested items the exchanger gives to the shop owner pre-trade (barter). */
  giveItems?: EscrowListingRef[];
  /** Required when items provided — exchanger's Character ID. */
  characterId?: string;
  /** Required when items provided — exchanger's SSU ID. */
  ssuId?: string;
  /** Shop owner's character — give-leg delivery target (useRecipientCharacter). */
  recipientCharacterId?: string;
  /** Exchanger's Character OwnerCap ref — give-leg withdraw for a non-owner exchanger. */
  charCapRef?: CharOwnerCapRef;
  /** When the exchanger IS the SSU owner, use the Main-Storage cap path. */
  asSSUOwner?: boolean;
  ssuOwnerCapRef?: SSUOwnerCapRef;
},
tx: Transaction,
): Transaction {
  if (isEmptyOrZeroId(params.userStorageId)) {
    throw new Error('[buildDEExchange] userStorageId is empty — resolve via useSSUSharedObjects before calling this builder.');
  }
  if (isEmptyOrZeroId(params.memberRegistryId)) {
    throw new Error('[buildDEExchange] memberRegistryId is empty — resolve via useSSUSharedObjects before calling this builder.');
  }
  const isEasy = params.bazaarType === "easy";
  // V36 (AUD-ET-12): de_exchange_tribe takes `tribe_gov` after ssu_gov — see buildWTSBuy note.
  if (isEasy && !params.tribeGovId) {
    throw new Error('[buildDEExchange] Easy-tribe exchange requires tribeGovId (de_exchange_tribe takes &mut TribeGovernance) — resolve via useTribeGovId before calling.');
  }
  const fnName = isEasy ? "de_exchange_tribe" : "de_exchange_notribe";
  const baseArgs = [
    tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),        // registry: &mut BazarRegistry (V9)
    tx.pure.id(params.shopId),                       // shop_id: ID  (V9)
    tx.pure.u64(BigInt(params.pairIdx)),
    tx.pure.u64(BigInt(params.units)),               // units: u64 (V31 partial DE)
    params.feePaymentCoin,
    tx.object(params.ssuGovId),
  ];
  const tribeArg = isEasy && params.tribeGovId ? [tx.object(params.tribeGovId)] : [];
  const tailArgs = [
    tx.object(SHARED_OBJECTS.BAZAAR_CORE_ADMIN), tx.object(SHARED_OBJECTS.TAX_WALLET),
    tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
    tx.object(params.memberRegistryId),                           // member_registry (after dapp_config)
    tx.object(params.userStorageId),
    tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE),                 // V38: cap_store: &ShopOpsCapStore (before clock)
    tx.object("0x6"),
  ];
  // V38 split: de_exchange_* moved bazaar_core → bazaar_shop_ops (module name unchanged).
  tx.moveCall({ target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_OPS_DE}::${fnName}`, arguments: [...baseArgs, ...tribeArg, ...tailArgs] });
  // Item flow: give-leg (requested → owner) + offered payout (Open Storage → exchanger).
  if (params.characterId && params.ssuId) {
    buildDEBarterItemFlow(tx, {
      ssuId:                params.ssuId,
      characterId:          params.characterId,
      recipientCharacterId: params.recipientCharacterId,
      giveItems:            params.giveItems ?? [],
      payoutItems:          params.payoutItems ?? [],
      asSSUOwner:           params.asSSUOwner,
      ssuOwnerCapRef:       params.ssuOwnerCapRef,
      charCapRef:           params.charCapRef,
    });
  }
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
