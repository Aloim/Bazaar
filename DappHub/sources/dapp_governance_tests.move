// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module dapp_hub::dapp_governance_tests {
    use sui::test_utils;
    use dapp_hub::dapp_governance::{Self, DAppOwnerCap, GovernanceConfig};

    // ===== Test Fixtures =====

    fun make_cap(ctx: &mut TxContext): DAppOwnerCap {
        dapp_governance::create_owner_cap_for_testing(ctx)
    }

    fun make_config(ctx: &mut TxContext): GovernanceConfig {
        dapp_governance::create_config_for_testing(ctx)
    }

    // ===== DG07: set_multiplayer_relay_url — set, overwrite, clear =====
    #[test]
    fun dg07_set_multiplayer_relay_url() {
        let mut ctx    = tx_context::dummy();
        let cap        = make_cap(&mut ctx);
        let mut config = make_config(&mut ctx);

        // Default is empty.
        assert!(dapp_governance::multiplayer_relay_url(&config) == std::string::utf8(b""), 0);

        // Set a URL.
        dapp_governance::set_multiplayer_relay_url(&cap, &mut config, b"wss://relay.example.com");
        assert!(
            dapp_governance::multiplayer_relay_url(&config) == std::string::utf8(b"wss://relay.example.com"),
            1,
        );

        // Overwrite with a different URL.
        dapp_governance::set_multiplayer_relay_url(&cap, &mut config, b"wss://other.example.com");
        assert!(
            dapp_governance::multiplayer_relay_url(&config) == std::string::utf8(b"wss://other.example.com"),
            2,
        );

        // Clear back to empty.
        dapp_governance::set_multiplayer_relay_url(&cap, &mut config, b"");
        assert!(dapp_governance::multiplayer_relay_url(&config) == std::string::utf8(b""), 3);

        test_utils::destroy(cap);
        test_utils::destroy(config);
    }

    // ===== DG08: all three per-type rates None => each getter falls back to global =====
    // Satisfies: test_pertype_unset_falls_back_to_global (design §8).
    // Sets global to a non-default value (500) first so the fallback is unambiguous.
    #[test]
    fun dg08_pertype_unset_falls_back_to_global() {
        let mut ctx    = tx_context::dummy();
        let cap        = make_cap(&mut ctx);
        let mut config = make_config(&mut ctx);

        // Set global to 500 (non-default) so fallback is distinguishable from a default rate.
        dapp_governance::set_global_dapp_tax_rate(&cap, &mut config, 500);

        // All per-type fields are None (fresh config) => each getter returns 500.
        assert!(dapp_governance::notribe_dapp_tax_bps(&config) == 500, 0);
        assert!(dapp_governance::easy_dapp_tax_bps(&config) == 500, 1);
        assert!(dapp_governance::advanced_exchange_dapp_tax_bps(&config) == 500, 2);

        test_utils::destroy(cap);
        test_utils::destroy(config);
    }

    // ===== DG09: Some(n) overrides global for each type =====
    // Satisfies: test_pertype_some_overrides_global (design §8).
    #[test]
    fun dg09_pertype_some_overrides_global() {
        let mut ctx    = tx_context::dummy();
        let cap        = make_cap(&mut ctx);
        let mut config = make_config(&mut ctx);

        // global stays at default 200; each per-type uses a distinct value.
        dapp_governance::set_notribe_dapp_tax_bps(&cap, &mut config, option::some(100u64));
        dapp_governance::set_easy_dapp_tax_bps(&cap, &mut config, option::some(300u64));
        dapp_governance::set_advanced_exchange_dapp_tax_bps(&cap, &mut config, option::some(150u64));

        assert!(dapp_governance::notribe_dapp_tax_bps(&config) == 100, 0);
        assert!(dapp_governance::easy_dapp_tax_bps(&config) == 300, 1);
        assert!(dapp_governance::advanced_exchange_dapp_tax_bps(&config) == 150, 2);
        // global unchanged.
        assert!(dapp_governance::global_dapp_tax_bps(&config) == 200, 3);

        test_utils::destroy(cap);
        test_utils::destroy(config);
    }

    // ===== DG10: Some(0) is deliberate exemption — NOT the global rate =====
    // Satisfies: test_pertype_some_zero_is_exempt_not_global (design §8, A4 unset-vs-zero).
    #[test]
    fun dg10_pertype_some_zero_is_exempt_not_global() {
        let mut ctx    = tx_context::dummy();
        let cap        = make_cap(&mut ctx);
        let mut config = make_config(&mut ctx);

        // global = 200; set each per-type to Some(0).
        dapp_governance::set_notribe_dapp_tax_bps(&cap, &mut config, option::some(0u64));
        dapp_governance::set_easy_dapp_tax_bps(&cap, &mut config, option::some(0u64));
        dapp_governance::set_advanced_exchange_dapp_tax_bps(&cap, &mut config, option::some(0u64));

        // 0 must be returned, NOT 200.
        assert!(dapp_governance::notribe_dapp_tax_bps(&config) == 0, 0);
        assert!(dapp_governance::easy_dapp_tax_bps(&config) == 0, 1);
        assert!(dapp_governance::advanced_exchange_dapp_tax_bps(&config) == 0, 2);

        test_utils::destroy(cap);
        test_utils::destroy(config);
    }

    // ===== DG11: set Some(n) then set None => falls back to global again =====
    // Satisfies: test_pertype_clear_back_to_global (design §8).
    #[test]
    fun dg11_pertype_clear_back_to_global() {
        let mut ctx    = tx_context::dummy();
        let cap        = make_cap(&mut ctx);
        let mut config = make_config(&mut ctx);

        // Set to Some(400), then clear with None, then check fallback to 200 (default global).
        dapp_governance::set_notribe_dapp_tax_bps(&cap, &mut config, option::some(400u64));
        assert!(dapp_governance::notribe_dapp_tax_bps(&config) == 400, 0);

        dapp_governance::set_notribe_dapp_tax_bps(&cap, &mut config, option::none());
        assert!(dapp_governance::notribe_dapp_tax_bps(&config) == 200, 1);  // 200 = default global

        // Same pattern for easy and advanced.
        dapp_governance::set_easy_dapp_tax_bps(&cap, &mut config, option::some(300u64));
        dapp_governance::set_easy_dapp_tax_bps(&cap, &mut config, option::none());
        assert!(dapp_governance::easy_dapp_tax_bps(&config) == 200, 2);

        dapp_governance::set_advanced_exchange_dapp_tax_bps(&cap, &mut config, option::some(250u64));
        dapp_governance::set_advanced_exchange_dapp_tax_bps(&cap, &mut config, option::none());
        assert!(dapp_governance::advanced_exchange_dapp_tax_bps(&config) == 200, 3);

        test_utils::destroy(cap);
        test_utils::destroy(config);
    }

    // ===== DG12: rate 5000 bps accepted on all three setters =====
    // Satisfies: test_pertype_set_5000_ok (design §8, C-A4 upper bound).
    #[test]
    fun dg12_pertype_set_5000_ok() {
        let mut ctx    = tx_context::dummy();
        let cap        = make_cap(&mut ctx);
        let mut config = make_config(&mut ctx);

        dapp_governance::set_notribe_dapp_tax_bps(&cap, &mut config, option::some(5000u64));
        dapp_governance::set_easy_dapp_tax_bps(&cap, &mut config, option::some(5000u64));
        dapp_governance::set_advanced_exchange_dapp_tax_bps(&cap, &mut config, option::some(5000u64));

        assert!(dapp_governance::notribe_dapp_tax_bps(&config) == 5000, 0);
        assert!(dapp_governance::easy_dapp_tax_bps(&config) == 5000, 1);
        assert!(dapp_governance::advanced_exchange_dapp_tax_bps(&config) == 5000, 2);

        test_utils::destroy(cap);
        test_utils::destroy(config);
    }

    // ===== DG13a: 5001 bps aborts on set_notribe_dapp_tax_bps =====
    // Satisfies: test_pertype_set_5001_aborts (design §8, C-A4).
    #[test]
    #[expected_failure(abort_code = dapp_hub::dapp_governance::E_RATE_TOO_HIGH)]
    fun dg13a_pertype_notribe_5001_aborts() {
        let mut ctx    = tx_context::dummy();
        let cap        = make_cap(&mut ctx);
        let mut config = make_config(&mut ctx);
        dapp_governance::set_notribe_dapp_tax_bps(&cap, &mut config, option::some(5001u64));
        abort 0 // unreachable
    }

    // ===== DG13b: 5001 bps aborts on set_easy_dapp_tax_bps =====
    #[test]
    #[expected_failure(abort_code = dapp_hub::dapp_governance::E_RATE_TOO_HIGH)]
    fun dg13b_pertype_easy_5001_aborts() {
        let mut ctx    = tx_context::dummy();
        let cap        = make_cap(&mut ctx);
        let mut config = make_config(&mut ctx);
        dapp_governance::set_easy_dapp_tax_bps(&cap, &mut config, option::some(5001u64));
        abort 0 // unreachable
    }

    // ===== DG13c: 5001 bps aborts on set_advanced_exchange_dapp_tax_bps =====
    #[test]
    #[expected_failure(abort_code = dapp_hub::dapp_governance::E_RATE_TOO_HIGH)]
    fun dg13c_pertype_advanced_5001_aborts() {
        let mut ctx    = tx_context::dummy();
        let cap        = make_cap(&mut ctx);
        let mut config = make_config(&mut ctx);
        dapp_governance::set_advanced_exchange_dapp_tax_bps(&cap, &mut config, option::some(5001u64));
        abort 0 // unreachable
    }

    // ===== DG14: None (clear) never aborts even if never set =====
    // Belt-and-suspenders: confirms None is always accepted on fresh config.
    #[test]
    fun dg14_pertype_none_on_fresh_config_ok() {
        let mut ctx    = tx_context::dummy();
        let cap        = make_cap(&mut ctx);
        let mut config = make_config(&mut ctx);

        // Fresh config already has None; setting None again is a no-op, should not abort.
        dapp_governance::set_notribe_dapp_tax_bps(&cap, &mut config, option::none());
        dapp_governance::set_easy_dapp_tax_bps(&cap, &mut config, option::none());
        dapp_governance::set_advanced_exchange_dapp_tax_bps(&cap, &mut config, option::none());

        // Values should still fall back to global (200).
        assert!(dapp_governance::notribe_dapp_tax_bps(&config) == 200, 0);
        assert!(dapp_governance::easy_dapp_tax_bps(&config) == 200, 1);
        assert!(dapp_governance::advanced_exchange_dapp_tax_bps(&config) == 200, 2);

        test_utils::destroy(cap);
        test_utils::destroy(config);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
