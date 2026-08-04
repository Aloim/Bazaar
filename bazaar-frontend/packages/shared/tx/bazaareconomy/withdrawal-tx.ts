// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy vault withdrawal TX builders.
 *
 * buildRequestWithdrawal  — TribeLeaderCap: create withdrawal request
 * buildApproveWithdrawal  — TribeAdminCap: approve a pending request
 * buildDenyWithdrawal     — TribeAdminCap: deny a pending request
 * buildExecuteWithdrawal  — TribeLeaderCap: execute after 24h wait + reserve check
 * buildCancelWithdrawal   — TribeLeaderCap: cancel own pending request
 * buildExpireWithdrawal   — PERMISSIONLESS: expire after 72h
 *
 * Move module: bazaar_economy::vault_withdrawal
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

// ── buildRequestWithdrawal ─────────────────────────────────────────────────────

/**
 * Create a vault withdrawal request (TribeLeaderCap gated).
 *
 * Move: bazaar_economy::vault_withdrawal::request_withdrawal
 * Sig:  (cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        board: &mut WithdrawalBoard, vault: &TribeVault,
 *        ledger: &TribeTokenLedger, amount_mist: u64, reason: vector<u8>,
 *        clock: &Clock, ctx: &mut TxContext): u64
 *
 * V15: ledger added so FinanceEvent emit can snapshot circulation alongside reserve.
 * Returns the new request ID (u64). PTB does not need to handle the return value
 * unless the caller wants to capture the ID — it is also emitted in
 * WithdrawalRequestedEvent.
 * reason max length: 200 bytes (REASON_MAX_LEN in Move).
 */
export function buildRequestWithdrawal(params: {
  leaderCapId: string;
  tribeGovernanceId: string;  // R5.2.b.3 — TribeGovernance shared object
  boardId: string;
  vaultId: string;
  ledgerId: string;            // V15 — TribeTokenLedger for FinanceEvent circulation
  amountMist: number;
  reason: string;       // UTF-8, max 200 bytes
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.VAULT_WITHDRAWAL}::request_withdrawal`,
    arguments: [
      tx.object(params.leaderCapId),                      // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),                 // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.boardId),                          // board: &mut WithdrawalBoard [2]
      tx.object(params.vaultId),                          // vault: &TribeVault [3]
      tx.object(params.ledgerId),                         // ledger: &TribeTokenLedger [4] V15
      tx.pure.u64(BigInt(params.amountMist)),             // amount_mist: u64 [5]
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.reason))), // reason [6]
      tx.object("0x6"),                                   // clock: &Clock [7]
    ],
  });
  return tx;
}

// ── buildApproveWithdrawal ─────────────────────────────────────────────────────

/**
 * Approve a pending withdrawal request (TribeAdminCap gated).
 *
 * Move: bazaar_economy::vault_withdrawal::approve_request
 * Sig:  (cap: &TribeAdminCap, tribe_gov: &TribeGovernance,
 *        board: &mut WithdrawalBoard, vault: &TribeVault, ledger: &TribeTokenLedger,
 *        request_id: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * V15: vault + ledger added so the FinanceEvent emitted on quorum-cross can
 *      snapshot eve_reserve + circulation.
 * SA-009: Self-approval prevented on-chain (voter != requester).
 * SA-005: Quorum check uses per-request snapshot, not current board setting.
 */
export function buildApproveWithdrawal(params: {
  adminCapId: string;
  tribeGovernanceId: string;  // R5.2.b.3 — TribeGovernance shared object
  boardId: string;
  vaultId: string;             // V15
  ledgerId: string;            // V15
  requestId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.VAULT_WITHDRAWAL}::approve_request`,
    arguments: [
      tx.object(params.adminCapId),                       // cap: &TribeAdminCap [0]
      tx.object(params.tribeGovernanceId),                 // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.boardId),                          // board: &mut WithdrawalBoard [2]
      tx.object(params.vaultId),                          // vault: &TribeVault [3] V15
      tx.object(params.ledgerId),                         // ledger: &TribeTokenLedger [4] V15
      tx.pure.u64(BigInt(params.requestId)),              // request_id: u64 [5]
      tx.object("0x6"),                                   // clock: &Clock [6]
    ],
  });
  return tx;
}

// ── buildDenyWithdrawal ────────────────────────────────────────────────────────

/**
 * Deny a pending withdrawal request (TribeAdminCap gated).
 *
 * Move: bazaar_economy::vault_withdrawal::deny_request
 * Sig:  (cap: &TribeAdminCap, tribe_gov: &TribeGovernance,
 *        board: &mut WithdrawalBoard, vault: &TribeVault, ledger: &TribeTokenLedger,
 *        request_id: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * V15: vault + ledger added so the FinanceEvent emitted on denial-quorum can
 *      snapshot eve_reserve + circulation.
 */
export function buildDenyWithdrawal(params: {
  adminCapId: string;
  tribeGovernanceId: string;  // R5.2.b.3 — TribeGovernance shared object
  boardId: string;
  vaultId: string;             // V15
  ledgerId: string;            // V15
  requestId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.VAULT_WITHDRAWAL}::deny_request`,
    arguments: [
      tx.object(params.adminCapId),                       // cap: &TribeAdminCap [0]
      tx.object(params.tribeGovernanceId),                 // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.boardId),                          // board: &mut WithdrawalBoard [2]
      tx.object(params.vaultId),                          // vault: &TribeVault [3] V15
      tx.object(params.ledgerId),                         // ledger: &TribeTokenLedger [4] V15
      tx.pure.u64(BigInt(params.requestId)),              // request_id: u64 [5]
      tx.object("0x6"),                                   // clock: &Clock [6]
    ],
  });
  return tx;
}

// ── buildExecuteWithdrawal ─────────────────────────────────────────────────────

/**
 * Execute an approved withdrawal after the 24h wait period (TribeLeaderCap gated).
 *
 * Move: bazaar_economy::vault_withdrawal::execute_withdrawal
 * Sig:  (cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        board: &mut WithdrawalBoard, vault: &mut TribeVault,
 *        config: &ExchangeConfig, ledger: &TribeTokenLedger,
 *        request_id: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * V15: ledger added so FinanceEvent emit can snapshot circulation alongside the
 *      actual vault delta (eve_reserve_before / _after move on execute).
 * Move calls transfer::public_transfer internally for the EVE coin — no PTB
 * transferObjects needed.
 * Reserve floor enforced on-chain (SA-004/SDC-001).
 */
export function buildExecuteWithdrawal(params: {
  leaderCapId: string;
  tribeGovernanceId: string;  // R5.2.b.3 — TribeGovernance shared object
  boardId: string;
  vaultId: string;
  configId: string;
  ledgerId: string;            // V15
  requestId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.VAULT_WITHDRAWAL}::execute_withdrawal`,
    arguments: [
      tx.object(params.leaderCapId),                      // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),                 // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.boardId),                          // board: &mut WithdrawalBoard [2]
      tx.object(params.vaultId),                          // vault: &mut TribeVault [3]
      tx.object(params.configId),                         // config: &ExchangeConfig [4]
      tx.object(params.ledgerId),                         // ledger: &TribeTokenLedger [5] V15
      tx.pure.u64(BigInt(params.requestId)),              // request_id: u64 [6]
      tx.object("0x6"),                                   // clock: &Clock [7]
    ],
  });
  return tx;
}

// ── buildCancelWithdrawal ──────────────────────────────────────────────────────

/**
 * Cancel a pending withdrawal request (only the original requester can cancel).
 *
 * Move: bazaar_economy::vault_withdrawal::cancel_request
 * Sig:  (cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        board: &mut WithdrawalBoard, vault: &TribeVault, ledger: &TribeTokenLedger,
 *        request_id: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * V15: vault + ledger added so FinanceEvent emit can snapshot reserve + circulation.
 * On-chain check: sender == request.requester (E_NOT_TRIBE_LEADER error).
 */
export function buildCancelWithdrawal(params: {
  leaderCapId: string;
  tribeGovernanceId: string;  // R5.2.b.3 — TribeGovernance shared object
  boardId: string;
  vaultId: string;             // V15
  ledgerId: string;            // V15
  requestId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.VAULT_WITHDRAWAL}::cancel_request`,
    arguments: [
      tx.object(params.leaderCapId),                      // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),                 // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.boardId),                          // board: &mut WithdrawalBoard [2]
      tx.object(params.vaultId),                          // vault: &TribeVault [3] V15
      tx.object(params.ledgerId),                         // ledger: &TribeTokenLedger [4] V15
      tx.pure.u64(BigInt(params.requestId)),              // request_id: u64 [5]
      tx.object("0x6"),                                   // clock: &Clock [6]
    ],
  });
  return tx;
}

// ── buildExpireWithdrawal ──────────────────────────────────────────────────────

/**
 * Mark a pending request as EXPIRED after the 72h expiry window (PERMISSIONLESS).
 *
 * Move: bazaar_economy::vault_withdrawal::expire_request
 * Sig:  (tribe_gov: &TribeGovernance, board: &mut WithdrawalBoard,
 *        vault: &TribeVault, ledger: &TribeTokenLedger,
 *        request_id: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * V15: vault + ledger added so FinanceEvent emit can snapshot reserve + circulation.
 * No cap required. Anyone can call this after expires_at_ms has passed.
 * Only works on STATUS_PENDING requests — aborts for any other status.
 */
export function buildExpireWithdrawal(params: {
  tribeGovernanceId: string;  // R5.2.b.3 — FIRST param (no cap for this fn)
  boardId: string;
  vaultId: string;             // V15
  ledgerId: string;            // V15
  requestId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.VAULT_WITHDRAWAL}::expire_request`,
    arguments: [
      tx.object(params.tribeGovernanceId),                 // tribe_gov: &TribeGovernance [0] R5.2
      tx.object(params.boardId),                          // board: &mut WithdrawalBoard [1]
      tx.object(params.vaultId),                          // vault: &TribeVault [2] V15
      tx.object(params.ledgerId),                         // ledger: &TribeTokenLedger [3] V15
      tx.pure.u64(BigInt(params.requestId)),              // request_id: u64 [4]
      tx.object("0x6"),                                   // clock: &Clock [5]
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
