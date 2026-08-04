// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_economy::exchange_tests {
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use sui::test_utils;
    use dapp_hub::dapp_governance;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::tribe_vault::{Self, TribeVault};
    use bazaar_economy::tribe_exchange::{Self, ExchangeConfig};

    // ===== Test Constants =====
    const TRIBE_1: u64 = 1;
    const ALICE: address = @0xA11CE;
    /// RATE_PRECISION mirrors tribe_exchange::RATE_PRECISION = 1_000_000_000
    const RATE_PRECISION: u64 = 1_000_000_000;

    // ===== T01: exchange_rate_scaled returns 0 when total_supply == 0 =====

    #[test]
    fun test_scaled_rate_zero_supply() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);

        let vault  = tribe_vault::create_for_testing(TRIBE_1, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_1, 0, &clk, &mut ctx);

        // supply == 0 → compute_scaled_rate returns 0
        let rate = tribe_exchange::exchange_rate_scaled(&vault, &ledger, &config);
        assert!(rate == 0, 0);

        clock::destroy_for_testing(clk);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
    }

    // ===== T02: exchange_rate_scaled returns 0 when vault_balance <= reserve =====

    #[test]
    fun test_scaled_rate_vault_at_reserve() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);

        let mut vault  = tribe_vault::create_for_testing(TRIBE_1, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);
        // reserve_mist = 1000, deposit exactly 1000 into vault → available = 0
        let config = tribe_exchange::create_for_testing(TRIBE_1, 1_000, &clk, &mut ctx);

        // Seed vault with 1000 MIST (equals reserve)
        let payment = coin::mint_for_testing<EVE>(1_000, &mut ctx);
        tribe_vault::internal_deposit(&mut vault, payment, b"test", ALICE, &clk);

        // Mint supply so supply != 0 (required to reach the balance check)
        tribe_token_ledger::mint_for_testing(&mut ledger, ALICE, 1_000);

        // vault_balance == reserve → available == 0 → rate == 0
        let rate = tribe_exchange::exchange_rate_scaled(&vault, &ledger, &config);
        assert!(rate == 0, 0);

        clock::destroy_for_testing(clk);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
    }

    // ===== T03: exchange_rate_scaled correct formula =====
    // vault = 2000 MIST, reserve = 500, supply = 500
    // available = 2000 - 500 = 1500
    // scaled_rate = 1500 * RATE_PRECISION / 500 = 3_000_000_000

    #[test]
    fun test_scaled_rate_correct_formula() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);

        let mut vault  = tribe_vault::create_for_testing(TRIBE_1, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_1, 500, &clk, &mut ctx);

        let payment = coin::mint_for_testing<EVE>(2_000, &mut ctx);
        tribe_vault::internal_deposit(&mut vault, payment, b"test", ALICE, &clk);
        tribe_token_ledger::mint_for_testing(&mut ledger, ALICE, 500);

        let rate = tribe_exchange::exchange_rate_scaled(&vault, &ledger, &config);
        // available = 1500, supply = 500 → 1500 * 1_000_000_000 / 500 = 3_000_000_000
        assert!(rate == 3_000_000_000, 0);

        clock::destroy_for_testing(clk);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
    }

    // ===== T04: exchange_rate (unscaled) divides by RATE_PRECISION =====
    // Same setup as T03 → scaled = 3_000_000_000 → unscaled = 3

    #[test]
    fun test_exchange_rate_unscaled() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);

        let mut vault  = tribe_vault::create_for_testing(TRIBE_1, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_1, 500, &clk, &mut ctx);

        let payment = coin::mint_for_testing<EVE>(2_000, &mut ctx);
        tribe_vault::internal_deposit(&mut vault, payment, b"test", ALICE, &clk);
        tribe_token_ledger::mint_for_testing(&mut ledger, ALICE, 500);

        let rate = tribe_exchange::exchange_rate(&vault, &ledger, &config);
        // 3_000_000_000 / 1_000_000_000 = 3
        assert!(rate == 3, 0);

        clock::destroy_for_testing(clk);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
    }

    // ===== T05: effective_fee_bps uses global when no override =====
    // PREREQUISITE: effective_fee_bps_for_testing wrapper added to tribe_exchange.move

    #[test]
    fun test_effective_fee_bps_global() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);

        // create_for_testing sets exchange_fee_override_bps = option::none()
        let config = tribe_exchange::create_for_testing(TRIBE_1, 0, &clk, &mut ctx);
        // create_config_for_testing sets global_dapp_tax_bps = 200
        let dapp_config = dapp_governance::create_config_for_testing(&mut ctx);

        let fee = tribe_exchange::effective_fee_bps_for_testing(&config, &dapp_config);
        assert!(fee == 200, 0);

        clock::destroy_for_testing(clk);
        test_utils::destroy(config);
        test_utils::destroy(dapp_config);
    }

    // ===== T06: effective_fee_bps uses override when set =====
    // PREREQUISITE: effective_fee_bps_for_testing wrapper added to tribe_exchange.move

    #[test]
    fun test_effective_fee_bps_override() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);

        let mut config = tribe_exchange::create_for_testing(TRIBE_1, 0, &clk, &mut ctx);
        let dapp_config = dapp_governance::create_config_for_testing(&mut ctx);

        // set_fee_override is public(package) — accessible from within bazaar_economy package
        tribe_exchange::set_fee_override(&mut config, option::some(50u64));

        // Override (50) wins over global (200)
        let fee = tribe_exchange::effective_fee_bps_for_testing(&config, &dapp_config);
        assert!(fee == 50, 0);

        clock::destroy_for_testing(clk);
        test_utils::destroy(config);
        test_utils::destroy(dapp_config);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
