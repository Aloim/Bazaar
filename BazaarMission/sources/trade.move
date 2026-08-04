// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// V35 package split: relocated verbatim from bazaar_core::trade (bazaar_core
/// exceeded Sui's 102,400-byte published-object limit). Leaf-consumer of
/// bazaar_core public API; owns its own structs (TradeRegistry/TradeProposal).
/// Only delta vs bazaar_core: assert_advanced -> assert_advanced_external
/// (cross-package wrapper, Constitution Article I.4).
module bazaar_mission::trade {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use sui::transfer;
    use EVE::EVE::EVE;
    use bazaar_core::bazaar_core_admin::TribeTokenShopCap;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazaar_assertions;
    // UpdateCeremonyPlan v1 admin batch
    use bazaar_core::admin_drain_events;
    use dapp_hub::dapp_governance::DAppOwnerCap;

    // ===== Status Constants =====
    const PENDING: u8 = 0;
    const ACCEPTED: u8 = 1;
    const REJECTED: u8 = 2;
    const CANCELLED: u8 = 3;
    const EXPIRED: u8 = 4;

    // ===== Error Codes =====
    const E_PROPOSAL_NOT_FOUND: u64 = 1;
    const E_NOT_COUNTERPARTY: u64 = 2;
    const E_NOT_PROPOSER: u64 = 3;
    const E_ALREADY_RESOLVED: u64 = 4;
    const E_PROPOSAL_EXPIRED: u64 = 5;
    const E_LENGTH_MISMATCH: u64 = 6;
    const E_WRONG_STATUS: u64 = 7;
    const E_AMOUNT_MISMATCH: u64 = 8; // R3.6 OS-18: counterparty payment must equal proposal.requested_eve
    const E_SSU_ID_MISMATCH: u64 = 9; // R5.2 SSU-id coherence mismatch in consume_proposal_for_ledger
    // UpdateCeremonyPlan v1 admin batch
    const E_BATCH_TOO_LARGE: u64 = 10;
    const E_PAGINATION_ZERO: u64 = 11;

    // UpdateCeremonyPlan v1 — page cap matched to all batch entries.
    const MAX_BATCH_ROWS: u64 = 100;

    // ===== Structs =====
    public struct TradeItem has store, copy, drop {
        item_type_id: u64,
        quantity: u64,
    }

    public struct TradeProposal has store {
        proposer: address,
        counterparty: address,
        ssu_id: address,
        tribe_id: u64,
        bazaar_type: u8,
        offered_items: vector<TradeItem>,
        requested_items: vector<TradeItem>,
        offered_eve: u64,
        requested_eve: u64,
        escrowed_eve: Balance<EVE>,
        status: u8,
        created_at_ms: u64,
        expiry_ms: u64,
    }

    public struct TradeRegistry has key {
        id: UID,
        proposals: Table<ID, TradeProposal>,
        proposal_count: u64,
    }

    // ===== Events =====
    public struct TradeProposalCreated has copy, drop {
        proposal_id: ID,
        proposer: address,
        counterparty: address,
        ssu_id: address,
        tribe_id: u64,
        bazaar_type: u8,
        timestamp_ms: u64,
    }

    public struct TradeCompleted has copy, drop {
        proposal_id: ID,
        proposer: address,
        counterparty: address,
        eve_amount: u64,
        timestamp_ms: u64,
    }

    public struct TradeCancelled has copy, drop {
        proposal_id: ID,
        by: address,
        timestamp_ms: u64,
    }

    public struct TradeExpired has copy, drop {
        proposal_id: ID,
        timestamp_ms: u64,
    }

    // ===== Init Helper =====
    public(package) fun create_trade_registry(ctx: &mut TxContext): TradeRegistry {
        TradeRegistry {
            id: object::new(ctx),
            proposals: table::new(ctx),
            proposal_count: 0,
        }
    }

    // FP1-09 (FP2 Phase E): One-time post-publish bootstrap.
    // Creates and shares the global TradeRegistry singleton.
    // Permissionless at MVP; authorization hardening is a future FP1-NEW ticket.
    // V35: PTB #2 of the cascade now targets bazaar_mission for this call.
    public entry fun bootstrap_trade_registry(ctx: &mut TxContext) {
        let registry = create_trade_registry(ctx);
        transfer::share_object(registry);
    }

    // ===== Internal Helpers =====
    fun build_items(type_ids: vector<u64>, quantities: vector<u64>): vector<TradeItem> {
        let n = vector::length(&type_ids);
        assert!(n == vector::length(&quantities), E_LENGTH_MISMATCH);
        let mut items = vector::empty<TradeItem>();
        let mut i = 0;
        while (i < n) {
            vector::push_back(&mut items, TradeItem {
                item_type_id: *vector::borrow(&type_ids, i),
                quantity: *vector::borrow(&quantities, i),
            });
            i = i + 1;
        };
        items
    }

    fun assert_pending(proposal: &TradeProposal) {
        assert!(proposal.status == PENDING, E_ALREADY_RESOLVED);
    }

    // ===== Public Functions =====
    public fun create_proposal(
        registry: &mut TradeRegistry,
        gov: &SSUGovernance, // R3.5 NEW: freeze + identity guard
        counterparty: address,
        ssu_id: address,
        tribe_id: u64,
        bazaar_type: u8,
        offered_item_type_ids: vector<u64>,
        offered_quantities: vector<u64>,
        requested_item_type_ids: vector<u64>,
        requested_quantities: vector<u64>,
        eve_payment: Coin<EVE>,
        requested_eve: u64,
        expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        ssu_governance::assert_not_frozen(gov);                    // R3.5
        ssu_governance::assert_active(gov);                         // R6.7.1 C-11 GATED
        ssu_governance::assert_subject_in_governance(gov, ssu_id); // R3.5 SA-R3-01
        let offered_items = build_items(offered_item_type_ids, offered_quantities);
        let requested_items = build_items(requested_item_type_ids, requested_quantities);
        let offered_eve = eve_payment.value();
        // Generate unique proposal ID via UID pattern
        let uid = object::new(ctx);
        let proposal_id = object::uid_to_inner(&uid);
        object::delete(uid);
        let ts = clock.timestamp_ms();
        let proposal = TradeProposal {
            proposer: ctx.sender(),
            counterparty, ssu_id, tribe_id, bazaar_type,
            offered_items, requested_items,
            offered_eve, requested_eve,
            escrowed_eve: eve_payment.into_balance(),
            status: PENDING,
            created_at_ms: ts, expiry_ms,
        };
        table::add(&mut registry.proposals, proposal_id, proposal);
        registry.proposal_count = registry.proposal_count + 1;
        event::emit(TradeProposalCreated {
            proposal_id, proposer: ctx.sender(), counterparty,
            ssu_id, tribe_id, bazaar_type, timestamp_ms: ts,
        });
        proposal_id
    }

    public fun accept_proposal(
        registry: &mut TradeRegistry,
        gov: &SSUGovernance, // R3.5 NEW: freeze + identity guard
        proposal_id: ID,
        eve_payment: Coin<EVE>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        let proposal_ssu_id = table::borrow(&registry.proposals, proposal_id).ssu_id;
        ssu_governance::assert_not_frozen(gov);                              // R3.5
        ssu_governance::assert_active(gov);                                   // R6.7.1 C-11 GATED
        ssu_governance::assert_subject_in_governance(gov, proposal_ssu_id); // R3.5 SA-R3-01
        let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
        assert!(ctx.sender() == proposal.counterparty, E_NOT_COUNTERPARTY);
        assert_pending(proposal);
        assert!(clock.timestamp_ms() <= proposal.expiry_ms, E_PROPOSAL_EXPIRED);
        let offered_val = proposal.escrowed_eve.value();
        let requested_val = eve_payment.value();
        assert!(requested_val == proposal.requested_eve, E_AMOUNT_MISMATCH); // R3.6 OS-18
        let proposer = proposal.proposer;
        let counterparty = proposal.counterparty;
        // Release proposer's escrow to counterparty
        let payout_to_counterparty = coin::from_balance(
            proposal.escrowed_eve.split(offered_val), ctx
        );
        transfer::public_transfer(payout_to_counterparty, counterparty);
        // Transfer counterparty's EVE to proposer
        transfer::public_transfer(eve_payment, proposer);
        proposal.status = ACCEPTED;
        let ts = clock.timestamp_ms();
        event::emit(TradeCompleted {
            proposal_id, proposer, counterparty,
            eve_amount: offered_val + requested_val, timestamp_ms: ts,
        });
    }

    public fun reject_proposal(
        registry: &mut TradeRegistry,
        proposal_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
        assert!(ctx.sender() == proposal.counterparty, E_NOT_COUNTERPARTY);
        assert_pending(proposal);
        let val = proposal.escrowed_eve.value();
        let proposer = proposal.proposer;
        let refund = coin::from_balance(proposal.escrowed_eve.split(val), ctx);
        transfer::public_transfer(refund, proposer);
        proposal.status = REJECTED;
        event::emit(TradeCancelled {
            proposal_id, by: ctx.sender(), timestamp_ms: clock.timestamp_ms(),
        });
    }

    public fun cancel_proposal(
        registry: &mut TradeRegistry,
        proposal_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
        assert!(ctx.sender() == proposal.proposer, E_NOT_PROPOSER);
        assert_pending(proposal);
        cancel_proposal_internal(proposal, proposal_id, ctx.sender(), clock, ctx);
    }

    /// UpdateCeremonyPlan v1 — extracted body of cancel_proposal (refund + status flip
    /// + TradeCancelled event emission), reused by cancel_trade_proposals_batch. Caller
    /// is responsible for proposer-match + assert_pending gates (the batch admin path
    /// skips proposer-match and silent-skips non-pending rows; the user path enforces both).
    public(package) fun cancel_proposal_internal(
        proposal: &mut TradeProposal,
        proposal_id: ID,
        by: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let val = proposal.escrowed_eve.value();
        let proposer = proposal.proposer;
        let refund = coin::from_balance(proposal.escrowed_eve.split(val), ctx);
        transfer::public_transfer(refund, proposer);
        proposal.status = CANCELLED;
        event::emit(TradeCancelled {
            proposal_id, by, timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Phase B entry 3: admin cancels every still-PENDING proposal in `proposal_ids`.
    /// Refunds proposer escrow + flips status + emits TradeCancelled per row (with
    /// `by = admin`). Silent skips for absent IDs and non-PENDING rows. One
    /// BatchDrainSummary at the end. ONE TradeRegistry singleton — FE pages the IDs.
    public entry fun cancel_trade_proposals_batch(
        _cap: &DAppOwnerCap,
        registry: &mut TradeRegistry,
        proposal_ids: vector<ID>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n = vector::length(&proposal_ids);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        let admin = ctx.sender();
        let mut processed: u64 = 0;
        let mut skipped: u64 = 0;
        let mut i: u64 = 0;
        while (i < n) {
            let pid = *vector::borrow(&proposal_ids, i);
            if (!table::contains(&registry.proposals, pid)) {
                skipped = skipped + 1;
            } else {
                let proposal = table::borrow_mut(&mut registry.proposals, pid);
                if (proposal.status != PENDING) {
                    skipped = skipped + 1;
                } else {
                    cancel_proposal_internal(proposal, pid, admin, clock, ctx);
                    processed = processed + 1;
                };
            };
            i = i + 1;
        };
        admin_drain_events::emit_summary(
            admin_drain_events::kind_cancel_trade(),
            processed,
            skipped,
            ctx,
            clock,
        );
    }

    public fun expire_proposal(
        registry: &mut TradeRegistry,
        proposal_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
        assert_pending(proposal);
        assert!(clock.timestamp_ms() > proposal.expiry_ms, E_PROPOSAL_EXPIRED);
        let val = proposal.escrowed_eve.value();
        let proposer = proposal.proposer;
        let refund = coin::from_balance(proposal.escrowed_eve.split(val), ctx);
        transfer::public_transfer(refund, proposer);
        proposal.status = EXPIRED;
        event::emit(TradeExpired { proposal_id, timestamp_ms: clock.timestamp_ms() });
    }

    /// Consume an ACCEPTED proposal for ledger settlement (bazaar_economy hook).
    /// Returns (proposer, counterparty, offered_items, requested_items).
    public fun consume_proposal_for_ledger(
        registry: &mut TradeRegistry,
        proposal_id: ID,
        _cap: &TribeTokenShopCap,
        ssu_gov: &SSUGovernance,
        _clock: &Clock,
    ): (address, address, vector<TradeItem>, vector<TradeItem>) {
        // R5.2 — bazaar-type gate (Advanced-only; cross-package form post-V35-split)
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(ssu_gov));
        ssu_governance::assert_active(ssu_gov);                              // R6.7.1 C-11 GATED
        // SA-04 — SSU-id coherence: prevent cross-SSU proposal consumption spoof
        // TribeTokenShopCap proves "BazaarEconomy is calling" but NOT "correct SSU's call"
        assert!(table::contains(&registry.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        // Borrow proposal to check ssu_id before destructure
        let proposal_ssu_id = table::borrow(&registry.proposals, proposal_id).ssu_id;
        assert!(proposal_ssu_id == ssu_governance::ssu_id(ssu_gov), E_SSU_ID_MISMATCH);
        let proposal = table::borrow(&registry.proposals, proposal_id);
        assert!(proposal.status == ACCEPTED, E_WRONG_STATUS);
        let proposer = proposal.proposer;
        let counterparty = proposal.counterparty;
        let offered = proposal.offered_items;
        let requested = proposal.requested_items;
        (proposer, counterparty, offered, requested)
    }

    // ===== Accessors =====
    public fun trade_item_type_id(item: &TradeItem): u64 { item.item_type_id }
    public fun trade_item_quantity(item: &TradeItem): u64 { item.quantity }
    public fun proposal_count(registry: &TradeRegistry): u64 { registry.proposal_count }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
