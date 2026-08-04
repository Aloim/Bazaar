// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// BazaarMission/sources/reclaim_ssu.move
// Update Ceremony V2 — Phase 2 (Slice 3): the SSU reclaim orchestrator.
//
// After a fresh publish (V38) orphans the old SSUs, the SSU owner re-materialises
// their SSU on the new packages in TWO PTBs (design §6.2 / §13 ruling #6 — two-PTB
// baseline, so NO BCS-decode/loop bytecode lands in the size-critical bazaar_core):
//
//   PTB 1  reclaim_ssu_shell — consumes the caller's SSU reclaim record (anti-replay),
//          decodes the authoritative binding header (bazaar_type + original_tribe_id),
//          re-asserts the Frontier OwnerCap<StorageUnit> proof, enforces the tribe-first
//          ordering (the tribe must already be reclaimed for Easy/Advanced), registers
//          the SSU with the REMAPPED new tribe id, bootstraps the 8 per-SSU objects via
//          the cap-returning bazaar_core helper, and transfers the fresh SSUOwnerCap to
//          the sender. The shared object ids land on the SSUGovernanceCreated event for
//          the FE to resolve.
//   PTB 2  reclaim_ssu_restore — cap-gated; the owner re-applies their snapshot roster /
//          local bans / config / EVE onto the now-shared objects via the validated
//          bazaar_core restore setters. FE-supplied + cap-bound (the owner can set all of
//          this via the normal owner entries anyway); the security anchor — Frontier
//          ownership, anti-replay, tribe binding — is established in the shell.
//
// This module lives in bazaar_mission because mission depends on dapp_hub + bazaar_core
// (both packages it calls) but NOT on bazaar_economy — the SSU shell is economy-agnostic.

module bazaar_mission::reclaim_ssu {
    use sui::clock::Clock;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::bcs;
    use std::string;
    use std::option;
    use EVE::EVE::EVE;
    use world::access::{Self, OwnerCap};
    use world::storage_unit::StorageUnit;
    use dapp_hub::reclaim_registry::{Self, ReclaimRegistry};
    use dapp_hub::ssu_registry::{Self, SSURegistry};
    use bazaar_core::ssu_bootstrap;
    use bazaar_core::membership::{Self, SSUOwnerCap, MemberRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};

    // ----- errors -----
    const E_NOT_FRONTIER_OWNER: u64 = 1; // OwnerCap does not authorise target_ssu_id (C5)
    const E_SSU_ID_MISMATCH:    u64 = 2; // decoded payload.original_ssu_id != target_ssu_id
    const E_LEN_MISMATCH:       u64 = 3; // restore parallel vectors differ in length

    // ----- events -----
    public struct SSUReclaimShellEvent has copy, drop {
        ssu_id: address,
        owner: address,
        bazaar_type: u8,
        new_tribe_id: u64,
        timestamp_ms: u64,
    }

    public struct SSUReclaimRestoreEvent has copy, drop {
        ssu_id: address,
        owner: address,
        members_restored: u64,
        bans_restored: u64,
        eve_deposited: u64,
        timestamp_ms: u64,
    }

    // ===== PTB 1 — shell: ownership + binding + bootstrap =====

    /// Establish ownership of the reclaimed SSU on the new packages. Consumes the caller's
    /// SSU_OWNER reclaim record (sender-bound; aborts if missing/already-consumed — the
    /// anti-replay guard), decodes the authoritative binding header from the record payload,
    /// re-asserts Frontier ownership, enforces tribe-first ordering, registers + bootstraps.
    ///
    /// Aborts:
    ///   - reclaim_registry::E_NOT_IN_BACKUP / E_ALREADY_CONSUMED — no/again record.
    ///   - E_SSU_ID_MISMATCH (2) — payload SSU id != target_ssu_id.
    ///   - E_NOT_FRONTIER_OWNER (1) — OwnerCap does not authorise target_ssu_id.
    ///   - reclaim_registry::E_NOT_REMAPPED — Easy/Advanced SSU whose tribe is not yet reclaimed.
    ///   - ssu_registry::E_SSU_ALREADY_REGISTERED — URL squat.
    public entry fun reclaim_ssu_shell(
        reclaim_registry: &mut ReclaimRegistry,
        ssu_registry: &mut SSURegistry,
        owner_cap: &OwnerCap<StorageUnit>,
        target_ssu_id: address,
        package_id: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);

        // 1. Consume the caller's own SSU record (anti-replay; sender-bound key).
        let sub_id = sui::address::to_u256(target_ssu_id);
        let blob = reclaim_registry::consume_ssu_reclaim_record(reclaim_registry, sub_id, clock, ctx);

        // 2. Decode the authoritative binding header (SSUOwnerPayload fields 1-4; §6.4):
        //    original_ssu_id: address, url_slug: String (skipped), bazaar_type: u8,
        //    original_tribe_id: u64. The remaining restore fields are owner-supplied + cap-gated
        //    in reclaim_ssu_restore (two-PTB design), so the shell only needs the header.
        let mut b = bcs::new(blob);
        let original_ssu_id = bcs::peel_address(&mut b);
        let _url_slug = bcs::peel_vec_u8(&mut b);
        let bazaar_type = bcs::peel_u8(&mut b);
        let original_tribe_id = bcs::peel_u64(&mut b);
        assert!(original_ssu_id == target_ssu_id, E_SSU_ID_MISMATCH);

        // 3. Re-assert the world-native Frontier ownership proof (C5 / SA-RCV2-04).
        assert!(
            access::is_authorized(owner_cap, object::id_from_address(target_ssu_id)),
            E_NOT_FRONTIER_OWNER,
        );

        // 4. Tribe-first ordering: Easy/Advanced SSUs bind to the REMAPPED new tribe id;
        //    aborts E_NOT_REMAPPED if the tribe has not been reclaimed yet. NoTribe -> 0.
        let new_tribe_id = if (bazaar_type != 0) {
            reclaim_registry::resolve_remapped_tribe(reclaim_registry, original_tribe_id)
        } else {
            0
        };

        // 5. Register (Frontier-proof + squat guarded, no fee) with the new tribe id, sender = owner.
        ssu_registry::register_for_reclaim(
            ssu_registry, owner_cap, target_ssu_id, bazaar_type, new_tribe_id, clock, ctx,
        );

        // 6. Bootstrap the 8 per-SSU objects; the cap-returning helper hands us the cap.
        let cap = ssu_bootstrap::bootstrap_ssu_objects_atomic(
            ssu_registry, target_ssu_id, bazaar_type, new_tribe_id, sender, package_id, clock, ctx,
        );
        transfer::public_transfer(cap, sender);

        event::emit(SSUReclaimShellEvent {
            ssu_id: target_ssu_id,
            owner: sender,
            bazaar_type,
            new_tribe_id,
            timestamp_ms: sui::clock::timestamp_ms(clock),
        });
    }

    // ===== PTB 2 — restore: roster + local bans + config + EVE =====

    /// Re-apply the snapshot roster (ssu_role + is_banned), timed local bans, godot URL,
    /// mission listing fee, and lazy-drained EVE onto the freshly-bootstrapped SSU objects.
    /// Every write is cap-bound to this SSU through the validated bazaar_core restore setters
    /// (the SSUOwnerCap from the shell). Idempotent (all upserts). Role-tax + shop limits are
    /// restored by the FE via the existing batch setters (set_ssu_taxes_batch / ssu_shop_config)
    /// composed in the same PTB.
    ///
    /// `eve_coin` is the OLD-version withdraw_legacy_ssu_eve (+ WTB residual merged FE-side);
    /// it may be zero. `godot_url_bytes` empty => leave the default (no URL). Aborts
    /// E_LEN_MISMATCH (3) if the roster / ban parallel vectors differ in length.
    public entry fun reclaim_ssu_restore(
        owner_cap: &SSUOwnerCap,
        gov: &mut SSUGovernance,
        registry: &mut MemberRegistry,
        eve_coin: Coin<EVE>,
        godot_url_bytes: vector<u8>,
        mission_listing_fee_per_hour: u64,
        member_players: vector<address>,
        member_ssu_roles: vector<u8>,
        member_is_banned: vector<bool>,
        ban_addrs: vector<address>,
        ban_expiries: vector<u64>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n_mem = vector::length(&member_players);
        assert!(vector::length(&member_ssu_roles) == n_mem, E_LEN_MISMATCH);
        assert!(vector::length(&member_is_banned) == n_mem, E_LEN_MISMATCH);
        let n_ban = vector::length(&ban_addrs);
        assert!(vector::length(&ban_expiries) == n_ban, E_LEN_MISMATCH);

        let ssu_id = ssu_governance::ssu_id(gov);
        let eve_deposited = coin::value(&eve_coin);

        // Config: godot URL (only if supplied) + mission fee (0 = none).
        if (!vector::is_empty(&godot_url_bytes)) {
            ssu_governance::set_ssu_godot_url(
                gov, option::some(string::utf8(godot_url_bytes)), owner_cap, clock, ctx,
            );
        };
        ssu_governance::set_ssu_mission_listing_fee(gov, mission_listing_fee_per_hour, owner_cap, clock, ctx);

        // EVE deposit (tolerates a zero coin: balance join of zero is a no-op credit).
        ssu_governance::deposit_reclaimed_eve(owner_cap, gov, eve_coin);

        // Roster: restore ssu_role + is_banned per member.
        let mut i = 0;
        while (i < n_mem) {
            membership::restore_member_entry(
                owner_cap, registry,
                *vector::borrow(&member_players, i),
                *vector::borrow(&member_ssu_roles, i),
                *vector::borrow(&member_is_banned, i),
                clock,
            );
            i = i + 1;
        };

        // Timed local bans (the FE must pre-filter rows already expired by reclaim time —
        // set_ban_internal asserts expiry > now).
        let mut j = 0;
        while (j < n_ban) {
            ssu_governance::restore_local_ban(
                owner_cap, gov,
                *vector::borrow(&ban_addrs, j),
                *vector::borrow(&ban_expiries, j),
                clock, ctx,
            );
            j = j + 1;
        };

        event::emit(SSUReclaimRestoreEvent {
            ssu_id,
            owner: tx_context::sender(ctx),
            members_restored: n_mem,
            bans_restored: n_ban,
            eve_deposited,
            timestamp_ms: sui::clock::timestamp_ms(clock),
        });
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
