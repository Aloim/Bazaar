// bazaar_core | Unit tests for the SSU reveal certificate mark entry
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 tests for bazaar_core::ssu_depreciation::mark_ssu_revealed (V41 SSU depreciation prune
/// plan §1/§2.2, critic plan-audit P5 row). Split from the mark_ssu_depreciated tests
/// (ssu_depreciation_certify_tests.move) to keep both files well under the 500-line guard.
///
/// TEST SEAM (flagged for critic, full rationale in ssu_depreciation.move's "Test-Only
/// Registry-ID Bypass" section): LOCATION_REGISTRY_ID pins a live object address unit tests
/// cannot construct. Tests 1-3 use the #[test_only] mark_ssu_revealed_for_testing twin (skips
/// ONLY the id assert, runs the real reveal logic). Test 4 calls the REAL production entry
/// with a WorldStub-built registry -- its fresh test-time id is never equal to the pinned
/// constant, so E_WRONG_REGISTRY fires naturally; no bypass needed for that one.
#[test_only]
module bazaar_core::ssu_depreciation_mark_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use std::string;
    use bazaar_core::ssu_depreciation;
    use bazaar_core::ssu_governance;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use world::location::{Self as loc};

    const OWNER: address = @0xA001;
    const SSU_ADDR: address = @0xBEEF;
    const TRIBE_ID: u64 = 0;
    const BAZAAR_TYPE: u8 = 0;

    fun dummy_coords(): loc::Coordinates {
        loc::coordinates_for_testing(
            30000142, string::utf8(b"1.0"), string::utf8(b"2.0"), string::utf8(b"3.0"),
        )
    }

    // ===== Test 1 — sets flag when entry present =====
    #[test]
    fun test_mark_revealed_sets_flag_when_entry_present() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let mut registry = loc::create_location_registry_for_testing(ctx);
        loc::add_location_for_testing(&mut registry, object::id_from_address(SSU_ADDR), dummy_coords());

        assert!(!ssu_governance::location_revealed(&gov), 0);
        ssu_depreciation::mark_ssu_revealed_for_testing(&mut gov, &registry);
        assert!(ssu_governance::location_revealed(&gov), 1);

        loc::destroy_location_registry_for_testing(registry);
        gov_helpers::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 2 — idempotent no-op once already true =====
    // Reveal once (entry present); remove the entry; call again -- must stay true and must
    // NOT re-examine the (now-empty) registry (early-return branch).
    #[test]
    fun test_mark_revealed_noop_when_already_true() {
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
        assert!(ssu_governance::location_revealed(&gov), 0);

        loc::remove_location_for_testing(&mut registry, assembly_id);
        ssu_depreciation::mark_ssu_revealed_for_testing(&mut gov, &registry);
        assert!(ssu_governance::location_revealed(&gov), 1); // still true, no reset

        loc::destroy_location_registry_for_testing(registry);
        gov_helpers::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 3 — no-op when the SSU has no location entry =====
    #[test]
    fun test_mark_revealed_noop_when_no_entry() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let registry = loc::create_location_registry_for_testing(ctx); // empty table

        ssu_depreciation::mark_ssu_revealed_for_testing(&mut gov, &registry);
        assert!(!ssu_governance::location_revealed(&gov), 0);

        loc::destroy_location_registry_for_testing(registry);
        gov_helpers::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 4 — E_WRONG_REGISTRY on a non-pinned registry (real entry, no bypass) =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_depreciation::E_WRONG_REGISTRY)]
    fun test_mark_revealed_wrong_registry_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        // WorldStub factory yields a fresh TxContext-derived id -- never the pinned constant.
        let registry = loc::create_location_registry_for_testing(ctx);

        ssu_depreciation::mark_ssu_revealed(&mut gov, &registry); // real production entry
        abort 0 // unreachable
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
