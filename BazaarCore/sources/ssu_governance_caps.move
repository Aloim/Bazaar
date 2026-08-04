// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::ssu_governance_caps {
    use sui::event;
    use sui::clock::Clock;
    use sui::transfer;
    use std::option::{Self, Option};
    use bazaar_core::membership;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};

    // R3.2: staff_kind values matching ssu_governance STAFF_KIND_* constants.
    // Must stay in sync with ssu_governance.move STAFF_KIND_* values.
    const STAFF_KIND_OWNER:       u8 = 0;
    const STAFF_KIND_SUPER_ADMIN: u8 = 1;
    const STAFF_KIND_ADMIN:       u8 = 2;
    const STAFF_KIND_MOD:         u8 = 3;

    const E_INVALID_MAX_SHOPS: u64 = 20;    // OS-35: Some(0) rejected

    // ===== Events =====

    /// Emitted when an SSUSuperAdminCap is issued to a recipient.
    public struct SSUSuperAdminIssuedEvent has copy, drop {
        ssu_id: address,
        recipient: address,
        issuer: address,
        timestamp_ms: u64,
    }

    /// Emitted when an SSUSuperAdminCap is revoked via `revoke_ssu_super_admin_cap`.
    /// The cap OBJECT remains in the holder's wallet until GC'd via
    /// `destroy_revoked_super_admin_cap`, but is authoritatively invalid from
    /// this event's timestamp onward.
    public struct SSUSuperAdminRevokedEvent has copy, drop {
        ssu_id: address,
        revoked_cap_id: ID,
        revoker: address,
        timestamp_ms: u64,
    }

    /// Emitted when per-SSU max-shops override is set via set_ssu_max_shops_as_*.
    /// staff_kind: 0 = Owner, 1 = SuperAdmin (STAFF_KIND_* constants).
    public struct SSUMaxShopsSet has copy, drop {
        ssu_id: address,
        max_shops: Option<u64>,
        set_by: address,
        staff_kind: u8,
        timestamp_ms: u64,
    }

    // ===== SuperAdmin Management =====

    /// Issue an SSUSuperAdminCap to `recipient`. Gated by SSUOwnerCap for the same SSU.
    /// Aborts: E_WRONG_SSU if owner_cap.ssu_id != gov.ssu_id.
    public entry fun issue_ssu_super_admin_cap(
        owner_cap: &membership::SSUOwnerCap,
        gov: &SSUGovernance,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::cap_ssu_id(owner_cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_governance::assert_not_frozen(gov);                           // R3.5
        // tautological at this site; preserved for code-uniformity at the propagation layer (CC-R3.5-04)
        ssu_governance::assert_subject_in_governance(gov, ssu_governance::ssu_id(gov)); // R3.5 SA-R3-01
        let cap = membership::create_ssu_super_admin_cap(ssu_governance::ssu_id(gov), ctx);
        event::emit(SSUSuperAdminIssuedEvent {
            ssu_id: ssu_governance::ssu_id(gov),
            recipient,
            issuer: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
        transfer::public_transfer(cap, recipient);
    }

    /// Revoke an SSUSuperAdminCap by its object ID. Owner-unilateral.
    /// Aborts: E_WRONG_SSU (1) if owner_cap.ssu_id != ssu_gov.ssu_id.
    /// Aborts: E_ALREADY_REVOKED (5) if target_cap_id is already revoked.
    public entry fun revoke_ssu_super_admin_cap(
        ssu_gov: &mut SSUGovernance,
        target_cap_id: ID,
        owner_cap: &membership::SSUOwnerCap,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::cap_ssu_id(owner_cap) == ssu_governance::ssu_id(ssu_gov), ssu_governance::e_wrong_ssu());
        ssu_governance::add_to_revocation_table(ssu_gov, target_cap_id);
        event::emit(SSUSuperAdminRevokedEvent {
            ssu_id: ssu_governance::ssu_id(ssu_gov),
            revoked_cap_id: target_cap_id,
            revoker: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// GC entry fn. Consumes a revoked SSUSuperAdminCap by value and deletes its UID.
    /// Aborts: E_WRONG_SSU (1) if cap.ssu_id != ssu_gov.ssu_id.
    /// Aborts: E_NOT_REVOKED (6) if the cap's ID is not in the revocation table.
    public entry fun destroy_revoked_super_admin_cap(
        cap: membership::SSUSuperAdminCap,
        ssu_gov: &SSUGovernance,
    ) {
        assert!(
            membership::ssu_super_admin_cap_ssu_id(&cap) == ssu_governance::ssu_id(ssu_gov),
            ssu_governance::e_wrong_ssu(),
        );
        let cap_id = object::id(&cap);
        assert!(ssu_governance::is_cap_revoked(ssu_gov, cap_id), ssu_governance::e_not_revoked());
        membership::destroy_ssu_super_admin_cap(cap);
    }

    /// Validity check for an SSUSuperAdminCap against its SSUGovernance.
    /// Returns true iff the cap is scoped to this SSU AND its object ID is
    /// NOT in the governance's revocation table.
    public fun is_ssu_super_admin_cap_valid(
        cap: &membership::SSUSuperAdminCap,
        ssu_gov: &SSUGovernance,
    ): bool {
        membership::ssu_super_admin_cap_ssu_id(cap) == ssu_governance::ssu_id(ssu_gov)
            && !ssu_governance::is_cap_revoked(ssu_gov, object::id(cap))
    }

    // ===== Ban / Unban Entry Functions (R3.2) =====
    // NO assert_not_frozen: moderation operates during freeze (R3.5 design decision).
    // D-R3.2-01 (SA-R3-04): future-time assertion enforced inside set_ban_internal.

    /// Owner-issued ban. Per Bazar1::ssu_ban_as_owner (line 683).
    public entry fun ssu_ban_as_owner(
        cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        target: address,
        expires_at_ms: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_governance::set_ban_internal(gov, target, expires_at_ms, ctx.sender(), STAFF_KIND_OWNER, clock);
    }

    /// SuperAdmin-issued ban. Per Bazar1::ssu_ban_as_super_admin (line 694).
    /// FP1-25 validity check: revoked SuperAdminCap MUST NOT issue bans.
    public entry fun ssu_ban_as_super_admin(
        cap: &membership::SSUSuperAdminCap,
        gov: &mut SSUGovernance,
        target: address,
        expires_at_ms: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(is_ssu_super_admin_cap_valid(cap, gov), ssu_governance::e_wrong_ssu());
        ssu_governance::set_ban_internal(gov, target, expires_at_ms, ctx.sender(), STAFF_KIND_SUPER_ADMIN, clock);
    }

    /// Admin-issued ban. Per Bazar1::ssu_ban_as_admin (line 706).
    /// Aborts: E_WRONG_SSU if cap.ssu_id != gov.ssu_id.
    public entry fun ssu_ban_as_admin(
        cap: &membership::SSUAdminCap,
        gov: &mut SSUGovernance,
        target: address,
        expires_at_ms: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(membership::ssu_admin_cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_governance::set_ban_internal(gov, target, expires_at_ms, ctx.sender(), STAFF_KIND_ADMIN, clock);
    }

    /// Mod-issued ban. Per Bazar1::ssu_ban_as_mod (line 718).
    /// Aborts: E_WRONG_SSU if cap.ssu_id != gov.ssu_id.
    public entry fun ssu_ban_as_mod(
        cap: &membership::SSUModCap,
        gov: &mut SSUGovernance,
        target: address,
        expires_at_ms: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(membership::ssu_mod_cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_governance::set_ban_internal(gov, target, expires_at_ms, ctx.sender(), STAFF_KIND_MOD, clock);
    }

    /// Owner-lifted ban. Symmetric to ssu_ban_as_owner.
    public entry fun ssu_unban_as_owner(
        cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        target: address,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_governance::unban_internal(gov, target, ctx.sender(), STAFF_KIND_OWNER, clock);
    }

    /// SuperAdmin-lifted ban. FP1-25 validity check enforced.
    public entry fun ssu_unban_as_super_admin(
        cap: &membership::SSUSuperAdminCap,
        gov: &mut SSUGovernance,
        target: address,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(is_ssu_super_admin_cap_valid(cap, gov), ssu_governance::e_wrong_ssu());
        ssu_governance::unban_internal(gov, target, ctx.sender(), STAFF_KIND_SUPER_ADMIN, clock);
    }

    /// Admin-lifted ban.
    public entry fun ssu_unban_as_admin(
        cap: &membership::SSUAdminCap,
        gov: &mut SSUGovernance,
        target: address,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(membership::ssu_admin_cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_governance::unban_internal(gov, target, ctx.sender(), STAFF_KIND_ADMIN, clock);
    }

    /// Mod-lifted ban.
    public entry fun ssu_unban_as_mod(
        cap: &membership::SSUModCap,
        gov: &mut SSUGovernance,
        target: address,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(membership::ssu_mod_cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_governance::unban_internal(gov, target, ctx.sender(), STAFF_KIND_MOD, clock);
    }

    // ===== OS-35: Set Per-SSU Max Shops Override =====

    /// Owner-issued per-SSU max-shops override. Pass option::none() to clear.
    /// Aborts E_INVALID_MAX_SHOPS if Some(0) is passed (0-shop SSU makes no sense).
    public entry fun set_ssu_max_shops_as_owner(
        cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        max_shops: Option<u64>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        ssu_governance::assert_active(gov);   // R6.7.1 E_SSU_NOT_ACTIVE
        if (option::is_some(&max_shops)) {
            assert!(*option::borrow(&max_shops) > 0, E_INVALID_MAX_SHOPS);
        };
        ssu_governance::set_max_shops_override(gov, max_shops);
        event::emit(SSUMaxShopsSet {
            ssu_id: ssu_governance::ssu_id(gov),
            max_shops,
            set_by: ctx.sender(),
            staff_kind: STAFF_KIND_OWNER,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// SuperAdmin-issued per-SSU max-shops override.
    /// Checks revocation table: revoked cap MUST NOT mutate governance.
    public entry fun set_ssu_max_shops_as_super_admin(
        cap: &membership::SSUSuperAdminCap,
        gov: &mut SSUGovernance,
        max_shops: Option<u64>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(is_ssu_super_admin_cap_valid(cap, gov), ssu_governance::e_wrong_ssu());
        ssu_governance::assert_active(gov);   // R6.7.1 E_SSU_NOT_ACTIVE
        if (option::is_some(&max_shops)) {
            assert!(*option::borrow(&max_shops) > 0, E_INVALID_MAX_SHOPS);
        };
        ssu_governance::set_max_shops_override(gov, max_shops);
        event::emit(SSUMaxShopsSet {
            ssu_id: ssu_governance::ssu_id(gov),
            max_shops,
            set_by: ctx.sender(),
            staff_kind: STAFF_KIND_SUPER_ADMIN,
            timestamp_ms: clock.timestamp_ms(),
        });
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
