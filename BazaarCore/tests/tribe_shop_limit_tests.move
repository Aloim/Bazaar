// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::tribe_shop_limit_tests {
    use sui::clock;
    use sui::test_scenario::{Self as ts};
    use sui::test_utils;
    use bazaar_core::tribe_governance;
    use bazaar_core::tribe_shop_config;
    use dapp_hub::tribe_registry;

    const ALICE: address = @0xA1CE;
    const TRIBE_ID: u64  = 1;

    // ===== Test 1: Some(0) aborts E_INVALID_MAX_SHOPS =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_shop_config::E_INVALID_MAX_SHOPS)]
    fun test_set_max_shops_zero_aborts() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        tribe_shop_config::set_tribe_max_shops_as_leader(
            &leader_cap, &mut gov, std::option::some(0u64), &clk, ts::ctx(&mut scenario),
        );
        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 2: Some(2) stored correctly =====
    #[test]
    fun test_set_max_shops_stored() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        tribe_shop_config::set_tribe_max_shops_as_leader(
            &leader_cap, &mut gov, std::option::some(2u64), &clk, ts::ctx(&mut scenario),
        );
        let override_opt = tribe_governance::tribe_max_shops_override(&gov);
        assert!(std::option::is_some(override_opt));
        assert!(*std::option::borrow(override_opt) == 2u64);
        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 3: None override = unlimited (default state) =====
    #[test]
    fun test_no_override_unlimited() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        // Default: None override = no tribe cap.
        let override_opt = tribe_governance::tribe_max_shops_override(&gov);
        assert!(std::option::is_none(override_opt));
        tribe_governance::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 4: revoked SuperAdmin cannot set tribe shop config =====
    #[test]
    #[expected_failure(abort_code = 4)] // e_tribe_cap_revoked() = 4
    fun test_revoked_super_admin_cannot_set_limit() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let cap = tribe_governance::create_super_admin_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        let cap_id = sui::object::id(&cap);
        tribe_governance::add_to_tribe_super_admin_revocation(&mut gov, cap_id);
        tribe_shop_config::set_tribe_max_shops_as_super_admin(
            &cap, &mut gov, std::option::some(5u64), &clk, ts::ctx(&mut scenario),
        );
        test_utils::destroy(cap);
        tribe_governance::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 5: per-role limit stored and readable =====
    #[test]
    fun test_per_role_limit_stored() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        // Set role 3 (Friendly) to max 5 shops.
        tribe_shop_config::set_tribe_shop_limit_for_role_as_leader(
            &leader_cap, &mut gov, 3u8, 5u64, &clk, ts::ctx(&mut scenario),
        );
        assert!(tribe_governance::tribe_shop_limit_for_role(&gov, 3u8) == 5u64);
        // Unset role returns 0.
        assert!(tribe_governance::tribe_shop_limit_for_role(&gov, 2u8) == 0u64);
        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment.
// ============================================================
