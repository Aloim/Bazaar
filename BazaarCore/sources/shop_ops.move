// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
// RETIRED: shop_ops.move split into shop_ops_helpers, shop_ops_wts, shop_ops_wtb, shop_ops_de
// per R6.7.6 Article XIV.4 mandate. Only economy hooks remain here for backward compatibility
// until a future refactor moves them to shop_ops_helpers.
// See Documentation/Registry/bazaar_core.md for split rationale.

module bazaar_core::shop_ops {
    use bazaar_core::bazar::{Self, Shop};
    use bazaar_core::bazaar_core_admin::TribeTokenShopCap;

    // ===== Economy Hooks (BazaarEconomy cap-gated) =====
    // These fns are consumed by bazaar_economy via TribeTokenShopCap.
    // They are retained here (not in split targets) to avoid breaking the
    // bazaar_economy dependency on bazaar_core::shop_ops.
    /// GAS-01: returns post-decrement listing quantity for the drain short-circuit.
    /// Consumed by bazaar_economy::ledger_shop_ops (all three trade paths).
    public fun deduct_listing_quantity(
        shop: &mut Shop, listing_idx: u64, quantity: u64, _cap: &TribeTokenShopCap,
    ): u64 {
        bazar::decrement_listing(shop, listing_idx, quantity)
    }

    /// V31 partial DE — consume `units` offered items from a Direct-Exchange pair's
    /// remaining stock (cap-gated cross-package wrapper over
    /// `bazar::decrement_pair_offer`, which is `public(package)`). Consumed by
    /// `bazaar_economy::ledger_shop_ops::ledger_de_exchange`. The 1:N ratio model
    /// lets a pair be drained over multiple partial exchanges; the pair record is
    /// retained at zero so the shop auto-deactivates once every pair is exhausted.
    /// Aborts E_PAIR_NOT_FOUND (=9) if pair_idx is out of range,
    /// E_PAIR_INSUFFICIENT_STOCK (=10) if `units` exceeds remaining stock.
    /// GAS-01: returns post-decrement pair offer_quantity for the drain short-circuit.
    /// Consumed by bazaar_economy::ledger_shop_ops::ledger_de_exchange.
    public fun consume_de_pair(
        shop: &mut Shop, pair_idx: u64, units: u64, _cap: &TribeTokenShopCap,
    ): u64 {
        bazar::decrement_pair_offer(shop, pair_idx, units)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
