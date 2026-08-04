// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore SSU governance TX builders.
 *
 * buildSetSSURoleTax               — V16: sets per-role SSU tax row (Stranger..Owner)
 * buildClearSSURoleTax             — V16: removes a per-role tax row
 * buildSetSSUTaxesBatch            — V16: writes multiple per-role rows in one TX
 * buildSetSSUTaxUniform            — V16: writes all 8 roles to same RoleTaxConfig (legacy-equivalent)
 * buildGrantSSURole                — grants an SSU role to a player via MemberRegistry
 * buildIssueSSUSuperAdminCap       — issues an SSUSuperAdminCap (Owner-only) — FP1-25
 * buildRevokeSSUSuperAdminCap      — revokes by cap ID, Owner-unilateral — FP1-25
 * buildDestroyRevokedSSUSuperAdminCap — GC fn for revoked cap holders — FP1-25
 * buildForceCloseShop              — force-close a shop as SSU admin (R4.3.c activated)
 *
 * Unit convention (V16): wts_pct / wtb_pct stored ×100 (525 = 5.25%). MAX_TAX_PCT = 1000 = 10%.
 * de_flat_fee remains a flat EVE amount in base units.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, SHARED_OBJECTS } from "../../constants";

// ── buildSetSSURoleTax ─────────────────────────────────────────────────────────

/**
 * Set or overwrite a single per-role SSU tax row (V16 — Session 3B Move ABI).
 * Move: bazaar_core::ssu_role_tax_admin::set_ssu_role_tax
 * Sig: (cap: &SSUOwnerCap, gov: &mut SSUGovernance, role: u8,
 *        wts_pct, wtb_pct, de_flat_fee: u64, clock: &Clock, ctx)
 *
 * role        — u8 role index (0..7; Stranger=0, Moderator=1, …, Owner=7).
 * wtsPct      — percentage ×100 (525 = 5.25%); cap MAX_TAX_PCT = 1000 (10%).
 * wtbPct      — same convention.
 * deFlatFee   — flat EVE amount in base units (not a percentage).
 * ownerCapId  — SSUOwnerCap object ID owned by the caller.
 * ssuGovId    — SSUGovernance shared object ID for this SSU.
 */
export function buildSetSSURoleTax(params: {
  ownerCapId: string;
  ssuGovId: string;
  role: number;
  wtsPct: number;
  wtbPct: number;
  deFlatFee: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_ROLE_TAX_ADMIN}::set_ssu_role_tax`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.pure.u8(params.role),
      tx.pure.u64(BigInt(params.wtsPct)),
      tx.pure.u64(BigInt(params.wtbPct)),
      tx.pure.u64(BigInt(params.deFlatFee)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetSsuMissionFee ──────────────────────────────────────────────────────

/**
 * Set the per-hour Mission (MIS) listing fee on the SSU layer (SSU Owner only).
 * Applies to ALL bazaar types; denomination implied by the SSU's bazaarType
 * (raw MIST EVE for NoTribe/Easy, tribe-token units for Advanced).
 * Move: bazaar_core::ssu_governance::set_ssu_mission_listing_fee (Slice 3).
 * Sig: (gov: &mut SSUGovernance, fee_per_hour: u64, owner_cap: &SSUOwnerCap,
 *        clock: &Clock, ctx).
 */
export function buildSetSsuMissionFee(params: {
  ownerCapId: string;
  ssuGovId: string;
  feePerHour: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_GOVERNANCE}::set_ssu_mission_listing_fee`,
    arguments: [
      tx.object(params.ssuGovId),               // gov: &mut SSUGovernance
      tx.pure.u64(BigInt(params.feePerHour)),   // fee_per_hour: u64
      tx.object(params.ownerCapId),             // owner_cap: &SSUOwnerCap
      tx.object("0x6"),                         // clock: &Clock
    ],
  });
  return tx;
}

// ── buildClearSSURoleTax ───────────────────────────────────────────────────────

/**
 * Remove a per-role SSU tax row (V16). Subsequent lookups return 0.
 * Move: bazaar_core::ssu_role_tax_admin::clear_ssu_role_tax
 * Sig: (cap: &SSUOwnerCap, gov: &mut SSUGovernance, role: u8, clock, ctx)
 */
export function buildClearSSURoleTax(params: {
  ownerCapId: string;
  ssuGovId: string;
  role: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_ROLE_TAX_ADMIN}::clear_ssu_role_tax`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.pure.u8(params.role),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetSSUTaxesBatch ──────────────────────────────────────────────────────

/**
 * Set multiple per-role SSU tax rows in one TX (V16). All vectors must have equal length.
 * Move: bazaar_core::ssu_role_tax_admin::set_ssu_taxes_batch
 * Sig: (cap: &SSUOwnerCap, gov: &mut SSUGovernance,
 *        roles: vector<u8>, wts_pcts: vector<u64>, wtb_pcts: vector<u64>,
 *        de_flat_fees: vector<u64>, clock, ctx)
 */
export function buildSetSSUTaxesBatch(params: {
  ownerCapId: string;
  ssuGovId: string;
  rows: Array<{ role: number; wtsPct: number; wtbPct: number; deFlatFee: number }>;
}): Transaction {
  const tx = new Transaction();
  const roles = params.rows.map((r) => r.role);
  const wtsPcts = params.rows.map((r) => BigInt(r.wtsPct));
  const wtbPcts = params.rows.map((r) => BigInt(r.wtbPct));
  const deFees = params.rows.map((r) => BigInt(r.deFlatFee));
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_ROLE_TAX_ADMIN}::set_ssu_taxes_batch`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.pure.vector("u8", roles),
      tx.pure.vector("u64", wtsPcts),
      tx.pure.vector("u64", wtbPcts),
      tx.pure.vector("u64", deFees),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildSetSSUTaxUniform ──────────────────────────────────────────────────────

/**
 * Write the same RoleTaxConfig to all 8 roles (V16 convenience — legacy-equivalent).
 * Move: bazaar_core::ssu_role_tax_admin::set_ssu_tax_uniform
 * Sig: (cap: &SSUOwnerCap, gov: &mut SSUGovernance, wts_pct, wtb_pct, de_flat_fee, clock, ctx)
 *
 * Use this for initial-setup UX or test helpers; equivalent to the retired
 * `set_ssu_tax_config` flat setter.
 */
export function buildSetSSUTaxUniform(params: {
  ownerCapId: string;
  ssuGovId: string;
  wtsPct: number;
  wtbPct: number;
  deFlatFee: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_ROLE_TAX_ADMIN}::set_ssu_tax_uniform`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.pure.u64(BigInt(params.wtsPct)),
      tx.pure.u64(BigInt(params.wtbPct)),
      tx.pure.u64(BigInt(params.deFlatFee)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildGrantSSURole ──────────────────────────────────────────────────────────

/**
 * Grant an SSU role to a player.
 * Move: bazaar_core::membership::set_ssu_role
 * Sig: (cap: &SSUOwnerCap, registry: &mut MemberRegistry, player: address, role: u8, ctx)
 * ownerCapId        — SSUOwnerCap object ID owned by the caller.
 * memberRegistryId  — MemberRegistry shared object ID for this SSU.
 * player            — target player's wallet address.
 * role              — numeric role level (1-7 per role_types.move).
 */
export function buildGrantSSURole(params: {
  ownerCapId: string;
  memberRegistryId: string;
  player: string;
  role: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.MEMBERSHIP}::set_ssu_role`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.memberRegistryId),
      tx.pure.address(params.player),
      tx.pure.u8(params.role),
    ],
  });
  return tx;
}

// ── buildSetSSURoleGated ───────────────────────────────────────────────────────

/**
 * Set an SSU role via the registry-role-gated entry (V30).
 * Move: bazaar_core::membership::set_ssu_role_gated
 * Sig: (registry: &mut MemberRegistry, player: address, new_role: u8, ctx)
 *
 * Authority is the CALLER's OWN ssu_role in the registry — NO cap object required
 * (SSU Admin/Mod caps are never minted). On-chain hierarchy: caller must be
 * Admin(5)+, new_role <= 6 (Owner conferred only by SSUOwnerCap), new_role <=
 * caller's role, and target's current role <= caller's role. Lets SuperAdmins and
 * Admins manage users, not just the Owner.
 *
 * memberRegistryId — MemberRegistry shared object ID for this SSU.
 * player           — target player's wallet address (must already be registered).
 * newRole          — numeric role 0..6 (Stranger..SuperAdmin).
 */
export function buildSetSSURoleGated(params: {
  memberRegistryId: string;
  player: string;
  newRole: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.MEMBERSHIP}::set_ssu_role_gated`,
    arguments: [
      tx.object(params.memberRegistryId),
      tx.pure.address(params.player),
      tx.pure.u8(params.newRole),
    ],
  });
  return tx;
}

// ── buildSetSSURolesGated (multi) ──────────────────────────────────────────────

/**
 * Set the same SSU member role across SEVERAL MemberRegistries in one PTB.
 *
 * Used by the Tribe Governance → Users & Roles tab, where a player can be a
 * member of multiple of the tribe's SSUs but is shown as ONE deduped row: a role
 * change is applied to every SSU registry the caller is authorised in. Each call
 * is the same registry-role-gated entry as buildSetSSURoleGated (authority is the
 * caller's own ssu_role in each registry). An empty `updates` list returns an
 * empty transaction (callers should guard against that).
 */
export function buildSetSSURolesGated(params: {
  updates: Array<{ memberRegistryId: string; player: string; newRole: number }>;
}): Transaction {
  const tx = new Transaction();
  for (const u of params.updates) {
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.MEMBERSHIP}::set_ssu_role_gated`,
      arguments: [
        tx.object(u.memberRegistryId),
        tx.pure.address(u.player),
        tx.pure.u8(u.newRole),
      ],
    });
  }
  return tx;
}

// ── buildForceCloseShop ───────────────────────────────────────────────────────

/**
 * Force-close a shop as SSUOwnerCap (Owner-tier path, closer_tier=0).
 * Move: bazaar_core::shop_moderation::force_close_shop
 * Sig: (cap: &SSUOwnerCap, registry: &mut BazarRegistry, shop_id: ID,
 *       gov: &SSUGovernance, clock: &Clock, ctx)
 * R6.7.2 relocation: function moved from `bazar` module to `shop_moderation`;
 * ssuGovId param added; gov arg inserted before clock.
 * ownerCapId — SSUOwnerCap object ID owned by the caller.
 * shopId     — Shop object ID to force-close (passed as pure ID, not object ref).
 * ssuGovId   — SSUGovernance shared object ID (immutable).
 */
export function buildForceCloseShop(params: {
  ownerCapId:           string;
  shopId:               string;
  ssuGovId:             string;
  ssuId:                string;    // NEW — &mut StorageUnit
  recipientCharacterId: string;    // NEW — &Character (shop owner's character)
  wtbEscrowPoolId:      string;    // NEW — &mut WtbEscrowPool
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    // V38 split: shop_moderation moved bazaar_core → bazaar_shop_ops (module name unchanged).
    target: `${PACKAGE_IDS.BAZAAR_SHOP_OPS}::${MODULES.SHOP_MODERATION}::force_close_shop`,
    arguments: [
      tx.object(params.ownerCapId),                    // cap: &SSUOwnerCap
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),        // registry: &mut BazarRegistry
      tx.pure.id(params.shopId),                        // shop_id: ID
      tx.object(params.ssuGovId),                       // gov: &SSUGovernance
      tx.object(params.ssuId),                          // ssu: &mut StorageUnit  (NEW)
      tx.object(params.recipientCharacterId),           // recipient_character: &Character  (NEW)
      tx.object(params.wtbEscrowPoolId),                // pool: &mut WtbEscrowPool  (NEW)
      tx.object(SHARED_OBJECTS.SHOP_OPS_CAP_STORE),     // V38: cap_store: &ShopOpsCapStore (before clock)
      tx.object("0x6"),                                 // clock: &Clock
    ],
  });
  return tx;
}

// ── buildWithdrawSSUTax ────────────────────────────────────────────────────────

/**
 * Withdraw collected tax from an SSU governance wallet (SSUOwnerCap only).
 * Move: bazaar_core::ssu_governance::withdraw_ssu_tax
 * Sig: (cap: &SSUOwnerCap, gov: &mut SSUGovernance,
 *        amount: u64, clock: &Clock, ctx: &mut TxContext): Coin<SUI>
 *
 * DA-006 resolution: Returns Coin<SUI> — PTB must transfer it to the owner.
 * The PTB includes tx.transferObjects([coin], senderAddress) after the moveCall.
 * senderAddress is the wallet address of the caller (passed as param for PTB clarity).
 * ownerCapId — SSUOwnerCap object ID. ssuGovId — SSUGovernance shared object ID.
 */
export function buildWithdrawSSUTax(params: {
  ownerCapId: string;
  ssuGovId: string;
  amount: number;
  senderAddress: string;
}): Transaction {
  const tx = new Transaction();
  const [coin] = tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_GOVERNANCE}::withdraw_ssu_tax`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.pure.u64(BigInt(params.amount)),
      tx.object("0x6"),
    ],
  });
  tx.transferObjects([coin], tx.pure.address(params.senderAddress));
  return tx;
}

// ── buildIssueSSUSuperAdminCap ────────────────────────────────────────────────

/**
 * Issue an SSUSuperAdminCap to a recipient (Owner-only).
 * Move: bazaar_core::ssu_governance_caps::issue_ssu_super_admin_cap
 * Sig: (owner_cap: &SSUOwnerCap, gov: &SSUGovernance, recipient: address,
 *        clock: &Clock, ctx: &mut TxContext)
 *
 * Move transfers the new cap internally to `recipient` — PTB does NOT call
 * transferObjects. Single-step governance UX PTB.
 *
 * ownerCapId — SSUOwnerCap object ID owned by the sender.
 * ssuGovId   — SSUGovernance shared object ID for this SSU.
 * recipient  — address to receive the new SSUSuperAdminCap.
 */
export function buildIssueSSUSuperAdminCap(params: {
  ownerCapId: string;
  ssuGovId: string;
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_GOVERNANCE_CAPS}::issue_ssu_super_admin_cap`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.ssuGovId),
      tx.pure.address(params.recipient),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildRevokeSSUSuperAdminCap ───────────────────────────────────────────────

/**
 * Revoke an SSUSuperAdminCap by its object ID (Owner-unilateral, revoke-redesign).
 * Move: bazaar_core::ssu_governance_caps::revoke_ssu_super_admin_cap
 * Sig: (ssu_gov: &mut SSUGovernance, target_cap_id: ID,
 *        owner_cap: &SSUOwnerCap, clock: &Clock, ctx: &mut TxContext)
 *
 * By-ID revoke: Owner does NOT need to possess the target cap. The cap object
 * remains in the holder's wallet but is recorded as invalid in the SSUGovernance
 * revocation table. All SuperAdmin-gated entry fns (FP1-33+) MUST call
 * is_ssu_super_admin_cap_valid before acting on any SSUSuperAdminCap.
 *
 * ownerCapId  — SSUOwnerCap object ID owned by the sender.
 * ssuGovId    — SSUGovernance shared object ID for this SSU (mutable).
 * targetCapId — Object ID of the SSUSuperAdminCap to revoke.
 */
export function buildRevokeSSUSuperAdminCap(params: {
  ownerCapId: string;
  ssuGovId: string;
  targetCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_GOVERNANCE_CAPS}::revoke_ssu_super_admin_cap`,
    arguments: [
      tx.object(params.ssuGovId),
      tx.pure.id(params.targetCapId),
      tx.object(params.ownerCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildDestroyRevokedSSUSuperAdminCap ───────────────────────────────────────

/**
 * Destroy a revoked SSUSuperAdminCap (permissionless GC — caller must hold the cap).
 * Move: bazaar_core::ssu_governance_caps::destroy_revoked_super_admin_cap
 * Sig: (cap: SSUSuperAdminCap, ssu_gov: &SSUGovernance)
 *
 * Only callable after the cap has been revoked via revoke_ssu_super_admin_cap.
 * Aborts E_NOT_REVOKED if the cap is not in the revocation table.
 *
 * superAdminCapId — The SSUSuperAdminCap object ID to destroy (caller-owned).
 * ssuGovId        — SSUGovernance shared object ID for this SSU.
 */
export function buildDestroyRevokedSSUSuperAdminCap(params: {
  superAdminCapId: string;
  ssuGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_GOVERNANCE_CAPS}::destroy_revoked_super_admin_cap`,
    arguments: [
      tx.object(params.superAdminCapId),
      tx.object(params.ssuGovId),
    ],
  });
  return tx;
}

// ── buildSetSSUGodotUrl ───────────────────────────────────────────────────────

/**
 * Set or replace the on-chain godot_url for an SSU (Owner-gated).
 * Move: bazaar_core::ssu_governance::set_ssu_godot_url
 * Sig: (gov: &mut SSUGovernance, url: Option<String>, owner_cap: &SSUOwnerCap,
 *        clock: &Clock, ctx: &mut TxContext)
 *
 * AP2-C / FP1-28. Emits GodotUrlChangedEvent (scope=0).
 * url=null emits Option::none; url=string emits Option::some(String::utf8(bytes)).
 * Validation: call validateGodotUrlForStorage before submitting (packages/shared/godot/url-config.ts).
 *
 * ssuGovId   — SSUGovernance shared object ID (mutable).
 * ownerCapId — SSUOwnerCap owned object ID.
 * url        — new URL string, or null to clear.
 */
export function buildSetSSUGodotUrl(params: {
  ssuGovId: string;
  ownerCapId: string;
  url: string | null;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_GOVERNANCE}::set_ssu_godot_url`,
    arguments: [
      tx.object(params.ssuGovId),
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
      tx.object(params.ownerCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── buildClearSSUGodotUrl ─────────────────────────────────────────────────────

/**
 * Clear the on-chain godot_url for an SSU (Owner-gated convenience wrapper).
 * Move: bazaar_core::ssu_governance::clear_ssu_godot_url
 * Sig: (gov: &mut SSUGovernance, owner_cap: &SSUOwnerCap, clock: &Clock, ctx)
 *
 * AP2-C / FP1-28. Delegates to set_ssu_godot_url with Option::none internally.
 * Emits GodotUrlChangedEvent with new_url_some=false.
 *
 * ssuGovId   — SSUGovernance shared object ID (mutable).
 * ownerCapId — SSUOwnerCap owned object ID.
 */
export function buildClearSSUGodotUrl(params: {
  ssuGovId: string;
  ownerCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.SSU_GOVERNANCE}::clear_ssu_godot_url`,
    arguments: [
      tx.object(params.ssuGovId),
      tx.object(params.ownerCapId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
