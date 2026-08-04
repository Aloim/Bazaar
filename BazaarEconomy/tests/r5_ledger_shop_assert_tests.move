// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// R5.2.b.2 — ledger_shop_ops bazaar-type gate tests (10 tests)
// SSU path (3 fns): reject = SSU type=1 (Easy) → E_NOT_ADVANCED_BAZAAR
// Tribe path (2 fns): reject = tribe type=1 (Easy) → E_NOT_ADVANCED_BAZAAR
// Shop-based fns (wts_buy, wtb_fill, de_exchange): cannot construct &mut Shop from BazaarEconomy
// tests (borrow_shop_mut is public(package) in BazaarCore). Reject tests call
// assert_advanced_external(1) directly — this is the exact expression evaluated as the first
// line of each function, so the test precisely covers the gate. Accept tests use the 2
// non-shop fns (withdraw_ssu_tax_credits, withdraw_tribe_tax_credits) with Advanced type.

#[test_only]
module bazaar_economy::r5_ledger_shop_assert_tests {
    use sui::test_utils;
    use sui::clock;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_core::ssu_governance;
    use bazaar_core::bazaar_assertions;
    use bazaar_economy::tribe_token_ledger;
    use bazaar_economy::tribe_vault;
    use bazaar_economy::tribe_exchange;
    use bazaar_economy::ledger_shop_ops;

    const TRIBE_ID: u64 = 1;
    const SSU_ID: address = @0x5A;
    const LEADER: address = @0xA1;

    // ===== ledger_wts_buy — gate only (no &mut Shop available cross-package) =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_ledger_wts_buy_rejects_notadvanced_ssu() {
        // Precisely replicates the first line of ledger_wts_buy:
        // bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(ssu_gov))
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 1, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(&ssu_gov));
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_ledger_wts_buy_accepts_advanced_ssu() {
        // Advanced SSU: assert_advanced_external(2) must not abort
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(&ssu_gov));
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        clock::destroy_for_testing(clock);
    }

    // ===== ledger_wtb_fill =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_ledger_wtb_fill_rejects_notadvanced_ssu() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 1, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(&ssu_gov));
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_ledger_wtb_fill_accepts_advanced_ssu() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(&ssu_gov));
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        clock::destroy_for_testing(clock);
    }

    // ===== ledger_de_exchange =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_ledger_de_exchange_rejects_notadvanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 1, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(&ssu_gov));
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_ledger_de_exchange_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(&ssu_gov));
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        clock::destroy_for_testing(clock);
    }

    // ===== withdraw_ssu_tax_credits — full fn call possible =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_withdraw_ssu_tax_rejects_notadvanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 1, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        let cap = ssu_governance_test_helpers::create_owner_cap_for_testing(SSU_ID, TRIBE_ID, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, 0, &clock, &mut ctx);
        ledger_shop_ops::withdraw_ssu_tax_credits(&cap, &ssu_gov, &mut ledger, &mut vault, &config, 1, &clock, &mut ctx);
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        ssu_governance_test_helpers::destroy_owner_cap_for_testing(cap);
        test_utils::destroy(ledger);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = bazaar_economy::ledger_shop_ops::E_WRONG_SSU)]
    fun test_withdraw_ssu_tax_accepts_advanced() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Advanced SSU — gate passes; cap ssu_id differs from ssu_gov → E_WRONG_SSU
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        let cap = ssu_governance_test_helpers::create_owner_cap_for_testing(@0xBB, TRIBE_ID, &mut ctx);
        let mut ledger = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let config = tribe_exchange::create_for_testing(TRIBE_ID, 0, &clock, &mut ctx);
        ledger_shop_ops::withdraw_ssu_tax_credits(&cap, &ssu_gov, &mut ledger, &mut vault, &config, 1, &clock, &mut ctx);
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        ssu_governance_test_helpers::destroy_owner_cap_for_testing(cap);
        test_utils::destroy(ledger);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        clock::destroy_for_testing(clock);
    }

    // ===== withdraw_tribe_tax_credits — RETIRED in V16 =====
    // The two prior tests (rejects_easy / accepts_advanced) are removed alongside
    // the deleted ledger_shop_ops::withdraw_tribe_tax_credits entry. EVE outflow
    // from the tribe wallet now goes through mint_burn_queue (burn → reduces
    // supply, no EVE flow) or vault_withdrawal (admin quorum + 24h EVE redeem,
    // independent of ledger balance). See TribeWalletMintBurnQueuePlan.md
    // Decision #8.
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
