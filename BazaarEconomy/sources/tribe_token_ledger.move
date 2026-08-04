// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_economy::tribe_token_ledger {
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use std::string::{Self, String};
    use dapp_hub::tribe_registry::TribeLeaderCap;
    use dapp_hub::tribe_registry;
    use bazaar_core::tribe_governance::{Self, TribeGovernance, TribeSuperAdminCap};
    use bazaar_core::bazaar_assertions;

    // ===== Version =====
    const PACKAGE_VERSION: u64 = 2;

    // ===== Error Codes =====
    const E_INSUFFICIENT_BALANCE: u64 = 1;
    const E_OVERFLOW:              u64 = 2;
    const E_WRONG_TRIBE:           u64 = 3;
    const E_LEDGER_FROZEN:         u64 = 4;
    const E_ZERO_AMOUNT:           u64 = 5;
    const E_ACCOUNT_NOT_FOUND:     u64 = 6;
    const E_SUPPLY_CAP_EXCEEDED:   u64 = 7;
    const E_TRIBE_ID_MISMATCH:     u64 = 8;   // R5.2 tribe-id coherence mismatch
    const E_TRIBE_CAP_REVOKED:     u64 = 9;   // V20: SuperAdmin cap revoked (mirrors bazaar_core)

    // ===== Structs =====

    /// TribeTokenLedger — internal `Table<address, u64>` accounting for one
    /// Advanced tribe's fantasy currency.
    ///
    /// V26+ decimals convention: all `u64` balance fields in this module
    /// (`balances` rows, `total_supply`, `supply_cap`, the `amount` arg on every
    /// mint/burn/credit/debit/transfer entry) are stored in **scaled units**.
    /// `1.00 display token = 10^decimals scaled units = 100 scaled units` under
    /// the default `decimals = 2`. The FE divides by `10^decimals` on display
    /// and multiplies on input. Move-side arithmetic is unchanged — operations
    /// stay on raw `u64` and remain decimals-agnostic.
    public struct TribeTokenLedger has key {
        id: UID,
        tribe_id: u64,
        balances: Table<address, u64>,
        total_supply: u64,
        supply_cap: u64,        // 0 = uncapped
        token_name: String,
        token_symbol: String,
        decimals: u8,           // V26+ default = 2 (scaled-unit convention)
        is_frozen: bool,
        created_at_ms: u64,
    }

    // ===== Events =====

    public struct LedgerMintEvent has copy, drop {
        tribe_id: u64,
        recipient: address,
        amount: u64,
        new_total_supply: u64,
        timestamp_ms: u64,
    }

    public struct LedgerBurnEvent has copy, drop {
        tribe_id: u64,
        from: address,
        amount: u64,
        new_total_supply: u64,
        timestamp_ms: u64,
    }

    public struct LedgerTransferEvent has copy, drop {
        tribe_id: u64,
        from: address,
        to: address,
        amount: u64,
        tx_type: String,
        timestamp_ms: u64,
    }

    /// V20 — Tribe Token Wallet admin withdraw (Leader or SuperAdmin moves
    /// tokens out of the gov.id_address ledger row to a recipient player).
    public struct TribeWalletWithdrawEvent has copy, drop {
        tribe_id: u64,
        gov_addr: address,
        recipient: address,
        amount: u64,
        authorized_by: address,
        cap_tier: u8,           // 0 = Leader, 1 = SuperAdmin
        timestamp_ms: u64,
    }

    /// V20 — Tribe Token Wallet permissionless deposit (any holder donates
    /// tokens from their own ledger row to the gov.id_address row).
    public struct TribeWalletDepositEvent has copy, drop {
        tribe_id: u64,
        gov_addr: address,
        depositor: address,
        amount: u64,
        timestamp_ms: u64,
    }

    // ===== Package-Private Factory =====

    public(package) fun create_ledger(
        tribe_id: u64,
        token_name: vector<u8>,
        token_symbol: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeTokenLedger {
        TribeTokenLedger {
            id: object::new(ctx),
            tribe_id,
            balances: table::new(ctx),
            total_supply: 0,
            supply_cap: 0,
            token_name: string::utf8(token_name),
            token_symbol: string::utf8(token_symbol),
            decimals: 2,
            is_frozen: false,
            created_at_ms: clock::timestamp_ms(clock),
        }
    }

    /// Share the ledger as a shared object. Called by economy_governance::bootstrap_advanced_complete.
    public(package) fun share(self: TribeTokenLedger) {
        transfer::share_object(self);
    }

    // ===== Public Entry Functions =====

    // B3.2 ADV-05 — USER RULING (2026-06-13): RETIRE the direct mint_to/burn_from
    // entries. The 24h veto queue (mint_burn_queue.move) is now the ONLY mint/burn
    // path for tribe leaders. Any PTB that called mint_to/burn_from directly will
    // abort at V36. Zero live FE consumers confirmed (ledger-tx.ts:35/69 are dead
    // builders deleted in Wave A4). internal_mint/internal_burn kept (package-private,
    // consumed by pools, queue, exchange, and ledger_shop_ops).

    /// Player self-burn. No cap required — burns caller's own balance.
    public fun burn_self(
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(ledger.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(!ledger.is_frozen, E_LEDGER_FROZEN);  // frozen check preserved (SA-02)
        assert!(amount > 0, E_ZERO_AMOUNT);
        let sender = tx_context::sender(ctx);
        internal_burn(ledger, sender, amount);
        event::emit(LedgerBurnEvent {
            tribe_id: ledger.tribe_id,
            from: sender,
            amount,
            new_total_supply: ledger.total_supply,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Ensure an account entry exists in the ledger table.
    /// Requires Advanced bazaar type (R5.2.b.2).
    /// NOTE: No frozen check here by design — account creation must work during freeze
    /// so that unfreeze paths can credit/debit without a pre-existing account.
    /// (disposition SA-R5.2.b.2-02)
    /// Pre-seed a zero-balance row. No-op if the row already exists.
    /// GAS-02: inlined — removes the separate ensure_account_internal call.
    public fun ensure_account(
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        player: address,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(ledger.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        if (!table::contains(&ledger.balances, player)) {
            table::add(&mut ledger.balances, player, 0u64);
        };
    }

    // ensure_account_internal REMOVED — existence check inlined into each mutator below.

    // ===== Tribe Token Wallet Admin (V20) =====
    //
    // The "Tribe Token Wallet" is the ledger row keyed by `object::id_address(tribe_gov)`.
    // It accrues tax revenue from Advanced shop trades (via `credit_with_event` in
    // `ledger_shop_ops`) and the V19 genesis 100k mint at bootstrap. These three
    // entry fns expose governance-level admin over that row:
    //   - Withdraw to player (Leader-cap gated, cap_tier=0)
    //   - Withdraw to player (SuperAdmin-cap gated, cap_tier=1, revocation-checked)
    //   - Deposit from caller's row (permissionless)
    // Total supply is unchanged by these flows — tokens move between table rows.

    /// Withdraw from the Tribe Token Wallet to a player. Leader-cap gated.
    public fun withdraw_from_tribe_wallet_as_leader(
        cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        recipient: address,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(ledger.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(tribe_registry::cap_tribe_id(cap) == ledger.tribe_id, E_WRONG_TRIBE);
        assert!(!ledger.is_frozen, E_LEDGER_FROZEN);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let gov_addr = object::id_address(tribe_gov);
        debit(ledger, gov_addr, amount);
        credit(ledger, recipient, amount);
        event::emit(TribeWalletWithdrawEvent {
            tribe_id: ledger.tribe_id,
            gov_addr,
            recipient,
            amount,
            authorized_by: tx_context::sender(ctx),
            cap_tier: 0,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Withdraw from the Tribe Token Wallet to a player. SuperAdmin-cap gated.
    /// Honors the per-cap revocation table in TribeGovernance (E_TRIBE_CAP_REVOKED).
    public fun withdraw_from_tribe_wallet_as_super_admin(
        cap: &TribeSuperAdminCap,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        recipient: address,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(ledger.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(tribe_governance::tribe_super_admin_cap_tribe_id(cap) == ledger.tribe_id, E_WRONG_TRIBE);
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(tribe_gov, object::id(cap)),
            E_TRIBE_CAP_REVOKED,
        );
        assert!(!ledger.is_frozen, E_LEDGER_FROZEN);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let gov_addr = object::id_address(tribe_gov);
        debit(ledger, gov_addr, amount);
        credit(ledger, recipient, amount);
        event::emit(TribeWalletWithdrawEvent {
            tribe_id: ledger.tribe_id,
            gov_addr,
            recipient,
            amount,
            authorized_by: tx_context::sender(ctx),
            cap_tier: 1,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Permissionless deposit: moves tokens from caller's ledger row to the
    /// Tribe Token Wallet row at gov.id_address.
    public fun deposit_to_tribe_wallet(
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(tribe_governance::tribe_bazaar_type(tribe_gov));
        assert!(ledger.tribe_id == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(!ledger.is_frozen, E_LEDGER_FROZEN);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let sender = tx_context::sender(ctx);
        let gov_addr = object::id_address(tribe_gov);
        debit(ledger, sender, amount);
        credit(ledger, gov_addr, amount);
        event::emit(TribeWalletDepositEvent {
            tribe_id: ledger.tribe_id,
            gov_addr,
            depositor: sender,
            amount,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Public Read-Only Accessors =====

    public fun balance_of(ledger: &TribeTokenLedger, player: address): u64 {
        if (table::contains(&ledger.balances, player)) {
            *table::borrow(&ledger.balances, player)
        } else {
            0
        }
    }

    public fun total_supply(ledger: &TribeTokenLedger): u64 { ledger.total_supply }
    public fun supply_cap(ledger: &TribeTokenLedger): u64 { ledger.supply_cap }
    public fun token_name(ledger: &TribeTokenLedger): &String { &ledger.token_name }
    public fun token_symbol(ledger: &TribeTokenLedger): &String { &ledger.token_symbol }
    public fun tribe_id(ledger: &TribeTokenLedger): u64 { ledger.tribe_id }
    public fun is_frozen(ledger: &TribeTokenLedger): bool { ledger.is_frozen }
    public fun decimals(ledger: &TribeTokenLedger): u8 { ledger.decimals }

    // ===== Package-Private Mutators =====

    /// Debit balance from address. Does NOT change total_supply.
    /// GAS-02: existence check inlined — single DF resolution instead of contains+borrow_mut.
    /// Absent row seeds to 0 then immediately aborts on the >= guard (same abort code as before).
    public(package) fun debit(
        ledger: &mut TribeTokenLedger,
        from: address,
        amount: u64,
    ) {
        assert!(!ledger.is_frozen, E_LEDGER_FROZEN);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let bal = if (table::contains(&ledger.balances, from)) {
            table::borrow_mut(&mut ledger.balances, from)
        } else {
            table::add(&mut ledger.balances, from, 0u64);
            table::borrow_mut(&mut ledger.balances, from)
        };
        assert!(*bal >= amount, E_INSUFFICIENT_BALANCE);
        *bal = *bal - amount;
    }

    /// Credit balance to address. Does NOT change total_supply.
    /// GAS-02: existence check inlined — seeds new row with `amount` directly.
    public(package) fun credit(
        ledger: &mut TribeTokenLedger,
        to: address,
        amount: u64,
    ) {
        assert!(!ledger.is_frozen, E_LEDGER_FROZEN);
        assert!(amount > 0, E_ZERO_AMOUNT);
        if (table::contains(&ledger.balances, to)) {
            let bal = table::borrow_mut(&mut ledger.balances, to);
            *bal = safe_add(*bal, amount);
        } else {
            table::add(&mut ledger.balances, to, amount);
        };
    }

    /// Mint into ledger: increases total_supply. Called by tribe_exchange and economy_governance.
    /// GAS-02: existence check inlined — seeds new row with `amount` directly.
    public(package) fun internal_mint(
        ledger: &mut TribeTokenLedger,
        to: address,
        amount: u64,
    ) {
        assert!(amount > 0, E_ZERO_AMOUNT);
        // Supply cap check (0 = uncapped)
        if (ledger.supply_cap > 0) {
            assert!(
                safe_add(ledger.total_supply, amount) <= ledger.supply_cap,
                E_SUPPLY_CAP_EXCEEDED
            );
        };
        if (table::contains(&ledger.balances, to)) {
            let bal = table::borrow_mut(&mut ledger.balances, to);
            *bal = safe_add(*bal, amount);
        } else {
            table::add(&mut ledger.balances, to, amount);
        };
        ledger.total_supply = safe_add(ledger.total_supply, amount);
    }

    /// V28 — Move tokens between two ledger rows. Total supply unchanged.
    /// Used by `tribe_exchange::swap_*` to flow tokens between the tribe wallet
    /// (gov_addr) and player rows instead of minting/burning fresh supply.
    /// Asserts ledger not frozen, amount > 0, and `from` has sufficient balance.
    /// GAS-02: existence checks inlined for both from and to rows.
    public(package) fun internal_transfer(
        ledger: &mut TribeTokenLedger,
        from: address,
        to: address,
        amount: u64,
    ) {
        assert!(!ledger.is_frozen, E_LEDGER_FROZEN);
        assert!(amount > 0, E_ZERO_AMOUNT);
        // Debit the from row (absent row seeds 0, aborts on >= immediately)
        let from_bal = if (table::contains(&ledger.balances, from)) {
            table::borrow_mut(&mut ledger.balances, from)
        } else {
            table::add(&mut ledger.balances, from, 0u64);
            table::borrow_mut(&mut ledger.balances, from)
        };
        assert!(*from_bal >= amount, E_INSUFFICIENT_BALANCE);
        *from_bal = *from_bal - amount;
        // Credit the to row (absent row seeds amount directly)
        if (table::contains(&ledger.balances, to)) {
            let to_bal = table::borrow_mut(&mut ledger.balances, to);
            *to_bal = safe_add(*to_bal, amount);
        } else {
            table::add(&mut ledger.balances, to, amount);
        };
    }

    /// Burn from ledger: decreases total_supply. Called by tribe_exchange on redeem.
    /// GAS-02: existence check inlined — absent row seeds 0, aborts on >= immediately.
    public(package) fun internal_burn(
        ledger: &mut TribeTokenLedger,
        from: address,
        amount: u64,
    ) {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let bal = if (table::contains(&ledger.balances, from)) {
            table::borrow_mut(&mut ledger.balances, from)
        } else {
            table::add(&mut ledger.balances, from, 0u64);
            table::borrow_mut(&mut ledger.balances, from)
        };
        assert!(*bal >= amount, E_INSUFFICIENT_BALANCE);
        *bal = *bal - amount;
        ledger.total_supply = ledger.total_supply - amount;
    }

    /// V19 — Genesis mint at tribe bootstrap. `public(package)` so only the
    /// `bazaar_economy::economy_governance::bootstrap_advanced_complete` entry
    /// can invoke. Bypasses the Article XIII.4 `vault > reserve` check (one-shot
    /// allocation that seeds the tribe wallet at `gov.id_address`). Emits
    /// `LedgerMintEvent` so `useLifetimeMintTotal` picks it up.
    public(package) fun genesis_mint(
        ledger: &mut TribeTokenLedger,
        recipient: address,
        amount: u64,
        clock: &Clock,
    ) {
        internal_mint(ledger, recipient, amount);
        event::emit(LedgerMintEvent {
            tribe_id: ledger.tribe_id,
            recipient,
            amount,
            new_total_supply: ledger.total_supply,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    public(package) fun set_frozen(ledger: &mut TribeTokenLedger, frozen: bool) {
        ledger.is_frozen = frozen;
    }

    public(package) fun set_supply_cap(ledger: &mut TribeTokenLedger, cap: u64) {
        ledger.supply_cap = cap;
    }

    // ===== Update Ceremony V2 Phase 2 (Slice 3): reclaim ledger create + mint =====

    /// Create a fresh, EMPTY ledger during tribe reclaim with caller-supplied decimals +
    /// supply_cap (create_ledger hardcodes decimals=2, cap=0). total_supply starts at 0 —
    /// balances are re-minted by mint_for_reclaim from the decoded snapshot. NO genesis
    /// mint (reclaim_tribe must NOT reuse bootstrap_advanced_complete, which seeds a genesis
    /// mint -> double-credit). public(package): only bazaar_economy (reclaim_tribe) can call
    /// it (design §13 ruling #1 — Option A, no witness; no PTB/external reach).
    ///
    /// Duplicate-ledger safety (SA-RCV2-10) is structural: reclaim_tribe creates a BRAND-NEW
    /// tribe (fresh monotonic id, no prior ledger) and is gated by consume_tribe_reclaim_record
    /// (record removed + permanently marked consumed) + record_tribe_remap (E_REMAP_EXISTS),
    /// so the same original tribe can never be reclaimed twice — there is no in-object
    /// tribe->ledger registry to re-assert here.
    public(package) fun create_for_reclaim(
        tribe_id: u64,
        token_name: vector<u8>,
        token_symbol: vector<u8>,
        decimals: u8,
        supply_cap: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeTokenLedger {
        TribeTokenLedger {
            id: object::new(ctx),
            tribe_id,
            balances: table::new(ctx),
            total_supply: 0,
            supply_cap,
            token_name: string::utf8(token_name),
            token_symbol: string::utf8(token_symbol),
            decimals,
            is_frozen: false,
            created_at_ms: clock::timestamp_ms(clock),
        }
    }

    /// Mint a restored member balance during tribe reclaim. public(package): callable ONLY
    /// from within bazaar_economy (reclaim_tribe) — unreachable from a PTB, no witness value.
    /// reclaim_tribe mints EXACTLY the addresses/amounts decoded from the consumed
    /// TribeLeaderPayload (never caller-supplied), so the supply re-grows to its snapshot
    /// value. Defensively asserts the supply cap via internal_mint (durable inv #11;
    /// supply_cap==0 means uncapped). Emits LedgerMintEvent (forensic per-mint, Sweep H).
    public(package) fun mint_for_reclaim(
        ledger: &mut TribeTokenLedger,
        to: address,
        amount: u64,
        clock: &Clock,
    ) {
        internal_mint(ledger, to, amount);
        event::emit(LedgerMintEvent {
            tribe_id: ledger.tribe_id,
            recipient: to,
            amount,
            new_total_supply: ledger.total_supply,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Overflow-safe addition. Aborts with E_OVERFLOW if result exceeds u64::MAX.
    public(package) fun safe_add(a: u64, b: u64): u64 {
        let result = (a as u128) + (b as u128);
        assert!(result <= 18_446_744_073_709_551_615u128, E_OVERFLOW);
        (result as u64)
    }

    /// Underflow-safe subtraction. Aborts with E_INSUFFICIENT_BALANCE if b > a.
    public(package) fun safe_sub(a: u64, b: u64): u64 {
        assert!(a >= b, E_INSUFFICIENT_BALANCE);
        a - b
    }

    // ===== Internal Helper for Credit+Event =====

    /// Credit with event emission. Used by ledger_shop_ops for tax routing.
    public(package) fun credit_with_event(
        ledger: &mut TribeTokenLedger,
        from: address,
        to: address,
        amount: u64,
        tx_type: vector<u8>,
        clock: &Clock,
    ) {
        credit(ledger, to, amount);
        event::emit(LedgerTransferEvent {
            tribe_id: ledger.tribe_id,
            from,
            to,
            amount,
            tx_type: string::utf8(tx_type),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(tribe_id: u64, clock: &Clock, ctx: &mut TxContext): TribeTokenLedger {
        create_ledger(tribe_id, b"TestToken", b"TT", clock, ctx)
    }

    #[test_only]
    public fun mint_for_testing(ledger: &mut TribeTokenLedger, to: address, amount: u64) {
        internal_mint(ledger, to, amount);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
