// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazaar_core::mission — MissionRegistry, MissionShop, events (single schema,
/// CC-M15), state primitives consumed by mission_complete + mission_lifecycle.
/// Escrow drain/cancel helpers live in mission_escrow.move (CC-M10-R split).
module bazaar_mission::mission {
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use sui::dynamic_field as df;
    use sui::dynamic_object_field as dof;
    use std::string::{Self, String};
    use EVE::EVE::EVE;
    use world::storage_unit::{Self, StorageUnit};
    use world::character::Character;
    use world::inventory::{Self, Item};
    use bazaar_core::bazar::{Self, BazarAuth};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazaar_core_admin::{BazaarCoreAdmin, TribeTokenShopCap};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::mission_fees;
    use bazaar_core::membership::{Self, MemberRegistry};
    use dapp_hub::dapp_governance::GovernanceConfig;
    use dapp_hub::tax_wallet::DAppTaxWallet;
    use dapp_hub::role_types;

    // ===== Constants =====
    const TITLE_MAX: u64 = 20;
    const MAX_PROOF_ITEMS: u64 = 10;
    const MAX_REWARD_ITEMS: u64 = 10;
    const EXCLUSION_ZONE_RADIUS: u64 = 3;
    const MIN_DURATION_MS: u64 = 3_600_000;
    const MAX_DURATION_MS: u64 = 604_800_000;
    const MAX_U64_AS_U128: u128 = 18_446_744_073_709_551_615;
    const MODE_ITEM_PROOF: u8 = 0;
    const MODE_OTHER: u8 = 1;
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_PENDING: u8 = 1;

    // Visibility bitmask constants (§6.6 of design)
    const VIS_OWNER:    u8 = 1;
    const VIS_ADMIN:    u8 = 2;
    const VIS_MOD:      u8 = 4;
    const VIS_MEMBER:   u8 = 8;
    const VIS_EVERYONE: u8 = 16;

    // ===== Error Codes =====
    const E_TITLE_TOO_LONG: u64 = 1;
    const E_NOT_MISSION_OWNER: u64 = 2;
    const E_MISSION_NOT_FOUND: u64 = 3;
    const E_MISSION_NOT_ACTIVE: u64 = 4;
    const E_INVALID_BAZAAR_TYPE: u64 = 5;
    const E_TOO_MANY_PROOF_ITEMS: u64 = 6;
    const E_INVALID_COMPLETION_MODE: u64 = 7;
    const E_NO_FREE_RUN: u64 = 8;
    const E_ALREADY_ACCEPTED: u64 = 9;
    const E_NO_ACCEPTANCE: u64 = 10;
    const E_ACCEPTANCE_NOT_ACTIVE: u64 = 11;
    const E_DEADLINE_NOT_PASSED: u64 = 13;
    const E_MISSION_POSITION_OCCUPIED: u64 = 15;
    const E_ITEM_QUANTITY_MISMATCH: u64 = 17;
    const E_BUNDLE_COUNT_MISMATCH: u64 = 22;
    const E_DURATION_OUT_OF_RANGE: u64 = 23;
    const E_INVALID_MISSION_TYPE: u64 = 24;
    const E_EVE_ESCROW_MISMATCH: u64 = 26;
    // 27 retired (was E_FEE_NOT_ZERO_SLICE2; Slice 3 wired the real listing fee).
    const E_AMOUNT_OVERFLOW: u64 = 28;
    const E_MISSION_EXPIRED: u64 = 29;
    const E_ALREADY_SETTLED: u64 = 30;
    const E_MAX_RUNS_ZERO: u64 = 31;
    const E_WRONG_TRIBE: u64 = 32;
    const E_COLLATERAL_MISMATCH:   u64 = 33;
    const E_MISSION_NOT_VISIBLE:   u64 = 34;
    const E_INVALID_VISIBILITY:    u64 = 35;
    // 36 = E_COLLATERAL_NOT_FOUND lives in mission_collateral_pool
    // 37 = E_WRONG_COLLATERAL_POOL lives in mission_collateral_pool
    const E_PLAYER_BANNED: u64 = 38;

    // ===== Structs =====
    public struct MissionRegistry has key {
        id: UID,
        missions: Table<ID, bool>,
        // GAS-12: elements are MissionPosition; written at register, REMOVED at all deactivation paths.
        missions_by_ssu: Table<address, vector<MissionPosition>>,
    }

    /// GAS-12: inline per-SSU mission position record — lets assert_mission_position_clear
    /// run the Chebyshev exclusion check WITHOUT DOF-borrowing each MissionShop.
    /// Written at register_and_emit, REMOVED at both deactivation paths
    /// (deactivate / deactivate_and_settle) via swap_remove (A7/GAS-13 compat).
    /// NO `active` field: present-in-index ⟹ active. All deactivation paths remove
    /// from this index BEFORE setting MissionShop.is_active=false (verified §2).
    public struct MissionPosition has store, drop { id: ID, x: u64, y: u64 }

    public struct ItemReq has store, copy, drop { type_id: u64, amount: u64 }

    public struct MissionShop has key, store {
        id: UID,
        owner: address,
        ssu_id: address,
        tribe_id: u64,
        bazaar_type: u8,
        mission_type: u8,
        title: String,
        description: String,
        completion_mode: u8,
        proof_items: vector<ItemReq>,
        reward_items: vector<ItemReq>,
        reward_eve: Balance<EVE>,
        reward_eve_per_run: u64,
        reward_token_per_run: u64,
        max_runs: u64,
        runs_completed: u64,
        runs_in_progress: u64,
        taker_time_limit_ms: u64,
        created_at_ms: u64,
        expiry_ms: u64,
        position_x: u64,
        position_y: u64,
        is_active: bool,
        is_settled: bool,
        reward_bundles_total: u64,
        reward_bundles_paid: u64,
        proof_escrow_count: u64,
        proof_escrow_next: u64,
        // V34 collateral + visibility
        collateral_eve_per_run:   u64,
        collateral_token_per_run: u64,
        visibility_roles:         u8,
    }

    public struct MissionAcceptance has store, copy, drop {
        taker: address,
        accepted_at_ms: u64,
        deadline_ms: u64,
        status: u8,
        collateral_amount: u64,   // exact units posted at accept (0 if no collateral)
    }

    // ===== DF Keys =====
    public struct AcceptanceKey has copy, drop, store { taker: address }
    public struct RewardBundleKey has copy, drop, store { idx: u64 }
    public struct ProofEscrowKey has copy, drop, store { seq: u64 }

    // ===== Events (single schema — CC-M15) =====
    public struct MissionCreatedEvent has copy, drop {
        mission_id: ID, registry_id: ID, owner: address, ssu_id: address, tribe_id: u64,
        bazaar_type: u8, mission_type: u8, completion_mode: u8,
        max_runs: u64, reward_eve_per_run: u64, reward_token_per_run: u64,
        taker_time_limit_ms: u64, position_x: u64, position_y: u64,
        expiry_ms: u64, timestamp_ms: u64,
        collateral_eve_per_run: u64,
        collateral_token_per_run: u64,
        visibility_roles: u8,
    }
    public struct MissionAcceptedEvent has copy, drop {
        mission_id: ID, taker: address, deadline_ms: u64, runs_in_progress: u64, timestamp_ms: u64,
    }
    public struct MissionSubmittedEvent has copy, drop {
        mission_id: ID, taker: address, completion_mode: u8, timestamp_ms: u64,
    }
    public struct MissionCompletedEvent has copy, drop {
        mission_id: ID, taker: address, giver: address, completion_mode: u8,
        runs_completed: u64, runs_remaining: u64, timestamp_ms: u64,
    }
    public struct MissionRejectedEvent has copy, drop {
        mission_id: ID, taker: address, giver: address, timestamp_ms: u64,
    }
    public struct MissionAcceptanceExpiredEvent has copy, drop {
        mission_id: ID, taker: address, expired_by: address, timestamp_ms: u64,
    }
    public struct MissionProofEscrowedEvent has copy, drop {
        mission_id: ID, taker: address, seq: u64, timestamp_ms: u64,
    }
    public struct MissionProofCollectedEvent has copy, drop {
        mission_id: ID, giver: address, collected_count: u64, timestamp_ms: u64,
    }
    public struct MissionClosedEvent has copy, drop {
        mission_id: ID, owner: address, ssu_id: address, tribe_id: u64, bazaar_type: u8,
        reason: u8, refunded_eve: u64, refunded_bundles: u64, timestamp_ms: u64,
    }
    public struct MissionExpiredEvent has copy, drop {
        mission_id: ID, timestamp_ms: u64,
    }
    public struct MissionCollateralPostedEvent has copy, drop {
        mission_id: ID, taker: address, amount: u64, currency: u8, timestamp_ms: u64,
    }
    public struct MissionCollateralRefundedEvent has copy, drop {
        mission_id: ID, taker: address, amount: u64, currency: u8, reason: u8, timestamp_ms: u64,
    }
    public struct MissionCollateralForfeitedEvent has copy, drop {
        mission_id: ID, taker: address, giver: address, amount: u64, currency: u8, timestamp_ms: u64,
    }
    public struct MissionCollateralSplitEvent has copy, drop {
        mission_id: ID, taker: address, giver: address,
        taker_share: u64, giver_share: u64, currency: u8, timestamp_ms: u64,
    }
    public struct MissionAcceptanceCancelledEvent has copy, drop {
        mission_id: ID, taker: address, runs_in_progress: u64, timestamp_ms: u64,
    }

    // ===== Overflow-checked multiply =====
    public fun checked_mul(a: u64, b: u64): u64 {
        let r = (a as u128) * (b as u128);
        assert!(r <= MAX_U64_AS_U128, E_AMOUNT_OVERFLOW);
        (r as u64)
    }

    // ===== Bootstrap =====
    public entry fun bootstrap_mission_registry(ctx: &mut TxContext) {
        transfer::share_object(MissionRegistry {
            id: object::new(ctx),
            missions: table::new(ctx),
            missions_by_ssu: table::new(ctx),
        });
    }

    // ===== Position exclusion =====
    public(package) fun assert_mission_position_clear(
        registry: &MissionRegistry, ssu_id: address, new_x: u64, new_y: u64,
    ) {
        // GAS-12: read inline MissionPosition records — no DOF borrow, no vector copy.
        // No `active` check: present-in-index ⟹ active (all deactivation paths remove first).
        if (!table::contains(&registry.missions_by_ssu, ssu_id)) return;
        let positions = table::borrow(&registry.missions_by_ssu, ssu_id);
        let n = vector::length(positions);
        let mut i = 0;
        while (i < n) {
            let p = vector::borrow(positions, i);
            let dx = if (new_x > p.x) { new_x - p.x } else { p.x - new_x };
            let dy = if (new_y > p.y) { new_y - p.y } else { p.y - new_y };
            let cheb = if (dx > dy) { dx } else { dy };
            assert!(cheb >= EXCLUSION_ZONE_RADIUS, E_MISSION_POSITION_OCCUPIED);
            i = i + 1;
        };
    }

    // ===== Create (NoTribe) — fee layers: SSU + Dapp =====
    public fun create_mission_notribe(
        registry: &mut MissionRegistry,
        gov: &mut SSUGovernance,
        dapp_config: &GovernanceConfig,
        admin: &BazaarCoreAdmin,
        dapp_wallet: &mut DAppTaxWallet,
        mission_type: u8,
        title: vector<u8>,
        description: vector<u8>,
        completion_mode: u8,
        proof_type_ids: vector<u64>, proof_amounts: vector<u64>,
        reward_type_ids: vector<u64>, reward_amounts: vector<u64>,
        max_runs: u64,
        reward_eve_per_run: u64,
        reward_eve: Coin<EVE>,
        reward_bundles: vector<vector<Item>>,
        taker_time_limit_ms: u64,
        duration_ms: u64,
        position_x: u64, position_y: u64,
        collateral_eve_per_run: u64,
        visibility_roles: u8,
        listing_fee: Coin<EVE>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == 0, E_INVALID_BAZAAR_TYPE);
        // B2.1 / AUD-ET-11 / CC-B2-06: NoTribe create enforces SSU timed ban.
        // Static membership ban requires members param (not in scope here) — covered at accept path.
        // NOT applied to cancel/expire paths — those are funds-recovery.
        let sender = tx_context::sender(ctx);
        assert!(!ssu_governance::is_banned(gov, sender, clock), E_PLAYER_BANNED);
        let hours = mission_fees::duration_hours(duration_ms);
        mission_fees::charge_notribe(
            gov, dapp_config, admin, dapp_wallet, listing_fee, hours,
            tx_context::sender(ctx), clock, ctx,
        );
        let m = build_eve_mission(
            registry, gov, mission_type, title, description, completion_mode,
            proof_type_ids, proof_amounts, reward_type_ids, reward_amounts,
            max_runs, reward_eve_per_run, reward_eve, reward_bundles,
            taker_time_limit_ms, duration_ms, position_x, position_y,
            collateral_eve_per_run, visibility_roles, clock, ctx,
        );
        register_and_emit(registry, m)
    }

    // ===== Create (Easy) — fee layers: SSU + Tribe + Dapp =====
    public fun create_mission_easy(
        registry: &mut MissionRegistry,
        gov: &mut SSUGovernance,
        tribe_gov: &mut TribeGovernance,
        dapp_config: &GovernanceConfig,
        admin: &BazaarCoreAdmin,
        dapp_wallet: &mut DAppTaxWallet,
        mission_type: u8,
        title: vector<u8>,
        description: vector<u8>,
        completion_mode: u8,
        proof_type_ids: vector<u64>, proof_amounts: vector<u64>,
        reward_type_ids: vector<u64>, reward_amounts: vector<u64>,
        max_runs: u64,
        reward_eve_per_run: u64,
        reward_eve: Coin<EVE>,
        reward_bundles: vector<vector<Item>>,
        taker_time_limit_ms: u64,
        duration_ms: u64,
        position_x: u64, position_y: u64,
        collateral_eve_per_run: u64,
        visibility_roles: u8,
        listing_fee: Coin<EVE>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == 1, E_INVALID_BAZAAR_TYPE);
        assert!(tribe_governance::tribe_id(tribe_gov) == ssu_governance::ssu_tribe_id(gov), E_WRONG_TRIBE);
        // B2.1 / AUD-ET-11 / CC-B2-06: Easy create enforces tribe-global + SSU timed ban.
        // Static membership ban requires members param (not in scope here) — covered at accept path.
        // NOT applied to cancel/expire paths — those are funds-recovery.
        let sender = tx_context::sender(ctx);
        assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, sender, clock), E_PLAYER_BANNED);
        assert!(!ssu_governance::is_banned(gov, sender, clock), E_PLAYER_BANNED);
        // B2.1 / AUD-ET-14: Easy create enforces tribe-active. Settlement paths exempt.
        tribe_governance::assert_tribe_active(tribe_gov);
        let hours = mission_fees::duration_hours(duration_ms);
        mission_fees::charge_easy(
            gov, tribe_gov, dapp_config, admin, dapp_wallet, listing_fee, hours,
            tx_context::sender(ctx), clock, ctx,
        );
        let m = build_eve_mission(
            registry, gov, mission_type, title, description, completion_mode,
            proof_type_ids, proof_amounts, reward_type_ids, reward_amounts,
            max_runs, reward_eve_per_run, reward_eve, reward_bundles,
            taker_time_limit_ms, duration_ms, position_x, position_y,
            collateral_eve_per_run, visibility_roles, clock, ctx,
        );
        register_and_emit(registry, m)
    }

    // ===== Shared EVE mission builder (NoTribe + Easy) =====
    // Runs all create-time asserts, builds the MissionShop, escrows reward bundles,
    // and returns it. Fee charging is done by the caller (create_mission_*) BEFORE this.
    fun build_eve_mission(
        registry: &MissionRegistry,
        gov: &SSUGovernance,
        mission_type: u8,
        title: vector<u8>,
        description: vector<u8>,
        completion_mode: u8,
        proof_type_ids: vector<u64>, proof_amounts: vector<u64>,
        reward_type_ids: vector<u64>, reward_amounts: vector<u64>,
        max_runs: u64,
        reward_eve_per_run: u64,
        reward_eve: Coin<EVE>,
        reward_bundles: vector<vector<Item>>,
        taker_time_limit_ms: u64,
        duration_ms: u64,
        position_x: u64, position_y: u64,
        collateral_eve_per_run: u64,
        visibility_roles: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): MissionShop {
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        let ssu_id = ssu_governance::ssu_id(gov);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        let bazaar_type = ssu_governance::ssu_bazaar_type(gov);
        assert!(mission_type <= 3, E_INVALID_MISSION_TYPE);
        assert!(completion_mode <= MODE_OTHER, E_INVALID_COMPLETION_MODE);
        assert!(max_runs > 0, E_MAX_RUNS_ZERO);
        assert!(string::length(&string::utf8(title)) <= TITLE_MAX, E_TITLE_TOO_LONG);
        assert!(duration_ms >= MIN_DURATION_MS && duration_ms <= MAX_DURATION_MS, E_DURATION_OUT_OF_RANGE);
        assert!(vector::length(&proof_type_ids) <= MAX_PROOF_ITEMS, E_TOO_MANY_PROOF_ITEMS);
        assert_mission_position_clear(registry, ssu_id, position_x, position_y);
        assert!(visibility_roles != 0, E_INVALID_VISIBILITY);

        let proof_reqs = build_item_reqs(proof_type_ids, proof_amounts);
        let reward_reqs = build_item_reqs(reward_type_ids, reward_amounts);
        assert!(vector::length(&reward_reqs) <= MAX_REWARD_ITEMS, E_TOO_MANY_PROOF_ITEMS);
        let now = clock::timestamp_ms(clock);
        let mut m = MissionShop {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            ssu_id, tribe_id: ssu_governance::ssu_tribe_id(gov), bazaar_type,
            mission_type, title: string::utf8(title), description: string::utf8(description),
            completion_mode,
            proof_items: proof_reqs,
            reward_items: reward_reqs,
            reward_eve: coin::into_balance(reward_eve),
            reward_eve_per_run, reward_token_per_run: 0,
            max_runs, runs_completed: 0, runs_in_progress: 0,
            taker_time_limit_ms,
            created_at_ms: now, expiry_ms: now + duration_ms,
            position_x, position_y, is_active: true, is_settled: false,
            reward_bundles_total: 0, reward_bundles_paid: 0,
            proof_escrow_count: 0, proof_escrow_next: 0,
            collateral_eve_per_run,
            collateral_token_per_run: 0,
            visibility_roles,
        };
        assert!(balance::value(&m.reward_eve) == checked_mul(reward_eve_per_run, max_runs), E_EVE_ESCROW_MISMATCH);
        escrow_reward_bundles(&mut m, reward_bundles);
        m
    }

    // ===== Advanced constructor (cap-gated) =====
    public fun construct_mission_advanced(
        gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        mission_type: u8, title: vector<u8>, description: vector<u8>,
        completion_mode: u8,
        proof_type_ids: vector<u64>, proof_amounts: vector<u64>,
        reward_type_ids: vector<u64>, reward_amounts: vector<u64>,
        max_runs: u64, reward_token_per_run: u64,
        collateral_token_per_run: u64,
        visibility_roles: u8,
        reward_bundles: vector<vector<Item>>,
        taker_time_limit_ms: u64, duration_ms: u64,
        position_x: u64, position_y: u64,
        _cap: &TribeTokenShopCap,
        clock: &Clock, ctx: &mut TxContext,
    ): MissionShop {
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        // Identity check: tribe_gov must belong to this SSU's tribe.
        assert!(tribe_governance::tribe_id(tribe_gov) == ssu_governance::ssu_tribe_id(gov), E_WRONG_TRIBE);
        // B2.1 / AUD-ADV-12 / CC-B2-06: Advanced create enforces tribe-global + SSU timed ban.
        // Static membership ban applied at mission_ledger_ops::create_mission_advanced (has members).
        // NOT applied to cancel/expire paths — those are funds-recovery.
        let sender = tx_context::sender(ctx);
        assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, sender, clock), E_PLAYER_BANNED);
        assert!(!ssu_governance::is_banned(gov, sender, clock), E_PLAYER_BANNED);
        // AUD-ET-14: Advanced create enforces tribe-active. Settlement paths exempt.
        tribe_governance::assert_tribe_active(tribe_gov);
        let ssu_id = ssu_governance::ssu_id(gov);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert!(ssu_governance::ssu_bazaar_type(gov) == 2, E_INVALID_BAZAAR_TYPE);
        assert!(mission_type <= 3, E_INVALID_MISSION_TYPE);
        assert!(completion_mode <= MODE_OTHER, E_INVALID_COMPLETION_MODE);
        assert!(max_runs > 0, E_MAX_RUNS_ZERO);
        assert!(string::length(&string::utf8(title)) <= TITLE_MAX, E_TITLE_TOO_LONG);
        assert!(duration_ms >= MIN_DURATION_MS && duration_ms <= MAX_DURATION_MS, E_DURATION_OUT_OF_RANGE);
        assert!(vector::length(&proof_type_ids) <= MAX_PROOF_ITEMS, E_TOO_MANY_PROOF_ITEMS);
        assert!(visibility_roles != 0, E_INVALID_VISIBILITY);
        let proof_reqs = build_item_reqs(proof_type_ids, proof_amounts);
        let reward_reqs = build_item_reqs(reward_type_ids, reward_amounts);
        assert!(vector::length(&reward_reqs) <= MAX_REWARD_ITEMS, E_TOO_MANY_PROOF_ITEMS);
        let now = clock::timestamp_ms(clock);
        let mut m = MissionShop {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            ssu_id, tribe_id: ssu_governance::ssu_tribe_id(gov), bazaar_type: 2,
            mission_type, title: string::utf8(title), description: string::utf8(description),
            completion_mode,
            proof_items: proof_reqs,
            reward_items: reward_reqs,
            reward_eve: balance::zero(),
            reward_eve_per_run: 0, reward_token_per_run,
            max_runs, runs_completed: 0, runs_in_progress: 0,
            taker_time_limit_ms,
            created_at_ms: now, expiry_ms: now + duration_ms,
            position_x, position_y, is_active: true, is_settled: false,
            reward_bundles_total: 0, reward_bundles_paid: 0,
            proof_escrow_count: 0, proof_escrow_next: 0,
            collateral_eve_per_run: 0,
            collateral_token_per_run,
            visibility_roles,
        };
        escrow_reward_bundles(&mut m, reward_bundles);
        m
    }

    public fun register_mission_advanced(
        registry: &mut MissionRegistry, m: MissionShop, _cap: &TribeTokenShopCap,
    ): ID {
        assert_mission_position_clear(registry, m.ssu_id, m.position_x, m.position_y);
        register_and_emit(registry, m)
    }

    // ===== State primitives (mission_complete + mission_lifecycle) =====

    public(package) fun add_acceptance(m: &mut MissionShop, taker: address, now: u64): u64 {
        assert!(m.is_active, E_MISSION_NOT_ACTIVE);
        assert!(now < m.expiry_ms, E_MISSION_EXPIRED);
        assert!(m.max_runs - m.runs_completed - m.runs_in_progress > 0, E_NO_FREE_RUN);
        let key = AcceptanceKey { taker };
        assert!(!df::exists_(&m.id, key), E_ALREADY_ACCEPTED);
        let deadline = now + m.taker_time_limit_ms;
        df::add(&mut m.id, key, MissionAcceptance {
            taker, accepted_at_ms: now, deadline_ms: deadline, status: STATUS_ACTIVE,
            collateral_amount: 0,
        });
        m.runs_in_progress = m.runs_in_progress + 1;
        deadline
    }

    /// SA-V34-02: returns collateral_amount captured before removal.
    public(package) fun expire_acceptance_internal(m: &mut MissionShop, taker: address, now: u64): u64 {
        let key = AcceptanceKey { taker };
        assert!(df::exists_(&m.id, key), E_NO_ACCEPTANCE);
        let acc: MissionAcceptance = *df::borrow(&m.id, key);
        assert!(acc.status == STATUS_ACTIVE, E_ACCEPTANCE_NOT_ACTIVE);
        assert!(now >= acc.deadline_ms, E_DEADLINE_NOT_PASSED);
        let removed: MissionAcceptance = df::remove(&mut m.id, key);
        m.runs_in_progress = m.runs_in_progress - 1;
        removed.collateral_amount
    }

    public(package) fun assert_active_acceptance(m: &MissionShop, taker: address) {
        let key = AcceptanceKey { taker };
        assert!(df::exists_(&m.id, key), E_NO_ACCEPTANCE);
        let acc = df::borrow<AcceptanceKey, MissionAcceptance>(&m.id, key);
        assert!(acc.status == STATUS_ACTIVE, E_ACCEPTANCE_NOT_ACTIVE);
    }

    public(package) fun acceptance_status_of(m: &MissionShop, taker: address): u8 {
        let key = AcceptanceKey { taker };
        assert!(df::exists_(&m.id, key), E_NO_ACCEPTANCE);
        df::borrow<AcceptanceKey, MissionAcceptance>(&m.id, key).status
    }

    public(package) fun set_acceptance_pending(m: &mut MissionShop, taker: address) {
        let acc = df::borrow_mut<AcceptanceKey, MissionAcceptance>(&mut m.id, AcceptanceKey { taker });
        acc.status = STATUS_PENDING;
    }

    public(package) fun set_acceptance_collateral(m: &mut MissionShop, taker: address, amount: u64) {
        let acc = df::borrow_mut<AcceptanceKey, MissionAcceptance>(&mut m.id, AcceptanceKey { taker });
        acc.collateral_amount = amount;
    }

    public(package) fun acceptance_collateral_of(m: &MissionShop, taker: address): u64 {
        let key = AcceptanceKey { taker };
        assert!(df::exists_(&m.id, key), E_NO_ACCEPTANCE);
        df::borrow<AcceptanceKey, MissionAcceptance>(&m.id, key).collateral_amount
    }

    /// SA-V34-02: Remove an ACTIVE acceptance and return collateral_amount.
    /// Used by cancel_my_acceptance (taker-initiated, no deadline gate).
    /// Does NOT set is_settled; the mission stays open for new takers.
    public(package) fun cancel_acceptance_internal(
        m: &mut MissionShop, taker: address,
    ): u64 {
        let key = AcceptanceKey { taker };
        assert!(df::exists_(&m.id, key), E_NO_ACCEPTANCE);
        let acc: MissionAcceptance = *df::borrow(&m.id, key);
        assert!(acc.status == STATUS_ACTIVE, E_ACCEPTANCE_NOT_ACTIVE);
        // No deadline check — taker may cancel an ACTIVE acceptance anytime.
        let removed: MissionAcceptance = df::remove(&mut m.id, key);
        m.runs_in_progress = m.runs_in_progress - 1;
        removed.collateral_amount
    }

    /// SA-V34-02: returns collateral_amount captured before DF removal.
    /// All completion/cancel/expire cores MUST use this returned value — never
    /// call acceptance_collateral_of after remove_acceptance.
    public(package) fun remove_acceptance(m: &mut MissionShop, taker: address): u64 {
        let acc: MissionAcceptance = df::remove(&mut m.id, AcceptanceKey { taker });
        m.runs_in_progress = m.runs_in_progress - 1;
        acc.collateral_amount
    }

    /// Ceremony admin force-remove (C-3): removes an acceptance of ANY status
    /// (ACTIVE or PENDING). Existence-guarded + idempotent — returns (false, 0)
    /// when no acceptance exists for `taker`, so a re-run/page never aborts.
    /// runs_in_progress is decremented ONLY when an acceptance actually existed
    /// (underflow-safe). Returns (existed, collateral_amount).
    public(package) fun admin_remove_acceptance(m: &mut MissionShop, taker: address): (bool, u64) {
        let key = AcceptanceKey { taker };
        if (!df::exists_(&m.id, key)) { return (false, 0) };
        let removed: MissionAcceptance = df::remove(&mut m.id, key);
        m.runs_in_progress = m.runs_in_progress - 1;
        (true, removed.collateral_amount)
    }

    /// SA-V34-03: assert ssu anchor BEFORE role lookup.
    /// Visibility gate: taker must hold a role whose bit appears in m.visibility_roles,
    /// OR m.visibility_roles has VIS_EVERYONE, OR taker == m.owner.
    public(package) fun assert_visible_to(
        m: &MissionShop, members: &MemberRegistry, taker: address,
    ) {
        if (taker == m.owner) return;
        let v = m.visibility_roles;
        if (v & VIS_EVERYONE != 0) return;
        // SA-V34-03: pin members registry to this mission's SSU
        assert!(membership::ssu_id(members) == m.ssu_id, E_MISSION_NOT_VISIBLE);
        let role = membership::ssu_role_of(members, taker);
        let bit = role_to_vis_bit(role);
        assert!(bit & v != 0, E_MISSION_NOT_VISIBLE);
    }

    fun role_to_vis_bit(role: u8): u8 {
        if (role == role_types::role_owner())      { VIS_OWNER }
        else if (role == role_types::role_super_admin() || role == role_types::role_admin()) { VIS_ADMIN }
        else if (role == role_types::role_moderator())  { VIS_MOD }
        else if (role == role_types::role_member() || role == role_types::role_friendly()) { VIS_MEMBER }
        else { 0 }
    }

    public(package) fun has_reward_bundle(m: &MissionShop): bool {
        df::exists_(&m.id, RewardBundleKey { idx: m.reward_bundles_paid })
    }

    public(package) fun pop_reward_bundle(m: &mut MissionShop): vector<Item> {
        let key = RewardBundleKey { idx: m.reward_bundles_paid };
        let bundle: vector<Item> = df::remove(&mut m.id, key);
        m.reward_bundles_paid = m.reward_bundles_paid + 1;
        bundle
    }

    public(package) fun pay_eve_reward(m: &mut MissionShop, taker: address, ctx: &mut TxContext) {
        if (m.reward_eve_per_run > 0) {
            let coin = coin::from_balance(balance::split(&mut m.reward_eve, m.reward_eve_per_run), ctx);
            transfer::public_transfer(coin, taker);
        };
    }

    public(package) fun mark_completed(m: &mut MissionShop, taker: address, mission_id: ID, now: u64) {
        m.runs_completed = m.runs_completed + 1;
        event::emit(MissionCompletedEvent {
            mission_id, taker, giver: m.owner, completion_mode: m.completion_mode,
            runs_completed: m.runs_completed,
            runs_remaining: m.max_runs - m.runs_completed,
            timestamp_ms: now,
        });
    }

    public(package) fun stash_proof(m: &mut MissionShop, items: vector<Item>): u64 {
        let seq = m.proof_escrow_count;
        df::add(&mut m.id, ProofEscrowKey { seq }, items);
        m.proof_escrow_count = m.proof_escrow_count + 1;
        seq
    }

    public(package) fun deposit_item_to_locker(
        ssu: &mut StorageUnit, character: &Character, item: Item, ctx: &mut TxContext,
    ) {
        storage_unit::deposit_to_owned<BazarAuth>(ssu, character, item, bazar::new_bazar_auth(), ctx);
    }

    // GAS-14: collapsed from 4 borrows to 2 when exhausted.
    // Single & reads exhaustion flag + event scalars together (was two separate & borrows).
    // Single &mut via deactivate_and_settle: is_active=false + is_settled=true
    // (was deactivate [&mut] + separate is_settled write [&mut] = 2 cycles).
    public(package) fun auto_close_if_exhausted(
        registry: &mut MissionRegistry, mission_id: ID, now: u64,
    ) {
        let (exhausted, owner, ssu_id, tribe_id, bt) = {
            let m = borrow_mission(registry, mission_id);
            (
                m.is_active && m.runs_completed >= m.max_runs,
                m.owner, m.ssu_id, m.tribe_id, m.bazaar_type,
            )
        };
        if (exhausted) {
            // Single &mut: is_active=false + is_settled=true in one DOF cycle.
            deactivate_and_settle(registry, mission_id);
            event::emit(MissionClosedEvent {
                mission_id, owner, ssu_id, tribe_id, bazaar_type: bt,
                reason: 2, refunded_eve: 0, refunded_bundles: 0, timestamp_ms: now,
            });
        }
    }

    public(package) fun set_settled(m: &mut MissionShop) { m.is_settled = true; }

    public(package) fun borrow_mission_mut_pkg(
        registry: &mut MissionRegistry, mission_id: ID,
    ): &mut MissionShop {
        borrow_mission_mut(registry, mission_id)
    }

    // ===== Emit wrappers (single schema, CC-M15) =====
    public(package) fun emit_proof_escrowed(mission_id: ID, taker: address, seq: u64, now: u64) {
        event::emit(MissionProofEscrowedEvent { mission_id, taker, seq, timestamp_ms: now });
    }
    public(package) fun emit_submitted(mission_id: ID, taker: address, mode: u8, now: u64) {
        event::emit(MissionSubmittedEvent { mission_id, taker, completion_mode: mode, timestamp_ms: now });
    }
    public(package) fun emit_rejected(mission_id: ID, taker: address, giver: address, now: u64) {
        event::emit(MissionRejectedEvent { mission_id, taker, giver, timestamp_ms: now });
    }
    public(package) fun emit_accepted(
        mission_id: ID, taker: address, deadline_ms: u64, runs_in_progress: u64, now: u64,
    ) {
        event::emit(MissionAcceptedEvent { mission_id, taker, deadline_ms, runs_in_progress, timestamp_ms: now });
    }
    public(package) fun emit_acceptance_expired(
        mission_id: ID, taker: address, expired_by: address, now: u64,
    ) {
        event::emit(MissionAcceptanceExpiredEvent { mission_id, taker, expired_by, timestamp_ms: now });
    }
    public(package) fun emit_proof_collected(
        mission_id: ID, giver: address, collected_count: u64, now: u64,
    ) {
        event::emit(MissionProofCollectedEvent { mission_id, giver, collected_count, timestamp_ms: now });
    }
    public(package) fun emit_mission_closed_by_expiry(mission_id: ID, now: u64) {
        event::emit(MissionExpiredEvent { mission_id, timestamp_ms: now });
    }
    public(package) fun emit_mission_closed(
        mission_id: ID, owner: address, ssu_id: address, tribe_id: u64, bazaar_type: u8,
        reason: u8, refunded_eve: u64, refunded_bundles: u64, now: u64,
    ) {
        event::emit(MissionClosedEvent {
            mission_id, owner, ssu_id, tribe_id, bazaar_type,
            reason, refunded_eve, refunded_bundles, timestamp_ms: now,
        });
    }

    // ===== New V34 field accessors =====
    public fun mission_collateral_eve_per_run(m: &MissionShop): u64  { m.collateral_eve_per_run }
    public fun mission_collateral_token_per_run(m: &MissionShop): u64 { m.collateral_token_per_run }
    public fun mission_visibility_roles(m: &MissionShop): u8         { m.visibility_roles }

    // ===== V34 collateral + cancel emit wrappers =====
    public fun emit_collateral_posted(
        mission_id: ID, taker: address, amount: u64, currency: u8, now: u64,
    ) {
        event::emit(MissionCollateralPostedEvent { mission_id, taker, amount, currency, timestamp_ms: now });
    }
    public fun emit_collateral_refunded(
        mission_id: ID, taker: address, amount: u64, currency: u8, reason: u8, now: u64,
    ) {
        event::emit(MissionCollateralRefundedEvent { mission_id, taker, amount, currency, reason, timestamp_ms: now });
    }
    public fun emit_collateral_forfeited(
        mission_id: ID, taker: address, giver: address, amount: u64, currency: u8, now: u64,
    ) {
        event::emit(MissionCollateralForfeitedEvent { mission_id, taker, giver, amount, currency, timestamp_ms: now });
    }
    public fun emit_collateral_split(
        mission_id: ID, taker: address, giver: address,
        taker_share: u64, giver_share: u64, currency: u8, now: u64,
    ) {
        event::emit(MissionCollateralSplitEvent {
            mission_id, taker, giver, taker_share, giver_share, currency, timestamp_ms: now,
        });
    }
    public(package) fun emit_acceptance_cancelled(
        mission_id: ID, taker: address, runs_in_progress: u64, now: u64,
    ) {
        event::emit(MissionAcceptanceCancelledEvent {
            mission_id, taker, runs_in_progress, timestamp_ms: now,
        });
    }

    // ===== Package-visible deactivate (mission_escrow calls this) =====
    public(package) fun deactivate_internal(registry: &mut MissionRegistry, mission_id: ID) {
        deactivate(registry, mission_id);
    }
    public(package) fun set_settled_internal(registry: &mut MissionRegistry, mission_id: ID) {
        let m = borrow_mission_mut(registry, mission_id);
        m.is_settled = true;
    }
    public(package) fun mission_expiry_ms(registry: &MissionRegistry, mission_id: ID): u64 {
        borrow_mission(registry, mission_id).expiry_ms
    }
    public(package) fun deactivate_for_expiry(registry: &mut MissionRegistry, mission_id: ID) {
        deactivate(registry, mission_id);
    }

    // ===== Internal =====
    fun register_and_emit(registry: &mut MissionRegistry, m: MissionShop): ID {
        let mission_id = object::id(&m);
        let registry_id = object::id(registry);
        let ev = MissionCreatedEvent {
            mission_id, registry_id, owner: m.owner, ssu_id: m.ssu_id, tribe_id: m.tribe_id,
            bazaar_type: m.bazaar_type, mission_type: m.mission_type,
            completion_mode: m.completion_mode,
            max_runs: m.max_runs, reward_eve_per_run: m.reward_eve_per_run,
            reward_token_per_run: m.reward_token_per_run,
            taker_time_limit_ms: m.taker_time_limit_ms,
            position_x: m.position_x, position_y: m.position_y,
            expiry_ms: m.expiry_ms, timestamp_ms: m.created_at_ms,
            collateral_eve_per_run: m.collateral_eve_per_run,
            collateral_token_per_run: m.collateral_token_per_run,
            visibility_roles: m.visibility_roles,
        };
        let ssu_id = m.ssu_id;
        table::add(&mut registry.missions, mission_id, true);
        // GAS-12: push inline MissionPosition (no DOF borrow at position-check time).
        let pos = MissionPosition { id: mission_id, x: m.position_x, y: m.position_y };
        if (table::contains(&registry.missions_by_ssu, ssu_id)) {
            vector::push_back(table::borrow_mut(&mut registry.missions_by_ssu, ssu_id), pos);
        } else {
            let mut v = vector::empty<MissionPosition>();
            vector::push_back(&mut v, pos);
            table::add(&mut registry.missions_by_ssu, ssu_id, v);
        };
        dof::add(&mut registry.id, mission_id, m);
        event::emit(ev);
        mission_id
    }

    fun deactivate(registry: &mut MissionRegistry, mission_id: ID) {
        let ssu_id = { borrow_mission(registry, mission_id).ssu_id };
        if (table::contains(&registry.missions_by_ssu, ssu_id)) {
            // GAS-12: scan MissionPosition records by id; keep swap_remove (A7/GAS-13 compat).
            let v = table::borrow_mut(&mut registry.missions_by_ssu, ssu_id);
            let n = vector::length(v);
            let mut i = 0;
            let mut found_idx = n; // sentinel: n means not found
            while (i < n) {
                if (vector::borrow(v, i).id == mission_id) { found_idx = i; break };
                i = i + 1;
            };
            if (found_idx < n) { vector::swap_remove(v, found_idx); };
        };
        if (table::contains(&registry.missions, mission_id)) {
            *table::borrow_mut(&mut registry.missions, mission_id) = false;
        };
        let m = borrow_mission_mut(registry, mission_id);
        m.is_active = false;
    }

    // GAS-14 / SA-GAS14-01: terminal-settlement sites use THIS instead of
    // deactivate + a separate is_settled write. Merges two &mut borrows into one.
    // MUST NOT be called from deactivate_for_expiry — expiry must leave is_settled=false
    // so cancel_mission -> assert_cancellable (!is_settled check) still passes.
    // Callers: auto_close_if_exhausted only.
    // Package-internal callers: deactivate_and_settle_internal (see below).
    fun deactivate_and_settle(registry: &mut MissionRegistry, mission_id: ID) {
        let ssu_id = { borrow_mission(registry, mission_id).ssu_id };
        if (table::contains(&registry.missions_by_ssu, ssu_id)) {
            // GAS-12: scan MissionPosition records by id; keep swap_remove (A7/GAS-13 compat).
            let v = table::borrow_mut(&mut registry.missions_by_ssu, ssu_id);
            let n = vector::length(v);
            let mut i = 0;
            let mut found_idx = n;
            while (i < n) {
                if (vector::borrow(v, i).id == mission_id) { found_idx = i; break };
                i = i + 1;
            };
            if (found_idx < n) { vector::swap_remove(v, found_idx); };
        };
        if (table::contains(&registry.missions, mission_id)) {
            *table::borrow_mut(&mut registry.missions, mission_id) = false;
        };
        // Single &mut: is_active=false + is_settled=true in one DOF cycle.
        let m = borrow_mission_mut(registry, mission_id);
        m.is_active = false;
        m.is_settled = true;
    }

    // GAS-14: package-visible alias so mission_escrow finalize fns can call
    // deactivate_and_settle in one &mut DOF cycle instead of deactivate_internal +
    // set_settled_internal (two cycles; same net state, no intervening reader).
    public(package) fun deactivate_and_settle_internal(
        registry: &mut MissionRegistry, mission_id: ID,
    ) {
        deactivate_and_settle(registry, mission_id);
    }

    // ===== Borrow helpers =====
    public(package) fun borrow_mission(registry: &MissionRegistry, mission_id: ID): &MissionShop {
        assert!(table::contains(&registry.missions, mission_id), E_MISSION_NOT_FOUND);
        dof::borrow(&registry.id, mission_id)
    }
    public(package) fun borrow_mission_mut(
        registry: &mut MissionRegistry, mission_id: ID,
    ): &mut MissionShop {
        assert!(table::contains(&registry.missions, mission_id), E_MISSION_NOT_FOUND);
        dof::borrow_mut(&mut registry.id, mission_id)
    }

    // ===== Public accessors =====
    public fun mission_addr(m: &MissionShop): address { object::id_address(m) }
    public fun mission_owner(m: &MissionShop): address { m.owner }
    public fun mission_ssu(m: &MissionShop): address { m.ssu_id }
    public fun mission_tribe_id(m: &MissionShop): u64 { m.tribe_id }
    public fun mission_bazaar_type(m: &MissionShop): u8 { m.bazaar_type }
    public fun mission_completion_mode(m: &MissionShop): u8 { m.completion_mode }
    public fun mission_is_active(m: &MissionShop): bool { m.is_active }
    public fun mission_is_settled(m: &MissionShop): bool { m.is_settled }
    public fun mission_max_runs(m: &MissionShop): u64 { m.max_runs }
    public fun mission_runs_completed(m: &MissionShop): u64 { m.runs_completed }
    public fun mission_reward_eve_per_run(m: &MissionShop): u64 { m.reward_eve_per_run }
    public fun mission_reward_token_per_run(m: &MissionShop): u64 { m.reward_token_per_run }
    public fun mission_proof_items(m: &MissionShop): &vector<ItemReq> { &m.proof_items }
    public fun mission_reward_items(m: &MissionShop): &vector<ItemReq> { &m.reward_items }
    public fun req_type_id(r: &ItemReq): u64 { r.type_id }
    public fun req_amount(r: &ItemReq): u64 { r.amount }
    public fun mode_item_proof(): u8 { MODE_ITEM_PROOF }
    public fun mode_other(): u8 { MODE_OTHER }
    public fun status_pending(): u8 { STATUS_PENDING }
    /// GAS-12: map vector<MissionPosition> → vector<ID>. Returns ALL present ids.
    /// In production the vector holds only active missions (both deactivation paths remove).
    /// Callers: ssu_rebind_mission_guard::assert_no_active_missions_for_rebind (re-reads
    /// live mission_is_active) + C4 locking tests.
    public fun ssu_mission_ids(registry: &MissionRegistry, ssu_id: address): vector<ID> {
        if (!table::contains(&registry.missions_by_ssu, ssu_id)) return vector::empty<ID>();
        let positions = table::borrow(&registry.missions_by_ssu, ssu_id);
        let n = vector::length(positions);
        let mut out = vector::empty<ID>();
        let mut i = 0;
        while (i < n) {
            vector::push_back(&mut out, vector::borrow(positions, i).id);
            i = i + 1;
        };
        out
    }
    public fun has_mission(registry: &MissionRegistry, mission_id: ID): bool {
        table::contains(&registry.missions, mission_id)
    }

    /// V41 SSU depreciation prune (bazaar_economy::ssu_depreciation_economy, P4): bare-public
    /// cross-package read of a mission's own ssu_id + tribe_id by id. Needed because
    /// borrow_mission is public(package) (bazaar_mission-only) and CR-DEP-02
    /// (Documentation/reports/critic/ssu-depreciation-prune-plan-audit-2026-07-12.md) requires
    /// the economy prune entry to bind its ledger argument to the MISSION's own stored
    /// tribe_id, NOT ssu_gov.tribe_id -- ssu_rebind never touches missions (SA-REBIND-01), so a
    /// mission's tribe_id can diverge from the SSU's current tribe binding after a rebind.
    /// Read-only, no cap, no mutation -- mirrors the has_mission precedent immediately above.
    public fun mission_ssu_and_tribe(registry: &MissionRegistry, mission_id: ID): (address, u64) {
        let m = borrow_mission(registry, mission_id);
        (mission_ssu(m), mission_tribe_id(m))
    }

    /// V41 SSU depreciation prune P4b (bazaar_economy::ssu_depreciation_economy::
    /// prune_depreciated_mission_reward_token, CR-P4-01 -- mandated by the P4 critic review
    /// Documentation/reports/critic/ssu-depreciation-prune-P4-review-2026-07-13.md §8): bare-public
    /// cross-package read of a mission's own owner + is_settled flag by id. A SIBLING of
    /// mission_ssu_and_tribe immediately above, NOT a widening of it -- the P4 review §8 point 4
    /// requires a separate getter rather than growing that already-verified two-value signature.
    /// Read-only, no cap, no mutation.
    public fun mission_owner_and_settled(registry: &MissionRegistry, mission_id: ID): (address, bool) {
        let m = borrow_mission(registry, mission_id);
        (mission_owner(m), mission_is_settled(m))
    }

    public fun mission_runs_in_progress_count(m: &MissionShop): u64 { m.runs_in_progress }

    // ===== Package-internal helpers for mission_escrow =====
    public(package) fun make_item_req(type_id: u64, amount: u64): ItemReq { ItemReq { type_id, amount } }
    public(package) fun add_reward_bundle(m: &mut MissionShop, idx: u64, bundle: vector<Item>) {
        df::add(&mut m.id, RewardBundleKey { idx }, bundle);
    }
    public(package) fun set_reward_bundles_total(m: &mut MissionShop, n: u64) { m.reward_bundles_total = n; }
    public(package) fun has_more_bundles(m: &MissionShop): bool {
        m.reward_bundles_paid < m.reward_bundles_total
    }
    public(package) fun has_pending_proof(m: &MissionShop): bool {
        m.proof_escrow_next < m.proof_escrow_count
    }
    public(package) fun pop_proof_escrow(m: &mut MissionShop): vector<Item> {
        let items: vector<Item> = df::remove(&mut m.id, ProofEscrowKey { seq: m.proof_escrow_next });
        m.proof_escrow_next = m.proof_escrow_next + 1;
        items
    }
    public(package) fun mission_eve_balance(m: &MissionShop): u64 { balance::value(&m.reward_eve) }
    public(package) fun take_eve_balance(m: &mut MissionShop, amt: u64): Balance<EVE> {
        balance::split(&mut m.reward_eve, amt)
    }
    public(package) fun mission_bundles_remaining(m: &MissionShop): u64 {
        m.reward_bundles_total - m.reward_bundles_paid
    }

    // ===== Item-req builders + reward-bundle escrow (create-time) =====
    // Kept in mission.move (alongside the create fns that call them) to avoid a
    // mission <-> mission_escrow module dependency cycle.
    fun build_item_reqs(type_ids: vector<u64>, amounts: vector<u64>): vector<ItemReq> {
        let n = vector::length(&type_ids);
        assert!(n == vector::length(&amounts), E_ITEM_QUANTITY_MISMATCH);
        let mut v = vector::empty<ItemReq>();
        let mut i = 0;
        while (i < n) {
            vector::push_back(&mut v, make_item_req(
                *vector::borrow(&type_ids, i),
                *vector::borrow(&amounts, i),
            ));
            i = i + 1;
        };
        v
    }

    fun escrow_reward_bundles(m: &mut MissionShop, mut bundles: vector<vector<Item>>) {
        if (vector::is_empty(&m.reward_items)) {
            assert!(vector::is_empty(&bundles), E_BUNDLE_COUNT_MISMATCH);
            vector::destroy_empty(bundles);
            return
        };
        assert!(vector::length(&bundles) == m.max_runs, E_BUNDLE_COUNT_MISMATCH);
        let mut idx = 0u64;
        while (!vector::is_empty(&bundles)) {
            let bundle = vector::pop_back(&mut bundles);
            assert_bundle_satisfies(&m.reward_items, &bundle);
            add_reward_bundle(m, idx, bundle);
            idx = idx + 1;
        };
        vector::destroy_empty(bundles);
        let total = m.max_runs;
        set_reward_bundles_total(m, total);
    }

    fun assert_bundle_satisfies(spec: &vector<ItemReq>, items: &vector<Item>) {
        let s = vector::length(spec);
        let mut i = 0;
        while (i < s) {
            let req = vector::borrow(spec, i);
            let mut have = 0u64;
            let mut j = 0;
            let n = vector::length(items);
            while (j < n) {
                let it = vector::borrow(items, j);
                if (inventory::type_id(it) == req.type_id) {
                    have = have + (inventory::quantity(it) as u64);
                };
                j = j + 1;
            };
            assert!(have >= req.amount, E_ITEM_QUANTITY_MISMATCH);
            i = i + 1;
        };
    }

    #[test_only]
    public fun share_registry_for_testing(r: MissionRegistry) { transfer::share_object(r); }

    /// GAS-12 test helper: create a MissionRegistry without sharing it (for tests using
    /// tx_context::dummy() that cannot take_shared). The `missions_by_ssu` field now holds
    /// vector<MissionPosition> per GAS-12.
    #[test_only]
    public fun create_mission_registry_for_testing(ctx: &mut TxContext): MissionRegistry {
        MissionRegistry { id: object::new(ctx), missions: table::new(ctx), missions_by_ssu: table::new(ctx) }
    }

    /// V41 SSU depreciation prune P5 (bazaar_mission::ssu_depreciation_missions_*_tests): build a
    /// bt 0/1 EVE mission directly for testing, bypassing create_mission_notribe/create_mission_easy's
    /// fee-charging (mission_fees::charge_notribe/charge_easy) and ban wrappers -- neither is
    /// exercised by the prune-entry tests (which test Phase-B refund/close behavior, not Phase-A
    /// creation). Reuses build_eve_mission + register_and_emit VERBATIM (both private to this module,
    /// zero duplicated business logic) -- the ONLY simplification is skipping the two wrapper fns'
    /// fee/ban checks, mirroring this module's own build_eve_mission/register_and_emit split (fee
    /// charging already lives OUTSIDE build_eve_mission in production). bazaar_type is taken from
    /// `gov` (0 or 1) -- build_eve_mission places no bazaar_type restriction of its own, unlike
    /// create_mission_notribe/easy's own bt==0/bt==1 asserts, so this one helper serves both.
    /// Fixed at: mission_type=0, stand-in title/description, completion_mode=MODE_ITEM_PROOF, no
    /// proof items or reward bundles (item-bearing missions are built separately via the already
    /// public(package) add_reward_bundle/set_reward_bundles_total/stash_proof primitives -- see
    /// ssu_depreciation_missions_items_tests.move's own header; WorldStub's Item::quantity/type_id
    /// are abort-0 stubs, so escrow_reward_bundles/assert_bundle_satisfies can never pass in a unit
    /// test), taker_time_limit_ms=1h, duration_ms=1h+1ms (> MIN_DURATION_MS), visibility_roles=
    /// VIS_EVERYONE -- none of these are under test in the prune-entry suites (which test Phase-B
    /// refund/close mechanics against reward_eve_per_run/max_runs/collateral_eve_per_run, the values
    /// callers DO control here). NOTE (critic P5 review R2 caveat): VIS_EVERYONE is LOAD-BEARING for
    /// the economy Entry-3/Entry-4 test files -- mission_lifecycle::advance_accept runs
    /// mission::assert_visible_to, which aborts E_MISSION_NOT_VISIBLE for a non-member taker on any
    /// non-EVERYONE visibility; do not lower this constant without also updating those call sites.
    #[test_only]
    public fun create_eve_mission_for_testing(
        registry: &mut MissionRegistry,
        gov: &SSUGovernance,
        reward_eve_per_run: u64,
        max_runs: u64,
        collateral_eve_per_run: u64,
        reward_eve: Coin<EVE>,
        position_x: u64,
        position_y: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        let m = build_eve_mission(
            registry, gov,
            0,                  // mission_type
            b"Test",            // title
            b"",                // description
            MODE_ITEM_PROOF,    // completion_mode
            vector[], vector[], // proof_type_ids / proof_amounts (empty)
            vector[], vector[], // reward_type_ids / reward_amounts (empty -- no bundles here)
            max_runs, reward_eve_per_run, reward_eve, vector[],
            3_600_000,          // taker_time_limit_ms
            3_600_001,          // duration_ms (> MIN_DURATION_MS)
            position_x, position_y,
            collateral_eve_per_run,
            VIS_EVERYONE,
            clock, ctx,
        );
        register_and_emit(registry, m)
    }

    #[test_only]
    public fun e_player_banned(): u64 { E_PLAYER_BANNED }

    // GAS-14 locking tests: exposes the private abort code for #[expected_failure].
    #[test_only]
    public fun e_no_acceptance(): u64 { E_NO_ACCEPTANCE }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
