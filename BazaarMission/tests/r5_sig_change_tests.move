// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// R5.2.b.2 — sig change tests, trade + announcement_proxy half (6 tests).
// V35 package split: these tests moved here with their subject modules
// (bazaar_core::{trade, announcement_proxy} -> bazaar_mission::*). The
// set_tribe_role / membership half STAYS in BazaarCore/tests/
// r5_sig_change_tests.move (it exercises core-private membership internals).
// Covers: consume_proposal_for_ledger (3), tribe-id mismatch patterns via
// announcement_proxy (3).

#[test_only]
module bazaar_mission::r5_sig_change_tests {
    use sui::test_utils;
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_core::bazaar_core_admin;
    use bazaar_mission::trade;
    use bazaar_mission::announcement_proxy;
    use shared_widgets::announcements;

    const TRIBE_ID: u64 = 1;
    const SSU_ID: address = @0x5A;
    const LEADER: address = @0xA1;
    const PLAYER: address = @0xB1;

    // ===== consume_proposal_for_ledger — 3 tests =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_consume_proposal_rejects_easy_ssu() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Easy SSU (type=1) → gate fires before proposal lookup
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 1, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(@0x0, &mut ctx);
        let mut registry = trade::create_trade_registry(&mut ctx);
        let dummy_id = object::id_from_address(@0xDEAD);
        trade::consume_proposal_for_ledger(&mut registry, dummy_id, &shop_cap, &ssu_gov, &clock);
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        test_utils::destroy(shop_cap);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = bazaar_mission::trade::E_PROPOSAL_NOT_FOUND)]
    fun test_consume_proposal_accepts_advanced_ssu() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Advanced SSU (type=2) → gate passes; no proposal in registry → E_PROPOSAL_NOT_FOUND
        let ssu_gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(@0x0, &mut ctx);
        let mut registry = trade::create_trade_registry(&mut ctx);
        let dummy_id = object::id_from_address(@0xDEAD);
        trade::consume_proposal_for_ledger(&mut registry, dummy_id, &shop_cap, &ssu_gov, &clock);
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        test_utils::destroy(shop_cap);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = bazaar_mission::trade::E_SSU_ID_MISMATCH)]
    fun test_consume_proposal_rejects_wrong_ssu_id() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Advanced SSU — gate passes; create a proposal with ssu_id=SSU_ID, then use a
        // ssu_gov with ssu_id=@0xBB → E_SSU_ID_MISMATCH (SA-04)
        let ssu_gov_proposal = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            SSU_ID, 2, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        let mut registry = trade::create_trade_registry(&mut ctx);
        let payment = coin::mint_for_testing<EVE>(0, &mut ctx);
        let proposal_id = trade::create_proposal(
            &mut registry, &ssu_gov_proposal,
            PLAYER, SSU_ID, TRIBE_ID, 2,
            vector::empty(), vector::empty(),
            vector::empty(), vector::empty(),
            payment, 0, 18446744073709551615, &clock, &mut ctx,
        );
        // ssu_gov with different ssu_id (@0xBB) → E_SSU_ID_MISMATCH
        let ssu_gov_wrong = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            @0xBB, 2, TRIBE_ID, LEADER, &clock, &mut ctx,
        );
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(@0x0, &mut ctx);
        trade::consume_proposal_for_ledger(&mut registry, proposal_id, &shop_cap, &ssu_gov_wrong, &clock);
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov_proposal);
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov_wrong);
        test_utils::destroy(shop_cap);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }

    // ===== Tribe-id mismatch pattern tests (SA-15) — announcement_proxy half =====
    // The membership/set_tribe_role-anchored patterns stay in BazaarCore/tests.

    // Pattern: cap-anchored mismatch — announcement_proxy tribe fns
    // cap.tribe_id=1, tribe_gov.tribe_id=99 → E_TRIBE_ID_MISMATCH=1 in announcement_proxy
    #[test]
    #[expected_failure(abort_code = bazaar_mission::announcement_proxy::E_TRIBE_ID_MISMATCH)]
    fun test_tribe_id_mismatch_in_economy_gov() {
        // Tests cap-anchored identity coherence pattern using announcement_proxy
        // (same structural pattern as economy_governance cap-gated fns)
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Cap for tribe 1, governance for tribe 99 — type=1 passes gate; coherence fails
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(99, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = announcements::create_board(SSU_ID, @bazaar_core, &mut ctx);
        announcement_proxy::tribe_post_announcement(
            &cap, &tribe_gov, &mut board, @bazaar_core,
            b"T", b"B", 0, &clock, &mut ctx,
        );
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // Pattern: cap-anchored mismatch (vault-pattern proxy)
    #[test]
    #[expected_failure(abort_code = bazaar_mission::announcement_proxy::E_TRIBE_ID_MISMATCH)]
    fun test_tribe_id_mismatch_in_vault() {
        // Tests cap-anchored mismatch via announcement_proxy (proxy for vault-pattern —
        // both use same "type passes, coherence fails" structure)
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(99, 2, LEADER, 0, &clock, &mut ctx);
        let mut board = announcements::create_board(SSU_ID, @bazaar_core, &mut ctx);
        announcement_proxy::tribe_post_announcement(
            &cap, &tribe_gov, &mut board, @bazaar_core,
            b"T", b"B", 0, &clock, &mut ctx,
        );
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // Pattern: board-anchored — announcement_proxy tribe_delete_announcement
    #[test]
    #[expected_failure(abort_code = bazaar_mission::announcement_proxy::E_TRIBE_ID_MISMATCH)]
    fun test_tribe_id_mismatch_in_withdrawal() {
        // tribe_delete_announcement: cap tribe_id=1, tribe_gov tribe_id=99 → E_TRIBE_ID_MISMATCH=1
        // (represents board/object-anchored pattern: object.tribe_id != tribe_gov.tribe_id)
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(99, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = announcements::create_board(SSU_ID, @bazaar_core, &mut ctx);
        announcement_proxy::tribe_delete_announcement(&cap, &tribe_gov, &mut board, @bazaar_core, 0);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
