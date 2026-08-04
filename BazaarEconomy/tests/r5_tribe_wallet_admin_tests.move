// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V20 — tribe_token_ledger Tribe Wallet admin tests.
// Covers withdraw_from_tribe_wallet_as_{leader,super_admin} + deposit_to_tribe_wallet.

#[test_only]
module bazaar_economy::r5_tribe_wallet_admin_tests {
    use sui::clock;
    use sui::object;
    use sui::test_utils;
    use dapp_hub::tribe_registry;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_economy::tribe_token_ledger;

    const TRIBE_ID: u64 = 1;
    const OTHER_TRIBE_ID: u64 = 99;
    const LEADER: address = @0xA1;
    const PLAYER: address = @0xB1;

    // ===== withdraw_from_tribe_wallet_as_leader =====

    #[test]
    fun test_withdraw_as_leader_happy_path() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, 500);
        tribe_token_ledger::withdraw_from_tribe_wallet_as_leader(
            &cap, &tribe_gov, &mut ledger, PLAYER, 200, &clock, &mut ctx,
        );
        assert!(tribe_token_ledger::balance_of(&ledger, gov_addr) == 300, 0);
        assert!(tribe_token_ledger::balance_of(&ledger, PLAYER) == 200, 1);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = tribe_token_ledger::E_WRONG_TRIBE)]
    fun test_withdraw_as_leader_wrong_tribe() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Cap claims tribe 99, gov + ledger are tribe 1 — mismatch.
        let cap = tribe_registry::create_leader_cap_for_testing(OTHER_TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, 500);
        tribe_token_ledger::withdraw_from_tribe_wallet_as_leader(
            &cap, &tribe_gov, &mut ledger, PLAYER, 100, &clock, &mut ctx,
        );
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = tribe_token_ledger::E_INSUFFICIENT_BALANCE)]
    fun test_withdraw_as_leader_insufficient_balance() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, 50);
        // Wallet only has 50; try to withdraw 100.
        tribe_token_ledger::withdraw_from_tribe_wallet_as_leader(
            &cap, &tribe_gov, &mut ledger, PLAYER, 100, &clock, &mut ctx,
        );
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_withdraw_as_leader_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        // bazaar_type=1 (Easy) — should abort.
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        tribe_token_ledger::withdraw_from_tribe_wallet_as_leader(
            &cap, &tribe_gov, &mut ledger, PLAYER, 1, &clock, &mut ctx,
        );
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== withdraw_from_tribe_wallet_as_super_admin =====

    #[test]
    fun test_withdraw_as_super_admin_happy_path() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let sa_cap = tribe_governance_test_helpers::create_super_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, 1000);
        tribe_token_ledger::withdraw_from_tribe_wallet_as_super_admin(
            &sa_cap, &tribe_gov, &mut ledger, PLAYER, 250, &clock, &mut ctx,
        );
        assert!(tribe_token_ledger::balance_of(&ledger, gov_addr) == 750, 0);
        assert!(tribe_token_ledger::balance_of(&ledger, PLAYER) == 250, 1);
        test_utils::destroy(sa_cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = tribe_token_ledger::E_WRONG_TRIBE)]
    fun test_withdraw_as_super_admin_wrong_tribe() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let sa_cap = tribe_governance_test_helpers::create_super_admin_cap_for_testing(OTHER_TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, 500);
        tribe_token_ledger::withdraw_from_tribe_wallet_as_super_admin(
            &sa_cap, &tribe_gov, &mut ledger, PLAYER, 100, &clock, &mut ctx,
        );
        test_utils::destroy(sa_cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== deposit_to_tribe_wallet =====

    #[test]
    fun test_deposit_to_tribe_wallet_happy_path() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let gov_addr = object::id_address(&tribe_gov);
        // dummy ctx sender is @0x0
        let dummy_sender = @0x0;
        tribe_token_ledger::mint_for_testing(&mut ledger, dummy_sender, 1000);
        tribe_token_ledger::deposit_to_tribe_wallet(
            &tribe_gov, &mut ledger, 400, &clock, &mut ctx,
        );
        assert!(tribe_token_ledger::balance_of(&ledger, dummy_sender) == 600, 0);
        assert!(tribe_token_ledger::balance_of(&ledger, gov_addr) == 400, 1);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = tribe_token_ledger::E_INSUFFICIENT_BALANCE)]
    fun test_deposit_insufficient_caller_balance() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let dummy_sender = @0x0;
        tribe_token_ledger::mint_for_testing(&mut ledger, dummy_sender, 10);
        // Caller has 10; try to deposit 50.
        tribe_token_ledger::deposit_to_tribe_wallet(
            &tribe_gov, &mut ledger, 50, &clock, &mut ctx,
        );
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_deposit_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let dummy_sender = @0x0;
        tribe_token_ledger::mint_for_testing(&mut ledger, dummy_sender, 100);
        tribe_token_ledger::deposit_to_tribe_wallet(
            &tribe_gov, &mut ledger, 10, &clock, &mut ctx,
        );
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
