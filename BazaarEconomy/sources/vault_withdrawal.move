// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_economy::vault_withdrawal {
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use std::string::{Self, String};
    use std::vector;
    use sui::vec_set::{Self, VecSet};
    use dapp_hub::tribe_registry::TribeLeaderCap;
    use dapp_hub::tribe_registry;
    use bazaar_core::tribe_governance::{Self, TribeAdminCap, TribeGovernance};
    use bazaar_economy::tribe_vault::{Self, TribeVault};
    use bazaar_economy::tribe_exchange::{Self, ExchangeConfig};
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::finance_events;
    use bazaar_core::bazaar_assertions;

    // ===== Version =====
    const PACKAGE_VERSION: u64 = 2;

    // ===== Status Constants =====
    const STATUS_PENDING:   u8 = 0;
    const STATUS_APPROVED:  u8 = 1;   // quorum met, now in 24h wait
    const STATUS_EXECUTED:  u8 = 2;
    const STATUS_CANCELLED: u8 = 3;
    const STATUS_EXPIRED:   u8 = 4;
    const STATUS_DENIED:    u8 = 5;

    // ===== Timing Constants =====
    const WAIT_PERIOD_MS:   u64 = 86_400_000;   // 24 hours
    const EXPIRY_PERIOD_MS: u64 = 259_200_000;  // 72 hours

    // ===== Error Codes =====
    const E_WRONG_TRIBE:            u64 = 1;
    const E_NOT_TRIBE_LEADER:       u64 = 2;
    const E_REQUEST_NOT_FOUND:      u64 = 3;
    const E_INVALID_STATUS:         u64 = 4;
    const E_ALREADY_VOTED:          u64 = 5;
    const E_WAIT_PERIOD_ACTIVE:     u64 = 6;
    const E_NOT_APPROVED:           u64 = 7;
    const E_INSUFFICIENT_VAULT:     u64 = 8;
    const E_ZERO_AMOUNT:            u64 = 9;
    const E_REQUEST_EXPIRED:        u64 = 10;
    const E_REASON_TOO_LONG:        u64 = 11;
    const E_VAULT_BELOW_RESERVE:    u64 = 12;
    const E_CANNOT_SELF_APPROVE:    u64 = 13;
    const E_TRIBE_ID_MISMATCH:      u64 = 14;  // R5.2 tribe-id coherence mismatch
    const E_CAP_REVOKED:            u64 = 15;  // B3.3 ADV-17: revoked TribeAdminCap blocked

    const REASON_MAX_LEN: u64 = 200;

    // ===== Structs =====

    public struct WithdrawalBoard has key {
        id: UID,
        tribe_id: u64,
        requests: Table<u64, WithdrawalRequest>,
        next_request_id: u64,
        required_approvals: u64,   // board-level default quorum
        wait_period_ms: u64,
    }

    public struct WithdrawalRequest has store {
        id: u64,
        tribe_id: u64,
        requester: address,
        amount_mist: u64,
        reason: String,
        approvals: VecSet<address>,
        denials: VecSet<address>,
        required_approvals: u64,   // SA-005: snapshot at creation time
        status: u8,
        created_at_ms: u64,
        approved_at_ms: u64,
        executed_at_ms: u64,
        expires_at_ms: u64,
    }

    // ===== Events =====

    public struct WithdrawalRequestedEvent has copy, drop {
        tribe_id: u64,
        request_id: u64,
        requester: address,
        amount_mist: u64,
        required_approvals: u64,
        expires_at_ms: u64,
        timestamp_ms: u64,
    }

    public struct WithdrawalVoteEvent has copy, drop {
        tribe_id: u64,
        request_id: u64,
        voter: address,
        vote: String,
        approval_count: u64,
        required: u64,
        timestamp_ms: u64,
    }

    public struct WithdrawalStatusEvent has copy, drop {
        tribe_id: u64,
        request_id: u64,
        new_status: u8,
        actor: address,
        timestamp_ms: u64,
    }

    // ===== Package-Private Factory =====

    public(package) fun create_withdrawal_board(
        tribe_id: u64,
        required_approvals: u64,
        ctx: &mut TxContext,
    ): WithdrawalBoard {
        WithdrawalBoard {
            id: object::new(ctx),
            tribe_id,
            requests: table::new(ctx),
            next_request_id: 0,
            required_approvals,
            wait_period_ms: WAIT_PERIOD_MS,
        }
    }

    /// Share the board as a shared object. Called by economy_governance::bootstrap_advanced_complete.
    public(package) fun share(self: WithdrawalBoard) {
        transfer::share_object(self);
    }

    // ===== Public Entry Functions =====

    /// Tribe Leader creates a vault withdrawal request.
    /// V15: ledger arg added so FinanceEvent can include circulation snapshot.
    public fun request_withdrawal(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        board: &mut WithdrawalBoard,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        amount_mist: u64,
        reason: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): u64 {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tribe_registry::cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(tribe_registry::cap_tribe_id(cap) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_vault::tribe_id(vault) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == board.tribe_id, E_WRONG_TRIBE);
        assert!(amount_mist > 0, E_ZERO_AMOUNT);
        assert!(vector::length(&reason) <= REASON_MAX_LEN, E_REASON_TOO_LONG);

        let vault_bal = tribe_vault::eve_balance(vault);
        assert!(vault_bal >= amount_mist, E_INSUFFICIENT_VAULT);

        let now_ms = clock::timestamp_ms(clock);
        let request_id = board.next_request_id;
        board.next_request_id = board.next_request_id + 1;

        // SA-005: Snapshot required_approvals from board at creation time
        let snapshot_quorum = board.required_approvals;

        let requester = tx_context::sender(ctx);
        let request = WithdrawalRequest {
            id: request_id,
            tribe_id: board.tribe_id,
            requester,
            amount_mist,
            reason: std::string::utf8(reason),
            approvals: vec_set::empty(),
            denials: vec_set::empty(),
            required_approvals: snapshot_quorum,
            status: STATUS_PENDING,
            created_at_ms: now_ms,
            approved_at_ms: 0,
            executed_at_ms: 0,
            expires_at_ms: now_ms + EXPIRY_PERIOD_MS,
        };

        event::emit(WithdrawalRequestedEvent {
            tribe_id: board.tribe_id,
            request_id,
            requester,
            amount_mist,
            required_approvals: snapshot_quorum,
            expires_at_ms: now_ms + EXPIRY_PERIOD_MS,
            timestamp_ms: now_ms,
        });

        let circ = tribe_token_ledger::total_supply(ledger);
        finance_events::emit_finance(
            board.tribe_id,
            finance_events::event_type_withdraw_request(),
            requester,
            amount_mist,
            vault_bal, vault_bal,
            circ, circ,
            now_ms,
        );

        table::add(&mut board.requests, request_id, request);
        request_id
    }

    /// TribeAdminCap-gated approval. Prevents self-approval. (SDC-003/SA-009)
    /// V15: vault + ledger args added for FinanceEvent emission on quorum-reached transition.
    public fun approve_request(
        cap: &TribeAdminCap,
        tribe_gov: &TribeGovernance,
        board: &mut WithdrawalBoard,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        // B3.3 ADV-17: mirror the SuperAdmin path — a revoked TribeAdminCap must
        // not vote on vault withdrawals (defense-in-depth; not stranger-reachable).
        assert!(
            !tribe_governance::is_tribe_admin_cap_revoked(tribe_gov, object::id(cap)),
            E_CAP_REVOKED,
        );
        // SDC-003: TribeAdminCap tribe identity check
        assert!(tribe_governance::tribe_admin_cap_tribe_id(cap) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_vault::tribe_id(vault) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == board.tribe_id, E_WRONG_TRIBE);
        assert!(table::contains(&board.requests, request_id), E_REQUEST_NOT_FOUND);

        let now_ms = clock::timestamp_ms(clock);
        let request = table::borrow_mut(&mut board.requests, request_id);
        assert!(request.status == STATUS_PENDING, E_INVALID_STATUS);

        // Check expiry
        assert!(now_ms < request.expires_at_ms, E_REQUEST_EXPIRED);

        // SA-009: Self-approve prevention
        let voter = tx_context::sender(ctx);
        assert!(voter != request.requester, E_CANNOT_SELF_APPROVE);
        assert!(!vec_set::contains(&request.approvals, &voter), E_ALREADY_VOTED);

        vec_set::insert(&mut request.approvals, voter);
        let approval_count = vec_set::size(&request.approvals);

        // SA-005: Use per-request snapshot quorum
        let mut crossed_quorum = false;
        let mut request_amount = 0u64;
        if (approval_count >= request.required_approvals) {
            request.status = STATUS_APPROVED;
            request.approved_at_ms = now_ms;
            crossed_quorum = true;
            request_amount = request.amount_mist;
            event::emit(WithdrawalStatusEvent {
                tribe_id: board.tribe_id,
                request_id,
                new_status: STATUS_APPROVED,
                actor: voter,
                timestamp_ms: now_ms,
            });
        };

        let required = request.required_approvals;
        event::emit(WithdrawalVoteEvent {
            tribe_id: board.tribe_id,
            request_id,
            voter,
            vote: string::utf8(b"approve"),
            approval_count,
            required,
            timestamp_ms: now_ms,
        });

        if (crossed_quorum) {
            let vault_bal = tribe_vault::eve_balance(vault);
            let circ = tribe_token_ledger::total_supply(ledger);
            finance_events::emit_finance(
                board.tribe_id,
                finance_events::event_type_withdraw_approved(),
                voter,
                request_amount,
                vault_bal, vault_bal,
                circ, circ,
                now_ms,
            );
        };
    }

    /// TribeAdminCap-gated denial. (SDC-003)
    /// V15: vault + ledger args added for FinanceEvent emission on denial quorum.
    public fun deny_request(
        cap: &TribeAdminCap,
        tribe_gov: &TribeGovernance,
        board: &mut WithdrawalBoard,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        // B3.3 ADV-17: mirror the SuperAdmin path — a revoked TribeAdminCap must
        // not vote on vault withdrawals (defense-in-depth; not stranger-reachable).
        assert!(
            !tribe_governance::is_tribe_admin_cap_revoked(tribe_gov, object::id(cap)),
            E_CAP_REVOKED,
        );
        assert!(tribe_governance::tribe_admin_cap_tribe_id(cap) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_vault::tribe_id(vault) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == board.tribe_id, E_WRONG_TRIBE);
        assert!(table::contains(&board.requests, request_id), E_REQUEST_NOT_FOUND);

        let now_ms = clock::timestamp_ms(clock);
        let request = table::borrow_mut(&mut board.requests, request_id);
        assert!(request.status == STATUS_PENDING, E_INVALID_STATUS);
        assert!(now_ms < request.expires_at_ms, E_REQUEST_EXPIRED);

        let voter = tx_context::sender(ctx);
        assert!(!vec_set::contains(&request.denials, &voter), E_ALREADY_VOTED);

        vec_set::insert(&mut request.denials, voter);
        let denial_count = vec_set::size(&request.denials);

        // SA-005: Use per-request snapshot quorum for denial threshold
        let mut crossed_denial_quorum = false;
        let mut request_amount = 0u64;
        if (denial_count > request.required_approvals / 2) {
            request.status = STATUS_DENIED;
            crossed_denial_quorum = true;
            request_amount = request.amount_mist;
            event::emit(WithdrawalStatusEvent {
                tribe_id: board.tribe_id,
                request_id,
                new_status: STATUS_DENIED,
                actor: voter,
                timestamp_ms: now_ms,
            });
        };

        let approval_snapshot = vec_set::size(&request.approvals);
        let required = request.required_approvals;
        event::emit(WithdrawalVoteEvent {
            tribe_id: board.tribe_id,
            request_id,
            voter,
            vote: string::utf8(b"deny"),
            approval_count: approval_snapshot,
            required,
            timestamp_ms: now_ms,
        });

        if (crossed_denial_quorum) {
            let vault_bal = tribe_vault::eve_balance(vault);
            let circ = tribe_token_ledger::total_supply(ledger);
            finance_events::emit_finance(
                board.tribe_id,
                finance_events::event_type_withdraw_denied(),
                voter,
                request_amount,
                vault_bal, vault_bal,
                circ, circ,
                now_ms,
            );
        };
    }

    /// Execute an approved withdrawal after the wait period. (SA-004/SDC-001)
    /// V15: ledger arg added so FinanceEvent can include circulation snapshot.
    public fun execute_withdrawal(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        board: &mut WithdrawalBoard,
        vault: &mut TribeVault,
        config: &ExchangeConfig,
        ledger: &TribeTokenLedger,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tribe_registry::cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(tribe_registry::cap_tribe_id(cap) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_vault::tribe_id(vault) == board.tribe_id, E_WRONG_TRIBE);
        // SDC-001: Validate config tribe matches
        assert!(tribe_exchange::tribe_id(config) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == board.tribe_id, E_WRONG_TRIBE);
        assert!(table::contains(&board.requests, request_id), E_REQUEST_NOT_FOUND);

        let now_ms = clock::timestamp_ms(clock);
        let request = table::borrow_mut(&mut board.requests, request_id);
        assert!(request.status == STATUS_APPROVED, E_NOT_APPROVED);
        assert!(now_ms >= request.approved_at_ms + board.wait_period_ms, E_WAIT_PERIOD_ACTIVE);

        let amount = request.amount_mist;
        let vault_bal = tribe_vault::eve_balance(vault);
        assert!(vault_bal >= amount, E_INSUFFICIENT_VAULT);

        // SA-004/SDC-001: Reserve floor enforcement
        let reserve = tribe_exchange::reserve_mist(config);
        assert!(vault_bal - amount >= reserve, E_VAULT_BELOW_RESERVE);

        request.status = STATUS_EXECUTED;
        request.executed_at_ms = now_ms;

        let recipient = tx_context::sender(ctx);
        let eve_before = vault_bal;
        let circ = tribe_token_ledger::total_supply(ledger);
        let eve_coin = tribe_vault::internal_withdraw(vault, amount, b"withdrawal_request", recipient, clock, ctx);
        transfer::public_transfer(eve_coin, recipient);
        let eve_after = tribe_vault::eve_balance(vault);

        event::emit(WithdrawalStatusEvent {
            tribe_id: board.tribe_id,
            request_id,
            new_status: STATUS_EXECUTED,
            actor: recipient,
            timestamp_ms: now_ms,
        });
        finance_events::emit_finance(
            board.tribe_id,
            finance_events::event_type_withdraw_executed(),
            recipient,
            amount,
            eve_before, eve_after,
            circ, circ,
            now_ms,
        );
    }

    /// Cancel a pending request. Only requester can cancel.
    /// V15: vault + ledger args added for FinanceEvent emission.
    public fun cancel_request(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        board: &mut WithdrawalBoard,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tribe_registry::cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(tribe_registry::cap_tribe_id(cap) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_vault::tribe_id(vault) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == board.tribe_id, E_WRONG_TRIBE);
        assert!(table::contains(&board.requests, request_id), E_REQUEST_NOT_FOUND);

        let now_ms = clock::timestamp_ms(clock);
        let sender = tx_context::sender(ctx);
        let request = table::borrow_mut(&mut board.requests, request_id);
        assert!(request.status == STATUS_PENDING, E_INVALID_STATUS);
        assert!(sender == request.requester, E_NOT_TRIBE_LEADER);

        let amount_snapshot = request.amount_mist;
        request.status = STATUS_CANCELLED;
        event::emit(WithdrawalStatusEvent {
            tribe_id: board.tribe_id,
            request_id,
            new_status: STATUS_CANCELLED,
            actor: sender,
            timestamp_ms: now_ms,
        });

        let vault_bal = tribe_vault::eve_balance(vault);
        let circ = tribe_token_ledger::total_supply(ledger);
        finance_events::emit_finance(
            board.tribe_id,
            finance_events::event_type_withdraw_cancelled(),
            sender,
            amount_snapshot,
            vault_bal, vault_bal,
            circ, circ,
            now_ms,
        );
    }

    /// Permissionless: anyone can mark a pending request as expired once its expiry time has passed.
    /// The request must be in STATUS_PENDING state (not already approved, executed, cancelled,
    /// denied, or expired). Aborts with E_INVALID_STATUS if the request is not pending.
    /// Aborts with E_REQUEST_NOT_FOUND if request_id does not exist.
    public fun expire_request(
        tribe_gov: &TribeGovernance,
        board: &mut WithdrawalBoard,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(board.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(tribe_vault::tribe_id(vault) == board.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == board.tribe_id, E_WRONG_TRIBE);
        assert!(table::contains(&board.requests, request_id), E_REQUEST_NOT_FOUND);
        let now_ms = clock::timestamp_ms(clock);
        let actor = tx_context::sender(ctx);
        let request = table::borrow_mut(&mut board.requests, request_id);
        assert!(request.status == STATUS_PENDING, E_INVALID_STATUS);
        assert!(now_ms >= request.expires_at_ms, E_REQUEST_EXPIRED);
        let amount_snapshot = request.amount_mist;
        request.status = STATUS_EXPIRED;
        event::emit(WithdrawalStatusEvent {
            tribe_id: board.tribe_id,
            request_id,
            new_status: STATUS_EXPIRED,
            actor,
            timestamp_ms: now_ms,
        });

        let vault_bal = tribe_vault::eve_balance(vault);
        let circ = tribe_token_ledger::total_supply(ledger);
        finance_events::emit_finance(
            board.tribe_id,
            finance_events::event_type_withdraw_expired(),
            actor,
            amount_snapshot,
            vault_bal, vault_bal,
            circ, circ,
            now_ms,
        );
    }

    // ===== Public Read-Only Accessors =====

    public fun board_tribe_id(board: &WithdrawalBoard): u64 { board.tribe_id }
    public fun board_required_approvals(board: &WithdrawalBoard): u64 { board.required_approvals }
    public fun board_wait_period_ms(board: &WithdrawalBoard): u64 { board.wait_period_ms }

    /// Returns the next request ID that will be assigned on the next call to request_withdrawal.
    public fun next_request_id(board: &WithdrawalBoard): u64 { board.next_request_id }

    /// Alias for board_tribe_id. Returns the tribe ID this WithdrawalBoard belongs to.
    public fun tribe_id(board: &WithdrawalBoard): u64 { board.tribe_id }

    public fun request_status(board: &WithdrawalBoard, request_id: u64): u8 {
        table::borrow(&board.requests, request_id).status
    }
    public fun request_amount(board: &WithdrawalBoard, request_id: u64): u64 {
        table::borrow(&board.requests, request_id).amount_mist
    }
    public fun request_required_approvals(board: &WithdrawalBoard, request_id: u64): u64 {
        table::borrow(&board.requests, request_id).required_approvals
    }
    public fun request_approval_count(board: &WithdrawalBoard, request_id: u64): u64 {
        vec_set::size(&table::borrow(&board.requests, request_id).approvals)
    }
    /// Returns the reason string attached to the withdrawal request. (APM-010)
    public fun request_reason(board: &WithdrawalBoard, request_id: u64): &String {
        &table::borrow(&board.requests, request_id).reason
    }
    /// Returns the number of denial votes recorded on the withdrawal request. (APM-011)
    public fun denial_count(board: &WithdrawalBoard, request_id: u64): u64 {
        vec_set::size(&table::borrow(&board.requests, request_id).denials)
    }

    // ===== Package-Private =====

    public(package) fun set_required_approvals(board: &mut WithdrawalBoard, n: u64) {
        board.required_approvals = n;
    }

    /// UpdateCeremonyPlan v1 — extracted body of `cancel_request` minus the
    /// `TribeLeaderCap` + `sender == request.requester` gates, callable by
    /// `vault_withdrawal_drain::cancel_vault_withdrawals_batch` (DAppOwnerCap-gated).
    /// Cancels BOTH `STATUS_PENDING` AND `STATUS_APPROVED` rows (the 24h-wait window
    /// must also be cancellable during ceremony Phase B). Returns `true` on cancel,
    /// `false` on skip (absent row or already-resolved status). Cross-object tribe-id
    /// coherence is the caller's responsibility (asserted once in the batch entry).
    public(package) fun admin_force_cancel_internal(
        board: &mut WithdrawalBoard,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        request_id: u64,
        admin: address,
        now_ms: u64,
    ): bool {
        if (!table::contains(&board.requests, request_id)) {
            return false
        };
        let request = table::borrow_mut(&mut board.requests, request_id);
        if (request.status != STATUS_PENDING && request.status != STATUS_APPROVED) {
            return false
        };

        let amount_snapshot = request.amount_mist;
        request.status = STATUS_CANCELLED;
        event::emit(WithdrawalStatusEvent {
            tribe_id: board.tribe_id,
            request_id,
            new_status: STATUS_CANCELLED,
            actor: admin,
            timestamp_ms: now_ms,
        });

        let vault_bal = tribe_vault::eve_balance(vault);
        let circ = tribe_token_ledger::total_supply(ledger);
        finance_events::emit_finance(
            board.tribe_id,
            finance_events::event_type_withdraw_cancelled(),
            admin,
            amount_snapshot,
            vault_bal, vault_bal,
            circ, circ,
            now_ms,
        );
        true
    }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(tribe_id: u64, required_approvals: u64, ctx: &mut TxContext): WithdrawalBoard {
        create_withdrawal_board(tribe_id, required_approvals, ctx)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
