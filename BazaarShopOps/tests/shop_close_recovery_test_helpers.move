// BazaarShopOps/tests/shop_close_recovery_test_helpers.move (V38 split: moved from bazaar_core)
// ============================================================
// 500-LINE GUARD: this file MUST NOT exceed 500 lines.
// Current estimate: ~196 LOC. Add new helpers above this comment.
// ============================================================

/// Test helpers for close-shop and shop-recovery scenarios.
/// Provides lightweight factory functions that create shops in known states
/// (empty, at-position, inactive, WTB-with-pool) without world object calls,
/// plus assertion helpers for deactivation status and pool residue.
///
/// All factories take `members: &MemberRegistry` (IMMUTABLE) — matching the
/// `bazar::create_*_shop` downstream requirement. Tests may hold a plain
/// `let members = ...` binding and pass `&members` directly.
#[test_only]
module bazaar_shop_ops::shop_close_recovery_test_helpers {

    use sui::clock::Clock;
    use sui::tx_context::TxContext;
    use sui::coin;
    use EVE::EVE::EVE;

    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_free;
    use bazaar_core::ssu_governance::SSUGovernance;
    use bazaar_core::membership::{Self, MemberRegistry, SSUSuperAdminCap};
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::wtb_escrow_pool::{Self, WtbEscrowPool};

    // ---------------------------------------------------------------
    // Shop factories
    // ---------------------------------------------------------------

    /// Create a WTS shop with zero listings on the given SSU. Returns the shop ID.
    /// Empty listings → drain loop in close_shop executes 0 iterations → no world calls.
    public fun make_wts_shop_empty(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        ssu_addr: address,
        tribe_id: u64,
        bazaar_type: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        bazar_test_accessors::create_wts_shop_for_testing(
            registry, gov, members,
            bazaar_type,
            b"TestWTS",
            ssu_addr,
            tribe_id,
            vector[100u64],       // item_type_ids  (1-item — passes validate_shop_params)
            vector[1u64],         // quantities
            vector[1000u64],      // prices_eve
            9999999999u64,        // expiry_ms (large sentinel — shop never expires in tests)
            0u64, 0u64,           // position_x, position_y
            clock, ctx,
        )
    }

    /// Create a WTS shop at an explicit (x, y) position. Returns the shop ID.
    public fun make_wts_shop_at_position(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        ssu_addr: address,
        tribe_id: u64,
        bazaar_type: u8,
        position_x: u64,
        position_y: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        bazar_test_accessors::create_wts_shop_for_testing(
            registry, gov, members,
            bazaar_type,
            b"TestWTS",
            ssu_addr,
            tribe_id,
            vector[100u64],       // item_type_ids
            vector[1u64],         // quantities
            vector[1000u64],      // prices_eve
            9999999999u64,        // expiry_ms (large sentinel — shop never expires in tests)
            position_x, position_y,
            clock, ctx,
        )
    }

    /// Create a DE shop with zero offer/request pairs. Returns shop ID.
    /// Verified signature (bazar.move): 4 separate vectors
    /// (offer_item_type_ids, offer_quantities, request_item_type_ids, request_quantities).
    public fun make_de_shop_empty(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        ssu_addr: address,
        tribe_id: u64,
        bazaar_type: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        bazar_test_accessors::create_de_shop_for_testing(
            registry, gov, members,
            bazaar_type,
            b"TestDE",
            ssu_addr,
            tribe_id,
            vector[100u64],       // offer_item_type_ids  (1-item — passes validate_shop_params)
            vector[1u64],         // offer_quantities
            vector[200u64],       // request_item_type_ids
            vector[1u64],         // request_quantities
            vector[1u64],         // offer_per_lots (legacy 1:N ratio)
            9999999999u64,        // expiry_ms
            0u64, 0u64,           // position_x, position_y
            clock, ctx,
        )
    }

    /// Create a FREE shop with zero listings. Returns shop ID.
    public fun make_free_shop_empty(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        ssu_addr: address,
        tribe_id: u64,
        bazaar_type: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        bazar_free::create_free_shop(
            registry, gov, members,
            bazaar_type,
            b"TestFREE",
            ssu_addr,
            tribe_id,
            vector[100u64],       // item_type_ids  (1-item — passes validate_shop_params)
            vector[1u64],         // quantities
            9999999999u64,        // expiry_ms (large sentinel — shop never expires in tests)
            0u64, 0u64,           // position_x, position_y
            sui::coin::zero<EVE>(ctx), 0u64,   // V25 — no coin giveaway in test fixture
            clock, ctx,
        )
    }

    /// Create a WTB shop with a funded escrow pool. Returns shop ID.
    /// `prepay_amount` is absorbed into shop.escrowed_eve.
    /// `eve_pool_amount` is deposited as separate residue via deposit_pool_residue_for_testing.
    public fun make_wtb_shop_with_pool(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        pool: &mut WtbEscrowPool,
        ssu_addr: address,
        tribe_id: u64,
        bazaar_type: u8,
        prepay_amount: u64,
        eve_pool_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        let prepay = coin::mint_for_testing<EVE>(prepay_amount, ctx);
        // CC2-B1-01: create_wtb_shop deleted. All callers pass bazaar_type=0 (NoTribe).
        // Assert to catch any future misuse of this helper with a non-zero type.
        assert!(bazaar_type == 0, 99); // test-only guard
        let shop_id = bazar::create_wtb_shop_notribe(
            registry, gov,
            bazaar_type,
            b"TestWTB",
            ssu_addr,
            tribe_id,
            vector[100u64],       // item_type_ids  (1-item — passes validate_shop_params)
            vector[1u64],         // quantities
            vector[1000u64],      // prices_eve
            members,
            prepay,
            9999999999u64,        // expiry_ms
            0u64, 0u64,           // position_x, position_y
            clock, ctx,
        );
        deposit_pool_residue_for_testing(pool, shop_id, eve_pool_amount, ctx);
        shop_id
    }

    /// Create an already-inactive shop. Creates WTS then sets it inactive via
    /// bazar_test_accessors::set_shop_inactive_for_testing (no owner-check bypass needed).
    public fun make_inactive_shop(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        ssu_addr: address,
        tribe_id: u64,
        bazaar_type: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        let shop_id = make_wts_shop_empty(
            registry, gov, members,
            ssu_addr, tribe_id, bazaar_type,
            clock, ctx,
        );
        bazar_test_accessors::set_shop_inactive_for_testing(registry, shop_id);
        shop_id
    }

    // ---------------------------------------------------------------
    // Assertion helpers
    // ---------------------------------------------------------------

    /// Aborts if the shop is still active (is_active == true).
    /// CC-401 fix: uses borrow_shop + shop_is_active (2-step); is_shop_active does not exist.
    public fun assert_shop_deactivated(registry: &BazarRegistry, shop_id: ID) {
        let shop = bazar_test_accessors::borrow_shop_for_testing(registry, shop_id);
        assert!(!bazar::shop_is_active(shop), 0);
    }

    /// Aborts if the shop has been deactivated (is_active == false).
    /// CC-401 fix: uses borrow_shop + shop_is_active (2-step); is_shop_active does not exist.
    public fun assert_shop_still_active(registry: &BazarRegistry, shop_id: ID) {
        let shop = bazar_test_accessors::borrow_shop_for_testing(registry, shop_id);
        assert!(bazar::shop_is_active(shop), 0);
    }

    // ---------------------------------------------------------------
    // Pool helpers
    // ---------------------------------------------------------------

    /// Deposit residue directly into the escrow pool for the given shop.
    public fun deposit_pool_residue_for_testing(
        pool: &mut WtbEscrowPool,
        shop_id: ID,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        if (amount == 0) return;
        wtb_escrow_pool::deposit_residue_for_testing(pool, shop_id, amount, ctx);
    }

    // ---------------------------------------------------------------
    // Cap / Gov helpers
    // ---------------------------------------------------------------

    /// Create a throwaway SSUSuperAdminCap for testing. Must be destroyed after use.
    public fun create_ssu_super_admin_cap_for_testing(
        ssu_addr: address,
        ctx: &mut TxContext,
    ): SSUSuperAdminCap {
        membership::create_ssu_super_admin_cap_for_testing(ssu_addr, ctx)
    }

    /// Destroy a test SSUSuperAdminCap created above.
    public fun destroy_ssu_super_admin_cap_for_testing(cap: SSUSuperAdminCap) {
        membership::destroy_ssu_super_admin_cap_for_testing(cap)
    }

    /// Create a minimal SSUGovernance for testing (no real shared objects needed).
    public fun create_gov_for_testing(
        ssu_addr: address,
        bazaar_type: u8,
        tribe_id: u64,
        owner: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): SSUGovernance {
        bazaar_core::ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            ssu_addr, bazaar_type, tribe_id, owner, clock, ctx,
        )
    }
}
// ============================================================
// 500-LINE GUARD: END. Do not add code below this comment.
// ============================================================
