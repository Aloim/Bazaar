// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore V35 tribe-wide governance TX builders.
 *
 * 8d timed bans (tribe_governance_caps):
 *   buildTribeBanAs   — 4-tier dispatch to tribe_ban_as_{leader,super_admin,admin,mod}
 *   buildTribeUnbanAs — 4-tier dispatch to tribe_unban_as_*
 * 8a/8b shop config (tribe_shop_config):
 *   buildSetTribeMaxShops          — Leader/SuperAdmin (Option<u64>; null clears the cap)
 *   buildSetTribeShopLimitForRole  — Leader/SuperAdmin (per-role per-owner max; 0 clears)
 *   buildSetTribeShopItemsLimit    — Leader-only (FE-advisory items-per-shop config)
 *
 * Permanent ban sentinel: pass expiresAtMs "permanent" (or null) → u64::MAX, matching
 * the Move PERMANENT_BAN_SENTINEL and the SSU convention in ssu-ban-tx.ts.
 *
 * The ban entries take `members: &MemberRegistry` for the on-chain best-effort rank
 * check (SA-06). tribe_role_of() returns Stranger(0) for non-members (no abort), so the
 * caller passes ANY of the tribe's per-SSU MemberRegistry IDs; the FE is the authoritative
 * rank gate. Unban is NOT rank-gated and takes no members arg.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS } from "../../constants";

const TRIBE_GOVERNANCE_CAPS = "tribe_governance_caps";
const TRIBE_SHOP_CONFIG = "tribe_shop_config";

const U64_MAX = 0xFFFFFFFFFFFFFFFFn;

export type TribeCapTier = "leader" | "super_admin" | "admin" | "mod";

/** Translate the UI permanent-ban sentinel to Move u64::MAX; validate future expiry. */
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

const BAN_FN_BY_TIER: Record<TribeCapTier, string> = {
  leader:      "tribe_ban_as_leader",
  super_admin: "tribe_ban_as_super_admin",
  admin:       "tribe_ban_as_admin",
  mod:         "tribe_ban_as_mod",
};

const UNBAN_FN_BY_TIER: Record<TribeCapTier, string> = {
  leader:      "tribe_unban_as_leader",
  super_admin: "tribe_unban_as_super_admin",
  admin:       "tribe_unban_as_admin",
  mod:         "tribe_unban_as_mod",
};

// ── buildTribeBanAs ─────────────────────────────────────────────────────────────

/**
 * Issue a tribe-wide timed ban via the cap tier the caller holds.
 * Move: bazaar_core::tribe_governance_caps::tribe_ban_as_<tier>
 * Sig:  (cap, gov: &mut TribeGovernance, members: &MemberRegistry,
 *         target: address, expires_at_ms: u64, clock: &Clock, ctx)
 *
 * capId            — the caller's tribe cap (Leader/SuperAdmin/Admin/Mod) object ID.
 * tribeGovId       — TribeGovernance shared object ID (mutable).
 * memberRegistryId — any MemberRegistry of the tribe (for the best-effort rank check).
 * expiresAtMs      — future epoch ms, or "permanent"/null for a permanent ban.
 */
export function buildTribeBanAs(params: {
  capTier: TribeCapTier;
  capId: string;
  tribeGovId: string;
  memberRegistryId: string;
  target: string;
  expiresAtMs: number | "permanent" | null;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_GOVERNANCE_CAPS}::${BAN_FN_BY_TIER[params.capTier]}`,
    arguments: [
      tx.object(params.capId),
      tx.object(params.tribeGovId),
      tx.object(params.memberRegistryId),
      tx.pure.address(params.target),
      tx.pure.u64(resolveExpiresAtMs(params.expiresAtMs)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildTribeUnbanAs ───────────────────────────────────────────────────────────

/**
 * Lift a tribe-wide ban via the cap tier the caller holds. Not rank-gated.
 * Move: bazaar_core::tribe_governance_caps::tribe_unban_as_<tier>
 * Sig:  (cap, gov: &mut TribeGovernance, target: address, clock: &Clock, ctx)
 */
export function buildTribeUnbanAs(params: {
  capTier: TribeCapTier;
  capId: string;
  tribeGovId: string;
  target: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_GOVERNANCE_CAPS}::${UNBAN_FN_BY_TIER[params.capTier]}`,
    arguments: [
      tx.object(params.capId),
      tx.object(params.tribeGovId),
      tx.pure.address(params.target),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetTribeMaxShops ───────────────────────────────────────────────────────

/**
 * Set (or clear) the tribe-wide per-owner max-shops cap. Leader or SuperAdmin only.
 * Move: bazaar_core::tribe_shop_config::set_tribe_max_shops_as_{leader,super_admin}
 * Sig:  (cap, gov: &mut TribeGovernance, max_shops: Option<u64>, clock, ctx)
 *
 * maxShops null → Option::none (removes the cap); n>0 → Option::some(n).
 * Some(0) is rejected on-chain (E_INVALID_MAX_SHOPS).
 */
export function buildSetTribeMaxShops(params: {
  capTier: "leader" | "super_admin";
  capId: string;
  tribeGovId: string;
  maxShops: number | null;
}): Transaction {
  const tx = new Transaction();
  const fn = params.capTier === "leader"
    ? "set_tribe_max_shops_as_leader"
    : "set_tribe_max_shops_as_super_admin";
  const maxShopsArg = params.maxShops === null
    ? tx.moveCall({ target: "0x1::option::none", typeArguments: ["u64"], arguments: [] })
    : tx.moveCall({
        target: "0x1::option::some",
        typeArguments: ["u64"],
        arguments: [tx.pure.u64(BigInt(params.maxShops))],
      });
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_SHOP_CONFIG}::${fn}`,
    arguments: [
      tx.object(params.capId),
      tx.object(params.tribeGovId),
      maxShopsArg,
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetTribeShopLimitForRole ───────────────────────────────────────────────

/**
 * Set the per-role per-owner shop limit at the tribe layer. Leader or SuperAdmin only.
 * Move: bazaar_core::tribe_shop_config::set_tribe_shop_limit_for_role_as_{leader,super_admin}
 * Sig:  (cap, gov: &mut TribeGovernance, role: u8, max: u64, clock, ctx)
 * max=0 clears the role row (lookups then return 0 = unlimited).
 */
export function buildSetTribeShopLimitForRole(params: {
  capTier: "leader" | "super_admin";
  capId: string;
  tribeGovId: string;
  role: number;
  max: number;
}): Transaction {
  const tx = new Transaction();
  const fn = params.capTier === "leader"
    ? "set_tribe_shop_limit_for_role_as_leader"
    : "set_tribe_shop_limit_for_role_as_super_admin";
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_SHOP_CONFIG}::${fn}`,
    arguments: [
      tx.object(params.capId),
      tx.object(params.tribeGovId),
      tx.pure.u8(params.role),
      tx.pure.u64(BigInt(params.max)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetTribeShopItemsLimit ─────────────────────────────────────────────────

/**
 * Set the tribe-wide items-per-shop limit (FE-advisory config; not enforced on-chain
 * in V35). Leader-only.
 * Move: bazaar_core::tribe_shop_config::set_tribe_shop_items_limit_as_leader
 * Sig:  (leader_cap, gov: &mut TribeGovernance, limit: u64, clock, ctx). 0 = no limit.
 */
export function buildSetTribeShopItemsLimit(params: {
  leaderCapId: string;
  tribeGovId: string;
  limit: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${TRIBE_SHOP_CONFIG}::set_tribe_shop_items_limit_as_leader`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      tx.pure.u64(BigInt(params.limit)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
