// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// TODO STUB-04: Local stub for 0x28b49755...::world::inventory types and fns.
// This stub provides compile-time type binding for Item references in Phase 4 WTB logic.
// The published-at in Move.toml pins this to the on-chain world package's testnet address.
// This package is NEVER published — type binding only.
module world::inventory {
    use sui::object::UID;
    use sui::tx_context::TxContext;

    public struct Item has key, store {
        id: UID,
    }

    public fun quantity(_item: &Item): u32 {
        abort 0
    }

    public fun type_id(_item: &Item): u64 {
        abort 0
    }

    /// Stub constructor: creates a minimal Item for drain-loop testing.
    /// WorldStub is never published; this is safe as a non-test-only public fn.
    public fun create_item_for_testing(ctx: &mut TxContext): Item {
        Item { id: sui::object::new(ctx) }
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
