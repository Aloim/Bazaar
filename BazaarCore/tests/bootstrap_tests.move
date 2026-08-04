// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::bootstrap_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use dapp_hub::ssu_registry::{Self, SSURegistry};
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use EVE::EVE::EVE;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_bootstrap;
    use bazaar_core::user_storage::UserStorage;
    use bazaar_core::membership::SSUOwnerCap;
    // Phase 8 B4: register_ssu_notribe now requires the world OwnerCap<StorageUnit> proof.
    use world::access;
    use world::storage_unit::StorageUnit;

    const SSU_ID: address       = @0xBEEF;
    const OWNER: address        = @0xCAFE;
    const TRIBE_LEADER: address = @0xDEAD;
    const TRIBE_ID: u64         = 42;
    const BAZAAR_TYPE: u8       = 1; // Easy

    // ===== BST-01: Happy path — register then bootstrap succeeds =====
    // The SSU owner (OWNER) registers the SSU (so registered_owner = OWNER).
    // TRIBE_LEADER then calls bootstrap_ssu_objects with owner = OWNER — matches.
    // Verifies all per-SSU objects are created and cap lands with OWNER.
    #[test]
    fun bst01_bootstrap_ssu_objects_shares_governance_and_storage_and_transfers_cap() {
        let mut scenario = ts::begin(OWNER);

        // Step 1: OWNER registers their SSU (registered_owner = OWNER).
        {
            let ctx = ts::ctx(&mut scenario);
            let mut registry = ssu_registry::create_for_testing(ctx);
            let clock = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
            let owner_cap_b = access::create_owner_cap_for_testing<StorageUnit>(sui::object::id_from_address(SSU_ID), ctx);
            ssu_registry::register_ssu_notribe(&mut registry, &config, &mut wallet, coin::zero<EVE>(ctx), &owner_cap_b, SSU_ID, &clock, ctx);
            test_utils::destroy(owner_cap_b);
            test_utils::destroy(config);
            test_utils::destroy(wallet);
            clock::destroy_for_testing(clock);
            // Share the registry so subsequent transactions can access it.
            ssu_registry::share_for_testing(registry);
        };

        // Step 2: TRIBE_LEADER calls bootstrap_ssu_objects with owner = OWNER.
        ts::next_tx(&mut scenario, TRIBE_LEADER);
        {
            let mut registry = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            ssu_bootstrap::bootstrap_ssu_objects(
                &mut registry,
                SSU_ID,
                BAZAAR_TYPE,
                TRIBE_ID,
                OWNER,                @bazaar_core,
                &clock,
                ctx,
            );
            clock::destroy_for_testing(clock);
            ts::return_shared(registry);
        };

        // Step 3: verify SSUGovernance is shared.
        ts::next_tx(&mut scenario, OWNER);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            assert!(ssu_governance::ssu_id(&gov) == SSU_ID, 0);
            assert!(ssu_governance::ssu_tribe_id(&gov) == TRIBE_ID, 1);
            assert!(ssu_governance::ssu_bazaar_type(&gov) == BAZAAR_TYPE, 2);
            assert!(ssu_governance::ssu_owner(&gov) == OWNER, 3);
            assert!(ssu_governance::ssu_is_active(&gov), 4);
            // Issue 4: verify quicktrade_vault_id is non-zero (populated by bootstrap).
            let qvault_id = ssu_governance::ssu_quicktrade_vault_id(&gov);
            assert!(qvault_id != object::id_from_address(@0x0), 5);
            ts::return_shared(gov);
        };

        // Step 4: verify UserStorage is shared.
        {
            let storage = ts::take_shared<UserStorage>(&scenario);
            assert!(bazaar_core::user_storage::ssu_id(&storage) == SSU_ID, 5);
            ts::return_shared(storage);
        };

        // Step 5: verify SSUOwnerCap landed in OWNER's inventory.
        {
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, OWNER);
            assert!(bazaar_core::membership::cap_ssu_id(&cap) == SSU_ID, 6);
            ts::return_to_address(OWNER, cap);
        };

        // Step 6: verify is_bootstrapped returns true post-bootstrap.
        {
            let registry = ts::take_shared<SSURegistry>(&scenario);
            assert!(ssu_registry::is_bootstrapped(&registry, SSU_ID), 7);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // ===== BST-02: Unregistered ssu_id aborts E_SSU_NOT_REGISTERED =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_bootstrap::E_SSU_NOT_REGISTERED)]
    fun bst02_bootstrap_unregistered_ssu_aborts() {
        let mut scenario = ts::begin(OWNER);

        // Step 1: create a registry but do NOT register SSU_ID.
        {
            let ctx = ts::ctx(&mut scenario);
            let registry = ssu_registry::create_for_testing(ctx);
            ssu_registry::share_for_testing(registry);
        };

        // Step 2: attempt bootstrap with unregistered ssu_id — must abort.
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut registry = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            ssu_bootstrap::bootstrap_ssu_objects(
                &mut registry,
                SSU_ID,     // NOT registered
                BAZAAR_TYPE,
                TRIBE_ID,
                OWNER,                @bazaar_core,
                &clock,
                ctx,
            );
            clock::destroy_for_testing(clock);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // ===== BST-03: Wrong owner aborts E_OWNER_MISMATCH =====
    // TRIBE_LEADER registers SSU_ID (so registered_owner = TRIBE_LEADER).
    // Bootstrap call passes owner = OWNER — mismatch → abort.
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_bootstrap::E_OWNER_MISMATCH)]
    fun bst03_bootstrap_wrong_owner_aborts() {
        let mut scenario = ts::begin(TRIBE_LEADER);

        // Step 1: TRIBE_LEADER registers SSU_ID → registered_owner = TRIBE_LEADER.
        {
            let ctx = ts::ctx(&mut scenario);
            let mut registry = ssu_registry::create_for_testing(ctx);
            let clock = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
            let owner_cap_b = access::create_owner_cap_for_testing<StorageUnit>(sui::object::id_from_address(SSU_ID), ctx);
            ssu_registry::register_ssu_notribe(&mut registry, &config, &mut wallet, coin::zero<EVE>(ctx), &owner_cap_b, SSU_ID, &clock, ctx);
            test_utils::destroy(owner_cap_b);
            test_utils::destroy(config);
            test_utils::destroy(wallet);
            clock::destroy_for_testing(clock);
            ssu_registry::share_for_testing(registry);
        };

        // Step 2: attempt bootstrap with owner = OWNER (not TRIBE_LEADER) — must abort.
        ts::next_tx(&mut scenario, TRIBE_LEADER);
        {
            let mut registry = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            ssu_bootstrap::bootstrap_ssu_objects(
                &mut registry,
                SSU_ID,
                BAZAAR_TYPE,
                TRIBE_ID,
                OWNER,      // mismatch: registered owner is TRIBE_LEADER
                @bazaar_core,
                &clock,
                ctx,
            );
            clock::destroy_for_testing(clock);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // ===== BST-04: Re-bootstrap same ssu_id aborts E_ALREADY_BOOTSTRAPPED =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_bootstrap::E_ALREADY_BOOTSTRAPPED)]
    fun bst04_rebootstrap_same_ssu_aborts() {
        let mut scenario = ts::begin(OWNER);

        // Step 1: OWNER registers SSU_ID.
        {
            let ctx = ts::ctx(&mut scenario);
            let mut registry = ssu_registry::create_for_testing(ctx);
            let clock = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
            let owner_cap_b = access::create_owner_cap_for_testing<StorageUnit>(sui::object::id_from_address(SSU_ID), ctx);
            ssu_registry::register_ssu_notribe(&mut registry, &config, &mut wallet, coin::zero<EVE>(ctx), &owner_cap_b, SSU_ID, &clock, ctx);
            test_utils::destroy(owner_cap_b);
            test_utils::destroy(config);
            test_utils::destroy(wallet);
            clock::destroy_for_testing(clock);
            ssu_registry::share_for_testing(registry);
        };

        // Step 2: first bootstrap succeeds.
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut registry = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            ssu_bootstrap::bootstrap_ssu_objects(
                &mut registry, SSU_ID, BAZAAR_TYPE, TRIBE_ID, OWNER, @bazaar_core, &clock, ctx,
            );
            clock::destroy_for_testing(clock);
            ts::return_shared(registry);
        };

        // Step 3: second bootstrap must abort E_ALREADY_BOOTSTRAPPED.
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut registry = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            ssu_bootstrap::bootstrap_ssu_objects(
                &mut registry, SSU_ID, BAZAAR_TYPE, TRIBE_ID, OWNER, @bazaar_core, &clock, ctx,
            );
            clock::destroy_for_testing(clock);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // ===== BST-05: Happy path — verify is_bootstrapped true post-bootstrap =====
    // Standalone verification test isolating the state flag check.
    #[test]
    fun bst05_is_bootstrapped_true_after_bootstrap() {
        let mut scenario = ts::begin(OWNER);

        // Step 1: register SSU_ID as OWNER.
        {
            let ctx = ts::ctx(&mut scenario);
            let mut registry = ssu_registry::create_for_testing(ctx);
            let clock = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
            let owner_cap_b = access::create_owner_cap_for_testing<StorageUnit>(sui::object::id_from_address(SSU_ID), ctx);
            ssu_registry::register_ssu_notribe(&mut registry, &config, &mut wallet, coin::zero<EVE>(ctx), &owner_cap_b, SSU_ID, &clock, ctx);
            test_utils::destroy(owner_cap_b);
            test_utils::destroy(config);
            test_utils::destroy(wallet);

            // Verify not yet bootstrapped.
            assert!(!ssu_registry::is_bootstrapped(&registry, SSU_ID), 0);

            clock::destroy_for_testing(clock);
            ssu_registry::share_for_testing(registry);
        };

        // Step 2: bootstrap.
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut registry = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            ssu_bootstrap::bootstrap_ssu_objects(
                &mut registry, SSU_ID, BAZAAR_TYPE, TRIBE_ID, OWNER, @bazaar_core, &clock, ctx,
            );
            clock::destroy_for_testing(clock);
            ts::return_shared(registry);
        };

        // Step 3: verify is_bootstrapped is now true.
        ts::next_tx(&mut scenario, OWNER);
        {
            let registry = ts::take_shared<SSURegistry>(&scenario);
            assert!(ssu_registry::is_bootstrapped(&registry, SSU_ID), 1);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // ===== BST-06: NoTribe path — register notribe, bootstrap as sender =====
    // Verifies the canonical NoTribe flow: permissionless register + bootstrap by same owner.
    #[test]
    fun bst06_notribe_register_then_bootstrap_succeeds() {
        let mut scenario = ts::begin(OWNER);

        // Step 1: OWNER registers via notribe path (owner = OWNER = sender).
        {
            let ctx = ts::ctx(&mut scenario);
            let mut registry = ssu_registry::create_for_testing(ctx);
            let clock = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
            let owner_cap_b = access::create_owner_cap_for_testing<StorageUnit>(sui::object::id_from_address(SSU_ID), ctx);
            ssu_registry::register_ssu_notribe(&mut registry, &config, &mut wallet, coin::zero<EVE>(ctx), &owner_cap_b, SSU_ID, &clock, ctx);
            test_utils::destroy(owner_cap_b);
            test_utils::destroy(config);
            test_utils::destroy(wallet);
            clock::destroy_for_testing(clock);
            ssu_registry::share_for_testing(registry);
        };

        // Step 2: OWNER bootstraps — owner = OWNER matches registered owner.
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut registry = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            ssu_bootstrap::bootstrap_ssu_objects(
                &mut registry,
                SSU_ID,
                0,          // bazaar_type = NoTribe
                0,          // tribe_id = 0 (NoTribe)
                OWNER,                @bazaar_core,
                &clock,
                ctx,
            );
            clock::destroy_for_testing(clock);
            ts::return_shared(registry);
        };

        // Step 3: verify bootstrapped + cap in OWNER's wallet.
        ts::next_tx(&mut scenario, OWNER);
        {
            let registry = ts::take_shared<SSURegistry>(&scenario);
            assert!(ssu_registry::is_bootstrapped(&registry, SSU_ID), 0);
            ts::return_shared(registry);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, OWNER);
            assert!(bazaar_core::membership::cap_ssu_id(&cap) == SSU_ID, 1);
            ts::return_to_address(OWNER, cap);
        };

        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
