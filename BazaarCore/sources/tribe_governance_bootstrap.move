// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V17: extracted from tribe_governance.move so bazaar_economy can compose the
// inner half of the legacy `bootstrap_tribe_governance` into its new atomic
// `bootstrap_advanced_complete` entry. The split also brings tribe_governance.move
// back closer to the 500-LOC ceiling (Article XII.3).
//
// Two surfaces:
//   • bootstrap_tribe_governance_atomic — public fun, returns gov_addr; shares
//       both TribeGovernance + WidgetConfig internally. Cross-package callable.
//   • bootstrap_tribe_governance — public entry, **Easy-only** in V17.
//       Advanced tribes MUST use bazaar_economy::bootstrap_advanced_complete
//       which bundles governance + economy in a single atomic call.

module bazaar_core::tribe_governance_bootstrap {
    use sui::clock::Clock;
    use dapp_hub::tribe_registry::{Self, TribeRegistry, TribeLeaderCap};
    use bazaar_core::tribe_governance;
    use shared_widgets::widget_config;

    // Easy-only guard: emitted when the caller tries to bootstrap an Advanced
    // tribe through this entry. Advanced tribes route through
    // bazaar_economy::bootstrap_advanced_complete instead.
    const E_USE_ADVANCED_COMPLETE_FOR_ADVANCED: u64 = 1;

    /// V17: inner atomic bootstrap. Reads bazaar_type + governance_mode + leader
    /// from the TribeRegistry (via the leader_cap's tribe_id) — caller cannot
    /// spoof. Creates TribeGovernance + WidgetConfig, binds widget_config_id,
    /// shares both, and returns gov_addr. Does NOT validate bazaar_type — caller
    /// is responsible for the Easy / Advanced gate.
    /// Does NOT update the TribeRegistry — caller must invoke
    /// tribe_registry::set_tribe_gov_id with the returned gov_addr.
    public fun bootstrap_tribe_governance_atomic(
        registry: &TribeRegistry,
        leader_cap: &TribeLeaderCap,
        package_id: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): address {
        let tribe_id = tribe_registry::cap_tribe_id(leader_cap);
        let tribe = tribe_registry::tribe_by_id(registry, tribe_id);
        let bazaar_type = tribe_registry::tribe_bazaar_type(tribe);
        let governance_mode = tribe_registry::tribe_governance_mode(tribe);
        let leader = tribe_registry::tribe_leader(tribe);
        let mut gov = tribe_governance::create_tribe_governance(
            tribe_id, bazaar_type, leader, governance_mode, clock, ctx,
        );
        let gov_addr = object::id_address(&gov);
        // V6: package_id explicitly passed by caller (instead of @bazaar_core
        // literal which compiles to @0x0 at fresh-publish — see ssu_bootstrap.move
        // for full root-cause comment).
        let wconfig = widget_config::create_widget_config(gov_addr, package_id, ctx);
        let wconfig_id = object::id(&wconfig);
        tribe_governance::set_widget_config_id_internal(
            &mut gov, wconfig_id, ctx.sender(), clock.timestamp_ms(),
        );
        transfer::public_share_object(wconfig);
        tribe_governance::share(gov);
        gov_addr
    }

    /// V17: Easy-tribe-only public entry. Performs the Easy guard, calls
    /// `bootstrap_tribe_governance_atomic`, then writes the gov_id back into the
    /// TribeRegistry one-shot field.
    /// Aborts E_USE_ADVANCED_COMPLETE_FOR_ADVANCED on Advanced tribes.
    public entry fun bootstrap_tribe_governance(
        registry: &mut TribeRegistry,
        leader_cap: &TribeLeaderCap,
        package_id: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let tribe_id = tribe_registry::cap_tribe_id(leader_cap);
        let bazaar_type = {
            let tribe = tribe_registry::tribe_by_id(registry, tribe_id);
            tribe_registry::tribe_bazaar_type(tribe)
        };
        // Easy = 1 (per tribe_registry::BAZAAR_TYPE_EASY).
        assert!(bazaar_type == 1, E_USE_ADVANCED_COMPLETE_FOR_ADVANCED);
        let gov_addr = bootstrap_tribe_governance_atomic(
            registry, leader_cap, package_id, clock, ctx,
        );
        tribe_registry::set_tribe_gov_id(leader_cap, registry, tribe_id, gov_addr, clock, ctx);
    }

    // ===== Test-Only Error Accessors =====
    #[test_only]
    public fun e_use_advanced_complete_for_advanced(): u64 { E_USE_ADVANCED_COMPLETE_FOR_ADVANCED }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
