// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// DappHub/sources/c6_tribe_ssu_table_tests.move
// Locking tests for Slice C6 / GAS-10:
//   Tribe.ssu_ids vector<address> → Table<address, bool> + ssu_count: u64.
// Covers: dedup-on-join (re-add same SSU → E_SSU_ALREADY_IN_TRIBE),
//         two-SSU membership via tribe_ssu_count + tribe_has_ssu,
//         and remove-then-count/has-ssu semantics.
// Run: "C:/Users/pohl-/.sui/bin/sui.exe" move test --path DappHub

#[test_only]
module dapp_hub::c6_tribe_ssu_table_tests {
    use sui::clock;
    use sui::coin;
    use sui::test_utils;
    use EVE::EVE::EVE;
    use dapp_hub::tribe_registry::{Self, TribeRegistry};
    use dapp_hub::dapp_governance;
    use dapp_hub::tax_wallet;

    // --- Test addresses ---
    const SSU_A: address = @0xA001;
    const SSU_B: address = @0xB002;

    // --- Helper: fresh TribeRegistry ---
    fun make_registry(ctx: &mut TxContext): TribeRegistry {
        tribe_registry::create_for_testing(ctx)
    }

    // --- Helper: Easy tribe with open join policy ---
    fun make_easy_tribe(
        registry: &mut TribeRegistry,
        ctx: &mut TxContext,
    ): dapp_hub::tribe_registry::TribeLeaderCap {
        let clock = clock::create_for_testing(ctx);
        let config = dapp_governance::create_config_for_testing(ctx);
        let mut wallet = tax_wallet::create_wallet_for_testing(ctx);
        let cap = tribe_registry::create_easy_tribe(
            registry, &config, &mut wallet, coin::zero<EVE>(ctx),
            b"C6Tribe", b"GAS-10 locking test tribe", 0, 0, &clock, ctx,
        );
        clock::destroy_for_testing(clock);
        test_utils::destroy(config);
        test_utils::destroy(wallet);
        cap
    }

    // ===== C6-01: duplicate SSU add aborts E_SSU_ALREADY_IN_TRIBE (7) =====
    // Verifies table::contains dedup is at least as strong as the removed
    // vector::index_of path. Re-adding the same SSU must abort with code 7.
    #[test]
    #[expected_failure(abort_code = 7)]
    fun c601_duplicate_ssu_add_aborts() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let cap = make_easy_tribe(&mut registry, &mut ctx);

        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_A);
        // Second add of SSU_A must abort E_SSU_ALREADY_IN_TRIBE (7).
        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_A);

        abort 0
    }

    // ===== C6-02: two distinct SSUs → ssu_count == 2, tribe_has_ssu true for both =====
    // Verifies ssu_count lockstep on the add path and that tribe_has_ssu returns true
    // for every added id and false for an absent id.
    #[test]
    fun c602_two_ssus_count_and_membership() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let cap = make_easy_tribe(&mut registry, &mut ctx);

        // Initial state: empty.
        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        assert!(tribe_registry::tribe_ssu_count(tribe) == 0, 0);
        assert!(!tribe_registry::tribe_has_ssu(tribe, SSU_A), 1);
        assert!(!tribe_registry::tribe_has_ssu(tribe, SSU_B), 2);

        // Add SSU_A: count 1, SSU_A present, SSU_B absent.
        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_A);
        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        assert!(tribe_registry::tribe_ssu_count(tribe) == 1, 3);
        assert!(tribe_registry::tribe_has_ssu(tribe, SSU_A), 4);
        assert!(!tribe_registry::tribe_has_ssu(tribe, SSU_B), 5);

        // Add SSU_B: count 2, both present.
        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_B);
        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        assert!(tribe_registry::tribe_ssu_count(tribe) == 2, 6);
        assert!(tribe_registry::tribe_has_ssu(tribe, SSU_A), 7);
        assert!(tribe_registry::tribe_has_ssu(tribe, SSU_B), 8);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }

    // ===== C6-03: remove one → count decrements, tribe_has_ssu false for removed =====
    // Verifies ssu_count lockstep on the remove path: after removing SSU_A,
    // count drops to 1, tribe_has_ssu is false for SSU_A and true for SSU_B.
    #[test]
    fun c603_remove_decrements_count_and_clears_membership() {
        let mut ctx = tx_context::dummy();
        let mut registry = make_registry(&mut ctx);
        let cap = make_easy_tribe(&mut registry, &mut ctx);

        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_A);
        tribe_registry::add_ssu_to_tribe(&cap, &mut registry, SSU_B);

        // Remove SSU_A.
        tribe_registry::remove_ssu_from_tribe(&cap, &mut registry, SSU_A);

        let tribe = tribe_registry::tribe_by_id(&registry, 1);
        assert!(tribe_registry::tribe_ssu_count(tribe) == 1, 0);
        assert!(!tribe_registry::tribe_has_ssu(tribe, SSU_A), 1);
        assert!(tribe_registry::tribe_has_ssu(tribe, SSU_B), 2);

        test_utils::destroy(cap);
        test_utils::destroy(registry);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
