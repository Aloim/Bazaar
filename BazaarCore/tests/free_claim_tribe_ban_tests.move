// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// R-B — FREE-claim NoTribe/Easy split ban tests (AUD residual fold-in, V36).
///
/// The new Easy entries `shop_ops_de::free_coin_claim_tribe` / `free_claim_tribe` claim from
/// a Shop in BazarRegistry; full entry runs need world objects, so (per the established
/// `ban_enforcement_tests` convention) these tests drive the PRODUCTION guard expressions the
/// new entries assert, plus the NoTribe entries' new `ssu_bazaar_type == 0` guard:
///   NoTribe (free_coin_claim/free_claim):  assert!(ssu_bazaar_type(gov) == 0, 11)
///   Easy (_tribe):  assert!(!tribe_is_globally_banned(tribe_gov, c, clk), 5)
///                   assert!(!ssu_governance::is_banned(gov, c, clk), 5)
/// shop_ops_de error codes: E_PLAYER_BANNED = 5, E_WRONG_BAZAAR_TYPE = 11.
#[test_only]
module bazaar_core::free_claim_tribe_ban_tests {
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

    const TRIBE_ID: u64   = 3;
    const SSU_ID:   address = @0x5BBB;
    const LEADER:   address = @0xA1;
    const BOB:      address = @0xB0B;
    const ONE_HOUR_MS: u64 = 3_600_001;

    // ===== RB-01: NoTribe entry rejects an Easy SSU (code 11) =====
    // Drives the new `ssu_bazaar_type(gov) == 0` guard added to free_coin_claim / free_claim.
    #[test]
    #[expected_failure(abort_code = 11)]
    fun rb01_notribe_entry_rejects_easy_ssu() {
        let mut scenario = ts::begin(LEADER);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 1, TRIBE_ID, LEADER, &clk, ts::ctx(&mut scenario), // type 1 = Easy
        );
        // Production guard expression — the same assert now in free_coin_claim/free_claim.
        assert!(ssu_governance::ssu_bazaar_type(&gov) == 0, 11);
        ssu_governance::destroy_for_testing(gov); // unreachable
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== RB-02: Easy _tribe entry — SSU-timed-banned claimer aborts (code 5) =====
    #[test]
    #[expected_failure(abort_code = 5)]
    fun rb02_tribe_entry_ssu_banned_aborts() {
        let mut scenario = ts::begin(LEADER);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 1, TRIBE_ID, LEADER, &clk, ts::ctx(&mut scenario),
        );
        ssu_governance::set_local_ban_for_testing(&mut gov, BOB, ONE_HOUR_MS);
        // Production guard expression from free_coin_claim_tribe / free_claim_tribe.
        assert!(!ssu_governance::is_banned(&gov, BOB, &clk), 5);
        ssu_governance::destroy_for_testing(gov); // unreachable
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== RB-03: Easy _tribe entry — tribe-globally-banned claimer aborts (code 5) =====
    #[test]
    #[expected_failure(abort_code = 5)]
    fun rb03_tribe_entry_tribe_banned_aborts() {
        let mut scenario = ts::begin(LEADER);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 1, LEADER, 0, &clk, ts::ctx(&mut scenario),
        );
        let members = membership::create_member_registry_for_testing(
            SSU_ID, TRIBE_ID, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        tribe_governance_caps::tribe_ban_as_leader(
            &leader_cap, &mut tribe_gov, &members, BOB,
            clk.timestamp_ms() + ONE_HOUR_MS, &clk, ts::ctx(&mut scenario),
        );
        // Production guard expression — the tribe-global ban now enforced on Easy FREE claims.
        assert!(!tribe_governance::tribe_is_globally_banned(&tribe_gov, BOB, &clk), 5);
        test_utils::destroy(leader_cap); // unreachable
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== RB-04: clean Easy claimer passes all ban predicates =====
    #[test]
    fun rb04_clean_easy_claimer_passes() {
        let mut scenario = ts::begin(LEADER);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 1, TRIBE_ID, LEADER, &clk, ts::ctx(&mut scenario),
        );
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 1, LEADER, 0, &clk, ts::ctx(&mut scenario),
        );
        // Easy SSU passes assert_easy_or_advanced; unbanned player passes both ban predicates.
        assert!(ssu_governance::ssu_bazaar_type(&gov) == 1, 0);
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
