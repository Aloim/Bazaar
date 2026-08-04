// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// SSU governance lifecycle entry points (OS-38).
///
/// V35 package split: relocated from bazaar_core::ssu_lifecycle (bazaar_core
/// exceeded Sui's 102,400-byte published-object limit). W1 HARDENING (security-
/// auditor MUST-FIX): ssu_governance::set_active stays public(package) in core;
/// this module calls bazaar_core::ssu_guarded_ops::set_ssu_active_as_owner,
/// which re-asserts the SSUOwnerCap binding IN THE CALLEE before toggling —
/// no bare setter is exposed cross-package.
///
/// Provides:
///   - deactivate_ssu_governance — soft-deactivate; sets is_active = false
///   - activate_ssu_governance   — reactivate; sets is_active = true
///
/// assert_active STAYS in ssu_governance.move (reads private is_active field;
/// consumed by all other modules across bazaar_core).
module bazaar_mission::ssu_lifecycle {
    use sui::event;
    use sui::clock::Clock;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_guarded_ops;
    use bazaar_core::membership;

    // ===== Events =====

    /// Emitted when SSU is deactivated via deactivate_ssu_governance.
    public struct SSUDeactivated has copy, drop {
        ssu_id: address,
        set_by: address,
        timestamp_ms: u64,
    }

    /// Emitted when SSU is reactivated via activate_ssu_governance.
    public struct SSUActivated has copy, drop {
        ssu_id: address,
        set_by: address,
        timestamp_ms: u64,
    }

    // ===== OS-38: Lifecycle Entry Functions =====

    /// Soft-deactivate this SSU governance. Owner-only.
    /// Decision B: reversible via activate_ssu_governance. No shared-object destruction.
    /// All GATED mutating entry fns abort E_SSU_NOT_ACTIVE while deactivated.
    /// EXEMPT-RECOVERY paths (withdraw_ssu_tax, unfreeze_*) work regardless.
    /// Idempotent: calling on an already-inactive SSU silently re-sets and re-emits.
    /// Cap binding is asserted both here AND in the core callee (W1 hardening).
    public entry fun deactivate_ssu_governance(
        cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_guarded_ops::set_ssu_active_as_owner(cap, gov, false);
        event::emit(SSUDeactivated {
            ssu_id: ssu_governance::ssu_id(gov),
            set_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Reactivate a previously deactivated SSU governance. Owner-only.
    /// Symmetric to deactivate_ssu_governance.
    /// EXEMPT-RECOVERY: does NOT call assert_active (it is the very op that restores active state).
    /// Idempotent: calling on an already-active SSU silently re-sets and re-emits.
    /// Cap binding is asserted both here AND in the core callee (W1 hardening).
    public entry fun activate_ssu_governance(
        cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_guarded_ops::set_ssu_active_as_owner(cap, gov, true);
        event::emit(SSUActivated {
            ssu_id: ssu_governance::ssu_id(gov),
            set_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
