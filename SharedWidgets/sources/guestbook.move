// SharedWidgets/sources/guestbook.move
// MAX 500 LINES — DO NOT EXCEED
module shared_widgets::guestbook {
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};

    // -- Error codes --
    const E_UNAUTHORIZED_PACKAGE: u64 = 1;
    const E_MESSAGE_TOO_LONG: u64 = 2;
    const E_ENTRY_NOT_FOUND: u64 = 3;

    // -- Limits --
    const MAX_MESSAGE_LEN: u64 = 250;
    const MAX_ENTRIES: u64 = 500;

    // -- Structs --

    /// Per-SSU guestbook. Holds up to MAX_ENTRIES entries; oldest evicted on overflow (FIFO).
    /// `entries`: Table<u64, GuestbookEntry> keyed by monotonic entry id (O(1) add/delete/evict).
    /// `next_id`:   tail cursor — the id assigned to the next entry written (ever-increasing).
    /// `oldest_id`: head cursor — points at the live oldest entry (or next_id when empty).
    ///              SA-C2-01: delete_entry self-heals this cursor on head-deletes, so add_entry's
    ///              eviction advance is bounded to isolated interior holes only.
    /// `authorized_package`: the package address authorised to call mutating functions.
    public struct GuestbookBoard has key, store {
        id: UID,
        ssu_id: address,
        authorized_package: address,
        entries: Table<u64, GuestbookEntry>,
        next_id: u64,
        oldest_id: u64,
    }

    public struct GuestbookEntry has store, copy, drop {
        id: u64,
        author: address,
        message: vector<u8>,
        created_at_ms: u64,
    }

    // -- Events --

    public struct EntryAddedEvent has copy, drop {
        ssu_id: address,
        entry_id: u64,
        author: address,
        timestamp_ms: u64,
    }

    public struct EntryDeletedEvent has copy, drop {
        ssu_id: address,
        entry_id: u64,
    }

    // ===== Constructor =====

    /// Create a new GuestbookBoard for an SSU.
    public fun create_board(
        ssu_id: address,
        authorized_package: address,
        ctx: &mut TxContext,
    ): GuestbookBoard {
        GuestbookBoard {
            id: object::new(ctx),
            ssu_id,
            authorized_package,
            entries: table::new(ctx),
            next_id: 0,
            oldest_id: 0,
        }
    }

    // ===== Mutating functions =====

    /// Add a guestbook entry. Caller package must be authorised.
    /// Ban checks and role checks are the caller's responsibility.
    /// When at MAX_ENTRIES, the oldest entry is evicted (FIFO).
    /// Aborts: E_UNAUTHORIZED_PACKAGE, E_MESSAGE_TOO_LONG
    public fun add_entry(
        board: &mut GuestbookBoard,
        caller_package: address,
        text: vector<u8>,
        author: address,
        clock: &Clock,
    ) {
        assert!(board.authorized_package == caller_package, E_UNAUTHORIZED_PACKAGE);
        assert!(vector::length(&text) <= MAX_MESSAGE_LEN, E_MESSAGE_TOO_LONG);

        // FIFO eviction: when at cap, advance head past any isolated interior holes, then evict.
        // Termination: length >= MAX_ENTRIES >= 1 guarantees a present key in [oldest_id, next_id).
        // SA-C2-01 self-heal in delete_entry ensures the head is live after any head-delete,
        // so this loop traverses only isolated interior holes — each at most once per add call.
        if (table::length(&board.entries) >= MAX_ENTRIES) {
            while (!table::contains(&board.entries, board.oldest_id)) {
                board.oldest_id = board.oldest_id + 1;
            };
            table::remove(&mut board.entries, board.oldest_id);
            board.oldest_id = board.oldest_id + 1;
        };

        let id = board.next_id;
        board.next_id = id + 1;
        let ts = clock::timestamp_ms(clock);

        table::add(&mut board.entries, id, GuestbookEntry {
            id,
            author,
            message: text,
            created_at_ms: ts,
        });

        event::emit(EntryAddedEvent { ssu_id: board.ssu_id, entry_id: id, author, timestamp_ms: ts });
    }

    /// Delete an entry by entry ID. Caller package must be authorised.
    /// Author-vs-moderator role checks are the caller's responsibility.
    /// Aborts: E_UNAUTHORIZED_PACKAGE, E_ENTRY_NOT_FOUND
    public fun delete_entry(
        board: &mut GuestbookBoard,
        caller_package: address,
        entry_id: u64,
    ) {
        assert!(board.authorized_package == caller_package, E_UNAUTHORIZED_PACKAGE);

        assert!(table::contains(&board.entries, entry_id), E_ENTRY_NOT_FOUND);
        table::remove(&mut board.entries, entry_id);
        // SA-C2-01: if we just removed the current head, advance oldest_id past the hole
        // to the next live key (or to next_id when the board is now empty). Keeps
        // add_entry's eviction advance bounded — no long consecutive head-hole run can form.
        // Guard: `oldest_id < next_id` prevents advancing past the tail or underflow.
        // Invariant after: oldest_id points at a live key, OR oldest_id == next_id (empty board).
        if (entry_id == board.oldest_id) {
            while (board.oldest_id < board.next_id &&
                   !table::contains(&board.entries, board.oldest_id)) {
                board.oldest_id = board.oldest_id + 1;
            };
        };

        event::emit(EntryDeletedEvent { ssu_id: board.ssu_id, entry_id });
    }

    // ===== Read accessors =====

    public fun ssu_id(board: &GuestbookBoard): address { board.ssu_id }
    public fun authorized_package(board: &GuestbookBoard): address { board.authorized_package }
    public fun entry_count(board: &GuestbookBoard): u64 { table::length(&board.entries) }
    /// Whether an entry id is currently present (not evicted or deleted).
    public fun has_entry(board: &GuestbookBoard, id: u64): bool {
        table::contains(&board.entries, id)
    }
    /// Borrow an entry by id. Aborts E_ENTRY_NOT_FOUND if absent.
    /// For in-package tests and read-only callers; the FE enumerates via getDynamicFields RPC.
    public fun borrow_entry(board: &GuestbookBoard, id: u64): &GuestbookEntry {
        assert!(table::contains(&board.entries, id), E_ENTRY_NOT_FOUND);
        table::borrow(&board.entries, id)
    }

    public fun entry_id(e: &GuestbookEntry): u64 { e.id }
    public fun entry_author(e: &GuestbookEntry): address { e.author }
    public fun entry_message(e: &GuestbookEntry): &vector<u8> { &e.message }
    public fun entry_created_at_ms(e: &GuestbookEntry): u64 { e.created_at_ms }

    #[test_only]
    public fun oldest_id_for_testing(board: &GuestbookBoard): u64 { board.oldest_id }
}
