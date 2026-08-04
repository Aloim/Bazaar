// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore trade TX builders — 5 single-phase MVP builders.
 *
 * Populates the Phase E stubs (Option A resolution per FA-FP2-E-001 §2.3).
 * Move target: bazaar_core::trade (trade.move L.119-248).
 * Status constants (trade.move L.16-20): PENDING=0, ACCEPTED=1, REJECTED=2,
 *   CANCELLED=3, EXPIRED=4.
 *
 * DEPLOYMENT GATE: All builders guard against empty TRADE_REGISTRY constant.
 * Until FP1-09 bootstrap_trade_registry runs on testnet and
 * packages/shared/constants/index.ts:36 is populated, every builder throws
 * loudly rather than silently emitting a broken PTB.
 *
 * Coin path: Coin<EVE> ONLY (V7 migration). Callers must call splitEveCoin() to
 * obtain a TransactionArgument, then pass it as evePaymentCoin.
 * Zero-amount escrow (giveEveMist = 0) still requires a Coin<EVE> arg — call
 * splitEveCoin(wallet, 0n, tx) which produces a zero-value EVE split (valid per OQ-1).
 *
 * Clock: all 5 builders pass tx.object("0x6") — standard Sui Clock shared object.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { PACKAGE_IDS, SHARED_OBJECTS, MODULES } from "../../constants";

// ── Runtime guard helper ───────────────────────────────────────────────────────

function assertRegistryDeployed(): void {
  if (!SHARED_OBJECTS.TRADE_REGISTRY) {
    throw new Error(
      "TradeRegistry not deployed — run bootstrap_trade_registry on testnet first " +
      "(FP1-09). Populate VITE_TRADE_REGISTRY_ID (or update constants/index.ts) " +
      "with the shared object ID after deployment."
    );
  }
}

// ── buildCreateTradeProposal ───────────────────────────────────────────────────

/**
 * Create a direct trade proposal.
 *
 * Move: bazaar_mission::trade:: (V35 split) create_proposal (trade.move L.119-159)
 * Sig: (registry: &mut TradeRegistry, counterparty: address, ssu_id: address,
 *        tribe_id: u64, bazaar_type: u8,
 *        offered_item_type_ids: vector<u64>, offered_quantities: vector<u64>,
 *        requested_item_type_ids: vector<u64>, requested_quantities: vector<u64>,
 *        eve_payment: Coin<SUI>, requested_eve: u64, expiry_ms: u64,
 *        clock: &Clock, ctx: &mut TxContext): ID
 *
 * giveEveMist — amount proposer escrows (may be 0; always split from gas).
 * requestEveMist — declared amount counterparty must send; NOT escrowed here.
 * Errors: E_LENGTH_MISMATCH (6) if offered_item_type_ids.len != offered_quantities.len.
 */
export function buildCreateTradeProposal(
params: {
  counterparty: string;
  ssuId: string;
  ssuGovId: string;            // R3.5 — resolved via useSSUGovId hook
  tribeId: number;
  bazaarType: number;
  giveItems: { typeId: number; qty: number }[];
  requestItems: { typeId: number; qty: number }[];
  giveEveMist: number;
  /**
   * Pre-split Coin<EVE> from splitEveCoin(walletAddress, BigInt(giveEveMist), tx).
   * If giveEveMist is 0, caller must still call splitEveCoin with amount 0n —
   * the Move contract requires a Coin<EVE> argument even for zero-value escrow.
   * Zero-value Coin<EVE> splits are valid in Sui PTBs (confirmed OQ-1 resolution).
   */
  evePaymentCoin: TransactionArgument;
  requestEveMist: number;
  expiryMs: number;
},
tx: Transaction,
): Transaction {
  assertRegistryDeployed();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.TRADE}::create_proposal`,
    arguments: [
      tx.object(SHARED_OBJECTS.TRADE_REGISTRY),
      tx.object(params.ssuGovId),                                 // gov: &SSUGovernance (R3.5)
      tx.pure.address(params.counterparty),
      tx.pure.address(params.ssuId),
      tx.pure.u64(BigInt(params.tribeId)),
      tx.pure.u8(params.bazaarType),
      tx.pure.vector("u64", params.giveItems.map(i => BigInt(i.typeId))),
      tx.pure.vector("u64", params.giveItems.map(i => BigInt(i.qty))),
      tx.pure.vector("u64", params.requestItems.map(i => BigInt(i.typeId))),
      tx.pure.vector("u64", params.requestItems.map(i => BigInt(i.qty))),
      params.evePaymentCoin,
      tx.pure.u64(BigInt(params.requestEveMist)),
      tx.pure.u64(BigInt(params.expiryMs)),
      tx.object("0x6"),
    ],
  });

  return tx;
}

// ── buildAcceptTradeProposal ───────────────────────────────────────────────────

/**
 * Accept a trade proposal as the counterparty.
 *
 * Move: bazaar_mission::trade:: (V35 split) accept_proposal (trade.move L.161-190)
 * Sig: (registry: &mut TradeRegistry, proposal_id: ID,
 *        eve_payment: Coin<SUI>, clock: &Clock, ctx: &mut TxContext)
 *
 * eveAmountMist — must equal the proposal's requested_eve exactly.
 * Move validates clock <= expiry_ms (E_PROPOSAL_EXPIRED=5).
 * Errors: E_NOT_COUNTERPARTY (2), E_ALREADY_RESOLVED (4), E_PROPOSAL_EXPIRED (5).
 */
export function buildAcceptTradeProposal(
params: {
  proposalId: string;
  ssuGovId: string;            // R3.5 — resolved via useSSUGovId hook
  eveAmountMist: number;
  /** Pre-split Coin<EVE> from splitEveCoin(walletAddress, BigInt(eveAmountMist), tx). */
  evePaymentCoin: TransactionArgument;
},
tx: Transaction,
): Transaction {
  assertRegistryDeployed();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.TRADE}::accept_proposal`,
    arguments: [
      tx.object(SHARED_OBJECTS.TRADE_REGISTRY),
      tx.object(params.ssuGovId),                                 // gov: &SSUGovernance (R3.5)
      tx.pure.id(params.proposalId),
      params.evePaymentCoin,
      tx.object("0x6"),
    ],
  });

  return tx;
}

// ── buildRejectTradeProposal ───────────────────────────────────────────────────

/**
 * Reject a trade proposal (counterparty only).
 *
 * Move: bazaar_mission::trade:: (V35 split) reject_proposal (trade.move L.192-210)
 * Sig: (registry: &mut TradeRegistry, proposal_id: ID,
 *        clock: &Clock, ctx: &mut TxContext)
 *
 * Refunds proposer's escrowed EVE. Sets status to REJECTED (2).
 * Errors: E_NOT_COUNTERPARTY (2), E_ALREADY_RESOLVED (4).
 */
export function buildRejectTradeProposal(proposalId: string): Transaction {
  assertRegistryDeployed();
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.TRADE}::reject_proposal`,
    arguments: [
      tx.object(SHARED_OBJECTS.TRADE_REGISTRY),
      tx.pure.id(proposalId),
      tx.object("0x6"),
    ],
  });

  return tx;
}

// ── buildCancelTradeProposal ───────────────────────────────────────────────────

/**
 * Cancel a pending trade proposal (proposer only).
 *
 * Move: bazaar_mission::trade:: (V35 split) cancel_proposal (trade.move L.212-230)
 * Sig: (registry: &mut TradeRegistry, proposal_id: ID,
 *        clock: &Clock, ctx: &mut TxContext)
 *
 * Refunds proposer's escrowed EVE. Sets status to CANCELLED (3).
 * Note: clock arg is required even though cancel does not check expiry (per trade.move L.212-217).
 * Errors: E_NOT_PROPOSER (3), E_ALREADY_RESOLVED (4).
 */
export function buildCancelTradeProposal(proposalId: string): Transaction {
  assertRegistryDeployed();
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.TRADE}::cancel_proposal`,
    arguments: [
      tx.object(SHARED_OBJECTS.TRADE_REGISTRY),
      tx.pure.id(proposalId),
      tx.object("0x6"),
    ],
  });

  return tx;
}

// ── buildExpireTradeProposal ───────────────────────────────────────────────────

/**
 * Expire a trade proposal after its expiry_ms has passed (permissionless).
 *
 * Move: bazaar_mission::trade:: (V35 split) expire_proposal (trade.move L.232-248)
 * Sig: (registry: &mut TradeRegistry, proposal_id: ID,
 *        clock: &Clock, ctx: &mut TxContext)
 *
 * Refunds proposer's escrowed EVE. Sets status to EXPIRED (4).
 * The on-chain clock is checked; TX aborts if clock.timestamp_ms <= expiry_ms.
 * Frontend MUST compare proposal.expiryMs against Date.now() before offering this button.
 * Errors: E_ALREADY_RESOLVED (4), E_PROPOSAL_EXPIRED (5) when NOT YET expired (L.241).
 */
export function buildExpireTradeProposal(proposalId: string): Transaction {
  assertRegistryDeployed();
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.TRADE}::expire_proposal`,
    arguments: [
      tx.object(SHARED_OBJECTS.TRADE_REGISTRY),
      tx.pure.id(proposalId),
      tx.object("0x6"),
    ],
  });

  return tx;
}

// NOTE: Deprecated stub names from prior stubs (buildAcceptTrade, buildRejectTrade,
// buildCancelProposal, buildExpireProposal) are superseded by the names above.
// The bazaarcore/index.ts barrel exports these; any consumer of the old names must
// update their import at the same time code-executor applies this diff.

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
