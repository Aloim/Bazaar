// bazaar_economy | Unit tests for the depreciated Advanced FREE shop token pool drain page
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 tests for bazaar_economy::ssu_depreciation_economy::prune_depreciated_free_token_page --
/// the CR-DEP-01 MANDATED supply-conservation test (the plan's original "credit" would have minted
/// unbacked balance; the applied entry uses internal_mint, the exact inverse of
/// free_shop_advanced::create_free_shop_advanced's internal_burn). Test 5 (CR-P5B-02a-i) covers the
/// CR-P4-02 frozen-mint-succeeds asymmetry's Entry-2 half. gov_helpers::
/// set_depreciated_for_testing is a CROSS-SHARD dependency on shard A's applied helper -- see this
/// shard's report §2.
#[test_only]
module bazaar_economy::ssu_depreciation_economy_free_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::bazar;
    use bazaar_core::membership;
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_economy::tribe_token_ledger::{Self as ledger};
    use bazaar_economy::ssu_depreciation_economy;
    use bazaar_economy::ssu_depreciation_economy_test_helpers::{Self as helpers};

    const OWNER: address = @0xA001;
    const SSU_A: address = @0xBEEF;
    const TRIBE_ID: u64 = 7;
    const OTHER_TRIBE: u64 = 99;
    const BAZAAR_ADVANCED: u8 = 2;

    // ===== Test 1 — happy path: internal_mint refund (CR-DEP-01 fix) + conservation =====
    #[test]
    fun test_free_happy_path_mints_refund_and_conserves_supply() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_free_shop_with_pool(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 600, 1, 1, &clk, ctx,
        );
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_free_token_page(
            &gov, &mut registry, &mut l, vector[shop_id], &clk, ctx,
        );

        assert!(ledger::balance_of(&l, OWNER) == 600, 0);
        assert!(ledger::total_supply(&l) == 600, 1); // internal_mint restores supply (CR-DEP-01)
        let shop = bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id);
        assert!(bazar::shop_tribe_token_pool(shop) == 0, 2);

        gov_helpers::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(registry);
        test_utils::destroy(l);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 2 — zero-pool shop (never funded): clean no-op =====
    #[test]
    fun test_free_zero_pool_shop_is_noop() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_free_shop_with_pool(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 0, 1, 1, &clk, ctx,
        );
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_free_token_page(
            &gov, &mut registry, &mut l, vector[shop_id], &clk, ctx,
        );

        assert!(ledger::balance_of(&l, OWNER) == 0, 0);
        assert!(ledger::total_supply(&l) == 0, 1);

        gov_helpers::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(registry);
        test_utils::destroy(l);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 3 — E_WRONG_TRIBE: ledger bound to a different tribe than the shop's record =====
    #[test]
    #[expected_failure(abort_code = bazaar_economy::ssu_depreciation_economy::E_WRONG_TRIBE)]
    fun test_free_wrong_tribe_ledger_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_free_shop_with_pool(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 600, 1, 1, &clk, ctx,
        );
        let mut l = ledger::create_for_testing(OTHER_TRIBE, &clk, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_free_token_page(
            &gov, &mut registry, &mut l, vector[shop_id], &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 4 — re-run after drain: no double mint =====
    #[test]
    fun test_free_rerun_after_drain_is_noop() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_free_shop_with_pool(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 150, 1, 1, &clk, ctx,
        );
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_free_token_page(
            &gov, &mut registry, &mut l, vector[shop_id], &clk, ctx,
        );
        assert!(ledger::balance_of(&l, OWNER) == 150, 0);

        ssu_depreciation_economy::prune_depreciated_free_token_page(
            &gov, &mut registry, &mut l, vector[shop_id], &clk, ctx,
        );
        assert!(ledger::balance_of(&l, OWNER) == 150, 1); // not double-minted
        assert!(ledger::total_supply(&l) == 150, 2);

        gov_helpers::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(registry);
        test_utils::destroy(l);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 5 (CR-P5B-02a-i) — frozen-ledger asymmetry, Entry 2 half: mint succeeds =====
    // Mirrors §8 Test 5 (WTB) for the FREE page -- both Entries 1 and 2 use internal_mint, which
    // carries NO frozen assert (CR-P4-02).
    #[test]
    fun test_free_mint_succeeds_on_frozen_ledger() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let shop_id = helpers::make_free_shop_with_pool(
            &mut registry, &gov, &members, SSU_A, TRIBE_ID, 300, 1, 1, &clk, ctx,
        );
        let mut l = ledger::create_for_testing(TRIBE_ID, &clk, ctx);
        ledger::set_frozen(&mut l, true);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_economy::prune_depreciated_free_token_page(
            &gov, &mut registry, &mut l, vector[shop_id], &clk, ctx,
        );

        assert!(ledger::balance_of(&l, OWNER) == 300, 0);
        assert!(ledger::is_frozen(&l), 1);

        gov_helpers::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        test_utils::destroy(registry);
        test_utils::destroy(l);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
