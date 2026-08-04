// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// tests/sources/test_bazaar_type_guards.move
// Integration tests: bazaar-type entry-point guards (Systems Audit Phase 5, C-A1).
// Verifies the NoTribe trade entries reject a non-NoTribe (Easy) SSUGovernance,
// so per-type DApp-tax divergence cannot be arbitraged by calling the cheaper
// NoTribe entry against an Easy shop. Fix ref: AUD-DH-01 / Phase 5 C-A1.
// Constitution: Article XII.3 — 500-line limit.
#[test_only]
module bazaar_integration_tests::test_bazaar_type_guards {
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use sui::test_utils;
    use dapp_hub::tax_wallet;
    use dapp_hub::dapp_governance;
    use bazaar_core::bazar;
    use bazaar_core::bazar_test_accessors;
    use bazaar_shop_ops::shop_ops_wts;
    use bazaar_shop_ops::shop_ops_cap_store;
    use bazaar_core::bazaar_core_admin;
    use bazaar_core::ssu_governance;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::ssu_role_tax_admin;
    use bazaar_core::user_storage;
    use bazaar_core::membership;
    use bazaar_core::tribe_governance_test_helpers;

    const SSU_ADDR: address = @0x55;
    const TRIBE_ID: u64 = 1;
    const PRICE: u64 = 10_000;
    const EXPIRY: u64 = 999_999_999;

    // Local: BazaarCoreAdmin loaded with a TaxDepositCap (clone of the T-TAX fixture).
    fun make_admin_with_cap(ctx: &mut TxContext):
        (bazaar_core_admin::BazaarCoreAdmin, dapp_governance::DAppOwnerCap)
    {
        let owner_cap = dapp_governance::create_owner_cap_for_testing(ctx);
        let tax_cap = tax_wallet::create_deposit_cap_for_testing(ctx);
        let mut admin = bazaar_core_admin::create_for_testing(ctx);
        bazaar_core_admin::receive_tax_deposit_cap(&owner_cap, &mut admin, tax_cap);
        (admin, owner_cap)
    }

    // Local: Easy-typed SSUGovernance (bazaar_type = 1) — the wrong target for a NoTribe entry.
    fun make_easy_ssu_gov(
        wts_bps: u64, wtb_bps: u64, de_flat: u64,
        clock: &clock::Clock, ctx: &mut TxContext,
    ): ssu_governance::SSUGovernance {
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, 1, TRIBE_ID, SSU_ADDR, clock, ctx);
        let ssu_cap = membership::create_ssu_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, ctx);
        ssu_role_tax_admin::set_ssu_tax_uniform(&ssu_cap, &mut gov, wts_bps, wtb_bps, de_flat, clock, ctx);
        test_utils::destroy(ssu_cap);
        gov
    }

    // ================================================================
    // BA-10 (C-A1): wts_buy_notribe against an Easy SSU aborts E_WRONG_BAZAAR_TYPE (11).
    // The abort MUST originate from the production assert in bazaar_shop_ops::shop_ops_wts
    // (location pin) — the test body itself never aborts with code 11.
    // ================================================================
    #[test]
    #[expected_failure(abort_code = 11, location = bazaar_shop_ops::shop_ops_wts)]
    fun test_notribe_fn_rejects_easy_shop() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let (admin, owner_cap) = make_admin_with_cap(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut ssu_gov = make_easy_ssu_gov(500, 0, 0, &clock, &mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, &mut ctx);
        let payment = coin::mint_for_testing<EVE>(PRICE, &mut ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        // CC2-B1-01: create_wts_shop demoted; Easy shop requires create_wts_shop_easy + tribe_gov.
        // This tribe_gov is a bare fixture — the test only needs the shop to exist.
        let tribe_gov_guard = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 1, SSU_ADDR, 0, &clock, &mut ctx,
        );
        // CC2-B1-01: Easy SSU → create_wts_shop_easy with tribe_gov_guard.
        let shop_id = bazar::create_wts_shop_easy(
            &mut registry, &ssu_gov, &tribe_gov_guard, &members, 1, b"Easy WTS", SSU_ADDR, TRIBE_ID,
            vector[1u64], vector[10u64], vector[PRICE],
            EXPIRY, 0, 0, &clock, &mut ctx,
        );
        // C-A1: NoTribe entry against an Easy SSU must abort E_WRONG_BAZAAR_TYPE.
        shop_ops_wts::wts_buy_notribe(
            &mut registry, shop_id, 0, 1, payment, &mut ssu_gov, &admin,
            &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        // Unreachable at runtime (the call above aborts); present so the bytecode
        // verifier sees every non-droppable resource consumed on the static path.
        test_utils::destroy(tribe_gov_guard);
        test_utils::destroy(members);
        test_utils::destroy(admin);
        test_utils::destroy(owner_cap);
        test_utils::destroy(wallet);
        test_utils::destroy(config);
        test_utils::destroy(ssu_gov);
        test_utils::destroy(registry);
        test_utils::destroy(storage);
        test_utils::destroy(cap_store);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
