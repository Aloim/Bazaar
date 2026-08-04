// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore SSU governance caps TX builders — OS-35.
 *
 * buildSetSSUMaxShopsAsOwner       — per-SSU max-shops override (Owner-primary)
 * buildSetSSUMaxShopsAsSuperAdmin  — per-SSU max-shops override (SuperAdmin)
 *
 * Move module: bazaar_core::ssu_governance_caps
 * Activated in R6.7.5.A — OS-35 Move fns confirmed in ssu_governance_caps.move:237,261.
 *
 * Article XIV.2 ad-hoc exemption per user direct authorization 2026-04-29.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

// ── buildSetSSUMaxShopsAsOwner ────────────────────────────────────────────────

/**
 * Override the per-SSU maximum shop count as SSUOwnerCap.
 * Move: bazaar_core::ssu_governance_caps::set_ssu_max_shops_as_owner
 * Sig: (cap: &SSUOwnerCap, gov: &mut SSUGovernance,
 *       max_shops: Option<u64>, clock: &Clock, ctx)
 *
 * ownerCapId — SSUOwnerCap object ID owned by caller.
 * ssuGovId   — SSUGovernance shared object ID (mutable).
 * maxShops   — new limit, or null to clear the override (passes Option::none()).
 *              If non-null, must be > 0 (Move aborts E_INVALID_MAX_SHOPS on 0).
 */
export function buildSetSSUMaxShopsAsOwner(params: {
  ownerCapId: string;
  ssuGovId: string;
  maxShops: number | null;
}): Transaction {
  const tx = new Transaction();
  const optionArg = params.maxShops === null
    ? tx.moveCall({ target: "0x1::option::none", typeArguments: ["u64"], arguments: [] })
    : tx.moveCall({
        target: "0x1::option::some",
        typeArguments: ["u64"],
        arguments: [tx.pure.u64(BigInt(params.maxShops))],
      });
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_GOVERNANCE_CAPS}::set_ssu_max_shops_as_owner`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      optionArg,
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetSSUMaxShopsAsSuperAdmin ───────────────────────────────────────────

/**
 * Override the per-SSU maximum shop count as SSUSuperAdminCap.
 * Move: bazaar_core::ssu_governance_caps::set_ssu_max_shops_as_super_admin
 * Sig: (cap: &SSUSuperAdminCap, gov: &mut SSUGovernance,
 *       max_shops: Option<u64>, clock: &Clock, ctx)
 *
 * superAdminCapId — SSUSuperAdminCap object ID owned by caller.
 * ssuGovId        — SSUGovernance shared object ID (mutable).
 * maxShops        — new limit, or null to clear. Same validation as Owner variant.
 */
export function buildSetSSUMaxShopsAsSuperAdmin(params: {
  superAdminCapId: string;
  ssuGovId: string;
  maxShops: number | null;
}): Transaction {
  const tx = new Transaction();
  const optionArg = params.maxShops === null
    ? tx.moveCall({ target: "0x1::option::none", typeArguments: ["u64"], arguments: [] })
    : tx.moveCall({
        target: "0x1::option::some",
        typeArguments: ["u64"],
        arguments: [tx.pure.u64(BigInt(params.maxShops))],
      });
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_GOVERNANCE_CAPS}::set_ssu_max_shops_as_super_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.ssuGovId),
      optionArg,
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
