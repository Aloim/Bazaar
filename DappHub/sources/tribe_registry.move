// DappHub/sources/tribe_registry.move
// Master registry for all tribes. TribeLeaderCap gates tribe management operations.
// Cross-package accessors serve bazaar_core and bazaar_economy.
// Constitution: Article XII.3 — 500-line limit.
module dapp_hub::tribe_registry {
    use std::string::{Self, String};
    use std::option::{Self, Option};
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use EVE::EVE::EVE;
    use dapp_hub::tribe_token_validation;
    use dapp_hub::dapp_governance::{Self, GovernanceConfig};
    use dapp_hub::tax_wallet::{Self, DAppTaxWallet};

    // Bazaar type constants
    const BAZAAR_TYPE_EASY:     u8 = 1;
    const BAZAAR_TYPE_ADVANCED: u8 = 2;

    // Join policy constants
    const JOIN_POLICY_OPEN:        u8 = 0;
    const JOIN_POLICY_APPLICATION: u8 = 1;

    // Error codes
    const E_TRIBE_NOT_FOUND: u64    = 1;
    const E_TRIBE_INACTIVE: u64     = 3;
    const E_SSU_NOT_IN_TRIBE: u64   = 4;
    const E_INVALID_BAZAAR_TYPE: u64 = 5;
    const E_INVALID_JOIN_POLICY: u64 = 6;
    const E_SSU_ALREADY_IN_TRIBE: u64 = 7;
    const E_INVALID_GOVERNANCE_MODE: u64 = 8;
    // OS-28: one-shot setter error codes (CC-001, Decision #2, SA-R6.6-11, SA-R6.6-13)
    const E_NOT_TRIBE_LEADER: u64 = 9;  // explicit tribe_id param does not match cap.tribe_id
    const E_ALREADY_SET: u64 = 10;      // one-shot field already populated (Decision #2)
    // V17: token_name / token_symbol read on a tribe where the field is Option::none
    // (e.g., bootstrap_advanced_complete called on an Easy tribe — defense in depth;
    // assert_advanced_external should fire first, but this is a per-field backstop).
    const E_TOKEN_NOT_SET: u64 = 11;
    const E_INSUFFICIENT_FEE: u64 = 12;  // payment coin < configured creation fee

    // Tribe: stored by value in TribeRegistry.tribes table.
    public struct Tribe has store {
        id: u64,
        name: String,
        description: String,
        leader: address,
        bazaar_type: u8,
        join_policy: u8,
        is_active: bool,
        ssu_ids: Table<address, bool>,
        ssu_count: u64,
        member_count: u64,
        created_at: u64,
        // [ADDED AP2-F / FP1-28] Denormalized copy of TribeGovernance.governance_mode.
        // Authoritative source is BazaarCore::TribeGovernance.
        // mutation requires Article XV amendment.
        governance_mode: u8,
        // V17: token identity captured at create_advanced_tribe time. Option::none for
        // Easy tribes (which use EVE only). Single source of truth — read by
        // bazaar_economy::bootstrap_advanced_complete when initializing the TribeTokenLedger.
        // Immutable post-creation (no setter exposed).
        token_name: Option<String>,
        token_symbol: Option<String>,
        // OS-28: per-tribe shared object IDs (set once after bootstrap, Option::None at create)
        // one-shot: set_tribe_gov_id / set_tribe_economy_ids abort if already Some (Decision #2)
        tribe_gov_id: Option<address>,
        tribe_vault_id: Option<address>,
        tribe_token_ledger_id: Option<address>,
        exchange_config_id: Option<address>,
        // V15: withdrawal_board_id — populated by set_tribe_economy_ids so the FE can
        // resolve the WithdrawalBoard for Reserve Vault listings without scanning events.
        withdrawal_board_id: Option<address>,
        // V16: mint_burn_queue_id — populated by set_tribe_economy_ids so the FE can
        // resolve the MintBurnQueue for the TribeAssetsTab pending-request list.
        mint_burn_queue_id: Option<address>,
    }

    // TribeRegistry: single shared object, master list of all tribes.
    public struct TribeRegistry has key {
        id: UID,
        tribes: Table<u64, Tribe>,
        next_id: u64,
    }

    // TribeLeaderCap: non-fungible capability scoped to a specific tribe.
    public struct TribeLeaderCap has key, store {
        id: UID,
        tribe_id: u64,
    }

    // Events
    public struct TribeCreatedEvent has copy, drop {
        tribe_id: u64,
        name: String,
        leader: address,
        bazaar_type: u8,
        join_policy: u8,
        governance_mode: u8,
        timestamp_ms: u64,
    }
    public struct TribeDeactivatedEvent has copy, drop {
        tribe_id: u64,
        leader: address,
        timestamp_ms: u64,
    }
    public struct SsuAddedToTribeEvent has copy, drop {
        tribe_id: u64,
        ssu_id: address,
    }
    public struct SsuRemovedFromTribeEvent has copy, drop {
        tribe_id: u64,
        ssu_id: address,
    }
    public struct JoinPolicyChangedEvent has copy, drop {
        tribe_id: u64,
        old_policy: u8,
        new_policy: u8,
        changed_by: address,
    }

    // OS-28 events (CCC-02 forensic traceability; SA Condition 2 — real clock timestamps)
    public struct TribeGovernanceIdSetEvent has copy, drop {
        tribe_id: u64,
        gov_id: address,
        actor: address,
        timestamp_ms: u64,
    }
    public struct TribeEconomyIdsSetEvent has copy, drop {
        tribe_id: u64,
        vault_id: address,
        ledger_id: address,
        exchange_config_id: address,
        withdrawal_board_id: address,
        // V16: mint_burn_queue_id added (5th economy shared object)
        mint_burn_queue_id: address,
        actor: address,
        timestamp_ms: u64,
    }
    /// Emitted when BOTH gov_id and all 5 economy IDs are set on the same tribe.
    /// Signals that this tribe is fully bootstrapped for Advanced; Easy needs only gov_id.
    public struct TribeAssetsRegisteredEvent has copy, drop {
        tribe_id: u64,
        gov_id: address,
        vault_id: address,
        ledger_id: address,
        exchange_config_id: address,
        withdrawal_board_id: address,
        // V16: mint_burn_queue_id added (5th economy shared object)
        mint_burn_queue_id: address,
        actor: address,
        timestamp_ms: u64,
    }

    fun init(ctx: &mut TxContext) {
        let registry = TribeRegistry {
            id: object::new(ctx),
            tribes: table::new(ctx),
            next_id: 1,
        };
        transfer::share_object(registry);
    }

    fun create_tribe_internal(
        registry: &mut TribeRegistry,
        name: vector<u8>,
        description: vector<u8>,
        mut token_name_opt: Option<vector<u8>>,
        mut token_symbol_opt: Option<vector<u8>>,
        bazaar_type: u8,
        join_policy: u8,
        governance_mode: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeLeaderCap {
        assert!(
            bazaar_type == BAZAAR_TYPE_EASY || bazaar_type == BAZAAR_TYPE_ADVANCED,
            E_INVALID_BAZAAR_TYPE,
        );
        assert!(
            join_policy == JOIN_POLICY_OPEN || join_policy == JOIN_POLICY_APPLICATION,
            E_INVALID_JOIN_POLICY,
        );
        assert!(governance_mode == 0, E_INVALID_GOVERNANCE_MODE);
        let tribe_id = registry.next_id;
        let leader = tx_context::sender(ctx);
        let timestamp_ms = clock::timestamp_ms(clock);
        let tribe_name = string::utf8(name);
        let tribe_desc = string::utf8(description);
        let token_name = if (option::is_some(&token_name_opt)) {
            option::some(string::utf8(option::extract(&mut token_name_opt)))
        } else { option::none<String>() };
        let token_symbol = if (option::is_some(&token_symbol_opt)) {
            option::some(string::utf8(option::extract(&mut token_symbol_opt)))
        } else { option::none<String>() };
        let tribe = Tribe {
            id: tribe_id,
            name: tribe_name,
            description: tribe_desc,
            leader,
            bazaar_type,
            join_policy,
            is_active: true,
            ssu_ids: table::new(ctx),
            ssu_count: 0,
            member_count: 0,
            created_at: timestamp_ms,
            governance_mode,
            token_name,
            token_symbol,
            tribe_gov_id: option::none(),
            tribe_vault_id: option::none(),
            tribe_token_ledger_id: option::none(),
            exchange_config_id: option::none(),
            withdrawal_board_id: option::none(),
            mint_burn_queue_id: option::none(),
        };
        table::add(&mut registry.tribes, tribe_id, tribe);
        registry.next_id = tribe_id + 1;
        let tribe_name_for_event = string::utf8(name);
        event::emit(TribeCreatedEvent {
            tribe_id,
            name: tribe_name_for_event,
            leader,
            bazaar_type,
            join_policy,
            governance_mode,
            timestamp_ms,
        });
        TribeLeaderCap { id: object::new(ctx), tribe_id }
    }

    // Create an Easy bazaar tribe. Returns TribeLeaderCap to caller.
    // governance_mode: v1 only supports 0 (AUTHORITARIAN_CAPITALISTIC).
    // mutation requires Article XV amendment.
    public fun create_easy_tribe(
        registry: &mut TribeRegistry,
        config: &GovernanceConfig,
        wallet: &mut DAppTaxWallet,
        payment: Coin<EVE>,
        name: vector<u8>,
        description: vector<u8>,
        join_policy: u8,
        governance_mode: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeLeaderCap {
        let fee = dapp_governance::easy_tribe_creation_fee(config);
        assert!(coin::value(&payment) >= fee, E_INSUFFICIENT_FEE);
        tax_wallet::deposit_fee(wallet, payment, b"easy_tribe_creation", tx_context::sender(ctx), clock);
        create_tribe_internal(
            registry, name, description,
            option::none(), option::none(),
            BAZAAR_TYPE_EASY, join_policy, governance_mode, clock, ctx,
        )
    }

    // Create an Advanced bazaar tribe. Returns TribeLeaderCap to caller.
    // V17: token_name and token_symbol are now captured at creation time and
    // persisted on the Tribe row. bazaar_economy::bootstrap_advanced_complete
    // reads them from the registry — eliminates the duplicate FE form entry.
    // governance_mode: v1 only supports 0 (AUTHORITARIAN_CAPITALISTIC).
    // mutation requires Article XV amendment.
    public fun create_advanced_tribe(
        registry: &mut TribeRegistry,
        config: &GovernanceConfig,
        wallet: &mut DAppTaxWallet,
        payment: Coin<EVE>,
        name: vector<u8>,
        description: vector<u8>,
        token_name: vector<u8>,
        token_symbol: vector<u8>,
        join_policy: u8,
        governance_mode: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeLeaderCap {
        tribe_token_validation::assert_valid_token_name(&token_name);
        tribe_token_validation::assert_valid_token_symbol(&token_symbol);
        let fee = dapp_governance::advanced_tribe_creation_fee(config);
        assert!(coin::value(&payment) >= fee, E_INSUFFICIENT_FEE);
        tax_wallet::deposit_fee(wallet, payment, b"advanced_tribe_creation", tx_context::sender(ctx), clock);
        create_tribe_internal(
            registry, name, description,
            option::some(token_name), option::some(token_symbol),
            BAZAAR_TYPE_ADVANCED, join_policy, governance_mode, clock, ctx,
        )
    }

    // Deactivate a tribe. Only the tribe leader (via TribeLeaderCap) may call.
    public fun deactivate_tribe(
        cap: &TribeLeaderCap,
        registry: &mut TribeRegistry,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(table::contains(&registry.tribes, cap.tribe_id), E_TRIBE_NOT_FOUND);
        let tribe = table::borrow_mut(&mut registry.tribes, cap.tribe_id);
        tribe.is_active = false;
        event::emit(TribeDeactivatedEvent {
            tribe_id: cap.tribe_id,
            leader: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // Add an SSU address to this tribe's SSU list.
    public fun add_ssu_to_tribe(
        cap: &TribeLeaderCap,
        registry: &mut TribeRegistry,
        ssu_id: address,
    ) {
        assert!(table::contains(&registry.tribes, cap.tribe_id), E_TRIBE_NOT_FOUND);
        let tribe = table::borrow_mut(&mut registry.tribes, cap.tribe_id);
        assert!(tribe.is_active, E_TRIBE_INACTIVE);
        assert!(!table::contains(&tribe.ssu_ids, ssu_id), E_SSU_ALREADY_IN_TRIBE);
        table::add(&mut tribe.ssu_ids, ssu_id, true);
        tribe.ssu_count = tribe.ssu_count + 1;
        event::emit(SsuAddedToTribeEvent { tribe_id: cap.tribe_id, ssu_id });
    }

    // Remove an SSU address from this tribe's SSU list.
    public fun remove_ssu_from_tribe(
        cap: &TribeLeaderCap,
        registry: &mut TribeRegistry,
        ssu_id: address,
    ) {
        assert!(table::contains(&registry.tribes, cap.tribe_id), E_TRIBE_NOT_FOUND);
        let tribe = table::borrow_mut(&mut registry.tribes, cap.tribe_id);
        assert!(table::contains(&tribe.ssu_ids, ssu_id), E_SSU_NOT_IN_TRIBE);
        table::remove(&mut tribe.ssu_ids, ssu_id);
        tribe.ssu_count = tribe.ssu_count - 1;
        event::emit(SsuRemovedFromTribeEvent { tribe_id: cap.tribe_id, ssu_id });
    }

    // Force-remove an SSU from a tribe without requiring TribeLeaderCap.
    // Package-internal: only callable within dapp_hub. Callers must verify
    // SSU ownership before calling this function.
    // Returns true if an SSU was actually removed, false if tribe or SSU not found.
    // Decrements member_count inline when removing (fixes latent drift in cap-gated path).
    // Emits SsuRemovedFromTribeEvent only on actual removal.
    public(package) fun force_remove_ssu_from_tribe(
        registry: &mut TribeRegistry,
        tribe_id: u64,
        ssu_id: address,
    ): bool {
        if (!table::contains(&registry.tribes, tribe_id)) {
            return false
        };
        let tribe = table::borrow_mut(&mut registry.tribes, tribe_id);
        if (!table::contains(&tribe.ssu_ids, ssu_id)) {
            return false
        };
        table::remove(&mut tribe.ssu_ids, ssu_id);
        tribe.ssu_count = tribe.ssu_count - 1;
        if (tribe.member_count > 0) { tribe.member_count = tribe.member_count - 1; };
        event::emit(SsuRemovedFromTribeEvent { tribe_id, ssu_id });
        true
    }
    // Package-internal: open-path SSU add (registration_helpers::join_tribe_open only).
    // All preconditions (exists, active, policy open, dedup) MUST be checked by caller.
    public(package) fun add_ssu_to_tribe_open(
        registry: &mut TribeRegistry,
        tribe_id: u64,
        ssu_id: address,
    ) {
        let tribe = table::borrow_mut(&mut registry.tribes, tribe_id);
        table::add(&mut tribe.ssu_ids, ssu_id, true);
        tribe.ssu_count = tribe.ssu_count + 1;
        tribe.member_count = tribe.member_count + 1;
        event::emit(SsuAddedToTribeEvent { tribe_id, ssu_id });
    }
    // Package-internal: join-policy mutation (registration_helpers::set_join_policy_as_leader only).
    // Caller pre-validates policy range; this fn asserts tribe exists then mutates.
    public(package) fun set_join_policy_internal(
        cap: &TribeLeaderCap,
        registry: &mut TribeRegistry,
        new_policy: u8,
        ctx: &mut TxContext,
    ) {
        let tribe_id = cap.tribe_id;
        assert!(table::contains(&registry.tribes, tribe_id), E_TRIBE_NOT_FOUND);
        let tribe = table::borrow_mut(&mut registry.tribes, tribe_id);
        let old_policy = tribe.join_policy;
        tribe.join_policy = new_policy;
        event::emit(JoinPolicyChangedEvent {
            tribe_id,
            old_policy,
            new_policy,
            changed_by: tx_context::sender(ctx),
        });
    }
    // Check whether a tribe ID exists in the registry. Never aborts.
    // Package-internal: used by ssu_registry orchestrator for orphan-tribe check.
    public(package) fun tribe_exists(registry: &TribeRegistry, tribe_id: u64): bool {
        table::contains(&registry.tribes, tribe_id)
    }

    // Increment member count. Package-internal: called by registration.move.
    public(package) fun increment_member_count(registry: &mut TribeRegistry, tribe_id: u64) {
        assert!(table::contains(&registry.tribes, tribe_id), E_TRIBE_NOT_FOUND);
        let tribe = table::borrow_mut(&mut registry.tribes, tribe_id);
        tribe.member_count = tribe.member_count + 1;
    }

    // Decrement member count. Package-internal.
    public(package) fun decrement_member_count(registry: &mut TribeRegistry, tribe_id: u64) {
        assert!(table::contains(&registry.tribes, tribe_id), E_TRIBE_NOT_FOUND);
        let tribe = table::borrow_mut(&mut registry.tribes, tribe_id);
        if (tribe.member_count > 0) {
            tribe.member_count = tribe.member_count - 1;
        };
    }

    // Cross-package accessor: look up a tribe by ID.
    // Callers: bazaar_core::shop_ops, bazaar_economy::tribe_exchange
    // Aborts: E_TRIBE_NOT_FOUND (1)
    public fun tribe_by_id(registry: &TribeRegistry, id: u64): &Tribe {
        assert!(table::contains(&registry.tribes, id), E_TRIBE_NOT_FOUND);
        table::borrow(&registry.tribes, id)
    }

    // Cross-package accessor: total tribe count.
    public fun tribe_count(registry: &TribeRegistry): u64 {
        registry.next_id - 1
    }

    // Tribe field accessors — all public for cross-package use.
    public fun tribe_name(tribe: &Tribe): &String             { &tribe.name }
    public fun tribe_description(tribe: &Tribe): &String      { &tribe.description }
    public fun tribe_leader(tribe: &Tribe): address           { tribe.leader }
    public fun tribe_bazaar_type(tribe: &Tribe): u8           { tribe.bazaar_type }
    public fun tribe_join_policy(tribe: &Tribe): u8           { tribe.join_policy }

    // ===== OS-28: One-Shot Asset ID Setters =====
    // CC-001: explicit tribe_id param — cap.tribe_id == tribe_id BEFORE table lookup.
    // Decision #2: aborts E_ALREADY_SET if field is already Some. SA Condition 2: clock timestamps.
    public fun set_tribe_gov_id(
        cap: &TribeLeaderCap,
        registry: &mut TribeRegistry,
        tribe_id: u64,
        gov_id: address,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(cap.tribe_id == tribe_id, E_NOT_TRIBE_LEADER); // CC-001: BEFORE table lookup
        assert!(table::contains(&registry.tribes, tribe_id), E_TRIBE_NOT_FOUND);
        let tribe = table::borrow_mut(&mut registry.tribes, tribe_id);
        assert!(option::is_none(&tribe.tribe_gov_id), E_ALREADY_SET);
        tribe.tribe_gov_id = option::some(gov_id);
        event::emit(TribeGovernanceIdSetEvent {
            tribe_id,
            gov_id,
            actor: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Atomically set all five economy shared object IDs.
    /// Aborts E_ALREADY_SET if ANY field is already Some. Emits TribeAssetsRegisteredEvent
    /// if tribe_gov_id was also set (CCC-02 full-bootstrap signal).
    /// V15: withdrawal_board_id added so the FE can resolve the WithdrawalBoard
    /// for Reserve Vault listings without scanning events.
    /// V16: mint_burn_queue_id added so the FE can resolve the MintBurnQueue
    /// for the TribeAssetsTab pending-request list.
    public fun set_tribe_economy_ids(
        cap: &TribeLeaderCap,
        registry: &mut TribeRegistry,
        tribe_id: u64,
        vault_id: address,
        ledger_id: address,
        exchange_config_id_val: address,
        withdrawal_board_id_val: address,
        mint_burn_queue_id_val: address,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(cap.tribe_id == tribe_id, E_NOT_TRIBE_LEADER); // CC-001: BEFORE table lookup
        assert!(table::contains(&registry.tribes, tribe_id), E_TRIBE_NOT_FOUND);
        let tribe = table::borrow_mut(&mut registry.tribes, tribe_id);
        // One-shot: abort if ANY of the 5 fields already set (Decision #2)
        assert!(option::is_none(&tribe.tribe_vault_id), E_ALREADY_SET);
        assert!(option::is_none(&tribe.tribe_token_ledger_id), E_ALREADY_SET);
        assert!(option::is_none(&tribe.exchange_config_id), E_ALREADY_SET);
        assert!(option::is_none(&tribe.withdrawal_board_id), E_ALREADY_SET);
        assert!(option::is_none(&tribe.mint_burn_queue_id), E_ALREADY_SET);
        tribe.tribe_vault_id = option::some(vault_id);
        tribe.tribe_token_ledger_id = option::some(ledger_id);
        tribe.exchange_config_id = option::some(exchange_config_id_val);
        tribe.withdrawal_board_id = option::some(withdrawal_board_id_val);
        tribe.mint_burn_queue_id = option::some(mint_burn_queue_id_val);
        let actor = tx_context::sender(ctx);
        let ts = clock::timestamp_ms(clock);
        event::emit(TribeEconomyIdsSetEvent {
            tribe_id,
            vault_id,
            ledger_id,
            exchange_config_id: exchange_config_id_val,
            withdrawal_board_id: withdrawal_board_id_val,
            mint_burn_queue_id: mint_burn_queue_id_val,
            actor,
            timestamp_ms: ts,
        });
        // If gov_id is already set, emit the "fully bootstrapped" event (CCC-02)
        if (option::is_some(&tribe.tribe_gov_id)) {
            let gov_id = *option::borrow(&tribe.tribe_gov_id);
            event::emit(TribeAssetsRegisteredEvent {
                tribe_id,
                gov_id,
                vault_id,
                ledger_id,
                exchange_config_id: exchange_config_id_val,
                withdrawal_board_id: withdrawal_board_id_val,
                mint_burn_queue_id: mint_burn_queue_id_val,
                actor,
                timestamp_ms: ts,
            });
        };
    }

    // ===== OS-28: New Accessors =====
    // Option<address> — None until bootstrap sets the shared object ID.
    public fun tribe_gov_id(tribe: &Tribe): Option<address> { tribe.tribe_gov_id }
    public fun tribe_vault_id(tribe: &Tribe): Option<address> { tribe.tribe_vault_id }
    public fun tribe_token_ledger_id(tribe: &Tribe): Option<address> { tribe.tribe_token_ledger_id }
    public fun tribe_exchange_config_id(tribe: &Tribe): Option<address> { tribe.exchange_config_id }
    public fun tribe_withdrawal_board_id(tribe: &Tribe): Option<address> { tribe.withdrawal_board_id }
    public fun tribe_mint_burn_queue_id(tribe: &Tribe): Option<address> { tribe.mint_burn_queue_id }

    public fun tribe_is_active(tribe: &Tribe): bool           { tribe.is_active }
    public fun tribe_ssu_count(tribe: &Tribe): u64 { tribe.ssu_count }
    public fun tribe_has_ssu(tribe: &Tribe, ssu_id: address): bool {
        table::contains(&tribe.ssu_ids, ssu_id)
    }
    public fun tribe_member_count(tribe: &Tribe): u64         { tribe.member_count }
    public fun tribe_created_at(tribe: &Tribe): u64           { tribe.created_at }
    public fun tribe_id_val(tribe: &Tribe): u64               { tribe.id }

    // V17: token-identity accessors. Option<String> — None for Easy tribes,
    // Some for Advanced tribes that went through create_advanced_tribe.
    public fun tribe_token_name(tribe: &Tribe): &Option<String>   { &tribe.token_name }
    public fun tribe_token_symbol(tribe: &Tribe): &Option<String> { &tribe.token_symbol }

    /// V17: Unchecked accessor used by bazaar_economy::bootstrap_advanced_complete.
    /// Aborts E_TOKEN_NOT_SET if the tribe lacks token identity (Easy tribe path).
    public fun tribe_token_name_unchecked(tribe: &Tribe): &String {
        assert!(option::is_some(&tribe.token_name), E_TOKEN_NOT_SET);
        option::borrow(&tribe.token_name)
    }
    public fun tribe_token_symbol_unchecked(tribe: &Tribe): &String {
        assert!(option::is_some(&tribe.token_symbol), E_TOKEN_NOT_SET);
        option::borrow(&tribe.token_symbol)
    }

    // TribeLeaderCap accessor.
    public fun cap_tribe_id(cap: &TribeLeaderCap): u64 { cap.tribe_id }

    /// Returns the governance mode stored on this Tribe row.
    /// Denormalized from TribeGovernance; authoritative source is BazaarCore.
    public fun tribe_governance_mode(tribe: &Tribe): u8 { tribe.governance_mode }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(ctx: &mut TxContext): TribeRegistry {
        TribeRegistry {
            id: object::new(ctx),
            tribes: table::new(ctx),
            next_id: 1,
        }
    }

    #[test_only]
    public fun create_leader_cap_for_testing(tribe_id: u64, ctx: &mut TxContext): TribeLeaderCap {
        TribeLeaderCap {
            id: object::new(ctx),
            tribe_id,
        }
    }

    /// V17: token Option args added. Pass option::none() for Easy tribes; pass
    /// option::some(b"NAME") / option::some(b"SYM") for Advanced tribes that
    /// need the token identity populated.
    #[test_only]
    public fun create_tribe_for_testing(
        registry: &mut TribeRegistry,
        name: vector<u8>,
        description: vector<u8>,
        token_name_opt: Option<vector<u8>>,
        token_symbol_opt: Option<vector<u8>>,
        bazaar_type: u8,
        join_policy: u8,
        governance_mode: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeLeaderCap {
        create_tribe_internal(
            registry, name, description,
            token_name_opt, token_symbol_opt,
            bazaar_type, join_policy, governance_mode, clock, ctx,
        )
    }

    #[test_only]
    public fun destroy_leader_cap_for_testing(cap: TribeLeaderCap) {
        let TribeLeaderCap { id, tribe_id: _ } = cap;
        object::delete(id);
    }
    // OS-28 test-only error accessors
    #[test_only] public fun e_not_tribe_leader(): u64 { E_NOT_TRIBE_LEADER }
    #[test_only] public fun e_already_set(): u64 { E_ALREADY_SET }
    #[test_only] public fun share_for_testing(self: TribeRegistry) { sui::transfer::share_object(self); }
}
