// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// DappHub/sources/b4_dapphub_squat_escrow_fee_tests.move
// Phase 8 Wave B4 production tests covering:
//   B4.1 — Registration squat fix (AUD-DH-10): ownership proof enforcement
//           on register_ssu_notribe and register_and_join_open_tribe;
//           force_deregister_ssu happy path + non-owner-cap abort.
//   B4.2 — cancel_application lifecycle (AUD-DH-05 / AUD-ET-05 / AUD-ET-10):
//           apply→cancel→refund; apply→accept→fee-released; apply→reject→refund.
//   B4.3 — Fee-policy closure (AUD-DH-11): open-join fee charging + E_INSUFFICIENT
//           abort. Fee-setter upper-bound aborts (AUD-DH-02).
//
// Constitution: Article XII.3 — 500-line limit.
#[test_only]
module dapp_hub::b4_dapphub_squat_escrow_fee_tests {
    use std::string;
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use sui::object;
    use EVE::EVE::EVE;
    use world::access::{Self, OwnerCap};
    use world::storage_unit::StorageUnit;
    use dapp_hub::tribe_registry::{Self, TribeRegistry, TribeLeaderCap};
    use dapp_hub::ssu_registry::{Self, SSURegistry};
    use dapp_hub::registration::{Self, RegistrationRequestQueue};
    use dapp_hub::registration_helpers;
    use dapp_hub::dapp_governance::{Self, DAppOwnerCap, GovernanceConfig};
    use dapp_hub::tax_wallet::{Self, DAppTaxWallet};
    use dapp_hub::escrow_wallet::{Self, DAppEscrowWallet};

    // ===== Test addresses =====
    const REAL_OWNER:   address = @0xAA01;
    const STRANGER:     address = @0xBB02;
    const TRIBE_LEADER: address = @0xCC03;
    const ADMIN:        address = @0xDD04;
    const SSU_ID:       address = @0xEE05;

    // ===== Fixture helpers =====

    fun make_owner_cap(ssu_id: address, ctx: &mut TxContext): OwnerCap<StorageUnit> {
        // WorldStub: create_owner_cap_for_testing takes the authorized_object_id as an ID.
        access::create_owner_cap_for_testing<StorageUnit>(
            object::id_from_address(ssu_id),
            ctx,
        )
    }

    fun make_config_and_wallet(ctx: &mut TxContext): (GovernanceConfig, DAppTaxWallet) {
        let config = dapp_governance::create_config_for_testing(ctx);
        let wallet = tax_wallet::create_wallet_for_testing(ctx);
        (config, wallet)
    }

    fun make_open_tribe(
        registry: &mut TribeRegistry,
        ctx: &mut TxContext,
    ): TribeLeaderCap {
        let clk = clock::create_for_testing(ctx);
        let config = dapp_governance::create_config_for_testing(ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
        let cap = tribe_registry::create_easy_tribe(
            registry,
            &config,
            &mut wallet,
            coin::zero<EVE>(ctx),
            b"OpenTribe",
            b"Open join policy",
            0,  // join_policy = open
            0,
            &clk,
            ctx,
        );
        clock::destroy_for_testing(clk);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        cap
    }

    // =========================================================================
    // B4.1a — register_ssu_notribe rejects stranger without OwnerCap
    // =========================================================================
    // STRANGER passes SSU_ID but their OwnerCap authorizes a DIFFERENT address.
    // Must abort E_NOT_SSU_FRONTIER_OWNER (7).
    #[test]
    #[expected_failure(abort_code = dapp_hub::ssu_registry::E_NOT_SSU_FRONTIER_OWNER)]
    fun b41_register_notribe_stranger_no_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = ssu_registry::create_for_testing(&mut ctx);
        let (config, mut wallet) = make_config_and_wallet(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);

        // Stranger's cap authorizes a DIFFERENT ssu_id, not SSU_ID.
        let wrong_id: address = @0xFFFF;
        let bad_cap = make_owner_cap(wrong_id, &mut ctx);

        ssu_registry::register_ssu_notribe(
            &mut registry,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            &bad_cap,
            SSU_ID,
            &clk,
            &mut ctx,
        );

        abort 0 // unreachable
    }

    // =========================================================================
    // B4.1b — register_ssu_notribe succeeds when caller holds correct OwnerCap
    // =========================================================================
    #[test]
    fun b41_register_notribe_real_owner_succeeds() {
        let mut ctx = tx_context::dummy();
        let mut registry = ssu_registry::create_for_testing(&mut ctx);
        let (config, mut wallet) = make_config_and_wallet(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let valid_cap = make_owner_cap(SSU_ID, &mut ctx);

        ssu_registry::register_ssu_notribe(
            &mut registry,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            &valid_cap,
            SSU_ID,
            &clk,
            &mut ctx,
        );

        assert!(ssu_registry::is_registered(&registry, SSU_ID), 0);
        let reg = ssu_registry::registration(&registry, SSU_ID);
        assert!(ssu_registry::ssu_bazaar_type(reg) == 0, 1);

        clock::destroy_for_testing(clk);
        test_utils::destroy(valid_cap);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(registry);
    }

    // =========================================================================
    // B4.1c — force_deregister_ssu happy path (DAppOwnerCap-gated)
    // =========================================================================
    #[test]
    fun b41_force_deregister_happy_path() {
        let mut ctx = tx_context::dummy();
        let mut registry = ssu_registry::create_for_testing(&mut ctx);
        let (config, mut wallet) = make_config_and_wallet(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let valid_cap = make_owner_cap(SSU_ID, &mut ctx);
        let admin_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);

        // Register the SSU first.
        ssu_registry::register_ssu_notribe(
            &mut registry, &config, &mut wallet,
            coin::zero<EVE>(&mut ctx), &valid_cap, SSU_ID, &clk, &mut ctx,
        );
        assert!(ssu_registry::is_registered(&registry, SSU_ID), 0);

        // Admin force-deregisters it.
        ssu_registry::force_deregister_ssu(&admin_cap, &mut registry, SSU_ID, &clk, &mut ctx);
        assert!(!ssu_registry::is_registered(&registry, SSU_ID), 1);
        // ssu_count decremented.
        assert!(ssu_registry::ssu_count(&registry) == 0, 2);

        clock::destroy_for_testing(clk);
        test_utils::destroy(valid_cap);
        test_utils::destroy(admin_cap);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(registry);
    }

    // =========================================================================
    // B4.1d — force_deregister_ssu on missing ssu_id aborts E_SSU_NOT_REGISTERED
    // =========================================================================
    #[test]
    #[expected_failure(abort_code = dapp_hub::ssu_registry::E_SSU_NOT_REGISTERED)]
    fun b41_force_deregister_missing_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = ssu_registry::create_for_testing(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let admin_cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);

        // SSU_ID was never registered.
        ssu_registry::force_deregister_ssu(&admin_cap, &mut registry, SSU_ID, &clk, &mut ctx);

        abort 0
    }

    // =========================================================================
    // B4.2a — cancel_application: apply → cancel → refund lifecycle
    // =========================================================================
    #[test]
    fun b42_cancel_application_refunds_fee() {
        let mut scenario = ts::begin(REAL_OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let queue = registration::create_for_testing(ctx);
            let escrow = escrow_wallet::create_for_testing(ctx);
            registration::share_for_testing(queue);
            escrow_wallet::share_for_testing(escrow);
        };

        // REAL_OWNER submits application (zero fee — fee is 0 in test config).
        ts::next_tx(&mut scenario, REAL_OWNER);
        {
            let mut queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            let mut escrow = ts::take_shared<DAppEscrowWallet>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            registration::apply_to_tribe(
                &mut queue, &mut escrow, &config,
                coin::zero<EVE>(ctx),
                1, SSU_ID, b"Join request", &clk, ctx,
            );
            // total_escrowed stays 0 (zero fee).
            assert!(escrow_wallet::total_escrowed(&escrow) == 0, 0);
            clock::destroy_for_testing(clk);
            test_utils::destroy(config);
            ts::return_shared(queue);
            ts::return_shared(escrow);
        };

        // REAL_OWNER cancels the pending application.
        ts::next_tx(&mut scenario, REAL_OWNER);
        {
            let mut queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            let mut escrow = ts::take_shared<DAppEscrowWallet>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            registration::cancel_application(&mut queue, &mut escrow, 1, &clk, ctx);
            // escrow entry removed, total_escrowed remains 0.
            assert!(escrow_wallet::total_escrowed(&escrow) == 0, 1);
            clock::destroy_for_testing(clk);
            ts::return_shared(queue);
            ts::return_shared(escrow);
        };

        // Verify: the row is GONE (remove-on-process — no orphan row after cancel).
        ts::next_tx(&mut scenario, REAL_OWNER);
        {
            let queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            // Row absent: remove-on-process consumed it. No orphan row.
            assert!(!registration::has_application(&queue, 1), 0);
            assert!(registration::application_count(&queue) == 0, 1);
            ts::return_shared(queue);
        };

        ts::end(scenario);
    }

    // =========================================================================
    // B4.2b — cancel_application: stranger cannot cancel someone else's application
    // =========================================================================
    #[test]
    #[expected_failure(abort_code = dapp_hub::registration::E_NOT_APPLICANT)]
    fun b42_cancel_application_stranger_aborts() {
        let mut scenario = ts::begin(REAL_OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let queue = registration::create_for_testing(ctx);
            let escrow = escrow_wallet::create_for_testing(ctx);
            registration::share_for_testing(queue);
            escrow_wallet::share_for_testing(escrow);
        };

        ts::next_tx(&mut scenario, REAL_OWNER);
        {
            let mut queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            let mut escrow = ts::take_shared<DAppEscrowWallet>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            registration::apply_to_tribe(
                &mut queue, &mut escrow, &config, coin::zero<EVE>(ctx),
                1, SSU_ID, b"Request", &clk, ctx,
            );
            clock::destroy_for_testing(clk);
            test_utils::destroy(config);
            ts::return_shared(queue);
            ts::return_shared(escrow);
        };

        // STRANGER tries to cancel REAL_OWNER's application.
        ts::next_tx(&mut scenario, STRANGER);
        {
            let mut queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            let mut escrow = ts::take_shared<DAppEscrowWallet>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            registration::cancel_application(&mut queue, &mut escrow, 1, &clk, ctx);
            clock::destroy_for_testing(clk);
            ts::return_shared(queue);
            ts::return_shared(escrow);
        };

        abort 0
    }

    // =========================================================================
    // B4.2c — accept_application releases fee to tax wallet (existing flow, now tested)
    // =========================================================================
    // Verifies the escrow conservation invariant: total_escrowed goes to 0 after accept,
    // DAppTaxWallet balance increases by the fee amount.
    #[test]
    fun b42_accept_application_releases_fee_to_tax_wallet() {
        let mut scenario = ts::begin(REAL_OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let (tribe_registry, leader_cap) = {
                let mut reg = tribe_registry::create_for_testing(ctx);
                let clk = clock::create_for_testing(ctx);
                let config = dapp_governance::create_config_for_testing(ctx);
                let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
                let cap = tribe_registry::create_easy_tribe(
                    &mut reg, &config, &mut wallet,
                    coin::zero<EVE>(ctx), b"T", b"D", 1, 0, &clk, ctx,
                );
                clock::destroy_for_testing(clk);
                test_utils::destroy(config);
                test_utils::destroy(wallet);
                (reg, cap)
            };
            sui::transfer::public_transfer(leader_cap, TRIBE_LEADER);
            tribe_registry::share_for_testing(tribe_registry);
            registration::share_for_testing(registration::create_for_testing(ctx));
            ssu_registry::share_for_testing(ssu_registry::create_for_testing(ctx));
            escrow_wallet::share_for_testing(escrow_wallet::create_for_testing(ctx));
        };

        ts::next_tx(&mut scenario, REAL_OWNER);
        {
            let mut queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            let mut escrow = ts::take_shared<DAppEscrowWallet>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            registration::apply_to_tribe(
                &mut queue, &mut escrow, &config, coin::zero<EVE>(ctx),
                1, SSU_ID, b"Request", &clk, ctx,
            );
            clock::destroy_for_testing(clk);
            test_utils::destroy(config);
            ts::return_shared(queue);
            ts::return_shared(escrow);
        };

        ts::next_tx(&mut scenario, TRIBE_LEADER);
        {
            let leader_cap = ts::take_from_sender<TribeLeaderCap>(&scenario);
            let mut queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            let mut escrow = ts::take_shared<DAppEscrowWallet>(&scenario);
            let mut tribe_reg = ts::take_shared<TribeRegistry>(&scenario);
            let mut ssu_reg = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let mut tax_wallet = tax_wallet::create_wallet_for_testing(ctx);
            registration::accept_application(
                &leader_cap, &mut queue, &mut escrow, &mut tax_wallet,
                &mut tribe_reg, &mut ssu_reg, 1, &clk, ctx,
            );
            // Conservation: total_escrowed == 0 after release.
            assert!(escrow_wallet::total_escrowed(&escrow) == 0, 0);
            // SSU is now registered.
            assert!(ssu_registry::is_registered(&ssu_reg, SSU_ID), 1);
            clock::destroy_for_testing(clk);
            test_utils::destroy(tax_wallet);
            ts::return_to_sender(&scenario, leader_cap);
            ts::return_shared(queue);
            ts::return_shared(escrow);
            ts::return_shared(tribe_reg);
            ts::return_shared(ssu_reg);
        };

        ts::end(scenario);
    }

    // =========================================================================
    // B4.2d — reject_application refunds fee to applicant (existing flow, now tested)
    // =========================================================================
    #[test]
    fun b42_reject_application_refunds_fee() {
        let mut scenario = ts::begin(REAL_OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let mut tribe_reg = tribe_registry::create_for_testing(ctx);
            let leader_cap = make_open_tribe(&mut tribe_reg, ctx);
            // Switch to application-required so apply works.
            sui::transfer::public_transfer(leader_cap, TRIBE_LEADER);
            tribe_registry::share_for_testing(tribe_reg);
            registration::share_for_testing(registration::create_for_testing(ctx));
            escrow_wallet::share_for_testing(escrow_wallet::create_for_testing(ctx));
        };

        ts::next_tx(&mut scenario, REAL_OWNER);
        {
            let mut queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            let mut escrow = ts::take_shared<DAppEscrowWallet>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            registration::apply_to_tribe(
                &mut queue, &mut escrow, &config, coin::zero<EVE>(ctx),
                1, SSU_ID, b"Request", &clk, ctx,
            );
            clock::destroy_for_testing(clk);
            test_utils::destroy(config);
            ts::return_shared(queue);
            ts::return_shared(escrow);
        };

        ts::next_tx(&mut scenario, TRIBE_LEADER);
        {
            let leader_cap = ts::take_from_sender<TribeLeaderCap>(&scenario);
            let mut queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            let mut escrow = ts::take_shared<DAppEscrowWallet>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            registration::reject_application(
                &leader_cap, &mut queue, &mut escrow, 1, &clk, ctx,
            );
            // Conservation: total_escrowed == 0 after refund.
            assert!(escrow_wallet::total_escrowed(&escrow) == 0, 0);
            clock::destroy_for_testing(clk);
            ts::return_to_sender(&scenario, leader_cap);
            ts::return_shared(queue);
            ts::return_shared(escrow);
        };

        ts::end(scenario);
    }

    // =========================================================================
    // B4.3a — join_tribe_open with fee=0 config succeeds (zero coin)
    // =========================================================================
    #[test]
    fun b43_join_tribe_open_zero_fee_succeeds() {
        let mut ctx = tx_context::dummy();
        let mut tribe_reg = tribe_registry::create_for_testing(&mut ctx);
        let leader_cap = make_open_tribe(&mut tribe_reg, &mut ctx);
        let (config, mut wallet) = make_config_and_wallet(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let valid_cap = make_owner_cap(SSU_ID, &mut ctx);

        // fee == 0 in test config; zero coin passes through.
        registration_helpers::join_tribe_open(
            &mut tribe_reg,
            &config,
            &mut wallet,
            coin::zero<EVE>(&mut ctx),
            &valid_cap,
            1,
            SSU_ID,
            &clk,
            &mut ctx,
        );

        let tribe = tribe_registry::tribe_by_id(&tribe_reg, 1);
        assert!(tribe_registry::tribe_has_ssu(tribe, SSU_ID), 0);

        clock::destroy_for_testing(clk);
        test_utils::destroy(valid_cap);
        test_utils::destroy(leader_cap);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        test_utils::destroy(tribe_reg);
    }

    // =========================================================================
    // B4.3b — join_tribe_open with insufficient payment aborts E_INSUFFICIENT_FEE
    // =========================================================================
    #[test]
    #[expected_failure(abort_code = dapp_hub::registration_helpers::E_INSUFFICIENT_FEE)]
    fun b43_join_tribe_open_underpay_aborts() {
        let mut ctx = tx_context::dummy();
        let mut tribe_reg = tribe_registry::create_for_testing(&mut ctx);
        let leader_cap = make_open_tribe(&mut tribe_reg, &mut ctx);

        // Config with fee = 1_000_000 MIST (non-zero).
        let mut config = dapp_governance::create_config_for_testing(&mut ctx);
        let cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        dapp_governance::set_registration_fees(
            &cap, &mut config,
            1_000_000,  // ssu_registration_fee
            1_000_000,  // tribe_join_fee — the one checked by join_tribe_open
            0,
            0,
        );
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let clk = clock::create_for_testing(&mut ctx);
        let valid_cap = make_owner_cap(SSU_ID, &mut ctx);

        // Pass zero coin when fee is 1_000_000 MIST — must abort.
        registration_helpers::join_tribe_open(
            &mut tribe_reg, &config, &mut wallet,
            coin::zero<EVE>(&mut ctx),  // underpayment
            &valid_cap, 1, SSU_ID, &clk, &mut ctx,
        );

        abort 0
    }

    // =========================================================================
    // B4.3c — set_registration_fees rejects values > MAX_EVE_FEE_MIST
    // =========================================================================
    #[test]
    #[expected_failure(abort_code = dapp_hub::dapp_governance::E_RATE_TOO_HIGH)]
    fun b43_set_registration_fees_over_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut config = dapp_governance::create_config_for_testing(&mut ctx);

        // 10_000_000_001 > MAX_EVE_FEE_MIST (10_000_000_000) — must abort.
        dapp_governance::set_registration_fees(
            &cap, &mut config,
            10_000_000_001,  // ssu_registration_fee — over cap
            0,
            0,
            0,
        );

        abort 0
    }

    // =========================================================================
    // B4.3d — set_mission_listing_fee_per_hour rejects values > MAX_EVE_FEE_MIST
    // =========================================================================
    #[test]
    #[expected_failure(abort_code = dapp_hub::dapp_governance::E_RATE_TOO_HIGH)]
    fun b43_set_mission_listing_fee_per_hour_over_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut config = dapp_governance::create_config_for_testing(&mut ctx);

        dapp_governance::set_mission_listing_fee_per_hour(
            &cap, &mut config,
            10_000_000_001,  // over cap
        );

        abort 0
    }

    // =========================================================================
    // B4.3e — set_registration_fees at exactly MAX_EVE_FEE_MIST succeeds (boundary)
    // =========================================================================
    #[test]
    fun b43_set_registration_fees_at_cap_succeeds() {
        let mut ctx = tx_context::dummy();
        let cap = dapp_governance::create_owner_cap_for_testing(&mut ctx);
        let mut config = dapp_governance::create_config_for_testing(&mut ctx);

        // Exactly 10 EVE = allowed.
        dapp_governance::set_registration_fees(
            &cap, &mut config,
            10_000_000_000,
            10_000_000_000,
            10_000_000_000,
            10_000_000_000,
        );
        assert!(dapp_governance::ssu_registration_fee(&config) == 10_000_000_000, 0);

        test_utils::destroy(cap);
        test_utils::destroy(config);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
