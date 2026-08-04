// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// R5.2.b.2 — announcement_proxy bazaar-type gate tests (8 tests)
// Reject = NoTribe (type=0) → E_NOT_EASY_OR_ADVANCED_BAZAAR (= 2)
// Accept = Easy (type=1) → no abort on gate; next abort from SharedWidgets (E_UNAUTHORIZED_PACKAGE)
//
// TribeGovernance cannot be constructed with bazaar_type=0 (creation guard rejects it).
// Reject tests call bazaar_assertions::assert_easy_or_advanced(0) directly — this is exactly
// the expression evaluated as the first assert in each tribe function.
// Accept tests use type=1 and a real AnnouncementBoard. The board is created with
// authorized_package = @bazaar_core so the gate passes, but post-gate business logic
// (SharedWidgets) may fire. tribe_post_announcement and tribe_add_comment emit
// announcements::create_announcement / add_comment which should succeed; tribe_set_sticky
// aborts with E_ANNOUNCEMENT_NOT_FOUND (no ann yet). tribe_delete_announcement also aborts
// with E_ANNOUNCEMENT_NOT_FOUND. Accept tests are thus split:
// - post_announcement: full success (no follow-up abort)
// - delete_announcement / set_sticky / add_comment: gate passes, next SharedWidgets guard fires

#[test_only]
module bazaar_mission::r5_announcement_proxy_tests {
    use sui::test_utils;
    use sui::clock;
    use shared_widgets::announcements;
    use bazaar_core::bazaar_assertions;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_mission::announcement_proxy;

    const TRIBE_ID: u64 = 1;
    const LEADER: address = @0xA1;
    const SSU_ID: address = @0x5A;

    // ===== tribe_post_announcement =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_EASY_OR_ADVANCED_BAZAAR)]
    fun test_tribe_post_ann_rejects_notribe() {
        // TribeGovernance cannot be constructed with type=0; directly invoke the gate assertion
        bazaar_assertions::assert_easy_or_advanced_external(0);
    }

    #[test]
    fun test_tribe_post_ann_accepts_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        // Board created with @bazaar_core as authorized_package — matches the proxy call
        let mut board = announcements::create_board(SSU_ID, @bazaar_core, &mut ctx);
        announcement_proxy::tribe_post_announcement(
            &cap, &tribe_gov, &mut board, @bazaar_core,
            b"Test", b"Body", 0, &clock, &mut ctx,
        );
        assert!(announcements::announcement_count(&board) == 1, 0);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // ===== tribe_delete_announcement =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_EASY_OR_ADVANCED_BAZAAR)]
    fun test_tribe_delete_ann_rejects_notribe() {
        bazaar_assertions::assert_easy_or_advanced_external(0);
    }

    #[test]
    fun test_tribe_delete_ann_accepts_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = announcements::create_board(SSU_ID, @bazaar_core, &mut ctx);
        // Post first, then delete — gate passes and operation succeeds
        announcement_proxy::tribe_post_announcement(
            &cap, &tribe_gov, &mut board, @bazaar_core,
            b"Test", b"Body", 0, &clock, &mut ctx,
        );
        let ann_id = *vector::borrow(announcements::announcement_ids(&board), 0);
        announcement_proxy::tribe_delete_announcement(&cap, &tribe_gov, &mut board, @bazaar_core, ann_id);
        assert!(announcements::announcement_count(&board) == 0, 0);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // ===== tribe_set_sticky =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_EASY_OR_ADVANCED_BAZAAR)]
    fun test_tribe_set_sticky_rejects_notribe() {
        bazaar_assertions::assert_easy_or_advanced_external(0);
    }

    #[test]
    fun test_tribe_set_sticky_accepts_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = announcements::create_board(SSU_ID, @bazaar_core, &mut ctx);
        // Post an announcement so set_sticky has something to pin
        announcement_proxy::tribe_post_announcement(
            &cap, &tribe_gov, &mut board, @bazaar_core,
            b"Sticky Candidate", b"Body", 0, &clock, &mut ctx,
        );
        let ann_id = *vector::borrow(announcements::announcement_ids(&board), 0);
        announcement_proxy::tribe_set_sticky(&cap, &tribe_gov, &mut board, @bazaar_core, ann_id);
        test_utils::destroy(cap);
        tribe_governance_test_helpers::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // ===== tribe_add_comment =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_EASY_OR_ADVANCED_BAZAAR)]
    fun test_tribe_add_comment_rejects_notribe() {
        bazaar_assertions::assert_easy_or_advanced_external(0);
    }

    #[test]
    fun test_tribe_add_comment_accepts_easy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = tribe_governance_test_helpers::create_admin_cap_for_testing(TRIBE_ID, &mut ctx);
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        let mut board = announcements::create_board(SSU_ID, @bazaar_core, &mut ctx);
        announcement_proxy::tribe_post_announcement(
            &cap, &tribe_gov, &mut board, @bazaar_core,
            b"Test", b"Body", 0, &clock, &mut ctx,
        );
        let ann_id = *vector::borrow(announcements::announcement_ids(&board), 0);
        announcement_proxy::tribe_add_comment(&cap, &tribe_gov, &mut board, @bazaar_core, ann_id, b"nice!", &clock, &mut ctx);
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
