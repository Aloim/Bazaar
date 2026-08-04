// bazaar_mission | Unit tests for the depreciated mission EVE collateral refund page
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 tests for bazaar_mission::ssu_depreciation_missions::prune_depreciated_mission_collateral_page
/// (V41 SSU depreciation prune plan §2.4; critic P3-review binding conditions CR-DEP-04/06/08).
///
/// Missions are built via mission::create_eve_mission_for_testing (P5 test seam, see this shard's
/// report §1 / mission.move's own doc comment). Acceptances + collateral are set up by calling
/// mission::add_acceptance / mission::set_acceptance_collateral / mission_collateral_pool::deposit
/// DIRECTLY -- all three are public(package) within bazaar_mission, and this test module IS
/// bazaar_mission, so no additional seam is needed for that part (only mission creation itself
/// required the new helper). gov_helpers::set_depreciated_for_testing is a CROSS-SHARD dependency
/// on shard A's applied BazaarCore/tests/ssu_governance_test_helpers.move addition -- see this
/// shard's report §2.
#[test_only]
module bazaar_mission::ssu_depreciation_missions_collateral_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin::{Self, Coin};
    use sui::test_utils;
    use EVE::EVE::EVE;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_core::tribe_governance_test_helpers::{Self as tribe_helpers};
    use bazaar_core::bazaar_core_admin;
    use bazaar_mission::mission;
    use bazaar_mission::mission_collateral_pool;
    use bazaar_mission::ssu_depreciation_missions;

    const OWNER: address = @0xA001;
    const TAKER: address = @0xA002;
    const SSU_A: address = @0xBEEF;
    const SSU_B: address = @0xCAFE;
    const TRIBE_ID: u64 = 0;
    const BAZAAR_NOTRIBE: u8 = 0;
    const BAZAAR_ADVANCED: u8 = 2;
    const DUMMY_PKG: address = @0x0;

    // ===== Test 1 — happy path: acceptance removed + EVE -> taker =====
    #[test]
    fun test_collateral_happy_path_refunds_and_removes_acceptance() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let mut registry = mission::create_mission_registry_for_testing(ctx);
            let mid = mission::create_eve_mission_for_testing(
                &mut registry, &gov, 100, 5, 50,
                coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
            );
            {
                let m = mission::borrow_mission_mut_pkg(&mut registry, mid);
                mission::add_acceptance(m, TAKER, 0);
                mission::set_acceptance_collateral(m, TAKER, 50);
            };
            let mut pool = mission_collateral_pool::create_for_testing(SSU_A, ctx);
            mission_collateral_pool::deposit(
                &mut pool, object::id_to_address(&mid), TAKER, coin::mint_for_testing<EVE>(50, ctx),
            );
            gov_helpers::set_depreciated_for_testing(&mut gov);

            ssu_depreciation_missions::prune_depreciated_mission_collateral_page(
                &mut registry, &gov, mid, &mut pool, vector[TAKER], &clk, ctx,
            );

            assert!(mission_collateral_pool::entry_balance(&pool, object::id_to_address(&mid), TAKER) == 0, 0);
            assert!(mission_collateral_pool::total_escrowed(&pool) == 0, 1);
            let m_ref = mission::borrow_mission(&registry, mid);
            assert!(mission::mission_runs_in_progress_count(m_ref) == 0, 2);

            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            assert!(ts::has_most_recent_for_address<Coin<EVE>>(TAKER), 3);
            let refund = ts::take_from_address<Coin<EVE>>(&scenario, TAKER);
            assert!(coin::value(&refund) == 50, 4);
            ts::return_to_address(TAKER, refund);
        };
        ts::end(scenario);
    }

    // ===== Test 2 — E_NOT_DEPRECIATED: gov not yet certified =====
    #[test]
    #[expected_failure(abort_code = bazaar_mission::ssu_depreciation_missions::E_NOT_DEPRECIATED)]
    fun test_collateral_not_depreciated_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
        ); // NOT depreciated
        let mut registry = mission::create_mission_registry_for_testing(ctx);
        let mid = mission::create_eve_mission_for_testing(
            &mut registry, &gov, 100, 5, 50, coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
        );
        let mut pool = mission_collateral_pool::create_for_testing(SSU_A, ctx);

        ssu_depreciation_missions::prune_depreciated_mission_collateral_page(
            &mut registry, &gov, mid, &mut pool, vector[TAKER], &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 3 — E_MISSION_WRONG_SSU: mission belongs to a different SSU =====
    #[test]
    #[expected_failure(abort_code = bazaar_mission::ssu_depreciation_missions::E_MISSION_WRONG_SSU)]
    fun test_collateral_wrong_ssu_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov_a = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let gov_b = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_B, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let mut registry = mission::create_mission_registry_for_testing(ctx);
        // Mission built on SSU_B...
        let mid = mission::create_eve_mission_for_testing(
            &mut registry, &gov_b, 100, 5, 0, coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
        );
        let mut pool = mission_collateral_pool::create_for_testing(SSU_B, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov_a); // ...but caller passes SSU_A's gov

        ssu_depreciation_missions::prune_depreciated_mission_collateral_page(
            &mut registry, &gov_a, mid, &mut pool, vector[TAKER], &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 4 — E_INVALID_BAZAAR_TYPE: Advanced mission on the EVE page =====
    #[test]
    #[expected_failure(abort_code = bazaar_mission::ssu_depreciation_missions::E_INVALID_BAZAAR_TYPE)]
    fun test_collateral_advanced_bazaar_type_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let tribe_gov = tribe_helpers::create_for_testing(TRIBE_ID, BAZAAR_ADVANCED, OWNER, 0, &clk, ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(DUMMY_PKG, ctx);
        let mut registry = mission::create_mission_registry_for_testing(ctx);
        let m = mission::construct_mission_advanced(
            &gov, &tribe_gov, 0, b"Test", b"", 0,
            vector[], vector[], vector[], vector[],
            5, 0, 40, 16, vector[],
            3_600_000, 3_600_001, 10, 10, &shop_cap, &clk, ctx,
        );
        let mid = mission::register_mission_advanced(&mut registry, m, &shop_cap);
        let mut pool = mission_collateral_pool::create_for_testing(SSU_A, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        // Gate order fires the bt check before any per-row lookup -- an absent taker still trips it.
        ssu_depreciation_missions::prune_depreciated_mission_collateral_page(
            &mut registry, &gov, mid, &mut pool, vector[TAKER], &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 5 — re-run idempotency: absent acceptances skip =====
    #[test]
    fun test_collateral_rerun_idempotent_noop() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let mut registry = mission::create_mission_registry_for_testing(ctx);
            let mid = mission::create_eve_mission_for_testing(
                &mut registry, &gov, 100, 5, 30,
                coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
            );
            {
                let m = mission::borrow_mission_mut_pkg(&mut registry, mid);
                mission::add_acceptance(m, TAKER, 0);
                mission::set_acceptance_collateral(m, TAKER, 30);
            };
            let mut pool = mission_collateral_pool::create_for_testing(SSU_A, ctx);
            mission_collateral_pool::deposit(
                &mut pool, object::id_to_address(&mid), TAKER, coin::mint_for_testing<EVE>(30, ctx),
            );
            gov_helpers::set_depreciated_for_testing(&mut gov);

            ssu_depreciation_missions::prune_depreciated_mission_collateral_page(
                &mut registry, &gov, mid, &mut pool, vector[TAKER], &clk, ctx,
            );
            // Re-run the SAME page -- acceptance already gone -> (false, 0) skip, no abort.
            ssu_depreciation_missions::prune_depreciated_mission_collateral_page(
                &mut registry, &gov, mid, &mut pool, vector[TAKER], &clk, ctx,
            );
            assert!(mission_collateral_pool::total_escrowed(&pool) == 0, 0);

            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let c1 = ts::take_from_address<Coin<EVE>>(&scenario, TAKER);
            assert!(coin::value(&c1) == 30, 1); // exactly once
            assert!(!ts::has_most_recent_for_address<Coin<EVE>>(TAKER), 2); // no 2nd coin
            ts::return_to_address(TAKER, c1);
        };
        ts::end(scenario);
    }

    // ===== Test 6 — zero-collateral acceptance: removed, no refund, no abort =====
    #[test]
    fun test_collateral_zero_collateral_acceptance_removed_no_refund() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let mut registry = mission::create_mission_registry_for_testing(ctx);
        let mid = mission::create_eve_mission_for_testing(
            &mut registry, &gov, 100, 5, 0, // collateral_eve_per_run = 0
            coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
        );
        {
            let m = mission::borrow_mission_mut_pkg(&mut registry, mid);
            mission::add_acceptance(m, TAKER, 0); // collateral_amount defaults to 0
        };
        let mut pool = mission_collateral_pool::create_for_testing(SSU_A, ctx); // no deposit needed
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_missions::prune_depreciated_mission_collateral_page(
            &mut registry, &gov, mid, &mut pool, vector[TAKER], &clk, ctx,
        );

        let m_ref = mission::borrow_mission(&registry, mid);
        assert!(mission::mission_runs_in_progress_count(m_ref) == 0, 0); // acceptance removed
        assert!(mission_collateral_pool::total_escrowed(&pool) == 0, 1); // nothing to refund

        gov_helpers::destroy_for_testing(gov);
        test_utils::destroy(registry);
        test_utils::destroy(pool);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
