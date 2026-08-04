// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// TODO STUB-03: Local stub for 0x28b49755...::world::access types and fns.
// This stub provides compile-time type binding for BazaarCore Phase 3.2 (Bug C close path).
// The published-at in Move.toml pins this to the on-chain world package's testnet address,
// so all `world::access::OwnerCap<T>` references and `world::access::is_authorized(...)` calls
// will be runtime-compatible with the real world package without needing upstream source.
// This package is NEVER published — type binding only.
//
// Verified against world-contracts source-of-truth:
//   Documentation/Devnotes/world-contracts/contracts/world/sources/access/access_control.move:14, 50, 151
//
// V11 cascade fix (TFP-P3.4): OwnerCap has `key` ONLY (no `store`) to match the real on-chain
// shape. Earlier `key, store` declaration caused VMVerificationOrDeserializationError at
// publish time because `Option<OwnerCap<T>>` requires `T: store`, which the real type lacks.
module world::access {
    use sui::object::{ID, UID};
    use sui::tx_context::TxContext;

    public struct OwnerCap<phantom T> has key {
        id: UID,
        authorized_object_id: ID,
    }

    public fun is_authorized<T: key>(owner_cap: &OwnerCap<T>, object_id: ID): bool {
        owner_cap.authorized_object_id == object_id
    }

    #[test_only]
    public fun create_owner_cap_for_testing<T>(authorized_object_id: ID, ctx: &mut TxContext): OwnerCap<T> {
        OwnerCap<T> {
            id: sui::object::new(ctx),
            authorized_object_id,
        }
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
