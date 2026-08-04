// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_economy::tribe_exchange {
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use EVE::EVE::EVE;
    use std::string::{Self, String};
    use dapp_hub::tax_wallet::{Self, DAppTaxWallet};
    use dapp_hub::dapp_governance::{Self, GovernanceConfig};
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::tribe_vault::{Self, TribeVault};
    use bazaar_economy::economy_cap_store::{Self, EconomyCapStore};
    use bazaar_economy::finance_events;
    use bazaar_economy::exchange_rate_math;
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::bazaar_assertions;

    // ===== Version =====
    const PACKAGE_VERSION: u64 = 2;

    // ===== Constants =====
    /// Precision scaling factor for rate math. Prevents truncation-to-zero
    /// for small economies. (SA-006)
    const RATE_PRECISION: u64 = 1_000_000_000;
    const BPS_DENOMINATOR: u128 = 10_000;
    /// Minimum gross EVE (MIST) per swap. Defends against dust trades in
    /// hyperinflated economies where tokens cost only a few MIST: without
    /// this floor a buyer could siphon thousands of tokens for fractions of
    /// a MIST per token. 10_000 MIST = 0.00001 EVE — invisible at normal
    /// trade sizes, perceptible if a tribe leader mints recklessly.
    const MIN_SWAP_EVE_MIST: u64 = 10_000;

    // MINIMUM VIABLE ECONOMY:
    // For the exchange to produce non-zero sell outputs, the following must hold:
    //   (vault_balance - reserve) >= total_supply / RATE_PRECISION
    // total_supply is in scaled units (V26+ decimals=2 → 100 scaled units = 1.00 token).
    // Example: RATE_PRECISION = 10^9, supply = 100_000 scaled units (= 1,000.00 display
    // tokens), vault must hold at least reserve + 1 MIST. The precision-scaled rate
    // in that state is (10^9 / 100_000) = 10_000 MIST per scaled unit (= 1 MIST per
    // 0.01 display token = 1 EVE per 100,000.00 display tokens at bootstrap).
    // The bootstrap deposit should be at least reserve + (expected_supply / RATE_PRECISION).
    // Frontend MUST warn tribe leaders about minimum seeding requirements.

    // ===== Error Codes =====
    const E_EXCHANGE_INACTIVE:   u64 = 1;
    const E_INSUFFICIENT_EVE:    u64 = 2;
    const E_INSUFFICIENT_TOKENS: u64 = 3;
    const E_ZERO_RATE:           u64 = 4;
    const E_WRONG_TRIBE:         u64 = 5;
    const E_VAULT_BELOW_RESERVE: u64 = 6;
    const E_ZERO_OUTPUT:         u64 = 7;
    const E_ZERO_INPUT:          u64 = 8;
    const E_LEDGER_FROZEN:       u64 = 9;
    const E_TRIBE_ID_MISMATCH:   u64 = 10;  // R5.2 tribe-id coherence mismatch
    const E_BELOW_MIN_SWAP:      u64 = 11;  // gross EVE below MIN_SWAP_EVE_MIST floor
    /// V28 — Tribe wallet does not hold enough tokens to fulfill the requested
    /// EVE -> token swap. Leader must replenish via mint_to / burn or wait for
    /// player sells (token -> EVE) which credit tokens back to the tribe wallet.
    const E_TRIBE_WALLET_INSUFFICIENT: u64 = 12;

    // ===== Structs =====

    public struct ExchangeConfig has key {
        id: UID,
        tribe_id: u64,
        reserve_mist: u64,
        is_active: bool,
        exchange_fee_override_bps: Option<u64>,
        total_eve_in: u64,
        total_eve_out: u64,
        total_tokens_issued: u64,
        total_tokens_burned: u64,
        swap_count: u64,
        created_at_ms: u64,
    }

    // ===== Events =====

    public struct ExchangeSwapEvent has copy, drop {
        tribe_id: u64,
        player: address,
        direction: String,
        eve_gross: u64,
        dapp_tax: u64,
        eve_net: u64,
        tokens_delta: u64,
        rate_scaled: u64,
        new_vault_balance: u64,
        new_total_supply: u64,
        timestamp_ms: u64,
    }

    // ===== Package-Private Factory =====

    public(package) fun create_exchange_config(
        tribe_id: u64,
        reserve_mist: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ExchangeConfig {
        ExchangeConfig {
            id: object::new(ctx),
            tribe_id,
            reserve_mist,
            is_active: false,
            exchange_fee_override_bps: option::none(),
            total_eve_in: 0,
            total_eve_out: 0,
            total_tokens_issued: 0,
            total_tokens_burned: 0,
            swap_count: 0,
            created_at_ms: clock::timestamp_ms(clock),
        }
    }

    /// Share the config as a shared object. Called by economy_governance::bootstrap_advanced_complete.
    public(package) fun share(self: ExchangeConfig) {
        transfer::share_object(self);
    }

    // ===== Public Entry Functions =====

    /// Player pays EVE -> receives tribe token ledger credits.
    /// DApp tax deducted from EVE before vault deposit.
    /// V28: tokens are TRANSFERRED FROM THE TRIBE WALLET (gov_addr ledger row),
    /// not minted. Supply stays constant across swap activity; only leader
    /// mint_to / burn_tokens (via mint_burn_queue) changes supply.
    /// Aborts E_TRIBE_WALLET_INSUFFICIENT if the tribe wallet does not hold
    /// enough tokens to fulfill the requested amount.
    public fun swap_eve_to_tokens(
        ledger: &mut TribeTokenLedger,
        vault: &mut TribeVault,
        config: &mut ExchangeConfig,
        tribe_gov: &TribeGovernance,
        payment: Coin<EVE>,
        dapp_tax_wallet: &mut DAppTaxWallet,
        dapp_config: &GovernanceConfig,
        cap_store: &EconomyCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // R5.2 — bazaar-type gate (Advanced-only)
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        // R5.2 — tribe-id coherence (config is the canonical identifier for exchange scope)
        assert!(config.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        // SA-002/SA-003: Cross-object identity validation FIRST
        assert!(tribe_token_ledger::tribe_id(ledger) == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == config.tribe_id, E_WRONG_TRIBE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(config.is_active, E_EXCHANGE_INACTIVE);

        let gross_eve = coin::value(&payment);
        assert!(gross_eve > 0, E_ZERO_INPUT);
        assert!(gross_eve >= MIN_SWAP_EVE_MIST, E_BELOW_MIN_SWAP);

        let player = tx_context::sender(ctx);
        let fee_bps = effective_fee_bps(config, dapp_config);

        // SA-001: u128 intermediate for tax computation
        let dapp_tax = ((gross_eve as u128) * (fee_bps as u128) / BPS_DENOMINATOR) as u64;
        let net_eve = gross_eve - dapp_tax;
        assert!(net_eve > 0, E_INSUFFICIENT_EVE);

        // V28: tribe wallet (gov_addr ledger row) is the source of tokens.
        let gov_addr = object::id_address(tribe_gov);
        let tribe_wallet_bal = tribe_token_ledger::balance_of(ledger, gov_addr);
        assert!(tribe_wallet_bal > 0, E_TRIBE_WALLET_INSUFFICIENT);
        let vault_bal = tribe_vault::eve_balance(vault);
        let reserve = config.reserve_mist;
        let available = if (vault_bal > reserve) {
            (vault_bal as u128) - (reserve as u128)
        } else {
            assert!(false, E_ZERO_RATE);
            0u128
        };
        // V28: rate = vault_available / tribe_wallet_balance.
        let tokens_u128 = (net_eve as u128) * (tribe_wallet_bal as u128) / available;
        assert!(tokens_u128 > 0, E_ZERO_OUTPUT);
        let tokens_out = tokens_u128 as u64;
        assert!(tokens_out <= tribe_wallet_bal, E_TRIBE_WALLET_INSUFFICIENT);

        // GAS-16: vault_bal pre-deposit — reused for rate_scaled and eve_before.
        let rate_scaled = exchange_rate_math::compute_scaled_rate_v28_with_bal(
            vault_bal, config.reserve_mist, tribe_wallet_bal,
        );
        let eve_before = vault_bal;
        let circ_before = tribe_token_ledger::total_supply(ledger);

        // Gate only coin::split + tax deposit on dapp_tax > 0; vault deposit on common path.
        let mut payment_mut = payment;
        if (dapp_tax > 0) {
            let tax_coin = coin::split(&mut payment_mut, dapp_tax, ctx);
            let tax_cap = economy_cap_store::borrow_tax_deposit_cap(cap_store);
            tax_wallet::deposit_dapp_tax(
                dapp_tax_wallet, tax_cap, tax_coin,
                b"token_exchange", b"advanced",
                @0x0,
                config.tribe_id,
                player, player,
                gross_eve, 0, 0, net_eve,
                clock,
            );
        };
        tribe_vault::internal_deposit(vault, payment_mut, b"exchange", player, clock);
        tribe_token_ledger::internal_transfer(ledger, gov_addr, player, tokens_out);

        // Update config stats
        config.total_eve_in = config.total_eve_in + net_eve;
        config.total_tokens_issued = config.total_tokens_issued + tokens_out;
        config.swap_count = config.swap_count + 1;

        let eve_after = tribe_vault::eve_balance(vault);
        let circ_after = tribe_token_ledger::total_supply(ledger);
        let ts_ms = clock::timestamp_ms(clock);

        event::emit(ExchangeSwapEvent {
            tribe_id: config.tribe_id,
            player,
            direction: string::utf8(b"eve_to_token"),
            eve_gross: gross_eve,
            dapp_tax,
            eve_net: net_eve,
            tokens_delta: tokens_out,
            rate_scaled,
            new_vault_balance: eve_after,
            new_total_supply: circ_after,
            timestamp_ms: ts_ms,
        });

        finance_events::emit_finance(
            config.tribe_id,
            finance_events::event_type_swap_eve_to_token(),
            player,
            net_eve,
            eve_before, eve_after,
            circ_before, circ_after,
            ts_ms,
        );
    }

    /// Player returns tribe token ledger balance -> receives EVE from vault.
    /// V28: tokens are TRANSFERRED BACK TO THE TRIBE WALLET (gov_addr ledger
    /// row), not burned. Supply stays constant. Reserve floor enforced:
    /// vault_balance - gross_eve >= reserve_mist (SA-004).
    public fun swap_tokens_to_eve(
        ledger: &mut TribeTokenLedger,
        vault: &mut TribeVault,
        config: &mut ExchangeConfig,
        tribe_gov: &TribeGovernance,
        tokens_to_sell: u64,
        dapp_tax_wallet: &mut DAppTaxWallet,
        dapp_config: &GovernanceConfig,
        cap_store: &EconomyCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(config.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        // SA-002/SA-003: Cross-object identity validation FIRST
        assert!(tribe_token_ledger::tribe_id(ledger) == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == config.tribe_id, E_WRONG_TRIBE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(config.is_active, E_EXCHANGE_INACTIVE);
        assert!(tokens_to_sell > 0, E_ZERO_INPUT);

        let player = tx_context::sender(ctx);
        let player_bal = tribe_token_ledger::balance_of(ledger, player);
        assert!(player_bal >= tokens_to_sell, E_INSUFFICIENT_TOKENS);

        // V28: rate uses tribe wallet stock, not total supply.
        let gov_addr_pre = object::id_address(tribe_gov);
        let tribe_wallet_bal_pre = tribe_token_ledger::balance_of(ledger, gov_addr_pre);
        let scaled_rate = compute_scaled_rate_v28(vault, config, tribe_wallet_bal_pre);
        assert!(scaled_rate > 0, E_ZERO_RATE);

        // SA-001: u128 intermediates for gross EVE computation
        let gross_eve = ((tokens_to_sell as u128) * (scaled_rate as u128) / (RATE_PRECISION as u128)) as u64;
        assert!(gross_eve > 0, E_ZERO_OUTPUT);

        // SA-004: Reserve floor — vault must retain at least reserve_mist after withdrawal
        let vault_bal = tribe_vault::eve_balance(vault);
        assert!(
            vault_bal >= gross_eve + config.reserve_mist,
            E_VAULT_BELOW_RESERVE
        );

        let fee_bps = effective_fee_bps(config, dapp_config);
        // SA-001: u128 tax computation
        let dapp_tax = ((gross_eve as u128) * (fee_bps as u128) / BPS_DENOMINATOR) as u64;
        let net_eve = gross_eve - dapp_tax;

        // GAS-16: vault_bal pre-withdrawal — reused for eve_before.
        let eve_before = vault_bal;
        let circ_before = tribe_token_ledger::total_supply(ledger);

        // V28: return tokens FROM player TO tribe wallet (supply unchanged).
        tribe_token_ledger::internal_transfer(ledger, player, gov_addr_pre, tokens_to_sell);

        // Gate only coin::split + tax deposit on dapp_tax > 0; player transfer on common path.
        let mut vault_coin = tribe_vault::internal_withdraw(vault, gross_eve, b"exchange_redeem", player, clock, ctx);
        if (dapp_tax > 0) {
            let tax_coin = coin::split(&mut vault_coin, dapp_tax, ctx);
            let tax_cap = economy_cap_store::borrow_tax_deposit_cap(cap_store);
            tax_wallet::deposit_dapp_tax(
                dapp_tax_wallet, tax_cap, tax_coin,
                b"token_exchange", b"advanced",
                @0x0,
                config.tribe_id,
                player, player,
                gross_eve, 0, 0, net_eve,
                clock,
            );
        };
        transfer::public_transfer(vault_coin, player);

        config.total_eve_out = config.total_eve_out + gross_eve;
        // V28: counter name preserved for upgrade compatibility (no longer burned).
        config.total_tokens_burned = config.total_tokens_burned + tokens_to_sell;
        config.swap_count = config.swap_count + 1;

        let eve_after = tribe_vault::eve_balance(vault);
        let circ_after = tribe_token_ledger::total_supply(ledger);
        let ts_ms = clock::timestamp_ms(clock);

        event::emit(ExchangeSwapEvent {
            tribe_id: config.tribe_id,
            player,
            direction: string::utf8(b"token_to_eve"),
            eve_gross: gross_eve,
            dapp_tax,
            eve_net: net_eve,
            tokens_delta: tokens_to_sell,
            rate_scaled: scaled_rate,
            new_vault_balance: eve_after,
            new_total_supply: circ_after,
            timestamp_ms: ts_ms,
        });

        finance_events::emit_finance(
            config.tribe_id,
            finance_events::event_type_swap_token_to_eve(),
            player,
            net_eve,
            eve_before, eve_after,
            circ_before, circ_after,
            ts_ms,
        );
    }

    // ===== Public Read-Only Accessors =====

    /// Returns unscaled rate in MIST per **scaled token unit** (for display).
    /// 0 if underfunded or no supply. To convert to "MIST per display token"
    /// the FE multiplies by `10^decimals(ledger)`.
    public fun exchange_rate(
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        config: &ExchangeConfig,
    ): u64 {
        assert!(tribe_token_ledger::tribe_id(ledger) == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == config.tribe_id, E_WRONG_TRIBE);
        compute_scaled_rate(vault, ledger, config) / RATE_PRECISION
    }

    /// Returns precision-scaled rate (for frontend to compute exact swap quotes).
    public fun exchange_rate_scaled(
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        config: &ExchangeConfig,
    ): u64 {
        assert!(tribe_token_ledger::tribe_id(ledger) == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == config.tribe_id, E_WRONG_TRIBE);
        compute_scaled_rate(vault, ledger, config)
    }

    /// V28 public accessor — rate via the tribe wallet denominator. FE should
    /// call this in place of `exchange_rate` to display the price players will
    /// actually pay. The legacy `exchange_rate` + `exchange_rate_scaled` remain
    /// for SSU tax-credit redemption (`withdraw_ssu_tax_credits`) which still
    /// burns against total supply.
    public fun exchange_rate_v28(
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        config: &ExchangeConfig,
        tribe_gov: &TribeGovernance,
    ): u64 {
        assert!(tribe_token_ledger::tribe_id(ledger) == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == config.tribe_id, E_WRONG_TRIBE);
        assert!(config.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        let gov_addr = object::id_address(tribe_gov);
        let tribe_wallet_bal = tribe_token_ledger::balance_of(ledger, gov_addr);
        compute_scaled_rate_v28(vault, config, tribe_wallet_bal) / RATE_PRECISION
    }

    public fun exchange_rate_scaled_v28(
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        config: &ExchangeConfig,
        tribe_gov: &TribeGovernance,
    ): u64 {
        assert!(tribe_token_ledger::tribe_id(ledger) == tribe_vault::tribe_id(vault), E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == config.tribe_id, E_WRONG_TRIBE);
        assert!(config.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        let gov_addr = object::id_address(tribe_gov);
        let tribe_wallet_bal = tribe_token_ledger::balance_of(ledger, gov_addr);
        compute_scaled_rate_v28(vault, config, tribe_wallet_bal)
    }

    /// V28 — Tribe wallet token stock (the gov_addr ledger row balance).
    /// FE displays "tokens available to buy" using this.
    public fun tribe_wallet_balance(
        ledger: &TribeTokenLedger,
        tribe_gov: &TribeGovernance,
    ): u64 {
        let gov_addr = object::id_address(tribe_gov);
        tribe_token_ledger::balance_of(ledger, gov_addr)
    }

    public fun is_exchange_active(config: &ExchangeConfig): bool { config.is_active }
    public fun tribe_id(config: &ExchangeConfig): u64 { config.tribe_id }
    public fun reserve_mist(config: &ExchangeConfig): u64 { config.reserve_mist }
    public fun fee_override_bps(config: &ExchangeConfig): Option<u64> { config.exchange_fee_override_bps }
    public fun swap_count(config: &ExchangeConfig): u64 { config.swap_count }
    public fun total_eve_in(config: &ExchangeConfig): u64 { config.total_eve_in }
    public fun total_eve_out(config: &ExchangeConfig): u64 { config.total_eve_out }

    // ===== Package-Private Mutators =====

    public(package) fun set_active(config: &mut ExchangeConfig, active: bool) {
        config.is_active = active;
    }

    public(package) fun set_reserve(config: &mut ExchangeConfig, reserve_mist: u64) {
        config.reserve_mist = reserve_mist;
    }

    public(package) fun set_fee_override(config: &mut ExchangeConfig, override_bps: Option<u64>) {
        config.exchange_fee_override_bps = override_bps;
    }

    // ===== Private Helpers =====
    // Rate-math implementations live in exchange_rate_math.move (CC-003 / Article XIV.4).

    fun compute_scaled_rate(
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        config: &ExchangeConfig,
    ): u64 {
        exchange_rate_math::compute_scaled_rate(
            vault, ledger, config.reserve_mist,
        )
    }

    fun compute_scaled_rate_v28(
        vault: &TribeVault,
        config: &ExchangeConfig,
        tribe_wallet_balance: u64,
    ): u64 {
        exchange_rate_math::compute_scaled_rate_v28(
            vault, config.reserve_mist, tribe_wallet_balance,
        )
    }

    fun effective_fee_bps(config: &ExchangeConfig, dapp_config: &GovernanceConfig): u64 {
        if (option::is_some(&config.exchange_fee_override_bps)) {
            *option::borrow(&config.exchange_fee_override_bps)
        } else {
            dapp_governance::advanced_exchange_dapp_tax_bps(dapp_config)
        }
    }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(tribe_id: u64, reserve_mist: u64, clock: &Clock, ctx: &mut TxContext): ExchangeConfig {
        create_exchange_config(tribe_id, reserve_mist, clock, ctx)
    }

    #[test_only]
    public fun effective_fee_bps_for_testing(
        config: &ExchangeConfig,
        dapp_config: &GovernanceConfig,
    ): u64 {
        effective_fee_bps(config, dapp_config)
    }

    #[test_only]
    public fun set_active_for_testing(config: &mut ExchangeConfig, active: bool) {
        set_active(config, active)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
