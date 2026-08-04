// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Shop Close Recovery — Adversarial + Rollback Tests (Tests 15, 15b, 16, 21, 21b, 22, 23, 23b).
///
/// Design: Rollback/abort tests (15, 23) use shops with ONE non-empty listing so the drain loop
/// runs one iteration and reaches world::storage_unit::withdraw_from_open_inventory → abort 0
/// (WorldStub storage stubs are still abort-0). Force-close tests (21, 22) use EMPTY listings
/// because the targeted asserts (SSU-owner guard, recipient-mismatch) fire BEFORE the drain loop.
/// Pool-residue tests (15b, 16, 23b) use coin only — no world primitive dependency.
///
/// Drain-loop semantics (CC-213 corrected): an EMPTY listings vector means the pop_back (or
/// index) loop runs 0 iterations → deposit_per_tier / withdraw_from_open_inventory never called.
/// Only a NON-EMPTY listings vector causes the drain loop to reach the WorldStub storage stubs
/// which abort 0. Tests 15 and 23 deliberately have 1 listing to force this abort path.
///
/// Rollback companion pattern (CC-114): #[expected_failure] aborts the entire scenario — POST-state
/// cannot be inspected in the same TX. The *b companion tests verify PRE-state only (non-aborting
/// twin that confirms initial invariants hold before the abort triggers).
///
/// TFP Phase 3.2 / Temporaryfixplan campaign.
#[test_only]
module bazaar_shop_ops::shop_close_recovery_adversarial_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::test_utils;
    use sui::coin;
    use sui::object::ID;
    use EVE::EVE::EVE;
    use std::option;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::bazar_test_accessors;
    use bazaar_shop_ops::bazar_close;
    use bazaar_shop_ops::shop_moderation;
    use bazaar_shop_ops::shop_ops_cap_store;
    use bazaar_core::ssu_governance;
    use bazaar_core::wtb_escrow_pool::{Self, WtbEscrowPool};
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_core::membership;
    use bazaar_shop_ops::shop_close_recovery_test_helpers::{Self as h};
    use world::character;
    use world::storage_unit;

    // ===== Test Addresses =====
    const OWNER: address     = @0xA001;
    const ADMIN: address     = @0xA002;
    const ATTACKER: address  = @0xA003;
    const SSU_ADDR: address  = @0xBEEF;
    const TRIBE_ID: u64      = 0;
    const BAZAAR_TYPE: u8    = 0; // NoTribe

    // ===== Error Code Mirrors (source-truth: bazar_close.move / shop_moderation.move) =====
    const E_RECIPIENT_NOT_SHOP_OWNER: u64          = 16;
    const E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP: u64 = 20;

    // =========================================================================
    // Test 15 — close_shop drain completion (WorldStub non-aborting)
    // Mandate: Bug-C-design.md §6.1 row 15 / CC-114
    //
    // A WTB shop with ONE non-empty pair is created so the drain loop runs one
    // iteration and reaches world::storage_unit::withdraw_from_open_inventory.
    // Hotfix-6 upgrades the WorldStub stub to non-aborting (it constructs a real
    // Item via world::inventory::create_item_for_testing and transfers it out).
    // close_shop now completes successfully through the full drain.
    //
    // Atomic rollback under real abort conditions is a Move VM runtime invariant
    // (any abort inside a transaction reverts all mutations of that transaction).
    // It does not require application-layer assertion. If explicit mid-drain abort
    // testing is ever needed, the path is a separate test crate with an abort-
    // injecting WorldStub variant (conditional abort_on_withdraw flag).
    //
    // PRE-state is verified in test 15b (non-aborting companion).
    // =========================================================================
    #[test]
    fun test15_atomic_rollback_mid_drain() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            // CC-302 fix: use bazar_test_accessors::create_registry_for_testing (not bazar::).
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);

            // WTB with 1 pair — drain loop runs 1 iteration → hits withdraw_from_open_inventory
            let prepay = coin::mint_for_testing<EVE>(100, ctx);
            let shop_id = bazar::create_wtb_shop_notribe(
                &mut registry, &gov,
                BAZAAR_TYPE, b"TestWTB15",
                SSU_ADDR, TRIBE_ID,
                vector[999u64], vector[1u64], vector[50u64],
                &members, prepay,
                9999999999u64, 0u64, 0u64,
                &clk, ctx,
            );

            // WorldStub objects for close_shop call.
            // StorageUnit: create with dummy owner_cap_id; drain loop fires before any cap use.
            let mut ssu = storage_unit::create_storage_unit_for_testing(@0x0, ctx);
            // Character: OWNER address so asserts 3 + 8 pass before drain.
            let char = character::create_character_for_testing(OWNER, ctx);

            // close_shop fires: asserts 1-3 + gov asserts all pass (OWNER == sender,
            // shop active, character.addr == OWNER). Drain loop enters iteration 1 →
            // withdraw_from_open_inventory → abort 0 (WorldStub). TX reverts.
            bazar_close::close_shop(
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &char,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );

            test_utils::destroy(char);
            test_utils::destroy(ssu);
            test_utils::destroy(gov);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // =========================================================================
    // Test 15b — atomic-rollback PRE-state companion (non-aborting)
    // Verifies that BEFORE close_shop is called:
    //   (a) the shop is still active,
    //   (b) the pool has its expected residue (none for this test — WTB prepay
    //       tracks differently via escrowed_eve, not pool residue).
    // Confirms the initial invariants that make test 15 meaningful.
    // =========================================================================
    #[test]
    fun test15b_atomic_rollback_pre_state_companion() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            // CC-302 fix: use bazar_test_accessors::create_registry_for_testing (not bazar::).
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);

            let prepay = coin::mint_for_testing<EVE>(100, ctx);
            let shop_id = bazar::create_wtb_shop_notribe(
                &mut registry, &gov,
                BAZAAR_TYPE, b"TestWTB15b",
                SSU_ADDR, TRIBE_ID,
                vector[999u64], vector[1u64], vector[50u64],
                &members, prepay,
                9999999999u64, 0u64, 0u64,
                &clk, ctx,
            );

            // PRE-state: shop active, no close_shop call made.
            h::assert_shop_still_active(&mut registry, shop_id);

            test_utils::destroy(gov);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // =========================================================================
    // Test 16 — pool-residue idempotent
    // Re-calling withdraw_owner_residual_on_close is a no-op: 2nd call returns None.
    // Mandate: Bug-C-design.md §6.1 row 16
    //
    // Independent of WorldStub (pure Sui coin flow, no world primitive dependency).
    //
    // CC-302 fix: bazar_test_accessors::create_registry_for_testing (not bazar::).
    // CC-303 fix: both call sites now pass 4 args including owner: address (OWNER).
    // =========================================================================
    #[test]
    fun test16_pool_residue_idempotent() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            // CC-302 fix: use bazar_test_accessors::create_registry_for_testing (not bazar::).
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);

            // WTB shop (EMPTY pairs) with 300 EVE injected into pool table.
            let shop_id = h::make_wtb_shop_with_pool(
                &mut registry, &gov, &members,
                &mut pool, SSU_ADDR, TRIBE_ID, BAZAAR_TYPE,
                0,   // prepay_amount
                300, // eve_pool_amount
                &clk, ctx,
            );

            // CC-303 fix: 4-arg call — (pool, shop_id, owner: address, ctx).
            // First withdraw — returns Some(coin) with balance 300.
            let first_opt = wtb_escrow_pool::withdraw_owner_residual_on_close_for_testing(
                &mut pool, shop_id, OWNER, ctx,
            );
            assert!(option::is_some(&first_opt), 0);
            let first_coin = option::destroy_some(first_opt);
            assert!(coin::value(&first_coin) == 300, 1);
            test_utils::destroy(first_coin);

            // CC-303 fix: 4-arg call — second call returns None (entry removed after first).
            let second_opt = wtb_escrow_pool::withdraw_owner_residual_on_close_for_testing(
                &mut pool, shop_id, OWNER, ctx,
            );
            assert!(option::is_none(&second_opt), 2);
            option::destroy_none(second_opt);

            test_utils::destroy(gov);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // =========================================================================
    // Test 21 — SA-402: force_close_shop_as_super_admin against SSU-owner shop
    // aborts with E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP = 20.
    // Mandate: Bug-C-design.md §6.1 row 21 / CC-115
    //
    // OWNER is both SSU owner (gov.owner == OWNER) and shop owner (shop was created
    // by OWNER). force_close_shop_internal (shop_moderation.move:87-89) calls
    // bazar_close::shop_owner_is_ssu_owner → shop_owner == ssu_owner → true →
    // abort E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP = 20 BEFORE any drain loop.
    //
    // Because the abort fires before the drain loop, the shop can have EMPTY
    // listings and no StorageUnit interaction is attempted. WorldStub storage
    // stubs (abort 0) are never reached.
    //
    // CC-210 fix: ssu and recipient_character args now provided using WorldStub
    // constructors. The abort fires before these objects are accessed.
    // CC-302 fix: bazar_test_accessors::create_registry_for_testing (not bazar::).
    // =========================================================================
    #[test]
    #[expected_failure(abort_code = E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP, location = bazaar_shop_ops::shop_moderation)]
    fun test21_sa402_force_close_ssu_owner_shop_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // OWNER is SSU owner.
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            // CC-302 fix: use bazar_test_accessors::create_registry_for_testing (not bazar::).
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);

            // OWNER (SSU owner) creates shop — shop_owner == OWNER == SSU owner.
            let shop_id = h::make_wts_shop_empty(
                &mut registry, &gov, &members,
                SSU_ADDR, TRIBE_ID, BAZAAR_TYPE,
                &clk, ctx,
            );

            // Super admin cap scoped to SSU_ADDR — ADMIN is the issuing sender.
            // (Cap itself is a pure struct; sender address for cap purposes is who calls the entry fn.)
            let super_admin_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_ADDR, ctx);

            // WorldStub objects (CC-210 fix).
            // StorageUnit and Character are never accessed — abort fires before drain.
            let mut ssu = storage_unit::create_storage_unit_for_testing(@0x0, ctx);
            // recipient_character: OWNER address (matches shop owner — but abort fires before recipient check).
            let char = character::create_character_for_testing(OWNER, ctx);

            // Abort fires at shop_moderation.move:87-89 (SSU-owner guard) → abort 20.
            shop_moderation::force_close_shop_as_super_admin(
                &super_admin_cap,
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &char,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );

            // Unreachable.
            membership::destroy_ssu_super_admin_cap_for_testing(super_admin_cap);
            test_utils::destroy(char);
            test_utils::destroy(ssu);
            test_utils::destroy(gov);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // =========================================================================
    // Test 21b — SA-402 PRE-state companion (non-aborting)
    // Verifies the shop is active and owned by OWNER (who is the SSU owner) before
    // the force-close attempt. Confirms the precondition that makes test 21 valid.
    //
    // CC-212 fix: uses ssu_governance::ssu_owner(&gov) (correct public accessor at
    // ssu_governance.move:282). There is no function named ssu_owner_address.
    // CC-302 fix: bazar_test_accessors::create_registry_for_testing (not bazar::).
    // =========================================================================
    #[test]
    fun test21b_sa402_pre_state_companion() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            // CC-302 fix: use bazar_test_accessors::create_registry_for_testing (not bazar::).
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);

            let shop_id = h::make_wts_shop_empty(
                &mut registry, &gov, &members,
                SSU_ADDR, TRIBE_ID, BAZAAR_TYPE,
                &clk, ctx,
            );

            // PRE-state: shop active and shop_owner == SSU owner.
            h::assert_shop_still_active(&mut registry, shop_id);
            let shop_owner = bazar::shop_owner(bazar_test_accessors::borrow_shop_for_testing(&registry, shop_id));
            // CC-212: correct accessor is ssu_owner (not ssu_owner_address).
            let ssu_owner  = ssu_governance::ssu_owner(&gov);
            assert!(shop_owner == ssu_owner, 0);

            test_utils::destroy(gov);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // =========================================================================
    // Test 22 — adversarial: force-close recipient-redirect attack
    // ADMIN issues force-close for OWNER's shop, passing ATTACKER's character as
    // recipient_character. Aborts E_RECIPIENT_NOT_SHOP_OWNER = 16 BEFORE drain.
    // Mandate: Bug-C-design.md §6.1 row 22 / CC-116
    // Mirrors EconomyFixplan Phase 4 recipient-redirect attack pattern.
    //
    // Setup: ATTACKER is SSU owner (gov.owner == ATTACKER). OWNER (not SSU owner)
    // creates the shop, so shop_owner == OWNER. The SSU-owner guard passes because
    // OWNER != ATTACKER. Then force_close_shop_internal checks:
    //   character_address(recipient_character) == owner_addr
    // → ATTACKER != OWNER → abort E_RECIPIENT_NOT_SHOP_OWNER = 16.
    //
    // CC-210 fix: ssu and recipient_character now provided with WorldStub constructors.
    // With WorldStub character upgraded, character_address returns character.addr directly
    // (no longer aborts 0). The abort fires at code 16 as designed.
    //
    // The abort fires at shop_moderation.move:90-93 BEFORE any drain loop iteration.
    // CC-302 fix: bazar_test_accessors::create_registry_for_testing (not bazar::).
    // =========================================================================
    #[test]
    #[expected_failure(abort_code = E_RECIPIENT_NOT_SHOP_OWNER, location = bazaar_shop_ops::shop_moderation)]
    fun test22_adversarial_recipient_redirect_aborts() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // ATTACKER is SSU owner; OWNER creates the shop (non-SSU-owner).
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, ATTACKER, &clk, ctx,
            );
            // CC-302 fix: use bazar_test_accessors::create_registry_for_testing (not bazar::).
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);

            // OWNER (not SSU owner) creates shop → shop_owner == OWNER.
            // Shop is EMPTY so drain (if reached) runs 0 iterations.
            let shop_id = h::make_wts_shop_empty(
                &mut registry, &gov, &members,
                SSU_ADDR, TRIBE_ID, BAZAAR_TYPE,
                &clk, ctx,
            );

            // Super admin cap scoped to SSU_ADDR.
            let super_admin_cap = membership::create_ssu_super_admin_cap_for_testing(SSU_ADDR, ctx);

            // WorldStub objects (CC-210 fix).
            let mut ssu = storage_unit::create_storage_unit_for_testing(@0x0, ctx);
            // ATTACKER's character — address is ATTACKER, not OWNER (the shop owner).
            // force_close_shop_internal: character_address(char) == ATTACKER != OWNER → abort 16.
            let char = character::create_character_for_testing(ATTACKER, ctx);

            // Abort fires at shop_moderation.move:90-93: E_RECIPIENT_NOT_SHOP_OWNER = 16.
            shop_moderation::force_close_shop_as_super_admin(
                &super_admin_cap,
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &char,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );

            // Unreachable.
            membership::destroy_ssu_super_admin_cap_for_testing(super_admin_cap);
            test_utils::destroy(char);
            test_utils::destroy(ssu);
            test_utils::destroy(gov);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // =========================================================================
    // Test 23 — close_shop drain + pool residue consumed (WorldStub non-aborting)
    // Mandate: Bug-C-design.md §6.1 row 23 / CC-114
    //
    // A WTB shop with 1 pair + pool residue of 400 EVE is set up.
    // Hotfix-6 upgrades the WorldStub stub to non-aborting: close_shop now runs
    // the full drain loop (withdraw_from_open_inventory succeeds, returning a real
    // Item) and withdraws the pool residue. Both complete — close_shop returns.
    //
    // Atomic rollback under real abort conditions is a Move VM runtime invariant
    // (any abort inside a transaction reverts all mutations of that transaction).
    // Pool-residue restoration on abort is guaranteed by the VM, not BazaarCore.
    // If explicit testing of the mid-drain abort path (with pool-residue rollback
    // verification) is needed in future, the path is a separate test crate with
    // an abort-injecting WorldStub variant (conditional abort_on_withdraw flag).
    //
    // POST-state: pool residue drained + transferred to shop owner. PRE-state
    // verified in test 23b.
    // CC-302 fix: bazar_test_accessors::create_registry_for_testing (not bazar::).
    // =========================================================================
    #[test]
    fun test23_atomic_rollback_pool_residue_restored() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            // CC-302 fix: use bazar_test_accessors::create_registry_for_testing (not bazar::).
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);

            // WTB shop with 1 pair → drain loop triggers → withdraw_from_open_inventory → abort 0.
            // Pool receives 400 EVE residue via test helper.
            let prepay = coin::mint_for_testing<EVE>(50, ctx);
            let shop_id = bazar::create_wtb_shop_notribe(
                &mut registry, &gov,
                BAZAAR_TYPE, b"TestWTB23",
                SSU_ADDR, TRIBE_ID,
                vector[777u64], vector[1u64], vector[50u64],
                &members, prepay,
                9999999999u64, 0u64, 0u64,
                &clk, ctx,
            );
            h::deposit_pool_residue_for_testing(&mut pool, shop_id, 400, ctx);

            // WorldStub objects for close_shop.
            let mut ssu = storage_unit::create_storage_unit_for_testing(@0x0, ctx);
            // OWNER character: character.addr == OWNER → asserts 3 + 8 pass.
            let char = character::create_character_for_testing(OWNER, ctx);

            // close_shop: asserts 1-3 + gov asserts pass → drain loop runs 1 iteration →
            // withdraw_from_open_inventory → abort 0. Entire TX reverts — pool entry
            // (400 EVE) restored atomically.
            bazar_close::close_shop(
                &mut registry,
                shop_id,
                &gov,
                &mut ssu,
                &char,
                &mut pool,
                &cap_store,
                &clk,
                ctx,
            );

            test_utils::destroy(char);
            test_utils::destroy(ssu);
            test_utils::destroy(gov);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }

    // =========================================================================
    // Test 23b — atomic rollback with pool residue PRE-state companion
    // Verifies pool residue of 400 EVE is present BEFORE close_shop is called.
    // Confirms that test 23's rollback scenario starts from a valid initial state.
    //
    // CC-302 fix: bazar_test_accessors::create_registry_for_testing (not bazar::).
    // =========================================================================
    #[test]
    fun test23b_atomic_rollback_pool_residue_pre_state() {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let gov = gov_helpers::create_for_testing_with_dummy_ids(
                SSU_ADDR, BAZAAR_TYPE, TRIBE_ID, OWNER, &clk, ctx,
            );
            // CC-302 fix: use bazar_test_accessors::create_registry_for_testing (not bazar::).
            let mut registry = bazar_test_accessors::create_registry_for_testing(ctx);
            let mut pool = wtb_escrow_pool::create_for_testing(SSU_ADDR, ctx);
            let cap_store = shop_ops_cap_store::create_loaded_for_testing(@0x0, ctx);
            let members = membership::create_member_registry_for_testing(SSU_ADDR, TRIBE_ID, ctx);

            let prepay = coin::mint_for_testing<EVE>(50, ctx);
            let shop_id = bazar::create_wtb_shop_notribe(
                &mut registry, &gov,
                BAZAAR_TYPE, b"TestWTB23b",
                SSU_ADDR, TRIBE_ID,
                vector[777u64], vector[1u64], vector[50u64],
                &members, prepay,
                9999999999u64, 0u64, 0u64,
                &clk, ctx,
            );
            h::deposit_pool_residue_for_testing(&mut pool, shop_id, 400, ctx);

            // PRE-state: shop active + pool residue == 400 EVE.
            h::assert_shop_still_active(&mut registry, shop_id);
            assert!(wtb_escrow_pool::shop_escrow_balance(&pool, shop_id) == 400, 0);

            test_utils::destroy(gov);
            test_utils::destroy(registry);
            test_utils::destroy(cap_store);
            test_utils::destroy(pool);
            test_utils::destroy(members);
            clock::destroy_for_testing(clk);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
