// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// TODO STUB-02: Local stub for 0x28b49755...::world::storage_unit types and fns.
// This stub provides compile-time type binding for BazaarCore Phase 4 (WTB direct deposit).
// The published-at in Move.toml pins this to the on-chain world package's testnet address,
// so all StorageUnit references + world::storage_unit::deposit_to_owned calls will be
// runtime-compatible with the real world package without needing upstream source.
// This package is NEVER published — type binding only.
module world::storage_unit {
    use sui::object::UID;
    use world::character::Character;
    use world::inventory::Item;

    public struct StorageUnit has key {
        id: UID,
        // Test-only convenience field: the address of the owner_cap that anchors the
        // Main Storage inventory DF key in the real world::storage_unit::StorageUnit.
        // The real module derives this as object::id(owner_cap); the stub stores it
        // directly so test constructors can create a StorageUnit with a known owner identity.
        // Production runtime resolves this from the real on-chain world module.
        owner_cap_id: address,
    }

    /// Returns the owner_cap_id anchor for this StorageUnit.
    /// In production, this is the ID of the OwnerCap<StorageUnit> that keys Main Storage.
    /// In this stub, it returns the value set by create_storage_unit_for_testing.
    public fun storage_unit_owner_cap_id(su: &StorageUnit): address {
        su.owner_cap_id
    }

    /// Test-only constructor. Creates a StorageUnit stub with a known owner_cap_id.
    /// Mirrors world::character::create_character_for_testing pattern (WorldStub character.move).
    /// The three storage operation stubs (deposit_to_owned, withdraw_from_open_inventory,
    /// deposit_by_owner) are non-aborting no-ops. Tests may use 1-item listing vectors;
    /// the drain loop executes once and completes cleanly without side effects.
    #[test_only]
    public fun create_storage_unit_for_testing(
        owner_cap_id: address,
        ctx: &mut sui::tx_context::TxContext,
    ): StorageUnit {
        StorageUnit {
            id: sui::object::new(ctx),
            owner_cap_id,
        }
    }

    public fun deposit_to_owned<Auth: drop>(
        _storage_unit: &mut StorageUnit,
        _character: &Character,
        item: Item,
        _auth: Auth,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        // Stub: silently drop the Item by transferring it to a dead address.
        // No-op in test context; real world::storage_unit deposits into Player Locker DF.
        sui::transfer::public_transfer(item, sui::tx_context::sender(ctx));
    }

    public fun withdraw_from_open_inventory<Auth: drop>(
        _storage_unit: &mut StorageUnit,
        _character: &Character,
        _auth: Auth,
        _type_id: u64,
        _quantity: u32,
        ctx: &mut sui::tx_context::TxContext,
    ): Item {
        // Stub: return a fresh minimal Item. Real function withdraws from Open Storage DF.
        world::inventory::create_item_for_testing(ctx)
    }

    public fun deposit_by_owner<T: key>(
        _storage_unit: &mut StorageUnit,
        item: Item,
        _character: &Character,
        _owner_cap: &world::access::OwnerCap<T>,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        // Stub: silently drop the Item by transferring it to a dead address.
        // No-op in test context; real function deposits into Main Storage DF.
        sui::transfer::public_transfer(item, sui::tx_context::sender(ctx));
    }

    /// Open Storage deposit (Auth-gated). Real fn ensures open inventory, then
    /// inserts the item into the open-storage DF. Stub: silently drop.
    public fun deposit_to_open_inventory<Auth: drop>(
        _storage_unit: &mut StorageUnit,
        _character: &Character,
        item: Item,
        _auth: Auth,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        sui::transfer::public_transfer(item, sui::tx_context::sender(ctx));
    }

    /// Owner-keyed withdraw. Real fn enforces `character.character_address() == ctx.sender()`
    /// and reads from the DF keyed by `object::id(owner_cap)` (Main Storage when T=StorageUnit,
    /// Player Locker when T=Character). Stub: returns a fresh test Item.
    public fun withdraw_by_owner<T: key>(
        _storage_unit: &mut StorageUnit,
        _character: &Character,
        _owner_cap: &world::access::OwnerCap<T>,
        _type_id: u64,
        _quantity: u32,
        ctx: &mut sui::tx_context::TxContext,
    ): Item {
        world::inventory::create_item_for_testing(ctx)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
