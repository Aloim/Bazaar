// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Announcement proxy for the Bazaar stack.
///
/// V35 package split: relocated verbatim from bazaar_core::announcement_proxy
/// (bazaar_core exceeded Sui's 102,400-byte published-object limit). Pure
/// leaf-consumer: reads bazaar_core via public asserts/accessors only and
/// proxies to shared_widgets::announcements. Only deltas vs bazaar_core:
/// assert_easy_or_advanced -> assert_easy_or_advanced_external (Article I.4
/// cross-package wrapper) and tribe_governance::assert_tribe_active widened
/// to public in core (read-only assert).
///
/// Provides role-gated entry functions that delegate to
/// shared_widgets::announcements, passing the caller-supplied
/// package_id as the caller_package identity token (Constitution Article VII.1).
/// V7: package_id is passed by the PTB caller (the package id the board was
/// authorized with — historically PACKAGE_IDS.BAZAAR_CORE) to avoid the
/// @-literal compile-as-zero bug at fresh-publish.
///
/// SSU-level functions are gated by SSUOwnerCap.
/// Tribe-level functions are gated by TribeAdminCap.
///
/// No events are emitted here — SharedWidgets handles all event
/// emission internally.
module bazaar_mission::announcement_proxy {
    use sui::clock::Clock;
    use shared_widgets::announcements::{Self, AnnouncementBoard};
    use bazaar_core::membership::{Self, SSUOwnerCap};
    use bazaar_core::tribe_governance::{Self, TribeAdminCap, TribeGovernance};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazaar_assertions;

    // ===== Error Codes =====
    const E_TRIBE_ID_MISMATCH: u64 = 1;

    // ===== SSU-Level Functions (SSUOwnerCap) =====

    /// Post a new announcement on an SSU board.
    /// package_id: caller-supplied board-authorized package address (avoids @-literal zero bug).
    /// Aborts (from SharedWidgets): E_UNAUTHORIZED_PACKAGE, E_INVALID_VISIBILITY,
    ///   E_TITLE_TOO_LONG, E_BODY_TOO_LONG.
    public entry fun ssu_post_announcement(
        _cap: &SSUOwnerCap,
        gov: &SSUGovernance,
        board: &mut AnnouncementBoard,
        package_id: address,
        title: vector<u8>,
        body: vector<u8>,
        visibility: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        ssu_governance::assert_not_frozen(gov); // R3.5
        ssu_governance::assert_active(gov);      // R6.7.1 CR-14: active gate
        ssu_governance::assert_subject_in_governance(gov, membership::cap_ssu_id(_cap)); // R3.5 SA-R3-01
        let author = tx_context::sender(ctx);
        announcements::create_announcement(
            board,
            package_id,
            title,
            body,
            visibility,
            author,
            clock,
        );
    }

    /// Delete an announcement from an SSU board by announcement ID.
    /// SEC-014: gov param added R6.7.1. Checks freeze + active + SSU identity.
    /// package_id: caller-supplied board-authorized package address (avoids @-literal zero bug).
    /// Aborts: E_SSU_FROZEN, E_SSU_NOT_ACTIVE, E_SUBJECT_SSU_MISMATCH, E_ANNOUNCEMENT_NOT_FOUND.
    public entry fun ssu_delete_announcement(
        _cap: &SSUOwnerCap,
        gov: &SSUGovernance,
        board: &mut AnnouncementBoard,
        package_id: address,
        ann_id: u64,
    ) {
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        ssu_governance::assert_subject_in_governance(gov, membership::cap_ssu_id(_cap));
        announcements::delete_announcement(board, package_id, ann_id);
    }

    /// Pin an announcement as sticky on an SSU board.
    /// The previous sticky (if any) is automatically un-pinned by SharedWidgets.
    /// package_id: caller-supplied board-authorized package address (avoids @-literal zero bug).
    /// Aborts (from SharedWidgets): E_UNAUTHORIZED_PACKAGE, E_ANNOUNCEMENT_NOT_FOUND.
    public entry fun ssu_set_sticky(
        _cap: &SSUOwnerCap,
        gov: &SSUGovernance,
        board: &mut AnnouncementBoard,
        package_id: address,
        ann_id: u64,
    ) {
        ssu_governance::assert_not_frozen(gov); // R3.5
        ssu_governance::assert_active(gov);      // R6.7.1 CR-14: active gate
        ssu_governance::assert_subject_in_governance(gov, membership::cap_ssu_id(_cap)); // R3.5 SA-R3-01
        announcements::set_sticky(board, package_id, ann_id);
    }

    /// Add a comment to an announcement on an SSU board.
    /// package_id: caller-supplied board-authorized package address (avoids @-literal zero bug).
    /// Aborts (from SharedWidgets): E_UNAUTHORIZED_PACKAGE, E_ANNOUNCEMENT_NOT_FOUND,
    ///   E_COMMENT_TOO_LONG, E_COMMENTS_FULL.
    public entry fun ssu_add_comment(
        _cap: &SSUOwnerCap,
        gov: &SSUGovernance,
        board: &mut AnnouncementBoard,
        package_id: address,
        ann_id: u64,
        text: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        ssu_governance::assert_not_frozen(gov); // R3.5
        ssu_governance::assert_active(gov);      // R6.7.1 CR-14: active gate
        ssu_governance::assert_subject_in_governance(gov, membership::cap_ssu_id(_cap)); // R3.5 SA-R3-01
        let author = tx_context::sender(ctx);
        announcements::add_comment(
            board,
            package_id,
            ann_id,
            text,
            author,
            clock,
        );
    }

    // ===== Tribe-Level Functions (TribeAdminCap) =====

    /// Post a new announcement on a tribe board.
    /// package_id: caller-supplied board-authorized package address (avoids @-literal zero bug).
    /// Aborts (from SharedWidgets): E_UNAUTHORIZED_PACKAGE, E_INVALID_VISIBILITY,
    ///   E_TITLE_TOO_LONG, E_BODY_TOO_LONG.
    public entry fun tribe_post_announcement(
        cap: &TribeAdminCap,
        tribe_gov: &TribeGovernance,
        board: &mut AnnouncementBoard,
        package_id: address,
        title: vector<u8>,
        body: vector<u8>,
        visibility: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // R5.2 — bazaar-type gate (Easy or Advanced); cross-package form post-V35-split
        bazaar_assertions::assert_easy_or_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        tribe_governance::assert_tribe_active(tribe_gov);  // SEC-015
        // R5.2 — tribe-id coherence
        assert!(tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        let author = tx_context::sender(ctx);
        announcements::create_announcement(
            board,
            package_id,
            title,
            body,
            visibility,
            author,
            clock,
        );
    }

    /// Delete an announcement from a tribe board by announcement ID.
    /// package_id: caller-supplied board-authorized package address (avoids @-literal zero bug).
    /// Aborts (from SharedWidgets): E_UNAUTHORIZED_PACKAGE, E_ANNOUNCEMENT_NOT_FOUND.
    public entry fun tribe_delete_announcement(
        cap: &TribeAdminCap,
        tribe_gov: &TribeGovernance,
        board: &mut AnnouncementBoard,
        package_id: address,
        ann_id: u64,
    ) {
        bazaar_assertions::assert_easy_or_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        tribe_governance::assert_tribe_active(tribe_gov);  // SEC-015
        assert!(tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        announcements::delete_announcement(board, package_id, ann_id);
    }

    /// Pin an announcement as sticky on a tribe board.
    /// The previous sticky (if any) is automatically un-pinned by SharedWidgets.
    /// package_id: caller-supplied board-authorized package address (avoids @-literal zero bug).
    /// Aborts (from SharedWidgets): E_UNAUTHORIZED_PACKAGE, E_ANNOUNCEMENT_NOT_FOUND.
    public entry fun tribe_set_sticky(
        cap: &TribeAdminCap,
        tribe_gov: &TribeGovernance,
        board: &mut AnnouncementBoard,
        package_id: address,
        ann_id: u64,
    ) {
        bazaar_assertions::assert_easy_or_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        tribe_governance::assert_tribe_active(tribe_gov);  // SEC-015
        assert!(tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        announcements::set_sticky(board, package_id, ann_id);
    }

    /// Add a comment to an announcement on a tribe board.
    /// package_id: caller-supplied board-authorized package address (avoids @-literal zero bug).
    /// Aborts (from SharedWidgets): E_UNAUTHORIZED_PACKAGE, E_ANNOUNCEMENT_NOT_FOUND,
    ///   E_COMMENT_TOO_LONG, E_COMMENTS_FULL.
    public entry fun tribe_add_comment(
        cap: &TribeAdminCap,
        tribe_gov: &TribeGovernance,
        board: &mut AnnouncementBoard,
        package_id: address,
        ann_id: u64,
        text: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        tribe_governance::assert_tribe_active(tribe_gov);  // SEC-015
        assert!(tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        let author = tx_context::sender(ctx);
        announcements::add_comment(
            board,
            package_id,
            ann_id,
            text,
            author,
            clock,
        );
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
