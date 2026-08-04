// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * DappHub per-type DApp tax setter TX builders (Phase 5 / V36).
 *
 * AUD-DH-01 retire: buildSetCustomTribeTax + buildSetCustomSSUTax DELETED.
 * The Move entry fns (set_custom_tribe_tax / set_custom_ssu_tax) are RETIRED in the
 * V36 fresh publish; the override tables no longer exist. FE callers in
 * TribeDetailsWindow + SSUDetailsWindow have their tax-override sections removed.
 *
 * New builders (V36 only — gate with DAPPTAX_PERTYPE_ENABLED):
 *   buildSetNotribeDappTax   — set_notribe_dapp_tax_bps (Option<u64>; None = clear to global)
 *   buildSetEasyDappTax      — set_easy_dapp_tax_bps    (Option<u64>; None = clear to global)
 *   buildSetAdvancedExchangeDappTax — set_advanced_exchange_dapp_tax_bps (Option<u64>)
 *
 * CC-001 CONSTRAINT: callers MUST check DAPPTAX_PERTYPE_ENABLED before invoking.
 * These builders target Move entry fns that do NOT exist on the live V35 deployment.
 *
 * Option<u64> encoding: tx.pure.option("u64", BigInt(rateBps)) for Some;
 *                       tx.pure.option("u64", null) for None (clear to global).
 * Confirmed available in @mysten/sui 2.16.0 (dist/transactions/pure.d.mts:21).
 *
 * Architecture: NOT part of the frozen DappHub TX builder set (10 frozen).
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, SHARED_OBJECTS } from "@bazaar/shared/constants";

/**
 * Set the NoTribe per-type DApp tax rate. DApp Owner only. V36+.
 * Pass rateBps=null to clear the override (None → falls back to globalTaxBps).
 * Pass rateBps=0 to set an explicit 0% (exempt) — NOT equivalent to null.
 * Move: dapp_hub::dapp_governance::set_notribe_dapp_tax_bps
 * Sig:  (_cap: &DAppOwnerCap, config: &mut GovernanceConfig, rate: Option<u64>)
 * Aborts: E_RATE_TOO_HIGH (2) if rate > 5000 (50%).
 */
export function buildSetNotribeDappTax(params: {
  ownerCapId: string;
  rateBps: number | null;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.DAPP_GOVERNANCE}::set_notribe_dapp_tax_bps`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.pure.option("u64", params.rateBps === null ? null : BigInt(params.rateBps)),
    ],
  });
  return tx;
}

/**
 * Set the Easy per-type DApp tax rate. DApp Owner only. V36+.
 * Pass rateBps=null to clear (None → falls back to globalTaxBps).
 * Move: dapp_hub::dapp_governance::set_easy_dapp_tax_bps
 */
export function buildSetEasyDappTax(params: {
  ownerCapId: string;
  rateBps: number | null;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.DAPP_GOVERNANCE}::set_easy_dapp_tax_bps`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.pure.option("u64", params.rateBps === null ? null : BigInt(params.rateBps)),
    ],
  });
  return tx;
}

/**
 * Set the Advanced Exchange per-type DApp tax rate. DApp Owner only. V36+.
 * This rate applies ONLY to the Exchange swap (buy-token / sell-token flows);
 * Advanced WTS/WTB shops use SSU+Tribe only (no DApp layer at trade time).
 * Pass rateBps=null to clear (None → falls back to globalTaxBps).
 * Move: dapp_hub::dapp_governance::set_advanced_exchange_dapp_tax_bps
 */
export function buildSetAdvancedExchangeDappTax(params: {
  ownerCapId: string;
  rateBps: number | null;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.DAPP_GOVERNANCE}::set_advanced_exchange_dapp_tax_bps`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.pure.option("u64", params.rateBps === null ? null : BigInt(params.rateBps)),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
