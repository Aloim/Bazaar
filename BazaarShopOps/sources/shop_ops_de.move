// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_shop_ops::shop_ops_de {
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use EVE::EVE::EVE;
    use bazaar_core::bazar::{Self, BazarRegistry, Shop};
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
    use bazaar_core::bazaar_core_admin::ShopOpsCap;
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
    // V35 SA-04: tribe identity assert.
    const E_WRONG_TRIBE:                u64 = 10;
    // Phase 5 C-A1: NoTribe path must reject an Easy/Advanced SSU.
    const E_WRONG_BAZAAR_TYPE:          u64 = 11;
    const TX_DE:                        u8  = 2;
    const TX_FREE:                      u8  = 3;

    // ===== DE Exchange — NoTribe =====
    public fun de_exchange_notribe(
        registry: &mut BazarRegistry,
        shop_id: ID,
        pair_idx: u64,
        units: u64,                       // V31 partial DE: # offered items taken
        de_fee_payment: Coin<EVE>,
        ssu_gov: &mut SSUGovernance,
        admin: &BazaarCoreAdmin,
        dapp_tax_wallet: &mut DAppTaxWallet,
        dapp_config: &GovernanceConfig,
        member_registry: &MemberRegistry,
        _storage: &mut UserStorage,        // V31: retained for ABI stability; offered
                                           // payout is FE-side (Open Storage), no claim
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        ssu_governance::assert_not_frozen(ssu_gov);
        ssu_governance::assert_active(ssu_gov);
        // Phase 5 C-A1: NoTribe path rejects Easy/Advanced SSUs.
        // Symmetric to assert_easy_or_advanced in de_exchange_tribe (:123).
        assert!(ssu_governance::ssu_bazaar_type(ssu_gov) == 0, E_WRONG_BAZAAR_TYPE);
        ssu_governance::assert_subject_in_governance(ssu_gov, bazar::shop_ssu_id(shop));
        // B1.1 (AUD-NT-08/09): SSU membership ban + timed-ban.
        // GAS-04: single MemberRegistry borrow for static is_banned + ssu_role.
        let (buyer_ssu_role, _tribe_role, member_banned) = membership::roles_of(member_registry, ctx.sender()); // GAS-04
        assert!(!member_banned, E_PLAYER_BANNED);                                                               // GAS-04
        assert!(!ssu_governance::is_banned(ssu_gov, ctx.sender(), clock), E_PLAYER_BANNED);
        assert!(bazar::shop_is_active(shop), E_SHOP_NOT_ACTIVE);
        assert!(units > 0, E_ZERO_QUANTITY);
        // V38 split: borrow the ShopOpsCap once after auth, before any wrapped fund call.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        // GAS-04: combined RoleTaxConfig accessor; de_flat_fee field; scale by units.
        let ssu_flat     = role_tax_types::de_flat_fee(&ssu_role_tax_admin::ssu_role_tax(ssu_gov, buyer_ssu_role)) * units; // GAS-04
        let gross        = coin::value(&de_fee_payment);
        assert!(gross >= ssu_flat, E_INSUFFICIENT_PAYMENT);
        let dapp_bps     = dapp_governance::notribe_dapp_tax_bps(dapp_config);
        // AUD-NT-01: u128-widen for overflow safety at large flat fees.
        let dapp_tax     = (((ssu_flat as u128) * (dapp_bps as u128)) / 10000u128) as u64;
        let net_ssu      = ssu_flat - dapp_tax;
        let buyer        = ctx.sender();
        let ssu_id       = bazar::shop_ssu_id(shop);
        let tribe_id     = bazar::shop_tribe_id(shop);
        let bt           = bazar::shop_bazaar_type(shop);
        let shop_id      = object::id(shop);
        let mut fee      = de_fee_payment;
        let dapp_coin    = coin::split(&mut fee, dapp_tax, ctx);
        let ssu_coin     = coin::split(&mut fee, net_ssu, ctx);
        if (coin::value(&fee) > 0) {
            transfer::public_transfer(fee, buyer);
        } else {
            coin::destroy_zero(fee);
        };
        shop_ops_guarded::deposit_ssu_tax_g(ssu_gov, ssu_coin, cap);
        shop_ops_guarded::safe_deposit_dapp_tax_g(
            admin, dapp_tax_wallet, dapp_coin, b"de_exchange", b"notribe",
            ssu_id, tribe_id, buyer, buyer, ssu_flat, net_ssu, 0, 0, clock, cap,
        );
        // V31 partial DE: decrement the pair's remaining offered stock by `units`
        // (the offered items themselves are paid out FE-side from Open Storage).
        // GAS-01: capture post-decrement pair offer_qty for the drain short-circuit hint.
        let touched_remaining = shop_ops_guarded::decrement_pair_offer_g(shop, pair_idx, units, cap);
        shop_ops_guarded::emit_purchase_event_g(shop_ops_guarded::new_purchase_event_g(
            TX_DE, bt,
            shop_id, pair_idx, units,
            buyer, buyer, ssu_id, tribe_id,
            ssu_flat, net_ssu, 0, dapp_tax, 0,
            clock.timestamp_ms(), cap,
        ), cap);
        // Wave 3 W3-6: auto-deactivate fully-drained DE shops; GAS-01: hint.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining);
    }

    // ===== DE Exchange — Tribe =====
    public fun de_exchange_tribe(
        registry: &mut BazarRegistry,
        shop_id: ID,
        pair_idx: u64,
        units: u64,                       // V31 partial DE: # offered items taken
        de_fee_payment: Coin<EVE>,
        ssu_gov: &mut SSUGovernance,
        tribe_gov: &mut TribeGovernance,
        admin: &BazaarCoreAdmin,
        dapp_tax_wallet: &mut DAppTaxWallet,
        dapp_config: &GovernanceConfig,
        member_registry: &MemberRegistry,
        _storage: &mut UserStorage,        // V31: retained for ABI stability; offered
                                           // payout is FE-side (Open Storage), no claim
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
        assert!(bazar::shop_is_active(shop), E_SHOP_NOT_ACTIVE);
        assert!(units > 0, E_ZERO_QUANTITY);
        // V35 SA-04: assert supplied tribe_gov matches the shop's recorded tribe_id.
        assert!(
            tribe_governance::tribe_id(tribe_gov) == bazar::shop_tribe_id(shop),
            E_WRONG_TRIBE,
        );
        // B1.6 (AUD-ET-14): deactivated tribe halts DE exchange.
        // V38 split: public twin (tribe_lifecycle's assert_tribe_active is package-private).
        tribe_governance::assert_tribe_active(tribe_gov);
        // V35: clock-aware ban check.
        assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, ctx.sender(), clock), E_PLAYER_BANNED);
        // B1.1 (AUD-ET-13): SSU membership ban + timed-ban on Easy path.
        // GAS-04: single MemberRegistry borrow for static is_banned + both role fields.
        let (buyer_ssu_role, buyer_tribe_role, member_banned) = membership::roles_of(member_registry, ctx.sender()); // GAS-04
        assert!(!member_banned, E_PLAYER_BANNED);                                                                    // GAS-04
        assert!(!ssu_governance::is_banned(ssu_gov, ctx.sender(), clock), E_PLAYER_BANNED);
        // R6.7.6 OS-49a: cross-SSU MemberRegistry binding (UNCONDITIONAL).
        assert!(
            membership::ssu_id(member_registry) == bazar::shop_ssu_id(shop),
            E_WRONG_SSU,
        );
        // R6.7.6 OS-49a: buyer membership gate (CONDITIONAL).
        // DE buyer is ctx.sender(); membership check applies to the exchanger.
        if (tribe_governance::store_visibility(tribe_gov) == 1) {
            assert!(membership::is_member(member_registry, ctx.sender()), E_TRIBE_STORE_PRIVATE);
        };
        // GAS-04: combined RoleTaxConfig accessors — one borrow per governance object; scale by units.
        let ssu_flat   = role_tax_types::de_flat_fee(&ssu_role_tax_admin::ssu_role_tax(ssu_gov, buyer_ssu_role)) * units;     // GAS-04
        let tribe_flat = role_tax_types::de_flat_fee(&tribe_role_tax_admin::tribe_role_tax(tribe_gov, buyer_tribe_role)) * units; // GAS-04
        let total_flat   = ssu_flat + tribe_flat;
        assert!(coin::value(&de_fee_payment) >= total_flat, E_INSUFFICIENT_PAYMENT);
        let dapp_bps     = dapp_governance::easy_dapp_tax_bps(dapp_config);
        // AUD-ET-02: per-layer nets first so dapp_tax = exact remainder.
        // Guarantees net_ssu + net_tribe + dapp_tax == total_flat regardless of rounding.
        // AUD-NT-01: u128 widening throughout.
        let net_ssu      = (((ssu_flat  as u128) * (10000u128 - (dapp_bps as u128))) / 10000u128) as u64;
        let net_tribe    = (((tribe_flat as u128) * (10000u128 - (dapp_bps as u128))) / 10000u128) as u64;
        let dapp_tax     = total_flat - net_ssu - net_tribe;
        let buyer        = ctx.sender();
        let ssu_id       = bazar::shop_ssu_id(shop);
        let tribe_id     = bazar::shop_tribe_id(shop);
        let bt           = bazar::shop_bazaar_type(shop);
        let shop_id      = object::id(shop);
        let mut fee      = de_fee_payment;
        let dapp_coin    = coin::split(&mut fee, dapp_tax, ctx);
        let ssu_coin     = coin::split(&mut fee, net_ssu, ctx);
        let tribe_coin   = coin::split(&mut fee, net_tribe, ctx);
        if (coin::value(&fee) > 0) {
            transfer::public_transfer(fee, buyer);
        } else {
            coin::destroy_zero(fee);
        };
        shop_ops_guarded::deposit_ssu_tax_g(ssu_gov, ssu_coin, cap);
        shop_ops_guarded::deposit_tribe_tax_g(tribe_gov, tribe_coin, cap);
        shop_ops_guarded::safe_deposit_dapp_tax_g(
            admin, dapp_tax_wallet, dapp_coin, b"de_exchange", b"easy",
            ssu_id, tribe_id, buyer, buyer, total_flat, net_ssu, net_tribe, 0, clock, cap,
        );
        // V31 partial DE: decrement the pair's remaining offered stock by `units`
        // (the offered items themselves are paid out FE-side from Open Storage).
        // GAS-01: capture post-decrement pair offer_qty for the drain short-circuit hint.
        let touched_remaining = shop_ops_guarded::decrement_pair_offer_g(shop, pair_idx, units, cap);
        shop_ops_guarded::emit_purchase_event_g(shop_ops_guarded::new_purchase_event_g(
            TX_DE, bt,
            shop_id, pair_idx, units,
            buyer, buyer, ssu_id, tribe_id,
            total_flat, net_ssu, net_tribe, dapp_tax, 0,
            clock.timestamp_ms(), cap,
        ), cap);
        // Wave 3 W3-6: auto-deactivate fully-drained DE shops; GAS-01: hint.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining);
    }

    // ===== Free-claim shared payout helpers =====
    // R-B size-recovery: the EVE-coin and item giveaway bodies are shared by the NoTribe and
    // Easy (`_tribe`) variants so the tribe split adds only gates, not a duplicated body. The
    // caller runs the bazaar-type/ban gates first and `auto_deactivate_if_drained` after (it
    // needs &mut BazarRegistry, which would alias the &mut Shop these helpers hold).

    /// EVE coin-giveaway payout: single-claim guard, pool checks, withdraw → transfer, record,
    /// PurchaseEvent.
    fun do_coin_claim_payout(
        shop: &mut Shop, shop_id: ID, claimer: address, cap: &ShopOpsCap, clock: &Clock, ctx: &mut TxContext,
    ) {
        assert!(!bazar::has_coin_claimed(shop, claimer), 22);  // bazar::E_ALREADY_CLAIMED_COIN
        let claim_amount = bazar::shop_coin_claim_amount(shop);
        assert!(claim_amount > 0, 23);  // bazar::E_FREE_COIN_INSUFFICIENT_POOL
        assert!(shop_ops_guarded::escrowed_eve_value_g(shop, cap) >= claim_amount, 23);
        let payout = shop_ops_guarded::withdraw_escrowed_eve_g(shop, claim_amount, cap, ctx);
        sui::transfer::public_transfer(payout, claimer);
        bazar::record_coin_claim(shop, claimer);
        shop_ops_guarded::emit_purchase_event_g(shop_ops_guarded::new_purchase_event_g(
            TX_FREE, bazar::shop_bazaar_type(shop),
            shop_id, 0, 0,
            claimer, bazar::shop_owner(shop),
            bazar::shop_ssu_id(shop), bazar::shop_tribe_id(shop),
            claim_amount, 0, 0, 0, 0,
            clock.timestamp_ms(), cap,
        ), cap);
    }

    /// GAS-01: returns post-decrement listing qty so free_claim / free_claim_tribe
    /// can pass it to auto_deactivate_if_drained as the touched_remaining hint.
    fun do_item_claim_payout(
        shop: &mut Shop, member_registry: &MemberRegistry, storage: &mut UserStorage,
        listing_idx: u64, quantity: u64, cap: &ShopOpsCap, clock: &Clock, ctx: &mut TxContext,
    ): u64 {
        let listing      = shop_ops_guarded::get_listing_g(shop, listing_idx, cap);
        assert!(bazar::listing_quantity(listing) >= quantity, E_LISTING_SOLD_OUT);
        let item_type_id = bazar::listing_item_type_id(listing);
        let buyer        = ctx.sender();
        let shop_id      = object::id(shop);
        shop_ops_guarded::store_purchased_items_g(
            storage, member_registry, buyer, item_type_id, quantity,
            option::some(shop_id), clock, cap, ctx,
        );
        // GAS-01: capture post-decrement qty to surface as the drain hint.
        let touched_remaining = shop_ops_guarded::decrement_listing_g(shop, listing_idx, quantity, cap);
        shop_ops_guarded::emit_purchase_event_g(shop_ops_guarded::new_purchase_event_g(
            TX_FREE, bazar::shop_bazaar_type(shop),
            shop_id, listing_idx, quantity,
            buyer, bazar::shop_owner(shop),
            bazar::shop_ssu_id(shop), bazar::shop_tribe_id(shop),
            0, 0, 0, 0, 0,
            clock.timestamp_ms(), cap,
        ), cap);
        touched_remaining
    }

    /// Shared Easy (`_tribe`) FREE-claim gate: bazaar-type, freeze, SSU/tribe identity bindings,
    /// tribe-active, and the 3-layer ban check (tribe-global + membership + SSU timed). Shared by
    /// both Easy FREE entries so the tribe split adds gates once, not per-entry (R-B size).
    fun assert_easy_free_claim_gates(
        shop: &Shop, gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        member_registry: &MemberRegistry, cap: &ShopOpsCap, clock: &Clock, ctx: &TxContext,
    ) {
        shop_ops_guarded::assert_easy_or_advanced_g(ssu_governance::ssu_bazaar_type(gov), cap);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_subject_in_governance(gov, bazar::shop_ssu_id(shop));
        // Supplied tribe_gov must match the shop's recorded tribe (anti-ban-bypass, SA-04).
        assert!(tribe_governance::tribe_id(tribe_gov) == bazar::shop_tribe_id(shop), E_WRONG_TRIBE);
        assert!(bazar::shop_is_active(shop), E_SHOP_NOT_ACTIVE);
        // Cross-SSU MemberRegistry binding — the ban check must read the shop's own registry.
        assert!(membership::ssu_id(member_registry) == bazar::shop_ssu_id(shop), E_WRONG_SSU);
        // V38 split: public twin (tribe_lifecycle's assert_tribe_active is package-private).
        tribe_governance::assert_tribe_active(tribe_gov);
        let s = ctx.sender();
        assert!(!tribe_governance::tribe_is_globally_banned(tribe_gov, s, clock), E_PLAYER_BANNED);
        assert!(!membership::is_banned(member_registry, s), E_PLAYER_BANNED);
        assert!(!ssu_governance::is_banned(gov, s, clock), E_PLAYER_BANNED);
    }

    // ===== Free Coin Claim (V25) =====

    /// V25 — Claim the fixed coin-giveaway amount from a FREE shop. Each
    /// wallet may claim exactly once (anti-double-claim via `coin_claimers`
    /// vector on the Shop record).
    ///
    /// Auth: SSU not frozen, ssu_id matches shop, shop active, sender not
    /// banned. No role gate yet — V25 ships flat per-wallet eligibility; the
    /// `allowed_roles` enforcement is deferred to a follow-up.
    ///
    /// Aborts:
    ///   E_SHOP_NOT_ACTIVE / E_PLAYER_BANNED / E_WRONG_SSU — standard guards
    ///   bazar::E_ALREADY_CLAIMED_COIN (22) — sender already in coin_claimers
    ///   bazar::E_FREE_COIN_INSUFFICIENT_POOL (23) — claim amount is 0 OR
    ///       shop's escrowed_eve has been drained below claim_amount.
    public entry fun free_coin_claim(
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        member_registry: &MemberRegistry,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let claimer = ctx.sender();
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_subject_in_governance(gov, bazar::shop_ssu_id(shop));
        // R-B: NoTribe entry rejects Easy/Advanced SSUs — Easy FREE coin-claims must route to
        // free_coin_claim_tribe so the tribe-global ban is enforced. Symmetric to wts_buy_notribe.
        assert!(ssu_governance::ssu_bazaar_type(gov) == 0, E_WRONG_BAZAAR_TYPE);
        assert!(bazar::shop_is_active(shop), E_SHOP_NOT_ACTIVE);
        assert!(!membership::is_banned(member_registry, claimer), E_PLAYER_BANNED);
        // B1.1: add V35 timed-ban enforcement — governor and clock already in scope.
        assert!(!ssu_governance::is_banned(gov, claimer, clock), E_PLAYER_BANNED);
        // V38 split: borrow the ShopOpsCap once after auth, before the wrapped payout.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        do_coin_claim_payout(shop, shop_id, claimer, cap, clock, ctx);
        // Wave 3 W3-6: auto-deactivate when claim pool fully drains.
        // GAS-01: coin-claim touches no listing → pass 0 to force the full scan.
        // The unconditional escrowed_eve check is the drain signal for this path.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, 0);
    }

    // ===== Free Claim =====
    public fun free_claim(
        registry: &mut BazarRegistry,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        gov: &SSUGovernance,
        member_registry: &MemberRegistry,
        storage: &mut UserStorage,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_subject_in_governance(gov, bazar::shop_ssu_id(shop));
        // R-B: NoTribe entry rejects Easy/Advanced SSUs — Easy FREE item-claims must route to
        // free_claim_tribe so the tribe-global ban is enforced. Symmetric to wts_buy_notribe.
        assert!(ssu_governance::ssu_bazaar_type(gov) == 0, E_WRONG_BAZAAR_TYPE);
        assert!(quantity > 0, E_ZERO_QUANTITY);
        assert!(bazar::shop_is_active(shop), E_SHOP_NOT_ACTIVE);
        assert!(!membership::is_banned(member_registry, ctx.sender()), E_PLAYER_BANNED);
        // B1.1: V35 timed-ban enforcement — gov: &SSUGovernance and clock: &Clock already in scope.
        assert!(!ssu_governance::is_banned(gov, ctx.sender(), clock), E_PLAYER_BANNED);
        // V38 split: borrow the ShopOpsCap once after auth, before the wrapped payout.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        // GAS-01: do_item_claim_payout now returns the post-decrement listing qty.
        let touched_remaining = do_item_claim_payout(shop, member_registry, storage, listing_idx, quantity, cap, clock, ctx);
        // Wave 3 W3-6: auto-deactivate when all listings drained; GAS-01: hint.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining);
    }

    // ===== Free Coin Claim — Easy (tribe) variant =====

    /// R-B — Easy variant of `free_coin_claim`. Takes `tribe_gov` so it can enforce the
    /// tribe-active gate + tribe-global timed ban that the NoTribe entry (no TribeGovernance
    /// handle) cannot. FE routes Easy FREE coin-claims here; the NoTribe entry now asserts
    /// `ssu_bazaar_type == 0`. Mirrors the `wts_buy_notribe`/`wts_buy_tribe` split.
    public entry fun free_coin_claim_tribe(
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        member_registry: &MemberRegistry,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let claimer = ctx.sender();
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        // V38 split: borrow the ShopOpsCap up front — the gates include a wrapped assert.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        assert_easy_free_claim_gates(shop, gov, tribe_gov, member_registry, cap, clock, ctx);
        do_coin_claim_payout(shop, shop_id, claimer, cap, clock, ctx);
        // GAS-01: coin-claim touches no listing → 0 forces the full scan.
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, 0);
    }

    // ===== Free Claim — Easy (tribe) variant =====

    /// R-B — Easy variant of `free_claim` (item giveaway). Enforces the tribe-active gate +
    /// tribe-global ban via `tribe_gov`. FE routes Easy FREE item-claims here.
    public fun free_claim_tribe(
        registry: &mut BazarRegistry,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        member_registry: &MemberRegistry,
        storage: &mut UserStorage,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let shop = bazar::borrow_shop_mut(registry, shop_id);
        assert!(quantity > 0, E_ZERO_QUANTITY);
        // V38 split: borrow the ShopOpsCap up front — the gates include a wrapped assert.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        assert_easy_free_claim_gates(shop, gov, tribe_gov, member_registry, cap, clock, ctx);
        // GAS-01: capture post-decrement listing qty from the updated helper.
        let touched_remaining = do_item_claim_payout(shop, member_registry, storage, listing_idx, quantity, cap, clock, ctx);
        bazar_lifecycle::auto_deactivate_if_drained(registry, shop_id, clock, touched_remaining);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
