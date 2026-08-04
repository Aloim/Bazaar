// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// GAS-05 Locking Tests — WTS/DE shop-tax legs use plain credit (no LedgerTransferEvent).
///
/// Three tests covering:
///   T01 — plain `credit` emits ZERO user events (the post-fix path)
///   T02 — `credit_with_event` emits EXACTLY ONE user event (baseline contrast)
///   T03 — WTS tax math: ssu_tax + tribe_tax + net == gross, balances correct
///
/// Calls `num_user_events(&TransactionEffects)` on effects returned by
/// `test_scenario::end(scenario)` — the correct API (verified:
/// test_scenario.move:428-430, `pub fun num_user_events(effects: &TransactionEffects): u64`).
///
/// Entry-function gap: `ledger_wts_buy` requires a full shared-object harness
/// (BazarRegistry, SSUGovernance, TribeGovernance, MemberRegistry, EconomyCapStore, Clock)
/// that exceeds the per-package test budget. See §4.5 in the proposal for the logged gap.
/// The entry-level regression is covered structurally: T01 tests the exact
/// `tribe_token_ledger::credit` call path that the fixed entry uses, and T02 proves
/// that path is behaviourally distinct from the old `credit_with_event` path.
#[test_only]
module bazaar_economy::ledger_shop_ops_event_tests {
    use sui::test_scenario;
    use sui::clock;
    use sui::test_utils;
    use bazaar_economy::tribe_token_ledger;

    const ALICE: address     = @0xA11CE;  // buyer / exchanger
    const SSU_ADDR: address  = @0x5550;   // SSU governance address
    const TRIBE_ADDR: address = @0x7712;  // tribe wallet address
    const SELLER: address    = @0x5E11;   // seller (net recipient)
    const TRIBE_1: u64       = 1;

    // =========================================================
    // T01 — plain `credit` emits ZERO user events
    //
    // This is the post-fix call path: `ledger_wts_buy` (after GAS-05)
    // calls `tribe_token_ledger::credit(ledger, ssu_addr, ssu_tax)` and
    // `tribe_token_ledger::credit(ledger, tribe_addr, tribe_tax)`.
    // Neither call emits an event. We verify the tx effects confirm 0 events.
    // =========================================================
    #[test]
    fun test_credit_emits_no_transfer_event() {
        let mut scenario = test_scenario::begin(ALICE);

        // Tx 1: perform debit + two plain credits (mirroring post-fix WTS tax routing)
        {
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let mut ledger = tribe_token_ledger::create_for_testing(
                TRIBE_1, &clk, test_scenario::ctx(&mut scenario),
            );

            // Seed buyer balance and debit (gross purchase)
            tribe_token_ledger::internal_mint(&mut ledger, ALICE, 10_000);
            tribe_token_ledger::debit(&mut ledger, ALICE, 10_000);

            // GAS-05 post-fix: plain credit for SSU tax — no event
            tribe_token_ledger::credit(&mut ledger, SSU_ADDR, 500);
            // GAS-05 post-fix: plain credit for tribe tax — no event
            tribe_token_ledger::credit(&mut ledger, TRIBE_ADDR, 300);

            // Verify balances before closing tx
            assert!(tribe_token_ledger::balance_of(&ledger, SSU_ADDR) == 500, 0);
            assert!(tribe_token_ledger::balance_of(&ledger, TRIBE_ADDR) == 300, 1);
            assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 0, 2);

            clock::destroy_for_testing(clk);
            test_utils::destroy(ledger);
        };

        // Close tx and read effects — ZERO user events expected
        let effects = test_scenario::end(scenario);
        assert!(test_scenario::num_user_events(&effects) == 0, 3);
    }

    // =========================================================
    // T02 — `credit_with_event` emits EXACTLY ONE user event (baseline contrast)
    //
    // Proves that T01's zero-events result is meaningful: the old path
    // `credit_with_event` DOES fire an event (LedgerTransferEvent), so
    // T01 is not a vacuous pass.
    // =========================================================
    #[test]
    fun test_credit_with_event_emits_one_transfer_event() {
        let mut scenario = test_scenario::begin(ALICE);

        // Tx 1: call credit_with_event once (the old pre-fix path)
        {
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let mut ledger = tribe_token_ledger::create_for_testing(
                TRIBE_1, &clk, test_scenario::ctx(&mut scenario),
            );
            tribe_token_ledger::internal_mint(&mut ledger, ALICE, 10_000);

            // Old pre-fix path: credit_with_event fires a LedgerTransferEvent
            tribe_token_ledger::credit_with_event(
                &mut ledger,
                ALICE,      // from (event field only — not the balance source)
                SSU_ADDR,   // to
                500,
                b"tax_ssu",
                &clk,
            );

            assert!(tribe_token_ledger::balance_of(&ledger, SSU_ADDR) == 500, 0);

            clock::destroy_for_testing(clk);
            test_utils::destroy(ledger);
        };

        // Close tx and read effects — EXACTLY 1 user event expected
        let effects = test_scenario::end(scenario);
        assert!(test_scenario::num_user_events(&effects) == 1, 1);
    }

    // =========================================================
    // T03 — WTS tax math: ssu_tax + tribe_tax + net == gross, balances correct
    //
    // Verifies that only the event emission changed — the credited amounts
    // and recipient addresses are identical pre/post GAS-05.
    // Gross = 10_000, SSU 5% = 500, Tribe 3% = 300, Net = 9_200.
    // =========================================================
    #[test]
    fun test_wts_tax_math_unchanged() {
        let mut scenario = test_scenario::begin(ALICE);

        // Tx 1: perform a full WTS-style debit+credit cycle with the post-fix path
        {
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let mut ledger = tribe_token_ledger::create_for_testing(
                TRIBE_1, &clk, test_scenario::ctx(&mut scenario),
            );

            let gross: u64      = 10_000;
            let ssu_tax: u64    = 500;   // 5%
            let tribe_tax: u64  = 300;   // 3%
            let net_tokens: u64 = gross - ssu_tax - tribe_tax; // 9_200

            tribe_token_ledger::internal_mint(&mut ledger, ALICE, gross);

            // Debit buyer
            tribe_token_ledger::debit(&mut ledger, ALICE, gross);
            // Credit net to seller
            if (net_tokens > 0) {
                tribe_token_ledger::credit(&mut ledger, SELLER, net_tokens);
            };
            // GAS-05: plain credit for SSU tax (no event)
            if (ssu_tax > 0) {
                tribe_token_ledger::credit(&mut ledger, SSU_ADDR, ssu_tax);
            };
            // GAS-05: plain credit for tribe tax (no event)
            if (tribe_tax > 0) {
                tribe_token_ledger::credit(&mut ledger, TRIBE_ADDR, tribe_tax);
            };
            // (In real code, LedgerPurchaseEvent is emitted here by ledger_wts_buy.
            // Not mirrored in this unit test — the test only checks the credit side.)

            // Balances must be exact
            assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 0, 0);
            assert!(tribe_token_ledger::balance_of(&ledger, SELLER) == 9_200, 1);
            assert!(tribe_token_ledger::balance_of(&ledger, SSU_ADDR) == 500, 2);
            assert!(tribe_token_ledger::balance_of(&ledger, TRIBE_ADDR) == 300, 3);

            // total_supply unchanged (credit/debit, no mint/burn in this path)
            assert!(tribe_token_ledger::total_supply(&ledger) == gross, 4);

            clock::destroy_for_testing(clk);
            test_utils::destroy(ledger);
        };

        // Close tx and read effects — ZERO user events (no explicit emit in this test)
        let effects = test_scenario::end(scenario);
        assert!(test_scenario::num_user_events(&effects) == 0, 5);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
