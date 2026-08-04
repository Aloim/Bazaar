// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore quicktrade vault TX builders.
 *
 * buildDepositToVault    — deposit item type IDs and quantities into the quicktrade vault.
 * buildWithdrawFromVault — withdraw vault entries by index (no clock param).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

// ── buildDepositToVault ────────────────────────────────────────────────────────

/**
 * Deposit item types and quantities into the quicktrade vault.
 * Move: bazaar_core::quicktrade_vault::deposit_to_vault
 * Sig: (vault: &mut QuicktradeVault, item_type_ids: vector<u64>,
 *        quantities: vector<u64>, clock: &Clock, ctx: &mut TxContext)
 *
 * DA-013 resolution: Does NOT merge duplicates of the same item_type_id —
 * each call appends distinct VaultEntry records. If deduplication is desired,
 * aggregate item_type_ids and quantities before calling.
 * Emits QuicktradeDeposited event.
 * quicktradeVaultId — QuicktradeVault shared object ID.
 */
export function buildDepositToVault(params: {
  quicktradeVaultId: string;
  ssuGovId: string;            // R3.5 — resolved via useSSUGovId hook
  itemTypeIds: number[];
  quantities: number[];
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.QUICKTRADE_VAULT}::deposit_to_vault`,
    arguments: [
      tx.object(params.quicktradeVaultId),                          // vault: &mut QuicktradeVault
      tx.object(params.ssuGovId),                                    // gov: &SSUGovernance (R3.5)
      tx.pure.vector("u64", params.itemTypeIds.map(BigInt)),         // item_type_ids: vector<u64>
      tx.pure.vector("u64", params.quantities.map(BigInt)),          // quantities: vector<u64>
      tx.object("0x6"),                                              // clock: &Clock
    ],
  });
  return tx;
}

// ── buildWithdrawFromVault ─────────────────────────────────────────────────────

/**
 * Withdraw vault entries by their storage indices.
 * Move: bazaar_core::quicktrade_vault::withdraw_from_vault
 * Sig: (vault: &mut QuicktradeVault, entry_indices: vector<u64>, ctx: &mut TxContext)
 *
 * DA-014 resolution: No clock parameter (unlike deposit_to_vault).
 * Indices are sorted descending internally (safe removal). No return value.
 * Actual in-game item credit happens via the EVE Frontier world layer (off-chain reconciliation).
 * Emits QuicktradeWithdrawn event.
 * quicktradeVaultId — QuicktradeVault shared object ID.
 * entryIndices      — indices of vault entries to remove (non-empty vector required).
 */
export function buildWithdrawFromVault(params: {
  quicktradeVaultId: string;
  entryIndices: number[];
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.QUICKTRADE_VAULT}::withdraw_from_vault`,
    arguments: [
      tx.object(params.quicktradeVaultId),                           // vault: &mut QuicktradeVault
      tx.pure.vector("u64", params.entryIndices.map(BigInt)),        // entry_indices: vector<u64>
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
