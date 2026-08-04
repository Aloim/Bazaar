// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::ban_expiry_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use bazaar_core::membership::{Self, SSUOwnerCap};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::ssu_governance_caps;

    const ALICE: address = @0xA11CE;    // SSU owner
    const BOB:   address = @0xB0B;     // target (bannee)
    const SSU_1: address = @0x5511;
    const TRIBE_ID: u64  = 1;
    const BAZAAR_TYPE: u8 = 0;

    // Helper: 1 hour in ms
    const ONE_HOUR_MS: u64 = 3_600_000;

    fun fake_widget_id(): sui::object::ID {
        sui::object::id_from_address(@0x1234)
    }

    // ===== Test 1 — Happy path: owner bans -> is_banned true -> unban -> is_banned false =====
    #[test]
    fun t01_ban_unban_happy_path() {
        let mut scenario = ts::begin(ALICE);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_1, BAZAAR_TYPE, TRIBE_ID, ALICE, fake_widget_id(), &clk, ctx,
            );
            let owner_cap = membership::create_ssu_owner_cap_for_testing(SSU_1, TRIBE_ID, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_transfer(owner_cap, ALICE);
        };

        // Alice bans BOB for 1 hour
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov = ts::take_shared<SSUGovernance>(&scenario);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            // expires_at_ms = 0 (clock) + ONE_HOUR_MS = future
            let expires_at = clock::timestamp_ms(&clk) + ONE_HOUR_MS;
            ssu_governance_caps::ssu_ban_as_owner(&cap, &mut gov, BOB, expires_at, &clk, ctx);
            // Verify: BOB is banned
            assert!(ssu_governance::is_banned(&gov, BOB, &clk), 0);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, cap);
        };

        // Alice unbans BOB
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov = ts::take_shared<SSUGovernance>(&scenario);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            ssu_governance_caps::ssu_unban_as_owner(&cap, &mut gov, BOB, &clk, ctx);
            // Verify: BOB is no longer banned
            assert!(!ssu_governance::is_banned(&gov, BOB, &clk), 1);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, cap);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 2 — Future-time assertion: expires_at_ms = 0 aborts E_BAN_EXPIRY_IN_PAST =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_BAN_EXPIRY_IN_PAST)]
    fun t02_past_expiry_aborts() {
        let mut scenario = ts::begin(ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_1, BAZAAR_TYPE, TRIBE_ID, ALICE, fake_widget_id(), &clk, ctx,
            );
            let owner_cap = membership::create_ssu_owner_cap_for_testing(SSU_1, TRIBE_ID, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_transfer(owner_cap, ALICE);
            clock::destroy_for_testing(clk);
        };

        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov = ts::take_shared<SSUGovernance>(&scenario);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            // Clock starts at 0ms. expires_at_ms = 0 is NOT > 0 => aborts.
            let clk = clock::create_for_testing(ctx);
            ssu_governance_caps::ssu_ban_as_owner(&cap, &mut gov, BOB, 0, &clk, ctx);
            clock::destroy_for_testing(clk);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, cap);
        };
        ts::end(scenario);
    }

    // ===== Test 3 — Auto-expiry: is_banned returns false after clock advances past expiry =====
    #[test]
    fun t03_auto_expiry_via_clock() {
        let mut scenario = ts::begin(ALICE);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_1, BAZAAR_TYPE, TRIBE_ID, ALICE, fake_widget_id(), &clk, ctx,
            );
            let owner_cap = membership::create_ssu_owner_cap_for_testing(SSU_1, TRIBE_ID, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_transfer(owner_cap, ALICE);
        };

        // Ban BOB: expires at clock + 100ms
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov = ts::take_shared<SSUGovernance>(&scenario);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            let expires_at = clock::timestamp_ms(&clk) + 100;
            ssu_governance_caps::ssu_ban_as_owner(&cap, &mut gov, BOB, expires_at, &clk, ctx);
            // At clock=0ms, ban is active
            assert!(ssu_governance::is_banned(&gov, BOB, &clk), 0);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, cap);
        };

        // Advance clock past expiry
        clock::increment_for_testing(&mut clk, 101);

        // Verify: is_banned returns false (no explicit unban needed)
        ts::next_tx(&mut scenario, ALICE);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            assert!(!ssu_governance::is_banned(&gov, BOB, &clk), 1);
            ts::return_shared(gov);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
