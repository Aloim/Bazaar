// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::bazar_tests {
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use sui::test_utils;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_free;
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::membership;
    use bazaar_core::ssu_governance;
    use bazaar_core::tribe_governance_test_helpers;

    // --- Test Constants ---
    const SSU_1: address = @0x551;
    const TRIBE_1: u64 = 1;
    const EXPIRY: u64 = 9_999_999_999;

    // ===== T01: create_wts_shop =====
    #[test]
    fun test_create_wts_shop() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);

        let shop_id = bazar::create_wts_shop(
            &mut registry,
            &gov,
            &members,
            1,                          // bazaar_type = EASY
            b"MyShop",
            SSU_1,
            TRIBE_1,
            vector[100u64, 200u64],
            vector[10u64, 5u64],
            vector[1000u64, 500u64],
            EXPIRY,
            0, 0,                       // EFP1 Phase 8: position_x, position_y
            &clk,
            &mut ctx,
        );

        assert!(bazar::shop_count(&registry) == 1, 0);
        assert!(bazar::shop_count_by_type(&registry, 1) == 1, 1);

        let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
        assert!(bazar::shop_kind(shop) == bazar::shop_kind_wts(), 2);
        assert!(bazar::shop_bazaar_type(shop) == 1, 3);
        assert!(bazar::shop_is_active(shop), 4);
        assert!(vector::length(bazar::shop_listings(shop)) == 2, 5);

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }

    // ===== T02: create_wtb_shop =====
    #[test]
    fun test_create_wtb_shop() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut clk = clock::create_for_testing(&mut ctx);
        let prepay = coin::mint_for_testing<EVE>(10_000, &mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 0, 0, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_1, 0, &mut ctx);

        // CC2-B1-01: create_wtb_shop deleted; NoTribe fixture routes to create_wtb_shop_notribe.
        let shop_id = bazar::create_wtb_shop_notribe(
            &mut registry,
            &gov,
            0,                          // bazaar_type = NOTRIBE
            b"WTBShop",
            SSU_1,
            0,
            vector[100u64],
            vector[5u64],
            vector[2000u64],
            &members,
            prepay,
            EXPIRY,
            0, 0,                       // EFP1 Phase 8: position_x, position_y
            &clk,
            &mut ctx,
        );

        assert!(bazar::shop_count(&registry) == 1, 0);
        assert!(bazar::shop_count_by_type(&registry, 0) == 1, 1);

        let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
        assert!(bazar::shop_kind(shop) == bazar::shop_kind_wtb(), 2);
        assert!(bazar::shop_is_active(shop), 3);
        assert!(vector::length(bazar::shop_listings(shop)) == 1, 4);

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }

    // ===== T03: create_de_shop =====
    #[test]
    fun test_create_de_shop() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);

        let shop_id = bazar::create_de_shop(
            &mut registry,
            &gov,
            &members,
            1,
            b"DEShop",
            SSU_1,
            TRIBE_1,
            vector[100u64],    // offer item type ids
            vector[10u64],     // offer quantities
            vector[200u64],    // request item type ids
            vector[5u64],      // request quantities
            vector[1u64],      // offer_per_lots (legacy 1:N ratio — 1 offered per lot)
            EXPIRY,
            0, 0,              // EFP1 Phase 8: position_x, position_y
            &clk,
            &mut ctx,
        );

        assert!(bazar::shop_count(&registry) == 1, 0);

        let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
        assert!(bazar::shop_kind(shop) == bazar::shop_kind_de(), 1);
        assert!(vector::length(bazar::shop_pairs(shop)) == 1, 2);
        assert!(vector::length(bazar::shop_listings(shop)) == 0, 3);

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }

    // ===== T04: create_free_shop =====
    #[test]
    fun test_create_free_shop() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 0, 0, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_1, 0, &mut ctx);

        let shop_id = bazar_free::create_free_shop(
            &mut registry,
            &gov,
            &members,
            0,
            b"FreeShop",
            SSU_1,
            0,
            vector[100u64, 200u64],
            vector[10u64, 5u64],
            EXPIRY,
            0, 0,              // EFP1 Phase 8: position_x, position_y
            sui::coin::zero<EVE>(&mut ctx),  // V25: empty giveaway
            0,                                          // V25: no coin claim
            &clk,
            &mut ctx,
        );

        assert!(bazar::shop_count(&registry) == 1, 0);

        let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
        assert!(bazar::shop_kind(shop) == bazar::shop_kind_free(), 1);
        assert!(vector::length(bazar::shop_listings(shop)) == 2, 2);
        let listing = bazar::get_listing(shop, 0);
        assert!(bazar::listing_price_eve(listing) == 0, 3);

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }

    // ===== T05: close_shop (SDC-001 fix via close_shop_for_testing) =====
    #[test]
    fun test_close_shop() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);

        let shop_id = bazar::create_wts_shop(
            &mut registry, &gov, &members, 1, b"CloseMe", SSU_1, TRIBE_1,
            vector[100u64], vector[10u64], vector[500u64],
            EXPIRY, 0, 0, &clk, &mut ctx,
        );

        // Use the test-only wrapper to avoid dual-borrow of registry + shop
        bazar_test_accessors::close_shop_for_testing(&mut registry, shop_id, &clk, &mut ctx);

        let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
        assert!(!bazar::shop_is_active(shop), 0);

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }

    // ===== T06: update_shop_listing =====
    #[test]
    fun test_update_shop_listing() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);

        let shop_id = bazar::create_wts_shop(
            &mut registry, &gov, &members, 1, b"UpdateMe", SSU_1, TRIBE_1,
            vector[100u64], vector[10u64], vector[1000u64],
            EXPIRY, 0, 0, &clk, &mut ctx,
        );

        bazar::update_shop_listing(&mut registry, shop_id, &gov, 0, 2000, &mut ctx);
        {
            let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
            let listing = bazar::get_listing(shop, 0);
            assert!(bazar::listing_price_eve(listing) == 2000, 0);
        };

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }

    // ===== T07: title_too_long_aborts =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar_helpers::E_TITLE_TOO_LONG)]
    fun test_title_too_long_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);
        // 21 bytes — exceeds TITLE_MAX (20)
        let long_title = b"123456789012345678901";

        let _id = bazar::create_wts_shop(
            &mut registry, &gov, &members, 1, long_title, SSU_1, TRIBE_1,
            vector[100u64], vector[10u64], vector[500u64],
            EXPIRY, 0, 0, &clk, &mut ctx,
        );
        abort 0 // unreachable — expected_failure aborts above
    }

    // ===== T08: empty_listings_aborts =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar_helpers::E_EMPTY_LISTINGS)]
    fun test_empty_listings_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);

        let _id = bazar::create_wts_shop(
            &mut registry, &gov, &members, 1, b"Empty", SSU_1, TRIBE_1,
            vector[],   // empty item_type_ids
            vector[],
            vector[],
            EXPIRY, 0, 0, &clk, &mut ctx,
        );
        abort 0 // unreachable
    }

    // ===== T09: length_mismatch_aborts =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar_helpers::E_LENGTH_MISMATCH)]
    fun test_length_mismatch_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);
        // item_type_ids has 2, quantities has 1 => mismatch
        let _id = bazar::create_wts_shop(
            &mut registry, &gov, &members, 1, b"Mismatch", SSU_1, TRIBE_1,
            vector[100u64, 200u64],
            vector[10u64],
            vector[500u64, 300u64],
            EXPIRY, 0, 0, &clk, &mut ctx,
        );
        abort 0 // unreachable
    }

    // ===== T10: shop_accessors round-trip =====
    #[test]
    fun test_shop_accessors() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);

        let shop_id = bazar::create_wts_shop(
            &mut registry, &gov, &members, 1, b"Accessors", SSU_1, TRIBE_1,
            vector[999u64], vector[7u64], vector[888u64],
            EXPIRY, 0, 0, &clk, &mut ctx,
        );

        let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);

        assert!(bazar::shop_bazaar_type(shop) == 1, 0);
        assert!(bazar::shop_tribe_id(shop) == TRIBE_1, 1);
        assert!(bazar::shop_ssu_id(shop) == SSU_1, 2);
        assert!(bazar::shop_kind(shop) == bazar::shop_kind_wts(), 3);
        assert!(bazar::shop_is_active(shop), 4);
        assert!(bazar::shop_expiry_ms(shop) == EXPIRY, 5);
        assert!(vector::length(bazar::shop_listings(shop)) == 1, 6);
        assert!(vector::length(bazar::shop_pairs(shop)) == 0, 7);

        let listing = bazar::get_listing(shop, 0);
        assert!(bazar::listing_item_type_id(listing) == 999, 8);
        assert!(bazar::listing_quantity(listing) == 7, 9);
        assert!(bazar::listing_price_eve(listing) == 888, 10);
        assert!(bazar::listing_original_quantity(listing) == 7, 11);

        // Kind constants
        assert!(bazar::shop_kind_wts() == 0, 12);
        assert!(bazar::shop_kind_wtb() == 1, 13);
        assert!(bazar::shop_kind_de() == 2, 14);
        assert!(bazar::shop_kind_free() == 3, 15);

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }

    // ===== T11a: OS-35 — E_MAX_SHOPS_EXCEEDED via max_shops_override — WTS variant =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_MAX_SHOPS_EXCEEDED)]
    fun test_create_wts_shop_exceeds_max_shops_override_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx);
        ssu_governance::set_max_shops_override(&mut gov, option::some(1u64));
        let _s1 = bazar::create_wts_shop(&mut registry, &gov, &members, 1, b"Shop1", SSU_1, TRIBE_1, vector[10u64], vector[1u64], vector[100u64], EXPIRY, 0, 0, &clk, &mut ctx);
        let _s2 = bazar::create_wts_shop(&mut registry, &gov, &members, 1, b"Shop2", SSU_1, TRIBE_1, vector[10u64], vector[1u64], vector[100u64], EXPIRY, 0, 0, &clk, &mut ctx);
        abort 0
    }

    // ===== T11b: OS-35 — E_MAX_SHOPS_EXCEEDED — WTB variant =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_MAX_SHOPS_EXCEEDED)]
    fun test_create_wtb_shop_exceeds_max_shops_override_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx);
        ssu_governance::set_max_shops_override(&mut gov, option::some(1u64));
        // CC2-B1-01: Easy WTB split requires TribeGovernance. Add a bare tribe gov.
        let tribe_gov_e = tribe_governance_test_helpers::create_for_testing(
            TRIBE_1, 1, @0x0, 0, &clk, &mut ctx,
        );
        // CC2-B1-01: retarget to create_wtb_shop_easy (bazaar_type=1 fixture).
        let _s1 = bazar::create_wtb_shop_easy(&mut registry, &gov, &tribe_gov_e, 1, b"WTB1", SSU_1, TRIBE_1, vector[1001u64], vector[1u64], vector[100u64], &members, coin::mint_for_testing<EVE>(10000, &mut ctx), 9999999, 0, 0, &clk, &mut ctx);
        let _s2 = bazar::create_wtb_shop_easy(&mut registry, &gov, &tribe_gov_e, 1, b"WTB2", SSU_1, TRIBE_1, vector[1001u64], vector[1u64], vector[100u64], &members, coin::mint_for_testing<EVE>(10000, &mut ctx), 9999999, 0, 0, &clk, &mut ctx);
        test_utils::destroy(tribe_gov_e);
        abort 0
    }

    // ===== T11c: OS-35 — E_MAX_SHOPS_EXCEEDED — DE variant =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_MAX_SHOPS_EXCEEDED)]
    fun test_create_de_shop_exceeds_max_shops_override_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx);
        ssu_governance::set_max_shops_override(&mut gov, option::some(1u64));
        let _s1 = bazar::create_de_shop(&mut registry, &gov, &members, 1, b"DE1", SSU_1, TRIBE_1, vector[1001u64], vector[1u64], vector[1002u64], vector[1u64], vector[1u64], EXPIRY, 0, 0, &clk, &mut ctx);
        let _s2 = bazar::create_de_shop(&mut registry, &gov, &members, 1, b"DE2", SSU_1, TRIBE_1, vector[1001u64], vector[1u64], vector[1002u64], vector[1u64], vector[1u64], EXPIRY, 0, 0, &clk, &mut ctx);
        abort 0
    }

    // ===== T11d: OS-35 — E_MAX_SHOPS_EXCEEDED — Free variant =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_MAX_SHOPS_EXCEEDED)]
    fun test_create_free_shop_exceeds_max_shops_override_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(SSU_1, 1, TRIBE_1, @0x0, &clk, &mut ctx);
        ssu_governance::set_max_shops_override(&mut gov, option::some(1u64));
        let _s1 = bazar_free::create_free_shop(&mut registry, &gov, &members, 1, b"Free1", SSU_1, TRIBE_1, vector[1001u64], vector[1u64], EXPIRY, 0, 0, sui::coin::zero<EVE>(&mut ctx), 0, &clk, &mut ctx);
        let _s2 = bazar_free::create_free_shop(&mut registry, &gov, &members, 1, b"Free2", SSU_1, TRIBE_1, vector[1001u64], vector[1u64], EXPIRY, 0, 0, sui::coin::zero<EVE>(&mut ctx), 0, &clk, &mut ctx);
        abort 0
    }

    // ===== T12: OS-44 — per-role limit enforcement (role_limit > 0 takes precedence) =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_MAX_SHOPS_EXCEEDED)]
    fun test_create_shop_role_limit_exceeded_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(SSU_1, 0, 0, @0x0, &clk, &mut ctx);
        ssu_governance::set_shop_limit_for_role(&mut gov, 0, 1); // role 0 (stranger) = 1 shop max
        let _s1 = bazar::create_wts_shop(&mut registry, &gov, &members, 0, b"First", SSU_1, 0, vector[1u64], vector[1u64], vector[10u64], EXPIRY, 0, 0, &clk, &mut ctx);
        let _s2 = bazar::create_wts_shop(&mut registry, &gov, &members, 0, b"Second", SSU_1, 0, vector[1u64], vector[1u64], vector[10u64], EXPIRY, 0, 0, &clk, &mut ctx);
        abort 0
    }

    // ===== T15: OS-44 — role_limit=0 falls back to max_shops_override =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazar::E_MAX_SHOPS_EXCEEDED)]
    fun test_create_shop_role_limit_zero_falls_back_to_override_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let members = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(SSU_1, 0, 0, @0x0, &clk, &mut ctx);
        // role_limit=0 (not set) + max_shops_override=Some(1) → fallback enforces limit
        ssu_governance::set_max_shops_override(&mut gov, option::some(1u64));
        let _s1 = bazar::create_wts_shop(&mut registry, &gov, &members, 0, b"Shop1", SSU_1, 0, vector[1u64], vector[1u64], vector[10u64], EXPIRY, 0, 0, &clk, &mut ctx);
        let _s2 = bazar::create_wts_shop(&mut registry, &gov, &members, 0, b"Shop2", SSU_1, 0, vector[1u64], vector[1u64], vector[10u64], EXPIRY, 0, 0, &clk, &mut ctx);
        abort 0
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
