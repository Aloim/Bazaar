// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// SharedWidgets/sources/guestbook_table_tests.move
// Locking tests for Slice C2 / GAS-11: entries vector → Table + head/tail cursors.
//
// Scenarios (plan §11 row C2):
//   C2-T1: fill past MAX_ENTRIES (500) then evict → oldest evicted, newest + mid-range
//           present, count = MAX_ENTRIES, no live entry overwritten.
//   C2-T2a: delete-by-id removes exactly that id; neighbors intact; count-1.
//   C2-T2b: second delete of same id → E_ENTRY_NOT_FOUND.
//   C2-T3: delete current oldest (hole at oldest_id via SA-C2-01 self-heal), fill to cap,
//           trigger overflow → add_entry eviction finds head live immediately (0 advance steps).
//   C2-T4: unauthorized add aborts E_UNAUTHORIZED_PACKAGE (add-path guard retained).
//   C2-T5: unauthorized delete aborts E_UNAUTHORIZED_PACKAGE (delete-path guard retained).
//   C2-T6: SA-C2-01 self-heal — consecutive head-deletes keep oldest_id at the next live
//           key; subsequent eviction finds head live immediately (0 advance steps in add_entry).
//
// Scaffold mirrors announcements_tests.move:
//   tx_context::dummy()        — no test_scenario needed (no shared-object transfers)
//   clock::create_for_testing  — Clock supply
//   test_utils::destroy        — force-drops non-`drop` types (GuestbookBoard + embedded Table)
//
// MAX_ENTRIES = 500 hardcoded in fill loops; must track MAX_ENTRIES in guestbook.move.
// The real 500-entry fill is used — no #[test_only] seam for the constant because Move tests
// run without gas limits and 501 Table ops are sub-millisecond.
//
// Constitution: Article XII.3 — 500-line limit.
#[test_only]
module shared_widgets::guestbook_table_tests {
    use sui::clock::{Self, Clock};
    use sui::test_utils;
    use shared_widgets::guestbook::{Self, GuestbookBoard};

    // ── constants ─────────────────────────────────────────────────────────────────
    const AUTH_PKG:  address = @0xC2AA;
    const WRONG_PKG: address = @0xDEAD;
    const SSU_1:     address = @0x5521;
    const ALICE:     address = @0xA11CE;

    // ── helpers ───────────────────────────────────────────────────────────────────

    fun make_board(ctx: &mut TxContext): GuestbookBoard {
        guestbook::create_board(SSU_1, AUTH_PKG, ctx)
    }

    /// Append one short entry as ALICE via AUTH_PKG.
    fun add_one(board: &mut GuestbookBoard, clock: &Clock) {
        guestbook::add_entry(board, AUTH_PKG, b"msg", ALICE, clock);
    }

    // ── C2-T1: fill past MAX_ENTRIES, verify FIFO eviction ───────────────────────
    //
    // After filling 500 entries (ids 0..499) and adding a 501st (id 500):
    //   - id 0 (oldest) is evicted
    //   - id 500 (newest) is present
    //   - id 250 (mid-range) is still present — confirms no modular overwrite
    //   - entry_count == 500 == MAX_ENTRIES
    //   - the id and author stored in id 250 are byte-identical to what was written

    #[test]
    fun c2_t1_fill_and_evict() {
        let mut ctx  = tx_context::dummy();
        let clock    = clock::create_for_testing(&mut ctx);
        let mut board = make_board(&mut ctx);

        // Fill exactly MAX_ENTRIES (500) entries → ids 0..499
        let mut i = 0u64;
        while (i < 500u64) {                               // 500 = MAX_ENTRIES in guestbook.move
            add_one(&mut board, &clock);
            i = i + 1;
        };
        assert!(guestbook::entry_count(&board) == 500, 0);

        // Add id 500 → triggers FIFO eviction of id 0 (oldest_id=0, table::contains(0)=true)
        add_one(&mut board, &clock);

        // FIFO eviction result
        assert!(!guestbook::has_entry(&board, 0),   1);   // id 0: evicted
        assert!(guestbook::has_entry(&board, 500),  2);   // id 500: newest, present
        assert!(guestbook::has_entry(&board, 250),  3);   // id 250: mid-range, not overwritten
        assert!(guestbook::entry_count(&board) == 500, 4); // count still at cap

        // Verify id 250 data integrity (no silent stomp via modular overwrite)
        let mid = guestbook::borrow_entry(&board, 250);
        assert!(guestbook::entry_id(mid)     == 250,  5);
        assert!(guestbook::entry_author(mid) == ALICE, 6);

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // ── C2-T2a: delete-by-id removes exactly that id ─────────────────────────────

    #[test]
    fun c2_t2a_delete_removes_exact() {
        let mut ctx  = tx_context::dummy();
        let clock    = clock::create_for_testing(&mut ctx);
        let mut board = make_board(&mut ctx);

        // Add entries 0, 1, 2
        add_one(&mut board, &clock);   // id 0
        add_one(&mut board, &clock);   // id 1
        add_one(&mut board, &clock);   // id 2
        assert!(guestbook::entry_count(&board) == 3, 0);

        // Delete id 1 (middle entry)
        guestbook::delete_entry(&mut board, AUTH_PKG, 1);

        assert!(!guestbook::has_entry(&board, 1), 1);  // id 1: deleted
        assert!(guestbook::has_entry(&board, 0),  2);  // id 0: still present
        assert!(guestbook::has_entry(&board, 2),  3);  // id 2: still present
        assert!(guestbook::entry_count(&board) == 2, 4);

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // ── C2-T2b: second delete of same id → E_ENTRY_NOT_FOUND ─────────────────────

    #[test]
    #[expected_failure(abort_code = shared_widgets::guestbook::E_ENTRY_NOT_FOUND)]
    fun c2_t2b_double_delete_aborts() {
        let mut ctx  = tx_context::dummy();
        let clock    = clock::create_for_testing(&mut ctx);
        let mut board = make_board(&mut ctx);

        add_one(&mut board, &clock);                           // id 0
        guestbook::delete_entry(&mut board, AUTH_PKG, 0);     // first delete: ok
        guestbook::delete_entry(&mut board, AUTH_PKG, 0);     // second delete: E_ENTRY_NOT_FOUND
        abort 0 // unreachable
    }

    // ── C2-T3: delete oldest (SA-C2-01 self-heals oldest_id), fill to cap, evict ─
    //
    // With SA-C2-01: after deleting id=0 (the head), delete_entry self-heals oldest_id
    // from 0 to 1 (board empty; loop exits when oldest_id==next_id=1). Then filling
    // 500 entries (ids 1..500) leaves oldest_id=1 pointing at a live key. On overflow
    // (add id=501), the add_entry advance loop finds oldest_id=1 live immediately —
    // zero advance steps. Result: id 1 is evicted, id 2 is the new oldest.

    #[test]
    fun c2_t3_delete_then_evict_skips_hole() {
        let mut ctx  = tx_context::dummy();
        let clock    = clock::create_for_testing(&mut ctx);
        let mut board = make_board(&mut ctx);

        // Step 1: add id=0, immediately delete it.
        // SA-C2-01: entry_id(0)==oldest_id(0) → advance: while(0<1 && !contains(0)) oldest_id=1;
        // while(1<1) false → stop. oldest_id=1. Board is empty, next_id=1.
        add_one(&mut board, &clock);                       // id 0; next_id=1
        guestbook::delete_entry(&mut board, AUTH_PKG, 0); // oldest_id → 1 (SA-C2-01)
        assert!(guestbook::entry_count(&board) == 0, 0);

        // Step 2: fill MAX_ENTRIES (500) entries → ids 1..500.
        // After: oldest_id=1 (live, advanced by SA-C2-01), next_id=501, size=500.
        let mut i = 0u64;
        while (i < 500u64) {                               // 500 = MAX_ENTRIES
            add_one(&mut board, &clock);
            i = i + 1;
        };
        assert!(guestbook::entry_count(&board) == 500, 1);

        // Step 3: add id=501 → table at cap → FIFO eviction fires.
        // add_entry advance loop: table::contains(oldest_id=1) = true → 0 advance steps.
        // Evicts id=1, oldest_id=2; adds id=501.
        add_one(&mut board, &clock);

        // POST-CONDITIONS
        assert!(!guestbook::has_entry(&board, 0),   2);  // was deleted at step 1
        assert!(!guestbook::has_entry(&board, 1),   3);  // id 1: evicted (oldest_id was 1)
        assert!(guestbook::has_entry(&board, 2),    4);  // id 2: new oldest after eviction
        assert!(guestbook::has_entry(&board, 250),  5);  // id 250: mid-range intact
        assert!(guestbook::has_entry(&board, 501),  6);  // id 501: newly added
        assert!(guestbook::entry_count(&board) == 500, 7);

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }

    // ── C2-T4: unauthorized add aborts (add-path authorized_package guard) ───────

    #[test]
    #[expected_failure(abort_code = shared_widgets::guestbook::E_UNAUTHORIZED_PACKAGE)]
    fun c2_t4_unauthorized_add_aborts() {
        let mut ctx  = tx_context::dummy();
        let clock    = clock::create_for_testing(&mut ctx);
        let mut board = make_board(&mut ctx);
        guestbook::add_entry(&mut board, WRONG_PKG, b"msg", ALICE, &clock);
        abort 0
    }

    // ── C2-T5: unauthorized delete aborts (delete-path authorized_package guard) ──

    #[test]
    #[expected_failure(abort_code = shared_widgets::guestbook::E_UNAUTHORIZED_PACKAGE)]
    fun c2_t5_unauthorized_delete_aborts() {
        let mut ctx  = tx_context::dummy();
        let clock    = clock::create_for_testing(&mut ctx);
        let mut board = make_board(&mut ctx);
        add_one(&mut board, &clock);                       // id 0
        guestbook::delete_entry(&mut board, WRONG_PKG, 0);
        abort 0
    }

    // ── C2-T6: SA-C2-01 self-heal on consecutive head-deletes ────────────────────
    //
    // Three consecutive head-deletes (ids 0, 1, 2). After each, oldest_id should track
    // the next live key (verified via oldest_id_for_testing). Then fill to cap and trigger
    // eviction — add_entry's advance loop finds the head live immediately (0 advance steps).
    //
    // State trace:
    //   After adds 0..4:               oldest_id=0, next_id=5, size=5
    //   After delete 0 (SA-C2-01):     oldest_id=1 (id 1 present → loop stops)
    //   After delete 1 (SA-C2-01):     oldest_id=2
    //   After delete 2 (SA-C2-01):     oldest_id=3 (id 3 present → loop stops)
    //   Board: {3,4}, oldest_id=3, next_id=5, size=2
    //   After fill 498 (ids 5..502):   oldest_id=3, next_id=503, size=500
    //   After add id=503 (eviction):   remove id 3 (0 advance); oldest_id=4; add 503
    //   Final: ids 4..502+503, oldest_id=4, size=500

    #[test]
    fun c2_t6_sa_c2_01_head_delete_self_heal() {
        let mut ctx  = tx_context::dummy();
        let clock    = clock::create_for_testing(&mut ctx);
        let mut board = make_board(&mut ctx);

        // Add 5 entries: ids 0, 1, 2, 3, 4
        add_one(&mut board, &clock);   // id 0
        add_one(&mut board, &clock);   // id 1
        add_one(&mut board, &clock);   // id 2
        add_one(&mut board, &clock);   // id 3
        add_one(&mut board, &clock);   // id 4

        // Delete id 0 (current head) → SA-C2-01: oldest_id → 1 (id 1 is live)
        guestbook::delete_entry(&mut board, AUTH_PKG, 0);
        assert!(guestbook::oldest_id_for_testing(&board) == 1, 0);

        // Delete id 1 (new head) → SA-C2-01: oldest_id → 2 (id 2 is live)
        guestbook::delete_entry(&mut board, AUTH_PKG, 1);
        assert!(guestbook::oldest_id_for_testing(&board) == 2, 1);

        // Delete id 2 (new head) → SA-C2-01: oldest_id → 3 (id 3 is live → loop stops)
        guestbook::delete_entry(&mut board, AUTH_PKG, 2);
        assert!(guestbook::oldest_id_for_testing(&board) == 3, 2);

        // Board state: ids 3, 4 present (2 entries). oldest_id=3, next_id=5.
        assert!(guestbook::entry_count(&board) == 2, 3);

        // Fill 498 more entries (ids 5..502) to reach MAX_ENTRIES=500 total (2 + 498).
        // oldest_id stays 3 throughout (SA-C2-01 only fires in delete_entry).
        let mut i = 0u64;
        while (i < 498u64) {                               // 498 = 500 MAX_ENTRIES - 2 present
            add_one(&mut board, &clock);
            i = i + 1;
        };
        assert!(guestbook::entry_count(&board) == 500, 4);
        assert!(guestbook::oldest_id_for_testing(&board) == 3, 5); // unchanged during fill

        // Add id 503 → eviction fires.
        // add_entry advance loop: table::contains(oldest_id=3) = true → 0 iterations.
        // Evicts id 3, oldest_id becomes 4; adds id 503.
        add_one(&mut board, &clock);   // id 503

        // POST-CONDITIONS: SA-C2-01 ensured 0 advance steps in add_entry's eviction loop.
        assert!(!guestbook::has_entry(&board, 3),   6);  // evicted (was oldest_id=3)
        assert!(guestbook::has_entry(&board, 4),    7);  // new oldest
        assert!(guestbook::has_entry(&board, 503),  8);  // newest
        assert!(guestbook::oldest_id_for_testing(&board) == 4, 9); // post-eviction advance
        assert!(guestbook::entry_count(&board) == 500, 10);

        test_utils::destroy(board);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
