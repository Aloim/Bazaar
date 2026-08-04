// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
// tests/sources/test_ban_enforcement_entry.move
// Integration: production-entry ban enforcement (CC2-B1-02).
// Helper: membership::set_ban_for_testing (B1 rev2 §4.1).
//         ssu_governance::set_local_ban_for_testing (B1 rev2 §4.2).
// AUD rows: AUD-NT-08, AUD-NT-09.
#[test_only]
module bazaar_integration_tests::test_ban_enforcement_entry {
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use sui::test_utils;
    use dapp_hub::tax_wallet;
    use dapp_hub::dapp_governance;
    use bazaar_core::bazar;
    use bazaar_core::bazar_test_accessors;
    use bazaar_shop_ops::shop_ops_wts;
    use bazaar_shop_ops::shop_ops_de;
    use bazaar_shop_ops::shop_ops_cap_store;
    use bazaar_core::bazaar_core_admin;
    use bazaar_core::ssu_governance;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::ssu_role_tax_admin;
    use bazaar_core::user_storage;
    use bazaar_core::membership;

    const SENDER: address   = @0x0;   // tx_context::dummy() always returns @0x0
    const SSU_ADDR: address = @0x55;
    const PRICE: u64        = 10_000;
    const EXPIRY: u64       = 999_999_999;

    fun make_admin_with_cap(ctx: &mut TxContext):
        (bazaar_core_admin::BazaarCoreAdmin, dapp_governance::DAppOwnerCap)
    {
        let owner_cap = dapp_governance::create_owner_cap_for_testing(ctx);
        let tax_cap = tax_wallet::create_deposit_cap_for_testing(ctx);
        let mut admin = bazaar_core_admin::create_for_testing(ctx);
        bazaar_core_admin::receive_tax_deposit_cap(&owner_cap, &mut admin, tax_cap);
        (admin, owner_cap)
    }

    fun make_notribe_ssu_gov(
        wts_bps: u64, wtb_bps: u64, de_flat: u64,
        clock: &clock::Clock, ctx: &mut TxContext,
    ): ssu_governance::SSUGovernance {
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, 0, 0, SSU_ADDR, clock, ctx);
        let ssu_cap = membership::create_ssu_owner_cap_for_testing(SSU_ADDR, 0, ctx);
        ssu_role_tax_admin::set_ssu_tax_uniform(
            &ssu_cap, &mut gov, wts_bps, wtb_bps, de_flat, clock, ctx);
        test_utils::destroy(ssu_cap);
        gov
    }

    // BE-INT-01: wts_buy_notribe aborts E_PLAYER_BANNED=5 on static membership ban (AUD-NT-08).
    #[test]
    #[expected_failure(abort_code = 5, location = bazaar_shop_ops::shop_ops_wts)]
    fun be_int_01_wts_buy_notribe_static_ban_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let (admin, owner_cap) = make_admin_with_cap(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut ssu_gov = make_notribe_ssu_gov(500, 0, 0, &clock, &mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, &mut ctx);
        let mut members = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);
        membership::set_ban_for_testing(&mut members, SENDER, true);
        let shop_id = bazar::create_wts_shop_notribe(
            &mut registry, &ssu_gov, &members, 0, b"StaticBan WTS", SSU_ADDR, 0,
            vector[1u64], vector[10u64], vector[PRICE], EXPIRY, 0, 0, &clock, &mut ctx,
        );
        let payment = coin::mint_for_testing<EVE>(PRICE, &mut ctx);
        shop_ops_wts::wts_buy_notribe(
            &mut registry, shop_id, 0, 1, payment, &mut ssu_gov, &admin,
            &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        test_utils::destroy(members);
        test_utils::destroy(admin); test_utils::destroy(owner_cap);
        test_utils::destroy(wallet); test_utils::destroy(config);
        test_utils::destroy(ssu_gov); test_utils::destroy(registry);
        test_utils::destroy(storage); test_utils::destroy(cap_store); clock::destroy_for_testing(clock);
    }

    // BE-INT-02: wts_buy_notribe aborts E_PLAYER_BANNED=5 on active SSU timed ban (AUD-NT-09).
    #[test]
    #[expected_failure(abort_code = 5, location = bazaar_shop_ops::shop_ops_wts)]
    fun be_int_02_wts_buy_notribe_timed_ban_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let (admin, owner_cap) = make_admin_with_cap(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut ssu_gov = make_notribe_ssu_gov(500, 0, 0, &clock, &mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, &mut ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);
        let shop_id = bazar::create_wts_shop_notribe(
            &mut registry, &ssu_gov, &members, 0, b"TimedBan WTS", SSU_ADDR, 0,
            vector[1u64], vector[10u64], vector[PRICE], EXPIRY, 0, 0, &clock, &mut ctx,
        );
        ssu_governance::set_local_ban_for_testing(&mut ssu_gov, SENDER, 9_999_999_999_999);
        let payment = coin::mint_for_testing<EVE>(PRICE, &mut ctx);
        shop_ops_wts::wts_buy_notribe(
            &mut registry, shop_id, 0, 1, payment, &mut ssu_gov, &admin,
            &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        test_utils::destroy(members);
        test_utils::destroy(admin); test_utils::destroy(owner_cap);
        test_utils::destroy(wallet); test_utils::destroy(config);
        test_utils::destroy(ssu_gov); test_utils::destroy(registry);
        test_utils::destroy(storage); test_utils::destroy(cap_store); clock::destroy_for_testing(clock);
    }

    // BE-INT-03: de_exchange_notribe aborts E_PLAYER_BANNED=5 on static ban (AUD-NT-08/DE).
    #[test]
    #[expected_failure(abort_code = 5, location = bazaar_shop_ops::shop_ops_de)]
    fun be_int_03_de_exchange_notribe_static_ban_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let (admin, owner_cap) = make_admin_with_cap(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, 0, 0, SSU_ADDR, &clock, &mut ctx);
        let ssu_cap = membership::create_ssu_owner_cap_for_testing(SSU_ADDR, 0, &mut ctx);
        ssu_role_tax_admin::set_ssu_tax_uniform(
            &ssu_cap, &mut ssu_gov, 0, 0, 1000, &clock, &mut ctx);
        test_utils::destroy(ssu_cap);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, &mut ctx);
        let mut members = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);
        let shop_id = bazar::create_de_shop_notribe(
            &mut registry, &ssu_gov, &members, 0, b"StaticBan DE", SSU_ADDR, 0,
            vector[100u64], vector[5u64], vector[200u64], vector[3u64],
            vector[1u64],        // offer_per_lots (legacy 1:N ratio)
            EXPIRY, 0, 0, &clock, &mut ctx,
        );
        membership::set_ban_for_testing(&mut members, SENDER, true);
        let fee_payment = coin::mint_for_testing<EVE>(1000, &mut ctx);
        shop_ops_de::de_exchange_notribe(
            &mut registry, shop_id, 0, 1, fee_payment, &mut ssu_gov, &admin,
            &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        test_utils::destroy(members);
        test_utils::destroy(admin); test_utils::destroy(owner_cap);
        test_utils::destroy(wallet); test_utils::destroy(config);
        test_utils::destroy(ssu_gov); test_utils::destroy(registry);
        test_utils::destroy(storage); test_utils::destroy(cap_store); clock::destroy_for_testing(clock);
    }

    // BE-INT-04: wts_buy_notribe PASSES when sender has no ban. Regression guard.
    #[test]
    fun be_int_04_wts_buy_notribe_no_ban_passes() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let (admin, owner_cap) = make_admin_with_cap(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut ssu_gov = make_notribe_ssu_gov(500, 0, 0, &clock, &mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, &mut ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);
        let shop_id = bazar::create_wts_shop_notribe(
            &mut registry, &ssu_gov, &members, 0, b"NoBan WTS", SSU_ADDR, 0,
            vector[1u64], vector[10u64], vector[PRICE], EXPIRY, 0, 0, &clock, &mut ctx,
        );
        let payment = coin::mint_for_testing<EVE>(PRICE, &mut ctx);
        shop_ops_wts::wts_buy_notribe(
            &mut registry, shop_id, 0, 1, payment, &mut ssu_gov, &admin,
            &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        assert!(tax_wallet::deposit_count(&wallet) == 1, 0);
        test_utils::destroy(members);
        test_utils::destroy(admin); test_utils::destroy(owner_cap);
        test_utils::destroy(wallet); test_utils::destroy(config);
        test_utils::destroy(ssu_gov); test_utils::destroy(registry);
        test_utils::destroy(storage); test_utils::destroy(cap_store); clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
