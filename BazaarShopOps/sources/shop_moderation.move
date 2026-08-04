// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_shop_ops::shop_moderation {
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::object;
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use std::option;
    use world::storage_unit::{Self, StorageUnit};
    use world::character::{Self, Character};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::membership::{
        Self, SSUSuperAdminCap, SSUAdminCap, SSUModCap, SSUOwnerCap,
    };
    use bazaar_core::bazar::{Self, BazarRegistry, BazarAuth};
    use bazaar_core::shop_ops_guarded;
    use bazaar_core::bazaar_core_admin::ShopOpsCap;
    use bazaar_shop_ops::bazar_close;
    use bazaar_shop_ops::shop_ops_cap_store::{Self, ShopOpsCapStore};
    use bazaar_core::wtb_escrow_pool::WtbEscrowPool;

    // ===== Error Codes =====
    const E_WRONG_SSU: u64 = 1;
    const E_SHOP_NOT_ACTIVE: u64 = 2;
    const E_CAP_REVOKED: u64 = 6;
    /// Redeclared from shop_ops_wtb.move:35 and bazar_close.move; cross-module test #19 verifies value equality.
    const E_RECIPIENT_NOT_SHOP_OWNER: u64 = 16;
    /// Admin force-close on SSU-owner-owned shops is prohibited; owner must self-close.
    /// Redeclared from bazar_close.move; same value enforced by design § 3.2.
    const E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP: u64 = 20;

    // ===== Shop Kind Constants =====
    /// Wave 3 W3-2: skip Open Storage drain for WTB shops in force-close.
    /// Mirrors bazar_close.move::SHOP_WTB. See bazar.move:28 for the source-of-truth.
    const SHOP_WTB: u8 = 1;

    // ===== Closer-Tier Constants =====
    // Tier 0 = Owner (legacy bazar.move fn). Tiers 1-3 = SSU-cap dispatchers.
    // Tiers 4-6 (tribe-cap) moved to shop_moderation_tribe.move per TFP Phase 3.2.
    const CLOSER_TIER_SUPER_ADMIN: u8 = 1;
    const CLOSER_TIER_ADMIN: u8 = 2;
    const CLOSER_TIER_MOD: u8 = 3;

    // ===== Events =====
    /// Canonical force-close event (closer_tier: 0=Owner, 1=SSUSuperAdmin, 2=SSUAdmin,
    /// 3=SSUMod, 4=TribeSuperAdmin, 5=TribeAdmin, 6=TribeMod). Relocated from bazar.move.
    public struct ShopForceClosedEvent has copy, drop {
        shop_id: ID,
        closer: address,
        closer_tier: u8,
        owner: address,
        bazaar_type: u8,
        ssu_id: address,
        tribe_id: u64,
        eve_returned: u64,
        timestamp_ms: u64,
    }

    // ===== Public(Package) Internal =====

    /// Shared mutation logic for all force-close dispatchers (tiers 1-6).
    /// SA-402 order: governance → is_active → SSU-owner guard → recipient assert
    /// → drain Open Storage → pool residue → EVE refund → deactivate → event.
    /// SSU-owner shops abort (E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP=20); owner must self-close.
    public(package) fun force_close_shop_internal(
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        pool: &mut WtbEscrowPool,
        closer: address,
        closer_tier: u8,
        allow_ssu_owner: bool,
        cap: &ShopOpsCap,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Pre-snapshot SSU ID and owner (scope blocks release borrow before main scope).
        let ssu_id_for_check = { bazar::shop_ssu_id(bazar::borrow_shop_mut(registry, shop_id)) };
        // assert_not_frozen SKIPPED — moderation exempt per §2.6 EXEMPT-MODERATION.
        ssu_governance::assert_subject_in_governance(gov, ssu_id_for_check);
        ssu_governance::assert_active(gov);
        let owner_addr = { bazar::shop_owner(bazar::borrow_shop_mut(registry, shop_id)) };

        // Main scope block — shop borrow released before deactivate (borrow-checker requirement).
        let (bazaar_type, ssu_id, tribe_id, eve_balance, refund_opt) = {
            let shop = bazar::borrow_shop_mut(registry, shop_id);
            // SA-402: active → SSU-owner guard → recipient → drain → pool → EVE.
            assert!(bazar::shop_is_active(shop), E_SHOP_NOT_ACTIVE);
            // SSU-owner-owned shops are normally admin-exempt (owner must self-close so
            // items route to Main Storage). The Update Ceremony admin drain passes
            // allow_ssu_owner=true to override this: items then route to the owner's
            // Player Locker (the recipient assert below is UNCHANGED, so they still go
            // to the owner, never the admin — SEC-A1).
            assert!(
                allow_ssu_owner || !bazar_close::shop_owner_is_ssu_owner(shop, gov),
                E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP,
            );
            assert!(
                character::character_address(recipient_character) == owner_addr,
                E_RECIPIENT_NOT_SHOP_OWNER,
            );
            let bazaar_type = bazar::shop_bazaar_type(shop);
            let ssu_id     = bazar::shop_ssu_id(shop);
            let tribe_id   = bazar::shop_tribe_id(shop);
            // Wave 3 W3-2 / W3-7: WTB shops have no Open Storage items; skip drain.
            let drain_items = bazar::shop_kind(shop) != SHOP_WTB;
            // Drain WTS/FREE listings: index-based (Listing has copy,drop — metadata only).
            let listing_count = if (drain_items) std::vector::length(bazar::shop_listings(shop)) else 0;
            let mut i = 0;
            while (i < listing_count) {
                let listing = *std::vector::borrow(bazar::shop_listings(shop), i);
                let qty = bazar::listing_quantity(&listing);
                if (qty > 0) {
                    let type_id = bazar::listing_item_type_id(&listing);
                    let item = storage_unit::withdraw_from_open_inventory<BazarAuth>(
                        ssu, recipient_character, bazar::new_bazar_auth(),
                        type_id, (qty as u32), ctx,
                    );
                    storage_unit::deposit_to_owned<BazarAuth>(
                        ssu, recipient_character, item, bazar::new_bazar_auth(), ctx,
                    );
                };
                i = i + 1;
            };
            // Drain DE offer-side pairs: same index-based pattern.
            let pair_count = if (drain_items) std::vector::length(bazar::shop_pairs(shop)) else 0;
            let mut j = 0;
            while (j < pair_count) {
                let pair = *std::vector::borrow(bazar::shop_pairs(shop), j);
                let qty = bazar::pair_offer_qty(&pair);
                if (qty > 0) {
                    let type_id = bazar::pair_offer_type(&pair);
                    let item = storage_unit::withdraw_from_open_inventory<BazarAuth>(
                        ssu, recipient_character, bazar::new_bazar_auth(),
                        type_id, (qty as u32), ctx,
                    );
                    storage_unit::deposit_to_owned<BazarAuth>(
                        ssu, recipient_character, item, bazar::new_bazar_auth(), ctx,
                    );
                };
                j = j + 1;
            };
            // WTB pool residue refund (idempotent — None if no entry).
            let coin_opt = shop_ops_guarded::withdraw_owner_residual_on_close_g(
                pool, shop_id, owner_addr, cap, ctx,
            );
            if (option::is_some(&coin_opt)) {
                transfer::public_transfer(option::destroy_some(coin_opt), owner_addr);
            } else { option::destroy_none(coin_opt); };
            // Extract escrowed_eve while shop borrow is live.
            let eve_balance = shop_ops_guarded::escrowed_eve_value_g(shop, cap);
            let refund_opt = if (eve_balance > 0) {
                option::some(shop_ops_guarded::withdraw_escrowed_eve_g(shop, eve_balance, cap, ctx))
            } else { option::none() };
            (bazaar_type, ssu_id, tribe_id, eve_balance, refund_opt)
        }; // shop borrow dropped here

        shop_ops_guarded::deactivate_shop_by_id_g(registry, shop_id, owner_addr, cap);
        if (option::is_some(&refund_opt)) {
            transfer::public_transfer(option::destroy_some(refund_opt), owner_addr);
        } else { option::destroy_none(refund_opt); };
        event::emit(ShopForceClosedEvent {
            shop_id,
            closer,
            closer_tier,
            owner: owner_addr,
            bazaar_type,
            ssu_id,
            tribe_id,
            eve_returned: eve_balance,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Legacy Owner Force-Close (relocated from bazar.move) =====

    /// SSU owner closes any shop at their SSU. Drains Open Storage to recipient_character
    /// Player Locker, refunds WTB pool residue + escrowed EVE to shop owner.
    /// SEC-005/R6.7.2: retains assert_not_frozen (stricter than mod dispatchers — intentional).
    /// Relocated from bazar.move to break E02004 module cycle.
    public entry fun force_close_shop(
        cap: &SSUOwnerCap,
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        pool: &mut WtbEscrowPool,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // V38 split: borrow the ShopOpsCap once; the read-borrow wrappers + internal need it.
        let ops_cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let shop_ssu = { bazar::shop_ssu_id(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)) };
        assert!(membership::cap_ssu_id(cap) == shop_ssu, E_WRONG_SSU);
        // SEC-005 / R6.7.2: NEW assert_subject_in_governance (retrofitted)
        ssu_governance::assert_subject_in_governance(gov, shop_ssu);
        // SEC-005 / R6.7.2: legacy retains assert_not_frozen by design —
        // do NOT 'fix' this divergence without re-opening the SEC-005 spec.
        ssu_governance::assert_not_frozen(gov);
        // R6.7.1 assert_active retained
        ssu_governance::assert_active(gov);
        assert!(bazar::shop_is_active(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)), E_SHOP_NOT_ACTIVE);
        force_close_shop_internal(
            registry,
            shop_id,
            gov,
            ssu,
            recipient_character,
            pool,
            tx_context::sender(ctx),
            0u8, // closer_tier = 0 (Owner)
            false, // allow_ssu_owner — moderation/owner paths never override the SSU-owner guard
            ops_cap,
            clock,
            ctx,
        );
    }

    // ===== SSU-Cap Dispatchers (OS-40) =====

    /// Force-close using SSUSuperAdminCap. assert_not_frozen SKIPPED (§2.6 EXEMPT-MODERATION). SEC-005 back-ref: see force_close_shop doc-comment.
    public entry fun force_close_shop_as_super_admin(
        cap: &SSUSuperAdminCap,
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        pool: &mut WtbEscrowPool,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // V38 split: borrow the ShopOpsCap once; the read-borrow wrappers + internal need it.
        let ops_cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let shop_ssu = { bazar::shop_ssu_id(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)) };
        // 1. cap-tier-id-matches: cap.ssu_id == shop.ssu_id AND cap.ssu_id == gov.ssu_id
        assert!(
            membership::ssu_super_admin_cap_ssu_id(cap) == shop_ssu,
            E_WRONG_SSU,
        );
        assert!(
            membership::ssu_super_admin_cap_ssu_id(cap) == ssu_governance::ssu_id(gov),
            E_WRONG_SSU,
        );
        // 2. subject-in-governance
        ssu_governance::assert_subject_in_governance(gov, shop_ssu);
        // 3. assert_active (GATED per §2.6)
        ssu_governance::assert_active(gov);
        // 4. revocation check (SuperAdmin path uses SSU revocation table)
        assert!(
            !ssu_governance::is_cap_revoked(gov, object::id(cap)),
            E_CAP_REVOKED,
        );
        // 5. shop must be active
        assert!(bazar::shop_is_active(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)), E_SHOP_NOT_ACTIVE);
        // 6. assert_not_frozen SKIPPED (EXEMPT-MODERATION)
        force_close_shop_internal(
            registry, shop_id, gov,
            ssu, recipient_character, pool,
            tx_context::sender(ctx), CLOSER_TIER_SUPER_ADMIN,
            false, // allow_ssu_owner
            ops_cap,
            clock, ctx,
        );
    }

    /// Force-close using SSUAdminCap. assert_not_frozen SKIPPED (§2.6 EXEMPT-MODERATION). SEC-005 back-ref: see force_close_shop doc-comment.
    public entry fun force_close_shop_as_admin(
        cap: &SSUAdminCap,
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        pool: &mut WtbEscrowPool,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // V38 split: borrow the ShopOpsCap once; the read-borrow wrappers + internal need it.
        let ops_cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let shop_ssu = { bazar::shop_ssu_id(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)) };
        // 1. cap-tier-id-matches
        assert!(
            membership::ssu_admin_cap_ssu_id(cap) == shop_ssu,
            E_WRONG_SSU,
        );
        assert!(
            membership::ssu_admin_cap_ssu_id(cap) == ssu_governance::ssu_id(gov),
            E_WRONG_SSU,
        );
        // 2. subject-in-governance
        ssu_governance::assert_subject_in_governance(gov, shop_ssu);
        // 3. assert_active
        ssu_governance::assert_active(gov);
        // 4. No revocation table for Admin caps (SSUAdminCap is not in the revocation ledger)
        // 5. shop must be active
        assert!(bazar::shop_is_active(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)), E_SHOP_NOT_ACTIVE);
        // 6. assert_not_frozen SKIPPED (EXEMPT-MODERATION)
        force_close_shop_internal(
            registry, shop_id, gov,
            ssu, recipient_character, pool,
            tx_context::sender(ctx), CLOSER_TIER_ADMIN,
            false, // allow_ssu_owner
            ops_cap,
            clock, ctx,
        );
    }

    /// Force-close using SSUModCap. assert_not_frozen SKIPPED (§2.6 EXEMPT-MODERATION). SEC-005 back-ref: see force_close_shop doc-comment.
    public entry fun force_close_shop_as_mod(
        cap: &SSUModCap,
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        pool: &mut WtbEscrowPool,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // V38 split: borrow the ShopOpsCap once; the read-borrow wrappers + internal need it.
        let ops_cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let shop_ssu = { bazar::shop_ssu_id(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)) };
        // 1. cap-tier-id-matches
        assert!(
            membership::ssu_mod_cap_ssu_id(cap) == shop_ssu,
            E_WRONG_SSU,
        );
        assert!(
            membership::ssu_mod_cap_ssu_id(cap) == ssu_governance::ssu_id(gov),
            E_WRONG_SSU,
        );
        // 2. subject-in-governance
        ssu_governance::assert_subject_in_governance(gov, shop_ssu);
        // 3. assert_active
        ssu_governance::assert_active(gov);
        // 4. No revocation table for Mod caps
        // 5. shop must be active
        assert!(bazar::shop_is_active(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)), E_SHOP_NOT_ACTIVE);
        // 6. assert_not_frozen SKIPPED (EXEMPT-MODERATION)
        force_close_shop_internal(
            registry, shop_id, gov,
            ssu, recipient_character, pool,
            tx_context::sender(ctx), CLOSER_TIER_MOD,
            false, // allow_ssu_owner
            ops_cap,
            clock, ctx,
        );
    }

    // ===== Test-Only Accessors =====

    /// Re-export E_RECIPIENT_NOT_SHOP_OWNER for cross-module value-equality assertion (test #19).
    /// Verifies that shop_moderation, shop_ops_wtb, and bazar_close all declare the same value (16).
    #[test_only]
    public fun e_recipient_not_shop_owner_for_testing(): u64 { E_RECIPIENT_NOT_SHOP_OWNER }

    /// Re-export E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP for test #20 (admin rejects SSU owner shop).
    #[test_only]
    public fun e_cannot_force_close_ssu_owner_shop_for_testing(): u64 { E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
