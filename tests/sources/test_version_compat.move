// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// tests/sources/test_version_compat.move
// Integration tests: version compatibility, governance claim, cap-store guards, role hierarchy.
// Covers T-VER-01 through T-VER-08.
// Constitution: Article XII.3 — 500-line limit. Current: ~370 lines.
#[test_only]
module bazaar_integration_tests::test_version_compat {
    use sui::clock;
    use sui::test_utils;
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use dapp_hub::tribe_registry;
    use bazaar_core::bazaar_core_admin;
    use bazaar_economy::economy_cap_store;
    use bazaar_economy::economy_governance;
    use bazaar_economy::tribe_token_ledger;
    use bazaar_economy::tribe_vault;
    use bazaar_economy::tribe_exchange;
    use bazaar_core::membership;
    use bazaar_core::tribe_governance;
    use bazaar_integration_tests::test_helpers;
    use bazaar_mission::stranger_registration;
    use bazaar_core::ssu_governance_test_helpers;

    // =========================================================
    // Constants
    // =========================================================
    const TRIBE_ID:  u64     = 1;
    const SSU_ADDR:  address = @0x55;
    const RESERVE:   u64     = 100_000_000;
    const LIQUIDITY: u64     = 200_000_000;
    const SWAP_IN:   u64     = 1_000_000;

    // =========================================================
    // Helper: build a cap store with ShopCap only (no TaxDepositCap).
    // Used by T-VER-06 to trigger the empty-store abort on borrow.
    // =========================================================
    fun make_shop_only_cap_store(ctx: &mut TxContext): economy_cap_store::EconomyCapStore {
        let shop_cap  = bazaar_core_admin::create_shop_cap_for_testing(@0x0, ctx);
        let owner_cap = dapp_governance::create_owner_cap_for_testing(ctx);
        let mut store = economy_cap_store::create_for_testing(ctx);
        economy_governance::receive_shop_cap(&mut store, shop_cap, &owner_cap);
        test_utils::destroy(owner_cap);
        store
    }

    // =========================================================
    // T-VER-01: DAppOwnerClaimBox — first claim succeeds
    // =========================================================
    #[test]
    fun test_dapp_owner_cap_claim() {
        let mut ctx = tx_context::dummy();

        let mut claim_box = dapp_governance::create_claim_box_for_testing(&mut ctx);
        assert!(dapp_governance::is_claimable(&claim_box), 0);

        let cap = dapp_governance::claim_ownership(&mut claim_box, &mut ctx);

        assert!(!dapp_governance::is_claimable(&claim_box), 1);

        test_utils::destroy(cap);
        test_utils::destroy(claim_box);
    }

    // =========================================================
    // T-VER-02: Second claim on already-claimed box aborts
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 1, location = dapp_hub::dapp_governance)]
    fun test_double_claim_aborts() {
        let mut ctx = tx_context::dummy();

        let mut claim_box = dapp_governance::create_claim_box_for_testing(&mut ctx);

        // First claim succeeds
        let cap = dapp_governance::claim_ownership(&mut claim_box, &mut ctx);

        // Second claim must abort E_ALREADY_CLAIMED = 1
        let cap2 = dapp_governance::claim_ownership(&mut claim_box, &mut ctx);

        // Cleanup (unreachable — abort expected above)
        test_utils::destroy(cap);
        test_utils::destroy(cap2);
        test_utils::destroy(claim_box);
    }

    // =========================================================
    // T-VER-03: GovernanceConfig default values
    // =========================================================
    #[test]
    fun test_governance_config_defaults() {
        let mut ctx = tx_context::dummy();

        let config = dapp_governance::create_config_for_testing(&mut ctx);

        assert!(dapp_governance::global_dapp_tax_bps(&config) == 200, 0);
        assert!(dapp_governance::version(&config) == 1, 1);

        test_utils::destroy(config);
    }

    // =========================================================
    // T-VER-04: Tax rate ceiling enforcement — 5001 bps aborts
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 2, location = dapp_hub::dapp_governance)]
    fun test_tax_rate_ceiling_enforcement() {
        let mut ctx = tx_context::dummy();

        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut config = dapp_governance::create_config_for_testing(&mut ctx);

        // 5001 bps exceeds the 5000 hard cap — must abort E_RATE_TOO_HIGH = 2
        dapp_governance::set_global_dapp_tax_rate(&owner_cap, &mut config, 5001);

        // Cleanup (unreachable — abort expected above)
        test_utils::destroy(owner_cap);
        test_utils::destroy(config);
    }

    // =========================================================
    // T-VER-05: EconomyCapStore — double TaxDepositCap store aborts
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 9, location = bazaar_economy::economy_cap_store)]
    fun test_economy_cap_store_double_store_aborts() {
        let mut ctx = tx_context::dummy();

        let owner_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut store = economy_cap_store::create_for_testing(&mut ctx);

        let cap1 = tax_wallet::create_deposit_cap_for_testing(&mut ctx);
        let cap2 = tax_wallet::create_deposit_cap_for_testing(&mut ctx);

        // First store succeeds
        economy_governance::receive_tax_deposit_cap(&mut store, cap1, &owner_cap);

        // Second store must abort E_CAP_ALREADY_STORED = 9
        economy_governance::receive_tax_deposit_cap(&mut store, cap2, &owner_cap);

        // Cleanup (unreachable — abort expected above)
        test_utils::destroy(owner_cap);
        test_utils::destroy(store);
    }

    // =========================================================
    // T-VER-06: Empty EconomyCapStore aborts borrow via swap path
    //
    // borrow_tax_deposit_cap is public(package), not directly callable.
    // We reach it through tribe_exchange::swap_eve_to_tokens.
    // The cap store has ShopCap loaded but NO TaxDepositCap.
    // Default tax is 200 bps (non-zero), so the swap attempts the borrow
    // and hits E_CAP_STORE_EMPTY = 8 in economy_cap_store.
    // =========================================================
    #[test]
    #[expected_failure(abort_code = 8, location = bazaar_economy::economy_cap_store)]
    fun test_cap_store_empty_aborts_borrow() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);

        let leader_cap  = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let mut ledger  = tribe_token_ledger::create_for_testing(TRIBE_ID, &clock, &mut ctx);
        let mut vault   = tribe_vault::create_for_testing(TRIBE_ID, &mut ctx);
        let mut config  = tribe_exchange::create_for_testing(TRIBE_ID, RESERVE, &clock, &mut ctx);
        let mut wallet  = tax_wallet::create_wallet_for_testing(&mut ctx);
        // Default 200 bps non-zero tax — borrow_tax_deposit_cap WILL be called
        let gov_config  = dapp_governance::create_config_for_testing(&mut ctx);
        // ShopCap loaded, TaxDepositCap deliberately omitted
        let cap_store   = make_shop_only_cap_store(&mut ctx);

        // Construct a minimal Advanced TribeGovernance so assert_advanced_external passes.
        let tribe_gov = tribe_governance::create_with_arbitrary_mode_for_testing(
            TRIBE_ID,
            2,           // bazaar_type = Advanced
            @0x0,        // leader address — irrelevant for this test
            0,           // governance_mode = CAPITALISTIC
            &clock,
            &mut ctx,
        );

        // Seed vault above reserve and activate exchange
        let liquidity = test_helpers::make_sui_coin(LIQUIDITY, &mut ctx);
        economy_governance::add_liquidity(&leader_cap, &tribe_gov, &mut vault, &ledger, liquidity, &clock, &mut ctx);
        tribe_exchange::set_active_for_testing(&mut config, true);

        // V28: pre-seed tribe wallet so the swap reaches the tax-cap borrow site.
        let gov_addr = object::id_address(&tribe_gov);
        tribe_token_ledger::mint_for_testing(&mut ledger, gov_addr, 100_000_000);

        let payment = test_helpers::make_sui_coin(SWAP_IN, &mut ctx);

        // swap_eve_to_tokens internally calls borrow_tax_deposit_cap → E_CAP_STORE_EMPTY = 8
        tribe_exchange::swap_eve_to_tokens(
            &mut ledger,
            &mut vault,
            &mut config,
            &tribe_gov,
            payment,
            &mut wallet,
            &gov_config,
            &cap_store,
            &clock,
            &mut ctx,
        );

        // Cleanup (unreachable — abort expected above)
        test_utils::destroy(leader_cap);
        test_utils::destroy(ledger);
        test_utils::destroy(vault);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(gov_config);
        test_utils::destroy(cap_store);
        tribe_governance::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-VER-07: MemberRegistry role hierarchy
    //
    // register_stranger uses tx_context::sender(ctx) as the player.
    // With tx_context::dummy(), sender is @0x0.
    // set_ssu_role requires cap.ssu_id == registry.ssu_id — both created
    // with SSU_ADDR so they match.
    // Role progression: STRANGER(0) → MEMBER(2) → MODERATOR(4).
    // =========================================================
    #[test]
    fun test_ssu_role_hierarchy() {
        let mut ctx = tx_context::dummy();
        let clock = test_helpers::create_test_clock(&mut ctx);

        let ssu = SSU_ADDR;
        let mut registry = membership::create_member_registry_for_testing(ssu, TRIBE_ID, &mut ctx);
        let cap = membership::create_ssu_owner_cap_for_testing(ssu, TRIBE_ID, &mut ctx);

        // R6.6.1: stranger_registration::register_stranger requires an SSUGovernance matching
        // the registry's ssu_id. Construct one with bazaar_type=1 (arbitrary for this test;
        // the test is about role hierarchy, not bazaar-type gates). ssu_id must equal SSU_ADDR.
        let gov = ssu_governance_test_helpers::create_for_testing_with_dummy_ids(
            ssu, 1, TRIBE_ID, @0xAD, &clock, &mut ctx,
        );

        // Resolve sender — dummy context sender
        let player = tx_context::sender(&ctx);

        // Player not yet registered — effective_role returns STRANGER = 0
        assert!(!membership::is_member(&registry, player), 0);
        assert!(!membership::is_moderator_or_above(&registry, player), 1);

        // Register as STRANGER
        stranger_registration::register_stranger(&gov, &mut registry, &clock, &mut ctx);
        assert!(!membership::is_member(&registry, player), 2);
        assert!(!membership::is_moderator_or_above(&registry, player), 3);

        // Promote to MEMBER (role 2)
        membership::set_ssu_role(&cap, &mut registry, player, 2, &mut ctx);
        assert!(membership::is_member(&registry, player), 4);
        assert!(!membership::is_moderator_or_above(&registry, player), 5);

        // Promote to MODERATOR (role 4)
        membership::set_ssu_role(&cap, &mut registry, player, 4, &mut ctx);
        assert!(membership::is_member(&registry, player), 6);
        assert!(membership::is_moderator_or_above(&registry, player), 7);

        // Verify effective_role returns highest of ssu_role/tribe_role
        // tribe_role is still STRANGER(0), ssu_role is MODERATOR(4) → effective = 4
        assert!(membership::effective_role(&registry, player) == 4, 8);

        test_utils::destroy(registry);
        test_utils::destroy(cap);
        ssu_governance_test_helpers::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    // =========================================================
    // T-VER-08: Valid tax rate at ceiling (5000 bps) is accepted
    // =========================================================
    #[test]
    fun test_valid_tax_rate_accepted() {
        let mut ctx = tx_context::dummy();

        let owner_cap  = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut config = dapp_governance::create_config_for_testing(&mut ctx);

        // 5000 bps is exactly at the hard cap — must succeed
        dapp_governance::set_global_dapp_tax_rate(&owner_cap, &mut config, 5000);

        assert!(dapp_governance::global_dapp_tax_bps(&config) == 5000, 0);

        test_utils::destroy(owner_cap);
        test_utils::destroy(config);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
