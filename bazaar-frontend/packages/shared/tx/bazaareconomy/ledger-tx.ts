// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy tribe token ledger TX builders.
 *
 * (buildLedgerMintTo / buildLedgerBurnFrom DELETED Phase 8 A4 — zero consumers;
 *  their Move targets mint_to/burn_from are RETIRED at V36 per the ADV-05 USER
 *  ruling: the 24h mint/burn veto queue is the only mint/burn path.)
 * buildLedgerBurnSelf   — Caller burns their own tokens
 * buildLedgerEnsureAccount — Ensure a player account exists in the ledger
 *
 * Move module: bazaar_economy::tribe_token_ledger
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

// ── buildLedgerBurnSelf ────────────────────────────────────────────────────

/**
 * Caller burns their own tribe token balance.
 *
 * Move: bazaar_economy::tribe_token_ledger::burn_self
 * Sig:  (tribe_gov: &TribeGovernance, ledger: &mut TribeTokenLedger,
 *        amount: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * R5.2.b.2: tribe_gov added for bazaar-type gate (Easy or Advanced).
 * No cap required — any player can burn their own balance.
 * Note: tribe_gov is FIRST param (no cap).
 */
export function buildLedgerBurnSelf(params: {
  tribeGovernanceId: string;    // R5.2.b.3 — TribeGovernance shared object (FIRST param; no cap)
  ledgerId: string;
  amount: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_TOKEN_LEDGER}::burn_self`,
    arguments: [
      tx.object(params.tribeGovernanceId),        // tribe_gov: &TribeGovernance [0] R5.2
      tx.object(params.ledgerId),                 // ledger: &mut TribeTokenLedger [1]
      tx.pure.u64(BigInt(params.amount)),         // amount: u64 [2]
      tx.object("0x6"),                           // clock: &Clock [3]
    ],
  });
  return tx;
}

// ── buildLedgerEnsureAccount ───────────────────────────────────────────────

/**
 * Ensure a player account exists in the tribe token ledger.
 *
 * Move: bazaar_economy::tribe_token_ledger::ensure_account
 * Sig:  (tribe_gov: &TribeGovernance, ledger: &mut TribeTokenLedger,
 *        player: address)
 *
 * R5.2.b.2: tribe_gov added for bazaar-type gate (Easy or Advanced).
 * Idempotent: if the account already exists, this is a no-op.
 * Note: tribe_gov is FIRST param (no cap).
 */
export function buildLedgerEnsureAccount(params: {
  tribeGovernanceId: string;    // R5.2.b.3 — TribeGovernance shared object (FIRST param; no cap)
  ledgerId: string;
  player: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_TOKEN_LEDGER}::ensure_account`,
    arguments: [
      tx.object(params.tribeGovernanceId),        // tribe_gov: &TribeGovernance [0] R5.2
      tx.object(params.ledgerId),                 // ledger: &mut TribeTokenLedger [1]
      tx.pure.address(params.player),             // player: address [2]
    ],
  });
  return tx;
}

// ── V20: Tribe Token Wallet admin ──────────────────────────────────────────

/**
 * Withdraw from the Tribe Token Wallet to a recipient (TribeLeaderCap-gated).
 *
 * Move: bazaar_economy::tribe_token_ledger::withdraw_from_tribe_wallet_as_leader
 * Sig:  (cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        ledger: &mut TribeTokenLedger, recipient: address,
 *        amount: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * Moves tokens from gov.id_address row to recipient row. Advanced-only.
 * Emits TribeWalletWithdrawEvent { cap_tier: 0 }.
 */
export function buildWithdrawFromTribeWalletAsLeader(params: {
  leaderCapId: string;
  tribeGovernanceId: string;
  ledgerId: string;
  recipient: string;
  amount: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_TOKEN_LEDGER}::withdraw_from_tribe_wallet_as_leader`,
    arguments: [
      tx.object(params.leaderCapId),              // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),        // tribe_gov: &TribeGovernance [1]
      tx.object(params.ledgerId),                 // ledger: &mut TribeTokenLedger [2]
      tx.pure.address(params.recipient),          // recipient: address [3]
      tx.pure.u64(BigInt(params.amount)),         // amount: u64 [4]
      tx.object("0x6"),                           // clock: &Clock [5]
    ],
  });
  return tx;
}

/**
 * Withdraw from the Tribe Token Wallet to a recipient (TribeSuperAdminCap-gated).
 *
 * Move: bazaar_economy::tribe_token_ledger::withdraw_from_tribe_wallet_as_super_admin
 * Sig:  (cap: &TribeSuperAdminCap, tribe_gov: &TribeGovernance,
 *        ledger: &mut TribeTokenLedger, recipient: address,
 *        amount: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * Same as the leader variant but for SA cap. Honors revocation table
 * (E_TRIBE_CAP_REVOKED = 9). Emits TribeWalletWithdrawEvent { cap_tier: 1 }.
 */
export function buildWithdrawFromTribeWalletAsSuperAdmin(params: {
  superAdminCapId: string;
  tribeGovernanceId: string;
  ledgerId: string;
  recipient: string;
  amount: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_TOKEN_LEDGER}::withdraw_from_tribe_wallet_as_super_admin`,
    arguments: [
      tx.object(params.superAdminCapId),          // cap: &TribeSuperAdminCap [0]
      tx.object(params.tribeGovernanceId),        // tribe_gov: &TribeGovernance [1]
      tx.object(params.ledgerId),                 // ledger: &mut TribeTokenLedger [2]
      tx.pure.address(params.recipient),          // recipient: address [3]
      tx.pure.u64(BigInt(params.amount)),         // amount: u64 [4]
      tx.object("0x6"),                           // clock: &Clock [5]
    ],
  });
  return tx;
}

/**
 * Permissionless deposit from caller's ledger row INTO the Tribe Token Wallet.
 *
 * Move: bazaar_economy::tribe_token_ledger::deposit_to_tribe_wallet
 * Sig:  (tribe_gov: &TribeGovernance, ledger: &mut TribeTokenLedger,
 *        amount: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * No cap. Caller's balance must be >= amount. Advanced-only.
 * Emits TribeWalletDepositEvent.
 */
export function buildDepositToTribeWallet(params: {
  tribeGovernanceId: string;
  ledgerId: string;
  amount: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_TOKEN_LEDGER}::deposit_to_tribe_wallet`,
    arguments: [
      tx.object(params.tribeGovernanceId),        // tribe_gov: &TribeGovernance [0]
      tx.object(params.ledgerId),                 // ledger: &mut TribeTokenLedger [1]
      tx.pure.u64(BigInt(params.amount)),         // amount: u64 [2]
      tx.object("0x6"),                           // clock: &Clock [3]
    ],
  });
  return tx;
}

// ── V26: SSU Credit Admin ──────────────────────────────────────────────────

/**
 * SSU owner moves tribe-token credits from the SSU tax row to a player.
 *
 * Move: bazaar_economy::ledger_shop_ops_ssu_admin::transfer_ssu_credit_to_player (V26 D8 split)
 * Sig:  (cap: &SSUOwnerCap, ssu_gov: &SSUGovernance,
 *        ledger: &mut TribeTokenLedger, recipient: address,
 *        amount: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * `amount` is in scaled tribe-token units (V26+ decimals=2).
 * Emits SSUCreditWithdrawEvent.
 */
export function buildTransferSSUCreditToPlayer(params: {
  ssuOwnerCapId: string;
  ssuGovId: string;
  ledgerId: string;
  recipient: string;
  amountScaled: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.LEDGER_SHOP_OPS_SSU_ADMIN}::transfer_ssu_credit_to_player`,
    arguments: [
      tx.object(params.ssuOwnerCapId),            // cap: &SSUOwnerCap [0]
      tx.object(params.ssuGovId),                 // ssu_gov: &SSUGovernance [1]
      tx.object(params.ledgerId),                 // ledger: &mut TribeTokenLedger [2]
      tx.pure.address(params.recipient),          // recipient: address [3]
      tx.pure.u64(BigInt(params.amountScaled)),   // amount: u64 [4]
      tx.object("0x6"),                           // clock: &Clock [5]
    ],
  });
  return tx;
}

/**
 * Permissionless deposit: caller credits the SSU tax row from their own
 * tribe-token ledger balance.
 *
 * Move: bazaar_economy::ledger_shop_ops_ssu_admin::deposit_to_ssu_credit (V26 D8 split)
 * Sig:  (ssu_gov: &SSUGovernance, ledger: &mut TribeTokenLedger,
 *        amount: u64, clock: &Clock, ctx: &mut TxContext)
 *
 * `amount` is in scaled tribe-token units. Emits SSUCreditDepositEvent.
 */
export function buildDepositToSSUCredit(params: {
  ssuGovId: string;
  ledgerId: string;
  amountScaled: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.LEDGER_SHOP_OPS_SSU_ADMIN}::deposit_to_ssu_credit`,
    arguments: [
      tx.object(params.ssuGovId),                 // ssu_gov: &SSUGovernance [0]
      tx.object(params.ledgerId),                 // ledger: &mut TribeTokenLedger [1]
      tx.pure.u64(BigInt(params.amountScaled)),   // amount: u64 [2]
      tx.object("0x6"),                           // clock: &Clock [3]
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
