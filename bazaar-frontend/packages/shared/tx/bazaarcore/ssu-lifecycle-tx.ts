// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore SSU lifecycle TX builders — OS-38 (Decision B).
 *
 * buildDeactivateSSUGovernance  — soft-deactivate (reversible; all gated ops abort)
 * buildActivateSSUGovernance    — reactivate a previously deactivated SSU governance
 *
 * Move module: bazaar_mission::ssu_lifecycle (V35 split)
 * Activated in R6.7.5.A — Move fns confirmed in ssu_lifecycle.move:48,67.
 * Decision B: replaces DESTROY GOVERNANCE (which had no Move fn) with a
 * reversible deactivate/activate pair per OS-38 re-scoping.
 *
 * Article XIV.2 ad-hoc exemption per user direct authorization 2026-04-29.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS } from "../../constants";

const SSU_LIFECYCLE = "ssu_lifecycle";

// ── buildDeactivateSSUGovernance ──────────────────────────────────────────────

/**
 * Soft-deactivate this SSU governance. Owner-only.
 * Move: bazaar_mission::ssu_lifecycle::deactivate_ssu_governance
 * Sig: (cap: &SSUOwnerCap, gov: &mut SSUGovernance, clock: &Clock, ctx)
 *
 * Sets gov.is_active = false. All GATED mutating entry fns abort E_SSU_NOT_ACTIVE.
 * EXEMPT-RECOVERY paths (withdraw_ssu_tax, unfreeze_*) remain operational.
 * Idempotent — re-calling on an already-inactive SSU re-emits the event.
 *
 * ownerCapId — SSUOwnerCap object ID owned by caller.
 * ssuGovId   — SSUGovernance shared object ID (mutable).
 */
export function buildDeactivateSSUGovernance(params: {
  ownerCapId: string;
  ssuGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${SSU_LIFECYCLE}::deactivate_ssu_governance`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildActivateSSUGovernance ────────────────────────────────────────────────

/**
 * Reactivate a previously deactivated SSU governance. Owner-only.
 * Move: bazaar_mission::ssu_lifecycle::activate_ssu_governance
 * Sig: (cap: &SSUOwnerCap, gov: &mut SSUGovernance, clock: &Clock, ctx)
 *
 * Symmetric to deactivateSSUGovernance. Does NOT call assert_active (EXEMPT-RECOVERY).
 * Idempotent — re-calling on an already-active SSU re-emits the event.
 *
 * ownerCapId — SSUOwnerCap object ID owned by caller.
 * ssuGovId   — SSUGovernance shared object ID (mutable).
 */
export function buildActivateSSUGovernance(params: {
  ownerCapId: string;
  ssuGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${SSU_LIFECYCLE}::activate_ssu_governance`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
