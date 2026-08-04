// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::tribe_governance_caps {
    use sui::event;
    use sui::clock::Clock;
    use std::string;
    use dapp_hub::tribe_registry;
    use bazaar_core::tribe_governance::{
        Self, TribeGovernance, TribeSuperAdminCap, TribeAdminCap, TribeModCap,
    };
    use bazaar_core::bazaar_assertions;
    use bazaar_core::membership::{MemberRegistry};

    // ===== Error Codes =====
    // E_WRONG_TRIBE mirrors tribe_governance value 1.
    const E_WRONG_TRIBE: u64 = 1;

    // V35: staff_kind constants for ban events (mirrors ssu_governance_caps values).
    // Leader maps to OWNER (0) for event schema parity with ssu_governance_caps.
    const STAFF_KIND_OWNER:       u8 = 0;
    const STAFF_KIND_SUPER_ADMIN: u8 = 1;
    const STAFF_KIND_ADMIN:       u8 = 2;
    const STAFF_KIND_MOD:         u8 = 3;

    /// SA-06 CC-04: rank-aware ban guard. Asserts issuer_rank > target's registry tribe_role.
    /// Uses membership::tribe_role_of (returns 0 for Stranger/unregistered).
    ///
    /// IMPORTANT EDGE: a tribe Leader whose registry tribe_role was never set via seed_owner_entry
    /// defaults to Stranger (0). Such a Leader CAN be banned by a Mod (rank 4 > 0). This is
    /// bounded and reversible: tribe_unban_as_leader has NO rank gate, so a banned Leader can
    /// self-recover in the same transaction by calling tribe_unban_as_leader. The FE is the
    /// authoritative guard since Move cannot enumerate cap holdings. On-chain check is best-effort.
    ///
    /// Unbans are intentionally NOT rank-gated: a higher tier may always lift a lower tier's ban.
    fun assert_can_ban(
        issuer_rank: u8,
        target: address,
        members: &MemberRegistry,
    ) {
        let target_rank = bazaar_core::membership::tribe_role_of(members, target);
        assert!(issuer_rank > target_rank, tribe_governance::e_target_rank_too_high());
    }

    // ===== Relocated Events =====
    /// Emitted on every cap grant. Relocated from tribe_governance per R6.7.0 split.
    /// Schema is IDENTICAL to tribe_governance::TribeCapGranted for indexer continuity.
    public struct TribeCapGranted has copy, drop {
        tribe_id: u64,
        recipient: address,
        cap_type: std::string::String,
        timestamp_ms: u64,
    }

    // ===== Relocated Entry Functions =====

    /// Grant a TribeSuperAdminCap to `recipient`. Leader-only.
    /// Relocated from tribe_governance::grant_tribe_super_admin per R6.7.0 split.
    /// Cap struct literal construction delegated to tribe_governance::new_tribe_super_admin_cap.
    public fun grant_tribe_super_admin(
        leader_cap: &tribe_registry::TribeLeaderCap,
        gov: &TribeGovernance,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeSuperAdminCap {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);    // SEC-015
        assert!(tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        event::emit(TribeCapGranted {
            tribe_id: tribe_governance::tribe_id(gov),
            recipient,
            cap_type: string::utf8(b"super_admin"),
            timestamp_ms: clock.timestamp_ms(),
        });
        tribe_governance::new_tribe_super_admin_cap(gov, ctx)
    }

    /// Grant a TribeAdminCap to `recipient`. TribeSuperAdminCap-only.
    /// Relocated from tribe_governance::grant_tribe_admin per R6.7.0 split.
    public fun grant_tribe_admin(
        super_cap: &TribeSuperAdminCap,
        gov: &TribeGovernance,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeAdminCap {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);    // SEC-015
        assert!(tribe_governance::tribe_super_admin_cap_tribe_id(super_cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        // B1.3 (AUD-ET-26): revoked SuperAdmin cannot issue new AdminCaps.
        // Mirrors withdraw_tribe_tax_as_super_admin (tribe_governance.move:354-358).
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, object::id(super_cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        event::emit(TribeCapGranted {
            tribe_id: tribe_governance::tribe_id(gov),
            recipient,
            cap_type: string::utf8(b"admin"),
            timestamp_ms: clock.timestamp_ms(),
        });
        tribe_governance::new_tribe_admin_cap(gov, ctx)
    }

    /// Grant a TribeModCap to `recipient`. TribeAdminCap-only.
    /// Relocated from tribe_governance::grant_tribe_mod per R6.7.0 split.
    public fun grant_tribe_mod(
        admin_cap: &TribeAdminCap,
        gov: &TribeGovernance,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeModCap {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);    // SEC-015
        assert!(tribe_governance::tribe_admin_cap_tribe_id(admin_cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        // B1.3 (AUD-ET-26): revoked Admin cannot issue new ModCaps.
        // Closes the re-arm loop: revoke(SA) -> SA cannot grant Admin -> Admin cannot grant Mod.
        assert!(
            !tribe_governance::is_tribe_admin_cap_revoked(gov, object::id(admin_cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        event::emit(TribeCapGranted {
            tribe_id: tribe_governance::tribe_id(gov),
            recipient,
            cap_type: string::utf8(b"mod"),
            timestamp_ms: clock.timestamp_ms(),
        });
        tribe_governance::new_tribe_mod_cap(gov, ctx)
    }

    // ===== Revocation Error Codes =====
    // E_ALREADY_REVOKED mirrors ssu_governance value 5 for semantic parity.
    const E_ALREADY_REVOKED: u64 = 5;
    // E_NOT_REVOKED mirrors ssu_governance value 6 for semantic parity.
    const E_NOT_REVOKED: u64 = 6;

    // ===== Revocation Events =====

    /// Emitted when a TribeSuperAdminCap is added to the revocation table.
    public struct TribeSuperAdminCapRevoked has copy, drop {
        cap_id: ID,
        gov_id: ID,
        revoked_by: address,
        timestamp_ms: u64,
    }

    /// Emitted when a TribeSuperAdminCap is removed from the revocation table.
    public struct TribeSuperAdminCapUnrevoked has copy, drop {
        cap_id: ID,
        gov_id: ID,
        unrevoked_by: address,
        timestamp_ms: u64,
    }

    /// Emitted when a TribeAdminCap is added to the revocation table.
    public struct TribeAdminCapRevoked has copy, drop {
        cap_id: ID,
        gov_id: ID,
        revoked_by: address,
        timestamp_ms: u64,
    }

    /// Emitted when a TribeAdminCap is removed from the revocation table.
    public struct TribeAdminCapUnrevoked has copy, drop {
        cap_id: ID,
        gov_id: ID,
        unrevoked_by: address,
        timestamp_ms: u64,
    }

    /// Emitted when a TribeModCap is added to the revocation table.
    public struct TribeModCapRevoked has copy, drop {
        cap_id: ID,
        gov_id: ID,
        revoked_by: address,
        timestamp_ms: u64,
    }

    /// Emitted when a TribeModCap is removed from the revocation table.
    public struct TribeModCapUnrevoked has copy, drop {
        cap_id: ID,
        gov_id: ID,
        unrevoked_by: address,
        timestamp_ms: u64,
    }

    // ===== Revocation Entry Functions =====
    // EXEMPT-MODERATION: revocation and unrevocation fns do NOT call assert_tribe_active.
    // Rationale: revocation is a governance recovery mechanism that must work mid-deactivation.
    // Blocking revoke/unrevoke on active-state creates a governance deadlock (rogue cap can
    // prevent reactivation; admin cannot restore revoked-then-needed caps). Constitution §2.6.

    /// Revoke a TribeSuperAdminCap by its object ID. Authority: TribeSuperAdminCap (peer).
    /// EXEMPT-MODERATION: no assert_tribe_active gate — operates during deactivation (Item 2).
    /// Aborts: E_WRONG_TRIBE (1) if authority cap tribe_id != gov tribe_id.
    /// Aborts: tribe_governance::e_tribe_cap_revoked (4) if authority cap itself is revoked.
    /// Aborts: E_ALREADY_REVOKED (5) if target_cap_id is already in revocation table.
    public entry fun revoke_tribe_super_admin_cap(
        authority: &TribeSuperAdminCap,
        gov: &mut TribeGovernance,
        target_cap_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // EXEMPT-MODERATION — see block comment above.
        assert!(
            tribe_governance::tribe_super_admin_cap_tribe_id(authority) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        // Authority cap must not itself be revoked (SEC-010 revoker integrity check).
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, object::id(authority)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        // Duplicate-revocation guard.
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, target_cap_id),
            E_ALREADY_REVOKED,
        );
        tribe_governance::add_to_tribe_super_admin_revocation(gov, target_cap_id);
        event::emit(TribeSuperAdminCapRevoked {
            cap_id: target_cap_id,
            gov_id: object::id(gov),
            revoked_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Remove a TribeSuperAdminCap from the revocation table. Authority: TribeSuperAdminCap.
    /// EXEMPT-RECOVERY: no assert_tribe_active gate — unrevoke must work mid-deactivation.
    /// Aborts: E_WRONG_TRIBE (1) if authority cap tribe_id != gov tribe_id.
    /// Aborts: tribe_governance::e_tribe_cap_revoked (4) if authority cap itself is revoked.
    /// Aborts: E_NOT_REVOKED (6) if target_cap_id is not in revocation table.
    public entry fun unrevoke_tribe_super_admin_cap(
        authority: &TribeSuperAdminCap,
        gov: &mut TribeGovernance,
        target_cap_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // EXEMPT-RECOVERY — see block comment above.
        assert!(
            tribe_governance::tribe_super_admin_cap_tribe_id(authority) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, object::id(authority)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        assert!(
            tribe_governance::is_tribe_super_admin_cap_revoked(gov, target_cap_id),
            E_NOT_REVOKED,
        );
        tribe_governance::remove_from_tribe_super_admin_revocation(gov, target_cap_id);
        event::emit(TribeSuperAdminCapUnrevoked {
            cap_id: target_cap_id,
            gov_id: object::id(gov),
            unrevoked_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Revoke a TribeAdminCap by its object ID. Authority: TribeSuperAdminCap.
    /// EXEMPT-MODERATION: no assert_tribe_active gate — operates during deactivation (Item 2).
    /// Aborts: E_WRONG_TRIBE (1) if authority cap tribe_id != gov tribe_id.
    /// Aborts: tribe_governance::e_tribe_cap_revoked (4) if authority cap itself is revoked.
    /// Aborts: E_ALREADY_REVOKED (5) if target_cap_id is already in revocation table.
    public entry fun revoke_tribe_admin_cap(
        authority: &TribeSuperAdminCap,
        gov: &mut TribeGovernance,
        target_cap_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // EXEMPT-MODERATION — see block comment above.
        assert!(
            tribe_governance::tribe_super_admin_cap_tribe_id(authority) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, object::id(authority)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        assert!(
            !tribe_governance::is_tribe_admin_cap_revoked(gov, target_cap_id),
            E_ALREADY_REVOKED,
        );
        tribe_governance::add_to_tribe_admin_revocation(gov, target_cap_id);
        event::emit(TribeAdminCapRevoked {
            cap_id: target_cap_id,
            gov_id: object::id(gov),
            revoked_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Remove a TribeAdminCap from the revocation table. Authority: TribeSuperAdminCap.
    /// EXEMPT-RECOVERY: no assert_tribe_active gate — unrevoke must work mid-deactivation.
    /// Aborts: E_WRONG_TRIBE (1) if authority cap tribe_id != gov tribe_id.
    /// Aborts: tribe_governance::e_tribe_cap_revoked (4) if authority cap itself is revoked.
    /// Aborts: E_NOT_REVOKED (6) if target_cap_id is not in revocation table.
    public entry fun unrevoke_tribe_admin_cap(
        authority: &TribeSuperAdminCap,
        gov: &mut TribeGovernance,
        target_cap_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // EXEMPT-RECOVERY — see block comment above.
        assert!(
            tribe_governance::tribe_super_admin_cap_tribe_id(authority) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, object::id(authority)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        assert!(
            tribe_governance::is_tribe_admin_cap_revoked(gov, target_cap_id),
            E_NOT_REVOKED,
        );
        tribe_governance::remove_from_tribe_admin_revocation(gov, target_cap_id);
        event::emit(TribeAdminCapUnrevoked {
            cap_id: target_cap_id,
            gov_id: object::id(gov),
            unrevoked_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Revoke a TribeModCap by its object ID. Authority: TribeAdminCap (minimum sufficient).
    /// EXEMPT-MODERATION: no assert_tribe_active gate — operates during deactivation (Item 2).
    /// Aborts: E_WRONG_TRIBE (1) if authority cap tribe_id != gov tribe_id.
    /// Aborts: tribe_governance::e_tribe_cap_revoked (4) if authority cap itself is revoked.
    /// Aborts: E_ALREADY_REVOKED (5) if target_cap_id is already in revocation table.
    public entry fun revoke_tribe_mod_cap(
        authority: &TribeAdminCap,
        gov: &mut TribeGovernance,
        target_cap_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // EXEMPT-MODERATION — see block comment above.
        assert!(
            tribe_governance::tribe_admin_cap_tribe_id(authority) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_admin_cap_revoked(gov, object::id(authority)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        assert!(
            !tribe_governance::is_tribe_mod_cap_revoked(gov, target_cap_id),
            E_ALREADY_REVOKED,
        );
        tribe_governance::add_to_tribe_mod_revocation(gov, target_cap_id);
        event::emit(TribeModCapRevoked {
            cap_id: target_cap_id,
            gov_id: object::id(gov),
            revoked_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Remove a TribeModCap from the revocation table. Authority: TribeAdminCap.
    /// EXEMPT-RECOVERY: no assert_tribe_active gate — unrevoke must work mid-deactivation.
    /// Aborts: E_WRONG_TRIBE (1) if authority cap tribe_id != gov tribe_id.
    /// Aborts: tribe_governance::e_tribe_cap_revoked (4) if authority cap itself is revoked.
    /// Aborts: E_NOT_REVOKED (6) if target_cap_id is not in revocation table.
    public entry fun unrevoke_tribe_mod_cap(
        authority: &TribeAdminCap,
        gov: &mut TribeGovernance,
        target_cap_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // EXEMPT-RECOVERY — see block comment above.
        assert!(
            tribe_governance::tribe_admin_cap_tribe_id(authority) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_admin_cap_revoked(gov, object::id(authority)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        assert!(
            tribe_governance::is_tribe_mod_cap_revoked(gov, target_cap_id),
            E_NOT_REVOKED,
        );
        tribe_governance::remove_from_tribe_mod_revocation(gov, target_cap_id);
        event::emit(TribeModCapUnrevoked {
            cap_id: target_cap_id,
            gov_id: object::id(gov),
            unrevoked_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    // ===== V35 8d: Tribe-Wide Timed Bans — 4 tiers =====
    // Ban entries: assert tribe-match + assert_tribe_active + assert revocation (non-Leader)
    //              + SA-06 rank-aware assert, then delegate to set_tribe_ban_internal.
    // Unban entries: same guards EXCEPT no rank-check — higher tier always lifts lower ban.

    // ----- BAN: Leader -----
    /// Tribe-wide timed ban issued by the tribe leader.
    /// expires_at_ms must be > clock.timestamp_ms() (or PERMANENT_BAN_SENTINEL = u64::MAX).
    /// SA-06: Leader (rank 7) may ban any target whose registry tribe_role < 7.
    /// Targets with tribe_role 0 (Stranger / unregistered) are always bannable.
    public entry fun tribe_ban_as_leader(
        leader_cap: &tribe_registry::TribeLeaderCap,
        gov: &mut TribeGovernance,
        members: &MemberRegistry,
        target: address,
        expires_at_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert_can_ban(tribe_governance::tribe_rank_leader(), target, members);
        tribe_governance::set_tribe_ban_internal(
            gov, target, expires_at_ms, ctx.sender(), STAFF_KIND_OWNER, clock,
        );
    }

    // ----- BAN: SuperAdmin -----
    /// Tribe-wide timed ban issued by a TribeSuperAdminCap holder.
    /// SA-01: asserts cap not revoked.
    /// SA-06: SuperAdmin (rank 6) may only ban targets with tribe_role < 6.
    public entry fun tribe_ban_as_super_admin(
        cap: &TribeSuperAdminCap,
        gov: &mut TribeGovernance,
        members: &MemberRegistry,
        target: address,
        expires_at_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_governance::tribe_super_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, object::id(cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        assert_can_ban(tribe_governance::tribe_rank_super_admin(), target, members);
        tribe_governance::set_tribe_ban_internal(
            gov, target, expires_at_ms, ctx.sender(), STAFF_KIND_SUPER_ADMIN, clock,
        );
    }

    // ----- BAN: Admin -----
    /// Tribe-wide timed ban issued by a TribeAdminCap holder.
    /// SA-01: asserts cap not revoked.
    /// SA-06: Admin (rank 5) may only ban targets with tribe_role < 5.
    public entry fun tribe_ban_as_admin(
        cap: &TribeAdminCap,
        gov: &mut TribeGovernance,
        members: &MemberRegistry,
        target: address,
        expires_at_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_admin_cap_revoked(gov, object::id(cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        assert_can_ban(tribe_governance::tribe_rank_admin(), target, members);
        tribe_governance::set_tribe_ban_internal(
            gov, target, expires_at_ms, ctx.sender(), STAFF_KIND_ADMIN, clock,
        );
    }

    // ----- BAN: Mod -----
    /// Tribe-wide timed ban issued by a TribeModCap holder.
    /// SA-01: asserts cap not revoked.
    /// SA-06: Mod (rank 4) may only ban targets with tribe_role < 4 (Friendly/Member/below).
    public entry fun tribe_ban_as_mod(
        cap: &TribeModCap,
        gov: &mut TribeGovernance,
        members: &MemberRegistry,
        target: address,
        expires_at_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_governance::tribe_mod_cap_tribe_id(cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_mod_cap_revoked(gov, object::id(cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        assert_can_ban(tribe_governance::tribe_rank_mod(), target, members);
        tribe_governance::set_tribe_ban_internal(
            gov, target, expires_at_ms, ctx.sender(), STAFF_KIND_MOD, clock,
        );
    }

    // ----- UNBAN: 4 tiers (NO rank-check — higher tier always lifts lower ban) -----

    /// Lift a tribe-wide ban. TribeLeaderCap-gated. No rank check on unbans by design.
    public entry fun tribe_unban_as_leader(
        leader_cap: &tribe_registry::TribeLeaderCap,
        gov: &mut TribeGovernance,
        target: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        tribe_governance::tribe_unban_internal(gov, target, ctx.sender(), STAFF_KIND_OWNER, clock);
    }

    /// Lift a tribe-wide ban. TribeSuperAdminCap-gated.
    /// SA-01: asserts cap not revoked.
    public entry fun tribe_unban_as_super_admin(
        cap: &TribeSuperAdminCap,
        gov: &mut TribeGovernance,
        target: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_governance::tribe_super_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_super_admin_cap_revoked(gov, object::id(cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        tribe_governance::tribe_unban_internal(gov, target, ctx.sender(), STAFF_KIND_SUPER_ADMIN, clock);
    }

    /// Lift a tribe-wide ban. TribeAdminCap-gated.
    /// SA-01: asserts cap not revoked.
    public entry fun tribe_unban_as_admin(
        cap: &TribeAdminCap,
        gov: &mut TribeGovernance,
        target: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_admin_cap_revoked(gov, object::id(cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        tribe_governance::tribe_unban_internal(gov, target, ctx.sender(), STAFF_KIND_ADMIN, clock);
    }

    /// Lift a tribe-wide ban. TribeModCap-gated.
    /// SA-01: asserts cap not revoked.
    public entry fun tribe_unban_as_mod(
        cap: &TribeModCap,
        gov: &mut TribeGovernance,
        target: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        tribe_governance::assert_tribe_active(gov);
        assert!(
            tribe_governance::tribe_mod_cap_tribe_id(cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        assert!(
            !tribe_governance::is_tribe_mod_cap_revoked(gov, object::id(cap)),
            tribe_governance::e_tribe_cap_revoked(),
        );
        tribe_governance::tribe_unban_internal(gov, target, ctx.sender(), STAFF_KIND_MOD, clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
