// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Per-SSU shop configuration setters (OS-44 + OS-45).
/// Decision 1 (Round-1): SSU-scope (not tribe-scope). Cap binding per C-01:
///   SSUSuperAdminCap (primary) + SSUOwnerCap (overload) mirroring OS-35 pattern.
/// Fields live on SSUGovernance (struct extensions landed R6.7.1).
module bazaar_core::ssu_shop_config {
    use sui::event;
    use sui::clock::Clock;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::membership;

    // ===== Error Codes =====
    const E_INVALID_ROLE: u64 = 40;            // role > 7
    const E_INVALID_MAX_SHOPS_PER_ROLE: u64 = 41; // max > REASONABLE_MAX_PER_ROLE
    const E_ZERO_ITEMS_LIMIT: u64 = 42;        // max_items must be > 0 if non-sentinel

    // Sentinel: max roles are 0..7 inclusive (per membership.move role range)
    const MAX_ROLE_ID: u8 = 7;
    // Sentinel: cap per-role shop limit at 1000 (C-01 requirement)
    const REASONABLE_MAX_PER_ROLE: u64 = 1000;

    // staff_kind constants (mirrors ssu_governance_caps)
    const STAFF_KIND_OWNER: u8 = 0;
    const STAFF_KIND_SUPER_ADMIN: u8 = 1;

    // ===== Events =====
    /// Emitted when a per-role shop count limit is set via set_ssu_shop_limit_for_role_as_*.
    public struct SSUShopLimitSet has copy, drop {
        ssu_id: address,
        role: u8,
        max: u64,
        set_by: address,
        staff_kind: u8,
        timestamp_ms: u64,
    }

    /// Emitted when per-SSU shop config (items_limit + auto_expiry) is set.
    public struct SSUShopConfigSet has copy, drop {
        ssu_id: address,
        max_items: u64,
        auto_expiry_ms: u64,
        set_by: address,
        staff_kind: u8,
        timestamp_ms: u64,
    }

    // ===== OS-44: Per-Role Shop Limit =====

    /// SuperAdmin-primary: set per-role shop count limit for this SSU.
    /// Aborts E_WRONG_SSU, E_SSU_NOT_ACTIVE, E_INVALID_ROLE, E_INVALID_MAX_SHOPS_PER_ROLE.
    public entry fun set_ssu_shop_limit_for_role_as_super_admin(
        cap: &membership::SSUSuperAdminCap,
        gov: &mut SSUGovernance,
        role: u8,
        max: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            membership::ssu_super_admin_cap_ssu_id(cap) == ssu_governance::ssu_id(gov)
                && !ssu_governance::is_cap_revoked(gov, object::id(cap)),
            ssu_governance::e_wrong_ssu(),
        );
        ssu_governance::assert_active(gov);
        assert!(role <= MAX_ROLE_ID, E_INVALID_ROLE);
        assert!(max <= REASONABLE_MAX_PER_ROLE, E_INVALID_MAX_SHOPS_PER_ROLE);
        ssu_governance::set_shop_limit_for_role(gov, role, max);
        event::emit(SSUShopLimitSet {
            ssu_id: ssu_governance::ssu_id(gov),
            role, max,
            set_by: ctx.sender(),
            staff_kind: STAFF_KIND_SUPER_ADMIN,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Owner overload: set per-role shop count limit for this SSU.
    public entry fun set_ssu_shop_limit_for_role_as_owner(
        cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        role: u8,
        max: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_governance::assert_active(gov);
        assert!(role <= MAX_ROLE_ID, E_INVALID_ROLE);
        assert!(max <= REASONABLE_MAX_PER_ROLE, E_INVALID_MAX_SHOPS_PER_ROLE);
        ssu_governance::set_shop_limit_for_role(gov, role, max);
        event::emit(SSUShopLimitSet {
            ssu_id: ssu_governance::ssu_id(gov),
            role, max,
            set_by: ctx.sender(),
            staff_kind: STAFF_KIND_OWNER,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    // ===== OS-45: Shop Items Limit + Auto-Expiry =====

    /// SuperAdmin-primary: set per-SSU max items per shop + auto-expiry duration.
    /// max_items = 0 clears the limit (no cap). auto_expiry_ms = 0 clears auto-expiry.
    public entry fun set_ssu_shop_config_as_super_admin(
        cap: &membership::SSUSuperAdminCap,
        gov: &mut SSUGovernance,
        max_items: u64,
        auto_expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            membership::ssu_super_admin_cap_ssu_id(cap) == ssu_governance::ssu_id(gov)
                && !ssu_governance::is_cap_revoked(gov, object::id(cap)),
            ssu_governance::e_wrong_ssu(),
        );
        ssu_governance::assert_active(gov);
        ssu_governance::set_shop_items_limit(gov, max_items);
        ssu_governance::set_shop_auto_expiry_ms(gov, auto_expiry_ms);
        event::emit(SSUShopConfigSet {
            ssu_id: ssu_governance::ssu_id(gov),
            max_items, auto_expiry_ms,
            set_by: ctx.sender(),
            staff_kind: STAFF_KIND_SUPER_ADMIN,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Owner overload: set per-SSU max items per shop + auto-expiry duration.
    public entry fun set_ssu_shop_config_as_owner(
        cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        max_items: u64,
        auto_expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_governance::assert_active(gov);
        ssu_governance::set_shop_items_limit(gov, max_items);
        ssu_governance::set_shop_auto_expiry_ms(gov, auto_expiry_ms);
        event::emit(SSUShopConfigSet {
            ssu_id: ssu_governance::ssu_id(gov),
            max_items, auto_expiry_ms,
            set_by: ctx.sender(),
            staff_kind: STAFF_KIND_OWNER,
            timestamp_ms: clock.timestamp_ms(),
        });
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
