// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazaar_mission::mission_complete — Completion / confirm / reject / cancel state
/// machine for Mission (MIS) shops.
///
/// SA-M11 FIX: confirm_completion + advance_confirm_advanced now call
/// remove_acceptance + mark_completed on the same &mut m borrow after reward
/// payout and BEFORE finish_completion. A second confirm aborts E_NO_ACCEPTANCE.
///
/// CC-M13 FIX: advance_cancel_advanced + advance_cancel_advanced_as_ssu_owner
/// fully implemented (compile-ready). checked_mul used for token refund product.
module bazaar_mission::mission_complete {
    use sui::clock::{Self, Clock};
    use sui::coin::Coin;
    use world::storage_unit::{Self, StorageUnit};
    use world::character::{Self, Character};
    use world::inventory::{Self, Item};
    use world::access::{Self, OwnerCap};
    use EVE::EVE::EVE;
    use bazaar_mission::mission::{Self, MissionRegistry, MissionShop, ItemReq};
    use bazaar_mission::mission_complete_ctx;
    use bazaar_mission::mission_escrow;
    use bazaar_mission::mission_collateral_pool::{Self, MissionCollateralPool};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazaar_core_admin::TribeTokenShopCap;

    // Error codes (shared numbering)
    const E_NOT_MISSION_OWNER: u64 = 2;
    const E_MISSION_NOT_ACTIVE: u64 = 4;
    const E_INVALID_BAZAAR_TYPE: u64 = 5;
    const E_ACCEPTANCE_NOT_PENDING: u64 = 12;
    const E_PROOF_INSUFFICIENT: u64 = 14;
    const E_RECIPIENT_NOT_GIVER: u64 = 16;
    const E_CHARACTER_NOT_SENDER: u64 = 19;
    const E_WRONG_MODE_FOR_OP: u64 = 21;
    const E_WRONG_OWNER_CAP_FOR_SSU: u64 = 18;
    const E_ALREADY_SETTLED: u64 = 30;
    const E_WRONG_SSU: u64 = 25;
    const E_COLLATERAL_MISMATCH: u64 = 33;
    const E_RUNS_STILL_IN_PROGRESS: u64 = 38;

    // =========================================================================
    // NoTribe / Easy — item-proof complete (reward -> Player Locker)
    // =========================================================================
    public entry fun complete_mission_with_items(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        proof_items: vector<Item>,
        giver_character: &Character,
        taker_character: &Character,
        pool: &mut MissionCollateralPool,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let taker = tx_context::sender(ctx);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        // GAS-14 borrow #1 (single &): owner + mode + ssu_id + giver_is_owner + collateral_amount.
        // SA-V34-02: collateral_amount captured before the &mut that calls remove_acceptance.
        let (owner, mode, ssu_id, giver_is_owner, collateral_amount) =
            mission_complete_ctx::snapshot_completion_ctx(registry, mission_id, gov, taker);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert!(mode == mission::mode_item_proof(), E_WRONG_MODE_FOR_OP);
        assert!(character::character_address(giver_character) == owner, E_RECIPIENT_NOT_GIVER);
        assert!(character::character_address(taker_character) == taker, E_CHARACTER_NOT_SENDER);
        // SA-V34-06: pool anchor (defense-in-depth)
        mission_collateral_pool::assert_pool_for_ssu(pool, ssu_id);
        // GAS-14 borrow #2 (&mut): pay_eve_reward now INSIDE item_complete_core.
        item_complete_core(registry, mission_id, ssu, proof_items, giver_character, taker_character,
            giver_is_owner, taker, now, false, ctx);
        // Refund collateral 100% to taker
        if (collateral_amount > 0) {
            let mission_addr = object::id_to_address(&mission_id);
            let refund = mission_collateral_pool::take_full(pool, mission_addr, taker, 0, ctx);
            transfer::public_transfer(refund, taker);
            mission::emit_collateral_refunded(mission_id, taker, collateral_amount, 0, 0, now);
        };
        finish_completion(registry, mission_id, now);
    }

    // =========================================================================
    // NoTribe / Easy — item-proof complete, taker IS ssu owner (reward -> Main)
    // =========================================================================
    public entry fun complete_mission_with_items_as_ssu_owner(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        proof_items: vector<Item>,
        giver_character: &Character,
        taker_character: &Character,
        taker_owner_cap: &OwnerCap<StorageUnit>,
        pool: &mut MissionCollateralPool,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let taker = tx_context::sender(ctx);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        // GAS-14 borrow #1 (single &): same pattern as Path A.
        let (owner, mode, ssu_id, giver_is_owner, collateral_amount) =
            mission_complete_ctx::snapshot_completion_ctx(registry, mission_id, gov, taker);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert!(mode == mission::mode_item_proof(), E_WRONG_MODE_FOR_OP);
        assert!(character::character_address(giver_character) == owner, E_RECIPIENT_NOT_GIVER);
        assert!(character::character_address(taker_character) == taker, E_CHARACTER_NOT_SENDER);
        assert!(access::is_authorized(taker_owner_cap, object::id(ssu)), E_WRONG_OWNER_CAP_FOR_SSU);
        // SA-V34-06: pool anchor (defense-in-depth)
        mission_collateral_pool::assert_pool_for_ssu(pool, ssu_id);
        // GAS-14 borrow #2 (&mut): pay_eve_reward now INSIDE item_complete_core_main.
        item_complete_core_main(registry, mission_id, ssu, proof_items, giver_character, taker_character,
            taker_owner_cap, giver_is_owner, taker, now, ctx);
        // Refund collateral 100% to taker
        if (collateral_amount > 0) {
            let mission_addr = object::id_to_address(&mission_id);
            let refund = mission_collateral_pool::take_full(pool, mission_addr, taker, 0, ctx);
            transfer::public_transfer(refund, taker);
            mission::emit_collateral_refunded(mission_id, taker, collateral_amount, 0, 0, now);
        };
        finish_completion(registry, mission_id, now);
    }

    // =========================================================================
    // Other-mode submit -> PENDING (no reward yet)
    // =========================================================================
    public entry fun complete_mission_other(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let taker = tx_context::sender(ctx);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        let (mode, ssu_id) = read_mode_ssu(registry, mission_id);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert!(mode == mission::mode_other(), E_WRONG_MODE_FOR_OP);
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        assert!(mission::mission_is_active(m), E_MISSION_NOT_ACTIVE);
        mission::assert_active_acceptance(m, taker);
        mission::set_acceptance_pending(m, taker);
        mission::emit_submitted(mission_id, taker, mode, now);
    }

    // =========================================================================
    // Other-mode confirm — giver (reward -> taker Player Locker + EVE -> taker)
    // SA-M11: remove_acceptance + mark_completed added after payout.
    // =========================================================================
    public entry fun confirm_completion(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        taker: address, ssu: &mut StorageUnit, taker_character: &Character,
        pool: &mut MissionCollateralPool,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        // GAS-14 borrow #1 (single &): owner/ssu_id/collateral + settled/pending checks.
        // Replaces read_owner_ssu + assert_pending_unsettled + acceptance_collateral_of.
        let (owner, ssu_id, collateral_amount) = mission_complete_ctx::snapshot_confirm_ctx(
            registry, mission_id, taker, E_ALREADY_SETTLED, E_ACCEPTANCE_NOT_PENDING,
        );
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert!(owner == tx_context::sender(ctx), E_NOT_MISSION_OWNER);
        assert!(character::character_address(taker_character) == taker, E_CHARACTER_NOT_SENDER);
        // SA-V34-06
        mission_collateral_pool::assert_pool_for_ssu(pool, ssu_id);
        // GAS-14 borrow #2 (single &mut): items + EVE + remove_acceptance + mark_completed.
        // SA-M11: double confirm aborts at remove_acceptance (E_NO_ACCEPTANCE = 10).
        {
            let m = mission::borrow_mission_mut_pkg(registry, mission_id);
            pay_item_reward_to_locker(m, ssu, taker_character, ctx);
            mission::pay_eve_reward(m, taker, ctx);
            let _ = mission::remove_acceptance(m, taker);
            mission::mark_completed(m, taker, mission_id, now);
        };
        // Refund collateral 100% to taker
        if (collateral_amount > 0) {
            let mission_addr = object::id_to_address(&mission_id);
            let refund = mission_collateral_pool::take_full(pool, mission_addr, taker, 0, ctx);
            transfer::public_transfer(refund, taker);
            mission::emit_collateral_refunded(mission_id, taker, collateral_amount, 0, 0, now);
        };
        // m goes out of scope here; finish_completion re-borrows registry
        finish_completion(registry, mission_id, now);
    }

    // =========================================================================
    // Other-mode reject — giver (frees run, reward stays escrowed)
    // =========================================================================
    public entry fun reject_completion(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        taker: address,
        pool: &mut MissionCollateralPool,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        let (owner, ssu_id) = read_owner_ssu(registry, mission_id);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert!(owner == tx_context::sender(ctx), E_NOT_MISSION_OWNER);
        let status = { let m = mission::borrow_mission(registry, mission_id); mission::acceptance_status_of(m, taker) };
        assert!(status == mission::status_pending(), E_ACCEPTANCE_NOT_PENDING);
        // SA-V34-06
        mission_collateral_pool::assert_pool_for_ssu(pool, ssu_id);
        // SA-V34-02: capture BEFORE remove_acceptance
        let collateral_amount = mission::acceptance_collateral_of(
            mission::borrow_mission(registry, mission_id), taker
        );
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        let _ = mission::remove_acceptance(m, taker);
        mission::emit_rejected(mission_id, taker, owner, now);
        // SA-V34-09: taker did the work; giver declined → refund 100% to taker.
        if (collateral_amount > 0) {
            let mission_addr = object::id_to_address(&mission_id);
            let refund = mission_collateral_pool::take_full(pool, mission_addr, taker, 1, ctx);
            transfer::public_transfer(refund, taker);
            mission::emit_collateral_refunded(mission_id, taker, collateral_amount, 0, 1, now);
        };
    }

    // =========================================================================
    // ADVANCED advance fns (public, TribeTokenShopCap-gated)
    // Each returns (per_run_token, taker, mission_addr).
    // =========================================================================

    public fun advance_item_completion_advanced(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        proof_items: vector<Item>,
        giver_character: &Character,
        _cap: &TribeTokenShopCap,
        clock: &Clock, ctx: &mut TxContext,
    ): (u64, address, address, u64) {
        let now = clock::timestamp_ms(clock);
        let taker = tx_context::sender(ctx);
        // GAS-14 borrow #1: assert_advanced_ctx retains its own & borrow (3-arg, no tribe_gov).
        assert_advanced_ctx(registry, mission_id, gov);
        // GAS-14 borrow #2 (single &): replaces read_complete_ctx + acceptance_collateral_of
        // + post-core re-borrow (#5). Captures per_run + addr to eliminate the re-borrow.
        let (owner, mode, _ssu_id, giver_is_owner, coll_amount, per_run, addr) =
            mission_complete_ctx::snapshot_completion_ctx_advanced(registry, mission_id, gov, taker);
        assert!(mode == mission::mode_item_proof(), E_WRONG_MODE_FOR_OP);
        assert!(character::character_address(giver_character) == owner, E_RECIPIENT_NOT_GIVER);
        // GAS-14 borrow #3 (&mut): pay_eve_reward now INSIDE item_complete_core.
        // Use giver_character as taker_character placeholder (locker path; taker signs)
        item_complete_core(registry, mission_id, ssu, proof_items, giver_character, giver_character,
            giver_is_owner, taker, now, true, ctx);
        // GAS-14: post-core re-borrow ELIMINATED — per_run + addr already in snapshot.
        finish_completion(registry, mission_id, now);
        (per_run, taker, addr, coll_amount)
    }

    public fun advance_item_completion_advanced_as_ssu_owner(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        proof_items: vector<Item>,
        giver_character: &Character,
        taker_character: &Character,
        taker_owner_cap: &OwnerCap<StorageUnit>,
        _cap: &TribeTokenShopCap,
        clock: &Clock, ctx: &mut TxContext,
    ): (u64, address, address, u64) {
        let now = clock::timestamp_ms(clock);
        let taker = tx_context::sender(ctx);
        // GAS-14 borrow #1: assert_advanced_ctx retains its own & borrow (3-arg).
        assert_advanced_ctx(registry, mission_id, gov);
        // GAS-14 borrow #2 (single &): replaces read_complete_ctx + acceptance_collateral_of
        // + post-core re-borrow. Captures per_run + addr to eliminate the re-borrow.
        let (owner, mode, _ssu_id, giver_is_owner, coll_amount, per_run, addr) =
            mission_complete_ctx::snapshot_completion_ctx_advanced(registry, mission_id, gov, taker);
        assert!(mode == mission::mode_item_proof(), E_WRONG_MODE_FOR_OP);
        assert!(character::character_address(giver_character) == owner, E_RECIPIENT_NOT_GIVER);
        assert!(character::character_address(taker_character) == taker, E_CHARACTER_NOT_SENDER);
        assert!(access::is_authorized(taker_owner_cap, object::id(ssu)), E_WRONG_OWNER_CAP_FOR_SSU);
        // GAS-14 borrow #3 (&mut): pay_eve_reward now INSIDE item_complete_core_main.
        item_complete_core_main(registry, mission_id, ssu, proof_items, giver_character, taker_character,
            taker_owner_cap, giver_is_owner, taker, now, ctx);
        // GAS-14: post-core re-borrow ELIMINATED.
        finish_completion(registry, mission_id, now);
        (per_run, taker, addr, coll_amount)
    }

    public fun advance_submit_other_advanced(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        _cap: &TribeTokenShopCap, clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let taker = tx_context::sender(ctx);
        assert_advanced_ctx(registry, mission_id, gov);
        let (mode, _ssu_id) = read_mode_ssu(registry, mission_id);
        assert!(mode == mission::mode_other(), E_WRONG_MODE_FOR_OP);
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        assert!(mission::mission_is_active(m), E_MISSION_NOT_ACTIVE);
        mission::assert_active_acceptance(m, taker);
        mission::set_acceptance_pending(m, taker);
        mission::emit_submitted(mission_id, taker, mode, now);
    }

    /// Other-mode confirm (Advanced). SA-M11: remove_acceptance + mark_completed
    /// added after payout. Returns (per_run_token, taker, mission_addr, collateral_amount).
    public fun advance_confirm_advanced(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        taker: address, ssu: &mut StorageUnit, taker_character: &Character,
        _cap: &TribeTokenShopCap, clock: &Clock, ctx: &mut TxContext,
    ): (u64, address, address, u64) {
        let now = clock::timestamp_ms(clock);
        // GAS-14 borrow #1: assert_advanced_ctx retains its own & borrow (3-arg, no tribe_gov).
        assert_advanced_ctx(registry, mission_id, gov);
        // GAS-14 borrow #2 (single &): replaces read_owner_ssu + assert_pending_unsettled
        // + acceptance_collateral_of + post-&mut re-read (borrows #2-4 and #6).
        let (owner, _ssu_id, coll_amount, per_run, addr) =
            mission_complete_ctx::snapshot_confirm_ctx_advanced(
                registry, mission_id, taker, E_ALREADY_SETTLED, E_ACCEPTANCE_NOT_PENDING,
            );
        assert!(owner == tx_context::sender(ctx), E_NOT_MISSION_OWNER);
        assert!(character::character_address(taker_character) == taker, E_CHARACTER_NOT_SENDER);
        // GAS-14 borrow #3 (&mut): item reward + EVE reward (additive — see §8.2) +
        // remove_acceptance + mark_completed.
        // SA-M11: second confirm aborts at remove_acceptance (E_NO_ACCEPTANCE = 10).
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        pay_item_reward_to_locker(m, ssu, taker_character, ctx);
        // GAS-14: pay_eve_reward added (additive correction — Advanced reward_eve_per_run=0, no-op).
        mission::pay_eve_reward(m, taker, ctx);
        let _ = mission::remove_acceptance(m, taker);
        mission::mark_completed(m, taker, mission_id, now);
        // GAS-14: post-&mut re-borrow ELIMINATED — per_run + addr already in snapshot.
        finish_completion(registry, mission_id, now);
        (per_run, taker, addr, coll_amount)
    }

    /// SA-V34-09: also return collateral_amount for the ledger_ops caller.
    public fun advance_reject_advanced(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        taker: address, _cap: &TribeTokenShopCap, clock: &Clock, ctx: &mut TxContext,
    ): u64 {
        let now = clock::timestamp_ms(clock);
        assert_advanced_ctx(registry, mission_id, gov);
        let (owner, _ssu_id) = read_owner_ssu(registry, mission_id);
        assert!(owner == tx_context::sender(ctx), E_NOT_MISSION_OWNER);
        let status = { let m = mission::borrow_mission(registry, mission_id); mission::acceptance_status_of(m, taker) };
        assert!(status == mission::status_pending(), E_ACCEPTANCE_NOT_PENDING);
        // SA-V34-02: capture BEFORE remove_acceptance
        let coll_amount = mission::acceptance_collateral_of(
            mission::borrow_mission(registry, mission_id), taker
        );
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        let _ = mission::remove_acceptance(m, taker);
        mission::emit_rejected(mission_id, taker, owner, now);
        coll_amount
    }

    /// Advanced cancel — Player Locker bundle refund + token-refund handoff.
    /// CC-M13: full compile-ready implementation.
    /// CC-M14: checked_mul for token refund product.
    /// SA-M09: finalize_cancel_no_eve sets is_settled=true → second call aborts E_ALREADY_SETTLED.
    public fun advance_cancel_advanced(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit, owner_character: &Character,
        _cap: &TribeTokenShopCap, clock: &Clock, ctx: &mut TxContext,
    ): (u64, address, address) {
        let now = clock::timestamp_ms(clock);
        assert_advanced_ctx(registry, mission_id, gov);
        let ssu_id_m = { mission::mission_ssu(mission::borrow_mission(registry, mission_id)) };
        ssu_governance::assert_subject_in_governance(gov, ssu_id_m);
        // assert_cancellable checks owner==sender + !is_settled
        let owner = { mission_escrow::assert_cancellable(mission::borrow_mission(registry, mission_id), ctx) };
        let (per_run, runs_done, max_runs, addr) = {
            let m = mission::borrow_mission(registry, mission_id);
            (
                mission::mission_reward_token_per_run(m),
                mission::mission_runs_completed(m),
                mission::mission_max_runs(m),
                mission::mission_addr(m),
            )
        };
        {
            let m = mission::borrow_mission_mut_pkg(registry, mission_id);
            mission_escrow::drain_remaining_bundles_to_locker(m, ssu, owner_character, ctx);
        };
        // sets is_active=false + is_settled=true + emits MissionClosedEvent
        mission_escrow::finalize_cancel_no_eve(registry, mission_id, owner, now);
        let refund = mission::checked_mul(max_runs - runs_done, per_run);  // CC-M14
        (refund, owner, addr)
    }

    /// Advanced cancel, owner == ssu owner — items to Main Storage.
    public fun advance_cancel_advanced_as_ssu_owner(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit, owner_character: &Character,
        ssu_owner_cap: &OwnerCap<StorageUnit>,
        _cap: &TribeTokenShopCap, clock: &Clock, ctx: &mut TxContext,
    ): (u64, address, address) {
        let now = clock::timestamp_ms(clock);
        assert_advanced_ctx(registry, mission_id, gov);
        let ssu_id_m = { mission::mission_ssu(mission::borrow_mission(registry, mission_id)) };
        ssu_governance::assert_subject_in_governance(gov, ssu_id_m);
        assert!(access::is_authorized(ssu_owner_cap, object::id(ssu)), E_WRONG_OWNER_CAP_FOR_SSU);
        assert!(character::character_address(owner_character) == tx_context::sender(ctx), E_CHARACTER_NOT_SENDER);
        let owner = { mission_escrow::assert_cancellable(mission::borrow_mission(registry, mission_id), ctx) };
        let (per_run, runs_done, max_runs, addr) = {
            let m = mission::borrow_mission(registry, mission_id);
            (
                mission::mission_reward_token_per_run(m),
                mission::mission_runs_completed(m),
                mission::mission_max_runs(m),
                mission::mission_addr(m),
            )
        };
        {
            let m = mission::borrow_mission_mut_pkg(registry, mission_id);
            mission_escrow::drain_remaining_bundles_to_main(m, ssu, owner_character, ssu_owner_cap, ctx);
        };
        mission_escrow::finalize_cancel_no_eve(registry, mission_id, owner, now);
        let refund = mission::checked_mul(max_runs - runs_done, per_run);  // CC-M14
        (refund, owner, addr)
    }

    /// Ceremony admin cancel (Advanced) — no owner==sender check (admin is sender).
    /// C-2/SEC-B2: pins giver_character to mission.owner; C-4: requires !is_settled
    /// AND runs_in_progress == 0 (settle all acceptances first). Drains remaining
    /// reward bundles to the giver's Player Locker, finalizes, returns
    /// (token_refund, giver, mission_addr) for the bazaar_economy ledger caller.
    public fun advance_admin_cancel(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit, giver_character: &Character,
        _cap: &TribeTokenShopCap, clock: &Clock, ctx: &mut TxContext,
    ): (u64, address, address) {
        let now = clock::timestamp_ms(clock);
        assert_advanced_ctx(registry, mission_id, gov);
        let (owner, per_run, runs_done, max_runs, addr, runs_ip, settled) = {
            let m = mission::borrow_mission(registry, mission_id);
            (
                mission::mission_owner(m),
                mission::mission_reward_token_per_run(m),
                mission::mission_runs_completed(m),
                mission::mission_max_runs(m),
                mission::mission_addr(m),
                mission::mission_runs_in_progress_count(m),
                mission::mission_is_settled(m),
            )
        };
        assert!(!settled, E_ALREADY_SETTLED);
        assert!(runs_ip == 0, E_RUNS_STILL_IN_PROGRESS);
        assert!(character::character_address(giver_character) == owner, E_RECIPIENT_NOT_GIVER);
        {
            let m = mission::borrow_mission_mut_pkg(registry, mission_id);
            mission_escrow::drain_remaining_bundles_to_locker(m, ssu, giver_character, ctx);
        };
        mission_escrow::finalize_cancel_no_eve(registry, mission_id, owner, now);
        let refund = mission::checked_mul(max_runs - runs_done, per_run);
        (refund, owner, addr)
    }

    // ===== Internal read-blocks =====
    // read_complete_ctx: retired (GAS-14) — zero callers after Paths A/B migrated to
    // snapshot_completion_ctx and Paths D/E migrated to snapshot_completion_ctx_advanced.
    // read_owner_ssu and read_mode_ssu are KEPT — live out-of-scope callers remain.
    fun read_mode_ssu(registry: &MissionRegistry, mission_id: ID): (u8, address) {
        let m = mission::borrow_mission(registry, mission_id);
        (mission::mission_completion_mode(m), mission::mission_ssu(m))
    }
    fun read_owner_ssu(registry: &MissionRegistry, mission_id: ID): (address, address) {
        let m = mission::borrow_mission(registry, mission_id);
        (mission::mission_owner(m), mission::mission_ssu(m))
    }

    fun assert_advanced_ctx(registry: &MissionRegistry, mission_id: ID, gov: &SSUGovernance) {
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        let (bt, mssu, mtribe) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_bazaar_type(m), mission::mission_ssu(m), mission::mission_tribe_id(m))
        };
        assert!(bt == 2, E_INVALID_BAZAAR_TYPE);
        ssu_governance::assert_subject_in_governance(gov, mssu);
        assert!(mssu == ssu_governance::ssu_id(gov), E_WRONG_SSU);
        assert!(mtribe == ssu_governance::ssu_tribe_id(gov), E_WRONG_SSU);
    }

    // ===== Completion cores =====
    // GAS-14 guardrail order: (1)assert_active -> (2)assert_active_acceptance
    // -> (3)proof -> (4)item_reward -> (5)EVE_reward -> (6)remove_acceptance
    // -> (7)mark_completed.
    // SA-V34-02: callers MUST capture collateral_amount via snapshot BEFORE calling this fn.
    fun item_complete_core(
        registry: &mut MissionRegistry, mission_id: ID, ssu: &mut StorageUnit,
        proof_items: vector<Item>, giver_character: &Character, taker_character: &Character,
        giver_is_owner: bool, taker: address, now: u64, _advanced: bool, ctx: &mut TxContext,
    ) {
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        assert!(mission::mission_is_active(m), E_MISSION_NOT_ACTIVE);
        mission::assert_active_acceptance(m, taker);
        assert_proof_ok(mission::mission_proof_items(m), &proof_items);
        route_proof(m, ssu, giver_character, proof_items, giver_is_owner, mission_id, taker, now, ctx);
        pay_item_reward_to_locker(m, ssu, taker_character, ctx);
        // GAS-14: EVE reward folded in — same &mut scope, no extra DOF cycle.
        mission::pay_eve_reward(m, taker, ctx);
        let _ = mission::remove_acceptance(m, taker);  // SA-V34-02: callers capture collateral before calling this
        mission::mark_completed(m, taker, mission_id, now);
    }

    // GAS-14: same fold as item_complete_core.
    // SA-V34-02: callers MUST capture collateral_amount via snapshot BEFORE calling this fn.
    fun item_complete_core_main(
        registry: &mut MissionRegistry, mission_id: ID, ssu: &mut StorageUnit,
        proof_items: vector<Item>, giver_character: &Character, taker_character: &Character,
        taker_owner_cap: &OwnerCap<StorageUnit>, giver_is_owner: bool,
        taker: address, now: u64, ctx: &mut TxContext,
    ) {
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        assert!(mission::mission_is_active(m), E_MISSION_NOT_ACTIVE);
        mission::assert_active_acceptance(m, taker);
        assert_proof_ok(mission::mission_proof_items(m), &proof_items);
        route_proof(m, ssu, giver_character, proof_items, giver_is_owner, mission_id, taker, now, ctx);
        pay_item_reward_to_main(m, ssu, taker_character, taker_owner_cap, ctx);
        // GAS-14: EVE reward folded in.
        mission::pay_eve_reward(m, taker, ctx);
        let _ = mission::remove_acceptance(m, taker);  // SA-V34-02: callers capture collateral before calling this
        mission::mark_completed(m, taker, mission_id, now);
    }

    fun finish_completion(registry: &mut MissionRegistry, mission_id: ID, now: u64) {
        mission::auto_close_if_exhausted(registry, mission_id, now);
    }

    fun route_proof(
        m: &mut MissionShop, ssu: &mut StorageUnit, giver_character: &Character,
        proof_items: vector<Item>, giver_is_owner: bool,
        mission_id: ID, taker: address, now: u64, ctx: &mut TxContext,
    ) {
        if (giver_is_owner) {
            let seq = mission::stash_proof(m, proof_items);
            mission::emit_proof_escrowed(mission_id, taker, seq, now);
        } else {
            deposit_all_to_locker(ssu, giver_character, proof_items, ctx);
        };
    }

    fun assert_proof_ok(spec: &vector<ItemReq>, items: &vector<Item>) {
        let s = vector::length(spec);
        let mut i = 0;
        while (i < s) {
            let req = vector::borrow(spec, i);
            let mut have = 0u64;
            let mut j = 0;
            let n = vector::length(items);
            while (j < n) {
                let it = vector::borrow(items, j);
                if (inventory::type_id(it) == mission::req_type_id(req)) {
                    have = have + (inventory::quantity(it) as u64);
                };
                j = j + 1;
            };
            assert!(have >= mission::req_amount(req), E_PROOF_INSUFFICIENT);
            i = i + 1;
        };
    }

    fun deposit_all_to_locker(
        ssu: &mut StorageUnit, character: &Character, mut items: vector<Item>, ctx: &mut TxContext,
    ) {
        while (!vector::is_empty(&items)) {
            let item = vector::pop_back(&mut items);
            mission::deposit_item_to_locker(ssu, character, item, ctx);
        };
        vector::destroy_empty(items);
    }

    fun pay_item_reward_to_locker(
        m: &mut MissionShop, ssu: &mut StorageUnit, taker_character: &Character, ctx: &mut TxContext,
    ) {
        if (!mission::has_reward_bundle(m)) return;
        let mut bundle = mission::pop_reward_bundle(m);
        while (!vector::is_empty(&bundle)) {
            let item = vector::pop_back(&mut bundle);
            mission::deposit_item_to_locker(ssu, taker_character, item, ctx);
        };
        vector::destroy_empty(bundle);
    }

    fun pay_item_reward_to_main(
        m: &mut MissionShop, ssu: &mut StorageUnit, taker_character: &Character,
        cap: &OwnerCap<StorageUnit>, ctx: &mut TxContext,
    ) {
        if (!mission::has_reward_bundle(m)) return;
        let mut bundle = mission::pop_reward_bundle(m);
        while (!vector::is_empty(&bundle)) {
            let item = vector::pop_back(&mut bundle);
            storage_unit::deposit_by_owner<StorageUnit>(ssu, item, taker_character, cap, ctx);
        };
        vector::destroy_empty(bundle);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
