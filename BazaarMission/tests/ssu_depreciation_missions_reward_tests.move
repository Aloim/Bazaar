// bazaar_mission | Unit tests for the depreciated mission reward refund and close entry
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 tests for bazaar_mission::ssu_depreciation_missions::prune_depreciated_mission_reward
/// (V41 SSU depreciation prune plan §2.4; critic P3-review CR-DEP-06 all-bazaar-type close + C-4
/// ordering). Uses the same create_eve_mission_for_testing seam (bt 0/1) and
/// construct_mission_advanced/register_mission_advanced (bt=2, c4_mission_position_tests.move
/// precedent) as the collateral-page test file. gov_helpers::set_depreciated_for_testing is a
/// CROSS-SHARD dependency on shard A's applied helper -- see this shard's report §2. Test 7
/// (CR-P5B-03a) additionally uses mission::deactivate_for_expiry (public(package), mission.move:762).
#[test_only]
module bazaar_mission::ssu_depreciation_missions_reward_tests {
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

    // ===== Test 1 — happy path: EVE -> owner + settle (bt = 0) =====
    #[test]
    fun test_reward_happy_path_refunds_owner_and_settles() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let mut registry = mission::create_mission_registry_for_testing(ctx);
            let mid = mission::create_eve_mission_for_testing(
                &mut registry, &gov, 100, 5, 0,
                coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
            );
            gov_helpers::set_depreciated_for_testing(&mut gov);

            ssu_depreciation_missions::prune_depreciated_mission_reward(
                &mut registry, &gov, mid, &clk, ctx,
            );

            let m_ref = mission::borrow_mission(&registry, mid);
            assert!(mission::mission_is_settled(m_ref), 0);
            assert!(!mission::mission_is_active(m_ref), 1);

            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            clock::destroy_for_testing(clk);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let refund = ts::take_from_address<Coin<EVE>>(&scenario, OWNER);
            assert!(coin::value(&refund) == 500, 2); // full untouched reward escrow
            ts::return_to_address(OWNER, refund);
        };
        ts::end(scenario);
    }

    // ===== Test 2 — Advanced (bt = 2): zero-EVE close still settles (P4b gate dependency) =====
    #[test]
    fun test_reward_advanced_zero_eve_close_still_settles() {
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
            5, 100, 0, 16, vector[],
            3_600_000, 3_600_001, 10, 10, &shop_cap, &clk, ctx,
        );
        let mid = mission::register_mission_advanced(&mut registry, m, &shop_cap);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_missions::prune_depreciated_mission_reward(
            &mut registry, &gov, mid, &clk, ctx,
        );

        let m_ref = mission::borrow_mission(&registry, mid);
        assert!(mission::mission_is_settled(m_ref), 0); // NOT stranded on bt==2 (unblocks P4b)
        assert!(!mission::mission_is_active(m_ref), 1);

        gov_helpers::destroy_for_testing(gov);
        tribe_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(shop_cap);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 3 — E_RUNS_STILL_IN_PROGRESS: live acceptance blocks close (C-4) =====
    #[test]
    #[expected_failure(abort_code = bazaar_mission::ssu_depreciation_missions::E_RUNS_STILL_IN_PROGRESS)]
    fun test_reward_runs_still_in_progress_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let mut registry = mission::create_mission_registry_for_testing(ctx);
        let mid = mission::create_eve_mission_for_testing(
            &mut registry, &gov, 100, 5, 0,
            coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
        );
        {
            let m = mission::borrow_mission_mut_pkg(&mut registry, mid);
            mission::add_acceptance(m, TAKER, 0); // live acceptance, never drained
        };
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_missions::prune_depreciated_mission_reward(
            &mut registry, &gov, mid, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 4 — ordering: collateral page drains first, THEN reward/close succeeds =====
    #[test]
    fun test_reward_succeeds_after_collateral_page_drains_acceptance() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let mut registry = mission::create_mission_registry_for_testing(ctx);
        let mid = mission::create_eve_mission_for_testing(
            &mut registry, &gov, 100, 5, 20,
            coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
        );
        {
            let m = mission::borrow_mission_mut_pkg(&mut registry, mid);
            mission::add_acceptance(m, TAKER, 0);
            mission::set_acceptance_collateral(m, TAKER, 20);
        };
        let mut pool = mission_collateral_pool::create_for_testing(SSU_A, ctx);
        mission_collateral_pool::deposit(
            &mut pool, object::id_to_address(&mid), TAKER, coin::mint_for_testing<EVE>(20, ctx),
        );
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_missions::prune_depreciated_mission_collateral_page(
            &mut registry, &gov, mid, &mut pool, vector[TAKER], &clk, ctx,
        );
        // Must NOT abort now that runs_in_progress == 0.
        ssu_depreciation_missions::prune_depreciated_mission_reward(
            &mut registry, &gov, mid, &clk, ctx,
        );

        let m_ref = mission::borrow_mission(&registry, mid);
        assert!(mission::mission_is_settled(m_ref), 0);

        gov_helpers::destroy_for_testing(gov);
        test_utils::destroy(registry);
        test_utils::destroy(pool);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 5 — re-run no-op on an already-settled mission =====
    #[test]
    fun test_reward_rerun_noop_on_settled() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let mut registry = mission::create_mission_registry_for_testing(ctx);
            let mid = mission::create_eve_mission_for_testing(
                &mut registry, &gov, 100, 5, 0,
                coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
            );
            gov_helpers::set_depreciated_for_testing(&mut gov);

            ssu_depreciation_missions::prune_depreciated_mission_reward(
                &mut registry, &gov, mid, &clk, ctx,
            );
            // Re-run: settled-skip is a terminal early-return -- clean no-op.
            ssu_depreciation_missions::prune_depreciated_mission_reward(
                &mut registry, &gov, mid, &clk, ctx,
            );

            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            clock::destroy_for_testing(clk);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let c1 = ts::take_from_address<Coin<EVE>>(&scenario, OWNER);
            assert!(coin::value(&c1) == 500, 0); // exactly once
            assert!(!ts::has_most_recent_for_address<Coin<EVE>>(OWNER), 1); // no 2nd coin
            ts::return_to_address(OWNER, c1);
        };
        ts::end(scenario);
    }

    // ===== Test 6 — E_MISSION_WRONG_SSU: wrong-SSU abort =====
    #[test]
    #[expected_failure(abort_code = bazaar_mission::ssu_depreciation_missions::E_MISSION_WRONG_SSU)]
    fun test_reward_wrong_ssu_aborts() {
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
        let mid = mission::create_eve_mission_for_testing(
            &mut registry, &gov_b, 100, 5, 0,
            coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
        );
        gov_helpers::set_depreciated_for_testing(&mut gov_a);

        ssu_depreciation_missions::prune_depreciated_mission_reward(
            &mut registry, &gov_a, mid, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 7 (CR-P5B-03a) — expiry-deactivated-but-unsettled mission still closes =====
    // Proves is_settled -- NOT is_active -- is the real gate: the mission is already inactive
    // (via mission::deactivate_for_expiry, public(package), mission.move:762-764, the
    // try_expire_mission path) BEFORE depreciation, yet prune_depreciated_mission_reward reads
    // only is_settled for its skip branch and still refunds + settles correctly. deactivate_and_
    // settle's own position-index/table-entry guards (mission.move:826-847) make running it after
    // deactivate_for_expiry already removed the index entry idempotent -- no double-remove abort.
    #[test]
    fun test_reward_expiry_deactivated_unsettled_mission_still_closes() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let mut registry = mission::create_mission_registry_for_testing(ctx);
            let mid = mission::create_eve_mission_for_testing(
                &mut registry, &gov, 100, 5, 0,
                coin::mint_for_testing<EVE>(500, ctx), 10, 10, &clk, ctx,
            );
            // Deactivate WITHOUT settling (is_active=false, is_settled stays false).
            mission::deactivate_for_expiry(&mut registry, mid);
            {
                let m_ref = mission::borrow_mission(&registry, mid);
                assert!(!mission::mission_is_active(m_ref), 0);
                assert!(!mission::mission_is_settled(m_ref), 1);
            };
            gov_helpers::set_depreciated_for_testing(&mut gov);

            ssu_depreciation_missions::prune_depreciated_mission_reward(
                &mut registry, &gov, mid, &clk, ctx,
            );

            let m_ref2 = mission::borrow_mission(&registry, mid);
            assert!(mission::mission_is_settled(m_ref2), 2);

            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            clock::destroy_for_testing(clk);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let refund = ts::take_from_address<Coin<EVE>>(&scenario, OWNER);
            assert!(coin::value(&refund) == 500, 3);
            ts::return_to_address(OWNER, refund);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
