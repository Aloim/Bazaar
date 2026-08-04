// DappHub/sources/anchor_registry.move
// On-chain SHA-256 hash anchor index for off-chain UpdateCeremonyPlan backup snapshots (Phase A).
// Admin invokes post_anchor at ceremony time with the SHA-256 of the snapshot JSON +
// IPFS CID + Sui checkpoint pin. Anchored rows are immutable; any user can verify a downloaded
// snapshot against the on-chain hash. Storage rebate flows back if a row is ever removed
// (not exposed in v1 — anchors retained forever as audit trail).

module dapp_hub::anchor_registry {
    use std::string::String;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::table::{Self, Table};
    use dapp_hub::dapp_governance::DAppOwnerCap;

    // Error codes
    const E_INVALID_HASH_LENGTH: u64 = 1;
    const E_INVALID_CHECKPOINT:  u64 = 2;

    // SHA-256 hash width.
    const HASH_BYTES: u64 = 32;

    /// Shared object. Created once post-v1-upgrade via announcements::init_v1_ceremony_objects.
    public struct AnchorRegistry has key {
        id: UID,
        next_id: u64,
        anchors: Table<u64, Anchor>,
    }

    /// Immutable snapshot fingerprint.
    public struct Anchor has store, drop, copy {
        id: u64,
        checkpoint: u64,
        hash: vector<u8>,            // SHA-256, exactly 32 bytes
        schema_version: String,
        ipfs_cid: String,
        posted_at_ms: u64,
        note: String,
        posted_by: address,
    }

    public struct AnchorPosted has copy, drop {
        id: u64,
        checkpoint: u64,
        hash: vector<u8>,
        schema_version: String,
        ipfs_cid: String,
        note: String,
        posted_by: address,
        timestamp_ms: u64,
    }

    /// Constructor — called by announcements::init_v1_ceremony_objects in the same PTB
    /// that creates DAppAnnouncements. NOT an entry; not directly callable.
    /// next_id starts at 1 so anchor_count == table::length is consistent.
    public(package) fun create_and_share(ctx: &mut TxContext) {
        let registry = AnchorRegistry {
            id: object::new(ctx),
            next_id: 1,
            anchors: table::new<u64, Anchor>(ctx),
        };
        transfer::share_object(registry);
    }

    /// Append a new anchor row. DAppOwnerCap-gated.
    public entry fun post_anchor(
        _cap: &DAppOwnerCap,
        registry: &mut AnchorRegistry,
        checkpoint: u64,
        hash: vector<u8>,
        schema_version: String,
        ipfs_cid: String,
        note: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(checkpoint > 0, E_INVALID_CHECKPOINT);
        assert!(vector::length(&hash) == HASH_BYTES, E_INVALID_HASH_LENGTH);

        let id = registry.next_id;
        let ts = clock::timestamp_ms(clock);
        let sender = tx_context::sender(ctx);

        let row = Anchor {
            id,
            checkpoint,
            hash,
            schema_version,
            ipfs_cid,
            posted_at_ms: ts,
            note,
            posted_by: sender,
        };

        // Re-derive event fields BEFORE moving row into the table.
        let evt = AnchorPosted {
            id,
            checkpoint: row.checkpoint,
            hash: row.hash,
            schema_version: row.schema_version,
            ipfs_cid: row.ipfs_cid,
            note: row.note,
            posted_by: sender,
            timestamp_ms: ts,
        };

        table::add(&mut registry.anchors, id, row);
        registry.next_id = id + 1;
        event::emit(evt);
    }

    // View functions
    public fun anchor_count(r: &AnchorRegistry): u64 {
        table::length(&r.anchors)
    }

    public fun has_anchor(r: &AnchorRegistry, id: u64): bool {
        table::contains(&r.anchors, id)
    }

    public fun borrow_anchor(r: &AnchorRegistry, id: u64): &Anchor {
        table::borrow(&r.anchors, id)
    }

    // Anchor field accessors for FE devInspect calls.
    public fun anchor_id(a: &Anchor): u64 { a.id }
    public fun anchor_checkpoint(a: &Anchor): u64 { a.checkpoint }
    public fun anchor_hash(a: &Anchor): vector<u8> { a.hash }
    public fun anchor_schema_version(a: &Anchor): String { a.schema_version }
    public fun anchor_ipfs_cid(a: &Anchor): String { a.ipfs_cid }
    public fun anchor_posted_at_ms(a: &Anchor): u64 { a.posted_at_ms }
    public fun anchor_note(a: &Anchor): String { a.note }
    public fun anchor_posted_by(a: &Anchor): address { a.posted_by }
}
