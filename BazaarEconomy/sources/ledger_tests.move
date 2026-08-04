// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_economy::ledger_tests {
    use sui::clock;
    use sui::test_utils;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};

    // ===== Test Constants =====
    const ALICE: address = @0xA11CE;
    const BOB:   address = @0xB0B;
    const TRIBE_1: u64 = 1;

    // ===== T01: create_ledger initial state =====

    #[test]
    fun test_create_ledger() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);

        let ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        assert!(tribe_token_ledger::tribe_id(&ledger) == TRIBE_1, 0);
        assert!(tribe_token_ledger::total_supply(&ledger) == 0, 1);
        assert!(tribe_token_ledger::supply_cap(&ledger) == 0, 2);
        assert!(!tribe_token_ledger::is_frozen(&ledger), 3);
        // V26+ — TribeTokenLedger.decimals is initialized to 2 (scaled-unit
        // convention). All u64 balance fields are stored in scaled units.
        assert!(tribe_token_ledger::decimals(&ledger) == 2, 4);
        // balance_of returns 0 for an address that has no account entry
        assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 0, 5);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T02: internal_mint increases balance and total_supply =====

    #[test]
    fun test_internal_mint() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::internal_mint(&mut ledger, ALICE, 1_000);
        assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 1_000, 0);
        assert!(tribe_token_ledger::total_supply(&ledger) == 1_000, 1);

        // Mint more to same address — balances accumulate
        tribe_token_ledger::internal_mint(&mut ledger, ALICE, 500);
        assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 1_500, 2);
        assert!(tribe_token_ledger::total_supply(&ledger) == 1_500, 3);

        // Mint to a different address
        tribe_token_ledger::internal_mint(&mut ledger, BOB, 200);
        assert!(tribe_token_ledger::balance_of(&ledger, BOB) == 200, 4);
        assert!(tribe_token_ledger::total_supply(&ledger) == 1_700, 5);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T03: internal_burn decreases balance and total_supply =====

    #[test]
    fun test_internal_burn() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::mint_for_testing(&mut ledger, ALICE, 1_000);

        tribe_token_ledger::internal_burn(&mut ledger, ALICE, 300);
        assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 700, 0);
        assert!(tribe_token_ledger::total_supply(&ledger) == 700, 1);

        // Burn all remaining
        tribe_token_ledger::internal_burn(&mut ledger, ALICE, 700);
        assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 0, 2);
        assert!(tribe_token_ledger::total_supply(&ledger) == 0, 3);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T04: balance_of returns 0 for unknown address =====

    #[test]
    fun test_balance_of_unregistered() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        // No accounts created — any address returns 0
        assert!(tribe_token_ledger::balance_of(&ledger, @0xDEAD) == 0, 0);
        assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 0, 1);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T05: burn_insufficient_balance aborts (E_INSUFFICIENT_BALANCE = 1) =====

    #[test]
    #[expected_failure(abort_code = 1)]
    fun test_burn_insufficient_balance_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::mint_for_testing(&mut ledger, ALICE, 100);
        // Attempt to burn more than balance — must abort with code 1
        tribe_token_ledger::internal_burn(&mut ledger, ALICE, 200);

        // Unreachable cleanup
        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T06: mint zero amount aborts (E_ZERO_AMOUNT = 5) =====

    #[test]
    #[expected_failure(abort_code = 5)]
    fun test_mint_zero_amount_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        // Zero amount is rejected by internal_mint assert!(amount > 0, E_ZERO_AMOUNT)
        tribe_token_ledger::internal_mint(&mut ledger, ALICE, 0);

        // Unreachable cleanup
        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T07: frozen ledger blocks debit (E_LEDGER_FROZEN = 4) =====

    #[test]
    #[expected_failure(abort_code = 4)]
    fun test_frozen_ledger_blocks_debit() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        // mint_for_testing calls internal_mint which does NOT check frozen — safe to call before freeze
        tribe_token_ledger::mint_for_testing(&mut ledger, ALICE, 1_000);
        tribe_token_ledger::set_frozen(&mut ledger, true);

        // debit checks is_frozen first and aborts with code 4
        tribe_token_ledger::debit(&mut ledger, ALICE, 100);

        // Unreachable cleanup
        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T08: frozen ledger blocks credit (E_LEDGER_FROZEN = 4) =====

    #[test]
    #[expected_failure(abort_code = 4)]
    fun test_frozen_ledger_blocks_credit() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::set_frozen(&mut ledger, true);

        // credit checks is_frozen first and aborts with code 4
        tribe_token_ledger::credit(&mut ledger, ALICE, 100);

        // Unreachable cleanup
        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T09a: supply cap at exact limit succeeds =====

    #[test]
    fun test_supply_cap_at_limit() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::set_supply_cap(&mut ledger, 500);
        // Minting exactly to cap must succeed
        tribe_token_ledger::internal_mint(&mut ledger, ALICE, 500);
        assert!(tribe_token_ledger::total_supply(&ledger) == 500, 0);
        assert!(tribe_token_ledger::supply_cap(&ledger) == 500, 1);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T09b: supply cap exceeded aborts (E_SUPPLY_CAP_EXCEEDED = 7) =====

    #[test]
    #[expected_failure(abort_code = 7)]
    fun test_supply_cap_exceeded_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::set_supply_cap(&mut ledger, 500);
        tribe_token_ledger::internal_mint(&mut ledger, ALICE, 500);
        // One more token exceeds cap — must abort with code 7
        tribe_token_ledger::internal_mint(&mut ledger, BOB, 1);

        // Unreachable cleanup
        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T10: safe_add overflow aborts (E_OVERFLOW = 2) =====

    #[test]
    #[expected_failure(abort_code = 2)]
    fun test_safe_add_overflow_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        // First mint sets ALICE balance to u64::MAX
        let u64_max: u64 = 18_446_744_073_709_551_615;
        // We cannot directly set supply_cap to 0 after setting, so use uncapped ledger (supply_cap=0).
        // internal_mint calls safe_add on the balance. We need the balance to be near u64::MAX.
        // Mint max value to ALICE:
        tribe_token_ledger::internal_mint(&mut ledger, ALICE, u64_max);
        // Attempt to mint 1 more — safe_add(u64_max, 1) on the balance triggers E_OVERFLOW
        tribe_token_ledger::internal_mint(&mut ledger, ALICE, 1);

        // Unreachable cleanup
        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    // ===== T11: debit/credit do not change total_supply =====

    #[test]
    fun test_debit_credit_invariants() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::mint_for_testing(&mut ledger, ALICE, 1_000);
        assert!(tribe_token_ledger::total_supply(&ledger) == 1_000, 0);

        // debit: moves balance, does NOT change total_supply
        tribe_token_ledger::debit(&mut ledger, ALICE, 400);
        assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 600, 1);
        assert!(tribe_token_ledger::total_supply(&ledger) == 1_000, 2);

        // credit: moves balance, does NOT change total_supply
        tribe_token_ledger::credit(&mut ledger, BOB, 400);
        assert!(tribe_token_ledger::balance_of(&ledger, BOB) == 400, 3);
        assert!(tribe_token_ledger::total_supply(&ledger) == 1_000, 4);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
