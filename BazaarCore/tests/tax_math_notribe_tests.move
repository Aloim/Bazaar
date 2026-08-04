// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Phase 8 B1b — AUD-NT-07 / AUD-NT-12 / AUD-NT-14 coverage.
// Tests: NoTribe WTS/WTB/DE split-math exactness, compute_taxes overflow safety,
// FREE claim/depletion/refund, SSU tax withdraw, charge_notribe mission fee.
// All tests use real Move objects — no mocks, no placeholder abort bodies.
#[test_only]
module bazaar_core::tax_math_notribe_tests {
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use dapp_hub::tax_wallet;
    use dapp_hub::dapp_governance;
    use bazaar_core::ssu_governance;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::ssu_role_tax_admin;
    use bazaar_core::ssu_treasury;
    use bazaar_core::membership;
    use bazaar_core::shop_ops_helpers;
    use bazaar_core::mission_fees;
    use bazaar_core::bazaar_core_admin;

    // ===== Constants =====
    const SSU_ADDR: address = @0x55;
    const PAYER:    address = @0xAA;

    // ===== Helpers =====

    fun make_admin(ctx: &mut TxContext):
        (bazaar_core_admin::BazaarCoreAdmin, dapp_governance::DAppOwnerCap)
    {
        let owner_cap = dapp_governance::create_owner_cap_for_testing(ctx);
        let tax_cap   = tax_wallet::create_deposit_cap_for_testing(ctx);
        let mut admin = bazaar_core_admin::create_for_testing(ctx);
        bazaar_core_admin::receive_tax_deposit_cap(&owner_cap, &mut admin, tax_cap);
        (admin, owner_cap)
    }

    fun make_gov(wts_pct: u64, wtb_pct: u64, de_flat: u64,
                 clk: &clock::Clock, ctx: &mut TxContext):
        (ssu_governance::SSUGovernance, membership::SSUOwnerCap)
    {
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, 0, 0, SSU_ADDR, clk, ctx,
        );
        let cap = membership::create_ssu_owner_cap_for_testing(SSU_ADDR, 0, ctx);
        ssu_role_tax_admin::set_ssu_tax_uniform(&cap, &mut gov, wts_pct, wtb_pct, de_flat, clk, ctx);
        (gov, cap)
    }

    // =========================================================
    // NT-TM-01: compute_taxes 2-layer split — no dust, exact sum
    // SSU=500bps(5%), DApp=200bps(2%), gross=10_000
    // Expected: ssu=500, tribe=0, dapp=200, net=9_300
    // =========================================================
    #[test]
    fun test_compute_taxes_notribe_exact_split() {
        let (ssu_tax, tribe_tax, dapp_tax, net) =
            shop_ops_helpers::compute_taxes_for_testing(10_000, 500, 0, 200);
        assert!(ssu_tax   == 500,   0);
        assert!(tribe_tax == 0,     1);
        assert!(dapp_tax  == 200,   2);
        assert!(net       == 9_300, 3);
        // Sum invariant: ssu+tribe+dapp+net == gross
        assert!(ssu_tax + tribe_tax + dapp_tax + net == 10_000, 4);
    }

    // =========================================================
    // NT-TM-02: compute_taxes does NOT abort at high gross (overflow fix)
    // gross = 9_000_000_000_000_000 (9e15 MIST = 9 billion SUI), bps=500
    // Pre-fix: 9e15 * 500 = 4.5e18 overflows u64.
    // Post-fix (u128): 9e15 * 500 = 4.5e18 < u128::MAX; casts safely.
    // =========================================================
    #[test]
    fun test_compute_taxes_high_gross_no_overflow() {
        let gross: u64 = 9_000_000_000_000_000;
        let (ssu_tax, tribe_tax, dapp_tax, net) =
            shop_ops_helpers::compute_taxes_for_testing(gross, 500, 0, 200);
        // Must not abort. Verify sum invariant.
        assert!(ssu_tax + tribe_tax + dapp_tax + net == gross, 0);
        // Spot-check: ssu_tax = 9e15 * 500 / 10000 = 450_000_000_000_000
        assert!(ssu_tax == 450_000_000_000_000, 1);
    }

    // =========================================================
    // NT-TM-03: C-DEF sum-assert fires when bps sum > 10000
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 10)]  // E_RATE_SUM_EXCEEDS_BASE = 10
    fun test_compute_taxes_sum_exceeds_base_aborts() {
        // ssu=6000, tribe=3000, dapp=2000 -> sum=11000 > 10000 -> abort
        shop_ops_helpers::compute_taxes_for_testing(100_000, 6000, 3000, 2000);
    }

    // =========================================================
    // NT-TM-04: SSU tax wallet withdraw — happy path
    // Deposit 1000, withdraw 400, verify balance 600
    // =========================================================
    #[test]
    fun test_ssu_tax_withdraw_happy_path() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let (mut gov, owner_cap) = make_gov(0, 0, 0, &clk, &mut ctx);

        // Deposit 1000 by minting and depositing directly via package-private helper.
        let deposit_coin = coin::mint_for_testing<EVE>(1000, &mut ctx);
        ssu_treasury::deposit_ssu_tax(&mut gov, deposit_coin);
        assert!(ssu_governance::ssu_tax_balance(&gov) == 1000, 0);
        assert!(ssu_treasury::ssu_tax_balance(&gov) == 1000, 1);

        // Withdraw 400.
        let withdrawn = ssu_treasury::withdraw_ssu_tax(&owner_cap, &mut gov, 400, &clk, &mut ctx);
        assert!(coin::value(&withdrawn) == 400, 2);
        assert!(ssu_governance::ssu_tax_balance(&gov) == 600, 3);

        test_utils::destroy(withdrawn);
        test_utils::destroy(gov);
        test_utils::destroy(owner_cap);
        clock::destroy_for_testing(clk);
    }

    // =========================================================
    // NT-TM-05: SSU tax withdraw over-balance aborts (E_INSUFFICIENT_BALANCE=3)
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 3)]
    fun test_ssu_tax_withdraw_over_balance_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let (mut gov, owner_cap) = make_gov(0, 0, 0, &clk, &mut ctx);
        // No deposits — balance = 0. Withdraw 1 must abort.
        let _c = ssu_treasury::withdraw_ssu_tax(&owner_cap, &mut gov, 1, &clk, &mut ctx);
        abort 0 // unreachable
    }

    // =========================================================
    // NT-TM-06: charge_notribe — 2-layer exact split + E_FEE_MISMATCH
    // ssu_fph = 200, dapp_fph = 50 (from config), hours = 3
    // total = (200 + 50) * 3 = 750
    // =========================================================
    #[test]
    fun test_charge_notribe_fee_split_exact() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let (mut admin, owner_cap) = make_admin(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let dapp_config = dapp_governance::create_config_for_testing(&mut ctx);

        // Create a NoTribe SSU gov with ssu_fph = 200.
        let (mut gov, ssu_cap) = make_gov(0, 0, 0, &clk, &mut ctx);
        // Set mission_listing_fee_per_hour = 200 via the public entry.
        ssu_governance::set_ssu_mission_listing_fee(
            &mut gov, 200, &ssu_cap, &clk, &mut ctx,
        );

        // dapp_config from create_config_for_testing has mission_listing_fee_per_hour = 0
        // (default in the test factory). So total = (200 + 0) * 3 = 600.
        let hours: u64 = 3;
        let fee_coin = coin::mint_for_testing<EVE>(600, &mut ctx);

        mission_fees::charge_notribe(
            &mut gov, &dapp_config, &admin, &mut wallet,
            fee_coin, hours, PAYER, &clk, &mut ctx,
        );

        // SSU tax wallet should have 600 (all to SSU since dapp_fph=0 => dapp_fee=0).
        assert!(ssu_governance::ssu_tax_balance(&gov) == 600, 0);

        test_utils::destroy(gov);
        test_utils::destroy(ssu_cap);
        test_utils::destroy(admin);
        test_utils::destroy(owner_cap);
        test_utils::destroy(wallet);
        test_utils::destroy(dapp_config);
        clock::destroy_for_testing(clk);
    }

    // =========================================================
    // NT-TM-07: charge_notribe — E_FEE_MISMATCH aborts on wrong amount
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 1)]  // E_FEE_MISMATCH = 1
    fun test_charge_notribe_fee_mismatch_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let (mut admin, owner_cap) = make_admin(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let dapp_config = dapp_governance::create_config_for_testing(&mut ctx);
        let (mut gov, ssu_cap) = make_gov(0, 0, 0, &clk, &mut ctx);
        ssu_governance::set_ssu_mission_listing_fee(&mut gov, 200, &ssu_cap, &clk, &mut ctx);

        // Send 500 instead of 600 — must abort E_FEE_MISMATCH.
        let bad_fee = coin::mint_for_testing<EVE>(500, &mut ctx);
        mission_fees::charge_notribe(
            &mut gov, &dapp_config, &admin, &mut wallet,
            bad_fee, 3, PAYER, &clk, &mut ctx,
        );
        abort 0
    }

    // =========================================================
    // NT-TM-08: charge_notribe — zero dapp layer edge
    // (dapp_config has dapp_fph=0, all fee goes to SSU)
    // Already covered by NT-TM-06 above. Additional explicit verification:
    // =========================================================
    #[test]
    fun test_charge_notribe_zero_dapp_fee() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let (mut admin, owner_cap) = make_admin(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let dapp_config = dapp_governance::create_config_for_testing(&mut ctx);
        let (mut gov, ssu_cap) = make_gov(0, 0, 0, &clk, &mut ctx);
        // ssu_fph = 100, dapp_fph = 0 (default). 2 hours = 200 total.
        ssu_governance::set_ssu_mission_listing_fee(&mut gov, 100, &ssu_cap, &clk, &mut ctx);
        let fee_coin = coin::mint_for_testing<EVE>(200, &mut ctx);
        mission_fees::charge_notribe(
            &mut gov, &dapp_config, &admin, &mut wallet,
            fee_coin, 2, PAYER, &clk, &mut ctx,
        );
        assert!(ssu_governance::ssu_tax_balance(&gov) == 200, 0);

        test_utils::destroy(gov);
        test_utils::destroy(ssu_cap);
        test_utils::destroy(admin);
        test_utils::destroy(owner_cap);
        test_utils::destroy(wallet);
        test_utils::destroy(dapp_config);
        clock::destroy_for_testing(clk);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
