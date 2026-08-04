// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Update Ceremony V2 — Phase 2 (Slice 3) tests for
// ssu_registry::register_for_reclaim:
//   - happy path: Frontier OwnerCap authorises ssu_id -> registers with the remapped
//     new_tribe_id + snapshot bazaar_type, owner = sender, no fee.
//   - wrong cap (authorises a different object) -> E_NOT_SSU_FRONTIER_OWNER (7).
//   - squat: ssu_id already registered -> E_SSU_ALREADY_REGISTERED (2).

#[test_only]
module dapp_hub::register_for_reclaim_tests {
    use sui::clock;
    use sui::object;
    use sui::test_utils;
    use world::access;
    use world::storage_unit::StorageUnit;
    use dapp_hub::ssu_registry;

    const SSU_ID:    address = @0x5;
    const OTHER_ID:  address = @0x6;
    const NEW_TRIBE: u64 = 42;

    #[test]
    fun register_for_reclaim_happy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut reg = ssu_registry::create_for_testing(&mut ctx);
        let cap = access::create_owner_cap_for_testing<StorageUnit>(
            object::id_from_address(SSU_ID), &mut ctx,
        );

        // bazaar_type 1 (Easy), remapped tribe.
        ssu_registry::register_for_reclaim(&mut reg, &cap, SSU_ID, 1, NEW_TRIBE, &clock, &mut ctx);

        assert!(ssu_registry::is_registered(&reg, SSU_ID), 0);
        let r = ssu_registry::registration(&reg, SSU_ID);
        assert!(ssu_registry::ssu_owner(r) == tx_context::sender(&ctx), 1);
        assert!(ssu_registry::ssu_tribe_id(r) == NEW_TRIBE, 2);
        assert!(ssu_registry::ssu_bazaar_type(r) == 1, 3);
        assert!(ssu_registry::ssu_count(&reg) == 1, 4);

        test_utils::destroy(cap);
        test_utils::destroy(reg);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 7, location = dapp_hub::ssu_registry)] // E_NOT_SSU_FRONTIER_OWNER
    fun register_for_reclaim_wrong_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut reg = ssu_registry::create_for_testing(&mut ctx);
        // Cap authorises a DIFFERENT object than the one being reclaimed.
        let cap = access::create_owner_cap_for_testing<StorageUnit>(
            object::id_from_address(OTHER_ID), &mut ctx,
        );

        ssu_registry::register_for_reclaim(&mut reg, &cap, SSU_ID, 0, 0, &clock, &mut ctx);

        test_utils::destroy(cap);
        test_utils::destroy(reg);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = dapp_hub::ssu_registry)] // E_SSU_ALREADY_REGISTERED
    fun register_for_reclaim_squat_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut reg = ssu_registry::create_for_testing(&mut ctx);
        let cap = access::create_owner_cap_for_testing<StorageUnit>(
            object::id_from_address(SSU_ID), &mut ctx,
        );

        // First reclaim succeeds; second on the same id aborts (squat guard).
        ssu_registry::register_for_reclaim(&mut reg, &cap, SSU_ID, 0, 0, &clock, &mut ctx);
        ssu_registry::register_for_reclaim(&mut reg, &cap, SSU_ID, 0, 0, &clock, &mut ctx);

        test_utils::destroy(cap);
        test_utils::destroy(reg);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
