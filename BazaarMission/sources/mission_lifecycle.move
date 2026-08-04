// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazaar_mission::mission_lifecycle — accept / expire / cancel / collect-proof.
/// CC-M15: all relay event structs removed; uses emit-wrappers in mission.move
/// so the FE sees a single unified event schema across all mission modules.
module bazaar_mission::mission_lifecycle {
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use world::storage_unit::StorageUnit;
    use world::character::{Self, Character};
    use world::access::{Self, OwnerCap};
    use EVE::EVE::EVE;
    use bazaar_mission::mission::{Self, MissionRegistry};
    use bazaar_mission::mission_escrow;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::membership::{Self, MemberRegistry};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_mission::mission_collateral_pool::{Self, MissionCollateralPool};
    use bazaar_core::bazaar_core_admin::TribeTokenShopCap;

    const E_NOT_MISSION_OWNER: u64 = 2;
    const E_WRONG_OWNER_CAP_FOR_SSU: u64 = 18;
    const E_CHARACTER_NOT_SENDER: u64 = 19;
    const E_COLLATERAL_MISMATCH: u64 = 33;
    const E_MISSION_NOT_VISIBLE: u64 = 34;
    const E_PLAYER_BANNED:          u64 = 38;
    const E_WRONG_BAZAAR_TYPE:      u64 = 39;
    const E_WRONG_TRIBE:            u64 = 32; // mirrors mission.move::E_WRONG_TRIBE value

    // ===== Accept (NoTribe) — B2.1 typed split =====
    /// B2.1 / AUD-ET-11 / CC-B2-06: NoTribe path.
    /// Enforces static membership ban + SSU timed ban.
    /// Funds-recovery paths (expire_acceptance, cancel_my_acceptance) are NEVER ban-gated.
    public entry fun accept_mission_notribe(
        registry: &mut MissionRegistry,
        mission_id: ID,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        pool: &mut MissionCollateralPool,
        collateral: Coin<EVE>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        let taker = tx_context::sender(ctx);
        // CC-B2-06: static membership ban (MemberRegistry flag).
        assert!(!membership::is_banned(members, taker), E_PLAYER_BANNED);
        // AUD-ET-11: SSU timed ban (V35 local ban list with expiry).
        assert!(!ssu_governance::is_banned(gov, taker, clock), E_PLAYER_BANNED);
        let now = clock::timestamp_ms(clock);
        let ssu_id = mission::mission_ssu(mission::borrow_mission(registry, mission_id));
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        {
            let bt = mission::mission_bazaar_type(mission::borrow_mission(registry, mission_id));
            assert!(bt == 0, E_WRONG_BAZAAR_TYPE);
        };
        mission_collateral_pool::assert_pool_for_ssu(pool, ssu_id);
        {
            let m = mission::borrow_mission(registry, mission_id);
            mission::assert_visible_to(m, members, taker);
        };
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        let deadline = mission::add_acceptance(m, taker, now);
        let coll_per_run = mission::mission_collateral_eve_per_run(m);
        assert!(coin::value(&collateral) == coll_per_run, E_COLLATERAL_MISMATCH);
        let mission_addr = object::id_to_address(&mission_id);
        mission_collateral_pool::deposit(pool, mission_addr, taker, collateral);
        if (coll_per_run > 0) {
            mission::set_acceptance_collateral(m, taker, coll_per_run);
        };
        let runs_ip = mission::mission_runs_in_progress_count(m);
        mission::emit_accepted(mission_id, taker, deadline, runs_ip, now);
        if (coll_per_run > 0) {
            mission::emit_collateral_posted(mission_id, taker, coll_per_run, 0, now);
        };
    }

    // ===== Accept (Easy) — B2.1 typed split =====
    /// B2.1 / AUD-ET-11 / CC-B2-06 / AUD-ET-14: Easy path.
    /// Enforces static membership ban + tribe-global ban + SSU timed ban + tribe-active.
    /// Funds-recovery paths (expire_acceptance, cancel_my_acceptance) are NEVER ban-gated.
    public entry fun accept_mission_easy(
        registry: &mut MissionRegistry,
        mission_id: ID,
        gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        members: &MemberRegistry,
        pool: &mut MissionCollateralPool,
        collateral: Coin<EVE>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        let taker = tx_context::sender(ctx);
        // CC-B2-06: static membership ban.
        assert!(!membership::is_banned(members, taker), E_PLAYER_BANNED);
        // AUD-ET-11: tribe-global ban + SSU timed ban (Easy).
        assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, taker, clock), E_PLAYER_BANNED);
        assert!(!ssu_governance::is_banned(gov, taker, clock), E_PLAYER_BANNED);
        // AUD-ET-14: tribe-active enforced at accept. Settlement / cancel paths exempt.
        tribe_governance::assert_tribe_active(tribe_gov);
        let now = clock::timestamp_ms(clock);
        let ssu_id = mission::mission_ssu(mission::borrow_mission(registry, mission_id));
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        {
            let bt = mission::mission_bazaar_type(mission::borrow_mission(registry, mission_id));
            assert!(bt == 1, E_WRONG_BAZAAR_TYPE);
        };
        {
            let m = mission::borrow_mission(registry, mission_id);
            assert!(
                tribe_governance::tribe_id(tribe_gov) == mission::mission_tribe_id(m),
                E_WRONG_TRIBE,
            );
        };
        mission_collateral_pool::assert_pool_for_ssu(pool, ssu_id);
        {
            let m = mission::borrow_mission(registry, mission_id);
            mission::assert_visible_to(m, members, taker);
        };
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        let deadline = mission::add_acceptance(m, taker, now);
        let coll_per_run = mission::mission_collateral_eve_per_run(m);
        assert!(coin::value(&collateral) == coll_per_run, E_COLLATERAL_MISMATCH);
        let mission_addr = object::id_to_address(&mission_id);
        mission_collateral_pool::deposit(pool, mission_addr, taker, collateral);
        if (coll_per_run > 0) {
            mission::set_acceptance_collateral(m, taker, coll_per_run);
        };
        let runs_ip = mission::mission_runs_in_progress_count(m);
        mission::emit_accepted(mission_id, taker, deadline, runs_ip, now);
        if (coll_per_run > 0) {
            mission::emit_collateral_posted(mission_id, taker, coll_per_run, 0, now);
        };
    }

    // ===== Expire an acceptance (permissionless) =====
    /// V34: add pool for EVE collateral forfeit to giver on expire.
    public entry fun expire_acceptance(
        registry: &mut MissionRegistry, mission_id: ID, taker: address,
        pool: &mut MissionCollateralPool,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let expired_by = tx_context::sender(ctx);
        // SA-V34-06: pool anchor (defense-in-depth)
        let (ssu_id, giver) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_ssu(m), mission::mission_owner(m))
        };
        mission_collateral_pool::assert_pool_for_ssu(pool, ssu_id);
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        // SA-V34-02: capture before remove
        let collateral_amount = mission::expire_acceptance_internal(m, taker, now);
        mission::emit_acceptance_expired(mission_id, taker, expired_by, now);
        if (collateral_amount > 0) {
            let mission_addr = object::id_to_address(&mission_id);
            let forfeit_coin = mission_collateral_pool::take_full_for_forfeit(
                pool, mission_addr, taker, giver, ctx,
            );
            transfer::public_transfer(forfeit_coin, giver);
            mission::emit_collateral_forfeited(mission_id, taker, giver, collateral_amount, 0, now);
        };
    }

    // ===== Taker self-cancel (V34) =====
    /// V34: taker-only cancel. Active acceptance only (not PENDING).
    /// Collateral split 50/50: giver gets floor(C/2), taker gets C - floor(C/2).
    /// Mission stays open for other takers (is_settled NOT set).
    public entry fun cancel_my_acceptance(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        pool: &mut MissionCollateralPool,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        ssu_governance::assert_not_frozen(gov);
        let taker = tx_context::sender(ctx);
        let now = clock::timestamp_ms(clock);
        let (ssu_id, giver) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_ssu(m), mission::mission_owner(m))
        };
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        // SA-V34-06: pool anchor
        mission_collateral_pool::assert_pool_for_ssu(pool, ssu_id);
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        // SA-V34-02: capture before remove (cancel_acceptance_internal removes DF)
        let collateral_amount = mission::cancel_acceptance_internal(m, taker);
        let runs_ip = mission::mission_runs_in_progress_count(m);
        mission::emit_acceptance_cancelled(mission_id, taker, runs_ip, now);
        if (collateral_amount > 0) {
            let mission_addr = object::id_to_address(&mission_id);
            let (giver_coin, taker_coin) = mission_collateral_pool::take_split(
                pool, mission_addr, taker, giver, ctx,
            );
            // SA-V34-01 (EVE path): coin::zero transfer is valid; no assert needed.
            transfer::public_transfer(giver_coin, giver);
            transfer::public_transfer(taker_coin, taker);
            let floor = collateral_amount / 2;
            let rem = collateral_amount - floor;
            mission::emit_collateral_split(mission_id, taker, giver, rem, floor, 0, now);
        };
    }

    // ===== Cap-gated Advanced primitives (SA-V34-04) =====
    /// Cap-gated accept primitive for Advanced bazaar (called by mission_ledger_ops).
    /// SA-V34-04: MUST take &TribeTokenShopCap.
    /// SA-V34-03: asserts members.ssu_id == mission.ssu_id before role lookup.
    /// Returns (taker, collateral_token_per_run).
    public fun advance_accept(
        registry: &mut MissionRegistry, mission_id: ID,
        gov: &SSUGovernance, members: &MemberRegistry,
        tribe_gov: &TribeGovernance,
        _cap: &TribeTokenShopCap,
        clock: &Clock, ctx: &mut TxContext,
    ): (address, u64) {
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        let taker = tx_context::sender(ctx);
        // CC-B2-06: static membership ban.
        assert!(!membership::is_banned(members, taker), E_PLAYER_BANNED);
        // AUD-ADV-12: tribe-global ban + SSU timed ban (Advanced accept).
        assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, taker, clock), E_PLAYER_BANNED);
        assert!(!ssu_governance::is_banned(gov, taker, clock), E_PLAYER_BANNED);
        // AUD-ET-14: tribe-active at accept. Settlement / cancel paths exempt.
        tribe_governance::assert_tribe_active(tribe_gov);
        let now = clock::timestamp_ms(clock);
        let ssu_id = { mission::mission_ssu(mission::borrow_mission(registry, mission_id)) };
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        // SA-V34-03: visibility gate
        {
            let m = mission::borrow_mission(registry, mission_id);
            mission::assert_visible_to(m, members, taker);
        };
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        let deadline = mission::add_acceptance(m, taker, now);
        let coll_token = mission::mission_collateral_token_per_run(m);
        if (coll_token > 0) {
            mission::set_acceptance_collateral(m, taker, coll_token);
        };
        let runs_ip = mission::mission_runs_in_progress_count(m);
        mission::emit_accepted(mission_id, taker, deadline, runs_ip, now);
        (taker, coll_token)
    }

    /// Cap-gated cancel-my-acceptance primitive for Advanced bazaar.
    /// SA-V34-04: MUST take &TribeTokenShopCap.
    /// Returns (taker, giver, collateral_amount).
    public fun advance_cancel_my_acceptance(
        registry: &mut MissionRegistry, mission_id: ID,
        gov: &SSUGovernance,
        _cap: &TribeTokenShopCap,
        clock: &Clock, ctx: &mut TxContext,
    ): (address, address, u64) {
        ssu_governance::assert_not_frozen(gov);
        let taker = tx_context::sender(ctx);
        let now = clock::timestamp_ms(clock);
        let (ssu_id, giver) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_ssu(m), mission::mission_owner(m))
        };
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        // SA-V34-02: cancel_acceptance_internal returns collateral_amount before DF remove
        let collateral_amount = mission::cancel_acceptance_internal(m, taker);
        let runs_ip = mission::mission_runs_in_progress_count(m);
        mission::emit_acceptance_cancelled(mission_id, taker, runs_ip, now);
        (taker, giver, collateral_amount)
    }

    /// Ceremony admin (Advanced): cap-gated, status-agnostic acceptance remove.
    /// SA-V34-04: MUST take &TribeTokenShopCap. Existence-guarded + underflow-safe
    /// (delegates to mission::admin_remove_acceptance). Returns (existed, collateral).
    public fun advance_admin_remove_acceptance(
        registry: &mut MissionRegistry, mission_id: ID, taker: address,
        _cap: &TribeTokenShopCap,
    ): (bool, u64) {
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        mission::admin_remove_acceptance(m, taker)
    }

    /// Cap-gated expire primitive for Advanced bazaar.
    /// SA-V34-04: MUST take &TribeTokenShopCap.
    /// Returns (taker, giver, collateral_amount).
    public fun advance_expire_acceptance(
        registry: &mut MissionRegistry, mission_id: ID, taker: address,
        gov: &SSUGovernance,
        _cap: &TribeTokenShopCap,
        clock: &Clock, ctx: &mut TxContext,
    ): (address, address, u64) {
        let now = clock::timestamp_ms(clock);
        let expired_by = tx_context::sender(ctx);
        let (ssu_id, giver) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_ssu(m), mission::mission_owner(m))
        };
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        let m = mission::borrow_mission_mut_pkg(registry, mission_id);
        // SA-V34-02: returns collateral_amount before DF remove
        let collateral_amount = mission::expire_acceptance_internal(m, taker, now);
        mission::emit_acceptance_expired(mission_id, taker, expired_by, now);
        (taker, giver, collateral_amount)
    }

    // ===== Try-expire mission listing (permissionless; flips is_active only, NEVER settled) =====
    public entry fun try_expire_mission(
        registry: &mut MissionRegistry, mission_id: ID, clock: &Clock, _ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let (active, expiry) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_is_active(m), mission::mission_expiry_ms(registry, mission_id))
        };
        if (!active) return;
        if (now < expiry) return;
        mission::deactivate_for_expiry(registry, mission_id);
        mission::emit_mission_closed_by_expiry(mission_id, now);
    }

    // ===== Cancel (owner) — Player Locker refund =====
    public entry fun cancel_mission(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit, owner_character: &Character,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let ssu_id = { mission::mission_ssu(mission::borrow_mission(registry, mission_id)) };
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        let owner = { mission_escrow::assert_cancellable(mission::borrow_mission(registry, mission_id), ctx) };
        {
            let m = mission::borrow_mission_mut_pkg(registry, mission_id);
            mission_escrow::drain_remaining_bundles_to_locker(m, ssu, owner_character, ctx);
        };
        refund_eve_and_finalize(registry, mission_id, owner, clock, ctx);
    }

    // ===== Cancel (owner == ssu owner) — Main Storage refund =====
    public entry fun cancel_mission_as_ssu_owner(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit, owner_character: &Character,
        ssu_owner_cap: &OwnerCap<StorageUnit>,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let ssu_id = { mission::mission_ssu(mission::borrow_mission(registry, mission_id)) };
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        let owner = { mission_escrow::assert_cancellable(mission::borrow_mission(registry, mission_id), ctx) };
        assert!(access::is_authorized(ssu_owner_cap, object::id(ssu)), E_WRONG_OWNER_CAP_FOR_SSU);
        assert!(character::character_address(owner_character) == tx_context::sender(ctx), E_CHARACTER_NOT_SENDER);
        {
            let m = mission::borrow_mission_mut_pkg(registry, mission_id);
            mission_escrow::drain_remaining_bundles_to_main(m, ssu, owner_character, ssu_owner_cap, ctx);
        };
        refund_eve_and_finalize(registry, mission_id, owner, clock, ctx);
    }

    fun refund_eve_and_finalize(
        registry: &mut MissionRegistry, mission_id: ID, owner: address,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let has_eve = {
            mission::mission_reward_eve_per_run(mission::borrow_mission(registry, mission_id)) > 0
        };
        if (has_eve) {
            let coin = {
                let m = mission::borrow_mission_mut_pkg(registry, mission_id);
                mission_escrow::split_all_eve(m, ctx)
            };
            transfer::public_transfer(coin, owner);
        };
        mission_escrow::finalize_cancel(registry, mission_id, owner, now);
    }

    // ===== Test-only error accessors =====
    #[test_only]
    public fun e_player_banned(): u64 { E_PLAYER_BANNED }

    // ===== Collect proof bundles -> ssu-owner giver Main Storage =====
    public entry fun collect_proof_to_main(
        registry: &mut MissionRegistry, mission_id: ID, gov: &SSUGovernance,
        ssu: &mut StorageUnit, giver_character: &Character,
        ssu_owner_cap: &OwnerCap<StorageUnit>,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        let (owner, ssu_id) = {
            let m = mission::borrow_mission(registry, mission_id);
            (mission::mission_owner(m), mission::mission_ssu(m))
        };
        assert!(owner == tx_context::sender(ctx), E_NOT_MISSION_OWNER);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert!(ssu_governance::ssu_owner(gov) == owner, E_NOT_MISSION_OWNER);
        assert!(access::is_authorized(ssu_owner_cap, object::id(ssu)), E_WRONG_OWNER_CAP_FOR_SSU);
        assert!(character::character_address(giver_character) == tx_context::sender(ctx), E_CHARACTER_NOT_SENDER);
        let collected = {
            let m = mission::borrow_mission_mut_pkg(registry, mission_id);
            mission_escrow::collect_proofs_to_main(m, ssu, giver_character, ssu_owner_cap, ctx)
        };
        mission::emit_proof_collected(mission_id, owner, collected, clock::timestamp_ms(clock));
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
