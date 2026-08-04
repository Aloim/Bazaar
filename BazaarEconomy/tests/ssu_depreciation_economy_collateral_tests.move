// bazaar_economy | Unit tests for the depreciated Advanced mission token-collateral drain page
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 tests for bazaar_economy::ssu_depreciation_economy::prune_depreciated_mission_collateral_token_page
/// (CR-DEP-05 signature: mission_registry: &mut + cap_store: &EconomyCapStore; CR-DEP-02 tribe
/// binding). Acceptances are created via the REAL mission_lifecycle::advance_accept (bare public,
/// cap-gated) -- no seam needed, exercising the actual production accept path; its
/// `(address, u64)` return is bound `let (_taker, _coll) = …` per NIT-P5B-05. The pool credit is
/// set up manually via mission_collateral_token_pool::credit (public(package), same-package-callable
/// from bazaar_economy) mirroring the accept-time earmark mission_ledger_ops::accept_mission_advanced
/// performs in production. Test 5 (CR-P5B-02a-ii) covers the CR-P4-02 frozen-ledger asymmetry's
/// Entry-3 half (aborts, unlike Entries 1/2's mint). gov_helpers::set_depreciated_for_testing is a
/// CROSS-SHARD dependency on shard A's applied helper -- see this shard's report §2.
#[test_only]
module bazaar_economy::ssu_depreciation_economy_collateral_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::membership;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_core::tribe_governance_test_helpers::{Self as tribe_helpers};
    use bazaar_core::bazaar_core_admin;
    use bazaar_mission::mission;
    use bazaar_mission::mission_lifecycle;
    use bazaar_mission::ssu_depreciation_missions;
    use bazaar_economy::tribe_token_ledger::{Self as ledger};
    use bazaar_economy::mission_collateral_token_pool;
    use bazaar_economy::ssu_depreciation_economy;
    use bazaar_economy::ssu_depreciation_economy_test_helpers::{Self as helpers};

    const OWNER: address = @0xA001;
    const TAKER: address = @0xA002;
    const SSU_A: address = @0xBEEF;
    const TRIBE_ID: u64 = 7;
    const OTHER_TRIBE: u64 = 99;
    const BAZAAR_ADVANCED: u8 = 2;
    const DUMMY_PKG: address = @0x0;

    // ===== Test 1 — happy path: credit via cap_store path + conservation (inside-supply pool) =====
    #[test]
    fun test_collateral_token_happy_path_credits_taker_and_conserves_supply() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let tribe_gov = tribe_helpers::create_for_testing(TRIBE_ID, BAZAAR_ADVANCED, OWNER, 0, &clk, ctx);
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(DUMMY_PKG, ctx);
        let mut mission_registry = mission::create_mission_registry_for_testing(ctx);
        let mission_id = helpers::make_advanced_mission(
            &mut mission_registry, &gov, &tribe_gov, 0, 5, 40, &shop_cap, 1, 1, &clk, ctx,
        );

        ts::next_tx(&mut scenario, TAKER);
        {
            let ctx2 = ts::ctx(&mut scenario);
            let (_taker, _coll) = mission_lifecycle::advance_accept(
                &mut mission_registry, mission_id, &gov, &members, &tribe_gov, &shop_cap, &clk, ctx2,
            );
        };

        ts::next_tx(&mut scenario, OWNER);
        let ctx3 = ts::ctx(&mut scenario);
        let mission_addr = object::id_to_address(&mission_id);
        let mut pool = mission_collateral_token_pool::create_for_testing(SSU_A, ctx3);
        mission_collateral_token_pool::credit(&mut pool, mission_addr, TAKER, 40);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx3);
        let cap_store = helpers::make_loaded_cap_store(ctx3);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        // Exercises the CR-DEP-05 cap_store path: acceptance removal is cap-gated internally.
        ssu_depreciation_economy::prune_depreciated_mission_collateral_token_page(
            &gov, &mut mission_registry, &mut pool, &mut l, &cap_store, mission_id, vector[TAKER], &clk, ctx3,
        );

        assert!(mission_collateral_token_pool::entry_balance(&pool, mission_addr, TAKER) == 0, 0);
        assert!(ledger::balance_of(&l, TAKER) == 40, 1);
        assert!(ledger::total_supply(&l) == 0, 2); // credit never touches supply (inside-supply pool)

        gov_helpers::destroy_for_testing(gov);
        tribe_helpers::destroy_for_testing(tribe_gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(shop_cap);
        test_utils::destroy(mission_registry);
        test_utils::destroy(pool);
        test_utils::destroy(l);
        test_utils::destroy(cap_store);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 2 — idempotency: popped>0 then re-run is a clean no-op =====
    #[test]
    fun test_collateral_token_rerun_after_drain_is_noop() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let tribe_gov = tribe_helpers::create_for_testing(TRIBE_ID, BAZAAR_ADVANCED, OWNER, 0, &clk, ctx);
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(DUMMY_PKG, ctx);
        let mut mission_registry = mission::create_mission_registry_for_testing(ctx);
        let mission_id = helpers::make_advanced_mission(
            &mut mission_registry, &gov, &tribe_gov, 0, 5, 40, &shop_cap, 1, 1, &clk, ctx,
        );

        ts::next_tx(&mut scenario, TAKER);
        {
            let ctx2 = ts::ctx(&mut scenario);
            let (_taker, _coll) = mission_lifecycle::advance_accept(
                &mut mission_registry, mission_id, &gov, &members, &tribe_gov, &shop_cap, &clk, ctx2,
            );
        };

        ts::next_tx(&mut scenario, OWNER);
        let ctx3 = ts::ctx(&mut scenario);
        let mission_addr = object::id_to_address(&mission_id);
        let mut pool = mission_collateral_token_pool::create_for_testing(SSU_A, ctx3);
        mission_collateral_token_pool::credit(&mut pool, mission_addr, TAKER, 40);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx3);
        let cap_store = helpers::make_loaded_cap_store(ctx3);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_mission_collateral_token_page(
            &gov, &mut mission_registry, &mut pool, &mut l, &cap_store, mission_id, vector[TAKER], &clk, ctx3,
        );
        // Re-run: acceptance already gone -> (false, 0) skip, no double credit.
        ssu_depreciation_economy::prune_depreciated_mission_collateral_token_page(
            &gov, &mut mission_registry, &mut pool, &mut l, &cap_store, mission_id, vector[TAKER], &clk, ctx3,
        );

        assert!(ledger::balance_of(&l, TAKER) == 40, 0); // exactly once
        assert!(mission_collateral_token_pool::total_escrowed(&pool) == 0, 1);

        gov_helpers::destroy_for_testing(gov);
        tribe_helpers::destroy_for_testing(tribe_gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(shop_cap);
        test_utils::destroy(mission_registry);
        test_utils::destroy(pool);
        test_utils::destroy(l);
        test_utils::destroy(cap_store);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 3 — cross-package ordering: collateral page unblocks P3's reward/close =====
    #[test]
    fun test_collateral_token_page_before_p3_close_unblocks_reward_close() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let tribe_gov = tribe_helpers::create_for_testing(TRIBE_ID, BAZAAR_ADVANCED, OWNER, 0, &clk, ctx);
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(DUMMY_PKG, ctx);
        let mut mission_registry = mission::create_mission_registry_for_testing(ctx);
        let mission_id = helpers::make_advanced_mission(
            &mut mission_registry, &gov, &tribe_gov, 0, 5, 40, &shop_cap, 1, 1, &clk, ctx,
        );

        ts::next_tx(&mut scenario, TAKER);
        {
            let ctx2 = ts::ctx(&mut scenario);
            let (_taker, _coll) = mission_lifecycle::advance_accept(
                &mut mission_registry, mission_id, &gov, &members, &tribe_gov, &shop_cap, &clk, ctx2,
            );
        };

        ts::next_tx(&mut scenario, OWNER);
        let ctx3 = ts::ctx(&mut scenario);
        let mission_addr = object::id_to_address(&mission_id);
        let mut pool = mission_collateral_token_pool::create_for_testing(SSU_A, ctx3);
        mission_collateral_token_pool::credit(&mut pool, mission_addr, TAKER, 40);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx3);
        let cap_store = helpers::make_loaded_cap_store(ctx3);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        // Without this page, bazaar_mission's own E_RUNS_STILL_IN_PROGRESS ordering test
        // (ssu_depreciation_missions_reward_tests.move Test 3) shows P3's close would abort here.
        ssu_depreciation_economy::prune_depreciated_mission_collateral_token_page(
            &gov, &mut mission_registry, &mut pool, &mut l, &cap_store, mission_id, vector[TAKER], &clk, ctx3,
        );
        ssu_depreciation_missions::prune_depreciated_mission_reward(
            &mut mission_registry, &gov, mission_id, &clk, ctx3,
        ); // must NOT abort now that runs_in_progress == 0

        let (_owner, settled) = mission::mission_owner_and_settled(&mission_registry, mission_id);
        assert!(settled, 0);

        gov_helpers::destroy_for_testing(gov);
        tribe_helpers::destroy_for_testing(tribe_gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(shop_cap);
        test_utils::destroy(mission_registry);
        test_utils::destroy(pool);
        test_utils::destroy(l);
        test_utils::destroy(cap_store);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 4 — E_WRONG_TRIBE: ledger bound to a different tribe than the mission's record =====
    #[test]
    #[expected_failure(abort_code = bazaar_economy::ssu_depreciation_economy::E_WRONG_TRIBE)]
    fun test_collateral_token_wrong_tribe_ledger_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let tribe_gov = tribe_helpers::create_for_testing(TRIBE_ID, BAZAAR_ADVANCED, OWNER, 0, &clk, ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(DUMMY_PKG, ctx);
        let mut mission_registry = mission::create_mission_registry_for_testing(ctx);
        let mission_id = helpers::make_advanced_mission(
            &mut mission_registry, &gov, &tribe_gov, 0, 5, 40, &shop_cap, 1, 1, &clk, ctx,
        );
        let mut pool = mission_collateral_token_pool::create_for_testing(SSU_A, ctx);
        let mut l = ledger::create_for_testing(OTHER_TRIBE, &clk, ctx); // mismatched tribe
        let cap_store = helpers::make_loaded_cap_store(ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        // Tribe binding fires before the per-taker loop -- no acceptance needed to trip it.
        ssu_depreciation_economy::prune_depreciated_mission_collateral_token_page(
            &gov, &mut mission_registry, &mut pool, &mut l, &cap_store, mission_id, vector[TAKER], &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 5 (CR-P5B-02a-ii) — frozen-ledger asymmetry, Entry 3 half: aborts =====
    // credit_with_event delegates to credit, whose FIRST assert checks !is_frozen
    // (tribe_token_ledger.move:332, propagated via :528) -- the opposite of Entries 1/2's
    // internal_mint (no frozen check). Same CR-P4-02 asymmetry, now both halves covered.
    #[test]
    #[expected_failure(abort_code = bazaar_economy::tribe_token_ledger::E_LEDGER_FROZEN)]
    fun test_collateral_token_frozen_ledger_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let tribe_gov = tribe_helpers::create_for_testing(TRIBE_ID, BAZAAR_ADVANCED, OWNER, 0, &clk, ctx);
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(DUMMY_PKG, ctx);
        let mut mission_registry = mission::create_mission_registry_for_testing(ctx);
        let mission_id = helpers::make_advanced_mission(
            &mut mission_registry, &gov, &tribe_gov, 0, 5, 40, &shop_cap, 1, 1, &clk, ctx,
        );

        ts::next_tx(&mut scenario, TAKER);
        {
            let ctx2 = ts::ctx(&mut scenario);
            let (_taker, _coll) = mission_lifecycle::advance_accept(
                &mut mission_registry, mission_id, &gov, &members, &tribe_gov, &shop_cap, &clk, ctx2,
            );
        };

        ts::next_tx(&mut scenario, OWNER);
        let ctx3 = ts::ctx(&mut scenario);
        let mission_addr = object::id_to_address(&mission_id);
        let mut pool = mission_collateral_token_pool::create_for_testing(SSU_A, ctx3);
        mission_collateral_token_pool::credit(&mut pool, mission_addr, TAKER, 40);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx3);
        ledger::set_frozen(&mut l, true);
        let cap_store = helpers::make_loaded_cap_store(ctx3);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_mission_collateral_token_page(
            &gov, &mut mission_registry, &mut pool, &mut l, &cap_store, mission_id, vector[TAKER], &clk, ctx3,
        );
        abort 0 // unreachable
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
