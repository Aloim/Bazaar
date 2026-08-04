// bazaar_shop_ops | Abort path unit tests for depreciated SSU shop pruning
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// P5 abort tests for bazaar_shop_ops::ssu_depreciation_ops::prune_depreciated_shops_page
/// (V41 SSU depreciation prune plan §2.3; critic P2-review carry-forward: dedicated coverage
/// for E_POOL_WRONG_SSU vs E_SHOP_WRONG_SSU, kept as two DISTINCT tests -- see
/// ssu-depreciation-prune-P2-review-2026-07-12.md OI-2).
///
/// TEST-ACCESSOR CONVENTION: qualified-const-path style in
/// #[expected_failure(abort_code = module::CONST)] with no `location=` (the abort fires in
/// the SAME module the const is declared in, for every code path here) -- ratified
/// campaign-wide by the critic's P5 review §2 (matches BazaarCore/tests/bazar_multitenant_tests.move,
/// which references a module-PRIVATE const directly with zero compile issue).
///
/// CR-P5A-02 (critic P5 review, rework applied to Test 2 only): a shop cannot be constructed
/// with ssu_id != gov.ssu_id under that SAME gov -- create_wts_shop additionally asserts
/// ssu_governance::assert_subject_in_governance(gov, ssu_id) (bazar.move:276), which is
/// STRICTER than assert_matches_gov (type+tribe only). Test 2 therefore builds the foreign
/// shop under a SECOND, ACTIVE gov_b bound to SSU_B, then prunes it via the depreciated gov_a
/// (bound to SSU_A) -- see the test's inline comment for the full trace.
#[test_only]
module bazaar_shop_ops::ssu_depreciation_ops_abort_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::object::{Self, ID};
    use bazaar_core::membership;
    use bazaar_core::wtb_escrow_pool;
    use bazaar_core::bazar_test_accessors;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_shop_ops::shop_ops_cap_store;
    use bazaar_shop_ops::ssu_depreciation_ops;
    use bazaar_shop_ops::shop_close_recovery_test_helpers::{Self as close_helpers};

    const OWNER: address = @0xA001;
    const SSU_A: address = @0xBEEF;
    const SSU_B: address = @0xCAFE;
    const TRIBE_ID: u64 = 0;
    const BAZAAR_TYPE: u8 = 0;

    // ===== Test 1 — E_NOT_DEPRECIATED: gov not yet certified =====
    #[test]
    #[expected_failure(abort_code = bazaar_shop_ops::ssu_depreciation_ops::E_NOT_DEPRECIATED)]
    fun test_prune_not_depreciated_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        ); // NOT depreciated
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let mut pool = wtb_escrow_pool::create_for_testing(SSU_A, ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

        ssu_depreciation_ops::prune_depreciated_shops_page(
            &mut registry, &gov, &mut pool,
            vector[object::id_from_address(@0x9999)],
            &cap_store, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 2 — E_SHOP_WRONG_SSU: an active row belongs to a different SSU =====
    // CR-P5A-02 reconstruction: the foreign shop CANNOT be built directly under the gov that
    // will be pruned (SSU_A) with ssu_id=SSU_B -- create_wts_shop asserts
    // assert_subject_in_governance(gov, ssu_id), which aborts E_SUBJECT_SSU_MISMATCH(12) for
    // any ssu_id != gov.ssu_id, BEFORE assert_matches_gov (the only ssu_id-blind check) is
    // ever reached. So the shop is built under its OWN active gov_b (bound to SSU_B); gov_a
    // (bound to SSU_A, the SSU actually under prune) is depreciated separately and is what
    // gets passed to the prune entry -- the per-row shop_ssu_id(shop)==gov_ssu_id assert
    // inside the active-row branch (ssu_depreciation_ops.move:131) is what fires E_SHOP_WRONG_SSU.
    // gov_b/members_b are intentionally left un-consumed before the terminal abort -- Move does
    // not require resource consumption on an aborting path (same precedent every other test in
    // this file, and every test in shop_close_recovery_abort_tests.move, already relies on).
    #[test]
    #[expected_failure(abort_code = bazaar_shop_ops::ssu_depreciation_ops::E_SHOP_WRONG_SSU)]
    fun test_prune_shop_wrong_ssu_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);

        // gov_a: the SSU actually under prune (SSU_A) -- depreciated below.
        let mut gov_a = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        // gov_b: a SECOND, ACTIVE governance for a DIFFERENT SSU (SSU_B) -- only this gov can
        // legally construct a shop whose ssu_id is SSU_B (assert_subject_in_governance).
        let gov_b = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_B, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        let members_b = membership::create_member_registry_for_testing(SSU_B, TRIBE_ID, ctx);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);

        // Legal construction: ssu_id(SSU_B) == gov_b.ssu_id(SSU_B) -- assert_subject_in_governance
        // passes; assert_matches_gov (type+tribe only) also passes.
        let shop_id = close_helpers::make_wts_shop_empty(
            &mut registry, &gov_b, &members_b, SSU_B, TRIBE_ID, BAZAAR_TYPE, &clk, ctx,
        );

        gov_helpers::set_depreciated_for_testing(&mut gov_a);
        // Pool bound to SSU_A (gov_a's own SSU) so the whole-call E_POOL_WRONG_SSU precondition
        // passes and the per-row loop is actually reached.
        let mut pool = wtb_escrow_pool::create_for_testing(SSU_A, ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

        // gov_a (SSU_A) prunes a page containing SSU_B's shop -- per-row SSU mismatch aborts.
        ssu_depreciation_ops::prune_depreciated_shops_page(
            &mut registry, &gov_a, &mut pool, vector[shop_id], &cap_store, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 3 — E_POOL_WRONG_SSU: pool belongs to a different SSU than gov =====
    #[test]
    #[expected_failure(abort_code = bazaar_shop_ops::ssu_depreciation_ops::E_POOL_WRONG_SSU)]
    fun test_prune_pool_wrong_ssu_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        gov_helpers::set_depreciated_for_testing(&mut gov);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let mut pool = wtb_escrow_pool::create_for_testing(SSU_B, ctx); // wrong SSU
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

        ssu_depreciation_ops::prune_depreciated_shops_page(
            &mut registry, &gov, &mut pool,
            vector[object::id_from_address(@0x9999)],
            &cap_store, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 4 — E_PAGINATION_ZERO: empty page =====
    #[test]
    #[expected_failure(abort_code = bazaar_shop_ops::ssu_depreciation_ops::E_PAGINATION_ZERO)]
    fun test_prune_pagination_zero_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        gov_helpers::set_depreciated_for_testing(&mut gov);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let mut pool = wtb_escrow_pool::create_for_testing(SSU_A, ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

        ssu_depreciation_ops::prune_depreciated_shops_page(
            &mut registry, &gov, &mut pool, vector[], &cap_store, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 5 — E_BATCH_TOO_LARGE: 101-row page =====
    #[test]
    #[expected_failure(abort_code = bazaar_shop_ops::ssu_depreciation_ops::E_BATCH_TOO_LARGE)]
    fun test_prune_batch_too_large_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let mut gov = gov_helpers::create_for_testing_with_dummy_ids(
            SSU_A, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
        );
        gov_helpers::set_depreciated_for_testing(&mut gov);
        let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
        let mut pool = wtb_escrow_pool::create_for_testing(SSU_A, ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

        let mut ids = vector::empty<ID>();
        let mut i = 0u64;
        while (i < 101) {
            vector::push_back(&mut ids, object::id_from_address(@0x1));
            i = i + 1;
        };

        ssu_depreciation_ops::prune_depreciated_shops_page(
            &mut registry, &gov, &mut pool, ids, &cap_store, &clk, ctx,
        );
        abort 0 // unreachable
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
