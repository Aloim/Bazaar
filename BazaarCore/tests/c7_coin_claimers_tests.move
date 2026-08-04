// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// C7 / AUD-NT-05 locking tests: FREE-shop coin_claimers vector → Table reshape.
///
/// Tests the four plan §11 C7 invariants and the security-review AUD-NT-05 guardrail:
///
///   C7-CLM-01: first claim by wallet A → has_coin_claimed false before record,
///              true after record_coin_claim. (Table key written correctly.)
///
///   C7-CLM-02: second claim attempt by A → the production guard expression
///              assert!(!has_coin_claimed(shop, A), 22) aborts with code 22.
///              (Exactly-once semantics preserved; contains-then-add ordering holds.)
///
///   C7-CLM-03: independent wallet B → has_coin_claimed false before record (A's
///              claim did not bleed into B's Table key), record_coin_claim succeeds,
///              has_coin_claimed true after. Unrelated wallet C remains false.
///              (Per-claimer isolation across separate Table keys.)
///
/// COVGAP C7-COVGAP-01: full FREE-coin e2e (free_coin_claim / free_token_claim_advanced)
/// deferred to test-architect; requires StorageUnit + EVE coin minting stubs. The
/// production guard is byte-identical to the expression tested here (shop_ops_de.move:229 +
/// free_shop_advanced.move:167 are both `assert!(!bazar::has_coin_claimed(shop, claimer), …)`).
#[test_only]
module bazaar_core::c7_coin_claimers_tests {
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::membership;

    // ===== Test Constants =====
    const SSU_A:  address = @0xA01;
    const TRIBE_0: u64   = 0;
    const EXPIRY:  u64   = 9_999_999_999;
    const ALICE:   address = @0xA11CE;
    const BOB:     address = @0xB0B;
    const CAROL:   address = @0xCA901;

    // ===== Helper: create a WTS shop; returns its DOF-registered ID =====
    //
    // Mirrors make_wts_shop_at in bazar_position_tests.move. Uses bazar_type=0
    // (NoTribe), position (10,10). The shop kind is irrelevant for coin_claimers
    // semantics — the field exists on every Shop regardless of kind.
    fun make_shop(
        registry: &mut BazarRegistry,
        ctx: &mut TxContext,
    ): ID {
        let clk = clock::create_for_testing(ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_A, 0, TRIBE_0, @0x0, &clk, ctx,
        );
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_0, ctx);
        let shop_id = bazar::create_wts_shop(
            registry,
            &gov,
            &members,
            0,                   // bazaar_type = NOTRIBE
            b"ClaimerTestShop",
            SSU_A,
            TRIBE_0,
            vector[100u64],      // item_type_ids
            vector[1u64],        // quantities
            vector[1000u64],     // prices_eve
            EXPIRY,
            10, 10,              // position_x, position_y
            &clk,
            ctx,
        );
        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(members);
        clock::destroy_for_testing(clk);
        shop_id
    }

    // ===== C7-CLM-01: first claim is recorded; has_coin_claimed true after =====
    //
    // Sequence:
    //   1. Create shop.
    //   2. has_coin_claimed(shop, ALICE) → false (Table has no entry for ALICE).
    //   3. record_coin_claim(shop, ALICE) → table::add(claimers, ALICE, true).
    //   4. has_coin_claimed(shop, ALICE) → true (Table now contains ALICE key).
    #[test]
    fun test_first_claim_recorded() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let shop_id = make_shop(&mut registry, &mut ctx);

        let shop = bazar::borrow_shop_mut(&mut registry, shop_id);
        // Before claim: ALICE has no entry in the Table.
        assert!(!bazar::has_coin_claimed(shop, ALICE), 0);
        // Record the claim.
        bazar::record_coin_claim(shop, ALICE);
        // After claim: ALICE key is present.
        assert!(bazar::has_coin_claimed(shop, ALICE), 1);

        test_utils::destroy(registry);
    }

    // ===== C7-CLM-02: second claim attempt by same wallet aborts code 22 =====
    //
    // Drives the production guard expression at both call sites:
    //   shop_ops_de.move:229  assert!(!bazar::has_coin_claimed(shop, claimer), 22)
    //   free_shop_advanced.move:167  assert!(!bazar::has_coin_claimed(shop, claimer), E_ALREADY_CLAIMED)
    // (E_ALREADY_CLAIMED in free_shop_advanced == 22 numerically; same assertion.)
    //
    // Contains-then-add ordering: the upstream assert (not table::add's raw abort)
    // fires first, emitting the proper domain error code 22.
    #[test]
    #[expected_failure(abort_code = 22)]
    fun test_second_claim_same_wallet_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let shop_id = make_shop(&mut registry, &mut ctx);

        let shop = bazar::borrow_shop_mut(&mut registry, shop_id);
        // First claim succeeds.
        bazar::record_coin_claim(shop, ALICE);
        // Production guard: second call aborts with the domain code, not table::add's raw abort.
        assert!(!bazar::has_coin_claimed(shop, ALICE), 22);

        test_utils::destroy(registry); // unreachable
    }

    // ===== C7-CLM-03: independent wallets use separate Table keys =====
    //
    // Sequence:
    //   1. Create shop.
    //   2. ALICE claims → has_coin_claimed(ALICE) == true.
    //   3. BOB has not claimed → has_coin_claimed(BOB) == false (ALICE's key did not bleed).
    //   4. BOB claims → has_coin_claimed(BOB) == true.
    //   5. CAROL never claimed → has_coin_claimed(CAROL) == false.
    #[test]
    fun test_independent_wallets_separate_keys() {
        let mut ctx = tx_context::dummy();
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let shop_id = make_shop(&mut registry, &mut ctx);

        let shop = bazar::borrow_shop_mut(&mut registry, shop_id);

        // ALICE claims.
        assert!(!bazar::has_coin_claimed(shop, ALICE), 0);
        bazar::record_coin_claim(shop, ALICE);
        assert!(bazar::has_coin_claimed(shop, ALICE), 1);

        // BOB's Table key is independent — ALICE's entry does not pollute BOB.
        assert!(!bazar::has_coin_claimed(shop, BOB), 2);
        bazar::record_coin_claim(shop, BOB);
        assert!(bazar::has_coin_claimed(shop, BOB), 3);

        // CAROL never claimed — Table key absent.
        assert!(!bazar::has_coin_claimed(shop, CAROL), 4);

        test_utils::destroy(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
