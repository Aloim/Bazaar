// WorldStub | Type-binding stub for world location registry proof-of-death read
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// TODO STUB-05: Local stub for 0x8b8a46ed766fa1358ce7c5c51f6a164b13d627a63e45343f69ed0ba0446c1aa1
// ::world::location types and fns. This stub provides compile-time type binding for the world
// LocationRegistry -- the SOLE world-side proof-of-death read consumed by
// bazaar_core::ssu_depreciation (V41 SSU depreciation prune plan, Documentation/plans/
// implementation/ssu-depreciation-prune-plan.md §1 "two-phase depreciation certificate" and §2.1).
// The published-at in Move.toml pins this to the on-chain world package's testnet address, so
// LocationRegistry/Coordinates references and get_location calls are runtime-compatible with the
// real world package without needing upstream source. This package is NEVER published -- type
// binding only.
//
// Verified against the LIVE V40 world package this session via sui_getNormalizedMoveModule
// ("world", "location") -- the struct/function shapes below are the exact live ABI.
// CR-DEP-10a (binding): re-verify this stub against sui_getNormalizedMoveModule at the
// pre-publish gate -- a future world-side upgrade could silently change this shape.
module world::location {
    use std::string::String;
    use std::option::{Self, Option};
    use sui::object::{ID, UID};
    use sui::table::{Self, Table};
    use sui::tx_context::TxContext;

    public struct Coordinates has copy, drop, store {
        solarsystem: u64,
        x: String,
        y: String,
        z: String,
    }

    public struct LocationRegistry has key {
        id: UID,
        locations: Table<ID, Coordinates>,
    }

    /// Returns Some(coordinates) iff `assembly_id` currently has a live location entry (the
    /// assembly was revealed and remains anchored). Returns None when the assembly was never
    /// revealed, OR was revealed and then unanchored -- `world::storage_unit::unanchor{,_orphan}`
    /// calls `location.remove()` on death (plan §1 proof-of-death fact 5). Real module logic:
    /// `if (table::contains(...)) some(*borrow(...)) else none()`.
    public fun get_location(registry: &LocationRegistry, assembly_id: ID): Option<Coordinates> {
        if (table::contains(&registry.locations, assembly_id)) {
            option::some(*table::borrow(&registry.locations, assembly_id))
        } else {
            option::none()
        }
    }

    // ===== Test-Only Factories =====
    // Drive the revealed / never-revealed / unanchored proof matrix (plan §6 P5 test matrix
    // highlights) without a live world dependency.

    #[test_only]
    public fun create_location_registry_for_testing(ctx: &mut TxContext): LocationRegistry {
        LocationRegistry {
            id: sui::object::new(ctx),
            locations: table::new(ctx),
        }
    }

    /// Insert or overwrite the location entry for `assembly_id`. Build `coords` via
    /// coordinates_for_testing.
    #[test_only]
    public fun add_location_for_testing(
        registry: &mut LocationRegistry,
        assembly_id: ID,
        coords: Coordinates,
    ) {
        if (table::contains(&registry.locations, assembly_id)) {
            *table::borrow_mut(&mut registry.locations, assembly_id) = coords;
        } else {
            table::add(&mut registry.locations, assembly_id, coords);
        };
    }

    /// Simulates `world::storage_unit::unanchor{,_orphan}`'s `location.remove()` -- the ONLY
    /// way a live-revealed entry ever becomes absent again (plan §1 fact 5). Silent no-op if
    /// the entry is already absent (idempotent for test convenience).
    #[test_only]
    public fun remove_location_for_testing(registry: &mut LocationRegistry, assembly_id: ID) {
        if (table::contains(&registry.locations, assembly_id)) {
            table::remove(&mut registry.locations, assembly_id);
        };
    }

    #[test_only]
    public fun coordinates_for_testing(solarsystem: u64, x: String, y: String, z: String): Coordinates {
        Coordinates { solarsystem, x, y, z }
    }

    /// LocationRegistry has `key` only -- consuming tests cannot drop, share, or
    /// destroy it cross-package. Defining-module disposal for unit tests.
    #[test_only]
    public fun destroy_location_registry_for_testing(registry: LocationRegistry) {
        let LocationRegistry { id, locations } = registry;
        sui::table::drop(locations);
        sui::object::delete(id);
    }

    /// Defining-module share for test_scenario flows (take_shared/return_shared).
    #[test_only]
    public fun share_location_registry_for_testing(registry: LocationRegistry) {
        sui::transfer::share_object(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
