#[test_only]
module dapp_hub::reclaim_registry_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock::{Self, Clock};
    use sui::transfer;
    use dapp_hub::reclaim_registry::{Self, ReclaimRegistry};
    use dapp_hub::dapp_governance::{Self, DAppOwnerCap};
    use dapp_hub::tribe_registry;

    const ALICE: address = @0xA11CE;
    const BOB:   address = @0xB0B;

    const SSU_TYPE:   u8 = 0;
    const TRIBE_TYPE: u8 = 1;
    const RETENTION:  u64 = 1_000;
    const GRACE:      u64 = 2_592_000_000; // mirror of GRACE_BUFFER_MS

    fun cleanup(cap: DAppOwnerCap, clock: Clock) {
        transfer::public_transfer(cap, ALICE);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun populate_then_consume_ssu() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, ALICE);
        {
            let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut reg,
                vector[ALICE], vector[SSU_TYPE], vector[42u256], vector[b"ssu-payload"],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            assert!(reclaim_registry::record_count(&reg) == 1, 0);
            assert!(reclaim_registry::has_record(&reg, ALICE, SSU_TYPE, 42u256), 1);

            let blob = reclaim_registry::consume_ssu_reclaim_record(
                &mut reg, 42u256, &clock, ts::ctx(&mut scenario),
            );
            assert!(blob == b"ssu-payload", 2);
            assert!(reclaim_registry::record_count(&reg) == 0, 3);
            assert!(!reclaim_registry::has_record(&reg, ALICE, SSU_TYPE, 42u256), 4);
            assert!(reclaim_registry::is_consumed(&reg, ALICE, SSU_TYPE, 42u256), 5);
            ts::return_shared(reg);
        };
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    fun populate_is_idempotent() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, ALICE);
        {
            let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut reg, vector[ALICE], vector[SSU_TYPE], vector[7u256], vector[b"p"],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            // Same key again -> silently skipped.
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut reg, vector[ALICE], vector[SSU_TYPE], vector[7u256], vector[b"p2"],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            assert!(reclaim_registry::record_count(&reg) == 1, 0);
            ts::return_shared(reg);
        };
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    fun consume_then_repopulate_does_not_resurrect() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, ALICE);
        {
            let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut reg, vector[ALICE], vector[SSU_TYPE], vector[9u256], vector[b"p"],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            let _ = reclaim_registry::consume_ssu_reclaim_record(&mut reg, 9u256, &clock, ts::ctx(&mut scenario));
            // Admin re-pages populate for the same (now-consumed) key -> MUST stay gone.
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut reg, vector[ALICE], vector[SSU_TYPE], vector[9u256], vector[b"again"],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            assert!(reclaim_registry::record_count(&reg) == 0, 0);
            assert!(!reclaim_registry::has_record(&reg, ALICE, SSU_TYPE, 9u256), 1);
            assert!(reclaim_registry::is_consumed(&reg, ALICE, SSU_TYPE, 9u256), 2);
            ts::return_shared(reg);
        };
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 6, location = dapp_hub::reclaim_registry)] // E_EMPTY_BATCH
    fun populate_empty_batch_aborts() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, ALICE);
        let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
        reclaim_registry::populate_reclaim_registry(
            &cap, &mut reg, vector[], vector[], vector[], vector[],
            1, RETENTION, &clock, ts::ctx(&mut scenario),
        );
        ts::return_shared(reg);
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 4, location = dapp_hub::reclaim_registry)] // E_LEN_MISMATCH
    fun populate_len_mismatch_aborts() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, ALICE);
        let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
        reclaim_registry::populate_reclaim_registry(
            &cap, &mut reg, vector[ALICE], vector[SSU_TYPE], vector[1u256, 2u256], vector[b"p"],
            1, RETENTION, &clock, ts::ctx(&mut scenario),
        );
        ts::return_shared(reg);
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 3, location = dapp_hub::reclaim_registry)] // E_BAD_RECORD_TYPE
    fun populate_bad_type_aborts() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, ALICE);
        let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
        reclaim_registry::populate_reclaim_registry(
            &cap, &mut reg, vector[ALICE], vector[9u8], vector[1u256], vector[b"p"],
            1, RETENTION, &clock, ts::ctx(&mut scenario),
        );
        ts::return_shared(reg);
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = dapp_hub::reclaim_registry)] // E_NOT_IN_BACKUP
    fun consume_wrong_sender_aborts() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, ALICE);
        {
            let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut reg, vector[ALICE], vector[SSU_TYPE], vector[5u256], vector[b"p"],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(reg);
        };
        // BOB (not the record holder) tries to consume ALICE's record.
        ts::next_tx(&mut scenario, BOB);
        let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
        let _ = reclaim_registry::consume_ssu_reclaim_record(&mut reg, 5u256, &clock, ts::ctx(&mut scenario));
        ts::return_shared(reg);
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = dapp_hub::reclaim_registry)] // E_NOT_IN_BACKUP (record gone)
    fun consume_double_aborts() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, ALICE);
        let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
        reclaim_registry::populate_reclaim_registry(
            &cap, &mut reg, vector[ALICE], vector[SSU_TYPE], vector[5u256], vector[b"p"],
            1, RETENTION, &clock, ts::ctx(&mut scenario),
        );
        let _ = reclaim_registry::consume_ssu_reclaim_record(&mut reg, 5u256, &clock, ts::ctx(&mut scenario));
        let _ = reclaim_registry::consume_ssu_reclaim_record(&mut reg, 5u256, &clock, ts::ctx(&mut scenario));
        ts::return_shared(reg);
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    fun prune_respects_grace_boundary() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario)); // starts at 0

        ts::next_tx(&mut scenario, ALICE);
        {
            let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut reg, vector[ALICE], vector[SSU_TYPE], vector[1u256], vector[b"p"],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            // 1ms before retention + grace -> NOT pruned.
            clock::set_for_testing(&mut clock, RETENTION + GRACE - 1);
            reclaim_registry::prune_expired_unclaimed_records(
                &cap, &mut reg, vector[ALICE], vector[SSU_TYPE], vector[1u256], &clock, ts::ctx(&mut scenario),
            );
            assert!(reclaim_registry::record_count(&reg) == 1, 0);
            assert!(reclaim_registry::has_record(&reg, ALICE, SSU_TYPE, 1u256), 1);
            // exactly at retention + grace -> pruned.
            clock::set_for_testing(&mut clock, RETENTION + GRACE);
            reclaim_registry::prune_expired_unclaimed_records(
                &cap, &mut reg, vector[ALICE], vector[SSU_TYPE], vector[1u256], &clock, ts::ctx(&mut scenario),
            );
            assert!(reclaim_registry::record_count(&reg) == 0, 2);
            assert!(!reclaim_registry::has_record(&reg, ALICE, SSU_TYPE, 1u256), 3);
            ts::return_shared(reg);
        };
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    fun tribe_remap_happy_path() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        // New tribe (id 99) the leader "created" during reclaim.
        let leader_cap = tribe_registry::create_leader_cap_for_testing(99, ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, ALICE);
        {
            let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
            // Populate a TRIBE_LEADER record for old tribe 55.
            reclaim_registry::populate_reclaim_registry(
                &cap, &mut reg, vector[ALICE], vector[TRIBE_TYPE], vector[55u256], vector[b"tribe"],
                1, RETENTION, &clock, ts::ctx(&mut scenario),
            );
            let (blob, proof) = reclaim_registry::consume_tribe_reclaim_record(
                &mut reg, 55u256, &clock, ts::ctx(&mut scenario),
            );
            assert!(blob == b"tribe", 0);
            reclaim_registry::record_tribe_remap(&mut reg, &leader_cap, 55, proof, &clock);
            assert!(reclaim_registry::is_tribe_remapped(&reg, 55), 1);
            assert!(reclaim_registry::resolve_remapped_tribe(&reg, 55) == 99, 2);
            ts::return_shared(reg);
        };
        transfer::public_transfer(leader_cap, ALICE);
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 9, location = dapp_hub::reclaim_registry)] // E_PROOF_MISMATCH
    fun tribe_remap_proof_mismatch_aborts() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        let leader_cap = tribe_registry::create_leader_cap_for_testing(99, ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, ALICE);
        let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
        // Proof bound to old id 55, but caller claims old id 56 -> mismatch.
        let proof = reclaim_registry::new_tribe_proof_for_testing(55);
        reclaim_registry::record_tribe_remap(&mut reg, &leader_cap, 56, proof, &clock);
        ts::return_shared(reg);
        transfer::public_transfer(leader_cap, ALICE);
        cleanup(cap, clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 7, location = dapp_hub::reclaim_registry)] // E_REMAP_EXISTS
    fun tribe_remap_duplicate_aborts() {
        let mut scenario = ts::begin(ALICE);
        let cap = dapp_governance::create_owner_cap_for_testing(ts::ctx(&mut scenario));
        reclaim_registry::create_and_share(ts::ctx(&mut scenario));
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        let leader_cap = tribe_registry::create_leader_cap_for_testing(99, ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, ALICE);
        let mut reg = ts::take_shared<ReclaimRegistry>(&scenario);
        let proof1 = reclaim_registry::new_tribe_proof_for_testing(55);
        reclaim_registry::record_tribe_remap(&mut reg, &leader_cap, 55, proof1, &clock);
        // Second remap of the same old id -> E_REMAP_EXISTS.
        let proof2 = reclaim_registry::new_tribe_proof_for_testing(55);
        reclaim_registry::record_tribe_remap(&mut reg, &leader_cap, 55, proof2, &clock);
        ts::return_shared(reg);
        transfer::public_transfer(leader_cap, ALICE);
        cleanup(cap, clock);
        ts::end(scenario);
    }
}
