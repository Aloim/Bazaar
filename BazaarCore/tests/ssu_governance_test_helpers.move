// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::ssu_governance_test_helpers {
    // R3.5 — test-only helpers carved out of ssu_governance.move to keep that
    // file under the 500-line guard after R3.5 freeze additions.
    use sui::clock::Clock;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::membership;

    /// Create an SSUGovernance for testing (3 dummy IDs: member_registry,
    /// announcement_board, guestbook_board). The widget_config_id
    /// is caller-supplied so tests that exercise widget ID accessors still work.
    /// Calls create_ssu_governance directly (public(package) — accessible within package tests).
    public fun create_for_testing(
        ssu_id: address,
        bazaar_type: u8,
        tribe_id: u64,
        owner: address,
        widget_config_id: sui::object::ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ): SSUGovernance {
        // V33: 6 per-SSU ID slots (mission_board removed). widget, member, ann,
        // guest, quicktrade_vault, wtb_escrow_pool.
        let dummy = object::id_from_address(@0x0);
        ssu_governance::create_ssu_governance(
            ssu_id, bazaar_type, tribe_id, owner,
            widget_config_id, dummy, dummy, dummy,
            dummy,
            dummy,
            clock, ctx,
        )
    }

    /// Create an SSUGovernance for testing with all 6 per-SSU object IDs set to
    /// dummy zero-derived values. Use when the test does not exercise per-SSU
    /// board ID accessors.
    public fun create_for_testing_with_dummy_ids(
        ssu_id: address,
        bazaar_type: u8,
        tribe_id: u64,
        owner: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): SSUGovernance {
        let dummy = object::id_from_address(@0x0);
        ssu_governance::create_ssu_governance(
            ssu_id, bazaar_type, tribe_id, owner,
            dummy, dummy, dummy, dummy,
            dummy,
            dummy,
            clock, ctx,
        )
    }

    /// Share an SSUGovernance for testing (shared object).
    /// Delegates to ssu_governance::share (public(package)) instead of calling
    /// transfer::share_object directly — SSUGovernance has only `key` (no `store`),
    /// so sharing from outside the defining module requires the module's own helper.
    public fun share_for_testing(gov: SSUGovernance) {
        ssu_governance::share(gov);
    }

    /// Create an SSUOwnerCap for testing.
    public fun create_owner_cap_for_testing(
        ssu_id: address, tribe_id: u64, ctx: &mut TxContext,
    ): membership::SSUOwnerCap {
        membership::create_ssu_owner_cap(ssu_id, tribe_id, ctx)
    }

    /// Destroy an SSUOwnerCap for testing.
    public fun destroy_owner_cap_for_testing(cap: membership::SSUOwnerCap) {
        membership::destroy_ssu_owner_cap_for_testing(cap);
    }

    /// Directly certify an SSUGovernance as depreciated (P5 test seam): mirrors the
    /// make_inactive_shop / set_shop_inactive_for_testing direct-state-injection precedent
    /// (BazaarShopOps/tests/shop_close_recovery_test_helpers.move) -- P2/P3/P4 prune-entry
    /// tests need a depreciated gov as a PRECONDITION; they are not exercising the certificate
    /// mark flow itself (bazaar_core::ssu_depreciation's own test files own that coverage).
    /// Delegates to the package-private ssu_governance::set_depreciated setter, which also
    /// flips is_active=false (production semantics preserved exactly).
    public fun set_depreciated_for_testing(gov: &mut SSUGovernance) {
        ssu_governance::set_depreciated(gov);
    }

    /// Destroy an SSUGovernance for testing. Delegates to ssu_governance::destroy_for_testing
    /// which has access to the private fields (including the R3.5 frozen field).
    public fun destroy_for_testing(gov: SSUGovernance) {
        ssu_governance::destroy_for_testing(gov);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
