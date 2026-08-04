// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::membership_tests {
    use sui::clock;
    use sui::test_utils;
    use sui::test_scenario;
    use dapp_hub::tribe_registry;
    use bazaar_core::membership::{Self, MemberRegistry, SSUOwnerCap};
    use bazaar_core::tribe_governance_test_helpers;

    // --- Test Constants ---
    const ALICE: address = @0xA11CE;
    const BOB: address = @0xB0B;
    const SSU_1: address = @0x551;
    const TRIBE_1: u64 = 1;

    const CAROL: address = @0xCC;

    // Role values (matching dapp_hub::role_types)
    const ROLE_STRANGER:    u8 = 0;
    const ROLE_MEMBER:      u8 = 2;
    const ROLE_MODERATOR:   u8 = 4;
    const ROLE_ADMIN:       u8 = 5;
    const ROLE_SUPER_ADMIN: u8 = 6;

    // ===== T01: register_stranger and verify initial state =====
    #[test]
    fun test_register_stranger() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        let mut registry = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );

        membership::insert_stranger_entry(
            &mut registry, &clk, test_scenario::ctx(&mut scenario),
        );

        assert!(membership::is_registered(&registry, ALICE), 0);
        assert!(membership::member_count(&registry) == 1, 1);
        assert!(membership::effective_role(&registry, ALICE) == ROLE_STRANGER, 2);
        assert!(!membership::is_banned(&registry, ALICE), 3);

        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
        test_scenario::end(scenario);
    }

    // ===== T02: set_ssu_role changes effective_role =====
    #[test]
    fun test_set_ssu_role() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        let mut registry = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );
        let cap = membership::create_ssu_owner_cap_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );

        membership::insert_stranger_entry(
            &mut registry, &clk, test_scenario::ctx(&mut scenario),
        );

        membership::set_ssu_role(
            &cap, &mut registry, ALICE, ROLE_ADMIN, test_scenario::ctx(&mut scenario),
        );

        assert!(membership::effective_role(&registry, ALICE) == ROLE_ADMIN, 0);

        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
        test_utils::destroy(cap);
        test_scenario::end(scenario);
    }

    // ===== T03: set_ban toggles ban state =====
    #[test]
    fun test_set_ban() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        let mut registry = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );
        let cap = membership::create_ssu_owner_cap_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );

        membership::insert_stranger_entry(
            &mut registry, &clk, test_scenario::ctx(&mut scenario),
        );

        membership::set_ban(&cap, &mut registry, ALICE, true);
        assert!(membership::is_banned(&registry, ALICE), 0);

        membership::set_ban(&cap, &mut registry, ALICE, false);
        assert!(!membership::is_banned(&registry, ALICE), 1);

        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
        test_utils::destroy(cap);
        test_scenario::end(scenario);
    }

    // ===== T04: effective_role returns max of ssu_role and tribe_role =====
    #[test]
    fun test_effective_role_max_of_ssu_tribe() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        let mut registry = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );
        let cap = membership::create_ssu_owner_cap_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );
        // TribeLeaderCap for tribe_id == TRIBE_1 (matches registry.tribe_id)
        let leader_cap = tribe_registry::create_leader_cap_for_testing(
            TRIBE_1, test_scenario::ctx(&mut scenario),
        );
        // TribeGovernance fixture — bazaar_type=1 (Easy) so assert_easy_or_advanced passes
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(
            TRIBE_1, 1, @0xABCD, 0,
            &clk, test_scenario::ctx(&mut scenario),
        );

        membership::insert_stranger_entry(
            &mut registry, &clk, test_scenario::ctx(&mut scenario),
        );

        // Set ssu_role = MODERATOR (4), tribe_role stays at STRANGER (0)
        // effective_role = max(4, 0) = 4
        membership::set_ssu_role(
            &cap, &mut registry, ALICE, ROLE_MODERATOR,
            test_scenario::ctx(&mut scenario),
        );
        assert!(membership::effective_role(&registry, ALICE) == ROLE_MODERATOR, 0);

        // Set tribe_role = ADMIN (5), ssu_role stays at MODERATOR (4)
        // effective_role = max(4, 5) = 5
        membership::set_tribe_role(
            &leader_cap, &tribe_gov, &mut registry, ALICE, ROLE_ADMIN,
            test_scenario::ctx(&mut scenario),
        );
        assert!(membership::effective_role(&registry, ALICE) == ROLE_ADMIN, 1);

        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
        test_utils::destroy(cap);
        test_utils::destroy(leader_cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_scenario::end(scenario);
    }

    // ===== T05: is_banned returns false for unregistered player =====
    #[test]
    fun test_is_banned_unregistered_returns_false() {
        let mut ctx = tx_context::dummy();
        let registry = membership::create_member_registry_for_testing(SSU_1, TRIBE_1, &mut ctx);

        assert!(!membership::is_banned(&registry, @0xDEAD), 0);

        test_utils::destroy(registry);
    }

    // ===== T06: is_member requires role >= MEMBER (2) =====
    #[test]
    fun test_is_member() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        let mut registry = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );
        let cap = membership::create_ssu_owner_cap_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );

        membership::insert_stranger_entry(
            &mut registry, &clk, test_scenario::ctx(&mut scenario),
        );

        // ALICE has ssu_role=STRANGER(0) and tribe_role=STRANGER(0) => not a member
        assert!(!membership::is_member(&registry, ALICE), 0);

        // Set ssu_role to MEMBER (2) => is_member becomes true
        membership::set_ssu_role(
            &cap, &mut registry, ALICE, ROLE_MEMBER,
            test_scenario::ctx(&mut scenario),
        );
        assert!(membership::is_member(&registry, ALICE), 1);

        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
        test_utils::destroy(cap);
        test_scenario::end(scenario);
    }

    // ===== T07: is_moderator_or_above requires role >= MODERATOR (4) =====
    #[test]
    fun test_is_moderator_or_above() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        let mut registry = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );
        let cap = membership::create_ssu_owner_cap_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );

        membership::insert_stranger_entry(
            &mut registry, &clk, test_scenario::ctx(&mut scenario),
        );

        // MEMBER (2) is not moderator_or_above (needs >= 4)
        membership::set_ssu_role(
            &cap, &mut registry, ALICE, ROLE_MEMBER,
            test_scenario::ctx(&mut scenario),
        );
        assert!(!membership::is_moderator_or_above(&registry, ALICE), 0);

        // MODERATOR (4) is moderator_or_above
        membership::set_ssu_role(
            &cap, &mut registry, ALICE, ROLE_MODERATOR,
            test_scenario::ctx(&mut scenario),
        );
        assert!(membership::is_moderator_or_above(&registry, ALICE), 1);

        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
        test_utils::destroy(cap);
        test_scenario::end(scenario);
    }

    // ===== T08: already_registered_aborts =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::membership::E_ALREADY_REGISTERED)]
    fun test_already_registered_aborts() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        let mut registry = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );

        membership::insert_stranger_entry(
            &mut registry, &clk, test_scenario::ctx(&mut scenario),
        );
        // Second call with same sender => E_ALREADY_REGISTERED (3)
        membership::insert_stranger_entry(
            &mut registry, &clk, test_scenario::ctx(&mut scenario),
        );

        // Unreachable — teardown omitted intentionally
        abort 0
    }

    // ===== T09: invalid_role_aborts =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::membership::E_INVALID_ROLE)]
    fun test_invalid_role_aborts() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        let mut registry = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );
        let cap = membership::create_ssu_owner_cap_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(&mut scenario),
        );

        membership::insert_stranger_entry(
            &mut registry, &clk, test_scenario::ctx(&mut scenario),
        );
        // role=0 is invalid (must be 1..=7) => E_INVALID_ROLE (5)
        membership::set_ssu_role(
            &cap, &mut registry, ALICE, 0, test_scenario::ctx(&mut scenario),
        );

        abort 0
    }

    // ===== set_ssu_role_gated (V30) — registry-role-based authority =====

    // Helper: build a registry where ALICE is ADMIN(5) and BOB is a registered
    // Stranger(0), with the scenario sender left on ALICE for the gated call.
    #[test_only]
    fun setup_admin_actor(scenario: &mut test_scenario::Scenario, clk: &clock::Clock): (MemberRegistry, SSUOwnerCap) {
        // sender = ALICE: register ALICE, then owner-cap-promote ALICE to ADMIN.
        let mut registry = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(scenario),
        );
        let cap = membership::create_ssu_owner_cap_for_testing(
            SSU_1, TRIBE_1, test_scenario::ctx(scenario),
        );
        membership::insert_stranger_entry(&mut registry, clk, test_scenario::ctx(scenario));
        membership::set_ssu_role(&cap, &mut registry, ALICE, ROLE_ADMIN, test_scenario::ctx(scenario));
        // sender = BOB: register BOB as Stranger.
        test_scenario::next_tx(scenario, BOB);
        membership::insert_stranger_entry(&mut registry, clk, test_scenario::ctx(scenario));
        // Return with sender back on ALICE for the gated call.
        test_scenario::next_tx(scenario, ALICE);
        (registry, cap)
    }

    // ===== T10: Admin grants Moderator to a Stranger (happy path) =====
    #[test]
    fun test_gated_admin_grants_moderator() {
        let mut scenario = test_scenario::begin(ALICE);
        let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let (mut registry, cap) = setup_admin_actor(&mut scenario, &clk);

        // sender = ALICE (Admin): set BOB to Moderator.
        membership::set_ssu_role_gated(&mut registry, BOB, ROLE_MODERATOR, test_scenario::ctx(&mut scenario));
        assert!(membership::effective_role(&registry, BOB) == ROLE_MODERATOR, 0);

        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
        test_utils::destroy(cap);
        test_scenario::end(scenario);
    }

    // ===== T11: Admin cannot grant a role above their own (SuperAdmin) =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::membership::E_INSUFFICIENT_ROLE)]
    fun test_gated_admin_cannot_grant_above_self() {
        let mut scenario = test_scenario::begin(ALICE);
        let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let (mut registry, cap) = setup_admin_actor(&mut scenario, &clk);

        // new_role=SuperAdmin(6) > actor_role=Admin(5) => E_INSUFFICIENT_ROLE
        membership::set_ssu_role_gated(&mut registry, BOB, ROLE_SUPER_ADMIN, test_scenario::ctx(&mut scenario));

        test_utils::destroy(registry);
        test_utils::destroy(cap);
        clock::destroy_for_testing(clk);
        test_scenario::end(scenario);
    }

    // ===== T12: Admin cannot modify a superior (SuperAdmin target) =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::membership::E_INSUFFICIENT_ROLE)]
    fun test_gated_admin_cannot_modify_superior() {
        let mut scenario = test_scenario::begin(ALICE);
        let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let (mut registry, cap) = setup_admin_actor(&mut scenario, &clk);

        // Owner-cap-promote BOB to SuperAdmin(6) so BOB outranks ALICE(Admin).
        membership::set_ssu_role(&cap, &mut registry, BOB, ROLE_SUPER_ADMIN, test_scenario::ctx(&mut scenario));
        // ALICE (Admin) tries to demote BOB (SuperAdmin) => target_role(6) > actor_role(5) => abort.
        membership::set_ssu_role_gated(&mut registry, BOB, ROLE_MEMBER, test_scenario::ctx(&mut scenario));

        test_utils::destroy(registry);
        test_utils::destroy(cap);
        clock::destroy_for_testing(clk);
        test_scenario::end(scenario);
    }

    // ===== T13: A non-staff Member cannot grant roles =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::membership::E_INSUFFICIENT_ROLE)]
    fun test_gated_member_cannot_grant() {
        let mut scenario = test_scenario::begin(ALICE);
        let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let (mut registry, cap) = setup_admin_actor(&mut scenario, &clk);

        // Demote ALICE from Admin to Member via owner cap, then attempt a gated grant.
        membership::set_ssu_role(&cap, &mut registry, ALICE, ROLE_MEMBER, test_scenario::ctx(&mut scenario));
        // actor_role=Member(2) < Admin(5) => E_INSUFFICIENT_ROLE
        membership::set_ssu_role_gated(&mut registry, BOB, ROLE_MEMBER, test_scenario::ctx(&mut scenario));

        test_utils::destroy(registry);
        test_utils::destroy(cap);
        clock::destroy_for_testing(clk);
        test_scenario::end(scenario);
    }

    // ===== T14: SuperAdmin may grant SuperAdmin (peer) =====
    #[test]
    fun test_gated_super_admin_grants_peer() {
        let mut scenario = test_scenario::begin(ALICE);
        let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let (mut registry, cap) = setup_admin_actor(&mut scenario, &clk);

        // Promote ALICE to SuperAdmin(6) via owner cap.
        membership::set_ssu_role(&cap, &mut registry, ALICE, ROLE_SUPER_ADMIN, test_scenario::ctx(&mut scenario));
        // ALICE (SuperAdmin) grants BOB SuperAdmin(6) — peer grant allowed.
        membership::set_ssu_role_gated(&mut registry, BOB, ROLE_SUPER_ADMIN, test_scenario::ctx(&mut scenario));
        assert!(membership::effective_role(&registry, BOB) == ROLE_SUPER_ADMIN, 0);

        let _ = CAROL;
        clock::destroy_for_testing(clk);
        test_utils::destroy(registry);
        test_utils::destroy(cap);
        test_scenario::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
