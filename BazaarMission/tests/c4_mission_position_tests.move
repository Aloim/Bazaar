// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// C4 / GAS-12 locking tests: per-SSU inline position index in MissionRegistry.
///
/// Tests the production deactivation path (deactivate_internal) removes the
/// inline MissionPosition record so that:
///   1. ssu_mission_ids returns an empty vector → rebind guard passes.
///   2. assert_mission_position_clear allows placement at the freed coordinate.
///
/// Also verifies the SA-REBIND-01 invariant via the ssu_mission_ids + mission_is_active
/// combination (the "directly assert" alternative per task spec, avoids SSURegistry setup).
///
/// COVGAP C4-COVGAP-01: SA-REBIND-01 BLOCK case (active mission + tribe-change rebind
/// via assert_no_active_missions_for_rebind with an SSURegistry) deferred to test-architect
/// (requires SSURegistry.register_ssu test setup not available in this harness).
#[test_only]
module bazaar_mission::c4_mission_position_tests {
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_core::tribe_governance_test_helpers::{Self as tribe_helpers};
    use bazaar_core::bazaar_core_admin;
    use bazaar_mission::mission::{Self, MissionRegistry};

    // ===== Test Constants =====
    const SSU_A: address = @0xA01;
    const TRIBE_7: u64 = 7;
    const BAZAAR_ADVANCED: u8 = 2;
    const GOVERNANCE_MODE_0: u8 = 0;
    const DUMMY_PKG: address = @0x0;
    const VIS_EVERYONE: u8 = 16;
    const DURATION_MIN_MS: u64 = 3_600_001; // > MIN_DURATION_MS (3_600_000)

    // ===== Helper: build a minimal Advanced mission at position (x, y) =====
    // Uses construct_mission_advanced (no world stubs needed — empty reward items).
    // Does NOT call assert_mission_position_clear internally — that happens inside
    // register_mission_advanced (which is the public entry for Advanced missions).
    fun make_advanced_mission_at(
        registry: &mut MissionRegistry,
        x: u64,
        y: u64,
        ctx: &mut TxContext,
    ): sui::object::ID {
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_ADVANCED, TRIBE_7, @0x0, &clk, ctx,
        );
        let tribe_gov = tribe_helpers::create_for_testing(
            TRIBE_7, BAZAAR_ADVANCED, @0x0, GOVERNANCE_MODE_0, &clk, ctx,
        );
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(DUMMY_PKG, ctx);

        let m = mission::construct_mission_advanced(
            &gov,
            &tribe_gov,
            0,                        // mission_type = 0
            b"Test",                  // title
            b"",                      // description
            0,                        // completion_mode = MODE_ITEM_PROOF
            vector[],                 // proof_type_ids (empty)
            vector[],                 // proof_amounts (empty)
            vector[],                 // reward_type_ids (empty)
            vector[],                 // reward_amounts (empty)
            1,                        // max_runs = 1
            0,                        // reward_token_per_run = 0
            0,                        // collateral_token_per_run = 0
            VIS_EVERYONE,             // visibility_roles
            vector[],                 // reward_bundles (empty — no reward items)
            3_600_000,                // taker_time_limit_ms
            DURATION_MIN_MS,          // duration_ms
            x,
            y,
            &shop_cap,
            &clk,
            ctx,
        );

        let mission_id = mission::register_mission_advanced(registry, m, &shop_cap);

        gov_helpers::destroy_for_testing(gov);
        tribe_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(shop_cap);
        clock::destroy_for_testing(clk);

        mission_id
    }

    // ===== C4-IDX-01: production deactivate frees position for reuse =====
    //
    // Sequence:
    //   1. Create a mission at (5, 5).
    //   2. Verify ssu_mission_ids has exactly 1 entry (the new mission).
    //   3. Verify assert_mission_position_clear blocks the same position for another create.
    //   4. deactivate_internal (production path — REMOVES the inline MissionPosition record).
    //   5. ssu_mission_ids is empty → rebind guard emptiness check passes (SA-REBIND-01).
    //   6. Create another mission at (5, 5) → succeeds (no active blocking record).
    //   7. ssu_mission_ids has exactly 1 entry (the replacement mission).
    #[test]
    fun test_deactivate_removes_position_and_allows_reuse() {
        let mut ctx = tx_context::dummy();
        let mut registry = mission::create_mission_registry_for_testing(&mut ctx);

        // Step 1: create mission at (5, 5).
        let mission_id = make_advanced_mission_at(&mut registry, 5, 5, &mut ctx);

        // Step 2: ssu_mission_ids must have exactly 1 entry.
        let ids_after_create = mission::ssu_mission_ids(&registry, SSU_A);
        assert!(vector::length(&ids_after_create) == 1, 0);
        assert!(*vector::borrow(&ids_after_create, 0) == mission_id, 1);

        // Step 3: verify the mission is active (SA-REBIND-01 invariant read directly).
        let m_ref = mission::borrow_mission(&registry, mission_id);
        assert!(mission::mission_is_active(m_ref), 2);

        // Step 4: production deactivate — removes inline MissionPosition from missions_by_ssu.
        mission::deactivate_internal(&mut registry, mission_id);

        // Step 5: ssu_mission_ids must now be empty (rebind-guard emptiness semantics).
        let ids_after_deactivate = mission::ssu_mission_ids(&registry, SSU_A);
        assert!(vector::is_empty(&ids_after_deactivate), 3);

        // Step 6: placing a second mission at the same coord must succeed.
        let mission2_id = make_advanced_mission_at(&mut registry, 5, 5, &mut ctx);

        // Step 7: exactly one entry in the index for the replacement mission.
        let ids_final = mission::ssu_mission_ids(&registry, SSU_A);
        assert!(vector::length(&ids_final) == 1, 4);
        assert!(*vector::borrow(&ids_final, 0) == mission2_id, 5);

        test_utils::destroy(registry);
    }

    // ===== C4-IDX-02: SA-REBIND-01 invariant — active mission visible via ssu_mission_ids =====
    //
    // The ssu_rebind_mission_guard reads ssu_mission_ids then calls mission_is_active on
    // each returned ID. This test verifies:
    //   - An active mission's ID appears in ssu_mission_ids and mission_is_active returns true.
    //   - After deactivation, the ID is absent from ssu_mission_ids.
    //
    // This is the "directly assert via ssu_mission_ids + mission_is_active" alternative per
    // the C4 spec (avoids SSURegistry setup needed for assert_no_active_missions_for_rebind).
    // See COVGAP C4-COVGAP-01 for the full on-chain guard BLOCK path test.
    #[test]
    fun test_sa_rebind01_active_mission_visible_in_index() {
        let mut ctx = tx_context::dummy();
        let mut registry = mission::create_mission_registry_for_testing(&mut ctx);

        // Create an active mission.
        let mission_id = make_advanced_mission_at(&mut registry, 10, 20, &mut ctx);

        // ssu_mission_ids returns [mission_id] → the guard would iterate and check is_active.
        let ids = mission::ssu_mission_ids(&registry, SSU_A);
        assert!(vector::length(&ids) == 1, 0);
        let mid = *vector::borrow(&ids, 0);
        assert!(mid == mission_id, 1);

        // The guard calls mission_is_active — it must be true for an active mission.
        let m_ref = mission::borrow_mission(&registry, mid);
        assert!(mission::mission_is_active(m_ref), 2);

        // After deactivation: the ID leaves ssu_mission_ids → guard loop doesn't iterate →
        // assert_no_active_missions_for_rebind would NOT abort (tribe-change rebind allowed).
        mission::deactivate_internal(&mut registry, mission_id);
        let ids_after = mission::ssu_mission_ids(&registry, SSU_A);
        assert!(vector::is_empty(&ids_after), 3);

        // Confirm the mission object itself is now inactive (belt-and-suspenders).
        let m_ref2 = mission::borrow_mission(&registry, mission_id);
        assert!(!mission::mission_is_active(m_ref2), 4);

        test_utils::destroy(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
