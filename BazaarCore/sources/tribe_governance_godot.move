// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Tribe-level Godot URL management (AP2-C / FP1-28).
///
/// Extracted from tribe_governance.move at OS-59-tribe-widgets to keep
/// tribe_governance.move under the 500-line Article XII.3 guard.
///
/// All entry fns delegate field mutation via package-private helpers
/// exposed on bazaar_core::tribe_governance.
module bazaar_core::tribe_governance_godot {
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::bazaar_assertions;
    use dapp_hub::tribe_registry::{Self, TribeLeaderCap};
    use sui::clock::Clock;
    use sui::event;
    use std::string::{Self, String};
    use std::option;

    // ===== Constants =====

    const MAX_GODOT_URL_BYTES: u64 = 256;

    // Mirror of tribe_governance constants (inlined to avoid re-export coupling).
    const E_WRONG_TRIBE: u64 = 1;
    const E_URL_TOO_LONG: u64 = 6;
    const E_URL_EMPTY: u64 = 9;
    const E_TRIBE_NOT_ACTIVE: u64 = 10;

    // Mirror of SCOPE_TRIBE from ssu_governance (inlined per the same cycle-cut
    // rationale as tribe_governance.move; value = 1, MUST stay in sync).
    const SCOPE_TRIBE: u8 = 1;

    // ===== Events =====

    /// Local mirror of ssu_governance::GodotUrlChangedEvent.
    /// Fields IDENTICAL to ssu_governance and original tribe_governance definitions
    /// so indexers can correlate via the `scope` field (0=SSU, 1=Tribe).
    /// DO NOT diverge field names or types without a coordinated AP2 amendment
    /// (Constitution Article VIII + XV).
    public struct GodotUrlChangedEvent has copy, drop {
        scope: u8,
        target_id: address,
        target_tribe_id: u64,
        old_url_some: bool,
        new_url_some: bool,
        new_url: Option<String>,
        actor: address,
        timestamp_ms: u64,
    }

    // ===== Entry functions =====

    /// Set or replace the tribe-level Godot client URL.
    public entry fun set_tribe_godot_url(
        gov: &mut TribeGovernance,
        url: Option<String>,
        leader_cap: &TribeLeaderCap,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        assert!(tribe_governance::tribe_is_active(gov), E_TRIBE_NOT_ACTIVE);
        assert!(tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        if (option::is_some(&url)) {
            let s_ref = option::borrow(&url);
            assert!(!string::is_empty(s_ref), E_URL_EMPTY);
            assert!(string::length(s_ref) <= MAX_GODOT_URL_BYTES, E_URL_TOO_LONG);
        };
        let old_some = option::is_some(tribe_governance::tribe_godot_url(gov));
        let new_some = option::is_some(&url);
        tribe_governance::set_godot_url_internal(gov, url);
        let emitted_url = if (new_some) {
            option::some(*option::borrow(tribe_governance::tribe_godot_url(gov)))
        } else {
            option::none<String>()
        };
        event::emit(GodotUrlChangedEvent {
            scope: SCOPE_TRIBE,
            target_id: @0x0,
            target_tribe_id: tribe_governance::tribe_id(gov),
            old_url_some: old_some,
            new_url_some: new_some,
            new_url: emitted_url,
            actor: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Clear the tribe-level Godot URL (convenience wrapper).
    public entry fun clear_tribe_godot_url(
        gov: &mut TribeGovernance,
        leader_cap: &TribeLeaderCap,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        set_tribe_godot_url(gov, option::none<String>(), leader_cap, clock, ctx);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
