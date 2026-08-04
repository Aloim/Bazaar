// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Tests for bazaar_core::ssu_rebind — deregister → re-register healing.
/// RBD-01 happy path: stale Easy/tribe binding syncs to fresh NoTribe registration.
/// RBD-02 no-op short-circuit: matching binding returns before shop/freeze guards.
/// RBD-03 unregistered SSU aborts E_SSU_NOT_REGISTERED.
/// RBD-04 registration owner != gov owner aborts E_OWNER_CHANGED.
/// RBD-05 active shops on the SSU abort E_ACTIVE_SHOPS_PRESENT.
/// RBD-06 wrong member registry aborts E_MEMBER_REGISTRY_MISMATCH.
#[test_only]
module bazaar_core::ssu_rebind_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock::{Self, Clock};
    use sui::coin;
    use sui::test_utils;
    use dapp_hub::ssu_registry::{Self, SSURegistry};
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use EVE::EVE::EVE;
    use bazaar_core::bazar;
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::membership::{Self, MemberRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_core::ssu_rebind;
    // Phase 8 B4: register_ssu_notribe now requires the world OwnerCap<StorageUnit> proof.
    use world::access;
    use world::storage_unit::StorageUnit;

    const SSU_ID: address   = @0xBEEF;
    const SSU_B: address    = @0xB0B0;
    const OWNER: address    = @0xCAFE;
    const STRANGER: address = @0xFACE;
    const OLD_TRIBE: u64    = 42;
    const EXPIRY: u64       = 9_999_999u64;

    /// Build an SSURegistry holding a NoTribe registration for `ssu` owned by
    /// the current tx sender (register_ssu_notribe derives owner from sender).
    fun registry_with_notribe_registration(ssu: address, clock: &Clock, ctx: &mut TxContext): SSURegistry {
        let mut registry = ssu_registry::create_for_testing(ctx);
        let config = dapp_governance::create_config_for_testing(ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
        let owner_cap = access::create_owner_cap_for_testing<StorageUnit>(sui::object::id_from_address(ssu), ctx);
        ssu_registry::register_ssu_notribe(&mut registry, &config, &mut wallet, coin::zero<EVE>(ctx), &owner_cap, ssu, clock, ctx);
        test_utils::destroy(owner_cap);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        registry
    }

    // ===== RBD-01: happy path — stale (Easy, 42) syncs to fresh (NoTribe, 0);
    // sender is a STRANGER to prove the permissionless-heal posture. =====
    #[test]
    fun rbd01_rebind_syncs_gov_and_members_to_current_registration() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            let registry = registry_with_notribe_registration(SSU_ID, &clock, ctx);
            ssu_registry::share_for_testing(registry);
            clock::destroy_for_testing(clock);
        };
        ts::next_tx(&mut scenario, STRANGER);
        {
            let registry = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            // Old binding from the pre-deregister era: Easy (1) / tribe 42.
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ID, 1, OLD_TRIBE, OWNER, &clock, ctx,
            );
            let mut members = membership::create_member_registry_for_testing(SSU_ID, OLD_TRIBE, ctx);
            let bazar_reg = bazar_test_accessors::create_registry_for_testing(ctx);

            ssu_rebind::rebind_ssu_governance(&registry, &bazar_reg, &mut gov, &mut members, &clock, ctx);

            assert!(ssu_governance::ssu_bazaar_type(&gov) == 0, 0);
            assert!(ssu_governance::ssu_tribe_id(&gov) == 0, 1);
            assert!(membership::tribe_id(&members) == 0, 2);
            // Owner untouched by the rebind.
            assert!(ssu_governance::ssu_owner(&gov) == OWNER, 3);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(bazar_reg);
            clock::destroy_for_testing(clock);
            ts::return_shared(registry);
        };
        ts::end(scenario);
    }

    // ===== RBD-02: no-op short-circuit — binding already matches, so the call
    // succeeds even with an active shop present (guard 6 is never reached). =====
    #[test]
    fun rbd02_matching_binding_is_noop_even_with_active_shops() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            let registry = registry_with_notribe_registration(SSU_ID, &clock, ctx);
            ssu_registry::share_for_testing(registry);
            clock::destroy_for_testing(clock);
        };
        ts::next_tx(&mut scenario, OWNER);
        {
            let registry = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            // Binding already matches the registration: NoTribe (0) / tribe 0.
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ID, 0, 0, OWNER, &clock, ctx,
            );
            let mut members = membership::create_member_registry_for_testing(SSU_ID, 0, ctx);
            let mut bazar_reg = bazar_test_accessors::create_registry_for_testing(ctx);
            // Active shop on the SSU — must NOT abort because the no-op path
            // returns before the active-shops guard.
            let _shop_id = bazar::create_wts_shop(
                &mut bazar_reg, &gov, &members,
                0u8, b"WTS-Active",
                SSU_ID, 0,
                vector[101u64], vector[1u64], vector[100u64],
                EXPIRY, 0, 0, &clock, ctx,
            );

            ssu_rebind::rebind_ssu_governance(&registry, &bazar_reg, &mut gov, &mut members, &clock, ctx);

            assert!(ssu_governance::ssu_bazaar_type(&gov) == 0, 0);
            assert!(ssu_governance::ssu_tribe_id(&gov) == 0, 1);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(bazar_reg);
            clock::destroy_for_testing(clock);
            ts::return_shared(registry);
        };
        ts::end(scenario);
    }

    // ===== RBD-03: SSU not registered → E_SSU_NOT_REGISTERED =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_rebind::E_SSU_NOT_REGISTERED)]
    fun rbd03_unregistered_ssu_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            // Empty registry — no registration row for SSU_ID.
            let registry = ssu_registry::create_for_testing(ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ID, 1, OLD_TRIBE, OWNER, &clock, ctx,
            );
            let mut members = membership::create_member_registry_for_testing(SSU_ID, OLD_TRIBE, ctx);
            let bazar_reg = bazar_test_accessors::create_registry_for_testing(ctx);

            ssu_rebind::rebind_ssu_governance(&registry, &bazar_reg, &mut gov, &mut members, &clock, ctx);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(bazar_reg);
            test_utils::destroy(registry);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== RBD-04: registration owner differs from gov owner → E_OWNER_CHANGED =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_rebind::E_OWNER_CHANGED)]
    fun rbd04_owner_changed_aborts() {
        // STRANGER registers the SSU (registration.owner = STRANGER), but the
        // existing governance belongs to OWNER → refuse the mixed-authority state.
        let mut scenario = ts::begin(STRANGER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            let registry = registry_with_notribe_registration(SSU_ID, &clock, ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ID, 1, OLD_TRIBE, OWNER, &clock, ctx,
            );
            let mut members = membership::create_member_registry_for_testing(SSU_ID, OLD_TRIBE, ctx);
            let bazar_reg = bazar_test_accessors::create_registry_for_testing(ctx);

            ssu_rebind::rebind_ssu_governance(&registry, &bazar_reg, &mut gov, &mut members, &clock, ctx);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(bazar_reg);
            test_utils::destroy(registry);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== RBD-05: active shop on the SSU + binding change → E_ACTIVE_SHOPS_PRESENT =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_rebind::E_ACTIVE_SHOPS_PRESENT)]
    fun rbd05_active_shops_abort_binding_change() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            let registry = registry_with_notribe_registration(SSU_ID, &clock, ctx);
            // Old binding NoTribe (0) / tribe 42 — differs from registration (0, 0).
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ID, 0, OLD_TRIBE, OWNER, &clock, ctx,
            );
            let mut members = membership::create_member_registry_for_testing(SSU_ID, OLD_TRIBE, ctx);
            let mut bazar_reg = bazar_test_accessors::create_registry_for_testing(ctx);
            // Active shop created under the OLD binding.
            let _shop_id = bazar::create_wts_shop(
                &mut bazar_reg, &gov, &members,
                0u8, b"WTS-Blocker",
                SSU_ID, OLD_TRIBE,
                vector[101u64], vector[1u64], vector[100u64],
                EXPIRY, 0, 0, &clock, ctx,
            );

            ssu_rebind::rebind_ssu_governance(&registry, &bazar_reg, &mut gov, &mut members, &clock, ctx);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(bazar_reg);
            test_utils::destroy(registry);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== RBD-06: member registry for a different SSU → E_MEMBER_REGISTRY_MISMATCH =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_rebind::E_MEMBER_REGISTRY_MISMATCH)]
    fun rbd06_wrong_member_registry_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            let registry = registry_with_notribe_registration(SSU_ID, &clock, ctx);
            let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ID, 1, OLD_TRIBE, OWNER, &clock, ctx,
            );
            // Member registry belongs to a DIFFERENT SSU.
            let mut members = membership::create_member_registry_for_testing(SSU_B, OLD_TRIBE, ctx);
            let bazar_reg = bazar_test_accessors::create_registry_for_testing(ctx);

            ssu_rebind::rebind_ssu_governance(&registry, &bazar_reg, &mut gov, &mut members, &clock, ctx);

            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(bazar_reg);
            test_utils::destroy(registry);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
