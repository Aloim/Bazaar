// bazaar_economy | Unit tests for the depreciated Advanced mission reward-token residue drain entry
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 tests for bazaar_economy::ssu_depreciation_economy::prune_depreciated_mission_reward_token
/// (P4b / CR-P4-01). The create-time ledger LOCK (`ledger.balances[mission_addr]`) and completed-run
/// draw-downs are simulated via tribe_token_ledger::credit/debit called DIRECTLY (public(package),
/// same-package-callable from bazaar_economy) -- these are the EXACT same primitives
/// mission_ledger_ops::create_mission_advanced (:96-102, credit) and settle_token (:476-484, debit)
/// use in production; no new seam. Settlement is via the REAL bazaar_mission::
/// ssu_depreciation_missions::prune_depreciated_mission_reward entry (cross-package, already applied)
/// -- this doubles as the "P3->P4b cross-package ordering" carry-forward coverage. gov_helpers::
/// set_depreciated_for_testing is a CROSS-SHARD dependency on shard A's applied helper -- see this
/// shard's report §2.
#[test_only]
module bazaar_economy::ssu_depreciation_economy_reward_token_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_core::tribe_governance_test_helpers::{Self as tribe_helpers};
    use bazaar_core::bazaar_core_admin;
    use bazaar_mission::mission;
    use bazaar_mission::ssu_depreciation_missions;
    use bazaar_economy::tribe_token_ledger::{Self as ledger};
    use bazaar_economy::ssu_depreciation_economy;
    use bazaar_economy::ssu_depreciation_economy_test_helpers::{Self as helpers};

    const OWNER: address = @0xA001;
    const SSU_A: address = @0xBEEF;
    const TRIBE_ID: u64 = 7;
    const OTHER_TRIBE: u64 = 99;
    const BAZAAR_ADVANCED: u8 = 2;
    const DUMMY_PKG: address = @0x0;

    // ===== Test 1 — E_MISSION_NOT_SETTLED: drain attempted before P3 closes the mission =====
    #[test]
    #[expected_failure(abort_code = bazaar_economy::ssu_depreciation_economy::E_MISSION_NOT_SETTLED)]
    fun test_reward_token_not_settled_aborts() {
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
            &mut mission_registry, &gov, &tribe_gov, 100, 5, 0, &shop_cap, 1, 1, &clk, ctx,
        );
        let mission_addr = object::id_to_address(&mission_id);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        ledger::credit(&mut l, mission_addr, 500); // create-time lock
        gov_helpers::set_depreciated_for_testing(&mut gov);
        // P3's reward/close entry is deliberately NOT called -- mission stays unsettled.

        ssu_depreciation_economy::prune_depreciated_mission_reward_token(
            &gov, &mission_registry, &mut l, mission_id, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 2 — residue correctness after N completed runs: (lock - N*per_run) -> giver =====
    #[test]
    fun test_reward_token_residue_after_partial_completion_credits_giver() {
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
            &mut mission_registry, &gov, &tribe_gov, 100, 5, 0, &shop_cap, 1, 1, &clk, ctx,
        );
        let mission_addr = object::id_to_address(&mission_id);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        ledger::credit(&mut l, mission_addr, 500); // create-time lock (mission_ledger_ops.move:96-102 mirror)
        ledger::debit(&mut l, mission_addr, 200);  // simulates 2 completed runs x 100/run (settle_token mirror)
        let supply_before = ledger::total_supply(&l);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        // Settle via P3 (Advanced -> zero EVE refund, still flips is_settled=true).
        ssu_depreciation_missions::prune_depreciated_mission_reward(
            &mut mission_registry, &gov, mission_id, &clk, ctx,
        );

        ssu_depreciation_economy::prune_depreciated_mission_reward_token(
            &gov, &mission_registry, &mut l, mission_id, &clk, ctx,
        );

        assert!(ledger::balance_of(&l, mission_addr) == 0, 0);
        assert!(ledger::balance_of(&l, OWNER) == 300, 1); // 500 - 200 = 300 residue -> giver
        assert!(ledger::total_supply(&l) == supply_before, 2); // credit/debit never touch supply

        gov_helpers::destroy_for_testing(gov);
        tribe_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(shop_cap);
        test_utils::destroy(mission_registry);
        test_utils::destroy(l);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 3 — zero-balance re-run: clean no-op (already drained) =====
    #[test]
    fun test_reward_token_zero_balance_rerun_is_noop() {
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
            &mut mission_registry, &gov, &tribe_gov, 100, 5, 0, &shop_cap, 1, 1, &clk, ctx,
        );
        let mission_addr = object::id_to_address(&mission_id);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        ledger::credit(&mut l, mission_addr, 500);
        gov_helpers::set_depreciated_for_testing(&mut gov);
        ssu_depreciation_missions::prune_depreciated_mission_reward(
            &mut mission_registry, &gov, mission_id, &clk, ctx,
        );

        ssu_depreciation_economy::prune_depreciated_mission_reward_token(
            &gov, &mission_registry, &mut l, mission_id, &clk, ctx,
        );
        assert!(ledger::balance_of(&l, OWNER) == 500, 0);

        // Re-run: balance_of(mission_addr) == 0 -> clean pre-skip, no double credit.
        ssu_depreciation_economy::prune_depreciated_mission_reward_token(
            &gov, &mission_registry, &mut l, mission_id, &clk, ctx,
        );
        assert!(ledger::balance_of(&l, OWNER) == 500, 1);

        gov_helpers::destroy_for_testing(gov);
        tribe_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(shop_cap);
        test_utils::destroy(mission_registry);
        test_utils::destroy(l);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 4 — E_WRONG_TRIBE: ledger bound to a different tribe than the mission's record =====
    #[test]
    #[expected_failure(abort_code = bazaar_economy::ssu_depreciation_economy::E_WRONG_TRIBE)]
    fun test_reward_token_wrong_tribe_ledger_aborts() {
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
            &mut mission_registry, &gov, &tribe_gov, 100, 5, 0, &shop_cap, 1, 1, &clk, ctx,
        );
        let mut l = ledger::create_for_testing(OTHER_TRIBE, &clk, ctx); // mismatched tribe
        gov_helpers::set_depreciated_for_testing(&mut gov);
        ssu_depreciation_missions::prune_depreciated_mission_reward(
            &mut mission_registry, &gov, mission_id, &clk, ctx,
        );

        ssu_depreciation_economy::prune_depreciated_mission_reward_token(
            &gov, &mission_registry, &mut l, mission_id, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 5 — frozen-ledger whole-call abort (asymmetry vs Entries 1/2 -- debit checks frozen) =====
    #[test]
    #[expected_failure(abort_code = bazaar_economy::tribe_token_ledger::E_LEDGER_FROZEN)]
    fun test_reward_token_frozen_ledger_aborts() {
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
            &mut mission_registry, &gov, &tribe_gov, 100, 5, 0, &shop_cap, 1, 1, &clk, ctx,
        );
        let mission_addr = object::id_to_address(&mission_id);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        ledger::credit(&mut l, mission_addr, 500);
        gov_helpers::set_depreciated_for_testing(&mut gov);
        ssu_depreciation_missions::prune_depreciated_mission_reward(
            &mut mission_registry, &gov, mission_id, &clk, ctx,
        );
        ledger::set_frozen(&mut l, true); // debit's first assert -- whole-call poisoning, documented

        ssu_depreciation_economy::prune_depreciated_mission_reward_token(
            &gov, &mission_registry, &mut l, mission_id, &clk, ctx,
        );
        abort 0 // unreachable
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
