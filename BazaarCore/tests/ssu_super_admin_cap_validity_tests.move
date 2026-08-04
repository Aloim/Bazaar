// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::ssu_super_admin_cap_validity_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use bazaar_core::membership::{Self, SSUOwnerCap, SSUSuperAdminCap};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::ssu_governance_caps;

    // ===== Test Constants =====
    const ALICE: address = @0xA11CE;   // SSU owner / attacker in adversarial tests
    const BOB:   address = @0xB0B;    // super-admin recipient / victim's SSU owner
    const CAROL: address = @0xCA01;   // second recipient / victim's super-admin holder
    const SSU_1: address = @0x5511;
    const SSU_2: address = @0x5522;
    const TRIBE_ID: u64  = 1;
    const BAZAAR_TYPE: u8 = 0;

    fun fake_widget_id(): sui::object::ID {
        sui::object::id_from_address(@0x1234)
    }

    // ===== T06 — Scope isolation: wrong-SSU cap fails validity check =====
    // Repurposed from original T06 (by-value revoke with wrong-SSU cap).
    // The new revoke does not accept the cap object; the wrong-scope defence
    // moves into the accessor. This test verifies:
    //   is_ssu_super_admin_cap_valid(cap_scoped_to_SSU_2, gov_SSU_1) == false
    // The scope check is the first condition in the accessor (fast-path rejection).
    #[test]
    fun t06_accessor_scope_isolation_wrong_ssu_returns_false() {
        let mut scenario = ts::begin(ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // gov for SSU_1
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_1, BAZAAR_TYPE, TRIBE_ID, ALICE, fake_widget_id(), &clk, ctx,
            );
            // mis-scoped cap created for SSU_2
            let ssu2_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_2, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_transfer(ssu2_cap, ALICE);
            clock::destroy_for_testing(clk);
        };

        ts::next_tx(&mut scenario, ALICE);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let ssu2_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, ALICE);
            // cap is scoped to SSU_2 but governance is for SSU_1 — must return false
            assert!(!ssu_governance_caps::is_ssu_super_admin_cap_valid(&ssu2_cap, &gov), 0);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, ssu2_cap);
        };
        ts::end(scenario);
    }

    // ===== T08 — Revoke then GC: cap is consumed by destroy_revoked_super_admin_cap =====
    // Redesigned. Under new semantics revoke does NOT consume the cap — the cap
    // remains in Bob's wallet. A subsequent call to destroy_revoked_super_admin_cap
    // (GC entry fn) consumes it by value and deletes the UID.
    // Verifies: post-GC the cap is absent from Bob's wallet.
    #[test]
    fun t08_revoked_cap_consumed_by_gc() {
        let mut scenario = ts::begin(ALICE);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_1, BAZAAR_TYPE, TRIBE_ID, ALICE, fake_widget_id(), &clk, ctx,
            );
            let owner_cap = membership::create_ssu_owner_cap_for_testing(SSU_1, TRIBE_ID, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_transfer(owner_cap, ALICE);
        };

        // Issue cap to BOB
        ts::next_tx(&mut scenario, ALICE);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            ssu_governance_caps::issue_ssu_super_admin_cap(&owner_cap, &gov, BOB, &clk, ctx);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        // Read Bob's cap ID
        ts::next_tx(&mut scenario, BOB);
        let bob_cap_id;
        {
            let bob_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, BOB);
            bob_cap_id = sui::object::id(&bob_cap);
            ts::return_to_address(BOB, bob_cap);
        };

        // Alice revokes by ID
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            ssu_governance_caps::revoke_ssu_super_admin_cap(
                &mut gov, bob_cap_id, &owner_cap, &clk, ctx,
            );
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        // Bob still holds the cap post-revoke (new semantics: cap not consumed by revoke)
        ts::next_tx(&mut scenario, BOB);
        {
            assert!(ts::has_most_recent_for_address<SSUSuperAdminCap>(BOB), 0);
        };

        // Bob calls GC — cap is consumed by value, UID deleted
        ts::next_tx(&mut scenario, BOB);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let bob_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, BOB);
            ssu_governance_caps::destroy_revoked_super_admin_cap(bob_cap, &gov);
            ts::return_shared(gov);
        };

        // Post-GC: cap is gone from Bob's wallet
        ts::next_tx(&mut scenario, BOB);
        {
            assert!(!ts::has_most_recent_for_address<SSUSuperAdminCap>(BOB), 1);
            assert!(!ts::has_most_recent_for_address<SSUSuperAdminCap>(ALICE), 2);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== T09 — Adversarial cross-SSU owner revoke aborts =====
    // Rewritten for new by-ID signature. ALICE (owner of SSU_1) attempts to revoke
    // CAROL's SSU_2 SuperAdmin cap using ALICE's SSU_1 owner_cap against SSU_2's
    // governance. The first assert in revoke_ssu_super_admin_cap detects the mismatch
    // and aborts E_WRONG_SSU. ALICE no longer needs to hold CAROL's cap object.
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_WRONG_SSU, location = bazaar_core::ssu_governance_caps)]
    fun t09_adversarial_cross_ssu_owner_cannot_revoke() {
        let mut scenario = ts::begin(ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // gov_b scoped to SSU_2 (victim SSU, owned by BOB)
            let gov_b = ssu_governance_test_helpers::create_for_testing(
                SSU_2, BAZAAR_TYPE, TRIBE_ID, BOB, fake_widget_id(), &clk, ctx,
            );
            let owner_cap_b = membership::create_ssu_owner_cap_for_testing(SSU_2, TRIBE_ID, ctx);
            // ALICE owns SSU_1 (the attacker)
            let owner_cap_a = membership::create_ssu_owner_cap_for_testing(SSU_1, TRIBE_ID, ctx);
            ssu_governance_test_helpers::share_for_testing(gov_b);
            sui::transfer::public_transfer(owner_cap_b, BOB);
            sui::transfer::public_transfer(owner_cap_a, ALICE);
            clock::destroy_for_testing(clk);
        };

        // BOB issues a SuperAdmin cap for SSU_2 to CAROL
        ts::next_tx(&mut scenario, BOB);
        {
            let gov_b = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap_b = ts::take_from_address<SSUOwnerCap>(&scenario, BOB);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            ssu_governance_caps::issue_ssu_super_admin_cap(&owner_cap_b, &gov_b, CAROL, &clk, ctx);
            clock::destroy_for_testing(clk);
            ts::return_shared(gov_b);
            ts::return_to_address(BOB, owner_cap_b);
        };

        // ALICE reads CAROL's cap ID (observes it off-chain/on-chain event)
        ts::next_tx(&mut scenario, CAROL);
        let carol_cap_id;
        {
            let carol_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, CAROL);
            carol_cap_id = sui::object::id(&carol_cap);
            ts::return_to_address(CAROL, carol_cap);
        };

        // ALICE attempts to revoke CAROL's SSU_2 cap using ALICE's SSU_1 owner_cap
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov_b = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap_a = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // Aborts: owner_cap_a.ssu_id (SSU_1) != gov_b.ssu_id (SSU_2)
            ssu_governance_caps::revoke_ssu_super_admin_cap(
                &mut gov_b, carol_cap_id, &owner_cap_a, &clk, ctx,
            );
            clock::destroy_for_testing(clk);
            ts::return_shared(gov_b);
            ts::return_to_address(ALICE, owner_cap_a);
        };
        ts::end(scenario);
    }

    // ===== T10 (NEW) — Double revoke aborts E_ALREADY_REVOKED =====
    // Idempotency guard: calling revoke twice on the same target_cap_id aborts
    // on the second call. The revocation table already contains the ID after the
    // first revoke; table::contains returns true; assert!(!...) aborts E_ALREADY_REVOKED.
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_ALREADY_REVOKED)]
    fun t10_double_revoke_aborts_already_revoked() {
        let mut scenario = ts::begin(ALICE);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_1, BAZAAR_TYPE, TRIBE_ID, ALICE, fake_widget_id(), &clk, ctx,
            );
            let owner_cap = membership::create_ssu_owner_cap_for_testing(SSU_1, TRIBE_ID, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_transfer(owner_cap, ALICE);
        };

        // Issue cap to BOB
        ts::next_tx(&mut scenario, ALICE);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            ssu_governance_caps::issue_ssu_super_admin_cap(&owner_cap, &gov, BOB, &clk, ctx);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        ts::next_tx(&mut scenario, BOB);
        let bob_cap_id;
        {
            let bob_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, BOB);
            bob_cap_id = sui::object::id(&bob_cap);
            ts::return_to_address(BOB, bob_cap);
        };

        // First revoke — succeeds
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            ssu_governance_caps::revoke_ssu_super_admin_cap(
                &mut gov, bob_cap_id, &owner_cap, &clk, ctx,
            );
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        // Second revoke — aborts E_ALREADY_REVOKED
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            ssu_governance_caps::revoke_ssu_super_admin_cap(
                &mut gov, bob_cap_id, &owner_cap, &clk, ctx,
            );
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== T11 (NEW) — GC on non-revoked cap aborts E_NOT_REVOKED =====
    // A holder tries to call destroy_revoked_super_admin_cap on a cap that has
    // never been revoked. The GC fn checks table::contains; it returns false;
    // assert! aborts E_NOT_REVOKED. This prevents accidental cap destruction.
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_NOT_REVOKED, location = bazaar_core::ssu_governance_caps)]
    fun t11_gc_non_revoked_cap_aborts_not_revoked() {
        let mut scenario = ts::begin(ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_1, BAZAAR_TYPE, TRIBE_ID, ALICE, fake_widget_id(), &clk, ctx,
            );
            let owner_cap = membership::create_ssu_owner_cap_for_testing(SSU_1, TRIBE_ID, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_transfer(owner_cap, ALICE);
            clock::destroy_for_testing(clk);
        };

        // Issue cap to BOB (never revoke it)
        ts::next_tx(&mut scenario, ALICE);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            ssu_governance_caps::issue_ssu_super_admin_cap(&owner_cap, &gov, BOB, &clk, ctx);
            clock::destroy_for_testing(clk);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        // BOB tries to GC the cap without it being revoked — aborts E_NOT_REVOKED
        ts::next_tx(&mut scenario, BOB);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let bob_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, BOB);
            ssu_governance_caps::destroy_revoked_super_admin_cap(bob_cap, &gov);
            ts::return_shared(gov);
        };
        ts::end(scenario);
    }

    // ===== T12 (NEW) — is_ssu_super_admin_cap_valid truth table =====
    // Three branches covering all conditions of the accessor:
    //   Branch A: correct scope (SSU_1), NOT in revocation table -> true
    //   Branch B: correct scope (SSU_1), IS in revocation table -> false
    //   Branch C: wrong scope (SSU_2 cap vs SSU_1 gov), not in table -> false
    // All three branches are evaluated in the same test for atomicity.
    #[test]
    fun t12_is_ssu_super_admin_cap_valid_truth_table() {
        let mut scenario = ts::begin(ALICE);
        let mut clk;
        {
            let ctx = ts::ctx(&mut scenario);
            clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_1, BAZAAR_TYPE, TRIBE_ID, ALICE, fake_widget_id(), &clk, ctx,
            );
            let owner_cap = membership::create_ssu_owner_cap_for_testing(SSU_1, TRIBE_ID, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_transfer(owner_cap, ALICE);
        };

        // Issue cap1 to BOB (will be revoked — Branch B)
        ts::next_tx(&mut scenario, ALICE);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            ssu_governance_caps::issue_ssu_super_admin_cap(&owner_cap, &gov, BOB, &clk, ctx);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        // Issue cap2 to CAROL (will NOT be revoked — Branch A)
        ts::next_tx(&mut scenario, ALICE);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            ssu_governance_caps::issue_ssu_super_admin_cap(&owner_cap, &gov, CAROL, &clk, ctx);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        // Create wrong-scope cap (SSU_2) for Branch C
        ts::next_tx(&mut scenario, ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let wrong_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_2, ctx);
            sui::transfer::public_transfer(wrong_cap, ALICE);
        };

        // Read BOB's cap ID and revoke it (Branch B setup)
        ts::next_tx(&mut scenario, BOB);
        let bob_cap_id;
        {
            let bob_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, BOB);
            bob_cap_id = sui::object::id(&bob_cap);
            ts::return_to_address(BOB, bob_cap);
        };

        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            ssu_governance_caps::revoke_ssu_super_admin_cap(
                &mut gov, bob_cap_id, &owner_cap, &clk, ctx,
            );
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        // Evaluate all three branches in one transaction
        ts::next_tx(&mut scenario, CAROL);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);

            // Branch A: CAROL's cap — correct scope (SSU_1), NOT revoked -> true
            let carol_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, CAROL);
            assert!(ssu_governance_caps::is_ssu_super_admin_cap_valid(&carol_cap, &gov), 0);
            ts::return_to_address(CAROL, carol_cap);

            // Branch B: BOB's cap — correct scope (SSU_1), IS revoked -> false
            let bob_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, BOB);
            assert!(!ssu_governance_caps::is_ssu_super_admin_cap_valid(&bob_cap, &gov), 1);
            ts::return_to_address(BOB, bob_cap);

            // Branch C: wrong-scope cap (SSU_2 vs SSU_1 gov) -> false
            let wrong_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, ALICE);
            assert!(!ssu_governance_caps::is_ssu_super_admin_cap_valid(&wrong_cap, &gov), 2);
            ts::return_to_address(ALICE, wrong_cap);

            ts::return_shared(gov);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
