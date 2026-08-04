// bazaar_mission | Paginated permissionless EVE mission collateral refund and reward-close prune for depreciated dead SSUs
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V41 SSU depreciation / dead-bazaar prune -- Phase 3 "mission prune" (EVE side) of Phase B
// (Documentation/plans/implementation/ssu-depreciation-prune-plan.md §2.4). Gated ONLY on the
// ssu_governance::is_depreciated(gov) certificate set by bazaar_core::ssu_depreciation (Phase A,
// already applied) -- this module NEVER reads world::location.
//
// Three entries per mission. Entries 1-2 run in STRICT ORDER (CR-DEP-06 -- see report §6 for the
// full FE sequencing note); entry 3 is ORDER-INDEPENDENT (CR-P3-01/P3b) and may run before or
// after either of the other two:
//   1. prune_depreciated_mission_collateral_page (EVE only, bt 0/1) -- runs FIRST. Advanced (bt==2)
//      token collateral is a SEPARATE pool in bazaar_economy (P4, out of scope here); calling this
//      entry against an Advanced mission with posted collateral is gated off (E_INVALID_BAZAAR_TYPE,
//      mirroring mission_admin_drain.move:58) rather than left to abort deep inside the wrong pool's
//      E_COLLATERAL_NOT_FOUND.
//   2. prune_depreciated_mission_reward -- runs SECOND, ONLY once runs_in_progress==0 (C-4, mirrors
//      mission_admin_drain.move:102). Handles ALL bazaar types (unlike mission_admin_drain's bt!=2
//      gate): Advanced missions always carry reward_eve==0 (built with balance::zero() at
//      mission.move:460), so the `eve_bal > 0` guard alone yields a correct zero-refund
//      deactivate-and-settle for them -- no bt branch needed.
//   3. prune_depreciated_mission_items_page -- items recovery (ALL bazaar types; NO settled/active
//      gate). Drains RewardBundleKey/ProofEscrowKey dynamic fields (mission.move:147-148) to
//      mission.owner (the giver), paginated by DF-pop count (a bundle's inner item count is
//      create-time-bounded by the giver's own composition, the same acceptance every existing
//      drain loop already makes). Deliberately decoupled from entries 1-2 (see the resolved
//      comment below and CR-P3-01/report §6.3): items are DFs on THIS module's own surviving
//      MissionShop, not the destroyed world StorageUnit, so their recovery never depends on
//      runs_in_progress or is_settled.
//
// No StorageUnit, no Character: the world assembly and its inventories are already destroyed by
// unanchor. reward_eve is a Balance<EVE> field DIRECTLY on MissionShop (not in the StorageUnit) --
// refunded via mission_escrow::split_all_eve + transfer::public_transfer to the mission OWNER (the
// giver), never deposit_to_owned (no StorageUnit survives to write a locker into). Reward-bundle
// and proof-escrow Items are handled the same way by entry 3: plain transfer::public_transfer, no
// StorageUnit/Character/OwnerCap needed (world::inventory::Item has key+store).
//
// RESOLVED (CR-P3-01, was OPEN ITEM OI-4 in this module's original header): reward_items /
// proof-escrow items (RewardBundleKey / ProofEscrowKey dynamic fields on MissionShop.id,
// mission.move:147-148) are NOT inside the destroyed world StorageUnit -- they are DFs on OUR OWN
// surviving MissionShop object and remain fully reachable Move values after depreciation. Entry 3
// (prune_depreciated_mission_items_page) drains them to mission.owner. The plan's §3 disposition
// row ("UNRECOVERABLE (world-destroyed)" for mission items) was WRONG for this item class
// specifically (as opposed to WTS/DE/FREE Open-Storage stock, which genuinely lives inside the
// destroyed StorageUnit) -- plan-text correction owed separately (architect, P6 batch), not made
// here.
//
// Permissionless + paginated + idempotent, mirroring mission_admin_drain's twin entries (with the
// DAppOwnerCap swapped for the is_depreciated certificate) -- caller composes a bounded page/single
// mission_id for ONE depreciated SSU; per-row/per-call pre-skip on already-settled/absent state (no
// abort); a full re-run after completion is a clean no-op (plan §4 idempotency semantics).
module bazaar_mission::ssu_depreciation_missions {
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::transfer;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_mission::mission::{Self, MissionRegistry};
    use bazaar_mission::mission_escrow;
    use bazaar_mission::mission_collateral_pool::{Self, MissionCollateralPool};

    // ===== Error Codes (module-scoped; fresh module, no collision) =====

    const E_NOT_DEPRECIATED: u64 = 1;
    const E_MISSION_WRONG_SSU: u64 = 2;
    const E_PAGINATION_ZERO: u64 = 3;
    const E_BATCH_TOO_LARGE: u64 = 4;
    /// Not in the plan's original §2.4 4-code list -- added mirroring
    /// mission_admin_drain::admin_force_settle_acceptances's bt!=2 gate
    /// (mission_admin_drain.move:58). This pool is EVE-only (bt 0/1); Advanced token
    /// collateral lives in bazaar_economy's MissionCollateralTokenPool (P4). Without
    /// this gate, a caller passing an Advanced mission_id with real posted collateral
    /// would abort deep inside take_full with the WRONG module's E_COLLATERAL_NOT_FOUND
    /// instead of a clear, local, diagnosable code. Flagged for critic sign-off (report §7 OI-1).
    const E_INVALID_BAZAAR_TYPE: u64 = 5;
    /// Not in the plan's original §2.4 4-code list -- C-4 anti-stranding, mirrors
    /// mission_admin_drain.move:102. Forces the documented per-mission ordering:
    /// collateral pages (this module's own EVE page for bt 0/1, or bazaar_economy's
    /// P4 token twin for bt==2) MUST fully drain runs_in_progress to 0 before a
    /// mission can be closed here. Flagged for critic sign-off (report §7 OI-2).
    const E_RUNS_STILL_IN_PROGRESS: u64 = 6;

    // Matches the MAX_BATCH_ROWS precedent (bazar_admin_drain / wtb_escrow_pool / P2).
    const MAX_BATCH_ROWS: u64 = 100;

    // ===== Events =====

    /// Emitted exactly once per mission, on the transaction that flips it from
    /// is_active=true to is_active=false + is_settled=true. Never re-emitted (idempotent
    /// no-op on re-run once settled -- report §5).
    public struct DepreciatedMissionPrunedEvent has copy, drop {
        ssu_id: address,
        mission_id: ID,
        owner: address,
        tribe_id: u64,
        bazaar_type: u8,
        reward_eve_refunded: u64,
        timestamp_ms: u64,
    }

    /// Per-taker-row -- emitted ONLY when a collateral refund is actually transferred
    /// (existed && coll > 0). Never emitted for a skip.
    public struct DepreciatedCollateralRefundedEvent has copy, drop {
        ssu_id: address,
        mission_id: ID,
        tribe_id: u64,
        taker: address,
        amount: u64,
        timestamp_ms: u64,
    }

    /// CR-P3-01/P3b items-recovery event. Emitted ONLY when total pops > 0
    /// (reward_bundles_popped + proof_stashes_popped). A zero-item / already-exhausted call
    /// mutates nothing and emits nothing (CR-DEP-04 discipline).
    public struct DepreciatedMissionItemsRecoveredEvent has copy, drop {
        ssu_id: address,
        mission_id: ID,
        owner: address,
        reward_bundles_popped: u64,
        proof_stashes_popped: u64,
        timestamp_ms: u64,
    }

    // ===== Entry 1: collateral page (EVE only, bt 0/1) -- runs FIRST per mission =====

    /// Prune one caller-composed page of takers' EVE collateral for a mission on a
    /// depreciated SSU. Per taker: remove the acceptance (existence-guarded, idempotent --
    /// CR-DEP-04, mirrors mission_admin_drain.move:64-77 exactly) and, only when collateral
    /// was actually posted, refund it 100% to the taker. MUST be paged to completion for a
    /// mission before prune_depreciated_mission_reward can close it (that entry's C-4
    /// runs_in_progress==0 assert enforces this ordering -- it is not merely documentation).
    public entry fun prune_depreciated_mission_collateral_page(
        registry: &mut MissionRegistry,
        gov: &SSUGovernance,
        mission_id: ID,
        pool: &mut MissionCollateralPool,
        takers: vector<address>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n = vector::length(&takers);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        assert!(ssu_governance::is_depreciated(gov), E_NOT_DEPRECIATED);
        let gov_ssu_id = ssu_governance::ssu_id(gov);

        let (mission_ssu_id, tribe_id, bt) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_ssu(m), mission::mission_tribe_id(m), mission::mission_bazaar_type(m))
        };
        assert!(mission_ssu_id == gov_ssu_id, E_MISSION_WRONG_SSU);
        assert!(bt != 2, E_INVALID_BAZAAR_TYPE);

        // CR-DEP-08 pool anchor: before any refund row. Existing primitive, own abort code.
        mission_collateral_pool::assert_pool_for_ssu(pool, gov_ssu_id);

        let mission_addr = object::id_to_address(&mission_id);
        let ts = clock::timestamp_ms(clock);

        let mut i: u64 = 0;
        while (i < n) {
            let taker = *vector::borrow(&takers, i);
            // CR-DEP-04: existence-guarded, idempotent -- admin_remove_acceptance never
            // aborts on an absent taker (mirrors mission_admin_drain.move:66-69).
            let (existed, coll) = {
                let m = mission::borrow_mission_mut_pkg(registry, mission_id);
                mission::admin_remove_acceptance(m, taker)
            };
            if (existed && coll > 0) {
                let refund = mission_collateral_pool::take_full(pool, mission_addr, taker, 0, ctx);
                transfer::public_transfer(refund, taker);
                event::emit(DepreciatedCollateralRefundedEvent {
                    ssu_id: gov_ssu_id, mission_id, tribe_id, taker, amount: coll, timestamp_ms: ts,
                });
            };
            i = i + 1;
        };
    }

    // ===== Entry 2: reward + close (ALL bazaar types) -- runs SECOND per mission =====

    /// Close a mission on a depreciated SSU: refund any remaining reward EVE to the mission
    /// owner (the giver), then deactivate + settle. Idempotent no-op if already settled.
    /// Requires runs_in_progress == 0 (C-4) -- the collateral page above (bt 0/1) or
    /// bazaar_economy's P4 token twin (bt==2) must fully drain acceptances first. Handles
    /// ALL bazaar types (CR-DEP-06): Advanced missions always carry reward_eve == 0
    /// (mission.move:460 builds with balance::zero()), so the `eve_bal > 0` guard alone
    /// yields a correct zero-refund close for them -- no bt branch needed.
    public entry fun prune_depreciated_mission_reward(
        registry: &mut MissionRegistry,
        gov: &SSUGovernance,
        mission_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(ssu_governance::is_depreciated(gov), E_NOT_DEPRECIATED);
        let gov_ssu_id = ssu_governance::ssu_id(gov);

        let (mission_ssu_id, tribe_id, settled, runs_ip, owner, bt, eve_bal) = {
            let m = mission::borrow_mission(registry, mission_id);
            (
                mission::mission_ssu(m),
                mission::mission_tribe_id(m),
                mission::mission_is_settled(m),
                mission::mission_runs_in_progress_count(m),
                mission::mission_owner(m),
                mission::mission_bazaar_type(m),
                mission::mission_eve_balance(m),
            )
        };
        assert!(mission_ssu_id == gov_ssu_id, E_MISSION_WRONG_SSU);
        if (settled) { return }; // idempotent no-op -- already pruned/closed

        // C-4 anti-stranding (mirrors mission_admin_drain.move:102).
        assert!(runs_ip == 0, E_RUNS_STILL_IN_PROGRESS);

        if (eve_bal > 0) {
            let coin = {
                let m = mission::borrow_mission_mut_pkg(registry, mission_id);
                mission_escrow::split_all_eve(m, ctx)
            };
            transfer::public_transfer(coin, owner);
        };

        // mission.move's deactivate_and_settle already removes the missions_by_ssu
        // MissionPosition index entry internally (mission.move:826-847) -- not duplicated here.
        mission::deactivate_and_settle_internal(registry, mission_id);

        event::emit(DepreciatedMissionPrunedEvent {
            ssu_id: gov_ssu_id,
            mission_id,
            owner,
            tribe_id,
            bazaar_type: bt,
            reward_eve_refunded: eve_bal,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Entry 3: items recovery (ALL bazaar types, ORDER-INDEPENDENT) -- CR-P3-01/P3b =====

    /// Recover leftover mission reward-bundle / proof-escrow items on a depreciated SSU to the
    /// mission owner (the giver). Paginated by DF-pop count (NOT by inner item count -- a bundle's
    /// own item count is create-time-bounded by the giver's composition, the same acceptance every
    /// existing drain loop in mission_escrow.move already makes). NO bazaar-type gate (Advanced
    /// missions also escrow reward bundles, mission.move:472). NO settled/is_active gate --
    /// callable BEFORE or AFTER prune_depreciated_mission_reward; items stay recoverable either way
    /// since nothing ever deletes the MissionShop (plan OQ-1, flag-flip only). Idempotent: a re-run
    /// after both DF classes are exhausted pops nothing, mutates nothing, emits nothing.
    public entry fun prune_depreciated_mission_items_page(
        registry: &mut MissionRegistry,
        gov: &SSUGovernance,
        mission_id: ID,
        max_pops: u64,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(max_pops > 0, E_PAGINATION_ZERO);
        assert!(max_pops <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        assert!(ssu_governance::is_depreciated(gov), E_NOT_DEPRECIATED);
        let gov_ssu_id = ssu_governance::ssu_id(gov);

        let (mission_ssu_id, owner) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_ssu(m), mission::mission_owner(m))
        };
        assert!(mission_ssu_id == gov_ssu_id, E_MISSION_WRONG_SSU);

        let (bundles_popped, stashes_popped, pops) = {
            let m = mission::borrow_mission_mut_pkg(registry, mission_id);
            let mut pops: u64 = 0;
            let mut bundles_popped: u64 = 0;
            while (pops < max_pops && mission::has_more_bundles(m)) {
                let mut bundle = mission::pop_reward_bundle(m);
                while (!vector::is_empty(&bundle)) {
                    let item = vector::pop_back(&mut bundle);
                    transfer::public_transfer(item, owner);
                };
                vector::destroy_empty(bundle);
                bundles_popped = bundles_popped + 1;
                pops = pops + 1;
            };
            let mut stashes_popped: u64 = 0;
            while (pops < max_pops && mission::has_pending_proof(m)) {
                let mut stash = mission::pop_proof_escrow(m);
                while (!vector::is_empty(&stash)) {
                    let item = vector::pop_back(&mut stash);
                    transfer::public_transfer(item, owner);
                };
                vector::destroy_empty(stash);
                stashes_popped = stashes_popped + 1;
                pops = pops + 1;
            };
            (bundles_popped, stashes_popped, pops)
        };

        if (pops > 0) {
            event::emit(DepreciatedMissionItemsRecoveredEvent {
                ssu_id: gov_ssu_id,
                mission_id,
                owner,
                reward_bundles_popped: bundles_popped,
                proof_stashes_popped: stashes_popped,
                timestamp_ms: clock::timestamp_ms(clock),
            });
        };
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
