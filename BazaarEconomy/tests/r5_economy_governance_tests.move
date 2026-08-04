// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// R5.2.b.2 — economy_governance bazaar-type gate tests (24 tests)
// Reject = Easy gov (type=1) → E_NOT_ADVANCED_BAZAAR
// Accept = Advanced gov (type=2) → no abort (or next guard fires)

#[test_only]
module bazaar_economy::r5_economy_governance_tests {
    use sui::clock;
    use sui::test_utils;
    use dapp_hub::tribe_registry;
    use dapp_hub::tribe_registry::TribeRegistry;
    use dapp_hub::dapp_governance;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_economy::economy_governance;
    use bazaar_economy::tribe_token_ledger;
    use bazaar_economy::tribe_vault;
    use bazaar_economy::tribe_exchange;
    use bazaar_economy::vault_withdrawal;

    const TRIBE_ID: u64 = 1;
    const LEADER: address = @0xA1;
    const RESERVE: u64 = 100_000_000;
    // V19 — bootstrap now requires a Coin<EVE> deposit ≥ 1 EVE.
    const INITIAL_DEPOSIT_OK: u64 = 1_000_000_000;

    // ===== bootstrap_advanced_complete (V19 — Coin<EVE> deposit + genesis mint) =====

    const PACKAGE_ID_FOR_TEST: address = @0xBC;

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_bootstrap_advanced_complete_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut registry = tribe_registry::create_for_testing(&mut ctx);
        // Register an Easy tribe (bazaar_type = 1, no token args).
        let cap = tribe_registry::create_tribe_for_testing(
            &mut registry, b"EasyT", b"Desc",
            std::option::none(), std::option::none(),
            1, 0, 0, &clock, &mut ctx,
        );
        // V19: deposit check (`>= 1 EVE`) passes first; then the Advanced gate fires.
        let deposit = sui::coin::mint_for_testing<EVE::EVE::EVE>(INITIAL_DEPOSIT_OK, &mut ctx);
        economy_governance::bootstrap_advanced_complete(
            &cap, &mut registry, PACKAGE_ID_FOR_TEST, deposit, 1, &clock, &mut ctx,
        );
        test_utils::destroy(cap);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 11)]  // E_DEPOSIT_TOO_SMALL (economy_governance)
    fun test_bootstrap_advanced_complete_rejects_too_small_deposit() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut registry = tribe_registry::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_tribe_for_testing(
            &mut registry, b"AdvT", b"Desc",
            std::option::some(b"AdvToken"), std::option::some(b"ADV"),
            2, 0, 0, &clock, &mut ctx,
        );
        // Below the 1 EVE floor — must abort with E_DEPOSIT_TOO_SMALL.
        let deposit = sui::coin::mint_for_testing<EVE::EVE::EVE>(RESERVE, &mut ctx);
        economy_governance::bootstrap_advanced_complete(
            &cap, &mut registry, PACKAGE_ID_FOR_TEST, deposit, 1, &clock, &mut ctx,
        );
        test_utils::destroy(cap);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_bootstrap_advanced_complete_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut registry = tribe_registry::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_tribe_for_testing(
            &mut registry, b"AdvT", b"Desc",
            std::option::some(b"AdvToken"), std::option::some(b"ADV"),
            2, 0, 0, &clock, &mut ctx,
        );
        let deposit = sui::coin::mint_for_testing<EVE::EVE::EVE>(INITIAL_DEPOSIT_OK, &mut ctx);
        economy_governance::bootstrap_advanced_complete(
            &cap, &mut registry, PACKAGE_ID_FOR_TEST, deposit, 1, &clock, &mut ctx,
        );
        // Registry rows are populated atomically — assert the 6 IDs are now Some.
        let tribe = tribe_registry::tribe_by_id(&registry, TRIBE_ID);
        assert!(std::option::is_some(&tribe_registry::tribe_gov_id(tribe)), 0);
        assert!(std::option::is_some(&tribe_registry::tribe_vault_id(tribe)), 0);
        assert!(std::option::is_some(&tribe_registry::tribe_token_ledger_id(tribe)), 0);
        assert!(std::option::is_some(&tribe_registry::tribe_exchange_config_id(tribe)), 0);
        assert!(std::option::is_some(&tribe_registry::tribe_withdrawal_board_id(tribe)), 0);
        assert!(std::option::is_some(&tribe_registry::tribe_mint_burn_queue_id(tribe)), 0);
        test_utils::destroy(cap);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }

    // ===== mint_supply / burn_tokens — RETIRED in V16 =====
    // The 4 prior tests (mint_supply_rejects_easy / mint_supply_accepts_advanced /
    // burn_tokens_rejects_easy / burn_tokens_accepts_advanced) are now covered
    // by r5_mint_burn_queue_tests.move which exercises request → wait → execute
    // through the queue. The Easy-bazaar rejection path is preserved there as
    // `test_request_mint_rejects_easy`.

    // ===== set_reserve =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_set_reserve_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        economy_governance::set_reserve(&owner_cap, &tribe_gov, &mut config, RESERVE, &clock, &mut ctx);
        test_utils::destroy(owner_cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(config); clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_set_reserve_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        economy_governance::set_reserve(&owner_cap, &tribe_gov, &mut config, RESERVE / 2, &clock, &mut ctx);
        assert!(tribe_exchange::reserve_mist(&config) == RESERVE / 2, 0);
        test_utils::destroy(owner_cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(config); clock::destroy_for_testing(clock);
    }

    // ===== set_exchange_fee_override =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_set_fee_override_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        economy_governance::set_exchange_fee_override(&owner_cap, &tribe_gov, &mut config, option::none(), &clock, &mut ctx);
        test_utils::destroy(owner_cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(config); clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_set_fee_override_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        economy_governance::set_exchange_fee_override(&owner_cap, &tribe_gov, &mut config, option::none(), &clock, &mut ctx);
        assert!(option::is_none(&tribe_exchange::fee_override_bps(&config)), 0);
        test_utils::destroy(owner_cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(config); clock::destroy_for_testing(clock);
    }

    // ===== set_ledger_frozen =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_set_ledger_frozen_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        economy_governance::set_ledger_frozen(&owner_cap, &tribe_gov, &mut ledger, true, &clock, &mut ctx);
        test_utils::destroy(owner_cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger); clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_set_ledger_frozen_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        economy_governance::set_ledger_frozen(&owner_cap, &tribe_gov, &mut ledger, true, &clock, &mut ctx);
        assert!(tribe_token_ledger::is_frozen(&ledger), 0);
        test_utils::destroy(owner_cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger); clock::destroy_for_testing(clock);
    }

    // ===== lock_vault =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_lock_vault_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        economy_governance::lock_vault(&owner_cap, &tribe_gov, &mut vault, &clock, &mut ctx);
        test_utils::destroy(owner_cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(vault); clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_lock_vault_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        economy_governance::lock_vault(&owner_cap, &tribe_gov, &mut vault, &clock, &mut ctx);
        assert!(tribe_vault::is_locked(&vault), 0);
        test_utils::destroy(owner_cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(vault); clock::destroy_for_testing(clock);
    }

    // ===== unlock_vault =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_unlock_vault_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        economy_governance::unlock_vault(&owner_cap, &tribe_gov, &mut vault, &clock, &mut ctx);
        test_utils::destroy(owner_cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(vault); clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_unlock_vault_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        economy_governance::unlock_vault(&owner_cap, &tribe_gov, &mut vault, &clock, &mut ctx);
        assert!(!tribe_vault::is_locked(&vault), 0);
        test_utils::destroy(owner_cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(vault); clock::destroy_for_testing(clock);
    }

    // ===== add_liquidity =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_add_liquidity_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let payment = sui::coin::mint_for_testing<EVE::EVE::EVE>(1000, &mut ctx);
        economy_governance::add_liquidity(&cap, &tribe_gov, &mut vault, &ledger, payment, &clock, &mut ctx);
        test_utils::destroy(cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(vault); test_utils::destroy(ledger); clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_add_liquidity_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let payment = sui::coin::mint_for_testing<EVE::EVE::EVE>(1000, &mut ctx);
        economy_governance::add_liquidity(&cap, &tribe_gov, &mut vault, &ledger, payment, &clock, &mut ctx);
        assert!(tribe_vault::eve_balance(&vault) == 1000, 0);
        test_utils::destroy(cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(vault); test_utils::destroy(ledger); clock::destroy_for_testing(clock);
    }

    // ===== set_supply_cap =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_set_supply_cap_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        economy_governance::set_supply_cap(&cap, &tribe_gov, &mut ledger, 1000, &clock, &mut ctx);
        test_utils::destroy(cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger); clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_set_supply_cap_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        economy_governance::set_supply_cap(&cap, &tribe_gov, &mut ledger, 1000, &clock, &mut ctx);
        assert!(tribe_token_ledger::supply_cap(&ledger) == 1000, 0);
        test_utils::destroy(cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger); clock::destroy_for_testing(clock);
    }

    // ===== set_required_approvals =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_set_required_approvals_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        economy_governance::set_required_approvals(&cap, &tribe_gov, &mut board, 2, &clock, &mut ctx);
        test_utils::destroy(cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board); clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_set_required_approvals_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        economy_governance::set_required_approvals(&cap, &tribe_gov, &mut board, 2, &clock, &mut ctx);
        assert!(vault_withdrawal::board_required_approvals(&board) == 2, 0);
        test_utils::destroy(cap); tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board); clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
