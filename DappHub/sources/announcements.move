// DappHub/sources/announcements.move
// Two-tier DApp-wide announcement system for UpdateCeremonyPlan v1.
// Info tier (0): user-dismissible top banner; renders on all 4 apps + DappHub.
// Warning tier (1): NOT user-dismissible. The 3 bazaar apps (NoTribe, Easy, Advanced) lock
// all mutating FE actions while an active Warning row exists. DappHub is EXEMPT — admin needs
// DappHub functional to drive the ceremony itself. Bypass risk per plan §9 is self-defeating
// (outgoing-version state is inert post-publish).
//
// init_v1_ceremony_objects is the ONE-SHOT post-upgrade init entry that creates BOTH this
// DAppAnnouncements object AND the AnchorRegistry in one PTB. Deployer calls once.

module dapp_hub::announcements {
    use std::string::{Self, String};
    use sui::clock::{Self, Clock};
    use sui::event;
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use dapp_hub::anchor_registry;

    // Error codes
    const E_ANNOUNCEMENT_NOT_FOUND: u64 = 1;
    const E_INVALID_TIER:           u64 = 2;
    const E_SHOW_RANGE_INVALID:     u64 = 3;
    const E_TITLE_TOO_LONG:         u64 = 4;
    const E_BODY_TOO_LONG:          u64 = 5;

    // Tier discriminators
    const TIER_INFO:    u8 = 0;
    const TIER_WARNING: u8 = 1;

    // Length caps to keep storage costs predictable.
    const TITLE_MAX_BYTES: u64 = 200;
    const BODY_MAX_BYTES:  u64 = 2_000;

    /// Shared object. Single global instance created by init_v1_ceremony_objects.
    /// Uses vector (not Table) — the live announcement count is small (O(10)); linear scans
    /// are cheap; active_warnings + has_active_warning both need full traversal anyway.
    public struct DAppAnnouncements has key {
        id: UID,
        next_id: u64,
        announcements: vector<Announcement>,
    }

    public struct Announcement has store, drop, copy {
        id: u64,
        tier: u8,
        title: String,
        body: String,
        posted_at_ms: u64,
        show_from_ms: u64,
        show_until_ms: u64,
        posted_by: address,
    }

    // Events
    public struct AnnouncementPosted has copy, drop {
        id: u64,
        tier: u8,
        title: String,
        show_from_ms: u64,
        show_until_ms: u64,
        posted_by: address,
        timestamp_ms: u64,
    }
    public struct AnnouncementCleared has copy, drop {
        id: u64,
        tier: u8,
        cleared_by: address,
        timestamp_ms: u64,
    }
    public struct AnnouncementPruned has copy, drop {
        pruned_count: u64,
        timestamp_ms: u64,
    }

    // ============================================================
    // ONE-SHOT POST-UPGRADE INIT
    // ============================================================
    //
    // Creates BOTH DAppAnnouncements AND AnchorRegistry in one tx. Deployer is expected to
    // call exactly once after the v1 sui client upgrade lands. Double-call creates a second
    // pair of shared objects (harmless — env vars record only the first); no on-chain
    // idempotency check intentionally (per move-architect §13.5).
    public entry fun init_v1_ceremony_objects(
        _cap: &DAppOwnerCap,
        ctx: &mut TxContext,
    ) {
        anchor_registry::create_and_share(ctx);

        let board = DAppAnnouncements {
            id: object::new(ctx),
            next_id: 1,
            announcements: vector::empty<Announcement>(),
        };
        transfer::share_object(board);
    }

    // ============================================================
    // ADMIN ENTRIES (DAppOwnerCap-gated)
    // ============================================================

    public entry fun post_announcement(
        _cap: &DAppOwnerCap,
        board: &mut DAppAnnouncements,
        tier: u8,
        title: String,
        body: String,
        show_from_ms: u64,
        show_until_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tier == TIER_INFO || tier == TIER_WARNING, E_INVALID_TIER);
        assert!(show_from_ms <= show_until_ms, E_SHOW_RANGE_INVALID);
        assert!(string::length(&title) <= TITLE_MAX_BYTES, E_TITLE_TOO_LONG);
        assert!(string::length(&body) <= BODY_MAX_BYTES, E_BODY_TOO_LONG);

        let id = board.next_id;
        let ts = clock::timestamp_ms(clock);
        let sender = tx_context::sender(ctx);

        let row = Announcement {
            id,
            tier,
            title,
            body,
            posted_at_ms: ts,
            show_from_ms,
            show_until_ms,
            posted_by: sender,
        };

        // copy fields for event before move into vector
        let evt = AnnouncementPosted {
            id,
            tier,
            title: row.title,
            show_from_ms,
            show_until_ms,
            posted_by: sender,
            timestamp_ms: ts,
        };

        vector::push_back(&mut board.announcements, row);
        board.next_id = id + 1;
        event::emit(evt);
    }

    public entry fun clear_announcement(
        _cap: &DAppOwnerCap,
        board: &mut DAppAnnouncements,
        id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n = vector::length(&board.announcements);
        let mut i = 0;
        let mut found = false;
        let mut found_idx: u64 = 0;
        while (i < n) {
            if (vector::borrow(&board.announcements, i).id == id) {
                found = true;
                found_idx = i;
                break
            };
            i = i + 1;
        };
        assert!(found, E_ANNOUNCEMENT_NOT_FOUND);
        let removed = vector::remove(&mut board.announcements, found_idx);
        event::emit(AnnouncementCleared {
            id: removed.id,
            tier: removed.tier,
            cleared_by: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Removes every row whose show_until_ms is already past. Back-to-front iteration keeps
    /// indices stable while removing. Safe to call when no rows are expired (emits pruned_count=0).
    public entry fun prune_expired_announcements(
        _cap: &DAppOwnerCap,
        board: &mut DAppAnnouncements,
        clock: &Clock,
    ) {
        let now_ms = clock::timestamp_ms(clock);
        let mut i = vector::length(&board.announcements);
        let mut pruned: u64 = 0;
        while (i > 0) {
            i = i - 1;
            if (vector::borrow(&board.announcements, i).show_until_ms < now_ms) {
                vector::remove(&mut board.announcements, i);
                pruned = pruned + 1;
            };
        };
        event::emit(AnnouncementPruned { pruned_count: pruned, timestamp_ms: now_ms });
    }

    // ============================================================
    // VIEW FUNCTIONS (no auth; FE polls these via devInspect)
    // ============================================================

    /// True iff any row is a Warning AND now_ms ∈ [show_from_ms, show_until_ms].
    /// Consumed by FE useDAppActionsEnabled hook to drive ActionBlockedModal.
    public fun has_active_warning(board: &DAppAnnouncements, now_ms: u64): bool {
        let n = vector::length(&board.announcements);
        let mut i = 0;
        while (i < n) {
            let a = vector::borrow(&board.announcements, i);
            if (a.tier == TIER_WARNING && a.show_from_ms <= now_ms && now_ms <= a.show_until_ms) {
                return true
            };
            i = i + 1;
        };
        false
    }

    /// Collect every currently-active Warning row. Returns owned copies (Announcement: copy).
    public fun active_warnings(board: &DAppAnnouncements, now_ms: u64): vector<Announcement> {
        let mut out = vector::empty<Announcement>();
        let n = vector::length(&board.announcements);
        let mut i = 0;
        while (i < n) {
            let a = vector::borrow(&board.announcements, i);
            if (a.tier == TIER_WARNING && a.show_from_ms <= now_ms && now_ms <= a.show_until_ms) {
                vector::push_back(&mut out, *a);
            };
            i = i + 1;
        };
        out
    }

    public fun announcement_count(board: &DAppAnnouncements): u64 {
        vector::length(&board.announcements)
    }

    // Tier constants exposed as public fns so consumers (Move tests + cross-module) don't
    // re-declare them.
    public fun tier_info():    u8 { TIER_INFO }
    public fun tier_warning(): u8 { TIER_WARNING }

    // Announcement field accessors — for FE devInspect calls returning copies.
    public fun ann_id(a: &Announcement): u64 { a.id }
    public fun ann_tier(a: &Announcement): u8 { a.tier }
    public fun ann_title(a: &Announcement): String { a.title }
    public fun ann_body(a: &Announcement): String { a.body }
    public fun ann_posted_at_ms(a: &Announcement): u64 { a.posted_at_ms }
    public fun ann_show_from_ms(a: &Announcement): u64 { a.show_from_ms }
    public fun ann_show_until_ms(a: &Announcement): u64 { a.show_until_ms }
    public fun ann_posted_by(a: &Announcement): address { a.posted_by }
}
