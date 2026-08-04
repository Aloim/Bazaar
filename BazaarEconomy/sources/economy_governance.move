// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_economy::economy_governance {
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use EVE::EVE::EVE;
    use std::string::{Self, String};
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use dapp_hub::tax_wallet::TaxDepositCap;
    use dapp_hub::tribe_registry::TribeLeaderCap;
    use dapp_hub::tribe_registry;
    use dapp_hub::tribe_registry::TribeRegistry;
    use bazaar_core::bazaar_core_admin::TribeTokenShopCap;
    use bazaar_economy::economy_cap_store::{Self, EconomyCapStore};
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::tribe_vault::{Self, TribeVault};
    use bazaar_economy::tribe_exchange::{Self, ExchangeConfig};
    use bazaar_economy::vault_withdrawal::{Self, WithdrawalBoard};
    use bazaar_economy::mint_burn_queue;
    use bazaar_economy::finance_events;
    use bazaar_economy::advanced_direct_trade;
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::tribe_governance_bootstrap;
    use bazaar_core::bazaar_assertions;

    // ===== Version =====
    const PACKAGE_VERSION: u64 = 2;

    // ===== Error Codes =====
    // V16 — E_LEDGER_FROZEN, E_VAULT_UNDERFUNDED, E_MINTING_BLOCKED retired
    // alongside mint_supply + burn_tokens. The mint-block check now lives in
    // bazaar_economy::mint_burn_queue.
    const E_WRONG_TRIBE:              u64 = 1;
    const E_ZERO_AMOUNT:              u64 = 4;
    const E_SUPPLY_CAP_BELOW_CURRENT: u64 = 5;   // new supply cap < current total_supply
    const E_FEE_TOO_HIGH:             u64 = 7;   // fee override > 5000 bps
    const E_INVALID_QUORUM:           u64 = 8;   // quorum out of range 1-10
    const E_TRIBE_ID_MISMATCH:        u64 = 9;   // R5.2 tribe-id coherence mismatch
    const E_RESERVE_TOO_HIGH:         u64 = 10;  // reserve > 1000 SUI
    // V19: bootstrap_advanced_complete takes a Coin<EVE> initial deposit and
    // aborts when the deposit is below MIN_BOOTSTRAP_DEPOSIT_MIST (1 EVE).
    // V23: the deposit value is no longer doubled as the on-chain reserve —
    // the exchange now bootstraps with reserve = 0 so the seed deposit is
    // immediately usable as exchange liquidity.
    const E_DEPOSIT_TOO_SMALL:        u64 = 11;

    // ===== Constants =====
    const MAX_RESERVE_MIST:    u64 = 1_000_000_000_000; // 1000 SUI in MIST
    const MAX_FEE_BPS:         u64 = 5_000;              // 50%
    const MIN_QUORUM:          u64 = 1;
    const MAX_QUORUM:          u64 = 10;
    // V19 — minimum bootstrap deposit (1 EVE in MIST). Hardcoded so the form
    // collects a single "initial deposit" field; the user no longer picks the
    // reserve. V23: split semantically — this constant is now ONLY the floor
    // for the mandatory seed deposit. The exchange reserve at bootstrap is 0
    // so the seed is immediately available as liquidity (vault − reserve > 0
    // on the very first swap, no more "deposit 1 extra EVE" friction).
    const MIN_BOOTSTRAP_DEPOSIT_MIST: u64 = 1_000_000_000;
    // V19 — tokens minted to the tribe wallet (gov.id_address) at bootstrap.
    // Bypasses Article XIII.4 mint-block as a one-shot genesis allocation.
    // V26+ — value is in scaled units (decimals=2). 10_000_000 scaled units
    // = 100,000.00 display tokens, preserving the V19-V25 display experience
    // after the decimals=2 rebase. Leaders can request additional mints
    // afterward via the SuperAdmin Mint/Burn Queue.
    const GENESIS_MINT_AMOUNT: u64 = 10_000_000;

    // ===== Events =====
    //
    // V16: EconomyMintEvent + EconomyBurnEvent retired alongside the direct
    // mint_supply + burn_tokens public entries. The replacement flow lives in
    // bazaar_economy::mint_burn_queue which emits its own request/execute/reject
    // events plus FinanceEvent codes 0/1/11/12/13. No FE consumer needed both
    // event streams — keeping a single source of truth simplifies useFinanceEvents.

    public struct ReserveUpdatedEvent has copy, drop {
        tribe_id: u64,
        new_reserve_mist: u64,
        timestamp_ms: u64,
    }

    public struct TribeEconomyInitializedEvent has copy, drop {
        tribe_id: u64,
        token_name: String,
        token_symbol: String,
        reserve_mist: u64,
        required_approvals: u64,
        initial_deposit_mist: u64,      // V19 — EVE seeded into the vault at bootstrap
        genesis_mint_amount: u64,        // V19 — tokens credited to the tribe wallet at bootstrap
        timestamp_ms: u64,
    }

    /// V26 D5 — per-tribe AdvancedTradeRegistry created + shared at bootstrap.
    /// FE indexes this event to resolve the registry ID per tribe (the ID is
    /// not stored on TribeRegistry to avoid struct expansion).
    public struct AdvancedTradeRegistryCreatedEvent has copy, drop {
        tribe_id: u64,
        registry_id: address,
        timestamp_ms: u64,
    }

    public struct AddLiquidityEvent has copy, drop {
        tribe_id: u64,
        provider: address,
        amount: u64,
        new_vault_balance: u64,
        timestamp_ms: u64,
    }

    public struct FeeOverrideSetEvent has copy, drop {
        tribe_id: u64,
        override_bps: Option<u64>,
        timestamp_ms: u64,
    }

    public struct SupplyCapSetEvent has copy, drop {
        tribe_id: u64,
        new_supply_cap: u64,
        timestamp_ms: u64,
    }

    public struct LedgerFrozenEvent has copy, drop {
        tribe_id: u64,
        frozen: bool,
        actor: address,
        timestamp_ms: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        let cap_store = economy_cap_store::create_cap_store(ctx);
        economy_cap_store::share(cap_store);
    }

    // ===== Cap Setup Functions (re-exported, DApp Owner gated, one-time) =====
    // These are passthrough wrappers — the struct and logic live in economy_cap_store.

    /// Transfer TribeTokenShopCap into EconomyCapStore. Call once after deployment.
    public fun receive_shop_cap(
        store: &mut EconomyCapStore,
        cap: TribeTokenShopCap,
        owner_cap: &DAppOwnerCap,
    ) {
        economy_cap_store::receive_shop_cap(store, cap, owner_cap);
    }

    /// Transfer TaxDepositCap into EconomyCapStore. Call once after deployment.
    public fun receive_tax_deposit_cap(
        store: &mut EconomyCapStore,
        cap: TaxDepositCap,
        owner_cap: &DAppOwnerCap,
    ) {
        economy_cap_store::receive_tax_deposit_cap(store, cap, owner_cap);
    }

    // ===== V17 Atomic Bootstrap (Advanced tribes) =====
    /// V17: SINGLE-CALL atomic bootstrap for an Advanced tribe — replaces the
    /// 2-step (bootstrap_tribe_governance + initialize_tribe_economy) flow that
    /// shipped through V16. Reads token_name + token_symbol from the Tribe row
    /// (set at create_advanced_tribe time — no FE re-entry). Creates and shares
    /// TribeGovernance + WidgetConfig (via tribe_governance_bootstrap) AND the
    /// five economy shared objects (ledger / vault / exchange config / withdrawal
    /// board / mint-burn queue) AND writes both registry one-shot setters, all
    /// inside one user transaction.
    ///
    /// Aborts:
    ///   - bazaar_assertions::E_NOT_ADVANCED_BAZAAR — Easy tribe (route through
    ///     bazaar_core::tribe_governance_bootstrap::bootstrap_tribe_governance instead)
    ///   - tribe_registry::E_TOKEN_NOT_SET — Advanced tribe row missing token fields
    ///     (defense in depth; create_advanced_tribe always sets them)
    ///   - E_DEPOSIT_TOO_SMALL — initial_deposit value < 1 EVE (MIN_BOOTSTRAP_DEPOSIT_MIST)
    ///   - tribe_registry::E_ALREADY_SET — tribe already partially bootstrapped
    ///   - tribe_registry::E_NOT_TRIBE_LEADER — leader_cap mismatch
    ///
    /// V19 changes:
    ///   - `initial_reserve_mist: u64` replaced by `initial_deposit: Coin<EVE>` —
    ///     the value is deposited into the freshly-created TribeVault, no longer
    ///     stored as a config number.
    ///   - 100_000 tribe tokens (`GENESIS_MINT_AMOUNT`) are minted to the tribe
    ///     wallet (`gov.id_address`) — bypasses Article XIII.4 mint-block as a
    ///     one-shot genesis allocation.
    ///
    /// V23 changes:
    ///   - Reserve at bootstrap is now 0 (not 1 EVE). The mandatory 1 EVE seed
    ///     deposit (`MIN_BOOTSTRAP_DEPOSIT_MIST`) is fully available to the
    ///     exchange immediately — no "deposit 1 extra EVE" friction.
    ///   - Exchange is auto-activated (`is_active = true`) inside this fn.
    ///     There is no pause/resume entry — activation is one-shot at bootstrap.
    public entry fun bootstrap_advanced_complete(
        leader_cap: &TribeLeaderCap,
        registry: &mut TribeRegistry,
        package_id: address,
        initial_deposit: Coin<EVE>,
        initial_required_approvals: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // V19: deposit must be at least 1 EVE — mandatory seed for the vault.
        // V23: this is purely a seed floor; the on-chain reserve is now 0 so
        // the seed is immediately available as exchange liquidity.
        let deposit_amount = coin::value(&initial_deposit);
        assert!(deposit_amount >= MIN_BOOTSTRAP_DEPOSIT_MIST, E_DEPOSIT_TOO_SMALL);

        // B3.3 ADV-06: assert quorum bounds at bootstrap, consistent with
        // the post-hoc setter's assert at set_required_approvals.
        assert!(
            initial_required_approvals >= MIN_QUORUM &&
            initial_required_approvals <= MAX_QUORUM,
            E_INVALID_QUORUM,
        );

        let tribe_id = tribe_registry::cap_tribe_id(leader_cap);
        let sender = tx_context::sender(ctx);

        // Validate Advanced gate + capture token bytes BEFORE we mutate the registry.
        // Inner block releases the immutable borrow before the mutable accesses below.
        let (token_name_bytes, token_symbol_bytes) = {
            let tribe = tribe_registry::tribe_by_id(registry, tribe_id);
            let bt = tribe_registry::tribe_bazaar_type(tribe);
            bazaar_assertions::assert_advanced_external(bt);
            (
                *string::as_bytes(tribe_registry::tribe_token_name_unchecked(tribe)),
                *string::as_bytes(tribe_registry::tribe_token_symbol_unchecked(tribe)),
            )
        };

        // Step 1 — TribeGovernance + WidgetConfig (cross-package call into bazaar_core).
        let gov_addr = tribe_governance_bootstrap::bootstrap_tribe_governance_atomic(
            registry, leader_cap, package_id, clock, ctx,
        );
        tribe_registry::set_tribe_gov_id(leader_cap, registry, tribe_id, gov_addr, clock, ctx);

        // Step 2 — five economy shared objects (token ledger, vault, exchange config,
        // withdrawal board, mint-burn queue). ledger + vault need `mut` for V19
        // genesis-mint + initial-deposit performed below.
        let mut ledger = tribe_token_ledger::create_ledger(tribe_id, token_name_bytes, token_symbol_bytes, clock, ctx);
        let mut vault = tribe_vault::create_vault(tribe_id, ctx);
        // V23: reserve = 0 at bootstrap (was INITIAL_RESERVE_MIST = 1 EVE) so
        // the seed deposit is immediately usable as exchange liquidity.
        let mut config = tribe_exchange::create_exchange_config(tribe_id, 0, clock, ctx);
        // V23: auto-activate the exchange. Bootstrap deposits EVE + mints the
        // genesis 100k tokens + sets reserve=0 — every prerequisite for a
        // working AMM is satisfied here, so the exchange is live from t=0.
        // Activation is one-shot; the FE pause/resume builder + Move entry
        // have been removed as dead code (V23 orphan sweep).
        tribe_exchange::set_active(&mut config, true);
        let board = vault_withdrawal::create_withdrawal_board(tribe_id, initial_required_approvals, ctx);
        let queue = mint_burn_queue::create_queue(tribe_id, ctx);

        // V19 — seed the vault with the user-supplied initial deposit (Coin<EVE>).
        tribe_vault::internal_deposit(&mut vault, initial_deposit, b"bootstrap_deposit", sender, clock);

        // V19 — genesis mint of GENESIS_MINT_AMOUNT tokens to the tribe wallet
        // at gov_addr. One-shot; not callable from any FE path.
        tribe_token_ledger::genesis_mint(&mut ledger, gov_addr, GENESIS_MINT_AMOUNT, clock);

        let t_name = *tribe_token_ledger::token_name(&ledger);
        let t_symbol = *tribe_token_ledger::token_symbol(&ledger);

        // OS-28: register economy IDs back into TribeRegistry (one-shot, Decision #2).
        // IDs inlined; captured BEFORE share_object consumes the objects.
        tribe_registry::set_tribe_economy_ids(
            leader_cap, registry, tribe_id,
            object::id_address(&vault),
            object::id_address(&ledger),
            object::id_address(&config),
            object::id_address(&board),
            object::id_address(&queue),
            clock, ctx,
        );

        tribe_token_ledger::share(ledger);
        tribe_vault::share(vault);
        tribe_exchange::share(config);
        vault_withdrawal::share(board);
        mint_burn_queue::share(queue);

        // V26 D5 — per-tribe Advanced DirectTrade registry. ID is emitted in
        // AdvancedTradeRegistryCreated below for FE indexing; not stored in
        // TribeRegistry (Article XV-friendly: no struct expansion).
        let trade_reg = advanced_direct_trade::create_advanced_trade_registry(tribe_id, ctx);
        let trade_reg_id = object::id_address(&trade_reg);
        advanced_direct_trade::share_advanced_trade_registry(trade_reg);

        let ts_ms = clock::timestamp_ms(clock);

        // V19 — FinanceEvent code 0 (MINT) for the genesis credit so it shows
        // in FinanceNewsPanel + downstream supply-utilization reads.
        finance_events::emit_finance(
            tribe_id,
            finance_events::event_type_mint(),
            sender,
            GENESIS_MINT_AMOUNT,
            0, deposit_amount,                     // eve_reserve_before/after (post-deposit)
            0, GENESIS_MINT_AMOUNT,                // circulation_before/after
            ts_ms,
        );

        event::emit(TribeEconomyInitializedEvent {
            tribe_id,
            token_name: t_name,
            token_symbol: t_symbol,
            // V23: reserve at bootstrap is 0 (not the mandatory deposit floor).
            reserve_mist: 0,
            required_approvals: initial_required_approvals,
            initial_deposit_mist: deposit_amount,
            genesis_mint_amount: GENESIS_MINT_AMOUNT,
            timestamp_ms: ts_ms,
        });
        event::emit(AdvancedTradeRegistryCreatedEvent {
            tribe_id,
            registry_id: trade_reg_id,
            timestamp_ms: ts_ms,
        });
    }

    // ===== Mint / Burn — RETIRED in V16 =====
    // The direct mint_supply + burn_tokens entries are gone. Both flows now
    // run through bazaar_economy::mint_burn_queue with a 24h wait period and
    // a single-rejection veto by any TribeLeaderCap or TribeSuperAdminCap.
    // The Article XIII.4 mint-block (vault > reserve) is enforced both at
    // request_mint time AND at execute time inside the queue module.

    // ===== Reserve Configuration (DApp Owner only — Article XIII.5) =====
    public fun set_reserve(
        _owner_cap: &DAppOwnerCap,
        tribe_gov: &TribeGovernance,
        config: &mut ExchangeConfig,
        reserve_mist: u64,
        clock: &Clock,
        _ctx: &mut TxContext,  // CC-009: ctx param required by API contract
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        // SA-05: DAppOwnerCap is global; coherence assures op targets the intended tribe
        assert!(tribe_exchange::tribe_id(config) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(reserve_mist <= MAX_RESERVE_MIST, E_RESERVE_TOO_HIGH);
        tribe_exchange::set_reserve(config, reserve_mist);
        event::emit(ReserveUpdatedEvent {
            tribe_id: tribe_exchange::tribe_id(config),
            new_reserve_mist: reserve_mist,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Fee Override (DApp Owner only) =====
    // CC-003: New function — was missing from original proposal

    /// Override the dApp exchange fee for this tribe. Pass option::none() to revert to global rate.
    public fun set_exchange_fee_override(
        _owner_cap: &DAppOwnerCap,
        tribe_gov: &TribeGovernance,
        config: &mut ExchangeConfig,
        override_bps: Option<u64>,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        // SA-05: DAppOwnerCap is global; coherence assures op targets the intended tribe
        assert!(tribe_exchange::tribe_id(config) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        if (option::is_some(&override_bps)) {
            let bps = *option::borrow(&override_bps);
            assert!(bps <= MAX_FEE_BPS, E_FEE_TOO_HIGH);
        };
        tribe_exchange::set_fee_override(config, override_bps);
        event::emit(FeeOverrideSetEvent {
            tribe_id: tribe_exchange::tribe_id(config),
            override_bps,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Emergency Freeze (DApp Owner only) =====
    // CC-004: Renamed from freeze_ledger to set_ledger_frozen; CC-003: added clock+ctx params

    public fun set_ledger_frozen(
        _owner_cap: &DAppOwnerCap,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        frozen: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        // SA-05: DAppOwnerCap is global; coherence assures op targets the intended tribe
        assert!(tribe_token_ledger::tribe_id(ledger) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        tribe_token_ledger::set_frozen(ledger, frozen);
        event::emit(LedgerFrozenEvent {
            tribe_id: tribe_token_ledger::tribe_id(ledger),
            frozen,
            actor: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Vault Lock/Unlock (DApp Owner only) =====
    // CC-004: Split lock_vault(bool) into lock_vault + unlock_vault

    public fun lock_vault(
        _owner_cap: &DAppOwnerCap,
        tribe_gov: &TribeGovernance,
        vault: &mut TribeVault,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        // SA-05: DAppOwnerCap is global; coherence assures op targets the intended tribe
        assert!(tribe_vault::tribe_id(vault) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        tribe_vault::set_locked(vault, true);
        let _ = clock;
    }

    public fun unlock_vault(
        _owner_cap: &DAppOwnerCap,
        tribe_gov: &TribeGovernance,
        vault: &mut TribeVault,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        // SA-05: DAppOwnerCap is global; coherence assures op targets the intended tribe
        assert!(tribe_vault::tribe_id(vault) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        tribe_vault::set_locked(vault, false);
        let _ = clock;
    }

    // ===== Add Liquidity (TribeLeaderCap gated) =====
    // CC-003: New function — was missing from original proposal

    /// Tribe Leader adds EVE liquidity directly to the vault.
    /// Emits AddLiquidityEvent for frontend ExchangeTab tracking.
    /// V15: ledger arg added so FinanceEvent can include circulation snapshot.
    public fun add_liquidity(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        vault: &mut TribeVault,
        ledger: &TribeTokenLedger,
        payment: Coin<EVE>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tribe_registry::cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        let tid = tribe_registry::cap_tribe_id(cap);
        assert!(tid == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(tid == tribe_token_ledger::tribe_id(ledger), E_WRONG_TRIBE);
        let amount = coin::value(&payment);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let provider = tx_context::sender(ctx);
        let eve_before = tribe_vault::eve_balance(vault);
        let circ = tribe_token_ledger::total_supply(ledger);
        tribe_vault::internal_deposit(vault, payment, b"add_liquidity", provider, clock);
        let eve_after = tribe_vault::eve_balance(vault);
        let ts_ms = clock::timestamp_ms(clock);
        event::emit(AddLiquidityEvent {
            tribe_id: tid,
            provider,
            amount,
            new_vault_balance: eve_after,
            timestamp_ms: ts_ms,
        });
        finance_events::emit_finance(
            tid,
            finance_events::event_type_vault_deposit(),
            provider,
            amount,
            eve_before, eve_after,
            circ, circ,
            ts_ms,
        );
    }

    // ===== Supply Cap (TribeLeaderCap gated) =====
    // CC-003: New function — was missing from original proposal

    /// Set or clear a supply cap. 0 = no cap. Aborts if new cap < current total_supply.
    public fun set_supply_cap(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        new_cap: u64,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tribe_registry::cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        let tid = tribe_registry::cap_tribe_id(cap);
        assert!(tid == tribe_token_ledger::tribe_id(ledger), E_WRONG_TRIBE);
        // When setting a non-zero cap it must be at least equal to the current supply
        if (new_cap > 0) {
            assert!(new_cap >= tribe_token_ledger::total_supply(ledger), E_SUPPLY_CAP_BELOW_CURRENT);
        };
        tribe_token_ledger::set_supply_cap(ledger, new_cap);
        event::emit(SupplyCapSetEvent {
            tribe_id: tid,
            new_supply_cap: new_cap,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Exchange Health Queries =====
    // CC-003: New functions — were missing from original proposal

    /// Returns (vault_balance, reserve_mist, exchange_rate_scaled, is_active).
    /// Frontend uses this for health dashboard in ExchangeTab.
    public fun exchange_health(
        config: &ExchangeConfig,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
    ): (u64, u64, u64, bool) {
        let vault_balance = tribe_vault::eve_balance(vault);
        let reserve = tribe_exchange::reserve_mist(config);
        let rate_scaled = tribe_exchange::exchange_rate_scaled(vault, ledger, config);
        let is_active = tribe_exchange::is_exchange_active(config);
        (vault_balance, reserve, rate_scaled, is_active)
    }

    /// Returns (total_supply, supply_cap). supply_cap == 0 means uncapped.
    public fun supply_utilization(ledger: &TribeTokenLedger): (u64, u64) {
        (tribe_token_ledger::total_supply(ledger), tribe_token_ledger::supply_cap(ledger))
    }

    /// Returns true when vault_balance > reserve_mist (minting allowed per Article XIII.4).
    public fun can_mint(vault: &TribeVault, config: &ExchangeConfig): bool {
        tribe_vault::eve_balance(vault) > tribe_exchange::reserve_mist(config)
    }

    // ===== Quorum Config (TribeLeaderCap gated) =====

    public fun set_required_approvals(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        board: &mut WithdrawalBoard,
        n: u64,
        _clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(tribe_registry::cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(tribe_registry::cap_tribe_id(cap) == vault_withdrawal::board_tribe_id(board), E_WRONG_TRIBE);
        // CC-006: Quorum bounds validation — must be between 1 and 10
        assert!(n >= MIN_QUORUM && n <= MAX_QUORUM, E_INVALID_QUORUM);
        vault_withdrawal::set_required_approvals(board, n);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
