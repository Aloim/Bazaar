// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// OS-28 closure — 6 tests (TA-01..06)
// Covers: set_tribe_gov_id accept (None→Some), second-call abort E_ALREADY_SET,
//         set_tribe_economy_ids accept-then-reject, cap-mismatch abort E_NOT_TRIBE_LEADER,
//         accessor unwrap correctness, default-None baseline.
// Reference: OverhaulStubFixPlan.md §4 R6.6.2
// Reference: TA-overhaul-r6.6-stub-fix-tests.md §TA-01..06

#[test_only]
module dapp_hub::tribe_registry_assets_tests {
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use dapp_hub::tribe_registry::{Self, TribeRegistry, TribeLeaderCap};
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use std::option;

    const ALICE: address    = @0xA11CE;
    const GOV_ID: address   = @0xAA01;
    const VAULT_ID: address = @0xAA02;
    const LEDGER_ID: address = @0xAA03;
    const EXCHANGE_ID: address = @0xAA04;
    const BOARD_ID: address = @0xAA05;
    // V16 — MintBurnQueue id (5th address arg in set_tribe_economy_ids)
    const QUEUE_ID: address = @0xAA06;

    // --- Helper: create a TribeRegistry ---
    fun make_registry(ctx: &mut TxContext): TribeRegistry {
        tribe_registry::create_for_testing(ctx)
    }

    // --- Helper: create an Easy tribe, return its TribeLeaderCap ---
    // Returns (cap, tribe_id). tribe_id is deterministic: 1 for first tribe, 2 for second, etc.
    fun make_easy_tribe(registry: &mut TribeRegistry, ctx: &mut TxContext): (TribeLeaderCap, u64) {
        let clk = clock::create_for_testing(ctx);
        let config = dapp_governance::create_config_for_testing(ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
        let cap = tribe_registry::create_easy_tribe(
            registry, &config, &mut wallet, coin::zero<EVE>(ctx),
            b"TestTribe", b"Desc", 0, 0, &clk, ctx,
        );
        let tid = tribe_registry::cap_tribe_id(&cap);
        clock::destroy_for_testing(clk);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        (cap, tid)
    }

    // ===== TA-01: set_tribe_gov_id accepts when field is None =====

    #[test]
    fun ta01_set_tribe_gov_id_succeeds() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let (cap, tribe_id) = make_easy_tribe(&mut registry, &mut ctx);

        // Field should be None at creation
        let tribe = tribe_registry::tribe_by_id(&registry, tribe_id);
        assert!(option::is_none(&tribe_registry::tribe_gov_id(tribe)), 0);

        // Set for the first time — must succeed
        let clk = clock::create_for_testing(&mut ctx);
        tribe_registry::set_tribe_gov_id(&cap, &mut registry, tribe_id, GOV_ID, &clk, &ctx);

        let tribe_after = tribe_registry::tribe_by_id(&registry, tribe_id);
        let stored = tribe_registry::tribe_gov_id(tribe_after);
        assert!(option::is_some(&stored), 1);
        assert!(*option::borrow(&stored) == GOV_ID, 2);

        clock::destroy_for_testing(clk);
        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }

    // ===== TA-02: set_tribe_gov_id aborts E_ALREADY_SET on second call =====
    // Decision #2 (one-shot) — prevents compromised-cap DoS (SA-R6.6-11).

    #[test]
    #[expected_failure(abort_code = dapp_hub::tribe_registry::E_ALREADY_SET)]
    fun ta02_set_tribe_gov_id_second_call_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let (cap, tribe_id) = make_easy_tribe(&mut registry, &mut ctx);

        let clk = clock::create_for_testing(&mut ctx);
        // First call — succeeds
        tribe_registry::set_tribe_gov_id(&cap, &mut registry, tribe_id, GOV_ID, &clk, &ctx);
        // Second call — must abort E_ALREADY_SET
        tribe_registry::set_tribe_gov_id(&cap, &mut registry, tribe_id, @0xBEEF, &clk, &ctx);

        clock::destroy_for_testing(clk);
        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }

    // ===== TA-03: set_tribe_economy_ids accepts when all four fields are None =====

    #[test]
    fun ta03_set_tribe_economy_ids_succeeds() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let (cap, tribe_id) = make_easy_tribe(&mut registry, &mut ctx);

        let clk = clock::create_for_testing(&mut ctx);
        tribe_registry::set_tribe_economy_ids(
            &cap, &mut registry, tribe_id,
            VAULT_ID, LEDGER_ID, EXCHANGE_ID, BOARD_ID, QUEUE_ID,
            &clk, &ctx,
        );

        let tribe = tribe_registry::tribe_by_id(&registry, tribe_id);
        assert!(*option::borrow(&tribe_registry::tribe_vault_id(tribe)) == VAULT_ID, 0);
        assert!(*option::borrow(&tribe_registry::tribe_token_ledger_id(tribe)) == LEDGER_ID, 1);
        assert!(*option::borrow(&tribe_registry::tribe_exchange_config_id(tribe)) == EXCHANGE_ID, 2);
        assert!(*option::borrow(&tribe_registry::tribe_withdrawal_board_id(tribe)) == BOARD_ID, 3);
        assert!(*option::borrow(&tribe_registry::tribe_mint_burn_queue_id(tribe)) == QUEUE_ID, 4);

        clock::destroy_for_testing(clk);
        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }

    // ===== TA-04: set_tribe_economy_ids aborts E_ALREADY_SET on second call =====

    #[test]
    #[expected_failure(abort_code = dapp_hub::tribe_registry::E_ALREADY_SET)]
    fun ta04_set_tribe_economy_ids_second_call_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let (cap, tribe_id) = make_easy_tribe(&mut registry, &mut ctx);

        let clk = clock::create_for_testing(&mut ctx);
        // First call — succeeds
        tribe_registry::set_tribe_economy_ids(
            &cap, &mut registry, tribe_id,
            VAULT_ID, LEDGER_ID, EXCHANGE_ID, BOARD_ID, QUEUE_ID,
            &clk, &ctx,
        );
        // Second call — must abort E_ALREADY_SET
        tribe_registry::set_tribe_economy_ids(
            &cap, &mut registry, tribe_id,
            @0xBB, @0xCC, @0xDD, @0xEE, @0xFF,
            &clk, &ctx,
        );

        clock::destroy_for_testing(clk);
        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }

    // ===== TA-05: set_tribe_gov_id aborts E_NOT_TRIBE_LEADER on cap-mismatch =====
    // CC-001 fix: setter takes explicit tribe_id param. Passing cap_2 (tribe_id=2) with
    // tribe_id=1 triggers assert!(cap.tribe_id == tribe_id, E_NOT_TRIBE_LEADER) BEFORE
    // any table lookup. This is now a proper ABORT test per the locked spec (§4 R6.6.2).
    // Rev 1 had this as a correctness test (cap-only lookup); CC-001 changed the design.

    #[test]
    #[expected_failure(abort_code = dapp_hub::tribe_registry::E_NOT_TRIBE_LEADER)]
    fun ta05_wrong_tribe_id_aborts_e_not_tribe_leader() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let (cap_1, tribe_id_1) = make_easy_tribe(&mut registry, &mut ctx); // tribe_id = 1
        let (cap_2, _tribe_id_2) = make_easy_tribe(&mut registry, &mut ctx); // tribe_id = 2

        let clk = clock::create_for_testing(&mut ctx);
        // cap_2 (tribe_id=2) passed with tribe_id=1 → E_NOT_TRIBE_LEADER fires immediately
        tribe_registry::set_tribe_gov_id(&cap_2, &mut registry, tribe_id_1, GOV_ID, &clk, &ctx);

        clock::destroy_for_testing(clk);
        test_utils::destroy(cap_1);
        test_utils::destroy(cap_2);
        test_utils::destroy(registry);
    }

    // ===== TA-06: new tribe fields default to None =====
    // Baseline structural test — freshly created tribe has all 4 Option<address> fields None.

    #[test]
    fun ta06_new_tribe_fields_default_to_none() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let (cap, tribe_id) = make_easy_tribe(&mut registry, &mut ctx);

        let tribe = tribe_registry::tribe_by_id(&registry, tribe_id);
        assert!(option::is_none(&tribe_registry::tribe_gov_id(tribe)), 0);
        assert!(option::is_none(&tribe_registry::tribe_vault_id(tribe)), 1);
        assert!(option::is_none(&tribe_registry::tribe_token_ledger_id(tribe)), 2);
        assert!(option::is_none(&tribe_registry::tribe_exchange_config_id(tribe)), 3);
        assert!(option::is_none(&tribe_registry::tribe_withdrawal_board_id(tribe)), 4);
        assert!(option::is_none(&tribe_registry::tribe_mint_burn_queue_id(tribe)), 5);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
