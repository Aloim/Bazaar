// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazar_listings — extracted Listing + ExchangePair types, builder helpers,
/// and all per-item/per-pair accessor functions.
/// Extracted from bazar.move during EFP1 Phase 8 to recover LOC budget
/// after Shop struct expansion (+position_x, +position_y) + BazarRegistry
/// expansion (+shops_by_ssu).
///
/// INVARIANT: This module must not import from bazaar_core::bazar.
/// bazar.move imports FROM this module, not the reverse.
module bazaar_core::bazar_listings {
    use bazaar_core::bazar_helpers;

    // ===== Structs =====

    public struct Listing has store, copy, drop {
        item_type_id: u64,
        quantity: u64,
        price_eve: u64,
        original_quantity: u64,
    }

    public struct ExchangePair has store, copy, drop {
        offer_item_type_id: u64,
        offer_quantity: u64,
        request_item_type_id: u64,
        request_quantity: u64,
        // Bundle-ratio DE model: a trade "lot" is `offer_per_lot` offered items
        // exchanged for `request_quantity` requested items. `offer_quantity` (the
        // remaining escrowed stock) is always a whole multiple of `offer_per_lot`,
        // and a buy consumes whole lots only (units % offer_per_lot == 0). Setting
        // offer_per_lot = 1 reproduces the legacy 1:N "per single offered" ratio,
        // so pre-bundle shops are the offer_per_lot = 1 special case.
        offer_per_lot: u64,
    }

    // ===== Error Codes =====
    // 8/9/10 mirror bazar.move (same meaning there). 11/12 are bazar_listings-LOCAL
    // and intentionally distinct from bazar.move's 11/12 (E_WRONG_SSU / E_MAX_SHOPS_EXCEEDED)
    // — Move abort codes are module-scoped, so the abort location (bazaar_core::bazar_listings)
    // disambiguates. FE abort→message decoding MUST key on (module, code), never code alone.
    const E_LISTING_NOT_FOUND: u64 = 8;
    const E_PAIR_NOT_FOUND: u64 = 9;
    const E_PAIR_INSUFFICIENT_STOCK: u64 = 10;  // partial DE: requested units exceed remaining offered stock
    const E_PARTIAL_LOT: u64 = 11;              // bundle DE: `units` is not a whole multiple of offer_per_lot
    const E_INVALID_LOT: u64 = 12;              // bundle DE: offer_per_lot == 0, or offer_quantity not a whole multiple of it

    // ===== Builder Helpers =====

    /// Build a vector of Listing structs from parallel item/qty/price vectors.
    /// Validates lengths via bazar_helpers. Returns the constructed vector.
    public(package) fun build_listings(
        item_type_ids: vector<u64>,
        quantities: vector<u64>,
        prices_eve: vector<u64>,
    ): vector<Listing> {
        let n = bazar_helpers::validate_three_vector_lengths(
            &item_type_ids, &quantities, &prices_eve,
        );
        let mut listings = vector::empty<Listing>();
        let mut i = 0;
        while (i < n) {
            let qty = *vector::borrow(&quantities, i);
            vector::push_back(&mut listings, Listing {
                item_type_id: *vector::borrow(&item_type_ids, i),
                quantity: qty,
                price_eve: *vector::borrow(&prices_eve, i),
                original_quantity: qty,
            });
            i = i + 1;
        };
        listings
    }

    /// Build a vector of ExchangePair structs from 5 parallel offer/request/lot vectors.
    /// Validates lengths via bazar_helpers. Returns the constructed vector.
    /// Bundle-ratio model: each pair trades `offer_per_lot` offered items for
    /// `request_quantity` requested items. Asserts offer_per_lot >= 1 and that the
    /// total offered stock divides evenly into whole lots (no un-buyable dust that
    /// would leave the shop permanently un-drained). offer_per_lot = 1 is the legacy
    /// 1:N per-single-offered ratio.
    public(package) fun build_pairs(
        offer_type_ids: vector<u64>,
        offer_quantities: vector<u64>,
        request_type_ids: vector<u64>,
        request_quantities: vector<u64>,
        offer_per_lots: vector<u64>,
    ): vector<ExchangePair> {
        let n = bazar_helpers::validate_five_vector_lengths(
            &offer_type_ids, &offer_quantities, &request_type_ids, &request_quantities, &offer_per_lots,
        );
        let mut pairs = vector::empty<ExchangePair>();
        let mut i = 0;
        while (i < n) {
            let offer_qty    = *vector::borrow(&offer_quantities, i);
            let offer_per_lot = *vector::borrow(&offer_per_lots, i);
            // Lot integrity: at least one offered item per lot, and the escrowed
            // stock must be a whole number of lots (else a trailing partial lot can
            // never be bought — units are lot-multiples — and the shop never drains).
            assert!(offer_per_lot >= 1, E_INVALID_LOT);
            assert!(offer_qty % offer_per_lot == 0, E_INVALID_LOT);
            vector::push_back(&mut pairs, ExchangePair {
                offer_item_type_id: *vector::borrow(&offer_type_ids, i),
                offer_quantity: offer_qty,
                request_item_type_id: *vector::borrow(&request_type_ids, i),
                request_quantity: *vector::borrow(&request_quantities, i),
                offer_per_lot,
            });
            i = i + 1;
        };
        pairs
    }

    // ===== Package-Internal Listing Mutators =====

    /// GAS-01: returns post-decrement quantity so callers can pass it to
    /// auto_deactivate_if_drained as the touched_remaining short-circuit hint.
    public(package) fun decrement_listing(
        listings: &mut vector<Listing>, idx: u64, qty: u64,
    ): u64 {
        assert!(idx < vector::length(listings), E_LISTING_NOT_FOUND);
        let listing = vector::borrow_mut(listings, idx);
        listing.quantity = listing.quantity - qty;
        listing.quantity
    }

    public(package) fun increment_listing(
        listings: &mut vector<Listing>, idx: u64, qty: u64,
    ) {
        assert!(idx < vector::length(listings), E_LISTING_NOT_FOUND);
        let listing = vector::borrow_mut(listings, idx);
        listing.quantity = listing.quantity + qty;
    }

    /// EFP1 Phase 8 fix-up — cross-module mutator (price field is module-private).
    public(package) fun set_listing_price(
        listings: &mut vector<Listing>, idx: u64, new_price: u64,
    ) {
        assert!(idx < vector::length(listings), E_LISTING_NOT_FOUND);
        vector::borrow_mut(listings, idx).price_eve = new_price;
    }

    public(package) fun get_listing(
        listings: &vector<Listing>, idx: u64,
    ): &Listing {
        assert!(idx < vector::length(listings), E_LISTING_NOT_FOUND);
        vector::borrow(listings, idx)
    }

    // ===== Package-Internal ExchangePair Mutators =====

    public(package) fun decrement_pair(
        pairs: &mut vector<ExchangePair>, pair_idx: u64,
    ) {
        assert!(pair_idx < vector::length(pairs), E_PAIR_NOT_FOUND);
        vector::remove(pairs, pair_idx);
    }

    /// Partial DE consume: subtract `units` offered items from the pair's remaining
    /// offered stock (the V31 1:N ratio model — `offer_quantity` is the remaining
    /// deposit, `request_quantity` is the per-offered-unit ask). The pair record is
    /// retained at zero so `bazar_lifecycle::is_shop_drained` can flip the shop
    /// inactive once all pairs reach zero. Aborts E_PAIR_NOT_FOUND if the index is
    /// out of range, E_PAIR_INSUFFICIENT_STOCK if `units` exceeds remaining stock.
    /// GAS-01: returns post-decrement offer_quantity for the drain short-circuit hint.
    public(package) fun decrement_pair_offer(
        pairs: &mut vector<ExchangePair>, pair_idx: u64, units: u64,
    ): u64 {
        assert!(pair_idx < vector::length(pairs), E_PAIR_NOT_FOUND);
        let pair = vector::borrow_mut(pairs, pair_idx);
        // Bundle-ratio guard (central to all three DE paths — notribe/easy guarded +
        // Advanced ledger both funnel here): a buy must consume whole lots, so the
        // offered decrement is always a multiple of offer_per_lot. offer_per_lot >= 1
        // is guaranteed at build_pairs, so the modulo is safe. Legacy shops
        // (offer_per_lot == 1) accept any units — units % 1 == 0 always.
        assert!(units % pair.offer_per_lot == 0, E_PARTIAL_LOT);
        assert!(pair.offer_quantity >= units, E_PAIR_INSUFFICIENT_STOCK);
        pair.offer_quantity = pair.offer_quantity - units;
        pair.offer_quantity
    }

    public(package) fun get_pair(
        pairs: &vector<ExchangePair>, idx: u64,
    ): &ExchangePair {
        assert!(idx < vector::length(pairs), E_PAIR_NOT_FOUND);
        vector::borrow(pairs, idx)
    }

    // ===== Public Field Accessors — Listing =====

    public fun listing_item_type_id(listing: &Listing): u64 { listing.item_type_id }
    public fun listing_quantity(listing: &Listing): u64 { listing.quantity }
    public fun listing_price_eve(listing: &Listing): u64 { listing.price_eve }
    public fun listing_original_quantity(listing: &Listing): u64 { listing.original_quantity }

    // ===== Public Field Accessors — ExchangePair =====

    public fun pair_offer_type(pair: &ExchangePair): u64 { pair.offer_item_type_id }
    public fun pair_offer_qty(pair: &ExchangePair): u64 { pair.offer_quantity }
    public fun pair_request_type(pair: &ExchangePair): u64 { pair.request_item_type_id }
    public fun pair_request_qty(pair: &ExchangePair): u64 { pair.request_quantity }
    /// Bundle size — offered items per lot (1 = legacy per-single-offered ratio).
    public fun pair_offer_per_lot(pair: &ExchangePair): u64 { pair.offer_per_lot }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
