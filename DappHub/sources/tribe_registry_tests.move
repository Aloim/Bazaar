// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// DappHub/sources/tribe_registry_tests.move
// MAX 500 LINES — DO NOT EXCEED
#[test_only]
module dapp_hub::tribe_registry_tests {
    use std::string;
    use std::option;
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use dapp_hub::tribe_registry::{Self, TribeRegistry, TribeLeaderCap};
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;

    // --- Test Addresses ---
    const ALICE: address = @0xA11CE;
    const SSU_1: address = @0x551;
    const SSU_2: address = @0x552;

    // --- Helpers ---

    fun make_registry(ctx: &mut TxContext): TribeRegistry {
        tribe_registry::create_for_testing(ctx)
    }

    fun make_easy_tribe(
        registry: &mut TribeRegistry,
        ctx: &mut TxContext,
    ): TribeLeaderCap {
        let clock = clock::create_for_testing(ctx);
        let config = dapp_governance::create_config_for_testing(ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
        let cap = tribe_registry::create_easy_tribe(
            registry, &config, &mut wallet, coin::zero<EVE>(ctx),
            b"TestTribe", b"A tribe", 0, 0, &clock, ctx,
        );
        clock::destroy_for_testing(clock);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        cap
    }

    // ===== T01: test_init_state =====

    #[test]
    fun test_init_state() {
        let mut ctx = tx_context::dummy();
        let registry = make_registry(&mut ctx);

        assert!(tribe_registry::tribe_count(&registry) == 0, 0);

        test_utils::destroy(registry);
    }

    // ===== T02: test_create_easy_tribe =====

    #[test]
    fun test_create_easy_tribe() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);

        let cap = tribe_registry::create_easy_tribe(
            &mut registry, &config, &mut wallet, coin::zero<EVE>(&mut ctx),
            b"TestTribe", b"A tribe", 0, 0, &clock, &mut ctx,
        );

        // Cap assertions
        assert!(tribe_registry::cap_tribe_id(&cap) == 1, 0);
        // Registry count
        assert!(tribe_registry::tribe_count(&registry) == 1, 0);

        // Tribe field assertions
        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        assert!(*tribe_registry::tribe_name(tribe) == string::utf8(b"TestTribe"), 0);
        assert!(*tribe_registry::tribe_description(tribe) == string::utf8(b"A tribe"), 0);
        // bazaar_type for easy tribe == 1
        assert!(tribe_registry::tribe_bazaar_type(tribe) == 1, 0);
        assert!(tribe_registry::tribe_join_policy(tribe) == 0, 0);
        assert!(tribe_registry::tribe_is_active(tribe) == true, 0);
        assert!(tribe_registry::tribe_ssu_count(tribe) == 0, 0);
        assert!(tribe_registry::tribe_member_count(tribe) == 0, 0);
        assert!(tribe_registry::tribe_id_val(tribe) == 1, 0);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        clock::destroy_for_testing(clock);
    }

    // ===== T03: test_create_advanced_tribe =====

    #[test]
    fun test_create_advanced_tribe() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);

        let cap = tribe_registry::create_advanced_tribe(
            &mut registry, &config, &mut wallet, coin::zero<EVE>(&mut ctx),
            b"AdvTribe", b"Desc", b"AdvToken", b"ADV", 1, 0, &clock, &mut ctx,
        );

        assert!(tribe_registry::cap_tribe_id(&cap) == 1, 0);
        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        // bazaar_type for advanced tribe == 2
        assert!(tribe_registry::tribe_bazaar_type(tribe) == 2, 0);
        assert!(tribe_registry::tribe_join_policy(tribe) == 1, 0);
        assert!(*tribe_registry::tribe_name(tribe) == string::utf8(b"AdvTribe"), 0);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        clock::destroy_for_testing(clock);
    }

    // ===== T04: test_deactivate_tribe =====

    #[test]
    fun test_deactivate_tribe() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let cap = make_easy_tribe(&mut registry, &mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // Tribe must be active before deactivation
        assert!(tribe_registry::tribe_is_active(tribe_registry::tribe_by_id(&registry, 1)) == true, 0);

        tribe_registry::deactivate_tribe(&cap, &mut registry, &clock, &ctx);

        assert!(tribe_registry::tribe_is_active(tribe_registry::tribe_by_id(&registry, 1)) == false, 0);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
        clock::destroy_for_testing(clock);
    }

    // ===== T05: test_add_ssu_to_tribe =====

    #[test]
    fun test_add_ssu_to_tribe() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let cap = make_easy_tribe(&mut registry, &mut ctx);

        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_1);
        assert!(tribe_registry::tribe_ssu_count(tribe_registry::tribe_by_id(&registry, 1)) == 1, 0);

        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_2);
        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        assert!(tribe_registry::tribe_ssu_count(tribe) == 2, 0);
        assert!(tribe_registry::tribe_has_ssu(tribe, SSU_1), 0);
        assert!(tribe_registry::tribe_has_ssu(tribe, SSU_2), 0);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }

    // ===== T06: test_remove_ssu_from_tribe =====

    #[test]
    fun test_remove_ssu_from_tribe() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let cap = make_easy_tribe(&mut registry, &mut ctx);

        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_1);
        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_2);

        tribe_registry::remove_ssu_from_tribe(&cap, &mut registry, SSU_1);

        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        assert!(tribe_registry::tribe_ssu_count(tribe) == 1, 0);
        assert!(!tribe_registry::tribe_has_ssu(tribe, SSU_1), 0);
        assert!(tribe_registry::tribe_has_ssu(tribe, SSU_2), 0);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }

    // ===== T07: test_duplicate_ssu_aborts =====

    #[test]
    #[expected_failure(abort_code = 7)]
    fun test_duplicate_ssu_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let cap = make_easy_tribe(&mut registry, &mut ctx);

        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_1);
        // Second add of same SSU must abort with E_SSU_ALREADY_IN_TRIBE (7)
        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_1);

        abort 0
    }

    // ===== T08: test_accessor_round_trips =====

    #[test]
    fun test_accessor_round_trips() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);

        let cap = tribe_registry::create_easy_tribe(
            &mut registry, &config, &mut wallet, coin::zero<EVE>(&mut ctx),
            b"RoundTrip", b"RTDesc", 1, 0, &clock, &mut ctx,
        );

        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        assert!(*tribe_registry::tribe_name(tribe) == string::utf8(b"RoundTrip"), 0);
        assert!(*tribe_registry::tribe_description(tribe) == string::utf8(b"RTDesc"), 0);
        assert!(tribe_registry::tribe_bazaar_type(tribe) == 1, 0);
        assert!(tribe_registry::tribe_join_policy(tribe) == 1, 0);
        assert!(tribe_registry::tribe_is_active(tribe) == true, 0);
        assert!(tribe_registry::tribe_ssu_count(tribe) == 0, 0);
        assert!(tribe_registry::tribe_member_count(tribe) == 0, 0);
        assert!(tribe_registry::tribe_id_val(tribe) == 1, 0);
        // created_at must be 0 since clock is freshly created (no advance)
        assert!(tribe_registry::tribe_created_at(tribe) == 0, 0);
        // leader == tx_context::dummy() sender (a fixed address)
        assert!(tribe_registry::tribe_leader(tribe) == tx_context::sender(&ctx), 0);

        assert!(tribe_registry::cap_tribe_id(&cap) == 1, 0);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        clock::destroy_for_testing(clock);
    }

    // ===== T09: test_invalid_bazaar_type_aborts =====
    // Requires: create_tribe_for_testing prerequisite added to tribe_registry.move

    #[test]
    #[expected_failure(abort_code = 5)]
    fun test_invalid_bazaar_type_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // bazaar_type=99 is invalid — must abort with E_INVALID_BAZAAR_TYPE (5)
        let _cap = tribe_registry::create_tribe_for_testing(
            &mut registry, b"Bad", b"Desc", option::none(), option::none(), 99, 0, 0, &clock, &mut ctx,
        );

        abort 0
    }

    // ===== T10: test_invalid_join_policy_aborts =====
    // Requires: create_tribe_for_testing prerequisite added to tribe_registry.move

    #[test]
    #[expected_failure(abort_code = 6)]
    fun test_invalid_join_policy_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // bazaar_type=1 (valid), join_policy=99 (invalid) — must abort with E_INVALID_JOIN_POLICY (6)
        let _cap = tribe_registry::create_tribe_for_testing(
            &mut registry, b"Bad", b"Desc", option::none(), option::none(), 1, 99, 0, &clock, &mut ctx,
        );

        abort 0
    }
}
// END OF FILE — dapp_hub::tribe_registry_tests

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
