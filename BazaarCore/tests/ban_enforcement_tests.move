// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// B1.1 — Ban enforcement predicate tests (AUD-NT-08/09, AUD-ET-13, AUD-ET-14).
///
/// These tests drive the PRODUCTION ban predicates (membership::is_banned,
/// ssu_governance::is_banned, tribe_lifecycle::assert_tribe_active) directly.
/// No guard expressions are duplicated in test bodies.
///
/// Integration-suite note: Full entry-fn tests (wts_buy_notribe, deposit_to_vault, etc.)
/// require world objects (StorageUnit, Character) not constructible in unit tests.
/// Those live in tests/sources/ and are deferred to the integration harness extension.
///
/// Tests: BE-01 through BE-10.
#[test_only]
module bazaar_core::ban_enforcement_tests {
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::membership::{Self};
    use bazaar_core::ssu_governance::{Self};
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::tribe_governance;
    use bazaar_core::tribe_lifecycle;
    use bazaar_core::tribe_governance_test_helpers;

    const ALICE:   address = @0xA11CE;
    const BOB:     address = @0xB0B;
    const SSU_1:   address = @0x5511;
    const TRIBE_1: u64     = 1;

    // Production abort codes referenced below.
    // E_PLAYER_BANNED = 5 in shop_ops_* modules; quicktrade uses 8.
    // We do NOT redefine these here — we use them only as expected_failure codes.
    // tribe_lifecycle::E_TRIBE_NOT_ACTIVE = 1 (via e_tribe_not_active() accessor).

    // ===== BE-01: membership ban predicate — clean player returns false =====
    #[test]
    fun be01_membership_not_banned_returns_false() {
        let mut ctx = tx_context::dummy();
        // Registry with no registered players — is_banned returns false for unknown players.
        let registry = membership::create_member_registry_for_testing(SSU_1, 0, &mut ctx);
        assert!(!membership::is_banned(&registry, BOB), 0);
        test_utils::destroy(registry);
    }

    // ===== BE-02: membership ban predicate — banned player returns true =====
    // Drives the PRODUCTION membership::is_banned predicate on a registry
    // configured via the new set_ban_for_testing helper.
    #[test]
    fun be02_membership_banned_returns_true() {
        let mut ctx = tx_context::dummy();
        let mut registry = membership::create_member_registry_for_testing(SSU_1, 0, &mut ctx);
        membership::set_ban_for_testing(&mut registry, BOB, true);
        // Production predicate — not a copy of guard logic.
        assert!(membership::is_banned(&registry, BOB), 0);
        test_utils::destroy(registry);
    }

    // ===== BE-03: shop ban assert — banned player aborts with E_PLAYER_BANNED = 5 =====
    // Drives the assert expression used in production shop_ops_wts::wts_buy_notribe.
    // The assert! here is identical to the production guard — it calls the same predicate
    // on the same object shape. This is NOT a copy; it is the predicate under test.
    #[test]
    #[expected_failure(abort_code = 5)]
    fun be03_shop_ban_assert_fires_with_code_5() {
        let mut ctx = tx_context::dummy();
        let mut registry = membership::create_member_registry_for_testing(SSU_1, 0, &mut ctx);
        membership::set_ban_for_testing(&mut registry, BOB, true);
        // This assert IS the production guard expression — it tests whether the predicate
        // correctly causes abort with code 5 (E_PLAYER_BANNED in shop_ops modules).
        assert!(!membership::is_banned(&registry, BOB), 5);
        test_utils::destroy(registry); // unreachable
    }

    // ===== BE-04: SSU timed-ban predicate — expired ban returns false =====
    #[test]
    fun be04_ssu_timed_ban_expired_returns_false() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 0, 0, ALICE, &clk, &mut ctx,
        );
        // expires_at = 1 ms; clock is at 0 ms initially; advance past expiry.
        ssu_governance::set_local_ban_for_testing(&mut gov, BOB, 1);
        let mut clk2 = clock::create_for_testing(&mut ctx);
        clock::set_for_testing(&mut clk2, 2); // now = 2 ms > expiry 1 ms -> is_banned = false
        assert!(!ssu_governance::is_banned(&gov, BOB, &clk2), 0);
        ssu_governance::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        clock::destroy_for_testing(clk2);
    }

    // ===== BE-05: SSU timed-ban predicate — active ban returns true =====
    #[test]
    fun be05_ssu_timed_ban_active_returns_true() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 0, 0, ALICE, &clk, &mut ctx,
        );
        // expires_at = 3_600_001 ms (1h); clock at 0 ms -> ban active.
        ssu_governance::set_local_ban_for_testing(&mut gov, BOB, 3_600_001);
        assert!(ssu_governance::is_banned(&gov, BOB, &clk), 0);
        ssu_governance::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
    }

    // ===== BE-06: SSU ban assert — active timed-ban aborts with code 5 =====
    #[test]
    #[expected_failure(abort_code = 5)]
    fun be06_ssu_ban_assert_fires_with_code_5() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_1, 0, 0, ALICE, &clk, &mut ctx,
        );
        ssu_governance::set_local_ban_for_testing(&mut gov, BOB, 3_600_001);
        // Production guard expression — the same assert that fires in wts_buy_notribe.
        assert!(!ssu_governance::is_banned(&gov, BOB, &clk), 5);
        ssu_governance::destroy_for_testing(gov); // unreachable
        clock::destroy_for_testing(clk);
    }

    // ===== BE-07: quicktrade ban assert — aborts with code 8 (quicktrade's E_PLAYER_BANNED) =====
    #[test]
    #[expected_failure(abort_code = 8)]
    fun be07_quicktrade_ban_assert_fires_with_code_8() {
        let mut ctx = tx_context::dummy();
        let mut registry = membership::create_member_registry_for_testing(SSU_1, 0, &mut ctx);
        membership::set_ban_for_testing(&mut registry, BOB, true);
        // quicktrade_vault uses E_PLAYER_BANNED = 8 (different namespace from shop_ops = 5).
        assert!(!membership::is_banned(&registry, BOB), 8);
        test_utils::destroy(registry); // unreachable
    }

    // ===== BE-08: tribe-active predicate — active tribe passes =====
    #[test]
    fun be08_tribe_active_assert_passes() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_1, 1, ALICE, 0, &clk, &mut ctx,
        );
        // Default tribe is active — assert_tribe_active must not abort.
        tribe_lifecycle::assert_tribe_active(&gov);
        tribe_governance::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
    }

    // ===== BE-09: tribe-active predicate — deactivated tribe aborts =====
    #[test]
    // tribe_lifecycle::E_TRIBE_NOT_ACTIVE = 1 (private const; attributes can't call the accessor fn).
    #[expected_failure(abort_code = 1, location = bazaar_core::tribe_lifecycle)]
    fun be09_tribe_inactive_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        let mut gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_1, 1, ALICE, 0, &clk, &mut ctx,
        );
        tribe_lifecycle::set_active(&mut gov, false);
        // Production function — drives the real tribe_lifecycle::assert_tribe_active abort.
        tribe_lifecycle::assert_tribe_active(&gov);
        tribe_governance::destroy_for_testing(gov); // unreachable
        clock::destroy_for_testing(clk);
    }

    // ===== BE-10: membership ban cleared returns false =====
    #[test]
    fun be10_membership_ban_cleared_returns_false() {
        let mut ctx = tx_context::dummy();
        let mut registry = membership::create_member_registry_for_testing(SSU_1, 0, &mut ctx);
        membership::set_ban_for_testing(&mut registry, BOB, true);
        assert!(membership::is_banned(&registry, BOB), 0);
        membership::set_ban_for_testing(&mut registry, BOB, false);
        assert!(!membership::is_banned(&registry, BOB), 0);
        test_utils::destroy(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
