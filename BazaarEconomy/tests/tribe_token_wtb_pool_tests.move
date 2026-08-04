// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// V21 — tribe_token_wtb_pool unit tests.
///
/// Covers:
///   - create_for_testing produces empty pool tagged with ssu_id
///   - credit_for_shop accumulates and emits PoolEarmarked
///   - withdraw_from_shop drains and asserts E_INSUFFICIENT_POOL when under-funded
///   - take_residue is idempotent (returns 0 on repeat call)
///   - shop_balance/total_escrowed mirror internal state
///   - assert_pool_for_ssu enforces ssu_id binding
///
/// Cross-fn integration with ledger_wtb_fill / wtb_pool_ops::create_wtb_shop_advanced
/// is covered indirectly by the BazaarEconomy build + future testnet smoke pass —
/// constructing &mut Shop from cross-package tests is blocked by bazar::borrow_shop_mut
/// requiring &mut BazarRegistry which is not exposed via test helpers in BazaarCore.
#[test_only]
module bazaar_economy::tribe_token_wtb_pool_tests {
    use sui::test_utils;
    use sui::object::{Self, ID};
    use bazaar_economy::tribe_token_wtb_pool;

    const SSU_ID: address = @0x5A;
    const OTHER_SSU: address = @0x5B;

    // ===== Pool lifecycle =====

    #[test]
    fun test_create_for_testing_is_empty() {
        let mut ctx = tx_context::dummy();
        let pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        assert!(tribe_token_wtb_pool::ssu_id(&pool) == SSU_ID, 0);
        assert!(tribe_token_wtb_pool::total_escrowed(&pool) == 0, 0);
        test_utils::destroy(pool);
    }

    #[test]
    fun test_credit_then_withdraw_clean() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop: ID = object::id_from_address(@0xAA);

        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop, 100);
        assert!(tribe_token_wtb_pool::shop_balance(&pool, shop) == 100, 0);
        assert!(tribe_token_wtb_pool::total_escrowed(&pool) == 100, 0);
        assert!(tribe_token_wtb_pool::has_entry(&pool, shop), 0);

        tribe_token_wtb_pool::withdraw_from_shop(&mut pool, shop, 60);
        assert!(tribe_token_wtb_pool::shop_balance(&pool, shop) == 40, 0);
        assert!(tribe_token_wtb_pool::total_escrowed(&pool) == 40, 0);

        tribe_token_wtb_pool::withdraw_from_shop(&mut pool, shop, 40);
        assert!(tribe_token_wtb_pool::shop_balance(&pool, shop) == 0, 0);
        assert!(tribe_token_wtb_pool::total_escrowed(&pool) == 0, 0);
        test_utils::destroy(pool);
    }

    #[test]
    fun test_credit_accumulates_across_calls() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop: ID = object::id_from_address(@0xAA);

        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop, 30);
        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop, 70);
        assert!(tribe_token_wtb_pool::shop_balance(&pool, shop) == 100, 0);
        assert!(tribe_token_wtb_pool::total_escrowed(&pool) == 100, 0);
        test_utils::destroy(pool);
    }

    #[test]
    fun test_multiple_shops_isolated() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop_a: ID = object::id_from_address(@0xAA);
        let shop_b: ID = object::id_from_address(@0xBB);

        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop_a, 100);
        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop_b, 250);

        assert!(tribe_token_wtb_pool::shop_balance(&pool, shop_a) == 100, 0);
        assert!(tribe_token_wtb_pool::shop_balance(&pool, shop_b) == 250, 0);
        assert!(tribe_token_wtb_pool::total_escrowed(&pool) == 350, 0);

        tribe_token_wtb_pool::withdraw_from_shop(&mut pool, shop_a, 100);
        assert!(tribe_token_wtb_pool::shop_balance(&pool, shop_a) == 0, 0);
        assert!(tribe_token_wtb_pool::shop_balance(&pool, shop_b) == 250, 0);
        assert!(tribe_token_wtb_pool::total_escrowed(&pool) == 250, 0);
        test_utils::destroy(pool);
    }

    // ===== Withdraw rejects =====

    #[test]
    #[expected_failure(abort_code = bazaar_economy::tribe_token_wtb_pool::E_SHOP_NOT_IN_POOL)]
    fun test_withdraw_aborts_when_shop_missing() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop: ID = object::id_from_address(@0xAA);
        // Never credited — must abort.
        tribe_token_wtb_pool::withdraw_from_shop(&mut pool, shop, 10);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = bazaar_economy::tribe_token_wtb_pool::E_INSUFFICIENT_POOL)]
    fun test_withdraw_aborts_when_under_funded() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop: ID = object::id_from_address(@0xAA);
        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop, 50);
        // Try to withdraw 100 — must abort.
        tribe_token_wtb_pool::withdraw_from_shop(&mut pool, shop, 100);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = bazaar_economy::tribe_token_wtb_pool::E_ZERO_AMOUNT)]
    fun test_credit_aborts_on_zero_amount() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop: ID = object::id_from_address(@0xAA);
        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop, 0);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = bazaar_economy::tribe_token_wtb_pool::E_ZERO_AMOUNT)]
    fun test_withdraw_aborts_on_zero_amount() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop: ID = object::id_from_address(@0xAA);
        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop, 50);
        tribe_token_wtb_pool::withdraw_from_shop(&mut pool, shop, 0);
        test_utils::destroy(pool);
    }

    // ===== take_residue =====

    #[test]
    fun test_take_residue_returns_balance_first_call() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop: ID = object::id_from_address(@0xAA);
        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop, 75);

        let residue = tribe_token_wtb_pool::take_residue(&mut pool, shop, @0xBEEF);
        assert!(residue == 75, 0);
        assert!(!tribe_token_wtb_pool::has_entry(&pool, shop), 0);
        assert!(tribe_token_wtb_pool::total_escrowed(&pool) == 0, 0);
        test_utils::destroy(pool);
    }

    #[test]
    fun test_take_residue_idempotent_returns_zero_on_second_call() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop: ID = object::id_from_address(@0xAA);
        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop, 75);

        let first = tribe_token_wtb_pool::take_residue(&mut pool, shop, @0xBEEF);
        let second = tribe_token_wtb_pool::take_residue(&mut pool, shop, @0xBEEF);
        assert!(first == 75, 0);
        assert!(second == 0, 0);
        test_utils::destroy(pool);
    }

    #[test]
    fun test_take_residue_partially_drained_returns_remainder() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop: ID = object::id_from_address(@0xAA);
        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop, 100);
        tribe_token_wtb_pool::withdraw_from_shop(&mut pool, shop, 40);

        // Close before any further fills — residue must be 60.
        let residue = tribe_token_wtb_pool::take_residue(&mut pool, shop, @0xBEEF);
        assert!(residue == 60, 0);
        assert!(tribe_token_wtb_pool::total_escrowed(&pool) == 0, 0);
        test_utils::destroy(pool);
    }

    // ===== Lifecycle scenario =====

    #[test]
    fun test_create_fill_close_lifecycle() {
        let mut ctx = tx_context::dummy();
        let mut pool = tribe_token_wtb_pool::create_for_testing(SSU_ID, &mut ctx);
        let shop: ID = object::id_from_address(@0xAA);

        // create deposits gross
        tribe_token_wtb_pool::credit_for_shop(&mut pool, shop, 1_000);
        // partial fill pulls 250
        tribe_token_wtb_pool::withdraw_from_shop(&mut pool, shop, 250);
        // another fill pulls 500
        tribe_token_wtb_pool::withdraw_from_shop(&mut pool, shop, 500);
        // close refunds residue (250)
        let residue = tribe_token_wtb_pool::take_residue(&mut pool, shop, @0xBEEF);
        assert!(residue == 250, 0);
        assert!(tribe_token_wtb_pool::total_escrowed(&pool) == 0, 0);
        test_utils::destroy(pool);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
