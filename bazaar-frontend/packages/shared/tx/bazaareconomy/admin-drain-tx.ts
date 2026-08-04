// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — BazaarEconomy admin TX builders.
 *
 * Targets the 3 DAppOwnerCap-gated drain entries on `bazaar_economy`:
 *   - `advanced_direct_trade::cancel_advanced_trade_proposals_batch` (Phase B entry 4)
 *   - `vault_withdrawal_drain::cancel_vault_withdrawals_batch` (Phase B entry 5)
 *   - `tribe_vault::drain_tribe_vault` (Variant B per-vault emergency)
 *
 * All target Advanced-tribe shared objects. FE iterates tribes; one call per
 * `AdvancedTradeRegistry`, one per `WithdrawalBoard`, one per `TribeVault`.
 *
 * File limit: 500 lines | Constitution Article XIV.4 (exempt under UpdateCeremonyPlan).
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, SUI_CLOCK_ID, v36Enabled } from "@bazaar/shared/constants";

// ─── cancel_advanced_trade_proposals_batch ───────────────────────────────────

/**
 * Admin cancels every still-PENDING AdvancedTradeProposal in `proposalIds`.
 * Refunds proposer EVE escrow + mints back burned offer tokens via the
 * existing `refund_proposer` primitive.
 *
 * Move: bazaar_economy::advanced_direct_trade::cancel_advanced_trade_proposals_batch
 */
export function buildCancelAdvancedTradeProposalsBatch(
  params: {
    ownerCapId: string;
    advancedTradeRegistryId: string;
    ssuGovId: string;
    /** V36 only — Advanced tribe's TribeGovernance id (binding check; ungated admin drain). */
    tribeGovId?: string;
    ledgerId: string;
    proposalIds: string[];
  },
  tx: Transaction = new Transaction(),
): Transaction {
  // V36 R-C: tribe_gov added at slot 3 (after ssu_gov, before ledger). Ungated drain path.
  const isV36 = v36Enabled();
  if (isV36 && !params.tribeGovId) {
    throw new Error("cancel_advanced_trade_proposals_batch (V36) requires tribeGovId");
  }
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ADVANCED_DIRECT_TRADE}::cancel_advanced_trade_proposals_batch`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.advancedTradeRegistryId),
      tx.object(params.ssuGovId),
      ...(isV36 ? [tx.object(params.tribeGovId!)] : []), // tribe_gov (slot 3, V36)
      tx.object(params.ledgerId),
      tx.pure.vector("address", params.proposalIds),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── cancel_vault_withdrawals_batch ──────────────────────────────────────────

/**
 * Admin cancels every still-open (PENDING or APPROVED-but-not-executed)
 * withdrawal request on a tribe's WithdrawalBoard. Silent-skip on absent /
 * terminal-status rows.
 *
 * Move: bazaar_economy::vault_withdrawal_drain::cancel_vault_withdrawals_batch
 */
export function buildCancelVaultWithdrawalsBatch(
  params: {
    ownerCapId: string;
    withdrawalBoardId: string;
    vaultId: string;
    ledgerId: string;
    requestIds: Array<number | bigint>;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  const ids = params.requestIds.map((r) => (typeof r === "bigint" ? r : BigInt(r)));
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.VAULT_WITHDRAWAL_DRAIN}::cancel_vault_withdrawals_batch`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.withdrawalBoardId),
      tx.object(params.vaultId),
      tx.object(params.ledgerId),
      tx.pure.vector("u64", ids),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── drain_tribe_vault (Variant B per-vault emergency) ───────────────────────

/**
 * Variant B emergency — drains the entire TribeVault EVE balance to `recipient`.
 * Bypasses `is_locked` intentionally. Silent no-op (no event) at zero balance;
 * non-zero drains reuse VaultWithdrawEvent with `source = "emergency_drain"`.
 *
 * Move: bazaar_economy::tribe_vault::drain_tribe_vault
 */
export function buildDrainTribeVault(
  params: {
    ownerCapId: string;
    vaultId: string;
    recipient: string;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_VAULT}::drain_tribe_vault`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.vaultId),
      tx.pure.address(params.recipient),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
