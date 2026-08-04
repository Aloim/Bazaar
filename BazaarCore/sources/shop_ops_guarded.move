// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// shop_ops_guarded — V38 package-split hardened wrapper layer.
///
/// The shop-op entry modules (shop_ops_wts/wtb/de, shop_moderation[_tribe],
/// bazar_close, bazar_admin_drain) were carved out of bazaar_core into the
/// downstream bazaar_shop_ops package to recover publish-object size. Those
/// modules used to call bazaar_core `public(package)` Shop/treasury/governance
/// mutators directly; across the package boundary that is impossible.
///
/// Rather than bare-widen each `public(package)` fund/state mutator to `public`
/// (a capability-bypass anti-pattern — any PTB could then call them), each is
/// exposed here via a `_g` wrapper that takes `_cap: &ShopOpsCap`. ShopOpsCap is
/// minted ONCE at deployment (bazaar_core_admin::authorize_shop_ops_package) and
/// held inside the bazaar_shop_ops::shop_ops_cap_store singleton — so only the
/// authorized downstream package can reach these mutators. Pattern mirrors the
/// live `bazaar_core::shop_ops::deduct_listing_quantity` (TribeTokenShopCap-gated).
///
/// Each wrapper is a thin forward to the original `public(package)` callee; the
/// auth/ban/active/owner ordering in the calling entry is UNCHANGED.
module bazaar_core::shop_ops_guarded {
    use sui::coin::Coin;
    use EVE::EVE::EVE;
    use sui::clock::Clock;
    use bazaar_core::bazaar_core_admin::{Self, ShopOpsCap, BazaarCoreAdmin};
    use bazaar_core::bazar::{Self, BazarRegistry, Shop};
    use bazaar_core::bazar_listings::{Listing, ExchangePair};
    use bazaar_core::ssu_treasury;
    use bazaar_core::ssu_governance::SSUGovernance;
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::wtb_escrow_pool::{Self, WtbEscrowPool};
    use bazaar_core::shop_ops_helpers::{Self, PurchaseEvent};
    use bazaar_core::user_storage::{Self, UserStorage};
    use bazaar_core::membership::MemberRegistry;
    use bazaar_core::bazaar_assertions;
    use dapp_hub::tax_wallet::DAppTaxWallet;

    // ===== bazaar_assertions:: =====

    /// Hardened wrapper over the package-private Easy/Advanced bazaar-type assert.
    /// Used by the cross-package tribe trade + FREE-claim entries.
    public fun assert_easy_or_advanced_g(bazaar_type: u8, _cap: &ShopOpsCap) {
        bazaar_assertions::assert_easy_or_advanced(bazaar_type)
    }

    // ===== bazar:: Shop borrow / read / mutate wrappers =====

    public fun borrow_shop_g(registry: &BazarRegistry, shop_id: ID, _cap: &ShopOpsCap): &Shop {
        bazar::borrow_shop(registry, shop_id)
    }

    public fun get_listing_g(shop: &Shop, idx: u64, _cap: &ShopOpsCap): &Listing {
        bazar::get_listing(shop, idx)
    }

    public fun escrowed_eve_value_g(shop: &Shop, _cap: &ShopOpsCap): u64 {
        bazar::escrowed_eve_value(shop)
    }

    public fun listings_is_empty_g(shop: &Shop, _cap: &ShopOpsCap): bool {
        bazar::listings_is_empty(shop)
    }

    public fun pairs_is_empty_g(shop: &Shop, _cap: &ShopOpsCap): bool {
        bazar::pairs_is_empty(shop)
    }

    /// GAS-01: returns post-decrement listing quantity so trade callers can pass
    /// it to auto_deactivate_if_drained as the touched_remaining short-circuit hint.
    public fun decrement_listing_g(shop: &mut Shop, idx: u64, qty: u64, _cap: &ShopOpsCap): u64 {
        bazar::decrement_listing(shop, idx, qty)
    }

    /// GAS-01: returns post-decrement offer_quantity for the drain short-circuit hint.
    public fun decrement_pair_offer_g(shop: &mut Shop, pair_idx: u64, units: u64, _cap: &ShopOpsCap): u64 {
        bazar::decrement_pair_offer(shop, pair_idx, units)
    }

    public fun pop_listing_g(shop: &mut Shop, _cap: &ShopOpsCap): Listing {
        bazar::pop_listing(shop)
    }

    public fun pop_pair_g(shop: &mut Shop, _cap: &ShopOpsCap): ExchangePair {
        bazar::pop_pair(shop)
    }

    public fun deactivate_shop_by_id_g(
        registry: &mut BazarRegistry, shop_id: ID, owner: address, _cap: &ShopOpsCap,
    ) {
        bazar::deactivate_shop_by_id(registry, shop_id, owner)
    }

    public fun withdraw_escrowed_eve_g(
        shop: &mut Shop, amount: u64, _cap: &ShopOpsCap, ctx: &mut TxContext,
    ): Coin<EVE> {
        bazar::withdraw_escrowed_eve(shop, amount, ctx)
    }

    // ===== ssu_treasury:: =====

    public fun deposit_ssu_tax_g(gov: &mut SSUGovernance, coin: Coin<EVE>, _cap: &ShopOpsCap) {
        ssu_treasury::deposit_ssu_tax(gov, coin)
    }

    // ===== tribe_governance:: =====

    public fun deposit_tribe_tax_g(gov: &mut TribeGovernance, coin: Coin<EVE>, _cap: &ShopOpsCap) {
        tribe_governance::deposit_tribe_tax(gov, coin)
    }

    public fun record_ssu_tribe_tax_g(
        gov: &mut TribeGovernance, ssu_id: address, amount: u64, _cap: &ShopOpsCap,
    ) {
        tribe_governance::record_ssu_tribe_tax(gov, ssu_id, amount)
    }

    // ===== wtb_escrow_pool:: =====

    public fun withdraw_owner_residual_on_close_g(
        pool: &mut WtbEscrowPool,
        shop_id: ID,
        owner: address,
        _cap: &ShopOpsCap,
        ctx: &mut TxContext,
    ): Option<Coin<EVE>> {
        wtb_escrow_pool::withdraw_owner_residual_on_close(pool, shop_id, owner, ctx)
    }

    // ===== shop_ops_helpers:: =====

    public fun compute_taxes_g(
        gross: u64, ssu_bps: u64, tribe_bps: u64, dapp_bps: u64, _cap: &ShopOpsCap,
    ): (u64, u64, u64, u64) {
        shop_ops_helpers::compute_taxes(gross, ssu_bps, tribe_bps, dapp_bps)
    }

    public fun new_purchase_event_g(
        tx_type: u8,
        bazaar_type: u8,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        buyer: address,
        seller: address,
        ssu_id: address,
        tribe_id: u64,
        gross_amount: u64,
        ssu_tax: u64,
        tribe_tax: u64,
        dapp_tax: u64,
        net_amount: u64,
        timestamp_ms: u64,
        _cap: &ShopOpsCap,
    ): PurchaseEvent {
        shop_ops_helpers::new_purchase_event(
            tx_type, bazaar_type, shop_id, listing_idx, quantity,
            buyer, seller, ssu_id, tribe_id,
            gross_amount, ssu_tax, tribe_tax, dapp_tax, net_amount,
            timestamp_ms,
        )
    }

    public fun emit_purchase_event_g(ev: PurchaseEvent, _cap: &ShopOpsCap) {
        shop_ops_helpers::emit_purchase_event(ev)
    }

    public fun safe_deposit_dapp_tax_g(
        admin: &BazaarCoreAdmin,
        w: &mut DAppTaxWallet,
        dapp_coin: Coin<EVE>,
        tx_type: vector<u8>,
        bz_type: vector<u8>,
        ssu_id: address,
        tribe_id: u64,
        payer: address,
        receiver: address,
        gross: u64,
        ssu_tax: u64,
        tribe_tax: u64,
        net: u64,
        clock: &Clock,
        _cap: &ShopOpsCap,
    ) {
        shop_ops_helpers::safe_deposit_dapp_tax(
            admin, w, dapp_coin, tx_type, bz_type,
            ssu_id, tribe_id, payer, receiver,
            gross, ssu_tax, tribe_tax, net, clock,
        )
    }

    // ===== user_storage:: =====

    public fun store_purchased_items_g(
        storage: &mut UserStorage,
        member_registry: &MemberRegistry,
        buyer: address,
        item_type_id: u64,
        quantity: u64,
        shop_id_opt: Option<ID>,
        clock: &Clock,
        _cap: &ShopOpsCap,
        ctx: &mut TxContext,
    ) {
        user_storage::store_purchased_items(
            storage, member_registry, buyer, item_type_id, quantity, shop_id_opt, clock, ctx,
        )
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
