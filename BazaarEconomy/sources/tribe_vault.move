// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_economy::tribe_vault {
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use EVE::EVE::EVE;
    use std::string::{Self, String};
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use dapp_hub::tribe_registry::TribeLeaderCap;
    use dapp_hub::tribe_registry;
    use dapp_hub::ceremony_gate::{Self, CeremonyGate};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::bazaar_assertions;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::finance_events;

    // ===== Version =====
    const PACKAGE_VERSION: u64 = 2;

    // ===== Error Codes =====
    const E_VAULT_LOCKED:              u64 = 1;
    const E_INSUFFICIENT_VAULT_BALANCE: u64 = 2;
    const E_WRONG_TRIBE:               u64 = 3;
    const E_ZERO_AMOUNT:               u64 = 4;
    const E_TRIBE_ID_MISMATCH:         u64 = 5;   // R5.2 tribe-id coherence mismatch
    const E_CEREMONY_NOT_OPEN:         u64 = 6;   // Update Ceremony V2 (Slice 2): SA-RCV2-06

    // ===== Structs =====

    public struct TribeVault has key {
        id: UID,
        tribe_id: u64,
        eve_balance: Balance<EVE>,
        total_deposited: u64,
        total_withdrawn: u64,
        deposit_count: u64,
        withdrawal_count: u64,
        is_locked: bool,
    }

    // ===== Events =====

    public struct VaultDepositEvent has copy, drop {
        tribe_id: u64,
        depositor: address,
        amount: u64,
        new_balance: u64,
        source: String,
        timestamp_ms: u64,
    }

    public struct VaultWithdrawEvent has copy, drop {
        tribe_id: u64,
        recipient: address,
        amount: u64,
        new_balance: u64,
        source: String,
        timestamp_ms: u64,
    }

    /// Update Ceremony V2 (Slice 2): forensic event for the leader-gated legacy vault drain.
    public struct LegacyTribeVaultWithdrawn has copy, drop {
        tribe_id: u64,
        amount: u64,
        leader: address,
        timestamp_ms: u64,
    }

    // ===== Package-Private Factory =====

    public(package) fun create_vault(
        tribe_id: u64,
        ctx: &mut TxContext,
    ): TribeVault {
        TribeVault {
            id: object::new(ctx),
            tribe_id,
            eve_balance: balance::zero(),
            total_deposited: 0,
            total_withdrawn: 0,
            deposit_count: 0,
            withdrawal_count: 0,
            is_locked: false,
        }
    }

    /// Share the vault as a shared object. Called by economy_governance::bootstrap_advanced_complete.
    public(package) fun share(self: TribeVault) {
        transfer::share_object(self);
    }

    // ===== Public Entry Functions =====

    /// Tribe Leader direct EVE deposit to back the exchange.
    /// V15: ledger arg added so FinanceEvent can include circulation snapshot.
    public fun deposit_eve(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        vault: &mut TribeVault,
        ledger: &TribeTokenLedger,
        payment: Coin<EVE>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(vault.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(tribe_registry::cap_tribe_id(cap) == vault.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == vault.tribe_id, E_WRONG_TRIBE);
        assert!(!vault.is_locked, E_VAULT_LOCKED);
        let amount = coin::value(&payment);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let depositor = tx_context::sender(ctx);
        let eve_before = balance::value(&vault.eve_balance);
        let circ = tribe_token_ledger::total_supply(ledger);
        balance::join(&mut vault.eve_balance, coin::into_balance(payment));
        vault.total_deposited = vault.total_deposited + amount;
        vault.deposit_count = vault.deposit_count + 1;
        let eve_after = balance::value(&vault.eve_balance);
        let ts_ms = clock::timestamp_ms(clock);
        event::emit(VaultDepositEvent {
            tribe_id: vault.tribe_id,
            depositor,
            amount,
            new_balance: eve_after,
            source: string::utf8(b"direct_deposit"),
            timestamp_ms: ts_ms,
        });
        finance_events::emit_finance(
            vault.tribe_id,
            finance_events::event_type_vault_deposit(),
            depositor,
            amount,
            eve_before, eve_after,
            circ, circ,
            ts_ms,
        );
    }

    /// UpdateCeremonyPlan v1 — Variant B per-vault emergency drain. DAppOwnerCap-gated.
    /// Drains the entire EVE balance to `recipient`. Bypasses the `is_locked` flag
    /// intentionally: this is the emergency exit. Reuses the existing
    /// `VaultWithdrawEvent` with `source = "emergency_drain"` for indexer
    /// audit separation. Silent no-op (no event) at zero balance — FE pre-reads
    /// `tribe_vault::eve_balance` to skip empty vaults.
    public entry fun drain_tribe_vault(
        _cap: &DAppOwnerCap,
        vault: &mut TribeVault,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let amount = balance::value(&vault.eve_balance);
        if (amount > 0) {
            let withdrawn = balance::split(&mut vault.eve_balance, amount);
            vault.total_withdrawn = vault.total_withdrawn + amount;
            vault.withdrawal_count = vault.withdrawal_count + 1;
            transfer::public_transfer(coin::from_balance(withdrawn, ctx), recipient);
            event::emit(VaultWithdrawEvent {
                tribe_id: vault.tribe_id,
                recipient,
                amount,
                new_balance: balance::value(&vault.eve_balance),
                source: string::utf8(b"emergency_drain"),
                timestamp_ms: clock::timestamp_ms(clock),
            });
        };
    }

    /// Update Ceremony V2 (Slice 2): leader-gated, ceremony-gated legacy drain of the
    /// entire TribeVault EVE balance. Composable (returns Coin<EVE>) so the FE reclaim PTB
    /// can compose OLD::withdraw_legacy_tribe_vault -> coin -> NEW::reclaim_tribe (lazy
    /// drain-on-reclaim).
    ///
    /// Bypasses the 24h multisig (vault_withdrawal) AND is_locked BY DESIGN — the legacy
    /// exit, like drain_tribe_vault — but ONLY when the admin has opened the CeremonyGate.
    /// The gate is the load-bearing SA-RCV2-06 control: without it, a leader-gated vault
    /// drain shipped onto a live version would hand every leader an instant,
    /// multisig-bypassing, lock-bypassing drain. The cap<->vault tribe match is SA-RCV2-05.
    ///
    /// Returns coin::zero<EVE> at zero balance; emits LegacyTribeVaultWithdrawn
    /// unconditionally for the audit trail.
    public fun withdraw_legacy_tribe_vault(
        cap: &TribeLeaderCap,
        vault: &mut TribeVault,
        gate: &CeremonyGate,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        assert!(ceremony_gate::is_open(gate), E_CEREMONY_NOT_OPEN);
        assert!(tribe_registry::cap_tribe_id(cap) == vault.tribe_id, E_WRONG_TRIBE);

        let amount = balance::value(&vault.eve_balance);
        let bal = if (amount > 0) {
            vault.total_withdrawn = vault.total_withdrawn + amount;
            vault.withdrawal_count = vault.withdrawal_count + 1;
            balance::split(&mut vault.eve_balance, amount)
        } else {
            balance::zero<EVE>()
        };

        event::emit(LegacyTribeVaultWithdrawn {
            tribe_id: vault.tribe_id,
            amount,
            leader: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });

        coin::from_balance(bal, ctx)
    }

    // ===== Public Read-Only Accessors =====

    public fun eve_balance(vault: &TribeVault): u64 {
        balance::value(&vault.eve_balance)
    }
    public fun tribe_id(vault: &TribeVault): u64 { vault.tribe_id }
    public fun is_locked(vault: &TribeVault): bool { vault.is_locked }
    public fun total_deposited(vault: &TribeVault): u64 { vault.total_deposited }
    public fun total_withdrawn(vault: &TribeVault): u64 { vault.total_withdrawn }

    // ===== Package-Private Mutators =====

    /// Called by tribe_exchange when user swaps EVE for tokens.
    public(package) fun internal_deposit(
        vault: &mut TribeVault,
        payment: Coin<EVE>,
        source: vector<u8>,
        depositor: address,
        clock: &Clock,
    ) {
        assert!(!vault.is_locked, E_VAULT_LOCKED);
        let amount = coin::value(&payment);
        assert!(amount > 0, E_ZERO_AMOUNT);
        balance::join(&mut vault.eve_balance, coin::into_balance(payment));
        vault.total_deposited = vault.total_deposited + amount;
        vault.deposit_count = vault.deposit_count + 1;
        event::emit(VaultDepositEvent {
            tribe_id: vault.tribe_id,
            depositor,
            amount,
            new_balance: balance::value(&vault.eve_balance),
            source: std::string::utf8(source),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Called by tribe_exchange on token redemption and by vault_withdrawal on execute.
    public(package) fun internal_withdraw(
        vault: &mut TribeVault,
        amount: u64,
        source: vector<u8>,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        assert!(!vault.is_locked, E_VAULT_LOCKED);
        assert!(amount > 0, E_ZERO_AMOUNT);
        assert!(balance::value(&vault.eve_balance) >= amount, E_INSUFFICIENT_VAULT_BALANCE);
        vault.total_withdrawn = vault.total_withdrawn + amount;
        vault.withdrawal_count = vault.withdrawal_count + 1;
        let withdrawn_balance = balance::split(&mut vault.eve_balance, amount);
        event::emit(VaultWithdrawEvent {
            tribe_id: vault.tribe_id,
            recipient,
            amount,
            new_balance: balance::value(&vault.eve_balance),
            source: std::string::utf8(source),
            timestamp_ms: clock::timestamp_ms(clock),
        });
        coin::from_balance(withdrawn_balance, ctx)
    }

    public(package) fun set_locked(vault: &mut TribeVault, locked: bool) {
        vault.is_locked = locked;
    }

    /// Update Ceremony V2 Phase 2 (Slice 3): deposit lazy-drained legacy vault EVE into the
    /// fresh TribeVault during reclaim. TribeLeaderCap-gated (E_WRONG_TRIBE). NO `recipient`
    /// param (SA-RCV2-11) — destination is this tribe's own vault. Delegates to the validated
    /// internal_deposit; tolerates a zero coin (the old vault may have been empty) by
    /// destroying it rather than aborting on internal_deposit's amount>0 guard. The coin is
    /// the OLD-version withdraw_legacy_tribe_vault composed in the reclaim PTB.
    public fun deposit_reclaimed_vault_eve(
        cap: &TribeLeaderCap,
        vault: &mut TribeVault,
        eve_coin: Coin<EVE>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(tribe_registry::cap_tribe_id(cap) == vault.tribe_id, E_WRONG_TRIBE);
        if (coin::value(&eve_coin) > 0) {
            internal_deposit(vault, eve_coin, b"reclaim_deposit", tx_context::sender(ctx), clock);
        } else {
            coin::destroy_zero(eve_coin);
        };
    }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(tribe_id: u64, ctx: &mut TxContext): TribeVault {
        create_vault(tribe_id, ctx)
    }

    /// Inject EVE balance into the vault without going through deposit events.
    /// Used by mint_burn_queue tests that need a pre-funded vault to clear the
    /// Article XIII.4 vault > reserve check.
    #[test_only]
    public fun fund_for_testing(vault: &mut TribeVault, amount: u64, ctx: &mut TxContext) {
        let payment = coin::mint_for_testing<EVE>(amount, ctx);
        balance::join(&mut vault.eve_balance, coin::into_balance(payment));
        vault.total_deposited = vault.total_deposited + amount;
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
