// bazaar_shop_ops | Happy path unit tests for depreciated SSU shop pruning
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 happy-path tests for bazaar_shop_ops::ssu_depreciation_ops::prune_depreciated_shops_page
/// (V41 SSU depreciation prune plan §2.3, critic plan-audit P5 row + the P2-review
/// carry-forwards: dedicated E_POOL_WRONG_SSU/E_SHOP_WRONG_SSU coverage lives in
/// ssu_depreciation_ops_abort_tests.move -- this file owns the abort-free /
/// refund-correctness / idempotency matrix).
///
/// Precondition helper: gov_helpers::set_depreciated_for_testing (direct-state injection,
/// same convention as shop_close_recovery_test_helpers::make_inactive_shop) -- these tests
/// exercise the PRUNE entry, not the certificate mark flow (bazaar_core::ssu_depreciation's
/// own test files own that coverage).
///
/// CR-P5A-01 (critic P5 review, rework applied): every shop factory below routes through
/// bazar::create_wts_shop / create_wtb_shop_notribe, both of which assert
/// ssu_governance::assert_active(gov) (bazar.move:275/:378) BEFORE any shop state exists --
/// so every make_* call in every test below runs FIRST, while gov is still active by its
/// create_ssu_governance default (is_active: true). gov_helpers::set_depreciated_for_testing
/// runs immediately after shop setup completes, then the prune entry runs last.
///
/// Shop factories reused verbatim from shop_close_recovery_test_helpers.move (the closest
/// existing analogue to prune testing per the task brief) -- zero new shop-factory code.
/// make_wtb_shop_with_pool carries a hard test-only guard (bazaar_type==0) -- BAZAAR_TYPE
/// below is pinned to 0 (NoTribe) for that reason.
#[test_only]
module bazaar_shop_ops::ssu_depreciation_ops_happy_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin::{Self, Coin};
    use sui::test_utils;
    use EVE::EVE::EVE;
    use bazaar_core::membership;
    use bazaar_core::wtb_escrow_pool;
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_shop_ops::shop_ops_cap_store;
    use bazaar_shop_ops::ssu_depreciation_ops;
    use bazaar_shop_ops::shop_close_recovery_test_helpers::{Self as close_helpers};

    const OWNER: address = @0xA001;
    const SSU_ADDR: address = @0xBEEF;
    const TRIBE_ID: u64 = 0;
    const BAZAAR_TYPE: u8 = 0;

    // ===== Test 1 — happy path: WTB shop's escrowed_eve + pool residue both refunded =====
    #[test]
    fun test_prune_happy_path_refunds_and_deactivates() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            // CR-P5A-01: shop created FIRST, while gov is still active -- create_wtb_shop_notribe
            // asserts ssu_governance::assert_active BEFORE any shop state exists.
            let shop_id = close_helpers::make_wtb_shop_with_pool(
                &mut registry, &gov, &members, &mut pool,
                SSU_ADDR, TRIBE_ID, BAZAAR_TYPE,
                1000, 500, &clk, ctx,
            );

            gov_helpers::set_depreciated_for_testing(&mut gov); // depreciate AFTER shop setup

            ssu_depreciation_ops::prune_depreciated_shops_page(
                &mut registry, &gov, &mut pool, vector[shop_id], &cap_store, &clk, ctx,
            );

            close_helpers::assert_shop_deactivated(&registry, shop_id);
            assert!(wtb_escrow_pool::shop_escrow_balance(&pool, shop_id) == 0, 0);
            assert!(wtb_escrow_pool::total_escrowed(&pool) == 0, 1);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };

        // Tx 2: owner received exactly 1000 (escrowed_eve) + 500 (pool residue) = 1500 EVE.
        ts::next_tx(&mut scenario, OWNER);
        {
            let c1 = ts::take_from_address<Coin<EVE>>(&scenario, OWNER);
            let c2 = ts::take_from_address<Coin<EVE>>(&scenario, OWNER);
            assert!(coin::value(&c1) + coin::value(&c2) == 1500, 2);
            ts::return_to_address(OWNER, c1);
            ts::return_to_address(OWNER, c2);
        };
        ts::end(scenario);
    }

    // ===== Test 2 — zero-escrow row: no transfer, still deactivates =====
    #[test]
    fun test_prune_zero_escrow_row_still_deactivates() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            // CR-P5A-01: shop created FIRST, while gov is still active.
            let shop_id = close_helpers::make_wts_shop_empty(
                &mut registry, &gov, &members, SSU_ADDR, TRIBE_ID, BAZAAR_TYPE, &clk, ctx,
            );

            gov_helpers::set_depreciated_for_testing(&mut gov);

            ssu_depreciation_ops::prune_depreciated_shops_page(
                &mut registry, &gov, &mut pool, vector[shop_id], &cap_store, &clk, ctx,
            );

            close_helpers::assert_shop_deactivated(&registry, shop_id);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };

        ts::next_tx(&mut scenario, OWNER);
        {
            assert!(!ts::has_most_recent_for_address<Coin<EVE>>(OWNER), 0); // no transfer at all
        };
        ts::end(scenario);
    }

    // ===== Test 3 — idempotency: re-run of a fully-pruned page is a clean no-op =====
    #[test]
    fun test_prune_idempotent_rerun_is_noop() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            // CR-P5A-01: shop created FIRST, while gov is still active.
            let shop_id = close_helpers::make_wtb_shop_with_pool(
                &mut registry, &gov, &members, &mut pool,
                SSU_ADDR, TRIBE_ID, BAZAAR_TYPE,
                1000, 500, &clk, ctx,
            );

            gov_helpers::set_depreciated_for_testing(&mut gov);

            ssu_depreciation_ops::prune_depreciated_shops_page(
                &mut registry, &gov, &mut pool, vector[shop_id], &cap_store, &clk, ctx,
            );
            close_helpers::assert_shop_deactivated(&registry, shop_id);

            // Re-run the SAME page -- must be a clean no-op (no abort, no double refund).
            ssu_depreciation_ops::prune_depreciated_shops_page(
                &mut registry, &gov, &mut pool, vector[shop_id], &cap_store, &clk, ctx,
            );
            close_helpers::assert_shop_deactivated(&registry, shop_id);
            assert!(wtb_escrow_pool::shop_escrow_balance(&pool, shop_id) == 0, 0);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };

        ts::next_tx(&mut scenario, OWNER);
        {
            let c1 = ts::take_from_address<Coin<EVE>>(&scenario, OWNER);
            let c2 = ts::take_from_address<Coin<EVE>>(&scenario, OWNER);
            assert!(coin::value(&c1) + coin::value(&c2) == 1500, 1); // exactly once
            assert!(!ts::has_most_recent_for_address<Coin<EVE>>(OWNER), 2); // no 3rd coin
            ts::return_to_address(OWNER, c1);
            ts::return_to_address(OWNER, c2);
        };
        ts::end(scenario);
    }

    // ===== Test 4 — mixed page: one active row processed, one already-inactive row skipped =====
    #[test]
    fun test_prune_mixed_page_active_and_already_pruned() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            // CR-P5A-01: BOTH shops created FIRST, while gov is still active -- shop_b's
            // already-inactive state is a SHOP-level flip (make_inactive_shop), independent of
            // gov's is_active, but it still needs gov active to construct the underlying shop.
            let shop_a = close_helpers::make_wtb_shop_with_pool(
                &mut registry, &gov, &members, &mut pool,
                SSU_ADDR, TRIBE_ID, BAZAAR_TYPE,
                300, 200, &clk, ctx,
            );
            // CR-P5A-03 (post-apply fix): make_inactive_shop -> make_wts_shop_empty hard-codes
            // position (0,0) -- identical to shop_a's (also hard-coded (0,0) via
            // make_wtb_shop_with_pool) -- so building shop_b through the shared helper trips
            // bazar::assert_shop_position_clear (E_SHOP_POSITION_OCCUPIED=15, bazar.move:53/:197)
            // while shop_a is still ACTIVE at (0,0). Fixed by inlining the exact same two-call
            // sequence make_inactive_shop performs internally (create_wts_shop_for_testing then
            // set_shop_inactive_for_testing) at position (10,10) instead -- NOT a helper-signature
            // change; shop_close_recovery_test_helpers.move is untouched. Chebyshev distance from
            // shop_a's (0,0) is max(10,10)=10, clearing EXCLUSION_ZONE_RADIUS=3 (bazar.move:55).
            let shop_b = bazar_test_accessors::create_wts_shop_for_testing(
                &mut registry, &gov, &members,
                BAZAAR_TYPE, b"TestWTS", SSU_ADDR, TRIBE_ID,
                vector[100u64], vector[1u64], vector[1000u64],
                9999999999u64,
                10u64, 10u64,
                &clk, ctx,
            );
            bazar_test_accessors::set_shop_inactive_for_testing(&mut registry, shop_b);

            gov_helpers::set_depreciated_for_testing(&mut gov);

            ssu_depreciation_ops::prune_depreciated_shops_page(
                &mut registry, &gov, &mut pool, vector[shop_a, shop_b], &cap_store, &clk, ctx,
            );

            close_helpers::assert_shop_deactivated(&registry, shop_a);
            close_helpers::assert_shop_deactivated(&registry, shop_b);
            assert!(wtb_escrow_pool::shop_escrow_balance(&pool, shop_a) == 0, 0);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };

        ts::next_tx(&mut scenario, OWNER);
        {
            // Only shop_a contributed refunds: 300 + 200 = 500.
            let c1 = ts::take_from_address<Coin<EVE>>(&scenario, OWNER);
            let c2 = ts::take_from_address<Coin<EVE>>(&scenario, OWNER);
            assert!(coin::value(&c1) + coin::value(&c2) == 500, 1);
            ts::return_to_address(OWNER, c1);
            ts::return_to_address(OWNER, c2);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
