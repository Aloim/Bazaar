// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Tribe-side lifecycle management: deactivate/activate entry fns, assert_tribe_active helper,
/// set_tribe_store_visibility, and all associated events.
/// Split from tribe_governance.move at R6.7.3 to stay under the 500-LOC Article XIV.4 guard.
/// SEC-015: assert_tribe_active is public(package) so all BazaarCore callers (caps, proxy) can use it.
module bazaar_core::tribe_lifecycle {
    use sui::event;
    use sui::clock::Clock;
    use dapp_hub::tribe_registry;
    use dapp_hub::tribe_registry::TribeLeaderCap;
    use bazaar_core::tribe_governance::{Self, TribeGovernance, TribeAdminCap, TribeSuperAdminCap};
    use bazaar_core::bazaar_assertions;

    // ===== Error Codes =====
    const E_TRIBE_NOT_ACTIVE: u64 = 1;
    const E_INVALID_VISIBILITY: u64 = 2;
    const E_WRONG_TRIBE: u64 = 3;

    // ===== Events =====
    public struct TribeDeactivated has copy, drop {
        tribe_id: u64,
        deactivated_by: address,
        timestamp_ms: u64,
    }

    public struct TribeActivated has copy, drop {
        tribe_id: u64,
        activated_by: address,
        timestamp_ms: u64,
    }

    public struct TribeStoreVisibilitySet has copy, drop {
        tribe_id: u64,
        visibility: u8,
        set_by: address,
        timestamp_ms: u64,
    }

    // ===== Package-Private Helpers (SEC-015) =====

    /// Aborts E_TRIBE_NOT_ACTIVE when the tribe governance is deactivated.
    /// Called at the top of every tribe-mutation entry fn. Exempt: bootstrap, withdraw (recovery).
    public(package) fun assert_tribe_active(gov: &TribeGovernance) {
        assert!(tribe_governance::tribe_is_active(gov), E_TRIBE_NOT_ACTIVE);
    }

    /// Package-private setter for is_active field. Called by deactivate/activate entry fns below.
    public(package) fun set_active(gov: &mut TribeGovernance, active: bool) {
        tribe_governance::set_tribe_is_active(gov, active);
    }

    // ===== Lifecycle Entry Functions (TribeLeaderCap-gated) =====

    /// Soft-deactivate this tribe governance object. Blocks all tribe-mutation fns.
    /// Exempt fns (tax withdrawal, moderation, bootstrap) continue to work during deactivation.
    /// Symmetric with ssu_governance::deactivate_ssu (Decision B per SEC-015).
    public entry fun deactivate_tribe_governance(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        // Idempotent: deactivating an already-deactivated tribe is a no-op (no abort).
        tribe_governance::set_tribe_is_active(gov, false);
        event::emit(TribeDeactivated {
            tribe_id: tribe_governance::tribe_id(gov),
            deactivated_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Restore a deactivated tribe governance object to active state.
    /// TribeLeaderCap-gated (only the tribe leader can reactivate).
    public entry fun activate_tribe_governance(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        tribe_governance::set_tribe_is_active(gov, true);
        event::emit(TribeActivated {
            tribe_id: tribe_governance::tribe_id(gov),
            activated_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Issue-1 / DApp-Management "Remove Tribe": atomically deactivate a tribe
    /// END-TO-END — flips BOTH the dapp_hub registry `Tribe.is_active` (via
    /// `tribe_registry::deactivate_tribe`) AND this tribe's `TribeGovernance.is_active`.
    ///
    /// The registry-only `deactivate_tribe` left the governance object active, so
    /// every `assert_tribe_active`-gated tribe-mutation fn (and the FE governance
    /// surfaces that key off it) kept working after a tribe was "removed". Bundling
    /// both flips here makes removal actually revoke tribe governance: gated entries
    /// abort E_TRIBE_NOT_ACTIVE; EXEMPT recovery fns (tax withdrawal, moderation,
    /// bootstrap) still work, matching `deactivate_tribe_governance` semantics.
    ///
    /// TribeLeaderCap-gated. The registry call re-asserts the tribe exists; we assert
    /// the cap matches THIS governance object so a leader cannot deactivate a foreign
    /// tribe's governance. Idempotent on the gov flag (re-call is a no-op + re-emit).
    public entry fun deactivate_tribe_fully(
        leader_cap: &TribeLeaderCap,
        registry: &mut tribe_registry::TribeRegistry,
        gov: &mut TribeGovernance,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        // Registry side (dapp_hub): flips Tribe.is_active + emits TribeDeactivatedEvent.
        tribe_registry::deactivate_tribe(leader_cap, registry, clock, ctx);
        // Governance side (bazaar_core): blocks every assert_tribe_active() entry fn.
        tribe_governance::set_tribe_is_active(gov, false);
        event::emit(TribeDeactivated {
            tribe_id: tribe_governance::tribe_id(gov),
            deactivated_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    // ===== OS-49a: Store Visibility Setter + Accessor =====

    /// Set the tribe-scoped store visibility flag.
    /// 0 = public (default). 1 = tribe-members-only (buyer gating — R6.7.6 closes enforcement stub).
    /// Asserts: Easy/Advanced bazaar type → tribe active → cap tribe match → visibility <= 1.
    public entry fun set_tribe_store_visibility(
        cap: &TribeAdminCap,
        gov: &mut TribeGovernance,
        visibility: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov)); // Article XII.3
        assert_tribe_active(gov);   // SEC-015
        assert!(tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        assert!(visibility <= 1, E_INVALID_VISIBILITY);
        tribe_governance::set_store_visibility(gov, visibility);
        event::emit(TribeStoreVisibilitySet {
            tribe_id: tribe_governance::tribe_id(gov),
            visibility,
            set_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Read the tribe store visibility field.
    public fun tribe_store_visibility(gov: &TribeGovernance): u8 {
        tribe_governance::store_visibility(gov)
    }

    /// Higher-tier mirror: TribeLeaderCap can set store visibility.
    /// Cap hierarchy: Leader > SuperAdmin > Admin. Leader inherits Admin's authority.
    public entry fun set_tribe_store_visibility_as_leader(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        visibility: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        assert_tribe_active(gov);
        assert!(tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        assert!(visibility <= 1, E_INVALID_VISIBILITY);
        tribe_governance::set_store_visibility(gov, visibility);
        event::emit(TribeStoreVisibilitySet {
            tribe_id: tribe_governance::tribe_id(gov),
            visibility,
            set_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Higher-tier mirror: TribeSuperAdminCap can set store visibility.
    /// Honors revocation table (E_TRIBE_CAP_REVOKED) — matches withdraw_tribe_tax_as_super_admin pattern.
    public entry fun set_tribe_store_visibility_as_super_admin(
        super_admin_cap: &TribeSuperAdminCap,
        gov: &mut TribeGovernance,
        visibility: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        assert_tribe_active(gov);
        assert!(tribe_governance::tribe_super_admin_cap_tribe_id(super_admin_cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, object::id(super_admin_cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        assert!(visibility <= 1, E_INVALID_VISIBILITY);
        tribe_governance::set_store_visibility(gov, visibility);
        event::emit(TribeStoreVisibilitySet {
            tribe_id: tribe_governance::tribe_id(gov),
            visibility,
            set_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    // ===== Public Error Accessors (test + cross-module use) =====
    public fun e_tribe_not_active(): u64 { E_TRIBE_NOT_ACTIVE }
    public fun e_invalid_visibility(): u64 { E_INVALID_VISIBILITY }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
