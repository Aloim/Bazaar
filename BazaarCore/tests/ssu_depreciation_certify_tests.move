// bazaar_core | Unit tests for the SSU depreciation certificate mark entry
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 tests for bazaar_core::ssu_depreciation::mark_ssu_depreciated (V41 SSU depreciation
/// prune plan §1/§2.2, critic plan-audit P5 row: "wrong/counterfeit-registry abort"). Split
/// from ssu_depreciation_mark_tests.move (mark_ssu_revealed) to stay well under the 500-line
/// guard.
///
/// TEST SEAM: see ssu_depreciation.move's "Test-Only Registry-ID Bypass" section (full
/// rationale) and this report's §1. Tests 1, 2, 5 route through the #[test_only]
/// mark_ssu_depreciated_for_testing twin (real business logic, id-assert bypassed); tests 3-4
/// use the SAME twin because they must reach the E_NOT_REVEALED / E_STILL_ANCHORED asserts
/// (which sit AFTER the id assert in the real entry -- the twin is the only way to isolate
/// them from CR-DEP-03's assert); test 6 calls the REAL production entry (the id-assert
/// itself is what's under test there).
///
/// Uses the 3-phase test_scenario pattern (bootstrap tx / action tx / verify tx) for the two
/// tests that check the owner actually received the drained tax-wallet Coin<EVE> --
/// test_scenario only makes a same-tx transfer visible to has_most_recent_for_address /
/// take_from_address after a next_tx boundary (ssu_super_admin_cap_tests.move precedent).
///
/// Tax-wallet funding reuses the EXISTING production ssu_governance::deposit_reclaimed_eve
/// (SSUOwnerCap-gated) + the existing create_owner_cap_for_testing/destroy_owner_cap_for_testing
/// -- no new test-only seam needed for that part.
#[test_only]
module bazaar_core::ssu_depreciation_certify_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use std::string;
    use EVE::EVE::EVE;
    use bazaar_core::ssu_depreciation;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use world::location::{Self as loc, LocationRegistry};

    const OWNER: address = @0xA001;
    const SSU_ADDR: address = @0xBEEF;
    const TRIBE_ID: u64 = 7;
    const BAZAAR_TYPE: u8 = 0;

    fun dummy_coords(): loc::Coordinates {
        loc::coordinates_for_testing(
            30000142, string::utf8(b"1.0"), string::utf8(b"2.0"), string::utf8(b"3.0"),
        )
    }

    /// Shared setup: gov revealed then unanchored (entry removed) -- the precondition every
    /// happy/zero-tax/idempotent test below needs before calling mark_ssu_depreciated.
    fun setup_revealed_and_unanchored(
        clk: &Clock, ctx: &mut TxContext,
    ): (SSUGovernance, LocationRegistry) {
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, clk, ctx,
        );
        let assembly_id = object::id_from_address(SSU_ADDR);
        let mut registry = loc::create_location_registry_for_testing(ctx);
        loc::add_location_for_testing(&mut registry, assembly_id, dummy_coords());
        ssu_depreciation::mark_ssu_revealed_for_testing(&mut gov, &registry);
        loc::remove_location_for_testing(&mut registry, assembly_id);
        (gov, registry)
    }

    // ===== Test 1 — happy path: drains a funded tax wallet to the owner =====
    #[test]
    fun test_mark_depreciated_happy_path_drains_tax_wallet() {
        let mut scenario = ts::begin(OWNER);

        // Tx 1: build the revealed+unanchored gov, fund its tax wallet, depreciate it.
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let (mut gov, registry) = setup_revealed_and_unanchored(&clk, ctx);

            let owner_cap = gov_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, ctx);
            ssu_governance::deposit_reclaimed_eve(
                &owner_cap, &mut gov, coin::mint_for_testing<EVE>(500, ctx),
            );
            gov_helpers::destroy_owner_cap_for_testing(owner_cap);

            ssu_depreciation::mark_ssu_depreciated_for_testing(&mut gov, &registry, &clk, ctx);

            assert!(ssu_governance::is_depreciated(&gov), 0);
            assert!(!ssu_governance::ssu_is_active(&gov), 1);
            assert!(ssu_governance::tax_wallet_value(&gov) == 0, 2);

            loc::destroy_location_registry_for_testing(registry);
            gov_helpers::destroy_for_testing(gov);
            clock::destroy_for_testing(clk);
        };

        // Tx 2: verify the owner received the drained 500 EVE.
        ts::next_tx(&mut scenario, OWNER);
        {
            assert!(ts::has_most_recent_for_address<Coin<EVE>>(OWNER), 3);
            let received = ts::take_from_address<Coin<EVE>>(&scenario, OWNER);
            assert!(coin::value(&received) == 500, 4);
            ts::return_to_address(OWNER, received);
        };

        ts::end(scenario);
    }

    // ===== Test 2 — zero-tax-wallet path: no transfer, still depreciates =====
    #[test]
    fun test_mark_depreciated_zero_tax_wallet_still_depreciates() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let (mut gov, registry) = setup_revealed_and_unanchored(&clk, ctx);

            ssu_depreciation::mark_ssu_depreciated_for_testing(&mut gov, &registry, &clk, ctx);

            assert!(ssu_governance::is_depreciated(&gov), 0);
            assert!(!ssu_governance::ssu_is_active(&gov), 1);

            loc::destroy_location_registry_for_testing(registry);
            gov_helpers::destroy_for_testing(gov);
            clock::destroy_for_testing(clk);
        };

        // No coin was ever minted/transferred in this scenario -- confirm nothing landed.
        ts::next_tx(&mut scenario, OWNER);
        {
            assert!(!ts::has_most_recent_for_address<Coin<EVE>>(OWNER), 2);
        };
        ts::end(scenario);
    }

    // ===== Test 3 — E_NOT_REVEALED: never revealed =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_depreciation::E_NOT_REVEALED)]
    fun test_mark_depreciated_not_revealed_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let registry = loc::create_location_registry_for_testing(ctx); // never revealed

        ssu_depreciation::mark_ssu_depreciated_for_testing(&mut gov, &registry, &clk, ctx);
        abort 0 // unreachable
    }

    // ===== Test 4 — E_STILL_ANCHORED: revealed but entry still present =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_depreciation::E_STILL_ANCHORED)]
    fun test_mark_depreciated_still_anchored_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let assembly_id = object::id_from_address(SSU_ADDR);
        let mut registry = loc::create_location_registry_for_testing(ctx);
        loc::add_location_for_testing(&mut registry, assembly_id, dummy_coords());
        ssu_depreciation::mark_ssu_revealed_for_testing(&mut gov, &registry);
        // Entry NOT removed -- still anchored.

        ssu_depreciation::mark_ssu_depreciated_for_testing(&mut gov, &registry, &clk, ctx);
        abort 0 // unreachable
    }

    // ===== Test 5 — idempotent re-run: second call is a clean no-op =====
    #[test]
    fun test_mark_depreciated_idempotent_rerun_noop() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let (mut gov, registry) = setup_revealed_and_unanchored(&clk, ctx);

        ssu_depreciation::mark_ssu_depreciated_for_testing(&mut gov, &registry, &clk, ctx);
        assert!(ssu_governance::is_depreciated(&gov), 0);

        // Re-run: certificate is terminal -- early-returns before any further state read.
        ssu_depreciation::mark_ssu_depreciated_for_testing(&mut gov, &registry, &clk, ctx);
        assert!(ssu_governance::is_depreciated(&gov), 1);
        assert!(!ssu_governance::ssu_is_active(&gov), 2);
        assert!(ssu_governance::tax_wallet_value(&gov) == 0, 3);

        loc::destroy_location_registry_for_testing(registry);
        gov_helpers::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 6 — E_WRONG_REGISTRY on a non-pinned registry (real entry, no bypass) =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_depreciation::E_WRONG_REGISTRY)]
    fun test_mark_depreciated_wrong_registry_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let registry = loc::create_location_registry_for_testing(ctx); // never == pinned id

        ssu_depreciation::mark_ssu_depreciated(&mut gov, &registry, &clk, ctx); // real entry
        abort 0 // unreachable
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
