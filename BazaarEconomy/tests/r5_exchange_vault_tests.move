// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// R5.2.b.2 — tribe_exchange + tribe_vault bazaar-type gate tests (6 tests)
// Reject = Easy gov (type=1) → E_NOT_ADVANCED_BAZAAR
// Accept = Advanced gov (type=2) → next guard fires (type gate passed)
//
// swap_eve_to_tokens / swap_tokens_to_eve require DAppTaxWallet + GovernanceConfig +
// EconomyCapStore. For reject tests the gate fires before those objects are needed.
// For accept tests, we rely on the subsequent identity guard (E_WRONG_TRIBE via the
// ledger/vault/config cross-check) to confirm the type gate was crossed.

#[test_only]
module bazaar_economy::r5_exchange_vault_tests {
    use sui::clock;
    use sui::test_utils;
    use dapp_hub::tribe_registry;
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_core::bazaar_core_admin;
    use bazaar_economy::tribe_exchange;
    use bazaar_economy::tribe_vault;
    use bazaar_economy::tribe_token_ledger;
    use bazaar_economy::economy_cap_store;
    use bazaar_economy::economy_governance;

    const TRIBE_ID: u64 = 1;
    const LEADER: address = @0xA1;
    const RESERVE: u64 = 100_000_000;

    // ===== swap_eve_to_tokens =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_swap_eve_to_tokens_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let mut config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let gov_config = dapp_governance::create_config_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut cap_store = economy_cap_store::create_for_testing(&mut ctx);
        let tax_cap = tax_wallet::create_deposit_cap_for_testing(&mut ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(@0x0, &mut ctx);
        economy_governance::receive_tax_deposit_cap(&mut cap_store, tax_cap, &owner_cap);
        economy_governance::receive_shop_cap(&mut cap_store, shop_cap, &owner_cap);
        let payment = sui::coin::mint_for_testing<EVE::EVE::EVE>(1000, &mut ctx);
        tribe_exchange::swap_eve_to_tokens(&mut ledger, &mut vault, &mut config, &tribe_gov, payment, &mut wallet, &gov_config, &cap_store, &clock, &mut ctx);
        test_utils::destroy(ledger); test_utils::destroy(vault); test_utils::destroy(config);
        test_utils::destroy(wallet); test_utils::destroy(gov_config); test_utils::destroy(owner_cap);
        test_utils::destroy(cap_store);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 5, location = bazaar_economy::tribe_exchange)]
    fun test_swap_eve_to_tokens_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        // type gate passes; cross-object identity check (E_WRONG_TRIBE=5) fires with mismatched objects
        let mut ledger = tribe_token_ledger::create_for_testing(99, &clock, &mut ctx); // wrong tribe
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let mut config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let gov_config = dapp_governance::create_config_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut cap_store = economy_cap_store::create_for_testing(&mut ctx);
        let tax_cap = tax_wallet::create_deposit_cap_for_testing(&mut ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(@0x0, &mut ctx);
        economy_governance::receive_tax_deposit_cap(&mut cap_store, tax_cap, &owner_cap);
        economy_governance::receive_shop_cap(&mut cap_store, shop_cap, &owner_cap);
        let payment = sui::coin::mint_for_testing<EVE::EVE::EVE>(1000, &mut ctx);
        tribe_exchange::swap_eve_to_tokens(&mut ledger, &mut vault, &mut config, &tribe_gov, payment, &mut wallet, &gov_config, &cap_store, &clock, &mut ctx);
        test_utils::destroy(ledger); test_utils::destroy(vault); test_utils::destroy(config);
        test_utils::destroy(wallet); test_utils::destroy(gov_config); test_utils::destroy(owner_cap);
        test_utils::destroy(cap_store);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clock);
    }

    // ===== swap_tokens_to_eve =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_swap_tokens_to_eve_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let mut config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let gov_config = dapp_governance::create_config_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut cap_store = economy_cap_store::create_for_testing(&mut ctx);
        let tax_cap = tax_wallet::create_deposit_cap_for_testing(&mut ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(@0x0, &mut ctx);
        economy_governance::receive_tax_deposit_cap(&mut cap_store, tax_cap, &owner_cap);
        economy_governance::receive_shop_cap(&mut cap_store, shop_cap, &owner_cap);
        tribe_exchange::swap_tokens_to_eve(&mut ledger, &mut vault, &mut config, &tribe_gov, 10, &mut wallet, &gov_config, &cap_store, &clock, &mut ctx);
        test_utils::destroy(ledger); test_utils::destroy(vault); test_utils::destroy(config);
        test_utils::destroy(wallet); test_utils::destroy(gov_config); test_utils::destroy(owner_cap);
        test_utils::destroy(cap_store);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 5, location = bazaar_economy::tribe_exchange)]
    fun test_swap_tokens_to_eve_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(99, &clock, &mut ctx); // wrong tribe
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let mut config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let gov_config = dapp_governance::create_config_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut cap_store = economy_cap_store::create_for_testing(&mut ctx);
        let tax_cap = tax_wallet::create_deposit_cap_for_testing(&mut ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(@0x0, &mut ctx);
        economy_governance::receive_tax_deposit_cap(&mut cap_store, tax_cap, &owner_cap);
        economy_governance::receive_shop_cap(&mut cap_store, shop_cap, &owner_cap);
        // type gate passes; cross-object identity check (E_WRONG_TRIBE=5) fires
        tribe_exchange::swap_tokens_to_eve(&mut ledger, &mut vault, &mut config, &tribe_gov, 10, &mut wallet, &gov_config, &cap_store, &clock, &mut ctx);
        test_utils::destroy(ledger); test_utils::destroy(vault); test_utils::destroy(config);
        test_utils::destroy(wallet); test_utils::destroy(gov_config); test_utils::destroy(owner_cap);
        test_utils::destroy(cap_store);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clock);
    }

    // ===== deposit_eve =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_deposit_eve_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let payment = sui::coin::mint_for_testing<EVE::EVE::EVE>(1000, &mut ctx);
        tribe_vault::deposit_eve(&cap, &tribe_gov, &mut vault, &ledger, payment, &clock, &mut ctx);
        test_utils::destroy(cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(vault); test_utils::destroy(ledger); clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_deposit_eve_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let payment = sui::coin::mint_for_testing<EVE::EVE::EVE>(1000, &mut ctx);
        tribe_vault::deposit_eve(&cap, &tribe_gov, &mut vault, &ledger, payment, &clock, &mut ctx);
        assert!(tribe_vault::eve_balance(&vault) == 1000, 0);
        test_utils::destroy(cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(vault); test_utils::destroy(ledger); clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
