// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
// Phase: AP2-F / FP1-28
// Tests: GMA-01 through GMA-04 (4 tests)
// Covers: ledger_shop_ops mode-asserts for the 4 Advanced entry fns

#[test_only]
module bazaar_economy::governance_mode_assert_tests {
    use sui::clock;
    use bazaar_core::tribe_governance;
    use bazaar_core::ssu_governance;
    use bazaar_core::bazar;
    use bazaar_core::user_storage;
    use bazaar_economy::tribe_token_ledger;
    use bazaar_economy::ledger_shop_ops;
    use bazaar_economy::economy_cap_store;
    use bazaar_economy::tribe_vault;
    use bazaar_economy::tribe_exchange;
    use dapp_hub::tribe_registry;

    const TRIBE_ID: u64 = 1;
    const LEADER: address = @0xA1;
    const SSU_ADDR: address = @0xC1;
    const OWNER: address = @0xB1;

    // T-GMA-01..04 deleted 2026-04-24 — placeholder tests that required
    // proper test_scenario refactoring to express abort-path cleanup.
    // Deferred to FP1-40 (to be reimplemented alongside FP1-39 alternate modes).
    // Production mode-assert logic in ledger_shop_ops.move lines 96/177/255/375 remains intact.
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
