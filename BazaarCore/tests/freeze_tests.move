// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::freeze_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_core::ssu_governance_caps;
    use bazaar_core::membership::{Self, SSUSuperAdminCap, SSUOwnerCap};
    use bazaar_core::shop_ops;
    use bazaar_core::wtb_escrow_pool;
    use bazaar_core::quicktrade_vault;
    use bazaar_core::bazar;
    use bazaar_core::bazar_test_accessors;

    const OWNER: address = @0xA001;
    const SUPER_ADMIN: address = @0xA002;
    const PLAYER: address = @0xA003;
    const SSU_A: address = @0xBEEF;
    const SSU_B: address = @0xCAFE;
    const TRIBE_ID: u64 = 1;

    // ===== Test 1: Happy path — freeze blocks mutation, unfreeze restores =====

    #[test]
    fun test_freeze_blocks_and_unfreeze_restores() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let mut gov = gov_helpers::create_for_testing(
                SSU_A, 0, TRIBE_ID, OWNER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            let owner_cap = gov_helpers::create_owner_cap_for_testing(SSU_A, TRIBE_ID, ts::ctx(&mut scenario));

            // Confirm SSU starts unfrozen.
            assert!(!ssu_governance::is_frozen(&gov), 0);

            // Issue a SuperAdminCap, then freeze via it.
            let super_admin_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_A, ts::ctx(&mut scenario));
            ssu_governance::freeze_ssu(&super_admin_cap, &mut gov, &clock, ts::ctx(&mut scenario));
            assert!(ssu_governance::is_frozen(&gov), 1);

            // Unfreeze as owner (owner override path — D-R3.5-03).
            ssu_governance::unfreeze_ssu_as_owner(&owner_cap, &mut gov, &clock, ts::ctx(&mut scenario));
            assert!(!ssu_governance::is_frozen(&gov), 2);

            // Cleanup
            gov_helpers::destroy_for_testing(gov);
            gov_helpers::destroy_owner_cap_for_testing(owner_cap);
            membership::destroy_ssu_super_admin_cap_for_testing(super_admin_cap);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 2: Cross-SSU identity bypass — gov_A used with ssu_id=B aborts E_SUBJECT_SSU_MISMATCH =====
    // CC-R3.5-02 FIX: rewritten to actually exercise E_SUBJECT_SSU_MISMATCH (12) at a real
    // cross-module call site. create_wts_shop takes both gov and ssu_id independently;
    // passing gov_A (SSU_A) + ssu_id=SSU_B triggers assert_subject_in_governance and aborts
    // with E_SUBJECT_SSU_MISMATCH — this is the real cross-SSU bypass vector.

    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_SUBJECT_SSU_MISMATCH)]
    fun test_cross_ssu_identity_bypass_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            // Gov A is for SSU_A.
            let gov_a = gov_helpers::create_for_testing(
                SSU_A, 0, TRIBE_ID, OWNER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ts::ctx(&mut scenario));

            // Attempt to create a shop for SSU_B using gov_A.
            // assert_subject_in_governance(gov_a, SSU_B) → SSU_A != SSU_B → E_SUBJECT_SSU_MISMATCH (12).
            let _shop_id = bazar::create_wts_shop(
                &mut registry,
                &gov_a,           // gov scoped to SSU_A
                &members,
                0, b"test",
                SSU_B,            // shop ssu_id = SSU_B — MISMATCH
                TRIBE_ID,
                vector[42u64], vector[1u64], vector[100u64],
                9999999u64, 0, 0, &clock, ts::ctx(&mut scenario),
            );

            // Unreachable — abort above.
            gov_helpers::destroy_for_testing(gov_a);
            test_utils::destroy(registry);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 3: Idempotent freeze — freeze when already frozen does NOT abort =====

    #[test]
    fun test_idempotent_freeze_does_not_abort() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let mut gov = gov_helpers::create_for_testing(
                SSU_A, 0, TRIBE_ID, OWNER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            let super_admin_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_A, ts::ctx(&mut scenario));

            // Freeze once.
            ssu_governance::freeze_ssu(&super_admin_cap, &mut gov, &clock, ts::ctx(&mut scenario));
            assert!(ssu_governance::is_frozen(&gov), 0);

            // Freeze again — must NOT abort (D-R3.5-02 / SA-R3-03).
            ssu_governance::freeze_ssu(&super_admin_cap, &mut gov, &clock, ts::ctx(&mut scenario));
            assert!(ssu_governance::is_frozen(&gov), 1);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_ssu_super_admin_cap_for_testing(super_admin_cap);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 3b: Idempotent unfreeze — unfreeze when already unfrozen does NOT abort =====
    // CC-R3.5-03 FIX: symmetric idempotent unfreeze; previously would have aborted.

    #[test]
    fun test_idempotent_unfreeze_does_not_abort() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let mut gov = gov_helpers::create_for_testing(
                SSU_A, 0, TRIBE_ID, OWNER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            let super_admin_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_A, ts::ctx(&mut scenario));

            // SSU starts unfrozen. Unfreeze again — must NOT abort (CC-R3.5-03).
            ssu_governance::unfreeze_ssu(&super_admin_cap, &mut gov, &clock, ts::ctx(&mut scenario));
            assert!(!ssu_governance::is_frozen(&gov), 0);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_ssu_super_admin_cap_for_testing(super_admin_cap);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 4: Owner override unfreeze — SuperAdmin freezes; Owner unfreezes =====

    #[test]
    fun test_owner_override_unfreeze() {
        let mut scenario = ts::begin(OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let mut gov = gov_helpers::create_for_testing(
                SSU_A, 0, TRIBE_ID, OWNER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            let owner_cap = gov_helpers::create_owner_cap_for_testing(SSU_A, TRIBE_ID, ts::ctx(&mut scenario));
            let super_admin_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_A, ts::ctx(&mut scenario));

            // SuperAdmin freezes.
            ssu_governance::freeze_ssu(&super_admin_cap, &mut gov, &clock, ts::ctx(&mut scenario));
            assert!(ssu_governance::is_frozen(&gov), 0);

            // Owner overrides — Owner outranks SuperAdmin (D-R3.5-03 / SA-R3-03).
            ssu_governance::unfreeze_ssu_as_owner(&owner_cap, &mut gov, &clock, ts::ctx(&mut scenario));
            assert!(!ssu_governance::is_frozen(&gov), 1);

            gov_helpers::destroy_for_testing(gov);
            gov_helpers::destroy_owner_cap_for_testing(owner_cap);
            membership::destroy_ssu_super_admin_cap_for_testing(super_admin_cap);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 5: shop_ops / bazar create_wts_shop frozen aborts =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_SSU_FROZEN)]
    fun test_shop_ops_frozen_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
            clock::set_for_testing(&mut clock, 1000);
            let mut gov = gov_helpers::create_for_testing(
                SSU_A, 0, TRIBE_ID, OWNER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            let super_admin_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_A, ts::ctx(&mut scenario));
            ssu_governance::freeze_ssu(&super_admin_cap, &mut gov, &clock, ts::ctx(&mut scenario));

            // Attempt to create a WTS shop while frozen — must abort E_SSU_FROZEN.
            let mut registry = bazar_test_accessors::create_registry_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_ID, ts::ctx(&mut scenario));
            let _shop_id = bazar::create_wts_shop(
                &mut registry, &gov, &members,
                0, b"test", SSU_A, TRIBE_ID,
                vector[42u64], vector[1u64], vector[100u64],
                9999999u64, 0, 0, &clock, ts::ctx(&mut scenario),
            );

            // Cleanup (unreachable due to abort)
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_ssu_super_admin_cap_for_testing(super_admin_cap);
            test_utils::destroy(registry);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 6: wtb_escrow_pool assert_not_frozen propagation =====
    // CC-R3.5-05 FIX: @0xSHOP replaced with valid hex literal @0x5409.

    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_SSU_FROZEN)]
    fun test_escrow_pool_frozen_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
            clock::set_for_testing(&mut clock, 1000);
            let mut gov = gov_helpers::create_for_testing(
                SSU_A, 0, TRIBE_ID, OWNER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            let super_admin_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_A, ts::ctx(&mut scenario));
            ssu_governance::freeze_ssu(&super_admin_cap, &mut gov, &clock, ts::ctx(&mut scenario));

            let mut pool = wtb_escrow_pool::create_for_testing(SSU_A, ts::ctx(&mut scenario));
            let shop_id = object::id_from_address(@0x5409); // CC-R3.5-05: valid hex literal
            let payment = sui::coin::zero<EVE::EVE::EVE>(ts::ctx(&mut scenario));
            // top_up_escrow must abort E_SSU_FROZEN.
            wtb_escrow_pool::top_up_escrow(&mut pool, &gov, shop_id, payment);

            // Cleanup (unreachable)
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_ssu_super_admin_cap_for_testing(super_admin_cap);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 8: quicktrade_vault deposit frozen aborts =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_SSU_FROZEN)]
    fun test_quicktrade_vault_frozen_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
            clock::set_for_testing(&mut clock, 1000);
            let mut gov = gov_helpers::create_for_testing(
                SSU_A, 0, TRIBE_ID, OWNER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            let super_admin_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_A, ts::ctx(&mut scenario));
            ssu_governance::freeze_ssu(&super_admin_cap, &mut gov, &clock, ts::ctx(&mut scenario));

            let mut vault = quicktrade_vault::create_vault_for_testing(SSU_A, ts::ctx(&mut scenario));
            // deposit_to_vault must abort E_SSU_FROZEN.
            quicktrade_vault::deposit_to_vault(&mut vault, &gov, vector[1u64], vector[1u64], &clock, ts::ctx(&mut scenario));

            // Cleanup (unreachable)
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_ssu_super_admin_cap_for_testing(super_admin_cap);
            test_utils::destroy(vault);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
