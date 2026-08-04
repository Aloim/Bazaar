// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore user storage TX builders — OS-46.
 *
 * buildSetVolumeLimitForRole  — set per-role volume limit on a UserStorage object
 *
 * Move module: bazaar_core::user_storage
 * Activated in R6.7.5.A — Move fn confirmed in user_storage.move:153.
 * Decision 1 (Round-1): SSU-scope. Relocated form from TribeGovernancePanel.
 *
 * Note: userStorageId is the per-SSU UserStorage shared object ID — distinct from
 * USER_STORAGE_REGISTRY_ID (the registry that maps owner address → UserStorage).
 * The SSU panel operator must provide the UserStorage object ID explicitly.
 * Future R: hook auto-resolution from ssuId.
 *
 * Article XIV.2 ad-hoc exemption per user direct authorization 2026-04-29.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

// ── buildSetVolumeLimitForRole ────────────────────────────────────────────────

/**
 * Set per-role volume limit on a UserStorage object. Owner-only.
 * Move: bazaar_core::user_storage::set_volume_limit_for_role
 * Sig: (cap: &SSUOwnerCap, storage: &mut UserStorage, role: u8, limit: u64,
 *       gov: &SSUGovernance, clock: &Clock, ctx)
 *
 * ownerCapId    — SSUOwnerCap object ID owned by caller.
 * userStorageId — UserStorage shared object ID for this SSU.
 *                 NOT the registry ID — this is the per-SSU storage object.
 * role          — role ID 0..7 (Move aborts E_INVALID_ROLE if > 7).
 * limit         — volume limit in item volume units (0 = unlimited).
 * ssuGovId      — SSUGovernance shared object ID (immutable — asserts active state).
 */
export function buildSetVolumeLimitForRole(params: {
  ownerCapId: string;
  userStorageId: string;
  role: number;
  limit: number;
  ssuGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.USER_STORAGE}::set_volume_limit_for_role`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.userStorageId),
      tx.pure.u8(params.role),
      tx.pure.u64(BigInt(params.limit)),
      tx.object(params.ssuGovId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildAdminClaimForUser ────────────────────────────────────────────────────

/**
 * Admin claims an unclaimed item on behalf of a target user (SSUAdminCap).
 * Move: bazaar_core::user_storage::admin_claim_for_user
 * Sig: (cap: &SSUAdminCap, gov: &SSUGovernance, members: &MemberRegistry,
 *       storage: &mut UserStorage, target: address, item_id: ID, clock, ctx)
 *
 * OS-47. Does NOT check original_owner match — admin overrides that gate.
 * Asserts: cap SSU matches storage → governance active → item exists.
 *
 * adminCapId       — SSUAdminCap object ID owned by caller.
 * ssuGovId         — SSUGovernance shared object ID (immutable).
 * memberRegistryId — MemberRegistry shared object ID (R6.7.6 OS-46: role lookup on target).
 * userStorageId    — UserStorage shared object ID for this SSU (mutable).
 * target           — Wallet address of the intended recipient.
 * itemId           — Object ID of the UnclaimedItem to claim.
 * R6.7.8: memberRegistryId param added; members threaded at slot 3 (after gov, before storage).
 */
export function buildAdminClaimForUser(params: {
  adminCapId: string;
  ssuGovId: string;
  memberRegistryId: string;    // R6.7.8: members: &MemberRegistry (slot 3)
  userStorageId: string;
  target: string;
  itemId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.USER_STORAGE}::admin_claim_for_user`,
    arguments: [
      tx.object(params.adminCapId),
      tx.object(params.ssuGovId),
      tx.object(params.memberRegistryId),        // members: &MemberRegistry (slot 3)
      tx.object(params.userStorageId),
      tx.pure.address(params.target),
      tx.pure.id(params.itemId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildConfiscateUnclaimedItem ──────────────────────────────────────────────

/**
 * Admin confiscates an unclaimed item after the grace period has expired (SSUAdminCap).
 * Move: bazaar_core::user_storage::confiscate_unclaimed_item
 * Sig: (cap: &SSUAdminCap, gov: &SSUGovernance, storage: &mut UserStorage,
 *       item_id: ID, clock, ctx)
 *
 * OS-47. Removes the item from unclaimed storage (permanently destroyed — no recipient).
 * Asserts: cap SSU matches → governance active → item exists → expiry has passed.
 *
 * adminCapId    — SSUAdminCap object ID owned by caller.
 * ssuGovId      — SSUGovernance shared object ID (immutable).
 * userStorageId — UserStorage shared object ID for this SSU (mutable).
 * itemId        — Object ID of the UnclaimedItem to confiscate.
 */
export function buildConfiscateUnclaimedItem(params: {
  adminCapId: string;
  ssuGovId: string;
  userStorageId: string;
  itemId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.USER_STORAGE}::confiscate_unclaimed_item`,
    arguments: [
      tx.object(params.adminCapId),
      tx.object(params.ssuGovId),
      tx.object(params.userStorageId),
      tx.pure.id(params.itemId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
