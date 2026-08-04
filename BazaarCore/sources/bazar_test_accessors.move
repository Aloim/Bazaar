// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Test-only accessors for bazar_core::bazar.
///
/// Migrated from bazar.move per Temporaryfixplan Phase 3.2 (500-LOC budget recovery).
/// All functions are #[test_only] — stripped at publish time, zero bytecode impact.
///
/// Production source-of-truth for BazarRegistry + Shop remains bazar.move.
/// This module only holds wrappers that bridge visibility between bazar.move's
/// private fields and the cross-module test files in BazaarCore/tests/.
#[test_only]
module bazaar_core::bazar_test_accessors {
    use sui::clock::Clock;
    use sui::coin::Coin;
    use sui::object;
    use sui::tx_context::{Self, TxContext};
    use EVE::EVE::EVE;
    use bazaar_core::bazar::{Self, BazarRegistry, Shop};
    use bazaar_core::ssu_governance::SSUGovernance;
    use bazaar_core::membership::MemberRegistry;

    // === Migrated from bazar.move:467-491 ===

    /// Test-only factory: construct a fresh BazarRegistry for test scenarios.
    /// Delegates to bazar::new_registry_for_testing_inner to bridge the private struct constructor.
    #[test_only]
    public fun create_registry_for_testing(ctx: &mut TxContext): BazarRegistry {
        bazar::new_registry_for_testing_inner(ctx)
    }

    /// Test-only accessor: mutable borrow of a Shop from BazarRegistry.
    /// Delegates to bazar::borrow_shop_mut (public function in bazar.move).
    #[test_only]
    public fun borrow_shop_mut_for_testing(registry: &mut BazarRegistry, shop_id: ID): &mut Shop {
        bazar::borrow_shop_mut(registry, shop_id)
    }

    /// Test-only accessor: immutable borrow of a Shop from BazarRegistry.
    /// V38 split: bazar::borrow_shop is public(package) and unreachable from the
    /// relocated bazaar_shop_ops tests, so bridge it here (test-only, zero bytecode).
    #[test_only]
    public fun borrow_shop_for_testing(registry: &BazarRegistry, shop_id: ID): &Shop {
        bazar::borrow_shop(registry, shop_id)
    }

    /// Test-only factory: close a shop for testing, setting is_active=false.
    /// Simplified bridge: uses public API of bazar.move (cannot access private registry fields).
    /// Asserts: caller must be shop owner (E_NOT_SHOP_OWNER=3); shop must be active (E_SHOP_NOT_ACTIVE=5).
    /// WARNING: bypasses shops_by_ssu + shops table cleanup (registry index invariants not maintained).
    /// For tests that need is_active==false; use bazar_close::close_shop for full invariant-safe close.
    #[test_only]
    public fun close_shop_for_testing(registry: &mut BazarRegistry, shop_id: ID, clock: &Clock, ctx: &mut TxContext) {
        let shop_ref = bazar::borrow_shop_mut(registry, shop_id);
        assert!(bazar::shop_owner(shop_ref) == tx_context::sender(ctx), 3); // E_NOT_SHOP_OWNER
        assert!(bazar::shop_is_active(shop_ref), 5); // E_SHOP_NOT_ACTIVE
        bazar::set_is_active_unsafe(shop_ref, false);
        let _ = clock;
    }

    // === Diff 6a — escrowed_eve_value test wrapper ===

    /// Test-only accessor: read the escrowed EVE balance for a shop.
    /// Delegates to bazar::escrowed_eve_value (public(package) in bazar.move).
    #[test_only]
    public fun escrowed_eve_value_for_testing(shop: &Shop): u64 {
        bazar::escrowed_eve_value(shop)
    }

    // === GAS-01 locking test bridges ===

    /// Test-only bridge: decrement a listing and return the post-decrement quantity.
    /// Delegates to bazar::decrement_listing (public(package) in bazar.move — same package).
    /// Used by gas01_drain_shortcircuit_tests to simulate partial and full buys.
    #[test_only]
    public fun decrement_listing_for_testing(shop: &mut Shop, idx: u64, qty: u64): u64 {
        bazar::decrement_listing(shop, idx, qty)
    }

    /// Test-only bridge: withdraw EVE from shop.escrowed_eve.
    /// Delegates to bazar::withdraw_escrowed_eve (public(package) — same package).
    /// Used to simulate escrowed_eve drain to 0 in gas01 tests without running a
    /// full trade entry (which would require WorldStub setup).
    #[test_only]
    public fun withdraw_escrowed_eve_for_testing(
        shop: &mut Shop, amount: u64, ctx: &mut TxContext,
    ): Coin<EVE> {
        bazar::withdraw_escrowed_eve(shop, amount, ctx)
    }

    // === Diff 6b — set_shop_inactive (low-level bypass) ===

    /// Test-only accessor: mark a shop inactive for testing purposes.
    /// GAS-08: calls set_shop_position_inactive_for_testing FIRST (flips the inline
    /// ShopPosition.active flag in shops_by_ssu) then set_is_active_unsafe (flips
    /// Shop.is_active). Both must be kept in sync so assert_shop_position_clear
    /// (checks inline flag) and shop_is_active (checks DOF flag) agree.
    /// WARNING: bypasses shops table sync, deactivate owner-count decrement, owner check.
    #[test_only]
    public fun set_shop_inactive_for_testing(registry: &mut BazarRegistry, shop_id: ID) {
        bazar::set_shop_position_inactive_for_testing(registry, shop_id);
        let shop_mut = bazar::borrow_shop_mut(registry, shop_id);
        bazar::set_is_active_unsafe(shop_mut, false);
    }

    // === V38 split — create-shop bridges for the relocated bazaar_shop_ops tests ===
    // bazar::create_wts_shop / create_de_shop are public(package) and unreachable from
    // the cross-package tests; bridge them here (test-only, zero bytecode at publish).

    #[test_only]
    public fun create_wts_shop_for_testing(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64, item_type_ids: vector<u64>,
        quantities: vector<u64>, prices_eve: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        bazar::create_wts_shop(
            registry, gov, members, bazaar_type, title, ssu_id, tribe_id,
            item_type_ids, quantities, prices_eve, expiry_ms, position_x, position_y, clock, ctx,
        )
    }

    #[test_only]
    public fun create_de_shop_for_testing(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        members: &MemberRegistry,
        bazaar_type: u8, title: vector<u8>,
        ssu_id: address, tribe_id: u64,
        offer_item_type_ids: vector<u64>, offer_quantities: vector<u64>,
        request_item_type_ids: vector<u64>, request_quantities: vector<u64>,
        offer_per_lots: vector<u64>,
        expiry_ms: u64,
        position_x: u64, position_y: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): ID {
        bazar::create_de_shop(
            registry, gov, members, bazaar_type, title, ssu_id, tribe_id,
            offer_item_type_ids, offer_quantities, request_item_type_ids, request_quantities,
            offer_per_lots,
            expiry_ms, position_x, position_y, clock, ctx,
        )
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
