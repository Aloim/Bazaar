// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// wtb_pool_ops — V21 Advanced WTB create + close-path refund.
///
/// Wraps `bazar::create_wtb_shop` (which still takes a Coin<EVE> prepay for
/// NoTribe/Easy) with the Advanced-specific tribe-token escrow flow:
///   1. Pass a zero-balance `Coin<EVE>` so the Move-side Shop.escrowed_eve
///      stays empty.
///   2. Burn `gross_tokens` from the owner's tribe-token ledger row.
///   3. Credit `tribe_token_wtb_pool` for the new shop_id.
///
/// Closes Documentation/legacycode.md § "V20 Session 3" GAP-DESIGN row 01.
///
/// The matching close-path refund (`refund_wtb_pool_residue`) is called as a
/// PTB step BEFORE `bazar_close::close_shop[_as_ssu_owner]` /
/// `shop_moderation::force_close_shop_*` — the close fns themselves stay
/// EVE-only (bazaar_core cannot import bazaar_economy). Closes
/// Documentation/legacycode.md § "V20 Session 3" GAP-DESIGN row 03.
module bazaar_economy::wtb_pool_ops {
    use sui::coin;
    use sui::clock::{Self, Clock};
    use sui::event;
    use bazaar_economy::finance_events;
    use EVE::EVE::EVE;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::membership::MemberRegistry;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazaar_assertions;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::tribe_token_wtb_pool::{Self, TribeTokenWtbPool};

    // ===== Error Codes =====
    const E_LENGTH_MISMATCH:        u64 = 1;
    const E_ZERO_GROSS:             u64 = 2;
    const E_WRONG_TRIBE:            u64 = 3;
    const E_SSU_NOT_ACTIVE:         u64 = 4;
    const E_LEDGER_FROZEN:          u64 = 5;
    const E_NOT_ADVANCED:           u64 = 6;
    const E_SHOP_NOT_FOUND_IN_POOL: u64 = 7;
    // B3.3 ADV-03: third-party pool-drain of an active shop blocked.
    const E_SHOP_STILL_ACTIVE:      u64 = 8;

    // ===== Events =====

    public struct WtbShopAdvancedCreated has copy, drop {
        shop_id: ID,
        owner: address,
        ssu_id: address,
        tribe_id: u64,
        pool_id: ID,
        gross_tokens: u64,
        timestamp_ms: u64,
    }

    public struct WtbPoolRefundIssued has copy, drop {
        shop_id: ID,
        owner: address,
        ssu_id: address,
        tribe_id: u64,
        amount: u64,
        timestamp_ms: u64,
    }

    // ===== Helpers =====

    fun compute_gross(prices: &vector<u64>, quantities: &vector<u64>): u64 {
        let n = vector::length(prices);
        assert!(n == vector::length(quantities), E_LENGTH_MISMATCH);
        let mut i = 0;
        let mut acc: u128 = 0;
        while (i < n) {
            let p = *vector::borrow(prices, i);
            let q = *vector::borrow(quantities, i);
            acc = acc + (p as u128) * (q as u128);
            i = i + 1;
        };
        // Overflow protection: cap at u64::MAX (matches safe_add in ledger).
        assert!(acc <= 18_446_744_073_709_551_615u128, E_ZERO_GROSS);
        (acc as u64)
    }

    // ===== Create =====

    /// Create an Advanced WTB shop. Wraps `bazar::create_wtb_shop` with a
    /// zero-balance `Coin<EVE>` prepay, then burns `gross_tokens` from the
    /// sender's tribe-token ledger row and credits the pool for the new shop_id.
    ///
    /// Authorization layers:
    ///   1. Advanced-only bazaar type (bazaar_assertions::assert_advanced_external).
    ///   2. Pool's ssu_id matches the SSUGovernance's ssu_id (assert_pool_for_ssu).
    ///   3. Ledger's tribe_id matches the SSUGovernance's tribe_id.
    ///   4. SSU active and ledger unfrozen.
    ///   5. Owner has enough balance (internal_burn aborts if not).
    public entry fun create_wtb_shop_advanced(
        registry: &mut BazarRegistry,
        ssu_gov: &SSUGovernance,
        members: &MemberRegistry,
        pool: &mut TribeTokenWtbPool,
        ledger: &mut TribeTokenLedger,
        title: vector<u8>,
        ssu_id: address,
        tribe_id: u64,
        item_type_ids: vector<u64>,
        quantities: vector<u64>,
        prices_eve: vector<u64>,
        expiry_ms: u64,
        position_x: u64,
        position_y: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Layer 1: Advanced-only.
        bazaar_assertions::assert_advanced_external(
            ssu_governance::ssu_bazaar_type(ssu_gov),
        );
        // Layer 2: pool anchored to this SSU.
        tribe_token_wtb_pool::assert_pool_for_ssu(pool, ssu_gov);
        // Layer 3: ledger tribe match.
        assert!(
            tribe_token_ledger::tribe_id(ledger) == tribe_id,
            E_WRONG_TRIBE,
        );
        assert!(
            ssu_governance::ssu_tribe_id(ssu_gov) == tribe_id,
            E_WRONG_TRIBE,
        );
        // Layer 4: ledger not frozen, SSU active.
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(ssu_governance::ssu_is_active(ssu_gov), E_SSU_NOT_ACTIVE);

        let gross = compute_gross(&prices_eve, &quantities);
        assert!(gross > 0, E_ZERO_GROSS);

        // Wrap bazar::create_wtb_shop with a zero-balance Coin<EVE>. The Advanced
        // WTB shop stores an empty Balance<EVE>; all economic value is tracked in
        // tribe_token_wtb_pool.
        let zero_prepay = coin::zero<EVE>(ctx);
        let bazaar_type_advanced = bazar::bazaar_type_advanced();
        // Phase 8 B1: create_wtb_shop was split into _notribe/_easy/_advanced_inner;
        // the Advanced pool wrapper routes to the inner (pure rename, same 16-arg shape).
        let shop_id = bazar::create_wtb_shop_advanced_inner(
            registry,
            ssu_gov,
            bazaar_type_advanced,
            title,
            ssu_id,
            tribe_id,
            item_type_ids,
            quantities,
            prices_eve,
            members,
            zero_prepay,
            expiry_ms,
            position_x,
            position_y,
            clock,
            ctx,
        );

        // Burn `gross` from owner's ledger row — supply temporarily reduced
        // until fill/close repays.
        let owner = tx_context::sender(ctx);
        // B3.4 ADV-13: snapshot circulation BEFORE the burn.
        let circ_before_create = tribe_token_ledger::total_supply(ledger);
        tribe_token_ledger::internal_burn(ledger, owner, gross);
        let circ_after_create = tribe_token_ledger::total_supply(ledger);
        finance_events::emit_finance(
            tribe_id,
            finance_events::event_type_burn(),
            owner,
            gross,
            0, 0,           // no EVE vault impact on this token-only operation
            circ_before_create,
            circ_after_create,
            clock::timestamp_ms(clock),
        );

        // Credit pool for the new shop_id.
        tribe_token_wtb_pool::credit_for_shop(pool, shop_id, gross);

        event::emit(WtbShopAdvancedCreated {
            shop_id,
            owner,
            ssu_id,
            tribe_id,
            pool_id: object::id(pool),
            gross_tokens: gross,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Close-Path Refund =====

    /// Refund pool residue back to the shop owner's tribe-token ledger row.
    /// Idempotent: emits no event and is a no-op if pool[shop_id] is empty.
    /// Called as a PTB step BEFORE `bazar_close::close_shop[_as_ssu_owner]`
    /// or `shop_moderation::force_close_shop_*` so close paths in bazaar_core
    /// (which cannot import bazaar_economy) stay EVE-only.
    ///
    /// Auth: derives owner from BazarRegistry (caller cannot divert). Pool
    /// must be anchored to the supplied SSUGovernance (assert_pool_for_ssu).
    /// Ledger tribe_id must match SSUGovernance.tribe_id.
    ///
    /// `assert_not_frozen` SKIPPED to mirror moderation EXEMPT-MODERATION
    /// posture (force-close on frozen SSU must still refund pool residue).
    public entry fun refund_wtb_pool_residue(
        registry: &mut BazarRegistry,
        ssu_gov: &SSUGovernance,
        pool: &mut TribeTokenWtbPool,
        ledger: &mut TribeTokenLedger,
        shop_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(
            ssu_governance::ssu_bazaar_type(ssu_gov),
        );
        tribe_token_wtb_pool::assert_pool_for_ssu(pool, ssu_gov);
        assert!(
            tribe_token_ledger::tribe_id(ledger)
                == ssu_governance::ssu_tribe_id(ssu_gov),
            E_WRONG_TRIBE,
        );

        // B3.3 ADV-03: block third-party griefing — refuse to drain the pool while
        // the shop is still active. The shop owner closes the shop first, then calls
        // refund_wtb_pool_residue. The idempotent early-return below still covers the
        // "pool entry absent" case so force-close PTBs remain safe to call in any order.
        let shop_ref = bazar::borrow_shop_mut(registry, shop_id);
        assert!(!bazar::shop_is_active(shop_ref), E_SHOP_STILL_ACTIVE);

        // No-op if pool is empty for this shop_id (idempotent).
        if (!tribe_token_wtb_pool::has_entry(pool, shop_id)) {
            return
        };

        // Derive owner from the shop record (caller cannot divert).
        let owner = bazar::shop_owner(shop_ref);
        let tribe_id_from_shop = bazar::shop_tribe_id(shop_ref);

        let amount = tribe_token_wtb_pool::take_residue(pool, shop_id, owner);
        if (amount == 0) {
            return
        };

        // B3.4 ADV-13: snapshot supply before the mint.
        let circ_before_refund = tribe_token_ledger::total_supply(ledger);
        // Mint residue back to owner — restores the supply the create-flow burned.
        tribe_token_ledger::internal_mint(ledger, owner, amount);
        let circ_after_refund = tribe_token_ledger::total_supply(ledger);

        event::emit(WtbPoolRefundIssued {
            shop_id,
            owner,
            ssu_id: ssu_governance::ssu_id(ssu_gov),
            tribe_id: tribe_id_from_shop,
            amount,
            timestamp_ms: clock::timestamp_ms(clock),
        });
        // B3.4 ADV-13: FinanceEvent for the supply-restoring mint.
        finance_events::emit_finance(
            tribe_id_from_shop as u64,
            finance_events::event_type_mint(),
            tx_context::sender(ctx),
            amount,
            0, 0,           // no EVE vault impact
            circ_before_refund,
            circ_after_refund,
            clock::timestamp_ms(clock),
        );
        let _ = ctx; // sender-derived auth not needed — owner derived from shop record
    }

    // ===== Test-Only Accessors =====
    #[test_only]
    public fun e_length_mismatch(): u64 { E_LENGTH_MISMATCH }
    #[test_only]
    public fun e_zero_gross(): u64 { E_ZERO_GROSS }
    #[test_only]
    public fun e_wrong_tribe(): u64 { E_WRONG_TRIBE }
    #[test_only]
    public fun e_ssu_not_active(): u64 { E_SSU_NOT_ACTIVE }
    #[test_only]
    public fun e_ledger_frozen(): u64 { E_LEDGER_FROZEN }
    #[test_only]
    public fun compute_gross_for_testing(prices: &vector<u64>, quantities: &vector<u64>): u64 {
        compute_gross(prices, quantities)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
