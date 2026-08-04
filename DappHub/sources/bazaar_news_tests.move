// DappHub/sources/bazaar_news_tests.move
// V31 — unit coverage for the Bazaar News board (post / vote-dedup / comment / delete).

#[test_only]
module dapp_hub::bazaar_news_tests {
    use sui::clock;
    use sui::test_utils;
    use std::string;
    use dapp_hub::bazaar_news;
    use dapp_hub::dapp_governance;

    fun opts(): vector<string::String> {
        let mut v = vector::empty<string::String>();
        vector::push_back(&mut v, string::utf8(b"Yes"));
        vector::push_back(&mut v, string::utf8(b"No"));
        v
    }

    // BN-01: post with a poll, vote once, tally increments, has_voted true; second vote aborts.
    #[test]
    fun bn01_post_vote_dedup() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut board = bazaar_news::create_board_for_testing(&mut ctx);

        bazaar_news::post_news(
            &cap, &mut board, string::utf8(b"Title"), string::utf8(b"Body"),
            true, string::utf8(b"Pick one"), opts(), &clock, &mut ctx,
        );
        assert!(bazaar_news::post_count(&board) == 1, 0);

        bazaar_news::vote_poll(&mut board, 1, 1, &clock, &mut ctx); // VOTER (ctx sender) votes "No"
        assert!(bazaar_news::has_voted(&board, 1, @0x0), 1);        // dummy ctx sender is @0x0
        let post = bazaar_news::borrow_post_for_testing(&board, 0);
        let tallies = bazaar_news::post_tallies(post);
        assert!(*vector::borrow(tallies, 1) == 1, 2);
        assert!(*vector::borrow(tallies, 0) == 0, 3);

        test_utils::destroy(cap);
        bazaar_news::destroy_board_for_testing(board);
        clock::destroy_for_testing(clock);
    }

    // BN-02: double vote by same wallet aborts E_ALREADY_VOTED.
    #[test]
    #[expected_failure(abort_code = dapp_hub::bazaar_news::E_ALREADY_VOTED)]
    fun bn02_double_vote_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut board = bazaar_news::create_board_for_testing(&mut ctx);
        bazaar_news::post_news(
            &cap, &mut board, string::utf8(b"T"), string::utf8(b"B"),
            true, string::utf8(b"Q"), opts(), &clock, &mut ctx,
        );
        bazaar_news::vote_poll(&mut board, 1, 0, &clock, &mut ctx);
        bazaar_news::vote_poll(&mut board, 1, 1, &clock, &mut ctx); // same sender → abort

        test_utils::destroy(cap);
        bazaar_news::destroy_board_for_testing(board);
        clock::destroy_for_testing(clock);
    }

    // BN-03: comment then admin-delete the comment; count goes 0 -> 1 -> 0.
    #[test]
    fun bn03_comment_and_moderate() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut board = bazaar_news::create_board_for_testing(&mut ctx);
        bazaar_news::post_news(
            &cap, &mut board, string::utf8(b"T"), string::utf8(b"B"),
            false, string::utf8(b""), vector::empty<string::String>(), &clock, &mut ctx,
        );
        assert!(bazaar_news::comment_count(&board, 1) == 0, 0);

        bazaar_news::post_comment(&mut board, 1, string::utf8(b"gm"), &clock, &mut ctx);
        assert!(bazaar_news::comment_count(&board, 1) == 1, 1);

        bazaar_news::delete_comment(&cap, &mut board, 1, 1, &clock, &mut ctx); // comment_id starts at 1
        assert!(bazaar_news::comment_count(&board, 1) == 0, 2);

        test_utils::destroy(cap);
        bazaar_news::destroy_board_for_testing(board);
        clock::destroy_for_testing(clock);
    }

    // BN-04: delete_news removes the post and its comments.
    #[test]
    fun bn04_delete_news() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut board = bazaar_news::create_board_for_testing(&mut ctx);
        bazaar_news::post_news(
            &cap, &mut board, string::utf8(b"T"), string::utf8(b"B"),
            false, string::utf8(b""), vector::empty<string::String>(), &clock, &mut ctx,
        );
        bazaar_news::post_comment(&mut board, 1, string::utf8(b"hi"), &clock, &mut ctx);
        bazaar_news::delete_news(&cap, &mut board, 1, &clock, &mut ctx);
        assert!(bazaar_news::post_count(&board) == 0, 0);
        assert!(bazaar_news::comment_count(&board, 1) == 0, 1);

        test_utils::destroy(cap);
        bazaar_news::destroy_board_for_testing(board);
        clock::destroy_for_testing(clock);
    }
}
