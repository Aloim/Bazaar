// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazaar_mission::mission_admin_drain — Update Ceremony DAppOwnerCap-gated
/// force-cancel of Mission (MIS) shops (NoTribe / Easy EVE path).
///
/// Two entries (split for clean pagination + a hard anti-stranding gate):
///   admin_force_settle_acceptances — refund collateral 100% to each taker
///     (no-fault; ceremony is admin-initiated). Pageable + idempotent.
///   admin_force_cancel_mission     — close a fully-settled mission: remaining
///     reward bundles -> giver Player Locker, remaining EVE reward -> giver.
///
/// Advanced (tribe-token) missions are drained by the cap-gated twins in
/// bazaar_economy::mission_ledger_ops (token reward/collateral settle on the
/// ledger). This module handles ONLY bazaar_type 0/1.
///
/// Security (audited — APPROVE-WITH-CONDITIONS C-1/C-4/C-5/C-8):
///   - C-1/SEC-B2: bundle recipient pinned to the on-chain mission.owner.
///   - C-4: close requires !is_settled (idempotent) AND runs_in_progress == 0
///          (collateral cannot be stranded by closing with live acceptances).
///   - C-5: assert_pool_for_ssu on the settle entry.
///   - C-8: collateral refunded to the SAME taker key passed to take_full.
///
/// File limit: 500 lines | mission-batch convention (Constitution-exempt).
module bazaar_mission::mission_admin_drain {
    use sui::clock::{Self, Clock};
    use world::storage_unit::StorageUnit;
    use world::character::{Self, Character};
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use bazaar_mission::mission::{Self, MissionRegistry};
    use bazaar_mission::mission_escrow;
    use bazaar_mission::mission_collateral_pool::{Self, MissionCollateralPool};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};

    // Error codes (shared numbering with mission.move / mission_complete.move)
    const E_INVALID_BAZAAR_TYPE:    u64 = 5;
    const E_RECIPIENT_NOT_GIVER:    u64 = 16;
    const E_ALREADY_SETTLED:        u64 = 30;
    const E_RUNS_STILL_IN_PROGRESS: u64 = 38;

    /// Refund collateral 100% to each taker in `takers` (no-fault). Pageable +
    /// idempotent: absent/already-settled takers are silently skipped, so a page
    /// can be re-run safely. Does NOT close the mission.
    public entry fun admin_force_settle_acceptances(
        _cap: &DAppOwnerCap,
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        pool: &mut MissionCollateralPool,
        takers: vector<address>,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let (ssu_id, bt) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_ssu(m), mission::mission_bazaar_type(m))
        };
        assert!(bt != 2, E_INVALID_BAZAAR_TYPE); // Advanced uses the token twin
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        mission_collateral_pool::assert_pool_for_ssu(pool, ssu_id); // C-5
        let mission_addr = object::id_to_address(&mission_id);
        let n = vector::length(&takers);
        let mut i = 0;
        while (i < n) {
            let taker = *vector::borrow(&takers, i);
            let (existed, coll) = {
                let m = mission::borrow_mission_mut_pkg(registry, mission_id);
                mission::admin_remove_acceptance(m, taker)
            };
            if (existed && coll > 0) {
                // C-8: refund to the SAME taker key; reason 0 = full refund.
                let refund = mission_collateral_pool::take_full(pool, mission_addr, taker, 0, ctx);
                transfer::public_transfer(refund, taker);
                mission::emit_collateral_refunded(mission_id, taker, coll, 0, 0, now);
            };
            i = i + 1;
        };
    }

    /// Close a fully-settled mission. Remaining reward bundles -> giver Player
    /// Locker; remaining EVE reward -> giver. Idempotent-by-abort.
    public entry fun admin_force_cancel_mission(
        _cap: &DAppOwnerCap,
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit, giver_character: &Character,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let (ssu_id, giver, bt, settled, runs_ip) = {
            let m = mission::borrow_mission(registry, mission_id);
            (
                mission::mission_ssu(m),
                mission::mission_owner(m),
                mission::mission_bazaar_type(m),
                mission::mission_is_settled(m),
                mission::mission_runs_in_progress_count(m),
            )
        };
        assert!(bt != 2, E_INVALID_BAZAAR_TYPE); // Advanced uses the token twin
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert!(!settled, E_ALREADY_SETTLED);            // C-4 idempotent
        assert!(runs_ip == 0, E_RUNS_STILL_IN_PROGRESS); // C-4 anti-stranding
        // C-1 / SEC-B2: pin the bundle recipient to the on-chain giver.
        assert!(character::character_address(giver_character) == giver, E_RECIPIENT_NOT_GIVER);
        {
            let m = mission::borrow_mission_mut_pkg(registry, mission_id);
            mission_escrow::drain_remaining_bundles_to_locker(m, ssu, giver_character, ctx);
        };
        // Refund remaining EVE reward to the giver.
        let has_eve = { mission::mission_eve_balance(mission::borrow_mission(registry, mission_id)) > 0 };
        if (has_eve) {
            let coin = {
                let m = mission::borrow_mission_mut_pkg(registry, mission_id);
                mission_escrow::split_all_eve(m, ctx)
            };
            transfer::public_transfer(coin, giver);
        };
        // C-7: owner sourced from mission state (the giver), never from sender.
        mission_escrow::finalize_cancel(registry, mission_id, giver, now);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
