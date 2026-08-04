// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Update Ceremony V2 — Phase 2 (Slice 2) tests for
// tribe_vault::withdraw_legacy_tribe_vault.
//
// Covers the §3.2 slice-2 checklist for the vault drain:
//   - gate closed -> E_CEREMONY_NOT_OPEN (SA-RCV2-06: the load-bearing multisig-bypass guard)
//   - wrong-tribe cap -> E_WRONG_TRIBE (SA-RCV2-05)
//   - gate open + correct cap -> returns the full balance, leaves eve_balance at 0
//   - drains even when is_locked (legacy-exit bypass by design)
//   - zero balance -> coin::zero (no abort)

#[test_only]
module bazaar_economy::tribe_vault_legacy_drain_tests {
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use dapp_hub::tribe_registry;
    use dapp_hub::ceremony_gate;
    use bazaar_economy::tribe_vault::{Self, TribeVault};

    const TRIBE_ID:    u64 = 7;
    const OTHER_TRIBE: u64 = 99;
    const FUNDED:      u64 = 5_000;

    fun new_funded(amount: u64, ctx: &mut TxContext): TribeVault {
        let mut vault = tribe_vault::create_for_testing(TRIBE_ID, ctx);
        if (amount > 0) tribe_vault::fund_for_testing(&mut vault, amount, ctx);
        vault
    }

    #[test]
    fun drains_full_balance_and_leaves_zero() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut vault = new_funded(FUNDED, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let mut gate = ceremony_gate::create_for_testing(&mut ctx);
        ceremony_gate::set_open_for_testing(&mut gate, true);

        let coin = tribe_vault::withdraw_legacy_tribe_vault(&cap, &mut vault, &gate, &clock, &mut ctx);
        assert!(coin::value(&coin) == FUNDED, 0);
        assert!(tribe_vault::eve_balance(&vault) == 0, 1);

        coin::burn_for_testing(coin);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        ceremony_gate::destroy_for_testing(gate);
        test_utils::destroy(vault);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun drains_locked_vault() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut vault = new_funded(FUNDED, &mut ctx);
        tribe_vault::set_locked(&mut vault, true); // legacy-exit must bypass the lock
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let mut gate = ceremony_gate::create_for_testing(&mut ctx);
        ceremony_gate::set_open_for_testing(&mut gate, true);

        let coin = tribe_vault::withdraw_legacy_tribe_vault(&cap, &mut vault, &gate, &clock, &mut ctx);
        assert!(coin::value(&coin) == FUNDED, 0);
        assert!(tribe_vault::eve_balance(&vault) == 0, 1);

        coin::burn_for_testing(coin);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        ceremony_gate::destroy_for_testing(gate);
        test_utils::destroy(vault);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun zero_balance_returns_zero_coin() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut vault = new_funded(0, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let mut gate = ceremony_gate::create_for_testing(&mut ctx);
        ceremony_gate::set_open_for_testing(&mut gate, true);

        let coin = tribe_vault::withdraw_legacy_tribe_vault(&cap, &mut vault, &gate, &clock, &mut ctx);
        assert!(coin::value(&coin) == 0, 0);

        coin::burn_for_testing(coin);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        ceremony_gate::destroy_for_testing(gate);
        test_utils::destroy(vault);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 6, location = bazaar_economy::tribe_vault)]
    fun gate_closed_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut vault = new_funded(FUNDED, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let gate = ceremony_gate::create_for_testing(&mut ctx); // starts CLOSED

        let coin = tribe_vault::withdraw_legacy_tribe_vault(&cap, &mut vault, &gate, &clock, &mut ctx);

        coin::burn_for_testing(coin);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        ceremony_gate::destroy_for_testing(gate);
        test_utils::destroy(vault);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = 3, location = bazaar_economy::tribe_vault)]
    fun wrong_tribe_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut vault = new_funded(FUNDED, &mut ctx);
        let cap = tribe_registry::create_leader_cap_for_testing(OTHER_TRIBE, &mut ctx);
        let mut gate = ceremony_gate::create_for_testing(&mut ctx);
        ceremony_gate::set_open_for_testing(&mut gate, true);

        let coin = tribe_vault::withdraw_legacy_tribe_vault(&cap, &mut vault, &gate, &clock, &mut ctx);

        coin::burn_for_testing(coin);
        tribe_registry::destroy_leader_cap_for_testing(cap);
        ceremony_gate::destroy_for_testing(gate);
        test_utils::destroy(vault);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
