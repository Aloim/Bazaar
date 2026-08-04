// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// DappHub/sources/c1_registration_table_tests.move
// Locking tests for Slice C1 / GAS-09: applications vector → Table + remove-on-process.
//
// Three tests covering the plan §11 C1 row:
//   C1-T1: double-accept same id    → E_APPLICATION_NOT_FOUND   (remove-on-process replay guard)
//   C1-T2: reject → no orphan row + escrow zeroed               (conservation + no ghost entries)
//   C1-T3: re-submit → re-accept same SSU → E_SSU_ALREADY_REGISTERED  (real dedup guard unchanged)
//
// Scaffold mirrors b4_dapphub_squat_escrow_fee_tests.move and
// registration_owner_fix_tests.move (same factories, same Clock pattern).
// Expected-failure tests use tx_context::dummy() — auth via TribeLeaderCap, not ctx.sender().
// The success test (C1-T2) manually destroys all non-droppable locals.
//
// Constitution: Article XII.3 — 500-line limit.
#[test_only]
module dapp_hub::c1_registration_table_tests {
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    // Self: for tribe_registry::create_for_testing / create_easy_tribe module-qualified calls.
    // TribeLeaderCap: used as an explicit type annotation in each test.
    // TribeRegistry, SSURegistry, RegistrationRequestQueue, DAppEscrowWallet are all
    // type-inferred from their respective create_for_testing calls — not needed as explicit imports.
    use dapp_hub::tribe_registry::{Self, TribeLeaderCap};
    use dapp_hub::ssu_registry;
    use dapp_hub::registration;
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use dapp_hub::escrow_wallet;

    // SSU address constant used across all three tests.
    const SSU_ID: address = @0xC1AA;

    // =========================================================================
    // C1-T1 — double-accept same application_id → E_APPLICATION_NOT_FOUND
    //
    // Proves: remove-on-process is the replay guard.
    // First accept succeeds (row removed, SSU registered in ssu_reg + tribe).
    // Second accept on the same id: table::contains returns false → abort.
    // =========================================================================
    #[test]
    #[expected_failure(abort_code = dapp_hub::registration::E_APPLICATION_NOT_FOUND)]
    fun c1_double_accept_second_aborts_not_found() {
        let mut ctx = tx_context::dummy();
        let clk    = clock::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);

        let mut tribe_reg  = tribe_registry::create_for_testing(&mut ctx);
        let mut ssu_reg    = ssu_registry::create_for_testing(&mut ctx);
        let mut queue      = registration::create_for_testing(&mut ctx);
        let mut escrow     = escrow_wallet::create_for_testing(&mut ctx);
        let mut tw         = tax_wallet::create_wallet_for_testing(&mut ctx);

        let leader_cap: TribeLeaderCap = tribe_registry::create_easy_tribe(
            &mut tribe_reg, &config, &mut tw,
            coin::zero<EVE>(&mut ctx), b"T", b"D", 0, 0, &clk, &mut ctx,
        );

        // Applicant submits (application_id = 1, zero fee).
        registration::apply_to_tribe(
            &mut queue, &mut escrow, &config,
            coin::zero<EVE>(&mut ctx), 1, SSU_ID, b"Join", &clk, &mut ctx,
        );

        // First accept: row removed, SSU registered.
        registration::accept_application(
            &leader_cap, &mut queue, &mut escrow, &mut tw,
            &mut tribe_reg, &mut ssu_reg, 1, &clk, &mut ctx,
        );

        // Second accept on the SAME id: row is gone → E_APPLICATION_NOT_FOUND.
        registration::accept_application(
            &leader_cap, &mut queue, &mut escrow, &mut tw,
            &mut tribe_reg, &mut ssu_reg, 1, &clk, &mut ctx,
        );

        abort 0 // unreachable — the preceding call must abort
    }

    // =========================================================================
    // C1-T2 — reject → no orphan row + escrow conservation
    //
    // Proves: reject removes the row (has_application == false, application_count == 0)
    //         and the escrow balance returns to zero (no double-release possible).
    // Uses a zero-fee application so the refund goes through balance::destroy_zero
    // (avoids the test_scenario::Scenario transfer requirement; no address needed).
    // =========================================================================
    #[test]
    fun c1_reject_no_orphan_row_escrow_zeroed() {
        let mut ctx = tx_context::dummy();
        let clk    = clock::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);

        let mut tribe_reg  = tribe_registry::create_for_testing(&mut ctx);
        let mut queue      = registration::create_for_testing(&mut ctx);
        let mut escrow     = escrow_wallet::create_for_testing(&mut ctx);
        let mut tw         = tax_wallet::create_wallet_for_testing(&mut ctx);

        let leader_cap: TribeLeaderCap = tribe_registry::create_easy_tribe(
            &mut tribe_reg, &config, &mut tw,
            coin::zero<EVE>(&mut ctx), b"T", b"D", 0, 0, &clk, &mut ctx,
        );

        // Submit (zero fee → escrow holds entry at 0 MIST).
        registration::apply_to_tribe(
            &mut queue, &mut escrow, &config,
            coin::zero<EVE>(&mut ctx), 1, SSU_ID, b"Join", &clk, &mut ctx,
        );
        // Sanity: row exists and count is 1 before reject.
        assert!(registration::has_application(&queue, 1), 0);
        assert!(registration::application_count(&queue) == 1, 1);

        // Reject: row removed, zero-balance destroyed.
        registration::reject_application(
            &leader_cap, &mut queue, &mut escrow, 1, &clk, &mut ctx,
        );

        // POST-CONDITIONS
        assert!(!registration::has_application(&queue, 1), 2);     // no orphan row
        assert!(registration::application_count(&queue) == 0, 3);  // table empty
        assert!(escrow_wallet::total_escrowed(&escrow) == 0, 4);   // escrow conservation

        // Cleanup: destroy all non-droppable locals (Table inside queue must be empty for drop).
        test_utils::destroy(leader_cap);
        test_utils::destroy(tribe_reg);
        test_utils::destroy(queue);
        test_utils::destroy(escrow);
        test_utils::destroy(tw);
        test_utils::destroy(config);
        clock::destroy_for_testing(clk);
    }

    // =========================================================================
    // C1-T3 — re-submit + re-accept same SSU → E_SSU_ALREADY_REGISTERED
    //
    // Proves: the REAL dedup guard (ssu_registry) is unchanged by the reshape.
    // Flow:
    //   apply(id=1) → accept(id=1): SSU_ID registered in SSURegistry (succeeds).
    //   apply(id=2, same SSU_ID) → accept(id=2): ssu_registry::register_ssu_with_tribe
    //     sees SSU_ID already registered → E_SSU_ALREADY_REGISTERED.
    //
    // Balance-safety note: in accept_application (new version), table::remove and
    // escrow_wallet::release happen before register_ssu_with_tribe; fee_bal is consumed
    // by deposit_fee_balance BEFORE the abort-able call. No non-droppable locals are in
    // scope at the abort point. In a real Sui tx the entire tx rolls back; here the abort
    // propagates and the test passes.
    // =========================================================================
    #[test]
    #[expected_failure(abort_code = dapp_hub::ssu_registry::E_SSU_ALREADY_REGISTERED)]
    fun c1_resubmit_reaccept_aborts_already_registered() {
        let mut ctx = tx_context::dummy();
        let clk    = clock::create_for_testing(&mut ctx);
        let config = dapp_governance::create_config_for_testing(&mut ctx);

        let mut tribe_reg  = tribe_registry::create_for_testing(&mut ctx);
        let mut ssu_reg    = ssu_registry::create_for_testing(&mut ctx);
        let mut queue      = registration::create_for_testing(&mut ctx);
        let mut escrow     = escrow_wallet::create_for_testing(&mut ctx);
        let mut tw         = tax_wallet::create_wallet_for_testing(&mut ctx);

        let leader_cap: TribeLeaderCap = tribe_registry::create_easy_tribe(
            &mut tribe_reg, &config, &mut tw,
            coin::zero<EVE>(&mut ctx), b"T", b"D", 0, 0, &clk, &mut ctx,
        );

        // First application (id=1) + acceptance: SSU_ID registered successfully.
        registration::apply_to_tribe(
            &mut queue, &mut escrow, &config,
            coin::zero<EVE>(&mut ctx), 1, SSU_ID, b"First", &clk, &mut ctx,
        );
        registration::accept_application(
            &leader_cap, &mut queue, &mut escrow, &mut tw,
            &mut tribe_reg, &mut ssu_reg, 1, &clk, &mut ctx,
        );

        // Second application (id=2) for the SAME SSU_ID.
        registration::apply_to_tribe(
            &mut queue, &mut escrow, &config,
            coin::zero<EVE>(&mut ctx), 1, SSU_ID, b"Second", &clk, &mut ctx,
        );

        // Accept id=2: row exists, auth ok, remove+release ok, deposit_fee_balance ok —
        // then register_ssu_with_tribe sees SSU_ID already registered → abort.
        registration::accept_application(
            &leader_cap, &mut queue, &mut escrow, &mut tw,
            &mut tribe_reg, &mut ssu_reg, 2, &clk, &mut ctx,
        );

        abort 0 // unreachable
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
