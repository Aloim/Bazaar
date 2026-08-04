// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// SharedWidgets/sources/announcements_tests.move
// MAX 500 LINES — DO NOT EXCEED
#[test_only]
module shared_widgets::announcements_tests {
    use sui::clock;
    use sui::test_utils;
    use shared_widgets::announcements::{Self, AnnouncementBoard};

    // --- Test Addresses ---
    const ALICE: address = @0xA11CE;
    const BOB: address = @0xB0B;
    const AUTH_PKG: address = @0xABCD;
    const WRONG_PKG: address = @0xDEAD;
    const SSU_1: address = @0x551;

    // --- Helpers ---

    fun make_board(ctx: &mut TxContext): AnnouncementBoard {
        announcements::create_board(SSU_1, AUTH_PKG, ctx)
    }

    // ===== T01: test_create_board =====

    #[test]
    fun test_create_board() {
        let mut ctx = tx_context::dummy();
        let board = make_board(&mut ctx);

        assert!(announcements::ssu_id(&board) == SSU_1, 0);
        assert!(announcements::authorized_package(&board) == AUTH_PKG, 0);
        assert!(announcements::announcement_count(&board) == 0, 0);
        assert!(option::is_none(&announcements::sticky_id(&board)), 0);

        test_utils::destroy(board);
    }

    // ===== T02: test_create_announcement =====

    #[test]
    fun test_create_announcement() {
        let mut ctx = tx_context::dummy();
        let mut board = make_board(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        announcements::create_announcement(
            &mut board, AUTH_PKG,
            b"Hello World", b"This is the body.", 0,
            ALICE, &clock,
        );

        assert!(announcements::announcement_count(&board) == 1, 0);

        let ann = announcements::announcement_by_id(&board, 0);
        assert!(announcements::ann_author(ann) == ALICE, 0);
        assert!(*announcements::ann_title(ann) == b"Hello World", 0);
        assert!(announcements::ann_visibility(ann) == 0, 0);
        assert!(announcements::ann_is_sticky(ann) == false, 0);
        assert!(announcements::ann_comment_count(ann) == 0, 0);

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // ===== T03: test_delete_announcement =====

    #[test]
    fun test_delete_announcement() {
        let mut ctx = tx_context::dummy();
        let mut board = make_board(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        announcements::create_announcement(
            &mut board, AUTH_PKG, b"Ann 0", b"Body 0", 0, ALICE, &clock,
        );
        announcements::create_announcement(
            &mut board, AUTH_PKG, b"Ann 1", b"Body 1", 0, ALICE, &clock,
        );
        assert!(announcements::announcement_count(&board) == 2, 0);

        announcements::delete_announcement(&mut board, AUTH_PKG, 0);

        assert!(announcements::announcement_count(&board) == 1, 0);
        // id 1 must still be retrievable
        let ann1 = announcements::announcement_by_id(&board, 1);
        assert!(*announcements::ann_title(ann1) == b"Ann 1", 0);

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // ===== T04: test_set_sticky =====

    #[test]
    fun test_set_sticky() {
        let mut ctx = tx_context::dummy();
        let mut board = make_board(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        announcements::create_announcement(
            &mut board, AUTH_PKG, b"Ann 0", b"Body 0", 0, ALICE, &clock,
        );
        announcements::create_announcement(
            &mut board, AUTH_PKG, b"Ann 1", b"Body 1", 0, ALICE, &clock,
        );

        // Set ann 0 as sticky
        announcements::set_sticky(&mut board, AUTH_PKG, 0);
        let sticky = announcements::sticky_id(&board);
        assert!(option::is_some(&sticky), 0);
        assert!(*option::borrow(&sticky) == 0, 0);
        assert!(announcements::ann_is_sticky(announcements::announcement_by_id(&board, 0)) == true, 0);

        // Switch sticky to ann 1 — ann 0 must lose its sticky flag
        announcements::set_sticky(&mut board, AUTH_PKG, 1);
        let sticky2 = announcements::sticky_id(&board);
        assert!(*option::borrow(&sticky2) == 1, 0);
        assert!(announcements::ann_is_sticky(announcements::announcement_by_id(&board, 0)) == false, 0);
        assert!(announcements::ann_is_sticky(announcements::announcement_by_id(&board, 1)) == true, 0);

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // ===== T05: test_add_comment =====

    #[test]
    fun test_add_comment() {
        let mut ctx = tx_context::dummy();
        let mut board = make_board(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        announcements::create_announcement(
            &mut board, AUTH_PKG, b"Ann 0", b"Body 0", 0, ALICE, &clock,
        );

        announcements::add_comment(&mut board, AUTH_PKG, 0, b"Nice post!", BOB, &clock);

        let ann = announcements::announcement_by_id(&board, 0);
        assert!(announcements::ann_comment_count(ann) == 1, 0);

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // ===== T06: test_title_too_long_aborts =====

    #[test]
    #[expected_failure(abort_code = 2)]
    fun test_title_too_long_aborts() {
        let mut ctx = tx_context::dummy();
        let mut board = make_board(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // 101 bytes — exceeds MAX_TITLE_LEN (100)
        let long_title = b"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

        announcements::create_announcement(
            &mut board, AUTH_PKG, long_title, b"Body", 0, ALICE, &clock,
        );

        abort 0
    }

    // ===== T07: test_body_too_long_aborts =====

    #[test]
    #[expected_failure(abort_code = 3)]
    fun test_body_too_long_aborts() {
        let mut ctx = tx_context::dummy();
        let mut board = make_board(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // 501 bytes — exceeds MAX_BODY_LEN (500)
        let long_body = b"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

        announcements::create_announcement(
            &mut board, AUTH_PKG, b"Title", long_body, 0, ALICE, &clock,
        );

        abort 0
    }

    // ===== T08: test_comments_full_aborts =====

    #[test]
    #[expected_failure(abort_code = 5)]
    fun test_comments_full_aborts() {
        let mut ctx = tx_context::dummy();
        let mut board = make_board(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        announcements::create_announcement(
            &mut board, AUTH_PKG, b"Ann 0", b"Body", 0, ALICE, &clock,
        );

        // Add MAX_COMMENTS (50) comments — all must succeed
        let mut i = 0u64;
        while (i < 50) {
            announcements::add_comment(&mut board, AUTH_PKG, 0, b"comment", BOB, &clock);
            i = i + 1;
        };

        // 51st comment must abort with E_COMMENTS_FULL (5)
        announcements::add_comment(&mut board, AUTH_PKG, 0, b"overflow", BOB, &clock);

        abort 0
    }

    // ===== T09: test_invalid_visibility_aborts =====

    #[test]
    #[expected_failure(abort_code = 7)]
    fun test_invalid_visibility_aborts() {
        let mut ctx = tx_context::dummy();
        let mut board = make_board(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // visibility=3 is invalid — VISIBILITY_ADMIN=2 is the maximum
        announcements::create_announcement(
            &mut board, AUTH_PKG, b"Title", b"Body", 3, ALICE, &clock,
        );

        abort 0
    }

    // ===== T10: test_unauthorized_package_aborts (SDC-002 remediation) =====

    #[test]
    #[expected_failure(abort_code = 1)]
    fun test_unauthorized_package_aborts() {
        let mut ctx = tx_context::dummy();
        let mut board = make_board(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // WRONG_PKG is not the authorized_package — must abort with E_UNAUTHORIZED_PACKAGE (1)
        announcements::create_announcement(
            &mut board, WRONG_PKG, b"Title", b"Body", 0, ALICE, &clock,
        );

        abort 0
    }
}
// END OF FILE — shared_widgets::announcements_tests

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
