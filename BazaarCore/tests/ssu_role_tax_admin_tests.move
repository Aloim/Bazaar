// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Session 3B-followup (2026-05-13) — per-role tax admin unit tests for the
// SSU side. Mirrors the same coverage requested in Session 3B closure's
// S3B-T1 row + Quick Continuation Recipe (Session 3B-followup).
//
// Coverage:
//   - set creates row + getters fire
//   - set overwrites existing row
//   - unset role returns zero (default semantics)
//   - clear removes row
//   - clear unset role is idempotent
//   - batch writes all rows
//   - batch length mismatch aborts
//   - uniform writes all 8 roles
//   - pct exceeds cap aborts
//   - invalid role (>7) aborts
//   - wrong-SSU cap aborts

#[test_only]
module bazaar_core::ssu_role_tax_admin_tests {
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::ssu_role_tax_admin;
    use bazaar_core::membership;

    const SSU_ADDR: address = @0x55;
    const OTHER_SSU: address = @0x56;
    const TRIBE_ID: u64 = 0;
    const BAZAAR_TYPE_NOTRIBE: u8 = 0;

    // ===== Helper: build (gov, owner_cap, clock) =====
    fun fresh_gov(ctx: &mut TxContext): (
        bazaar_core::ssu_governance::SSUGovernance,
        membership::SSUOwnerCap,
        clock::Clock,
    ) {
        let clk = clock::create_for_testing(ctx);
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, SSU_ADDR, &clk, ctx,
        );
        let cap = membership::create_ssu_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, ctx);
        (gov, cap, clk)
    }

    fun cleanup(
        gov: bazaar_core::ssu_governance::SSUGovernance,
        cap: membership::SSUOwnerCap,
        clk: clock::Clock,
    ) {
        test_utils::destroy(cap);
        test_utils::destroy(gov);
        clock::destroy_for_testing(clk);
    }

    // ===== Test 1: set creates row + getters fire =====
    #[test]
    fun test_set_role_tax_creates_row() {
        let mut ctx = tx_context::dummy();
        let (mut gov, cap, clk) = fresh_gov(&mut ctx);

        ssu_role_tax_admin::set_ssu_role_tax(
            &cap, &mut gov, 1, 525, 200, 100, &clk, &ctx,
        );

        assert!(ssu_role_tax_admin::ssu_has_role_tax(&gov, 1), 0);
        assert!(ssu_role_tax_admin::ssu_wts_pct_for_role(&gov, 1) == 525, 1);
        assert!(ssu_role_tax_admin::ssu_wtb_pct_for_role(&gov, 1) == 200, 2);
        assert!(ssu_role_tax_admin::ssu_de_flat_fee_for_role(&gov, 1) == 100, 3);

        cleanup(gov, cap, clk);
    }

    // ===== Test 2: set overwrites existing row =====
    #[test]
    fun test_set_role_tax_overwrites_existing() {
        let mut ctx = tx_context::dummy();
        let (mut gov, cap, clk) = fresh_gov(&mut ctx);

        ssu_role_tax_admin::set_ssu_role_tax(&cap, &mut gov, 1, 100, 100, 100, &clk, &ctx);
        ssu_role_tax_admin::set_ssu_role_tax(&cap, &mut gov, 1, 700, 300, 50,  &clk, &ctx);

        assert!(ssu_role_tax_admin::ssu_wts_pct_for_role(&gov, 1) == 700, 0);
        assert!(ssu_role_tax_admin::ssu_wtb_pct_for_role(&gov, 1) == 300, 1);
        assert!(ssu_role_tax_admin::ssu_de_flat_fee_for_role(&gov, 1) == 50, 2);

        cleanup(gov, cap, clk);
    }

    // ===== Test 3: unset role returns zero =====
    #[test]
    fun test_unset_role_returns_zero() {
        let mut ctx = tx_context::dummy();
        let (gov, cap, clk) = fresh_gov(&mut ctx);

        assert!(!ssu_role_tax_admin::ssu_has_role_tax(&gov, 3), 0);
        assert!(ssu_role_tax_admin::ssu_wts_pct_for_role(&gov, 3) == 0, 1);
        assert!(ssu_role_tax_admin::ssu_wtb_pct_for_role(&gov, 3) == 0, 2);
        assert!(ssu_role_tax_admin::ssu_de_flat_fee_for_role(&gov, 3) == 0, 3);

        cleanup(gov, cap, clk);
    }

    // ===== Test 4: clear removes row =====
    #[test]
    fun test_clear_role_tax_removes_row() {
        let mut ctx = tx_context::dummy();
        let (mut gov, cap, clk) = fresh_gov(&mut ctx);

        ssu_role_tax_admin::set_ssu_role_tax(&cap, &mut gov, 1, 500, 500, 500, &clk, &ctx);
        assert!(ssu_role_tax_admin::ssu_has_role_tax(&gov, 1), 0);

        ssu_role_tax_admin::clear_ssu_role_tax(&cap, &mut gov, 1, &clk, &ctx);
        assert!(!ssu_role_tax_admin::ssu_has_role_tax(&gov, 1), 1);
        assert!(ssu_role_tax_admin::ssu_wts_pct_for_role(&gov, 1) == 0, 2);

        cleanup(gov, cap, clk);
    }

    // ===== Test 5: clear unset role is idempotent =====
    #[test]
    fun test_clear_unset_role_idempotent() {
        let mut ctx = tx_context::dummy();
        let (mut gov, cap, clk) = fresh_gov(&mut ctx);

        // Clear role 5 without ever setting it — should NOT abort.
        ssu_role_tax_admin::clear_ssu_role_tax(&cap, &mut gov, 5, &clk, &ctx);
        assert!(!ssu_role_tax_admin::ssu_has_role_tax(&gov, 5), 0);

        cleanup(gov, cap, clk);
    }

    // ===== Test 6: batch writes all rows =====
    #[test]
    fun test_set_taxes_batch_writes_all_rows() {
        let mut ctx = tx_context::dummy();
        let (mut gov, cap, clk) = fresh_gov(&mut ctx);

        let roles = vector[1u8, 2u8, 3u8];
        let wts = vector[100u64, 200u64, 300u64];
        let wtb = vector[150u64, 250u64, 350u64];
        let de  = vector[10u64,  20u64,  30u64];

        ssu_role_tax_admin::set_ssu_taxes_batch(
            &cap, &mut gov, roles, wts, wtb, de, &clk, &ctx,
        );

        assert!(ssu_role_tax_admin::ssu_wts_pct_for_role(&gov, 1) == 100, 0);
        assert!(ssu_role_tax_admin::ssu_wts_pct_for_role(&gov, 2) == 200, 1);
        assert!(ssu_role_tax_admin::ssu_wts_pct_for_role(&gov, 3) == 300, 2);
        assert!(ssu_role_tax_admin::ssu_wtb_pct_for_role(&gov, 2) == 250, 3);
        assert!(ssu_role_tax_admin::ssu_de_flat_fee_for_role(&gov, 3) == 30, 4);
        // Roles outside the batch remain unset (default 0).
        assert!(!ssu_role_tax_admin::ssu_has_role_tax(&gov, 0), 5);
        assert!(!ssu_role_tax_admin::ssu_has_role_tax(&gov, 4), 6);

        cleanup(gov, cap, clk);
    }

    // ===== Test 7: batch length mismatch aborts =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_role_tax_admin::E_LENGTH_MISMATCH)]
    fun test_set_taxes_batch_length_mismatch_aborts() {
        let mut ctx = tx_context::dummy();
        let (mut gov, cap, clk) = fresh_gov(&mut ctx);

        let roles = vector[1u8, 2u8];
        let wts   = vector[100u64, 200u64, 300u64];  // length 3 — mismatch
        let wtb   = vector[150u64, 250u64];
        let de    = vector[10u64,  20u64];

        ssu_role_tax_admin::set_ssu_taxes_batch(
            &cap, &mut gov, roles, wts, wtb, de, &clk, &ctx,
        );

        cleanup(gov, cap, clk);
    }

    // ===== Test 8: uniform writes all 8 roles =====
    #[test]
    fun test_set_tax_uniform_writes_all_8_roles() {
        let mut ctx = tx_context::dummy();
        let (mut gov, cap, clk) = fresh_gov(&mut ctx);

        ssu_role_tax_admin::set_ssu_tax_uniform(
            &cap, &mut gov, 250, 175, 99, &clk, &ctx,
        );

        let mut role: u8 = 0;
        while (role < 8) {
            assert!(ssu_role_tax_admin::ssu_has_role_tax(&gov, role), (role as u64));
            assert!(ssu_role_tax_admin::ssu_wts_pct_for_role(&gov, role) == 250, ((role as u64) + 10));
            assert!(ssu_role_tax_admin::ssu_wtb_pct_for_role(&gov, role) == 175, ((role as u64) + 20));
            assert!(ssu_role_tax_admin::ssu_de_flat_fee_for_role(&gov, role) == 99, ((role as u64) + 30));
            role = role + 1;
        };

        cleanup(gov, cap, clk);
    }

    // ===== Test 9: pct exceeds cap aborts =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_role_tax_admin::E_RATE_EXCEEDS_CAP)]
    fun test_set_role_tax_pct_exceeds_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let (mut gov, cap, clk) = fresh_gov(&mut ctx);

        // MAX_TAX_PCT = 1000 (10.00%). 1001 must abort.
        ssu_role_tax_admin::set_ssu_role_tax(
            &cap, &mut gov, 1, 1001, 0, 0, &clk, &ctx,
        );

        cleanup(gov, cap, clk);
    }

    // ===== Test 10: invalid role (>7) aborts =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_role_tax_admin::E_INVALID_ROLE)]
    fun test_set_role_tax_invalid_role_aborts() {
        let mut ctx = tx_context::dummy();
        let (mut gov, cap, clk) = fresh_gov(&mut ctx);

        ssu_role_tax_admin::set_ssu_role_tax(
            &cap, &mut gov, 8, 100, 100, 100, &clk, &ctx,
        );

        cleanup(gov, cap, clk);
    }

    // ===== Test 11: wrong-SSU cap aborts =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_role_tax_admin::E_WRONG_SSU)]
    fun test_set_role_tax_wrong_ssu_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, SSU_ADDR, &clk, &mut ctx,
        );
        let foreign_cap = membership::create_ssu_owner_cap_for_testing(OTHER_SSU, TRIBE_ID, &mut ctx);

        ssu_role_tax_admin::set_ssu_role_tax(
            &foreign_cap, &mut gov, 1, 100, 100, 100, &clk, &ctx,
        );

        test_utils::destroy(foreign_cap);
        test_utils::destroy(gov);
        clock::destroy_for_testing(clk);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
