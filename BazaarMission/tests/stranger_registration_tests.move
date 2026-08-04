// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// OS-16 closure verification — 5 tests (SR-01..05)
// Covers: accept-legitimate, reject-frozen, reject-cross-SSU, reject-already-registered,
//         ssu_id accessor structural validation
// Reference: OverhaulStubFixPlan.md §4 R6.6.2
// Reference: TA-overhaul-r6.6-stub-fix-tests.md §SR-01..05

#[test_only]
module bazaar_mission::stranger_registration_tests {
    use sui::clock;
    use sui::test_utils;
    use bazaar_mission::stranger_registration;
    use bazaar_core::membership::{Self, MemberRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_governance_test_helpers;

    const SSU_ID: address   = @0x5A;
    const SSU_OTHER: address = @0x9B;   // different SSU — cross-SSU bypass target
    const TRIBE_ID: u64     = 1;
    const BAZAAR_TYPE: u8   = 0;
    const PLAYER: address   = @0xB1;

    // ===== SR-01: accept legitimate registration =====

    #[test]
    fun sr01_register_stranger_succeeds() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, BAZAAR_TYPE, TRIBE_ID, PLAYER, &clk, &mut ctx,
        );
        let mut registry = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);

        stranger_registration::register_stranger(&gov, &mut registry, &clk, &mut ctx);

        assert!(membership::is_registered(&registry, tx_context::sender(&ctx)), 0);
        assert!(membership::member_count(&registry) == 1, 1);

        test_utils::destroy(gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
    }

    // ===== SR-02: reject when SSUGovernance is frozen =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_SSU_FROZEN)]
    fun sr02_register_stranger_frozen_gov_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, BAZAAR_TYPE, TRIBE_ID, PLAYER, &clk, &mut ctx,
        );
        let mut registry = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);

        let super_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_ID, &mut ctx);
        ssu_governance::freeze_ssu(&super_cap, &mut gov, &clk, &mut ctx);

        stranger_registration::register_stranger(&gov, &mut registry, &clk, &mut ctx);

        membership::destroy_ssu_super_admin_cap_for_testing(super_cap);
        test_utils::destroy(gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
    }

    // ===== SR-03: reject cross-SSU subject =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_SUBJECT_SSU_MISMATCH)]
    fun sr03_register_stranger_wrong_ssu_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, BAZAAR_TYPE, TRIBE_ID, PLAYER, &clk, &mut ctx,
        );
        let mut registry = membership::create_member_registry_for_testing(SSU_OTHER, TRIBE_ID, &mut ctx);

        stranger_registration::register_stranger(&gov, &mut registry, &clk, &mut ctx);

        test_utils::destroy(gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
    }

    // ===== SR-04: reject already-registered (idempotency guard) =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::membership::E_ALREADY_REGISTERED)]
    fun sr04_register_stranger_already_registered_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, BAZAAR_TYPE, TRIBE_ID, PLAYER, &clk, &mut ctx,
        );
        let mut registry = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);

        stranger_registration::register_stranger(&gov, &mut registry, &clk, &mut ctx);
        stranger_registration::register_stranger(&gov, &mut registry, &clk, &mut ctx);

        test_utils::destroy(gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clk);
    }

    // ===== SR-05: ssu_id accessor structural validation =====

    #[test]
    fun sr05_ssu_id_accessor_returns_correct_value() {
        let mut ctx = tx_context::dummy();
        let registry = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);

        assert!(membership::ssu_id(&registry) == SSU_ID, 0);

        test_utils::destroy(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
