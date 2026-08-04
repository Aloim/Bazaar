// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore tribe governance caps TX builders — Item 2 revocation UI.
 *
 * buildRevokeTribeSuperAdminCap    — peer revocation (TribeSuperAdminCap authority)
 * buildUnrevokeTribeSuperAdminCap  — peer unrevocation (TribeSuperAdminCap authority)
 * buildRevokeTribeAdminCap         — revoke TribeAdminCap (TribeSuperAdminCap authority)
 * buildUnrevokeTribeAdminCap       — unrevoke TribeAdminCap (TribeSuperAdminCap authority)
 * buildRevokeTribeModCap           — revoke TribeModCap (TribeAdminCap authority)
 * buildUnrevokeTribeModCap         — unrevoke TribeModCap (TribeAdminCap authority)
 *
 * Move module: bazaar_core::tribe_governance_caps
 * Confirmed in tribe_governance_caps.move:196,232,266,300,334,368.
 * EXEMPT-MODERATION: all 6 fns skip assert_tribe_active gate (Item 2 security property).
 *
 * Article XIV.2 ad-hoc exemption per user direct authorization 2026-04-29.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS } from "../../constants";

const TRIBE_GOVERNANCE_CAPS = "tribe_governance_caps";

// ── buildRevokeTribeSuperAdminCap ─────────────────────────────────────────────

/**
 * Revoke a TribeSuperAdminCap by its object ID. Peer-level authority (TribeSuperAdminCap).
 * Move: bazaar_core::tribe_governance_caps::revoke_tribe_super_admin_cap
 * Sig: (authority: &TribeSuperAdminCap, gov: &mut TribeGovernance, target_cap_id: ID, clock, ctx)
 *
 * EXEMPT-MODERATION: works during tribe deactivation.
 * authorityCapId — TribeSuperAdminCap object ID owned by caller.
 * tribeGovId     — TribeGovernance shared object ID (mutable).
 * targetCapId    — Object ID of the TribeSuperAdminCap to revoke.
 */
export function buildRevokeTribeSuperAdminCap(params: {
  authorityCapId: string;
  tribeGovId: string;
  targetCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_GOVERNANCE_CAPS}::revoke_tribe_super_admin_cap`,
    arguments: [
      tx.object(params.authorityCapId),
      tx.object(params.tribeGovId),
      tx.pure.id(params.targetCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildUnrevokeTribeSuperAdminCap ───────────────────────────────────────────

/**
 * Remove a TribeSuperAdminCap from the revocation table. Peer-level authority.
 * Move: bazaar_core::tribe_governance_caps::unrevoke_tribe_super_admin_cap
 * Sig: (authority: &TribeSuperAdminCap, gov: &mut TribeGovernance, target_cap_id: ID, clock, ctx)
 *
 * EXEMPT-RECOVERY: works mid-deactivation.
 * authorityCapId — TribeSuperAdminCap object ID owned by caller.
 * tribeGovId     — TribeGovernance shared object ID (mutable).
 * targetCapId    — Object ID of the TribeSuperAdminCap to unrevoke.
 */
export function buildUnrevokeTribeSuperAdminCap(params: {
  authorityCapId: string;
  tribeGovId: string;
  targetCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_GOVERNANCE_CAPS}::unrevoke_tribe_super_admin_cap`,
    arguments: [
      tx.object(params.authorityCapId),
      tx.object(params.tribeGovId),
      tx.pure.id(params.targetCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildRevokeTribeAdminCap ──────────────────────────────────────────────────

/**
 * Revoke a TribeAdminCap by its object ID. Authority: TribeSuperAdminCap.
 * Move: bazaar_core::tribe_governance_caps::revoke_tribe_admin_cap
 * Sig: (authority: &TribeSuperAdminCap, gov: &mut TribeGovernance, target_cap_id: ID, clock, ctx)
 *
 * EXEMPT-MODERATION.
 * authorityCapId — TribeSuperAdminCap object ID owned by caller.
 * tribeGovId     — TribeGovernance shared object ID (mutable).
 * targetCapId    — Object ID of the TribeAdminCap to revoke.
 */
export function buildRevokeTribeAdminCap(params: {
  authorityCapId: string;
  tribeGovId: string;
  targetCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_GOVERNANCE_CAPS}::revoke_tribe_admin_cap`,
    arguments: [
      tx.object(params.authorityCapId),
      tx.object(params.tribeGovId),
      tx.pure.id(params.targetCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildUnrevokeTribeAdminCap ────────────────────────────────────────────────

/**
 * Remove a TribeAdminCap from the revocation table. Authority: TribeSuperAdminCap.
 * Move: bazaar_core::tribe_governance_caps::unrevoke_tribe_admin_cap
 * Sig: (authority: &TribeSuperAdminCap, gov: &mut TribeGovernance, target_cap_id: ID, clock, ctx)
 *
 * EXEMPT-RECOVERY.
 * authorityCapId — TribeSuperAdminCap object ID owned by caller.
 * tribeGovId     — TribeGovernance shared object ID (mutable).
 * targetCapId    — Object ID of the TribeAdminCap to unrevoke.
 */
export function buildUnrevokeTribeAdminCap(params: {
  authorityCapId: string;
  tribeGovId: string;
  targetCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_GOVERNANCE_CAPS}::unrevoke_tribe_admin_cap`,
    arguments: [
      tx.object(params.authorityCapId),
      tx.object(params.tribeGovId),
      tx.pure.id(params.targetCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildRevokeTribeModCap ────────────────────────────────────────────────────

/**
 * Revoke a TribeModCap by its object ID. Authority: TribeAdminCap (minimum sufficient).
 * Move: bazaar_core::tribe_governance_caps::revoke_tribe_mod_cap
 * Sig: (authority: &TribeAdminCap, gov: &mut TribeGovernance, target_cap_id: ID, clock, ctx)
 *
 * EXEMPT-MODERATION.
 * authorityCapId — TribeAdminCap object ID owned by caller.
 * tribeGovId     — TribeGovernance shared object ID (mutable).
 * targetCapId    — Object ID of the TribeModCap to revoke.
 */
export function buildRevokeTribeModCap(params: {
  authorityCapId: string;
  tribeGovId: string;
  targetCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_GOVERNANCE_CAPS}::revoke_tribe_mod_cap`,
    arguments: [
      tx.object(params.authorityCapId),
      tx.object(params.tribeGovId),
      tx.pure.id(params.targetCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildUnrevokeTribeModCap ──────────────────────────────────────────────────

/**
 * Remove a TribeModCap from the revocation table. Authority: TribeAdminCap.
 * Move: bazaar_core::tribe_governance_caps::unrevoke_tribe_mod_cap
 * Sig: (authority: &TribeAdminCap, gov: &mut TribeGovernance, target_cap_id: ID, clock, ctx)
 *
 * EXEMPT-RECOVERY.
 * authorityCapId — TribeAdminCap object ID owned by caller.
 * tribeGovId     — TribeGovernance shared object ID (mutable).
 * targetCapId    — Object ID of the TribeModCap to unrevoke.
 */
export function buildUnrevokeTribeModCap(params: {
  authorityCapId: string;
  tribeGovId: string;
  targetCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_GOVERNANCE_CAPS}::unrevoke_tribe_mod_cap`,
    arguments: [
      tx.object(params.authorityCapId),
      tx.object(params.tribeGovId),
      tx.pure.id(params.targetCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
