// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// tests/sources/test_tax_deposits.move
// Integration tests: Cross-package tax deposit correctness.
// Covers T-TAX-01 through T-TAX-07.
// Constitution: Article IV (tax flow), Article VIII (no dApp tax on ledger trades).
// Constitution: Article XII.3 — 500-line limit.
#[test_only]
module bazaar_integration_tests::test_tax_deposits {
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use sui::test_utils;
    use dapp_hub::tax_wallet;
    use dapp_hub::dapp_governance;
    use dapp_hub::tribe_registry;
    use bazaar_core::bazar;
    use bazaar_core::bazar_test_accessors;
    use bazaar_shop_ops::shop_ops_wts;
    use bazaar_shop_ops::shop_ops_de;
    use bazaar_shop_ops::shop_ops_cap_store;
    use bazaar_core::bazaar_core_admin;
    use bazaar_core::ssu_governance;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::ssu_role_tax_admin;
    use bazaar_mission::stranger_registration;
    use bazaar_core::tribe_governance;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_core::tribe_role_tax_admin;
    use bazaar_core::user_storage;
    use bazaar_core::membership;
    use bazaar_economy::ledger_shop_ops;
    use bazaar_economy::tribe_token_ledger;
    use bazaar_economy::economy_cap_store;
    use bazaar_economy::economy_governance;
    use bazaar_economy::tribe_exchange;
    use bazaar_economy::tribe_vault;

    // ===== Constants =====
    const SSU_ADDR: address = @0x55;
    const LEADER: address = @0x1EAD;
    const TRIBE_ID: u64 = 1;
    const PRICE: u64 = 10_000;
    const EXPIRY: u64 = 999_999_999;

    // ===== Helper: make_admin_with_cap =====
    // Creates a BazaarCoreAdmin with TaxDepositCap loaded.
    fun make_admin_with_cap(ctx: &mut TxContext):
        (bazaar_core_admin::BazaarCoreAdmin, dapp_governance::DAppOwnerCap)
    {
        let owner_cap = dapp_governance::create_owner_cap_for_testing(ctx);
        let tax_cap = tax_wallet::create_deposit_cap_for_testing(ctx);
        let mut admin = bazaar_core_admin::create_for_testing(ctx);
        bazaar_core_admin::receive_tax_deposit_cap(&owner_cap, &mut admin, tax_cap);
        (admin, owner_cap)
    }

    // ===== Helper: make_notribe_ssu_gov =====
    // Session 3B: writes uniform tax row to all 8 roles via set_ssu_tax_uniform.
    // Args named *_bps for historical continuity but values are now interpreted
    // as pct ×100 (mathematically identical — both denominators are 10_000).
    fun make_notribe_ssu_gov(
        wts_bps: u64, wtb_bps: u64, de_flat: u64,
        clock: &clock::Clock, ctx: &mut TxContext,
    ): ssu_governance::SSUGovernance {
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, 0, 0, SSU_ADDR, clock, ctx);
        let ssu_cap = membership::create_ssu_owner_cap_for_testing(SSU_ADDR, 0, ctx);
        ssu_role_tax_admin::set_ssu_tax_uniform(&ssu_cap, &mut gov, wts_bps, wtb_bps, de_flat, clock, ctx);
        test_utils::destroy(ssu_cap);
        gov
    }

    // ===== Helper: make_tribe_ssu_gov =====
    fun make_tribe_ssu_gov(
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

    // ===== Helper: make_tribe_gov =====
    fun make_tribe_gov(
        wts_bps: u64, wtb_bps: u64, de_flat: u64,
        clock: &clock::Clock, ctx: &mut TxContext,
    ): (tribe_governance::TribeGovernance, tribe_registry::TribeLeaderCap) {
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ctx);
        let mut gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, clock, ctx);
        tribe_role_tax_admin::set_tribe_tax_uniform(&leader_cap, &mut gov, wts_bps, wtb_bps, de_flat, clock, ctx);
        (gov, leader_cap)
    }

    // ===== Helper: make_loaded_cap_store =====
    // Creates a fully loaded EconomyCapStore (matches test_advanced_tribe_setup pattern).
    fun make_loaded_cap_store(ctx: &mut TxContext): economy_cap_store::EconomyCapStore {
        let tax_cap = tax_wallet::create_deposit_cap_for_testing(ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(@0x0, ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(ctx);
        let mut cap_store = economy_cap_store::create_for_testing(ctx);
        economy_governance::receive_tax_deposit_cap(&mut cap_store, tax_cap, &owner_cap);
        economy_governance::receive_shop_cap(&mut cap_store, shop_cap, &owner_cap);
        test_utils::destroy(owner_cap);
        cap_store
    }

    // ================================================================
    // T-TAX-01: test_notribe_wts_buy_tax_flow
    // 2-layer tax: SSU(500bps=5%) + DApp(200bps=2%) on 10_000 MIST
    // Expected: ssu_tax=500, dapp_tax=200, net=9_300, deposit_count=1
    // ================================================================
    #[test]
    fun test_notribe_wts_buy_tax_flow() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let (admin, owner_cap) = make_admin_with_cap(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut ssu_gov = make_notribe_ssu_gov(500, 0, 0, &clock, &mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, &mut ctx);
        let payment = coin::mint_for_testing<EVE>(PRICE, &mut ctx);

        let members = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);
        // CC2-B1-01: create_wts_shop demoted; NoTribe → create_wts_shop_notribe.
        let shop_id = bazar::create_wts_shop_notribe(
            &mut registry, &ssu_gov, &members, 0, b"Tax Test WTS", SSU_ADDR, 0,
            vector[1u64], vector[10u64], vector[PRICE],
            EXPIRY, 0, 0, &clock, &mut ctx,
        );
        shop_ops_wts::wts_buy_notribe(
            &mut registry, shop_id, 0, 1, payment, &mut ssu_gov, &admin,
            &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        test_utils::destroy(members);

        assert!(tax_wallet::balance(&wallet) == 200, 0);
        assert!(tax_wallet::deposit_count(&wallet) == 1, 1);
        assert!(ssu_governance::ssu_tax_balance(&ssu_gov) == 500, 2);

        test_utils::destroy(admin);
        test_utils::destroy(owner_cap);
        test_utils::destroy(wallet);
        test_utils::destroy(config);
        test_utils::destroy(ssu_gov);
        test_utils::destroy(registry);
        test_utils::destroy(cap_store);
        test_utils::destroy(storage);
        clock::destroy_for_testing(clock);
    }

    // ================================================================
    // T-TAX-02: test_easy_tribe_wts_buy_tax_flow
    // 3-layer tax: SSU(500bps) + Tribe(300bps) + DApp(200bps) on 10_000
    // Expected: ssu=500, tribe=300, dapp=200, net=9_000
    // ================================================================
    #[test]
    fun test_easy_tribe_wts_buy_tax_flow() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let (admin, owner_cap) = make_admin_with_cap(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut ssu_gov = make_tribe_ssu_gov(500, 0, 0, &clock, &mut ctx);
        let (mut tribe_gov, leader_cap) = make_tribe_gov(300, 0, 0, &clock, &mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, &mut ctx);
        let payment = coin::mint_for_testing<EVE>(PRICE, &mut ctx);

        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        // CC2-B1-01: Easy path → create_wts_shop_easy. tribe_gov in scope (line 169).
        let shop_id = bazar::create_wts_shop_easy(
            &mut registry, &ssu_gov, &tribe_gov, &members, 1, b"Tribe WTS", SSU_ADDR, TRIBE_ID,
            vector[1u64], vector[10u64], vector[PRICE],
            EXPIRY, 0, 0, &clock, &mut ctx,
        );
        shop_ops_wts::wts_buy_tribe(
            &mut registry, shop_id, 0, 1, payment, &mut ssu_gov, &mut tribe_gov,
            &admin, &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        test_utils::destroy(members);

        assert!(tax_wallet::balance(&wallet) == 200, 0);
        assert!(tax_wallet::deposit_count(&wallet) == 1, 1);
        assert!(ssu_governance::ssu_tax_balance(&ssu_gov) == 500, 2);
        assert!(tribe_governance::tribe_tax_balance(&tribe_gov) == 300, 3);

        test_utils::destroy(admin);
        test_utils::destroy(owner_cap);
        test_utils::destroy(wallet);
        test_utils::destroy(config);
        test_utils::destroy(ssu_gov);
        test_utils::destroy(tribe_gov);
        test_utils::destroy(leader_cap);
        test_utils::destroy(registry);
        test_utils::destroy(cap_store);
        test_utils::destroy(storage);
        clock::destroy_for_testing(clock);
    }

    // ================================================================
    // T-TAX-03: test_notribe_wtb_fill_tax_flow — DISABLED post-Phase-4 (2026-05-08).
    // The test invokes shop_ops_wtb::wtb_fill_notribe with the legacy 13-arg
    // signature. Phase 4 (single-PTB direct deposit) extended the signature to
    // require `ssu: &mut StorageUnit`, `items: vector<Item>`, and
    // `recipient_character: &Character` — none of which have a usable test-only
    // constructor accessible from the integration test package today.
    //
    // Tax-arithmetic correctness for the WTB-fill path is exercised by
    // BazaarCore's per-package unit tests (296/296 GREEN as of Phase 8).
    // Restoring an integration variant requires `#[test_only]` factories on
    // `world::storage_unit` + `world::character` (upstream EVE Frontier repos)
    // or a stub fixture in BazaarCore.
    //
    // Logged in Documentation/legacycode.md as EFP4-INT-L1.

    // ================================================================
    // T-TAX-04: test_easy_tribe_de_exchange_tax_flow
    // DE variant with flat fees. ssu_flat=1000, tribe_flat=500.
    // dApp tax = total_flat(1500) * 200bps / 10000 = 30
    // net_ssu = 1000 - 20 = 980, net_tribe = 500 - 10 = 490
    // ================================================================
    #[test]
    fun test_easy_tribe_de_exchange_tax_flow() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let (admin, owner_cap) = make_admin_with_cap(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut ssu_gov = make_tribe_ssu_gov(0, 0, 1000, &clock, &mut ctx);
        let (mut tribe_gov, leader_cap) = make_tribe_gov(0, 0, 500, &clock, &mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, &mut ctx);

        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        // CC2-B1-01: Easy DE path → create_de_shop_easy. tribe_gov in scope (line 232).
        let shop_id = bazar::create_de_shop_easy(
            &mut registry, &ssu_gov, &tribe_gov, &members, 1, b"Tax Test DE", SSU_ADDR, TRIBE_ID,
            vector[100u64], vector[5u64],
            vector[200u64], vector[3u64],
            vector[1u64],        // offer_per_lots (legacy 1:N ratio — 1 offered per lot)
            EXPIRY, 0, 0, &clock, &mut ctx,
        );
        // Payment must cover total_flat = (1000 + 500) × units(1) = 1500
        // (V31 partial DE added the `units` arg; flat fees are per offered unit)
        let fee_payment = coin::mint_for_testing<EVE>(1500, &mut ctx);
        shop_ops_de::de_exchange_tribe(
            &mut registry, shop_id, 0, 1, fee_payment, &mut ssu_gov, &mut tribe_gov,
            &admin, &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        test_utils::destroy(members);

        // dApp tax = 1500 * 200 / 10000 = 30
        assert!(tax_wallet::balance(&wallet) == 30, 0);
        assert!(tax_wallet::deposit_count(&wallet) == 1, 1);
        // net_ssu = 1000 - (1000 * 200 / 10000) = 1000 - 20 = 980
        assert!(ssu_governance::ssu_tax_balance(&ssu_gov) == 980, 2);
        // net_tribe = 500 - (500 * 200 / 10000) = 500 - 10 = 490
        assert!(tribe_governance::tribe_tax_balance(&tribe_gov) == 490, 3);

        test_utils::destroy(admin);
        test_utils::destroy(owner_cap);
        test_utils::destroy(wallet);
        test_utils::destroy(config);
        test_utils::destroy(ssu_gov);
        test_utils::destroy(tribe_gov);
        test_utils::destroy(leader_cap);
        test_utils::destroy(registry);
        test_utils::destroy(cap_store);
        test_utils::destroy(storage);
        clock::destroy_for_testing(clock);
    }

    // ================================================================
    // T-TAX-05: test_advanced_exchange_tax_flow
    // Confirms dApp tax on EVE side via swap_eve_to_tokens.
    // payment=10_000, dApp 200bps => dapp_tax=200, deposit_count=1
    // ================================================================
    #[test]
    fun test_advanced_exchange_tax_flow() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov  = tribe_governance::create_with_arbitrary_mode_for_testing(
            TRIBE_ID, 2, @0x0, 0, &clock, &mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        // reserve=0 so exchange is always mintable in bootstrap mode
        let mut ex_config = tribe_exchange::create_for_testing(TRIBE_ID, 0, &clock, &mut ctx);
        let cap_store = make_loaded_cap_store(&mut ctx);

        // Activate exchange (required — swap_eve_to_tokens asserts is_active)
        tribe_exchange::set_active_for_testing(&mut ex_config, true);

        // V28: tribe wallet must hold tokens before any EVE→token swap.
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, 1_000_000);
        // V28: vault must hold EVE > reserve (= 0) so available > 0.
        tribe_vault::fund_for_testing(&mut vault, 1_000_000, &mut ctx);

        let payment = coin::mint_for_testing<EVE>(10_000, &mut ctx);
        tribe_exchange::swap_eve_to_tokens(
            &mut ledger, &mut vault, &mut ex_config, &tribe_gov, payment,
            &mut wallet, &config, &cap_store, &clock, &mut ctx,
        );

        // dApp tax = 10_000 * 200 / 10_000 = 200
        assert!(tax_wallet::balance(&wallet) == 200, 0);
        assert!(tax_wallet::deposit_count(&wallet) == 1, 1);

        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(tribe_gov);
        test_utils::destroy(wallet);
        test_utils::destroy(config);
        test_utils::destroy(ledger);
        test_utils::destroy(vault);
        test_utils::destroy(ex_config);
        test_utils::destroy(cap_store);
        clock::destroy_for_testing(clock);
    }

    // ================================================================
    // T-TAX-06: test_ledger_wts_no_dapp_tax
    // Article VIII: NO dApp tax on internal ledger trades.
    // Calls ledger_wts_buy. DAppTaxWallet must remain untouched.
    // ================================================================
    #[test]
    fun test_ledger_wts_no_dapp_tax() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let cap_store = make_loaded_cap_store(&mut ctx);

        // ledger_wts_buy takes &SSUGovernance (immutable) — bazaar_type=2 (Advanced)
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, 2, TRIBE_ID, SSU_ADDR, &clock, &mut ctx);
        let mut tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);

        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        // Advanced WTS shop (bazaar_type=2)
        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        // CC2-B1-01: Advanced path → create_wts_shop_advanced (new entry wrapper, §A.3).
        let shop_id = bazar::create_wts_shop_advanced(
            &mut registry, &ssu_gov, &members, 2, b"Ledger WTS", SSU_ADDR, TRIBE_ID,
            vector[1u64], vector[10u64], vector[PRICE],
            EXPIRY, 0, 0, &clock, &mut ctx,
        );

        // Seed buyer balance — tx_context::dummy() sender is @0x0 by default
        let buyer = tx_context::sender(&ctx);
        tribe_token_ledger::mint_for_testing(&mut ledger, buyer, PRICE);

        // Session 3B: ledger_wts_buy now requires &MemberRegistry for per-role tax lookup.
        // V31 Registered-SSUs: tribe_gov is &mut (records per-SSU tribe tax).
        ledger_shop_ops::ledger_wts_buy(
            &mut registry, shop_id, 0, 1, &mut ledger, &ssu_gov, &mut tribe_gov,
            &members, &cap_store, &clock, &mut ctx,
        );
        test_utils::destroy(members);

        // No dApp tax deposited (Article VIII)
        assert!(tax_wallet::balance(&wallet) == 0, 0);
        assert!(tax_wallet::deposit_count(&wallet) == 0, 1);

        test_utils::destroy(wallet);
        test_utils::destroy(ledger);
        test_utils::destroy(cap_store);
        test_utils::destroy(ssu_gov);
        test_utils::destroy(tribe_gov);
        test_utils::destroy(registry);
        test_utils::destroy(storage);
        clock::destroy_for_testing(clock);
    }

    // ================================================================
    // T-TAX-07: test_zero_tax_deposit_skipped
    // 0% dApp tax rate => zero-value coin => coin::destroy_zero path
    // => DAppTaxWallet.deposit_count remains 0
    // ================================================================
    #[test]
    fun test_zero_tax_deposit_skipped() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let (admin, owner_cap) = make_admin_with_cap(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let mut config = dapp_governance::create_config_for_testing(&mut ctx);
        // Override to 0% dApp tax
        dapp_governance::set_global_dapp_tax_rate(&owner_cap, &mut config, 0);
        let mut ssu_gov = make_notribe_ssu_gov(500, 0, 0, &clock, &mut ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, &mut ctx);
        let payment = coin::mint_for_testing<EVE>(PRICE, &mut ctx);

        let members = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);
        // CC2-B1-01: NoTribe → create_wts_shop_notribe.
        let shop_id = bazar::create_wts_shop_notribe(
            &mut registry, &ssu_gov, &members, 0, b"Zero Tax WTS", SSU_ADDR, 0,
            vector[1u64], vector[10u64], vector[PRICE],
            EXPIRY, 0, 0, &clock, &mut ctx,
        );
        shop_ops_wts::wts_buy_notribe(
            &mut registry, shop_id, 0, 1, payment, &mut ssu_gov, &admin,
            &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        test_utils::destroy(members);

        // dApp tax wallet untouched — destroy_zero path triggered
        assert!(tax_wallet::balance(&wallet) == 0, 0);
        assert!(tax_wallet::deposit_count(&wallet) == 0, 1);
        // SSU tax still collected (500)
        assert!(ssu_governance::ssu_tax_balance(&ssu_gov) == 500, 2);

        test_utils::destroy(admin);
        test_utils::destroy(owner_cap);
        test_utils::destroy(wallet);
        test_utils::destroy(config);
        test_utils::destroy(ssu_gov);
        test_utils::destroy(registry);
        test_utils::destroy(cap_store);
        test_utils::destroy(storage);
        clock::destroy_for_testing(clock);
    }

    // ================================================================
    // T-TAX-08: test_per_role_differentiation_wts (Session 3B-followup)
    // Verifies per-role SSU tax differentiation at trade time:
    //   - Role 0 (Stranger) wts_pct = 0  → trade 1 SSU tax = 0
    //   - Role 1 (Member)   wts_pct = 1000 (= 10%) → trade 2 SSU tax = 1000
    // Same shop, same sender (@0x0), role flipped between trades via
    // stranger_registration + membership::set_ssu_role. DApp tax (200bps)
    // applies uniformly to both trades — proves role-keyed lookup fires
    // at the SSU layer specifically.
    // ================================================================
    #[test]
    fun test_per_role_differentiation_wts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let (admin, owner_cap) = make_admin_with_cap(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);

        // SSU gov: NoTribe, bazaar_type=0. Don't seed uniform tax — set per-role
        // explicitly. Role 0 left unset (= 0 default), role 1 = 1000 (10%).
        let mut ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, 0, 0, SSU_ADDR, &clock, &mut ctx);
        let ssu_cap = membership::create_ssu_owner_cap_for_testing(SSU_ADDR, 0, &mut ctx);
        ssu_role_tax_admin::set_ssu_role_tax(&ssu_cap, &mut ssu_gov, 1, 1000, 0, 0, &clock, &ctx);

        let mut registry = bazar_test_accessors::create_registry_for_testing(&mut ctx);
        let mut storage = user_storage::create_for_testing(SSU_ADDR, &mut ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, &mut ctx);
        let mut members = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);

        // Shop with basket qty 10 so two buys fit.
        // CC2-B1-01: NoTribe → create_wts_shop_notribe.
        let shop_id = bazar::create_wts_shop_notribe(
            &mut registry, &ssu_gov, &members, 0, b"Per-Role WTS", SSU_ADDR, 0,
            vector[1u64], vector[10u64], vector[PRICE],
            EXPIRY, 0, 0, &clock, &mut ctx,
        );

        // ===== Trade 1: buyer as Stranger (role 0, unregistered) =====
        let payment1 = coin::mint_for_testing<EVE>(PRICE, &mut ctx);
        shop_ops_wts::wts_buy_notribe(
            &mut registry, shop_id, 0, 1, payment1, &mut ssu_gov, &admin,
            &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        // SSU tax for Stranger = (10_000 * 0) / 10_000 = 0
        assert!(ssu_governance::ssu_tax_balance(&ssu_gov) == 0, 0);
        // DApp tax = (10_000 * 200) / 10_000 = 200
        assert!(tax_wallet::balance(&wallet) == 200, 1);

        // ===== Promote sender (@0x0) to Member role =====
        stranger_registration::register_stranger(&ssu_gov, &mut members, &clock, &mut ctx);
        membership::set_ssu_role(&ssu_cap, &mut members, tx_context::sender(&ctx), 1, &mut ctx);

        // ===== Trade 2: buyer as Member (role 1) =====
        let payment2 = coin::mint_for_testing<EVE>(PRICE, &mut ctx);
        shop_ops_wts::wts_buy_notribe(
            &mut registry, shop_id, 0, 1, payment2, &mut ssu_gov, &admin,
            &mut wallet, &config, &members, &mut storage, &cap_store, &clock, &mut ctx,
        );
        // SSU tax for Member = (10_000 * 1000) / 10_000 = 1000 (cumulative w/ trade 1's 0)
        assert!(ssu_governance::ssu_tax_balance(&ssu_gov) == 1000, 2);
        // DApp tax cumulative = 200 + 200 = 400; deposit_count = 2
        assert!(tax_wallet::balance(&wallet) == 400, 3);
        assert!(tax_wallet::deposit_count(&wallet) == 2, 4);

        test_utils::destroy(members);
        test_utils::destroy(ssu_cap);
        test_utils::destroy(admin);
        test_utils::destroy(owner_cap);
        test_utils::destroy(wallet);
        test_utils::destroy(config);
        test_utils::destroy(ssu_gov);
        test_utils::destroy(registry);
        test_utils::destroy(cap_store);
        test_utils::destroy(storage);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
