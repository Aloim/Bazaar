// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// DappHub/sources/registration_owner_fix_tests.move
// OS-54 regression tests for accept_application owner fix.
// Verifies that app.applicant (not the tribe leader) is recorded as SSU owner.
// Tests: REG-OWN-01 (owner recorded correctly), REG-OWN-02 (applicant can deregister).
// Constitution: Article XII.3 — 500-line limit.
#[test_only]
module dapp_hub::registration_owner_fix_tests {
    use std::string;
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use dapp_hub::tribe_registry::{Self, TribeRegistry, TribeLeaderCap};
    use dapp_hub::ssu_registry::{Self, SSURegistry};
    use dapp_hub::registration::{Self, RegistrationRequestQueue};
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use dapp_hub::escrow_wallet::{Self, DAppEscrowWallet};

    // Test addresses
    const APPLICANT:    address = @0xAA11;   // SSU owner — the one applying to join
    const TRIBE_LEADER: address = @0xBB22;   // Leader who accepts the application
    const SSU_ID:       address = @0xCC33;

    // ===== Setup helpers =====

    fun make_tribe_and_leader(ctx: &mut TxContext): (TribeRegistry, TribeLeaderCap) {
        let clk = clock::create_for_testing(ctx);
        let mut registry = tribe_registry::create_for_testing(ctx);
        let config = dapp_governance::create_config_for_testing(ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
        let cap = tribe_registry::create_easy_tribe(
            &mut registry,
            &config,
            &mut wallet,
            coin::zero<EVE>(ctx),
            b"TestTribe",
            b"A test tribe",
            0,   // join_policy: open (for simplicity)
            0,   // governance_mode
            &clk,
            ctx,
        );
        clock::destroy_for_testing(clk);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        (registry, cap)
    }

    // ===== REG-OWN-01: accept_application records applicant as SSU owner =====
    //
    // Flow:
    //   1. APPLICANT submits application.
    //   2. TRIBE_LEADER accepts.
    //   3. Verify ssu_owner(registration) == APPLICANT (NOT TRIBE_LEADER).
    #[test]
    fun reg_own_01_accept_application_records_applicant_as_ssu_owner() {
        let mut scenario = ts::begin(APPLICANT);

        // Step 1: create shared objects as APPLICANT.
        {
            let ctx = ts::ctx(&mut scenario);
            let (tribe_registry, leader_cap) = make_tribe_and_leader(ctx);
            let queue = registration::create_for_testing(ctx);
            let ssu_registry = ssu_registry::create_for_testing(ctx);
            // Transfer leader cap to TRIBE_LEADER.
            sui::transfer::public_transfer(leader_cap, TRIBE_LEADER);
            tribe_registry::share_for_testing(tribe_registry);
            registration::share_for_testing(queue);
            ssu_registry::share_for_testing(ssu_registry);
            // Escrow wallet must persist across apply→accept (holds the join fee).
            let escrow = escrow_wallet::create_for_testing(ctx);
            escrow_wallet::share_for_testing(escrow);
        };

        // Step 2: APPLICANT submits application for tribe_id = 1.
        ts::next_tx(&mut scenario, APPLICANT);
        {
            let mut queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            let mut escrow = ts::take_shared<DAppEscrowWallet>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            registration::apply_to_tribe(
                &mut queue,
                &mut escrow,
                &config,
                coin::zero<EVE>(ctx),
                1,          // tribe_id = 1 (first created tribe)
                SSU_ID,
                b"Please let me in",
                &clk,
                ctx,
            );
            clock::destroy_for_testing(clk);
            test_utils::destroy(config);
            ts::return_shared(queue);
            ts::return_shared(escrow);
        };

        // Step 3: TRIBE_LEADER accepts application (application_id = 1).
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
                &leader_cap,
                &mut queue,
                &mut escrow,
                &mut tax_wallet,
                &mut tribe_reg,
                &mut ssu_reg,
                1,   // application_id
                &clk,
                ctx,
            );
            clock::destroy_for_testing(clk);
            test_utils::destroy(tax_wallet);
            ts::return_to_sender(&scenario, leader_cap);
            ts::return_shared(queue);
            ts::return_shared(escrow);
            ts::return_shared(tribe_reg);
            ts::return_shared(ssu_reg);
        };

        // Step 4: verify SSU owner is APPLICANT (not TRIBE_LEADER).
        ts::next_tx(&mut scenario, APPLICANT);
        {
            let ssu_reg = ts::take_shared<SSURegistry>(&scenario);
            assert!(ssu_registry::is_registered(&ssu_reg, SSU_ID), 0);
            let reg = ssu_registry::registration(&ssu_reg, SSU_ID);
            // CRITICAL assertion: owner must be APPLICANT, not TRIBE_LEADER.
            assert!(ssu_registry::ssu_owner(reg) == APPLICANT, 1);
            ts::return_shared(ssu_reg);
        };

        ts::end(scenario);
    }

    // ===== REG-OWN-02: post-fix regression — applicant can deregister their own SSU =====
    //
    // Verifies that the applicant (recorded as owner after OS-54 fix) can call
    // deregister_ssu successfully. Under the pre-fix bug, the leader would be
    // recorded as owner and the applicant's deregister attempt would abort E_NOT_SSU_OWNER.
    #[test]
    fun reg_own_02_applicant_can_deregister_own_ssu() {
        let mut scenario = ts::begin(APPLICANT);

        // Step 1: create shared objects.
        {
            let ctx = ts::ctx(&mut scenario);
            let (tribe_registry, leader_cap) = make_tribe_and_leader(ctx);
            let queue = registration::create_for_testing(ctx);
            let ssu_registry = ssu_registry::create_for_testing(ctx);
            sui::transfer::public_transfer(leader_cap, TRIBE_LEADER);
            tribe_registry::share_for_testing(tribe_registry);
            registration::share_for_testing(queue);
            ssu_registry::share_for_testing(ssu_registry);
            // Escrow wallet must persist across apply→accept (holds the join fee).
            let escrow = escrow_wallet::create_for_testing(ctx);
            escrow_wallet::share_for_testing(escrow);
        };

        // Step 2: APPLICANT submits application.
        ts::next_tx(&mut scenario, APPLICANT);
        {
            let mut queue = ts::take_shared<RegistrationRequestQueue>(&scenario);
            let mut escrow = ts::take_shared<DAppEscrowWallet>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let config = dapp_governance::create_config_for_testing(ctx);
            registration::apply_to_tribe(
                &mut queue, &mut escrow, &config, coin::zero<EVE>(ctx),
                1, SSU_ID, b"Join request", &clk, ctx,
            );
            clock::destroy_for_testing(clk);
            test_utils::destroy(config);
            ts::return_shared(queue);
            ts::return_shared(escrow);
        };

        // Step 3: TRIBE_LEADER accepts.
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
                &leader_cap, &mut queue, &mut escrow, &mut tax_wallet, &mut tribe_reg, &mut ssu_reg, 1, &clk, ctx,
            );
            clock::destroy_for_testing(clk);
            test_utils::destroy(tax_wallet);
            ts::return_to_sender(&scenario, leader_cap);
            ts::return_shared(queue);
            ts::return_shared(escrow);
            ts::return_shared(tribe_reg);
            ts::return_shared(ssu_reg);
        };

        // Step 4: APPLICANT deregisters their SSU — must succeed (not abort E_NOT_SSU_OWNER).
        ts::next_tx(&mut scenario, APPLICANT);
        {
            let mut ssu_reg = ts::take_shared<SSURegistry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            ssu_registry::deregister_ssu(&mut ssu_reg, SSU_ID, &clk, ctx);
            // Verify SSU is no longer registered.
            assert!(!ssu_registry::is_registered(&ssu_reg, SSU_ID), 0);
            clock::destroy_for_testing(clk);
            ts::return_shared(ssu_reg);
        };

        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
