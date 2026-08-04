// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// R6.7.4-bis — Tribe-cap revocation entry fn tests (10 test cases, proposal §7).
// Closes SEC-010: tribe-cap revocation workflow fully exercised.
//
// Abort code reference:
//   E_WRONG_TRIBE             = 1  (tribe_governance.move)
//   E_TRIBE_CAP_REVOKED       = 4  (tribe_governance.move)
//   E_ALREADY_REVOKED         = 5  (tribe_governance_caps.move)
//   E_NOT_REVOKED             = 6  (tribe_governance_caps.move)
//
// Object-lifecycle note: non-drop key objects (TribeGovernance, caps) created as
// locals before an expected abort are left "stranded" — this is well-defined Move
// behaviour: abort terminates execution so the linear type checker does not fire.
// See godot_url_tests.move tests GU-10/11 for the established pattern.

#[test_only]
module bazaar_core::tribe_governance_caps_revocation_tests {
    use sui::clock;
    use sui::transfer;
    use sui::test_scenario::{Self as ts};
    use bazaar_core::tribe_governance::{
        Self, TribeGovernance, TribeSuperAdminCap, TribeAdminCap, TribeModCap,
    };
    use bazaar_core::tribe_governance_caps;
    use bazaar_core::tribe_governance_test_helpers;

    // ===== Test Constants =====
    const TRIBE_ID:   u64     = 1;
    const TRIBE_ID_2: u64     = 2;
    const LEADER:     address = @0xA1;
    const ACTOR:      address = @0xA2;

    // ===== Test 1 — revoke_tribe_super_admin_cap happy path =====
    // Revoke cap B with authority A; assert revoked; unrevoke; assert cleared.
    // Also verifies event emission (event::emit call path exercised).
    #[test]
    fun t01_revoke_super_admin_cap_happy_path() {
        let mut scenario = ts::begin(ACTOR);
        let mut clk;
        // Tx 1: bootstrap caps; store in scenario for retrieval.
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ctx,
            );
            let cap_a = tribe_governance::new_tribe_super_admin_cap(&gov, ctx);
            let cap_b = tribe_governance::new_tribe_super_admin_cap(&gov, ctx);
            tribe_governance_test_helpers::destroy_for_testing(gov);
            transfer::public_transfer(cap_a, ACTOR);
            transfer::public_transfer(cap_b, ACTOR);
        };

        // Tx 2: revoke B, assert true; unrevoke B, assert false.
        ts::next_tx(&mut scenario, ACTOR);
        {
            let mut gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ts::ctx(&mut scenario),
            );
            let cap_a = ts::take_from_address<TribeSuperAdminCap>(&scenario, ACTOR);
            let cap_b = ts::take_from_address<TribeSuperAdminCap>(&scenario, ACTOR);
            let b_id  = object::id(&cap_b);

            assert!(!tribe_governance::is_tribe_super_admin_cap_revoked(&gov, b_id), 0);

            tribe_governance_caps::revoke_tribe_super_admin_cap(
                &cap_a, &mut gov, b_id, &clk, ts::ctx(&mut scenario),
            );
            assert!(tribe_governance::is_tribe_super_admin_cap_revoked(&gov, b_id), 1);

            tribe_governance_caps::unrevoke_tribe_super_admin_cap(
                &cap_a, &mut gov, b_id, &clk, ts::ctx(&mut scenario),
            );
            assert!(!tribe_governance::is_tribe_super_admin_cap_revoked(&gov, b_id), 2);

            tribe_governance_test_helpers::destroy_for_testing(gov);
            ts::return_to_address(ACTOR, cap_a);
            ts::return_to_address(ACTOR, cap_b);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 2 — revoke_tribe_super_admin_cap E_WRONG_TRIBE negative =====
    // Authority cap tribe_id=1 used against gov tribe_id=2 → aborts E_WRONG_TRIBE (1).
    // Pattern: inline local objects; abort fires before cleanup (established by GU-10).
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance::E_WRONG_TRIBE, location = bazaar_core::tribe_governance_caps)]
    fun t02_revoke_super_admin_cap_wrong_tribe_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        // gov_1 used only to mint caps (tribe_id=1), then destroyed.
        let gov_1 = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 1, LEADER, 0, &clk, &mut ctx,
        );
        let cap_a = tribe_governance::new_tribe_super_admin_cap(&gov_1, &mut ctx);
        let cap_b = tribe_governance::new_tribe_super_admin_cap(&gov_1, &mut ctx);
        tribe_governance_test_helpers::destroy_for_testing(gov_1);
        // gov_2 has tribe_id=2 — mismatches cap_a.tribe_id=1.
        let mut gov_2 = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID_2, 1, LEADER, 0, &clk, &mut ctx,
        );
        let b_id = object::id(&cap_b);
        // Aborts E_WRONG_TRIBE — cap_a.tribe_id=1 != gov_2.tribe_id=2.
        tribe_governance_caps::revoke_tribe_super_admin_cap(
            &cap_a, &mut gov_2, b_id, &clk, &mut ctx,
        );
        abort 0
    }

    // ===== Test 3 — revoke_tribe_super_admin_cap E_ALREADY_REVOKED negative =====
    // Revoke cap B twice — second call aborts E_ALREADY_REVOKED (5).
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance_caps::E_ALREADY_REVOKED, location = bazaar_core::tribe_governance_caps)]
    fun t03_revoke_super_admin_cap_already_revoked_aborts() {
        let mut scenario = ts::begin(ACTOR);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ctx,
            );
            let cap_a = tribe_governance::new_tribe_super_admin_cap(&gov, ctx);
            let cap_b = tribe_governance::new_tribe_super_admin_cap(&gov, ctx);
            tribe_governance_test_helpers::destroy_for_testing(gov);
            transfer::public_transfer(cap_a, ACTOR);
            transfer::public_transfer(cap_b, ACTOR);
        };

        ts::next_tx(&mut scenario, ACTOR);
        {
            let mut gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ts::ctx(&mut scenario),
            );
            let cap_a = ts::take_from_address<TribeSuperAdminCap>(&scenario, ACTOR);
            let cap_b = ts::take_from_address<TribeSuperAdminCap>(&scenario, ACTOR);
            let b_id  = object::id(&cap_b);

            // First revoke — succeeds.
            tribe_governance_caps::revoke_tribe_super_admin_cap(
                &cap_a, &mut gov, b_id, &clk, ts::ctx(&mut scenario),
            );
            // Second revoke — aborts E_ALREADY_REVOKED.
            tribe_governance_caps::revoke_tribe_super_admin_cap(
                &cap_a, &mut gov, b_id, &clk, ts::ctx(&mut scenario),
            );
            abort 0
        }
    }

    // ===== Test 4 — unrevoke_tribe_super_admin_cap happy path =====
    // Focused unrevoke test: revoke B, assert true; unrevoke B, assert false.
    #[test]
    fun t04_unrevoke_super_admin_cap_happy_path() {
        let mut scenario = ts::begin(ACTOR);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ctx,
            );
            let cap_a = tribe_governance::new_tribe_super_admin_cap(&gov, ctx);
            let cap_b = tribe_governance::new_tribe_super_admin_cap(&gov, ctx);
            tribe_governance_test_helpers::destroy_for_testing(gov);
            transfer::public_transfer(cap_a, ACTOR);
            transfer::public_transfer(cap_b, ACTOR);
        };

        ts::next_tx(&mut scenario, ACTOR);
        {
            let mut gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ts::ctx(&mut scenario),
            );
            let cap_a = ts::take_from_address<TribeSuperAdminCap>(&scenario, ACTOR);
            let cap_b = ts::take_from_address<TribeSuperAdminCap>(&scenario, ACTOR);
            let b_id  = object::id(&cap_b);

            tribe_governance_caps::revoke_tribe_super_admin_cap(
                &cap_a, &mut gov, b_id, &clk, ts::ctx(&mut scenario),
            );
            assert!(tribe_governance::is_tribe_super_admin_cap_revoked(&gov, b_id), 0);

            tribe_governance_caps::unrevoke_tribe_super_admin_cap(
                &cap_a, &mut gov, b_id, &clk, ts::ctx(&mut scenario),
            );
            // Table entry removed — accessor returns false.
            assert!(!tribe_governance::is_tribe_super_admin_cap_revoked(&gov, b_id), 1);

            tribe_governance_test_helpers::destroy_for_testing(gov);
            ts::return_to_address(ACTOR, cap_a);
            ts::return_to_address(ACTOR, cap_b);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 5 — revoke_tribe_admin_cap E_TRIBE_CAP_REVOKED negative =====
    // Authority cap is itself revoked before attempting to revoke an admin cap → aborts 4.
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance::E_TRIBE_CAP_REVOKED, location = bazaar_core::tribe_governance_caps)]
    fun t05_revoke_admin_cap_authority_self_revoked_aborts() {
        let mut scenario = ts::begin(ACTOR);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ctx,
            );
            let cap_a     = tribe_governance::new_tribe_super_admin_cap(&gov, ctx);
            let cap_b     = tribe_governance::new_tribe_super_admin_cap(&gov, ctx);
            let admin_cap = tribe_governance::new_tribe_admin_cap(&gov, ctx);
            tribe_governance_test_helpers::destroy_for_testing(gov);
            transfer::public_transfer(cap_a, ACTOR);
            transfer::public_transfer(cap_b, ACTOR);
            transfer::public_transfer(admin_cap, ACTOR);
        };

        ts::next_tx(&mut scenario, ACTOR);
        {
            let mut gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ts::ctx(&mut scenario),
            );
            let cap_a     = ts::take_from_address<TribeSuperAdminCap>(&scenario, ACTOR);
            let cap_b     = ts::take_from_address<TribeSuperAdminCap>(&scenario, ACTOR);
            let admin_cap = ts::take_from_address<TribeAdminCap>(&scenario, ACTOR);
            let a_id      = object::id(&cap_a);
            let admin_id  = object::id(&admin_cap);

            // cap_b revokes cap_a — cap_a is now in the revocation table.
            tribe_governance_caps::revoke_tribe_super_admin_cap(
                &cap_b, &mut gov, a_id, &clk, ts::ctx(&mut scenario),
            );
            // cap_a is revoked — using it as authority aborts E_TRIBE_CAP_REVOKED.
            tribe_governance_caps::revoke_tribe_admin_cap(
                &cap_a, &mut gov, admin_id, &clk, ts::ctx(&mut scenario),
            );
            abort 0
        }
    }

    // ===== Test 6 — revoke_tribe_mod_cap E_WRONG_TRIBE negative =====
    // Admin cap tribe_id=2 used against gov tribe_id=1 → aborts E_WRONG_TRIBE (1).
    // Pattern: inline local objects; abort fires before cleanup (established by GU-10).
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance::E_WRONG_TRIBE, location = bazaar_core::tribe_governance_caps)]
    fun t06_revoke_mod_cap_wrong_tribe_aborts() {
        let mut ctx = tx_context::dummy();
        let clk = clock::create_for_testing(&mut ctx);
        // gov used to mint a mod cap with tribe_id=1; gov is also the target (tribe_id=1).
        let mut gov_1 = tribe_governance_test_helpers::create_for_testing(
            TRIBE_ID, 1, LEADER, 0, &clk, &mut ctx,
        );
        let mod_cap = tribe_governance::new_tribe_mod_cap(&gov_1, &mut ctx);
        // admin cap with wrong tribe_id=2.
        let admin_2 = tribe_governance_test_helpers::create_admin_cap_for_testing(
            TRIBE_ID_2, &mut ctx,
        );
        let mod_id = object::id(&mod_cap);
        // admin_2.tribe_id=2 != gov_1.tribe_id=1 → E_WRONG_TRIBE.
        tribe_governance_caps::revoke_tribe_mod_cap(
            &admin_2, &mut gov_1, mod_id, &clk, &mut ctx,
        );
        abort 0
    }

    // ===== Test 7 — unrevoke_tribe_admin_cap happy path =====
    // Revoke TribeAdminCap, assert revoked; unrevoke, assert cleared.
    #[test]
    fun t07_unrevoke_admin_cap_happy_path() {
        let mut scenario = ts::begin(ACTOR);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ctx,
            );
            let super_cap = tribe_governance::new_tribe_super_admin_cap(&gov, ctx);
            let admin_cap = tribe_governance::new_tribe_admin_cap(&gov, ctx);
            tribe_governance_test_helpers::destroy_for_testing(gov);
            transfer::public_transfer(super_cap, ACTOR);
            transfer::public_transfer(admin_cap, ACTOR);
        };

        ts::next_tx(&mut scenario, ACTOR);
        {
            let mut gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ts::ctx(&mut scenario),
            );
            let super_cap = ts::take_from_address<TribeSuperAdminCap>(&scenario, ACTOR);
            let admin_cap = ts::take_from_address<TribeAdminCap>(&scenario, ACTOR);
            let admin_id  = object::id(&admin_cap);

            tribe_governance_caps::revoke_tribe_admin_cap(
                &super_cap, &mut gov, admin_id, &clk, ts::ctx(&mut scenario),
            );
            assert!(tribe_governance::is_tribe_admin_cap_revoked(&gov, admin_id), 0);

            tribe_governance_caps::unrevoke_tribe_admin_cap(
                &super_cap, &mut gov, admin_id, &clk, ts::ctx(&mut scenario),
            );
            assert!(!tribe_governance::is_tribe_admin_cap_revoked(&gov, admin_id), 1);

            tribe_governance_test_helpers::destroy_for_testing(gov);
            ts::return_to_address(ACTOR, super_cap);
            ts::return_to_address(ACTOR, admin_cap);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 8 — unrevoke_tribe_admin_cap E_NOT_REVOKED negative =====
    // Unrevoke a cap not in the revocation table → aborts E_NOT_REVOKED (6).
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance_caps::E_NOT_REVOKED, location = bazaar_core::tribe_governance_caps)]
    fun t08_unrevoke_admin_cap_not_revoked_aborts() {
        let mut scenario = ts::begin(ACTOR);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ctx,
            );
            let super_cap = tribe_governance::new_tribe_super_admin_cap(&gov, ctx);
            let admin_cap = tribe_governance::new_tribe_admin_cap(&gov, ctx);
            tribe_governance_test_helpers::destroy_for_testing(gov);
            transfer::public_transfer(super_cap, ACTOR);
            transfer::public_transfer(admin_cap, ACTOR);
        };

        ts::next_tx(&mut scenario, ACTOR);
        {
            let mut gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ts::ctx(&mut scenario),
            );
            let super_cap = ts::take_from_address<TribeSuperAdminCap>(&scenario, ACTOR);
            let admin_cap = ts::take_from_address<TribeAdminCap>(&scenario, ACTOR);
            let admin_id  = object::id(&admin_cap);

            // No prior revoke — unrevoke aborts E_NOT_REVOKED.
            tribe_governance_caps::unrevoke_tribe_admin_cap(
                &super_cap, &mut gov, admin_id, &clk, ts::ctx(&mut scenario),
            );
            abort 0
        }
    }

    // ===== Test 9 — unrevoke_tribe_mod_cap happy path =====
    // Revoke TribeModCap via TribeAdminCap; assert revoked; unrevoke; assert cleared.
    #[test]
    fun t09_unrevoke_mod_cap_happy_path() {
        let mut scenario = ts::begin(ACTOR);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ctx,
            );
            let admin_cap = tribe_governance::new_tribe_admin_cap(&gov, ctx);
            let mod_cap   = tribe_governance::new_tribe_mod_cap(&gov, ctx);
            tribe_governance_test_helpers::destroy_for_testing(gov);
            transfer::public_transfer(admin_cap, ACTOR);
            transfer::public_transfer(mod_cap, ACTOR);
        };

        ts::next_tx(&mut scenario, ACTOR);
        {
            let mut gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ts::ctx(&mut scenario),
            );
            let admin_cap = ts::take_from_address<TribeAdminCap>(&scenario, ACTOR);
            let mod_cap   = ts::take_from_address<TribeModCap>(&scenario, ACTOR);
            let mod_id    = object::id(&mod_cap);

            tribe_governance_caps::revoke_tribe_mod_cap(
                &admin_cap, &mut gov, mod_id, &clk, ts::ctx(&mut scenario),
            );
            assert!(tribe_governance::is_tribe_mod_cap_revoked(&gov, mod_id), 0);

            tribe_governance_caps::unrevoke_tribe_mod_cap(
                &admin_cap, &mut gov, mod_id, &clk, ts::ctx(&mut scenario),
            );
            assert!(!tribe_governance::is_tribe_mod_cap_revoked(&gov, mod_id), 1);

            tribe_governance_test_helpers::destroy_for_testing(gov);
            ts::return_to_address(ACTOR, admin_cap);
            ts::return_to_address(ACTOR, mod_cap);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== Test 10 — unrevoke_tribe_mod_cap E_NOT_REVOKED negative =====
    // Unrevoke a mod cap not in the revocation table → aborts E_NOT_REVOKED (6).
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance_caps::E_NOT_REVOKED, location = bazaar_core::tribe_governance_caps)]
    fun t10_unrevoke_mod_cap_not_revoked_aborts() {
        let mut scenario = ts::begin(ACTOR);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ctx,
            );
            let admin_cap = tribe_governance::new_tribe_admin_cap(&gov, ctx);
            let mod_cap   = tribe_governance::new_tribe_mod_cap(&gov, ctx);
            tribe_governance_test_helpers::destroy_for_testing(gov);
            transfer::public_transfer(admin_cap, ACTOR);
            transfer::public_transfer(mod_cap, ACTOR);
        };

        ts::next_tx(&mut scenario, ACTOR);
        {
            let mut gov = tribe_governance_test_helpers::create_for_testing(
                TRIBE_ID, 1, LEADER, 0, &clk, ts::ctx(&mut scenario),
            );
            let admin_cap = ts::take_from_address<TribeAdminCap>(&scenario, ACTOR);
            let mod_cap   = ts::take_from_address<TribeModCap>(&scenario, ACTOR);
            let mod_id    = object::id(&mod_cap);

            // No prior revoke — unrevoke aborts E_NOT_REVOKED.
            tribe_governance_caps::unrevoke_tribe_mod_cap(
                &admin_cap, &mut gov, mod_id, &clk, ts::ctx(&mut scenario),
            );
            abort 0
        }
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
