// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore shop moderation TX builders — OS-40 cap-tier dispatchers.
 *
 * buildForceCloseShopAsSuperAdmin  — force-close via SSUSuperAdminCap
 * buildForceCloseShopAsAdmin       — force-close via SSUAdminCap
 * buildForceCloseShopAsMod         — force-close via SSUModCap
 *
 * The Owner-tier builder (buildForceCloseShop) remains in ssu-governance-tx.ts
 * (the legacy bazar::force_close_shop entry fn — retained for backward compat).
 *
 * Move module: bazaar_core::shop_moderation
 * Activated in R6.7.5.A — Move fns confirmed in shop_moderation.move:143,183,219.
 * Note: shop_moderation dispatchers take gov as IMMUTABLE (&SSUGovernance) and
 * shop as MUTABLE (&mut Shop), unlike the legacy Owner fn which takes only cap + shop.
 *
 * Article XIV.2 ad-hoc exemption per user direct authorization 2026-04-29.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, SHARED_OBJECTS, MODULES } from "../../constants";

// ── buildForceCloseShopAsSuperAdmin ───────────────────────────────────────────

/**
 * Force-close a shop as SSUSuperAdminCap.
 * Move: bazaar_core::shop_moderation::force_close_shop_as_super_admin
 * Sig: (cap: &SSUSuperAdminCap, registry: &mut BazarRegistry, shop: &mut Shop,
 *       gov: &SSUGovernance, clock: &Clock, ctx)
 *
 * EXEMPT-MODERATION: assert_not_frozen is SKIPPED — moderation works during freeze.
 * The revocation table IS checked for SSUSuperAdminCap (Move-side assertion).
 *
 * superAdminCapId — SSUSuperAdminCap object ID owned by caller.
 * shopId          — Shop object ID to force-close (V9: passed as pure ID, not object ref).
 * ssuGovId        — SSUGovernance shared object ID (immutable — gov is &SSUGovernance).
 */
export function buildForceCloseShopAsSuperAdmin(params: {
  superAdminCapId:      string;
  shopId:               string;
  ssuGovId:             string;
  ssuId:                string;    // NEW
  recipientCharacterId: string;    // NEW
  wtbEscrowPoolId:      string;    // NEW
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    // V38 split: shop_moderation moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_MODERATION}::force_close_shop_as_super_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.pure.id(params.shopId),
      tx.object(params.ssuGovId),
      tx.object(params.ssuId),
      tx.object(params.recipientCharacterId),
      tx.object(params.wtbEscrowPoolId),
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (before clock)
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildForceCloseShopAsAdmin ────────────────────────────────────────────────

/**
 * Force-close a shop as SSUAdminCap.
 * Move: bazaar_core::shop_moderation::force_close_shop_as_admin
 * Sig: (cap: &SSUAdminCap, registry: &mut BazarRegistry, shop: &mut Shop,
 *       gov: &SSUGovernance, clock: &Clock, ctx)
 *
 * EXEMPT-MODERATION: assert_not_frozen SKIPPED.
 * No revocation table for SSUAdminCap.
 *
 * adminCapId — SSUAdminCap object ID owned by caller.
 * shopId     — Shop object ID to force-close (V9: passed as pure ID, not object ref).
 * ssuGovId   — SSUGovernance shared object ID (immutable).
 */
export function buildForceCloseShopAsAdmin(params: {
  adminCapId:           string;
  shopId:               string;
  ssuGovId:             string;
  ssuId:                string;    // NEW
  recipientCharacterId: string;    // NEW
  wtbEscrowPoolId:      string;    // NEW
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    // V38 split: shop_moderation moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_MODERATION}::force_close_shop_as_admin`,
    arguments: [
      tx.object(params.adminCapId),
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.pure.id(params.shopId),
      tx.object(params.ssuGovId),
      tx.object(params.ssuId),
      tx.object(params.recipientCharacterId),
      tx.object(params.wtbEscrowPoolId),
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (before clock)
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildForceCloseShopAsMod ──────────────────────────────────────────────────

/**
 * Force-close a shop as SSUModCap.
 * Move: bazaar_core::shop_moderation::force_close_shop_as_mod
 * Sig: (cap: &SSUModCap, registry: &mut BazarRegistry, shop: &mut Shop,
 *       gov: &SSUGovernance, clock: &Clock, ctx)
 *
 * EXEMPT-MODERATION: assert_not_frozen SKIPPED.
 * No revocation table for SSUModCap.
 *
 * modCapId — SSUModCap object ID owned by caller.
 * shopId   — Shop object ID to force-close (V9: passed as pure ID, not object ref).
 * ssuGovId — SSUGovernance shared object ID (immutable).
 */
export function buildForceCloseShopAsMod(params: {
  modCapId:             string;
  shopId:               string;
  ssuGovId:             string;
  ssuId:                string;    // NEW
  recipientCharacterId: string;    // NEW
  wtbEscrowPoolId:      string;    // NEW
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    // V38 split: shop_moderation moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_MODERATION}::force_close_shop_as_mod`,
    arguments: [
      tx.object(params.modCapId),
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.pure.id(params.shopId),
      tx.object(params.ssuGovId),
      tx.object(params.ssuId),
      tx.object(params.recipientCharacterId),
      tx.object(params.wtbEscrowPoolId),
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (before clock)
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildForceCloseShopAsTribeSuperAdmin ──────────────────────────────────────

/**
 * Force-close a shop as TribeSuperAdminCap (OS-50 tribe-tier dispatch).
 * Move: bazaar_core::shop_moderation::force_close_shop_as_tribe_super_admin
 * Sig: (cap: &TribeSuperAdminCap, registry: &mut BazarRegistry, shop: &mut Shop,
 *       ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance, clock, ctx)
 *
 * SEC-003: ssu_governance::ssu_tribe_id(ssu_gov) must equal tribe_gov.tribe_id.
 * EXEMPT-MODERATION: assert_not_frozen SKIPPED.
 * The revocation table IS checked for TribeSuperAdminCap (Move-side assertion).
 *
 * superAdminCapId — TribeSuperAdminCap object ID owned by caller.
 * shopId          — Shop object ID to force-close (V9: passed as pure ID, not object ref).
 * ssuGovId        — SSUGovernance shared object ID (immutable).
 * tribeGovId      — TribeGovernance shared object ID (immutable).
 */
export function buildForceCloseShopAsTribeSuperAdmin(params: {
  superAdminCapId:      string;
  shopId:               string;
  ssuGovId:             string;
  tribeGovId:           string;
  ssuId:                string;    // NEW
  recipientCharacterId: string;    // NEW
  wtbEscrowPoolId:      string;    // NEW
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    // V38 split: shop_moderation_tribe moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_MODERATION_TRIBE}::force_close_shop_as_tribe_super_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.pure.id(params.shopId),
      tx.object(params.ssuGovId),
      tx.object(params.tribeGovId),
      tx.object(params.ssuId),
      tx.object(params.recipientCharacterId),
      tx.object(params.wtbEscrowPoolId),
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (before clock)
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildForceCloseShopAsTribeAdmin ───────────────────────────────────────────

/**
 * Force-close a shop as TribeAdminCap (OS-50 tribe-tier dispatch).
 * Move: bazaar_core::shop_moderation::force_close_shop_as_tribe_admin
 * Sig: (cap: &TribeAdminCap, registry: &mut BazarRegistry, shop: &mut Shop,
 *       ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance, clock, ctx)
 *
 * SEC-003 tribe-SSU binding enforced.
 * EXEMPT-MODERATION: assert_not_frozen SKIPPED.
 *
 * adminCapId — TribeAdminCap object ID owned by caller.
 * shopId     — Shop object ID to force-close (V9: passed as pure ID, not object ref).
 * ssuGovId   — SSUGovernance shared object ID (immutable).
 * tribeGovId — TribeGovernance shared object ID (immutable).
 */
export function buildForceCloseShopAsTribeAdmin(params: {
  adminCapId:           string;
  shopId:               string;
  ssuGovId:             string;
  tribeGovId:           string;
  ssuId:                string;    // NEW
  recipientCharacterId: string;    // NEW
  wtbEscrowPoolId:      string;    // NEW
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    // V38 split: shop_moderation_tribe moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_MODERATION_TRIBE}::force_close_shop_as_tribe_admin`,
    arguments: [
      tx.object(params.adminCapId),
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.pure.id(params.shopId),
      tx.object(params.ssuGovId),
      tx.object(params.tribeGovId),
      tx.object(params.ssuId),
      tx.object(params.recipientCharacterId),
      tx.object(params.wtbEscrowPoolId),
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (before clock)
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildForceCloseShopAsTribeMod ─────────────────────────────────────────────

/**
 * Force-close a shop as TribeModCap (OS-50 tribe-tier dispatch).
 * Move: bazaar_core::shop_moderation::force_close_shop_as_tribe_mod
 * Sig: (cap: &TribeModCap, registry: &mut BazarRegistry, shop: &mut Shop,
 *       ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance, clock, ctx)
 *
 * SEC-003 tribe-SSU binding enforced.
 * EXEMPT-MODERATION: assert_not_frozen SKIPPED.
 *
 * modCapId   — TribeModCap object ID owned by caller.
 * shopId     — Shop object ID to force-close (V9: passed as pure ID, not object ref).
 * ssuGovId   — SSUGovernance shared object ID (immutable).
 * tribeGovId — TribeGovernance shared object ID (immutable).
 */
export function buildForceCloseShopAsTribeMod(params: {
  modCapId:             string;
  shopId:               string;
  ssuGovId:             string;
  tribeGovId:           string;
  ssuId:                string;    // NEW
  recipientCharacterId: string;    // NEW
  wtbEscrowPoolId:      string;    // NEW
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    // V38 split: shop_moderation_tribe moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_MODERATION_TRIBE}::force_close_shop_as_tribe_mod`,
    arguments: [
      tx.object(params.modCapId),
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.pure.id(params.shopId),
      tx.object(params.ssuGovId),
      tx.object(params.tribeGovId),
      tx.object(params.ssuId),
      tx.object(params.recipientCharacterId),
      tx.object(params.wtbEscrowPoolId),
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE), // V38: cap_store: &ShopOpsCapStore (before clock)
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
