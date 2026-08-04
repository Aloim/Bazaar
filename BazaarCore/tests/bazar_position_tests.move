// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::bazar_position_tests {
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use sui::test_utils;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::membership;

    // ===== Test Constants =====
    const SSU_A: address = @0xA01;
    const SSU_B: address = @0xB02;
    const TRIBE_0: u64 = 0;
    const EXPIRY: u64 = 9_999_999_999;

    // ===== Helpers =====

    /// Create a WTS shop at the given (x, y) position on the given SSU.
    /// Returns the shop ID. Caller must own `registry` mutably.
    fun make_wts_shop_at(
        registry: &mut BazarRegistry,
        ssu_id: address,
        x: u64,
        y: u64,
        ctx: &mut TxContext,
    ): ID {
        let clk = clock::create_for_testing(ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            ssu_id, 0, TRIBE_0, @0x0, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(ssu_id, TRIBE_0, ctx);
        let shop_id = bazar::create_wts_shop(
            registry,
            &gov,
            &members,
            0,              // bazaar_type = NOTRIBE
            b"TestShop",
            ssu_id,
            TRIBE_0,
            vector[100u64],
            vector[1u64],
            vector[1000u64],
            EXPIRY,
            x,
            y,
            &clk,
            ctx,
        );
        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        shop_id
    }

    // ===== T-POS-01: First shop on empty SSU succeeds =====
    #[test]
    fun test_position_create_first_shop_succeeds() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);

        let shop_id = make_wts_shop_at(&mut registry, SSU_A, 5, 5, &mut ctx);

        // ssu_shop_ids should return exactly 1 entry: this shop.
        let ids = bazar::ssu_shop_ids(&registry, SSU_A);
        assert!(vector::length(&ids) == 1, 0);
        assert!(*vector::borrow(&ids, 0) == shop_id, 1);

        test_utils::destroy(registry);
    }

    // ===== T-POS-02: Coordinates (0,0) succeed (no underflow edge case) =====
    #[test]
    fun test_position_zero_coords_allowed() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);

        // Place at (0,0) on an empty SSU — must not abort.
        let _shop_id = make_wts_shop_at(&mut registry, SSU_A, 0, 0, &mut ctx);

        test_utils::destroy(registry);
    }

    // ===== T-POS-03: Chebyshev distance 2 is blocked (< EXCLUSION_ZONE_RADIUS) =====
    // Shop at (10,10); new shop at (12,11): dx=2, dy=1, cheb=2 < 3 → ABORT 15.
    #[test]
    #[expected_failure(abort_code = 15, location = bazaar_core::bazar)]
    fun test_position_chebyshev_blocks_within_2() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);

        // First shop at (10, 10).
        let _sid1 = make_wts_shop_at(&mut registry, SSU_A, 10, 10, &mut ctx);

        // Second shop at (12, 11): cheb = max(|12-10|, |11-10|) = max(2,1) = 2 < 3.
        // Must abort with E_SHOP_POSITION_OCCUPIED.
        let _sid2 = make_wts_shop_at(&mut registry, SSU_A, 12, 11, &mut ctx);

        test_utils::destroy(registry);
    }

    // ===== T-POS-04: Chebyshev distance exactly 3 is allowed =====
    // Shop at (10,10); new shop at (13,10): dx=3, dy=0, cheb=3 >= 3 → succeed.
    #[test]
    fun test_position_chebyshev_allows_at_3() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);

        let _sid1 = make_wts_shop_at(&mut registry, SSU_A, 10, 10, &mut ctx);
        let _sid2 = make_wts_shop_at(&mut registry, SSU_A, 13, 10, &mut ctx);

        // Both shops are created; ssu_shop_ids should have 2 entries.
        let ids = bazar::ssu_shop_ids(&registry, SSU_A);
        assert!(vector::length(&ids) == 2, 0);

        test_utils::destroy(registry);
    }

    // ===== T-POS-05: Inactive (closed) shop does NOT block placement =====
    // Create shop at (5,5), close it, then create another at (5,5) → succeed.
    #[test]
    fun test_position_inactive_shop_does_not_block() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);

        let sid1 = make_wts_shop_at(&mut registry, SSU_A, 5, 5, &mut ctx);

        // Mark the first shop inactive via test-only low-level bypass.
        // close_shop_for_testing only flips is_active; it does NOT remove from ssu_shop_ids.
        // The position check (assert_shop_position_clear) skips inactive shops — that is the
        // invariant being tested here, not the ssu_shop_ids table length.
        bazar_test_accessors::set_shop_inactive_for_testing(&mut registry, sid1);

        // Verify the shop is now inactive.
        let shop_ref = bazar::borrow_shop_mut(&mut registry, sid1);
        assert!(!bazar::shop_is_active(shop_ref), 0);

        // Place a second shop at the SAME coord (5,5) — no active shop blocking it.
        let _sid2 = make_wts_shop_at(&mut registry, SSU_A, 5, 5, &mut ctx);

        test_utils::destroy(registry);
    }

    // ===== T-POS-06: Same coordinate on DIFFERENT SSUs does NOT collide =====
    // Shop at (5,5) on SSU_A; shop at (5,5) on SSU_B → both succeed.
    #[test]
    fun test_position_different_ssu_no_collision() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);

        let _sid_a = make_wts_shop_at(&mut registry, SSU_A, 5, 5, &mut ctx);
        let _sid_b = make_wts_shop_at(&mut registry, SSU_B, 5, 5, &mut ctx);

        // Each SSU's index is independent.
        let ids_a = bazar::ssu_shop_ids(&registry, SSU_A);
        let ids_b = bazar::ssu_shop_ids(&registry, SSU_B);
        assert!(vector::length(&ids_a) == 1, 0);
        assert!(vector::length(&ids_b) == 1, 1);

        test_utils::destroy(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
