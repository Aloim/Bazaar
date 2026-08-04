// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
// V31 (Registered-SSUs): unit coverage for the per-SSU tribe-tax accumulator
// added to TribeGovernance (record_ssu_tribe_tax / ssu_tribe_tax).

#[test_only]
module bazaar_core::tribe_ssu_tax_accumulator_tests {
    use sui::clock;
    use bazaar_core::tribe_governance;
    use bazaar_core::tribe_governance_test_helpers as tgh;

    const TRIBE_ID: u64   = 7;
    const LEADER: address = @0xA1;
    const SSU_A: address  = @0xAAA1;
    const SSU_B: address  = @0xBBB2;

    // TST-01: records accumulate per SSU and are read back; distinct SSUs are independent.
    #[test]
    fun tst01_accumulates_per_ssu() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);

        // Unset key reads as 0.
        assert!(tribe_governance::ssu_tribe_tax(&gov, SSU_A) == 0, 0);

        // First record creates the row.
        tribe_governance::record_ssu_tribe_tax(&mut gov, SSU_A, 100);
        assert!(tribe_governance::ssu_tribe_tax(&gov, SSU_A) == 100, 1);

        // Second record on the same SSU increments.
        tribe_governance::record_ssu_tribe_tax(&mut gov, SSU_A, 50);
        assert!(tribe_governance::ssu_tribe_tax(&gov, SSU_A) == 150, 2);

        // A different SSU is tracked independently.
        tribe_governance::record_ssu_tribe_tax(&mut gov, SSU_B, 9);
        assert!(tribe_governance::ssu_tribe_tax(&gov, SSU_B) == 9, 3);
        assert!(tribe_governance::ssu_tribe_tax(&gov, SSU_A) == 150, 4);

        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    // TST-02: a zero-amount record is a no-op (no row created).
    #[test]
    fun tst02_zero_is_noop() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);

        tribe_governance::record_ssu_tribe_tax(&mut gov, SSU_A, 0);
        assert!(tribe_governance::ssu_tribe_tax(&gov, SSU_A) == 0, 0);

        // Non-zero after a zero call still creates the row correctly.
        tribe_governance::record_ssu_tribe_tax(&mut gov, SSU_A, 5);
        assert!(tribe_governance::ssu_tribe_tax(&gov, SSU_A) == 5, 1);

        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
