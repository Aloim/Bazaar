// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Update Ceremony V2 — Phase 2 (Slice 3) unit tests for the bazaar_core reclaim
// restore setters:
//   - membership::restore_member_entry / restore_tribe_member_entry
//   - ssu_governance::restore_local_ban / deposit_reclaimed_eve
//   - tribe_governance::restore_tribe_ban / deposit_reclaimed_gov_eve
//
// Each covers the happy upsert path + the load-bearing cap/coherence aborts
// (§3.2: every restore setter cap-bound to its target id; no recipient on EVE
// deposit; ban delegates to the validated expiry-checked primitive).

#[test_only]
module bazaar_core::reclaim_restore_setters_tests {
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use dapp_hub::tribe_registry;
    use bazaar_core::membership;
    use bazaar_core::ssu_governance;
    use bazaar_core::ssu_governance_test_helpers as sgh;
    use bazaar_core::tribe_governance;
    use bazaar_core::tribe_governance_test_helpers as tgh;

    const SSU_ID:     address = @0x5;
    const OTHER_SSU:  address = @0xBAD;
    const TRIBE_ID:   u64 = 7;
    const OTHER_TRIBE:u64 = 99;
    const OWNER:      address = @0xA1;
    const LEADER:     address = @0xB2;
    const ALICE:      address = @0xA11CE;

    // ===== membership::restore_member_entry =====

    #[test]
    fun restore_member_inserts_then_upserts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut reg = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);
        let cap = membership::create_ssu_owner_cap_for_testing(SSU_ID, TRIBE_ID, &mut ctx);

        // Insert a fresh member as Admin (5), banned.
        membership::restore_member_entry(&cap, &mut reg, ALICE, 5, true, &clock);
        assert!(membership::ssu_role_of(&reg, ALICE) == 5, 0);
        assert!(membership::is_banned(&reg, ALICE), 1);
        assert!(membership::tribe_role_of(&reg, ALICE) == 0, 2); // tribe_role untouched
        assert!(membership::member_count(&reg) == 1, 3);

        // Upsert the SAME member to Owner (7), unbanned — count must NOT grow.
        membership::restore_member_entry(&cap, &mut reg, ALICE, 7, false, &clock);
        assert!(membership::ssu_role_of(&reg, ALICE) == 7, 4);
        assert!(!membership::is_banned(&reg, ALICE), 5);
        assert!(membership::member_count(&reg) == 1, 6);

        membership::destroy_ssu_owner_cap_for_testing(cap);
        membership::destroy_member_registry_for_testing(reg);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 6, location = bazaar_core::membership)] // E_WRONG_SSU
    fun restore_member_wrong_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut reg = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);
        let cap = membership::create_ssu_owner_cap_for_testing(OTHER_SSU, TRIBE_ID, &mut ctx);

        membership::restore_member_entry(&cap, &mut reg, ALICE, 5, false, &clock);

        membership::destroy_ssu_owner_cap_for_testing(cap);
        membership::destroy_member_registry_for_testing(reg);
        clock::destroy_for_testing(clock);
    }

    // ===== membership::restore_tribe_member_entry =====

    #[test]
    fun restore_tribe_member_inserts_tribe_role() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let gov = tgh::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut reg = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);

        membership::restore_tribe_member_entry(&cap, &gov, &mut reg, ALICE, 6, &clock);
        assert!(membership::tribe_role_of(&reg, ALICE) == 6, 0);
        assert!(membership::ssu_role_of(&reg, ALICE) == 0, 1); // ssu_role untouched
        assert!(membership::member_count(&reg) == 1, 2);

        tribe_registry::destroy_leader_cap_for_testing(cap);
        membership::destroy_member_registry_for_testing(reg);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 8, location = bazaar_core::membership)] // E_TRIBE_ID_MISMATCH
    fun restore_tribe_member_wrong_tribe_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let gov = tgh::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut reg = membership::create_member_registry_for_testing(SSU_ID, TRIBE_ID, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(OTHER_TRIBE, &mut ctx);

        membership::restore_tribe_member_entry(&cap, &gov, &mut reg, ALICE, 6, &clock);

        tribe_registry::destroy_leader_cap_for_testing(cap);
        membership::destroy_member_registry_for_testing(reg);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    // ===== ssu_governance::restore_local_ban =====

    #[test]
    fun restore_local_ban_sets_ban() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx); // now = 0
        let mut gov = sgh::create_for_testing_with_dummy_ids(SSU_ID, 0, 0, OWNER, &clock, &mut ctx);
        let cap = membership::create_ssu_owner_cap_for_testing(SSU_ID, 0, &mut ctx);

        ssu_governance::restore_local_ban(&cap, &mut gov, ALICE, 1_000, &clock, &ctx);
        assert!(ssu_governance::is_banned(&gov, ALICE, &clock), 0);

        membership::destroy_ssu_owner_cap_for_testing(cap);
        sgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = bazaar_core::ssu_governance)] // E_WRONG_SSU
    fun restore_local_ban_wrong_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = sgh::create_for_testing_with_dummy_ids(SSU_ID, 0, 0, OWNER, &clock, &mut ctx);
        let cap = membership::create_ssu_owner_cap_for_testing(OTHER_SSU, 0, &mut ctx);

        ssu_governance::restore_local_ban(&cap, &mut gov, ALICE, 1_000, &clock, &ctx);

        membership::destroy_ssu_owner_cap_for_testing(cap);
        sgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 9, location = bazaar_core::ssu_governance)] // E_BAN_EXPIRY_IN_PAST
    fun restore_local_ban_past_expiry_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx); // now = 0
        let mut gov = sgh::create_for_testing_with_dummy_ids(SSU_ID, 0, 0, OWNER, &clock, &mut ctx);
        let cap = membership::create_ssu_owner_cap_for_testing(SSU_ID, 0, &mut ctx);

        // expires_at_ms == now (0) -> not strictly greater -> abort.
        ssu_governance::restore_local_ban(&cap, &mut gov, ALICE, 0, &clock, &ctx);

        membership::destroy_ssu_owner_cap_for_testing(cap);
        sgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    // ===== ssu_governance::deposit_reclaimed_eve =====

    #[test]
    fun deposit_reclaimed_eve_credits_wallet() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = sgh::create_for_testing_with_dummy_ids(SSU_ID, 0, 0, OWNER, &clock, &mut ctx);
        let cap = membership::create_ssu_owner_cap_for_testing(SSU_ID, 0, &mut ctx);

        ssu_governance::deposit_reclaimed_eve(&cap, &mut gov, coin::mint_for_testing<EVE>(4_242, &mut ctx));
        assert!(ssu_governance::ssu_tax_balance(&gov) == 4_242, 0);

        // Drain before teardown (destroy_for_testing asserts a zero tax_wallet).
        let c = coin::from_balance(ssu_governance::withdraw_from_tax_wallet(&mut gov, 4_242), &mut ctx);
        coin::burn_for_testing(c);
        membership::destroy_ssu_owner_cap_for_testing(cap);
        sgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = bazaar_core::ssu_governance)] // E_WRONG_SSU
    fun deposit_reclaimed_eve_wrong_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = sgh::create_for_testing_with_dummy_ids(SSU_ID, 0, 0, OWNER, &clock, &mut ctx);
        let cap = membership::create_ssu_owner_cap_for_testing(OTHER_SSU, 0, &mut ctx);

        ssu_governance::deposit_reclaimed_eve(&cap, &mut gov, coin::mint_for_testing<EVE>(1, &mut ctx));

        membership::destroy_ssu_owner_cap_for_testing(cap);
        sgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    // ===== tribe_governance::deposit_reclaimed_gov_eve =====

    #[test]
    fun deposit_reclaimed_gov_eve_credits_wallet() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);

        tribe_governance::deposit_reclaimed_gov_eve(&cap, &mut gov, coin::mint_for_testing<EVE>(9_001, &mut ctx));
        assert!(tribe_governance::tribe_tax_balance(&gov) == 9_001, 0);

        // Drain before teardown (destroy_for_testing asserts a zero tax_wallet).
        let c = coin::from_balance(tribe_governance::withdraw_tribe_tax_balance_all(&mut gov), &mut ctx);
        coin::burn_for_testing(c);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = bazaar_core::tribe_governance)] // E_WRONG_TRIBE
    fun deposit_reclaimed_gov_eve_wrong_tribe_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(OTHER_TRIBE, &mut ctx);

        tribe_governance::deposit_reclaimed_gov_eve(&cap, &mut gov, coin::mint_for_testing<EVE>(1, &mut ctx));

        tribe_registry::destroy_leader_cap_for_testing(cap);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    // ===== tribe_governance::restore_tribe_ban =====

    #[test]
    fun restore_tribe_ban_sets_ban() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);

        tribe_governance::restore_tribe_ban(&cap, &mut gov, ALICE, 1_000, &clock, &ctx);
        assert!(tribe_governance::tribe_is_globally_banned(&gov, ALICE, &clock), 0);

        tribe_registry::destroy_leader_cap_for_testing(cap);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = bazaar_core::tribe_governance)] // E_WRONG_TRIBE
    fun restore_tribe_ban_wrong_tribe_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(OTHER_TRIBE, &mut ctx);

        tribe_governance::restore_tribe_ban(&cap, &mut gov, ALICE, 1_000, &clock, &ctx);

        tribe_registry::destroy_leader_cap_for_testing(cap);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
