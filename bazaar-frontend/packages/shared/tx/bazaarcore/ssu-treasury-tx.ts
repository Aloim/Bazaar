// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore SSU treasury TX builders — OS-39 (Phase 4.7 EVE migration).
 *
 * buildDepositSSUTaxExternal  — permissionless external EVE tax deposit (OS-39)
 *
 * V7 Phase 3.2: buildSetSSUTreasuryAddress + Move entry fn DELETED.
 *
 * Move module: bazaar_core::ssu_treasury
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { PACKAGE_IDS } from "../../constants";

const SSU_TREASURY = "ssu_treasury";

// ── buildDepositSSUTaxExternal ────────────────────────────────────────────────

/**
 * Deposit EVE into the SSU tax wallet from any external caller (permissionless).
 * Move: bazaar_core::ssu_treasury::deposit_ssu_tax_external
 * Sig: (gov: &mut SSUGovernance, coin: Coin<EVE>, clock: &Clock, ctx)
 *
 * No cap required — any caller may donate to an active, non-frozen SSU.
 * Aborts E_SSU_FROZEN, E_SSU_NOT_ACTIVE, E_ZERO_DEPOSIT if conditions not met.
 *
 * Caller must call splitEveCoin() and pass the result as eveCoin.
 *
 * ssuGovId   — SSUGovernance shared object ID (mutable).
 * amount     — deposit amount in MIST. Used for UI display only; actual deposit
 *              amount = coin.value at execution time.
 */
export function buildDepositSSUTaxExternal(
params: {
  ssuGovId: string;
  amount: number;
  /** Pre-split Coin<EVE> from splitEveCoin(walletAddress, BigInt(amount), tx). */
  eveCoin: TransactionArgument;
},
tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${SSU_TREASURY}::deposit_ssu_tax_external`,
    arguments: [
      tx.object(params.ssuGovId),
      params.eveCoin,
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
