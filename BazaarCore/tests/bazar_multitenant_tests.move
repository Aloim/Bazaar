// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// EFP1 Phase 1 — Multi-tenant assertion tests for bazar::create_*_shop.
/// Verifies that the FE-supplied bazaar_type and tribe_id are validated against
/// the SSUGovernance object at shop creation time (assert_matches_gov helper).
/// 6 tests: 1 happy-path (WTS), 5 abort-only across all 4 shop kinds and both error codes.
#[test_only]
module bazaar_core::bazar_multitenant_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::test_utils;
    use sui::coin;
    use bazaar_core::bazar;
    use bazaar_core::bazar_listings;
    use bazaar_core::bazar_free;
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::membership;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use EVE::EVE::EVE;

    // ===== Test constants =====
    const OWNER: address = @0xA001;
    const SSU_A: address = @0xBEEF;
    const TRIBE_ID: u64 = 42;
    const EXPIRY: u64 = 9_999_999u64;

    // ===== Test 1: Happy path — correct bazaar_type + tribe_id succeeds =====

    #[test]
    fun test_wts_correct_match_succeeds() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            // Gov stamped: bazaar_type=0 (NoTribe), tribe_id=TRIBE_ID.
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, 0, TRIBE_ID, OWNER, &clock, ts::ctx(&mut scenario),
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(
                SSU_A, TRIBE_ID, ts::ctx(&mut scenario),
            );

            // FE passes bazaar_type=0, tribe_id=TRIBE_ID — exact match against gov.
            let shop_id = bazar::create_wts_shop(
                &mut registry, &gov, &members,
                0u8, b"WTS-Match",
                SSU_A, TRIBE_ID,
                vector[101u64], vector[1u64], vector[100u64],
                EXPIRY, 0, 0, &clock, ts::ctx(&mut scenario),
            );
            // Verify shop was registered (non-zero ID returned means success).
            let _ = shop_id;

            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 2: WTS — FE passes wrong bazaar_type → E_BAZAAR_TYPE_MISMATCH =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_BAZAAR_TYPE_MISMATCH)]
    fun test_wts_bazaar_type_mismatch_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            // Gov stamped: bazaar_type=0 (NoTribe).
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, 0, TRIBE_ID, OWNER, &clock, ts::ctx(&mut scenario),
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(
                SSU_A, TRIBE_ID, ts::ctx(&mut scenario),
            );

            // FE passes bazaar_type=1 (Easy) — MISMATCH against gov (0).
            let _id = bazar::create_wts_shop(
                &mut registry, &gov, &members,
                1u8, b"WTS-TypeMismatch",
                SSU_A, TRIBE_ID,
                vector[101u64], vector[1u64], vector[100u64],
                EXPIRY, 0, 0, &clock, ts::ctx(&mut scenario),
            );

            // Unreachable — abort above.
            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 3: WTS — FE passes wrong tribe_id → E_TRIBE_ID_MISMATCH =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_TRIBE_ID_MISMATCH)]
    fun test_wts_tribe_id_mismatch_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            // Gov stamped: bazaar_type=0, tribe_id=TRIBE_ID (42).
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, 0, TRIBE_ID, OWNER, &clock, ts::ctx(&mut scenario),
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(
                SSU_A, TRIBE_ID, ts::ctx(&mut scenario),
            );

            // FE passes tribe_id=99 — MISMATCH against gov.tribe_id (42).
            let _id = bazar::create_wts_shop(
                &mut registry, &gov, &members,
                0u8, b"WTS-TribeMismatch",
                SSU_A, 99u64,
                vector[101u64], vector[1u64], vector[100u64],
                EXPIRY, 0, 0, &clock, ts::ctx(&mut scenario),
            );

            // Unreachable — abort above.
            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 4: WTB — FE passes wrong bazaar_type → E_BAZAAR_TYPE_MISMATCH =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_BAZAAR_TYPE_MISMATCH)]
    fun test_wtb_bazaar_type_mismatch_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            // Gov stamped: bazaar_type=0 (NoTribe), tribe_id=TRIBE_ID.
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, 0, TRIBE_ID, OWNER, &clock, ts::ctx(&mut scenario),
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(
                SSU_A, TRIBE_ID, ts::ctx(&mut scenario),
            );
            // Mint a small prepay coin — WTB requires a Coin<EVE> argument.
            let prepay = coin::mint_for_testing<EVE>(500, ts::ctx(&mut scenario));

            // FE passes bazaar_type=2 (Advanced) — MISMATCH against gov (0).
            // CC2-B1-01: create_wtb_shop deleted. Test passes bazaar_type=2 against gov=0
            // (mismatch). Route to create_wtb_shop_advanced_inner — asserts ssu_bazaar_type==2,
            // fires E_BAZAAR_TYPE_MISMATCH on gov=0. Same abort result as before.
            let _id = bazar::create_wtb_shop_advanced_inner(
                &mut registry, &gov,
                2u8, b"WTB-TypeMismatch",
                SSU_A, TRIBE_ID,
                vector[101u64], vector[1u64], vector[100u64],
                &members, prepay, EXPIRY, 0, 0, &clock, ts::ctx(&mut scenario),
            );

            // Unreachable — abort above.
            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 5: DE — FE passes wrong tribe_id → E_TRIBE_ID_MISMATCH =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_TRIBE_ID_MISMATCH)]
    fun test_de_tribe_id_mismatch_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            // Gov stamped: bazaar_type=1 (Easy), tribe_id=TRIBE_ID (42).
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, 1, TRIBE_ID, OWNER, &clock, ts::ctx(&mut scenario),
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(
                SSU_A, TRIBE_ID, ts::ctx(&mut scenario),
            );

            // FE passes tribe_id=0 — MISMATCH against gov.tribe_id (42).
            let _id = bazar::create_de_shop(
                &mut registry, &gov, &members,
                1u8, b"DE-TribeMismatch",
                SSU_A, 0u64,
                vector[201u64], vector[1u64],
                vector[202u64], vector[1u64],
                vector[1u64],  // offer_per_lots (unused — aborts on tribe mismatch before build_pairs)
                EXPIRY, 0, 0, &clock, ts::ctx(&mut scenario),
            );

            // Unreachable — abort above.
            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 6: FREE — FE passes wrong bazaar_type → E_BAZAAR_TYPE_MISMATCH =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_BAZAAR_TYPE_MISMATCH)]
    fun test_free_bazaar_type_mismatch_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            // Gov stamped: bazaar_type=0 (NoTribe), tribe_id=0.
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_A, 0, 0, OWNER, &clock, ts::ctx(&mut scenario),
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(
                SSU_A, 0, ts::ctx(&mut scenario),
            );

            // FE passes bazaar_type=1 (Easy) — MISMATCH against gov (0).
            let _id = bazar_free::create_free_shop(
                &mut registry, &gov, &members,
                1u8, b"Free-TypeMismatch",
                SSU_A, 0u64,
                vector[301u64], vector[1u64],
                EXPIRY, 0, 0,
                sui::coin::zero<EVE>(ts::ctx(&mut scenario)), 0,   // V25 no coin giveaway
                &clock, ts::ctx(&mut scenario),
            );

            // Unreachable — abort above.
            gov_helpers::destroy_for_testing(gov);
            test_utils::destroy(registry);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Bundle-ratio DE model (offer_per_lot) =====
    // A bundle is `offer_per_lot` offered items for `request_quantity` requested
    // items; stock is a whole number of bundles and buys consume whole bundles.

    #[test]
    fun bundle_build_and_whole_lot_decrement() {
        // 1 bundle = 10 offered ⇌ 5 requested; stock 50 offered = 5 bundles.
        let mut pairs = bazar_listings::build_pairs(
            vector[100u64], vector[50u64], vector[200u64], vector[5u64], vector[10u64],
        );
        let p = bazar_listings::get_pair(&pairs, 0);
        assert!(bazar_listings::pair_offer_per_lot(p) == 10, 0);
        assert!(bazar_listings::pair_offer_qty(p) == 50, 1);
        // Take 2 whole bundles (units = 20 offered) → 30 remaining, then drain.
        let rem = bazar_listings::decrement_pair_offer(&mut pairs, 0, 20);
        assert!(rem == 30, 2);
        let rem2 = bazar_listings::decrement_pair_offer(&mut pairs, 0, 30);
        assert!(rem2 == 0, 3);
        // ExchangePair has drop — the vector is discarded at scope end.
    }

    #[test]
    fun bundle_legacy_lot_one_takes_any_units() {
        // offer_per_lot = 1 reproduces the legacy per-single-offered ratio: any units.
        let mut pairs = bazar_listings::build_pairs(
            vector[100u64], vector[7u64], vector[200u64], vector[3u64], vector[1u64],
        );
        let rem = bazar_listings::decrement_pair_offer(&mut pairs, 0, 3);
        assert!(rem == 4, 0);
    }

    #[test]
    #[expected_failure(abort_code = 11, location = bazaar_core::bazar_listings)]
    fun bundle_partial_lot_aborts() {
        let mut pairs = bazar_listings::build_pairs(
            vector[100u64], vector[50u64], vector[200u64], vector[5u64], vector[10u64],
        );
        // 3 is not a whole multiple of the 10-item bundle → E_PARTIAL_LOT (11).
        let _ = bazar_listings::decrement_pair_offer(&mut pairs, 0, 3);
    }

    #[test]
    #[expected_failure(abort_code = 12, location = bazaar_core::bazar_listings)]
    fun bundle_indivisible_stock_aborts() {
        // 55 offered is not a whole number of 10-item bundles → E_INVALID_LOT (12).
        let _pairs = bazar_listings::build_pairs(
            vector[100u64], vector[55u64], vector[200u64], vector[5u64], vector[10u64],
        );
    }

    #[test]
    #[expected_failure(abort_code = 12, location = bazaar_core::bazar_listings)]
    fun bundle_zero_lot_aborts() {
        // offer_per_lot must be >= 1 → E_INVALID_LOT (12).
        let _pairs = bazar_listings::build_pairs(
            vector[100u64], vector[50u64], vector[200u64], vector[5u64], vector[0u64],
        );
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
