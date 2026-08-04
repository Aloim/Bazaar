// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V27 Wave 2 — buildInitSsuEconomy
 *
 * Per-SSU "Initialize Economy" entry. Atomically creates the per-SSU
 * TribeTokenWtbPool and ensures a zero-balance row exists for the SSU in
 * the per-tribe TribeTokenLedger.
 *
 * SSUOwnerCap-gated on-chain — caller MUST hold the SSUOwnerCap for ssu_gov
 * and ssu_gov.tribe_id MUST match tribe_gov.tribe_id.
 *
 * Move: bazaar_economy::ssu_economy_init::init_ssu_economy
 * Sig:  (ssu_gov: &SSUGovernance, ssu_owner_cap: &SSUOwnerCap,
 *        tribe_gov: &TribeGovernance, ledger: &mut TribeTokenLedger,
 *        clock: &Clock, ctx: &mut TxContext)
 *
 * Pattern A (params, tx) — composable with other PTB steps.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

export function buildInitSsuEconomy(
  params: {
    ssuGovId:      string;
    ssuOwnerCapId: string;
    tribeGovId:    string;
    ledgerId:      string;
  },
  tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.SSU_ECONOMY_INIT}::init_ssu_economy`,
    arguments: [
      tx.object(params.ssuGovId),
      tx.object(params.ssuOwnerCapId),
      tx.object(params.tribeGovId),
      tx.object(params.ledgerId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
