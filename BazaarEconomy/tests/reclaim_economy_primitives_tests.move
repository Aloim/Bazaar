// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Update Ceremony V2 — Phase 2 (Slice 3) unit tests for the bazaar_economy reclaim
// primitives:
//   - tribe_token_ledger::create_for_reclaim (empty, caller decimals/cap)
//   - tribe_token_ledger::mint_for_reclaim   (re-grows supply; supply-cap assert)
//   - tribe_vault::deposit_reclaimed_vault_eve (leader-gated; zero-tolerant)

#[test_only]
module bazaar_economy::reclaim_economy_primitives_tests {
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use dapp_hub::tribe_registry;
    use bazaar_economy::tribe_token_ledger as ledger;
    use bazaar_economy::tribe_vault;

    const TRIBE_ID:    u64 = 7;
    const OTHER_TRIBE: u64 = 99;
    const ALICE:       address = @0xA11CE;
    const BOB:         address = @0xB0B;

    // ===== tribe_token_ledger::create_for_reclaim + mint_for_reclaim =====

    #[test]
    fun create_for_reclaim_then_mint_regrows_supply() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut l = ledger::create_for_reclaim(TRIBE_ID, b"GoldCoin", b"GLD", 6, 1_000, &clock, &mut ctx);

        assert!(ledger::total_supply(&l) == 0, 0);
        assert!(ledger::supply_cap(&l) == 1_000, 1);
        assert!(ledger::decimals(&l) == 6, 2);

        ledger::mint_for_reclaim(&mut l, ALICE, 600, &clock);
        ledger::mint_for_reclaim(&mut l, BOB, 400, &clock);
        assert!(ledger::balance_of(&l, ALICE) == 600, 3);
        assert!(ledger::balance_of(&l, BOB) == 400, 4);
        assert!(ledger::total_supply(&l) == 1_000, 5); // == sum of restored balances

        test_utils::destroy(l);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 7, location = bazaar_economy::tribe_token_ledger)] // E_SUPPLY_CAP_EXCEEDED
    fun mint_for_reclaim_over_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut l = ledger::create_for_reclaim(TRIBE_ID, b"GoldCoin", b"GLD", 2, 1_000, &clock, &mut ctx);

        ledger::mint_for_reclaim(&mut l, ALICE, 600, &clock);
        ledger::mint_for_reclaim(&mut l, BOB, 500, &clock); // 1100 > cap 1000 -> abort

        test_utils::destroy(l);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun create_for_reclaim_uncapped_allows_large_mint() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut l = ledger::create_for_reclaim(TRIBE_ID, b"Free", b"FRE", 2, 0, &clock, &mut ctx); // cap 0 = uncapped

        ledger::mint_for_reclaim(&mut l, ALICE, 9_000_000, &clock);
        assert!(ledger::total_supply(&l) == 9_000_000, 0);

        test_utils::destroy(l);
        clock::destroy_for_testing(clock);
    }

    // ===== tribe_vault::deposit_reclaimed_vault_eve =====

    #[test]
    fun deposit_reclaimed_vault_eve_credits_vault() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);

        tribe_vault::deposit_reclaimed_vault_eve(
            &cap, &mut vault, coin::mint_for_testing<EVE>(7_777, &mut ctx), &clock, &ctx,
        );
        assert!(tribe_vault::eve_balance(&vault) == 7_777, 0);

        tribe_registry::destroy_leader_cap_for_testing(cap);
        test_utils::destroy(vault);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun deposit_reclaimed_vault_eve_zero_coin_is_noop() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);

        // Lazy-drained coin may be empty when the old vault had no residue.
        tribe_vault::deposit_reclaimed_vault_eve(
            &cap, &mut vault, coin::zero<EVE>(&mut ctx), &clock, &ctx,
        );
        assert!(tribe_vault::eve_balance(&vault) == 0, 0);

        tribe_registry::destroy_leader_cap_for_testing(cap);
        test_utils::destroy(vault);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 3, location = bazaar_economy::tribe_vault)] // E_WRONG_TRIBE
    fun deposit_reclaimed_vault_eve_wrong_tribe_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(OTHER_TRIBE, &mut ctx);

        tribe_vault::deposit_reclaimed_vault_eve(
            &cap, &mut vault, coin::mint_for_testing<EVE>(1, &mut ctx), &clock, &ctx,
        );

        tribe_registry::destroy_leader_cap_for_testing(cap);
        test_utils::destroy(vault);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
