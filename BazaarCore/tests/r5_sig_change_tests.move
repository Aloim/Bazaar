// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// R5.2.b.2 — sig change tests, membership / set_tribe_role half (5 tests).
// V35 package split: the trade + announcement_proxy half moved to
// BazaarMission/tests/r5_sig_change_tests.move with its subject modules.
// This half stays in core: it exercises membership internals
// (insert_stranger_entry is public(package) — intra-bazaar_core only).
// Covers: set_tribe_role (4), tribe-id mismatch ledger-pattern (1).

#[test_only]
module bazaar_core::r5_sig_change_tests {
    use sui::test_utils;
    use sui::clock;
    use dapp_hub::tribe_registry;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_core::membership;
    use bazaar_core::bazaar_assertions;

    const TRIBE_ID: u64 = 1;
    const SSU_ID: address = @0x5A;
    const LEADER: address = @0xA1;
    const PLAYER: address = @0xB1;

    // ===== set_tribe_role — 4 tests =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_EASY_OR_ADVANCED_BAZAAR)]
    fun test_set_tribe_role_rejects_notribe_gov() {
        // TribeGovernance cannot be created with type=0; test the gate directly
        bazaar_assertions::assert_easy_or_advanced(0);
    }

    #[test]
    fun test_set_tribe_role_accepts_easy_gov() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut registry = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);
        // register_stranger uses tx_context::sender; dummy ctx sender = @0x0
        membership::insert_stranger_entry(&mut registry, &clock, &mut ctx);
        let dummy_player = tx_context::sender(&ctx);
        membership::set_tribe_role(&leader_cap, &tribe_gov, &mut registry, dummy_player, 1, &mut ctx);
        test_utils::destroy(leader_cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_set_tribe_role_accepts_advanced_gov() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let mut registry = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);
        membership::insert_stranger_entry(&mut registry, &clock, &mut ctx);
        let dummy_player = tx_context::sender(&ctx);
        membership::set_tribe_role(&leader_cap, &tribe_gov, &mut registry, dummy_player, 2, &mut ctx);
        test_utils::destroy(leader_cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = bazaar_core::membership::E_TRIBE_ID_MISMATCH)]
    fun test_set_tribe_role_rejects_wrong_tribe_id() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Cap is for tribe 1 but governance is for tribe 99 — type gate passes, coherence fails
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(99, 1, LEADER, 0, &clock, &mut ctx);
        let mut registry = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);
        membership::set_tribe_role(&leader_cap, &tribe_gov, &mut registry, PLAYER, 1, &mut ctx);
        test_utils::destroy(leader_cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }

    // ===== Tribe-id mismatch pattern test (SA-15) — ledger-pattern half =====
    // The cap/board-anchored announcement_proxy patterns moved to
    // BazaarMission/tests/r5_sig_change_tests.move with announcement_proxy.

    // Pattern: ledger-anchored — set_tribe_role membership coherence
    #[test]
    #[expected_failure(abort_code = bazaar_core::membership::E_TRIBE_ID_MISMATCH)]
    fun test_tribe_id_mismatch_in_ledger() {
        // set_tribe_role: leader_cap tribe_id=1, tribe_gov tribe_id=99 → E_TRIBE_ID_MISMATCH=8
        // (represents ledger-pattern: object.tribe_id != tribe_gov.tribe_id)
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(99, 1, LEADER, 0, &clock, &mut ctx);
        let mut registry = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);
        membership::set_tribe_role(&leader_cap, &tribe_gov, &mut registry, PLAYER, 1, &mut ctx);
        test_utils::destroy(leader_cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
