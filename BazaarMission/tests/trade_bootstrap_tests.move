// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_mission::trade_bootstrap_tests {
    use sui::test_scenario::{Self as ts};
    use bazaar_mission::trade::{Self, TradeRegistry};

    const OWNER: address = @0xCAFE;

    // ---------------------------------------------------------------------------
    // Test 1: bootstrap_trade_registry shares a fresh TradeRegistry.
    //
    // Post-conditions verified:
    //   - A shared TradeRegistry object exists after the call.
    //   - proposal_count accessor returns 0 (registry is fresh/empty).
    // ---------------------------------------------------------------------------
    #[test]
    fun test_bootstrap_trade_registry() {
        let mut scenario = ts::begin(OWNER);

        // Tx 1: call the bootstrap entry fn.
        {
            let ctx = ts::ctx(&mut scenario);
            trade::bootstrap_trade_registry(ctx);
        };

        // Tx 2: verify the shared object exists and is in initial state.
        ts::next_tx(&mut scenario, OWNER);
        {
            // take_shared aborts if no shared TradeRegistry exists — primary invariant.
            let registry = ts::take_shared<TradeRegistry>(&scenario);

            // proposal_count must be 0: no proposals have been created yet.
            assert!(trade::proposal_count(&registry) == 0, 0);

            ts::return_shared(registry);
        };

        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
