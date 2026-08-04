// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// tests/sources/test_widget_integration.move
// Integration tests: SharedWidgets AnnouncementBoard with authorized_package pattern.
// Covers T-WID-01 through T-WID-05.
// Constitution Article VII.1: Widget authorized_package enforcement.
// Constitution Article XII.3: 500-line limit. Current: ~230 lines.
#[test_only]
module bazaar_integration_tests::test_widget_integration {
    use sui::clock;
    use sui::test_utils;
    use shared_widgets::announcements;
    use bazaar_mission::announcement_proxy;
    use bazaar_core::membership;
    use bazaar_core::tribe_governance;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_integration_tests::test_helpers;

    // =========================================================
    // T-WID-01: Create board with authorized_package = @bazaar_core,
    //           post via ssu_post_announcement, assert count == 1
    // =========================================================
    #[test]
    fun test_create_board_and_post_announcement() {
        let mut ctx = tx_context::dummy();
        let clock   = test_helpers::create_test_clock(&mut ctx);

        let ssu_cap = membership::create_ssu_owner_cap_for_testing(
            test_helpers::ssu_addr(),
            0,
            &mut ctx,
        );
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            test_helpers::ssu_addr(),
            0, // bazaar_type = NoTribe
            0, // tribe_id = 0
            test_helpers::alice(),
            &clock,
            &mut ctx,
        );
        let mut board = announcements::create_board(
            test_helpers::ssu_addr(),
            @bazaar_core,
            &mut ctx,
        );

        announcement_proxy::ssu_post_announcement(
            &ssu_cap,
            &gov,
            &mut board,
            @bazaar_core,
            b"Hello World",
            b"This is the announcement body.",
            0, // VISIBILITY_PUBLIC
            &clock,
            &mut ctx,
        );

        assert!(announcements::announcement_count(&board) == 1, 0);

        test_utils::destroy(ssu_cap);
        ssu_governance_test_helpers::destroy_for_testing(gov);
        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-WID-02: Wrong caller_package is blocked by authorized_package check
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 1, location = shared_widgets::announcements)]
    fun test_wrong_package_blocked() {
        let mut ctx = tx_context::dummy();
        let clock   = test_helpers::create_test_clock(&mut ctx);

        let mut board = announcements::create_board(
            test_helpers::ssu_addr(),
            @bazaar_core,
            &mut ctx,
        );

        // Direct call with a wrong package address — must abort E_UNAUTHORIZED_PACKAGE = 1
        announcements::create_announcement(
            &mut board,
            @0x1234,
            b"Unauthorized title",
            b"Unauthorized body",
            0,
            test_helpers::alice(),
            &clock,
        );

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-WID-03: Visibility constants 0/1/2 are valid; 3 aborts
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 7, location = shared_widgets::announcements)]
    fun test_announcement_visibility_constants() {
        let mut ctx = tx_context::dummy();
        let clock   = test_helpers::create_test_clock(&mut ctx);

        let mut board = announcements::create_board(
            test_helpers::ssu_addr(),
            @bazaar_core,
            &mut ctx,
        );

        // Visibility 0 (public), 1 (member), 2 (admin) — all valid
        announcements::create_announcement(
            &mut board, @bazaar_core, b"Public", b"Body", 0, test_helpers::alice(), &clock,
        );
        announcements::create_announcement(
            &mut board, @bazaar_core, b"Member", b"Body", 1, test_helpers::alice(), &clock,
        );
        announcements::create_announcement(
            &mut board, @bazaar_core, b"Admin",  b"Body", 2, test_helpers::alice(), &clock,
        );
        assert!(announcements::announcement_count(&board) == 3, 0);

        // Visibility 3 — invalid, must abort E_INVALID_VISIBILITY = 7
        announcements::create_announcement(
            &mut board, @bazaar_core, b"Invalid", b"Body", 3, test_helpers::alice(), &clock,
        );

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-WID-04: Comment limit enforced at MAX_COMMENTS (50)
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 5, location = shared_widgets::announcements)]
    fun test_comment_limit_enforcement() {
        let mut ctx = tx_context::dummy();
        let clock   = test_helpers::create_test_clock(&mut ctx);

        let mut board = announcements::create_board(
            test_helpers::ssu_addr(),
            @bazaar_core,
            &mut ctx,
        );

        // Post one announcement (id = 0)
        announcements::create_announcement(
            &mut board, @bazaar_core, b"Post", b"Body", 0, test_helpers::alice(), &clock,
        );

        // Add 50 comments — exactly at the limit
        let mut i: u64 = 0;
        while (i < 50) {
            announcements::add_comment(
                &mut board,
                @bazaar_core,
                0,
                b"A comment",
                test_helpers::alice(),
                &clock,
            );
            i = i + 1;
        };

        // Comment 51 must abort E_COMMENTS_FULL = 5
        announcements::add_comment(
            &mut board,
            @bazaar_core,
            0,
            b"One too many",
            test_helpers::alice(),
            &clock,
        );

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-WID-05: TribeAdminCap can post via tribe_post_announcement
    // =========================================================
    #[test]
    fun test_tribe_admin_post_announcement() {
        let mut ctx  = tx_context::dummy();
        let clock    = test_helpers::create_test_clock(&mut ctx);

        let admin_cap = tribe_governance::create_admin_cap_for_testing(1, &mut ctx);
        let tribe_gov = tribe_governance::create_with_arbitrary_mode_for_testing(
            1, 1, @0x0, 0, &clock, &mut ctx);
        let mut board = announcements::create_board(
            test_helpers::ssu_addr(),
            @bazaar_core,
            &mut ctx,
        );

        announcement_proxy::tribe_post_announcement(
            &admin_cap,
            &tribe_gov,
            &mut board,
            @bazaar_core,
            b"Tribe Announcement",
            b"Posted by tribe admin.",
            1, // VISIBILITY_MEMBER
            &clock,
            &mut ctx,
        );

        assert!(announcements::announcement_count(&board) == 1, 0);

        test_utils::destroy(admin_cap);
        tribe_governance::destroy_for_testing(tribe_gov);
        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
