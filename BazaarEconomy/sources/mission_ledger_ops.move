// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazaar_economy::mission_ledger_ops — Advanced tribe-token money twin for
/// Mission (MIS) shops. ATOMIC: each entry fn calls the cap-gated bazaar_core
/// advance fn which returns (per_run_token, taker, mission_addr); this module
/// then does the ledger debit/credit IN THE SAME CALL. No free taker param on
/// the money path. Token movements conserve total_supply (debit/credit between
/// rows, no mint/burn). No dApp layer (Advanced bazaar).
module bazaar_economy::mission_ledger_ops {
    use sui::clock::{Self, Clock};
    use world::storage_unit::StorageUnit;
    use world::character::Character;
    use world::inventory::Item;
    use world::access::OwnerCap;
    use bazaar_mission::mission::{Self, MissionRegistry};
    use bazaar_mission::mission_complete;
    use bazaar_mission::mission_lifecycle;
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::membership::{Self, MemberRegistry};
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::economy_cap_store::{Self, EconomyCapStore};
    use bazaar_economy::mission_collateral_token_pool::{Self, MissionCollateralTokenPool};

    const MAX_U64_AS_U128: u128 = 18_446_744_073_709_551_615;

    const E_NOT_ADVANCED: u64 = 1;
    const E_WRONG_TRIBE: u64 = 2;
    const E_INSUFFICIENT_BALANCE: u64 = 5;
    const E_SSU_NOT_ACTIVE: u64 = 7;
    const E_LEDGER_FROZEN: u64 = 8;
    const E_MODE_NOT_SUPPORTED_FOR_OP: u64 = 11;
    const E_FEE_MISMATCH: u64 = 13;  // listing_fee_tokens != (ssu_fph + tribe_fph) × hours
    const E_AMOUNT_OVERFLOW: u64 = 14;
    const E_PLAYER_BANNED:   u64 = 15;
    const HOUR_MS: u64 = 3_600_000;

    fun checked_mul(a: u64, b: u64): u64 {
        let r = (a as u128) * (b as u128);
        assert!(r <= MAX_U64_AS_U128, E_AMOUNT_OVERFLOW);
        (r as u64)
    }

    // ===== Create (Advanced) =====
    public fun create_mission_advanced(
        registry: &mut MissionRegistry,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        cap_store: &EconomyCapStore,
        members: &MemberRegistry,
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
        listing_fee_tokens: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        let creator = tx_context::sender(ctx);
        // CC-B2-06 / AUD-ADV-12: Static membership ban for Advanced create.
        // construct_mission_advanced does not receive MemberRegistry; the check lives here.
        // tribe-global ban + SSU timed ban are in construct_mission_advanced.
        assert!(!membership::is_banned(members, creator), E_PLAYER_BANNED);

        // Listing-fee split (token-denominated): SSU + Tribe layers, NO Dapp layer.
        // total_fee = (ssu_fph + tribe_fph) × hours; debited from the creator's ledger
        // row and credited to the SSU/Tribe ledger accounts (conserves total_supply).
        let hours = duration_ms / HOUR_MS;
        let ssu_fee = checked_mul(ssu_governance::ssu_mission_listing_fee_per_hour(ssu_gov), hours);
        let tribe_fee = checked_mul(tribe_governance::tribe_mission_listing_fee_per_hour(tribe_gov), hours);
        let total_fee = ssu_fee + tribe_fee;
        assert!(listing_fee_tokens == total_fee, E_FEE_MISMATCH);

        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let m = mission::construct_mission_advanced(
            ssu_gov, tribe_gov, mission_type, title, description, completion_mode,
            proof_type_ids, proof_amounts, reward_type_ids, reward_amounts,
            max_runs, reward_token_per_run, collateral_token_per_run, visibility_roles,
            reward_bundles,
            taker_time_limit_ms, duration_ms, position_x, position_y,
            shop_cap, clock, ctx,
        );
        let mission_addr = mission::mission_addr(&m);

        // Lock the escrowed token reward (reward_token_per_run × runs).
        let total_lock = checked_mul(reward_token_per_run, max_runs);
        if (total_lock > 0) {
            // GAS-02: removed redundant balance_of + pre-assert; debit carries its own >= guard.
            tribe_token_ledger::debit(ledger, creator, total_lock);
            tribe_token_ledger::credit(ledger, mission_addr, total_lock);
        };

        // Charge the listing fee from the creator's ledger balance.
        if (total_fee > 0) {
            // GAS-02: removed redundant balance_of + pre-assert; debit carries its own >= guard.
            tribe_token_ledger::debit(ledger, creator, total_fee);
            if (ssu_fee > 0) {
                let ssu_addr = ssu_governance::ssu_id(ssu_gov);
                tribe_token_ledger::credit_with_event(ledger, creator, ssu_addr, ssu_fee, b"mission_fee_ssu", clock);
            };
            if (tribe_fee > 0) {
                let tribe_addr = object::id_address(tribe_gov);
                tribe_token_ledger::credit_with_event(ledger, creator, tribe_addr, tribe_fee, b"mission_fee_tribe", clock);
            };
        };

        mission::register_mission_advanced(registry, m, shop_cap)
    }

    // ===== Item-proof complete (Advanced) — atomic =====
    public fun complete_mission_with_items_advanced(
        registry: &mut MissionRegistry, mission_id: ID,
        ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger, cap_store: &EconomyCapStore,
        ssu: &mut StorageUnit, proof_items: vector<Item>, giver_character: &Character,
        coll_pool: &mut MissionCollateralTokenPool,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        mission_collateral_token_pool::assert_pool_for_ssu(coll_pool, ssu_gov);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let (amount, taker, mission_addr, coll_amount) = mission_complete::advance_item_completion_advanced(
            registry, mission_id, ssu_gov, ssu, proof_items, giver_character, shop_cap, clock, ctx,
        );
        settle_token(ledger, mission_addr, taker, amount, clock);
        // Refund collateral 100% to taker (SA-V34-01: guard)
        if (coll_amount > 0) {
            let popped = mission_collateral_token_pool::take_full(
                coll_pool, mission_addr, taker, 0,
            );
            if (popped > 0) {
                tribe_token_ledger::credit_with_event(
                    ledger, mission_addr, taker, popped, b"mission_collateral_refund", clock,
                );
                let now = clock::timestamp_ms(clock);
                mission::emit_collateral_refunded(object::id_from_address(mission_addr), taker, popped, 1, 0, now);
            };
        };
    }

    public fun complete_mission_with_items_advanced_as_ssu_owner(
        registry: &mut MissionRegistry, mission_id: ID,
        ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger, cap_store: &EconomyCapStore,
        ssu: &mut StorageUnit, proof_items: vector<Item>,
        giver_character: &Character, taker_character: &Character,
        taker_owner_cap: &OwnerCap<StorageUnit>,
        coll_pool: &mut MissionCollateralTokenPool,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        mission_collateral_token_pool::assert_pool_for_ssu(coll_pool, ssu_gov);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let (amount, taker, mission_addr, coll_amount) = mission_complete::advance_item_completion_advanced_as_ssu_owner(
            registry, mission_id, ssu_gov, ssu, proof_items,
            giver_character, taker_character, taker_owner_cap, shop_cap, clock, ctx,
        );
        settle_token(ledger, mission_addr, taker, amount, clock);
        // Refund collateral 100% to taker (SA-V34-01: guard)
        if (coll_amount > 0) {
            let popped = mission_collateral_token_pool::take_full(
                coll_pool, mission_addr, taker, 0,
            );
            if (popped > 0) {
                tribe_token_ledger::credit_with_event(
                    ledger, mission_addr, taker, popped, b"mission_collateral_refund", clock,
                );
                let now = clock::timestamp_ms(clock);
                mission::emit_collateral_refunded(object::id_from_address(mission_addr), taker, popped, 1, 0, now);
            };
        };
    }

    // ===== Other-mode submit (Advanced) — no token move =====
    public fun complete_mission_other_advanced(
        registry: &mut MissionRegistry, mission_id: ID,
        ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        ledger: &TribeTokenLedger, cap_store: &EconomyCapStore,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        mission_complete::advance_submit_other_advanced(registry, mission_id, ssu_gov, shop_cap, clock, ctx);
    }

    // ===== Other-mode confirm (Advanced) — atomic =====
    public fun confirm_completion_advanced(
        registry: &mut MissionRegistry, mission_id: ID,
        ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger, cap_store: &EconomyCapStore,
        taker: address, ssu: &mut StorageUnit, taker_character: &Character,
        coll_pool: &mut MissionCollateralTokenPool,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        mission_collateral_token_pool::assert_pool_for_ssu(coll_pool, ssu_gov);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let (amount, rcv_taker, mission_addr, coll_amount) = mission_complete::advance_confirm_advanced(
            registry, mission_id, ssu_gov, taker, ssu, taker_character, shop_cap, clock, ctx,
        );
        settle_token(ledger, mission_addr, rcv_taker, amount, clock);
        // Refund collateral 100% to taker (SA-V34-01: guard)
        if (coll_amount > 0) {
            let popped = mission_collateral_token_pool::take_full(
                coll_pool, mission_addr, rcv_taker, 0,
            );
            if (popped > 0) {
                tribe_token_ledger::credit_with_event(
                    ledger, mission_addr, rcv_taker, popped, b"mission_collateral_refund", clock,
                );
                let now = clock::timestamp_ms(clock);
                mission::emit_collateral_refunded(object::id_from_address(mission_addr), rcv_taker, popped, 1, 0, now);
            };
        };
    }

    // ===== Other-mode reject (Advanced) — SA-V34-09: 100% collateral refund to taker =====
    public fun reject_completion_advanced(
        registry: &mut MissionRegistry, mission_id: ID,
        ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger, cap_store: &EconomyCapStore,
        taker: address,
        coll_pool: &mut MissionCollateralTokenPool,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        mission_collateral_token_pool::assert_pool_for_ssu(coll_pool, ssu_gov);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        // advance_reject_advanced now returns collateral_amount (SA-V34-02)
        let coll_amount = mission_complete::advance_reject_advanced(
            registry, mission_id, ssu_gov, taker, shop_cap, clock, ctx,
        );
        // SA-V34-09: 100% refund to taker on reject (taker did work; giver declined)
        // SA-V34-01: guard credit
        if (coll_amount > 0) {
            let mission_addr = object::id_to_address(&mission_id);
            let popped = mission_collateral_token_pool::take_full(coll_pool, mission_addr, taker, 1);
            if (popped > 0) {
                // CC-V34-03: ledger param is &mut TribeTokenLedger; pass directly (no ledger_as_mut())
                tribe_token_ledger::credit_with_event(
                    ledger, mission_addr, taker, popped, b"mission_collateral_refund", clock,
                );
                let now = clock::timestamp_ms(clock);
                mission::emit_collateral_refunded(mission_id, taker, popped, 1, 1, now);
            };
        };
    }

    // ===== V34 Advanced accept / cancel / expire =====

    /// V34: Advanced accept — visibility gate + token collateral earmark.
    /// SA-V34-01: guards debit/credit with if (C > 0).
    /// SA-V34-07: zero-collateral skips earmark entirely.
    /// SA-V34-04: uses advance_accept (cap-gated in mission_lifecycle).
    public fun accept_mission_advanced(
        registry: &mut MissionRegistry,
        mission_id: ID,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        members: &MemberRegistry,
        ledger: &mut TribeTokenLedger,
        coll_pool: &mut MissionCollateralTokenPool,
        cap_store: &EconomyCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        // SA-V34-06: pool anchor
        mission_collateral_token_pool::assert_pool_for_ssu(coll_pool, ssu_gov);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        // SA-V34-04: cap-gated — advance_accept runs visibility gate + add_acceptance
        let (taker, coll_token) = mission_lifecycle::advance_accept(
            registry, mission_id, ssu_gov, members, tribe_gov, shop_cap, clock, ctx,
        );
        // SA-V34-01 + SA-V34-07: guard entire earmark block
        if (coll_token > 0) {
            // GAS-02: removed redundant balance_of + pre-assert; debit carries its own >= guard.
            tribe_token_ledger::debit(ledger, taker, coll_token);
            mission_collateral_token_pool::credit(coll_pool, object::id_to_address(&mission_id), taker, coll_token);
            mission::emit_collateral_posted(mission_id, taker, coll_token, 1, clock::timestamp_ms(clock));
        };
    }

    /// V34: Advanced cancel-my-acceptance. 50/50 split to giver + taker ledger rows.
    /// SA-V34-01: BOTH credit legs independently guarded with if (share > 0).
    public fun cancel_my_acceptance_advanced(
        registry: &mut MissionRegistry,
        mission_id: ID,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        coll_pool: &mut MissionCollateralTokenPool,
        cap_store: &EconomyCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        mission_collateral_token_pool::assert_pool_for_ssu(coll_pool, ssu_gov);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let (taker, giver, collateral_amount) = mission_lifecycle::advance_cancel_my_acceptance(
            registry, mission_id, ssu_gov, shop_cap, clock, ctx,
        );
        if (collateral_amount > 0) {
            let mission_addr = object::id_to_address(&mission_id);
            // SA-V34-01: both legs guarded independently
            let (giver_share, taker_share) = mission_collateral_token_pool::take_split(
                coll_pool, mission_addr, taker, giver,
            );
            if (giver_share > 0) {
                tribe_token_ledger::credit_with_event(
                    ledger, taker, giver, giver_share, b"mission_collateral_split", clock,
                );
            };
            if (taker_share > 0) {
                tribe_token_ledger::credit_with_event(
                    ledger, taker, taker, taker_share, b"mission_collateral_split", clock,
                );
            };
            let now = clock::timestamp_ms(clock);
            mission::emit_collateral_split(mission_id, taker, giver, taker_share, giver_share, 1, now);
        };
    }

    /// V34: Advanced expire — forfeit collateral 100% to giver's ledger row.
    /// SA-V34-01: guard credit with if (amount > 0).
    /// §6.3: credit giver's row directly (NOT tribe vault — token, not real EVE).
    public fun expire_acceptance_advanced(
        registry: &mut MissionRegistry,
        mission_id: ID, taker: address,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        coll_pool: &mut MissionCollateralTokenPool,
        cap_store: &EconomyCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        mission_collateral_token_pool::assert_pool_for_ssu(coll_pool, ssu_gov);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let (_, giver, collateral_amount) = mission_lifecycle::advance_expire_acceptance(
            registry, mission_id, taker, ssu_gov, shop_cap, clock, ctx,
        );
        if (collateral_amount > 0) {
            let mission_addr = object::id_to_address(&mission_id);
            let amount = mission_collateral_token_pool::take_full_for_forfeit(
                coll_pool, mission_addr, taker, giver,
            );
            // SA-V34-01: guard credit
            if (amount > 0) {
                tribe_token_ledger::credit_with_event(
                    ledger, taker, giver, amount, b"mission_collateral_forfeit", clock,
                );
            };
            let now = clock::timestamp_ms(clock);
            mission::emit_collateral_forfeited(mission_id, taker, giver, amount, 1, now);
        };
    }

    // ===== Cancel refund (Advanced) — Player Locker bundles + token refund =====
    public fun cancel_mission_advanced(
        registry: &mut MissionRegistry, mission_id: ID,
        ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger, cap_store: &EconomyCapStore,
        ssu: &mut StorageUnit, owner_character: &Character,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let (refund, owner, mission_addr) = mission_complete::advance_cancel_advanced(
            registry, mission_id, ssu_gov, ssu, owner_character, shop_cap, clock, ctx,
        );
        if (refund > 0) {
            tribe_token_ledger::debit(ledger, mission_addr, refund);
            tribe_token_ledger::credit_with_event(ledger, mission_addr, owner, refund, b"mission_refund", clock);
        };
    }

    // ===== Cancel refund (Advanced), owner == ssu owner — Main Storage bundles =====
    public fun cancel_mission_advanced_as_ssu_owner(
        registry: &mut MissionRegistry, mission_id: ID,
        ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger, cap_store: &EconomyCapStore,
        ssu: &mut StorageUnit, owner_character: &Character,
        ssu_owner_cap: &OwnerCap<StorageUnit>,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let (refund, owner, mission_addr) = mission_complete::advance_cancel_advanced_as_ssu_owner(
            registry, mission_id, ssu_gov, ssu, owner_character, ssu_owner_cap, shop_cap, clock, ctx,
        );
        if (refund > 0) {
            tribe_token_ledger::debit(ledger, mission_addr, refund);
            tribe_token_ledger::credit_with_event(ledger, mission_addr, owner, refund, b"mission_refund", clock);
        };
    }

    // ===== Update Ceremony admin drain (Advanced token twin) =====

    /// Ceremony admin: refund token collateral 100% to each taker (no-fault).
    /// Pageable + idempotent (absent takers skipped via the cap-gated
    /// advance_admin_remove_acceptance existence guard). Does NOT close the
    /// mission — call admin_force_cancel_mission_advanced after all settle.
    /// C-6: dual-gated by &DAppOwnerCap AND the EconomyCapStore shop cap.
    public fun admin_force_settle_acceptances_advanced(
        _dapp_cap: &DAppOwnerCap,
        registry: &mut MissionRegistry, mission_id: ID,
        ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger, cap_store: &EconomyCapStore,
        coll_pool: &mut MissionCollateralTokenPool,
        takers: vector<address>,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        mission_collateral_token_pool::assert_pool_for_ssu(coll_pool, ssu_gov); // C-5
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let mission_addr = object::id_to_address(&mission_id);
        let now = clock::timestamp_ms(clock);
        let n = vector::length(&takers);
        let mut i = 0;
        while (i < n) {
            let taker = *vector::borrow(&takers, i);
            let (existed, coll) = mission_lifecycle::advance_admin_remove_acceptance(
                registry, mission_id, taker, shop_cap,
            );
            if (existed && coll > 0) {
                let popped = mission_collateral_token_pool::take_full(coll_pool, mission_addr, taker, 0);
                if (popped > 0) {
                    tribe_token_ledger::credit_with_event(
                        ledger, mission_addr, taker, popped, b"mission_collateral_refund", clock,
                    );
                    mission::emit_collateral_refunded(mission_id, taker, popped, 1, 0, now);
                };
            };
            i = i + 1;
        };
    }

    /// Ceremony admin: close a fully-settled Advanced mission. Remaining reward
    /// bundles -> giver Player Locker (via cap-gated advance_admin_cancel which
    /// pins giver_character to mission.owner + requires runs_in_progress == 0);
    /// remaining escrowed token reward debited from the mission row, credited to
    /// the giver. C-6: dual-gated by &DAppOwnerCap AND the shop cap.
    public fun admin_force_cancel_mission_advanced(
        _dapp_cap: &DAppOwnerCap,
        registry: &mut MissionRegistry, mission_id: ID,
        ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger, cap_store: &EconomyCapStore,
        ssu: &mut StorageUnit, giver_character: &Character,
        clock: &Clock, ctx: &mut TxContext,
    ) {
        validate_ctx(ssu_gov, tribe_gov, ledger);
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let (refund, owner, mission_addr) = mission_complete::advance_admin_cancel(
            registry, mission_id, ssu_gov, ssu, giver_character, shop_cap, clock, ctx,
        );
        if (refund > 0) {
            tribe_token_ledger::debit(ledger, mission_addr, refund);
            tribe_token_ledger::credit_with_event(ledger, mission_addr, owner, refund, b"mission_refund", clock);
        };
    }

    // ===== Internal =====
    fun settle_token(
        ledger: &mut TribeTokenLedger, mission_addr: address, taker: address,
        amount: u64, clock: &Clock,
    ) {
        if (amount > 0) {
            tribe_token_ledger::debit(ledger, mission_addr, amount);
            tribe_token_ledger::credit_with_event(ledger, mission_addr, taker, amount, b"mission_reward", clock);
        };
    }

    fun validate_ctx(ssu_gov: &SSUGovernance, tribe_gov: &TribeGovernance, ledger: &TribeTokenLedger) {
        assert!(ssu_governance::ssu_bazaar_type(ssu_gov) == 2, E_NOT_ADVANCED);
        assert!(ssu_governance::ssu_is_active(ssu_gov), E_SSU_NOT_ACTIVE);
        assert!(tribe_governance::tribe_governance_mode(tribe_gov) == 0, E_MODE_NOT_SUPPORTED_FOR_OP);
        assert!(tribe_token_ledger::tribe_id(ledger) == ssu_governance::ssu_tribe_id(ssu_gov), E_WRONG_TRIBE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
