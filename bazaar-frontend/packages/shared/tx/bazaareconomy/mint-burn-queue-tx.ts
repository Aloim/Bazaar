// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy mint/burn queue TX builders (V16).
 *
 * Replaces the retired economy_governance::mint_supply + burn_tokens immediate
 * entries with a 24h-wait + single-rejection-veto queue. Each action has a
 * Leader variant + Admin variant; the Move side validates the cap's tribe_id
 * against the TribeGovernance before delegating to a shared helper.
 *
 *   buildRequestMintAsLeader / buildRequestMintAsAdmin
 *   buildRequestBurnAsLeader / buildRequestBurnAsAdmin
 *   buildExecuteRequestAsLeader / buildExecuteRequestAsAdmin
 *   buildRejectRequestAsLeader / buildRejectRequestAsAdmin
 *
 * Move module: bazaar_economy::mint_burn_queue
 *
 * Burn target is hardwired on-chain to `object::id_address(tribe_gov)` — the
 * tribe wallet — so burn builders do NOT take a target address.
 *
 * Execute-time mint blocking: chain state may shift across the 24h window, so
 * the Move side re-checks Article XIII.4 (vault > reserve) at execute. If a
 * mint was approved when the vault was healthy but is no longer healthy at
 * execute time, the call aborts with E_MINTING_BLOCKED.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

const MOD = `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MINT_BURN_QUEUE}`;

// ── Request Mint ──────────────────────────────────────────────────────────────

/**
 * Request to mint tribe tokens (TribeLeaderCap variant).
 *
 * Move: bazaar_economy::mint_burn_queue::request_mint_as_leader
 * Sig:  (cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        queue: &mut MintBurnQueue, vault: &TribeVault, ledger: &TribeTokenLedger,
 *        config: &ExchangeConfig, amount: u64, clock: &Clock, ctx: &mut TxContext): u64
 *
 * Article XIII.4: aborts with E_MINTING_BLOCKED if vault <= reserve.
 * Tokens are credited to the tribe wallet (gov-object address) on execute.
 * Returns the new request_id (also surfaced by MintBurnRequestedEvent).
 */
export function buildRequestMintAsLeader(params: {
  leaderCapId: string;
  tribeGovernanceId: string;
  queueId: string;
  vaultId: string;
  ledgerId: string;
  configId: string;
  amount: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${MOD}::request_mint_as_leader`,
    arguments: [
      tx.object(params.leaderCapId),         // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),   // tribe_gov: &TribeGovernance [1]
      tx.object(params.queueId),             // queue: &mut MintBurnQueue [2]
      tx.object(params.vaultId),             // vault: &TribeVault [3]
      tx.object(params.ledgerId),            // ledger: &TribeTokenLedger [4]
      tx.object(params.configId),            // config: &ExchangeConfig [5]
      tx.pure.u64(BigInt(params.amount)),    // amount: u64 [6]
      tx.object("0x6"),                      // clock: &Clock [7]
    ],
  });
  return tx;
}

/**
 * Request to mint tribe tokens (TribeSuperAdminCap variant).
 *
 * Move: bazaar_economy::mint_burn_queue::request_mint_as_admin
 * Same signature as leader variant but takes a `TribeSuperAdminCap` instead.
 */
export function buildRequestMintAsAdmin(params: {
  superAdminCapId: string;
  tribeGovernanceId: string;
  queueId: string;
  vaultId: string;
  ledgerId: string;
  configId: string;
  amount: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${MOD}::request_mint_as_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.tribeGovernanceId),
      tx.object(params.queueId),
      tx.object(params.vaultId),
      tx.object(params.ledgerId),
      tx.object(params.configId),
      tx.pure.u64(BigInt(params.amount)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Request Burn ──────────────────────────────────────────────────────────────

/**
 * Request to burn tribe tokens FROM THE TRIBE WALLET (TribeLeaderCap variant).
 *
 * Move: bazaar_economy::mint_burn_queue::request_burn_as_leader
 * Sig:  (cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        queue: &mut MintBurnQueue, ledger: &TribeTokenLedger, vault: &TribeVault,
 *        amount: u64, clock: &Clock, ctx: &mut TxContext): u64
 *
 * Note: the burn target is hardwired to `object::id_address(tribe_gov)` — the
 * tribe wallet. To burn from an arbitrary address use the deprecated
 * `economy_governance::burn_tokens` (V15-only, retired in V16).
 *
 * Aborts with E_INSUFFICIENT_WALLET if the tribe wallet balance < amount.
 */
export function buildRequestBurnAsLeader(params: {
  leaderCapId: string;
  tribeGovernanceId: string;
  queueId: string;
  ledgerId: string;
  vaultId: string;
  amount: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${MOD}::request_burn_as_leader`,
    arguments: [
      tx.object(params.leaderCapId),         // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),   // tribe_gov: &TribeGovernance [1]
      tx.object(params.queueId),             // queue: &mut MintBurnQueue [2]
      tx.object(params.ledgerId),            // ledger: &TribeTokenLedger [3]
      tx.object(params.vaultId),             // vault: &TribeVault [4]
      tx.pure.u64(BigInt(params.amount)),    // amount: u64 [5]
      tx.object("0x6"),                      // clock: &Clock [6]
    ],
  });
  return tx;
}

/**
 * Request to burn tribe tokens (TribeSuperAdminCap variant).
 */
export function buildRequestBurnAsAdmin(params: {
  superAdminCapId: string;
  tribeGovernanceId: string;
  queueId: string;
  ledgerId: string;
  vaultId: string;
  amount: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${MOD}::request_burn_as_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.tribeGovernanceId),
      tx.object(params.queueId),
      tx.object(params.ledgerId),
      tx.object(params.vaultId),
      tx.pure.u64(BigInt(params.amount)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Execute Request ───────────────────────────────────────────────────────────

/**
 * Execute a pending mint/burn request after the 24h wait (TribeLeaderCap variant).
 *
 * Move: bazaar_economy::mint_burn_queue::execute_request_as_leader
 * Sig:  (cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        queue: &mut MintBurnQueue, ledger: &mut TribeTokenLedger,
 *        vault: &TribeVault, config: &ExchangeConfig, request_id: u64,
 *        clock: &Clock, ctx: &mut TxContext)
 *
 * Re-checks Article XIII.4 (mint) / wallet balance (burn) at execute-time —
 * chain state may have shifted during the 24h window. Aborts with
 * E_WAIT_PERIOD_ACTIVE if called too early, E_INVALID_STATUS if already
 * executed/rejected.
 */
export function buildExecuteRequestAsLeader(params: {
  leaderCapId: string;
  tribeGovernanceId: string;
  queueId: string;
  ledgerId: string;
  vaultId: string;
  configId: string;
  requestId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${MOD}::execute_request_as_leader`,
    arguments: [
      tx.object(params.leaderCapId),         // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),   // tribe_gov: &TribeGovernance [1]
      tx.object(params.queueId),             // queue: &mut MintBurnQueue [2]
      tx.object(params.ledgerId),            // ledger: &mut TribeTokenLedger [3]
      tx.object(params.vaultId),             // vault: &TribeVault [4]
      tx.object(params.configId),            // config: &ExchangeConfig [5]
      tx.pure.u64(BigInt(params.requestId)), // request_id: u64 [6]
      tx.object("0x6"),                      // clock: &Clock [7]
    ],
  });
  return tx;
}

/**
 * Execute a pending request (TribeSuperAdminCap variant).
 */
export function buildExecuteRequestAsAdmin(params: {
  superAdminCapId: string;
  tribeGovernanceId: string;
  queueId: string;
  ledgerId: string;
  vaultId: string;
  configId: string;
  requestId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${MOD}::execute_request_as_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.tribeGovernanceId),
      tx.object(params.queueId),
      tx.object(params.ledgerId),
      tx.object(params.vaultId),
      tx.object(params.configId),
      tx.pure.u64(BigInt(params.requestId)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Reject Request ────────────────────────────────────────────────────────────

/**
 * Reject (veto) a pending mint/burn request (TribeLeaderCap variant).
 *
 * Move: bazaar_economy::mint_burn_queue::reject_request_as_leader
 * Sig:  (cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        queue: &mut MintBurnQueue, vault: &TribeVault, ledger: &TribeTokenLedger,
 *        request_id: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * Single-rejection veto — works DURING the 24h wait AND after, as long as the
 * request is still PENDING. Once executed/rejected, further reject calls abort.
 */
export function buildRejectRequestAsLeader(params: {
  leaderCapId: string;
  tribeGovernanceId: string;
  queueId: string;
  vaultId: string;
  ledgerId: string;
  requestId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${MOD}::reject_request_as_leader`,
    arguments: [
      tx.object(params.leaderCapId),         // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),   // tribe_gov: &TribeGovernance [1]
      tx.object(params.queueId),             // queue: &mut MintBurnQueue [2]
      tx.object(params.vaultId),             // vault: &TribeVault [3]
      tx.object(params.ledgerId),            // ledger: &TribeTokenLedger [4]
      tx.pure.u64(BigInt(params.requestId)), // request_id: u64 [5]
      tx.object("0x6"),                      // clock: &Clock [6]
    ],
  });
  return tx;
}

/**
 * Reject (veto) a pending request (TribeSuperAdminCap variant).
 */
export function buildRejectRequestAsAdmin(params: {
  superAdminCapId: string;
  tribeGovernanceId: string;
  queueId: string;
  vaultId: string;
  ledgerId: string;
  requestId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${MOD}::reject_request_as_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.tribeGovernanceId),
      tx.object(params.queueId),
      tx.object(params.vaultId),
      tx.object(params.ledgerId),
      tx.pure.u64(BigInt(params.requestId)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Status constants (mirror Move) ────────────────────────────────────────────

export const MINT_BURN_STATUS = {
  PENDING:  0,
  EXECUTED: 1,
  REJECTED: 2,
} as const;

export const MINT_BURN_KIND = {
  MINT: 0,
  BURN: 1,
} as const;

/** 24h wait period — must match Move constant `WAIT_PERIOD_MS`. */
export const MINT_BURN_WAIT_PERIOD_MS = 86_400_000;

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
