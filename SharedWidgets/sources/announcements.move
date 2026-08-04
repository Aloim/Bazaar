// SharedWidgets/sources/announcements.move
// MAX 500 LINES — DO NOT EXCEED
module shared_widgets::announcements {
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};

    // -- Visibility constants --
    const VISIBILITY_PUBLIC: u8 = 0;
    const VISIBILITY_MEMBER: u8 = 1;
    const VISIBILITY_ADMIN: u8 = 2;

    // -- Error codes --
    const E_UNAUTHORIZED_PACKAGE: u64 = 1;
    const E_TITLE_TOO_LONG: u64 = 2;
    const E_BODY_TOO_LONG: u64 = 3;
    const E_COMMENT_TOO_LONG: u64 = 4;
    const E_COMMENTS_FULL: u64 = 5;
    const E_ANNOUNCEMENT_NOT_FOUND: u64 = 6;
    const E_INVALID_VISIBILITY: u64 = 7;

    // -- Limits --
    const MAX_TITLE_LEN: u64 = 100;
    const MAX_BODY_LEN: u64 = 500;
    const MAX_COMMENT_LEN: u64 = 250;
    const MAX_COMMENTS: u64 = 50;

    // -- Structs --

    /// Per-SSU announcement board.
    /// `authorized_package`: the package address authorised to call mutating functions.
    public struct AnnouncementBoard has key, store {
        id: UID,
        ssu_id: address,
        authorized_package: address,
        announcements: Table<u64, Announcement>,
        announcement_ids: vector<u64>,
        sticky_id: Option<u64>,
        next_id: u64,
    }

    public struct Announcement has store, drop {
        id: u64,
        author: address,
        title: vector<u8>,
        body: vector<u8>,
        visibility: u8,
        is_sticky: bool,
        created_at_ms: u64,
        comments: vector<Comment>,
    }

    public struct Comment has store, copy, drop {
        author: address,
        text: vector<u8>,
        created_at_ms: u64,
    }

    // -- Events --

    public struct AnnouncementCreatedEvent has copy, drop {
        ssu_id: address,
        ann_id: u64,
        author: address,
        visibility: u8,
        timestamp_ms: u64,
    }

    public struct AnnouncementDeletedEvent has copy, drop {
        ssu_id: address,
        ann_id: u64,
    }

    public struct CommentAddedEvent has copy, drop {
        ssu_id: address,
        ann_id: u64,
        author: address,
        timestamp_ms: u64,
    }

    // ===== Constructor =====

    /// Create a new AnnouncementBoard for an SSU.
    /// Returns the board — caller decides how to store or share it.
    public fun create_board(
        ssu_id: address,
        authorized_package: address,
        ctx: &mut TxContext,
    ): AnnouncementBoard {
        AnnouncementBoard {
            id: object::new(ctx),
            ssu_id,
            authorized_package,
            announcements: table::new(ctx),
            announcement_ids: vector::empty(),
            sticky_id: option::none(),
            next_id: 0,
        }
    }

    // ===== Mutating functions =====

    /// Create a new announcement on the board.
    /// Caller package must be authorised. Role checks performed by caller.
    /// Aborts: E_UNAUTHORIZED_PACKAGE, E_INVALID_VISIBILITY, E_TITLE_TOO_LONG, E_BODY_TOO_LONG
    public fun create_announcement(
        board: &mut AnnouncementBoard,
        caller_package: address,
        title: vector<u8>,
        body: vector<u8>,
        visibility: u8,
        author: address,
        clock: &Clock,
    ) {
        assert!(board.authorized_package == caller_package, E_UNAUTHORIZED_PACKAGE);
        assert!(visibility <= VISIBILITY_ADMIN, E_INVALID_VISIBILITY);
        assert!(vector::length(&title) <= MAX_TITLE_LEN, E_TITLE_TOO_LONG);
        assert!(vector::length(&body) <= MAX_BODY_LEN, E_BODY_TOO_LONG);

        let id = board.next_id;
        board.next_id = id + 1;

        let announcement = Announcement {
            id,
            author,
            title,
            body,
            visibility,
            is_sticky: false,
            created_at_ms: clock::timestamp_ms(clock),
            comments: vector::empty(),
        };

        table::add(&mut board.announcements, id, announcement);
        vector::push_back(&mut board.announcement_ids, id);

        event::emit(AnnouncementCreatedEvent {
            ssu_id: board.ssu_id,
            ann_id: id,
            author,
            visibility,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Delete an announcement by ID. Caller package must be authorised.
    /// Aborts: E_UNAUTHORIZED_PACKAGE, E_ANNOUNCEMENT_NOT_FOUND
    public fun delete_announcement(
        board: &mut AnnouncementBoard,
        caller_package: address,
        ann_id: u64,
    ) {
        assert!(board.authorized_package == caller_package, E_UNAUTHORIZED_PACKAGE);
        assert!(table::contains(&board.announcements, ann_id), E_ANNOUNCEMENT_NOT_FOUND);

        table::remove(&mut board.announcements, ann_id);

        let (found, idx) = vector::index_of(&board.announcement_ids, &ann_id);
        if (found) {
            vector::remove(&mut board.announcement_ids, idx);
        };

        if (option::is_some(&board.sticky_id)) {
            let current_sticky = *option::borrow(&board.sticky_id);
            if (current_sticky == ann_id) {
                board.sticky_id = option::none();
            };
        };

        event::emit(AnnouncementDeletedEvent { ssu_id: board.ssu_id, ann_id });
    }

    /// Set an announcement as the sticky one. Caller package must be authorised.
    /// Clears the is_sticky flag on any previously sticky announcement.
    /// Aborts: E_UNAUTHORIZED_PACKAGE, E_ANNOUNCEMENT_NOT_FOUND
    public fun set_sticky(
        board: &mut AnnouncementBoard,
        caller_package: address,
        ann_id: u64,
    ) {
        assert!(board.authorized_package == caller_package, E_UNAUTHORIZED_PACKAGE);
        assert!(table::contains(&board.announcements, ann_id), E_ANNOUNCEMENT_NOT_FOUND);

        if (option::is_some(&board.sticky_id)) {
            let prev_id = *option::borrow(&board.sticky_id);
            if (table::contains(&board.announcements, prev_id)) {
                table::borrow_mut(&mut board.announcements, prev_id).is_sticky = false;
            };
        };

        table::borrow_mut(&mut board.announcements, ann_id).is_sticky = true;
        board.sticky_id = option::some(ann_id);
    }

    /// Add a comment to an announcement. Caller package must be authorised.
    /// Role checks (e.g. visibility gate) are performed by the caller.
    /// Aborts: E_UNAUTHORIZED_PACKAGE, E_ANNOUNCEMENT_NOT_FOUND, E_COMMENT_TOO_LONG, E_COMMENTS_FULL
    public fun add_comment(
        board: &mut AnnouncementBoard,
        caller_package: address,
        ann_id: u64,
        text: vector<u8>,
        author: address,
        clock: &Clock,
    ) {
        assert!(board.authorized_package == caller_package, E_UNAUTHORIZED_PACKAGE);
        assert!(table::contains(&board.announcements, ann_id), E_ANNOUNCEMENT_NOT_FOUND);
        assert!(vector::length(&text) <= MAX_COMMENT_LEN, E_COMMENT_TOO_LONG);

        let ann = table::borrow_mut(&mut board.announcements, ann_id);
        assert!(vector::length(&ann.comments) < MAX_COMMENTS, E_COMMENTS_FULL);

        let ts = clock::timestamp_ms(clock);
        vector::push_back(&mut ann.comments, Comment { author, text, created_at_ms: ts });

        event::emit(CommentAddedEvent {
            ssu_id: board.ssu_id,
            ann_id,
            author,
            timestamp_ms: ts,
        });
    }

    // ===== Read accessors =====

    public fun ssu_id(board: &AnnouncementBoard): address { board.ssu_id }
    public fun authorized_package(board: &AnnouncementBoard): address { board.authorized_package }
    public fun announcement_count(board: &AnnouncementBoard): u64 {
        vector::length(&board.announcement_ids)
    }
    public fun announcement_ids(board: &AnnouncementBoard): &vector<u64> { &board.announcement_ids }
    public fun sticky_id(board: &AnnouncementBoard): Option<u64> { board.sticky_id }

    public fun announcement_by_id(board: &AnnouncementBoard, ann_id: u64): &Announcement {
        assert!(table::contains(&board.announcements, ann_id), E_ANNOUNCEMENT_NOT_FOUND);
        table::borrow(&board.announcements, ann_id)
    }

    public fun ann_author(ann: &Announcement): address { ann.author }
    public fun ann_title(ann: &Announcement): &vector<u8> { &ann.title }
    public fun ann_body(ann: &Announcement): &vector<u8> { &ann.body }
    public fun ann_visibility(ann: &Announcement): u8 { ann.visibility }
    public fun ann_is_sticky(ann: &Announcement): bool { ann.is_sticky }
    public fun ann_created_at_ms(ann: &Announcement): u64 { ann.created_at_ms }
    public fun ann_comment_count(ann: &Announcement): u64 { vector::length(&ann.comments) }

    // -- Visibility constants (read-only exports) --
    public fun visibility_public(): u8 { VISIBILITY_PUBLIC }
    public fun visibility_member(): u8 { VISIBILITY_MEMBER }
    public fun visibility_admin(): u8 { VISIBILITY_ADMIN }
}
