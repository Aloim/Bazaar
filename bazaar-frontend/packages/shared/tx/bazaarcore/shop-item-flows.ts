// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * tx/bazaarcore/shop-item-flows.ts — Higher-level shop item-movement flows built
 * on the low-level escrow primitives in shop-escrow-helpers.ts.
 *
 * Extracted from shop-escrow-helpers.ts to keep that file under the 500-line guard.
 *
 *  - payoutOpenStorageItems — withdraw payout items from Open Storage and deposit
 *    to the receiver (Main Storage when SSU owner, else Player Locker). Used by
 *    WTS buy payouts.
 *  - buildDEBarterItemFlow — full Direct-Exchange item movement for one pair:
 *    give-leg (requested → owner) + offered payout, owner-routing aware. Shared by
 *    the NoTribe/Easy and Advanced DE builders.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import {
  ssuWithdrawFromOpenInventory,
  ssuDepositToOwned,
  ssuDepositByOwnerSU,
  ssuWithdrawByOwner,
  ssuWithdrawByOwnerSU,
  charBorrowOwnerCap,
  charReturnOwnerCap,
  type CharOwnerCapRef,
} from "./shop-escrow-helpers";
import { borrowSSUOwnerCap, returnSSUOwnerCap, type SSUOwnerCapRef } from "./ssu-receiving-tx";

// ── Post-trade payout from Open Storage (owner-routing aware) ─────────────────

/**
 * Withdraw each payout item from the SSU's Open Storage and deposit it to the
 * RECEIVING character — routing to Main Storage when that character is the SSU
 * owner, otherwise to their Player Locker.
 *
 *  - SSU owner branch (asSSUOwner): borrow OwnerCap<StorageUnit> and deposit via
 *    `deposit_by_owner<StorageUnit>` (Main Storage). Requires the sender to own
 *    the character (true for buy/exchange payouts where receiver === sender).
 *  - Default branch: deposit via `deposit_to_owned<BazarAuth>` (Player Locker).
 *
 * Mirrors the W3-3 inline branch in `buildWTSBuy` (shop-trade-tx.ts). Used by
 * `buildLedgerWTSBuy` (Advanced WTS payout).
 */
export function payoutOpenStorageItems(
  tx: Transaction,
  params: {
    ssuId: string;
    characterId: string;
    items: Array<{ typeId: number; quantity: number }>;
    asSSUOwner?: boolean;
    ssuOwnerCapRef?: SSUOwnerCapRef;
  },
): void {
  if (params.asSSUOwner) {
    if (!params.ssuOwnerCapRef) {
      throw new Error(
        "[payoutOpenStorageItems] asSSUOwner=true requires ssuOwnerCapRef. " +
        "Resolve via resolveSSUOwnerCap before calling.",
      );
    }
    const { ownerCap, receipt } = borrowSSUOwnerCap(
      tx, params.characterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );
    for (const slot of params.items) {
      const item = ssuWithdrawFromOpenInventory(tx, params.ssuId, params.characterId, slot.typeId, slot.quantity);
      ssuDepositByOwnerSU(tx, params.ssuId, params.characterId, ownerCap, item);
    }
    returnSSUOwnerCap(tx, params.characterId, ownerCap, receipt);
  } else {
    for (const slot of params.items) {
      const item = ssuWithdrawFromOpenInventory(tx, params.ssuId, params.characterId, slot.typeId, slot.quantity);
      ssuDepositToOwned(tx, params.ssuId, params.characterId, item);
    }
  }
}

// ── DE true-barter item flow (give-leg + offered payout, owner-routing aware) ──

/**
 * Full Direct-Exchange item movement for ONE pair, shared by the NoTribe/Easy
 * (`buildDEExchange`) and Advanced (`buildLedgerDEExchange`) builders so both
 * behave identically:
 *
 *   GIVE-leg : withdraw the REQUESTED items from the exchanger's locker and
 *              deliver them to the shop owner.
 *   PAYOUT   : withdraw the OFFERED items from Open Storage into the exchanger's
 *              locker.
 *
 * Locker routing (3 SSU tiers: Open / Player Locker / Main):
 *   - Exchanger IS the SSU owner (asSSUOwner) → withdraw from / deposit to Main
 *     Storage via OwnerCap<StorageUnit>. A self-trade gives the requested items
 *     back to the owner's own Main (degenerate round-trip).
 *   - Regular player → Player Locker via OwnerCap<Character>; requested items are
 *     delivered to the owner's Player Locker via deposit_to_owned.
 *
 * Both legs that need the SSU OwnerCap run inside a SINGLE borrow/return so the
 * same cap is not received twice in one PTB (stale-version failure).
 *
 * The caller emits the Move fee/pair-removal call separately (order is immaterial
 * — the Move call moves only tokens + the pair record, never items).
 */
export function buildDEBarterItemFlow(
  tx: Transaction,
  params: {
    ssuId: string;
    characterId: string;
    /** Shop owner's character — give-leg delivery target. */
    recipientCharacterId?: string;
    /** Requested items the exchanger gives to the owner. */
    giveItems: Array<{ typeId: number; quantity: number }>;
    /** Offered items the exchanger receives from Open Storage. */
    payoutItems: Array<{ typeId: number; quantity: number }>;
    asSSUOwner?: boolean;
    ssuOwnerCapRef?: SSUOwnerCapRef;
    charCapRef?: CharOwnerCapRef;
  },
): void {
  const selfTrade =
    !!params.recipientCharacterId && params.recipientCharacterId === params.characterId;

  if (params.asSSUOwner) {
    if (!params.ssuOwnerCapRef) {
      throw new Error("[buildDEBarterItemFlow] asSSUOwner=true requires ssuOwnerCapRef.");
    }
    const { ownerCap, receipt } = borrowSSUOwnerCap(
      tx, params.characterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );
    for (const slot of params.giveItems) {
      const item = ssuWithdrawByOwnerSU(tx, params.ssuId, params.characterId, ownerCap, slot.typeId, slot.quantity);
      if (selfTrade) {
        ssuDepositByOwnerSU(tx, params.ssuId, params.characterId, ownerCap, item);
      } else if (params.recipientCharacterId) {
        ssuDepositToOwned(tx, params.ssuId, params.recipientCharacterId, item);
      }
    }
    for (const slot of params.payoutItems) {
      const item = ssuWithdrawFromOpenInventory(tx, params.ssuId, params.characterId, slot.typeId, slot.quantity);
      ssuDepositByOwnerSU(tx, params.ssuId, params.characterId, ownerCap, item);
    }
    returnSSUOwnerCap(tx, params.characterId, ownerCap, receipt);
    return;
  }

  // Regular-player path.
  if (params.giveItems.length && params.charCapRef && params.recipientCharacterId) {
    const { ownerCap, receipt } = charBorrowOwnerCap(tx, params.characterId, params.charCapRef);
    for (const slot of params.giveItems) {
      const item = ssuWithdrawByOwner(tx, params.ssuId, params.characterId, ownerCap, slot.typeId, slot.quantity);
      ssuDepositToOwned(tx, params.ssuId, params.recipientCharacterId, item);
    }
    charReturnOwnerCap(tx, params.characterId, ownerCap, receipt);
  }
  for (const slot of params.payoutItems) {
    const item = ssuWithdrawFromOpenInventory(tx, params.ssuId, params.characterId, slot.typeId, slot.quantity);
    ssuDepositToOwned(tx, params.ssuId, params.characterId, item);
  }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
