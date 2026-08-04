// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Tribe-cap force-close dispatchers for bazar shops.
///
/// Migrated from shop_moderation.move:338-488 per TFP Phase 3.2 (500-LOC budget recovery).
/// Production entry fns — FE PTBs target this module. SuiCallRegistry rotation
/// required if any FE call-site exists (verification: grep bazaar-frontend/ for
/// `force_close_shop_as_tribe_`).
///
/// All 3 dispatchers delegate to shop_moderation::force_close_shop_internal
/// (public(package) helper) for shared mutation logic. Only the cap-validation
/// preamble differs per tier.
module bazaar_shop_ops::shop_moderation_tribe {
    use sui::clock::Clock;
    use sui::object;
    use sui::tx_context::{Self, TxContext};
    use world::storage_unit::StorageUnit;
    use world::character::Character;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::tribe_governance::{Self, TribeGovernance, TribeSuperAdminCap, TribeAdminCap, TribeModCap};
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::wtb_escrow_pool::WtbEscrowPool;
    use bazaar_core::shop_ops_guarded;
    use bazaar_shop_ops::shop_ops_cap_store::{Self, ShopOpsCapStore};
    use bazaar_shop_ops::shop_moderation;

    // ===== Error Codes (duplicated from shop_moderation.move for self-containedness) =====
    // MUST stay in sync with shop_moderation.move constants section.
    const E_SHOP_NOT_ACTIVE: u64 = 2;
    const E_WRONG_TRIBE: u64 = 3;
    const E_TRIBE_ID_MISMATCH: u64 = 4;
    const E_TRIBE_MISMATCH: u64 = 5;
    const E_TRIBE_CAP_REVOKED: u64 = 7;
    const E_RECIPIENT_NOT_SHOP_OWNER: u64 = 16;
    const E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP: u64 = 20;

    // ===== Closer-Tier Constants (duplicated for closer_tier event arg) =====
    const CLOSER_TIER_TRIBE_SUPER_ADMIN: u8 = 4;
    const CLOSER_TIER_TRIBE_ADMIN: u8 = 5;
    const CLOSER_TIER_TRIBE_MOD: u8 = 6;

    // === Migrated from shop_moderation.move:335-488 per TFP Phase 3.2 ===

    /// Force-close using TribeSuperAdminCap. SEC-003 tribe-SSU binding via ssu_tribe_id. assert_not_frozen SKIPPED (§2.6).
    public entry fun force_close_shop_as_tribe_super_admin(
        cap: &TribeSuperAdminCap,
        registry: &mut BazarRegistry,
        shop_id: ID,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        pool: &mut WtbEscrowPool,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // V38 split: borrow the ShopOpsCap once; the read-borrow wrappers + internal need it.
        let ops_cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let (shop_ssu, shop_tribe) = {
            let s = shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap);
            (bazar::shop_ssu_id(s), bazar::shop_tribe_id(s))
        };
        // 1. cap-tier-id-matches (tribe dispatchers: 3-part check)
        assert!(
            tribe_governance::tribe_super_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov),
            E_WRONG_TRIBE,
        );
        assert!(
            shop_tribe == tribe_governance::tribe_id(tribe_gov),
            E_TRIBE_ID_MISMATCH,
        );
        // SEC-003: SSU must belong to the same tribe as the acting cap
        assert!(
            ssu_governance::ssu_tribe_id(ssu_gov) == tribe_governance::tribe_id(tribe_gov),
            E_TRIBE_MISMATCH,
        );
        // 2. subject-in-governance (always, regardless of tier)
        ssu_governance::assert_subject_in_governance(ssu_gov, shop_ssu);
        // 3. assert_active
        ssu_governance::assert_active(ssu_gov);
        // 4. tribe-cap revocation check
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(tribe_gov, object::id(cap)),
            E_TRIBE_CAP_REVOKED,
        );
        // 5. shop must be active
        assert!(bazar::shop_is_active(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)), E_SHOP_NOT_ACTIVE);
        // 6. assert_not_frozen SKIPPED (EXEMPT-MODERATION)
        shop_moderation::force_close_shop_internal(
            registry, shop_id, ssu_gov,
            ssu, recipient_character, pool,
            tx_context::sender(ctx), CLOSER_TIER_TRIBE_SUPER_ADMIN,
            false, // allow_ssu_owner
            ops_cap,
            clock, ctx,
        );
    }

    /// Force-close using TribeAdminCap. SEC-003 tribe-SSU binding via ssu_tribe_id. assert_not_frozen SKIPPED (§2.6).
    public entry fun force_close_shop_as_tribe_admin(
        cap: &TribeAdminCap,
        registry: &mut BazarRegistry,
        shop_id: ID,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        pool: &mut WtbEscrowPool,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // V38 split: borrow the ShopOpsCap once; the read-borrow wrappers + internal need it.
        let ops_cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let (shop_ssu, shop_tribe) = {
            let s = shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap);
            (bazar::shop_ssu_id(s), bazar::shop_tribe_id(s))
        };
        // 1. cap-tribe-id-matches
        assert!(
            tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov),
            E_WRONG_TRIBE,
        );
        assert!(
            shop_tribe == tribe_governance::tribe_id(tribe_gov),
            E_TRIBE_ID_MISMATCH,
        );
        // SEC-003
        assert!(
            ssu_governance::ssu_tribe_id(ssu_gov) == tribe_governance::tribe_id(tribe_gov),
            E_TRIBE_MISMATCH,
        );
        // 2. subject-in-governance
        ssu_governance::assert_subject_in_governance(ssu_gov, shop_ssu);
        // 3. assert_active
        ssu_governance::assert_active(ssu_gov);
        // 4. tribe-cap revocation check
        assert!(
            !tribe_governance::is_tribe_admin_cap_revoked(tribe_gov, object::id(cap)),
            E_TRIBE_CAP_REVOKED,
        );
        // 5. shop must be active
        assert!(bazar::shop_is_active(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)), E_SHOP_NOT_ACTIVE);
        // 6. assert_not_frozen SKIPPED (EXEMPT-MODERATION)
        shop_moderation::force_close_shop_internal(
            registry, shop_id, ssu_gov,
            ssu, recipient_character, pool,
            tx_context::sender(ctx), CLOSER_TIER_TRIBE_ADMIN,
            false, // allow_ssu_owner
            ops_cap,
            clock, ctx,
        );
    }

    /// Force-close using TribeModCap. SEC-003 tribe-SSU binding via ssu_tribe_id. assert_not_frozen SKIPPED (§2.6).
    public entry fun force_close_shop_as_tribe_mod(
        cap: &TribeModCap,
        registry: &mut BazarRegistry,
        shop_id: ID,
        ssu_gov: &SSUGovernance,
        tribe_gov: &TribeGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        pool: &mut WtbEscrowPool,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // V38 split: borrow the ShopOpsCap once; the read-borrow wrappers + internal need it.
        let ops_cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let (shop_ssu, shop_tribe) = {
            let s = shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap);
            (bazar::shop_ssu_id(s), bazar::shop_tribe_id(s))
        };
        // 1. cap-tribe-id-matches
        assert!(
            tribe_governance::tribe_mod_cap_tribe_id(cap) == tribe_governance::tribe_id(tribe_gov),
            E_WRONG_TRIBE,
        );
        assert!(
            shop_tribe == tribe_governance::tribe_id(tribe_gov),
            E_TRIBE_ID_MISMATCH,
        );
        // SEC-003
        assert!(
            ssu_governance::ssu_tribe_id(ssu_gov) == tribe_governance::tribe_id(tribe_gov),
            E_TRIBE_MISMATCH,
        );
        // 2. subject-in-governance
        ssu_governance::assert_subject_in_governance(ssu_gov, shop_ssu);
        // 3. assert_active
        ssu_governance::assert_active(ssu_gov);
        // 4. tribe-cap revocation check
        assert!(
            !tribe_governance::is_tribe_mod_cap_revoked(tribe_gov, object::id(cap)),
            E_TRIBE_CAP_REVOKED,
        );
        // 5. shop must be active
        assert!(bazar::shop_is_active(shop_ops_guarded::borrow_shop_g(registry, shop_id, ops_cap)), E_SHOP_NOT_ACTIVE);
        // 6. assert_not_frozen SKIPPED (EXEMPT-MODERATION)
        shop_moderation::force_close_shop_internal(
            registry, shop_id, ssu_gov,
            ssu, recipient_character, pool,
            tx_context::sender(ctx), CLOSER_TIER_TRIBE_MOD,
            false, // allow_ssu_owner
            ops_cap,
            clock, ctx,
        );
    }

    // ===== Test-Only Accessors =====

    /// Re-export E_RECIPIENT_NOT_SHOP_OWNER for cross-module value-equality assertion (test #19).
    /// Verifies that shop_moderation_tribe and shop_moderation declare the same value (16).
    /// MUST stay in sync with shop_moderation.move:36.
    #[test_only]
    public fun e_recipient_not_shop_owner_for_testing(): u64 { E_RECIPIENT_NOT_SHOP_OWNER }

    /// Re-export E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP for test #20 (admin rejects SSU owner shop).
    /// MUST stay in sync with shop_moderation.move:39.
    #[test_only]
    public fun e_cannot_force_close_ssu_owner_shop_for_testing(): u64 { E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
