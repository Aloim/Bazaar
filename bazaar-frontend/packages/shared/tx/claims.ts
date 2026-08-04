// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * tx/claims.ts — Claim transaction builders for Phase C MVP.
 *
 * Wraps bazaar_core::user_storage::claim_unclaimed_item — the REAL current
 * Move signature (per-SSU, shop-id-keyed). NOT a port of the Bazar1
 * bazar_claims module (which does not exist in this monorepo).
 *
 * Constitution II.5: matches exact on-chain signature. No cross-package imports
 * beyond @bazaar/shared constants and @mysten/sui.
 *
 * Deferred (FP1-02): buildAdminClaimForUser, buildConfiscateUnclaimed —
 * these target the unbuilt bazar_claims module and must not ship here.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS } from "../constants";

/**
 * Wraps bazaar_core::user_storage::claim_unclaimed_item.
 *
 * Move signature (BazaarCore/sources/user_storage.move:163-177):
 *   public fun claim_unclaimed_item(
 *     storage: &mut UserStorage,
 *     shop_id: ID,
 *     clock: &Clock,
 *     ctx: &mut TxContext,
 *   )
 *
 * @param userStorageId - Per-SSU UserStorage shared object ID.
 *   Resolved from bootstrap_ssu_objects output (MA-FP2-C-001).
 *   MVP (G2-B): callers pass this as a URL param alongside ssuId.
 *
 * @param shopId - ID key of the UnclaimedItem inside UserStorage.unclaimed_items.
 *   This is the shop_id field from the UnclaimedItem struct — the shop that
 *   deposited the unclaimed item, which is used as the table key.
 *
 * @param clockId - Sui Clock shared object ID. Defaults to "0x6".
 *
 * @returns A Transaction (PTB) ready for signAndExecuteTransaction.
 */
export function buildClaimUnclaimedItem(
  userStorageId: string,
  shopId:        string,
  clockId = "0x6",
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::user_storage::claim_unclaimed_item`,
    arguments: [
      tx.object(userStorageId),
      tx.pure.id(shopId),
      tx.object(clockId),
    ],
  });

  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
