// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// V26 D8 — FREE-shop entry functions extracted from bazar.move to keep
/// the parent module under the 500-line guard.
///
/// Two entries live here:
///   create_free_shop         — V25 EVE-prepay path for NoTribe / Easy
///   create_free_shop_partial — V26 Advanced entry (no EVE prepay; tribe-token
///                              pool managed by bazaar_economy::free_shop_advanced)
///
/// Both delegate Shop construction to bazar::construct_shop and registration
/// to bazar::register_shop (both promoted to public(package) in the split).
/// Field accessors / mutators (shop_coin_claim_amount, debit_tribe_token_pool,
/// record_coin_claim, …) remain in bazar.move because they touch private
/// fields on the Shop struct.
module bazaar_core::bazar_free {
    use sui::coin::{Self, Coin};
    use sui::balance;
    use sui::clock::{Self, Clock};
    use EVE::EVE::EVE;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::membership::MemberRegistry;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazar_helpers;
    use bazaar_core::bazar_listings;

    // ===== Constants =====
    const BAZAAR_TYPE_ADVANCED: u8 = 2;
    const SHOP_FREE: u8 = 3;
    const MAX_SHOP_LISTINGS: u64 = 64;

    // ===== Error Codes =====
    // E_TOO_MANY_LISTINGS mirrors bazar::E_TOO_MANY_LISTINGS (=21) for the
    // listings-bound guard; identical numeric value so FE error decoding stays
    // uniform regardless of which module raised.
    const E_TOO_MANY_LISTINGS: u64 = 21;
    // E_FREE_COIN_INSUFFICIENT_POOL mirrors bazar::E_FREE_COIN_INSUFFICIENT_POOL
    // (=23) — raised here when prepay > 0 but claim_amount is invalid.
    const E_FREE_COIN_INSUFFICIENT_POOL: u64 = 23;
    // V25: FREE shop validation — both items and coin giveaway are empty.
    const E_FREE_SHOP_EMPTY: u64 = 24;
    /// V26 — Advanced FREE shops MUST route through bazaar_economy's
    /// create_free_shop_advanced (tribe-token giveaway). EVE-prepay path
    /// (create_free_shop) is rejected for Advanced; create_free_shop_partial
    /// requires bazaar_type == Advanced.
    const E_FREE_SHOP_WRONG_KIND_FOR_BAZAAR: u64 = 25;

    // ===== Public Entries =====

    /// V25 — NoTribe / Easy FREE shop with optional EVE coin-giveaway pool.
    /// Either items OR giveaway must be non-empty; one claim per wallet.
    /// Advanced bazaars must use bazar_economy::free_shop_advanced instead.
    public fun create_free_shop(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        item_type_ids: vector<u64>, quantities: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        prepay: Coin<EVE>,
        coin_claim_amount: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        bazar::assert_matches_gov(bazaar_type, tribe_id, gov);
        let owner = tx_context::sender(ctx);
        bazar::assert_shop_limit_ok(registry, gov, members, owner);
        bazar::assert_shop_position_clear(registry, ssu_id, position_x, position_y);
        assert!(vector::length(&item_type_ids) <= MAX_SHOP_LISTINGS, E_TOO_MANY_LISTINGS);
        assert!(bazaar_type != BAZAAR_TYPE_ADVANCED, E_FREE_SHOP_WRONG_KIND_FOR_BAZAAR);
        let n = vector::length(&item_type_ids);
        let prepay_value = coin::value(&prepay);
        assert!(n > 0 || prepay_value > 0, E_FREE_SHOP_EMPTY);
        let title_str = bazar_helpers::validate_free_shop_params(bazaar_type, &title);
        if (prepay_value > 0) {
            assert!(coin_claim_amount > 0 && prepay_value >= coin_claim_amount, E_FREE_COIN_INSUFFICIENT_POOL);
        };
        let mut zero_prices = vector::empty<u64>();
        let mut i = 0;
        while (i < n) { vector::push_back(&mut zero_prices, 0u64); i = i + 1; };
        let listings = bazar_listings::build_listings(item_type_ids, quantities, zero_prices);
        let now = clock::timestamp_ms(clock);
        let shop = bazar::construct_shop(
            owner, SHOP_FREE, bazaar_type, title_str, ssu_id, tribe_id,
            listings, vector::empty(), coin::into_balance(prepay),
            now, expiry_ms, position_x, position_y,
            coin_claim_amount, 0,
            ctx,
        );
        bazar::register_shop(registry, shop, SHOP_FREE, bazaar_type, owner, ssu_id, tribe_id, position_x, position_y, now)
    }

    /// V26 — Advanced FREE shop create (called by bazaar_economy::free_shop_advanced).
    /// No `Coin<EVE>` prepay — the tribe-token giveaway pool lives in
    /// `shop.tribe_token_pool`, pre-burned from the creator's ledger row by the
    /// BazaarEconomy caller. `tribe_token_pool` + `coin_claim_amount` args are
    /// in scaled tribe-token units. Allows item_count == 0 when
    /// tribe_token_pool > 0 (caller validates).
    public fun create_free_shop_partial(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        item_type_ids: vector<u64>, quantities: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        tribe_token_pool: u64,
        coin_claim_amount: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        assert!(bazaar_type == BAZAAR_TYPE_ADVANCED, E_FREE_SHOP_WRONG_KIND_FOR_BAZAAR);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        bazar::assert_matches_gov(bazaar_type, tribe_id, gov);
        let owner = tx_context::sender(ctx);
        bazar::assert_shop_limit_ok(registry, gov, members, owner);
        bazar::assert_shop_position_clear(registry, ssu_id, position_x, position_y);
        assert!(vector::length(&item_type_ids) <= MAX_SHOP_LISTINGS, E_TOO_MANY_LISTINGS);
        let n = vector::length(&item_type_ids);
        // Caller (free_shop_advanced::create_free_shop_advanced) validates
        // item_count > 0 OR tribe_token_pool > 0.
        let title_str = bazar_helpers::validate_free_shop_params(bazaar_type, &title);
        let mut zero_prices = vector::empty<u64>();
        let mut i = 0;
        while (i < n) { vector::push_back(&mut zero_prices, 0u64); i = i + 1; };
        let listings = bazar_listings::build_listings(item_type_ids, quantities, zero_prices);
        let now = clock::timestamp_ms(clock);
        let shop = bazar::construct_shop(
            owner, SHOP_FREE, bazaar_type, title_str, ssu_id, tribe_id,
            listings, vector::empty(), balance::zero(),
            now, expiry_ms, position_x, position_y,
            coin_claim_amount, tribe_token_pool,
            ctx,
        );
        bazar::register_shop(registry, shop, SHOP_FREE, bazaar_type, owner, ssu_id, tribe_id, position_x, position_y, now)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
