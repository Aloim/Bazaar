// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// R-A — Advanced FREE-shop giveaway ban tests (AUD residual fold-in, V36).
///
/// `free_token_claim_advanced` claims from a Shop in `BazarRegistry`; `borrow_shop_mut`
/// is `public(package)` in bazaar_core, so the full entry cannot be driven from a
/// bazaar_economy test. These tests instead drive the PRODUCTION ban predicates the entry
/// now asserts — the exact expressions evaluated inside `free_token_claim_advanced`:
///   assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, claimer, clock), 12)
///   assert!(!ssu_governance::is_banned(gov, claimer, clock), 12)
/// (Same convention as `bazaar_economy::r5_ledger_shop_assert_tests` /
/// `bazaar_core::ban_enforcement_tests`.) E_PLAYER_BANNED = 12 in free_shop_advanced.
#[test_only]
module bazaar_economy::r5_free_shop_advanced_ban_tests {
    use sui::clock;
    use sui::test_scenario::{Self as ts};
    use sui::test_utils;
    use bazaar_core::ssu_governance::{Self};
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::tribe_governance::{Self};
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_core::tribe_governance_caps;
    use bazaar_core::membership::{Self};
    use dapp_hub::tribe_registry::{Self};

    const TRIBE_ID: u64   = 7;
    const SSU_ID:   address = @0x5ADD;
    const LEADER:   address = @0xA1;
    const BOB:      address = @0xB0B;
    const ONE_HOUR_MS: u64 = 3_600_001;

    // ===== RA-01: SSU-timed-banned claimer aborts (code 12) =====
    #[test]
    #[expected_failure(abort_code = 12)]
    fun ra01_ssu_banned_claimer_aborts() {
        let mut scenario = ts::begin(LEADER);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clk, ts::ctx(&mut scenario),
        );
        ssu_governance::set_local_ban_for_testing(&mut gov, BOB, ONE_HOUR_MS);
        // Production guard expression from free_token_claim_advanced (2nd ban assert).
        assert!(!ssu_governance::is_banned(&gov, BOB, &clk), 12);
        ssu_governance::destroy_for_testing(gov); // unreachable
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== RA-02: tribe-globally-banned claimer aborts (code 12) =====
    #[test]
    #[expected_failure(abort_code = 12)]
    fun ra02_tribe_banned_claimer_aborts() {
        let mut scenario = ts::begin(LEADER);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 2, LEADER, 0, &clk, ts::ctx(&mut scenario),
        );
        let members = membership::create_member_registry_for_testing(
            SSU_ID, TRIBE_ID, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        tribe_governance_caps::tribe_ban_as_leader(
            &leader_cap, &mut tribe_gov, &members, BOB,
            clk.timestamp_ms() + ONE_HOUR_MS, &clk, ts::ctx(&mut scenario),
        );
        // Production guard expression from free_token_claim_advanced (1st ban assert).
        assert!(!tribe_governance::tribe_is_globally_banned(&tribe_gov, BOB, &clk), 12);
        test_utils::destroy(leader_cap); // unreachable
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== RA-03: clean claimer passes both predicates =====
    #[test]
    fun ra03_clean_claimer_passes() {
        let mut scenario = ts::begin(LEADER);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clk, ts::ctx(&mut scenario),
        );
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 2, LEADER, 0, &clk, ts::ctx(&mut scenario),
        );
        // Neither predicate flags an unbanned player — both asserts pass.
        assert!(!ssu_governance::is_banned(&gov, BOB, &clk), 0);
        assert!(!tribe_governance::tribe_is_globally_banned(&tribe_gov, BOB, &clk), 0);
        ssu_governance::destroy_for_testing(gov);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
