// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_shop_ops::shop_ops_wts {
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use EVE::EVE::EVE;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_lifecycle;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::user_storage::UserStorage;
    use bazaar_core::bazaar_core_admin::BazaarCoreAdmin;
    use bazaar_core::membership::{Self, MemberRegistry};
    use bazaar_core::ssu_role_tax_admin;
    use bazaar_core::tribe_role_tax_admin;
    use bazaar_core::role_tax_types;
    use bazaar_core::shop_ops_guarded;
    use bazaar_shop_ops::shop_ops_cap_store::{Self, ShopOpsCapStore};
    use dapp_hub::tax_wallet::DAppTaxWallet;
    use dapp_hub::dapp_governance::{Self, GovernanceConfig};

    // ===== Local error / tx-type consts (mirror of shop_ops_helpers — Move consts are module-private) =====
    const E_INSUFFICIENT_PAYMENT:      u64 = 1;
    const E_SHOP_NOT_ACTIVE:            u64 = 2;
    const E_LISTING_SOLD_OUT:           u64 = 3;
    const E_PLAYER_BANNED:              u64 = 5;
    const E_ZERO_QUANTITY:              u64 = 6;
    const E_MODE_NOT_SUPPORTED_FOR_OP:  u64 = 7;
    const E_TRIBE_STORE_PRIVATE:        u64 = 8;
    const E_WRONG_SSU:                  u64 = 9;
    // V35 SA-04: tribe identity assert — prevents passing a different tribe's gov object.
    const E_WRONG_TRIBE:                u64 = 10;
    // Phase 5 C-A1: NoTribe path must reject an Easy/Advanced SSU.
    const E_WRONG_BAZAAR_TYPE:          u64 = 11;
    const TX_WTS:                       u8  = 0;

    // ===== WTS Buy — NoTribe (2-layer: SSU + DApp) =====
    public fun wts_buy_notribe(
        registry: &mut BazarRegistry,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        payment: Coin<EVE>,
        ssu_gov: &mut SSUGovernance,
        admin: &BazaarCoreAdmin,
        dapp_tax_wallet: &mut DAppTaxWallet,
        dapp_config: &GovernanceConfig,
        member_registry: &MemberRegistry,
        storage: &mut UserStorage,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        ssu_governance::assert_not_frozen(ssu_gov);
        ssu_governance::assert_active(ssu_gov);
        // Phase 5 C-A1: NoTribe path rejects Easy/Advanced SSUs.
        // Symmetric to assert_easy_or_advanced in wts_buy_tribe (:127).
        assert!(ssu_governance::ssu_bazaar_type(ssu_gov) == 0, E_WRONG_BAZAAR_TYPE);
        ssu_governance::assert_subject_in_governance(ssu_gov, bazar::shop_ssu_id(shop));
        // B1.1 (AUD-NT-08/09): SSU membership ban + V35 timed-ban enforcement.
        // GAS-04: single MemberRegistry borrow for static is_banned + ssu_role (tribe_role unused on NoTribe path).
        let (buyer_ssu_role, _tribe_role, member_banned) = membership::roles_of(member_registry, ctx.sender()); // GAS-04
        assert!(!member_banned, E_PLAYER_BANNED);                                                               // GAS-04
        assert!(!ssu_governance::is_banned(ssu_gov, ctx.sender(), clock), E_PLAYER_BANNED);
        assert!(quantity > 0, E_ZERO_QUANTITY);
        assert!(bazar::shop_is_active(shop), E_SHOP_NOT_ACTIVE);
        // V38 split: borrow the ShopOpsCap once after auth, before any wrapped fund call.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let listing = shop_ops_guarded::get_listing_g(shop, listing_idx, cap);
        assert!(bazar::listing_quantity(listing) >= quantity, E_LISTING_SOLD_OUT);
        let gross        = bazar::listing_price_eve(listing) * quantity;
        assert!(coin::value(&payment) >= gross, E_INSUFFICIENT_PAYMENT);
        // GAS-04: combined RoleTaxConfig accessor — one borrow of SSU role_taxes Table.
        let ssu_bps      = role_tax_types::wts_pct(&ssu_role_tax_admin::ssu_role_tax(ssu_gov, buyer_ssu_role)); // GAS-04
        let dapp_bps     = dapp_governance::notribe_dapp_tax_bps(dapp_config);
        let (ssu_tax, _tribe_tax, dapp_tax, net) = shop_ops_guarded::compute_taxes_g(gross, ssu_bps, 0, dapp_bps, cap);
        let buyer        = ctx.sender();
        let seller       = bazar::shop_owner(shop);
        let ssu_id       = bazar::shop_ssu_id(shop);
        let tribe_id     = bazar::shop_tribe_id(shop);
        let bt           = bazar::shop_bazaar_type(shop);
        let item_type_id = bazar::listing_item_type_id(listing);
        let shop_id      = object::id(shop);
        let mut pay      = payment;
        let ssu_coin     = coin::split(&mut pay, ssu_tax, ctx);
        let dapp_coin    = coin::split(&mut pay, dapp_tax, ctx);
        let net_coin     = coin::split(&mut pay, net, ctx);
        if (coin::value(&pay) > 0) {
            transfer::public_transfer(pay, buyer);
        } else {
            coin::destroy_zero(pay);
        };
        shop_ops_guarded::deposit_ssu_tax_g(ssu_gov, ssu_coin, cap);
        shop_ops_guarded::safe_deposit_dapp_tax_g(
            admin, dapp_tax_wallet, dapp_coin, b"wts_buy", b"notribe",
            ssu_id, tribe_id, buyer, seller, gross, ssu_tax, 0, net, clock, cap,
        );
        transfer::public_transfer(net_coin, seller);
        // GAS-01: capture post-decrement qty for the drain short-circuit hint.
        let touched_remaining = shop_ops_guarded::decrement_listing_g(shop, listing_idx, quantity, cap);
        shop_ops_guarded::store_purchased_items_g(
            storage, member_registry, buyer, item_type_id, quantity,
            option::some(shop_id), clock, cap, ctx,
        );
        shop_ops_guarded::emit_purchase_event_g(shop_ops_guarded::new_purchase_event_g(
            TX_WTS, bt,
            shop_id, listing_idx, quantity,
            buyer, seller, ssu_id, tribe_id,
            gross, ssu_tax, 0, dapp_tax, net,
            clock.timestamp_ms(), cap,
        ), cap);
        // Wave 3 W3-6: auto-deactivate fully-drained shops; GAS-01: hint skips loops on partial buys.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining);
    }

    // ===== WTS Buy — Tribe (3-layer: SSU + Tribe + DApp) =====
    public fun wts_buy_tribe(
        registry: &mut BazarRegistry,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        payment: Coin<EVE>,
        ssu_gov: &mut SSUGovernance,
        tribe_gov: &mut TribeGovernance,
        admin: &BazaarCoreAdmin,
        dapp_tax_wallet: &mut DAppTaxWallet,
        dapp_config: &GovernanceConfig,
        member_registry: &MemberRegistry,
        storage: &mut UserStorage,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        // V38 split: borrow the ShopOpsCap up front — the first gate is a wrapped assert.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        shop_ops_guarded::assert_easy_or_advanced_g(ssu_governance::ssu_bazaar_type(ssu_gov), cap);
        ssu_governance::assert_not_frozen(ssu_gov);
        ssu_governance::assert_active(ssu_gov);
        ssu_governance::assert_subject_in_governance(ssu_gov, bazar::shop_ssu_id(shop));
        assert!(tribe_governance::tribe_governance_mode(tribe_gov) == 0, E_MODE_NOT_SUPPORTED_FOR_OP);
        assert!(quantity > 0, E_ZERO_QUANTITY);
        assert!(bazar::shop_is_active(shop), E_SHOP_NOT_ACTIVE);
        // V35 SA-04: assert supplied tribe_gov matches the shop's recorded tribe_id.
        // Prevents bypassing ban+visibility gate by passing a different tribe's gov object.
        assert!(
            tribe_governance::tribe_id(tribe_gov) == bazar::shop_tribe_id(shop),
            E_WRONG_TRIBE,
        );
        // B1.6 (AUD-ET-14, USER ruled: enforce): deactivated tribe halts trade.
        // V38 split: use the public twin in tribe_governance (tribe_lifecycle's is package-private).
        tribe_governance::assert_tribe_active(tribe_gov);
        // V35: tribe_is_globally_banned now takes &Clock (timed expiry — CC-01 retype).
        assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, ctx.sender(), clock), E_PLAYER_BANNED);
        // B1.1 (AUD-ET-13): SSU membership ban + timed-ban on Easy path (tribe-global ban exists above).
        // GAS-04: single MemberRegistry borrow for static is_banned + both role fields.
        let (buyer_ssu_role, buyer_tribe_role, member_banned) = membership::roles_of(member_registry, ctx.sender()); // GAS-04
        assert!(!member_banned, E_PLAYER_BANNED);                                                                    // GAS-04
        assert!(!ssu_governance::is_banned(ssu_gov, ctx.sender(), clock), E_PLAYER_BANNED);
        // R6.7.6 OS-49a: cross-SSU MemberRegistry binding (UNCONDITIONAL).
        // Ensures the supplied MemberRegistry belongs to the same SSU as the shop.
        assert!(
            membership::ssu_id(member_registry) == bazar::shop_ssu_id(shop),
            E_WRONG_SSU,
        );
        // R6.7.6 OS-49a: buyer membership gate (CONDITIONAL — only when store is private).
        // effective_role = max(ssu_role, tribe_role). Buyer passes if effective_role >= ROLE_MEMBER (2),
        // which means both tribe-roled buyers (joined via application) and SSU-roled buyers
        // (registered directly as member-tier or higher) are admitted.
        if (tribe_governance::store_visibility(tribe_gov) == 1) {
            assert!(membership::is_member(member_registry, ctx.sender()), E_TRIBE_STORE_PRIVATE);
        };
        let listing = shop_ops_guarded::get_listing_g(shop, listing_idx, cap);
        assert!(bazar::listing_quantity(listing) >= quantity, E_LISTING_SOLD_OUT);
        let gross        = bazar::listing_price_eve(listing) * quantity;
        assert!(coin::value(&payment) >= gross, E_INSUFFICIENT_PAYMENT);
        // GAS-04: combined RoleTaxConfig accessors — one borrow per governance object.
        let ssu_bps   = role_tax_types::wts_pct(&ssu_role_tax_admin::ssu_role_tax(ssu_gov, buyer_ssu_role));     // GAS-04
        let tribe_bps = role_tax_types::wts_pct(&tribe_role_tax_admin::tribe_role_tax(tribe_gov, buyer_tribe_role)); // GAS-04
        let dapp_bps     = dapp_governance::easy_dapp_tax_bps(dapp_config);
        let (ssu_tax, tribe_tax, dapp_tax, net) = shop_ops_guarded::compute_taxes_g(gross, ssu_bps, tribe_bps, dapp_bps, cap);
        let buyer        = ctx.sender();
        let seller       = bazar::shop_owner(shop);
        let ssu_id       = bazar::shop_ssu_id(shop);
        let tribe_id     = bazar::shop_tribe_id(shop);
        let bt           = bazar::shop_bazaar_type(shop);
        let item_type_id = bazar::listing_item_type_id(listing);
        let shop_id      = object::id(shop);
        let mut pay      = payment;
        let ssu_coin     = coin::split(&mut pay, ssu_tax, ctx);
        let tribe_coin   = coin::split(&mut pay, tribe_tax, ctx);
        let dapp_coin    = coin::split(&mut pay, dapp_tax, ctx);
        let net_coin     = coin::split(&mut pay, net, ctx);
        if (coin::value(&pay) > 0) {
            transfer::public_transfer(pay, buyer);
        } else {
            coin::destroy_zero(pay);
        };
        shop_ops_guarded::deposit_ssu_tax_g(ssu_gov, ssu_coin, cap);
        shop_ops_guarded::deposit_tribe_tax_g(tribe_gov, tribe_coin, cap);
        shop_ops_guarded::safe_deposit_dapp_tax_g(
            admin, dapp_tax_wallet, dapp_coin, b"wts_buy", b"easy",
            ssu_id, tribe_id, buyer, seller, gross, ssu_tax, tribe_tax, net, clock, cap,
        );
        transfer::public_transfer(net_coin, seller);
        // GAS-01: capture post-decrement qty for the drain short-circuit hint.
        let touched_remaining = shop_ops_guarded::decrement_listing_g(shop, listing_idx, quantity, cap);
        shop_ops_guarded::store_purchased_items_g(
            storage, member_registry, buyer, item_type_id, quantity,
            option::some(shop_id), clock, cap, ctx,
        );
        shop_ops_guarded::emit_purchase_event_g(shop_ops_guarded::new_purchase_event_g(
            TX_WTS, bt,
            shop_id, listing_idx, quantity,
            buyer, seller, ssu_id, tribe_id,
            gross, ssu_tax, tribe_tax, dapp_tax, net,
            clock.timestamp_ms(), cap,
        ), cap);
        // Wave 3 W3-6: auto-deactivate fully-drained shops; GAS-01: hint skips loops on partial buys.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining);
    }
    // ===== Test-Only Accessors =====

    /// Re-export E_WRONG_BAZAAR_TYPE for cross-module expected_failure assertions (BA-10).
    /// Mirrors e_recipient_not_shop_owner_for_testing pattern in shop_ops_wtb.move.
    #[test_only]
    public fun e_wrong_bazaar_type_for_testing(): u64 { E_WRONG_BAZAAR_TYPE }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
