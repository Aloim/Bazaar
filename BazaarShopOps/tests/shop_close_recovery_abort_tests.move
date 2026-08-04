// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Abort tests 9-14, 18, 19, 20a, 20b for bazar_close / shop_moderation / bazar.
///
/// Error codes (source-truth per APM-tfp-p3.2-drift-catalog F-11/F-12):
///   3  E_NOT_SHOP_OWNER                    bazar_close.move:31
///   5  E_SHOP_NOT_ACTIVE                   bazar_close.move:33
///   16 E_RECIPIENT_NOT_SHOP_OWNER          bazar_close.move:35
///   18 E_WRONG_OWNER_CAP_FOR_SSU           bazar_close.move:40
///   19 E_CHARACTER_NOT_SENDER              bazar_close.move:43 — UNREACHABLE (see Test 14)
///   20 E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP bazar_close.move:47
///   21 E_TOO_MANY_LISTINGS                 bazar.move:55
///
/// WorldStub: storage ops (deposit_to_owned, withdraw_from_open_inventory) abort 0.
/// All tests that pass &mut StorageUnit use empty-listing shops so drain loops
/// execute 0 iterations and never reach those stubs.
/// Tests 12 and 14 target assert-3 (E_RECIPIENT = 16) which fires before any drain.
/// world::character::character_address no longer aborts (R1.1 upgrade landed).
/// Temporaryfixplan Phase 3.2 rev4.
#[test_only]
module bazaar_shop_ops::shop_close_recovery_abort_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::test_utils;
    use sui::object::{Self, ID};
    use std::option;
    use bazaar_core::bazar::{Self};
    use bazaar_core::bazar_test_accessors::{Self as bazar_accessors};
    use bazaar_shop_ops::bazar_close;
    use bazaar_shop_ops::shop_moderation;
    use bazaar_shop_ops::shop_ops_wtb;
    use bazaar_shop_ops::shop_ops_cap_store;
    use bazaar_core::wtb_escrow_pool;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_core::membership::{Self};
    use bazaar_shop_ops::shop_close_recovery_test_helpers::{Self as close_helpers};
    use world::storage_unit::{Self, StorageUnit};
    use world::character::{Self};
    use world::access;

    const OWNER: address    = @0xA001;
    const ATTACKER: address = @0xA003;
    const SSU_ADDR: address = @0xBEEF;
    const TRIBE_ID: u64     = 0;
    const BAZAAR_TYPE: u8   = 0;

    // Local mirrors of private bazar_close / bazar constants.
    const E_NOT_SHOP_OWNER:                    u64 = 3;
    const E_SHOP_NOT_ACTIVE:                   u64 = 5;
    const E_RECIPIENT_NOT_SHOP_OWNER:          u64 = 16;
    const E_WRONG_OWNER_CAP_FOR_SSU:           u64 = 18;
    const E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP: u64 = 20;
    const E_TOO_MANY_LISTINGS:                 u64 = 21;

    // ===== Test 9 =====
    // force_close_shop_as_super_admin on SSU-owner's shop aborts 20.
    // force_close_shop_internal asserts !shop_owner_is_ssu_owner(shop, gov)
    // before any drain — SSU owner must use close_shop (self-close).
    // Drain never reached: empty-listing shop + abort fires at SSU-owner guard.
    #[test]
    #[expected_failure(abort_code = E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP, location = bazaar_shop_ops::shop_moderation)]
    fun test_force_close_ssu_owner_shop_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER,
            object::id_from_address(@0x0), &clk, ctx,
        );
        let mut registry = bazar_accessors::create_registry_for_testing(ctx);
        let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
        // Shop owner == OWNER == SSU gov owner → force-close aborts 20.
        let shop_id = close_helpers::make_wts_shop_empty(
            &mut registry, &gov, &members, SSU_ADDR, TRIBE_ID, BAZAAR_TYPE, &clk, ctx,
        );
        let super_admin_cap =
            close_helpers::create_ssu_super_admin_cap_for_testing(SSU_ADDR, ctx);
        // CC-206 fix: use WorldStub factory (R1.6) instead of create_one_time_witness.
        let mut ssu = storage_unit::create_storage_unit_for_testing(SSU_ADDR, ctx);
        let recipient_char = character::create_character_for_testing(OWNER, ctx);
        // Abort fires at SSU-owner guard before any world drain call.
        shop_moderation::force_close_shop_as_super_admin(
            &super_admin_cap, &mut registry, shop_id, &gov,
            &mut ssu, &recipient_char, &mut pool, &cap_store, &clk, ctx,
        );
        abort 0 // unreachable; keeps compiler happy
    }

    // ===== Test 10 =====
    // close_shop by non-owner aborts E_NOT_SHOP_OWNER = 3 (assert 1).
    //
    // Three-phase shared-object pattern (mirrors we02 in wtb_escrow_pool_security_tests):
    //   Phase 0 (OWNER): share BazarRegistry so it persists across tx boundaries.
    //   Phase 1 (OWNER): create the shop — ctx.sender()==OWNER → shop.owner==OWNER.
    //   Phase 2 (ATTACKER): take shared registry, call close_shop.
    //                       sender==ATTACKER != OWNER → assert 1 → E_NOT_SHOP_OWNER = 3.
    #[test]
    #[expected_failure(abort_code = E_NOT_SHOP_OWNER, location = bazaar_shop_ops::bazar_close)]
    fun test_close_by_non_owner_aborts() {
        let mut scenario = ts::begin(OWNER);

        // --- Phase 0: share BazarRegistry ---
        {
            let ctx = ts::ctx(&mut scenario);
            let registry = bazar_accessors::create_registry_for_testing(ctx);
            bazar::share_for_testing(registry);
        };

        // --- Phase 1 (OWNER): create WTS shop → shop.owner == OWNER ---
        ts::next_tx(&mut scenario, OWNER);
        let shop_id: ID;
        {
            let mut registry: bazar::BazarRegistry = ts::take_shared(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER,
                object::id_from_address(@0x0), &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
            shop_id = close_helpers::make_wts_shop_empty(
                &mut registry, &gov, &members, SSU_ADDR, TRIBE_ID, BAZAAR_TYPE, &clk, ctx,
            );
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            clock::destroy_for_testing(clk);
            ts::return_shared(registry);
        };

        // --- Phase 2 (ATTACKER): attempt close → assert 1 fires E_NOT_SHOP_OWNER = 3 ---
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut registry: bazar::BazarRegistry = ts::take_shared(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER,
                object::id_from_address(@0x0), &clk, ctx,
            );
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let mut ssu = storage_unit::create_storage_unit_for_testing(SSU_ADDR, ctx);
            let ssu_id = object::id(&ssu);
            let owner_cap = access::create_owner_cap_for_testing<StorageUnit>(ssu_id, ctx);
            let character = character::create_character_for_testing(ATTACKER, ctx);
            // sender==ATTACKER, shop.owner==OWNER → bazar_close assert 1 → E_NOT_SHOP_OWNER = 3.
            bazar_close::close_shop_as_ssu_owner(
                &mut registry, shop_id, &gov, &mut ssu, &character,
                &owner_cap, &mut pool, &cap_store, &clk, ctx,
            );
            test_utils::destroy(owner_cap);
            abort 0 // unreachable
        };
        ts::end(scenario);
    }

    // ===== Test 11 =====
    // close_shop with wrong-SSU OwnerCap aborts E_WRONG_OWNER_CAP_FOR_SSU = 18 (assert 7).
    // Cap is a world::access::OwnerCap<StorageUnit> minted fresh (arbitrary ssu_id) —
    // its ssu_id will NOT match the registry entry for SSU_ADDR → assert 7 fires.
    // Rev4 fix (CC-411): use world::access::create_owner_cap_for_testing<StorageUnit>
    // instead of gov_helpers::create_owner_cap_for_testing which returns membership::SSUOwnerCap
    // (a completely different type — Move type system rejects the option::some wrapping).
    #[test]
    #[expected_failure(abort_code = E_WRONG_OWNER_CAP_FOR_SSU, location = bazaar_shop_ops::bazar_close)]
    fun test_close_with_wrong_cap_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER,
            object::id_from_address(@0x0), &clk, ctx,
        );
        let mut registry = bazar_accessors::create_registry_for_testing(ctx);
        let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
        let shop_id = close_helpers::make_wts_shop_empty(
            &mut registry, &gov, &members, SSU_ADDR, TRIBE_ID, BAZAAR_TYPE, &clk, ctx,
        );
        // Rev4: correct type — world::access::OwnerCap<StorageUnit>.
        // The factory mints a cap with a fresh object ID as ssu_id, which will not
        // match the registry-entry ssu_id for SSU_ADDR → assert 7 aborts with 18.
        let wrong_id = object::id_from_address(@0xDEAD);
        let wrong_cap = access::create_owner_cap_for_testing<StorageUnit>(wrong_id, ctx);
        let mut ssu = storage_unit::create_storage_unit_for_testing(SSU_ADDR, ctx);
        let character = character::create_character_for_testing(OWNER, ctx);
        // Asserts 1-3 pass (sender == owner, shop active, character_address == OWNER).
        // Assert 7 fires: cap.ssu_id != registry_entry.ssu_id → abort 18.
        bazar_close::close_shop_as_ssu_owner(
            &mut registry, shop_id, &gov, &mut ssu, &character,
            &wrong_cap, &mut pool, &cap_store, &clk, ctx,
        );
        test_utils::destroy(wrong_cap);
        abort 0 // unreachable
    }

    // ===== Test 12 =====
    // close_shop with wrong recipient aborts E_RECIPIENT_NOT_SHOP_OWNER = 16 (assert 3).
    // character_address(attacker_char) returns ATTACKER != OWNER (shop.owner) → assert 3 fires.
    // WorldStub R1.1 upgrade: character_address now returns character.addr without abort.
    #[test]
    #[expected_failure(abort_code = E_RECIPIENT_NOT_SHOP_OWNER, location = bazaar_shop_ops::bazar_close)]
    fun test_close_with_wrong_recipient_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER,
            object::id_from_address(@0x0), &clk, ctx,
        );
        let mut registry = bazar_accessors::create_registry_for_testing(ctx);
        let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
        let shop_id = close_helpers::make_wts_shop_empty(
            &mut registry, &gov, &members, SSU_ADDR, TRIBE_ID, BAZAAR_TYPE, &clk, ctx,
        );
        // CC-206 fix: WorldStub factory.
        let mut ssu = storage_unit::create_storage_unit_for_testing(SSU_ADDR, ctx);
        // Attacker character: character_address(attacker_char) == ATTACKER != OWNER → abort 16.
        let attacker_char = character::create_character_for_testing(ATTACKER, ctx);
        bazar_close::close_shop(
            &mut registry, shop_id, &gov, &mut ssu, &attacker_char,
            &mut pool, &cap_store, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 13 =====
    // close_shop on already-inactive shop aborts E_SHOP_NOT_ACTIVE = 5 (assert 2).
    // Drain never reached: assert 2 fires before any world drain call.
    #[test]
    #[expected_failure(abort_code = E_SHOP_NOT_ACTIVE, location = bazaar_shop_ops::bazar_close)]
    fun test_close_already_inactive_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER,
            object::id_from_address(@0x0), &clk, ctx,
        );
        let mut registry = bazar_accessors::create_registry_for_testing(ctx);
        let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
        let shop_id = close_helpers::make_inactive_shop(
            &mut registry, &gov, &members, SSU_ADDR, TRIBE_ID, BAZAAR_TYPE, &clk, ctx,
        );
        // CC-206 fix: WorldStub factories.
        let mut ssu = storage_unit::create_storage_unit_for_testing(SSU_ADDR, ctx);
        let character = character::create_character_for_testing(OWNER, ctx);
        // Assert 2 fires: shop.is_active == false → abort 5.
        bazar_close::close_shop(
            &mut registry, shop_id, &gov, &mut ssu, &character,
            &mut pool, &cap_store, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 14 — CC-105 downgrade =====
    // Renamed: test_close_with_character_not_sender_downgraded_to_recipient_assert
    //
    // STRUCTURAL ANALYSIS (CC-105, retained from rev2):
    //   close_shop assert order (bazar_close.move, canonical per CC v2 review R4):
    //     Assert 1: sender == shop.owner                  → E_NOT_SHOP_OWNER = 3
    //     Assert 2: shop_is_active                        → E_SHOP_NOT_ACTIVE = 5
    //     Assert 3: character_address(char) == shop.owner → E_RECIPIENT = 16  ← fires first
    //     Assert 7: cap authorized for ssu                → E_WRONG_OWNER_CAP = 18
    //     Assert 8: character_address(char) == sender     → E_CHARACTER_NOT_SENDER = 19
    //
    //   When sender == OWNER (assert 1 passes) and character was created with ATTACKER addr,
    //   assert 3 fires (code 16) before assert 8 can fire (code 19).
    //   E_CHARACTER_NOT_SENDER = 19 is structurally UNREACHABLE via this path.
    //   WorldStub R1.1: character_address returns character.addr without abort —
    //   test now exercises the real assertion path at assert 3.
    #[test]
    #[expected_failure(abort_code = E_RECIPIENT_NOT_SHOP_OWNER, location = bazaar_shop_ops::bazar_close)] // CC-105: was 19, correct is 16
    fun test_close_with_character_not_sender_downgraded_to_recipient_assert() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER,
            object::id_from_address(@0x0), &clk, ctx,
        );
        let mut registry = bazar_accessors::create_registry_for_testing(ctx);
        let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
        let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
        let shop_id = close_helpers::make_wts_shop_empty(
            &mut registry, &gov, &members, SSU_ADDR, TRIBE_ID, BAZAAR_TYPE, &clk, ctx,
        );
        // CC-206 fix: WorldStub factory.
        let mut ssu = storage_unit::create_storage_unit_for_testing(SSU_ADDR, ctx);
        // Wrong character (addr == ATTACKER): character_address != OWNER → assert 3 fires (16).
        let wrong_char = character::create_character_for_testing(ATTACKER, ctx);
        bazar_close::close_shop(
            &mut registry, shop_id, &gov, &mut ssu, &wrong_char,
            &mut pool, &cap_store, &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 18 =====
    // create_wts_shop with 65 listings aborts E_TOO_MANY_LISTINGS = 21.
    // SA-312.a DoS guard: bazar.move asserts length <= MAX_SHOP_LISTINGS (64).
    // CC-207 fix: position_x/y added; correct arg order per bazar.move:189.
    #[test]
    #[expected_failure(abort_code = E_TOO_MANY_LISTINGS, location = bazaar_core::bazar)]
    fun test_create_wts_shop_too_many_listings_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER,
            object::id_from_address(@0x0), &clk, ctx,
        );
        let mut registry = bazar_accessors::create_registry_for_testing(ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
        let mut ids    = vector::empty<u64>();
        let mut qtys   = vector::empty<u64>();
        let mut prices = vector::empty<u64>();
        let mut i = 0u64;
        while (i < 65) {
            vector::push_back(&mut ids,    i + 1);
            vector::push_back(&mut qtys,   1u64);
            vector::push_back(&mut prices, 100u64);
            i = i + 1;
        };
        // CC-207 fix: corrected arg order + position_x/y.
        bazar_accessors::create_wts_shop_for_testing(
            &mut registry, &gov, &members,
            BAZAAR_TYPE, b"TooManyWTS", SSU_ADDR, TRIBE_ID,
            ids, qtys, prices,
            9999999999u64, // expiry_ms
            0u64, 0u64,    // position_x, position_y
            &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 19 =====
    // Cross-module E_RECIPIENT_NOT_SHOP_OWNER = 16 value equality (CC-110 / CC-306).
    // bazar_close, shop_moderation, and shop_ops_wtb each independently redeclare
    // this constant (Move constants are module-private). All three must equal 16.
    // Accessor availability: all 3 confirmed live (grep 2026-05-10).
    #[test]
    fun test_cross_module_e_recipient_not_shop_owner_equals_16() {
        let bc_val  = bazar_close::e_recipient_not_shop_owner_for_testing();
        let sm_val  = shop_moderation::e_recipient_not_shop_owner_for_testing();
        let wtb_val = shop_ops_wtb::e_recipient_not_shop_owner_for_testing();
        assert!(bc_val  == 16, 0);
        assert!(sm_val  == 16, 1);
        assert!(wtb_val == 16, 2);
        assert!(bc_val  == sm_val,  3);
        assert!(bc_val  == wtb_val, 4);
    }

    // ===== Test 20a — SA-401 =====
    // create_de_shop with 65 OFFER pairs aborts E_TOO_MANY_LISTINGS = 21.
    // bazar.move offer-side assert: length(&offer_item_type_ids) <= MAX_SHOP_LISTINGS.
    // CC-207 fix: position_x/y added; corrected arg order per bazar.move:257.
    #[test]
    #[expected_failure(abort_code = E_TOO_MANY_LISTINGS, location = bazaar_core::bazar)]
    fun test_create_de_shop_too_many_offer_pairs_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER,
            object::id_from_address(@0x0), &clk, ctx,
        );
        let mut registry = bazar_accessors::create_registry_for_testing(ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
        let mut offer_ids  = vector::empty<u64>();
        let mut offer_qtys = vector::empty<u64>();
        let mut i = 0u64;
        while (i < 65) {
            vector::push_back(&mut offer_ids,  i + 100);
            vector::push_back(&mut offer_qtys, 1u64);
            i = i + 1;
        };
        let request_ids  = vector[200u64];
        let request_qtys = vector[1u64];
        // CC-207 fix: corrected arg order + position_x/y.
        bazar_accessors::create_de_shop_for_testing(
            &mut registry, &gov, &members,
            BAZAAR_TYPE, b"TooManyDE-Offer", SSU_ADDR, TRIBE_ID,
            offer_ids, offer_qtys, request_ids, request_qtys,
            vector[1u64],  // offer_per_lots (unused — aborts on the length cap before build_pairs)
            9999999999u64, // expiry_ms
            0u64, 0u64,    // position_x, position_y
            &clk, ctx,
        );
        abort 0 // unreachable
    }

    // ===== Test 20b — SA-401 =====
    // create_de_shop with 65 REQUEST pairs aborts E_TOO_MANY_LISTINGS = 21.
    // bazar.move request-side assert: length(&request_item_type_ids) <= MAX_SHOP_LISTINGS.
    // Offer side is valid (1 pair). Request side carries 65 → abort 21.
    // CC-207 fix: position_x/y added; corrected arg order per bazar.move:257.
    #[test]
    #[expected_failure(abort_code = E_TOO_MANY_LISTINGS, location = bazaar_core::bazar)]
    fun test_create_de_shop_too_many_request_pairs_aborts() {
        let mut scenario = ts::begin(OWNER);
        let ctx = ts::ctx(&mut scenario);
        let clk = clock::create_for_testing(ctx);
        let gov = gov_helpers::create_for_testing(
            SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER,
            object::id_from_address(@0x0), &clk, ctx,
        );
        let mut registry = bazar_accessors::create_registry_for_testing(ctx);
        let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);
        let offer_ids  = vector[100u64];
        let offer_qtys = vector[1u64];
        let mut request_ids  = vector::empty<u64>();
        let mut request_qtys = vector::empty<u64>();
        let mut i = 0u64;
        while (i < 65) {
            vector::push_back(&mut request_ids,  i + 200);
            vector::push_back(&mut request_qtys, 1u64);
            i = i + 1;
        };
        // CC-207 fix: corrected arg order + position_x/y.
        bazar_accessors::create_de_shop_for_testing(
            &mut registry, &gov, &members,
            BAZAAR_TYPE, b"TooManyDE-Request", SSU_ADDR, TRIBE_ID,
            offer_ids, offer_qtys, request_ids, request_qtys,
            vector[1u64],  // offer_per_lots (unused — aborts on the length cap before build_pairs)
            9999999999u64, // expiry_ms
            0u64, 0u64,    // position_x, position_y
            &clk, ctx,
        );
        abort 0 // unreachable
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
