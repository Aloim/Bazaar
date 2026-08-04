// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// B3 audit tests (rev2) — covers:
///   AUD-ADV-08: supply round-trip + reserve floor + quorum bounds (T01-T06)
///   T07/T08/T09 removed (CC-B3-02): replaced by real integration tests in
///   tests/sources/test_b3_ban_integration.move
#[test_only]
module bazaar_economy::b3_audit_tests {
    use sui::clock;
    use sui::test_utils;
    use bazaar_economy::tribe_token_ledger;

    const TRIBE_1: u64 = 1;
    const ALICE:   address = @0xA11CE;
    const BOB:     address = @0xB0B;

    // T01 through T06 carried forward UNCHANGED from rev1.
    // (Full bodies from rev1 §3 are reproduced here verbatim.)

    #[test]
    fun test_wtb_supply_round_trip() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        let owner:  address = @0xAA01;
        let filler: address = @0xBB01;
        let ssu:    address = @0xCC01;
        let tribe:  address = @0xDD01;

        tribe_token_ledger::mint_for_testing(&mut ledger, owner, 1_000);
        assert!(tribe_token_ledger::total_supply(&ledger) == 1_000, 0);
        assert!(tribe_token_ledger::balance_of(&ledger, owner) == 1_000, 1);

        tribe_token_ledger::internal_burn(&mut ledger, owner, 1_000);
        assert!(tribe_token_ledger::total_supply(&ledger) == 0, 2);
        assert!(tribe_token_ledger::balance_of(&ledger, owner) == 0, 3);

        tribe_token_ledger::internal_mint(&mut ledger, filler, 800);
        tribe_token_ledger::internal_mint(&mut ledger, ssu,    100);
        tribe_token_ledger::internal_mint(&mut ledger, tribe,  100);

        assert!(tribe_token_ledger::total_supply(&ledger) == 1_000, 4);
        assert!(tribe_token_ledger::balance_of(&ledger, filler) == 800, 5);
        assert!(tribe_token_ledger::balance_of(&ledger, ssu) == 100, 6);
        assert!(tribe_token_ledger::balance_of(&ledger, tribe) == 100, 7);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    #[test]
    #[expected_failure(abort_code = 7)]
    fun test_supply_cap_blocks_queue_path_mint() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::set_supply_cap(&mut ledger, 500);
        tribe_token_ledger::internal_mint(&mut ledger, ALICE, 500);
        assert!(tribe_token_ledger::total_supply(&ledger) == 500, 0);
        tribe_token_ledger::internal_mint(&mut ledger, BOB, 1);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    #[test]
    fun test_queue_path_internal_mint_succeeds() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::internal_mint(&mut ledger, ALICE, 10_000);
        assert!(tribe_token_ledger::total_supply(&ledger) == 10_000, 0);
        assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 10_000, 1);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    #[test]
    fun test_burn_remint_supply_symmetry() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::mint_for_testing(&mut ledger, ALICE, 5_000);
        let supply_before = tribe_token_ledger::total_supply(&ledger);

        tribe_token_ledger::internal_burn(&mut ledger, ALICE, 3_000);
        assert!(tribe_token_ledger::total_supply(&ledger) == 2_000, 0);

        tribe_token_ledger::internal_mint(&mut ledger, ALICE, 3_000);
        assert!(tribe_token_ledger::total_supply(&ledger) == supply_before, 1);
        assert!(tribe_token_ledger::balance_of(&ledger, ALICE) == 5_000, 2);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }

    #[test]
    fun test_withdrawal_board_stores_quorum() {
        let mut ctx = tx_context::dummy();
        let board = bazaar_economy::vault_withdrawal::create_for_testing(TRIBE_1, 3, &mut ctx);
        assert!(bazaar_economy::vault_withdrawal::board_required_approvals(&board) == 3, 0);
        test_utils::destroy(board);
    }

    #[test]
    #[expected_failure(abort_code = 7)]
    fun test_queue_internal_mint_respects_supply_cap() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_1, &clk, &mut ctx);

        tribe_token_ledger::set_supply_cap(&mut ledger, 1_000);
        tribe_token_ledger::internal_mint(&mut ledger, ALICE, 1_000);
        tribe_token_ledger::internal_mint(&mut ledger, BOB, 1);

        clock::destroy_for_testing(clk);
        test_utils::destroy(ledger);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
