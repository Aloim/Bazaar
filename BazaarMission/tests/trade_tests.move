// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_mission::trade_tests {
    // R3.6 OS-18 — verifies BazaarCore::trade::accept_proposal aborts on
    // mismatched counterparty payment vs proposal.requested_eve. Closes
    // SA-R4.1-16 (HIGH) per IS-overhaul-r4.1-consolidated §3.6.
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_governance_test_helpers::{Self as gov_helpers};
    use bazaar_mission::trade::{Self, TradeRegistry};

    const PROPOSER: address = @0xA001;
    const COUNTERPARTY: address = @0xA002;
    const SSU_ID: address = @0xBEEF;
    const TRIBE_ID: u64 = 1;
    const OFFERED: u64 = 500;
    const REQUESTED: u64 = 1000;
    const EXPIRY_MS: u64 = 9999999;

    // ===== Test 1: Underpay aborts E_AMOUNT_MISMATCH (the bug being fixed) =====

    #[test]
    #[expected_failure(abort_code = bazaar_mission::trade::E_AMOUNT_MISMATCH)]
    fun test_accept_proposal_underpay_aborts() {
        let mut scenario = ts::begin(PROPOSER);
        // Tx 1: bootstrap SSUGovernance + TradeRegistry as shared.
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let gov = gov_helpers::create_for_testing(
                SSU_ID, 0, TRIBE_ID, PROPOSER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            gov_helpers::share_for_testing(gov);
            trade::bootstrap_trade_registry(ts::ctx(&mut scenario));
            clock::destroy_for_testing(clock);
        };
        // Tx 2 (PROPOSER): create_proposal with offered=500, requested=1000.
        ts::next_tx(&mut scenario, PROPOSER);
        let proposal_id;
        {
            let mut registry = ts::take_shared<TradeRegistry>(&scenario);
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let offered = coin::mint_for_testing<EVE>(OFFERED, ts::ctx(&mut scenario));
            proposal_id = trade::create_proposal(
                &mut registry, &gov, COUNTERPARTY, SSU_ID, TRIBE_ID, 0,
                vector[1u64], vector[1u64], vector[2u64], vector[1u64],
                offered, REQUESTED, EXPIRY_MS, &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(gov);
            clock::destroy_for_testing(clock);
        };
        // Tx 3 (COUNTERPARTY): accept with 999 (underpay) — aborts E_AMOUNT_MISMATCH.
        ts::next_tx(&mut scenario, COUNTERPARTY);
        {
            let mut registry = ts::take_shared<TradeRegistry>(&scenario);
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let underpay = coin::mint_for_testing<EVE>(REQUESTED - 1, ts::ctx(&mut scenario));
            trade::accept_proposal(
                &mut registry, &gov, proposal_id, underpay, &clock, ts::ctx(&mut scenario),
            );
            // Unreachable: assert above aborts the entire transaction.
            ts::return_shared(registry);
            ts::return_shared(gov);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 2: Exact pay succeeds =====

    #[test]
    fun test_accept_proposal_exact_pay_succeeds() {
        let mut scenario = ts::begin(PROPOSER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let gov = gov_helpers::create_for_testing(
                SSU_ID, 0, TRIBE_ID, PROPOSER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            gov_helpers::share_for_testing(gov);
            trade::bootstrap_trade_registry(ts::ctx(&mut scenario));
            clock::destroy_for_testing(clock);
        };
        ts::next_tx(&mut scenario, PROPOSER);
        let proposal_id;
        {
            let mut registry = ts::take_shared<TradeRegistry>(&scenario);
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let offered = coin::mint_for_testing<EVE>(OFFERED, ts::ctx(&mut scenario));
            proposal_id = trade::create_proposal(
                &mut registry, &gov, COUNTERPARTY, SSU_ID, TRIBE_ID, 0,
                vector[1u64], vector[1u64], vector[2u64], vector[1u64],
                offered, REQUESTED, EXPIRY_MS, &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(gov);
            clock::destroy_for_testing(clock);
        };
        ts::next_tx(&mut scenario, COUNTERPARTY);
        {
            let mut registry = ts::take_shared<TradeRegistry>(&scenario);
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let pay = coin::mint_for_testing<EVE>(REQUESTED, ts::ctx(&mut scenario));
            trade::accept_proposal(
                &mut registry, &gov, proposal_id, pay, &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(gov);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }

    // ===== Test 3: Overpay aborts E_AMOUNT_MISMATCH (SA-R3.6-03 coverage) =====

    #[test]
    #[expected_failure(abort_code = bazaar_mission::trade::E_AMOUNT_MISMATCH)]
    fun test_accept_proposal_overpay_aborts() {
        let mut scenario = ts::begin(PROPOSER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let gov = gov_helpers::create_for_testing(
                SSU_ID, 0, TRIBE_ID, PROPOSER,
                object::id_from_address(@0x0),
                &clock, ts::ctx(&mut scenario),
            );
            gov_helpers::share_for_testing(gov);
            trade::bootstrap_trade_registry(ts::ctx(&mut scenario));
            clock::destroy_for_testing(clock);
        };
        ts::next_tx(&mut scenario, PROPOSER);
        let proposal_id;
        {
            let mut registry = ts::take_shared<TradeRegistry>(&scenario);
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let offered = coin::mint_for_testing<EVE>(OFFERED, ts::ctx(&mut scenario));
            proposal_id = trade::create_proposal(
                &mut registry, &gov, COUNTERPARTY, SSU_ID, TRIBE_ID, 0,
                vector[1u64], vector[1u64], vector[2u64], vector[1u64],
                offered, REQUESTED, EXPIRY_MS, &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(gov);
            clock::destroy_for_testing(clock);
        };
        ts::next_tx(&mut scenario, COUNTERPARTY);
        {
            let mut registry = ts::take_shared<TradeRegistry>(&scenario);
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let overpay = coin::mint_for_testing<EVE>(REQUESTED + 1, ts::ctx(&mut scenario));
            trade::accept_proposal(
                &mut registry, &gov, proposal_id, overpay, &clock, ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(gov);
            clock::destroy_for_testing(clock);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
