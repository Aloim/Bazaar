// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// TODO STUB-03: Local stub for 0x28b49755...::world::character types and fns.
// This stub provides compile-time type binding for Character references in Phase 4.
// The published-at in Move.toml pins this to the on-chain world package's testnet address.
// This package is NEVER published — type binding only.
module world::character {
    use sui::object::UID;

    public struct Character has key {
        id: UID,
        // Test-only convenience field: the address this character maps to.
        // Production `world::character::Character` stores this in upstream
        // world-contract storage; the real `character_address` accessor reads it there.
        addr: address,
    }

    public fun character_address(character: &Character): address {
        character.addr
    }

    #[test_only]
    public fun create_character_for_testing(
        addr: address,
        ctx: &mut sui::tx_context::TxContext,
    ): Character {
        Character {
            id: sui::object::new(ctx),
            addr,
        }
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
