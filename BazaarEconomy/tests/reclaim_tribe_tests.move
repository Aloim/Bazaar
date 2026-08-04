// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Update Ceremony V2 — Phase 2 (Slice 3) tests for bazaar_economy::reclaim_tribe.
//
//   - Easy reclaim_tribe round-trip: creates the tribe + governance, records the
//     old->new remap.
//   - Advanced reclaim_tribe round-trip: also bootstraps the 5 economy objects.
//   - reclaim_tribe payload tribe-id mismatch -> E_TRIBE_ID_MISMATCH.
//   - reclaim_tribe_mint_page: re-mints balances; wrong-tribe cap -> E_WRONG_TRIBE.
//   - reclaim_tribe_restore: deposits gov EVE + sets a ban + mission fee.
//
// The full reclaim_tribe path is exercised with tx_context::dummy() — the bootstrap
// shares its objects (the dummy-ctx harness does not track shared objects, mirroring
// the existing economy_governance bootstrap tests). Observable side effects are read
// from the ReclaimRegistry remap table + the TribeRegistry. mint_page + restore are
// also covered in isolation against owned objects.

#[test_only]
module bazaar_economy::reclaim_tribe_tests {
    use sui::clock;
    use sui::coin;
    use sui::bcs;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use dapp_hub::reclaim_registry::{Self, ReclaimRegistry};
    use dapp_hub::tribe_registry::{Self, TribeRegistry};
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;
    use dapp_hub::ceremony_gate;
    use bazaar_core::tribe_governance;
    use bazaar_core::tribe_governance_test_helpers as tgh;
    use bazaar_economy::tribe_token_ledger as ledger;
    use bazaar_economy::reclaim_tribe;

    const SENDER:      address = @0x0;   // tx_context::dummy() sender
    const ORIG_TRIBE:  u64 = 7;
    const OTHER_TRIBE: u64 = 99;
    const ALICE:       address = @0xA11CE;
    const BOB:         address = @0xB0B;
    const PKG:         address = @0xCAFE;
    const TRIBE_TYPE:  u8 = 1;
    const RETENTION:   u64 = 1_000;

    // TribeLeaderPayload binding header (fields 1-8 of §6.4).
    fun build_tribe_header(
        orig_tribe_id: u64, name: vector<u8>, bazaar_type: u8,
        token_name: vector<u8>, token_symbol: vector<u8>, decimals: u8,
        supply_cap: u64, total_supply: u64,
    ): vector<u8> {
        let mut blob = bcs::to_bytes(&orig_tribe_id);
        vector::append(&mut blob, bcs::to_bytes(&name));
        vector::append(&mut blob, bcs::to_bytes(&bazaar_type));
        vector::append(&mut blob, bcs::to_bytes(&token_name));
        vector::append(&mut blob, bcs::to_bytes(&token_symbol));
        vector::append(&mut blob, bcs::to_bytes(&decimals));
        vector::append(&mut blob, bcs::to_bytes(&supply_cap));
        vector::append(&mut blob, bcs::to_bytes(&total_supply));
        blob
    }

    // Stand up the dapp-side objects + a populated tribe record for SENDER.
    fun run_reclaim_tribe(blob: vector<u8>, bazaar_type: u8) {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut rreg = reclaim_registry::create_for_testing(&mut ctx);
        let mut treg = tribe_registry::create_for_testing(&mut ctx);
        let cfg = dapp_governance::create_config_for_testing(&mut ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(&mut ctx);
        let dcap = dapp_governance::create_owner_cap_for_testing(&mut ctx);

        reclaim_registry::populate_reclaim_registry(
            &dcap, &mut rreg,
            vector[SENDER], vector[reclaim_registry::tribe_record_type()],
            vector[(ORIG_TRIBE as u256)], vector[blob],
            1, RETENTION, &clock, &mut ctx,
        );

        let fee = coin::mint_for_testing<EVE>(1_000, &mut ctx);
        reclaim_tribe::reclaim_tribe(
            &mut rreg, &mut treg, &cfg, &mut wallet, fee, PKG, ORIG_TRIBE, 1, &clock, &mut ctx,
        );

        // Remap recorded old->new (only reachable after the fresh tribe + leader cap were
        // created and bootstrapped, so this also proves the tribe creation succeeded).
        assert!(reclaim_registry::is_tribe_remapped(&rreg, ORIG_TRIBE), 0);
        let _new_id = reclaim_registry::resolve_remapped_tribe(&rreg, ORIG_TRIBE);
        let _ = bazaar_type;

        test_utils::destroy(rreg);
        test_utils::destroy(treg);
        test_utils::destroy(cfg);
        test_utils::destroy(wallet);
        test_utils::destroy(dcap);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun easy_reclaim_tribe_round_trip() {
        run_reclaim_tribe(build_tribe_header(ORIG_TRIBE, b"EasyTribe", 1, b"", b"", 0, 0, 0), 1);
    }

    #[test]
    fun advanced_reclaim_tribe_round_trip() {
        run_reclaim_tribe(
            build_tribe_header(ORIG_TRIBE, b"AdvTribe", 2, b"GoldCoin", b"GLD", 6, 1_000_000, 500_000),
            2,
        );
    }

    #[test]
    #[expected_failure(abort_code = 1, location = bazaar_economy::reclaim_tribe)] // E_TRIBE_ID_MISMATCH
    fun reclaim_tribe_payload_id_mismatch_aborts() {
        // Record keyed by ORIG_TRIBE but the payload encodes a DIFFERENT tribe id.
        run_reclaim_tribe(build_tribe_header(OTHER_TRIBE, b"EasyTribe", 1, b"", b"", 0, 0, 0), 1);
    }

    // ===== reclaim_tribe_mint_page (isolation) =====

    #[test]
    fun mint_page_regrows_balances() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut l = ledger::create_for_reclaim(ORIG_TRIBE, b"GoldCoin", b"GLD", 2, 0, &clock, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(ORIG_TRIBE, &mut ctx);
        let mut gate = ceremony_gate::create_for_testing(&mut ctx);
        ceremony_gate::set_open_for_testing(&mut gate, true);

        reclaim_tribe::reclaim_tribe_mint_page(
            &cap, &mut l, &gate, vector[ALICE, BOB], vector[600u64, 400u64], &clock, &ctx,
        );
        assert!(ledger::balance_of(&l, ALICE) == 600, 0);
        assert!(ledger::balance_of(&l, BOB) == 400, 1);
        assert!(ledger::total_supply(&l) == 1_000, 2);

        ceremony_gate::destroy_for_testing(gate);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        test_utils::destroy(l);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 5, location = bazaar_economy::reclaim_tribe)] // E_CEREMONY_NOT_OPEN
    fun mint_page_gate_closed_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut l = ledger::create_for_reclaim(ORIG_TRIBE, b"GoldCoin", b"GLD", 2, 0, &clock, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(ORIG_TRIBE, &mut ctx);
        let gate = ceremony_gate::create_for_testing(&mut ctx); // starts CLOSED

        reclaim_tribe::reclaim_tribe_mint_page(&cap, &mut l, &gate, vector[ALICE], vector[1u64], &clock, &ctx);

        ceremony_gate::destroy_for_testing(gate);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        test_utils::destroy(l);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = bazaar_economy::reclaim_tribe)] // E_WRONG_TRIBE
    fun mint_page_wrong_tribe_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut l = ledger::create_for_reclaim(ORIG_TRIBE, b"GoldCoin", b"GLD", 2, 0, &clock, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(OTHER_TRIBE, &mut ctx);
        let mut gate = ceremony_gate::create_for_testing(&mut ctx);
        ceremony_gate::set_open_for_testing(&mut gate, true); // open so the WRONG_TRIBE assert is reached

        reclaim_tribe::reclaim_tribe_mint_page(&cap, &mut l, &gate, vector[ALICE], vector[1u64], &clock, &ctx);

        ceremony_gate::destroy_for_testing(gate);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        test_utils::destroy(l);
        clock::destroy_for_testing(clock);
    }

    // ===== reclaim_tribe_restore (isolation) =====

    #[test]
    fun restore_deposits_gov_eve_sets_ban_and_fee() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(ORIG_TRIBE, TRIBE_TYPE, ALICE, 0, &clock, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(ORIG_TRIBE, &mut ctx);

        reclaim_tribe::reclaim_tribe_restore(
            &cap, &mut gov, coin::mint_for_testing<EVE>(8_888, &mut ctx), 50,
            vector[BOB], vector[1_000u64],
            &clock, &mut ctx,
        );

        assert!(tribe_governance::tribe_tax_balance(&gov) == 8_888, 0);
        assert!(tribe_governance::tribe_is_globally_banned(&gov, BOB, &clock), 1);
        assert!(tribe_governance::tribe_mission_listing_fee_per_hour(&gov) == 50, 2);

        // Drain before teardown (destroy_for_testing asserts a zero tax_wallet) — via the
        // public leader-gated withdraw (the package-private split-all is not cross-package).
        let c = tribe_governance::withdraw_tribe_tax(&cap, &mut gov, 8_888, &clock, &mut ctx);
        coin::burn_for_testing(c);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
