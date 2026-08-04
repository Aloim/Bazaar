// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// tests/sources/test_advanced_tribe_setup.move
// Integration tests: Advanced tribe economy initialization, exchange rate, swaps.
// Covers T-ADV-01 through T-ADV-07.
// Constitution: Article XII.3 — 500-line limit. Current: ~478 lines.
#[test_only]
module bazaar_integration_tests::test_advanced_tribe_setup {
    use sui::clock;
    use sui::test_utils;
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use dapp_hub::tribe_registry;
    use bazaar_core::bazaar_core_admin;
    use bazaar_economy::economy_cap_store;
    use bazaar_economy::economy_governance;
    use bazaar_economy::mint_burn_queue;
    use bazaar_economy::tribe_token_ledger;
    use bazaar_economy::tribe_vault;
    use bazaar_economy::tribe_exchange;
    use bazaar_economy::vault_withdrawal;
    use bazaar_core::tribe_governance;
    use bazaar_integration_tests::test_helpers;

    // Tribe ID used across all tests
    const TRIBE_ID: u64 = 1;
    // Reserve used in standard tests (100 SUI)
    const RESERVE: u64 = 100_000_000;
    // Liquidity added by leader (200 SUI)
    const LIQUIDITY: u64 = 200_000_000;
    // Swap input (1 SUI)
    const SWAP_IN: u64 = 1_000_000;
    // Expected net after 2% tax on SWAP_IN: 1_000_000 * 0.98 = 980_000
    const SWAP_NET: u64 = 980_000;
    // Expected tax on SWAP_IN: 1_000_000 * 0.02 = 20_000
    const SWAP_TAX: u64 = 20_000;
    // RATE_PRECISION from tribe_exchange
    const RATE_PRECISION: u64 = 1_000_000_000;
    // V28: tribe wallet must be pre-seeded for swap_eve_to_tokens to succeed.
    // Set equal to RESERVE so the legacy SWAP_NET arithmetic still works:
    //   tokens_out = net_eve * tribe_wallet / available
    //              = 980_000 * 100_000_000 / 100_000_000
    //              = 980_000 (matches V27 SWAP_NET).
    const TRIBE_WALLET_SEED: u64 = 100_000_000;

    // =========================================================
    // Helper: build a fully-loaded EconomyCapStore.
    // =========================================================
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

    // =========================================================
    // T-ADV-01: Economy objects creation and initial state
    // =========================================================
    #[test]
    fun test_economy_objects_creation() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);

        let ledger  = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let vault   = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let config  = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let board   = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);

        // All objects belong to the same tribe
        assert!(tribe_token_ledger::tribe_id(&ledger) == TRIBE_ID, 0);
        assert!(tribe_vault::tribe_id(&vault) == TRIBE_ID, 1);
        assert!(tribe_exchange::tribe_id(&config) == TRIBE_ID, 2);
        assert!(vault_withdrawal::tribe_id(&board) == TRIBE_ID, 3);

        // Exchange is inactive by default
        assert!(!tribe_exchange::is_exchange_active(&config), 4);

        // Vault balance is zero
        assert!(tribe_vault::eve_balance(&vault) == 0, 5);

        // Ledger total_supply is zero
        assert!(tribe_token_ledger::total_supply(&ledger) == 0, 6);

        // Ledger is not frozen
        assert!(!tribe_token_ledger::is_frozen(&ledger), 7);

        test_utils::destroy(ledger);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-ADV-02: Add liquidity and activate exchange
    // =========================================================
    #[test]
    fun test_add_liquidity_and_activate_exchange() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);

        let cap       = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance::create_with_arbitrary_mode_for_testing(
            TRIBE_ID, 2, @0x0, 0, &clock, &mut ctx);
        let mut vault  = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let mut config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);

        let payment = test_helpers::make_sui_coin(LIQUIDITY, &mut ctx);
        economy_governance::add_liquidity(&cap, &tribe_gov, &mut vault, &ledger, payment, &clock, &mut ctx);

        assert!(tribe_vault::eve_balance(&vault) == LIQUIDITY, 0);

        // Activate exchange
        tribe_exchange::set_active_for_testing(&mut config, true);
        assert!(tribe_exchange::is_exchange_active(&config), 1);

        // can_mint returns true (vault > reserve)
        assert!(economy_governance::can_mint(&vault, &config), 2);

        test_utils::destroy(cap);
        tribe_governance::destroy_for_testing(tribe_gov);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-ADV-03: Minting blocked when vault <= reserve
    // V16: rewritten against mint_burn_queue::request_mint_as_leader
    // (the prior economy_governance::mint_supply entry was retired).
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 7, location = bazaar_economy::mint_burn_queue)]
    fun test_mint_blocked_when_vault_lte_reserve() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);

        let cap       = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance::create_with_arbitrary_mode_for_testing(
            TRIBE_ID, 2, @0x0, 0, &clock, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let vault  = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);

        // vault balance is 0, reserve is 100_000_000 → vault <= reserve → abort E_MINTING_BLOCKED
        mint_burn_queue::request_mint_as_leader(
            &cap,
            &tribe_gov,
            &mut queue,
            &vault,
            &ledger,
            &config,
            1000,
            &clock,
            &mut ctx,
        );

        test_utils::destroy(cap);
        tribe_governance::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(ledger);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-ADV-04: Bootstrap swap EVE to tokens (1:1 after tax)
    // =========================================================
    #[test]
    fun test_bootstrap_swap_eve_to_tokens() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);

        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov  = tribe_governance::create_with_arbitrary_mode_for_testing(
            TRIBE_ID, 2, @0x0, 0, &clock, &mut ctx);
        let mut ledger  = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let mut vault   = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let mut config  = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let mut wallet  = tax_wallet::create_wallet_for_testing(&mut ctx);
        let gov_config  = dapp_governance::create_config_for_testing(&mut ctx);
        let cap_store   = make_loaded_cap_store(&mut ctx);

        // Seed vault and activate exchange
        let liquidity = test_helpers::make_sui_coin(LIQUIDITY, &mut ctx);
        economy_governance::add_liquidity(&leader_cap, &tribe_gov, &mut vault, &ledger, liquidity, &clock, &mut ctx);
        tribe_exchange::set_active_for_testing(&mut config, true);

        // V28: pre-seed tribe wallet (mirrors the genesis_mint at bootstrap_advanced_complete).
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, TRIBE_WALLET_SEED);

        let payment = test_helpers::make_sui_coin(SWAP_IN, &mut ctx);

        tribe_exchange::swap_eve_to_tokens(
            &mut ledger,
            &mut vault,
            &mut config,
            &tribe_gov,
            payment,
            &mut wallet,
            &gov_config,
            &cap_store,
            &clock,
            &mut ctx,
        );

        // V28: tokens TRANSFER from tribe wallet to player. With seed == available,
        // tokens_out = net_eve = 980_000 (same number as V27, different mechanism).
        let sender = tx_context::sender(&ctx);
        assert!(tribe_token_ledger::balance_of(&ledger, sender) == SWAP_NET, 0);
        // V28: total_supply UNCHANGED by swap — equal to the pre-seed.
        assert!(tribe_token_ledger::total_supply(&ledger) == TRIBE_WALLET_SEED, 1);
        // V28: tribe wallet decreased by exactly tokens_out.
        assert!(tribe_token_ledger::balance_of(&ledger, gov_addr) == TRIBE_WALLET_SEED - SWAP_NET, 4);

        // Vault received net_eve (not gross)
        assert!(tribe_vault::eve_balance(&vault) == LIQUIDITY + SWAP_NET, 2);

        // Tax wallet received the 2% dApp tax
        assert!(tax_wallet::total_collected(&wallet) == SWAP_TAX, 3);

        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(gov_config);
        test_utils::destroy(cap_store);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-ADV-05: Exchange rate formula after bootstrap
    // =========================================================
    #[test]
    fun test_exchange_rate_formula() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);

        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov  = tribe_governance::create_with_arbitrary_mode_for_testing(
            TRIBE_ID, 2, @0x0, 0, &clock, &mut ctx);
        let mut ledger  = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let mut vault   = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let mut config  = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let mut wallet  = tax_wallet::create_wallet_for_testing(&mut ctx);
        let gov_config  = dapp_governance::create_config_for_testing(&mut ctx);
        let cap_store   = make_loaded_cap_store(&mut ctx);

        let liquidity = test_helpers::make_sui_coin(LIQUIDITY, &mut ctx);
        economy_governance::add_liquidity(&leader_cap, &tribe_gov, &mut vault, &ledger, liquidity, &clock, &mut ctx);
        tribe_exchange::set_active_for_testing(&mut config, true);

        // V28: pre-seed tribe wallet before any swap.
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, TRIBE_WALLET_SEED);

        let payment = test_helpers::make_sui_coin(SWAP_IN, &mut ctx);
        tribe_exchange::swap_eve_to_tokens(
            &mut ledger,
            &mut vault,
            &mut config,
            &tribe_gov,
            payment,
            &mut wallet,
            &gov_config,
            &cap_store,
            &clock,
            &mut ctx,
        );

        // V28 state after swap:
        //   vault = 200_000_000 + 980_000 = 200_980_000
        //   tribe_wallet = TRIBE_WALLET_SEED - 980_000 = 99_020_000
        //   total_supply unchanged at TRIBE_WALLET_SEED
        //   rate_v28 = (200_980_000 - 100_000_000) * 1e9 / 99_020_000
        let vault_bal = tribe_vault::eve_balance(&vault);
        let tribe_wallet_bal = tribe_token_ledger::balance_of(&ledger, gov_addr);
        let available = vault_bal - RESERVE;
        let expected_rate =
            (available as u128) * (RATE_PRECISION as u128) / (tribe_wallet_bal as u128);

        let actual_rate = tribe_exchange::exchange_rate_scaled_v28(&vault, &ledger, &config, &tribe_gov);
        assert!(actual_rate == (expected_rate as u64), 0);

        // Sanity: rate is > 1 MIST per token (token buys into liquidity above reserve)
        assert!(actual_rate > RATE_PRECISION, 1);

        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(gov_config);
        test_utils::destroy(cap_store);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-ADV-06: Swap tokens back to EVE
    // =========================================================
    #[test]
    fun test_swap_tokens_to_eve() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);

        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov  = tribe_governance::create_with_arbitrary_mode_for_testing(
            TRIBE_ID, 2, @0x0, 0, &clock, &mut ctx);
        let mut ledger  = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let mut vault   = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let mut config  = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let mut wallet  = tax_wallet::create_wallet_for_testing(&mut ctx);
        let gov_config  = dapp_governance::create_config_for_testing(&mut ctx);
        let cap_store   = make_loaded_cap_store(&mut ctx);

        // Setup: add liquidity, activate, seed tribe wallet, do EVE→token swap
        let liquidity = test_helpers::make_sui_coin(LIQUIDITY, &mut ctx);
        economy_governance::add_liquidity(&leader_cap, &tribe_gov, &mut vault, &ledger, liquidity, &clock, &mut ctx);
        tribe_exchange::set_active_for_testing(&mut config, true);

        // V28: pre-seed tribe wallet.
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, TRIBE_WALLET_SEED);

        let payment = test_helpers::make_sui_coin(SWAP_IN, &mut ctx);
        tribe_exchange::swap_eve_to_tokens(
            &mut ledger,
            &mut vault,
            &mut config,
            &tribe_gov,
            payment,
            &mut wallet,
            &gov_config,
            &cap_store,
            &clock,
            &mut ctx,
        );

        // V28 state after EVE→token swap:
        //   vault = 200_980_000, tribe_wallet = TRIBE_WALLET_SEED - 980_000, total_supply unchanged.
        let vault_before  = tribe_vault::eve_balance(&vault);
        let supply_before = tribe_token_ledger::total_supply(&ledger);
        let tribe_wallet_before = tribe_token_ledger::balance_of(&ledger, gov_addr);
        let tax_before    = tax_wallet::total_collected(&wallet);

        // Swap 100_000 tokens back to EVE
        let tokens_to_sell = 100_000u64;
        tribe_exchange::swap_tokens_to_eve(
            &mut ledger,
            &mut vault,
            &mut config,
            &tribe_gov,
            tokens_to_sell,
            &mut wallet,
            &gov_config,
            &cap_store,
            &clock,
            &mut ctx,
        );

        // V28 expected gross_eve uses tribe_wallet_bal (BEFORE the sell) as denominator.
        let available_before = (vault_before as u128) - (RESERVE as u128);
        let pre_scaled_rate = available_before * (RATE_PRECISION as u128) / (tribe_wallet_before as u128);
        let gross_eve = (tokens_to_sell as u128) * pre_scaled_rate / (RATE_PRECISION as u128);
        let dapp_tax = gross_eve * 200 / 10_000;

        // V28: total_supply UNCHANGED by swap.
        assert!(tribe_token_ledger::total_supply(&ledger) == supply_before, 0);
        // V28: tribe wallet INCREASED by tokens_to_sell.
        assert!(tribe_token_ledger::balance_of(&ledger, gov_addr) == tribe_wallet_before + tokens_to_sell, 4);

        // Vault decreased by gross_eve
        let vault_after = tribe_vault::eve_balance(&vault);
        test_helpers::assert_approx_eq(vault_before - vault_after, (gross_eve as u64), 1);

        // Tax wallet received dApp tax on top of previous collection
        let tax_collected = tax_wallet::total_collected(&wallet) - tax_before;
        test_helpers::assert_approx_eq(tax_collected, (dapp_tax as u64), 1);

        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(gov_config);
        test_utils::destroy(cap_store);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-ADV-07: Swap blocked when reserve >= vault (rate = 0)
    // =========================================================
    // The rate formula returns 0 when vault_balance <= reserve_mist,
    // which causes E_ZERO_RATE (4) abort. This is the primary mechanism
    // enforcing Article XIII SA-004 (reserve floor).
    // Note: E_VAULT_BELOW_RESERVE is defense-in-depth and unreachable
    // through normal swaps because rate = available/supply ensures
    // gross_eve <= available by construction.
    #[test]
    #[expected_failure(abort_code = 4, location = bazaar_economy::tribe_exchange)]
    fun test_swap_blocked_when_reserve_exceeds_vault() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);

        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov  = tribe_governance::create_with_arbitrary_mode_for_testing(
            TRIBE_ID, 2, @0x0, 0, &clock, &mut ctx);
        let owner_cap   = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut ledger  = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let mut vault   = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        // Start with reserve = 0 so bootstrap succeeds freely
        let mut config  = tribe_exchange::create_for_testing(TRIBE_ID, 0, &clock, &mut ctx);
        let mut wallet  = tax_wallet::create_wallet_for_testing(&mut ctx);
        let gov_config  = dapp_governance::create_config_for_testing(&mut ctx);
        let cap_store   = make_loaded_cap_store(&mut ctx);

        // Add 100 SUI liquidity
        let liquidity = test_helpers::make_sui_coin(100_000_000, &mut ctx);
        economy_governance::add_liquidity(&leader_cap, &tribe_gov, &mut vault, &ledger, liquidity, &clock, &mut ctx);
        tribe_exchange::set_active_for_testing(&mut config, true);

        // V28: pre-seed tribe wallet.
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, TRIBE_WALLET_SEED);

        // Bootstrap swap: 1 SUI in, net = 980_000 tokens transferred from tribe wallet
        let payment = test_helpers::make_sui_coin(SWAP_IN, &mut ctx);
        tribe_exchange::swap_eve_to_tokens(
            &mut ledger,
            &mut vault,
            &mut config,
            &tribe_gov,
            payment,
            &mut wallet,
            &gov_config,
            &cap_store,
            &clock,
            &mut ctx,
        );

        // Raise reserve ABOVE vault balance — rate becomes 0 → E_ZERO_RATE
        // vault = 100_980_000, set reserve = 101_000_000 (above vault)
        economy_governance::set_reserve(
            &owner_cap,
            &tribe_gov,
            &mut config,
            101_000_000,
            &clock,
            &mut ctx,
        );

        // This swap must abort E_ZERO_RATE = 4 (rate = 0 when vault <= reserve)
        tribe_exchange::swap_tokens_to_eve(
            &mut ledger,
            &mut vault,
            &mut config,
            &tribe_gov,
            980_000,
            &mut wallet,
            &gov_config,
            &cap_store,
            &clock,
            &mut ctx,
        );

        // Cleanup (unreachable — abort expected above)
        tribe_governance::destroy_for_testing(tribe_gov);
        test_utils::destroy(leader_cap);
        test_utils::destroy(owner_cap);
        test_utils::destroy(ledger);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(gov_config);
        test_utils::destroy(cap_store);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
