// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V16 — mint_burn_queue tests
// Covers: happy path request→execute (mint + burn), leader vs admin variants,
//         wait-period gate, single-rejection veto, zero-amount + wrong-tribe +
//         bazaar-type guards, Article XIII.4 mint-blocked, insufficient-wallet
//         burn guard, status invariants on rejected/executed requests.

#[test_only]
module bazaar_economy::r5_mint_burn_queue_tests {
    use sui::clock;
    use sui::object;
    use sui::test_utils;
    use dapp_hub::tribe_registry;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_economy::mint_burn_queue;
    use bazaar_economy::tribe_token_ledger;
    use bazaar_economy::tribe_vault;
    use bazaar_economy::tribe_exchange;

    const TRIBE_ID:    u64 = 1;
    const OTHER_TRIBE: u64 = 2;
    const LEADER:      address = @0xA1;
    const RESERVE:     u64 = 100_000_000;       // 0.1 SUI
    const VAULT_FUND:  u64 = 500_000_000;       // 0.5 SUI — well above reserve
    const MINT_AMT:    u64 = 1_000;
    const WAIT_MS:     u64 = 86_400_000;         // mirror of WAIT_PERIOD_MS

    // ===== Happy Path — request_mint_as_leader → execute_as_leader =====

    #[test]
    fun test_request_mint_then_execute_leader() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        tribe_vault::fund_for_testing(&mut vault, VAULT_FUND, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        let req_id = mint_burn_queue::request_mint_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, &config, MINT_AMT, &clock, &mut ctx,
        );
        assert!(req_id == 0, 0);
        assert!(mint_burn_queue::request_status(&queue, req_id) == mint_burn_queue::status_pending(), 1);
        assert!(mint_burn_queue::request_kind(&queue, req_id) == mint_burn_queue::kind_mint(), 2);

        // Advance clock past the wait period
        clock::increment_for_testing(&mut clock, WAIT_MS + 1);
        mint_burn_queue::execute_request_as_leader(
            &cap, &tribe_gov, &mut queue, &mut ledger, &vault, &config, req_id, &clock, &mut ctx,
        );

        assert!(mint_burn_queue::request_status(&queue, req_id) == mint_burn_queue::status_executed(), 3);
        let tribe_addr = object::id_address(&tribe_gov);
        assert!(tribe_token_ledger::balance_of(&ledger, tribe_addr) == MINT_AMT, 4);
        assert!(tribe_token_ledger::total_supply(&ledger) == MINT_AMT, 5);

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== Happy Path — admin variant (TribeSuperAdminCap) =====

    #[test]
    fun test_request_mint_then_execute_admin() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_super_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        tribe_vault::fund_for_testing(&mut vault, VAULT_FUND, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        let req_id = mint_burn_queue::request_mint_as_admin(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, &config, MINT_AMT, &clock, &mut ctx,
        );

        clock::increment_for_testing(&mut clock, WAIT_MS + 1);
        mint_burn_queue::execute_request_as_admin(
            &cap, &tribe_gov, &mut queue, &mut ledger, &vault, &config, req_id, &clock, &mut ctx,
        );

        assert!(tribe_token_ledger::total_supply(&ledger) == MINT_AMT, 0);

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== Happy Path — burn =====

    #[test]
    fun test_request_burn_then_execute() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        tribe_vault::fund_for_testing(&mut vault, VAULT_FUND, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        // Seed the tribe wallet with tokens (would happen via tax routing or prior mint).
        let tribe_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, tribe_addr, MINT_AMT * 2);

        let req_id = mint_burn_queue::request_burn_as_leader(
            &cap, &tribe_gov, &mut queue, &ledger, &vault, MINT_AMT, &clock, &mut ctx,
        );
        assert!(mint_burn_queue::request_kind(&queue, req_id) == mint_burn_queue::kind_burn(), 0);

        clock::increment_for_testing(&mut clock, WAIT_MS + 1);
        mint_burn_queue::execute_request_as_leader(
            &cap, &tribe_gov, &mut queue, &mut ledger, &vault, &config, req_id, &clock, &mut ctx,
        );

        assert!(tribe_token_ledger::balance_of(&ledger, tribe_addr) == MINT_AMT, 1);
        assert!(tribe_token_ledger::total_supply(&ledger) == MINT_AMT, 2);

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== Wait Period Gate — execute before wait elapsed =====

    #[test]
    #[expected_failure(abort_code = mint_burn_queue::E_WAIT_PERIOD_ACTIVE)]
    fun test_execute_before_wait_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        tribe_vault::fund_for_testing(&mut vault, VAULT_FUND, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        let req_id = mint_burn_queue::request_mint_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, &config, MINT_AMT, &clock, &mut ctx,
        );
        // No clock advance — execute must abort
        mint_burn_queue::execute_request_as_leader(
            &cap, &tribe_gov, &mut queue, &mut ledger, &vault, &config, req_id, &clock, &mut ctx,
        );

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== Rejection — single-reject during wait =====

    #[test]
    fun test_reject_during_wait_flips_status() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        tribe_vault::fund_for_testing(&mut vault, VAULT_FUND, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        let req_id = mint_burn_queue::request_mint_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, &config, MINT_AMT, &clock, &mut ctx,
        );
        // Reject without clock advance (during wait window)
        mint_burn_queue::reject_request_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, req_id, &clock, &mut ctx,
        );
        assert!(mint_burn_queue::request_status(&queue, req_id) == mint_burn_queue::status_rejected(), 0);
        // Total supply unchanged
        assert!(tribe_token_ledger::total_supply(&ledger) == 0, 1);

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== Status Invariant — execute on REJECTED aborts =====

    #[test]
    #[expected_failure(abort_code = mint_burn_queue::E_INVALID_STATUS)]
    fun test_execute_after_reject_aborts() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        tribe_vault::fund_for_testing(&mut vault, VAULT_FUND, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        let req_id = mint_burn_queue::request_mint_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, &config, MINT_AMT, &clock, &mut ctx,
        );
        mint_burn_queue::reject_request_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, req_id, &clock, &mut ctx,
        );
        clock::increment_for_testing(&mut clock, WAIT_MS + 1);
        // Now executing must abort E_INVALID_STATUS
        mint_burn_queue::execute_request_as_leader(
            &cap, &tribe_gov, &mut queue, &mut ledger, &vault, &config, req_id, &clock, &mut ctx,
        );

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== Article XIII.4 — mint blocked when vault <= reserve =====

    #[test]
    #[expected_failure(abort_code = mint_burn_queue::E_MINTING_BLOCKED)]
    fun test_request_mint_blocked_when_vault_below_reserve() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);  // empty vault
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        mint_burn_queue::request_mint_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, &config, MINT_AMT, &clock, &mut ctx,
        );

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== Burn — insufficient tribe wallet balance =====

    #[test]
    #[expected_failure(abort_code = mint_burn_queue::E_INSUFFICIENT_WALLET)]
    fun test_request_burn_insufficient_wallet() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);

        // Tribe wallet has zero balance — burn must abort
        mint_burn_queue::request_burn_as_leader(
            &cap, &tribe_gov, &mut queue, &ledger, &vault, MINT_AMT, &clock, &mut ctx,
        );

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== Wrong Tribe — cap from different tribe =====

    #[test]
    #[expected_failure(abort_code = mint_burn_queue::E_TRIBE_ID_MISMATCH)]
    fun test_wrong_tribe_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wrong_cap = tribe_registry::create_leader_cap_for_testing(OTHER_TRIBE, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        tribe_vault::fund_for_testing(&mut vault, VAULT_FUND, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        mint_burn_queue::request_mint_as_leader(
            &wrong_cap, &tribe_gov, &mut queue, &vault, &ledger, &config, MINT_AMT, &clock, &mut ctx,
        );

        test_utils::destroy(wrong_cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== Zero Amount Guard =====

    #[test]
    #[expected_failure(abort_code = mint_burn_queue::E_ZERO_AMOUNT)]
    fun test_request_mint_zero_amount() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        tribe_vault::fund_for_testing(&mut vault, VAULT_FUND, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        mint_burn_queue::request_mint_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, &config, 0, &clock, &mut ctx,
        );

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== Bazaar Type Guard — rejects Easy =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_request_mint_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        tribe_vault::fund_for_testing(&mut vault, VAULT_FUND, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        mint_burn_queue::request_mint_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, &config, MINT_AMT, &clock, &mut ctx,
        );

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== Reject AFTER wait period — still works (vetoes a ripe request) =====

    #[test]
    fun test_reject_after_wait_still_vetoes() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut queue = mint_burn_queue::create_for_testing(TRIBE_ID, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        tribe_vault::fund_for_testing(&mut vault, VAULT_FUND, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);

        let req_id = mint_burn_queue::request_mint_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, &config, MINT_AMT, &clock, &mut ctx,
        );
        clock::increment_for_testing(&mut clock, WAIT_MS + 1);
        // Reject after wait — still valid since status is PENDING
        mint_burn_queue::reject_request_as_leader(
            &cap, &tribe_gov, &mut queue, &vault, &ledger, req_id, &clock, &mut ctx,
        );
        assert!(mint_burn_queue::request_status(&queue, req_id) == mint_burn_queue::status_rejected(), 0);

        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(queue);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
