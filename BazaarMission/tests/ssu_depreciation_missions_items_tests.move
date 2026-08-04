// bazaar_mission | Unit tests for the depreciated mission reward-bundle and proof-stash recovery page
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 tests for bazaar_mission::ssu_depreciation_missions::prune_depreciated_mission_items_page
/// (CR-P3-01/P3b addendum, critic report ssu-depreciation-prune-P3b-review-2026-07-13.md).
///
/// TEST SEAM (flagged, this shard's report §0/§1): missions here are built via
/// mission::create_eve_mission_for_testing with EMPTY reward items/bundles (Tests 1-5) or
/// mission::construct_mission_advanced (Test 6, CR-P5B-03b), then reward bundles / proof stashes
/// are added AFTERWARD by calling the already-public(package) mission::add_reward_bundle /
/// mission::set_reward_bundles_total / mission::stash_proof directly (same-package access -- this
/// test module IS bazaar_mission) using world::inventory::create_item_for_testing (bare public,
/// WorldStub never publishes). This is the ONLY way to test item recovery at all: WorldStub's
/// Item::quantity/type_id are unconditional abort-0 stubs (WorldStub/sources/inventory.move:18-24,
/// compile-time type binding only), so the REAL creation path
/// (build_eve_mission/construct_mission_advanced -> escrow_reward_bundles ->
/// assert_bundle_satisfies) can never succeed in a unit test regardless of bazaar type. Bypassing
/// escrow_reward_bundles this way changes nothing about the entry UNDER TEST (which only pops
/// already-placed DFs), mirrors the campaign's direct-state-injection precedent
/// (set_depreciated_for_testing / make_inactive_shop).
#[test_only]
module bazaar_mission::ssu_depreciation_missions_items_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock::{Self, Clock};
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use world::inventory::{Self, Item};
    use bazaar_core::ssu_governance::SSUGovernance;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_core::tribe_governance_test_helpers::{Self as tribe_helpers};
    use bazaar_core::bazaar_core_admin;
    use bazaar_mission::mission::{Self, MissionRegistry};
    use bazaar_mission::ssu_depreciation_missions;

    const OWNER: address = @0xA001;
    const SSU_A: address = @0xBEEF;
    const TRIBE_ID: u64 = 0;
    const BAZAAR_NOTRIBE: u8 = 0;
    const BAZAAR_ADVANCED: u8 = 2; // CR-P5B-03(b)
    const DUMMY_PKG: address = @0x0; // CR-P5B-03(b)

    /// Shared setup: a bare EVE mission with `bundle_count` reward bundles (1 Item each) and
    /// `stash_count` proof stashes (1 Item each), placed via direct DF injection (see module header).
    fun make_mission_with_items(
        registry: &mut MissionRegistry, gov: &SSUGovernance,
        bundle_count: u64, stash_count: u64, clock: &Clock, ctx: &mut TxContext,
    ): ID {
        let mid = mission::create_eve_mission_for_testing(
            registry, gov, 0, 5, 0, coin::zero<EVE>(ctx), 1, 1, clock, ctx,
        );
        let m = mission::borrow_mission_mut_pkg(registry, mid);
        let mut i = 0;
        while (i < bundle_count) {
            mission::add_reward_bundle(m, i, vector[inventory::create_item_for_testing(ctx)]);
            i = i + 1;
        };
        mission::set_reward_bundles_total(m, bundle_count);
        let mut j = 0;
        while (j < stash_count) {
            mission::stash_proof(m, vector[inventory::create_item_for_testing(ctx)]);
            j = j + 1;
        };
        mid
    }

    // ===== Test 1 — bundles + proof stashes -> owner via public_transfer =====
    #[test]
    fun test_items_bundles_and_stashes_transfer_to_owner() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let mut registry = mission::create_mission_registry_for_testing(ctx);
            let mid = make_mission_with_items(&mut registry, &gov, 2, 1, &clk, ctx);
            gov_helpers::set_depreciated_for_testing(&mut gov);

            ssu_depreciation_missions::prune_depreciated_mission_items_page(
                &mut registry, &gov, mid, 10, &clk, ctx,
            );

            let m_ref = mission::borrow_mission(&registry, mid);
            assert!(!mission::has_more_bundles(m_ref), 0);
            assert!(!mission::has_pending_proof(m_ref), 1);

            // NIT-P5B-04: literal post-drain re-run, same tx -- must not double-transfer. The
            // next-tx "exactly 3, no 4th" assertion below covers this call's output too.
            ssu_depreciation_missions::prune_depreciated_mission_items_page(
                &mut registry, &gov, mid, 10, &clk, ctx,
            );

            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            clock::destroy_for_testing(clk);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            // 2 bundles + 1 stash = exactly 3 Items landed at the owner (re-run added none).
            let i1 = ts::take_from_address<Item>(&scenario, OWNER);
            let i2 = ts::take_from_address<Item>(&scenario, OWNER);
            let i3 = ts::take_from_address<Item>(&scenario, OWNER);
            assert!(!ts::has_most_recent_for_address<Item>(OWNER), 2); // exactly 3, no 4th
            ts::return_to_address(OWNER, i1);
            ts::return_to_address(OWNER, i2);
            ts::return_to_address(OWNER, i3);
        };
        ts::end(scenario);
    }

    // ===== Test 2 — cursor resume across 2 pages (max_pops < total) =====
    #[test]
    fun test_items_cursor_resumes_across_two_pages() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let mut registry = mission::create_mission_registry_for_testing(ctx);
        let mid = make_mission_with_items(&mut registry, &gov, 3, 0, &clk, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        // Page 1: max_pops=2 < total(3) -- pops exactly 2, cursor stops mid-class.
        ssu_depreciation_missions::prune_depreciated_mission_items_page(
            &mut registry, &gov, mid, 2, &clk, ctx,
        );
        {
            let m_ref = mission::borrow_mission(&registry, mid);
            assert!(mission::has_more_bundles(m_ref), 0); // 1 bundle left
            assert!(mission::mission_bundles_remaining(m_ref) == 1, 1);
        };

        // Page 2: resumes from the cursor -- pops the last bundle, then exhausted.
        ssu_depreciation_missions::prune_depreciated_mission_items_page(
            &mut registry, &gov, mid, 2, &clk, ctx,
        );
        let m_ref2 = mission::borrow_mission(&registry, mid);
        assert!(!mission::has_more_bundles(m_ref2), 2);

        gov_helpers::destroy_for_testing(gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 3 — order-independence: items page BEFORE reward/close =====
    #[test]
    fun test_items_recoverable_before_reward_close() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let mut registry = mission::create_mission_registry_for_testing(ctx);
        let mid = make_mission_with_items(&mut registry, &gov, 1, 0, &clk, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        // Items page BEFORE reward/close -- mission still active/unsettled.
        ssu_depreciation_missions::prune_depreciated_mission_items_page(
            &mut registry, &gov, mid, 10, &clk, ctx,
        );
        let m_ref = mission::borrow_mission(&registry, mid);
        assert!(!mission::has_more_bundles(m_ref), 0);
        assert!(!mission::mission_is_settled(m_ref), 1); // close not yet run

        gov_helpers::destroy_for_testing(gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 4 — order-independence: items page AFTER reward/close =====
    #[test]
    fun test_items_recoverable_after_reward_close() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let mut registry = mission::create_mission_registry_for_testing(ctx);
        let mid = make_mission_with_items(&mut registry, &gov, 1, 0, &clk, ctx);
        gov_helpers::set_depreciated_for_testing(&mut gov);

        // Close FIRST (Entry 2 never touches bundle/proof cursors or DFs).
        ssu_depreciation_missions::prune_depreciated_mission_reward(
            &mut registry, &gov, mid, &clk, ctx,
        );
        // Items page AFTER close -- still recoverable (MissionShop DOF + its DFs
        // persist; deactivate_and_settle is a flag-flip, plan OQ-1).
        ssu_depreciation_missions::prune_depreciated_mission_items_page(
            &mut registry, &gov, mid, 10, &clk, ctx,
        );
        let m_ref = mission::borrow_mission(&registry, mid);
        assert!(!mission::has_more_bundles(m_ref), 0);
        assert!(mission::mission_is_settled(m_ref), 1);

        gov_helpers::destroy_for_testing(gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 5 — empty/exhausted mission: zero pops, no abort, no transfer =====
    #[test]
    fun test_items_empty_mission_is_noop() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let mut registry = mission::create_mission_registry_for_testing(ctx);
        let mid = make_mission_with_items(&mut registry, &gov, 0, 0, &clk, ctx); // no items at all
        gov_helpers::set_depreciated_for_testing(&mut gov);

        ssu_depreciation_missions::prune_depreciated_mission_items_page(
            &mut registry, &gov, mid, 10, &clk, ctx,
        ); // zero pops, no abort, no transfer
        let m_ref = mission::borrow_mission(&registry, mid);
        assert!(!mission::has_more_bundles(m_ref), 0);
        assert!(!mission::has_pending_proof(m_ref), 1);

        gov_helpers::destroy_for_testing(gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 6 (CR-P5B-03b) — Advanced (bt=2) mission with reward bundles recovers to owner =====
    // construct_mission_advanced escrows reward bundles unconditionally too (mission.move:472);
    // this test confirms the items page's NO-bt-gate design actually covers that case. Bundles are
    // injected the same direct-DF way as make_mission_with_items (add_reward_bundle/
    // set_reward_bundles_total, both public(package)) -- WorldStub's abort-0 quantity/type_id stubs
    // block the real escrow_reward_bundles path for Advanced missions exactly as for EVE ones (§0).
    #[test]
    fun test_items_advanced_mission_with_bundles_recovers_to_owner() {
        let mut scenario = ts::begin(OWNER);
        {
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
                5, 50, 0, 16, vector[],
                3_600_000, 3_600_001, 10, 10, &shop_cap, &clk, ctx,
            );
            let mid = mission::register_mission_advanced(&mut registry, m, &shop_cap);
            {
                let m_ref = mission::borrow_mission_mut_pkg(&mut registry, mid);
                mission::add_reward_bundle(m_ref, 0, vector[inventory::create_item_for_testing(ctx)]);
                mission::add_reward_bundle(m_ref, 1, vector[inventory::create_item_for_testing(ctx)]);
                mission::set_reward_bundles_total(m_ref, 2);
            };
            gov_helpers::set_depreciated_for_testing(&mut gov);

            ssu_depreciation_missions::prune_depreciated_mission_items_page(
                &mut registry, &gov, mid, 10, &clk, ctx,
            );

            let m_ref2 = mission::borrow_mission(&registry, mid);
            assert!(!mission::has_more_bundles(m_ref2), 0);

            gov_helpers::destroy_for_testing(gov);
            tribe_helpers::destroy_for_testing(tribe_gov);
            test_utils::destroy(shop_cap);
            test_utils::destroy(registry);
            clock::destroy_for_testing(clk);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let i1 = ts::take_from_address<Item>(&scenario, OWNER);
            let i2 = ts::take_from_address<Item>(&scenario, OWNER);
            assert!(!ts::has_most_recent_for_address<Item>(OWNER), 1); // exactly 2, no 3rd
            ts::return_to_address(OWNER, i1);
            ts::return_to_address(OWNER, i2);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
