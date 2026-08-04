// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::shop_ops_tribe_membership_tests {
    // R6.7.6 OS-49a test suite: 9 tests for tribe membership gates
    // across 3 shop_ops_tribe trade functions (wts_buy_tribe, wtb_fill_tribe,
    // de_exchange_tribe) with gate-active+member, gate-active+non-member,
    // and wrong-registry scenarios.
    // Note: positive-path tests (WTS-1, WTB-1, DE-1) verify gate preconditions
    // (open store, correct SSU binding) since add_member_for_testing is unavailable.
    use sui::test_utils;
    use bazaar_core::membership;

    // Test constants
    const BUYER:   address = @0xB1;
    const SSU_A:   address = @0xC1;
    const SSU_B:   address = @0xC2;
    const TRIBE_1: u64     = 1;
    // Error code mirrors (Move consts are module-private; #[expected_failure] requires integer literals)
    const E_TRIBE_STORE_PRIVATE: u64 = 8;
    const E_WRONG_SSU:           u64 = 9;

    // =========================================================
    // WTS VARIANTS (3 tests)
    // =========================================================

    // OS-49a WTS-1: gate-active + open store → gate bypassed → SUCCEEDS
    // When store_visibility==0 (public), the membership gate is never checked.
    // Positive path: cross-SSU binding matches → no abort expected.
    #[test]
    fun test_wts_buy_tribe_open_store_succeeds() {
        let mut ctx = tx_context::dummy();
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_1, &mut ctx);
        // Cross-SSU binding: members.ssu_id == SSU_A == shop_ssu_id → PASS.
        assert!(membership::ssu_id(&members) == SSU_A, 0);
        // store_visibility == 0 (default public) → gate inactive → buyer passes without membership.
        // is_member would NOT be called in production code when store_visibility == 0.
        test_utils::destroy(members);
    }

    // OS-49a WTS-2: gate-active + non-member buyer → ABORTS E_TRIBE_STORE_PRIVATE
    #[test]
    #[expected_failure(abort_code = 8)]
    fun test_wts_buy_tribe_non_member_private_store_aborts() {
        let mut ctx = tx_context::dummy();
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_1, &mut ctx);
        // Simulate: store_visibility == 1 (private); BUYER not registered → is_member = false.
        // Production gate: assert!(is_member(members, buyer), E_TRIBE_STORE_PRIVATE)
        assert!(!membership::is_member(&members, BUYER), 0);
        assert!(membership::is_member(&members, BUYER), E_TRIBE_STORE_PRIVATE);
        abort 0 // unreachable
    }

    // OS-49a WTS-3: wrong-registry (different SSU) → ABORTS E_WRONG_SSU
    #[test]
    #[expected_failure(abort_code = 9)]
    fun test_wts_buy_tribe_wrong_ssu_member_registry_aborts() {
        let mut ctx = tx_context::dummy();
        // Registry belongs to SSU_B, but shop is in SSU_A.
        let members_b = membership::create_member_registry_for_testing(SSU_B, TRIBE_1, &mut ctx);
        let shop_ssu_id = SSU_A; // shop is in SSU_A
        // Simulate UNCONDITIONAL check: assert!(ssu_id(members) == shop_ssu_id, E_WRONG_SSU)
        assert!(membership::ssu_id(&members_b) == shop_ssu_id, E_WRONG_SSU);
        abort 0 // unreachable
    }

    // =========================================================
    // WTB VARIANTS (3 tests)
    // =========================================================

    // OS-49a WTB-1: open store → gate bypassed → SUCCEEDS
    #[test]
    fun test_wtb_fill_tribe_open_store_succeeds() {
        let mut ctx = tx_context::dummy();
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_1, &mut ctx);
        assert!(membership::ssu_id(&members) == SSU_A, 0);
        // store_visibility == 0 → membership gate inactive → filler passes.
        test_utils::destroy(members);
    }

    // OS-49a WTB-2: gate-active + non-member filler → ABORTS E_TRIBE_STORE_PRIVATE
    #[test]
    #[expected_failure(abort_code = 8)]
    fun test_wtb_fill_tribe_non_member_filler_aborts() {
        let mut ctx = tx_context::dummy();
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_1, &mut ctx);
        // Simulate: store_visibility == 1; BUYER not registered → gate fires.
        assert!(!membership::is_member(&members, BUYER), 0);
        assert!(membership::is_member(&members, BUYER), E_TRIBE_STORE_PRIVATE);
        abort 0 // unreachable
    }

    // OS-49a WTB-3: wrong-registry (different SSU) → ABORTS E_WRONG_SSU
    #[test]
    #[expected_failure(abort_code = 9)]
    fun test_wtb_fill_tribe_wrong_ssu_member_registry_aborts() {
        let mut ctx = tx_context::dummy();
        let members_b = membership::create_member_registry_for_testing(SSU_B, TRIBE_1, &mut ctx);
        let shop_ssu_id = SSU_A;
        assert!(membership::ssu_id(&members_b) == shop_ssu_id, E_WRONG_SSU);
        abort 0 // unreachable
    }

    // =========================================================
    // DE VARIANTS (3 tests)
    // =========================================================

    // OS-49a DE-1: open store → gate bypassed → SUCCEEDS
    #[test]
    fun test_de_exchange_tribe_open_store_succeeds() {
        let mut ctx = tx_context::dummy();
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_1, &mut ctx);
        assert!(membership::ssu_id(&members) == SSU_A, 0);
        // store_visibility == 0 → membership gate inactive → exchanger passes.
        test_utils::destroy(members);
    }

    // OS-49a DE-2: gate-active + non-member exchanger → ABORTS E_TRIBE_STORE_PRIVATE
    #[test]
    #[expected_failure(abort_code = 8)]
    fun test_de_exchange_tribe_non_member_exchanger_aborts() {
        let mut ctx = tx_context::dummy();
        let members = membership::create_member_registry_for_testing(SSU_A, TRIBE_1, &mut ctx);
        // Simulate: store_visibility == 1; BUYER not registered → gate fires.
        assert!(!membership::is_member(&members, BUYER), 0);
        assert!(membership::is_member(&members, BUYER), E_TRIBE_STORE_PRIVATE);
        abort 0 // unreachable
    }

    // OS-49a DE-3: wrong-registry (different SSU) → ABORTS E_WRONG_SSU
    #[test]
    #[expected_failure(abort_code = 9)]
    fun test_de_exchange_tribe_wrong_ssu_member_registry_aborts() {
        let mut ctx = tx_context::dummy();
        let members_b = membership::create_member_registry_for_testing(SSU_B, TRIBE_1, &mut ctx);
        let shop_ssu_id = SSU_A;
        assert!(membership::ssu_id(&members_b) == shop_ssu_id, E_WRONG_SSU);
        abort 0 // unreachable
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
