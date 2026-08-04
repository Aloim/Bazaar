// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// DappHub/sources/reclaim_registry.move
// Update Ceremony V2 — Phase 2 "backup injection" storage layer.
//
// After a fresh publish (V38) orphans the old packages, the admin populates this
// registry from the verified pre-publish snapshot (one BCS-encoded record per SSU
// and per tribe). Owners/leaders then sign reclaim_ssu (bazaar_mission) /
// reclaim_tribe (bazaar_economy), which CONSUME their own record here to rebuild
// their shell + config + roster + bans + token balances on the new packages.
//
// This module is pure storage + auth — NO cross-package calls (it sits at the top
// of the dependency graph). It holds:
//   - ReclaimRecord DFs keyed by ReclaimKey{holder, record_type, sub_id}
//   - a PERMANENT `consumed` table (survives the consume df::remove rebate) so a
//     re-run of populate can NEVER resurrect a reclaimed record (anti-replay).
//   - an old->new tribe-id remap (a fresh publish assigns NEW monotonic tribe ids;
//     reclaim_ssu's tribe-first guard reads this).
//
// Mint authority for restored token balances does NOT live here — reclaim_tribe is
// in the same package as TribeTokenLedger, so a same-package `public(package)` mint
// is the gate (no cross-package witness needed; design §13 ruling #1). The only
// value this module hands out is ReclaimTribeProof — a fieldless single-use `drop`
// token that authorizes ONE remap write bound to the consumed tribe record.

module dapp_hub::reclaim_registry {
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::table::{Self, Table};
    use sui::dynamic_field as df;
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use dapp_hub::tribe_registry::{Self, TribeLeaderCap};
    use dapp_hub::ceremony_gate;

    // ----- record-type discriminators (2 types — design C2) -----
    const RECORD_TYPE_SSU_OWNER:    u8 = 0;
    const RECORD_TYPE_TRIBE_LEADER: u8 = 1;

    // ----- prune grace (HARD-CODED — never a param/field — durable inv #11) -----
    const GRACE_BUFFER_MS: u64 = 2_592_000_000; // 30 days

    // ----- batch cap -----
    const MAX_BATCH_ROWS: u64 = 100;

    // ----- errors -----
    const E_NOT_IN_BACKUP:    u64 = 1;
    const E_ALREADY_CONSUMED: u64 = 2;
    const E_BAD_RECORD_TYPE:  u64 = 3;
    const E_LEN_MISMATCH:     u64 = 4;
    const E_BATCH_TOO_LARGE:  u64 = 5;
    const E_EMPTY_BATCH:      u64 = 6;
    const E_REMAP_EXISTS:     u64 = 7;
    const E_NOT_REMAPPED:     u64 = 8;
    const E_PROOF_MISMATCH:   u64 = 9;

    public struct ReclaimRegistry has key {
        id: UID,
        record_count: u64,
        // old_tribe_id -> new_tribe_id (a fresh publish re-mints tribe ids; design C4).
        tribe_remap: Table<u64, u64>,
        // PERMANENT consumed-key marker (design §13 ruling #2). Written by consume_*,
        // checked by populate so a re-paged/retried populate cannot resurrect a
        // reclaimed (df::removed) record -> no double-reclaim / double-mint.
        consumed: Table<ReclaimKey, u64>,
    }

    public struct ReclaimKey has store, drop, copy {
        holder: address,
        record_type: u8,   // 0 = SSU_OWNER, 1 = TRIBE_LEADER
        sub_id: u256,      // SSU_OWNER: ssu_id (as u256); TRIBE_LEADER: original_tribe_id (as u256)
    }

    public struct ReclaimRecord has store, drop {
        key: ReclaimKey,
        payload_blob: vector<u8>,   // BCS-encoded per record_type (decoded in the reclaim entries)
        backup_anchor_id: u64,      // -> AnchorRegistry row on the OUTGOING version
        populated_at_ms: u64,
        min_retention_ms: u64,
        consumed: bool,             // belt+suspenders; the df::remove + consumed-table are the real guards
        consumed_at_ms: u64,
    }

    /// Single-use authorization for ONE old->new tribe-remap write. Fieldless-but-bound:
    /// it carries the old_tribe_id of the record that was just consumed. `drop` only +
    /// no public constructor => it can exist only transiently inside reclaim_tribe's body
    /// (created by consume_tribe_reclaim_record, consumed by record_tribe_remap).
    public struct ReclaimTribeProof has drop {
        old_tribe_id: u64,
    }

    // ----- events -----
    public struct ReclaimRecordPopulated has copy, drop {
        holder: address, record_type: u8, sub_id: u256, anchor_id: u64, timestamp_ms: u64,
    }
    public struct ReclaimRecordConsumed has copy, drop {
        holder: address, record_type: u8, sub_id: u256, timestamp_ms: u64,
    }
    public struct ReclaimRecordPruned has copy, drop {
        holder: address, record_type: u8, sub_id: u256, timestamp_ms: u64,
    }
    public struct TribeRemapRecorded has copy, drop {
        old_tribe_id: u64, new_tribe_id: u64, timestamp_ms: u64,
    }

    /// One-shot init, folded into the V38 cascade PTB#1 (reference_cascade_foreground_and_ptb1_init).
    /// Mirrors anchor_registry::create_and_share. NOT an entry.
    public(package) fun create_and_share(ctx: &mut TxContext) {
        let registry = ReclaimRegistry {
            id: object::new(ctx),
            record_count: 0,
            tribe_remap: table::new<u64, u64>(ctx),
            consumed: table::new<ReclaimKey, u64>(ctx),
        };
        transfer::share_object(registry);
    }

    /// One-shot V38 cascade init: stands up BOTH the ReclaimRegistry and the CeremonyGate
    /// (both shared; the gate starts CLOSED). DAppOwnerCap-gated; folded into PTB#1 before
    /// the DAppOwnerCap transfer (reference_cascade_foreground_and_ptb1_init). The two
    /// public(package) create_and_share fns have no other entry wiring, so this is the sole
    /// production path that mints these objects' ids for the .env (VITE_RECLAIM_REGISTRY_ID /
    /// VITE_CEREMONY_GATE_ID). Mirrors announcements::init_v1_ceremony_objects — no on-chain
    /// idempotency check; a double-call just creates a second unused pair (env records the first).
    public entry fun init_reclaim_ceremony_objects(
        _cap: &DAppOwnerCap,
        ctx: &mut TxContext,
    ) {
        create_and_share(ctx);
        ceremony_gate::create_and_share(ctx);
    }

    // ===== Admin: populate (DAppOwnerCap-gated, pageable, idempotent) =====

    /// Admin writes N records in one tx from the verified snapshot. Pageable (FE batches
    /// up to MAX_BATCH_ROWS). Idempotent AND replay-safe: a row is skipped if the key is
    /// already a live record OR is already in the permanent `consumed` table (ruling #2).
    public entry fun populate_reclaim_registry(
        _cap: &DAppOwnerCap,
        registry: &mut ReclaimRegistry,
        holders: vector<address>,
        record_types: vector<u8>,
        sub_ids: vector<u256>,
        payload_blobs: vector<vector<u8>>,
        backup_anchor_id: u64,
        default_retention_ms: u64,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        let n = vector::length(&holders);
        assert!(n > 0, E_EMPTY_BATCH);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);
        assert!(vector::length(&record_types) == n, E_LEN_MISMATCH);
        assert!(vector::length(&sub_ids) == n, E_LEN_MISMATCH);
        assert!(vector::length(&payload_blobs) == n, E_LEN_MISMATCH);

        let now = clock::timestamp_ms(clock);
        let mut i = 0;
        while (i < n) {
            let rtype = *vector::borrow(&record_types, i);
            assert!(
                rtype == RECORD_TYPE_SSU_OWNER || rtype == RECORD_TYPE_TRIBE_LEADER,
                E_BAD_RECORD_TYPE,
            );
            let key = ReclaimKey {
                holder: *vector::borrow(&holders, i),
                record_type: rtype,
                sub_id: *vector::borrow(&sub_ids, i),
            };
            // Skip if already consumed (permanent) OR already a live record (idempotent).
            if (!table::contains(&registry.consumed, key) && !df::exists_(&registry.id, key)) {
                let rec = ReclaimRecord {
                    key,
                    payload_blob: *vector::borrow(&payload_blobs, i),
                    backup_anchor_id,
                    populated_at_ms: now,
                    min_retention_ms: default_retention_ms,
                    consumed: false,
                    consumed_at_ms: 0,
                };
                df::add(&mut registry.id, key, rec);
                registry.record_count = registry.record_count + 1;
                event::emit(ReclaimRecordPopulated {
                    holder: key.holder, record_type: rtype, sub_id: key.sub_id,
                    anchor_id: backup_anchor_id, timestamp_ms: now,
                });
            };
            i = i + 1;
        };
    }

    // ===== Admin: prune (DAppOwnerCap-gated; GRACE_BUFFER_MS hard-coded) =====

    public entry fun prune_expired_unclaimed_records(
        _cap: &DAppOwnerCap,
        registry: &mut ReclaimRegistry,
        holders: vector<address>,
        record_types: vector<u8>,
        sub_ids: vector<u256>,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        let n = vector::length(&holders);
        assert!(vector::length(&record_types) == n, E_LEN_MISMATCH);
        assert!(vector::length(&sub_ids) == n, E_LEN_MISMATCH);

        let now = clock::timestamp_ms(clock);
        let mut i = 0;
        while (i < n) {
            let key = ReclaimKey {
                holder: *vector::borrow(&holders, i),
                record_type: *vector::borrow(&record_types, i),
                sub_id: *vector::borrow(&sub_ids, i),
            };
            if (df::exists_(&registry.id, key)) {
                let expired = {
                    let rec_ref: &ReclaimRecord = df::borrow(&registry.id, key);
                    !rec_ref.consumed
                        && now - rec_ref.populated_at_ms >= rec_ref.min_retention_ms + GRACE_BUFFER_MS
                };
                if (expired) {
                    let _: ReclaimRecord = df::remove(&mut registry.id, key);
                    if (registry.record_count > 0) {
                        registry.record_count = registry.record_count - 1;
                    };
                    event::emit(ReclaimRecordPruned {
                        holder: key.holder, record_type: key.record_type,
                        sub_id: key.sub_id, timestamp_ms: now,
                    });
                };
            };
            i = i + 1;
        };
    }

    // ===== User: consume (sender-bound; auto-prune-on-reclaim + permanent marker) =====

    /// SSU owner consumes their own SSU_OWNER record. Returns the BCS payload.
    public fun consume_ssu_reclaim_record(
        registry: &mut ReclaimRegistry,
        sub_id: u256,
        clock: &Clock,
        ctx: &TxContext,
    ): vector<u8> {
        consume_internal(registry, RECORD_TYPE_SSU_OWNER, sub_id, clock, ctx)
    }

    /// Tribe leader consumes their own TRIBE_LEADER record. Returns the BCS payload PLUS
    /// a single-use ReclaimTribeProof bound to this record's old tribe id (the only way to
    /// authorize the subsequent record_tribe_remap write).
    public fun consume_tribe_reclaim_record(
        registry: &mut ReclaimRegistry,
        sub_id: u256,
        clock: &Clock,
        ctx: &TxContext,
    ): (vector<u8>, ReclaimTribeProof) {
        let blob = consume_internal(registry, RECORD_TYPE_TRIBE_LEADER, sub_id, clock, ctx);
        (blob, ReclaimTribeProof { old_tribe_id: (sub_id as u64) })
    }

    fun consume_internal(
        registry: &mut ReclaimRegistry,
        record_type: u8,
        sub_id: u256,
        clock: &Clock,
        ctx: &TxContext,
    ): vector<u8> {
        // Sender-bound: a caller can only consume THEIR OWN record (no holder param).
        let key = ReclaimKey { holder: tx_context::sender(ctx), record_type, sub_id };
        assert!(df::exists_(&registry.id, key), E_NOT_IN_BACKUP);
        let rec: ReclaimRecord = df::remove(&mut registry.id, key);
        assert!(!rec.consumed, E_ALREADY_CONSUMED);
        let ReclaimRecord {
            key: _, payload_blob, backup_anchor_id: _, populated_at_ms: _,
            min_retention_ms: _, consumed: _, consumed_at_ms: _,
        } = rec;
        let now = clock::timestamp_ms(clock);
        // Permanent consumed marker so re-populate cannot resurrect this key (ruling #2).
        table::add(&mut registry.consumed, key, now);
        if (registry.record_count > 0) {
            registry.record_count = registry.record_count - 1;
        };
        event::emit(ReclaimRecordConsumed {
            holder: key.holder, record_type, sub_id, timestamp_ms: now,
        });
        payload_blob
    }

    // ===== Tribe-id remap (design C4) =====

    /// reclaim_tribe records old->new after creating the fresh tribe. Gated by the
    /// just-minted TribeLeaderCap (proves it created the new tribe) AND the single-use
    /// ReclaimTribeProof (proves it consumed the matching old-id record in this same tx).
    /// Idempotent: a second remap of the same old id aborts E_REMAP_EXISTS.
    public fun record_tribe_remap(
        registry: &mut ReclaimRegistry,
        leader_cap: &TribeLeaderCap,
        old_tribe_id: u64,
        proof: ReclaimTribeProof,
        clock: &Clock,
    ) {
        assert!(proof.old_tribe_id == old_tribe_id, E_PROOF_MISMATCH); // proof consumed (drop)
        assert!(!table::contains(&registry.tribe_remap, old_tribe_id), E_REMAP_EXISTS);
        let new_tribe_id = tribe_registry::cap_tribe_id(leader_cap);
        table::add(&mut registry.tribe_remap, old_tribe_id, new_tribe_id);
        event::emit(TribeRemapRecorded {
            old_tribe_id, new_tribe_id, timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// reclaim_ssu's tribe-first guard reads this. Aborts E_NOT_REMAPPED == "tribe not reclaimed yet".
    public fun resolve_remapped_tribe(registry: &ReclaimRegistry, old_tribe_id: u64): u64 {
        assert!(table::contains(&registry.tribe_remap, old_tribe_id), E_NOT_REMAPPED);
        *table::borrow(&registry.tribe_remap, old_tribe_id)
    }

    public fun is_tribe_remapped(registry: &ReclaimRegistry, old_tribe_id: u64): bool {
        table::contains(&registry.tribe_remap, old_tribe_id)
    }

    // ===== Read-only views =====

    public fun record_count(r: &ReclaimRegistry): u64 { r.record_count }

    public fun has_record(r: &ReclaimRegistry, holder: address, record_type: u8, sub_id: u256): bool {
        df::exists_(&r.id, ReclaimKey { holder, record_type, sub_id })
    }

    public fun is_consumed(r: &ReclaimRegistry, holder: address, record_type: u8, sub_id: u256): bool {
        table::contains(&r.consumed, ReclaimKey { holder, record_type, sub_id })
    }

    public fun ssu_record_type(): u8 { RECORD_TYPE_SSU_OWNER }
    public fun tribe_record_type(): u8 { RECORD_TYPE_TRIBE_LEADER }
    public fun grace_buffer_ms(): u64 { GRACE_BUFFER_MS }

    /// Test-only proof constructor so unit tests can exercise record_tribe_remap's
    /// mismatch / duplicate paths directly. NOT compiled into production bytecode —
    /// the sole production constructor remains consume_tribe_reclaim_record.
    #[test_only]
    public fun new_tribe_proof_for_testing(old_tribe_id: u64): ReclaimTribeProof {
        ReclaimTribeProof { old_tribe_id }
    }

    /// Test-only constructor + share so the bazaar_mission / bazaar_economy reclaim
    /// round-trip tests (which live in downstream packages and cannot call the
    /// public(package) create_and_share) can stand up a registry. Publish-stripped.
    #[test_only]
    public fun create_for_testing(ctx: &mut TxContext): ReclaimRegistry {
        ReclaimRegistry {
            id: object::new(ctx),
            record_count: 0,
            tribe_remap: table::new<u64, u64>(ctx),
            consumed: table::new<ReclaimKey, u64>(ctx),
        }
    }

    #[test_only]
    public fun share_for_testing(registry: ReclaimRegistry) {
        transfer::share_object(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
