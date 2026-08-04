// bazaar_core | Unit tests blocking SSU reactivation after depreciation certificate
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 tests for CR-DEP-07 (critic plan-audit binding condition): a depreciated SSU can
/// never be reactivated via ssu_guarded_ops::set_ssu_active_as_owner. Uses the direct-state
/// set_depreciated_for_testing precondition helper (ssu_governance_test_helpers.move, File B
/// of this report) -- these tests exercise the REACTIVATION GATE, not the certificate mark
/// flow itself (bazaar_core::ssu_depreciation's own test files own that coverage).
/// tx_context::dummy() single-actor style (gas01_drain_shortcircuit_tests.move precedent) --
/// no cross-tx object visibility is needed here.
#[test_only]
module bazaar_core::ssu_guarded_ops_depreciation_tests {
    use sui::clock;
    use bazaar_core::ssu_guarded_ops;
    use bazaar_core::ssu_governance;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};

    const OWNER: address = @0xA001;
    const SSU_ADDR: address = @0xBEEF;
    const TRIBE_ID: u64 = 0;
    const BAZAAR_TYPE: u8 = 0;

    // ===== Test 1 — reactivation (active=true) on a depreciated gov aborts =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_guarded_ops::E_SSU_DEPRECIATED)]
    fun test_reactivate_after_depreciation_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, &mut ctx,
        );
        gov_helpers::set_depreciated_for_testing(&mut gov);
        assert!(ssu_governance::is_depreciated(&gov), 0);

        let cap = gov_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        ssu_guarded_ops::set_ssu_active_as_owner(&cap, &mut gov, true);
        abort 0 // unreachable
    }

    // ===== Test 2 — deactivation (active=false) on a depreciated gov still passes =====
    // CR-DEP-07 blocks ONLY the false->true transition; re-deactivating an already-inactive
    // depreciated gov is a legal call.
    #[test]
    fun test_deactivate_after_depreciation_still_passes() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, &mut ctx,
        );
        gov_helpers::set_depreciated_for_testing(&mut gov);
        assert!(!ssu_governance::ssu_is_active(&gov), 0);

        let cap = gov_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        ssu_guarded_ops::set_ssu_active_as_owner(&cap, &mut gov, false); // no abort
        assert!(!ssu_governance::ssu_is_active(&gov), 1);

        gov_helpers::destroy_owner_cap_for_testing(cap);
        gov_helpers::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
