// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// R5.2.b.2 — vault_withdrawal bazaar-type gate tests (12 tests)
// Reject = Easy gov (type=1) → E_NOT_ADVANCED_BAZAAR
// Accept = Advanced gov (type=2) → no abort
//
// V15 update: every vault_withdrawal entry fn now takes &TribeTokenLedger
// (and approve/deny/cancel/expire also take &TribeVault) so FinanceEvent can
// snapshot eve_reserve + circulation. Tests build a stub ledger via
// tribe_token_ledger::create_for_testing.

#[test_only]
module bazaar_economy::r5_withdrawal_tests {
    use sui::clock;
    use sui::test_utils;
    use dapp_hub::tribe_registry;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_economy::vault_withdrawal;
    use bazaar_economy::tribe_vault;
    use bazaar_economy::tribe_exchange;
    use bazaar_economy::tribe_token_ledger;

    const TRIBE_ID: u64 = 1;
    const LEADER: address = @0xA1;
    const RESERVE: u64 = 100_000_000;

    // ===== request_withdrawal =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_request_withdrawal_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        vault_withdrawal::request_withdrawal(&cap, &tribe_gov, &mut board, &vault, &ledger, 100, b"test", &clock, &mut ctx);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = bazaar_economy::vault_withdrawal::E_INSUFFICIENT_VAULT)]
    fun test_request_withdrawal_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        // Type gate + coherence pass; empty vault → E_INSUFFICIENT_VAULT confirms gate was crossed
        vault_withdrawal::request_withdrawal(&cap, &tribe_gov, &mut board, &vault, &ledger, 100, b"test", &clock, &mut ctx);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== approve_request =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_approve_request_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        vault_withdrawal::approve_request(&cap, &tribe_gov, &mut board, &vault, &ledger, 0, &clock, &mut ctx);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = vault_withdrawal::E_REQUEST_NOT_FOUND)]
    fun test_approve_request_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        // Type gate passes; then E_REQUEST_NOT_FOUND fires (board is empty)
        vault_withdrawal::approve_request(&cap, &tribe_gov, &mut board, &vault, &ledger, 0, &clock, &mut ctx);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== deny_request =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_deny_request_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        vault_withdrawal::deny_request(&cap, &tribe_gov, &mut board, &vault, &ledger, 0, &clock, &mut ctx);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = vault_withdrawal::E_REQUEST_NOT_FOUND)]
    fun test_deny_request_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        vault_withdrawal::deny_request(&cap, &tribe_gov, &mut board, &vault, &ledger, 0, &clock, &mut ctx);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== execute_withdrawal =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_execute_withdrawal_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        vault_withdrawal::execute_withdrawal(&cap, &tribe_gov, &mut board, &mut vault, &config, &ledger, 0, &clock, &mut ctx);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = vault_withdrawal::E_REQUEST_NOT_FOUND)]
    fun test_execute_withdrawal_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        vault_withdrawal::execute_withdrawal(&cap, &tribe_gov, &mut board, &mut vault, &config, &ledger, 0, &clock, &mut ctx);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== cancel_request =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_cancel_request_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        vault_withdrawal::cancel_request(&cap, &tribe_gov, &mut board, &vault, &ledger, 0, &clock, &mut ctx);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = vault_withdrawal::E_REQUEST_NOT_FOUND)]
    fun test_cancel_request_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        vault_withdrawal::cancel_request(&cap, &tribe_gov, &mut board, &vault, &ledger, 0, &clock, &mut ctx);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== expire_request =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_expire_request_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        vault_withdrawal::expire_request(&tribe_gov, &mut board, &vault, &ledger, 0, &clock, &mut ctx);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = vault_withdrawal::E_REQUEST_NOT_FOUND)]
    fun test_expire_request_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut board = vault_withdrawal::create_for_testing(TRIBE_ID, 1, &mut ctx);
        let vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        // Type gate passes; then E_REQUEST_NOT_FOUND fires (board empty)
        vault_withdrawal::expire_request(&tribe_gov, &mut board, &vault, &ledger, 0, &clock, &mut ctx);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        test_utils::destroy(vault);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
