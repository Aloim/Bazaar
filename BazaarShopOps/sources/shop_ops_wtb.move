// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_shop_ops::shop_ops_wtb {
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use EVE::EVE::EVE;
    use world::storage_unit::{Self, StorageUnit};
    use world::character::{Self, Character};
    use world::inventory::{Self, Item};
    use bazaar_core::bazar::{Self, BazarRegistry, BazarAuth};
    use bazaar_core::bazar_lifecycle;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    // DC-M1: use bazaar_core::user_storage::{Self, UserStorage}; — DELETED (Phase 4 WTB direct deposit)
    use bazaar_core::bazaar_core_admin::BazaarCoreAdmin;
    use bazaar_core::membership::{Self, MemberRegistry};
    use bazaar_core::ssu_role_tax_admin;
    use bazaar_core::tribe_role_tax_admin;
    use bazaar_core::shop_ops_guarded;
    use bazaar_shop_ops::shop_ops_cap_store::{Self, ShopOpsCapStore};
    use dapp_hub::tax_wallet::DAppTaxWallet;
    use dapp_hub::dapp_governance::{Self, GovernanceConfig};

    // ===== Local error / tx-type consts (mirror of shop_ops_helpers — Move consts are module-private) =====
    const E_SHOP_NOT_ACTIVE:            u64 = 2;
    const E_LISTING_SOLD_OUT:           u64 = 3;
    const E_PLAYER_BANNED:              u64 = 5;
    const E_ZERO_QUANTITY:              u64 = 6;
    const E_MODE_NOT_SUPPORTED_FOR_OP:  u64 = 7;
    const E_TRIBE_STORE_PRIVATE:        u64 = 8;
    const E_WRONG_SSU:                  u64 = 9;
    // V35 SA-04: tribe identity assert.
    const E_WRONG_TRIBE:                u64 = 10;
    // Phase 5 C-A1: NoTribe path must reject an Easy/Advanced SSU.
    const E_WRONG_BAZAAR_TYPE:          u64 = 11;
    // Phase 4 (EFP) — WTB direct deposit new error codes
    const E_RECIPIENT_NOT_SHOP_OWNER:   u64 = 16;
    const E_ITEM_QUANTITY_MISMATCH:     u64 = 17;
    const TX_WTB:                       u8  = 1;

    // ===== WTB Fill — NoTribe =====
    public fun wtb_fill_notribe(
        registry: &mut BazarRegistry,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        ssu_gov: &mut SSUGovernance,
        admin: &BazaarCoreAdmin,
        dapp_tax_wallet: &mut DAppTaxWallet,
        dapp_config: &GovernanceConfig,
        member_registry: &MemberRegistry,
        ssu: &mut StorageUnit,
        items: vector<Item>,
        recipient_character: &Character,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        // Phase 4: recipient assert fires FIRST, before any state mutation (SA-EFP4-01 / synthesis §2)
        assert!(
            world::character::character_address(recipient_character) == bazar::shop_owner(shop),
            E_RECIPIENT_NOT_SHOP_OWNER,
        );
        ssu_governance::assert_not_frozen(ssu_gov);
        ssu_governance::assert_active(ssu_gov);
        // Phase 5 C-A1: NoTribe path rejects Easy/Advanced SSUs.
        // Symmetric to assert_easy_or_advanced in wtb_fill_tribe (:165).
        assert!(ssu_governance::ssu_bazaar_type(ssu_gov) == 0, E_WRONG_BAZAAR_TYPE);
        ssu_governance::assert_subject_in_governance(ssu_gov, bazar::shop_ssu_id(shop));
        // B1.1 (AUD-NT-08/09): SSU membership ban + timed-ban.
        assert!(!membership::is_banned(member_registry, ctx.sender()), E_PLAYER_BANNED);
        assert!(!ssu_governance::is_banned(ssu_gov, ctx.sender(), clock), E_PLAYER_BANNED);
        assert!(quantity > 0, E_ZERO_QUANTITY);
        assert!(bazar::shop_is_active(shop), E_SHOP_NOT_ACTIVE);
        // V38 split: borrow the ShopOpsCap once after auth, before any wrapped fund call.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let listing      = shop_ops_guarded::get_listing_g(shop, listing_idx, cap);
        assert!(bazar::listing_quantity(listing) >= quantity, E_LISTING_SOLD_OUT);
        // Phase 4: sum-guard BEFORE any state mutation — SA-EFP4-01 fail-fast hygiene
        let mut total_qty: u64 = 0;
        let mut i = 0;
        let n = vector::length(&items);
        while (i < n) {
            total_qty = total_qty + (world::inventory::quantity(vector::borrow(&items, i)) as u64);
            i = i + 1;
        };
        assert!(total_qty == quantity, E_ITEM_QUANTITY_MISMATCH);
        let gross        = bazar::listing_price_eve(listing) * quantity;
        // Session 3B: per-role tax lookup keyed on filler's SSU role
        // (the filler — ctx.sender() — is the taxed party in WTB; they receive
        // EVE from escrow minus tax). ssu_role_of returns 0 for non-members.
        let filler_ssu_role = membership::ssu_role_of(member_registry, ctx.sender());
        let ssu_bps      = ssu_role_tax_admin::ssu_wtb_pct_for_role(ssu_gov, filler_ssu_role);
        let dapp_bps     = dapp_governance::notribe_dapp_tax_bps(dapp_config);
        let (ssu_tax, _tribe_tax, dapp_tax, net) = shop_ops_guarded::compute_taxes_g(gross, ssu_bps, 0, dapp_bps, cap);
        // Phase 5 (EFP): surcharge release — pool was prepaid gross + total_tax at create time.
        // Release gross + ssu_tax + dapp_tax; after splitting tax coins, residual payout == gross.
        let release_amount = gross + ssu_tax + dapp_tax;
        let filler       = ctx.sender();
        let buyer        = bazar::shop_owner(shop);
        let ssu_id       = bazar::shop_ssu_id(shop);
        let tribe_id     = bazar::shop_tribe_id(shop);
        let bt           = bazar::shop_bazaar_type(shop);
        let shop_id      = object::id(shop);
        // V13 fix: prepay lives in Shop.escrowed_eve (per create_wtb_shop), NOT in WtbEscrowPool.
        // Pre-V13 this called wtb_escrow_pool::release_to_seller which always aborted because
        // the pool was never funded (top_up_escrow has no FE caller). Drain from where the
        // money actually is — atomic with the rest of the fill TX.
        let mut payout   = shop_ops_guarded::withdraw_escrowed_eve_g(shop, release_amount, cap, ctx);
        let ssu_coin     = coin::split(&mut payout, ssu_tax, ctx);
        let dapp_coin    = coin::split(&mut payout, dapp_tax, ctx);
        // Phase 5 (EFP): payout residual is exactly gross — filler receives full listed price.
        let filler_coin  = payout;
        shop_ops_guarded::deposit_ssu_tax_g(ssu_gov, ssu_coin, cap);
        shop_ops_guarded::safe_deposit_dapp_tax_g(
            admin, dapp_tax_wallet, dapp_coin, b"wtb_fill", b"notribe",
            ssu_id, tribe_id, filler, buyer, gross, ssu_tax, 0, net, clock, cap,
        );
        transfer::public_transfer(filler_coin, filler);
        // GAS-01: capture post-decrement listing qty for the drain short-circuit hint.
        // Note: escrowed_eve is partially drained by release_amount (gross+taxes), NOT
        // to zero in a single fill. The unconditional eve check in is_shop_drained handles
        // the "still funded" case correctly regardless of this hint value.
        let touched_remaining = shop_ops_guarded::decrement_listing_g(shop, listing_idx, quantity, cap);
        // DC-M2: user_storage::store_purchased_items(...) — DELETED (Phase 4 WTB direct deposit)
        // Phase 4: deposit loop — per-iteration BazarAuth mint (BazarAuth: drop, consumed by-value each call)
        let mut items = items;
        while (!vector::is_empty(&items)) {
            let item = vector::pop_back(&mut items);
            world::storage_unit::deposit_to_owned<BazarAuth>(
                ssu,
                recipient_character,
                item,
                bazar::new_bazar_auth(),
                ctx,
            );
        };
        vector::destroy_empty(items);
        shop_ops_guarded::emit_purchase_event_g(shop_ops_guarded::new_purchase_event_g(
            TX_WTB, bt,
            shop_id, listing_idx, quantity,
            filler, buyer, ssu_id, tribe_id,
            gross, ssu_tax, 0, dapp_tax, net,
            clock.timestamp_ms(), cap,
        ), cap);
        // Wave 3 W3-6: auto-deactivate when listings + escrowed_eve drained; GAS-01: hint.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining);
    }

    // ===== WTB Fill — Tribe =====
    public fun wtb_fill_tribe(
        registry: &mut BazarRegistry,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        ssu_gov: &mut SSUGovernance,
        tribe_gov: &mut TribeGovernance,
        admin: &BazaarCoreAdmin,
        dapp_tax_wallet: &mut DAppTaxWallet,
        dapp_config: &GovernanceConfig,
        member_registry: &MemberRegistry,
        ssu: &mut StorageUnit,
        items: vector<Item>,
        recipient_character: &Character,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        // Phase 4: recipient assert fires FIRST, before any state mutation (SA-EFP4-01 / synthesis §2)
        assert!(
            world::character::character_address(recipient_character) == bazar::shop_owner(shop),
            E_RECIPIENT_NOT_SHOP_OWNER,
        );
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
        assert!(
            tribe_governance::tribe_id(tribe_gov) == bazar::shop_tribe_id(shop),
            E_WRONG_TRIBE,
        );
        // B1.6 (AUD-ET-14): deactivated tribe halts WTB fill.
        // V38 split: public twin (tribe_lifecycle's assert_tribe_active is package-private).
        tribe_governance::assert_tribe_active(tribe_gov);
        // V35: clock-aware ban check.
        assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, ctx.sender(), clock), E_PLAYER_BANNED);
        // B1.1 (AUD-ET-13): SSU membership ban + timed-ban on Easy path.
        assert!(!membership::is_banned(member_registry, ctx.sender()), E_PLAYER_BANNED);
        assert!(!ssu_governance::is_banned(ssu_gov, ctx.sender(), clock), E_PLAYER_BANNED);
        // R6.7.6 OS-49a: cross-SSU MemberRegistry binding (UNCONDITIONAL).
        assert!(
            membership::ssu_id(member_registry) == bazar::shop_ssu_id(shop),
            E_WRONG_SSU,
        );
        // R6.7.6 OS-49a: buyer membership gate (CONDITIONAL).
        // WTB: the filler (ctx.sender()) is the seller; the buyer is shop_owner.
        // Gate applies to filler — only filler needs to be a member to fill a private WTB shop.
        if (tribe_governance::store_visibility(tribe_gov) == 1) {
            assert!(membership::is_member(member_registry, ctx.sender()), E_TRIBE_STORE_PRIVATE);
        };
        let listing      = shop_ops_guarded::get_listing_g(shop, listing_idx, cap);
        assert!(bazar::listing_quantity(listing) >= quantity, E_LISTING_SOLD_OUT);
        // Phase 4: sum-guard BEFORE any state mutation — SA-EFP4-01 fail-fast hygiene
        let mut total_qty: u64 = 0;
        let mut i = 0;
        let n = vector::length(&items);
        while (i < n) {
            total_qty = total_qty + (world::inventory::quantity(vector::borrow(&items, i)) as u64);
            i = i + 1;
        };
        assert!(total_qty == quantity, E_ITEM_QUANTITY_MISMATCH);
        let gross        = bazar::listing_price_eve(listing) * quantity;
        // Session 3B: per-role lookup keyed on filler's SSU + Tribe roles
        // (filler = ctx.sender() = taxed party in WTB).
        let filler_ssu_role   = membership::ssu_role_of(member_registry, ctx.sender());
        let filler_tribe_role = membership::tribe_role_of(member_registry, ctx.sender());
        let ssu_bps      = ssu_role_tax_admin::ssu_wtb_pct_for_role(ssu_gov, filler_ssu_role);
        let tribe_bps    = tribe_role_tax_admin::tribe_wtb_pct_for_role(tribe_gov, filler_tribe_role);
        let dapp_bps     = dapp_governance::easy_dapp_tax_bps(dapp_config);
        let (ssu_tax, tribe_tax, dapp_tax, net) = shop_ops_guarded::compute_taxes_g(gross, ssu_bps, tribe_bps, dapp_bps, cap);
        // Phase 5 (EFP): surcharge release — pool was prepaid gross + total_tax at create time.
        // Release gross + ssu_tax + tribe_tax + dapp_tax; residual payout after splits == gross.
        let release_amount = gross + ssu_tax + tribe_tax + dapp_tax;
        let filler       = ctx.sender();
        let buyer        = bazar::shop_owner(shop);
        let ssu_id       = bazar::shop_ssu_id(shop);
        let tribe_id     = bazar::shop_tribe_id(shop);
        let bt           = bazar::shop_bazaar_type(shop);
        let shop_id      = object::id(shop);
        // V13 fix: drain prepay from Shop.escrowed_eve (where create_wtb_shop puts it),
        // not from WtbEscrowPool (which was never funded — see notribe variant comment).
        let mut payout   = shop_ops_guarded::withdraw_escrowed_eve_g(shop, release_amount, cap, ctx);
        let ssu_coin     = coin::split(&mut payout, ssu_tax, ctx);
        let tribe_coin   = coin::split(&mut payout, tribe_tax, ctx);
        let dapp_coin    = coin::split(&mut payout, dapp_tax, ctx);
        // Phase 5 (EFP): payout residual is exactly gross — filler receives full listed price.
        let filler_coin  = payout;
        shop_ops_guarded::deposit_ssu_tax_g(ssu_gov, ssu_coin, cap);
        shop_ops_guarded::deposit_tribe_tax_g(tribe_gov, tribe_coin, cap);
        shop_ops_guarded::safe_deposit_dapp_tax_g(
            admin, dapp_tax_wallet, dapp_coin, b"wtb_fill", b"easy",
            ssu_id, tribe_id, filler, buyer, gross, ssu_tax, tribe_tax, net, clock, cap,
        );
        transfer::public_transfer(filler_coin, filler);
        // GAS-01: capture post-decrement listing qty for the drain short-circuit hint.
        let touched_remaining = shop_ops_guarded::decrement_listing_g(shop, listing_idx, quantity, cap);
        // DC-M2: user_storage::store_purchased_items(...) — DELETED (Phase 4 WTB direct deposit)
        // Phase 4: deposit loop — per-iteration BazarAuth mint (BazarAuth: drop, consumed by-value each call)
        let mut items = items;
        while (!vector::is_empty(&items)) {
            let item = vector::pop_back(&mut items);
            world::storage_unit::deposit_to_owned<BazarAuth>(
                ssu,
                recipient_character,
                item,
                bazar::new_bazar_auth(),
                ctx,
            );
        };
        vector::destroy_empty(items);
        shop_ops_guarded::emit_purchase_event_g(shop_ops_guarded::new_purchase_event_g(
            TX_WTB, bt,
            shop_id, listing_idx, quantity,
            filler, buyer, ssu_id, tribe_id,
            gross, ssu_tax, tribe_tax, dapp_tax, net,
            clock.timestamp_ms(), cap,
        ), cap);
        // Wave 3 W3-6: auto-deactivate when listings + escrowed_eve drained; GAS-01: hint.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining);
    }

    // ===== Test-Only Accessors =====

    /// Re-export E_RECIPIENT_NOT_SHOP_OWNER for cross-module value-equality assertion (test #19).
    #[test_only]
    public fun e_recipient_not_shop_owner_for_testing(): u64 { E_RECIPIENT_NOT_SHOP_OWNER }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
