// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// V35 8a/8b: Tribe-level shop configuration entry fns and events.
/// Tribe shop limits are ON-CHAIN CONFIG stored in TribeGovernance fields.
/// Enforcement model:
///   - shop_items_limit: FE-advisory config only (not enforced on-chain, matching SSU precedent).
///   - max_shops_override / shop_limits_by_role: on-chain config stored; FE pre-checks against
///     tribe limits; the existing SSU per-role assert_shop_limit_ok remains the on-chain backstop.
///   - NoTribe bazaar type: unaffected (these setters gate on assert_easy_or_advanced).
///
/// All setters require Leader or SuperAdmin authority (SA-08: higher tier reverses lockout).
/// SA-08: Some(0) for max_shops is rejected (E_INVALID_MAX_SHOPS) — equivalent to
///        "all shops blocked", which is always a misconfiguration. Pass None to remove the cap.
module bazaar_core::tribe_shop_config {
    use sui::clock::Clock;
    use sui::event;
    use dapp_hub::tribe_registry;
    use bazaar_core::tribe_governance::{
        Self, TribeGovernance, TribeSuperAdminCap,
    };
    use bazaar_core::bazaar_assertions;

    // ===== Error Codes =====
    const E_WRONG_TRIBE: u64 = 1;
    /// SA-08: reject Some(0) for max_shops (all-blocked misconfiguration).
    const E_INVALID_MAX_SHOPS: u64 = 20;

    // ===== Events (CC-02 option A: declared here, emitted locally) =====

    public struct TribeMaxShopsSet has copy, drop {
        tribe_id: u64,
        max_shops: Option<u64>,
        actor: address,
        timestamp_ms: u64,
    }

    public struct TribeShopRoleLimitSet has copy, drop {
        tribe_id: u64,
        role: u8,
        max: u64,
        actor: address,
        timestamp_ms: u64,
    }

    public struct TribeShopItemsLimitSet has copy, drop {
        tribe_id: u64,
        limit: u64,
        actor: address,
        timestamp_ms: u64,
    }

    // ===== Entry Setters =====

    /// Set tribe-level per-owner max-shops cap. Leader-gated.
    /// Pass None to remove the cap. Pass Some(n>0) to set a ceiling.
    /// SA-08: Some(0) aborts E_INVALID_MAX_SHOPS.
    public entry fun set_tribe_max_shops_as_leader(
        leader_cap: &tribe_registry::TribeLeaderCap,
        gov: &mut TribeGovernance,
        max_shops: Option<u64>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        if (std::option::is_some(&max_shops)) {
            assert!(*std::option::borrow(&max_shops) > 0, E_INVALID_MAX_SHOPS);
        };
        tribe_governance::set_tribe_max_shops_override(gov, max_shops);
        event::emit(TribeMaxShopsSet {
            tribe_id: tribe_governance::tribe_id(gov),
            max_shops,
            actor: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Set tribe-level per-owner max-shops cap. SuperAdmin-gated.
    /// SA-01: asserts cap not revoked.
    /// SA-08: Leader (via set_tribe_max_shops_as_leader) can always reverse by passing None.
    public entry fun set_tribe_max_shops_as_super_admin(
        cap: &TribeSuperAdminCap,
        gov: &mut TribeGovernance,
        max_shops: Option<u64>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_governance::tribe_super_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, sui::object::id(cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        if (std::option::is_some(&max_shops)) {
            assert!(*std::option::borrow(&max_shops) > 0, E_INVALID_MAX_SHOPS);
        };
        tribe_governance::set_tribe_max_shops_override(gov, max_shops);
        event::emit(TribeMaxShopsSet {
            tribe_id: tribe_governance::tribe_id(gov),
            max_shops,
            actor: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Set per-role shop limit. Leader-gated. max=0 clears the role row.
    public entry fun set_tribe_shop_limit_for_role_as_leader(
        leader_cap: &tribe_registry::TribeLeaderCap,
        gov: &mut TribeGovernance,
        role: u8,
        max: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        tribe_governance::set_tribe_shop_limit_for_role(gov, role, max);
        event::emit(TribeShopRoleLimitSet {
            tribe_id: tribe_governance::tribe_id(gov),
            role, max,
            actor: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Set per-role shop limit. SuperAdmin-gated.
    /// SA-01: asserts cap not revoked.
    public entry fun set_tribe_shop_limit_for_role_as_super_admin(
        cap: &TribeSuperAdminCap,
        gov: &mut TribeGovernance,
        role: u8,
        max: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_governance::tribe_super_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, sui::object::id(cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        tribe_governance::set_tribe_shop_limit_for_role(gov, role, max);
        event::emit(TribeShopRoleLimitSet {
            tribe_id: tribe_governance::tribe_id(gov),
            role, max,
            actor: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Set tribe-wide shop items limit (FE-advisory). Leader-gated. 0 = no limit.
    /// shop_items_limit is NOT enforced on-chain in V35 (matches SSU precedent).
    /// FE reads tribe_shop_items_limit() accessor and enforces at shop-creation time.
    public entry fun set_tribe_shop_items_limit_as_leader(
        leader_cap: &tribe_registry::TribeLeaderCap,
        gov: &mut TribeGovernance,
        limit: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        tribe_governance::set_tribe_shop_items_limit(gov, limit);
        event::emit(TribeShopItemsLimitSet {
            tribe_id: tribe_governance::tribe_id(gov),
            limit,
            actor: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
