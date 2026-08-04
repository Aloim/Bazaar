// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore tribe governance TX builders.
 *
 * buildSetTribeRoleTax     — V16: set a per-role tribe tax row (TribeLeaderCap)
 * buildClearTribeRoleTax   — V16: clear a per-role tribe tax row
 * buildSetTribeTaxesBatch  — V16: write multiple per-role rows in one TX
 * buildSetTribeTaxUniform  — V16: write all 8 roles to same RoleTaxConfig
 * buildGrantTribeRole      — dispatch to correct cap grant function by role level
 * (buildBanTribeMember DELETED Phase 8 A2 / AUD-ET-18 — it targeted
 *  tribe_governance::set_tribe_ban, removed at V35; bans now go through the
 *  timed tribe_governance_caps entries in tribe-ban-tx.ts)
 *
 * STUBS (Phase C — depend on Move Phase A):
 * buildRemoveTribeMember  — G-02: no Move function yet
 * buildRegisterSSUToTribe — G-03: add_ssu is package-private
 * buildPostAnnouncement   — G-04: no bazaar_core proxy entry yet
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

// ── buildSetTribeRoleTax ───────────────────────────────────────────────────────

/**
 * Set or overwrite a single per-role tribe tax row (V16 — Session 3B Move ABI).
 * Move: bazaar_core::tribe_role_tax_admin::set_tribe_role_tax
 * Sig: (leader_cap: &TribeLeaderCap, gov: &mut TribeGovernance, role: u8,
 *        wts_pct, wtb_pct, de_flat_fee: u64, clock, ctx)
 *
 * Unit convention: wts_pct / wtb_pct stored ×100 (525 = 5.25%); MAX_TAX_PCT = 1000 = 10%.
 * de_flat_fee = flat EVE amount in base units.
 *
 * leaderCapId — TribeLeaderCap object ID owned by caller (dapp_hub::tribe_registry).
 * tribeGovId  — TribeGovernance shared object ID (mutable).
 */
export function buildSetTribeRoleTax(params: {
  leaderCapId: string;
  tribeGovId: string;
  role: number;
  wtsPct: number;
  wtbPct: number;
  deFlatFee: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_ROLE_TAX_ADMIN}::set_tribe_role_tax`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      tx.pure.u8(params.role),
      tx.pure.u64(BigInt(params.wtsPct)),
      tx.pure.u64(BigInt(params.wtbPct)),
      tx.pure.u64(BigInt(params.deFlatFee)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetTribeMissionFee ────────────────────────────────────────────────────

/**
 * Set the per-hour Mission (MIS) listing fee on the Tribe layer (TribeLeaderCap).
 * Applies to Easy + Advanced; denomination implied by the tribe's bazaarType
 * (raw MIST EVE for Easy, tribe-token units for Advanced).
 * Move: bazaar_core::tribe_governance::set_tribe_mission_listing_fee (Slice 3).
 * Sig: (leader_cap: &TribeLeaderCap, gov: &mut TribeGovernance, fee_per_hour: u64,
 *        clock: &Clock, ctx).
 */
export function buildSetTribeMissionFee(params: {
  leaderCapId: string;
  tribeGovId: string;
  feePerHour: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_GOVERNANCE}::set_tribe_mission_listing_fee`,
    arguments: [
      tx.object(params.leaderCapId),            // leader_cap: &TribeLeaderCap
      tx.object(params.tribeGovId),             // gov: &mut TribeGovernance
      tx.pure.u64(BigInt(params.feePerHour)),   // fee_per_hour: u64
      tx.object("0x6"),                         // clock: &Clock
    ],
  });
  return tx;
}

// ── buildClearTribeRoleTax ─────────────────────────────────────────────────────

/**
 * Remove a per-role tribe tax row (V16). Subsequent lookups return 0.
 * Move: bazaar_core::tribe_role_tax_admin::clear_tribe_role_tax
 * Sig: (leader_cap: &TribeLeaderCap, gov: &mut TribeGovernance, role: u8, clock, ctx)
 */
export function buildClearTribeRoleTax(params: {
  leaderCapId: string;
  tribeGovId: string;
  role: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_ROLE_TAX_ADMIN}::clear_tribe_role_tax`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      tx.pure.u8(params.role),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetTribeTaxesBatch ────────────────────────────────────────────────────

/**
 * Set multiple per-role tribe tax rows in one TX (V16).
 * Move: bazaar_core::tribe_role_tax_admin::set_tribe_taxes_batch
 * Sig: (leader_cap: &TribeLeaderCap, gov: &mut TribeGovernance,
 *        roles: vector<u8>, wts_pcts: vector<u64>, wtb_pcts: vector<u64>,
 *        de_flat_fees: vector<u64>, clock, ctx)
 */
export function buildSetTribeTaxesBatch(params: {
  leaderCapId: string;
  tribeGovId: string;
  rows: Array<{ role: number; wtsPct: number; wtbPct: number; deFlatFee: number }>;
}): Transaction {
  const tx = new Transaction();
  const roles = params.rows.map((r) => r.role);
  const wtsPcts = params.rows.map((r) => BigInt(r.wtsPct));
  const wtbPcts = params.rows.map((r) => BigInt(r.wtbPct));
  const deFees = params.rows.map((r) => BigInt(r.deFlatFee));
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_ROLE_TAX_ADMIN}::set_tribe_taxes_batch`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      tx.pure.vector("u8", roles),
      tx.pure.vector("u64", wtsPcts),
      tx.pure.vector("u64", wtbPcts),
      tx.pure.vector("u64", deFees),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetTribeTaxUniform ────────────────────────────────────────────────────

/**
 * Write the same RoleTaxConfig to all 8 tribe roles (V16 convenience).
 * Move: bazaar_core::tribe_role_tax_admin::set_tribe_tax_uniform
 * Sig: (leader_cap: &TribeLeaderCap, gov: &mut TribeGovernance,
 *        wts_pct, wtb_pct, de_flat_fee, clock, ctx)
 */
export function buildSetTribeTaxUniform(params: {
  leaderCapId: string;
  tribeGovId: string;
  wtsPct: number;
  wtbPct: number;
  deFlatFee: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_ROLE_TAX_ADMIN}::set_tribe_tax_uniform`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      tx.pure.u64(BigInt(params.wtsPct)),
      tx.pure.u64(BigInt(params.wtbPct)),
      tx.pure.u64(BigInt(params.deFlatFee)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildGrantTribeRole ────────────────────────────────────────────────────────

/**
 * Grant a tribe-level cap to a recipient. Dispatches to the correct Move function by role.
 * Move targets (Phase 6 W4 / AUD-ET-21 fix — the grant fns live in
 * `tribe_governance_caps`, NOT `tribe_governance`; the old target aborted
 * with FunctionNotFound on live V35):
 *   "super_admin" -> tribe_governance_caps::grant_tribe_super_admin(leader_cap, gov, recipient, clock, ctx)
 *   "admin"       -> tribe_governance_caps::grant_tribe_admin(super_cap, gov, recipient, clock, ctx)
 *   "mod"         -> tribe_governance_caps::grant_tribe_mod(admin_cap, gov, recipient, clock, ctx)
 *
 * All grant functions return the newly created cap object (public fun — the
 * PTB transfers it to the recipient below).
 * capId — the caller's cap matching the role level (leader/super_admin/admin).
 */
export function buildGrantTribeRole(params: {
  capId: string;
  tribeGovId: string;
  recipient: string;
  roleLevel: "super_admin" | "admin" | "mod";
}): Transaction {
  const tx = new Transaction();
  const fnMap = {
    super_admin: "grant_tribe_super_admin",
    admin:       "grant_tribe_admin",
    mod:         "grant_tribe_mod",
  };
  const [newCap] = tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_GOVERNANCE_CAPS}::${fnMap[params.roleLevel]}`,
    arguments: [
      tx.object(params.capId),
      tx.object(params.tribeGovId),
      tx.pure.address(params.recipient),
      tx.object("0x6"),
    ],
  });
  tx.transferObjects([newCap], tx.pure.address(params.recipient));
  return tx;
}

// ── buildRemoveTribeMember ────────────────────────────────────────────────────

/**
 * Remove a member from a tribe (resets tribe_role to STRANGER).
 * Move: bazaar_core::tribe_governance::remove_tribe_member (line 372)
 * Sig: (cap: &TribeAdminCap, gov: &TribeGovernance,
 *        registry: &mut membership::MemberRegistry, player: address, clock, ctx)
 *
 * R4.3.d: G-02 RESOLVED — Move fn now exists.
 */
export function buildRemoveTribeMember(params: {
  capId: string;
  tribeGovId: string;
  memberRegistryId: string;
  player: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.MEMBERSHIP}::remove_tribe_member`,  // R5.2.b.3: relocated from tribe_governance to membership
    arguments: [
      tx.object(params.capId),            // cap: &TribeAdminCap [0]
      tx.object(params.tribeGovId),        // gov: &TribeGovernance [1]
      tx.object(params.memberRegistryId), // registry: &mut MemberRegistry [2]
      tx.pure.address(params.player),     // player: address [3]
      tx.object("0x6"),                   // clock: &Clock [4]
    ],
  });
  return tx;
}

// ── buildRegisterSSUToTribe ───────────────────────────────────────────────────

/**
 * Register an SSU to a tribe (TribeLeaderCap-gated, idempotent).
 * Move: bazaar_core::tribe_governance::register_ssu_to_tribe (line 283)
 * Sig: (leader_cap: &TribeLeaderCap, gov: &mut TribeGovernance,
 *        ssu_id: address, clock: &Clock, ctx: &TxContext)
 *
 * R4.3.d: G-03 RESOLVED — public entry wrapper around add_ssu now exists.
 */
export function buildRegisterSSUToTribe(params: {
  leaderCapId: string;
  tribeGovId: string;
  ssuId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_GOVERNANCE}::register_ssu_to_tribe`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      tx.pure.address(params.ssuId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildWithdrawTribeTax ──────────────────────────────────────────────────────

/**
 * Withdraw collected tax from a tribe governance wallet (TribeLeaderCap only).
 * Move: bazaar_core::tribe_governance::withdraw_tribe_tax
 * Sig: (leader_cap: &TribeLeaderCap, gov: &mut TribeGovernance,
 *        amount: u64, clock: &Clock, ctx: &mut TxContext): Coin<EVE>
 *
 * Returns Coin<EVE> — PTB must transfer it to the leader.
 * TribeLeaderCap is from dapp_hub::tribe_registry (owned object, not in bazaar_core).
 * leaderCapId  — TribeLeaderCap object ID owned by the caller.
 * tribeGovId   — TribeGovernance shared object ID.
 * senderAddress — wallet address of the caller (recipient of the withdrawn coin).
 */
export function buildWithdrawTribeTax(params: {
  leaderCapId: string;
  tribeGovId: string;
  amount: number;
  senderAddress: string;
}): Transaction {
  const tx = new Transaction();
  const [coin] = tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_GOVERNANCE}::withdraw_tribe_tax`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      tx.pure.u64(BigInt(params.amount)),
      tx.object("0x6"),
    ],
  });
  tx.transferObjects([coin], tx.pure.address(params.senderAddress));
  return tx;
}

// ── buildWithdrawTribeTaxAsSuperAdmin ──────────────────────────────────────────

/**
 * V16-DESIGN-1: Withdraw collected tax from a tribe governance wallet using
 * a TribeSuperAdminCap instead of a TribeLeaderCap. Admin / Mod tiers are not
 * authorized — only Leader + SuperAdmin can withdraw.
 * Move: bazaar_core::tribe_governance::withdraw_tribe_tax_as_super_admin
 * Sig: (cap: &TribeSuperAdminCap, gov: &mut TribeGovernance,
 *        amount: u64, clock: &Clock, ctx: &mut TxContext): Coin<EVE>
 *
 * Aborts E_TRIBE_CAP_REVOKED (4) if the SuperAdminCap is in the revocation table.
 *
 * superAdminCapId — TribeSuperAdminCap object ID owned by the caller.
 * tribeGovId      — TribeGovernance shared object ID.
 * senderAddress   — wallet address of the caller (recipient of the withdrawn coin).
 */
export function buildWithdrawTribeTaxAsSuperAdmin(params: {
  superAdminCapId: string;
  tribeGovId: string;
  amount: number;
  senderAddress: string;
}): Transaction {
  const tx = new Transaction();
  const [coin] = tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_GOVERNANCE}::withdraw_tribe_tax_as_super_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.tribeGovId),
      tx.pure.u64(BigInt(params.amount)),
      tx.object("0x6"),
    ],
  });
  tx.transferObjects([coin], tx.pure.address(params.senderAddress));
  return tx;
}

// ── buildSetTribeGodotUrl ─────────────────────────────────────────────────────

/**
 * Set or replace the on-chain godot_url for a tribe (TribeLeaderCap-gated).
 * Move: bazaar_core::tribe_governance::set_tribe_godot_url
 * Sig: (gov: &mut TribeGovernance, url: Option<String>, leader_cap: &TribeLeaderCap,
 *        clock: &Clock, ctx: &mut TxContext)
 *
 * AP2-C / FP1-28. Emits GodotUrlChangedEvent (scope=1).
 * url=null emits Option::none; url=string emits Option::some(String::utf8(bytes)).
 * Validation: call validateGodotUrlForStorage before submitting (packages/shared/godot/url-config.ts).
 *
 * NOTE: TribeLeaderCap is from dapp_hub::tribe_registry (owned object, not bazaar_core).
 *
 * tribeGovId  — TribeGovernance shared object ID (mutable).
 * leaderCapId — TribeLeaderCap owned object ID.
 * url         — new URL string, or null to clear.
 */
export function buildSetTribeGodotUrl(params: {
  tribeGovId: string;
  leaderCapId: string;
  url: string | null;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_GOVERNANCE}::set_tribe_godot_url`,
    arguments: [
      tx.object(params.tribeGovId),
      params.url === null
        ? tx.moveCall({
            target: "0x1::option::none",
            typeArguments: ["0x1::string::String"],
            arguments: [],
          })
        : tx.moveCall({
            target: "0x1::option::some",
            typeArguments: ["0x1::string::String"],
            arguments: [tx.moveCall({
              target: "0x1::string::utf8",
              typeArguments: [],
              arguments: [tx.pure.vector("u8",
                Array.from(new TextEncoder().encode(params.url)))],
            })],
          }),
      tx.object(params.leaderCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildClearTribeGodotUrl ───────────────────────────────────────────────────

/**
 * Clear the on-chain godot_url for a tribe (TribeLeaderCap-gated convenience wrapper).
 * Move: bazaar_core::tribe_governance::clear_tribe_godot_url
 * Sig: (gov: &mut TribeGovernance, leader_cap: &TribeLeaderCap, clock: &Clock, ctx)
 *
 * AP2-C / FP1-28. Delegates to set_tribe_godot_url with Option::none internally.
 * Emits GodotUrlChangedEvent with new_url_some=false.
 *
 * tribeGovId  — TribeGovernance shared object ID (mutable).
 * leaderCapId — TribeLeaderCap owned object ID.
 */
export function buildClearTribeGodotUrl(params: {
  tribeGovId: string;
  leaderCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.TRIBE_GOVERNANCE}::clear_tribe_godot_url`,
    arguments: [
      tx.object(params.tribeGovId),
      tx.object(params.leaderCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildBootstrapTribeGovernance ─────────────────────────────────────────────

/**
 * Bootstrap the TribeGovernance shared object for an EASY tribe (healing path
 * for governance-less tribes — Phase 6 W2, LEAD-09).
 *
 * Move: bazaar_core::tribe_governance_bootstrap::bootstrap_tribe_governance
 * Sig:  (registry: &mut TribeRegistry, leader_cap: &TribeLeaderCap,
 *        package_id: address, clock: &Clock, ctx: &mut TxContext)
 *
 * Phase 6 fix: this builder was DEAD-TARGETED since V17 — it pointed at
 * `tribe_governance` (the entry moved to `tribe_governance_bootstrap`) and
 * omitted the `package_id` arg (binds the WidgetConfig; passing the
 * `@bazaar_core` literal Move-side compiles to @0x0 on fresh publish, hence
 * caller-supplied). Mirrors the bundled builder in tx/index.ts:513-521.
 *
 * EASY-ONLY: Move aborts E_USE_ADVANCED_COMPLETE_FOR_ADVANCED (=1) for
 * Advanced tribes — those heal via bootstrap_advanced_complete (deposit +
 * approvals form). One-shot: re-running aborts E_ALREADY_SET (=10) at
 * set_tribe_gov_id; nothing orphans (whole-PTB rollback).
 *
 * tribeRegistryId — TribeRegistry shared object ID (mutable)
 * leaderCapId     — TribeLeaderCap owned object (caller must own matching tribe_id)
 */
export function buildBootstrapTribeGovernance(params: {
  tribeRegistryId: string;
  leaderCapId:     string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::tribe_governance_bootstrap::bootstrap_tribe_governance`,
    arguments: [
      tx.object(params.tribeRegistryId),          // registry: &mut TribeRegistry [0]
      tx.object(params.leaderCapId),               // leader_cap: &TribeLeaderCap [1]
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),    // package_id (binds WidgetConfig) [2]
      tx.object("0x6"),                            // clock: &Clock [3]
    ],
  });
  return tx;
}

// ── buildSetTribeStoreVisibility ───────────────────────────────────────────────

/**
 * Set the tribe-scoped store visibility flag (TribeAdminCap-gated).
 * Move: bazaar_core::tribe_lifecycle::set_tribe_store_visibility
 * Sig: (cap: &TribeAdminCap, gov: &mut TribeGovernance, visibility: u8, clock, ctx)
 *
 * OS-49a. 0 = public (default). 1 = tribe-members-only.
 * Asserts: Easy/Advanced bazaar type → tribe active → cap tribe match → visibility <= 1.
 * Note: uses tribe_lifecycle module (split from tribe_governance at R6.7.3).
 *
 * adminCapId — TribeAdminCap object ID owned by caller.
 * tribeGovId — TribeGovernance shared object ID (mutable).
 * visibility — 0 (public) or 1 (members-only).
 */
export function buildSetTribeStoreVisibility(params: {
  adminCapId: string;
  tribeGovId: string;
  visibility: 0 | 1;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::tribe_lifecycle::set_tribe_store_visibility`,
    arguments: [
      tx.object(params.adminCapId),
      tx.object(params.tribeGovId),
      tx.pure.u8(params.visibility),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// Higher-tier mirrors: Leader and SuperAdmin can also set store visibility.
// Move: bazaar_core::tribe_lifecycle::set_tribe_store_visibility_as_{leader,super_admin}

export function buildSetTribeStoreVisibilityAsLeader(params: {
  leaderCapId: string;
  tribeGovId: string;
  visibility: 0 | 1;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::tribe_lifecycle::set_tribe_store_visibility_as_leader`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      tx.pure.u8(params.visibility),
      tx.object("0x6"),
    ],
  });
  return tx;
}

export function buildSetTribeStoreVisibilityAsSuperAdmin(params: {
  superAdminCapId: string;
  tribeGovId: string;
  visibility: 0 | 1;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::tribe_lifecycle::set_tribe_store_visibility_as_super_admin`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.tribeGovId),
      tx.pure.u8(params.visibility),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildDeactivateTribeGovernance ────────────────────────────────────────────

/**
 * Soft-deactivate this tribe governance (TribeLeaderCap-gated). SEC-015.
 * Move: bazaar_core::tribe_lifecycle::deactivate_tribe_governance
 * Sig: (leader_cap: &TribeLeaderCap, gov: &mut TribeGovernance, clock, ctx)
 *
 * Sets gov.is_active = false. All GATED tribe-mutation entry fns abort E_TRIBE_NOT_ACTIVE.
 * EXEMPT fns (tax withdrawal, moderation, bootstrap) remain operational.
 * Idempotent — re-calling on already-deactivated tribe re-emits the event.
 *
 * leaderCapId — TribeLeaderCap object ID owned by caller.
 * tribeGovId  — TribeGovernance shared object ID (mutable).
 */
export function buildDeactivateTribeGovernance(params: {
  leaderCapId: string;
  tribeGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::tribe_lifecycle::deactivate_tribe_governance`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildActivateTribeGovernance ──────────────────────────────────────────────

/**
 * Reactivate a deactivated tribe governance (TribeLeaderCap-gated). SEC-015 symmetric.
 * Move: bazaar_core::tribe_lifecycle::activate_tribe_governance
 * Sig: (leader_cap: &TribeLeaderCap, gov: &mut TribeGovernance, clock, ctx)
 *
 * Symmetric to buildDeactivateTribeGovernance. Idempotent.
 *
 * leaderCapId — TribeLeaderCap object ID owned by caller.
 * tribeGovId  — TribeGovernance shared object ID (mutable).
 */
export function buildActivateTribeGovernance(params: {
  leaderCapId: string;
  tribeGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::tribe_lifecycle::activate_tribe_governance`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
