// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::bazar {
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use sui::dynamic_object_field as dof;
    use std::string::{Self, String};
    use EVE::EVE::EVE;
    use bazaar_core::membership::{Self, MemberRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazar_helpers;
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::bazar_listings::{Self, Listing, ExchangePair};

    // ===== Witness =====
    public struct BazarAuth has drop {}
    public fun new_bazar_auth(): BazarAuth { BazarAuth {} }
    // ===== Constants =====
    const BAZAAR_TYPE_NOTRIBE: u8 = 0;
    const BAZAAR_TYPE_EASY: u8 = 1;
    const BAZAAR_TYPE_ADVANCED: u8 = 2;
    const SHOP_WTS: u8 = 0;
    const SHOP_WTB: u8 = 1;
    const SHOP_DE: u8 = 2;
    const SHOP_FREE: u8 = 3;
    const TITLE_MAX: u64 = 20;

    // ===== Error Codes =====
    const E_TITLE_TOO_LONG: u64 = 1;
    const E_EMPTY_LISTINGS: u64 = 2;
    const E_NOT_SHOP_OWNER: u64 = 3;
    const E_SHOP_NOT_FOUND: u64 = 4;
    const E_SHOP_NOT_ACTIVE: u64 = 5;
    const E_INVALID_BAZAAR_TYPE: u64 = 6;
    const E_LENGTH_MISMATCH: u64 = 7;
    const E_LISTING_NOT_FOUND: u64 = 8;
    const E_PAIR_NOT_FOUND: u64 = 9;
    const E_INVALID_SHOP_KIND: u64 = 10;
    const E_WRONG_SSU: u64 = 11;
    const E_MAX_SHOPS_EXCEEDED: u64 = 12;  // R6.7.6 OS-35/OS-44: shop limit exceeded
    // EFP1: distinct from bazaar_assertions::E_BAZAAR_TYPE_MISMATCH (=3); that checks u8 type claim;
    // this checks FE-supplied bazaar_type agrees with SSUGovernance.bazaar_type.
    const E_BAZAAR_TYPE_MISMATCH: u64 = 13;
    // EFP1: FE-supplied tribe_id disagrees with SSUGovernance.tribe_id.
    const E_TRIBE_ID_MISMATCH: u64 = 14;
    // EFP1 Phase 8: shop position would fall within exclusion zone of an active shop on the same SSU.
    const E_SHOP_POSITION_OCCUPIED: u64 = 15;
    // EFP1 Phase 8: minimum Chebyshev distance between any two active shops on the same SSU.
    const EXCLUSION_ZONE_RADIUS: u64 = 3;
    const E_TOO_MANY_LISTINGS: u64 = 21; // TFP Phase 3.2 SA-312.a drain DoS guard; slot 17 reserved (shop_ops_wtb:35)
    const E_ALREADY_CLAIMED_COIN: u64 = 22;          // V25 — per-wallet single-claim
    const E_FREE_COIN_INSUFFICIENT_POOL: u64 = 23;   // V25 — claim > prepay or drained
    // V26 D8: codes 24+25 (E_FREE_SHOP_EMPTY / E_FREE_SHOP_WRONG_KIND_FOR_BAZAAR)
    // relocated to sibling module `bazar_free`; numeric values preserved.
    const MAX_SHOP_LISTINGS: u64 = 64;

    // ===== Structs =====
    public struct BazarRegistry has key {
        id: UID,
        shops: Table<ID, bool>,
        shop_count_by_type: vector<u64>,
        // R6.7.6 OS-35/OS-44: per-owner active shop counter for max_shops_override enforcement.
        shops_by_owner: Table<address, u64>,
        // GAS-08: per-SSU inline position index. Elements are ShopPosition; written at
        // register_shop and REMOVED (not flipped) at deactivate_shop_by_id.
        shops_by_ssu: Table<address, vector<ShopPosition>>,
    }

    public struct Shop has key, store {
        id: UID,
        owner: address,
        kind: u8,
        bazaar_type: u8,
        title: String,
        ssu_id: address,
        tribe_id: u64,
        listings: vector<Listing>,
        pairs: vector<ExchangePair>,
        escrowed_eve: Balance<EVE>,
        created_at_ms: u64,
        expiry_ms: u64,
        position_x: u64,   // EFP1 Phase 8 — Godot beacon grid X
        position_y: u64,   // EFP1 Phase 8 — Godot beacon grid Y
        is_active: bool,
        // V25 — FREE shop money-giveaway (EVE-only on NoTribe/Easy; reused
        // for tribe-token semantics on Advanced FREE shops in V26+). Always 0
        // / empty on non-FREE shops. On NoTribe/Easy the EVE pool lives in
        // `escrowed_eve`; on Advanced the tribe-token pool lives in the new
        // `tribe_token_pool` field below. `coin_claim_amount` is the fixed
        // per-claim amount: one wallet may claim it exactly once.
        coin_claim_amount: u64,
        coin_claimers: Table<address, bool>,
        // V26 — Advanced FREE shop tribe-token escrow. Scaled tribe-token
        // units pre-burned from the creator's ledger row at create time
        // (ledger_shop_ops::create_free_shop_advanced); minted to the claimer
        // on each call to free_token_claim_advanced. Always 0 on NoTribe/Easy
        // FREE shops and on every WTS/WTB/DE shop.
        tribe_token_pool: u64,
    }

    /// GAS-08: inline per-SSU shop position record — lets assert_shop_position_clear
    /// run the Chebyshev exclusion check WITHOUT DOF-borrowing each Shop object.
    /// Written at register_shop, REMOVED at deactivate_shop_by_id (never flipped in
    /// place in production). `active` exists only so the test-only inactive-flip path
    /// (set_shop_position_inactive_for_testing) can exercise the skip-inactive branch.
    public struct ShopPosition has store, drop {
        id: ID, x: u64, y: u64, active: bool,
    }

    // ===== Events =====
    public struct ShopCreatedEvent has copy, drop {
        shop_id: ID, owner: address, kind: u8, bazaar_type: u8,
        ssu_id: address, tribe_id: u64,
        position_x: u64,   // EFP1 Phase 8
        position_y: u64,   // EFP1 Phase 8
        timestamp_ms: u64,
    }
    public struct ShopClosedEvent has copy, drop {
        shop_id: ID, owner: address, bazaar_type: u8,
        ssu_id: address, tribe_id: u64, timestamp_ms: u64,
    }

    // ===== Init =====
    fun init(ctx: &mut TxContext) {
        transfer::share_object(BazarRegistry {
            id: object::new(ctx),
            shops: table::new(ctx),
            shop_count_by_type: vector[0u64, 0u64, 0u64],
            shops_by_owner: table::new(ctx),  // R6.7.6 OS-35/OS-44
            shops_by_ssu: table::new(ctx),     // EFP1 Phase 8
        });
    }

    // ===== Package-Internal Helpers (callable from sibling bazar_free) =====
    /// R6.7.6 OS-35+OS-44: Enforce per-owner shop limits. Role-limit (>0) > SSU override > unlimited.
    public(package) fun assert_shop_limit_ok(
        registry: &BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        owner: address,
    ) {
        let role         = membership::effective_role(members, owner);
        let role_limit   = ssu_governance::shop_limit_for_role(gov, role);
        let current      = shop_count_for_owner(registry, owner);
        let override_opt = ssu_governance::max_shops_override(gov);
        assert!(bazar_helpers::check_shop_limit(current, role_limit, override_opt), E_MAX_SHOPS_EXCEEDED);
    }

    /// B1.2 (AUD-ET-12): Tribe-level per-owner shop limit enforcement.
    /// Resolution order mirrors bazar_helpers::check_shop_limit:
    ///   1. tribe per-role limit (role_limit > 0): enforced.
    ///   2. tribe max_shops_override Some(n): enforced.
    ///   3. Neither set: no tribe cap (SSU-only backstop is sufficient).
    /// Called only from Easy create paths; NoTribe and Advanced bypass this check.
    public(package) fun assert_tribe_shop_limit_ok(
        registry: &BazarRegistry,
        tribe_gov: &TribeGovernance,
        members: &MemberRegistry,
        owner: address,
    ) {
        let role         = membership::effective_role(members, owner);
        let role_limit   = tribe_governance::tribe_shop_limit_for_role(tribe_gov, role);
        let current      = shop_count_for_owner(registry, owner);
        let override_opt = tribe_governance::tribe_max_shops_override(tribe_gov);
        assert!(bazar_helpers::check_shop_limit(current, role_limit, override_opt), E_MAX_SHOPS_EXCEEDED);
    }

    /// EFP1 Phase 1: Assert FE-supplied bazaar_type + tribe_id match SSU governance.
    public(package) fun assert_matches_gov(bazaar_type: u8, tribe_id: u64, gov: &SSUGovernance) {
        assert!(bazaar_type == ssu_governance::ssu_bazaar_type(gov), E_BAZAAR_TYPE_MISMATCH);
        assert!(tribe_id    == ssu_governance::ssu_tribe_id(gov),    E_TRIBE_ID_MISMATCH);
    }

    /// EFP1 Phase 8: assert (new_x, new_y) is at Chebyshev distance >= EXCLUSION_ZONE_RADIUS
    /// from every active shop on `ssu_id`. Inactive shops are skipped (no beacon → no collision).
    /// Inlined into bazar.move (vs. sibling module) to avoid intra-package cyclic import.
    public(package) fun assert_shop_position_clear(
        registry: &BazarRegistry, ssu_id: address, new_x: u64, new_y: u64,
    ) {
        // GAS-08: read inline ShopPosition records — no DOF borrow, no vector copy.
        if (!table::contains(&registry.shops_by_ssu, ssu_id)) return;
        let positions = table::borrow(&registry.shops_by_ssu, ssu_id);
        let n = vector::length(positions);
        let mut i = 0;
        while (i < n) {
            let p = vector::borrow(positions, i);
            if (p.active) {
                let dx = if (new_x > p.x) { new_x - p.x } else { p.x - new_x };
                let dy = if (new_y > p.y) { new_y - p.y } else { p.y - new_y };
                let cheb = if (dx > dy) { dx } else { dy };
                assert!(cheb >= EXCLUSION_ZONE_RADIUS, E_SHOP_POSITION_OCCUPIED);
            };
            i = i + 1;
        };
    }

    /// V26 D8: unified Shop factory shared by WTS / WTB / DE plus the sibling
    /// `bazar_free` module's FREE-shop entries. Keeps the Shop struct private
    /// to bazar.move while letting bazar_free construct instances.
    public(package) fun construct_shop(
        owner: address, kind: u8, bazaar_type: u8, title_str: String,
        ssu_id: address, tribe_id: u64,
        listings: vector<Listing>, pairs: vector<ExchangePair>,
        escrowed_eve: Balance<EVE>, now: u64, expiry_ms: u64,
        position_x: u64, position_y: u64,
        coin_claim_amount: u64, tribe_token_pool: u64,
        ctx: &mut TxContext,
    ): Shop {
        Shop {
            id: object::new(ctx), owner, kind, bazaar_type, title: title_str,
            ssu_id, tribe_id, listings, pairs, escrowed_eve,
            created_at_ms: now, expiry_ms, position_x, position_y,
            is_active: true,
            coin_claim_amount, coin_claimers: table::new(ctx),
            tribe_token_pool,
        }
    }

    public(package) fun register_shop(
        registry: &mut BazarRegistry, shop: Shop, kind: u8, bazaar_type: u8,
        owner: address, ssu_id: address, tribe_id: u64,
        position_x: u64, position_y: u64,   // EFP1 Phase 8
        now: u64,
    ): ID {
        let shop_id = object::id(&shop);
        table::add(&mut registry.shops, shop_id, true);
        let count = vector::borrow_mut(&mut registry.shop_count_by_type, (bazaar_type as u64));
        *count = *count + 1;
        // R6.7.6 OS-35/OS-44: increment per-owner active shop counter.
        if (table::contains(&registry.shops_by_owner, owner)) {
            *table::borrow_mut(&mut registry.shops_by_owner, owner) =
                *table::borrow(&registry.shops_by_owner, owner) + 1;
        } else {
            table::add(&mut registry.shops_by_owner, owner, 1);
        };
        // GAS-08: push inline ShopPosition (no DOF borrow needed at position-check time).
        let pos = ShopPosition { id: shop_id, x: position_x, y: position_y, active: true };
        if (table::contains(&registry.shops_by_ssu, ssu_id)) {
            vector::push_back(table::borrow_mut(&mut registry.shops_by_ssu, ssu_id), pos);
        } else {
            let mut v = vector::empty<ShopPosition>();
            vector::push_back(&mut v, pos);
            table::add(&mut registry.shops_by_ssu, ssu_id, v);
        };
        dof::add(&mut registry.id, shop_id, shop);
        event::emit(ShopCreatedEvent {
            shop_id, owner, kind, bazaar_type, ssu_id, tribe_id,
            position_x, position_y,   // EFP1 Phase 8
            timestamp_ms: now,
        });
        shop_id
    }

    // ===== Public Shop Creation =====
    // B1.2: demoted to public(package) — FE callers retarget to create_wts_shop_notribe /
    // create_wts_shop_easy. Only test code and sibling modules use this path directly.
    public(package) fun create_wts_shop(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,            // R3.5 NEW: freeze + identity guard
        members: &MemberRegistry,       // R6.7.6 OS-35/OS-44: shop limit enforcement
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64, item_type_ids: vector<u64>,
        quantities: vector<u64>, prices_eve: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,   // EFP1 Phase 8
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        ssu_governance::assert_not_frozen(gov);                   // R3.5
        ssu_governance::assert_active(gov);                        // R6.7.1 E_SSU_NOT_ACTIVE
        ssu_governance::assert_subject_in_governance(gov, ssu_id); // R3.5 SA-R3-01
        assert_matches_gov(bazaar_type, tribe_id, gov);             // EFP1 Phase 1
        let owner = tx_context::sender(ctx);
        assert_shop_limit_ok(registry, gov, members, owner);       // R6.7.6 OS-35/OS-44
        assert_shop_position_clear(registry, ssu_id, position_x, position_y);
        assert!(vector::length(&item_type_ids) <= MAX_SHOP_LISTINGS, E_TOO_MANY_LISTINGS); // TFP Phase 3.2
        let n = vector::length(&item_type_ids);
        let title_str = bazar_helpers::validate_shop_params(bazaar_type, &title, n);
        let listings = bazar_listings::build_listings(item_type_ids, quantities, prices_eve);
        let now = clock::timestamp_ms(clock);
        let shop = construct_shop(
            owner, SHOP_WTS, bazaar_type, title_str, ssu_id, tribe_id,
            listings, vector::empty(), balance::zero(),
            now, expiry_ms, position_x, position_y, 0, 0, ctx,
        );
        register_shop(registry, shop, SHOP_WTS, bazaar_type, owner, ssu_id, tribe_id, position_x, position_y, now)
    }

    /// B1.2 (AUD-ET-12): NoTribe WTS shop create entry. Asserts bazaar_type == 0 (AUD-DH-23
    /// pattern: rejects Easy/Advanced SSUs from the NoTribe entry path).
    public entry fun create_wts_shop_notribe(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        item_type_ids: vector<u64>,
        quantities: vector<u64>,
        prices_eve: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == BAZAAR_TYPE_NOTRIBE, E_BAZAAR_TYPE_MISMATCH);
        create_wts_shop(registry, gov, members, bazaar_type, title, ssu_id, tribe_id,
            item_type_ids, quantities, prices_eve, expiry_ms, position_x, position_y, clock, ctx)
    }

    /// B1.2 (AUD-ET-12): Easy WTS shop create entry with tribe shop-limit enforcement.
    /// Tribe-limit assert fires BEFORE the inner create (which asserts SSU limit).
    /// The bazaar_type == 1 guard prevents NoTribe/Advanced SSUs from routing here.
    public entry fun create_wts_shop_easy(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        members: &MemberRegistry,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        item_type_ids: vector<u64>,
        quantities: vector<u64>,
        prices_eve: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == BAZAAR_TYPE_EASY, E_BAZAAR_TYPE_MISMATCH);
        // B1.2: tribe shop-limit layer (authoritative — called before inner which checks SSU limit).
        assert_tribe_shop_limit_ok(registry, tribe_gov, members, ctx.sender());
        create_wts_shop(registry, gov, members, bazaar_type, title, ssu_id, tribe_id,
            item_type_ids, quantities, prices_eve, expiry_ms, position_x, position_y, clock, ctx)
    }

    /// B1.2: Advanced WTS shop create entry. Asserts ssu_bazaar_type == 2.
    /// Used by Advanced-SSU PTBs and cross-package Advanced tests.
    /// No tribe shop-limit check (Advanced uses token-ledger limits, not tribe governance limits).
    public entry fun create_wts_shop_advanced(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        item_type_ids: vector<u64>,
        quantities: vector<u64>,
        prices_eve: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == BAZAAR_TYPE_ADVANCED, E_BAZAAR_TYPE_MISMATCH);
        create_wts_shop(registry, gov, members, bazaar_type, title, ssu_id, tribe_id,
            item_type_ids, quantities, prices_eve, expiry_ms, position_x, position_y, clock, ctx)
    }

    // DELETED: public fun create_wtb_shop(...) — replaced by the three typed variants below.
    // B1.2: split eliminates the bypass path for tribe-bound Easy WTB shops.

    /// B1.2: NoTribe WTB shop create. Asserts ssu_bazaar_type == 0.
    public fun create_wtb_shop_notribe(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        item_type_ids: vector<u64>,
        quantities: vector<u64>,
        prices_eve: vector<u64>,
        members: &MemberRegistry,
        prepay: Coin<EVE>, expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == BAZAAR_TYPE_NOTRIBE, E_BAZAAR_TYPE_MISMATCH);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert_matches_gov(bazaar_type, tribe_id, gov);
        let owner = tx_context::sender(ctx);
        assert_shop_limit_ok(registry, gov, members, owner);
        assert_shop_position_clear(registry, ssu_id, position_x, position_y);
        assert!(vector::length(&item_type_ids) <= MAX_SHOP_LISTINGS, E_TOO_MANY_LISTINGS);
        let n = vector::length(&item_type_ids);
        let title_str = bazar_helpers::validate_shop_params(bazaar_type, &title, n);
        let listings = bazar_listings::build_listings(item_type_ids, quantities, prices_eve);
        let now = clock::timestamp_ms(clock);
        let shop = construct_shop(
            owner, SHOP_WTB, bazaar_type, title_str, ssu_id, tribe_id,
            listings, vector::empty(), coin::into_balance(prepay),
            now, expiry_ms, position_x, position_y, 0, 0, ctx,
        );
        register_shop(registry, shop, SHOP_WTB, bazaar_type, owner, ssu_id, tribe_id, position_x, position_y, now)
    }

    /// B1.2 (AUD-ET-12): Easy WTB shop create with tribe shop-limit enforcement.
    /// tribe_gov must match the SSU's registered tribe (asserted via assert_matches_gov -> tribe_id).
    public fun create_wtb_shop_easy(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        item_type_ids: vector<u64>,
        quantities: vector<u64>,
        prices_eve: vector<u64>,
        members: &MemberRegistry,
        prepay: Coin<EVE>, expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == BAZAAR_TYPE_EASY, E_BAZAAR_TYPE_MISMATCH);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert_matches_gov(bazaar_type, tribe_id, gov);
        let owner = tx_context::sender(ctx);
        // B1.2: tribe shop-limit layer (authoritative for Easy — called before SSU check).
        assert_tribe_shop_limit_ok(registry, tribe_gov, members, owner);
        assert_shop_limit_ok(registry, gov, members, owner);
        assert_shop_position_clear(registry, ssu_id, position_x, position_y);
        assert!(vector::length(&item_type_ids) <= MAX_SHOP_LISTINGS, E_TOO_MANY_LISTINGS);
        let n = vector::length(&item_type_ids);
        let title_str = bazar_helpers::validate_shop_params(bazaar_type, &title, n);
        let listings = bazar_listings::build_listings(item_type_ids, quantities, prices_eve);
        let now = clock::timestamp_ms(clock);
        let shop = construct_shop(
            owner, SHOP_WTB, bazaar_type, title_str, ssu_id, tribe_id,
            listings, vector::empty(), coin::into_balance(prepay),
            now, expiry_ms, position_x, position_y, 0, 0, ctx,
        );
        register_shop(registry, shop, SHOP_WTB, bazaar_type, owner, ssu_id, tribe_id, position_x, position_y, now)
    }

    /// B1.2: Advanced WTB shop create — used by bazaar_economy::wtb_pool_ops (cross-package).
    /// No tribe limit (Advanced uses tribe-token pool, not tribe governance shop limits).
    /// Asserts ssu_bazaar_type == 2 so Easy/NoTribe PTBs cannot route here.
    public fun create_wtb_shop_advanced_inner(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        item_type_ids: vector<u64>,
        quantities: vector<u64>,
        prices_eve: vector<u64>,
        members: &MemberRegistry,
        prepay: Coin<EVE>, expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == BAZAAR_TYPE_ADVANCED, E_BAZAAR_TYPE_MISMATCH);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        ssu_governance::assert_subject_in_governance(gov, ssu_id);
        assert_matches_gov(bazaar_type, tribe_id, gov);
        let owner = tx_context::sender(ctx);
        assert_shop_limit_ok(registry, gov, members, owner);
        assert_shop_position_clear(registry, ssu_id, position_x, position_y);
        assert!(vector::length(&item_type_ids) <= MAX_SHOP_LISTINGS, E_TOO_MANY_LISTINGS);
        let n = vector::length(&item_type_ids);
        let title_str = bazar_helpers::validate_shop_params(bazaar_type, &title, n);
        let listings = bazar_listings::build_listings(item_type_ids, quantities, prices_eve);
        let now = clock::timestamp_ms(clock);
        let shop = construct_shop(
            owner, SHOP_WTB, bazaar_type, title_str, ssu_id, tribe_id,
            listings, vector::empty(), coin::into_balance(prepay),
            now, expiry_ms, position_x, position_y, 0, 0, ctx,
        );
        register_shop(registry, shop, SHOP_WTB, bazaar_type, owner, ssu_id, tribe_id, position_x, position_y, now)
    }

    // B1.2: demoted to public(package) — FE callers retarget to create_de_shop_notribe /
    // create_de_shop_easy.
    public(package) fun create_de_shop(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,            // R3.5 NEW: freeze + identity guard
        members: &MemberRegistry,       // R6.7.6 OS-35/OS-44: shop limit enforcement
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        offer_item_type_ids: vector<u64>, offer_quantities: vector<u64>,
        request_item_type_ids: vector<u64>, request_quantities: vector<u64>,
        offer_per_lots: vector<u64>,        // bundle-ratio model: offered items per lot
        expiry_ms: u64,
        position_x: u64, position_y: u64,   // EFP1 Phase 8
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        ssu_governance::assert_not_frozen(gov);                   // R3.5
        ssu_governance::assert_active(gov);                        // R6.7.1 E_SSU_NOT_ACTIVE
        ssu_governance::assert_subject_in_governance(gov, ssu_id); // R3.5 SA-R3-01
        assert_matches_gov(bazaar_type, tribe_id, gov);             // EFP1 Phase 1
        let owner = tx_context::sender(ctx);
        assert_shop_limit_ok(registry, gov, members, owner);       // R6.7.6 OS-35/OS-44
        assert_shop_position_clear(registry, ssu_id, position_x, position_y);
        assert!(vector::length(&offer_item_type_ids) <= MAX_SHOP_LISTINGS, E_TOO_MANY_LISTINGS); // TFP Phase 3.2 SA-401
        assert!(vector::length(&request_item_type_ids) <= MAX_SHOP_LISTINGS, E_TOO_MANY_LISTINGS); // TFP Phase 3.2 SA-401
        let n = vector::length(&offer_item_type_ids);
        let title_str = bazar_helpers::validate_shop_params(bazaar_type, &title, n);
        let pairs = bazar_listings::build_pairs(offer_item_type_ids, offer_quantities, request_item_type_ids, request_quantities, offer_per_lots);
        let now = clock::timestamp_ms(clock);
        let shop = construct_shop(
            owner, SHOP_DE, bazaar_type, title_str, ssu_id, tribe_id,
            vector::empty(), pairs, balance::zero(),
            now, expiry_ms, position_x, position_y, 0, 0, ctx,
        );
        register_shop(registry, shop, SHOP_DE, bazaar_type, owner, ssu_id, tribe_id, position_x, position_y, now)
    }

    /// B1.2: NoTribe DE shop create entry. Asserts bazaar_type == 0.
    public entry fun create_de_shop_notribe(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        offer_item_type_ids: vector<u64>, offer_quantities: vector<u64>,
        request_item_type_ids: vector<u64>, request_quantities: vector<u64>,
        offer_per_lots: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == BAZAAR_TYPE_NOTRIBE, E_BAZAAR_TYPE_MISMATCH);
        create_de_shop(registry, gov, members, bazaar_type, title, ssu_id, tribe_id,
            offer_item_type_ids, offer_quantities, request_item_type_ids, request_quantities,
            offer_per_lots,
            expiry_ms, position_x, position_y, clock, ctx)
    }

    /// B1.2: Easy DE shop create entry with tribe shop-limit enforcement.
    public entry fun create_de_shop_easy(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        members: &MemberRegistry,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        offer_item_type_ids: vector<u64>, offer_quantities: vector<u64>,
        request_item_type_ids: vector<u64>, request_quantities: vector<u64>,
        offer_per_lots: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == BAZAAR_TYPE_EASY, E_BAZAAR_TYPE_MISMATCH);
        assert_tribe_shop_limit_ok(registry, tribe_gov, members, ctx.sender());
        create_de_shop(registry, gov, members, bazaar_type, title, ssu_id, tribe_id,
            offer_item_type_ids, offer_quantities, request_item_type_ids, request_quantities,
            offer_per_lots,
            expiry_ms, position_x, position_y, clock, ctx)
    }

    /// B1.2: Advanced DE shop create entry. Asserts ssu_bazaar_type == 2.
    public entry fun create_de_shop_advanced(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        offer_item_type_ids: vector<u64>, offer_quantities: vector<u64>,
        request_item_type_ids: vector<u64>, request_quantities: vector<u64>,
        offer_per_lots: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        assert!(ssu_governance::ssu_bazaar_type(gov) == BAZAAR_TYPE_ADVANCED, E_BAZAAR_TYPE_MISMATCH);
        create_de_shop(registry, gov, members, bazaar_type, title, ssu_id, tribe_id,
            offer_item_type_ids, offer_quantities, request_item_type_ids, request_quantities,
            offer_per_lots,
            expiry_ms, position_x, position_y, clock, ctx)
    }

    // V26 D8: create_free_shop + create_free_shop_partial relocated to sibling
    // module `bazar_free`. Field accessors / mutators for coin-giveaway +
    // tribe-token pool fields remain below.

    // ===== Public Shop Management =====
    // close_shop → bazar_close.move (TFP Phase 3.2 Bug C / V11). Inline atomic drain + refund.

    public entry fun update_shop_listing(
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,              // R3.5 NEW: freeze + identity guard
        listing_idx: u64, new_price_eve: u64, ctx: &mut TxContext,
    ) {
        let shop = borrow_shop_mut(registry, shop_id);
        ssu_governance::assert_not_frozen(gov);                             // R3.5
        ssu_governance::assert_active(gov);                                  // R6.7.1 E_SSU_NOT_ACTIVE
        ssu_governance::assert_subject_in_governance(gov, shop_ssu_id(shop)); // R3.5 SA-R3-01
        assert!(shop.owner == tx_context::sender(ctx), E_NOT_SHOP_OWNER);
        bazar_listings::set_listing_price(&mut shop.listings, listing_idx, new_price_eve);
    }

    // ===== Package-Internal Helpers =====
    public(package) fun borrow_shop(registry: &BazarRegistry, shop_id: ID): &Shop {
        assert!(table::contains(&registry.shops, shop_id), E_SHOP_NOT_FOUND);
        dof::borrow(&registry.id, shop_id)
    }

    public fun borrow_shop_mut(registry: &mut BazarRegistry, shop_id: ID): &mut Shop {
        assert!(table::contains(&registry.shops, shop_id), E_SHOP_NOT_FOUND);
        dof::borrow_mut(&mut registry.id, shop_id)
    }

    /// V9: Deactivate shop by ID (pre-snapshotted owner). EFP1 Ph8: also removes from shops_by_ssu.
    public(package) fun deactivate_shop_by_id(
        registry: &mut BazarRegistry,
        shop_id: ID,
        owner_at_shop: address,
    ) {
        assert!(table::contains(&registry.shops, shop_id), E_SHOP_NOT_FOUND);
        // EFP1 Phase 8: snapshot ssu_id before &mut borrow (borrow-checker scope-block).
        let ssu_at_shop: address = {
            let s: &Shop = dof::borrow(&registry.id, shop_id);
            s.ssu_id
        };
        if (table::contains(&registry.shops_by_owner, owner_at_shop)) {
            let cnt = table::borrow_mut(&mut registry.shops_by_owner, owner_at_shop);
            if (*cnt > 0) { *cnt = *cnt - 1; };
        };
        // GAS-08: find ShopPosition by id and remove it (never flip-in-place).
        if (table::contains(&registry.shops_by_ssu, ssu_at_shop)) {
            let v = table::borrow_mut(&mut registry.shops_by_ssu, ssu_at_shop);
            let n = vector::length(v);
            let mut i = 0;
            let mut found_idx = n; // sentinel: n means not found
            while (i < n) {
                if (vector::borrow(v, i).id == shop_id) { found_idx = i; break };
                i = i + 1;
            };
            if (found_idx < n) { vector::remove(v, found_idx); };
        };
        if (table::contains(&registry.shops, shop_id)) { *table::borrow_mut(&mut registry.shops, shop_id) = false; };
        let shop_mut: &mut Shop = dof::borrow_mut(&mut registry.id, shop_id);
        shop_mut.is_active = false;
    }

    // These functions delegate to bazar_listings (wrappers — per CC-807 approved deviation from design §10).
    /// GAS-01: forwards post-decrement listing quantity for the drain short-circuit.
    public(package) fun decrement_listing(shop: &mut Shop, idx: u64, qty: u64): u64 {
        bazar_listings::decrement_listing(&mut shop.listings, idx, qty)
    }

    public(package) fun decrement_pair(shop: &mut Shop, pair_idx: u64) {
        bazar_listings::decrement_pair(&mut shop.pairs, pair_idx);
    }

    /// V31 partial DE — subtract `units` from a pair's remaining offered stock.
    /// GAS-01: forwards post-decrement offer_quantity for the drain short-circuit.
    public(package) fun decrement_pair_offer(shop: &mut Shop, pair_idx: u64, units: u64): u64 {
        bazar_listings::decrement_pair_offer(&mut shop.pairs, pair_idx, units)
    }

    public(package) fun get_listing(shop: &Shop, idx: u64): &Listing {
        bazar_listings::get_listing(&shop.listings, idx)
    }

    public(package) fun get_pair(shop: &Shop, idx: u64): &ExchangePair {
        bazar_listings::get_pair(&shop.pairs, idx)
    }

    public(package) fun increment_listing(shop: &mut Shop, idx: u64, qty: u64) {
        bazar_listings::increment_listing(&mut shop.listings, idx, qty);
    }
    // TFP Phase 3.2 drain helpers: listings/pairs fields are private; bazar_close.move + shop_moderation.move consume these.
    public(package) fun pop_listing(shop: &mut Shop): Listing { // TFP Phase 3.2 drain helper
        vector::pop_back(&mut shop.listings)
    }
    public(package) fun pop_pair(shop: &mut Shop): ExchangePair { // TFP Phase 3.2 drain helper
        vector::pop_back(&mut shop.pairs)
    }
    public(package) fun listings_is_empty(shop: &Shop): bool { // TFP Phase 3.2 drain helper
        vector::is_empty(&shop.listings)
    }
    public(package) fun pairs_is_empty(shop: &Shop): bool { // TFP Phase 3.2 drain helper
        vector::is_empty(&shop.pairs)
    }

    public(package) fun escrowed_eve_value(shop: &Shop): u64 {
        shop.escrowed_eve.value()
    }

    public(package) fun withdraw_escrowed_eve(
        shop: &mut Shop, amount: u64, ctx: &mut TxContext,
    ): Coin<EVE> {
        coin::from_balance(balance::split(&mut shop.escrowed_eve, amount), ctx)
    }

    // V25/V26 — FREE-shop field accessors + mutators (touch private Shop fields,
    // so they MUST live here, not in sibling bazar_free). Consumed by
    // bazaar_economy::free_shop_advanced + bazaar_shop_ops::shop_ops_de::free_coin_claim.
    public fun shop_coin_claim_amount(shop: &Shop): u64 { shop.coin_claim_amount }
    public fun has_coin_claimed(shop: &Shop, claimer: address): bool { table::contains(&shop.coin_claimers, claimer) }
    public fun record_coin_claim(shop: &mut Shop, claimer: address) { table::add(&mut shop.coin_claimers, claimer, true); }
    public fun shop_tribe_token_pool(shop: &Shop): u64 { shop.tribe_token_pool }
    public fun debit_tribe_token_pool(shop: &mut Shop, amount: u64) {
        assert!(shop.tribe_token_pool >= amount, E_FREE_COIN_INSUFFICIENT_POOL);
        shop.tribe_token_pool = shop.tribe_token_pool - amount;
    }

    // ===== Test-Helper Bridges (public(package) — callable by bazar_test_accessors) =====
    // new_registry_for_testing_inner: constructor wrapper consumed by create_registry_for_testing.
    // set_is_active_unsafe: bypasses ALL invariants (shops table, shops_by_ssu, owner check).
    public(package) fun new_registry_for_testing_inner(ctx: &mut TxContext): BazarRegistry {
        BazarRegistry { id: object::new(ctx), shops: table::new(ctx), shop_count_by_type: vector[0u64, 0u64, 0u64], shops_by_owner: table::new(ctx), shops_by_ssu: table::new(ctx) }
    }
    public(package) fun set_is_active_unsafe(shop: &mut Shop, value: bool) { shop.is_active = value; }

    /// GAS-08 test helper: flip the inline `active` flag in shops_by_ssu for the
    /// ShopPosition whose id matches `shop_id`. Must be called alongside
    /// set_is_active_unsafe — never independently. Follows the scoped-borrow pattern
    /// of deactivate_shop_by_id (snapshot ssu_id via DOF borrow in a scoped block,
    /// then mutably borrow shops_by_ssu in a separate block).
    #[test_only]
    public(package) fun set_shop_position_inactive_for_testing(
        registry: &mut BazarRegistry, shop_id: ID,
    ) {
        let ssu_at_shop: address = {
            let s: &Shop = dof::borrow(&registry.id, shop_id);
            s.ssu_id
        };
        if (table::contains(&registry.shops_by_ssu, ssu_at_shop)) {
            let v = table::borrow_mut(&mut registry.shops_by_ssu, ssu_at_shop);
            let n = vector::length(v);
            let mut i = 0;
            while (i < n) {
                let p = vector::borrow_mut(v, i);
                if (p.id == shop_id) { p.active = false; break };
                i = i + 1;
            };
        };
    }

    // ===== Public Accessors =====
    public fun bazaar_type_notribe(): u8 { BAZAAR_TYPE_NOTRIBE }
    public fun bazaar_type_easy(): u8 { BAZAAR_TYPE_EASY }
    public fun bazaar_type_advanced(): u8 { BAZAAR_TYPE_ADVANCED }
    public fun shop_bazaar_type(shop: &Shop): u8 { shop.bazaar_type }
    public fun shop_tribe_id(shop: &Shop): u64 { shop.tribe_id }
    public fun shop_ssu_id(shop: &Shop): address { shop.ssu_id }
    public fun shop_kind(shop: &Shop): u8 { shop.kind }
    public fun shop_owner(shop: &Shop): address { shop.owner }
    public fun shop_is_active(shop: &Shop): bool { shop.is_active }
    public fun shop_listings(shop: &Shop): &vector<Listing> { &shop.listings }
    public fun shop_pairs(shop: &Shop): &vector<ExchangePair> { &shop.pairs }
    public fun shop_expiry_ms(shop: &Shop): u64 { shop.expiry_ms }
    // Forwarding wrappers for Listing/ExchangePair accessors — delegate to bazar_listings (CC-807).
    public fun listing_item_type_id(listing: &Listing): u64 { bazar_listings::listing_item_type_id(listing) }
    public fun listing_quantity(listing: &Listing): u64 { bazar_listings::listing_quantity(listing) }
    public fun listing_price_eve(listing: &Listing): u64 { bazar_listings::listing_price_eve(listing) }
    public fun listing_original_quantity(listing: &Listing): u64 { bazar_listings::listing_original_quantity(listing) }
    public fun pair_offer_type(pair: &ExchangePair): u64 { bazar_listings::pair_offer_type(pair) }
    public fun pair_offer_qty(pair: &ExchangePair): u64 { bazar_listings::pair_offer_qty(pair) }
    public fun pair_request_type(pair: &ExchangePair): u64 { bazar_listings::pair_request_type(pair) }
    public fun pair_request_qty(pair: &ExchangePair): u64 { bazar_listings::pair_request_qty(pair) }
    // EFP1 Phase 8 — position accessors
    public fun shop_position_x(shop: &Shop): u64 { shop.position_x }
    public fun shop_position_y(shop: &Shop): u64 { shop.position_y }
    /// GAS-08: map vector<ShopPosition> → vector<ID>. Returns ALL present ids preserving
    /// order. In production the vector holds only active shops (deactivate removes).
    /// Callers: ssu_rebind::rebind_ssu_governance (emptiness guard) + BazaarCore tests.
    public fun ssu_shop_ids(registry: &BazarRegistry, ssu_id: address): vector<ID> {
        if (!table::contains(&registry.shops_by_ssu, ssu_id)) return vector::empty<ID>();
        let positions = table::borrow(&registry.shops_by_ssu, ssu_id);
        let n = vector::length(positions);
        let mut out = vector::empty<ID>();
        let mut i = 0;
        while (i < n) {
            vector::push_back(&mut out, vector::borrow(positions, i).id);
            i = i + 1;
        };
        out
    }
    public fun shop_count(registry: &BazarRegistry): u64 { table::length(&registry.shops) }
    /// UpdateCeremonyPlan v1 — non-aborting existence check, needed by admin batch entries
    /// (`bazar_admin_drain`, `wtb_escrow_pool::refund_wtb_escrow_pool_batch`, etc.) which must
    /// skip-not-abort on stale shop IDs in FE-supplied vectors.
    public fun has_shop(registry: &BazarRegistry, shop_id: ID): bool { table::contains(&registry.shops, shop_id) }
    public fun shop_count_by_type(registry: &BazarRegistry, bazaar_type: u8): u64 { *vector::borrow(&registry.shop_count_by_type, (bazaar_type as u64)) }
    public fun shop_count_for_owner(registry: &BazarRegistry, owner: address): u64 {
        if (table::contains(&registry.shops_by_owner, owner)) { *table::borrow(&registry.shops_by_owner, owner) } else { 0 }
    }
    public fun shop_kind_wts(): u8 { SHOP_WTS }
    public fun shop_kind_wtb(): u8 { SHOP_WTB }
    public fun shop_kind_de(): u8 { SHOP_DE }
    public fun shop_kind_free(): u8 { SHOP_FREE }

    // ===== Test-only share helper =====
    // Must live in bazar.move (owning module of BazarRegistry) per Move private-share rule.
    #[test_only]
    public fun share_for_testing(registry: BazarRegistry) {
        sui::transfer::share_object(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
