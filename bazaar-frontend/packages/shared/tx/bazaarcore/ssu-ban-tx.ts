// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore SSU ban / freeze / volume_limit TX builders.
 *
 * R4.3.c — Activates the 8-tier ban/unban set added in R3.2 (commit cce040f) plus
 * the R3.5 freeze trio (commit 6b0326f) and R3.3 set_volume_limit (commit 1e6135e).
 *
 * Move targets:
 *   ssu_governance_caps::ssu_ban_as_owner / _super_admin / _admin / _mod
 *     (BazaarCore/sources/ssu_governance_caps.move:118-170)
 *   ssu_governance_caps::ssu_unban_as_owner / _super_admin / _admin / _mod
 *     (lines 173-218)
 *   ssu_governance::freeze_ssu / unfreeze_ssu / unfreeze_ssu_as_owner
 *     (lines 415, 430, 445)
 *   user_storage::set_volume_limit (BazaarCore/sources/user_storage.move:93)
 *
 * Frontend convention:
 *   - All ban/unban builders accept ssuGovId from useSSUGovId resolver hook
 *     (R4.3.a). Caller MUST resolve gov before constructing the PTB.
 *   - Permanent ban sentinel: pass expiresAtMs=null OR Number.MAX_SAFE_INTEGER
 *     -> dispatcher substitutes 0xFFFFFFFFFFFFFFFFn (u64::MAX) per SA-R4.1-06.
 *     Move asserts expires_at_ms > clock.now (E_BAN_EXPIRY_IN_PAST=9).
 *   - Freeze guard NOT required on freeze/unfreeze themselves (these are the
 *     control points). They take SuperAdmin/Owner cap + gov directly.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

const SSU_GOVERNANCE_CAPS = "ssu_governance_caps";
const SSU_GOVERNANCE = "ssu_governance";
const USER_STORAGE = "user_storage";

const U64_MAX = 0xFFFFFFFFFFFFFFFFn;

/** Translate UI permanent-ban sentinel to Move u64::MAX. */
function resolveExpiresAtMs(expiresAtMs: number | "permanent" | null): bigint {
  if (expiresAtMs === null || expiresAtMs === "permanent") return U64_MAX;
  if (typeof expiresAtMs !== "number" || expiresAtMs <= Date.now()) {
    throw new Error(
      `expiresAtMs must be a future epoch ms (got ${expiresAtMs}). ` +
      `Use null or "permanent" for u64::MAX.`,
    );
  }
  return BigInt(expiresAtMs);
}

// ── Ban builders (4 cap-tier dispatchers) ─────────────────────────────────────

export type SSUCapTier = "owner" | "super_admin" | "admin" | "mod";

const BAN_FN_BY_TIER: Record<SSUCapTier, string> = {
  owner: "ssu_ban_as_owner",
  super_admin: "ssu_ban_as_super_admin",
  admin: "ssu_ban_as_admin",
  mod: "ssu_ban_as_mod",
};

const UNBAN_FN_BY_TIER: Record<SSUCapTier, string> = {
  owner: "ssu_unban_as_owner",
  super_admin: "ssu_unban_as_super_admin",
  admin: "ssu_unban_as_admin",
  mod: "ssu_unban_as_mod",
};

/**
 * Issue an SSU-level ban via the cap tier the caller holds.
 * Move: bazaar_core::ssu_governance_caps::ssu_ban_as_<tier>
 *
 * Caller responsibilities:
 *   - capId MUST come from useUserCaps() resolver (per SA-R4.3-09);
 *     never user-typed input or URL params.
 *   - Move enforces cap.ssu_id == gov.ssu_id at runtime; selecting a wrong
 *     tier on the dispatcher cannot bypass that boundary.
 */
export function buildSSUBanAs(params: {
  capTier: SSUCapTier;
  capId: string;
  ssuGovId: string;
  target: string;
  expiresAtMs: number | "permanent" | null;
}): Transaction {
  const tx = new Transaction();
  const fnName = BAN_FN_BY_TIER[params.capTier];
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${SSU_GOVERNANCE_CAPS}::${fnName}`,
    arguments: [
      tx.object(params.capId),
      tx.object(params.ssuGovId),
      tx.pure.address(params.target),
      tx.pure.u64(resolveExpiresAtMs(params.expiresAtMs)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/** Lift an SSU-level ban via the cap tier the caller holds. */
export function buildSSUUnbanAs(params: {
  capTier: SSUCapTier;
  capId: string;
  ssuGovId: string;
  target: string;
}): Transaction {
  const tx = new Transaction();
  const fnName = UNBAN_FN_BY_TIER[params.capTier];
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${SSU_GOVERNANCE_CAPS}::${fnName}`,
    arguments: [
      tx.object(params.capId),
      tx.object(params.ssuGovId),
      tx.pure.address(params.target),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Freeze / unfreeze trio (R3.5) ─────────────────────────────────────────────

/**
 * Freeze an SSU's mutating entry fns (SuperAdmin-only).
 * Move: bazaar_core::ssu_governance::freeze_ssu (line 415)
 * Idempotent: subsequent freezes with the same cap are no-ops.
 */
export function buildFreezeSSU(params: {
  superAdminCapId: string;
  ssuGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${SSU_GOVERNANCE}::freeze_ssu`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.ssuGovId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * Unfreeze an SSU's mutating entry fns (SuperAdmin path).
 * Move: bazaar_core::ssu_governance::unfreeze_ssu (line 430)
 */
export function buildUnfreezeSSU(params: {
  superAdminCapId: string;
  ssuGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${SSU_GOVERNANCE}::unfreeze_ssu`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.ssuGovId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * Owner-override unfreeze (Constitution Article VI.1 hierarchy).
 * Move: bazaar_core::ssu_governance::unfreeze_ssu_as_owner (line 445)
 */
export function buildUnfreezeSSUAsOwner(params: {
  ownerCapId: string;
  ssuGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${SSU_GOVERNANCE}::unfreeze_ssu_as_owner`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Set volume limit (R3.3) ───────────────────────────────────────────────────

/**
 * Set per-SSU UserStorage volume limit (SSUOwnerCap).
 * Move: bazaar_core::user_storage::set_volume_limit (line 93)
 *
 * VOLUME_LIMIT_UNLIMITED constant in Move = u64::MAX. Frontend should pass
 * Number.MAX_SAFE_INTEGER (or pass null) for "unlimited" UX semantics.
 */
export function buildSetVolumeLimit(params: {
  ownerCapId: string;
  userStorageId: string;
  newLimit: number | "unlimited";
}): Transaction {
  const tx = new Transaction();
  const limit = params.newLimit === "unlimited" ? U64_MAX : BigInt(params.newLimit);
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${USER_STORAGE}::set_volume_limit`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.userStorageId),
      tx.pure.u64(limit),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
