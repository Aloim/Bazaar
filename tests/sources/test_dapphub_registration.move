// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// tests/sources/test_dapphub_registration.move
// Integration tests: DappHub SSU registration and tribe application flow.
// Covers T-DH-01 through T-DH-06.
// V35 G1 repair: updated to the V31 configurable-fee ABI — register_ssu_notribe /
// create_easy_tribe now take (config, wallet, payment); apply_to_tribe escrows the
// join fee (escrow, config, payment); accept/reject_application settle/refund via
// (escrow [, tax_wallet]). All fees default 0 in create_config_for_testing, so
// coin::zero<EVE>() payments pass every fee gate.
// Constitution: Article XII.3 — 500-line limit.
#[test_only]
module bazaar_integration_tests::test_dapphub_registration {
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use dapp_hub::escrow_wallet;
    use dapp_hub::tribe_registry;
    use dapp_hub::ssu_registry;
    use dapp_hub::registration;
    use bazaar_integration_tests::test_helpers;
    // Phase 8 B4: register_ssu_notribe now requires the world OwnerCap<StorageUnit> proof.
    use world::access;
    use world::storage_unit::StorageUnit;

    // =========================================================
    // T-DH-01: Register SSU with NoTribe
    // =========================================================
    #[test]
    fun test_register_ssu_notribe() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);
        let mut registry = ssu_registry::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let ssu = test_helpers::ssu_addr();
        let owner_cap = access::create_owner_cap_for_testing<StorageUnit>(sui::object::id_from_address(ssu), &mut ctx);

        ssu_registry::register_ssu_notribe(
            &mut registry, &config, &mut wallet, coin::zero<EVE>(&mut ctx),
            &owner_cap, ssu, &clock, &mut ctx,
        );
        test_utils::destroy(owner_cap);

        assert!(ssu_registry::is_registered(&registry, ssu), 0);
        assert!(ssu_registry::ssu_count(&registry) == 1, 1);

        let reg = ssu_registry::registration(&registry, ssu);
        assert!(ssu_registry::ssu_bazaar_type(reg) == 0, 2);
        assert!(ssu_registry::ssu_tribe_id(reg) == 0, 3);

        test_utils::destroy(registry);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-DH-02: Duplicate SSU registration aborts
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 2, location = dapp_hub::ssu_registry)]
    fun test_register_ssu_notribe_duplicate_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);
        let mut registry = ssu_registry::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let ssu = test_helpers::ssu_addr();
        let owner_cap = access::create_owner_cap_for_testing<StorageUnit>(sui::object::id_from_address(ssu), &mut ctx);

        ssu_registry::register_ssu_notribe(
            &mut registry, &config, &mut wallet, coin::zero<EVE>(&mut ctx),
            &owner_cap, ssu, &clock, &mut ctx,
        );
        ssu_registry::register_ssu_notribe(
            &mut registry, &config, &mut wallet, coin::zero<EVE>(&mut ctx),
            &owner_cap, ssu, &clock, &mut ctx,
        );

        test_utils::destroy(owner_cap);
        test_utils::destroy(registry);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-DH-03: Create easy tribe and verify leader cap
    // =========================================================
    #[test]
    fun test_create_easy_tribe_and_get_cap() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);
        let mut registry = tribe_registry::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);

        let cap = tribe_registry::create_easy_tribe(
            &mut registry,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            b"AlphaTribe",
            b"Test tribe description",
            0,
            0,
            &clock,
            &mut ctx,
        );

        assert!(tribe_registry::cap_tribe_id(&cap) == 1, 0);
        assert!(tribe_registry::tribe_count(&registry) == 1, 1);

        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        assert!(tribe_registry::tribe_bazaar_type(tribe) == 1, 2);
        assert!(tribe_registry::tribe_is_active(tribe), 3);
        assert!(tribe_registry::tribe_member_count(tribe) == 0, 4);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-DH-04: Apply and accept registration
    // =========================================================
    #[test]
    fun test_apply_and_accept_registration() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);
        let mut tribe_reg = tribe_registry::create_for_testing(&mut ctx);
        let mut ssu_reg = ssu_registry::create_for_testing(&mut ctx);
        let mut queue = registration::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let mut escrow = escrow_wallet::create_for_testing(&mut ctx);
        let ssu = test_helpers::ssu_addr();

        let cap = tribe_registry::create_easy_tribe(
            &mut tribe_reg,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            b"BetaTribe",
            b"desc",
            0,
            0,
            &clock,
            &mut ctx,
        );
        let tribe_id = tribe_registry::cap_tribe_id(&cap);

        registration::apply_to_tribe(
            &mut queue,
            &mut escrow,
            &config,
            coin::zero<EVE>(&mut ctx),
            tribe_id,
            ssu,
            b"Please let me in",
            &clock,
            &mut ctx,
        );

        registration::accept_application(
            &cap,
            &mut queue,
            &mut escrow,
            &mut wallet,
            &mut tribe_reg,
            &mut ssu_reg,
            1,
            &clock,
            &mut ctx,
        );

        assert!(ssu_registry::is_registered(&ssu_reg, ssu), 0);
        let reg = ssu_registry::registration(&ssu_reg, ssu);
        assert!(ssu_registry::ssu_bazaar_type(reg) == 1, 1);
        assert!(ssu_registry::ssu_tribe_id(reg) == tribe_id, 2);

        let tribe = tribe_registry::tribe_by_id(&tribe_reg, tribe_id);
        assert!(tribe_registry::tribe_member_count(tribe) == 1, 3);

        // Row removed on accept; assert absence and zero count.
        assert!(!registration::has_application(&queue, 1), 4);
        assert!(registration::application_count(&queue) == 0, 5);

        test_utils::destroy(cap);
        test_utils::destroy(tribe_reg);
        test_utils::destroy(ssu_reg);
        test_utils::destroy(queue);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(escrow);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-DH-05: Reject application
    // =========================================================
    #[test]
    fun test_reject_application() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);
        let mut tribe_reg = tribe_registry::create_for_testing(&mut ctx);
        let mut queue = registration::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let mut escrow = escrow_wallet::create_for_testing(&mut ctx);
        let ssu = test_helpers::ssu_addr();

        let cap = tribe_registry::create_easy_tribe(
            &mut tribe_reg,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            b"GammaTribe",
            b"desc",
            0,
            0,
            &clock,
            &mut ctx,
        );
        let tribe_id = tribe_registry::cap_tribe_id(&cap);

        registration::apply_to_tribe(
            &mut queue,
            &mut escrow,
            &config,
            coin::zero<EVE>(&mut ctx),
            tribe_id,
            ssu,
            b"Application message",
            &clock,
            &mut ctx,
        );

        registration::reject_application(
            &cap,
            &mut queue,
            &mut escrow,
            1,
            &clock,
            &mut ctx,
        );

        // Row removed on reject; assert absence and zero count.
        assert!(!registration::has_application(&queue, 1), 0);
        assert!(registration::application_count(&queue) == 0, 1);

        test_utils::destroy(cap);
        test_utils::destroy(tribe_reg);
        test_utils::destroy(queue);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(escrow);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-DH-06: Wrong leader cap aborts accept_application
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 2, location = dapp_hub::registration)]
    fun test_wrong_leader_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);
        let mut tribe_reg = tribe_registry::create_for_testing(&mut ctx);
        let mut ssu_reg = ssu_registry::create_for_testing(&mut ctx);
        let mut queue = registration::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let mut escrow = escrow_wallet::create_for_testing(&mut ctx);
        let ssu = test_helpers::ssu_addr();

        let cap1 = tribe_registry::create_easy_tribe(
            &mut tribe_reg,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            b"Tribe One",
            b"desc",
            0,
            0,
            &clock,
            &mut ctx,
        );

        let cap2 = tribe_registry::create_easy_tribe(
            &mut tribe_reg,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            b"Tribe Two",
            b"desc",
            0,
            0,
            &clock,
            &mut ctx,
        );

        registration::apply_to_tribe(
            &mut queue,
            &mut escrow,
            &config,
            coin::zero<EVE>(&mut ctx),
            tribe_registry::cap_tribe_id(&cap1),
            ssu,
            b"Applying to tribe one",
            &clock,
            &mut ctx,
        );

        // Wrong cap — cap2 is for tribe 2, not tribe 1
        registration::accept_application(
            &cap2,
            &mut queue,
            &mut escrow,
            &mut wallet,
            &mut tribe_reg,
            &mut ssu_reg,
            1,
            &clock,
            &mut ctx,
        );

        test_utils::destroy(cap1);
        test_utils::destroy(cap2);
        test_utils::destroy(tribe_reg);
        test_utils::destroy(ssu_reg);
        test_utils::destroy(queue);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(escrow);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
