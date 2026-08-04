// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// DappHub/sources/registration_helpers.move
// Join-policy writers and permissionless open-join path for DappHub tribe membership.
// Relocated from tribe_registry.move (R6.7.4-PRE) to preserve Article XIV.4 file-guard.
// OS-48 Path B (R6.7.4): join_tribe_open (reader gate per Decision 1 v3) +
//   set_join_policy_as_leader (renamed writer per sub-decision 2 LOCKED).
// Constitution: Article XII.3 — 500-line limit.
module dapp_hub::registration_helpers {
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::object::{Self};
    use sui::coin::{Self, Coin};
    use EVE::EVE::EVE;
    use world::access::{Self, OwnerCap};
    use world::storage_unit::StorageUnit;
    use dapp_hub::tribe_registry::{
        Self,
        TribeRegistry,
        TribeLeaderCap,
    };
    use dapp_hub::ssu_registry::{Self, SSURegistry};
    use dapp_hub::dapp_governance::{Self, GovernanceConfig};
    use dapp_hub::tax_wallet::{Self, DAppTaxWallet};

    // ===== Constants =====

    const JOIN_POLICY_OPEN:        u8 = 0;
    const JOIN_POLICY_APPLICATION: u8 = 1;

    // ===== Error Codes =====

    // Mirror tribe_registry error codes for consistent abort values.
    const E_TRIBE_NOT_FOUND:       u64 = 1;
    const E_TRIBE_INACTIVE:        u64 = 3;
    const E_SSU_ALREADY_IN_TRIBE:  u64 = 7;
    const E_INVALID_JOIN_POLICY:   u64 = 6;
    // NEW for OS-48 Path B (§2.5 v3-final locked identifier):
    const E_APPLICATION_REQUIRED:  u64 = 11;
    // B4.1: SSU ownership proof mismatch — OwnerCap does not authorize ssu_id.
    const E_NOT_SSU_FRONTIER_OWNER: u64 = 12;
    // B4.3: payment < configured tribe_join_fee.
    const E_INSUFFICIENT_FEE: u64       = 13;

    // ===== Events =====

    // Audit event for the permissionless open-join path (forensic traceability).
    // Supplements SsuAddedToTribeEvent emitted by add_ssu_to_tribe_open.
    public struct JoinedTribeOpenEvent has copy, drop {
        tribe_id:     u64,
        ssu_id:       address,
        joiner:       address,
        timestamp_ms: u64,
    }

    // ===== Error Code Accessors =====
    // Public accessors for new error codes — for FE abort-code lookup and tests.
    public fun e_not_ssu_frontier_owner(): u64 { E_NOT_SSU_FRONTIER_OWNER }
    public fun e_insufficient_fee(): u64 { E_INSUFFICIENT_FEE }

    // ===== Entry Functions =====

    // OS-48 Path B — READER GATE (permissionless open-join).
    // BREAKING CHANGE (V36 fresh publish): now charges the configured tribe_join_fee.
    // Requires ownership proof (OwnerCap<StorageUnit>) — closes AUD-DH-10 for this path.
    // Pass a zero coin when fee == 0. Aborts E_INSUFFICIENT_FEE (13) if underpaid.
    // Aborts E_NOT_SSU_FRONTIER_OWNER (12) if owner_cap does not authorise ssu_id.
    //
    // Asserts (in order):
    //   1. is_authorized(owner_cap, ssu_id)        → E_NOT_SSU_FRONTIER_OWNER (12)
    //   2. payment >= tribe_join_fee                → E_INSUFFICIENT_FEE (13)
    //   3. tribe exists                            → E_TRIBE_NOT_FOUND (1)
    //   4. tribe.is_active                         → E_TRIBE_INACTIVE (3)
    //   5. tribe.join_policy == JOIN_POLICY_OPEN   → E_APPLICATION_REQUIRED (11)
    //   6. ssu_id not already in tribe.ssu_ids     → E_SSU_ALREADY_IN_TRIBE (7)
    //
    // Effects:
    //   - vector::push_back tribe.ssu_ids (via add_ssu_to_tribe_open package helper)
    //   - tribe.member_count += 1
    //   - emit SsuAddedToTribeEvent (from add_ssu_to_tribe_open)
    //   - emit JoinedTribeOpenEvent (this fn, for open-path audit trail)
    //   - deposit fee to DAppTaxWallet (zero-safe)
    public entry fun join_tribe_open(
        registry:  &mut TribeRegistry,
        config:    &GovernanceConfig,
        wallet:    &mut DAppTaxWallet,
        payment:   Coin<EVE>,
        owner_cap: &OwnerCap<StorageUnit>,
        tribe_id:  u64,
        ssu_id:    address,
        clock:     &Clock,
        ctx:       &mut TxContext,
    ) {
        assert!(
            access::is_authorized(owner_cap, object::id_from_address(ssu_id)),
            E_NOT_SSU_FRONTIER_OWNER,
        );
        let fee = dapp_governance::tribe_join_fee(config);
        assert!(coin::value(&payment) >= fee, E_INSUFFICIENT_FEE);
        {
            let tribe = tribe_registry::tribe_by_id(registry, tribe_id);
            assert!(tribe_registry::tribe_is_active(tribe), E_TRIBE_INACTIVE);
            assert!(
                tribe_registry::tribe_join_policy(tribe) == JOIN_POLICY_OPEN,
                E_APPLICATION_REQUIRED,
            );
            assert!(
                !tribe_registry::tribe_has_ssu(tribe, ssu_id),
                E_SSU_ALREADY_IN_TRIBE,
            );
        };
        tribe_registry::add_ssu_to_tribe_open(registry, tribe_id, ssu_id);
        tax_wallet::deposit_fee(wallet, payment, b"tribe_join", tx_context::sender(ctx), clock);
        event::emit(JoinedTribeOpenEvent {
            tribe_id,
            ssu_id,
            joiner: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ----------------------------------------------------------------
    // OPEN-TRIBE DIRECT REGISTRATION (atomic register + tribe-join).
    // ----------------------------------------------------------------
    // BREAKING CHANGE (V36 fresh publish): requires ownership proof + tribe_join_fee.
    // Aborts E_NOT_SSU_FRONTIER_OWNER (12) if owner_cap does not authorise ssu_id.
    // Aborts E_INSUFFICIENT_FEE (13) if payment < tribe_join_fee.
    //
    // The bazaar_type for SSURegistry is derived from the tribe itself
    // (NOT caller-supplied) — this prevents type-mismatch attacks.
    //
    // Asserts (in order):
    //   1. is_authorized(owner_cap, ssu_id)        → E_NOT_SSU_FRONTIER_OWNER (12)
    //   2. payment >= tribe_join_fee                → E_INSUFFICIENT_FEE (13)
    //   3. tribe exists                            → E_TRIBE_NOT_FOUND (1)
    //   4. tribe.is_active                         → E_TRIBE_INACTIVE (3)
    //   5. tribe.join_policy == JOIN_POLICY_OPEN   → E_APPLICATION_REQUIRED (11)
    //   6. ssu_id not already in tribe.ssu_ids     → E_SSU_ALREADY_IN_TRIBE (7)
    //   7. ssu_id not already in SSURegistry       → E_SSU_ALREADY_REGISTERED (2)
    public entry fun register_and_join_open_tribe(
        ssu_registry:   &mut SSURegistry,
        tribe_registry: &mut TribeRegistry,
        config:         &GovernanceConfig,
        wallet:         &mut DAppTaxWallet,
        payment:        Coin<EVE>,
        owner_cap:      &OwnerCap<StorageUnit>,
        tribe_id:       u64,
        ssu_id:         address,
        clock:          &Clock,
        ctx:            &mut TxContext,
    ) {
        assert!(
            access::is_authorized(owner_cap, object::id_from_address(ssu_id)),
            E_NOT_SSU_FRONTIER_OWNER,
        );
        let fee = dapp_governance::tribe_join_fee(config);
        assert!(coin::value(&payment) >= fee, E_INSUFFICIENT_FEE);
        let bazaar_type;
        {
            let tribe = tribe_registry::tribe_by_id(tribe_registry, tribe_id);
            assert!(tribe_registry::tribe_is_active(tribe), E_TRIBE_INACTIVE);
            assert!(
                tribe_registry::tribe_join_policy(tribe) == JOIN_POLICY_OPEN,
                E_APPLICATION_REQUIRED,
            );
            assert!(
                !tribe_registry::tribe_has_ssu(tribe, ssu_id),
                E_SSU_ALREADY_IN_TRIBE,
            );
            bazaar_type = tribe_registry::tribe_bazaar_type(tribe);
        };
        let owner = tx_context::sender(ctx);
        ssu_registry::register_ssu_with_tribe(
            ssu_registry, ssu_id, bazaar_type, tribe_id, owner, clock, ctx,
        );
        tribe_registry::add_ssu_to_tribe_open(tribe_registry, tribe_id, ssu_id);
        tax_wallet::deposit_fee(wallet, payment, b"tribe_join", owner, clock);
        event::emit(JoinedTribeOpenEvent {
            tribe_id,
            ssu_id,
            joiner: owner,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // OS-48 Path B — WRITER RENAME.
    // PURE RENAME of set_join_policy → set_join_policy_as_leader.
    // NO alias; NO backward-compatible shim. Gate 1 = A (R7.1 fresh publish) absorbs the change.
    // Matches FE builder buildSetJoinPolicyAsLeader target fn name.
    //
    // Asserts:
    //   E_INVALID_JOIN_POLICY (6) — new_policy not 0 or 1
    //   E_TRIBE_NOT_FOUND     (1) — tribe_id (from cap) not in registry
    public entry fun set_join_policy_as_leader(
        cap: &TribeLeaderCap,
        registry: &mut TribeRegistry,
        new_policy: u8,
        ctx: &mut TxContext,
    ) {
        assert!(
            new_policy == JOIN_POLICY_OPEN || new_policy == JOIN_POLICY_APPLICATION,
            E_INVALID_JOIN_POLICY,
        );
        // Delegate mutation to package helper (struct field access private to tribe_registry).
        tribe_registry::set_join_policy_internal(cap, registry, new_policy, ctx);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
