// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// V26 — Advanced FREE shop tribe-token giveaway.
///
/// NoTribe / Easy FREE shops continue to use `bazaar_core::bazar::create_free_shop`
/// (EVE prepay) + `bazaar_shop_ops::shop_ops_de::free_coin_claim` (EVE claim).
/// Advanced FREE shops are gated off that path (E_FREE_SHOP_WRONG_KIND_FOR_BAZAAR
/// in `bazar.move:create_free_shop`) and route through the two entries here:
///
///   create_free_shop_advanced  — caller pre-burns tribe-token prepay from their
///     ledger row; `bazar::create_free_shop_partial` records the shop with the
///     prepay amount + per-claim amount stored in `shop.tribe_token_pool` and
///     `shop.coin_claim_amount` (scaled tribe-token units under V26 decimals=2).
///
///   free_token_claim_advanced  — claimer signs once per wallet; `bazar` pool
///     counter is decremented; `tribe_token_ledger::internal_mint` restores the
///     burn at create-time (supply-conserving pattern; mirrors WTB pool).
///
/// Supply conservation across create→claim cycle:
///   create:  caller_row -= prepay,  total_supply -= prepay  (internal_burn)
///   claim:   claimer_row += per_claim, total_supply += per_claim  (internal_mint)
///   close:   any remaining pool is forfeited (no refund path yet — V27 follow-up).
module bazaar_economy::free_shop_advanced {
    use sui::event;
    use sui::clock::{Self, Clock};
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_free;
    use bazaar_core::membership::{Self, MemberRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::bazaar_assertions;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};

    // ===== Constants =====
    const BAZAAR_ADVANCED: u8 = 2;

    // ===== Error Codes =====
    const E_NOT_ADVANCED_SHOP:          u64 = 1;
    const E_WRONG_TRIBE:                u64 = 2;
    const E_WRONG_SSU:                  u64 = 3;
    const E_FREE_SHOP_EMPTY:            u64 = 4;   // item_count == 0 && prepay == 0
    const E_INSUFFICIENT_POOL:          u64 = 5;   // pool < per_claim or per_claim == 0 with prepay
    const E_ALREADY_CLAIMED:            u64 = 6;
    const E_INSUFFICIENT_BALANCE:       u64 = 7;
    const E_SSU_NOT_ACTIVE:             u64 = 8;
    const E_LEDGER_FROZEN:              u64 = 9;
    const E_NOT_FREE_SHOP:              u64 = 10;
    const E_SHOP_NOT_ACTIVE:            u64 = 11;
    // R-A (AUD ban residual): block a tribe-globally / SSU-timed banned claimer.
    const E_PLAYER_BANNED:              u64 = 12;

    const SHOP_KIND_FREE: u8 = 3;

    // ===== Events =====

    public struct FreeShopAdvancedCreatedEvent has copy, drop {
        shop_id: ID,
        creator: address,
        ssu_id: address,
        tribe_id: u64,
        tribe_token_pool: u64,
        per_claim_amount: u64,
        item_count: u64,
        timestamp_ms: u64,
    }

    public struct FreeShopAdvancedClaimEvent has copy, drop {
        shop_id: ID,
        claimer: address,
        ssu_id: address,
        tribe_id: u64,
        amount: u64,
        pool_remaining: u64,
        timestamp_ms: u64,
    }

    // ===== Public Entries =====

    /// Create an Advanced FREE shop with optional tribe-token giveaway pool.
    /// `tribe_token_prepay` + `tribe_token_per_claim` are in scaled tribe-token
    /// units (V26+ decimals=2). Either `item_count > 0` OR `tribe_token_prepay > 0`
    /// must hold. When prepay > 0, per_claim must also be > 0 and <= prepay.
    public fun create_free_shop_advanced(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        members: &MemberRegistry,
        ledger: &mut TribeTokenLedger,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        item_type_ids: vector<u64>, quantities: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        tribe_token_prepay: u64,
        tribe_token_per_claim: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(gov));
        assert!(bazaar_type == BAZAAR_ADVANCED, E_NOT_ADVANCED_SHOP);
        assert!(tribe_token_ledger::tribe_id(ledger) == tribe_id, E_WRONG_TRIBE);
        assert!(tribe_governance::tribe_id(tribe_gov) == tribe_id, E_WRONG_TRIBE);
        assert!(ssu_governance::ssu_id(gov) == ssu_id, E_WRONG_SSU);
        assert!(membership::ssu_id(members) == ssu_id, E_WRONG_SSU);
        assert!(ssu_governance::ssu_is_active(gov), E_SSU_NOT_ACTIVE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);

        let n = vector::length(&item_type_ids);
        assert!(n > 0 || tribe_token_prepay > 0, E_FREE_SHOP_EMPTY);
        if (tribe_token_prepay > 0) {
            assert!(tribe_token_per_claim > 0 && tribe_token_prepay >= tribe_token_per_claim, E_INSUFFICIENT_POOL);
            let creator = tx_context::sender(ctx);
            // GAS-02: removed redundant balance_of + pre-assert; internal_burn carries its own >= guard.
            // The E_INSUFFICIENT_POOL assert above (pool shape check) is KEPT — it is a different guard.
            tribe_token_ledger::internal_burn(ledger, creator, tribe_token_prepay);
        };

        let shop_id = bazar_free::create_free_shop_partial(
            registry, gov, members,
            bazaar_type, title, ssu_id, tribe_id,
            item_type_ids, quantities,
            expiry_ms, position_x, position_y,
            tribe_token_prepay,
            tribe_token_per_claim,
            clock, ctx,
        );

        event::emit(FreeShopAdvancedCreatedEvent {
            shop_id,
            creator: tx_context::sender(ctx),
            ssu_id, tribe_id,
            tribe_token_pool: tribe_token_prepay,
            per_claim_amount: tribe_token_per_claim,
            item_count: n,
            timestamp_ms: clock::timestamp_ms(clock),
        });
        shop_id
    }

    /// Claim from an Advanced FREE shop's tribe-token pool. Single-claim per
    /// wallet (enforced by `bazar::has_coin_claimed` / `record_coin_claim`,
    /// reused from V25 EVE-giveaway). Restores supply via internal_mint.
    public fun free_token_claim_advanced(
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ledger: &mut TribeTokenLedger,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(gov));
        assert!(bazar::shop_bazaar_type(shop) == BAZAAR_ADVANCED, E_NOT_ADVANCED_SHOP);
        assert!(bazar::shop_kind(shop) == SHOP_KIND_FREE, E_NOT_FREE_SHOP);
        assert!(bazar::shop_is_active(shop), E_SHOP_NOT_ACTIVE);
        assert!(ssu_governance::ssu_id(gov) == bazar::shop_ssu_id(shop), E_WRONG_SSU);
        let tid = bazar::shop_tribe_id(shop);
        assert!(tribe_governance::tribe_id(tribe_gov) == tid, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == tid, E_WRONG_TRIBE);
        assert!(ssu_governance::ssu_is_active(gov), E_SSU_NOT_ACTIVE);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);

        let claimer = tx_context::sender(ctx);
        assert!(!bazar::has_coin_claimed(shop, claimer), E_ALREADY_CLAIMED);
        // R-A: tribe-global + SSU timed ban — a banned member cannot draw the giveaway.
        // tribe_gov / gov / clock are already params; mirrors the ledger_shop_ops B3 ADV-01 gate.
        assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, claimer, clock), E_PLAYER_BANNED);
        assert!(!ssu_governance::is_banned(gov, claimer, clock), E_PLAYER_BANNED);

        let per_claim = bazar::shop_coin_claim_amount(shop);
        let pool = bazar::shop_tribe_token_pool(shop);
        assert!(per_claim > 0, E_INSUFFICIENT_POOL);
        assert!(pool >= per_claim, E_INSUFFICIENT_POOL);

        // Decrement pool counter on shop; mint to claimer's ledger row.
        bazar::debit_tribe_token_pool(shop, per_claim);
        bazar::record_coin_claim(shop, claimer);
        tribe_token_ledger::internal_mint(ledger, claimer, per_claim);

        event::emit(FreeShopAdvancedClaimEvent {
            shop_id,
            claimer,
            ssu_id: bazar::shop_ssu_id(shop),
            tribe_id: tid,
            amount: per_claim,
            pool_remaining: bazar::shop_tribe_token_pool(shop),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
