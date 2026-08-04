// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Update Ceremony V2 — Phase 2 (Slice 3) round-trip + abort tests for
// bazaar_mission::reclaim_ssu (the two-PTB SSU reclaim).
//
//   - NoTribe round-trip: shell registers+bootstraps; restore re-applies roster,
//     a timed local ban, mission fee, godot URL and the lazy-drained EVE.
//   - Frontier-owner mismatch -> E_NOT_FRONTIER_OWNER (1).
//   - payload SSU id mismatch -> E_SSU_ID_MISMATCH (2).
//   - Easy SSU whose tribe is not yet reclaimed -> E_NOT_REMAPPED (reclaim_registry).

#[test_only]
module bazaar_mission::reclaim_ssu_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock::{Self, Clock};
    use sui::coin;
    use sui::bcs;
    use sui::transfer;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use world::access;
    use world::storage_unit::StorageUnit;
    use dapp_hub::reclaim_registry::{Self, ReclaimRegistry};
    use dapp_hub::ssu_registry::{Self, SSURegistry};
    use dapp_hub::dapp_governance::{Self, DAppOwnerCap};
    use bazaar_core::membership::{Self, SSUOwnerCap, MemberRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_mission::reclaim_ssu;

    const ALICE: address = @0xA11CE;   // SSU owner + reclaim caller
    const BOB:   address = @0xB0B;      // restored member
    const CAROL: address = @0xCEED;     // banned member
    const SSU_ID:    address = @0x5;
    const OTHER_ID:  address = @0x6;
    const PKG:       address = @0xCAFE;
    const SSU_TYPE:  u8 = 0;
    const RETENTION: u64 = 1_000;

    // Build the SSUOwnerPayload binding header the shell decodes (fields 1-4 of §6.4):
    // original_ssu_id: address, url_slug: vector<u8>, bazaar_type: u8, original_tribe_id: u64.
    fun build_header(ssu_id: address, bazaar_type: u8, tribe_id: u64): vector<u8> {
        let slug: vector<u8> = b"ssu-slug";
        let mut blob = bcs::to_bytes(&ssu_id);
        vector::append(&mut blob, bcs::to_bytes(&slug));
        vector::append(&mut blob, bcs::to_bytes(&bazaar_type));
        vector::append(&mut blob, bcs::to_bytes(&tribe_id));
        blob
    }

    fun setup(scenario: &mut ts::Scenario): (DAppOwnerCap, Clock) {
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(scenario));
        let clock = clock::create_for_testing(ts::ctx(scenario));
        let rreg = reclaim_registry::create_for_testing(ts::ctx(scenario));
        reclaim_registry::share_for_testing(rreg);
        let sreg = ssu_registry::create_for_testing(ts::ctx(scenario));
        ssu_registry::share_for_testing(sreg);
        (cap, clock)
    }

    fun teardown(cap: DAppOwnerCap, clock: Clock) {
        transfer::public_transfer(cap, ALICE);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun notribe_round_trip() {
        let mut scenario = ts::begin(ALICE);
        let (cap, clock) = setup(&mut scenario);

        // --- PTB 1: populate + shell ---
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut rreg = ts::take_shared<ReclaimRegistry>(&scenario);
            let mut sreg = ts::take_shared<SSURegistry>(&scenario);
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut rreg,
                vector[ALICE], vector[SSU_TYPE], vector[sui::address::to_u256(SSU_ID)],
                vector[build_header(SSU_ID, 0, 0)],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            let ocap = access::create_owner_cap_for_testing<StorageUnit>(
                object::id_from_address(SSU_ID), ts::ctx(&mut scenario),
            );
            reclaim_ssu::reclaim_ssu_shell(
                &mut rreg, &mut sreg, &ocap, SSU_ID, PKG, &clock, ts::ctx(&mut scenario),
            );
            assert!(ssu_registry::is_registered(&sreg, SSU_ID), 0);
            assert!(ssu_registry::is_bootstrapped(&sreg, SSU_ID), 1);
            test_utils::destroy(ocap);
            ts::return_shared(rreg);
            ts::return_shared(sreg);
        };

        // --- PTB 2: restore ---
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut gov = ts::take_shared<SSUGovernance>(&scenario);
            let mut mreg = ts::take_shared<MemberRegistry>(&scenario);
            let ocap = ts::take_from_sender<SSUOwnerCap>(&scenario);
            let eve = coin::mint_for_testing<EVE>(5_000, ts::ctx(&mut scenario));

            reclaim_ssu::reclaim_ssu_restore(
                &ocap, &mut gov, &mut mreg, eve, b"https://client.example", 99,
                vector[BOB], vector[5u8], vector[false],   // BOB -> Admin, not banned
                vector[CAROL], vector[1_000u64],           // CAROL banned until ms 1000
                &clock, ts::ctx(&mut scenario),
            );

            assert!(membership::ssu_role_of(&mreg, BOB) == 5, 10);
            assert!(ssu_governance::is_banned(&gov, CAROL, &clock), 11);
            assert!(ssu_governance::ssu_tax_balance(&gov) == 5_000, 12);
            assert!(ssu_governance::ssu_mission_listing_fee_per_hour(&gov) == 99, 13);

            ts::return_to_sender(&scenario, ocap);
            ts::return_shared(gov);
            ts::return_shared(mreg);
        };

        teardown(cap, clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = bazaar_mission::reclaim_ssu)] // E_NOT_FRONTIER_OWNER
    fun shell_wrong_frontier_owner_aborts() {
        let mut scenario = ts::begin(ALICE);
        let (cap, clock) = setup(&mut scenario);
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut rreg = ts::take_shared<ReclaimRegistry>(&scenario);
            let mut sreg = ts::take_shared<SSURegistry>(&scenario);
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut rreg,
                vector[ALICE], vector[SSU_TYPE], vector[sui::address::to_u256(SSU_ID)],
                vector[build_header(SSU_ID, 0, 0)],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            // Cap authorises a DIFFERENT object than the SSU being reclaimed.
            let ocap = access::create_owner_cap_for_testing<StorageUnit>(
                object::id_from_address(OTHER_ID), ts::ctx(&mut scenario),
            );
            reclaim_ssu::reclaim_ssu_shell(
                &mut rreg, &mut sreg, &ocap, SSU_ID, PKG, &clock, ts::ctx(&mut scenario),
            );
            test_utils::destroy(ocap);
            ts::return_shared(rreg);
            ts::return_shared(sreg);
        };
        teardown(cap, clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = bazaar_mission::reclaim_ssu)] // E_SSU_ID_MISMATCH
    fun shell_payload_ssu_mismatch_aborts() {
        let mut scenario = ts::begin(ALICE);
        let (cap, clock) = setup(&mut scenario);
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut rreg = ts::take_shared<ReclaimRegistry>(&scenario);
            let mut sreg = ts::take_shared<SSURegistry>(&scenario);
            // Record keyed by SSU_ID, but the payload encodes a DIFFERENT original_ssu_id.
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut rreg,
                vector[ALICE], vector[SSU_TYPE], vector[sui::address::to_u256(SSU_ID)],
                vector[build_header(OTHER_ID, 0, 0)],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            let ocap = access::create_owner_cap_for_testing<StorageUnit>(
                object::id_from_address(SSU_ID), ts::ctx(&mut scenario),
            );
            reclaim_ssu::reclaim_ssu_shell(
                &mut rreg, &mut sreg, &ocap, SSU_ID, PKG, &clock, ts::ctx(&mut scenario),
            );
            test_utils::destroy(ocap);
            ts::return_shared(rreg);
            ts::return_shared(sreg);
        };
        teardown(cap, clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 8, location = dapp_hub::reclaim_registry)] // E_NOT_REMAPPED
    fun shell_easy_tribe_not_reclaimed_aborts() {
        let mut scenario = ts::begin(ALICE);
        let (cap, clock) = setup(&mut scenario);
        ts::next_tx(&mut scenario, ALICE);
        {
            let mut rreg = ts::take_shared<ReclaimRegistry>(&scenario);
            let mut sreg = ts::take_shared<SSURegistry>(&scenario);
            // Easy SSU (bazaar_type = 1) whose tribe (77) has NOT been reclaimed -> no remap.
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut rreg,
                vector[ALICE], vector[SSU_TYPE], vector[sui::address::to_u256(SSU_ID)],
                vector[build_header(SSU_ID, 1, 77)],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            let ocap = access::create_owner_cap_for_testing<StorageUnit>(
                object::id_from_address(SSU_ID), ts::ctx(&mut scenario),
            );
            reclaim_ssu::reclaim_ssu_shell(
                &mut rreg, &mut sreg, &ocap, SSU_ID, PKG, &clock, ts::ctx(&mut scenario),
            );
            test_utils::destroy(ocap);
            ts::return_shared(rreg);
            ts::return_shared(sreg);
        };
        teardown(cap, clock);
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
