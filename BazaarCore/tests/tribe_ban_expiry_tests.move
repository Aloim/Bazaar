// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::tribe_ban_expiry_tests {
    use sui::clock;
    use sui::test_scenario::{Self as ts};
    use sui::test_utils;
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::tribe_governance_caps;
    use bazaar_core::membership::{Self};
    use dapp_hub::tribe_registry::{Self};

    // Valid hex address literals (CC-07).
    const ALICE: address = @0xA1CE;
    const BOB:   address = @0xB0B;
    const SSU_1: address = @0x5511;
    const TRIBE_ID: u64  = 1;
    const ONE_HOUR_MS: u64 = 3_600_000;

    // ===== Test 1: basic ban lifecycle (Leader) =====
    #[test]
    fun test_tribe_ban_lifecycle_leader() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let members = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_ID, ts::ctx(&mut scenario),
        );
        let future_ms = clk.timestamp_ms() + ONE_HOUR_MS;
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        tribe_governance_caps::tribe_ban_as_leader(
            &leader_cap, &mut gov, &members, BOB, future_ms, &clk, ts::ctx(&mut scenario),
        );
        assert!(tribe_governance::tribe_is_globally_banned(&gov, BOB, &clk));
        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 2: auto-expiry =====
    #[test]
    fun test_tribe_ban_auto_expiry() {
        let mut scenario = ts::begin(ALICE);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let members = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_ID, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        let future_ms = clk.timestamp_ms() + 1000; // 1 second
        tribe_governance_caps::tribe_ban_as_leader(
            &leader_cap, &mut gov, &members, BOB, future_ms, &clk, ts::ctx(&mut scenario),
        );
        assert!(tribe_governance::tribe_is_globally_banned(&gov, BOB, &clk));
        // Advance clock past expiry.
        clock::set_for_testing(&mut clk, future_ms + 1);
        assert!(!tribe_governance::tribe_is_globally_banned(&gov, BOB, &clk));
        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 3: permanent ban never expires =====
    #[test]
    fun test_permanent_ban_never_expires() {
        let mut scenario = ts::begin(ALICE);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let members = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_ID, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        tribe_governance_caps::tribe_ban_as_leader(
            &leader_cap, &mut gov, &members, BOB,
            tribe_governance::permanent_ban_sentinel(),
            &clk, ts::ctx(&mut scenario),
        );
        // Advance clock to a very large value — still banned.
        clock::set_for_testing(&mut clk, 9_000_000_000_000_000);
        assert!(tribe_governance::tribe_is_globally_banned(&gov, BOB, &clk));
        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 4: ban with past expiry aborts E_BAN_EXPIRY_IN_PAST =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance::E_BAN_EXPIRY_IN_PAST)]
    fun test_ban_with_past_expiry_aborts() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let members = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_ID, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        // expires_at_ms == now → NOT > now → abort E_BAN_EXPIRY_IN_PAST.
        let now = clk.timestamp_ms();
        tribe_governance_caps::tribe_ban_as_leader(
            &leader_cap, &mut gov, &members, BOB, now, &clk, ts::ctx(&mut scenario),
        );
        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 5: unban removes the row =====
    #[test]
    fun test_unban_as_leader() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let members = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_ID, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        let future_ms = clk.timestamp_ms() + ONE_HOUR_MS;
        tribe_governance_caps::tribe_ban_as_leader(
            &leader_cap, &mut gov, &members, BOB, future_ms, &clk, ts::ctx(&mut scenario),
        );
        tribe_governance_caps::tribe_unban_as_leader(
            &leader_cap, &mut gov, BOB, &clk, ts::ctx(&mut scenario),
        );
        assert!(!tribe_governance::tribe_is_globally_banned(&gov, BOB, &clk));
        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 6: unban non-banned player aborts E_NOT_BANNED =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance::E_NOT_BANNED)]
    fun test_unban_not_banned_aborts() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        // BOB was never banned — this must abort.
        tribe_governance_caps::tribe_unban_as_leader(
            &leader_cap, &mut gov, BOB, &clk, ts::ctx(&mut scenario),
        );
        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(gov);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 7: re-ban updates expiry (upsert path) =====
    #[test]
    fun test_reban_updates_expiry() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let members = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_ID, ts::ctx(&mut scenario),
        );
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        let t1 = clk.timestamp_ms() + 1_000;
        let t2 = clk.timestamp_ms() + 2_000_000;
        // First ban.
        tribe_governance_caps::tribe_ban_as_leader(
            &leader_cap, &mut gov, &members, BOB, t1, &clk, ts::ctx(&mut scenario),
        );
        // Re-ban with a longer expiry — must not abort (upsert path, not duplicate-add).
        tribe_governance_caps::tribe_ban_as_leader(
            &leader_cap, &mut gov, &members, BOB, t2, &clk, ts::ctx(&mut scenario),
        );
        assert!(tribe_governance::tribe_is_globally_banned(&gov, BOB, &clk));
        test_utils::destroy(leader_cap);
        tribe_governance::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 8: wrong-tribe cap aborts E_WRONG_TRIBE =====
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance_caps::E_WRONG_TRIBE)]
    fun test_wrong_tribe_cap_aborts() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let members = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_ID, ts::ctx(&mut scenario),
        );
        // Wrong tribe ID (99 != 1).
        let wrong_cap = tribe_registry::create_leader_cap_for_testing(99, ts::ctx(&mut scenario));
        tribe_governance_caps::tribe_ban_as_leader(
            &wrong_cap, &mut gov, &members, BOB,
            clk.timestamp_ms() + 1000, &clk, ts::ctx(&mut scenario),
        );
        test_utils::destroy(wrong_cap);
        tribe_governance::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 9: revoked SuperAdmin cap aborts on ban =====
    #[test]
    #[expected_failure(abort_code = 4)] // e_tribe_cap_revoked() = 4
    fun test_revoked_super_admin_cap_ban_aborts() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let members = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_ID, ts::ctx(&mut scenario),
        );
        let cap = tribe_governance::create_super_admin_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        let cap_id = sui::object::id(&cap);
        tribe_governance::add_to_tribe_super_admin_revocation(&mut gov, cap_id);
        tribe_governance_caps::tribe_ban_as_super_admin(
            &cap, &mut gov, &members, BOB,
            clk.timestamp_ms() + 1000, &clk, ts::ctx(&mut scenario),
        );
        test_utils::destroy(cap);
        tribe_governance::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 10 (CC-04): equal-rank ban aborts E_TARGET_RANK_TOO_HIGH =====
    // assert_can_ban (in tribe_governance_caps) aborts via e_target_rank_too_high() (=14).
    // The abort originates in tribe_governance_caps, not tribe_governance, so use a raw
    // code (matches regardless of origin module — cf. Test 9's raw code 4).
    #[test]
    #[expected_failure(abort_code = 14)]
    fun test_mod_cannot_ban_admin_roled_target() {
        let mut scenario = ts::begin(ALICE);
        let clk = clock::create_for_testing(ts::ctx(&mut scenario));
        let mut gov = tribe_governance::construct_for_testing(
            TRIBE_ID, 1, ALICE, 0, std::option::none(), &clk, ts::ctx(&mut scenario),
        );
        let mut members = membership::create_member_registry_for_testing(
            SSU_1, TRIBE_ID, ts::ctx(&mut scenario),
        );
        // Seed BOB as a registry member, then promote his tribe_role to Admin (5)
        // via the real cap-gated path. set_tribe_role requires the member to exist
        // (E_PLAYER_NOT_FOUND) and a TribeLeaderCap for the gov's tribe.
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        membership::seed_owner_entry(&mut members, BOB, &clk);
        membership::set_tribe_role(&leader_cap, &gov, &mut members, BOB, 5, ts::ctx(&mut scenario));
        // Issuer holds a TribeAdminCap (rank 5) and tries to ban a rank-5 target:
        // 5 > 5 is false → E_TARGET_RANK_TOO_HIGH. (A dedicated TribeModCap factory
        // would let us assert the rank-4-vs-rank-5 case; rank-5-vs-rank-5 exercises
        // the same abort path with the available factories.)
        let mod_cap = tribe_governance::create_admin_cap_for_testing(TRIBE_ID, ts::ctx(&mut scenario));
        tribe_governance_caps::tribe_ban_as_admin(
            &mod_cap, &mut gov, &members, BOB,
            clk.timestamp_ms() + 1000, &clk, ts::ctx(&mut scenario),
        );
        test_utils::destroy(leader_cap);
        test_utils::destroy(mod_cap);
        tribe_governance::destroy_for_testing(gov);
        membership::destroy_member_registry_for_testing(members);
        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment.
// ============================================================
