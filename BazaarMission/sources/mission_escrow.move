// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazaar_mission::mission_escrow — Escrow drain/cancel/finalize primitives
/// extracted from mission.move (CC-M10-R 500-line split). All fns are
/// public(package); consumers are mission.move (create), mission_lifecycle
/// (cancel), and mission_complete (cancel-advanced, collect-proof). No new
/// imports beyond what mission.move already had.
module bazaar_mission::mission_escrow {
    use sui::coin::{Self, Coin};
    use world::storage_unit::{Self, StorageUnit};
    use world::character::Character;
    use world::access::OwnerCap;
    use EVE::EVE::EVE;
    use bazaar_core::bazar::{Self, BazarAuth};
    use bazaar_mission::mission::{Self, MissionRegistry, MissionShop};

    // Error codes (shared numbering)
    const E_NOT_MISSION_OWNER: u64 = 2;
    const E_ALREADY_SETTLED: u64 = 30;

    // ===== Cancel / drain primitives =====

    public(package) fun assert_cancellable(m: &MissionShop, ctx: &TxContext): address {
        assert!(mission::mission_owner(m) == tx_context::sender(ctx), E_NOT_MISSION_OWNER);
        assert!(!mission::mission_is_settled(m), E_ALREADY_SETTLED);
        mission::mission_owner(m)
    }

    public(package) fun drain_remaining_bundles_to_locker(
        m: &mut MissionShop, ssu: &mut StorageUnit, character: &Character, ctx: &mut TxContext,
    ) {
        while (mission::has_more_bundles(m)) {
            let mut bundle = mission::pop_reward_bundle(m);
            while (!vector::is_empty(&bundle)) {
                let item = vector::pop_back(&mut bundle);
                storage_unit::deposit_to_owned<BazarAuth>(ssu, character, item, bazar::new_bazar_auth(), ctx);
            };
            vector::destroy_empty(bundle);
        };
    }

    public(package) fun drain_remaining_bundles_to_main(
        m: &mut MissionShop, ssu: &mut StorageUnit, character: &Character,
        cap: &OwnerCap<StorageUnit>, ctx: &mut TxContext,
    ) {
        while (mission::has_more_bundles(m)) {
            let mut bundle = mission::pop_reward_bundle(m);
            while (!vector::is_empty(&bundle)) {
                let item = vector::pop_back(&mut bundle);
                storage_unit::deposit_by_owner<StorageUnit>(ssu, item, character, cap, ctx);
            };
            vector::destroy_empty(bundle);
        };
    }

    public(package) fun collect_proofs_to_main(
        m: &mut MissionShop, ssu: &mut StorageUnit, giver_character: &Character,
        cap: &OwnerCap<StorageUnit>, ctx: &mut TxContext,
    ): u64 {
        let mut collected = 0u64;
        while (mission::has_pending_proof(m)) {
            let mut items = mission::pop_proof_escrow(m);
            while (!vector::is_empty(&items)) {
                let item = vector::pop_back(&mut items);
                storage_unit::deposit_by_owner<StorageUnit>(ssu, item, giver_character, cap, ctx);
            };
            vector::destroy_empty(items);
            collected = collected + 1;
        };
        collected
    }

    /// Finalize a cancel with EVE: split remaining EVE (done by caller before this),
    /// mark inactive + settled, emit MissionClosedEvent.
    public(package) fun finalize_cancel(
        registry: &mut MissionRegistry, mission_id: ID, owner: address, now: u64,
    ) {
        let (eve_amt, ssu_id, tribe_id, bt, refunded_bundles) = {
            let m = mission::borrow_mission(registry, mission_id);
            (
                mission::mission_eve_balance(m),
                mission::mission_ssu(m),
                mission::mission_tribe_id(m),
                mission::mission_bazaar_type(m),
                mission::mission_bundles_remaining(m),
            )
        };
        // GAS-14: same net state as deactivate_internal + set_settled_internal,
        // no intervening reader — merged into one &mut DOF cycle.
        mission::deactivate_and_settle_internal(registry, mission_id);
        mission::emit_mission_closed(mission_id, owner, ssu_id, tribe_id, bt, 0, eve_amt, refunded_bundles, now);
    }

    /// Finalize an Advanced cancel (no EVE): mark inactive + settled, emit.
    /// Called by advance_cancel_advanced after bundles already drained. (CC-M13)
    public(package) fun finalize_cancel_no_eve(
        registry: &mut MissionRegistry, mission_id: ID, owner: address, now: u64,
    ) {
        let (ssu_id, tribe_id, bt) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_ssu(m), mission::mission_tribe_id(m), mission::mission_bazaar_type(m))
        };
        // GAS-14: same as finalize_cancel.
        mission::deactivate_and_settle_internal(registry, mission_id);
        mission::emit_mission_closed(mission_id, owner, ssu_id, tribe_id, bt, 0, 0, 0, now);
    }

    public(package) fun split_all_eve(m: &mut MissionShop, ctx: &mut TxContext): Coin<EVE> {
        let amt = mission::mission_eve_balance(m);
        coin::from_balance(mission::take_eve_balance(m, amt), ctx)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
