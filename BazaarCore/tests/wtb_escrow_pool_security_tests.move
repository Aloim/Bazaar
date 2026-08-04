// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// OS-15 closure verification — 4 tests (WE-01..04)
// Covers: accept-legitimate-owner, reject-on-sender-mismatch,
//         reject-shop-not-in-pool, reject-when-frozen
// Reference: OverhaulStubFixPlan.md §4 R6.6.2
// Reference: TA-overhaul-r6.6-stub-fix-tests.md §WE-01..04

#[test_only]
module bazaar_core::wtb_escrow_pool_security_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use sui::object::ID;
    use sui::test_utils;
    use bazaar_core::wtb_escrow_pool::{Self, WtbEscrowPool};
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::membership;

    const SSU_ID: address  = @0x5A;
    const ALICE: address   = @0xA11CE;   // shop owner
    const BOB: address     = @0xB0B;     // non-owner attacker
    const TRIBE_ID: u64    = 1;
    const BAZAAR_TYPE: u8  = 0;          // NoTribe — no bazaar-type gate on escrow ops

    // ===== WE-01: accept when sender == shop_owner =====
    // Happy path: Alice creates shop, tops up, then withdraws as legitimate owner.

    #[test]
    fun we01_withdraw_by_owner_succeeds() {
        let mut scenario = ts::begin(ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
                SSU_ID, BAZAAR_TYPE, TRIBE_ID, ALICE, &clk, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ID, ctx);

            let members = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, ctx);
            let prepay = coin::mint_for_testing<EVE>(500, ctx);
            let shop_id = bazar::create_wtb_shop_notribe(
                &mut registry, &gov, BAZAAR_TYPE, b"TestWTB",
                SSU_ID, TRIBE_ID, vector[1001u64], vector[1u64], vector[100u64],
                &members, prepay, 9999999999, 0, 0, &clk, ctx,
            );

            let payment = coin::mint_for_testing<EVE>(1000, ctx);
            wtb_escrow_pool::top_up_escrow(&mut pool, &gov, shop_id, payment);

            let returned = wtb_escrow_pool::withdraw_escrow(
                &mut pool, &registry, &gov, shop_id, ctx,
            );
            assert!(coin::value(&returned) == 1000, 0);
            assert!(wtb_escrow_pool::shop_escrow_balance(&pool, shop_id) == 0, 1);

            test_utils::destroy(members);
            test_utils::destroy(gov);
            test_utils::destroy(returned);
            test_utils::destroy(pool);
            test_utils::destroy(registry);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // ===== WE-02: reject when sender != shop_owner =====
    // CC-003 fix: uses test_scenario::next_tx to switch sender to BOB.
    // shop_id (sui::object::ID, which is copy + drop) is captured in ALICE's tx block
    // and carried as a local variable into BOB's tx block — valid within one test function frame.
    // The abort annotation fires when BOB's withdraw_escrow call hits the owner check.

    #[test]
    #[expected_failure(abort_code = bazaar_core::wtb_escrow_pool::E_NOT_SHOP_OWNER)]
    fun we02_withdraw_by_non_owner_aborts() {
        let mut scenario = ts::begin(ALICE);

        // --- Phase 1: share registry, pool, and gov so cross-tx access is possible ---
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
                SSU_ID, BAZAAR_TYPE, TRIBE_ID, ALICE, &clk, ctx,
            );
            bazaar_core::ssu_governance_test_helpers::share_for_testing(gov);
            let registry = bazar_test_accessors::create_registry_for_testing(ctx);
            bazaar_core::bazar::share_for_testing(registry);
            let pool = wtb_escrow_pool::create_for_testing(SSU_ID, ctx);
            bazaar_core::wtb_escrow_pool::share_for_testing(pool);
            clock::destroy_for_testing(clk);
        };

        // --- Phase 2: ALICE creates shop and tops up; capture shop_id ---
        ts::next_tx(&mut scenario, ALICE);
        let shop_id: ID;
        {
            let gov: SSUGovernance = ts::take_shared(&scenario);
            let mut registry: BazarRegistry = ts::take_shared(&scenario);
            let mut pool: WtbEscrowPool = ts::take_shared(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);

            let members = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, ctx);
            let prepay = coin::mint_for_testing<EVE>(500, ctx);
            // shop_id is sui::object::ID — has copy + drop, safe to carry across next_tx
            shop_id = bazar::create_wtb_shop_notribe(
                &mut registry, &gov, BAZAAR_TYPE, b"TestWTB",
                SSU_ID, TRIBE_ID, vector[1001u64], vector[1u64], vector[100u64],
                &members, prepay, 9999999999, 0, 0, &clk, ctx,
            );
            test_utils::destroy(members);

            let payment = coin::mint_for_testing<EVE>(1000, ctx);
            wtb_escrow_pool::top_up_escrow(&mut pool, &gov, shop_id, payment);

            ts::return_shared(gov);
            ts::return_shared(registry);
            ts::return_shared(pool);
            clock::destroy_for_testing(clk);
        };

        // --- Phase 3: BOB attempts withdrawal — aborts E_NOT_SHOP_OWNER ---
        ts::next_tx(&mut scenario, BOB);
        {
            let gov: SSUGovernance = ts::take_shared(&scenario);
            let registry: BazarRegistry = ts::take_shared(&scenario);
            let mut pool: WtbEscrowPool = ts::take_shared(&scenario);
            let ctx = ts::ctx(&mut scenario);

            // shop_id belongs to ALICE; BOB is sender → E_NOT_SHOP_OWNER
            let coin = wtb_escrow_pool::withdraw_escrow(
                &mut pool, &registry, &gov, shop_id, ctx,
            );
            sui::coin::burn_for_testing(coin);
            // Abort fires before here — no cleanup needed for expected_failure test
            ts::return_shared(gov);
            ts::return_shared(registry);
            ts::return_shared(pool);
        };
        ts::end(scenario);
    }

    // ===== WE-03: reject when shop_id not in pool =====
    // Valid owner but shop never topped up → E_SHOP_NOT_IN_POOL fires before owner check.

    #[test]
    #[expected_failure(abort_code = bazaar_core::wtb_escrow_pool::E_SHOP_NOT_IN_POOL)]
    fun we03_withdraw_shop_not_in_pool_aborts() {
        let mut scenario = ts::begin(ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
                SSU_ID, BAZAAR_TYPE, TRIBE_ID, ALICE, &clk, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ID, ctx);

            // Create shop but do NOT top up — pool entry never created
            let members = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, ctx);
            let prepay = coin::mint_for_testing<EVE>(0, ctx);
            let shop_id = bazar::create_wtb_shop_notribe(
                &mut registry, &gov, BAZAAR_TYPE, b"EmptyShop",
                SSU_ID, TRIBE_ID, vector[1001u64], vector[1u64], vector[100u64],
                &members, prepay, 9999999999, 0, 0, &clk, ctx,
            );

            // Withdraw without top-up → E_SHOP_NOT_IN_POOL
            let coin = wtb_escrow_pool::withdraw_escrow(&mut pool, &registry, &gov, shop_id, ctx);
            sui::coin::burn_for_testing(coin);

            test_utils::destroy(gov);
            test_utils::destroy(pool);
            test_utils::destroy(registry);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // ===== WE-04: reject when SSUGovernance is frozen =====
    // assert_not_frozen fires (SA-R6.6-03 implementation, R3.5).

    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_SSU_FROZEN)]
    fun we04_withdraw_frozen_gov_aborts() {
        let mut scenario = ts::begin(ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
                SSU_ID, BAZAAR_TYPE, TRIBE_ID, ALICE, &clk, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ID, ctx);

            let members = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, ctx);
            let prepay = coin::mint_for_testing<EVE>(500, ctx);
            let shop_id = bazar::create_wtb_shop_notribe(
                &mut registry, &gov, BAZAAR_TYPE, b"FrozenShop",
                SSU_ID, TRIBE_ID, vector[1001u64], vector[1u64], vector[100u64],
                &members, prepay, 9999999999, 0, 0, &clk, ctx,
            );
            let payment = coin::mint_for_testing<EVE>(1000, ctx);
            wtb_escrow_pool::top_up_escrow(&mut pool, &gov, shop_id, payment);

            // Freeze the SSU
            let super_admin_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_ID, ctx);
            ssu_governance::freeze_ssu(&super_admin_cap, &mut gov, &clk, ctx);
            assert!(ssu_governance::is_frozen(&gov), 0);

            // Withdraw attempt on frozen SSU → E_SSU_FROZEN
            let coin = wtb_escrow_pool::withdraw_escrow(&mut pool, &registry, &gov, shop_id, ctx);
            sui::coin::burn_for_testing(coin);

            membership::destroy_ssu_super_admin_cap_for_testing(super_admin_cap);
            test_utils::destroy(gov);
            test_utils::destroy(pool);
            test_utils::destroy(registry);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
