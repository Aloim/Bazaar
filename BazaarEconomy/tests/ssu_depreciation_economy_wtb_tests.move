// bazaar_economy | Unit tests for the depreciated Advanced WTB token earmark drain page
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 tests for bazaar_economy::ssu_depreciation_economy::prune_depreciated_wtb_token_page
/// (critic P4-review CR-DEP-01 internal_mint verdict + CR-DEP-02 per-row tribe binding +
/// CR-P4-03 fully-filled-zero-entry correction + CR-P4-02 frozen-mint-succeeds asymmetry;
/// CR-P5B-02(b)/(c) supply-cap and mixed-tribe-era additions). gov_helpers::
/// set_depreciated_for_testing is a CROSS-SHARD dependency on shard A's applied helper -- see this
/// shard's report §2.
#[test_only]
module bazaar_economy::ssu_depreciation_economy_wtb_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::membership;
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_economy::tribe_token_ledger::{Self as ledger};
    use bazaar_economy::tribe_token_wtb_pool::{Self as wtb_pool};
    use bazaar_economy::ssu_depreciation_economy;
    use bazaar_economy::ssu_depreciation_economy_test_helpers::{Self as helpers};

    const OWNER: address = @0xA001;
    const SSU_A: address = @0xBEEF;
    const TRIBE_ID: u64 = 7;
    const OTHER_TRIBE: u64 = 99;
    const BAZAAR_ADVANCED: u8 = 2;

    // ===== Test 1 — happy path: internal_mint refund + Sigma-balances == total_supply =====
    #[test]
    fun test_wtb_happy_path_mints_refund_and_conserves_supply() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_stand_in_advanced_shop(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 1, 1, &clk, ctx,
        );
        let mut pool = wtb_pool::create_for_testing(SSU_A, ctx);
        wtb_pool::credit_for_shop(&mut pool, shop_id, 400);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        ledger::mint_for_testing(&mut l, @0xFEED, 1_000); // pre-existing unrelated supply
        let supply_before = ledger::total_supply(&l);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_wtb_token_page(
            &gov, &mut registry, &mut pool, &mut l, vector[shop_id], &clk, ctx,
        );

        assert!(ledger::balance_of(&l, OWNER) == 400, 0);
        assert!(ledger::total_supply(&l) == supply_before + 400, 1);
        assert!(!wtb_pool::has_entry(&pool, shop_id), 2);

        gov_helpers::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(registry);
        test_utils::destroy(pool);
        test_utils::destroy(l);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 2 — E_WRONG_TRIBE: ledger bound to a different tribe than the shop's record =====
    #[test]
    #[expected_failure(abort_code = bazaar_economy::ssu_depreciation_economy::E_WRONG_TRIBE)]
    fun test_wtb_wrong_tribe_ledger_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_stand_in_advanced_shop(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 1, 1, &clk, ctx,
        );
        let mut pool = wtb_pool::create_for_testing(SSU_A, ctx);
        wtb_pool::credit_for_shop(&mut pool, shop_id, 400);
        let mut l = ledger::create_for_testing(OTHER_TRIBE, &clk, ctx); // mismatched tribe
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_wtb_token_page(
            &gov, &mut registry, &mut pool, &mut l, vector[shop_id], &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 3 — re-run no-op: has_entry pre-skip after a full drain =====
    #[test]
    fun test_wtb_rerun_after_drain_is_noop() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_stand_in_advanced_shop(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 1, 1, &clk, ctx,
        );
        let mut pool = wtb_pool::create_for_testing(SSU_A, ctx);
        wtb_pool::credit_for_shop(&mut pool, shop_id, 250);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_wtb_token_page(
            &gov, &mut registry, &mut pool, &mut l, vector[shop_id], &clk, ctx,
        );
        assert!(ledger::balance_of(&l, OWNER) == 250, 0);

        // Re-run the SAME page -- has_entry is now false -> clean pre-skip, no double mint.
        ssu_depreciation_economy::prune_depreciated_wtb_token_page(
            &gov, &mut registry, &mut pool, &mut l, vector[shop_id], &clk, ctx,
        );
        assert!(ledger::balance_of(&l, OWNER) == 250, 1);
        assert!(ledger::total_supply(&l) == 250, 2);

        gov_helpers::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(registry);
        test_utils::destroy(pool);
        test_utils::destroy(l);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 4 — fully-filled WTB shop: present-but-zero entry -> pop-and-skip, no mint =====
    // CR-P4-03: withdraw_from_shop decrements in place and never removes the row at 0
    // (tribe_token_wtb_pool.move:144-161) -- has_entry stays TRUE, take_residue pops it (amount 0).
    #[test]
    fun test_wtb_fully_filled_zero_entry_pop_and_skip_no_mint() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_stand_in_advanced_shop(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 1, 1, &clk, ctx,
        );
        let mut pool = wtb_pool::create_for_testing(SSU_A, ctx);
        wtb_pool::credit_for_shop(&mut pool, shop_id, 500);
        wtb_pool::withdraw_from_shop(&mut pool, shop_id, 500); // fully filled -- present-but-zero
        assert!(wtb_pool::has_entry(&pool, shop_id), 0);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_wtb_token_page(
            &gov, &mut registry, &mut pool, &mut l, vector[shop_id], &clk, ctx,
        );

        assert!(!wtb_pool::has_entry(&pool, shop_id), 1); // popped (amount 0)
        assert!(ledger::balance_of(&l, OWNER) == 0, 2);   // no mint -- amount>0 guard skipped it
        assert!(ledger::total_supply(&l) == 0, 3);

        gov_helpers::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(registry);
        test_utils::destroy(pool);
        test_utils::destroy(l);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 5 — frozen-ledger asymmetry: internal_mint succeeds despite is_frozen (CR-P4-02) =====
    #[test]
    fun test_wtb_mint_succeeds_on_frozen_ledger() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_stand_in_advanced_shop(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 1, 1, &clk, ctx,
        );
        let mut pool = wtb_pool::create_for_testing(SSU_A, ctx);
        wtb_pool::credit_for_shop(&mut pool, shop_id, 300);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        ledger::set_frozen(&mut l, true); // internal_mint has NO frozen assert (CR-P4-02)
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_wtb_token_page(
            &gov, &mut registry, &mut pool, &mut l, vector[shop_id], &clk, ctx,
        );

        assert!(ledger::balance_of(&l, OWNER) == 300, 0); // mint succeeded despite freeze
        assert!(ledger::is_frozen(&l), 1);

        gov_helpers::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(registry);
        test_utils::destroy(pool);
        test_utils::destroy(l);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 6 (CR-P5B-02b) — supply-cap row-specific abort =====
    // internal_mint enforces ledger.supply_cap (tribe_token_ledger.move:350-356, E_SUPPLY_CAP_EXCEEDED=7).
    // Seed the ledger to 480/500, then prune a 30-token row -- 480+30=510 > 500 crosses the cap.
    #[test]
    #[expected_failure(abort_code = bazaar_economy::tribe_token_ledger::E_SUPPLY_CAP_EXCEEDED)]
    fun test_wtb_supply_cap_row_abort() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_stand_in_advanced_shop(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 1, 1, &clk, ctx,
        );
        let mut pool = wtb_pool::create_for_testing(SSU_A, ctx);
        wtb_pool::credit_for_shop(&mut pool, shop_id, 30);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        ledger::set_supply_cap(&mut l, 500);
        ledger::mint_for_testing(&mut l, @0xFEED, 480); // under cap -- legal seed
        gov_helpers::set_depreciated_for_testing(&mut gov);

        // 480 + 30 = 510 > 500 -- internal_mint's cap check aborts.
        ssu_depreciation_economy::prune_depreciated_wtb_token_page(
            &gov, &mut registry, &mut pool, &mut l, vector[shop_id], &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 7 (CR-P5B-02c) — mixed-tribe-era page: row 1 matches, row 2 does not =====
    // Two SSUGovernance objects share ssu_id=SSU_A but carry DIFFERENT tribe_id -- simulates the
    // CR-DEP-02 concern (an ssu_rebind era divergence: old shop records keep their create-time
    // tribe_id while the SSU's current tribe changes; ssu_rebind never touches shops, guard 6).
    // Proves the tribe bind is evaluated PER ROW inside the loop, not a single pre-loop/first-row
    // check: shop_a alone would succeed, but shop_b in the SAME page aborts the whole call.
    #[test]
    #[expected_failure(abort_code = bazaar_economy::ssu_depreciation_economy::E_WRONG_TRIBE)]
    fun test_wtb_mixed_tribe_era_page_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov_1 = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let gov_2 = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, OTHER_TRIBE, OWNER, &clk, ctx,
        );
        let members_1 = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let members_2 = membership::create_member_registry_for_testing(SSU_A, OTHER_TRIBE, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_a = helpers::make_stand_in_advanced_shop(
            &mut registry, &gov_1, &members_1, SSU_A, TRIBE_ID, 1, 1, &clk, ctx,
        );
        let shop_b = helpers::make_stand_in_advanced_shop(
            &mut registry, &gov_2, &members_2, SSU_A, OTHER_TRIBE, 10, 10, &clk, ctx,
        );
        let mut pool = wtb_pool::create_for_testing(SSU_A, ctx);
        wtb_pool::credit_for_shop(&mut pool, shop_a, 100);
        wtb_pool::credit_for_shop(&mut pool, shop_b, 100);
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx); // matches shop_a only
        gov_helpers::set_depreciated_for_testing(&mut gov_1);

        ssu_depreciation_economy::prune_depreciated_wtb_token_page(
            &gov_1, &mut registry, &mut pool, &mut l, vector[shop_a, shop_b], &clk, ctx,
        );
        abort 0 // unreachable
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
