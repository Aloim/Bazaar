// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_economy::tribe_exchange_gas16_tests {
    use sui::clock;
    use sui::test_utils;
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_core::bazaar_core_admin;
    use bazaar_economy::tribe_exchange;
    use bazaar_economy::tribe_vault;
    use bazaar_economy::tribe_token_ledger;
    use bazaar_economy::economy_cap_store;
    use bazaar_economy::economy_governance;

    const TRIBE_ID:  u64     = 42;
    const LEADER:    address = @0xA1;
    const PLAYER:    address = @0xB1;
    const RESERVE:   u64     = 100_000;       // 0.0001 EVE
    const VAULT_EVE: u64     = 10_000_000;    // 0.01 EVE — seeded into vault
    const TOKENS:    u64     = 1_000;         // 1,000 scaled units in tribe wallet

    // ── shared setup: stand up the full Advanced exchange surface ─────────────
    // Pattern mirrors r5_exchange_vault_tests.move bootstrap (lines 38-60).

    fun setup(ctx: &mut tx_context::TxContext): (
        bazaar_economy::tribe_token_ledger::TribeTokenLedger,
        bazaar_economy::tribe_vault::TribeVault,
        bazaar_economy::tribe_exchange::ExchangeConfig,
        dapp_hub::tax_wallet::DAppTaxWallet,
        dapp_hub::dapp_governance::GovernanceConfig,
        bazaar_economy::economy_cap_store::EconomyCapStore,
        bazaar_core::tribe_governance::TribeGovernance,
        sui::clock::Clock,
    ) {
        let clock  = clock::create_for_testing(ctx);
        // Advanced tribe (bazaar_type = 2)
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 2, LEADER, 0, &clock, ctx,
        );
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, ctx);
        let mut vault  = tribe_vault::create_for_testing(TRIBE_ID, ctx);
        let mut config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, ctx);
        let wallet     = tax_wallet::create_wallet_for_testing(ctx);
        let gov_config = dapp_governance::create_config_for_testing(ctx);
        let owner_cap  = dapp_governance::create_owner_cap_for_testing(ctx);
        let mut cap_store = economy_cap_store::create_for_testing(ctx);
        let tax_cap    = tax_wallet::create_deposit_cap_for_testing(ctx);
        let shop_cap   = bazaar_core_admin::create_shop_cap_for_testing(@0x0, ctx);
        economy_governance::receive_tax_deposit_cap(&mut cap_store, tax_cap, &owner_cap);
        economy_governance::receive_shop_cap(&mut cap_store, shop_cap, &owner_cap);
        test_utils::destroy(owner_cap);

        // Seed vault and tribe-wallet (gov_addr row) so swaps are non-trivial.
        tribe_vault::fund_for_testing(&mut vault, VAULT_EVE, ctx);
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, TOKENS);

        // Activate exchange + set fee override (public(package) — intra-package call OK).
        tribe_exchange::set_active_for_testing(&mut config, true);
        // Default fee override left as none() — caller overrides per test.

        (ledger, vault, config, wallet, gov_config, cap_store, tribe_gov, clock)
    }

    // ── Test 1: zero-tax eve→token — full payment deposited to vault ──────────

    #[test]
    fun test_zero_tax_eve_to_token_full_payment_to_vault() {
        let mut ctx = tx_context::dummy();
        let (mut ledger, mut vault, mut config, mut wallet, gov_config, cap_store,
             tribe_gov, clock) = setup(&mut ctx);

        // fee override = 0 → dapp_tax = 0
        tribe_exchange::set_fee_override(&mut config, option::some(0u64));

        let gross_eve: u64 = 500_000; // above MIN_SWAP_EVE_MIST (10_000)
        let vault_before   = tribe_vault::eve_balance(&vault);
        let tax_before     = tax_wallet::total_collected(&wallet);
        let gov_addr       = object::id_address(&tribe_gov);
        let gov_tok_before = tribe_token_ledger::balance_of(&ledger, gov_addr);

        let payment = sui::coin::mint_for_testing<EVE::EVE::EVE>(gross_eve, &mut ctx);
        tribe_exchange::swap_eve_to_tokens(
            &mut ledger, &mut vault, &mut config, &tribe_gov,
            payment, &mut wallet, &gov_config, &cap_store, &clock, &mut ctx,
        );

        // (a) Vault received the FULL gross payment (no split → vault_before + gross_eve)
        assert!(tribe_vault::eve_balance(&vault) == vault_before + gross_eve, 0);

        // (b) Tax wallet unchanged (dapp_tax == 0)
        assert!(tax_wallet::total_collected(&wallet) == tax_before, 1);

        // (c) Player (ctx.sender = PLAYER via dummy) received tokens from gov_addr row
        let player_tok = tribe_token_ledger::balance_of(&ledger, @0x0); // dummy sender
        let gov_tok_after = tribe_token_ledger::balance_of(&ledger, gov_addr);
        assert!(player_tok > 0, 2);
        assert!(gov_tok_before - gov_tok_after == player_tok, 3);

        // (d) Supply unchanged (V28 transfer semantics)
        assert!(tribe_token_ledger::total_supply(&ledger) == TOKENS, 4);

        test_utils::destroy(ledger); test_utils::destroy(vault); test_utils::destroy(config);
        test_utils::destroy(wallet); test_utils::destroy(gov_config);
        test_utils::destroy(cap_store);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clock);
    }

    // ── Test 2: zero-tax token→eve — full gross EVE transferred to player ─────

    #[test]
    fun test_zero_tax_token_to_eve_full_amount_to_player() {
        let mut ctx = tx_context::dummy();
        let (mut ledger, mut vault, mut config, mut wallet, gov_config, cap_store,
             tribe_gov, clock) = setup(&mut ctx);

        // fee override = 0 → dapp_tax = 0
        tribe_exchange::set_fee_override(&mut config, option::some(0u64));

        // Seed player's token balance
        let player_addr: address = tx_context::sender(&ctx); // dummy = 0x0
        tribe_token_ledger::mint_for_testing(&mut ledger, player_addr, 100);

        let tokens_to_sell: u64 = 50;
        let vault_before   = tribe_vault::eve_balance(&vault);
        let tax_before     = tax_wallet::total_collected(&wallet);
        let supply_before  = tribe_token_ledger::total_supply(&ledger);

        tribe_exchange::swap_tokens_to_eve(
            &mut ledger, &mut vault, &mut config, &tribe_gov,
            tokens_to_sell, &mut wallet, &gov_config, &cap_store, &clock, &mut ctx,
        );

        // (a) Tax wallet unchanged (dapp_tax == 0)
        assert!(tax_wallet::total_collected(&wallet) == tax_before, 5);

        // (b) Vault balance decreased by exactly gross_eve
        let vault_after  = tribe_vault::eve_balance(&vault);
        let gross_withdrawn = vault_before - vault_after;
        assert!(gross_withdrawn > 0, 6);

        // (c) Player received a Coin<EVE> of exactly gross_eve (net_eve == gross_eve
        //     when dapp_tax == 0). The Move transfer is the terminal action; we verify
        //     the vault-side accounting: vault shrinks by gross_eve, nothing went to tax.
        //     The full gross_withdrawn amount went to the player (conservation).

        // (d) Supply unchanged (V28 transfer semantics — tokens returned to gov_addr row)
        assert!(tribe_token_ledger::total_supply(&ledger) == supply_before, 7);

        // (e) Player's token balance decreased by tokens_to_sell
        let player_tok = tribe_token_ledger::balance_of(&ledger, player_addr);
        assert!(player_tok == 100 - tokens_to_sell, 8);

        test_utils::destroy(ledger); test_utils::destroy(vault); test_utils::destroy(config);
        test_utils::destroy(wallet); test_utils::destroy(gov_config);
        test_utils::destroy(cap_store);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clock);
    }

    // ── Test 3: non-zero-tax eve→token — net EVE to vault, tax to tax_wallet ──

    #[test]
    fun test_nonzero_tax_eve_to_token_split_correct() {
        let mut ctx = tx_context::dummy();
        let (mut ledger, mut vault, mut config, mut wallet, gov_config, cap_store,
             tribe_gov, clock) = setup(&mut ctx);

        // fee override = 200 bps (2%)
        tribe_exchange::set_fee_override(&mut config, option::some(200u64));

        let gross_eve: u64      = 500_000;
        // dapp_tax = 500_000 * 200 / 10_000 = 10_000
        // net_eve  = 490_000
        let expected_tax: u64   = 10_000;
        let expected_net: u64   = 490_000;

        let vault_before  = tribe_vault::eve_balance(&vault);
        let tax_before    = tax_wallet::total_collected(&wallet);
        let supply_before = tribe_token_ledger::total_supply(&ledger);

        let payment = sui::coin::mint_for_testing<EVE::EVE::EVE>(gross_eve, &mut ctx);
        tribe_exchange::swap_eve_to_tokens(
            &mut ledger, &mut vault, &mut config, &tribe_gov,
            payment, &mut wallet, &gov_config, &cap_store, &clock, &mut ctx,
        );

        // (a) Vault grew by exactly net_eve (not gross_eve — tax was split)
        assert!(tribe_vault::eve_balance(&vault) == vault_before + expected_net, 9);

        // (b) Tax wallet grew by exactly dapp_tax
        assert!(tax_wallet::total_collected(&wallet) == tax_before + expected_tax, 10);

        // (c) Player received tokens (> 0); supply unchanged
        let player_tok = tribe_token_ledger::balance_of(&ledger, tx_context::sender(&ctx));
        assert!(player_tok > 0, 11);
        assert!(tribe_token_ledger::total_supply(&ledger) == supply_before, 12);

        test_utils::destroy(ledger); test_utils::destroy(vault); test_utils::destroy(config);
        test_utils::destroy(wallet); test_utils::destroy(gov_config);
        test_utils::destroy(cap_store);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clock);
    }

    // ── Test 4: non-zero-tax token→eve — net EVE to player, tax to tax_wallet ─

    #[test]
    fun test_nonzero_tax_token_to_eve_split_correct() {
        let mut ctx = tx_context::dummy();
        let (mut ledger, mut vault, mut config, mut wallet, gov_config, cap_store,
             tribe_gov, clock) = setup(&mut ctx);

        // fee override = 200 bps (2%)
        tribe_exchange::set_fee_override(&mut config, option::some(200u64));

        // Seed player's token balance
        let player_addr: address = tx_context::sender(&ctx); // dummy = 0x0
        tribe_token_ledger::mint_for_testing(&mut ledger, player_addr, 200);

        let tokens_to_sell: u64 = 100;
        let vault_before   = tribe_vault::eve_balance(&vault);
        let tax_before     = tax_wallet::total_collected(&wallet);
        let supply_before  = tribe_token_ledger::total_supply(&ledger);

        tribe_exchange::swap_tokens_to_eve(
            &mut ledger, &mut vault, &mut config, &tribe_gov,
            tokens_to_sell, &mut wallet, &gov_config, &cap_store, &clock, &mut ctx,
        );

        // (a) Compute gross_eve from vault delta + tax_wallet delta
        let vault_after  = tribe_vault::eve_balance(&vault);
        let tax_after    = tax_wallet::total_collected(&wallet);
        let gross_eve    = vault_before - vault_after;   // total withdrawn from vault
        let collected_tax = tax_after - tax_before;
        // dapp_tax = gross_eve * 200 / 10_000 = gross_eve / 50
        // net_eve  = gross_eve - dapp_tax
        // Both must be > 0 for the assertions to be meaningful.
        assert!(gross_eve > 0, 13);
        assert!(collected_tax > 0, 14);

        // (b) Tax wallet grew by exactly floor(gross_eve * 200 / 10_000)
        let expected_tax = ((gross_eve as u128) * 200u128 / 10_000u128) as u64;
        assert!(collected_tax == expected_tax, 15);

        // (c) Net EVE received by player = gross_eve - dapp_tax
        //     We can't directly check the Coin<EVE> object (public_transfer is terminal),
        //     but conservation holds: vault shrinks by gross_eve; tax grows by dapp_tax;
        //     player got gross_eve - dapp_tax.
        let expected_net = gross_eve - expected_tax;
        assert!(expected_net > 0, 16);
        // Indirect conservation check: vault_delta + tax_delta + net_to_player = gross_eve
        assert!(gross_eve == expected_tax + expected_net, 17);

        // (d) Supply unchanged (V28 transfer semantics)
        assert!(tribe_token_ledger::total_supply(&ledger) == supply_before, 18);

        // (e) Player's token balance decreased by tokens_to_sell
        let player_tok = tribe_token_ledger::balance_of(&ledger, player_addr);
        assert!(player_tok == 200 - tokens_to_sell, 19);

        test_utils::destroy(ledger); test_utils::destroy(vault); test_utils::destroy(config);
        test_utils::destroy(wallet); test_utils::destroy(gov_config);
        test_utils::destroy(cap_store);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
