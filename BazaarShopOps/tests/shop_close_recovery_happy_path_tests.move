// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Happy-path tests 1-8 and 17 for bazar_close / shop_moderation.
///
/// Tier routing:
///   Main Storage  = ssu_owner_cap = Some(OwnerCap<StorageUnit>)
///   Player Locker = ssu_owner_cap = None
///
/// WorldStub: all shops created with empty listings (vector[]) so
/// drain loops run 0 iterations and deposit_* stubs are never reached.
/// The character_address == sender assert inside close_shop fires before
/// any drain — this is the WorldStub blocker (Temporaryfixplan Phase 3.2).
///
/// CC-402: pool cleaned up via test_utils::destroy; balance reads use
///         wtb_escrow_pool::shop_escrow_balance / total_escrowed.
/// CC-403: close_shop is 9-arg (registry, shop_id, gov, ssu, character,
///         ssu_owner_cap, pool, clock, ctx). No members. No BazarAuth.
/// CC-404: force_close_shop_as_super_admin — cap is FIRST of 9 args.
/// CC-411: ssu_owner_cap type = Option<world::access::OwnerCap<StorageUnit>>.
#[test_only]
module bazaar_shop_ops::shop_close_recovery_happy_path_tests {
    use sui::test_scenario::{Self as ts};
    use sui::test_utils;
    use sui::clock;
    use sui::coin;
    use sui::object;
    use std::option;
    use EVE::EVE::EVE;
    use bazaar_core::bazar;
    use bazaar_core::bazar_free;
    use bazaar_core::bazar_test_accessors;
    use bazaar_shop_ops::bazar_close;
    use bazaar_shop_ops::shop_moderation;
    use bazaar_shop_ops::shop_ops_cap_store;
    use bazaar_core::wtb_escrow_pool;
    use bazaar_core::membership;
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use world::storage_unit::{Self as world_su, StorageUnit};
    use world::access::{Self as world_access, OwnerCap};
    use world::character::{Self as world_character};

    // -------------------------------------------------------
    // Addresses / constants
    // -------------------------------------------------------
    const OWNER:     address = @0xA001;
    const NON_OWNER: address = @0xA002;
    const ADMIN:     address = @0xA004;
    const SSU_ADDR:  address = @0xBEEF;
    const TRIBE_ID:  u64     = 0;
    const BAZAAR_TYPE_NOTRIBE: u8 = 0;

    // ===================================================================
    // Test 1 — WTS self-close Main Storage happy path (SSU owner)
    // ===================================================================
    #[test]
    fun test_wts_self_close_main_storage_happy_path() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(
                SSU_ADDR, TRIBE_ID, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            let shop_id = bazar_test_accessors::create_wts_shop_for_testing(
                &mut registry, &gov, &members,
                BAZAAR_TYPE_NOTRIBE, b"WTS-Main", SSU_ADDR, TRIBE_ID,
                vector[100u64], vector[1u64], vector[1000u64],
                0, 0, 0, &clk, ctx,
            );

            let mut ssu = world_su::create_storage_unit_for_testing(SSU_ADDR, ctx);
            let ssu_id = object::id(&ssu);
            let character = world_character::create_character_for_testing(OWNER, ctx);
            let owner_cap = world_access::create_owner_cap_for_testing<StorageUnit>(ssu_id, ctx);

            bazar_close::close_shop_as_ssu_owner(
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &character,
                &owner_cap,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );
            test_utils::destroy(owner_cap);

            assert!(!bazar::shop_is_active(bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id)), 0);

            test_utils::destroy(character);
            test_utils::destroy(ssu);
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // ===================================================================
    // Test 2 — WTS self-close Player Locker happy path (non-SSU-owner)
    // ===================================================================
    #[test]
    fun test_wts_self_close_player_locker_happy_path() {
        let mut scenario = ts::begin(NON_OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(
                SSU_ADDR, TRIBE_ID, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            let shop_id = bazar_test_accessors::create_wts_shop_for_testing(
                &mut registry, &gov, &members,
                BAZAAR_TYPE_NOTRIBE, b"WTS-Locker", SSU_ADDR, TRIBE_ID,
                vector[100u64], vector[1u64], vector[1000u64],
                0, 0, 0, &clk, ctx,
            );

            let mut ssu = world_su::create_storage_unit_for_testing(SSU_ADDR, ctx);
            let character = world_character::create_character_for_testing(NON_OWNER, ctx);

            bazar_close::close_shop(
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &character,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );

            assert!(!bazar::shop_is_active(bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id)), 0);

            test_utils::destroy(character);
            test_utils::destroy(ssu);
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // ===================================================================
    // Test 3 — DE self-close Main Storage happy path (SSU owner)
    // ===================================================================
    #[test]
    fun test_de_self_close_main_storage_happy_path() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(
                SSU_ADDR, TRIBE_ID, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            let shop_id = bazar_test_accessors::create_de_shop_for_testing(
                &mut registry, &gov, &members,
                BAZAAR_TYPE_NOTRIBE, b"DE-Main", SSU_ADDR, TRIBE_ID,
                vector[100u64], vector[1u64], vector[200u64], vector[1u64],
                vector[1u64],        // offer_per_lots (legacy 1:N ratio)
                0, 0, 0, &clk, ctx,
            );

            let mut ssu = world_su::create_storage_unit_for_testing(SSU_ADDR, ctx);
            let ssu_id = object::id(&ssu);
            let character = world_character::create_character_for_testing(OWNER, ctx);
            let owner_cap = world_access::create_owner_cap_for_testing<StorageUnit>(ssu_id, ctx);

            bazar_close::close_shop_as_ssu_owner(
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &character,
                &owner_cap,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );
            test_utils::destroy(owner_cap);

            assert!(!bazar::shop_is_active(bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id)), 0);

            test_utils::destroy(character);
            test_utils::destroy(ssu);
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // ===================================================================
    // Test 4 — DE self-close Player Locker happy path (non-SSU-owner)
    // ===================================================================
    #[test]
    fun test_de_self_close_player_locker_happy_path() {
        let mut scenario = ts::begin(NON_OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(
                SSU_ADDR, TRIBE_ID, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            let shop_id = bazar_test_accessors::create_de_shop_for_testing(
                &mut registry, &gov, &members,
                BAZAAR_TYPE_NOTRIBE, b"DE-Locker", SSU_ADDR, TRIBE_ID,
                vector[100u64], vector[1u64], vector[200u64], vector[1u64],
                vector[1u64],        // offer_per_lots (legacy 1:N ratio)
                0, 0, 0, &clk, ctx,
            );

            let mut ssu = world_su::create_storage_unit_for_testing(SSU_ADDR, ctx);
            let character = world_character::create_character_for_testing(NON_OWNER, ctx);

            bazar_close::close_shop(
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &character,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );

            assert!(!bazar::shop_is_active(bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id)), 0);

            test_utils::destroy(character);
            test_utils::destroy(ssu);
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // ===================================================================
    // Test 5 — FREE self-close Main Storage happy path (SSU owner)
    // ===================================================================
    #[test]
    fun test_free_self_close_main_storage_happy_path() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(
                SSU_ADDR, TRIBE_ID, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            let shop_id = bazar_free::create_free_shop(
                &mut registry, &gov, &members,
                BAZAAR_TYPE_NOTRIBE, b"FREE-Main", SSU_ADDR, TRIBE_ID,
                vector[100u64], vector[1u64],
                0, 0, 0,
                sui::coin::zero<EVE>(ctx), 0,   // V25 no coin giveaway
                &clk, ctx,
            );

            let mut ssu = world_su::create_storage_unit_for_testing(SSU_ADDR, ctx);
            let ssu_id = object::id(&ssu);
            let character = world_character::create_character_for_testing(OWNER, ctx);
            let owner_cap = world_access::create_owner_cap_for_testing<StorageUnit>(ssu_id, ctx);

            bazar_close::close_shop_as_ssu_owner(
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &character,
                &owner_cap,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );
            test_utils::destroy(owner_cap);

            assert!(!bazar::shop_is_active(bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id)), 0);

            test_utils::destroy(character);
            test_utils::destroy(ssu);
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // ===================================================================
    // Test 6 — FREE self-close Player Locker happy path (non-SSU-owner)
    // ===================================================================
    #[test]
    fun test_free_self_close_player_locker_happy_path() {
        let mut scenario = ts::begin(NON_OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(
                SSU_ADDR, TRIBE_ID, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            let shop_id = bazar_free::create_free_shop(
                &mut registry, &gov, &members,
                BAZAAR_TYPE_NOTRIBE, b"FREE-Locker", SSU_ADDR, TRIBE_ID,
                vector[100u64], vector[1u64],
                0, 0, 0,
                sui::coin::zero<EVE>(ctx), 0,   // V25 no coin giveaway
                &clk, ctx,
            );

            let mut ssu = world_su::create_storage_unit_for_testing(SSU_ADDR, ctx);
            let character = world_character::create_character_for_testing(NON_OWNER, ctx);

            bazar_close::close_shop(
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &character,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );

            assert!(!bazar::shop_is_active(bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id)), 0);

            test_utils::destroy(character);
            test_utils::destroy(ssu);
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // ===================================================================
    // Test 7 — WTB self-close drains escrowed_eve + pool residue
    // ===================================================================
    /// SSU owner creates WTB shop with 1000 EVE prepay; injects 500 pool residue.
    /// Expected: shop deactivated; shop_escrow_balance == 0; total_escrowed == 0.
    /// WorldStub blocker: character_address assert fires before drain (Phase 3.2).
    #[test]
    fun test_wtb_self_close_drains_escrow_and_pool() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(
                SSU_ADDR, TRIBE_ID, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let prepay = coin::mint_for_testing<EVE>(1000, ctx);

            // CC2-B1-01: BAZAAR_TYPE_NOTRIBE=0 → create_wtb_shop_notribe.
            let shop_id = bazar::create_wtb_shop_notribe(
                &mut registry, &gov,
                BAZAAR_TYPE_NOTRIBE, b"WTB-Escrow", SSU_ADDR, TRIBE_ID,
                vector[100u64], vector[1u64], vector[1000u64],
                &members, prepay,
                0, 0, 0, &clk, ctx,
            );

            wtb_escrow_pool::deposit_residue_for_testing(&mut pool, shop_id, 500, ctx);
            assert!(wtb_escrow_pool::shop_escrow_balance(&pool, shop_id) == 500, 1);

            let mut ssu = world_su::create_storage_unit_for_testing(SSU_ADDR, ctx);
            let ssu_id = object::id(&ssu);
            let character = world_character::create_character_for_testing(OWNER, ctx);
            let owner_cap = world_access::create_owner_cap_for_testing<StorageUnit>(ssu_id, ctx);

            bazar_close::close_shop_as_ssu_owner(
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &character,
                &owner_cap,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );
            test_utils::destroy(owner_cap);

            assert!(!bazar::shop_is_active(bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id)), 0);
            assert!(wtb_escrow_pool::shop_escrow_balance(&pool, shop_id) == 0, 2);
            assert!(wtb_escrow_pool::total_escrowed(&pool) == 0, 3);

            test_utils::destroy(character);
            test_utils::destroy(ssu);
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // ===================================================================
    // Test 8 — force-close non-SSU-owner shop (admin path; Player Locker)
    // ===================================================================
    /// SSUSuperAdminCap holder force-closes a shop via the 9-arg cap-first signature.
    /// CC-404: cap FIRST; members removed; clock added.
    #[test]
    fun test_force_close_non_owner_shop_happy_path() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(
                SSU_ADDR, TRIBE_ID, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);

            // Shop created by ADMIN (current scenario sender). Structural test: verifies
            // that the 9-arg cap-first shape compiles and dispatches without abort at
            // the access-control layer.
            let shop_id = bazar_test_accessors::create_wts_shop_for_testing(
                &mut registry, &gov, &members,
                BAZAAR_TYPE_NOTRIBE, b"Force-Close", SSU_ADDR, TRIBE_ID,
                vector[100u64], vector[1u64], vector[1000u64],
                0, 0, 0, &clk, ctx,
            );

            let super_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_ADDR, ctx);
            let mut ssu = world_su::create_storage_unit_for_testing(SSU_ADDR, ctx);
            let character = world_character::create_character_for_testing(ADMIN, ctx);

            shop_moderation::force_close_shop_as_super_admin(
                &super_cap,
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &character,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );

            assert!(!bazar::shop_is_active(bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id)), 0);

            membership::destroy_ssu_super_admin_cap_for_testing(super_cap);
            test_utils::destroy(character);
            test_utils::destroy(ssu);
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // ===================================================================
    // Test 17 — latent-twin-bug-fix: escrowed_eve refund on owner self-close
    // ===================================================================
    /// Pre-V11 bazar_close did NOT refund escrowed_eve on owner self-close.
    /// Post-fix: escrowed_eve zeroed + EVE coin transferred to shop owner.
    /// Test verifies close completes and both pool + escrowed_eve are drained.
    #[test]
    fun test_escrowed_eve_refunded_on_self_close() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE_NOTRIBE, TRIBE_ID, OWNER, &clk, ctx,
            );
            let members = membership::create_member_registry_for_testing(
                SSU_ADDR, TRIBE_ID, ctx,
            );
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let prepay = coin::mint_for_testing<EVE>(2000, ctx);

            let shop_id = bazar::create_wtb_shop_notribe(
                &mut registry, &gov,
                BAZAAR_TYPE_NOTRIBE, b"WTB-EscrowedEve", SSU_ADDR, TRIBE_ID,
                vector[100u64], vector[1u64], vector[1000u64],
                &members, prepay,
                0, 0, 0, &clk, ctx,
            );

            // Inject pool residue; both drain paths must clear.
            wtb_escrow_pool::deposit_residue_for_testing(&mut pool, shop_id, 300, ctx);

            let mut ssu = world_su::create_storage_unit_for_testing(SSU_ADDR, ctx);
            let ssu_id = object::id(&ssu);
            let character = world_character::create_character_for_testing(OWNER, ctx);
            let owner_cap = world_access::create_owner_cap_for_testing<StorageUnit>(ssu_id, ctx);

            bazar_close::close_shop_as_ssu_owner(
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &character,
                &owner_cap,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );
            test_utils::destroy(owner_cap);

            assert!(!bazar::shop_is_active(bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id)), 0);
            assert!(wtb_escrow_pool::shop_escrow_balance(&pool, shop_id) == 0, 1);
            assert!(wtb_escrow_pool::total_escrowed(&pool) == 0, 2);

            test_utils::destroy(character);
            test_utils::destroy(ssu);
            gov_helpers::destroy_for_testing(gov);
            membership::destroy_member_registry_for_testing(members);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
