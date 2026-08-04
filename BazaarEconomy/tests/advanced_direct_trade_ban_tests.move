// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// R-C — Advanced Direct Trade ban-enforcement tests (AUD residual fold-in, V36).
///
/// Real multi-sender `test_scenario` tests that drive the PRODUCTION entry functions
/// (propose / accept / cancel) end-to-end — NOT abort-sentinel stubs. They prove:
///   RC-01  a banned proposer cannot open a trade            (E_PLAYER_BANNED = 16)
///   RC-02  a banned receiver cannot accept a clean proposal (E_PLAYER_BANNED = 16)
///   RC-03  a banned proposer CAN still cancel + recover     (LEAD-02: recovery ungated)
///
/// The AdvancedTradeRegistry is constructed via the module's own `public(package)`
/// `create_advanced_trade_registry` (accessible from this in-package test) — no Shop or
/// world object is required, so the full entries run.
#[test_only]
module bazaar_economy::advanced_direct_trade_ban_tests {
    use sui::clock;
    use sui::coin;
    use sui::test_scenario::{Self as ts};
    use sui::test_utils;
    use EVE::EVE::EVE;
    use bazaar_core::ssu_governance::{Self};
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_economy::tribe_token_ledger;
    use bazaar_economy::advanced_direct_trade::{Self};

    const TRIBE_ID: u64   = 7;
    const SSU_ID:   address = @0x5ADD;
    const LEADER:   address = @0xA1;
    const ALICE:    address = @0xA11CE;
    const BOB:      address = @0xB0B;
    const ONE_HOUR_MS: u64 = 3_600_001;
    const OFFER_EVE: u64   = 100;

    // ===== RC-01: banned proposer cannot open a trade =====
    #[test]
    #[expected_failure(abort_code = 16, location = bazaar_economy::advanced_direct_trade)]
    fun rc01_banned_proposer_cannot_propose() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clk, ts::ctx(&mut scenario),
        );
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 2, LEADER, 0, &clk, ts::ctx(&mut scenario),
        );
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clk, ts::ctx(&mut scenario));
        let mut reg = advanced_direct_trade::create_advanced_trade_registry(TRIBE_ID, ts::ctx(&mut scenario));
        // ALICE is SSU-timed-banned → the propose ban gate must abort.
        ssu_governance::set_local_ban_for_testing(&mut ssu_gov, ALICE, ONE_HOUR_MS);
        let offer = coin::mint_for_testing<EVE>(OFFER_EVE, ts::ctx(&mut scenario));
        let _pid = advanced_direct_trade::propose_advanced_trade(
            &mut reg, &ssu_gov, &tribe_gov, &mut ledger,
            BOB, offer, 0, 0, 0, clk.timestamp_ms() + ONE_HOUR_MS,
            &clk, ts::ctx(&mut scenario),
        );
        // Unreachable past the abort.
        ssu_governance::destroy_for_testing(ssu_gov);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        test_utils::destroy(reg);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== RC-02: banned receiver cannot accept a clean proposal (multi-sender) =====
    #[test]
    #[expected_failure(abort_code = 16, location = bazaar_economy::advanced_direct_trade)]
    fun rc02_banned_receiver_cannot_accept() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clk, ts::ctx(&mut scenario),
        );
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 2, LEADER, 0, &clk, ts::ctx(&mut scenario),
        );
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clk, ts::ctx(&mut scenario));
        let mut reg = advanced_direct_trade::create_advanced_trade_registry(TRIBE_ID, ts::ctx(&mut scenario));
        // ALICE (clean) proposes to BOB: 100 mist EVE escrow, no token leg, request_eve = 0.
        let offer = coin::mint_for_testing<EVE>(OFFER_EVE, ts::ctx(&mut scenario));
        let pid = advanced_direct_trade::propose_advanced_trade(
            &mut reg, &ssu_gov, &tribe_gov, &mut ledger,
            BOB, offer, 0, 0, 0, clk.timestamp_ms() + ONE_HOUR_MS,
            &clk, ts::ctx(&mut scenario),
        );
        // Now BOB is banned, then BOB tries to accept.
        ssu_governance::set_local_ban_for_testing(&mut ssu_gov, BOB, ONE_HOUR_MS);
        ts::next_tx(&mut scenario, BOB);
        let pay = coin::zero<EVE>(ts::ctx(&mut scenario));
        advanced_direct_trade::accept_advanced_trade(
            &mut reg, &ssu_gov, &tribe_gov, &mut ledger, pid, pay, &clk, ts::ctx(&mut scenario),
        );
        // Unreachable.
        ssu_governance::destroy_for_testing(ssu_gov);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        test_utils::destroy(reg);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== RC-03: banned proposer CAN still cancel + recover (recovery ungated) =====
    #[test]
    fun rc03_banned_proposer_can_cancel_recover() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clk, ts::ctx(&mut scenario),
        );
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 2, LEADER, 0, &clk, ts::ctx(&mut scenario),
        );
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clk, ts::ctx(&mut scenario));
        let mut reg = advanced_direct_trade::create_advanced_trade_registry(TRIBE_ID, ts::ctx(&mut scenario));
        // ALICE proposes, THEN ALICE is banned, THEN ALICE cancels — must succeed.
        let offer = coin::mint_for_testing<EVE>(OFFER_EVE, ts::ctx(&mut scenario));
        let pid = advanced_direct_trade::propose_advanced_trade(
            &mut reg, &ssu_gov, &tribe_gov, &mut ledger,
            BOB, offer, 0, 0, 0, clk.timestamp_ms() + ONE_HOUR_MS,
            &clk, ts::ctx(&mut scenario),
        );
        ssu_governance::set_local_ban_for_testing(&mut ssu_gov, ALICE, ONE_HOUR_MS);
        advanced_direct_trade::cancel_advanced_trade(
            &mut reg, &ssu_gov, &tribe_gov, &mut ledger, pid, &clk, ts::ctx(&mut scenario),
        );
        // Recovery succeeded — proposal is CANCELLED despite the ban.
        assert!(
            advanced_direct_trade::proposal_status(&reg, pid)
                == advanced_direct_trade::status_cancelled(),
            0,
        );
        ssu_governance::destroy_for_testing(ssu_gov);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(ledger);
        test_utils::destroy(reg);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
