// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_mission::stranger_registration {
    // OS-16: Stranger registration entry point (originally extracted from
    // membership.move because membership cannot import ssu_governance —
    // circular import).
    //
    // V35 package split: relocated from bazaar_core::stranger_registration
    // (bazaar_core exceeded Sui's 102,400-byte published-object limit).
    // W2 HARDENING (security-auditor MUST-FIX): membership::insert_stranger_entry
    // stays public(package) in core; the freeze/active/subject guards now live
    // IN THE CORE CALLEE bazaar_core::ssu_guarded_ops::register_stranger_guarded,
    // so no unguarded registry inserter is exposed cross-package. This module is
    // the thin PTB-facing entry surface.
    // SA-R6.6-09: assert_subject_in_governance closes the cross-SSU bypass path.

    use sui::clock::Clock;
    use bazaar_core::ssu_governance::SSUGovernance;
    use bazaar_core::ssu_guarded_ops;
    use bazaar_core::membership::MemberRegistry;

    // --- Public Entry Point ---

    /// Register the calling sender as a Stranger member of the SSU.
    ///
    /// Guards (enforced in the core callee, in order):
    ///   1. `assert_not_frozen(gov)` — blocks registration while SSU is frozen (SA-R6.6-03).
    ///   2. `assert_active(gov)` — R6.7.1 E_SSU_NOT_ACTIVE.
    ///   3. `assert_subject_in_governance(gov, membership::ssu_id(registry))` — ensures
    ///      the supplied `SSUGovernance` governs the same SSU as the `MemberRegistry`
    ///      being written to, closing the cross-SSU bypass path (SA-R6.6-09).
    ///   4. `membership::insert_stranger_entry(registry, clock, ctx)` — performs the
    ///      duplicate-registration check and the actual table insertion.
    ///
    /// Aborts:
    ///   - `bazaar_core::ssu_governance::E_SSU_FROZEN (11)` if SSU is frozen.
    ///   - `bazaar_core::ssu_governance::E_SSU_NOT_ACTIVE` if SSU is deactivated.
    ///   - `bazaar_core::ssu_governance::E_SUBJECT_SSU_MISMATCH (12)` if gov.ssu_id !=
    ///     registry.ssu_id (cross-SSU attempt).
    ///   - `bazaar_core::membership::E_ALREADY_REGISTERED (3)` if caller is already
    ///     registered in this registry.
    public fun register_stranger(
        gov: &SSUGovernance,
        registry: &mut MemberRegistry,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        ssu_guarded_ops::register_stranger_guarded(gov, registry, clock, ctx);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
