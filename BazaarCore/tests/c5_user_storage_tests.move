// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// C5 / GAS-03 locking tests: UserStorage nested Table reshape.
///
/// Tests the four invariants required by the plan §11 row C5 and the security
/// review GAS-03 guardrails:
///
///   C5-STORE-01: multi-type deposit — two different item_type_ids → separate rows
///                in the inner Table; total_item_count reflects both.
///   C5-MERGE-01: same-type merge — identical item_type_id deposited twice → single
///                inner-Table row with accumulated quantity; no duplicate row.
///   C5-WITHDRAW-01: partial keyed withdraw — deposit TYPE_A (qty 10) + TYPE_B (qty 20);
///                   withdraw TYPE_A only → TYPE_A gone, TYPE_B intact, total_item_count == 20.
///   C5-CAP-01: volume cap enforced — the nested Table reshape does NOT bypass
///              the E_VOLUME_LIMIT_EXCEEDED assert.
///
/// COVGAP C5-COVGAP-01: full WTS buy e2e test (shop + payment + item delivery) with the new
/// inner Table shape — deferred to test-architect; requires a full bazaar_core shop setup and
/// EVE coin minting stubs not available in the BazaarCore test harness directly. The A5/GAS-14
/// integration suite (test_tax_deposits.move) exercises the wts_buy_* → store_purchased_items_g
/// path end-to-end and will catch any shape mismatch there.
#[test_only]
module bazaar_core::c5_user_storage_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::test_utils;
    use bazaar_core::user_storage::{Self, UserStorage};
    use bazaar_core::membership::{Self, SSUOwnerCap};

    // ===== Test Constants =====
    const OWNER: address = @0xA1;
    const SSU:   address = @0xB1;
    const BUYER: address = @0xC1;
    const TRIBE_ID: u64 = 0;
    const TYPE_A: u64 = 100;
    const TYPE_B: u64 = 200;
    const QTY_A: u64  = 10;
    const QTY_B: u64  = 20;

    // ===== C5-STORE-01: multi-type deposit → separate inner-Table rows =====
    //
    // Sequence:
    //   1. Setup storage (limit = VOLUME_LIMIT_UNLIMITED, use default from create_for_testing).
    //   2. Deposit TYPE_A qty 10 for BUYER.
    //   3. Deposit TYPE_B qty 20 for BUYER.
    //   4. Assert: inner Table has 2 distinct rows.
    //   5. Assert: TYPE_A quantity == 10, TYPE_B quantity == 20.
    //   6. Assert: total_item_count == 30 (exact lockstep).
    #[test]
    fun test_multi_type_deposit_separate_rows() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let storage = user_storage::create_for_testing(SSU, ctx);
            user_storage::share_for_testing(storage);
        };

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let clk = clock::create_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(SSU, TRIBE_ID, ts::ctx(&mut scenario));
            // Deposit TYPE_A qty 10
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, TYPE_A, QTY_A, option::none(), &clk, ts::ctx(&mut scenario),
            );
            // Deposit TYPE_B qty 20
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, TYPE_B, QTY_B, option::none(), &clk, ts::ctx(&mut scenario),
            );
            // Two distinct rows in the inner Table
            assert!(user_storage::deposit_type_count_for_testing(&storage, BUYER) == 2, 0);
            // Per-key quantities
            assert!(user_storage::deposit_quantity_for_testing(&storage, BUYER, TYPE_A) == QTY_A, 1);
            assert!(user_storage::deposit_quantity_for_testing(&storage, BUYER, TYPE_B) == QTY_B, 2);
            // total_item_count exact lockstep
            assert!(user_storage::total_item_count(&storage) == QTY_A + QTY_B, 3);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
            ts::return_shared(storage);
        };

        ts::end(scenario);
    }

    // ===== C5-MERGE-01: same-type merge — quantity accumulates, one row =====
    //
    // Sequence:
    //   1. Deposit TYPE_A qty 7.
    //   2. Deposit TYPE_A qty 13 (same type_id).
    //   3. Assert: inner Table has exactly 1 row.
    //   4. Assert: TYPE_A quantity == 20 (7+13 merged).
    //   5. Assert: total_item_count == 20 (exact lockstep).
    #[test]
    fun test_same_type_merge_accumulates() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let storage = user_storage::create_for_testing(SSU, ctx);
            user_storage::share_for_testing(storage);
        };

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let clk = clock::create_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(SSU, TRIBE_ID, ts::ctx(&mut scenario));
            // Deposit TYPE_A twice
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, TYPE_A, 7, option::none(), &clk, ts::ctx(&mut scenario),
            );
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, TYPE_A, 13, option::none(), &clk, ts::ctx(&mut scenario),
            );
            // Exactly ONE row in the inner Table
            assert!(user_storage::deposit_type_count_for_testing(&storage, BUYER) == 1, 0);
            // Merged quantity
            assert!(user_storage::deposit_quantity_for_testing(&storage, BUYER, TYPE_A) == 20, 1);
            // total_item_count exact
            assert!(user_storage::total_item_count(&storage) == 20, 2);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
            ts::return_shared(storage);
        };

        ts::end(scenario);
    }

    // ===== C5-WITHDRAW-01: partial keyed withdraw + total_item_count lockstep =====
    //
    // Sequence:
    //   1. Deposit TYPE_A qty 10 + TYPE_B qty 20 for BUYER.
    //   2. Withdraw TYPE_A only (item_type_ids = [TYPE_A]).
    //   3. Assert: TYPE_A row gone (deposit_quantity == 0).
    //   4. Assert: TYPE_B still present, quantity == 20.
    //   5. Assert: total_item_count == 20 (exact: started 30, withdrew 10 → 20).
    //   6. Assert: inner Table now has 1 row (TYPE_B only).
    #[test]
    fun test_partial_keyed_withdraw() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let storage = user_storage::create_for_testing(SSU, ctx);
            user_storage::share_for_testing(storage);
        };

        // Deposit step — sender doesn't matter for store_purchased_items
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let clk = clock::create_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(SSU, TRIBE_ID, ts::ctx(&mut scenario));
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, TYPE_A, QTY_A, option::none(), &clk, ts::ctx(&mut scenario),
            );
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, TYPE_B, QTY_B, option::none(), &clk, ts::ctx(&mut scenario),
            );
            assert!(user_storage::total_item_count(&storage) == QTY_A + QTY_B, 0);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
            ts::return_shared(storage);
        };

        // Withdraw TYPE_A only — sender MUST be BUYER (withdraw_items checks ctx.sender())
        ts::next_tx(&mut scenario, BUYER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let clk = clock::create_for_testing(ts::ctx(&mut scenario));
            user_storage::withdraw_items(&mut storage, vector[TYPE_A], &clk, ts::ctx(&mut scenario));

            // TYPE_A gone
            assert!(user_storage::deposit_quantity_for_testing(&storage, BUYER, TYPE_A) == 0, 1);
            // TYPE_B intact
            assert!(user_storage::deposit_quantity_for_testing(&storage, BUYER, TYPE_B) == QTY_B, 2);
            // total_item_count exact after partial withdraw
            assert!(user_storage::total_item_count(&storage) == QTY_B, 3);
            // Inner Table now has 1 row (TYPE_B)
            assert!(user_storage::deposit_type_count_for_testing(&storage, BUYER) == 1, 4);

            clock::destroy_for_testing(clk);
            ts::return_shared(storage);
        };

        ts::end(scenario);
    }

    // ===== C5-CAP-01: volume cap still enforced with nested Table shape =====
    //
    // Confirms the GAS-03 security guardrail: the nested Table reshape does NOT
    // bypass the E_VOLUME_LIMIT_EXCEEDED assert.
    //
    // Sequence:
    //   1. Create storage with volume_limit = 25.
    //   2. Deposit TYPE_A qty 20 (cumulative = 20 <= 25, OK).
    //   3. Deposit TYPE_B qty 10 (cumulative = 30 > 25) → ABORT E_VOLUME_LIMIT_EXCEEDED.
    #[test]
    #[expected_failure(abort_code = bazaar_core::user_storage::E_VOLUME_LIMIT_EXCEEDED,
                       location = bazaar_core::user_storage)]
    fun test_volume_cap_enforced_with_nested_table() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let storage = user_storage::create_for_testing(SSU, ctx);
            let cap = membership::create_ssu_owner_cap_for_testing(SSU, TRIBE_ID, ctx);
            user_storage::share_for_testing(storage);
            sui::transfer::public_transfer(cap, OWNER);
        };

        // Set limit = 25
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let cap = ts::take_from_address<SSUOwnerCap>(&scenario, OWNER);
            let clk = clock::create_for_testing(ts::ctx(&mut scenario));
            user_storage::set_volume_limit(&cap, &mut storage, 25, &clk, ts::ctx(&mut scenario));
            clock::destroy_for_testing(clk);
            ts::return_shared(storage);
            ts::return_to_address(OWNER, cap);
        };

        // Deposit TYPE_A qty 20 — should pass (20 <= 25)
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let clk = clock::create_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(SSU, TRIBE_ID, ts::ctx(&mut scenario));
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, TYPE_A, 20, option::none(), &clk, ts::ctx(&mut scenario),
            );
            assert!(user_storage::total_item_count(&storage) == 20, 0);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
            ts::return_shared(storage);
        };

        // Deposit TYPE_B qty 10 — cumulative 30 > 25 → ABORT
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut storage = ts::take_shared<UserStorage>(&scenario);
            let clk = clock::create_for_testing(ts::ctx(&mut scenario));
            let members = membership::create_member_registry_for_testing(SSU, TRIBE_ID, ts::ctx(&mut scenario));
            user_storage::store_purchased_items(
                &mut storage, &members, BUYER, TYPE_B, 10, option::none(), &clk, ts::ctx(&mut scenario),
            );
            // Unreachable — test passes only if the above aborts
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
            ts::return_shared(storage);
        };

        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
