// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore Quicktrade Basket TX builders — the V12-additive flow that
 * physically escrows items into the SSU's Open Storage (rather than the
 * legacy `deposit_to_vault` ledger which only tracks counters).
 *
 * Tier-asymmetric:
 *   - Non-owner member: items source/destination is **Player Locker**
 *     (withdraw_by_owner<Character> on the way in,
 *      deposit_to_owned<BazarAuth>  on the way out).
 *   - SSU owner:        items source/destination is **Main Storage**
 *     (withdraw_by_owner<StorageUnit> on the way in,
 *      deposit_by_owner<StorageUnit>  on the way out).
 *
 * Move targets (added in the same upgrade as this file):
 *   bazaar_core::quicktrade_vault::basket_deposit
 *   bazaar_core::quicktrade_vault::basket_withdraw_to_locker
 *   bazaar_core::quicktrade_vault::basket_withdraw_to_main
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS } from "../../constants";
import {
  charBorrowOwnerCap,
  charReturnOwnerCap,
  ssuWithdrawByOwner,
  ssuWithdrawByOwnerSU,
  type CharOwnerCapRef,
} from "./shop-escrow-helpers";
import { borrowSSUOwnerCap, returnSSUOwnerCap, type SSUOwnerCapRef } from "./ssu-receiving-tx";

const QUICKTRADE_MODULE = "quicktrade_vault" as const;

interface BasketItemSlot {
  typeId:   number;
  quantity: number;
}

interface BasketCommon {
  quicktradeVaultId: string;
  ssuGovId:          string;
  ssuId:             string;
  characterId:       string;
  memberRegistryId:  string;
}

/**
 * Deposit one or more items into the basket. Items are withdrawn from the
 * caller's locker tier (Main Storage if `ssuOwnerCapRef` is provided, otherwise
 * Player Locker) and handed to `basket_deposit`, which escrows them into the
 * SSU's Open Storage and bumps per-typeId counters held as dynamic fields on
 * the vault object.
 */
export function buildBasketDeposit(params: BasketCommon & {
  items: BasketItemSlot[];
  /** Non-owner member path: Player-Locker withdraw via Character cap. */
  charCapRef?:     CharOwnerCapRef;
  /** SSU-owner path: Main-Storage withdraw via StorageUnit cap. Takes priority over charCapRef. */
  ssuOwnerCapRef?: SSUOwnerCapRef;
}): Transaction {
  if (params.items.length === 0) {
    throw new Error("[buildBasketDeposit] items list is empty.");
  }
  if (!params.ssuOwnerCapRef && !params.charCapRef) {
    throw new Error("[buildBasketDeposit] must provide either ssuOwnerCapRef (owner) or charCapRef (member).");
  }
  const tx = new Transaction();

  // Pre-step: withdraw each item from the right tier into PTB-local Item handles.
  const items: Array<ReturnType<Transaction["moveCall"]>[0]> = [];
  if (params.ssuOwnerCapRef) {
    // Main-Storage tier (SSU owner): borrow SSU owner cap once, withdraw each item, return cap.
    const { ownerCap, receipt } = borrowSSUOwnerCap(
      tx,
      params.characterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );
    for (const slot of params.items) {
      const item = ssuWithdrawByOwnerSU(
        tx, params.ssuId, params.characterId, ownerCap, slot.typeId, slot.quantity,
      );
      items.push(item);
    }
    returnSSUOwnerCap(tx, params.characterId, ownerCap, receipt);
  } else {
    // Player-Locker tier (non-owner member): borrow char cap once, withdraw each item, return cap.
    const { ownerCap, receipt } = charBorrowOwnerCap(tx, params.characterId, params.charCapRef!);
    for (const slot of params.items) {
      const item = ssuWithdrawByOwner(
        tx, params.ssuId, params.characterId, ownerCap, slot.typeId, slot.quantity,
      );
      items.push(item);
    }
    charReturnOwnerCap(tx, params.characterId, ownerCap, receipt);
  }

  const itemsVec = tx.makeMoveVec({ elements: items });
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${QUICKTRADE_MODULE}::basket_deposit`,
    arguments: [
      tx.object(params.quicktradeVaultId),
      tx.object(params.ssuGovId),
      tx.object(params.ssuId),
      tx.object(params.characterId),
      tx.object(params.memberRegistryId),
      itemsVec,
    ],
  });
  return tx;
}

/**
 * Withdraw one typeId/quantity from the basket back into the caller's locker tier.
 * Dispatches to `basket_withdraw_to_main` when an SSU owner cap is provided,
 * otherwise to `basket_withdraw_to_locker` (non-owner member).
 */
export function buildBasketWithdraw(params: BasketCommon & {
  typeId:   number;
  quantity: number;
  /** SSU-owner path: required to deposit into Main Storage. */
  ssuOwnerCapRef?: SSUOwnerCapRef;
}): Transaction {
  if (!Number.isInteger(params.quantity) || params.quantity <= 0 || params.quantity > 0xFFFFFFFF) {
    throw new Error(`[buildBasketWithdraw] quantity must be a positive u32 integer, got: ${params.quantity}`);
  }
  const tx = new Transaction();

  if (params.ssuOwnerCapRef) {
    // SSU-owner path — Main Storage destination.
    const { ownerCap, receipt } = borrowSSUOwnerCap(
      tx,
      params.characterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_CORE}::${QUICKTRADE_MODULE}::basket_withdraw_to_main`,
      arguments: [
        tx.object(params.quicktradeVaultId),
        tx.object(params.ssuGovId),
        tx.object(params.ssuId),
        tx.object(params.characterId),
        tx.object(params.memberRegistryId),
        ownerCap,
        tx.pure.u64(BigInt(params.typeId)),
        tx.pure.u32(params.quantity),
      ],
    });
    returnSSUOwnerCap(tx, params.characterId, ownerCap, receipt);
  } else {
    // Non-owner-member path — Player Locker destination.
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_CORE}::${QUICKTRADE_MODULE}::basket_withdraw_to_locker`,
      arguments: [
        tx.object(params.quicktradeVaultId),
        tx.object(params.ssuGovId),
        tx.object(params.ssuId),
        tx.object(params.characterId),
        tx.object(params.memberRegistryId),
        tx.pure.u64(BigInt(params.typeId)),
        tx.pure.u32(params.quantity),
      ],
    });
  }
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
