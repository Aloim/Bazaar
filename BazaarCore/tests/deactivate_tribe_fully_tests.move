// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Tests for tribe_lifecycle::deactivate_tribe_fully (Issue-1 V37 on-chain fix).
/// Proves the combined entry flips BOTH the dapp_hub registry Tribe.is_active AND
/// the bazaar_core TribeGovernance.is_active, that the wrong-tribe guard fires, and
/// that a fully-deactivated tribe's governance then blocks assert_tribe_active.
#[test_only]
module bazaar_core::deactivate_tribe_fully_tests {
    use sui::tx_context;
    use sui::clock;
    use std::option;
    use bazaar_core::tribe_lifecycle;
    use bazaar_core::tribe_governance;
    use bazaar_core::tribe_governance_test_helpers as gov_helpers;
    use dapp_hub::tribe_registry;

    const ALICE: address = @0xA;
    const EASY: u8 = 1;   // bazaar_type Easy
    const OPEN: u8 = 0;   // join_policy open

    // ===== DTF-01: happy path — both active flags flip to false =====
    #[test]
    fun dtf01_deactivates_registry_and_governance() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut registry = tribe_registry::create_for_testing(&mut ctx);

        // First created tribe gets id = 1 (next_id starts at 1); cap.tribe_id == 1.
        let leader_cap = tribe_registry::create_tribe_for_testing(
            &mut registry, b"Test Tribe", b"desc",
            option::none<vector<u8>>(), option::none<vector<u8>>(),
            EASY, OPEN, 0, &clk, &mut ctx,
        );
        let tid = tribe_registry::cap_tribe_id(&leader_cap);
        let mut gov = gov_helpers::create_for_testing(tid, EASY, ALICE, 0, &clk, &mut ctx);

        // Pre-condition: both sides active.
        assert!(tribe_registry::tribe_is_active(tribe_registry::tribe_by_id(&registry, tid)), 0);
        assert!(tribe_governance::tribe_is_active(&gov), 1);

        tribe_lifecycle::deactivate_tribe_fully(&leader_cap, &mut registry, &mut gov, &clk, &mut ctx);

        // Post-condition: registry flag AND governance flag both cleared.
        assert!(!tribe_registry::tribe_is_active(tribe_registry::tribe_by_id(&registry, tid)), 2);
        assert!(!tribe_governance::tribe_is_active(&gov), 3);

        gov_helpers::destroy_for_testing(gov);
        tribe_registry::destroy_leader_cap_for_testing(leader_cap);
        sui::test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
    }

    // ===== DTF-02: cap for tribe 1 cannot deactivate tribe 2's governance =====
    #[test]
    #[expected_failure(abort_code = 3, location = bazaar_core::tribe_lifecycle)] // E_WRONG_TRIBE
    fun dtf02_wrong_tribe_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut registry = tribe_registry::create_for_testing(&mut ctx);

        let leader_cap = tribe_registry::create_leader_cap_for_testing(1, &mut ctx);
        // Governance object belongs to a DIFFERENT tribe (id 2) — guard must fire
        // before the registry is ever touched.
        let mut gov = gov_helpers::create_for_testing(2, EASY, ALICE, 0, &clk, &mut ctx);

        tribe_lifecycle::deactivate_tribe_fully(&leader_cap, &mut registry, &mut gov, &clk, &mut ctx);

        gov_helpers::destroy_for_testing(gov); // unreachable
        tribe_registry::destroy_leader_cap_for_testing(leader_cap);
        sui::test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
    }

    // ===== DTF-03: after full deactivation, gated entries abort via assert_tribe_active =====
    #[test]
    #[expected_failure(abort_code = 1, location = bazaar_core::tribe_lifecycle)] // E_TRIBE_NOT_ACTIVE
    fun dtf03_gated_entry_blocked_after_full_deactivation() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut registry = tribe_registry::create_for_testing(&mut ctx);

        let leader_cap = tribe_registry::create_tribe_for_testing(
            &mut registry, b"Test Tribe", b"desc",
            option::none<vector<u8>>(), option::none<vector<u8>>(),
            EASY, OPEN, 0, &clk, &mut ctx,
        );
        let tid = tribe_registry::cap_tribe_id(&leader_cap);
        let mut gov = gov_helpers::create_for_testing(tid, EASY, ALICE, 0, &clk, &mut ctx);

        tribe_lifecycle::deactivate_tribe_fully(&leader_cap, &mut registry, &mut gov, &clk, &mut ctx);

        // The governance flag is now false → the production guard aborts.
        tribe_lifecycle::assert_tribe_active(&gov);

        gov_helpers::destroy_for_testing(gov); // unreachable
        tribe_registry::destroy_leader_cap_for_testing(leader_cap);
        sui::test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
