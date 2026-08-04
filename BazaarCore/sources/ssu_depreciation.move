// bazaar_core | Permissionless SSU depreciation certificate mark entries reading world location
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V41 SSU depreciation / dead-bazaar prune -- Phase 1 "mark" half of the two-phase
// depreciation certificate (Documentation/plans/implementation/ssu-depreciation-prune-plan.md
// §1/§2.2). This is the ONLY module in the whole feature that reads world::location -- every
// Phase-B prune entry (bazaar_shop_ops/bazaar_mission/bazaar_economy, later phases) gates
// purely on the `is_depreciated` flag this module sets, never re-reading the world.
//
// Both entries are permissionless by design (plan §5 "janitor" UX: any wallet may run them)
// and idempotent (safe to re-call after the certificate is already set).
module bazaar_core::ssu_depreciation {
    use sui::event;
    use sui::clock::Clock;
    use sui::coin;
    use sui::transfer;
    use std::option;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use world::location::{Self, LocationRegistry};

    // ===== Error Codes =====
    const E_NOT_REVEALED: u64 = 1;
    const E_STILL_ANCHORED: u64 = 2;
    // CR-DEP-03 (critic binding condition): the LocationRegistry id is hard-coded, never a
    // parameter or admin-settable field -- same precedent as GRACE_BUFFER_MS. A caller-supplied
    // registry would let a griefer forge "prove death" against a different (empty) Table.
    const E_WRONG_REGISTRY: u64 = 3;

    // CR-DEP-03: the LIVE V40 world LocationRegistry shared object id, verified this session via
    // sui_getNormalizedMoveModule + sui_getObject (initialSharedVersion 868826232). NOT the stale
    // FE default in useSolarSystemName.ts (0xc87dca9c...) -- that id predates the 2026-06-25
    // world-wipe and is dead. Re-pin this constant if the world ever re-wipes LocationRegistry.
    const LOCATION_REGISTRY_ID: address = @0x0b3f4f78d7db3c7dee8d624298d45d53f45da69bb5df7b6165f3259258a6d723;

    // ===== Events =====
    public struct SSUDepreciatedEvent has copy, drop {
        ssu_id: address,
        tribe_id: u64,
        owner: address,
        tax_wallet_refunded: u64,
        timestamp_ms: u64,
    }

    // ===== Mark Entries =====

    /// Phase A step 1: opportunistic reveal-recorder. Sets location_revealed=true iff
    /// world::location proves this SSU currently has a live location entry. Idempotent
    /// no-op once already true (a revealed SSU can never become un-revealed except via
    /// the unanchor death this whole feature exists to detect -- plan §1 fact 5).
    ///
    /// No SSUOwnerCap gate: any wallet may call this on any SSU's own governance object;
    /// it can only ever move location_revealed false->true, and only when world::location
    /// itself proves it via the hard-pinned LOCATION_REGISTRY_ID (CR-DEP-03) -- no griefing
    /// surface (plan §6 test (2)/(3) anti-grief cases target mark_ssu_depreciated, not this).
    public entry fun mark_ssu_revealed(
        gov: &mut SSUGovernance,
        loc_registry: &LocationRegistry,
    ) {
        assert!(
            object::id_address(loc_registry) == LOCATION_REGISTRY_ID,
            E_WRONG_REGISTRY,
        );
        mark_ssu_revealed_impl(gov, loc_registry);
    }

    /// Registry-identity-assert-free core of mark_ssu_revealed (P5 test seam -- see the
    /// "Test-Only Registry-ID Bypass" section below for why this split exists). Zero behavior
    /// change: the production entry above still asserts the pinned id first, every call.
    fun mark_ssu_revealed_impl(gov: &mut SSUGovernance, loc_registry: &LocationRegistry) {
        if (ssu_governance::location_revealed(gov)) { return }; // idempotent no-op

        let assembly_id = object::id_from_address(ssu_governance::ssu_id(gov));
        let loc_opt = location::get_location(loc_registry, assembly_id);
        if (option::is_some(&loc_opt)) {
            ssu_governance::set_location_revealed(gov, true);
        };
    }

    /// Phase A step 2: the depreciation certificate. Requires BOTH location_revealed==true
    /// (E_NOT_REVEALED) AND world::location reporting none() RIGHT NOW (E_STILL_ANCHORED) --
    /// per plan §1 fact 5, that conjunction is only ever true after unanchor. Sets
    /// is_depreciated=true + is_active=false (ssu_governance::set_depreciated), drains the
    /// SSU tax_wallet to gov.owner (OQ-4: folded in for convenience, mirrors
    /// ssu_admin_drain::drain_ssu_eve's `amount > 0` guard), and emits SSUDepreciatedEvent.
    /// Idempotent no-op once already depreciated (the certificate is terminal -- plan §4).
    public entry fun mark_ssu_depreciated(
        gov: &mut SSUGovernance,
        loc_registry: &LocationRegistry,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            object::id_address(loc_registry) == LOCATION_REGISTRY_ID,
            E_WRONG_REGISTRY,
        );
        mark_ssu_depreciated_impl(gov, loc_registry, clock, ctx);
    }

    /// Registry-identity-assert-free core of mark_ssu_depreciated (P5 test seam -- see the
    /// "Test-Only Registry-ID Bypass" section below). Zero behavior change: the production
    /// entry above still asserts the pinned id first, every call.
    fun mark_ssu_depreciated_impl(
        gov: &mut SSUGovernance,
        loc_registry: &LocationRegistry,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        if (ssu_governance::is_depreciated(gov)) { return }; // idempotent no-op

        assert!(ssu_governance::location_revealed(gov), E_NOT_REVEALED);
        let assembly_id = object::id_from_address(ssu_governance::ssu_id(gov));
        let loc_opt = location::get_location(loc_registry, assembly_id);
        assert!(option::is_none(&loc_opt), E_STILL_ANCHORED);

        ssu_governance::set_depreciated(gov);

        let ssu_id = ssu_governance::ssu_id(gov);
        let tribe_id = ssu_governance::ssu_tribe_id(gov);
        let owner = ssu_governance::ssu_owner(gov);
        let amount = ssu_governance::tax_wallet_value(gov);
        if (amount > 0) {
            let bal = ssu_governance::withdraw_from_tax_wallet(gov, amount);
            transfer::public_transfer(coin::from_balance(bal, ctx), owner);
        };

        event::emit(SSUDepreciatedEvent {
            ssu_id,
            tribe_id,
            owner,
            tax_wallet_refunded: amount,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    // ===== Test-Only Registry-ID Bypass (P5 test seam -- FLAGGED, full rationale in this
    // report's §1) =====
    //
    // LOCATION_REGISTRY_ID pins a live testnet object address (CR-DEP-03). Unit tests cannot
    // construct an object at a caller-chosen id, so a test can never build a LocationRegistry
    // whose id equals this constant -- without this seam mark_ssu_revealed/mark_ssu_depreciated
    // would be untestable past their first line. These twins skip ONLY the identity assert and
    // call the exact same *_impl fn the production entry calls above -- zero duplicated business
    // logic, zero risk of test/production behavior drift. Stripped from non-test bytecode.
    #[test_only]
    public fun mark_ssu_revealed_for_testing(
        gov: &mut SSUGovernance,
        loc_registry: &LocationRegistry,
    ) {
        mark_ssu_revealed_impl(gov, loc_registry);
    }

    #[test_only]
    public fun mark_ssu_depreciated_for_testing(
        gov: &mut SSUGovernance,
        loc_registry: &LocationRegistry,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        mark_ssu_depreciated_impl(gov, loc_registry, clock, ctx);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
