// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_economy::ledger_shop_ops {
    use sui::event;
    use sui::clock::{Self, Clock};
    use std::string::{Self, String};
    use bazaar_economy::finance_events;
    use bazaar_core::bazar::{Self, Shop};
    use bazaar_core::bazar::BazarRegistry;
    use bazaar_core::bazar_lifecycle;  // V31 — auto-deactivate drained Advanced shops
    use bazaar_core::membership::{Self, SSUOwnerCap, MemberRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::shop_ops;
    use bazaar_core::bazaar_assertions;
    use bazaar_core::ssu_role_tax_admin;
    use bazaar_core::tribe_role_tax_admin;
    use bazaar_core::role_tax_types;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::tribe_token_wtb_pool::{Self, TribeTokenWtbPool};
    use bazaar_economy::tribe_vault::{Self, TribeVault};
    use bazaar_economy::tribe_exchange::{Self, ExchangeConfig};
    use bazaar_economy::economy_cap_store::{Self, EconomyCapStore};

    // ===== Version =====
    const PACKAGE_VERSION: u64 = 2;

    // ===== Constants =====
    const BPS_DENOMINATOR: u128 = 10_000;
    const SHOP_KIND_WTS: u8 = 0;
    const SHOP_KIND_WTB: u8 = 1;
    const SHOP_KIND_DE:  u8 = 2;
    const BAZAAR_ADVANCED: u8 = 2;

    // ===== Error Codes =====
    const E_NOT_ADVANCED_SHOP:      u64 = 1;
    const E_WRONG_TRIBE:            u64 = 2;
    const E_WRONG_SSU:              u64 = 3;
    const E_WRONG_SHOP_KIND:        u64 = 4;
    const E_INSUFFICIENT_BALANCE:   u64 = 5;
    const E_ZERO_QUANTITY:          u64 = 6;
    const E_SSU_NOT_ACTIVE:         u64 = 7;
    const E_LEDGER_FROZEN:          u64 = 8;
    const E_VAULT_BELOW_RESERVE:    u64 = 10;
    const E_MODE_NOT_SUPPORTED_FOR_OP: u64 = 11;
    // V21 — Advanced WTB now pays from per-shop tribe-token pool, not buyer's
    // live ledger row. `ledger_wtb_fill` reads `tribe_token_wtb_pool::shop_balance`
    // and aborts here if the earmark is short. Should be unreachable in honest flow
    // (pool is filled to `gross_tokens` at create time) — kept as a defense-in-depth
    // assert in case of arg ordering / wrong-pool mistakes.
    const E_INSUFFICIENT_POOL:      u64 = 12;
    // V35 SA-05: tribe-banned player attempted Advanced ledger trade.
    const E_PLAYER_BANNED: u64 = 13;
    // B3.1 ADV-01: SSU membership ban (MemberRegistry.is_banned bool flag).
    const E_SSU_MEMBER_BANNED: u64 = 14;
    // B3.1 ADV-01: SSU timed ban (ssu_governance local_ban_list expiry).
    const E_SSU_TIMED_BANNED:  u64 = 15;
    // B3.1 ET-14: tribe is deactivated.
    const E_TRIBE_NOT_ACTIVE:  u64 = 16;
    // B3.3 ADV-02: dedicated overflow sentinel — distinct from E_ZERO_QUANTITY=6.
    const E_GROSS_OVERFLOW:    u64 = 17;

    // ===== Events =====

    public struct LedgerPurchaseEvent has copy, drop {
        shop_id: ID,
        tx_type: u8,
        buyer: address,
        seller: address,
        ssu_id: address,
        tribe_id: u64,
        listing_idx: u64,
        quantity: u64,
        gross_tokens: u64,
        ssu_tax_tokens: u64,
        tribe_tax_tokens: u64,
        net_tokens: u64,
        timestamp_ms: u64,
    }

    public struct TaxCreditWithdrawEvent has copy, drop {
        tribe_id: u64,
        recipient: address,
        token_amount: u64,
        eve_amount: u64,
        tax_type: String,
        timestamp_ms: u64,
    }

    // ===== Private Tax Helper =====

    /// Compute SSU and tribe taxes using u128 intermediates. (SA-001)
    /// Returns (ssu_tax, tribe_tax, net_amount).
    fun compute_ledger_taxes(gross: u64, ssu_bps: u64, tribe_bps: u64): (u64, u64, u64) {
        let ssu_tax = ((gross as u128) * (ssu_bps as u128) / BPS_DENOMINATOR) as u64;
        let tribe_tax = ((gross as u128) * (tribe_bps as u128) / BPS_DENOMINATOR) as u64;
        let net = gross - ssu_tax - tribe_tax;
        (ssu_tax, tribe_tax, net)
    }

    // ===== WTS Buy (Ledger) =====

    /// Advanced WTS buy: buyer debits their ledger balance, seller gets net credit.
    /// SSU tax -> SSU ledger account. Tribe tax -> Tribe ledger account.
    /// NO dApp tax (Article IV.3).
    public fun ledger_wts_buy(
        registry: &mut BazarRegistry,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        ledger: &mut TribeTokenLedger,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        member_registry: &MemberRegistry,
        cap_store: &EconomyCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        // R5.2 — bazaar-type gate (Advanced SSU)
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(ssu_gov));
        assert!(tribe_governance::tribe_governance_mode(tribe_gov) == 0, E_MODE_NOT_SUPPORTED_FOR_OP);
        // SA-002/SA-003: Cross-object identity validation FIRST
        assert!(bazar::shop_bazaar_type(shop) == BAZAAR_ADVANCED, E_NOT_ADVANCED_SHOP);
        assert!(bazar::shop_kind(shop) == SHOP_KIND_WTS, E_WRONG_SHOP_KIND);
        assert!(ssu_governance::ssu_id(ssu_gov) == bazar::shop_ssu_id(shop), E_WRONG_SSU);
        assert!(tribe_governance::tribe_id(tribe_gov) == (bazar::shop_tribe_id(shop) as u64), E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == (bazar::shop_tribe_id(shop) as u64), E_WRONG_TRIBE);
        // Session 3B: cross-SSU MemberRegistry binding for per-role tax lookup.
        assert!(membership::ssu_id(member_registry) == bazar::shop_ssu_id(shop), E_WRONG_SSU);
        assert!(ssu_governance::ssu_is_active(ssu_gov), E_SSU_NOT_ACTIVE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(quantity > 0, E_ZERO_QUANTITY);
        // V35 SA-05: tribe-wide ban check (timed, clock-aware). tribe_gov and clock are already in scope.
        assert!(
            !tribe_governance::tribe_is_globally_banned(tribe_gov, tx_context::sender(ctx), clock),
            E_PLAYER_BANNED,
        );
        // GAS-04: single MemberRegistry borrow for static is_banned + both role fields.
        // Hoisting buyer declaration here allows reuse in roles_of + the ban assert below.
        let buyer = tx_context::sender(ctx);                                                          // GAS-04 (moved up from line 154)
        let (buyer_ssu_role, buyer_tribe_role, member_banned) = membership::roles_of(member_registry, buyer); // GAS-04
        // B3.1 ADV-01: SSU membership ban (static is_banned flag on MemberRegistry).
        assert!(!member_banned, E_SSU_MEMBER_BANNED);                                                 // GAS-04
        // B3.1 ADV-01: V35 per-SSU timed ban.
        assert!(
            !ssu_governance::is_banned(ssu_gov, buyer, clock),
            E_SSU_TIMED_BANNED,
        );
        // B3.1 ET-14: tribe must be active (deactivation halts Advanced economy).
        tribe_governance::assert_tribe_active(tribe_gov);

        let seller = bazar::shop_owner(shop);
        let listing = vector::borrow(bazar::shop_listings(shop), listing_idx);
        let price_per_unit = bazar::listing_price_eve(listing);
        // B3.3 ADV-02: u128-widen the raw multiplication to prevent overflow.
        let gross_tokens: u64 = {
            let g = (price_per_unit as u128) * (quantity as u128);
            assert!(g <= 18_446_744_073_709_551_615u128, E_GROSS_OVERFLOW);
            (g as u64)
        };

        // GAS-02: removed redundant balance_of + pre-assert; debit carries its own >= guard.

        // GAS-04: combined RoleTaxConfig accessors — one borrow per governance Table.
        let ssu_bps   = role_tax_types::wts_pct(&ssu_role_tax_admin::ssu_role_tax(ssu_gov, buyer_ssu_role));     // GAS-04
        let tribe_bps = role_tax_types::wts_pct(&tribe_role_tax_admin::tribe_role_tax(tribe_gov, buyer_tribe_role)); // GAS-04
        let (ssu_tax, tribe_tax, net_tokens) = compute_ledger_taxes(gross_tokens, ssu_bps, tribe_bps);

        // Deduct listing quantity using TribeTokenShopCap (SA-007: borrow from store)
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        // GAS-01: capture post-decrement listing qty for the drain short-circuit hint.
        let touched_remaining = shop_ops::deduct_listing_quantity(shop, listing_idx, quantity, shop_cap);

        // Ledger movements (no total_supply change — debit/credit, not burn/mint)
        let ssu_id = bazar::shop_ssu_id(shop);
        let tribe_id = bazar::shop_tribe_id(shop) as u64;

        // Debit buyer
        tribe_token_ledger::debit(ledger, buyer, gross_tokens);
        // Credit net to seller
        if (net_tokens > 0) {
            tribe_token_ledger::credit(ledger, seller, net_tokens);
        };
        // SSU tax -> SSU governance address (as ledger credit).
        // GAS-05: plain credit — LedgerPurchaseEvent.ssu_tax_tokens is the canonical record.
        if (ssu_tax > 0) {
            let ssu_addr = ssu_governance::ssu_id(ssu_gov);
            tribe_token_ledger::credit(ledger, ssu_addr, ssu_tax);
        };
        // Tribe tax -> Tribe wallet (gov-object address; V16 — stable across leadership transfer).
        // GAS-05: plain credit — LedgerPurchaseEvent.tribe_tax_tokens is the canonical record.
        if (tribe_tax > 0) {
            let tribe_addr = object::id_address(tribe_gov);
            tribe_token_ledger::credit(ledger, tribe_addr, tribe_tax);
        };

        event::emit(LedgerPurchaseEvent {
            shop_id: object::id(shop),
            tx_type: SHOP_KIND_WTS,
            buyer,
            seller,
            ssu_id,
            tribe_id,
            listing_idx,
            quantity,
            gross_tokens,
            ssu_tax_tokens: ssu_tax,
            tribe_tax_tokens: tribe_tax,
            net_tokens,
            timestamp_ms: clock::timestamp_ms(clock),
        });
        // GAS-01: pass listing qty hint; loops skipped on partial buys.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining);
    }

    // ===== WTB Fill (Ledger) =====

    /// Advanced WTB fill (V21 pool-backed). Tokens earmarked in the per-shop
    /// `TribeTokenWtbPool` at create time pay the filler/SSU/tribe.
    ///
    /// V21 rewrite (closes Documentation/legacycode.md § "V20 Session 3" GAP-02):
    /// Replaced the live `balance_of(ledger, buyer) >= gross` check + `debit(buyer)`
    /// with a pool-balance check + pool withdraw. Filler/SSU/tribe credits are
    /// `internal_mint` (not `credit`) because the create-flow `internal_burn`ed
    /// the gross from the owner row, so total_supply must be restored at fill.
    /// Net effect: supply conserved across create→fill cycle (matches WTS / DE
    /// economics); during earmark period circulating supply is reduced by the
    /// locked amount — semantically equivalent to wtb_escrow_pool's EVE escrow.
    public fun ledger_wtb_fill(
        registry: &mut BazarRegistry,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        ledger: &mut TribeTokenLedger,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        member_registry: &MemberRegistry,
        cap_store: &EconomyCapStore,
        pool: &mut TribeTokenWtbPool,            // V21 NEW
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(ssu_gov));
        assert!(tribe_governance::tribe_governance_mode(tribe_gov) == 0, E_MODE_NOT_SUPPORTED_FOR_OP);
        // SA-002/SA-003: Cross-object identity validation FIRST
        assert!(bazar::shop_bazaar_type(shop) == BAZAAR_ADVANCED, E_NOT_ADVANCED_SHOP);
        assert!(bazar::shop_kind(shop) == SHOP_KIND_WTB, E_WRONG_SHOP_KIND);
        assert!(ssu_governance::ssu_id(ssu_gov) == bazar::shop_ssu_id(shop), E_WRONG_SSU);
        assert!(tribe_governance::tribe_id(tribe_gov) == (bazar::shop_tribe_id(shop) as u64), E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == (bazar::shop_tribe_id(shop) as u64), E_WRONG_TRIBE);
        // Session 3B: cross-SSU MemberRegistry binding for per-role tax lookup.
        assert!(membership::ssu_id(member_registry) == bazar::shop_ssu_id(shop), E_WRONG_SSU);
        assert!(ssu_governance::ssu_is_active(ssu_gov), E_SSU_NOT_ACTIVE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(quantity > 0, E_ZERO_QUANTITY);
        // V35 SA-05: tribe-wide ban check (timed, clock-aware).
        // For WTB the filler (ctx.sender()) is the selling party; a tribe-banned filler
        // must not be able to fill a tribe WTB shop.
        assert!(
            !tribe_governance::tribe_is_globally_banned(tribe_gov, tx_context::sender(ctx), clock),
            E_PLAYER_BANNED,
        );
        // GAS-04: hoist filler declaration; single MemberRegistry borrow for static is_banned + both roles.
        let filler = tx_context::sender(ctx);                                                             // GAS-04 (moved up from line 285)
        let (filler_ssu_role, filler_tribe_role, member_banned) = membership::roles_of(member_registry, filler); // GAS-04
        // B3.1 ADV-01: SSU membership ban (static is_banned flag on MemberRegistry).
        assert!(!member_banned, E_SSU_MEMBER_BANNED);                                                     // GAS-04
        // B3.1 ADV-01: V35 per-SSU timed ban.
        assert!(
            !ssu_governance::is_banned(ssu_gov, filler, clock),
            E_SSU_TIMED_BANNED,
        );
        // B3.1 ET-14: tribe must be active (deactivation halts Advanced economy).
        tribe_governance::assert_tribe_active(tribe_gov);
        // V21: pool must be anchored to this SSU.
        tribe_token_wtb_pool::assert_pool_for_ssu(pool, ssu_gov);

        let buyer = bazar::shop_owner(shop);    // shop owner — identified for event only
        let listing = vector::borrow(bazar::shop_listings(shop), listing_idx);
        let price_per_unit = bazar::listing_price_eve(listing);
        // B3.3 ADV-02: u128-widen the raw multiplication to prevent overflow.
        let gross_tokens: u64 = {
            let g = (price_per_unit as u128) * (quantity as u128);
            assert!(g <= 18_446_744_073_709_551_615u128, E_GROSS_OVERFLOW);
            (g as u64)
        };

        // V21: pool must contain enough earmarked tokens to pay this fill.
        // In honest flow this is guaranteed by `wtb_pool_ops::create_wtb_shop_advanced`
        // pre-depositing `gross = sum(price*qty)` at create. This assert is a
        // defense-in-depth backstop against pool/shop ID mismatch on the FE side.
        let pool_bal = tribe_token_wtb_pool::shop_balance(pool, shop_id);
        assert!(pool_bal >= gross_tokens, E_INSUFFICIENT_POOL);

        // GAS-04: combined RoleTaxConfig accessors — one borrow per governance Table.
        // Keyed on filler (the taxed party in WTB); buyer is event-only, never role-looked-up.
        let ssu_bps   = role_tax_types::wtb_pct(&ssu_role_tax_admin::ssu_role_tax(ssu_gov, filler_ssu_role));     // GAS-04
        let tribe_bps = role_tax_types::wtb_pct(&tribe_role_tax_admin::tribe_role_tax(tribe_gov, filler_tribe_role)); // GAS-04
        let (ssu_tax, tribe_tax, net_tokens) = compute_ledger_taxes(gross_tokens, ssu_bps, tribe_bps);

        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        // GAS-01: capture post-decrement listing qty for the drain short-circuit hint.
        // Advanced WTB: escrowed_eve == 0 always (pool-backed, not eve-escrowed);
        // the unconditional eve check passes instantly; hint drives the listing check.
        let touched_remaining = shop_ops::deduct_listing_quantity(shop, listing_idx, quantity, shop_cap);

        let ssu_id = bazar::shop_ssu_id(shop);
        let tribe_id = bazar::shop_tribe_id(shop) as u64;

        // V21: withdraw `gross` from pool earmark (supply restored via internal_mint
        // calls below — see invariant note in module doc-comment).
        tribe_token_wtb_pool::withdraw_from_shop(pool, shop_id, gross_tokens);

        // B3.4 ADV-13: snapshot circulation BEFORE the internal_mint chain so
        // FinanceEvent records the correct before/after values.
        let circ_before_fill = tribe_token_ledger::total_supply(ledger);

        // Mint net to filler (seller). `internal_mint` restores the supply burned
        // at create_wtb_shop_advanced — together with the tax mints below this
        // adds back exactly `gross_tokens` to total_supply (= net + ssu_tax + tribe_tax).
        if (net_tokens > 0) {
            tribe_token_ledger::internal_mint(ledger, filler, net_tokens);
        };
        // Tax credits: amounts are observable via LedgerPurchaseEvent.ssu_tax_tokens /
        // tribe_tax_tokens emitted below. (No per-tax LedgerTransferEvent here — that
        // event is a `credit`/`debit` transfer; the V21 pool flow uses `internal_mint`
        // which carries no observer event of its own. LedgerPurchaseEvent is canonical.)
        if (ssu_tax > 0) {
            let ssu_addr = ssu_governance::ssu_id(ssu_gov);
            tribe_token_ledger::internal_mint(ledger, ssu_addr, ssu_tax);
        };
        if (tribe_tax > 0) {
            // V16: tax routes to gov-object address (stable across leadership transfer).
            let tribe_addr = object::id_address(tribe_gov);
            tribe_token_ledger::internal_mint(ledger, tribe_addr, tribe_tax);
        };

        // B3.4 ADV-13: emit a single MINT FinanceEvent covering the full gross
        // supply restoration from the pool (net + ssu_tax + tribe_tax == gross_tokens).
        // This is the event-level supply invariant: WTB-fill restores exactly what
        // create_wtb_shop_advanced burned.
        let circ_after_fill = tribe_token_ledger::total_supply(ledger);
        // Vault balance does not change in WTB-fill (token-only flow); pass 0/0
        // for eve_reserve fields to signal "no EVE impact this event".
        finance_events::emit_finance(
            tribe_id,
            finance_events::event_type_mint(),
            filler,
            gross_tokens,
            0, 0,
            circ_before_fill,
            circ_after_fill,
            clock::timestamp_ms(clock),
        );

        event::emit(LedgerPurchaseEvent {
            shop_id: object::id(shop),
            tx_type: SHOP_KIND_WTB,
            buyer: filler,
            seller: buyer,
            ssu_id,
            tribe_id,
            listing_idx,
            quantity,
            gross_tokens,
            ssu_tax_tokens: ssu_tax,
            tribe_tax_tokens: tribe_tax,
            net_tokens,
            timestamp_ms: clock::timestamp_ms(clock),
        });
        // GAS-01: pass listing qty hint.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining);
    }

    // ===== DE Exchange (Ledger) =====

    /// Advanced DE exchange: flat fee in tokens. Exchanger pays fee, receives pair items.
    /// Fee routing: SSU flat fee + Tribe flat fee. NO dApp tax.
    public fun ledger_de_exchange(
        registry: &mut BazarRegistry,
        shop_id: ID,
        pair_idx: u64,
        units: u64,
        ledger: &mut TribeTokenLedger,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        member_registry: &MemberRegistry,
        cap_store: &EconomyCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(ssu_gov));
        assert!(tribe_governance::tribe_governance_mode(tribe_gov) == 0, E_MODE_NOT_SUPPORTED_FOR_OP);
        // SA-002/SA-003
        assert!(bazar::shop_bazaar_type(shop) == BAZAAR_ADVANCED, E_NOT_ADVANCED_SHOP);
        assert!(bazar::shop_kind(shop) == SHOP_KIND_DE, E_WRONG_SHOP_KIND);
        assert!(ssu_governance::ssu_id(ssu_gov) == bazar::shop_ssu_id(shop), E_WRONG_SSU);
        assert!(tribe_governance::tribe_id(tribe_gov) == (bazar::shop_tribe_id(shop) as u64), E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == (bazar::shop_tribe_id(shop) as u64), E_WRONG_TRIBE);
        // Session 3B: cross-SSU MemberRegistry binding for per-role flat-fee lookup.
        assert!(membership::ssu_id(member_registry) == bazar::shop_ssu_id(shop), E_WRONG_SSU);
        assert!(ssu_governance::ssu_is_active(ssu_gov), E_SSU_NOT_ACTIVE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(units > 0, E_ZERO_QUANTITY);
        // V35 SA-05: tribe-wide ban check (timed, clock-aware).
        assert!(
            !tribe_governance::tribe_is_globally_banned(tribe_gov, tx_context::sender(ctx), clock),
            E_PLAYER_BANNED,
        );
        // GAS-04: hoist exchanger; single MemberRegistry borrow for static is_banned + both roles.
        let exchanger = tx_context::sender(ctx);                                                               // GAS-04 (moved up from line 435)
        let (exch_ssu_role, exch_tribe_role, member_banned) = membership::roles_of(member_registry, exchanger); // GAS-04
        // B3.1 ADV-01: SSU membership ban (static is_banned flag on MemberRegistry).
        assert!(!member_banned, E_SSU_MEMBER_BANNED);                                                          // GAS-04
        // B3.1 ADV-01: V35 per-SSU timed ban.
        assert!(
            !ssu_governance::is_banned(ssu_gov, exchanger, clock),
            E_SSU_TIMED_BANNED,
        );
        // B3.1 ET-14: tribe must be active (deactivation halts Advanced economy).
        tribe_governance::assert_tribe_active(tribe_gov);

        let ssu_id = bazar::shop_ssu_id(shop);
        let tribe_id = bazar::shop_tribe_id(shop) as u64;

        // GAS-04: combined RoleTaxConfig accessors + u128-widen; Precond #5 clean inlined form.
        // B3.3 ADV-02: u128-widen fee × units multiplications unchanged.
        let ssu_fee: u64 = {
            let f = (role_tax_types::de_flat_fee(&ssu_role_tax_admin::ssu_role_tax(ssu_gov, exch_ssu_role)) as u128) * (units as u128); // GAS-04
            assert!(f <= 18_446_744_073_709_551_615u128, E_GROSS_OVERFLOW);
            (f as u64)
        };
        let tribe_fee: u64 = {
            let f = (role_tax_types::de_flat_fee(&tribe_role_tax_admin::tribe_role_tax(tribe_gov, exch_tribe_role)) as u128) * (units as u128); // GAS-04
            assert!(f <= 18_446_744_073_709_551_615u128, E_GROSS_OVERFLOW);
            (f as u64)
        };
        let total_fee = ssu_fee + tribe_fee;

        if (total_fee > 0) {
            // GAS-02: removed redundant balance_of + pre-assert; debit carries its own >= guard.
            tribe_token_ledger::debit(ledger, exchanger, total_fee);

            // GAS-05: plain credit — LedgerPurchaseEvent.ssu_tax_tokens is the canonical record.
            if (ssu_fee > 0) {
                let ssu_addr = ssu_governance::ssu_id(ssu_gov);
                tribe_token_ledger::credit(ledger, ssu_addr, ssu_fee);
            };
            // GAS-05: plain credit — LedgerPurchaseEvent.tribe_tax_tokens is the canonical record.
            if (tribe_fee > 0) {
                // V16: tax routes to gov-object address (stable across leadership transfer).
                let tribe_addr = object::id_address(tribe_gov);
                tribe_token_ledger::credit(ledger, tribe_addr, tribe_fee);
            };
        };

        // V31 partial DE: a pair is a 1:N ratio offer whose `offer_quantity` is the
        // remaining offered stock. The exchanger takes `units` offered items (giving
        // `units * request_quantity` requested items + the per-unit fee × units), so
        // we decrement the pair's offered stock by `units` rather than removing the
        // whole pair. The item legs (offered payout from Open Storage + requested
        // give-leg) run FE-side in the PTB. Aborts E_PAIR_NOT_FOUND (=9) if pair_idx
        // is out of range, E_PAIR_INSUFFICIENT_STOCK (=10) if units > remaining stock.
        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        // GAS-01: capture post-decrement pair offer_qty for the drain short-circuit hint.
        let touched_remaining = shop_ops::consume_de_pair(shop, pair_idx, units, shop_cap);

        let de_shop_id = object::id(shop);
        event::emit(LedgerPurchaseEvent {
            shop_id: de_shop_id,
            tx_type: SHOP_KIND_DE,
            buyer: exchanger,
            seller: bazar::shop_owner(shop),
            ssu_id,
            tribe_id,
            listing_idx: pair_idx,
            quantity: units,
            gross_tokens: total_fee,
            ssu_tax_tokens: ssu_fee,
            tribe_tax_tokens: tribe_fee,
            net_tokens: 0,
            timestamp_ms: clock::timestamp_ms(clock),
        });
        // GAS-01: pass pair offer_qty hint.
        bazar_lifecycle::auto_deactivate_if_drained(registry, de_shop_id, clock, touched_remaining);
    }

    // ===== Tax Credit Withdrawals =====

    /// SSU owner redeems accumulated ledger tax credits for EVE.
    /// Authorization: SSUOwnerCap must match the ssu_id on SSUGovernance. (CC-002 fix)
    /// Reserve floor enforced. (SA-004/SDC-002)
    public fun withdraw_ssu_tax_credits(
        cap: &SSUOwnerCap,
        ssu_gov: &SSUGovernance,
        ledger: &mut TribeTokenLedger,
        vault: &mut TribeVault,
        config: &ExchangeConfig,
        token_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(ssu_gov));
        // SA-002/SA-003: Cross-object identity — cap must match ssu_gov
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(ssu_gov), E_WRONG_SSU);

        let ssu_addr = ssu_governance::ssu_id(ssu_gov);
        let tid = tribe_vault::tribe_id(vault);
        assert!(tribe_exchange::tribe_id(config) == tid, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == tid, E_WRONG_TRIBE);
        assert!(token_amount > 0, E_ZERO_QUANTITY);

        let ssu_bal = tribe_token_ledger::balance_of(ledger, ssu_addr);
        assert!(ssu_bal >= token_amount, E_INSUFFICIENT_BALANCE);

        // Compute EVE out at current scaled rate (SA-001: u128 math, SA-006: RATE_PRECISION)
        let scaled_rate = tribe_exchange::exchange_rate_scaled(vault, ledger, config);
        let rate_precision = 1_000_000_000u128;
        let eve_out = ((token_amount as u128) * (scaled_rate as u128) / rate_precision) as u64;

        // SA-004/SDC-002: Reserve floor enforcement
        let vault_bal = tribe_vault::eve_balance(vault);
        let reserve = tribe_exchange::reserve_mist(config);
        assert!(vault_bal >= eve_out + reserve, E_VAULT_BELOW_RESERVE);

        // Burn tokens from SSU virtual account (reduces supply)
        tribe_token_ledger::internal_burn(ledger, ssu_addr, token_amount);
        // B3.4 ADV-13: emit FinanceEvent for the supply-reducing burn (type BURN = 1).
        // Snapshot taken AFTER the burn so circulation_after is correct.
        let circ_after = tribe_token_ledger::total_supply(ledger);
        let circ_before = circ_after + token_amount; // supply was larger before the burn
        let vault_bal_snapshot = tribe_vault::eve_balance(vault);
        finance_events::emit_finance(
            tid,
            finance_events::event_type_burn(),
            tx_context::sender(ctx),
            token_amount,
            vault_bal_snapshot + eve_out, // vault_before (pre-withdraw)
            vault_bal_snapshot,            // vault_after (post-burn, same as post-withdraw)
            circ_before,
            circ_after,
            clock::timestamp_ms(clock),
        );
        // Withdraw EVE from vault to the SSU owner's wallet
        let redeemer = tx_context::sender(ctx);
        let eve_coin = tribe_vault::internal_withdraw(vault, eve_out, b"ssu_tax_redeem", redeemer, clock, ctx);
        transfer::public_transfer(eve_coin, redeemer);

        event::emit(TaxCreditWithdrawEvent {
            tribe_id: tid,
            recipient: redeemer,
            token_amount,
            eve_amount: eve_out,
            tax_type: std::string::utf8(b"ssu"),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== withdraw_tribe_tax_credits — RETIRED in V16 =====
    // Tribe-wallet TribeTokens are now a public cumulative-earnings metric.
    // They are spendable later via V17 tribe-owned shops but NOT directly
    // redeemable for EVE from the reserve vault. EVE outflow from the vault
    // happens only via `vault_withdrawal` (admin quorum + 24h wait).
    // The SSU-side `withdraw_ssu_tax_credits` above is RETAINED — per-SSU
    // owners still need a redeem path for their accumulated ledger credits.

    // V26 D8: SSU Credit Admin block (events + transfer_ssu_credit_to_player +
    // deposit_to_ssu_credit) relocated to sibling module
    // `ledger_shop_ops_ssu_admin` as part of the 500-line guard split.
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
