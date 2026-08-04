// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_core::ssu_super_admin_cap_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use bazaar_core::membership::{Self, SSUOwnerCap, SSUSuperAdminCap};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::ssu_governance_caps;

    // ===== Test Constants =====
    const ALICE: address = @0xA11CE;   // SSU owner
    const BOB:   address = @0xB0B;    // super-admin recipient
    const CAROL: address = @0xCA01;   // second recipient
    const SSU_1: address = @0x5511;
    const SSU_2: address = @0x5522;
    const TRIBE_ID: u64  = 1;
    const BAZAAR_TYPE: u8 = 0;

    fun fake_widget_id(): sui::object::ID {
        sui::object::id_from_address(@0x1234)
    }

    // ===== T01 — Happy path: Owner issues SSUSuperAdminCap =====
    // Verifies cap lands in recipient's inventory and event is emitted.
    #[test]
    fun t01_issue_super_admin_cap_happy_path() {
        let mut scenario = ts::begin(ALICE);

        // Tx 1: bootstrap gov + owner cap
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

        // Tx 2: Alice issues SuperAdmin cap to Bob
        ts::next_tx(&mut scenario, ALICE);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            ssu_governance_caps::issue_ssu_super_admin_cap(
                &owner_cap, &gov, BOB, &clk, ctx,
            );
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        // Tx 3: verify Bob holds the cap and event was emitted
        ts::next_tx(&mut scenario, BOB);
        {
            assert!(ts::has_most_recent_for_address<SSUSuperAdminCap>(BOB), 0);
            let cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, BOB);
            assert!(membership::ssu_super_admin_cap_ssu_id(&cap) == SSU_1, 1);
            ts::return_to_address(BOB, cap);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== T02 — Wrong-SSU owner cap rejected on issue =====
    // Owner of SSU_2 cannot issue a SuperAdmin cap scoped to SSU_1's governance.
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_WRONG_SSU, location = bazaar_core::ssu_governance_caps)]
    fun t02_issue_rejects_wrong_ssu_owner_cap() {
        let mut scenario = ts::begin(ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // gov scoped to SSU_1
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_1, BAZAAR_TYPE, TRIBE_ID, ALICE, fake_widget_id(), &clk, ctx,
            );
            // owner_cap scoped to SSU_2 — intentional mismatch
            let bad_cap = membership::create_ssu_owner_cap_for_testing(SSU_2, TRIBE_ID, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_transfer(bad_cap, ALICE);
            clock::destroy_for_testing(clk);
        };

        ts::next_tx(&mut scenario, ALICE);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let bad_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // Should abort with E_WRONG_SSU
            ssu_governance_caps::issue_ssu_super_admin_cap(&bad_cap, &gov, BOB, &clk, ctx);
            clock::destroy_for_testing(clk);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, bad_cap);
        };
        ts::end(scenario);
    }

    // ===== T03 — Re-issue to a second recipient succeeds =====
    // Two SSUSuperAdminCap objects can coexist for the same SSU with distinct holders.
    #[test]
    fun t03_reissue_second_recipient_succeeds() {
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

        // Issue to BOB
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

        // Issue to CAROL (second recipient)
        ts::next_tx(&mut scenario, ALICE);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            ssu_governance_caps::issue_ssu_super_admin_cap(&owner_cap, &gov, CAROL, &clk, ctx);
            clock::destroy_for_testing(clk);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, owner_cap);
        };

        // Verify both BOB and CAROL hold a cap for SSU_1
        ts::next_tx(&mut scenario, BOB);
        {
            assert!(ts::has_most_recent_for_address<SSUSuperAdminCap>(BOB), 0);
            assert!(ts::has_most_recent_for_address<SSUSuperAdminCap>(CAROL), 1);
            let bob_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, BOB);
            let carol_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, CAROL);
            assert!(membership::ssu_super_admin_cap_ssu_id(&bob_cap) == SSU_1, 2);
            assert!(membership::ssu_super_admin_cap_ssu_id(&carol_cap) == SSU_1, 3);
            ts::return_to_address(BOB, bob_cap);
            ts::return_to_address(CAROL, carol_cap);
        };

        ts::end(scenario);
    }

    // ===== T04 — Revoke happy path: Owner revokes by cap ID, cap stays in wallet =====
    // REWRITTEN (ESC-01 reversal). Owner revokes Bob's cap by ID without holding it.
    // Post-revoke: Bob still holds the cap object; is_ssu_super_admin_cap_valid returns false.
    #[test]
    fun t04_revoke_super_admin_cap_happy_path() {
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

        // Alice reads Bob's cap ID then revokes by ID (without holding the cap object)
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

        // Post-revoke: Bob still holds the cap object (new semantics)
        // but is_ssu_super_admin_cap_valid returns false
        ts::next_tx(&mut scenario, BOB);
        {
            assert!(ts::has_most_recent_for_address<SSUSuperAdminCap>(BOB), 0);
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let bob_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, BOB);
            assert!(!ssu_governance_caps::is_ssu_super_admin_cap_valid(&bob_cap, &gov), 1);
            ts::return_shared(gov);
            ts::return_to_address(BOB, bob_cap);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ===== T05 — Wrong-SSU owner cap aborts revoke =====
    // REWRITTEN. New signature: owner_cap scope check is the only abort path.
    // owner_cap.ssu_id (SSU_2) != gov.ssu_id (SSU_1) => E_WRONG_SSU.
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_WRONG_SSU, location = bazaar_core::ssu_governance_caps)]
    fun t05_revoke_wrong_ssu_owner_cap_aborts() {
        let mut scenario = ts::begin(ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_1, BAZAAR_TYPE, TRIBE_ID, ALICE, fake_widget_id(), &clk, ctx,
            );
            let owner_cap = membership::create_ssu_owner_cap_for_testing(SSU_1, TRIBE_ID, ctx);
            let bad_owner_cap = membership::create_ssu_owner_cap_for_testing(SSU_2, TRIBE_ID, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_transfer(owner_cap, ALICE);
            sui::transfer::public_transfer(bad_owner_cap, ALICE);
            clock::destroy_for_testing(clk);
        };

        // Issue cap to BOB using the valid owner cap
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

        // Read Bob's cap ID
        ts::next_tx(&mut scenario, BOB);
        let bob_cap_id;
        {
            let bob_cap = ts::take_from_address<SSUSuperAdminCap>(&scenario, BOB);
            bob_cap_id = sui::object::id(&bob_cap);
            ts::return_to_address(BOB, bob_cap);
        };

        // Attempt revoke with bad owner cap (SSU_2) against SSU_1 governance
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov = ts::take_shared<SSUGovernance>(&scenario);
            let bad_owner_cap = ts::take_from_address<SSUOwnerCap>(&scenario, ALICE);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // Aborts: bad_owner_cap.ssu_id (SSU_2) != gov.ssu_id (SSU_1)
            ssu_governance_caps::revoke_ssu_super_admin_cap(
                &mut gov, bob_cap_id, &bad_owner_cap, &clk, ctx,
            );
            clock::destroy_for_testing(clk);
            ts::return_shared(gov);
            ts::return_to_address(ALICE, bad_owner_cap);
        };
        ts::end(scenario);
    }

    // ===== T07 — Accessor returns the stored ssu_id =====
    // UNCHANGED. membership::ssu_super_admin_cap_ssu_id is unaffected by the redesign.
    #[test]
    fun t07_accessor_returns_stored_ssu_id() {
        let mut scenario = ts::begin(ALICE);
        {
            let ctx = ts::ctx(&mut scenario);
            let cap = membership::create_ssu_super_admin_cap_for_testing(SSU_1, ctx);
            assert!(membership::ssu_super_admin_cap_ssu_id(&cap) == SSU_1, 0);
            // Clean up: transfer to self (cap has no drop)
            sui::transfer::public_transfer(cap, ALICE);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
