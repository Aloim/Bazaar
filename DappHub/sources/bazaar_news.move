// DappHub/sources/bazaar_news.move
// V31 — Bazaar News board behind the in-world BazaarBeacon.
//
// Admin (DAppOwnerCap) authors news posts, each optionally carrying a single poll
// (question + N options). Players vote (one vote per wallet per post; tally only) and
// comment. Poll RESULTS are surfaced to a voter only after they vote (an FE policy
// driven off the PollVoted event); the board itself always stores the tallies. Admin
// can delete a whole post or moderate an individual comment.
//
// Storage shape: posts live in one small vector on the board (admin-authored, O(10)).
// Comments live in a Table<u64, vector<Comment>> keyed by post_id, and vote-dedup keys
// live in a Table<VoteKey, u8> — both keep the board object itself small and reads keyed.
// The FE never reads the votes table directly: "have I voted / what did I pick" comes
// from querying PollVoted events filtered by voter (so no struct-keyed RPC reads).
//
// init_bazaar_news_board is the ONE-SHOT post-publish init the deployer calls once.

module dapp_hub::bazaar_news {
    use std::string::{Self, String};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::table::{Self, Table};
    use dapp_hub::dapp_governance::DAppOwnerCap;

    // Error codes
    const E_POST_NOT_FOUND:      u64 = 1;
    const E_TITLE_TOO_LONG:      u64 = 2;
    const E_BODY_TOO_LONG:       u64 = 3;
    const E_NO_POLL:             u64 = 4;
    const E_BAD_OPTION:          u64 = 5;
    const E_ALREADY_VOTED:       u64 = 6;
    const E_TOO_FEW_OPTIONS:     u64 = 7;
    const E_TOO_MANY_OPTIONS:    u64 = 8;
    const E_OPTION_TOO_LONG:     u64 = 9;
    const E_COMMENT_TOO_LONG:    u64 = 10;
    const E_COMMENT_NOT_FOUND:   u64 = 11;
    const E_QUESTION_TOO_LONG:   u64 = 12;

    // Length / count caps to keep storage costs predictable.
    const TITLE_MAX_BYTES:    u64 = 200;
    const BODY_MAX_BYTES:     u64 = 4_000;
    const QUESTION_MAX_BYTES: u64 = 200;
    const OPTION_MAX_BYTES:   u64 = 120;
    const COMMENT_MAX_BYTES:  u64 = 1_000;
    const MIN_POLL_OPTIONS:   u64 = 2;
    const MAX_POLL_OPTIONS:   u64 = 8;

    /// Single global instance created by init_bazaar_news_board.
    public struct BazaarNewsBoard has key {
        id: UID,
        next_post_id: u64,
        next_comment_id: u64,
        posts: vector<NewsPost>,
        comments: Table<u64, vector<Comment>>,   // keyed by post_id
        votes: Table<VoteKey, u8>,               // dedup: 1 vote per (post, voter)
    }

    public struct NewsPost has store, drop, copy {
        id: u64,
        title: String,
        body: String,
        posted_at_ms: u64,
        posted_by: address,
        has_poll: bool,
        poll_question: String,
        poll_options: vector<String>,
        tallies: vector<u64>,                    // parallel to poll_options
    }

    public struct Comment has store, drop, copy {
        id: u64,
        author: address,
        body: String,
        posted_at_ms: u64,
    }

    public struct VoteKey has copy, drop, store {
        post_id: u64,
        voter: address,
    }

    // Events
    public struct NewsPosted has copy, drop {
        id: u64, title: String, has_poll: bool, posted_by: address, timestamp_ms: u64,
    }
    public struct NewsDeleted has copy, drop {
        id: u64, deleted_by: address, timestamp_ms: u64,
    }
    public struct PollVoted has copy, drop {
        post_id: u64, voter: address, option_index: u8, timestamp_ms: u64,
    }
    public struct CommentPosted has copy, drop {
        post_id: u64, comment_id: u64, author: address, timestamp_ms: u64,
    }
    public struct CommentDeleted has copy, drop {
        post_id: u64, comment_id: u64, deleted_by: address, timestamp_ms: u64,
    }

    // ============================================================
    // ONE-SHOT POST-PUBLISH INIT (deployer calls once after publish)
    // ============================================================
    public entry fun init_bazaar_news_board(_cap: &DAppOwnerCap, ctx: &mut TxContext) {
        let board = BazaarNewsBoard {
            id: object::new(ctx),
            next_post_id: 1,
            next_comment_id: 1,
            posts: vector::empty<NewsPost>(),
            comments: table::new<u64, vector<Comment>>(ctx),
            votes: table::new<VoteKey, u8>(ctx),
        };
        transfer::share_object(board);
    }

    // ============================================================
    // ADMIN ENTRIES (DAppOwnerCap-gated)
    // ============================================================

    public entry fun post_news(
        _cap: &DAppOwnerCap,
        board: &mut BazaarNewsBoard,
        title: String,
        body: String,
        has_poll: bool,
        poll_question: String,
        poll_options: vector<String>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(string::length(&title) <= TITLE_MAX_BYTES, E_TITLE_TOO_LONG);
        assert!(string::length(&body) <= BODY_MAX_BYTES, E_BODY_TOO_LONG);

        let mut tallies = vector::empty<u64>();
        if (has_poll) {
            assert!(string::length(&poll_question) <= QUESTION_MAX_BYTES, E_QUESTION_TOO_LONG);
            let n = vector::length(&poll_options);
            assert!(n >= MIN_POLL_OPTIONS, E_TOO_FEW_OPTIONS);
            assert!(n <= MAX_POLL_OPTIONS, E_TOO_MANY_OPTIONS);
            let mut i = 0;
            while (i < n) {
                assert!(string::length(vector::borrow(&poll_options, i)) <= OPTION_MAX_BYTES, E_OPTION_TOO_LONG);
                vector::push_back(&mut tallies, 0);
                i = i + 1;
            };
        };

        let id = board.next_post_id;
        let ts = clock::timestamp_ms(clock);
        let sender = tx_context::sender(ctx);

        let post = NewsPost {
            id,
            title,
            body,
            posted_at_ms: ts,
            posted_by: sender,
            has_poll,
            poll_question,
            poll_options,
            tallies,
        };
        let evt = NewsPosted { id, title: post.title, has_poll, posted_by: sender, timestamp_ms: ts };

        vector::push_back(&mut board.posts, post);
        table::add(&mut board.comments, id, vector::empty<Comment>());
        board.next_post_id = id + 1;
        event::emit(evt);
    }

    public entry fun delete_news(
        _cap: &DAppOwnerCap,
        board: &mut BazaarNewsBoard,
        post_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let idx = find_post_index(board, post_id);
        let removed = vector::remove(&mut board.posts, idx);
        // Drop this post's comment vector. Orphaned VoteKey rows (post ids are never
        // reused) are left in place — harmless and cheap to leave for a deleted post.
        if (table::contains(&board.comments, removed.id)) {
            let _old = table::remove(&mut board.comments, removed.id);
        };
        event::emit(NewsDeleted {
            id: removed.id, deleted_by: tx_context::sender(ctx), timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    public entry fun delete_comment(
        _cap: &DAppOwnerCap,
        board: &mut BazaarNewsBoard,
        post_id: u64,
        comment_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&board.comments, post_id), E_POST_NOT_FOUND);
        let list = table::borrow_mut(&mut board.comments, post_id);
        let n = vector::length(list);
        let mut i = 0;
        let mut found = false;
        let mut found_idx: u64 = 0;
        while (i < n) {
            if (vector::borrow(list, i).id == comment_id) { found = true; found_idx = i; break };
            i = i + 1;
        };
        assert!(found, E_COMMENT_NOT_FOUND);
        let _c = vector::remove(list, found_idx);
        event::emit(CommentDeleted {
            post_id, comment_id, deleted_by: tx_context::sender(ctx), timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ============================================================
    // USER ENTRIES (pay own gas)
    // ============================================================

    public entry fun vote_poll(
        board: &mut BazaarNewsBoard,
        post_id: u64,
        option_index: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let idx = find_post_index(board, post_id);
        let opt = (option_index as u64);
        {
            let post = vector::borrow(&board.posts, idx);
            assert!(post.has_poll, E_NO_POLL);
            assert!(opt < vector::length(&post.poll_options), E_BAD_OPTION);
        };
        let voter = tx_context::sender(ctx);
        let key = VoteKey { post_id, voter };
        assert!(!table::contains(&board.votes, key), E_ALREADY_VOTED);

        // Increment the chosen tally.
        let post_mut = vector::borrow_mut(&mut board.posts, idx);
        let tally = vector::borrow_mut(&mut post_mut.tallies, opt);
        *tally = *tally + 1;

        table::add(&mut board.votes, key, option_index);
        event::emit(PollVoted {
            post_id, voter, option_index, timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    public entry fun post_comment(
        board: &mut BazaarNewsBoard,
        post_id: u64,
        body: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(string::length(&body) <= COMMENT_MAX_BYTES, E_COMMENT_TOO_LONG);
        // Post must exist (its comment vector is created at post time).
        assert!(table::contains(&board.comments, post_id), E_POST_NOT_FOUND);

        let comment_id = board.next_comment_id;
        let ts = clock::timestamp_ms(clock);
        let author = tx_context::sender(ctx);
        let comment = Comment { id: comment_id, author, body, posted_at_ms: ts };

        let list = table::borrow_mut(&mut board.comments, post_id);
        vector::push_back(list, comment);
        board.next_comment_id = comment_id + 1;
        event::emit(CommentPosted { post_id, comment_id, author, timestamp_ms: ts });
    }

    // ============================================================
    // INTERNAL
    // ============================================================
    fun find_post_index(board: &BazaarNewsBoard, post_id: u64): u64 {
        let n = vector::length(&board.posts);
        let mut i = 0;
        while (i < n) {
            if (vector::borrow(&board.posts, i).id == post_id) { return i };
            i = i + 1;
        };
        abort E_POST_NOT_FOUND
    }

    // ============================================================
    // VIEW FUNCTIONS (no auth)
    // ============================================================
    public fun post_count(board: &BazaarNewsBoard): u64 { vector::length(&board.posts) }

    public fun has_voted(board: &BazaarNewsBoard, post_id: u64, voter: address): bool {
        table::contains(&board.votes, VoteKey { post_id, voter })
    }

    public fun comment_count(board: &BazaarNewsBoard, post_id: u64): u64 {
        if (table::contains(&board.comments, post_id)) {
            vector::length(table::borrow(&board.comments, post_id))
        } else { 0 }
    }

    // NewsPost field accessors — for FE / Move-test consumption.
    public fun post_id(p: &NewsPost): u64 { p.id }
    public fun post_title(p: &NewsPost): String { p.title }
    public fun post_body(p: &NewsPost): String { p.body }
    public fun post_has_poll(p: &NewsPost): bool { p.has_poll }
    public fun post_poll_question(p: &NewsPost): String { p.poll_question }
    public fun post_poll_options(p: &NewsPost): &vector<String> { &p.poll_options }
    public fun post_tallies(p: &NewsPost): &vector<u64> { &p.tallies }
    public fun post_posted_by(p: &NewsPost): address { p.posted_by }
    public fun post_posted_at_ms(p: &NewsPost): u64 { p.posted_at_ms }

    // Comment field accessors.
    public fun comment_id(c: &Comment): u64 { c.id }
    public fun comment_author(c: &Comment): address { c.author }
    public fun comment_body(c: &Comment): String { c.body }
    public fun comment_posted_at_ms(c: &Comment): u64 { c.posted_at_ms }

    #[test_only]
    public fun create_board_for_testing(ctx: &mut TxContext): BazaarNewsBoard {
        BazaarNewsBoard {
            id: object::new(ctx),
            next_post_id: 1,
            next_comment_id: 1,
            posts: vector::empty<NewsPost>(),
            comments: table::new<u64, vector<Comment>>(ctx),
            votes: table::new<VoteKey, u8>(ctx),
        }
    }

    #[test_only]
    public fun destroy_board_for_testing(board: BazaarNewsBoard) {
        let BazaarNewsBoard { id, next_post_id: _, next_comment_id: _, posts: _, comments, votes } = board;
        object::delete(id);
        table::drop(comments);
        table::drop(votes);
    }

    #[test_only]
    public fun borrow_post_for_testing(board: &BazaarNewsBoard, idx: u64): &NewsPost {
        vector::borrow(&board.posts, idx)
    }
}
