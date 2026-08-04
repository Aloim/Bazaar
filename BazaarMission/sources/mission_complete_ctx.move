// ============================================================
// BazaarMission/sources/mission_complete_ctx.move
//
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// =============================================================================
// BazaarMission/sources/mission_complete_ctx.move
//
// GAS-14: pre-context snapshot helpers for mission_complete.move.
// Each function captures all pre-mutation scalars in a SINGLE & (immutable)
// borrow of the MissionShop DOF, satisfying SA-V34-02: collateral_amount is
// read BEFORE any &mut borrow that calls remove_acceptance.
//
// Extracted from mission_complete.move to keep that module under the 500-line
// Constitution guard (CC-A5-007).
// =============================================================================
module bazaar_mission::mission_complete_ctx {
    use sui::object::ID;
    use bazaar_mission::mission::{Self, MissionRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};

    // =========================================================================
    // NoTribe / Easy — item-proof paths (Paths A + B)
    // =========================================================================

    /// Single-borrow pre-context snapshot for NoTribe/Easy item-proof paths.
    /// Returns (owner, completion_mode, ssu_id, giver_is_owner, collateral_amount).
    ///
    /// SA-V34-02: collateral_amount is read here, in the & borrow, BEFORE the &mut
    /// scope that calls remove_acceptance. The returned value is the only safe carrier
    /// — do not call acceptance_collateral_of after remove_acceptance fires.
    public(package) fun snapshot_completion_ctx(
        registry: &MissionRegistry,
        mission_id: ID,
        gov: &SSUGovernance,
        taker: address,
    ): (address, u8, address, bool, u64) {
        let m = mission::borrow_mission(registry, mission_id);
        let owner = mission::mission_owner(m);
        (
            owner,
            mission::mission_completion_mode(m),
            mission::mission_ssu(m),
            owner == ssu_governance::ssu_owner(gov),     // giver_is_owner
            mission::acceptance_collateral_of(m, taker), // SA-V34-02
        )
    }

    // =========================================================================
    // Advanced — item-proof paths (Paths D + E)
    // =========================================================================

    /// Single-borrow pre-context snapshot for Advanced item-proof paths.
    /// Returns (owner, completion_mode, ssu_id, giver_is_owner, collateral_amount,
    ///          per_run_token, mission_addr).
    ///
    /// per_run + mission_addr are captured here to eliminate the post-core re-borrow
    /// (previously borrows #5 in Path D and Path E).
    /// SA-V34-02: collateral_amount captured before the &mut scope.
    public(package) fun snapshot_completion_ctx_advanced(
        registry: &MissionRegistry,
        mission_id: ID,
        gov: &SSUGovernance,
        taker: address,
    ): (address, u8, address, bool, u64, u64, address) {
        let m = mission::borrow_mission(registry, mission_id);
        let owner = mission::mission_owner(m);
        (
            owner,
            mission::mission_completion_mode(m),
            mission::mission_ssu(m),
            owner == ssu_governance::ssu_owner(gov),
            mission::acceptance_collateral_of(m, taker),
            mission::mission_reward_token_per_run(m),
            mission::mission_addr(m),
        )
    }

    // =========================================================================
    // NoTribe / Easy — Other-mode confirm (Path C)
    // =========================================================================

    /// Single-borrow pre-context snapshot for Other-mode NoTribe/Easy confirm.
    /// Inlines the checks from assert_pending_unsettled (settled + status) so those
    /// assertions and the collateral read share one DOF cycle.
    /// Returns (owner, ssu_id, collateral_amount).
    ///
    /// e_already_settled and e_acceptance_not_pending are passed as parameters because
    /// this sibling module cannot see mission_complete's private const declarations.
    /// SA-V34-02: collateral_amount captured before the &mut scope.
    public(package) fun snapshot_confirm_ctx(
        registry: &MissionRegistry,
        mission_id: ID,
        taker: address,
        e_already_settled: u64,
        e_acceptance_not_pending: u64,
    ): (address, address, u64) {
        let m = mission::borrow_mission(registry, mission_id);
        assert!(!mission::mission_is_settled(m), e_already_settled);
        assert!(
            mission::acceptance_status_of(m, taker) == mission::status_pending(),
            e_acceptance_not_pending,
        );
        (
            mission::mission_owner(m),
            mission::mission_ssu(m),
            mission::acceptance_collateral_of(m, taker),
        )
    }

    // =========================================================================
    // Advanced — Other-mode confirm (Path F)
    // =========================================================================

    /// Single-borrow pre-context snapshot for Advanced Other-mode confirm.
    /// Inlines settled + pending checks AND captures per_run + mission_addr to
    /// eliminate the post-mut re-borrow (previously borrow #6 in Path F).
    /// Returns (owner, ssu_id, collateral_amount, per_run_token, mission_addr).
    ///
    /// SA-V34-02: collateral_amount captured before the &mut scope.
    public(package) fun snapshot_confirm_ctx_advanced(
        registry: &MissionRegistry,
        mission_id: ID,
        taker: address,
        e_already_settled: u64,
        e_acceptance_not_pending: u64,
    ): (address, address, u64, u64, address) {
        let m = mission::borrow_mission(registry, mission_id);
        assert!(!mission::mission_is_settled(m), e_already_settled);
        assert!(
            mission::acceptance_status_of(m, taker) == mission::status_pending(),
            e_acceptance_not_pending,
        );
        (
            mission::mission_owner(m),
            mission::mission_ssu(m),
            mission::acceptance_collateral_of(m, taker),
            mission::mission_reward_token_per_run(m),
            mission::mission_addr(m),
        )
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
