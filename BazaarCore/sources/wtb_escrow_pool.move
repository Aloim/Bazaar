// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::wtb_escrow_pool {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::table::{Self, Table};
    use sui::event;
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use EVE::EVE::EVE;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::admin_drain_events;
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use sui::object::ID;
    use std::option::{Self, Option};

    // --- Error Codes ---
    const E_INSUFFICIENT_ESCROW: u64 = 1;
    const E_SHOP_NOT_IN_POOL:    u64 = 2;
    const E_NOT_SHOP_OWNER:      u64 = 3;
    // UpdateCeremonyPlan v1 admin batch entries
    const E_BATCH_TOO_LARGE:     u64 = 4;
    const E_PAGINATION_ZERO:     u64 = 5;

    // UpdateCeremonyPlan v1 — page cap matched to all batch entries.
    const MAX_BATCH_ROWS: u64 = 100;

    // --- Shared Object ---
    public struct WtbEscrowPool has key {
        id: UID,
        ssu_id: address,
        deposits: Table<ID, Balance<EVE>>,
        total_escrowed: u64,
    }

    /// V13 fresh-publish: bootstrap-time share helper. WtbEscrowPool has only
    /// `key` (no `store`), so the defining module must wrap transfer::share_object.
    /// Called from ssu_bootstrap::bootstrap_ssu_objects as part of atomic-9.
    public(package) fun share(pool: WtbEscrowPool) {
        transfer::share_object(pool);
    }

    // --- Events ---
    public struct EscrowDeposited has copy, drop { shop_id: ID, amount: u64 }
    public struct EscrowPayout has copy, drop { shop_id: ID, amount: u64, seller: address }
    public struct EscrowRefunded has copy, drop { shop_id: ID, amount: u64, owner: address }
    public struct EscrowResidueRefunded has copy, drop { shop_id: ID, owner: address, amount: u64 }
    /// UpdateCeremonyPlan v1 — emitted per shop_id by withdraw_legacy_wtb_pool_residual
    /// (user defense-in-depth path). Distinct from EscrowResidueRefunded which fires
    /// from the underlying primitive on the admin Phase B batch path.
    public struct LegacyWtbPoolResidualWithdrawn has copy, drop {
        shop_id: ID,
        owner: address,
        amount: u64,
        timestamp_ms: u64,
    }

    // --- Package Factory ---
    public(package) fun create_pool(ssu_id: address, ctx: &mut TxContext): WtbEscrowPool {
        WtbEscrowPool {
            id: object::new(ctx),
            ssu_id,
            deposits: table::new(ctx),
            total_escrowed: 0,
        }
    }

    public fun top_up_escrow(
        pool: &mut WtbEscrowPool,
        gov: &SSUGovernance, // R3.5 NEW: freeze + identity guard
        shop_id: ID,
        payment: Coin<EVE>,
    ) {
        ssu_governance::assert_not_frozen(gov);                          // R3.5
        ssu_governance::assert_active(gov);                               // R6.7.1 E_SSU_NOT_ACTIVE
        ssu_governance::assert_subject_in_governance(gov, pool.ssu_id); // R3.5 SA-R3-01
        let amount = coin::value(&payment);
        let bal = coin::into_balance(payment);
        if (table::contains(&pool.deposits, shop_id)) {
            let existing = table::borrow_mut(&mut pool.deposits, shop_id);
            balance::join(existing, bal);
        } else {
            table::add(&mut pool.deposits, shop_id, bal);
        };
        pool.total_escrowed = pool.total_escrowed + amount;
        event::emit(EscrowDeposited { shop_id, amount });
    }

    // OS-15 (CRITICAL, Decision #1): derive owner on-chain via BazarRegistry.
    // Eliminates caller-supplied shop_owner spoof vector (SA-R6.6-01, SA-R6.6-02).
    // assert_not_frozen added for symmetry with top_up_escrow (SA-R6.6-03).
    public fun withdraw_escrow(
        pool: &mut WtbEscrowPool,
        registry: &BazarRegistry,
        gov: &SSUGovernance,
        shop_id: ID,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        ssu_governance::assert_not_frozen(gov);                          // SA-R6.6-03
        assert!(table::contains(&pool.deposits, shop_id), E_SHOP_NOT_IN_POOL);
        let shop = bazar::borrow_shop(registry, shop_id);
        let owner = bazar::shop_owner(shop);
        assert!(tx_context::sender(ctx) == owner, E_NOT_SHOP_OWNER);
        let bal = table::remove(&mut pool.deposits, shop_id);
        let amount = balance::value(&bal);
        pool.total_escrowed = pool.total_escrowed - amount;
        event::emit(EscrowRefunded { shop_id, amount, owner });
        coin::from_balance(bal, ctx)
    }

    public(package) fun release_to_seller(
        pool: &mut WtbEscrowPool, shop_id: ID, amount: u64, ctx: &mut TxContext,
    ): Coin<EVE> {
        assert!(table::contains(&pool.deposits, shop_id), E_SHOP_NOT_IN_POOL);
        let bal = table::borrow_mut(&mut pool.deposits, shop_id);
        assert!(balance::value(bal) >= amount, E_INSUFFICIENT_ESCROW);
        let payout_bal = balance::split(bal, amount);
        pool.total_escrowed = pool.total_escrowed - amount;
        let seller = tx_context::sender(ctx);
        event::emit(EscrowPayout { shop_id, amount, seller });
        coin::from_balance(payout_bal, ctx)
    }

    /// Idempotent withdraw of WTB pool residue at shop close.
    ///
    /// Returns option::some(coin) on first call (table entry exists);
    /// returns option::none() on subsequent calls (entry already removed by a previous close attempt).
    /// Emits EscrowResidueRefunded event ONLY when an entry is actually withdrawn.
    ///
    /// Bug C / Temporaryfixplan / V11 inline atomic close primitive.
    public(package) fun withdraw_owner_residual_on_close(
        pool: &mut WtbEscrowPool,
        shop_id: ID,
        owner: address,
        ctx: &mut TxContext,
    ): Option<Coin<EVE>> {
        if (table::contains(&pool.deposits, shop_id)) {
            let bal = table::remove(&mut pool.deposits, shop_id);
            let amount = balance::value(&bal);
            pool.total_escrowed = pool.total_escrowed - amount;
            let coin = coin::from_balance(bal, ctx);
            event::emit(EscrowResidueRefunded { shop_id, owner, amount });
            option::some(coin)
        } else {
            option::none()
        }
    }

    // ============================================================
    // UpdateCeremonyPlan v1 — Phase B admin batch + user defense-in-depth
    // ============================================================

    /// Phase B entry 2: admin drains every entry in this WtbEscrowPool to the originating
    /// shop owner (looked up via BazarRegistry). Idempotent — silently skips IDs not in
    /// the pool or absent from registry. Per-row EscrowResidueRefunded events come from
    /// withdraw_owner_residual_on_close; one BatchDrainSummary at end. FE iterates one
    /// call per per-SSU pool, paginating shop_ids in MAX_BATCH_ROWS chunks.
    public entry fun refund_wtb_escrow_pool_batch(
        _cap: &DAppOwnerCap,
        pool: &mut WtbEscrowPool,
        registry: &BazarRegistry,
        shop_ids: vector<ID>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n = vector::length(&shop_ids);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        let mut processed: u64 = 0;
        let mut skipped: u64 = 0;
        let mut i: u64 = 0;
        while (i < n) {
            let shop_id = *vector::borrow(&shop_ids, i);
            if (!table::contains(&pool.deposits, shop_id) || !bazar::has_shop(registry, shop_id)) {
                skipped = skipped + 1;
            } else {
                let owner = bazar::shop_owner(bazar::borrow_shop(registry, shop_id));
                let coin_opt = withdraw_owner_residual_on_close(pool, shop_id, owner, ctx);
                if (option::is_some(&coin_opt)) {
                    transfer::public_transfer(option::destroy_some(coin_opt), owner);
                    processed = processed + 1;
                } else {
                    option::destroy_none(coin_opt);
                    skipped = skipped + 1;
                };
            };
            i = i + 1;
        };
        admin_drain_events::emit_summary(
            admin_drain_events::kind_refund_wtb(),
            processed,
            skipped,
            ctx,
            clock,
        );
    }

    /// Defense-in-depth user entry. Shop-owner-bound (cap-less per UpdateCeremonyPlan
    /// design Q-1 resolution): on-chain owner derivation via bazar::shop_owner. Any
    /// shop owner can rescue THEIR OWN shop's residual; cross-owner attempts ABORT
    /// E_NOT_SHOP_OWNER (fail-fast on griefing). Missing entries (already drained by
    /// Phase B) silent-skip. Returns aggregated Coin<EVE>; caller PTB transfers to
    /// sender or composes with withdraw_legacy_ssu_eve for the LegacySSUWithdrawButton
    /// one-action UX.
    public fun withdraw_legacy_wtb_pool_residual(
        pool: &mut WtbEscrowPool,
        registry: &BazarRegistry,
        shop_ids: vector<ID>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        let n = vector::length(&shop_ids);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        let sender = tx_context::sender(ctx);
        let ts = clock::timestamp_ms(clock);
        let mut agg = coin::zero<EVE>(ctx);
        let mut i: u64 = 0;
        while (i < n) {
            let shop_id = *vector::borrow(&shop_ids, i);
            // Silent skip on stale/missing entries — caller cannot tell if a residual
            // existed before vs. was already drained by admin Phase B; aborting would
            // punish legitimate users composing PTBs from a stale FE view.
            if (table::contains(&pool.deposits, shop_id) && bazar::has_shop(registry, shop_id)) {
                let owner = bazar::shop_owner(bazar::borrow_shop(registry, shop_id));
                // Cross-owner attempt: fail-fast (no silent skip — would mask griefing).
                assert!(sender == owner, E_NOT_SHOP_OWNER);
                let coin_opt = withdraw_owner_residual_on_close(pool, shop_id, owner, ctx);
                if (option::is_some(&coin_opt)) {
                    let c = option::destroy_some(coin_opt);
                    let amount = coin::value(&c);
                    event::emit(LegacyWtbPoolResidualWithdrawn {
                        shop_id,
                        owner,
                        amount,
                        timestamp_ms: ts,
                    });
                    coin::join(&mut agg, c);
                } else {
                    option::destroy_none(coin_opt);
                };
            };
            i = i + 1;
        };
        agg
    }

    // --- Accessors ---
    public fun shop_escrow_balance(pool: &WtbEscrowPool, shop_id: ID): u64 {
        if (table::contains(&pool.deposits, shop_id)) {
            balance::value(table::borrow(&pool.deposits, shop_id))
        } else { 0 }
    }

    public fun total_escrowed(pool: &WtbEscrowPool): u64 { pool.total_escrowed }

    /// CR-DEP-08 (V41 SSU depreciation prune plan, binding condition): read-only SSU-identity
    /// accessor so a future bazaar_shop_ops Phase-B prune entry (plan §2.3) can assert
    /// `pool_ssu_id(pool) == ssu_governance::ssu_id(gov)` before draining a page of this pool's
    /// residue -- the same wrong-SSU guard every other cross-object prune/refund path in this
    /// plan uses. No P1 caller yet; added now so Phase 2 needs no further core-adjacent widening.
    public fun pool_ssu_id(pool: &WtbEscrowPool): address { pool.ssu_id }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(ssu_id: address, ctx: &mut TxContext): WtbEscrowPool {
        create_pool(ssu_id, ctx)
    }

    // R6.6.1: test-only error code re-exports (used by wtb_escrow_pool_security_tests).
    #[test_only]
    public fun e_not_shop_owner(): u64 { E_NOT_SHOP_OWNER }

    #[test_only]
    public fun e_shop_not_in_pool(): u64 { E_SHOP_NOT_IN_POOL }

    #[test_only]
    public fun share_for_testing(pool: WtbEscrowPool) {
        sui::transfer::share_object(pool);
    }

    /// Inject EVE balance directly into the pool for a shop_id — testing only.
    /// Used by shop_close_recovery_test_helpers::deposit_pool_residue_for_testing
    /// and directly by shop_close_recovery_tests that need a pool residue without
    /// going through the full top_up_escrow governance path.
    #[test_only]
    public fun deposit_residue_for_testing(
        pool: &mut WtbEscrowPool,
        shop_id: ID,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        let fresh: Coin<EVE> = coin::mint_for_testing<EVE>(amount, ctx);
        let bal = coin::into_balance(fresh);
        if (table::contains(&pool.deposits, shop_id)) {
            let existing = table::borrow_mut(&mut pool.deposits, shop_id);
            balance::join(existing, bal);
        } else {
            table::add(&mut pool.deposits, shop_id, bal);
        };
        pool.total_escrowed = pool.total_escrowed + amount;
    }

    /// V38 split: bridge the package-private withdraw_owner_residual_on_close for the
    /// relocated bazaar_shop_ops idempotency test (test-only, zero bytecode at publish).
    #[test_only]
    public fun withdraw_owner_residual_on_close_for_testing(
        pool: &mut WtbEscrowPool,
        shop_id: ID,
        owner: address,
        ctx: &mut TxContext,
    ): Option<Coin<EVE>> {
        withdraw_owner_residual_on_close(pool, shop_id, owner, ctx)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
