// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy ledger shop TX builders.
 *
 * buildLedgerWTSBuy           — buy from Advanced WTS shop (ledger debit)
 * buildLedgerWTBFill          — fill Advanced WTB shop (filler items + ledger credit/debit)
 * buildLedgerDEExchange       — Advanced DE flat fee exchange (ledger debit + item payout)
 * buildWithdrawSSUTaxCredits  — SSU owner redeems ledger tax credits for EVE
 * (buildWithdrawTribeTaxCredits deleted Phase 8 A4 — V16-retired Move target)
 *
 * Move module: bazaar_economy::ledger_shop_ops
 *
 * CRITICAL: NO dApp tax on internal ledger trades. SSU + tribe flat/BPS fees route
 * to their ledger accounts. TribeToken is NOT Coin<T> — no Coin passed for purchases.
 *
 * ECONOMY_CAP_STORE is the singleton EconomyCapStore shared object.
 *
 * EFP10-S1 NOTE: ledger_wtb_fill Move ABI does NOT take items + recipient_character.
 * Honest-filler safety depends on FE using useRecipientCharacter(shop.owner, ssuId)
 * for recipientCharacterId. Move-side hardening deferred to V11.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, SHARED_OBJECTS, MODULES } from "../../constants";
import type { CharOwnerCapRef } from "../bazaarcore/shop-escrow-helpers";
import {
  ssuDepositToOwned,
  buildFillerWithdrawLoop,
} from "../bazaarcore/shop-escrow-helpers";
import {
  payoutOpenStorageItems,
  buildDEBarterItemFlow,
} from "../bazaarcore/shop-item-flows";
import { type SSUOwnerCapRef } from "../bazaarcore/ssu-receiving-tx";

// CC-1013: import canonical EscrowListingRef from shop-tx and re-export it
// so callers can import from either location without type drift.
import type { EscrowListingRef } from "../bazaarcore/shop-tx";
export type { EscrowListingRef };

// ── buildLedgerWTSBuy ──────────────────────────────────────────────────────────

/**
 * Buy from an Advanced (BAZAAR_ADVANCED=2) WTS shop using tribe token ledger balance.
 * Post-move: withdraw purchased items from Open Storage into buyer's Player Locker.
 *
 * Move: bazaar_economy::ledger_shop_ops::ledger_wts_buy (V16 ABI: +member_registry@pos 8)
 * Sig:  (registry: &mut BazarRegistry, shop_id: ID, listing_idx: u64, quantity: u64,
 *        ledger: &mut TribeTokenLedger, ssu_gov: &SSUGovernance,
 *        tribe_gov: &TribeGovernance, member_registry: &MemberRegistry,
 *        cap_store: &EconomyCapStore, clock: &Clock, ctx: &mut TxContext)
 *
 * No Coin<EVE> involved — buyer's ledger balance is debited.
 * Session 3B: per-role tax lookup keyed on buyer's role in member_registry.
 */
export function buildLedgerWTSBuy(
  params: {
    shopId: string;
    listingIdx: number;
    quantity: number;
    ledgerId: string;
    ssuGovId: string;
    tribeGovId: string;
    /** Per-SSU MemberRegistry shared object (V16 — per-role tax lookup). */
    memberRegistryId: string;
    /** Items buyer receives from open inventory post-trade. */
    payoutItems?: EscrowListingRef[];
    /** Buyer's character shared-object ID (required when payoutItems provided). */
    characterId?: string;
    /** Buyer's SSU ID (required when payoutItems provided). */
    ssuId?: string;
    /** When the buyer IS the SSU owner, route the post-buy payout to Main Storage
     *  via deposit_by_owner<StorageUnit> instead of Player Locker (W3-3 parity for
     *  Advanced — without this the owner's Main-Storage inventory view never shows
     *  the items they just bought from their own shop). */
    asSSUOwner?: boolean;
    ssuOwnerCapRef?: SSUOwnerCapRef;
  },
  tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.LEDGER_SHOP_OPS}::ledger_wts_buy`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),           // registry: &mut BazarRegistry (V9)
      tx.pure.id(params.shopId),                          // shop_id: ID  (V9)
      tx.pure.u64(BigInt(params.listingIdx)),             // listing_idx: u64
      tx.pure.u64(BigInt(params.quantity)),               // quantity: u64
      tx.object(params.ledgerId),                         // ledger: &mut TribeTokenLedger
      tx.object(params.ssuGovId),                         // ssu_gov: &SSUGovernance
      tx.object(params.tribeGovId),                       // tribe_gov: &TribeGovernance
      tx.object(params.memberRegistryId),                 // member_registry: &MemberRegistry (V16)
      tx.object(SHARED_OBJECTS.ECONOMY_CAP_STORE),        // cap_store: &EconomyCapStore
      tx.object("0x6"),                                   // clock: &Clock
    ],
  });
  // Post-move payout: withdraw purchased items from open inventory into buyer's SSU,
  // routing Main Storage vs Player Locker by whether the buyer is the SSU owner.
  if (params.payoutItems?.length && params.characterId && params.ssuId) {
    payoutOpenStorageItems(tx, {
      ssuId:          params.ssuId,
      characterId:    params.characterId,
      items:          params.payoutItems,
      asSSUOwner:     params.asSSUOwner,
      ssuOwnerCapRef: params.ssuOwnerCapRef,
    });
  }
  return tx;
}

// ── buildLedgerWTBFill ─────────────────────────────────────────────────────────

/**
 * Fill an Advanced WTB shop. Pre-move: filler withdraws items from own Player Locker
 * and deposits each to recipient's Player Locker (Phase 4 direct-deposit pattern).
 * Move call: shop owner's ledger is debited; filler receives credit.
 *
 * Move: bazaar_economy::ledger_shop_ops::ledger_wtb_fill
 * Sig (V21):  (registry: &mut BazarRegistry, shop_id: ID, listing_idx: u64, quantity: u64,
 *              ledger: &mut TribeTokenLedger, ssu_gov: &SSUGovernance,
 *              tribe_gov: &TribeGovernance, member_registry: &MemberRegistry,
 *              cap_store: &EconomyCapStore, pool: &mut TribeTokenWtbPool,
 *              clock: &Clock, ctx: &mut TxContext)
 *
 * V21 ABI delta (+pool@pos 10): WTB now pays from per-shop `TribeTokenWtbPool`
 * earmark (escrowed at create time) instead of the owner's live ledger row.
 * Closes Documentation/legacycode.md § "V20 Session 3" GAP-DESIGN row 02.
 *
 * SECURITY (EFP10-S1): ledger_wtb_fill Move ABI does NOT validate item delivery to
 * recipient. FE resolves recipientCharacterId via useRecipientCharacter(shop.owner, ssuId)
 * to ensure honest filler delivers to the correct character. Move-side hardening deferred V11.
 * Session 3B: per-role tax lookup keyed on filler's role in member_registry.
 */
export function buildLedgerWTBFill(
  params: {
    shopId: string;
    listingIdx: number;
    quantity: number;
    ledgerId: string;
    ssuGovId: string;
    tribeGovId: string;
    /** Per-SSU MemberRegistry shared object (V16 — per-role tax lookup). */
    memberRegistryId: string;
    /** Per-SSU TribeTokenWtbPool shared object (V21 — escrow pool). */
    poolId: string;
    /** Items filler withdraws from own Player Locker and delivers to recipient. */
    fillItems: EscrowListingRef[];
    /** Filler's Character OwnerCap reference for borrow/return pattern. */
    charCapRef: CharOwnerCapRef;
    /** Filler's character shared-object ID. */
    characterId: string;
    /** Shop owner's character ID (resolved via useRecipientCharacter). */
    recipientCharacterId: string;
    /** SSU shared-object ID. */
    ssuId: string;
    /** When the filler IS the SSU owner, withdraw fill items from Main Storage
     *  (OwnerCap<StorageUnit>) instead of Player Locker (W3-4 parity for Advanced). */
    asSSUOwner?: boolean;
    ssuOwnerCapRef?: SSUOwnerCapRef;
  },
  tx: Transaction,
): Transaction {
  // Self-sell (filler === shop owner): the items already belong to the filler,
  // so there is nothing to move — withdrawing from then re-depositing to the same
  // wallet would only shuffle them out of the owner's Main-Storage view. Skip the
  // item legs entirely; only the ledger fill (token payout) runs.
  const selfSell = params.characterId === params.recipientCharacterId;
  if (!selfSell) {
    // Pre-move: filler withdraws (Main Storage when SSU owner, else Player Locker)
    // and deposits each item to the recipient's Player Locker.
    // EFP10-S1: Move cannot validate delivery target — caller must use useRecipientCharacter.
    const items = buildFillerWithdrawLoop(tx, {
      ssuId:          params.ssuId,
      characterId:    params.characterId,
      fillItems:      params.fillItems,
      charCapRef:     params.charCapRef,
      asSSUOwner:     params.asSSUOwner,
      ssuOwnerCapRef: params.ssuOwnerCapRef,
    });
    for (const item of items) {
      ssuDepositToOwned(tx, params.ssuId, params.recipientCharacterId, item);
    }
  }
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.LEDGER_SHOP_OPS}::ledger_wtb_fill`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),           // registry: &mut BazarRegistry (V9)
      tx.pure.id(params.shopId),                          // shop_id: ID  (V9)
      tx.pure.u64(BigInt(params.listingIdx)),
      tx.pure.u64(BigInt(params.quantity)),
      tx.object(params.ledgerId),
      tx.object(params.ssuGovId),
      tx.object(params.tribeGovId),
      tx.object(params.memberRegistryId),                 // member_registry: &MemberRegistry (V16)
      tx.object(SHARED_OBJECTS.ECONOMY_CAP_STORE),
      tx.object(params.poolId),                           // pool: &mut TribeTokenWtbPool (V21)
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildLedgerDEExchange ──────────────────────────────────────────────────────

/**
 * Perform an Advanced DE exchange — TRUE BARTER. In one PTB the exchanger:
 *   1. GIVES the requested items (from their locker) to the shop owner.
 *   2. PAYS the flat tribe-token fee (the Move call).
 *   3. RECEIVES the offered items (from Open Storage) into their locker.
 *
 * Bundle-ratio DE (V31 partial + bundle model): a pair is a bundle — `offer_per_lot`
 * offered items for `request_quantity` requested items — stocked as a whole number of
 * bundles. `units` = offered items taken (= bundles × offer_per_lot, always a whole-lot
 * multiple); the Move call decrements the pair's offered stock by `units` and leaves the
 * pair in place until it drains. offer_per_lot = 1 is the legacy per-single-offered ratio.
 *
 * Locker routing (Each SSU has 3 tiers: Open / Player Locker / Main):
 *   - Exchanger is the SSU owner  → withdraw from / deposit to Main Storage
 *     (OwnerCap<StorageUnit> path). Self-trade gives requested items back to
 *     own Main (degenerate round-trip).
 *   - Exchanger is a regular player → withdraw from / deposit to Player Locker
 *     (OwnerCap<Character> path); requested items delivered to the owner's
 *     Player Locker via deposit_to_owned.
 *
 * Move: bazaar_economy::ledger_shop_ops::ledger_de_exchange (V16 ABI: +member_registry@pos 8)
 * Sig:  (registry, shop_id, pair_idx, units, ledger, ssu_gov, tribe_gov,
 *        member_registry, cap_store, clock, ctx)
 *
 * SECURITY (parity with WTB EFP10-S1): item delivery is FE-side; the Move call
 * does not validate that the give-leg ran. Move-side barter enforcement is a
 * deferred hardening item (see V30 follow-up).
 */
export function buildLedgerDEExchange(
  params: {
    shopId: string;
    pairIdx: number;
    /** Offered items taken = bundles × offer_per_lot (always a whole-bundle multiple). */
    units: number;
    ledgerId: string;
    ssuGovId: string;
    tribeGovId: string;
    /** Per-SSU MemberRegistry shared object (V16 — per-role tax lookup). */
    memberRegistryId: string;
    /** Offered items the exchanger RECEIVES from Open Storage post-trade. */
    payoutItems?: EscrowListingRef[];
    /** Requested items the exchanger GIVES to the shop owner pre-trade (barter). */
    giveItems?: EscrowListingRef[];
    /** Exchanger's character shared-object ID (required when items provided). */
    characterId?: string;
    /** Exchanger's SSU ID (required when items provided). */
    ssuId?: string;
    /** Shop owner's character shared-object ID — required for the give-leg
     *  (resolve via useRecipientCharacter(shop.owner, ssuId)). */
    recipientCharacterId?: string;
    /** Exchanger's Character OwnerCap ref — required for the give-leg withdraw
     *  when the exchanger is NOT the SSU owner. */
    charCapRef?: CharOwnerCapRef;
    /** When the exchanger IS the SSU owner, use the Main-Storage cap path. */
    asSSUOwner?: boolean;
    ssuOwnerCapRef?: SSUOwnerCapRef;
  },
  tx: Transaction,
): Transaction {
  // Item flow: give-leg (requested → owner) + offered payout, owner-routing aware.
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

  // Fee + pair-removal Move call.
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.LEDGER_SHOP_OPS}::ledger_de_exchange`,
    arguments: [
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),           // registry: &mut BazarRegistry (V9)
      tx.pure.id(params.shopId),                          // shop_id: ID  (V9)
      tx.pure.u64(BigInt(params.pairIdx)),
      tx.pure.u64(BigInt(params.units)),
      tx.object(params.ledgerId),
      tx.object(params.ssuGovId),
      tx.object(params.tribeGovId),
      tx.object(params.memberRegistryId),                 // member_registry: &MemberRegistry (V16)
      tx.object(SHARED_OBJECTS.ECONOMY_CAP_STORE),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildWithdrawSSUTaxCredits ─────────────────────────────────────────────────

/**
 * SSU owner redeems accumulated ledger tax credits for EVE (SSUOwnerCap gated).
 *
 * Move: bazaar_economy::ledger_shop_ops::withdraw_ssu_tax_credits
 * Sig:  (cap: &SSUOwnerCap, ssu_gov: &SSUGovernance,
 *        ledger: &mut TribeTokenLedger, vault: &mut TribeVault,
 *        config: &ExchangeConfig, token_amount: u64,
 *        clock: &Clock, ctx: &mut TxContext)
 *
 * Burns tokens from the SSU's virtual ledger account.
 * Move internally calls transfer::public_transfer to send EVE to caller.
 * No PTB transferObjects needed.
 * Reserve floor enforced on-chain (SA-004/SDC-002).
 */
export function buildWithdrawSSUTaxCredits(params: {
  ownerCapId: string;
  ssuGovId: string;
  ledgerId: string;
  vaultId: string;
  configId: string;
  /** Accepts bigint so callers stay precision-safe past 2^53 scaled units. */
  tokenAmount: number | bigint;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.LEDGER_SHOP_OPS}::withdraw_ssu_tax_credits`,
    arguments: [
      tx.object(params.ownerCapId),                       // cap: &SSUOwnerCap
      tx.object(params.ssuGovId),                         // ssu_gov: &SSUGovernance
      tx.object(params.ledgerId),                         // ledger: &mut TribeTokenLedger
      tx.object(params.vaultId),                          // vault: &mut TribeVault
      tx.object(params.configId),                         // config: &ExchangeConfig
      tx.pure.u64(BigInt(params.tokenAmount)),            // token_amount: u64
      tx.object("0x6"),                                   // clock: &Clock
    ],
  });
  return tx;
}

// (buildWithdrawTribeTaxCredits DELETED Phase 8 A4 / AUD-ADV-21 — it targeted
//  withdraw_tribe_tax_credits, RETIRED from Move at V16; zero callers.)

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
