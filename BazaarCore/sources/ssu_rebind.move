// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// SSU re-registration rebind (deregister → re-register healing).
///
/// Problem: `dapp_hub::ssu_registry::deregister_ssu*` removes only the
/// SSURegistration row. The per-SSU shared objects (SSUGovernance,
/// MemberRegistry, …) and the BootstrappedKey idempotency anchor persist by
/// design, so a re-registered SSU cannot re-run `bootstrap_ssu_objects`
/// (E_ALREADY_BOOTSTRAPPED) and its existing governance still carries the
/// OLD bazaar_type / tribe_id.
///
/// `rebind_ssu_governance` syncs the existing per-SSU governance to the
/// CURRENT registration. It is deliberately PERMISSIONLESS: every value it
/// writes comes from the SSURegistry row (created only via the permissioned
/// registration paths), so any caller can only heal state, never steer it.
/// The leader-signed accept_application PTB therefore composes with it too.
///
/// Guards:
///   1. ssu_id must be registered                      → E_SSU_NOT_REGISTERED (1)
///   2. members registry must belong to gov's SSU      → E_MEMBER_REGISTRY_MISMATCH (2)
///   3. registration owner must equal gov.owner        → E_OWNER_CHANGED (3)
///      (ownership transfer needs a full ceremony — old SSUOwnerCaps cannot
///       be revoked here; refuse the silent mixed-authority state.)
///   4. no-op when binding already matches (idempotent)
///   5. SSU must not be frozen                          → ssu_governance::E_SSU_FROZEN
///   6. zero ACTIVE shops on the SSU                    → E_ACTIVE_SHOPS_PRESENT (4)
///      (shops carry the old economic context — owner closes them first;
///       the Market & Missions "My Stalls" tab provides per-row Close.)
///
/// NOTE: member entries + their roles persist across the rebind (the owner
/// curates the roster); the dormant SSUOwnerCap.tribe_id field keeps its
/// mint-time value — no on-chain reader consumes it (membership.move:415).
///
/// KNOWN LIMITATION (security audit SA-REBIND-01, MEDIUM): Guard 6 covers
/// BazarRegistry shops only — mission stalls live in bazaar_mission's
/// MissionRegistry, which this package cannot reference (Article I.3 dep
/// direction core ← mission). A tribe-changing rebind with a mission mid-run
/// would strand its escrow/collateral behind the tribe-match assert in
/// mission settlement. Enforcement today is FE-side (rebind-helpers
/// planRebootstrap blocks on active missions); an on-chain backstop needs a
/// move-architect design (V36 candidate — owner-gated and self-inflicted
/// only, no third-party exploit path).
module bazaar_core::ssu_rebind {
    use sui::event;
    use sui::clock::Clock;
    use dapp_hub::ssu_registry::{Self, SSURegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::membership::{Self, MemberRegistry};
    use bazaar_core::bazar::{Self, BazarRegistry};

    const E_SSU_NOT_REGISTERED: u64        = 1;
    const E_MEMBER_REGISTRY_MISMATCH: u64  = 2;
    const E_OWNER_CHANGED: u64             = 3;
    const E_ACTIVE_SHOPS_PRESENT: u64      = 4;

    /// Emitted on every effective rebind (no-op syncs emit nothing).
    public struct SSURebound has copy, drop {
        ssu_id: address,
        old_bazaar_type: u8,
        old_tribe_id: u64,
        new_bazaar_type: u8,
        new_tribe_id: u64,
        actor: address,
        timestamp_ms: u64,
    }

    /// Sync a bootstrapped SSU's governance + member registry to its CURRENT
    /// SSURegistration. Compose in the same PTB directly after the
    /// re-registration call (register_ssu_notribe / register_and_join_open_tribe /
    /// accept_application) in place of the bootstrap_ssu_objects step.
    public entry fun rebind_ssu_governance(
        ssu_registry: &SSURegistry,
        bazar_registry: &BazarRegistry,
        gov: &mut SSUGovernance,
        members: &mut MemberRegistry,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let ssu_id = ssu_governance::ssu_id(gov);
        // Guard 1: a current registration must exist.
        assert!(ssu_registry::is_registered(ssu_registry, ssu_id), E_SSU_NOT_REGISTERED);
        let reg = ssu_registry::registration(ssu_registry, ssu_id);
        // Guard 2: the member registry passed in must be this SSU's.
        assert!(membership::ssu_id(members) == ssu_id, E_MEMBER_REGISTRY_MISMATCH);
        // Guard 3: registration owner must match governance owner.
        assert!(ssu_registry::ssu_owner(reg) == ssu_governance::ssu_owner(gov), E_OWNER_CHANGED);

        let new_bazaar_type = ssu_registry::ssu_bazaar_type(reg);
        let new_tribe_id    = ssu_registry::ssu_tribe_id(reg);
        let old_bazaar_type = ssu_governance::ssu_bazaar_type(gov);
        let old_tribe_id    = ssu_governance::ssu_tribe_id(gov);

        // Guard 4: idempotent no-op when the binding already matches.
        if (old_bazaar_type == new_bazaar_type && old_tribe_id == new_tribe_id) return;

        // Guard 5: moderation freeze blocks rebinding.
        ssu_governance::assert_not_frozen(gov);
        // Guard 6: active shops carry the old economic context — close them first.
        assert!(vector::is_empty(&bazar::ssu_shop_ids(bazar_registry, ssu_id)), E_ACTIVE_SHOPS_PRESENT);

        ssu_governance::set_binding(gov, new_bazaar_type, new_tribe_id);
        membership::set_registry_tribe_id(members, new_tribe_id);

        event::emit(SSURebound {
            ssu_id,
            old_bazaar_type,
            old_tribe_id,
            new_bazaar_type,
            new_tribe_id,
            actor: tx_context::sender(ctx),
            timestamp_ms: clock.timestamp_ms(),
        });
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
