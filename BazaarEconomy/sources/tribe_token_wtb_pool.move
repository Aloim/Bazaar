// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// tribe_token_wtb_pool — V21 per-SSU tribe-token WTB escrow pool.
///
/// Mirror of `bazaar_core::wtb_escrow_pool` but for tribe-token ledger credits
/// (Advanced WTB shops). Stores per-shop earmarked amounts in `Table<ID, u64>`
/// (NOT `Balance<T>` — tribe tokens are a ledger primitive, not a real `Coin<T>`).
///
/// Lifecycle:
///   - Bootstrap: per-SSU `bootstrap_tribe_token_wtb_pool` creates and shares
///     one `TribeTokenWtbPool` per Advanced SSU. Emits event for FE lookup.
///   - Create-WTB: `bazaar_economy::wtb_pool_ops::create_wtb_shop_advanced`
///     burns `gross_tokens` from the owner's ledger row and credits the pool
///     for `shop_id`.
///   - Fill-WTB: `bazaar_economy::ledger_shop_ops::ledger_wtb_fill` withdraws
///     `gross_tokens` from the pool and mints to filler/SSU/tribe rows.
///   - Close-WTB: `bazaar_economy::wtb_pool_ops::refund_wtb_pool_residue` pops
///     the pool entry and mints residue back to the shop owner's ledger row.
///     Called as a PTB step BEFORE `bazar_close::close_shop` /
///     `shop_moderation::force_close_shop_*`.
///
/// Supply invariant (B3.4 ADV-09 correction):
///   At-rest:  Σ balances == total_supply
///   Pools sit OUTSIDE of total_supply by design: when a WTB shop is created,
///   `internal_burn` reduces total_supply by `gross`; the pool entry records the
///   earmark. When the shop is filled, `internal_mint` restores `gross` to supply
///   distributed across filler/SSU/tribe. When the shop is closed/refunded,
///   `internal_mint` returns the residue to the owner. At no point do pool entries
///   add to total_supply — they represent supply that has been REMOVED pending
///   restoration. The old comment "Σ balances + Σ pool == total_supply" was
///   incorrect and has been corrected here. (AUD-ADV-09)
///
/// Closes Documentation/legacycode.md § "V20 Session 3" GAP-DESIGN row 04.
module bazaar_economy::tribe_token_wtb_pool {
    use sui::event;
    use sui::table::{Self, Table};
    use sui::transfer;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazaar_assertions;

    // ===== Error Codes =====
    const E_SHOP_NOT_IN_POOL:        u64 = 1;
    const E_INSUFFICIENT_POOL:       u64 = 2;
    const E_WRONG_SSU:               u64 = 3;
    const E_ZERO_AMOUNT:             u64 = 4;

    // ===== Struct =====
    public struct TribeTokenWtbPool has key {
        id: UID,
        ssu_id: address,
        /// shop_id → earmarked u64 tokens (tribe-token ledger units).
        deposits: Table<ID, u64>,
        total_escrowed: u64,
    }

    // ===== Events =====

    /// Emitted at bootstrap so FE can index pool_id by ssu_id without a
    /// dedicated registry. Mirror of `SSUGovernanceCreated` pattern.
    public struct TribeTokenWtbPoolCreated has copy, drop {
        pool_id: ID,
        ssu_id: address,
    }

    public struct PoolEarmarked has copy, drop {
        pool_id: ID, ssu_id: address, shop_id: ID, amount: u64, total_escrowed: u64,
    }
    public struct PoolWithdrawn has copy, drop {
        pool_id: ID, ssu_id: address, shop_id: ID, amount: u64, total_escrowed: u64,
    }
    public struct PoolResidueRefunded has copy, drop {
        pool_id: ID, ssu_id: address, shop_id: ID, owner: address, amount: u64,
    }

    // ===== Bootstrap =====

    /// Per-SSU bootstrap. Caller-supplied `ssu_gov` anchors the pool to the SSU.
    /// Idempotency: NOT enforced on-chain (multiple calls produce orphan pools).
    /// FE filters by `TribeTokenWtbPoolCreated` event keyed on `ssu_id` and uses
    /// the first / canonical pool — orphan pools are harmless (anyone can create
    /// a pool, but only the canonical one is referenced).
    public entry fun bootstrap_tribe_token_wtb_pool(
        ssu_gov: &SSUGovernance,
        ctx: &mut TxContext,
    ) {
        create_and_share_pool(ssu_gov, ctx);
    }

    /// Package-private creator. Same body as the public entry, exposed so that
    /// sibling modules (e.g. `ssu_economy_init`) can compose pool creation into
    /// a larger atomic init flow without duplicating the share/event logic.
    /// Returns the new pool's `ID` for downstream emits.
    public(package) fun create_and_share_pool(
        ssu_gov: &SSUGovernance,
        ctx: &mut TxContext,
    ): ID {
        // Advanced-only. Mirrors ledger_shop_ops::ledger_wts_buy assertion.
        bazaar_assertions::assert_advanced_external(
            ssu_governance::ssu_bazaar_type(ssu_gov),
        );
        let ssu_id = ssu_governance::ssu_id(ssu_gov);
        let pool = TribeTokenWtbPool {
            id: object::new(ctx),
            ssu_id,
            deposits: table::new(ctx),
            total_escrowed: 0,
        };
        let pool_id = object::id(&pool);
        event::emit(TribeTokenWtbPoolCreated { pool_id, ssu_id });
        transfer::share_object(pool);
        pool_id
    }

    // ===== Package-Private Mutators =====

    /// Earmark `amount` tokens for `shop_id`. Caller (wtb_pool_ops) must have
    /// already burned the same amount from the owner's ledger row this PTB step.
    public(package) fun credit_for_shop(
        pool: &mut TribeTokenWtbPool,
        shop_id: ID,
        amount: u64,
    ) {
        assert!(amount > 0, E_ZERO_AMOUNT);
        if (table::contains(&pool.deposits, shop_id)) {
            let cur = table::borrow_mut(&mut pool.deposits, shop_id);
            *cur = *cur + amount;
        } else {
            table::add(&mut pool.deposits, shop_id, amount);
        };
        pool.total_escrowed = pool.total_escrowed + amount;
        event::emit(PoolEarmarked {
            pool_id: object::id(pool),
            ssu_id: pool.ssu_id,
            shop_id, amount,
            total_escrowed: pool.total_escrowed,
        });
    }

    /// Decrement earmark by `amount`. Caller (ledger_shop_ops::ledger_wtb_fill)
    /// must immediately mint the same amount across filler/SSU/tribe rows.
    public(package) fun withdraw_from_shop(
        pool: &mut TribeTokenWtbPool,
        shop_id: ID,
        amount: u64,
    ) {
        assert!(amount > 0, E_ZERO_AMOUNT);
        assert!(table::contains(&pool.deposits, shop_id), E_SHOP_NOT_IN_POOL);
        let cur = table::borrow_mut(&mut pool.deposits, shop_id);
        assert!(*cur >= amount, E_INSUFFICIENT_POOL);
        *cur = *cur - amount;
        pool.total_escrowed = pool.total_escrowed - amount;
        event::emit(PoolWithdrawn {
            pool_id: object::id(pool),
            ssu_id: pool.ssu_id,
            shop_id, amount,
            total_escrowed: pool.total_escrowed,
        });
    }

    /// Pop the entire entry for `shop_id` and return the residue.
    /// Used by close paths to compute the amount that must be minted back to
    /// the shop owner's ledger row.
    /// Idempotent: returns 0 if no entry exists (close called twice).
    public(package) fun take_residue(
        pool: &mut TribeTokenWtbPool,
        shop_id: ID,
        owner: address,
    ): u64 {
        if (table::contains(&pool.deposits, shop_id)) {
            let amount = table::remove(&mut pool.deposits, shop_id);
            pool.total_escrowed = pool.total_escrowed - amount;
            event::emit(PoolResidueRefunded {
                pool_id: object::id(pool),
                ssu_id: pool.ssu_id,
                shop_id, owner, amount,
            });
            amount
        } else {
            0
        }
    }

    // ===== Cross-Package Invariant Asserters =====

    /// Verify pool.ssu_id matches the SSUGovernance's ssu_id. Called by
    /// wtb_pool_ops::create_wtb_shop_advanced + ledger_shop_ops::ledger_wtb_fill
    /// to defend against FE supplying a pool from the wrong SSU.
    public(package) fun assert_pool_for_ssu(pool: &TribeTokenWtbPool, ssu_gov: &SSUGovernance) {
        assert!(pool.ssu_id == ssu_governance::ssu_id(ssu_gov), E_WRONG_SSU);
    }

    // ===== Public Accessors =====

    public fun shop_balance(pool: &TribeTokenWtbPool, shop_id: ID): u64 {
        if (table::contains(&pool.deposits, shop_id)) {
            *table::borrow(&pool.deposits, shop_id)
        } else { 0 }
    }

    public fun ssu_id(pool: &TribeTokenWtbPool): address { pool.ssu_id }
    public fun total_escrowed(pool: &TribeTokenWtbPool): u64 { pool.total_escrowed }

    public fun has_entry(pool: &TribeTokenWtbPool, shop_id: ID): bool {
        table::contains(&pool.deposits, shop_id)
    }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(ssu_id: address, ctx: &mut TxContext): TribeTokenWtbPool {
        TribeTokenWtbPool {
            id: object::new(ctx),
            ssu_id,
            deposits: table::new(ctx),
            total_escrowed: 0,
        }
    }

    #[test_only]
    public fun share_for_testing(pool: TribeTokenWtbPool) {
        transfer::share_object(pool);
    }

    #[test_only]
    public fun e_shop_not_in_pool(): u64 { E_SHOP_NOT_IN_POOL }
    #[test_only]
    public fun e_insufficient_pool(): u64 { E_INSUFFICIENT_POOL }
    #[test_only]
    public fun e_wrong_ssu(): u64 { E_WRONG_SSU }
    #[test_only]
    public fun e_zero_amount(): u64 { E_ZERO_AMOUNT }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
