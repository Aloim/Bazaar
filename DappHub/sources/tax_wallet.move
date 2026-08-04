// DappHub/sources/tax_wallet.move
// Unified dApp tax collection point for all bazaar types.
// deposit_dapp_tax is the cross-package entry called by bazaar_core and bazaar_economy.
// Requires TaxDepositCap for permissioned deposit from authorized callers.
// Constitution: Article XII.3 — 500-line limit. Current: ~155 lines.
module dapp_hub::tax_wallet {
    use std::string::{Self, String};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::event;
    use sui::clock::{Self, Clock};
    use EVE::EVE::EVE;
    use dapp_hub::dapp_governance::DAppOwnerCap;

    // Error codes
    const E_ZERO_PAYMENT: u64 = 1;
    const E_INSUFFICIENT_BALANCE: u64 = 2;
    const E_ZERO_AMOUNT: u64 = 3;

    // TaxDepositCap: issued once in init(), transferred to bazaar_core deployer.
    // Required parameter on deposit_dapp_tax to restrict who may deposit.
    public struct TaxDepositCap has key, store { id: UID }

    // DAppTaxWallet: single shared collection point for all dApp taxes.
    public struct DAppTaxWallet has key {
        id: UID,
        balance: Balance<EVE>,
        total_collected: u64,
        total_withdrawn: u64,
        deposit_count: u64,
    }

    // TaxDepositEvent: emitted on every successful deposit.
    // Schema matches CrossPackageAPI.md Section 5.1.
    public struct TaxDepositEvent has copy, drop {
        tx_type: String,
        bazaar_type: String,
        ssu_id: address,
        tribe_id: u64,
        payer: address,
        receiver: address,
        gross_amount: u64,
        ssu_tax: u64,
        tribe_tax: u64,
        dapp_tax: u64,
        net_amount: u64,
        currency_type_name: String,
        timestamp_ms: u64,
    }

    // TaxWithdrawEvent: emitted on owner withdrawal.
    public struct TaxWithdrawEvent has copy, drop {
        amount: u64,
        recipient: address,
        timestamp_ms: u64,
    }

    // FeeDepositEvent: emitted when a registration/creation fee lands in the
    // wallet (immediately for SSU-registration + tribe-creation; on accept for
    // an escrowed tribe-join fee). Distinct from TaxDepositEvent so fee income
    // is separable from trade tax in the audit trail.
    // fee_kind: "ssu_registration" | "tribe_join" | "easy_tribe_creation" |
    //           "advanced_tribe_creation".
    public struct FeeDepositEvent has copy, drop {
        fee_kind: String,
        payer: address,
        amount: u64,
        timestamp_ms: u64,
    }

    // TaxDepositCapMintedEvent: emitted on every successful additional cap mint.
    // cap_recipient: address the new TaxDepositCap was transferred to.
    // total_caps_issued: value of caps_issued AFTER this mint (monotonically increasing).
    public struct TaxDepositCapMintedEvent has copy, drop {
        cap_recipient: address,
        total_caps_issued: u64,
    }

    // EmergencyDrainEvent: emitted UNCONDITIONALLY by drain_dapp_tax_wallet (even
    // at zero balance) so the audit trail records every Variant B drain attempt.
    // Distinct from TaxWithdrawEvent so post-ceremony indexers can separate
    // ceremony drains from ordinary admin withdrawals.
    public struct EmergencyDrainEvent has copy, drop {
        drained_amount: u64,
        recipient: address,
        admin: address,
        timestamp_ms: u64,
    }

    // TaxDepositMintRegistry: single shared object tracking how many TaxDepositCaps
    // have been minted. Shared at init time with caps_issued = 2, accounting for the
    // two caps transferred to the deployer inside init (one per consumer package:
    // bazaar_core::BazaarCoreAdmin + bazaar_economy::EconomyCapStore).
    //
    // Invariant: caps_issued starts at 2 on a live deployment (init mints two caps).
    // Monotonic: never decrements. Increments by 1 per mint_additional_tax_deposit_cap
    // call for future N>2 consumer expansion.
    public struct TaxDepositMintRegistry has key {
        id: UID,
        caps_issued: u64,
    }

    fun init(ctx: &mut TxContext) {
        let wallet = DAppTaxWallet {
            id: object::new(ctx),
            balance: balance::zero(),
            total_collected: 0,
            total_withdrawn: 0,
            deposit_count: 0,
        };
        transfer::share_object(wallet);

        // Two TaxDepositCaps minted at init — one per consumer package (bazaar_core + bazaar_economy).
        // Deployer routes them via bootstrap PTB: receive_tax_deposit_cap on BazaarCoreAdmin + EconomyCapStore.
        // FP1-41 resolution: init-time fix (vs. post-publish mint_additional_tax_deposit_cap).
        let deposit_cap_a = TaxDepositCap { id: object::new(ctx) };
        let deposit_cap_b = TaxDepositCap { id: object::new(ctx) };
        transfer::transfer(deposit_cap_a, tx_context::sender(ctx));
        transfer::transfer(deposit_cap_b, tx_context::sender(ctx));

        // Share a mint registry accounting for the two caps issued above.
        // mint_additional_tax_deposit_cap remains available for future N>2 consumer additions.
        let mint_registry = TaxDepositMintRegistry { id: object::new(ctx), caps_issued: 2 };
        transfer::share_object(mint_registry);
    }

    // Cross-package: deposit dApp tax. Requires TaxDepositCap.
    // Called by bazaar_core::shop_ops and bazaar_economy::tribe_exchange.
    // tx_type: UTF-8 string — "wts_buy" | "wtb_fill" | "de_exchange" | "token_exchange"
    // bazaar_type: UTF-8 string — "notribe" | "easy" | "advanced"
    // Aborts: E_ZERO_PAYMENT (1) if payment coin value is zero.
    public fun deposit_dapp_tax(
        wallet: &mut DAppTaxWallet,
        _cap: &TaxDepositCap,
        payment: Coin<EVE>,
        tx_type: vector<u8>,
        bazaar_type: vector<u8>,
        ssu_id: address,
        tribe_id: u64,
        payer: address,
        receiver: address,
        gross_amount: u64,
        ssu_tax: u64,
        tribe_tax: u64,
        net_amount: u64,
        clock: &Clock,
    ) {
        let dapp_tax = coin::value(&payment);
        assert!(dapp_tax > 0, E_ZERO_PAYMENT);
        balance::join(&mut wallet.balance, coin::into_balance(payment));
        wallet.total_collected = wallet.total_collected + dapp_tax;
        wallet.deposit_count = wallet.deposit_count + 1;
        event::emit(TaxDepositEvent {
            tx_type: string::utf8(tx_type),
            bazaar_type: string::utf8(bazaar_type),
            ssu_id,
            tribe_id,
            payer,
            receiver,
            gross_amount,
            ssu_tax,
            tribe_tax,
            dapp_tax,
            net_amount,
            currency_type_name: string::utf8(b"EVE"),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // Package-internal: deposit a registration/creation fee paid as a Coin.
    // A zero coin (fee == 0) is destroyed and no event is emitted. Same-package
    // callers (tribe_registry, ssu_registry) — no TaxDepositCap required.
    public(package) fun deposit_fee(
        wallet: &mut DAppTaxWallet,
        payment: Coin<EVE>,
        fee_kind: vector<u8>,
        payer: address,
        clock: &Clock,
    ) {
        if (coin::value(&payment) == 0) {
            coin::destroy_zero(payment);
            return
        };
        deposit_fee_balance(wallet, coin::into_balance(payment), fee_kind, payer, clock);
    }

    // Package-internal: deposit a fee paid as a Balance (used to forward an
    // escrowed tribe-join fee from the escrow wallet on acceptance). A zero
    // balance is destroyed and no event is emitted.
    public(package) fun deposit_fee_balance(
        wallet: &mut DAppTaxWallet,
        bal: Balance<EVE>,
        fee_kind: vector<u8>,
        payer: address,
        clock: &Clock,
    ) {
        let amount = balance::value(&bal);
        if (amount == 0) {
            balance::destroy_zero(bal);
            return
        };
        balance::join(&mut wallet.balance, bal);
        wallet.total_collected = wallet.total_collected + amount;
        wallet.deposit_count = wallet.deposit_count + 1;
        event::emit(FeeDepositEvent {
            fee_kind: string::utf8(fee_kind),
            payer,
            amount,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // Owner: withdraw accumulated tax from wallet. Returns coin to caller.
    // Aborts: E_ZERO_AMOUNT (3) if amount is 0.
    // Aborts: E_INSUFFICIENT_BALANCE (2) if amount exceeds balance.
    public fun withdraw_dapp_tax(
        _cap: &DAppOwnerCap,
        wallet: &mut DAppTaxWallet,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        assert!(amount > 0, E_ZERO_AMOUNT);
        assert!(balance::value(&wallet.balance) >= amount, E_INSUFFICIENT_BALANCE);
        let withdrawn = balance::split(&mut wallet.balance, amount);
        wallet.total_withdrawn = wallet.total_withdrawn + amount;
        let recipient = tx_context::sender(ctx);
        event::emit(TaxWithdrawEvent {
            amount,
            recipient,
            timestamp_ms: clock::timestamp_ms(clock),
        });
        coin::from_balance(withdrawn, ctx)
    }

    // Owner: mint an additional TaxDepositCap and transfer it to `recipient`.
    // Requires &DAppOwnerCap — mirrors the gate pattern of set_global_dapp_tax_rate
    // in dapp_governance.move (_cap borrow, no consumption).
    // Increments TaxDepositMintRegistry.caps_issued monotonically.
    // No revocation path: caps once minted are forever valid.
    //
    // Invariant: registry.caps_issued reflects the total number of TaxDepositCaps
    // ever minted, regardless of whether the registry started at 0 (fresh redeploy)
    // or 1 (additive upgrade on a live deployment where init already issued one cap).
    public fun mint_additional_tax_deposit_cap(
        _cap: &DAppOwnerCap,
        registry: &mut TaxDepositMintRegistry,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let new_cap = TaxDepositCap { id: object::new(ctx) };
        registry.caps_issued = registry.caps_issued + 1;
        event::emit(TaxDepositCapMintedEvent {
            cap_recipient: recipient,
            total_caps_issued: registry.caps_issued,
        });
        transfer::transfer(new_cap, recipient);
    }

    // UpdateCeremonyPlan v1 — Variant B global EVE drain. DAppOwnerCap-gated.
    // Drains the entire DAppTaxWallet balance to `recipient` in a single call.
    // Emits EmergencyDrainEvent UNCONDITIONALLY (even at amount == 0) so admins
    // can confirm the drain was attempted regardless of the wallet's state.
    // Designed for ceremony Phase B (Variant B emergency drains) — see
    // UpdateCeremonyPlan §12.
    public entry fun drain_dapp_tax_wallet(
        _cap: &DAppOwnerCap,
        wallet: &mut DAppTaxWallet,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let amount = balance::value(&wallet.balance);
        if (amount > 0) {
            let drained = balance::split(&mut wallet.balance, amount);
            wallet.total_withdrawn = wallet.total_withdrawn + amount;
            transfer::public_transfer(coin::from_balance(drained, ctx), recipient);
        };
        event::emit(EmergencyDrainEvent {
            drained_amount: amount,
            recipient,
            admin: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // Accessors
    public fun balance(wallet: &DAppTaxWallet): u64 {
        balance::value(&wallet.balance)
    }
    public fun total_collected(wallet: &DAppTaxWallet): u64  { wallet.total_collected }
    public fun total_withdrawn(wallet: &DAppTaxWallet): u64  { wallet.total_withdrawn }
    public fun deposit_count(wallet: &DAppTaxWallet): u64    { wallet.deposit_count }
    public fun caps_issued(registry: &TaxDepositMintRegistry): u64 { registry.caps_issued }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_wallet_for_testing(ctx: &mut TxContext): DAppTaxWallet {
        DAppTaxWallet {
            id: object::new(ctx),
            balance: balance::zero(),
            total_collected: 0,
            total_withdrawn: 0,
            deposit_count: 0,
        }
    }

    #[test_only]
    public fun create_deposit_cap_for_testing(ctx: &mut TxContext): TaxDepositCap {
        TaxDepositCap { id: object::new(ctx) }
    }

    #[test_only]
    public fun create_registry_for_testing(ctx: &mut TxContext): TaxDepositMintRegistry {
        TaxDepositMintRegistry { id: object::new(ctx), caps_issued: 0 }
    }
}
// END OF FILE — dapp_hub::tax_wallet
