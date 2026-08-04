// bazaar_economy | Shared test factories for the depreciated economy token-leg prune entries
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 shared test-only factories for the 4 ssu_depreciation_economy.move entries, reused across
/// the 4 sibling *_tests.move files in this directory (avoids repeating cap-store / stand-in-shop /
/// Advanced-mission boilerplate 4x). Every factory here calls REAL, unmodified production
/// constructors (bazar_test_accessors::create_wts_shop_for_testing, bazar_free::create_free_shop_partial,
/// mission::construct_mission_advanced/register_mission_advanced, economy_cap_store::receive_shop_cap)
/// -- no new production-source seam is introduced by this file; it only composes already-existing
/// #[test_only]/bare-public cross-package factories (mirrors the campaign's
/// shop_close_recovery_test_helpers.move precedent).
#[test_only]
module bazaar_economy::ssu_depreciation_economy_test_helpers {
    use sui::clock::Clock;
    use sui::test_utils;
    use bazaar_core::bazar::BazarRegistry;
    use bazaar_core::bazar_free;
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::ssu_governance::SSUGovernance;
    use bazaar_core::tribe_governance::TribeGovernance;
    use bazaar_core::membership::MemberRegistry;
    use bazaar_core::bazaar_core_admin::{Self, TribeTokenShopCap};
    use dapp_hub::dapp_governance;
    use bazaar_mission::mission::{Self, MissionRegistry};
    use bazaar_economy::economy_cap_store::{Self, EconomyCapStore};

    const BAZAAR_ADVANCED: u8 = 2;
    const VIS_EVERYONE: u8 = 16;

    /// Build a fully-loaded EconomyCapStore for the Entry-3 test file (the only entry taking a
    /// cap_store param). economy_cap_store has no create_loaded_for_testing shortcut (unlike
    /// bazaar_shop_ops::shop_ops_cap_store) -- this composes the existing
    /// bazaar_core_admin::create_shop_cap_for_testing + dapp_hub::dapp_governance::
    /// create_owner_cap_for_testing test factories through the REAL one-time
    /// economy_cap_store::receive_shop_cap setup entry, then discards the throwaway owner cap.
    public fun make_loaded_cap_store(ctx: &mut TxContext): EconomyCapStore {
        let mut store = economy_cap_store::create_for_testing(ctx);
        let shop_cap = bazaar_core_admin::create_shop_cap_for_testing(@0x0, ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(ctx);
        economy_cap_store::receive_shop_cap(&mut store, shop_cap, &owner_cap);
        test_utils::destroy(owner_cap);
        store
    }

    /// Stand-in Shop record for Entry 1 (WTB token page): that entry reads only generic Shop
    /// accessors (owner/ssu_id/tribe_id) plus the EXTERNAL pool state (populated separately via
    /// tribe_token_wtb_pool::credit_for_shop) -- it asserts NEITHER shop_kind nor shop_bazaar_type
    /// on the record itself (verified against ssu_depreciation_economy.move Entry 1's body, this
    /// shard's report §0). CR-P5B-01 (critic P5 review, HIGH): a zero-listing WTS shop is
    /// UNCONSTRUCTIBLE -- bazar_helpers::validate_shop_params (bazar_helpers.move:39) asserts
    /// item_count > 0 (E_EMPTY_LISTINGS=2). ONE dummy listing (type_id=1, qty=1, price=1) satisfies
    /// the constructor; bazar_listings::build_listings places no further constraint on its values
    /// (verified: only equal-vector-length is checked), and the prune entry under test never reads
    /// the listing itself -- only the owner/ssu_id/tribe_id fields the constructor also sets.
    public fun make_stand_in_advanced_shop(
        registry: &mut BazarRegistry, gov: &SSUGovernance, members: &MemberRegistry,
        ssu_id: address, tribe_id: u64, position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        bazar_test_accessors::create_wts_shop_for_testing(
            registry, gov, members, BAZAAR_ADVANCED, b"Test",
            ssu_id, tribe_id, vector[1], vector[1], vector[1],
            9_999_999_999_999, position_x, position_y, clock, ctx,
        )
    }

    /// Real Advanced FREE shop with a caller-chosen tribe_token_pool -- calls
    /// bazar_free::create_free_shop_partial DIRECTLY (bare public, bazaar_core; already consumed
    /// cross-package by bazaar_economy's own free_shop_advanced::create_free_shop_advanced),
    /// bypassing the ledger pre-burn its production caller normally performs first -- irrelevant to
    /// the PRUNE entry under test, which only reads the already-populated shop.tribe_token_pool
    /// field. coin_claim_amount is set equal to pool_amount (unused by the prune entry; harmless).
    public fun make_free_shop_with_pool(
        registry: &mut BazarRegistry, gov: &SSUGovernance, members: &MemberRegistry,
        ssu_id: address, tribe_id: u64, pool_amount: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        bazar_free::create_free_shop_partial(
            registry, gov, members, BAZAAR_ADVANCED, b"Test",
            ssu_id, tribe_id, vector[], vector[],
            9_999_999_999_999, position_x, position_y,
            pool_amount, pool_amount,
            clock, ctx,
        )
    }

    /// Minimal Advanced mission (construct_mission_advanced + register_mission_advanced, mirrors
    /// BazaarMission/tests/c4_mission_position_tests.move::make_advanced_mission_at) for the
    /// token-collateral (Entry 3) and reward-token (Entry 4 / P4b) test files.
    public fun make_advanced_mission(
        registry: &mut MissionRegistry, gov: &SSUGovernance, tribe_gov: &TribeGovernance,
        reward_token_per_run: u64, max_runs: u64, collateral_token_per_run: u64,
        shop_cap: &TribeTokenShopCap,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        let m = mission::construct_mission_advanced(
            gov, tribe_gov, 0, b"Test", b"", 0,
            vector[], vector[], vector[], vector[],
            max_runs, reward_token_per_run, collateral_token_per_run,
            VIS_EVERYONE, vector[],
            3_600_000, 3_600_001,
            position_x, position_y,
            shop_cap, clock, ctx,
        );
        mission::register_mission_advanced(registry, m, shop_cap)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
