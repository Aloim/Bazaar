// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::membership {
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use dapp_hub::role_types;
    use dapp_hub::tribe_registry::TribeLeaderCap;
    use bazaar_core::tribe_governance::{Self, TribeGovernance, TribeAdminCap};
    use bazaar_core::bazaar_assertions;

    // --- Error Codes ---
    const E_INSUFFICIENT_ROLE: u64 = 1;
    const E_PLAYER_BANNED:      u64 = 2;
    const E_ALREADY_REGISTERED: u64 = 3;
    const E_PLAYER_NOT_FOUND:   u64 = 4;
    const E_INVALID_ROLE:       u64 = 5;
    const E_WRONG_SSU:          u64 = 6;
    const E_WRONG_TRIBE:        u64 = 7;
    const E_TRIBE_ID_MISMATCH:  u64 = 8;  // R5.2 tribe-id coherence mismatch

    // --- Shared Object ---
    public struct MemberRegistry has key, store {
        id: UID,
        ssu_id: address,
        tribe_id: u64,
        members: Table<address, MemberEntry>,
        member_count: u64,
    }

    // --- Member Entry ---
    public struct MemberEntry has store, copy, drop {
        player: address,
        ssu_role: u8,
        tribe_role: u8,
        is_banned: bool,
        registered_at_ms: u64,
    }

    // --- Capabilities ---
    public struct SSUOwnerCap has key, store {
        id: UID,
        ssu_id: address,
        tribe_id: u64,
    }

    public struct SSUAdminCap has key, store {
        id: UID,
        ssu_id: address,
    }

    public struct SSUModCap has key, store {
        id: UID,
        ssu_id: address,
    }

    /// SSU-level SuperAdmin capability. Constitution Article XII.2 tier between Admin and Owner.
    /// Issued by SSUOwnerCap holder via ssu_governance::issue_ssu_super_admin_cap.
    /// Revocable by SSUOwnerCap holder via ssu_governance::revoke_ssu_super_admin_cap
    /// (consumes the cap by value — struct carries no `drop` ability).
    public struct SSUSuperAdminCap has key, store {
        id: UID,
        ssu_id: address,
    }

    // --- Events ---
    public struct MarketRoleSet has copy, drop {
        ssu_id: address,
        player: address,
        ssu_role: u8,
        tribe_role: u8,
    }

    public struct PlayerBanned has copy, drop {
        ssu_id: address,
        player: address,
        banned: bool,
    }

    public struct StrangerRegistered has copy, drop {
        ssu_id: address,
        player: address,
    }

    /// Local event for tribe member removal. Emitted by remove_tribe_member (relocated from
    /// tribe_governance.move to break E02004 cycle). Fields identical to the original.
    public struct TribeMemberRemovedEvent has copy, drop {
        tribe_id: u64,
        player: address,
        removed_by: address,
        timestamp_ms: u64,
    }

    // --- Package-level factory functions ---

    public(package) fun create_member_registry(
        ssu_id: address,
        tribe_id: u64,
        ctx: &mut TxContext,
    ): MemberRegistry {
        MemberRegistry {
            id: object::new(ctx),
            ssu_id,
            tribe_id,
            members: table::new(ctx),
            member_count: 0,
        }
    }

    public(package) fun create_ssu_owner_cap(
        ssu_id: address,
        tribe_id: u64,
        ctx: &mut TxContext,
    ): SSUOwnerCap {
        SSUOwnerCap { id: object::new(ctx), ssu_id, tribe_id }
    }

    public(package) fun create_ssu_admin_cap(
        ssu_id: address,
        ctx: &mut TxContext,
    ): SSUAdminCap {
        SSUAdminCap { id: object::new(ctx), ssu_id }
    }

    public(package) fun create_ssu_mod_cap(
        ssu_id: address,
        ctx: &mut TxContext,
    ): SSUModCap {
        SSUModCap { id: object::new(ctx), ssu_id }
    }

    /// Creates an SSUSuperAdminCap scoped to `ssu_id`.
    /// Called exclusively by ssu_governance::issue_ssu_super_admin_cap.
    public(package) fun create_ssu_super_admin_cap(
        ssu_id: address,
        ctx: &mut TxContext,
    ): SSUSuperAdminCap {
        SSUSuperAdminCap { id: object::new(ctx), ssu_id }
    }

    /// Destroys an SSUSuperAdminCap by consuming it by value and deleting the UID.
    /// Called exclusively by ssu_governance::revoke_ssu_super_admin_cap.
    /// SSUSuperAdminCap has no `drop` ability — destruction must live in this module.
    public(package) fun destroy_ssu_super_admin_cap(cap: SSUSuperAdminCap) {
        let SSUSuperAdminCap { id, ssu_id: _ } = cap;
        object::delete(id);
    }

    // --- Public Entry Functions ---

    // OS-16: register_stranger REMOVED from membership.move.
    // Freeze-guarded replacement lives in stranger_registration::register_stranger.
    // Internal body extracted below as insert_stranger_entry (public(package)).

    /// Insert a new Stranger entry for the calling sender.
    /// SECURITY: only ssu_guarded_ops may call this. (SA-R6.6-07; V35 W2 hardening)
    ///
    /// Article I.4: declared public(package) so no module outside bazaar_core can invoke it.
    /// The sole legitimate caller is bazaar_core::ssu_guarded_ops::register_stranger_guarded,
    /// which applies freeze-guard, active-gate and cross-SSU identity check before
    /// delegating here (bazaar_mission::stranger_registration::register_stranger is the
    /// PTB-facing surface and delegates to that guarded callee).
    ///
    /// Aborts:
    ///   - E_ALREADY_REGISTERED (3) if sender is already in registry.members.
    public(package) fun insert_stranger_entry(
        registry: &mut MemberRegistry,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let player = tx_context::sender(ctx);
        assert!(!table::contains(&registry.members, player), E_ALREADY_REGISTERED);
        let entry = MemberEntry {
            player,
            ssu_role: role_types::role_stranger(),
            tribe_role: role_types::role_stranger(),
            is_banned: false,
            registered_at_ms: clock::timestamp_ms(clock),
        };
        table::add(&mut registry.members, player, entry);
        registry.member_count = registry.member_count + 1;
        event::emit(StrangerRegistered { ssu_id: registry.ssu_id, player });
    }

    /// Seed the SSU owner into the MemberRegistry with `ssu_role = ROLE_OWNER (7)`
    /// at bootstrap time. The SSUOwnerCap holder IS the SSU owner; without this
    /// seed the owner's effective_role is Stranger (0) in their own registry,
    /// which locks them out of every registry-gated flow (notably
    /// `quicktrade_vault::basket_deposit`, which requires Member-or-above and has
    /// no owner-cap bypass). `tribe_role` is left at Stranger (0): SSU ownership is
    /// SSU-scoped and does not confer a tribe role — tribe roles are granted
    /// separately via the TribeLeaderCap path (`set_tribe_role`).
    ///
    /// public(package): the sole legitimate caller is
    /// `bazaar_core::ssu_bootstrap::bootstrap_ssu_objects`, immediately after it
    /// creates the registry. Idempotent — no-ops if the owner is already present.
    public(package) fun seed_owner_entry(
        registry: &mut MemberRegistry,
        owner: address,
        clock: &Clock,
    ) {
        if (table::contains(&registry.members, owner)) { return };
        let ssu_role = role_types::role_owner();
        let tribe_role = role_types::role_stranger();
        table::add(&mut registry.members, owner, MemberEntry {
            player: owner,
            ssu_role,
            tribe_role,
            is_banned: false,
            registered_at_ms: clock::timestamp_ms(clock),
        });
        registry.member_count = registry.member_count + 1;
        event::emit(MarketRoleSet {
            ssu_id: registry.ssu_id, player: owner, ssu_role, tribe_role,
        });
    }

    public fun set_ssu_role(
        cap: &SSUOwnerCap,
        registry: &mut MemberRegistry,
        player: address,
        role: u8,
        _ctx: &mut TxContext,
    ) {
        assert!(cap.ssu_id == registry.ssu_id, E_WRONG_SSU);
        assert!(role >= 1 && role <= 7, E_INVALID_ROLE);
        assert!(table::contains(&registry.members, player), E_PLAYER_NOT_FOUND);
        let entry = table::borrow_mut(&mut registry.members, player);
        entry.ssu_role = role;
        event::emit(MarketRoleSet {
            ssu_id: registry.ssu_id, player,
            ssu_role: entry.ssu_role, tribe_role: entry.tribe_role,
        });
    }

    /// Registry-role-gated SSU role assignment (V30).
    ///
    /// Unlike `set_ssu_role` (which requires the single `SSUOwnerCap`), authority
    /// here is the CALLER's OWN `ssu_role` recorded in this registry. This is the
    /// sole mechanism by which non-Owner staff (SuperAdmin/Admin registry roles)
    /// manage other users — SSU Admin/Mod cap OBJECTS are never minted, so the
    /// registry role is the only real SSU role mechanism.
    ///
    /// Hierarchy rules (enforced on-chain):
    ///   1. caller must be Admin (5) or above                         → E_INSUFFICIENT_ROLE
    ///   2. `new_role` must be <= SuperAdmin (6); Owner (7) is conferred
    ///      ONLY by holding the SSUOwnerCap, never via the registry      → E_INVALID_ROLE
    ///   3. `new_role` must be <= caller's role (cannot grant above self) → E_INSUFFICIENT_ROLE
    ///   4. target's CURRENT role must be <= caller's role (cannot modify
    ///      a peer's superior — e.g. an Admin cannot touch a SuperAdmin
    ///      or the Owner)                                                → E_INSUFFICIENT_ROLE
    ///
    /// Net effect: Owner & SuperAdmin manage SuperAdmin-and-below; Admin manages
    /// Admin/Moderator-and-below; nobody can act on the Owner. Target must already
    /// be registered (E_PLAYER_NOT_FOUND) — same precondition as `set_ssu_role`.
    /// Only `ssu_role` is changed; `tribe_role` is preserved.
    public fun set_ssu_role_gated(
        registry: &mut MemberRegistry,
        player: address,
        new_role: u8,
        ctx: &mut TxContext,
    ) {
        let actor = tx_context::sender(ctx);
        let actor_role = ssu_role_of(registry, actor);
        assert!(actor_role >= role_types::role_admin(), E_INSUFFICIENT_ROLE);     // rule 1
        assert!(new_role <= role_types::role_super_admin(), E_INVALID_ROLE);      // rule 2
        assert!(new_role <= actor_role, E_INSUFFICIENT_ROLE);                     // rule 3
        assert!(table::contains(&registry.members, player), E_PLAYER_NOT_FOUND);
        let target_role = ssu_role_of(registry, player);
        assert!(target_role <= actor_role, E_INSUFFICIENT_ROLE);                  // rule 4
        let entry = table::borrow_mut(&mut registry.members, player);
        entry.ssu_role = new_role;
        event::emit(MarketRoleSet {
            ssu_id: registry.ssu_id, player,
            ssu_role: entry.ssu_role, tribe_role: entry.tribe_role,
        });
    }

    public fun set_tribe_role(
        leader_cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        registry: &mut MemberRegistry,
        player: address,
        role: u8,
        _ctx: &mut TxContext,
    ) {
        // R5.2 — bazaar-type gate (Easy or Advanced); intra-BazaarCore form (CC-02)
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(tribe_gov));
        // R5.2 — tribe-id coherence; new error code per SA-06
        assert!(dapp_hub::tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        let cap_tribe = dapp_hub::tribe_registry::cap_tribe_id(leader_cap);
        assert!(cap_tribe == registry.tribe_id, E_WRONG_TRIBE);
        assert!(role >= 1 && role <= 7, E_INVALID_ROLE);
        assert!(table::contains(&registry.members, player), E_PLAYER_NOT_FOUND);
        let entry = table::borrow_mut(&mut registry.members, player);
        entry.tribe_role = role;
        event::emit(MarketRoleSet {
            ssu_id: registry.ssu_id, player,
            ssu_role: entry.ssu_role, tribe_role: entry.tribe_role,
        });
    }

    /// Reset a player's tribe role to STRANGER (0).
    /// public(package): callable only from within bazaar_core (e.g. tribe_governance).
    /// Does not emit an event — the caller (remove_tribe_member) emits its own event.
    /// Aborts: E_PLAYER_NOT_FOUND if player is not in this registry.
    public(package) fun reset_tribe_role(
        registry: &mut MemberRegistry,
        player: address,
    ) {
        assert!(table::contains(&registry.members, player), E_PLAYER_NOT_FOUND);
        let entry = table::borrow_mut(&mut registry.members, player);
        entry.tribe_role = 0;
    }

    /// Removes a player from tribe membership by resetting their tribe_role to STRANGER (0).
    /// Authorization: requires TribeAdminCap scoped to the same tribe as `gov` and `registry`.
    /// Emits TribeMemberRemovedEvent. Aborts E_PLAYER_NOT_FOUND if player not registered.
    /// Relocated from tribe_governance.move (cycle fix — R5.2.b.2).
    public fun remove_tribe_member(
        cap: &TribeAdminCap,
        gov: &TribeGovernance,
        registry: &mut MemberRegistry,
        player: address,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov)); // R5.2.b.1
        assert!(tribe_governance::tribe_admin_cap_tribe_id(cap) == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        assert!(registry.tribe_id == tribe_governance::tribe_id(gov), E_WRONG_TRIBE);
        reset_tribe_role(registry, player);
        event::emit(TribeMemberRemovedEvent {
            tribe_id: tribe_governance::tribe_id(gov),
            player,
            removed_by: ctx.sender(),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    public fun set_ban(
        cap: &SSUOwnerCap,
        registry: &mut MemberRegistry,
        player: address,
        banned: bool,
    ) {
        assert!(cap.ssu_id == registry.ssu_id, E_WRONG_SSU);
        assert!(table::contains(&registry.members, player), E_PLAYER_NOT_FOUND);
        let entry = table::borrow_mut(&mut registry.members, player);
        entry.is_banned = banned;
        event::emit(PlayerBanned { ssu_id: registry.ssu_id, player, banned });
    }

    // --- Update Ceremony V2 Phase 2 (Slice 3): roster restore upserts ---
    // Re-materialize a member's recorded state on a freshly-bootstrapped MemberRegistry
    // after a fresh publish. Authority is split to preserve the live model exactly:
    //   - restore_member_entry      (SSUOwnerCap-gated): ssu_role + is_banned.
    //   - restore_tribe_member_entry (TribeLeaderCap-gated): tribe_role.
    // Neither lets the SSU owner mint tribe authority (tribe_role stays leader-gated),
    // and tribe-wide power is conferred by cap OBJECTS, not by these registry fields.

    /// Upsert a member's SSU-scoped state (ssu_role + is_banned) during SSU reclaim.
    /// Same authority as set_ssu_role (SSUOwnerCap scoped to this registry) but INSERTS
    /// the entry if absent — the only delta vs set_ssu_role, which requires the player to
    /// already exist. Does NOT touch tribe_role (leader-gated; see restore_tribe_member_entry).
    /// Accepts ssu_role 0..=7 so a Stranger (0) row restores faithfully.
    /// Aborts E_WRONG_SSU if the cap does not match this registry's SSU.
    public fun restore_member_entry(
        cap: &SSUOwnerCap,
        registry: &mut MemberRegistry,
        player: address,
        ssu_role: u8,
        is_banned: bool,
        clock: &Clock,
    ) {
        assert!(cap.ssu_id == registry.ssu_id, E_WRONG_SSU);
        assert!(ssu_role <= role_types::role_owner(), E_INVALID_ROLE);
        if (table::contains(&registry.members, player)) {
            let entry = table::borrow_mut(&mut registry.members, player);
            entry.ssu_role = ssu_role;
            entry.is_banned = is_banned;
        } else {
            table::add(&mut registry.members, player, MemberEntry {
                player,
                ssu_role,
                tribe_role: role_types::role_stranger(),
                is_banned,
                registered_at_ms: clock::timestamp_ms(clock),
            });
            registry.member_count = registry.member_count + 1;
        };
        event::emit(MarketRoleSet {
            ssu_id: registry.ssu_id, player,
            ssu_role,
            tribe_role: table::borrow(&registry.members, player).tribe_role,
        });
    }

    /// Upsert a member's tribe_role during reclaim. Same authority + coherence checks as
    /// set_tribe_role (TribeLeaderCap + Easy/Advanced + tribe-id match) but INSERTS the
    /// entry if absent (set_tribe_role requires prior registration). Accepts tribe_role
    /// 0..=7. The tribe leader runs this per-SSU to re-grant tribe roles after the SSUs
    /// reclaim (the per-SSU MemberRegistry is the only place tribe_role lives — there is
    /// no tribe-wide member object). Does NOT touch ssu_role / is_banned.
    public fun restore_tribe_member_entry(
        leader_cap: &TribeLeaderCap,
        tribe_gov: &TribeGovernance,
        registry: &mut MemberRegistry,
        player: address,
        tribe_role: u8,
        clock: &Clock,
    ) {
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(tribe_gov));
        let cap_tribe = dapp_hub::tribe_registry::cap_tribe_id(leader_cap);
        assert!(cap_tribe == tribe_governance::tribe_id(tribe_gov), E_TRIBE_ID_MISMATCH);
        assert!(cap_tribe == registry.tribe_id, E_WRONG_TRIBE);
        assert!(tribe_role <= role_types::role_owner(), E_INVALID_ROLE);
        if (table::contains(&registry.members, player)) {
            table::borrow_mut(&mut registry.members, player).tribe_role = tribe_role;
        } else {
            table::add(&mut registry.members, player, MemberEntry {
                player,
                ssu_role: role_types::role_stranger(),
                tribe_role,
                is_banned: false,
                registered_at_ms: clock::timestamp_ms(clock),
            });
            registry.member_count = registry.member_count + 1;
        };
        let entry = table::borrow(&registry.members, player);
        event::emit(MarketRoleSet {
            ssu_id: registry.ssu_id, player,
            ssu_role: entry.ssu_role, tribe_role,
        });
    }

    // --- Read Functions ---

    public fun effective_role(registry: &MemberRegistry, player: address): u8 {
        if (!table::contains(&registry.members, player)) {
            return role_types::role_stranger()
        };
        let entry = table::borrow(&registry.members, player);
        if (entry.ssu_role > entry.tribe_role) { entry.ssu_role }
        else { entry.tribe_role }
    }

    /// Session 3B: per-domain role accessors for the per-role tax tables.
    /// SSU tax table is indexed by ssu_role; tribe tax table by tribe_role.
    /// Independent lookups — no max() coupling at the tax surface.
    /// Returns 0 (Stranger) if player is not registered.
    public fun ssu_role_of(registry: &MemberRegistry, player: address): u8 {
        if (!table::contains(&registry.members, player)) {
            return role_types::role_stranger()
        };
        let entry = table::borrow(&registry.members, player);
        entry.ssu_role
    }

    public fun tribe_role_of(registry: &MemberRegistry, player: address): u8 {
        if (!table::contains(&registry.members, player)) {
            return role_types::role_stranger()
        };
        let entry = table::borrow(&registry.members, player);
        entry.tribe_role
    }

    public fun assert_min_role(registry: &MemberRegistry, player: address, min_role: u8) {
        assert!(effective_role(registry, player) >= min_role, E_INSUFFICIENT_ROLE);
    }

    public fun is_banned(registry: &MemberRegistry, player: address): bool {
        if (!table::contains(&registry.members, player)) return false;
        table::borrow(&registry.members, player).is_banned
    }

    /// GAS-04: Combined accessor — returns (ssu_role, tribe_role, is_banned) in ONE
    /// table::contains + table::borrow of the player's MemberEntry.
    ///
    /// Absent-entry default: (role_stranger(), role_stranger(), false) — byte-identical
    /// to calling ssu_role_of + tribe_role_of + is_banned separately on an absent player.
    ///
    /// SCOPE: covers ONLY the MemberRegistry static is_banned flag.
    /// The SSU timed ban (ssu_governance::is_banned) and tribe global ban
    /// (tribe_governance::tribe_is_globally_banned) are clock-aware, read different
    /// objects, and MUST remain as separate checks at every call site.
    public fun roles_of(registry: &MemberRegistry, player: address): (u8, u8, bool) {
        if (!table::contains(&registry.members, player)) {
            return (role_types::role_stranger(), role_types::role_stranger(), false)
        };
        let e = table::borrow(&registry.members, player);
        (e.ssu_role, e.tribe_role, e.is_banned)
    }

    public fun member_count(registry: &MemberRegistry): u64 { registry.member_count }

    public fun is_registered(registry: &MemberRegistry, player: address): bool {
        table::contains(&registry.members, player)
    }

    public fun ssu_id(registry: &MemberRegistry): address { registry.ssu_id }
    public fun tribe_id(registry: &MemberRegistry): u64 { registry.tribe_id }

    /// SSU re-registration rebind: retarget the registry's tribe binding. Bare
    /// setter by design — guards live in bazaar_core::ssu_rebind (sole caller).
    /// NOTE: existing member entries (and their roles) persist across the rebind;
    /// the SSU owner curates the roster after switching tribes.
    public(package) fun set_registry_tribe_id(registry: &mut MemberRegistry, new_tribe_id: u64) {
        registry.tribe_id = new_tribe_id;
    }

    public fun is_member(registry: &MemberRegistry, player: address): bool {
        effective_role(registry, player) >= role_types::role_member()
    }

    public fun is_moderator_or_above(registry: &MemberRegistry, player: address): bool {
        effective_role(registry, player) >= role_types::role_moderator()
    }

    // --- Cap Accessors ---
    public fun cap_ssu_id(cap: &SSUOwnerCap): address { cap.ssu_id }
    public fun cap_tribe_id_of_owner(cap: &SSUOwnerCap): u64 { cap.tribe_id }
    public fun ssu_super_admin_cap_ssu_id(cap: &SSUSuperAdminCap): address { cap.ssu_id }
    // R3.2: ssu_id accessors for Admin and Mod caps (needed by ssu_governance_caps ban fns)
    public fun ssu_admin_cap_ssu_id(cap: &SSUAdminCap): address { cap.ssu_id }
    public fun ssu_mod_cap_ssu_id(cap: &SSUModCap): address { cap.ssu_id }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_member_registry_for_testing(ssu_id: address, tribe_id: u64, ctx: &mut TxContext): MemberRegistry {
        create_member_registry(ssu_id, tribe_id, ctx)
    }

    /// Destroys a MemberRegistry in test cleanup. MemberRegistry has no `drop` ability —
    /// UID must be deleted and the inner Table explicitly dropped (mirrors ssu_governance pattern).
    #[test_only]
    public fun destroy_member_registry_for_testing(registry: MemberRegistry) {
        let MemberRegistry { id, ssu_id: _, tribe_id: _, members, member_count: _ } = registry;
        object::delete(id);
        table::drop(members);
    }

    // R6.6.1: test-only ssu_id alias for wtb_escrow_pool_security_tests and
    // stranger_registration_tests (belt-and-suspenders; public ssu_id at line 292 is also usable).
    #[test_only]
    public fun member_registry_ssu_id(r: &MemberRegistry): address { r.ssu_id }

    #[test_only]
    public fun create_ssu_owner_cap_for_testing(ssu_id: address, tribe_id: u64, ctx: &mut TxContext): SSUOwnerCap {
        create_ssu_owner_cap(ssu_id, tribe_id, ctx)
    }

    #[test_only]
    public fun create_ssu_super_admin_cap_for_testing(
        ssu_id: address,
        ctx: &mut TxContext,
    ): SSUSuperAdminCap {
        create_ssu_super_admin_cap(ssu_id, ctx)
    }

    /// R3.5: Test cleanup for SSUSuperAdminCap (no `drop` ability — must be explicitly destroyed).
    #[test_only]
    public fun destroy_ssu_super_admin_cap_for_testing(cap: SSUSuperAdminCap) {
        destroy_ssu_super_admin_cap(cap);
    }

    /// CC-010 remediation — AP2-C / FP1-28.
    /// Unpacks and deletes an SSUOwnerCap for test cleanup.
    #[test_only]
    public fun destroy_ssu_owner_cap_for_testing(cap: SSUOwnerCap) {
        let SSUOwnerCap { id, ssu_id: _, tribe_id: _ } = cap;
        object::delete(id);
    }

    /// CC-B1-01: Test-only upsert ban state. Inserts a bare member entry if the player is not
    /// registered (production set_ban requires prior registration). Publish-stripped (test-only).
    #[test_only]
    public fun set_ban_for_testing(
        registry: &mut MemberRegistry,
        player: address,
        banned: bool,
    ) {
        if (!table::contains(&registry.members, player)) {
            table::add(&mut registry.members, player, MemberEntry {
                player,
                ssu_role: 0,  // Stranger
                tribe_role: 0,
                is_banned: banned,
                registered_at_ms: 0,
            });
            registry.member_count = registry.member_count + 1;
        } else {
            table::borrow_mut(&mut registry.members, player).is_banned = banned;
        };
    }

    /// Phase 8 B2+B3 (CC2-B23 / test_b3_ban_integration): test-only helper that
    /// registers `player` AND sets the ban in one call. Used by the integration
    /// suite where a member must exist-and-be-banned before driving a production
    /// entry. Publish-stripped (test-only). Lives here (bazaar_core) because
    /// MemberRegistry/MemberEntry are bazaar_core types.
    #[test_only]
    public fun register_and_ban_for_testing(
        registry: &mut MemberRegistry,
        player: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let _ = ctx;
        let now = clock::timestamp_ms(clock);
        if (!table::contains(&registry.members, player)) {
            table::add(&mut registry.members, player, MemberEntry {
                player,
                ssu_role: 0,  // Stranger
                tribe_role: 0,
                is_banned: true,
                registered_at_ms: now,
            });
            registry.member_count = registry.member_count + 1;
        } else {
            table::borrow_mut(&mut registry.members, player).is_banned = true;
        };
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
