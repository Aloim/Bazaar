// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — BazaarCore user-side legacy withdraw TX builders.
 *
 * Defense-in-depth rescue entries for end users (SSU owners + shop owners) to
 * pull residual EVE that Phase B admin drains may have missed:
 *
 *   - `ssu_admin_drain::withdraw_legacy_ssu_eve` — SSUOwnerCap-gated;
 *     pulls SSUGovernance.tax_wallet to the SSU owner.
 *   - `wtb_escrow_pool::withdraw_legacy_wtb_pool_residual` — cap-LESS; on-chain
 *     shop-owner derivation via `bazar::shop_owner`. Any shop owner can rescue
 *     THEIR OWN WTB shop residual; cross-owner attempts abort `E_NOT_SHOP_OWNER`.
 *
 * Both return `Coin<EVE>`; consumer PTBs transfer to sender via
 * `tx.transferObjects([result], sender)`. The 2 builders compose into a single
 * PTB (`<LegacySSUWithdrawButton />`) so the user signs once for the whole
 * rescue. NoTribe + Easy only — Advanced uses tribe-token credit, no EVE
 * residual to rescue.
 *
 * File limit: 500 lines | Constitution Article XIV.4 (exempt under UpdateCeremonyPlan).
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import {
  PACKAGE_IDS,
  MODULES,
  SHARED_OBJECTS,
  SUI_CLOCK_ID,
} from "@bazaar/shared/constants";

// ─── withdraw_legacy_ssu_eve ─────────────────────────────────────────────────

/**
 * Rescue residual EVE from a legacy outgoing-version SSUGovernance.tax_wallet.
 * SSUOwnerCap-gated; aborts E_WRONG_SSU on cap mismatch. Returns
 * `Coin<EVE>` (caller PTB transfers to sender).
 *
 * Move: bazaar_core::ssu_admin_drain::withdraw_legacy_ssu_eve
 * Sig:  (cap: &SSUOwnerCap, gov: &mut SSUGovernance, clock: &Clock,
 *        ctx: &mut TxContext) -> Coin<EVE>
 *
 * Returns the moveCall result (TransactionArgument) so callers can chain into
 * `coin::join` / `transferObjects`.
 */
export function buildWithdrawLegacySsuEve(
  params: {
    ssuOwnerCapId: string;
    ssuGovId: string;
  },
  tx: Transaction = new Transaction(),
): { tx: Transaction; result: TransactionArgument } {
  const result = tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_ADMIN_DRAIN}::withdraw_legacy_ssu_eve`,
    arguments: [
      tx.object(params.ssuOwnerCapId),
      tx.object(params.ssuGovId),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return { tx, result };
}

// ─── withdraw_legacy_wtb_pool_residual ───────────────────────────────────────

/**
 * Rescue residual EVE escrow from a legacy WtbEscrowPool. CAP-LESS; on-chain
 * derivation: `assert!(sender == bazar::shop_owner(reg, shop_id), E_NOT_SHOP_OWNER)`
 * per shop_id. Silent-skips missing/stale entries. Returns aggregated
 * `Coin<EVE>` across all supplied shop_ids.
 *
 * Move: bazaar_core::wtb_escrow_pool::withdraw_legacy_wtb_pool_residual
 * Sig:  (pool: &mut WtbEscrowPool, registry: &BazarRegistry,
 *        shop_ids: vector<ID>, clock: &Clock, ctx: &mut TxContext) -> Coin<EVE>
 */
export function buildWithdrawLegacyWtbPoolResidual(
  params: {
    wtbEscrowPoolId: string;
    bazarRegistryId?: string;
    shopIds: string[];
  },
  tx: Transaction = new Transaction(),
): { tx: Transaction; result: TransactionArgument } {
  const result = tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.WTB_ESCROW_POOL}::withdraw_legacy_wtb_pool_residual`,
    arguments: [
      tx.object(params.wtbEscrowPoolId),
      tx.object(params.bazarRegistryId ?? SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.pure.vector("address", params.shopIds),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return { tx, result };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
