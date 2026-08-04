// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// C3 / GAS-08 locking tests: per-SSU inline position index.
///
/// Tests the production deactivate path (deactivate_shop_by_id) removes the
/// inline ShopPosition record so that:
///   1. ssu_shop_ids returns an empty vector → rebind guard passes.
///   2. assert_shop_position_clear allows placement at the freed coordinate.
///
/// T-POS-05 (test-accessor inactive-skip) lives in bazar_position_tests.move.
/// These tests cover the production-path deactivation semantics.
#[test_only]
module bazaar_core::c3_position_index_tests {
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::membership;

    // ===== Test Constants =====
    const SSU_A: address = @0xA01;
    const TRIBE_0: u64 = 0;
    const EXPIRY: u64 = 9_999_999_999;

    // ===== Helper (mirrors bazar_position_tests::make_wts_shop_at exactly) =====
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

    // ===== C3-IDX-01: production deactivate frees position for reuse =====
    //
    // Sequence:
    //   1. Create shop at (5,5).
    //   2. deactivate_shop_by_id (production path — REMOVES the inline record).
    //   3. ssu_shop_ids is empty → rebind guard would pass.
    //   4. Create another shop at (5,5) → succeeds (no active blocking record).
    //   5. ssu_shop_ids has exactly 1 entry (the new shop).
    #[test]
    fun test_deactivate_removes_position_and_allows_reuse() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);

        // Step 1: create shop at (5, 5).
        let shop_id = make_wts_shop_at(&mut registry, SSU_A, 5, 5, &mut ctx);

        // Snapshot owner before the deactivate borrow (borrow-checker scope discipline).
        let owner_snap: address = bazar::shop_owner(bazar::borrow_shop(&registry, shop_id));

        // Step 2: production deactivate — removes inline ShopPosition from shops_by_ssu.
        bazar::deactivate_shop_by_id(&mut registry, shop_id, owner_snap);

        // Step 3: ssu_shop_ids must now be empty (rebind-guard emptiness semantics).
        let ids_after = bazar::ssu_shop_ids(&registry, SSU_A);
        assert!(vector::is_empty(&ids_after), 0);

        // Step 4: placing a second shop at the same coord must succeed.
        let shop2_id = make_wts_shop_at(&mut registry, SSU_A, 5, 5, &mut ctx);

        // Step 5: exactly one entry in the index for the new shop.
        let ids_final = bazar::ssu_shop_ids(&registry, SSU_A);
        assert!(vector::length(&ids_final) == 1, 1);
        assert!(*vector::borrow(&ids_final, 0) == shop2_id, 2);

        test_utils::destroy(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
