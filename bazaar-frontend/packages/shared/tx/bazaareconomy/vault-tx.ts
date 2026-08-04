// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy tribe vault TX builders.
 *
 * buildDepositEve — Tribe leader deposits EVE into the tribe vault
 *
 * Move module: bazaar_economy::tribe_vault
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

// ── buildDepositEve ────────────────────────────────────────────────────────

/**
 * Tribe leader deposits EVE into the tribe vault.
 *
 * Move: bazaar_economy::tribe_vault::deposit_eve
 * Sig:  (cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        vault: &mut TribeVault, ledger: &TribeTokenLedger,
 *        payment: Coin<EVE>, clock: &Clock, ctx: &mut TxContext)
 *
 * R5.2.b.2: tribe_gov added for bazaar-type + tribe-id coherence check.
 * V15: ledger added so FinanceEvent emit can snapshot circulation.
 * paymentCoin is a pre-split Coin<EVE> from splitEveCoin().
 */
export function buildDepositEve(
params: {
  leaderCapId: string;
  tribeGovernanceId: string;    // R5.2.b.3 — TribeGovernance shared object
  vaultId: string;
  ledgerId: string;              // V15 — TribeTokenLedger for circulation snapshot
  amountMist: number;
  /** Pre-split Coin<EVE> from splitEveCoin(walletAddress, BigInt(amountMist), tx). */
  paymentCoin: TransactionArgument;
},
tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_VAULT}::deposit_eve`,
    arguments: [
      tx.object(params.leaderCapId),              // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),        // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.vaultId),                  // vault: &mut TribeVault [2]
      tx.object(params.ledgerId),                 // ledger: &TribeTokenLedger [3] V15
      params.paymentCoin,                         // payment: Coin<EVE> [4]
      tx.object("0x6"),                           // clock: &Clock [5]
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
