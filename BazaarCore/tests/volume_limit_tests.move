// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::volume_limit_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::user_storage::{Self, UserStorage};
    use bazaar_core::membership::{Self, SSUOwnerCap};
    use bazaar_core::ssu_governance::SSUGovernance;
    use bazaar_core::ssu_governance_test_helpers;

    const OWNER: address = @0xA1;
    const SSU:   address = @0xB1;
    const BUYER: address = @0xC1;
    const TRIBE_ID: u64  = 0;

    // ===== Test 1: Under-limit deposit succeeds =====
    // Set volume_limit = 1000, deposit quantity = 500. Expect OK.
    #[test]
    fun test_deposit_under_limit_succeeds() {
        let mut scenario = ts::begin(OWNER);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let storage = user_storage::create_for_testing(SSU, ctx);
            let cap = membership::create_ssu_owner_cap_for_testing(SSU, TRIBE_ID, ctx);
            user_storage::share_for_testing(storage);
            sui::transfer::public_transfer(cap, OWNER);
        };

        // Set volume limit to 1000
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, OWNER);
            let ctx = ts::ctx(&mut scenario);
            user_storage::set_volume_limit(&cap, &mut storage, 1000, &clk, ctx);
            assert!(user_storage::volume_limit(&storage) == 1000, 0);
            ts::return_shared(storage);
            ts::return_to_address(OWNER, cap);
        };

        // Deposit 500 — should succeed (500 <= 1000)
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let members = membership::create_member_registry_for_testing(SSU, TRIBE_ID, ts::ctx(&mut scenario));
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, 42u64, 500, option::none(), &clk, ts::ctx(&mut scenario),
            );
            assert!(user_storage::total_item_count(&storage) == 500, 1);
            test_utils::destroy(members);
            ts::return_shared(storage);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 2: Over-limit deposit aborts with E_VOLUME_LIMIT_EXCEEDED =====
    // Set volume_limit = 100, attempt deposit quantity = 200. Expect abort code 6.
    #[test]
    #[expected_failure(abort_code = bazaar_core::user_storage::E_VOLUME_LIMIT_EXCEEDED, location = bazaar_core::user_storage)]
    fun test_deposit_over_limit_aborts() {
        let mut scenario = ts::begin(OWNER);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let storage = user_storage::create_for_testing(SSU, ctx);
            let cap = membership::create_ssu_owner_cap_for_testing(SSU, TRIBE_ID, ctx);
            user_storage::share_for_testing(storage);
            sui::transfer::public_transfer(cap, OWNER);
        };

        // Set volume limit to 100
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, OWNER);
            let ctx = ts::ctx(&mut scenario);
            user_storage::set_volume_limit(&cap, &mut storage, 100, &clk, ctx);
            ts::return_shared(storage);
            ts::return_to_address(OWNER, cap);
        };

        // Attempt deposit of 200 — should abort with E_VOLUME_LIMIT_EXCEEDED (code 6)
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let members = membership::create_member_registry_for_testing(SSU, TRIBE_ID, ts::ctx(&mut scenario));
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, 99u64, 200, option::none(), &clk, ts::ctx(&mut scenario),
            );
            test_utils::destroy(members);
            ts::return_shared(storage);
        };

        // Unreachable — test passes only if the above aborts
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 3: role-specific limit enforced over global (happy path) =====
    #[test]
    fun test_role_limit_enforced_over_global() {
        let mut scenario = ts::begin(OWNER);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let storage = user_storage::create_for_testing(SSU, ctx);
            let cap = membership::create_ssu_owner_cap_for_testing(SSU, TRIBE_ID, ctx);
            user_storage::share_for_testing(storage);
            sui::transfer::public_transfer(cap, OWNER);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, OWNER);
            let ctx = ts::ctx(&mut scenario);
            user_storage::set_volume_limit(&cap, &mut storage, 10000, &clk, ctx);
            ts::return_shared(storage);
            ts::return_to_address(OWNER, cap);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let members = membership::create_member_registry_for_testing(SSU, TRIBE_ID, ts::ctx(&mut scenario));
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, 42u64, 300, option::none(), &clk, ts::ctx(&mut scenario),
            );
            assert!(user_storage::total_item_count(&storage) == 300, 0);
            test_utils::destroy(members);
            ts::return_shared(storage);
        };
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 4: global fallback when no role-limit set =====
    #[test]
    fun test_global_limit_fallback_when_no_role_limit() {
        let mut scenario = ts::begin(OWNER);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let storage = user_storage::create_for_testing(SSU, ctx);
            let cap = membership::create_ssu_owner_cap_for_testing(SSU, TRIBE_ID, ctx);
            user_storage::share_for_testing(storage);
            sui::transfer::public_transfer(cap, OWNER);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, OWNER);
            let ctx = ts::ctx(&mut scenario);
            user_storage::set_volume_limit(&cap, &mut storage, 500, &clk, ctx);
            ts::return_shared(storage);
            ts::return_to_address(OWNER, cap);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let members = membership::create_member_registry_for_testing(SSU, TRIBE_ID, ts::ctx(&mut scenario));
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, 77u64, 499, option::none(), &clk, ts::ctx(&mut scenario),
            );
            assert!(user_storage::total_item_count(&storage) == 499, 0);
            test_utils::destroy(members);
            ts::return_shared(storage);
        };
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 5: per-role volume limit HIT — aborts E_VOLUME_LIMIT_EXCEEDED =====
    // Global limit=10000 (high); role-0 limit=100; deposit 150 as role-0 buyer → abort.
    #[test]
    #[expected_failure(abort_code = bazaar_core::user_storage::E_VOLUME_LIMIT_EXCEEDED)]
    fun test_per_role_volume_limit_hit_aborts() {
        let mut scenario = ts::begin(OWNER);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let storage = user_storage::create_for_testing(SSU, ctx);
            let cap = membership::create_ssu_owner_cap_for_testing(SSU, TRIBE_ID, ctx);
            user_storage::share_for_testing(storage);
            sui::transfer::public_transfer(cap, OWNER);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, OWNER);
            let ctx = ts::ctx(&mut scenario);
            let gov: SSUGovernance = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
                SSU, 0, TRIBE_ID, OWNER, &clk, ctx,
            );
            user_storage::set_volume_limit(&cap, &mut storage, 10000, &clk, ctx);
            user_storage::set_volume_limit_for_role(&cap, &mut storage, 0, 100, &gov, &clk, ctx);
            test_utils::destroy(gov);
            ts::return_shared(storage);
            ts::return_to_address(OWNER, cap);
        };
        ts::next_tx(&mut scenario, BUYER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            // BUYER not registered → effective_role = 0 (stranger) → role limit 100 applies.
            let members = membership::create_member_registry_for_testing(SSU, TRIBE_ID, ts::ctx(&mut scenario));
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, 99u64, 150, option::none(), &clk, ts::ctx(&mut scenario),
            );
            test_utils::destroy(members);
            ts::return_shared(storage);
        };
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
