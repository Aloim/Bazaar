// DappHub/sources/ssu_registry.move
// Master registry of all registered SSUs across all bazaar types.
// SSU registration is the prerequisite before any bazaar can be opened.
// Constitution: Article XII.3 — 500-line limit. Current: ~248 lines.
module dapp_hub::ssu_registry {
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use sui::object::{Self};
    use sui::coin::{Self, Coin};
    use sui::dynamic_field as df;
    use EVE::EVE::EVE;
    use world::access::{Self, OwnerCap};
    use world::storage_unit::StorageUnit;
    use dapp_hub::tribe_registry::{Self, TribeRegistry};
    use dapp_hub::dapp_governance::{Self, GovernanceConfig, DAppOwnerCap};
    use dapp_hub::tax_wallet::{Self, DAppTaxWallet};

    // Error codes
    const E_SSU_NOT_REGISTERED: u64     = 1;
    const E_SSU_ALREADY_REGISTERED: u64 = 2;
    const E_NOT_SSU_OWNER: u64          = 3;
    // Reserved — not aborted under the graceful-skip orphan-tribe policy.
    const E_TRIBE_REGISTRY_MISMATCH: u64 = 4;
    const E_ALREADY_BOOTSTRAPPED: u64   = 5;
    const E_INSUFFICIENT_FEE: u64       = 6;  // payment coin < configured fee
    // B4.1: SSU ownership proof mismatch — OwnerCap does not authorize the given ssu_id.
    const E_NOT_SSU_FRONTIER_OWNER: u64 = 7;

    // SSURegistration: stored by value in SSURegistry.registrations table.
    public struct SSURegistration has store, drop {
        ssu_id: address,
        owner: address,
        tribe_id: u64,      // 0 for NoTribe
        bazaar_type: u8,    // 0=NoTribe, 1=Easy, 2=Advanced
        registered_at: u64,
        is_active: bool,
    }

    // SSURegistry: single shared object listing all registered SSUs.
    public struct SSURegistry has key {
        id: UID,
        registrations: Table<address, SSURegistration>,
        ssu_count: u64,
    }

    // Dynamic-field key used to mark a per-SSU bootstrap completion.
    // Stored as a DF on SSURegistry.id — one entry per bootstrapped ssu_id.
    public struct BootstrappedKey has copy, drop, store {
        ssu_id: address,
    }

    // Events
    public struct SSURegisteredEvent has copy, drop {
        ssu_id: address,
        owner: address,
        bazaar_type: u8,
        tribe_id: u64,
        timestamp_ms: u64,
    }
    public struct SSUDeregisteredEvent has copy, drop {
        ssu_id: address,
        owner: address,
        timestamp_ms: u64,
    }

    // Emitted when an SSU's recorded tribe_id points to a tribe no longer
    // present in TribeRegistry. SSU removal proceeds (graceful-skip policy).
    public struct OrphanTribeSkippedEvent has copy, drop {
        ssu_id: address,
        tribe_id: u64,
        timestamp_ms: u64,
    }

    fun init(ctx: &mut TxContext) {
        let registry = SSURegistry {
            id: object::new(ctx),
            registrations: table::new(ctx),
            ssu_count: 0,
        };
        transfer::share_object(registry);
    }

    // Register an SSU with NoTribe bazaar type (bazaar_type=0, tribe_id=0).
    // Caller must supply the world-layer OwnerCap<StorageUnit> that authorises the
    // given ssu_id — this is the Frontier-native ownership credential. The cap is
    // borrowed by reference so it stays in the wallet and the FE passes it from
    // the account's owned objects. Charges the configured SSU registration fee.
    // Aborts: E_NOT_SSU_FRONTIER_OWNER (7) if cap does not authorise ssu_id.
    //         E_INSUFFICIENT_FEE (6) if payment < fee.
    //         E_SSU_ALREADY_REGISTERED (2) if ssu_id is already registered.
    public fun register_ssu_notribe(
        registry: &mut SSURegistry,
        config: &GovernanceConfig,
        wallet: &mut DAppTaxWallet,
        payment: Coin<EVE>,
        owner_cap: &OwnerCap<StorageUnit>,
        ssu_id: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            access::is_authorized(owner_cap, object::id_from_address(ssu_id)),
            E_NOT_SSU_FRONTIER_OWNER,
        );
        let fee = dapp_governance::ssu_registration_fee(config);
        assert!(coin::value(&payment) >= fee, E_INSUFFICIENT_FEE);
        register_ssu_internal(registry, ssu_id, 0, 0, clock, ctx);
        tax_wallet::deposit_fee(wallet, payment, b"ssu_registration", tx_context::sender(ctx), clock);
    }

    // Update Ceremony V2 Phase 2 (Slice 3): register an SSU for reclaim on the new
    // packages after a fresh publish orphaned the old registration. Mirrors
    // register_ssu_notribe's Frontier-ownership proof + squat guard, but (a) charges
    // NO fee, (b) writes the REMAPPED new_tribe_id + the snapshot bazaar_type, and
    // (c) sets owner = ctx.sender() via register_ssu_internal. The load-bearing gate is
    // the world-native OwnerCap<StorageUnit> proof — only the real Frontier SSU owner
    // can reclaim; E_SSU_ALREADY_REGISTERED defeats a URL-squat. Called ONLY by
    // bazaar_mission::reclaim_ssu, after it consumes the caller's SSU reclaim record
    // and resolves the tribe remap (the record-consumption is belt-and-suspenders;
    // this Frontier proof is the primary authorization — design C5 / §7 row 4).
    // Aborts: E_NOT_SSU_FRONTIER_OWNER (7) if cap does not authorise ssu_id.
    //         E_SSU_ALREADY_REGISTERED (2) if ssu_id is already registered (squat).
    public fun register_for_reclaim(
        registry: &mut SSURegistry,
        owner_cap: &OwnerCap<StorageUnit>,
        ssu_id: address,
        bazaar_type: u8,
        new_tribe_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            access::is_authorized(owner_cap, object::id_from_address(ssu_id)),
            E_NOT_SSU_FRONTIER_OWNER,
        );
        register_ssu_internal(registry, ssu_id, bazaar_type, new_tribe_id, clock, ctx);
    }

    // Register an SSU with tribe association (called by registration module after acceptance).
    // Package-internal: only callable from within dapp_hub package.
    // owner: the applicant's address (captured by registration::accept_application
    //        from app.applicant — NOT the leader who signs the TX).
    public(package) fun register_ssu_with_tribe(
        registry: &mut SSURegistry,
        ssu_id: address,
        bazaar_type: u8,
        tribe_id: u64,
        owner: address,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        register_ssu_internal_with_owner(registry, ssu_id, bazaar_type, tribe_id, owner, clock);
    }

    // Original internal path — used by NoTribe registration where sender IS the owner.
    fun register_ssu_internal(
        registry: &mut SSURegistry,
        ssu_id: address,
        bazaar_type: u8,
        tribe_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!table::contains(&registry.registrations, ssu_id), E_SSU_ALREADY_REGISTERED);
        let owner = tx_context::sender(ctx);
        let timestamp_ms = clock::timestamp_ms(clock);
        let reg = SSURegistration {
            ssu_id,
            owner,
            tribe_id,
            bazaar_type,
            registered_at: timestamp_ms,
            is_active: true,
        };
        table::add(&mut registry.registrations, ssu_id, reg);
        registry.ssu_count = registry.ssu_count + 1;
        event::emit(SSURegisteredEvent { ssu_id, owner, bazaar_type, tribe_id, timestamp_ms });
    }

    // Tribe registration path — owner is explicitly provided (not derived from ctx.sender).
    // Used when the tribe leader accepts an application: the applicant is the SSU owner,
    // not the leader signing the TX.
    // No ctx parameter: this function does not need ctx.sender or any ctx operation.
    fun register_ssu_internal_with_owner(
        registry: &mut SSURegistry,
        ssu_id: address,
        bazaar_type: u8,
        tribe_id: u64,
        owner: address,
        clock: &Clock,
    ) {
        assert!(!table::contains(&registry.registrations, ssu_id), E_SSU_ALREADY_REGISTERED);
        let timestamp_ms = clock::timestamp_ms(clock);
        let reg = SSURegistration {
            ssu_id,
            owner,
            tribe_id,
            bazaar_type,
            registered_at: timestamp_ms,
            is_active: true,
        };
        table::add(&mut registry.registrations, ssu_id, reg);
        registry.ssu_count = registry.ssu_count + 1;
        event::emit(SSURegisteredEvent { ssu_id, owner, bazaar_type, tribe_id, timestamp_ms });
    }

    // DEPRECATED for tribe-affiliated SSUs: use deregister_ssu_with_tribe_cleanup
    // instead to avoid stale entries in Tribe.ssu_ids. Retained for binary
    // compatibility. Safe to call for SSUs with tribe_id == 0.
    // Aborts: E_SSU_NOT_REGISTERED (1), E_NOT_SSU_OWNER (3)
    public fun deregister_ssu(
        registry: &mut SSURegistry,
        ssu_id: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.registrations, ssu_id), E_SSU_NOT_REGISTERED);
        let reg = table::borrow(&registry.registrations, ssu_id);
        assert!(reg.owner == tx_context::sender(ctx), E_NOT_SSU_OWNER);
        let owner = reg.owner;
        table::remove(&mut registry.registrations, ssu_id);
        if (registry.ssu_count > 0) { registry.ssu_count = registry.ssu_count - 1; };
        event::emit(SSUDeregisteredEvent {
            ssu_id,
            owner,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // Deregister an SSU and atomically clean up tribe membership if applicable.
    // Preferred over deregister_ssu for tribe-affiliated SSUs. Works for both
    // tribe-affiliated (tribe_id != 0) and non-tribe (tribe_id == 0) SSUs.
    // Orphan-tribe policy: if tribe_id != 0 but tribe is missing from registry,
    // emits OrphanTribeSkippedEvent and proceeds — SSU owner's right to exit is preserved.
    // Aborts: E_SSU_NOT_REGISTERED (1), E_NOT_SSU_OWNER (3)
    public entry fun deregister_ssu_with_tribe_cleanup(
        ssu_registry: &mut SSURegistry,
        tribe_registry: &mut TribeRegistry,
        ssu_id: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&ssu_registry.registrations, ssu_id), E_SSU_NOT_REGISTERED);
        let reg = table::borrow(&ssu_registry.registrations, ssu_id);
        assert!(reg.owner == tx_context::sender(ctx), E_NOT_SSU_OWNER);
        let tribe_id = reg.tribe_id;
        let owner = reg.owner;
        let timestamp_ms = clock::timestamp_ms(clock);
        if (tribe_id != 0) {
            if (tribe_registry::tribe_exists(tribe_registry, tribe_id)) {
                tribe_registry::force_remove_ssu_from_tribe(tribe_registry, tribe_id, ssu_id);
            } else {
                event::emit(OrphanTribeSkippedEvent { ssu_id, tribe_id, timestamp_ms });
            };
        };
        table::remove(&mut ssu_registry.registrations, ssu_id);
        if (ssu_registry.ssu_count > 0) { ssu_registry.ssu_count = ssu_registry.ssu_count - 1; };
        event::emit(SSUDeregisteredEvent { ssu_id, owner, timestamp_ms });
    }

    // Cross-package accessor: check if SSU is registered. Never aborts.
    public fun is_registered(registry: &SSURegistry, ssu_id: address): bool {
        table::contains(&registry.registrations, ssu_id)
    }

    // Cross-package accessor: check if an SSU has been bootstrapped.
    // Returns true iff mark_bootstrapped has been called for this ssu_id.
    // Never aborts.
    public fun is_bootstrapped(registry: &SSURegistry, ssu_id: address): bool {
        df::exists_(&registry.id, BootstrappedKey { ssu_id })
    }

    // Cross-package writer: mark an SSU as bootstrapped.
    // Called by bazaar_core::ssu_bootstrap after all per-SSU objects are created.
    // public fun (not public(package)) — required for cross-package call from bazaar_core.
    // Security: dual assert ensures only registered, not-yet-bootstrapped SSUs can be marked.
    // Griefing analysis: a caller pre-marking a registered SSU blocks their own bootstrap
    // only — Guard 2 in bootstrap_ssu_objects (owner must match) prevents third-party abuse.
    // Aborts: E_SSU_NOT_REGISTERED (1) if ssu_id not in registry.
    //         E_ALREADY_BOOTSTRAPPED (5) if already marked.
    public fun mark_bootstrapped(registry: &mut SSURegistry, ssu_id: address) {
        assert!(table::contains(&registry.registrations, ssu_id), E_SSU_NOT_REGISTERED);
        assert!(!df::exists_(&registry.id, BootstrappedKey { ssu_id }), E_ALREADY_BOOTSTRAPPED);
        df::add(&mut registry.id, BootstrappedKey { ssu_id }, true);
    }

    // Cross-package accessor: get SSU registration details.
    // Aborts: E_SSU_NOT_REGISTERED (1)
    public fun registration(registry: &SSURegistry, ssu_id: address): &SSURegistration {
        assert!(table::contains(&registry.registrations, ssu_id), E_SSU_NOT_REGISTERED);
        table::borrow(&registry.registrations, ssu_id)
    }

    // SSURegistration field accessors — public for cross-package use.
    public fun ssu_bazaar_type(reg: &SSURegistration): u8   { reg.bazaar_type }
    public fun ssu_tribe_id(reg: &SSURegistration): u64     { reg.tribe_id }
    public fun ssu_owner(reg: &SSURegistration): address    { reg.owner }
    public fun ssu_registered_at(reg: &SSURegistration): u64 { reg.registered_at }
    public fun ssu_is_active(reg: &SSURegistration): bool   { reg.is_active }

    // Total registered SSU count.
    public fun ssu_count(registry: &SSURegistry): u64 { registry.ssu_count }

    // Public accessor for E_NOT_SSU_FRONTIER_OWNER — for FE abort-code lookup and tests.
    public fun e_not_ssu_frontier_owner(): u64 { E_NOT_SSU_FRONTIER_OWNER }

    // DAppOwnerCap-gated force-deregister for healing squatted SSU registrations.
    // Does NOT remove BootstrappedKey (idempotency anchor by design — invariant §3).
    // Does NOT do TribeRegistry cleanup (squatted NoTribe entries have no tribe membership).
    // Mirrors deregister_ssu semantics: removes SSURegistration row, decrements ssu_count,
    // emits SSUDeregisteredEvent.
    // Aborts: E_SSU_NOT_REGISTERED (1) if ssu_id is not registered.
    public entry fun force_deregister_ssu(
        _cap: &DAppOwnerCap,
        registry: &mut SSURegistry,
        ssu_id: address,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.registrations, ssu_id), E_SSU_NOT_REGISTERED);
        let reg = table::remove(&mut registry.registrations, ssu_id);
        let owner = reg.owner;
        if (registry.ssu_count > 0) { registry.ssu_count = registry.ssu_count - 1; };
        event::emit(SSUDeregisteredEvent {
            ssu_id,
            owner,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(ctx: &mut TxContext): SSURegistry {
        SSURegistry {
            id: object::new(ctx),
            registrations: table::new(ctx),
            ssu_count: 0,
        }
    }

    #[test_only]
    public fun share_for_testing(self: SSURegistry) {
        sui::transfer::share_object(self);
    }
}
// END OF FILE — dapp_hub::ssu_registry
