// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Update Ceremony V2 — Phase 2 (Slice 2) tests for
// tribe_admin_drain::withdraw_legacy_tribe_gov_eve.
//
// Covers the §3.2 slice-2 checklist for the tribe-gov drain:
//   - gate closed -> E_CEREMONY_NOT_OPEN (SA-RCV2-06: inert outside the ceremony)
//   - wrong-tribe cap -> E_WRONG_TRIBE (SA-RCV2-05)
//   - gate open + correct cap -> returns the full balance, leaves tax_wallet at 0
//   - zero balance -> returns coin::zero (no abort), forensic event still emitted

#[test_only]
module bazaar_core::tribe_admin_drain_tests {
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use dapp_hub::tribe_registry;
    use dapp_hub::ceremony_gate;
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::tribe_governance_test_helpers as tgh;
    use bazaar_core::tribe_admin_drain;

    const TRIBE_ID:    u64 = 7;
    const OTHER_TRIBE: u64 = 99;
    const LEADER:      address = @0xA1;
    const FUNDED:      u64 = 5_000;

    fun fund(gov: &mut TribeGovernance, amount: u64, ctx: &mut TxContext) {
        tribe_governance::deposit_tribe_tax(gov, coin::mint_for_testing<EVE>(amount, ctx));
    }

    #[test]
    fun drains_full_balance_and_leaves_zero() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        fund(&mut gov, FUNDED, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let mut gate = ceremony_gate::create_for_testing(&mut ctx);
        ceremony_gate::set_open_for_testing(&mut gate, true);

        let coin = tribe_admin_drain::withdraw_legacy_tribe_gov_eve(
            &cap, &mut gov, &gate, &clock, &mut ctx,
        );
        assert!(coin::value(&coin) == FUNDED, 0);
        assert!(tribe_governance::tribe_tax_balance(&gov) == 0, 1);

        coin::burn_for_testing(coin);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        ceremony_gate::destroy_for_testing(gate);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun zero_balance_returns_zero_coin() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(TRIBE_ID, 2, LEADER, 0, &clock, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let mut gate = ceremony_gate::create_for_testing(&mut ctx);
        ceremony_gate::set_open_for_testing(&mut gate, true);

        let coin = tribe_admin_drain::withdraw_legacy_tribe_gov_eve(
            &cap, &mut gov, &gate, &clock, &mut ctx,
        );
        assert!(coin::value(&coin) == 0, 0);

        coin::burn_for_testing(coin);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        ceremony_gate::destroy_for_testing(gate);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = bazaar_core::tribe_admin_drain)]
    fun gate_closed_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        fund(&mut gov, FUNDED, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let gate = ceremony_gate::create_for_testing(&mut ctx); // starts CLOSED

        let coin = tribe_admin_drain::withdraw_legacy_tribe_gov_eve(
            &cap, &mut gov, &gate, &clock, &mut ctx,
        );

        coin::burn_for_testing(coin);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        ceremony_gate::destroy_for_testing(gate);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = bazaar_core::tribe_admin_drain)]
    fun wrong_tribe_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut gov = tgh::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        fund(&mut gov, FUNDED, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(OTHER_TRIBE, &mut ctx);
        let mut gate = ceremony_gate::create_for_testing(&mut ctx);
        ceremony_gate::set_open_for_testing(&mut gate, true);

        let coin = tribe_admin_drain::withdraw_legacy_tribe_gov_eve(
            &cap, &mut gov, &gate, &clock, &mut ctx,
        );

        coin::burn_for_testing(coin);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        ceremony_gate::destroy_for_testing(gate);
        tgh::destroy_for_testing(gov);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
