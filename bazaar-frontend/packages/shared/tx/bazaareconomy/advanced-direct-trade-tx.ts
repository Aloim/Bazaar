// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V26 D6 — Advanced DirectTrade TX builders.
 *
 * Move: `bazaar_economy::advanced_direct_trade::{propose, accept, reject,
 *        cancel, expire}_advanced_trade`.
 *
 * Currency-only in v1: EVE + tribe-token. Item exchange is queued for V27.
 *
 * Token amounts are scaled units (V26 decimals=2 — `formatTribeAmount` /
 * `parseTribeAmount` from `@bazaar/shared/utils/tribeToken`).
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, EVE_COIN_TYPE, v36Enabled } from "../../constants";

const TARGET = (entry: string) =>
  `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ADVANCED_DIRECT_TRADE}::${entry}`;

const CLOCK = "0x6";

/**
 * V36: every advanced_direct_trade entry gained a `tribe_gov: &TribeGovernance` arg at
 * slot 2 (after ssu_gov, before ledger) for ban + binding checks (R-C ban fold-in).
 * Returns the in-PTB arg to splice in when V36 is live; empty on V35 (flag OFF → live ABI).
 */
function tribeGovArgs(tx: Transaction, tribeGovId?: string) {
  if (!v36Enabled()) return [];
  if (!tribeGovId) {
    throw new Error("advanced_direct_trade (V36) requires tribeGovId — pass the Advanced tribe's TribeGovernance id");
  }
  return [tx.object(tribeGovId)];
}

// ── propose ───────────────────────────────────────────────────────────────────

/** Build a Coin<EVE> input from gas if amount > 0, else use `coin::zero<EVE>` PTB result. */
function eveInput(tx: Transaction, mist: bigint) {
  if (mist > 0n) {
    return tx.splitCoins(tx.gas, [tx.pure.u64(mist)]);
  }
  return tx.moveCall({
    target: `0x2::coin::zero`,
    typeArguments: [EVE_COIN_TYPE],
    arguments: [],
  });
}

export function buildProposeAdvancedTrade(params: {
  registryId: string;
  ssuGovId: string;
  /** V36 only — Advanced tribe's TribeGovernance id (ban + binding checks). */
  tribeGovId?: string;
  ledgerId: string;
  receiver: string;
  offerEveMist: bigint;
  offerTokensScaled: bigint;
  requestEveMist: bigint;
  requestTokensScaled: bigint;
  expiryMs: bigint;
}, tx: Transaction = new Transaction()): Transaction {
  const offerCoin = eveInput(tx, params.offerEveMist);
  tx.moveCall({
    target: TARGET("propose_advanced_trade"),
    arguments: [
      tx.object(params.registryId),
      tx.object(params.ssuGovId),
      ...tribeGovArgs(tx, params.tribeGovId),
      tx.object(params.ledgerId),
      tx.pure.address(params.receiver),
      offerCoin,
      tx.pure.u64(params.offerTokensScaled),
      tx.pure.u64(params.requestEveMist),
      tx.pure.u64(params.requestTokensScaled),
      tx.pure.u64(params.expiryMs),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

// ── accept ────────────────────────────────────────────────────────────────────

export function buildAcceptAdvancedTrade(params: {
  registryId: string;
  ssuGovId: string;
  /** V36 only — Advanced tribe's TribeGovernance id (ban + binding checks). */
  tribeGovId?: string;
  ledgerId: string;
  proposalId: string;
  requestEveMist: bigint;       // must match proposal.request_eve_mist
}, tx: Transaction = new Transaction()): Transaction {
  const payCoin = eveInput(tx, params.requestEveMist);
  tx.moveCall({
    target: TARGET("accept_advanced_trade"),
    arguments: [
      tx.object(params.registryId),
      tx.object(params.ssuGovId),
      ...tribeGovArgs(tx, params.tribeGovId),
      tx.object(params.ledgerId),
      tx.pure.id(params.proposalId),
      payCoin,
      tx.object(CLOCK),
    ],
  });
  return tx;
}

// ── reject (counterparty rejects pending) ─────────────────────────────────────

export function buildRejectAdvancedTrade(params: {
  registryId: string;
  ssuGovId: string;
  /** V36 only — Advanced tribe's TribeGovernance id (binding check; ungated path). */
  tribeGovId?: string;
  ledgerId: string;
  proposalId: string;
}, tx: Transaction = new Transaction()): Transaction {
  tx.moveCall({
    target: TARGET("reject_advanced_trade"),
    arguments: [
      tx.object(params.registryId),
      tx.object(params.ssuGovId),
      ...tribeGovArgs(tx, params.tribeGovId),
      tx.object(params.ledgerId),
      tx.pure.id(params.proposalId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

// ── cancel (proposer cancels pending) ─────────────────────────────────────────

export function buildCancelAdvancedTrade(params: {
  registryId: string;
  ssuGovId: string;
  /** V36 only — Advanced tribe's TribeGovernance id (binding check; ungated path). */
  tribeGovId?: string;
  ledgerId: string;
  proposalId: string;
}, tx: Transaction = new Transaction()): Transaction {
  tx.moveCall({
    target: TARGET("cancel_advanced_trade"),
    arguments: [
      tx.object(params.registryId),
      tx.object(params.ssuGovId),
      ...tribeGovArgs(tx, params.tribeGovId),
      tx.object(params.ledgerId),
      tx.pure.id(params.proposalId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

// ── expire (anyone can call after expiry_ms) ──────────────────────────────────

export function buildExpireAdvancedTrade(params: {
  registryId: string;
  ssuGovId: string;
  /** V36 only — Advanced tribe's TribeGovernance id (binding check; ungated path). */
  tribeGovId?: string;
  ledgerId: string;
  proposalId: string;
}, tx: Transaction = new Transaction()): Transaction {
  tx.moveCall({
    target: TARGET("expire_advanced_trade"),
    arguments: [
      tx.object(params.registryId),
      tx.object(params.ssuGovId),
      ...tribeGovArgs(tx, params.tribeGovId),
      tx.object(params.ledgerId),
      tx.pure.id(params.proposalId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
