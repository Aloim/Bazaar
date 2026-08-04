// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// tests/sources/test_helpers.move
// Shared test utilities for all integration tests.
// Constitution: Article XII.3 — 500-line limit. Current: ~55 lines.
#[test_only]
module bazaar_integration_tests::test_helpers {
    use sui::clock;
    use sui::coin;
    use EVE::EVE::EVE;

    // Test addresses
    const ALICE: address = @0xA11CE;
    const BOB: address = @0xB0B;
    const LEADER: address = @0x1EAD;
    const SSU_ADDR: address = @0x55;
    const DEPLOYER: address = @0xDEF;

    public fun alice(): address { ALICE }
    public fun bob(): address { BOB }
    public fun leader(): address { LEADER }
    public fun ssu_addr(): address { SSU_ADDR }
    public fun deployer(): address { DEPLOYER }

    public fun create_test_clock(ctx: &mut TxContext): clock::Clock {
        clock::create_for_testing(ctx)
    }

    public fun make_sui_coin(amount: u64, ctx: &mut TxContext): coin::Coin<EVE> {
        coin::mint_for_testing<EVE>(amount, ctx)
    }

    public fun assert_approx_eq(a: u64, b: u64, delta: u64) {
        if (a > b) {
            assert!(a - b <= delta, 0);
        } else {
            assert!(b - a <= delta, 0);
        };
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
