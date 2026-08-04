// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::tribe_governance_test_helpers {
    // R5.2.b.1 — test helpers for tribe_governance, carved out to keep
    // tribe_governance.move under the 500-line guard after R5.2.b.1 assert insertions.
    use sui::clock::Clock;
    use sui::object;
    use bazaar_core::tribe_governance::{Self, TribeGovernance, TribeAdminCap, TribeSuperAdminCap};

    /// Create a TribeGovernance for testing (easy or advanced bazaar_type only).
    /// Calls tribe_governance::create_tribe_governance directly (public(package) — accessible
    /// within package tests). Matches the ssu_governance_test_helpers delegation pattern.
    public fun create_for_testing(
        tribe_id: u64,
        bazaar_type: u8,
        leader: address,
        governance_mode: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeGovernance {
        tribe_governance::create_tribe_governance(tribe_id, bazaar_type, leader, governance_mode, clock, ctx)
    }

    /// Create a TribeGovernance for testing with widget_config_id pre-bound.
    /// Simulates the post-v5 bootstrap state where WidgetConfig is created atomically.
    /// Calls tribe_governance::construct_for_testing (test primitive inside the module —
    /// the ONLY place a TribeGovernance struct literal may be written in test contexts).
    ///
    /// The caller is responsible for creating the WidgetConfig separately and passing
    /// its ID here. The WidgetConfig object itself is NOT consumed by this helper.
    public fun create_for_testing_with_widget_config(
        tribe_id: u64,
        bazaar_type: u8,
        leader: address,
        governance_mode: u8,
        widget_config_id: object::ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeGovernance {
        tribe_governance::construct_for_testing(
            tribe_id, bazaar_type, leader, governance_mode,
            std::option::some(widget_config_id),
            clock, ctx,
        )
    }

    /// Create a TribeGovernance with an arbitrary governance_mode (bypasses MAX_SUPPORTED_MODE
    /// guard, but still asserts bazaar_type ∈ {1,2}). Use only for mode-rejection path tests.
    /// Delegates to tribe_governance::create_with_arbitrary_mode_for_testing (public #[test_only]).
    public fun create_with_arbitrary_mode_for_testing(
        tribe_id: u64,
        bazaar_type: u8,
        leader: address,
        governance_mode: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeGovernance {
        tribe_governance::create_with_arbitrary_mode_for_testing(
            tribe_id, bazaar_type, leader, governance_mode, clock, ctx,
        )
    }

    /// Destroy a TribeGovernance for testing.
    /// Delegates to tribe_governance::destroy_for_testing (public #[test_only]).
    public fun destroy_for_testing(gov: TribeGovernance) {
        tribe_governance::destroy_for_testing(gov);
    }

    /// Create a TribeAdminCap for testing.
    /// Delegates to tribe_governance::create_admin_cap_for_testing (public #[test_only]).
    public fun create_admin_cap_for_testing(tribe_id: u64, ctx: &mut TxContext): TribeAdminCap {
        tribe_governance::create_admin_cap_for_testing(tribe_id, ctx)
    }

    /// Create a TribeSuperAdminCap for testing.
    /// Delegates to tribe_governance::create_super_admin_cap_for_testing (public #[test_only]).
    public fun create_super_admin_cap_for_testing(tribe_id: u64, ctx: &mut TxContext): TribeSuperAdminCap {
        tribe_governance::create_super_admin_cap_for_testing(tribe_id, ctx)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
