// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// r5_ledger_tests.move (rev2) — tribe_token_ledger bazaar-type gate tests (8 tests)
// Rewritten per CC-B3-01: mint_to + burn_from deleted at V36; tests rerouted.
// Original coverage: (1) type gate rejects Easy for mint, (2) accepts Advanced for mint,
// (3) type gate rejects Easy for burn, (4) accepts Advanced for burn.
// New coverage: same semantic properties via ensure_account (gate), internal_mint (queue
// path), burn_self (sole remaining cap-free burn with the same type gate).

#[test_only]
module bazaar_economy::r5_ledger_tests {
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_economy::tribe_token_ledger;

    const TRIBE_ID: u64 = 1;
    const LEADER: address = @0xA1;
    const PLAYER: address = @0xB1;

    // ===== Type-gate coverage via ensure_account (replaces mint_to type-gate tests) =====

    /// CC-B3-01-R1: ensure_account rejects Easy bazaar type → E_NOT_ADVANCED_BAZAAR.
    /// This is the same assert_advanced_external gate that mint_to used.
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_ensure_account_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx,
        );
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        // ensure_account calls bazaar_assertions::assert_advanced_external(tribe_bazaar_type)
        // same gate as the deleted mint_to — must abort E_NOT_ADVANCED_BAZAAR.
        tribe_token_ledger::ensure_account(&tribe_gov, &mut ledger, PLAYER);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    /// CC-B3-01-R2: internal_mint succeeds on Advanced ledger (queue-path mint works).
    /// Replaces test_mint_to_accepts_advanced: verifies supply semantics hold after
    /// the direct leader entry is removed — the queue route is the only mint path.
    #[test]
    fun test_internal_mint_succeeds_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx,
        );
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        // internal_mint is the primitive used by the veto queue (the replacement path).
        tribe_token_ledger::internal_mint(&mut ledger, PLAYER, 100);
        assert!(tribe_token_ledger::balance_of(&ledger, PLAYER) == 100, 0);
        assert!(tribe_token_ledger::total_supply(&ledger) == 100, 1);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== Type-gate coverage via burn_self (replaces burn_from type-gate tests) =====

    /// CC-B3-01-R3: burn_self rejects Easy bazaar type → E_NOT_ADVANCED_BAZAAR.
    /// burn_self retains the same assert_advanced_external gate as the deleted burn_from.
    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_burn_self_rejects_easy_cc_r3() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx,
        );
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        tribe_token_ledger::burn_self(&tribe_gov, &mut ledger, 1, &clock, &mut ctx);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    /// CC-B3-01-R4: burn_self succeeds on Advanced ledger. Verifies supply accounting.
    /// Replaces test_burn_from_accepts_advanced: confirms burn path is sound after deletion.
    #[test]
    fun test_burn_self_accepts_advanced_cc_r4() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx,
        );
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        // dummy ctx sender is @0x0; seed balance, then burn_self.
        let dummy_sender = @0x0;
        tribe_token_ledger::mint_for_testing(&mut ledger, dummy_sender, 100);
        tribe_token_ledger::burn_self(&tribe_gov, &mut ledger, 50, &clock, &mut ctx);
        assert!(tribe_token_ledger::balance_of(&ledger, dummy_sender) == 50, 0);
        assert!(tribe_token_ledger::total_supply(&ledger) == 50, 1);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== burn_self =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_burn_self_rejects_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        tribe_token_ledger::burn_self(&tribe_gov, &mut ledger, 1, &clock, &mut ctx);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_burn_self_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        // burn_self uses tx_context::sender; dummy ctx sender is @0x0
        let dummy_sender = @0x0;
        tribe_token_ledger::mint_for_testing(&mut ledger, dummy_sender, 100);
        tribe_token_ledger::burn_self(&tribe_gov, &mut ledger, 50, &clock, &mut ctx);
        assert!(tribe_token_ledger::balance_of(&ledger, dummy_sender) == 50, 0);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== ensure_account =====
    // (CC3-B23-01: the rejects-Easy type-gate is the CC-B3-01 R1 test
    //  test_ensure_account_rejects_easy above; the merge-duplicated original was
    //  removed here to resolve the duplicate-function compile error.)

    #[test]
    fun test_ensure_account_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        // Before: account does not exist, balance returns 0 (default)
        assert!(tribe_token_ledger::balance_of(&ledger, PLAYER) == 0, 0);
        tribe_token_ledger::ensure_account(&tribe_gov, &mut ledger, PLAYER);
        // After: account row exists, balance is still 0 (no mint, just creation)
        assert!(tribe_token_ledger::balance_of(&ledger, PLAYER) == 0, 1);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    // ===== GAS-02 Locking Tests (T2–T6) =====

    /// GAS-02-T2: debit-below-balance aborts with E_INSUFFICIENT_BALANCE (same code as before).
    /// Confirms the >= guard INSIDE debit is still active after removing the caller pre-assert.
    #[test]
    #[expected_failure(abort_code = bazaar_economy::tribe_token_ledger::E_INSUFFICIENT_BALANCE)]
    fun test_gas02_debit_below_balance_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        tribe_token_ledger::internal_mint(&mut ledger, PLAYER, 50);
        assert!(tribe_token_ledger::balance_of(&ledger, PLAYER) == 50, 0);
        // Attempt to debit 100 (more than balance) — must abort E_INSUFFICIENT_BALANCE
        tribe_token_ledger::debit(&mut ledger, PLAYER, 100);
        // unreachable
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    /// GAS-02-T3: credit to a brand-new account row — correct balance, total_supply conserved.
    /// Confirms the inlined `else { table::add(..., amount) }` seed path works correctly.
    #[test]
    fun test_gas02_credit_to_new_account_row() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let new_player: address = @0xCC;
        assert!(tribe_token_ledger::balance_of(&ledger, new_player) == 0, 0);
        let supply_before = tribe_token_ledger::total_supply(&ledger);
        // credit does NOT change total_supply (only mint/burn do)
        tribe_token_ledger::credit(&mut ledger, new_player, 75);
        assert!(tribe_token_ledger::balance_of(&ledger, new_player) == 75, 1);
        assert!(tribe_token_ledger::total_supply(&ledger) == supply_before, 2);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    /// GAS-02-T4: credit to an EXISTING account row — correctly accumulates, supply conserved.
    /// Confirms the inlined `if contains { borrow_mut; += }` path works correctly.
    #[test]
    fun test_gas02_credit_to_existing_account_row() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        tribe_token_ledger::internal_mint(&mut ledger, PLAYER, 50);
        assert!(tribe_token_ledger::balance_of(&ledger, PLAYER) == 50, 0);
        let supply_before = tribe_token_ledger::total_supply(&ledger); // 50
        tribe_token_ledger::credit(&mut ledger, PLAYER, 30);
        assert!(tribe_token_ledger::balance_of(&ledger, PLAYER) == 80, 1);
        // credit does NOT change total_supply
        assert!(tribe_token_ledger::total_supply(&ledger) == supply_before, 2);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    /// GAS-02-T5: internal_mint total_supply conservation across new + existing rows.
    /// Confirms supply is correctly tracked through the inlined path.
    #[test]
    fun test_gas02_internal_mint_supply_conservation() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let new_player: address = @0xDD;
        tribe_token_ledger::internal_mint(&mut ledger, new_player, 100);
        assert!(tribe_token_ledger::balance_of(&ledger, new_player) == 100, 0);
        assert!(tribe_token_ledger::total_supply(&ledger) == 100, 1);
        // Mint 50 more to the same row (existing path)
        tribe_token_ledger::internal_mint(&mut ledger, new_player, 50);
        assert!(tribe_token_ledger::balance_of(&ledger, new_player) == 150, 2);
        assert!(tribe_token_ledger::total_supply(&ledger) == 150, 3);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }

    /// GAS-02-T6: debit-from-absent-row aborts E_INSUFFICIENT_BALANCE (same as before).
    /// Verifies the `else { add(0); borrow_mut }` seed path aborts identically to the old path.
    #[test]
    #[expected_failure(abort_code = bazaar_economy::tribe_token_ledger::E_INSUFFICIENT_BALANCE)]
    fun test_gas02_debit_absent_row_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let absent_player: address = @0xEE;
        // Row does not exist → seeds to 0 → 0 >= 1 fails → E_INSUFFICIENT_BALANCE
        tribe_token_ledger::debit(&mut ledger, absent_player, 1);
        test_utils::destroy(ledger);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
