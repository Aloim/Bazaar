// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// V26 D5 — Advanced Direct Trade.
///
/// Per-tribe peer-to-peer trade proposals settling on the tribe-token ledger
/// + EVE escrow. Mirrors `bazaar_core::trade` (EVE-only DirectTrade for
/// NoTribe / Easy) but adds the tribe-token leg.
///
/// Settlement (V26 v1):
///   Token leg: supply-conserving burn-at-propose / mint-at-accept for
///     proposer's offered tokens; simple ledger debit/credit transfer for
///     counterparty's request tokens at accept time.
///   EVE leg: Coin<EVE> escrowed in the proposal at propose time; on accept
///     the escrow flows to counterparty and counterparty's matching Coin<EVE>
///     payment flows to proposer.
///
/// Items: NOT supported in v1 — Advanced DirectTrade is currency-only this
/// release. Item escrow via the Open Storage transit tier + Player Locker
/// direct deposit (mirroring EconomyFixplan Phase 4 WTB) is queued for V27.
///
/// Lifecycle:
///   PENDING -> ACCEPTED (counterparty accepts; payouts move both ways)
///   PENDING -> REJECTED  (counterparty refuses; proposer refunded)
///   PENDING -> CANCELLED (proposer withdraws; proposer refunded)
///   PENDING -> EXPIRED   (anyone calls after expiry_ms; proposer refunded)
module bazaar_economy::advanced_direct_trade {
    use sui::balance::Balance;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use EVE::EVE::EVE;
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::bazaar_assertions;
    use bazaar_core::admin_drain_events;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};

    // ===== Status Constants =====
    const PENDING: u8 = 0;
    const ACCEPTED: u8 = 1;
    const REJECTED: u8 = 2;
    const CANCELLED: u8 = 3;
    const EXPIRED: u8 = 4;

    // ===== Error Codes =====
    const E_PROPOSAL_NOT_FOUND:   u64 = 1;
    const E_NOT_COUNTERPARTY:     u64 = 2;
    const E_NOT_PROPOSER:         u64 = 3;
    const E_ALREADY_RESOLVED:     u64 = 4;
    const E_PROPOSAL_EXPIRED:     u64 = 5;
    const E_NOT_EXPIRED_YET:      u64 = 6;
    const E_WRONG_TRIBE:          u64 = 7;
    const E_NOT_ADVANCED:         u64 = 8;
    const E_LEDGER_FROZEN:        u64 = 9;
    const E_INSUFFICIENT_BALANCE: u64 = 10;
    const E_EVE_AMOUNT_MISMATCH:  u64 = 11;
    const E_EMPTY_TRADE:          u64 = 12;
    const E_SELF_TRADE:           u64 = 13;
    const E_BATCH_TOO_LARGE:      u64 = 14;
    const E_PAGINATION_ZERO:      u64 = 15;
    // R-C (AUD ban residual): banned actor cannot propose/accept (recovery paths ungated).
    const E_PLAYER_BANNED:        u64 = 16;

    // ===== Constants =====
    const MAX_BATCH_ROWS: u64 = 100;

    // ===== Structs =====

    public struct AdvancedTradeProposal has store {
        tribe_id: u64,
        proposer: address,
        receiver: address,
        offer_eve_mist:        u64,    // EVE the proposer escrowed at propose time
        offer_tokens_scaled:   u64,    // scaled tribe-token units burned from proposer at propose
        request_eve_mist:      u64,    // EVE the counterparty must pay at accept
        request_tokens_scaled: u64,    // scaled tribe-token units the counterparty must hold at accept
        escrowed_eve:          Balance<EVE>,
        status: u8,
        created_at_ms: u64,
        expiry_ms: u64,
    }

    public struct AdvancedTradeRegistry has key {
        id: UID,
        tribe_id: u64,
        proposals: Table<ID, AdvancedTradeProposal>,
        proposal_count: u64,
    }

    // ===== Events =====

    public struct AdvancedTradeProposed has copy, drop {
        proposal_id: ID,
        tribe_id: u64,
        proposer: address,
        receiver: address,
        offer_eve_mist: u64,
        offer_tokens_scaled: u64,
        request_eve_mist: u64,
        request_tokens_scaled: u64,
        expiry_ms: u64,
        timestamp_ms: u64,
    }

    public struct AdvancedTradeAccepted has copy, drop {
        proposal_id: ID,
        tribe_id: u64,
        proposer: address,
        receiver: address,
        eve_to_receiver: u64,
        eve_to_proposer: u64,
        tokens_to_receiver: u64,
        tokens_to_proposer: u64,
        timestamp_ms: u64,
    }

    public struct AdvancedTradeRefunded has copy, drop {
        proposal_id: ID,
        tribe_id: u64,
        by: address,
        final_status: u8,        // CANCELLED | REJECTED | EXPIRED
        eve_refunded: u64,
        tokens_refunded: u64,
        timestamp_ms: u64,
    }

    // ===== Bootstrap =====

    /// Per-tribe registry constructor (called by
    /// `economy_governance::bootstrap_advanced_complete` at tribe set-up).
    public(package) fun create_advanced_trade_registry(
        tribe_id: u64, ctx: &mut TxContext,
    ): AdvancedTradeRegistry {
        AdvancedTradeRegistry {
            id: object::new(ctx),
            tribe_id,
            proposals: table::new(ctx),
            proposal_count: 0,
        }
    }

    /// Package-internal share helper — owning module of AdvancedTradeRegistry
    /// per Move's private-share rule. Consumed by economy_governance.
    public(package) fun share_advanced_trade_registry(reg: AdvancedTradeRegistry) {
        transfer::share_object(reg);
    }

    // ===== Internal Helpers =====

    fun assert_pending(p: &AdvancedTradeProposal) {
        assert!(p.status == PENDING, E_ALREADY_RESOLVED);
    }

    /// Binding checks applied on EVERY entry (gated and ungated). Validates the SSU is
    /// Advanced and that ssu_gov / tribe_gov / ledger all bind to this registry's tribe.
    /// UNGATED per LEAD-02 — the funds-recovery paths (reject/cancel/expire/batch) must stay
    /// callable by a banned party so escrow + burned tokens are always recoverable.
    fun assert_advanced_gov_bindings(
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &TribeTokenLedger,
        registry_tribe_id: u64,
    ) {
        bazaar_assertions::assert_advanced_external(
            ssu_governance::ssu_bazaar_type(ssu_gov),
        );
        assert!(ssu_governance::ssu_tribe_id(ssu_gov) == registry_tribe_id, E_WRONG_TRIBE);
        assert!(tribe_governance::tribe_id(tribe_gov) == registry_tribe_id, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == registry_tribe_id, E_WRONG_TRIBE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
    }

    /// Ban + tribe-active gate applied ONLY to the wealth-creating entries (propose / accept).
    /// R-C: a tribe-globally or SSU-timed banned actor cannot open or accept a trade, and a
    /// deactivated tribe halts new Advanced trades (ET-14). NEVER called on the refund paths.
    fun assert_advanced_gov_ban_checks(
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        actor: address,
        clock: &Clock,
    ) {
        tribe_governance::assert_tribe_active(tribe_gov);
        assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, actor, clock), E_PLAYER_BANNED);
        assert!(!ssu_governance::is_banned(ssu_gov, actor, clock), E_PLAYER_BANNED);
    }

    // ===== Public Entries =====

    /// Propose a tribe-token + EVE trade with a specific counterparty.
    /// Escrows offered EVE and burns offered tokens from proposer's ledger row.
    public fun propose_advanced_trade(
        registry: &mut AdvancedTradeRegistry,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        receiver: address,
        offer_eve: Coin<EVE>,
        offer_tokens_scaled: u64,
        request_eve_mist: u64,
        request_tokens_scaled: u64,
        expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        assert_advanced_gov_bindings(ssu_gov, tribe_gov, ledger, registry.tribe_id);
        assert!(ssu_governance::ssu_is_active(ssu_gov), E_NOT_ADVANCED);
        let proposer = ctx.sender();
        // R-C: banned/deactivated-tribe actor cannot open a trade (recovery paths stay open).
        assert_advanced_gov_ban_checks(ssu_gov, tribe_gov, proposer, clock);
        assert!(proposer != receiver, E_SELF_TRADE);
        let offer_eve_mist = offer_eve.value();
        assert!(
            offer_eve_mist > 0 || offer_tokens_scaled > 0
                || request_eve_mist > 0 || request_tokens_scaled > 0,
            E_EMPTY_TRADE,
        );
        // Burn proposer's offered tokens — restored on accept (to receiver)
        // OR on cancel/refund (to proposer) via internal_mint.
        if (offer_tokens_scaled > 0) {
            // GAS-02: removed redundant balance_of + pre-assert; internal_burn carries its own >= guard.
            tribe_token_ledger::internal_burn(ledger, proposer, offer_tokens_scaled);
        };
        let uid = object::new(ctx);
        let proposal_id = object::uid_to_inner(&uid);
        object::delete(uid);
        let ts = clock::timestamp_ms(clock);
        let proposal = AdvancedTradeProposal {
            tribe_id: registry.tribe_id,
            proposer,
            receiver,
            offer_eve_mist,
            offer_tokens_scaled,
            request_eve_mist,
            request_tokens_scaled,
            escrowed_eve: offer_eve.into_balance(),
            status: PENDING,
            created_at_ms: ts,
            expiry_ms,
        };
        table::add(&mut registry.proposals, proposal_id, proposal);
        registry.proposal_count = registry.proposal_count + 1;
        event::emit(AdvancedTradeProposed {
            proposal_id,
            tribe_id: registry.tribe_id,
            proposer,
            receiver,
            offer_eve_mist,
            offer_tokens_scaled,
            request_eve_mist,
            request_tokens_scaled,
            expiry_ms,
            timestamp_ms: ts,
        });
        proposal_id
    }

    /// Receiver accepts. Pays request_eve_mist + holds request_tokens_scaled.
    /// On success: proposer gets receiver's EVE + receiver's tokens debit-credit;
    /// receiver gets escrowed EVE + minted tokens (supply restored).
    public fun accept_advanced_trade(
        registry: &mut AdvancedTradeRegistry,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        proposal_id: ID,
        eve_payment: Coin<EVE>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert_advanced_gov_bindings(ssu_gov, tribe_gov, ledger, registry.tribe_id);
        // R-C: banned/deactivated-tribe receiver cannot accept (recovery paths stay open).
        assert_advanced_gov_ban_checks(ssu_gov, tribe_gov, ctx.sender(), clock);
        assert!(table::contains(&registry.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
        assert!(ctx.sender() == proposal.receiver, E_NOT_COUNTERPARTY);
        assert_pending(proposal);
        let now = clock::timestamp_ms(clock);
        assert!(now <= proposal.expiry_ms, E_PROPOSAL_EXPIRED);
        assert!(eve_payment.value() == proposal.request_eve_mist, E_EVE_AMOUNT_MISMATCH);
        // Snapshot fields before further state changes.
        let proposer  = proposal.proposer;
        let receiver  = proposal.receiver;
        let off_eve   = proposal.offer_eve_mist;
        let off_tok   = proposal.offer_tokens_scaled;
        let req_eve   = proposal.request_eve_mist;
        let req_tok   = proposal.request_tokens_scaled;
        // Token leg.
        if (req_tok > 0) {
            // GAS-02: removed redundant balance_of + pre-assert; debit carries its own >= guard.
            tribe_token_ledger::debit(ledger, receiver, req_tok);
            tribe_token_ledger::credit(ledger, proposer, req_tok);
        };
        if (off_tok > 0) {
            // Restore supply by minting to receiver — closes the burn at propose.
            tribe_token_ledger::internal_mint(ledger, receiver, off_tok);
        };
        // EVE leg.
        if (off_eve > 0) {
            let payout = coin::from_balance(
                proposal.escrowed_eve.split(off_eve), ctx,
            );
            transfer::public_transfer(payout, receiver);
        };
        if (req_eve > 0) {
            transfer::public_transfer(eve_payment, proposer);
        } else {
            // req_eve == 0 → caller passed Coin<EVE>{value: 0}; destroy.
            coin::destroy_zero(eve_payment);
        };
        proposal.status = ACCEPTED;
        event::emit(AdvancedTradeAccepted {
            proposal_id,
            tribe_id: registry.tribe_id,
            proposer,
            receiver,
            eve_to_receiver: off_eve,
            eve_to_proposer: req_eve,
            tokens_to_receiver: off_tok,
            tokens_to_proposer: req_tok,
            timestamp_ms: now,
        });
    }

    /// Receiver rejects a pending proposal. Refunds proposer's EVE + tokens.
    public fun reject_advanced_trade(
        registry: &mut AdvancedTradeRegistry,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        proposal_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // UNGATED (LEAD-02): bindings only — a banned receiver may still refund the proposer.
        assert_advanced_gov_bindings(ssu_gov, tribe_gov, ledger, registry.tribe_id);
        assert!(table::contains(&registry.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        let tribe_id = registry.tribe_id;
        let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
        assert!(ctx.sender() == proposal.receiver, E_NOT_COUNTERPARTY);
        assert_pending(proposal);
        refund_proposer(proposal, ledger, proposal_id, tribe_id, REJECTED, clock, ctx);
    }

    /// Proposer cancels a pending proposal. Refunds proposer's EVE + tokens.
    public fun cancel_advanced_trade(
        registry: &mut AdvancedTradeRegistry,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        proposal_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // UNGATED (LEAD-02): bindings only — a banned proposer may still cancel + recover funds.
        assert_advanced_gov_bindings(ssu_gov, tribe_gov, ledger, registry.tribe_id);
        assert!(table::contains(&registry.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        let tribe_id = registry.tribe_id;
        let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
        assert!(ctx.sender() == proposal.proposer, E_NOT_PROPOSER);
        assert_pending(proposal);
        refund_proposer(proposal, ledger, proposal_id, tribe_id, CANCELLED, clock, ctx);
    }

    /// Anyone may expire a pending proposal once `now > expiry_ms`.
    /// Refunds proposer's EVE + tokens.
    public fun expire_advanced_trade(
        registry: &mut AdvancedTradeRegistry,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        proposal_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // UNGATED (LEAD-02): bindings only — anyone may expire a stale proposal + refund proposer.
        assert_advanced_gov_bindings(ssu_gov, tribe_gov, ledger, registry.tribe_id);
        assert!(table::contains(&registry.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        let tribe_id = registry.tribe_id;
        let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
        assert_pending(proposal);
        let now = clock::timestamp_ms(clock);
        assert!(now > proposal.expiry_ms, E_NOT_EXPIRED_YET);
        refund_proposer(proposal, ledger, proposal_id, tribe_id, EXPIRED, clock, ctx);
    }

    /// UpdateCeremonyPlan v1 — Phase B entry 4: admin cancels every still-PENDING
    /// proposal in `proposal_ids`. Re-uses the existing `refund_proposer` primitive
    /// (private fn in this module; emits `AdvancedTradeRefunded`, refunds proposer
    /// EVE escrow, restores burned tokens via `internal_mint`). Silent skip on
    /// absent IDs and on rows already in a terminal status (ACCEPTED / CANCELLED /
    /// REJECTED / EXPIRED). One BatchDrainSummary at the end. One call per
    /// AdvancedTradeRegistry (one per Advanced tribe); FE auto-iterates tribes and
    /// pages proposal IDs in MAX_BATCH_ROWS=100 chunks.
    public entry fun cancel_advanced_trade_proposals_batch(
        _cap: &DAppOwnerCap,
        registry: &mut AdvancedTradeRegistry,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        proposal_ids: vector<ID>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // UNGATED (LEAD-02): admin emergency drain — bindings only, never ban-gated.
        assert_advanced_gov_bindings(ssu_gov, tribe_gov, ledger, registry.tribe_id);
        let n = vector::length(&proposal_ids);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        let tribe_id = registry.tribe_id;
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
                    refund_proposer(proposal, ledger, pid, tribe_id, CANCELLED, clock, ctx);
                    processed = processed + 1;
                };
            };
            i = i + 1;
        };

        admin_drain_events::emit_summary(
            admin_drain_events::kind_cancel_adv_trade(),
            processed,
            skipped,
            ctx,
            clock,
        );
    }

    // ===== Private Refund Path =====

    fun refund_proposer(
        p: &mut AdvancedTradeProposal,
        ledger: &mut TribeTokenLedger,
        proposal_id: ID,
        tribe_id: u64,
        final_status: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let proposer       = p.proposer;
        let eve_value      = p.escrowed_eve.value();
        let tokens_refund  = p.offer_tokens_scaled;
        if (eve_value > 0) {
            let refund = coin::from_balance(p.escrowed_eve.split(eve_value), ctx);
            transfer::public_transfer(refund, proposer);
        };
        if (tokens_refund > 0) {
            // Mint back what propose() burned — supply conserved.
            tribe_token_ledger::internal_mint(ledger, proposer, tokens_refund);
        };
        p.status = final_status;
        event::emit(AdvancedTradeRefunded {
            proposal_id,
            tribe_id,
            by: ctx.sender(),
            final_status,
            eve_refunded: eve_value,
            tokens_refunded: tokens_refund,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Accessors =====
    public fun registry_tribe_id(r: &AdvancedTradeRegistry): u64 { r.tribe_id }
    public fun proposal_count(r: &AdvancedTradeRegistry): u64 { r.proposal_count }
    public fun proposal_status(r: &AdvancedTradeRegistry, id: ID): u8 {
        assert!(table::contains(&r.proposals, id), E_PROPOSAL_NOT_FOUND);
        table::borrow(&r.proposals, id).status
    }
    public fun status_pending(): u8 { PENDING }
    public fun status_accepted(): u8 { ACCEPTED }
    public fun status_rejected(): u8 { REJECTED }
    public fun status_cancelled(): u8 { CANCELLED }
    public fun status_expired(): u8 { EXPIRED }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
