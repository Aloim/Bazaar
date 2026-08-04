// bazaar-frontend | TX builders for the permissionless SSU depreciation mark entries
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V41 SSU depreciation — Phase A "mark" TX builders.
 * Move: bazaar_core::ssu_depreciation::{mark_ssu_revealed, mark_ssu_depreciated}.
 * BOTH entries are PERMISSIONLESS (no cap argument) — any wallet may call them.
 *
 * Documentation/plans/implementation/ssu-depreciation-prune-plan.md §2.2/§5.
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, WORLD_LOCATION_REGISTRY_ID, SUI_CLOCK_ID } from "../../constants";

export interface MarkSsuRevealedParams {
  ssuGovId: string;
  locationRegistryId?: string;
}

/** Move: bazaar_core::ssu_depreciation::mark_ssu_revealed(gov, loc_registry).
 *  No clock arg — matches the 2-arg Move signature exactly. Idempotent. */
export function buildMarkSsuRevealed(
  params: MarkSsuRevealedParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_DEPRECIATION}::mark_ssu_revealed`,
    arguments: [
      tx.object(params.ssuGovId),
      tx.object(params.locationRegistryId ?? WORLD_LOCATION_REGISTRY_ID),
    ],
  });
  return tx;
}

export interface MarkSsuDepreciatedParams {
  ssuGovId: string;
  locationRegistryId?: string;
}

/** Move: bazaar_core::ssu_depreciation::mark_ssu_depreciated(gov, loc_registry, clock, ctx).
 *  Idempotent; aborts E_NOT_REVEALED(1) if location_revealed is still false,
 *  E_STILL_ANCHORED(2) if world::location still resolves Some for this SSU. */
export function buildMarkSsuDepreciated(
  params: MarkSsuDepreciatedParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_DEPRECIATION}::mark_ssu_depreciated`,
    arguments: [
      tx.object(params.ssuGovId),
      tx.object(params.locationRegistryId ?? WORLD_LOCATION_REGISTRY_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

/**
 * Composite convenience: mark_ssu_revealed THEN mark_ssu_depreciated in the SAME
 * PTB. Sequential Move calls within one PTB observe each other's writes, so this
 * avoids a two-transaction race where mark_ssu_depreciated's E_NOT_REVEALED assert
 * could fire before a separate mark_ssu_revealed tx has landed. Safe to call every
 * time — both entries are idempotent no-ops once their condition is already true.
 */
export function buildMarkSsuDepreciatedSequence(
  params: MarkSsuDepreciatedParams,
  tx: Transaction = new Transaction(),
): Transaction {
  buildMarkSsuRevealed({ ssuGovId: params.ssuGovId, locationRegistryId: params.locationRegistryId }, tx);
  buildMarkSsuDepreciated(params, tx);
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
