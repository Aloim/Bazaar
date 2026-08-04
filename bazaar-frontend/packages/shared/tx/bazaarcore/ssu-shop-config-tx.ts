// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore per-SSU shop configuration TX builders — OS-44 + OS-45.
 *
 * buildSetSSUShopLimitForRoleAsSuperAdmin  — set per-role shop count limit (SA-primary)
 * buildSetSSUShopLimitForRoleAsOwner       — same, Owner overload
 * buildSetSSUShopConfigAsSuperAdmin        — set max items per shop + auto-expiry (SA-primary)
 * buildSetSSUShopConfigAsOwner             — same, Owner overload
 *
 * Move module: bazaar_core::ssu_shop_config
 * Activated in R6.7.5.A — Move fns confirmed in ssu_shop_config.move:55,82,108,134.
 * Decision 1 (Round-1): SSU-scope, not tribe-scope. Relocated from TribeGovernancePanel.
 *
 * Article XIV.2 ad-hoc exemption per user direct authorization 2026-04-29.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS } from "../../constants";

const SSU_SHOP_CONFIG = "ssu_shop_config";

// ── buildSetSSUShopLimitForRoleAsSuperAdmin ────────────────────────────────────

/**
 * Set per-role shop count limit for this SSU (SuperAdmin-primary).
 * Move: bazaar_core::ssu_shop_config::set_ssu_shop_limit_for_role_as_super_admin
 * Sig: (cap: &SSUSuperAdminCap, gov: &mut SSUGovernance, role: u8, max: u64,
 *       clock: &Clock, ctx)
 *
 * superAdminCapId — SSUSuperAdminCap object ID owned by caller.
 * ssuGovId        — SSUGovernance shared object ID (mutable).
 * role            — role ID 0..7 (Move aborts E_INVALID_ROLE if > 7).
 * max             — max shops for this role (0 = clear/unlimited; 1-1000 accepted).
 *                   Move aborts E_INVALID_MAX_SHOPS_PER_ROLE if > 1000.
 */
export function buildSetSSUShopLimitForRoleAsSuperAdmin(params: {
  superAdminCapId: string;
  ssuGovId: string;
  role: number;
  max: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${SSU_SHOP_CONFIG}::set_ssu_shop_limit_for_role_as_super_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.ssuGovId),
      tx.pure.u8(params.role),
      tx.pure.u64(BigInt(params.max)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetSSUShopLimitForRoleAsOwner ─────────────────────────────────────────

/**
 * Set per-role shop count limit for this SSU (Owner overload).
 * Move: bazaar_core::ssu_shop_config::set_ssu_shop_limit_for_role_as_owner
 * Sig: (cap: &SSUOwnerCap, gov: &mut SSUGovernance, role: u8, max: u64,
 *       clock: &Clock, ctx)
 *
 * ownerCapId — SSUOwnerCap object ID owned by caller.
 * ssuGovId   — SSUGovernance shared object ID (mutable).
 * role       — role ID 0..7.
 * max        — max shops for this role (0 = unlimited; cap at 1000).
 */
export function buildSetSSUShopLimitForRoleAsOwner(params: {
  ownerCapId: string;
  ssuGovId: string;
  role: number;
  max: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${SSU_SHOP_CONFIG}::set_ssu_shop_limit_for_role_as_owner`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.pure.u8(params.role),
      tx.pure.u64(BigInt(params.max)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetSSUShopConfigAsSuperAdmin ──────────────────────────────────────────

/**
 * Set per-SSU max items per shop + auto-expiry duration (SuperAdmin-primary).
 * Move: bazaar_core::ssu_shop_config::set_ssu_shop_config_as_super_admin
 * Sig: (cap: &SSUSuperAdminCap, gov: &mut SSUGovernance, max_items: u64,
 *       auto_expiry_ms: u64, clock: &Clock, ctx)
 *
 * superAdminCapId — SSUSuperAdminCap object ID owned by caller.
 * ssuGovId        — SSUGovernance shared object ID (mutable).
 * maxItems        — max items per shop (0 = no limit / clear).
 * autoExpiryMs    — auto-expiry duration in milliseconds (0 = no auto-expiry / clear).
 */
export function buildSetSSUShopConfigAsSuperAdmin(params: {
  superAdminCapId: string;
  ssuGovId: string;
  maxItems: number;
  autoExpiryMs: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${SSU_SHOP_CONFIG}::set_ssu_shop_config_as_super_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.ssuGovId),
      tx.pure.u64(BigInt(params.maxItems)),
      tx.pure.u64(BigInt(params.autoExpiryMs)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetSSUShopConfigAsOwner ───────────────────────────────────────────────

/**
 * Set per-SSU max items per shop + auto-expiry duration (Owner overload).
 * Move: bazaar_core::ssu_shop_config::set_ssu_shop_config_as_owner
 * Sig: (cap: &SSUOwnerCap, gov: &mut SSUGovernance, max_items: u64,
 *       auto_expiry_ms: u64, clock: &Clock, ctx)
 *
 * ownerCapId   — SSUOwnerCap object ID owned by caller.
 * ssuGovId     — SSUGovernance shared object ID (mutable).
 * maxItems     — max items per shop (0 = no limit / clear).
 * autoExpiryMs — auto-expiry duration in milliseconds (0 = clear).
 */
export function buildSetSSUShopConfigAsOwner(params: {
  ownerCapId: string;
  ssuGovId: string;
  maxItems: number;
  autoExpiryMs: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${SSU_SHOP_CONFIG}::set_ssu_shop_config_as_owner`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.pure.u64(BigInt(params.maxItems)),
      tx.pure.u64(BigInt(params.autoExpiryMs)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
