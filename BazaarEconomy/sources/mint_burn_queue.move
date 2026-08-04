// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V16 — Tribe Wallet mint/burn delayed-execution queue.
// Modeled on bazaar_economy::vault_withdrawal but simpler:
//   * Single-rejection veto (no quorum, no denial threshold)
//   * No expiry — pending requests stay pending until executed or rejected
//   * Leader OR Super-Admin can request / execute / reject
//   * Fixed 24h wait period before execute() succeeds
//
// Replaces the immediate `economy_governance::mint_supply` /
// `economy_governance::burn_tokens` entries retired in V16.
//
// Authorization: TribeLeaderCap (dapp_hub) OR TribeSuperAdminCap
// (bazaar_core::tribe_governance). Each request action has two entry
// variants — one per cap type — that delegate to a single private helper
// after the cap's tribe_id is validated against the TribeGovernance.

module bazaar_economy::mint_burn_queue {
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use std::option::{Self, Option};
    use dapp_hub::tribe_registry::{Self, TribeLeaderCap};
    use bazaar_core::tribe_governance::{Self, TribeSuperAdminCap, TribeGovernance};
    use bazaar_core::bazaar_assertions;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::tribe_vault::{Self, TribeVault};
    use bazaar_economy::tribe_exchange::{Self, ExchangeConfig};
    use bazaar_economy::finance_events;

    // ===== Version =====
    const PACKAGE_VERSION: u64 = 1;

    // ===== Status =====
    const STATUS_PENDING:  u8 = 0;
    const STATUS_EXECUTED: u8 = 1;
    const STATUS_REJECTED: u8 = 2;

    // ===== Kind =====
    const KIND_MINT: u8 = 0;
    const KIND_BURN: u8 = 1;

    // ===== Timing =====
    const WAIT_PERIOD_MS: u64 = 86_400_000; // 24 hours

    // ===== Error Codes =====
    const E_WRONG_TRIBE:         u64 = 1;
    const E_REQUEST_NOT_FOUND:   u64 = 2;
    const E_INVALID_STATUS:      u64 = 3;
    const E_WAIT_PERIOD_ACTIVE:  u64 = 4;
    const E_ZERO_AMOUNT:         u64 = 5;
    const E_TRIBE_ID_MISMATCH:   u64 = 6;
    const E_MINTING_BLOCKED:     u64 = 7;
    const E_LEDGER_FROZEN:       u64 = 8;
    const E_INSUFFICIENT_WALLET: u64 = 9;

    // ===== Structs =====

    public struct MintBurnQueue has key {
        id: UID,
        tribe_id: u64,
        requests: Table<u64, MintBurnRequest>,
        next_request_id: u64,
        wait_period_ms: u64,
    }

    public struct MintBurnRequest has store {
        id: u64,
        tribe_id: u64,
        kind: u8,
        amount: u64,
        proposer: address,
        created_at_ms: u64,
        executable_after_ms: u64,
        status: u8,
        rejected_by: Option<address>,
        executed_by: Option<address>,
    }

    // ===== Events =====

    public struct MintBurnRequestedEvent has copy, drop {
        tribe_id: u64,
        request_id: u64,
        kind: u8,
        amount: u64,
        proposer: address,
        executable_after_ms: u64,
        timestamp_ms: u64,
    }

    public struct MintBurnExecutedEvent has copy, drop {
        tribe_id: u64,
        request_id: u64,
        kind: u8,
        amount: u64,
        executor: address,
        new_total_supply: u64,
        timestamp_ms: u64,
    }

    public struct MintBurnRejectedEvent has copy, drop {
        tribe_id: u64,
        request_id: u64,
        kind: u8,
        amount: u64,
        rejecter: address,
        timestamp_ms: u64,
    }

    // ===== Package-Private Factory =====

    public(package) fun create_queue(tribe_id: u64, ctx: &mut TxContext): MintBurnQueue {
        MintBurnQueue {
            id: object::new(ctx),
            tribe_id,
            requests: table::new(ctx),
            next_request_id: 0,
            wait_period_ms: WAIT_PERIOD_MS,
        }
    }

    public(package) fun share(self: MintBurnQueue) {
        transfer::share_object(self);
    }

    // ===== Auth Helpers =====

    fun leader_tribe_id(cap: &TribeLeaderCap, tribe_gov: &TribeGovernance): u64 {
        let tid = tribe_registry::cap_tribe_id(cap);
        assert!(tid == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        tid
    }

    fun admin_tribe_id(cap: &TribeSuperAdminCap, tribe_gov: &TribeGovernance): u64 {
        let tid = tribe_governance::tribe_super_admin_cap_tribe_id(cap);
        assert!(tid == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        tid
    }

    // ===== Request Mint =====

    public fun request_mint_as_leader(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        config: &ExchangeConfig,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): u64 {
        let tid = leader_tribe_id(cap, tribe_gov);
        request_mint_internal(tid, tribe_gov, queue, vault, ledger, config, amount, clock, ctx)
    }

    public fun request_mint_as_admin(
        cap: &TribeSuperAdminCap,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        config: &ExchangeConfig,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): u64 {
        let tid = admin_tribe_id(cap, tribe_gov);
        request_mint_internal(tid, tribe_gov, queue, vault, ledger, config, amount, clock, ctx)
    }

    fun request_mint_internal(
        tid: u64,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        config: &ExchangeConfig,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): u64 {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tid == queue.tribe_id, E_WRONG_TRIBE);
        assert!(tid == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(tid == tribe_token_ledger::tribe_id(ledger), E_WRONG_TRIBE);
        assert!(tid == tribe_exchange::tribe_id(config), E_WRONG_TRIBE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(amount > 0, E_ZERO_AMOUNT);

        // Article XIII.4: Block minting when vault is underfunded (request-time check)
        let vault_bal = tribe_vault::eve_balance(vault);
        let reserve = tribe_exchange::reserve_mist(config);
        assert!(vault_bal > reserve, E_MINTING_BLOCKED);

        let now_ms = clock::timestamp_ms(clock);
        let req_id = queue.next_request_id;
        queue.next_request_id = req_id + 1;
        let proposer = tx_context::sender(ctx);
        let executable_after_ms = now_ms + queue.wait_period_ms;

        let request = MintBurnRequest {
            id: req_id,
            tribe_id: tid,
            kind: KIND_MINT,
            amount,
            proposer,
            created_at_ms: now_ms,
            executable_after_ms,
            status: STATUS_PENDING,
            rejected_by: option::none(),
            executed_by: option::none(),
        };
        table::add(&mut queue.requests, req_id, request);

        event::emit(MintBurnRequestedEvent {
            tribe_id: tid,
            request_id: req_id,
            kind: KIND_MINT,
            amount,
            proposer,
            executable_after_ms,
            timestamp_ms: now_ms,
        });

        let circ = tribe_token_ledger::total_supply(ledger);
        finance_events::emit_finance(
            tid,
            finance_events::event_type_mint_request(),
            proposer,
            amount,
            vault_bal, vault_bal,
            circ, circ,
            now_ms,
        );

        req_id
    }

    // ===== Request Burn =====

    public fun request_burn_as_leader(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        ledger: &TribeTokenLedger,
        vault: &TribeVault,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): u64 {
        let tid = leader_tribe_id(cap, tribe_gov);
        request_burn_internal(tid, tribe_gov, queue, ledger, vault, amount, clock, ctx)
    }

    public fun request_burn_as_admin(
        cap: &TribeSuperAdminCap,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        ledger: &TribeTokenLedger,
        vault: &TribeVault,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): u64 {
        let tid = admin_tribe_id(cap, tribe_gov);
        request_burn_internal(tid, tribe_gov, queue, ledger, vault, amount, clock, ctx)
    }

    fun request_burn_internal(
        tid: u64,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        ledger: &TribeTokenLedger,
        vault: &TribeVault,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): u64 {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tid == queue.tribe_id, E_WRONG_TRIBE);
        assert!(tid == tribe_token_ledger::tribe_id(ledger), E_WRONG_TRIBE);
        assert!(tid == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(amount > 0, E_ZERO_AMOUNT);

        // Burn target is always the tribe wallet (gov-object address).
        let tribe_addr = object::id_address(tribe_gov);
        let wallet_bal = tribe_token_ledger::balance_of(ledger, tribe_addr);
        assert!(wallet_bal >= amount, E_INSUFFICIENT_WALLET);

        let now_ms = clock::timestamp_ms(clock);
        let req_id = queue.next_request_id;
        queue.next_request_id = req_id + 1;
        let proposer = tx_context::sender(ctx);
        let executable_after_ms = now_ms + queue.wait_period_ms;

        let request = MintBurnRequest {
            id: req_id,
            tribe_id: tid,
            kind: KIND_BURN,
            amount,
            proposer,
            created_at_ms: now_ms,
            executable_after_ms,
            status: STATUS_PENDING,
            rejected_by: option::none(),
            executed_by: option::none(),
        };
        table::add(&mut queue.requests, req_id, request);

        event::emit(MintBurnRequestedEvent {
            tribe_id: tid,
            request_id: req_id,
            kind: KIND_BURN,
            amount,
            proposer,
            executable_after_ms,
            timestamp_ms: now_ms,
        });

        let vault_bal = tribe_vault::eve_balance(vault);
        let circ = tribe_token_ledger::total_supply(ledger);
        finance_events::emit_finance(
            tid,
            finance_events::event_type_burn_request(),
            proposer,
            amount,
            vault_bal, vault_bal,
            circ, circ,
            now_ms,
        );

        req_id
    }

    // ===== Execute Request =====

    public fun execute_request_as_leader(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        ledger: &mut TribeTokenLedger,
        vault: &TribeVault,
        config: &ExchangeConfig,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let tid = leader_tribe_id(cap, tribe_gov);
        execute_internal(tid, tribe_gov, queue, ledger, vault, config, request_id, clock, ctx);
    }

    public fun execute_request_as_admin(
        cap: &TribeSuperAdminCap,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        ledger: &mut TribeTokenLedger,
        vault: &TribeVault,
        config: &ExchangeConfig,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let tid = admin_tribe_id(cap, tribe_gov);
        execute_internal(tid, tribe_gov, queue, ledger, vault, config, request_id, clock, ctx);
    }

    fun execute_internal(
        tid: u64,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        ledger: &mut TribeTokenLedger,
        vault: &TribeVault,
        config: &ExchangeConfig,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tid == queue.tribe_id, E_WRONG_TRIBE);
        assert!(tid == tribe_token_ledger::tribe_id(ledger), E_WRONG_TRIBE);
        assert!(tid == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(tid == tribe_exchange::tribe_id(config), E_WRONG_TRIBE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(table::contains(&queue.requests, request_id), E_REQUEST_NOT_FOUND);

        let now_ms = clock::timestamp_ms(clock);
        let executor = tx_context::sender(ctx);
        let tribe_addr = object::id_address(tribe_gov);

        // Snapshot the request fields we need before we mutate other state.
        let request = table::borrow_mut(&mut queue.requests, request_id);
        assert!(request.status == STATUS_PENDING, E_INVALID_STATUS);
        assert!(now_ms >= request.executable_after_ms, E_WAIT_PERIOD_ACTIVE);
        let kind = request.kind;
        let amount = request.amount;

        // Re-check Article XIII.4 at execute-time for MINT (chain state may
        // have shifted in the 24h window). For BURN, re-check the tribe-wallet
        // balance.
        let vault_bal = tribe_vault::eve_balance(vault);
        if (kind == KIND_MINT) {
            let reserve = tribe_exchange::reserve_mist(config);
            assert!(vault_bal > reserve, E_MINTING_BLOCKED);
        } else {
            let wallet_bal = tribe_token_ledger::balance_of(ledger, tribe_addr);
            assert!(wallet_bal >= amount, E_INSUFFICIENT_WALLET);
        };

        // Mutate status BEFORE ledger mutation to satisfy borrow checker.
        request.status = STATUS_EXECUTED;
        request.executed_by = option::some(executor);

        let circ_before = tribe_token_ledger::total_supply(ledger);
        let event_type;
        if (kind == KIND_MINT) {
            // Mint credits the tribe wallet (gov-object address).
            tribe_token_ledger::internal_mint(ledger, tribe_addr, amount);
            event_type = finance_events::event_type_mint();
        } else {
            tribe_token_ledger::internal_burn(ledger, tribe_addr, amount);
            event_type = finance_events::event_type_burn();
        };
        let circ_after = tribe_token_ledger::total_supply(ledger);

        event::emit(MintBurnExecutedEvent {
            tribe_id: tid,
            request_id,
            kind,
            amount,
            executor,
            new_total_supply: circ_after,
            timestamp_ms: now_ms,
        });

        finance_events::emit_finance(
            tid,
            event_type,
            executor,
            amount,
            vault_bal, vault_bal,
            circ_before, circ_after,
            now_ms,
        );
    }

    // ===== Reject Request =====

    public fun reject_request_as_leader(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let tid = leader_tribe_id(cap, tribe_gov);
        reject_internal(tid, tribe_gov, queue, vault, ledger, request_id, clock, ctx);
    }

    public fun reject_request_as_admin(
        cap: &TribeSuperAdminCap,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let tid = admin_tribe_id(cap, tribe_gov);
        reject_internal(tid, tribe_gov, queue, vault, ledger, request_id, clock, ctx);
    }

    fun reject_internal(
        tid: u64,
        tribe_gov: &TribeGovernance,
        queue: &mut MintBurnQueue,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tid == queue.tribe_id, E_WRONG_TRIBE);
        assert!(tid == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(tid == tribe_token_ledger::tribe_id(ledger), E_WRONG_TRIBE);
        assert!(table::contains(&queue.requests, request_id), E_REQUEST_NOT_FOUND);

        let now_ms = clock::timestamp_ms(clock);
        let rejecter = tx_context::sender(ctx);
        let request = table::borrow_mut(&mut queue.requests, request_id);
        // Single-rejection veto. Works DURING the wait window AND AFTER it
        // (until executed). Once executed/rejected, further calls abort.
        assert!(request.status == STATUS_PENDING, E_INVALID_STATUS);
        let kind = request.kind;
        let amount = request.amount;
        request.status = STATUS_REJECTED;
        request.rejected_by = option::some(rejecter);

        event::emit(MintBurnRejectedEvent {
            tribe_id: tid,
            request_id,
            kind,
            amount,
            rejecter,
            timestamp_ms: now_ms,
        });

        let vault_bal = tribe_vault::eve_balance(vault);
        let circ = tribe_token_ledger::total_supply(ledger);
        finance_events::emit_finance(
            tid,
            finance_events::event_type_mintburn_rejected(),
            rejecter,
            amount,
            vault_bal, vault_bal,
            circ, circ,
            now_ms,
        );
    }

    // ===== Public Read-Only Accessors =====

    public fun queue_tribe_id(q: &MintBurnQueue): u64 { q.tribe_id }
    public fun queue_wait_period_ms(q: &MintBurnQueue): u64 { q.wait_period_ms }
    public fun queue_next_request_id(q: &MintBurnQueue): u64 { q.next_request_id }

    public fun request_status(q: &MintBurnQueue, id: u64): u8 {
        table::borrow(&q.requests, id).status
    }
    public fun request_kind(q: &MintBurnQueue, id: u64): u8 {
        table::borrow(&q.requests, id).kind
    }
    public fun request_amount(q: &MintBurnQueue, id: u64): u64 {
        table::borrow(&q.requests, id).amount
    }
    public fun request_proposer(q: &MintBurnQueue, id: u64): address {
        table::borrow(&q.requests, id).proposer
    }
    public fun request_executable_after_ms(q: &MintBurnQueue, id: u64): u64 {
        table::borrow(&q.requests, id).executable_after_ms
    }

    public fun status_pending(): u8 { STATUS_PENDING }
    public fun status_executed(): u8 { STATUS_EXECUTED }
    public fun status_rejected(): u8 { STATUS_REJECTED }
    public fun kind_mint(): u8 { KIND_MINT }
    public fun kind_burn(): u8 { KIND_BURN }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(tribe_id: u64, ctx: &mut TxContext): MintBurnQueue {
        create_queue(tribe_id, ctx)
    }
    #[test_only]
    public fun e_minting_blocked(): u64 { E_MINTING_BLOCKED }
    #[test_only]
    public fun e_insufficient_wallet(): u64 { E_INSUFFICIENT_WALLET }
    #[test_only]
    public fun e_wait_period_active(): u64 { E_WAIT_PERIOD_ACTIVE }
    #[test_only]
    public fun e_invalid_status(): u64 { E_INVALID_STATUS }
    #[test_only]
    public fun e_tribe_id_mismatch(): u64 { E_TRIBE_ID_MISMATCH }
    #[test_only]
    public fun e_zero_amount(): u64 { E_ZERO_AMOUNT }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
