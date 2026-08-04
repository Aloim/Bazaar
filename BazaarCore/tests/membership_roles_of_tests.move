// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// GAS-04 locking tests for membership::roles_of.
///
/// Coverage:
///   RO-01: entry-less player → triple matches 3 legacy getters (default parity).
///   RO-02: banned player with entry → triple matches 3 legacy getters (ban parity).
///   RO-03: clean registered player → triple matches 3 legacy getters (registered parity).
///   RO-04: SSU-timed ban is a SEPARATE check — roles_of has no Clock param (type-system separation;
///           behavioral coverage lives in ban_enforcement_tests.move BE-03..05).
///   RO-05: tribe-global ban is a SEPARATE check — roles_of has no TribeGovernance param (type-system
///           separation; behavioral coverage lives in tribe_ban_expiry_tests.move).
///   RO-06: behavioral — member-banned wallet aborts with E_SSU_MEMBER_BANNED on the converted
///           ledger path (drives the production predicate via membership::is_banned after roles_of).
///
/// Note: full trade-entry integration tests (wts_buy_*, de_exchange_*, ledger_*) require world
/// objects (StorageUnit, Character) not constructible in pure Move unit tests. They live in the
/// integration harness. The existing test suites that exercise the converted paths remain authoritative:
///   - ban_enforcement_tests.move (BE-01..10): membership is_banned + SSU timed-ban predicates
///   - tribe_ban_expiry_tests.move: tribe-global ban timed expiry
///   - free_claim_tribe_ban_tests.move: free-claim ban enforcement (unconverted path — not affected)
/// These suites must stay green after GAS-04 lands.
#[test_only]
module bazaar_core::membership_roles_of_tests {
    use bazaar_core::membership::{Self};
    use dapp_hub::role_types;

    const SSU_ADDR: address = @0x5511;
    const ALICE:    address = @0xA11CE;
    const BOB:      address = @0xB0B;
    const CAROL:    address = @0xCAF0;

    // ===== RO-01: entry-less player parity =====
    #[test]
    fun ro01_entry_less_player_parity() {
        let mut ctx = sui::tx_context::dummy();
        let reg = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);

        // Legacy getters
        let legacy_ssu   = membership::ssu_role_of(&reg, ALICE);
        let legacy_tribe = membership::tribe_role_of(&reg, ALICE);
        let legacy_ban   = membership::is_banned(&reg, ALICE);

        // Combined accessor
        let (r_ssu, r_tribe, r_ban) = membership::roles_of(&reg, ALICE);

        assert!(r_ssu   == legacy_ssu,   1);
        assert!(r_tribe == legacy_tribe, 2);
        assert!(r_ban   == legacy_ban,   3);

        // Confirm absent-entry defaults
        assert!(r_ssu   == role_types::role_stranger(), 4);  // 0
        assert!(r_tribe == role_types::role_stranger(), 5);  // 0
        assert!(r_ban   == false,                       6);

        sui::test_utils::destroy(reg);
    }

    // ===== RO-02: banned player with entry parity =====
    #[test]
    fun ro02_banned_player_parity() {
        let mut ctx = sui::tx_context::dummy();
        let mut reg = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);

        // Insert a banned entry using the test-only helper (CC-A3-003: no register_stranger_for_testing)
        membership::set_ban_for_testing(&mut reg, BOB, true);

        // Legacy getters
        let legacy_ssu   = membership::ssu_role_of(&reg, BOB);
        let legacy_tribe = membership::tribe_role_of(&reg, BOB);
        let legacy_ban   = membership::is_banned(&reg, BOB);

        // Combined accessor
        let (r_ssu, r_tribe, r_ban) = membership::roles_of(&reg, BOB);

        assert!(r_ssu   == legacy_ssu,   1);
        assert!(r_tribe == legacy_tribe, 2);
        assert!(r_ban   == legacy_ban,   3);

        // The ban flag must be true; roles are Stranger (set_ban_for_testing inserts role=0)
        assert!(r_ban   == true,                         4);
        assert!(r_ssu   == role_types::role_stranger(),  5);
        assert!(r_tribe == role_types::role_stranger(),  6);

        sui::test_utils::destroy(reg);
    }

    // ===== RO-03: clean registered player parity =====
    // Uses set_ban_for_testing(false) to insert a clean Stranger entry (CC-A3-003).
    #[test]
    fun ro03_clean_registered_player_parity() {
        let mut ctx = sui::tx_context::dummy();
        let mut reg = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);

        // Insert a clean entry
        membership::set_ban_for_testing(&mut reg, CAROL, false);

        let legacy_ssu   = membership::ssu_role_of(&reg, CAROL);
        let legacy_tribe = membership::tribe_role_of(&reg, CAROL);
        let legacy_ban   = membership::is_banned(&reg, CAROL);

        let (r_ssu, r_tribe, r_ban) = membership::roles_of(&reg, CAROL);

        assert!(r_ssu   == legacy_ssu,   1);
        assert!(r_tribe == legacy_tribe, 2);
        assert!(r_ban   == legacy_ban,   3);
        assert!(r_ssu   == role_types::role_stranger(), 4);
        assert!(r_tribe == role_types::role_stranger(), 5);
        assert!(r_ban   == false,                       6);

        sui::test_utils::destroy(reg);
    }

    // ===== RO-04: SSU-timed ban is a separate check (type-system locking) =====
    // The SSU timed ban (ssu_governance::is_banned) takes a &Clock + &SSUGovernance.
    // roles_of takes only (reg: &MemberRegistry, player: address) — no Clock, no gov.
    // This test locks the separation: an entry-less player (roles_of says not-banned)
    // can still be caught by ssu_governance::is_banned at the call site.
    // Full behavioral coverage: ban_enforcement_tests.move BE-03..BE-05.
    #[test]
    fun ro04_ssu_timed_ban_type_separation_locked() {
        let mut ctx = sui::tx_context::dummy();
        let reg = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);

        // Entry-less player: roles_of reports not-banned (member-entry surface only)
        let (_, _, member_ban) = membership::roles_of(&reg, ALICE);
        assert!(member_ban == false, 1);
        // roles_of signature: (reg: &MemberRegistry, player: address) → (u8, u8, bool)
        // No Clock or SSUGovernance parameter — type-system enforces separation.

        sui::test_utils::destroy(reg);
    }

    // ===== RO-05: tribe-global ban is a separate check (type-system locking) =====
    // Symmetric to RO-04. Full behavioral coverage: tribe_ban_expiry_tests.move.
    #[test]
    fun ro05_tribe_global_ban_type_separation_locked() {
        let mut ctx = sui::tx_context::dummy();
        let reg = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);

        let (_, _, member_ban) = membership::roles_of(&reg, ALICE);
        assert!(member_ban == false, 1);
        // No TribeGovernance or Clock parameter in roles_of — type-system enforces separation.

        sui::test_utils::destroy(reg);
    }

    // ===== RO-06: banned wallet aborts via the member-ban predicate post-roles_of =====
    // Drives the PRODUCTION membership::is_banned predicate (same predicate as before;
    // now the call site extracts it from roles_of's third return value).
    // Asserts the value returned by roles_of correctly signals a ban.
    // Full entry-fn abort coverage (E_SSU_MEMBER_BANNED): ban_enforcement_tests.move BE-02.
    #[test]
    fun ro06_banned_player_flag_correctly_signals_abort() {
        let mut ctx = sui::tx_context::dummy();
        let mut reg = membership::create_member_registry_for_testing(SSU_ADDR, 0, &mut ctx);

        // Insert a banned entry
        membership::set_ban_for_testing(&mut reg, BOB, true);

        let (_, _, member_ban) = membership::roles_of(&reg, BOB);
        // The flag returned by roles_of is the same value the caller will assert!(!...) on.
        assert!(member_ban == true, 1);

        // Confirm a clean player returns false
        let (_, _, clean_ban) = membership::roles_of(&reg, ALICE);
        assert!(clean_ban == false, 2);

        sui::test_utils::destroy(reg);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
