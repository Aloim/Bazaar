// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// DappHub/sources/tribe_registry_join_policy_tests.move
// Tests for set_join_policy_as_leader entry fn — R6.7.4 (OverhaulPlan1 OS-48 Path B)
// MAX 500 LINES — DO NOT EXCEED

#[test_only]
module dapp_hub::tribe_registry_join_policy_tests {
    use sui::clock;
    use sui::coin;
    use sui::object;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use world::access;
    use world::storage_unit::StorageUnit;
    use dapp_hub::tribe_registry::{Self, TribeRegistry};
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use dapp_hub::registration_helpers;

    // --- Helpers ---

    fun make_registry(ctx: &mut TxContext): TribeRegistry {
        tribe_registry::create_for_testing(ctx)
    }

    // Self-contained easy-tribe creator: builds its own clock + (zero-fee) config
    // + tax wallet + zero EVE payment, destroys all but the returned cap.
    fun mk_easy_tribe(
        registry: &mut TribeRegistry,
        name: vector<u8>,
        desc: vector<u8>,
        join_policy: u8,
        ctx: &mut TxContext,
    ): dapp_hub::tribe_registry::TribeLeaderCap {
        let clock = clock::create_for_testing(ctx);
        let config = dapp_governance::create_config_for_testing(ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
        let cap = tribe_registry::create_easy_tribe(
            registry, &config, &mut wallet, coin::zero<EVE>(ctx),
            name, desc, join_policy, 0, &clock, ctx,
        );
        clock::destroy_for_testing(clock);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        cap
    }

    fun make_easy_tribe_open(
        registry: &mut TribeRegistry,
        ctx: &mut TxContext,
    ): dapp_hub::tribe_registry::TribeLeaderCap {
        mk_easy_tribe(registry, b"TestTribe", b"A tribe", 0, ctx)
    }

    // ===== JP01: test_set_join_policy_open_to_application_succeeds =====

    #[test]
    fun test_set_join_policy_open_to_application_succeeds() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let cap = make_easy_tribe_open(&mut registry, &mut ctx);

        // Tribe is created with join_policy = 0 (open)
        assert!(tribe_registry::tribe_join_policy(tribe_registry::tribe_by_id(&registry, 1)) == 0, 0);

        // Change to application-required (1)
        registration_helpers::set_join_policy_as_leader(&cap, &mut registry, 1, &mut ctx);

        assert!(tribe_registry::tribe_join_policy(tribe_registry::tribe_by_id(&registry, 1)) == 1, 0);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }

    // ===== JP02: test_set_join_policy_application_to_open_succeeds =====

    #[test]
    fun test_set_join_policy_application_to_open_succeeds() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);

        // Create tribe with application-required policy (1)
        let cap = mk_easy_tribe(&mut registry, b"AppTribe", b"Desc", 1, &mut ctx);

        assert!(tribe_registry::tribe_join_policy(tribe_registry::tribe_by_id(&registry, 1)) == 1, 0);

        // Change back to open (0)
        registration_helpers::set_join_policy_as_leader(&cap, &mut registry, 0, &mut ctx);

        assert!(tribe_registry::tribe_join_policy(tribe_registry::tribe_by_id(&registry, 1)) == 0, 0);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }

    // ===== JP03: test_set_join_policy_invalid_value_aborts =====

    #[test]
    #[expected_failure(abort_code = 6)]
    fun test_set_join_policy_invalid_value_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let cap = make_easy_tribe_open(&mut registry, &mut ctx);

        // new_policy=99 is invalid — must abort with E_INVALID_JOIN_POLICY (6)
        registration_helpers::set_join_policy_as_leader(&cap, &mut registry, 99, &mut ctx);

        abort 0
    }

    // ===== JP04: test_set_join_policy_wrong_cap_controls_own_tribe_only =====
    // Design note: there is no "wrong tribe" abort path because cap.tribe_id is the SOLE
    // selector of which tribe gets mutated. A different cap simply mutates ITS OWN tribe.
    // This positive demo verifies that cap1 mutates only tribe 1 and leaves tribe 2 unchanged.

    #[test]
    fun test_set_join_policy_wrong_cap_controls_own_tribe_only() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);

        // Create tribe 1 (open) and tribe 2 (application-required)
        let cap1 = mk_easy_tribe(&mut registry, b"Tribe1", b"First", 0, &mut ctx);
        let cap2 = mk_easy_tribe(&mut registry, b"Tribe2", b"Second", 1, &mut ctx);

        // cap1 sets tribe 1 policy to application-required
        registration_helpers::set_join_policy_as_leader(&cap1, &mut registry, 1, &mut ctx);

        // Tribe 1 is now application-required
        assert!(tribe_registry::tribe_join_policy(tribe_registry::tribe_by_id(&registry, 1)) == 1, 0);
        // Tribe 2 is unchanged (still application-required from creation)
        assert!(tribe_registry::tribe_join_policy(tribe_registry::tribe_by_id(&registry, 2)) == 1, 0);

        // cap2 sets tribe 2 policy to open — does NOT affect tribe 1
        registration_helpers::set_join_policy_as_leader(&cap2, &mut registry, 0, &mut ctx);

        assert!(tribe_registry::tribe_join_policy(tribe_registry::tribe_by_id(&registry, 1)) == 1, 0);
        assert!(tribe_registry::tribe_join_policy(tribe_registry::tribe_by_id(&registry, 2)) == 0, 0);

        test_utils::destroy(cap1);
        test_utils::destroy(cap2);
        test_utils::destroy(registry);
    }

    // ===== JP05: test_join_tribe_open_succeeds_when_policy_open =====

    #[test]
    fun test_join_tribe_open_succeeds_when_policy_open() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // Create open-policy tribe.
        let cap = mk_easy_tribe(&mut registry, b"OpenTribe", b"Open join", 0, &mut ctx);

        let ssu_id: address = @0xBEEF;
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let owner_cap = access::create_owner_cap_for_testing<StorageUnit>(
            object::id_from_address(ssu_id), &mut ctx,
        );
        registration_helpers::join_tribe_open(
            &mut registry,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            &owner_cap,
            1,
            ssu_id,
            &clock,
            &mut ctx,
        );

        // SSU should now be in tribe.
        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        assert!(tribe_registry::tribe_has_ssu(tribe, ssu_id), 0);
        assert!(tribe_registry::tribe_member_count(tribe) == 1, 0);

        clock::destroy_for_testing(clock);
        test_utils::destroy(owner_cap);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }

    // ===== JP06: test_join_tribe_open_aborts_when_application_required =====

    #[test]
    #[expected_failure(abort_code = 11)] // E_APPLICATION_REQUIRED
    fun test_join_tribe_open_aborts_when_application_required() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // Create application-required tribe (join_policy = 1).
        let cap = mk_easy_tribe(&mut registry, b"ClosedTribe", b"Application required", 1, &mut ctx);

        let ssu_id: address = @0xBEEF;
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        // Owner cap authorizes the ssu_id being joined — ownership check passes,
        // policy guard fires E_APPLICATION_REQUIRED (11) as intended.
        let owner_cap = access::create_owner_cap_for_testing<StorageUnit>(
            object::id_from_address(ssu_id), &mut ctx,
        );

        // join_tribe_open must abort — tribe requires application.
        registration_helpers::join_tribe_open(
            &mut registry,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            &owner_cap,
            1,
            ssu_id,
            &clock,
            &mut ctx,
        );

        abort 0
    }

    // ===== JP07: test_join_tribe_open_aborts_when_ssu_already_member =====
    // SEC-020 same-mode dedup: proves that calling join_tribe_open twice for the same ssu_id
    // on an open-policy tribe aborts E_SSU_ALREADY_IN_TRIBE on the second call.
    // Cross-mode dedup (accept_application then join_tribe_open) is covered by OS-53-test-followup
    // once accept_application is implemented (deferred, see OverhaulStub.md OS-53-test-followup).

    #[test]
    #[expected_failure(abort_code = 7)] // E_SSU_ALREADY_IN_TRIBE
    fun test_join_tribe_open_aborts_when_ssu_already_member() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // Open policy tribe.
        let cap = mk_easy_tribe(&mut registry, b"DedupTribe", b"Dedup test", 0, &mut ctx);

        let ssu_id: address = @0xDEAD;
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let owner_cap = access::create_owner_cap_for_testing<StorageUnit>(
            object::id_from_address(ssu_id), &mut ctx,
        );

        // First join succeeds (open policy).
        registration_helpers::join_tribe_open(
            &mut registry,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            &owner_cap,
            1,
            ssu_id,
            &clock,
            &mut ctx,
        );

        // Second join with same ssu_id must abort E_SSU_ALREADY_IN_TRIBE (7).
        registration_helpers::join_tribe_open(
            &mut registry,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            &owner_cap,
            1,
            ssu_id,
            &clock,
            &mut ctx,
        );

        abort 0
    }

    // ===== JP08: test_cross_mode_dedup_aborts (OS-53-test-followup) =====
    // Cross-mode dedup: SSU joins via accept_application, then attempts join_tribe_open
    // on the same tribe. Second join MUST abort E_SSU_ALREADY_IN_TRIBE (7).
    // Covers SEC-020 cross-mode dedup scenario deferred from R6.7.4.
    #[test]
    #[expected_failure(abort_code = 7)] // E_SSU_ALREADY_IN_TRIBE
    fun test_cross_mode_dedup_accept_then_open_aborts() {
        use dapp_hub::registration::{Self, RegistrationRequestQueue};
        use dapp_hub::ssu_registry::{Self, SSURegistry};
        use dapp_hub::escrow_wallet;

        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // Create application-required tribe (join_policy=1, governance_mode=0).
        // tribe_id = 1: first tribe in test fixture; tribe_registry.next_id initializes to 1.
        let cap = mk_easy_tribe(&mut registry, b"CrossModeTribe", b"Cross-mode dedup test", 1, &mut ctx);

        let ssu_id: address = @0xDEED;

        // SSU applies via application flow. Join fee escrows (zero fee here);
        // accept forwards it to the tax wallet.
        let mut queue = registration::create_for_testing(&mut ctx);
        let mut ssu_reg = ssu_registry::create_for_testing(&mut ctx);
        let mut escrow = escrow_wallet::create_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);
        registration::apply_to_tribe(
            &mut queue, &mut escrow, &config, coin::zero<EVE>(&mut ctx),
            1, ssu_id, b"Please accept", &clock, &mut ctx,
        );

        // Leader accepts the application — SSU is now in tribe (tribe_id=1, application_id=1).
        registration::accept_application(
            &cap, &mut queue, &mut escrow, &mut wallet, &mut registry, &mut ssu_reg, 1, &clock, &mut ctx,
        );

        // Flip tribe join policy to OPEN so join_tribe_open doesn't abort on policy gate.
        registration_helpers::set_join_policy_as_leader(&cap, &mut registry, 0, &mut ctx);

        let join_config = dapp_governance::create_config_for_testing(&mut ctx);
        let mut join_wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        // Owner cap authorizes ssu_id — ownership check passes; already-member check fires (7).
        let join_owner_cap = access::create_owner_cap_for_testing<StorageUnit>(
            object::id_from_address(ssu_id), &mut ctx,
        );

        // Now attempt join_tribe_open with same ssu_id — must abort E_SSU_ALREADY_IN_TRIBE (7).
        registration_helpers::join_tribe_open(
            &mut registry,
            &join_config,
            &mut join_wallet,
            coin::zero<EVE>(&mut ctx),
            &join_owner_cap,
            1,
            ssu_id,
            &clock,
            &mut ctx,
        );

        abort 0 // unreachable
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
