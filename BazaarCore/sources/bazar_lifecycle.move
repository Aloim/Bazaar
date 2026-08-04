// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazar_lifecycle — Post-V26 Wave 3 shop lifecycle helpers.
///
/// Holds the two new entry/helpers introduced to close the WTB/WTS bug cluster
/// raised after the V26 cascade:
///
/// 1. `auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining)` — public
///    helper invoked at the tail of every WTS/WTB/DE/FREE buy/fill/claim entry.
///    Auto-deactivates the shop the moment its listings + offer-side pairs +
///    escrowed_eve all reach zero. Closes the user complaint:
///    "even if you buy out a shop they dont disappear. they need to disappear".
///    Idempotent: no-op when already inactive.
///
/// 2. `try_expire_shop(registry, shop_id, clock)` — permissionless entry. Any
///    wallet can sweep an expired shop into the inactive state once its
///    `expiry_ms` has passed. Lets the marketplace shed stale shops without
///    requiring the owner's signature. Idempotent: no-op when already inactive
///    or when `expiry_ms == 0` (the "never expires" sentinel) or when current
///    time is still before expiry.
///
/// Sibling-module split rationale: `bazar.move` was at exactly 500 LOC (its
/// Constitution Article XIV.4 ceiling) post-V26-D8. Adding these helpers
/// in-place would push it over. Moving them to a sibling keeps the guard
/// intact and tracks the V26 D8 split convention (bazar_free, ledger_shop_ops
/// _ssu_admin).
///
/// Visibility: `auto_deactivate_if_drained` is `public` (widened at V31 so
/// `bazaar_economy::ledger_shop_ops` can call it); `try_expire_shop` is a public
/// entry consumable from any FE PTB.
module bazaar_core::bazar_lifecycle {
    use sui::event;
    use sui::clock::{Self, Clock};
    use std::vector;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_listings;

    // ===== Events =====

    /// Emitted whenever a shop flips inactive without going through the
    /// explicit close/force-close paths. `reason` codes:
    ///   0 = drained (all listings + pairs + escrowed_eve reached zero)
    ///   1 = expired (current time past shop.expiry_ms)
    public struct ShopAutoClosedEvent has copy, drop {
        shop_id:     ID,
        owner:       address,
        bazaar_type: u8,
        kind:        u8,
        ssu_id:      address,
        tribe_id:    u64,
        reason:      u8,
        timestamp_ms: u64,
    }

    // ===== Entry: Permissionless Expiry Sweep =====

    /// Permissionless sweep entry. Idempotent — safely callable on any shop_id.
    /// Returns silently when:
    ///   * shop already inactive
    ///   * shop.expiry_ms == 0 (never-expires sentinel)
    ///   * current time still strictly before expiry_ms
    ///
    /// V21 NOTE: this entry does NOT drain remaining items or refund EVE/token
    /// state. That's the explicit close-flow's job (close_shop /
    /// force_close_shop_*). Expiry only flips `is_active = false` so the FE
    /// can hide the shop from the marketplace; the owner can subsequently
    /// invoke the explicit close to drain refunds. Open item/EVE residue stays
    /// recoverable via close_shop_as_ssu_owner (Main Storage) or
    /// close_shop (Player Locker) for as long as the shop record exists.
    public entry fun try_expire_shop(
        registry: &mut BazarRegistry,
        shop_id:  ID,
        clock:    &Clock,
        _ctx:     &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let (active, expiry, owner, bazaar_type, kind, ssu_id, tribe_id) = {
            let shop = bazar::borrow_shop(registry, shop_id);
            (
                bazar::shop_is_active(shop),
                bazar::shop_expiry_ms(shop),
                bazar::shop_owner(shop),
                bazar::shop_bazaar_type(shop),
                bazar::shop_kind(shop),
                bazar::shop_ssu_id(shop),
                bazar::shop_tribe_id(shop),
            )
        };
        if (!active) return;
        if (expiry == 0) return;
        if (now < expiry) return;
        bazar::deactivate_shop_by_id(registry, shop_id, owner);
        event::emit(ShopAutoClosedEvent {
            shop_id, owner, bazaar_type, kind, ssu_id, tribe_id,
            reason: 1, timestamp_ms: now,
        });
    }

    // ===== Package-Private: Buyout Auto-Close =====

    /// GAS-01: short-circuit variant of the drain probe.
    ///
    /// `touched_remaining` is the post-decrement quantity of the listing or pair
    /// just decremented by the calling trade/claim entry.
    ///
    ///   touched_remaining > 0  =>  that listing/pair is non-empty  =>  the AND
    ///       (listings_qty == 0 /\ pairs_qty == 0) is provably false  =>  skip
    ///       both while-loops and return false immediately.
    ///   touched_remaining == 0 =>  fall through to the full O(L+P) scan.
    ///
    /// The `escrowed_eve == 0` check ALWAYS runs regardless of the hint.
    /// It is a single cheap balance::value read and is the only drain signal for
    /// FREE coin-claim (which touches no listing) and for WTB fills that drain
    /// escrowed_eve asymmetrically (release_amount = gross+taxes, not the full pool).
    ///
    /// Evaluation order change vs the original: eve is checked FIRST (cheapest),
    /// then the short-circuit, then the two loops. The result is identical for all
    /// input states — this is a pure gas win on the hot partial-buy path.
    ///
    /// 🔒 GUARDRAIL (security review 2026-06-25, GAS-01):
    ///   Do NOT remove or condition the escrowed_eve term. FREE coin-claim and
    ///   WTB fills drain escrowed_eve on paths that may touch no listing.
    public(package) fun is_shop_drained(
        registry:          &BazarRegistry,
        shop_id:           ID,
        touched_remaining: u64,
    ): bool {
        let shop = bazar::borrow_shop(registry, shop_id);
        // Always check escrowed_eve first — cheapest read, catches the FREE/WTB
        // drain paths regardless of whether any listing was touched.
        let eve = bazar::escrowed_eve_value(shop);
        if (eve != 0) return false;
        // Short-circuit: if the touched listing/pair is still non-empty, the
        // overall quantity-sum is provably > 0 without scanning all slots.
        if (touched_remaining > 0) return false;
        // Full scan: touched item hit zero (or no listing/pair was touched).
        // Must verify that no other listing or pair still has remaining stock.
        let listings = bazar::shop_listings(shop);
        let mut listings_qty = 0u64;
        let mut i = 0; let n = vector::length(listings);
        while (i < n) {
            listings_qty = listings_qty + bazar_listings::listing_quantity(
                vector::borrow(listings, i),
            );
            i = i + 1;
        };
        if (listings_qty != 0) return false;
        let pairs = bazar::shop_pairs(shop);
        let mut pairs_qty = 0u64;
        let mut j = 0; let m = vector::length(pairs);
        while (j < m) {
            pairs_qty = pairs_qty + bazar_listings::pair_offer_qty(
                vector::borrow(pairs, j),
            );
            j = j + 1;
        };
        pairs_qty == 0
    }

    /// GAS-01: pass `touched_remaining` (post-decrement quantity of the listing or
    /// pair just touched) so is_shop_drained can skip the O(L+P) while-loops when
    /// the touched item is provably non-empty.
    ///
    /// Callers that touch no listing (FREE coin-claim) MUST pass 0 to force the
    /// full scan — the escrowed_eve drain is the only signal in that path.
    ///
    /// Idempotent: no-op when the shop is already inactive. Behavior is
    /// byte-identical to the original for all input states; only gas cost changes.
    public fun auto_deactivate_if_drained(
        registry:          &mut BazarRegistry,
        shop_id:           ID,
        clock:             &Clock,
        touched_remaining: u64,
    ) {
        let (active, owner, bazaar_type, kind, ssu_id, tribe_id) = {
            let shop = bazar::borrow_shop(registry, shop_id);
            (
                bazar::shop_is_active(shop),
                bazar::shop_owner(shop),
                bazar::shop_bazaar_type(shop),
                bazar::shop_kind(shop),
                bazar::shop_ssu_id(shop),
                bazar::shop_tribe_id(shop),
            )
        };
        if (!active) return;
        if (!is_shop_drained(registry, shop_id, touched_remaining)) return;
        bazar::deactivate_shop_by_id(registry, shop_id, owner);
        event::emit(ShopAutoClosedEvent {
            shop_id, owner, bazaar_type, kind, ssu_id, tribe_id,
            reason: 0, timestamp_ms: clock::timestamp_ms(clock),
        });
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
