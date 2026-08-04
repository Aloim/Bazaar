// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// V35 package split — guarded cross-package operations (W1/W2 hardening).
///
/// When ssu_lifecycle + stranger_registration moved to bazaar_mission, their
/// core-private callees (ssu_governance::set_active, membership::
/// insert_stranger_entry) would have needed public(package) -> public
/// widening. Security review (V35-bazaar-core-split-design §5, runbook §3)
/// flagged both bare widenings as capability-bypass anti-patterns:
///   - W1: a bare-public set_active is a permissionless per-SSU DoS lever.
///   - W2: a bare-public insert_stranger_entry lets any PTB write the shared
///     MemberRegistry during a freeze, breaking freeze-completeness.
///
/// Resolution (strictly stronger than the approved widenings): BOTH callees
/// stay public(package). This module exposes the only cross-package surface,
/// with the cap/freeze/active/subject guards enforced HERE, in the callee
/// package — not in the (now cross-package) caller.
///
/// This module lives in bazaar_core because the guards span ssu_governance +
/// membership, and membership cannot import ssu_governance (circular import —
/// see stranger_registration's OS-16 note). ssu_governance.move itself sits at
/// the 500-line XIV.4 guard, so the wrappers live in this dedicated module.
///
/// Cross-package consumers (bazaar_mission): ssu_lifecycle, stranger_registration.
module bazaar_core::ssu_guarded_ops {
    use sui::clock::Clock;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::membership::{Self, MemberRegistry, SSUOwnerCap};

    // CR-DEP-07 (V41 SSU depreciation prune plan §1/§4 "certificate is terminal"): a
    // depreciated SSU can never be reactivated. Module-scoped and distinct from the
    // borrowed ssu_governance::e_wrong_ssu() value (1) used in the same function below.
    const E_SSU_DEPRECIATED: u64 = 2;

    /// W1 hardened callee — toggle SSUGovernance.is_active, owner-only.
    /// The SSUOwnerCap binding is asserted HERE (in-callee), so widening this
    /// surface exposes no bare setter. Aborts E_WRONG_SSU on cap/gov mismatch.
    /// CR-DEP-07: aborts E_SSU_DEPRECIATED if the owner tries to flip a depreciated
    /// SSU back to active=true; re-deactivating (active=false) is still allowed.
    public fun set_ssu_active_as_owner(
        cap: &SSUOwnerCap,
        gov: &mut SSUGovernance,
        active: bool,
    ) {
        assert!(
            membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov),
            ssu_governance::e_wrong_ssu(),
        );
        assert!(
            !(ssu_governance::is_depreciated(gov) && active),
            E_SSU_DEPRECIATED,
        );
        ssu_governance::set_active(gov, active);
    }

    /// W2 hardened callee — register the tx sender as a Stranger.
    /// The freeze/active/subject guards (formerly in bazaar_core::
    /// stranger_registration::register_stranger) are enforced HERE so the
    /// registry inserter is never reachable cross-package without them.
    ///
    /// Aborts: E_SSU_FROZEN (11), E_SSU_NOT_ACTIVE, E_SUBJECT_SSU_MISMATCH (12)
    /// from ssu_governance; E_ALREADY_REGISTERED (3) from membership.
    public fun register_stranger_guarded(
        gov: &SSUGovernance,
        registry: &mut MemberRegistry,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        ssu_governance::assert_subject_in_governance(gov, membership::ssu_id(registry));
        membership::insert_stranger_entry(registry, clock, ctx);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
