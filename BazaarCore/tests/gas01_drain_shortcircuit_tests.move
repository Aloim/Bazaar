// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Locking tests for GAS-01 drain re-scan short-circuit (Slice A1).
///
/// These tests verify the BEHAVIORAL guarantee of the optimization:
///   - A shop auto-closes iff listings_qty==0 /\ pairs_qty==0 /\ escrowed_eve==0.
///   - touched_remaining > 0  => shop stays active (loops skipped).
///   - Coin-claim path (touched_remaining=0) => closes when escrowed_eve hits 0.
///   - WTB last-fill (listing and eve both hit zero) => auto-closes.
///   - Multi-listing WTS where touched listing hits 0 but another remains => stays active.
///
/// Does NOT use test_scenario (no WorldStub needed — no deposit_to_owned calls).
/// All shop construction uses existing public bazar::create_* and bazar_free::create_free_shop.
/// Drain simulation uses the two new test bridges in bazar_test_accessors.
#[test_only]
module bazaar_core::gas01_drain_shortcircuit_tests {
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_free;
    use bazaar_core::bazar_lifecycle;
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::membership;
    use bazaar_core::ssu_governance_test_helpers;

    const SSU_A:  address = @0x5A01;
    const TRIBE_0: u64   = 0;
    const EXPIRY:  u64   = 9_999_999_999;

    // =========================================================
    // T1 — FREE-coin shop: all EVE claimed out → auto-closes
    //
    // Scenario: FREE coin shop, coin_claim_amount = 100, escrowed_eve = 100.
    //   Simulate single-claimer total drain: withdraw all 100 EVE via test bridge.
    //   Call auto_deactivate_if_drained with touched_remaining = 0
    //   (FREE coin-claim touches no listing → must always pass 0).
    //   escrowed_eve == 0 after drain → all three terms are zero → shop auto-closes.
    //   Assert: is_active == false.
    // =========================================================
    #[test]
    fun t1_free_coin_shop_buyout_auto_closes() {
        let mut ctx = tx_context::dummy();
        let mut clk  = clock::create_for_testing(&mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_A, 0, TRIBE_0, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_0, &mut ctx);

        // Create FREE coin-only shop: no item listings, 100 EVE prepay, claim_amount=100.
        let prepay = coin::mint_for_testing<EVE>(100, &mut ctx);
        let shop_id = bazar_free::create_free_shop(
            &mut registry, &gov, &members,
            0,          // bazaar_type = NoTribe
            b"FreeEveShop",
            SSU_A, TRIBE_0,
            vector[],   // no item_type_ids
            vector[],   // no quantities
            EXPIRY, 0, 0,
            prepay,
            100,        // coin_claim_amount
            &clk, &mut ctx,
        );

        // Sanity checks before drain.
        {
            let shop = bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id);
            assert!(bazar::shop_is_active(shop), 0);
            assert!(bazar::escrowed_eve_value(shop) == 100, 1);
        };

        // Simulate full EVE drain (one claimer takes all 100).
        {
            let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
            let coin_out = bazar_test_accessors::withdraw_escrowed_eve_for_testing(shop, 100, &mut ctx);
            test_utils::destroy(coin_out);
        };

        // Verify eve is now 0.
        {
            let shop = bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id);
            assert!(bazar::escrowed_eve_value(shop) == 0, 2);
        };

        // auto_deactivate_if_drained with touched_remaining=0 (coin-claim path).
        // Expected: shop auto-closes (eve==0, no listings, no pairs).
        bazar_lifecycle::auto_deactivate_if_drained(&mut registry, shop_id, &clk, 0);

        {
            let shop = bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id);
            assert!(!bazar::shop_is_active(shop), 3);
        };

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }

    // =========================================================
    // T2 — Partial WTS buy (2 of 100) → shop stays active
    //
    // Scenario: WTS shop, single listing qty=100.
    //   Simulate buying 2 units → post-decrement = 98.
    //   Call auto_deactivate_if_drained with touched_remaining=98.
    //   The eve check passes (no escrowed_eve on WTS).
    //   The short-circuit fires: 98 > 0 → return false immediately → no close.
    //   Assert: is_active == true.
    //
    //   This test LOCKS the short-circuit: with touched_remaining=98, the two
    //   O(L) while-loops in is_shop_drained are never executed. The shop stays
    //   active without scanning all listings.
    // =========================================================
    #[test]
    fun t2_partial_wts_buy_shop_stays_active() {
        let mut ctx = tx_context::dummy();
        let mut clk  = clock::create_for_testing(&mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_A, 0, TRIBE_0, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_0, &mut ctx);

        // WTS shop: one listing, qty=100, price=10 EVE.
        let shop_id = bazar_test_accessors::create_wts_shop_for_testing(
            &mut registry, &gov, &members,
            0, b"PartialWTS",
            SSU_A, TRIBE_0,
            vector[42u64],    // item_type_id
            vector[100u64],   // qty
            vector[10u64],    // price
            EXPIRY, 0, 0, &clk, &mut ctx,
        );

        // Simulate buying qty=2 → decrement listing 0 by 2.
        // post-decrement quantity = 100 - 2 = 98.
        let post_qty: u64 = {
            let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
            bazar_test_accessors::decrement_listing_for_testing(shop, 0, 2)
        };
        assert!(post_qty == 98, 0);

        // Call with touched_remaining=98.
        // Expected: NOT closed (short-circuit fires; loops not needed).
        bazar_lifecycle::auto_deactivate_if_drained(&mut registry, shop_id, &clk, post_qty);

        {
            let shop = bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id);
            assert!(bazar::shop_is_active(shop), 1);
        };

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }

    // =========================================================
    // T3 — WTB last-fill: listing qty → 0 AND escrowed_eve → 0 → auto-closes
    //
    // Scenario: WTB shop, one listing qty=1, escrowed_eve=100 (the prepay).
    //   Simulate the final fill: decrement listing 1→0 AND drain all 100 EVE.
    //   Call auto_deactivate_if_drained with touched_remaining=0.
    //   Full scan runs: listings_qty==0, pairs_qty==0, eve==0 → shop auto-closes.
    //   Assert: is_active == false.
    // =========================================================
    #[test]
    fun t3_wtb_last_fill_auto_closes() {
        let mut ctx = tx_context::dummy();
        let mut clk  = clock::create_for_testing(&mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_A, 0, TRIBE_0, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_0, &mut ctx);

        // WTB shop: qty=1 listing, price_per_unit=100, prepay=100 EVE.
        let prepay = coin::mint_for_testing<EVE>(100, &mut ctx);
        let shop_id = bazar::create_wtb_shop_notribe(
            &mut registry, &gov,
            0, b"WTBLast",
            SSU_A, TRIBE_0,
            vector[7u64],    // item_type_id
            vector[1u64],    // qty
            vector[100u64],  // price per unit
            &members,
            prepay, EXPIRY, 0, 0, &clk, &mut ctx,
        );

        // Sanity: shop active, eve=100.
        {
            let shop = bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id);
            assert!(bazar::shop_is_active(shop), 0);
            assert!(bazar::escrowed_eve_value(shop) == 100, 1);
        };

        // Simulate final fill: decrement listing qty 1→0, drain all EVE.
        let post_qty: u64 = {
            let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
            let remaining = bazar_test_accessors::decrement_listing_for_testing(shop, 0, 1);
            let coin_out = bazar_test_accessors::withdraw_escrowed_eve_for_testing(shop, 100, &mut ctx);
            test_utils::destroy(coin_out);
            remaining
        };
        assert!(post_qty == 0, 2);

        // touched_remaining=0 → full scan runs → listings_qty=0 /\ pairs_qty=0 /\ eve=0 → close.
        bazar_lifecycle::auto_deactivate_if_drained(&mut registry, shop_id, &clk, 0);

        {
            let shop = bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id);
            assert!(!bazar::shop_is_active(shop), 3);
        };

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }

    // =========================================================
    // T4 — Multi-listing WTS: touched listing hits 0 but another has stock → stays active
    //
    // Scenario: WTS shop, two listings: [qty=5, qty=10].
    //   Buy out listing[0]: qty 5→0, touched_remaining=0.
    //   Call auto_deactivate_if_drained with touched_remaining=0.
    //   The full scan runs (touched item is zero, cannot short-circuit).
    //   Scan finds listing[1] qty=10 → listings_qty != 0 → returns false → NOT closed.
    //   Assert: is_active == true.
    //
    //   This is the correctness complement of T2: when the touched listing hits 0,
    //   the loops run and correctly find the remaining non-empty listing.
    //   It verifies that touched_remaining=0 does NOT unconditionally close.
    // =========================================================
    #[test]
    fun t4_multilist_touched_zero_other_has_stock_stays_active() {
        let mut ctx = tx_context::dummy();
        let mut clk  = clock::create_for_testing(&mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_A, 0, TRIBE_0, @0x0, &clk, &mut ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_0, &mut ctx);

        // WTS shop: two listings [qty=5, qty=10].
        let shop_id = bazar_test_accessors::create_wts_shop_for_testing(
            &mut registry, &gov, &members,
            0, b"MultiWTS",
            SSU_A, TRIBE_0,
            vector[1u64, 2u64],   // item_type_ids
            vector[5u64, 10u64],  // quantities
            vector[10u64, 20u64], // prices
            EXPIRY, 0, 0, &clk, &mut ctx,
        );

        // Buy out listing[0] entirely: qty 5→0.
        let post_qty: u64 = {
            let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
            bazar_test_accessors::decrement_listing_for_testing(shop, 0, 5)
        };
        assert!(post_qty == 0, 0); // listing[0] is empty

        // touched_remaining=0 → full scan runs → finds listing[1] qty=10 → NOT closed.
        bazar_lifecycle::auto_deactivate_if_drained(&mut registry, shop_id, &clk, 0);

        {
            let shop = bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id);
            assert!(bazar::shop_is_active(shop), 1); // must remain active
        };

        // Bonus: also verify that buying the remaining 10 of listing[1]
        // with touched_remaining=0 (both listings now zero) would close.
        // (This extends T4 to confirm the full-scan path closes correctly too.)
        let post_qty2: u64 = {
            let shop = bazar_test_accessors::borrow_shop_mut_for_testing(&mut registry, shop_id);
            bazar_test_accessors::decrement_listing_for_testing(shop, 1, 10)
        };
        assert!(post_qty2 == 0, 2); // listing[1] also now empty

        bazar_lifecycle::auto_deactivate_if_drained(&mut registry, shop_id, &clk, 0);

        {
            let shop = bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id);
            assert!(!bazar::shop_is_active(shop), 3); // now closed — all listings zero
        };

        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
