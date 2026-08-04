// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazaar_mission::ssu_rebind_mission_guard — on-chain backstop for the
/// deregister → rebind flow (SA-REBIND-01 / AUD-DH-08).
///
/// bazaar_core::ssu_rebind::rebind_ssu_governance (Guard 6) checks for active
/// BazarRegistry shops. It cannot see MissionRegistry (Article I.3 dep direction:
/// core <- mission). A tribe-changing rebind while mission stalls are live strands
/// their EVE + collateral behind the E_WRONG_TRIBE assert in settlement.
///
/// This module provides a single entry fn that the FE rebind PTB must call BEFORE
/// rebind_ssu_governance when a tribe-change is requested. If any active missions
/// exist, this entry aborts, preventing the entire PTB from succeeding.
///
/// PERMISSIONLESS by design: any address may call this; it only reads state.
module bazaar_mission::ssu_rebind_mission_guard {
    use bazaar_mission::mission::{Self, MissionRegistry, MissionShop};
    use bazaar_core::ssu_governance;
    use bazaar_core::ssu_governance::SSUGovernance;
    use dapp_hub::ssu_registry::{Self, SSURegistry};

    const E_ACTIVE_MISSIONS_PRESENT: u64 = 1;

    /// Assert that no active missions exist for `gov`'s SSU when the rebind
    /// would change the tribe. Call BEFORE rebind_ssu_governance in the same PTB.
    ///
    /// Same-binding rebind (tribe_id unchanged): check is skipped.
    public entry fun assert_no_active_missions_for_rebind(
        registry: &MissionRegistry,
        gov: &SSUGovernance,
        ssu_registry: &SSURegistry,
        _ctx: &TxContext,
    ) {
        let ssu_id = ssu_governance::ssu_id(gov);
        let current_tribe_id = ssu_governance::ssu_tribe_id(gov);

        if (!ssu_registry::is_registered(ssu_registry, ssu_id)) {
            return
        };
        let reg = ssu_registry::registration(ssu_registry, ssu_id);
        let target_tribe_id = ssu_registry::ssu_tribe_id(reg);

        if (target_tribe_id == current_tribe_id) return;

        let mission_ids = mission::ssu_mission_ids(registry, ssu_id);
        let n = vector::length(&mission_ids);
        let mut i = 0;
        while (i < n) {
            let mid = *vector::borrow(&mission_ids, i);
            let m: &MissionShop = mission::borrow_mission(registry, mid);
            assert!(!mission::mission_is_active(m), E_ACTIVE_MISSIONS_PRESENT);
            i = i + 1;
        };
    }

    #[test_only]
    public fun e_active_missions_present(): u64 { E_ACTIVE_MISSIONS_PRESENT }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
