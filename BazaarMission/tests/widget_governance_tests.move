// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

#[test_only]
module bazaar_mission::widget_governance_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use bazaar_core::membership;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_mission::widget_governance;
    use shared_widgets::widget_config::{Self, WidgetConfig};
    use dapp_hub::tribe_registry;
    use bazaar_core::tribe_governance_test_helpers;
    use bazaar_core::tribe_governance;

    // ===== Test constants =====

    const OWNER_A: address = @0xA001;
    const OWNER_B: address = @0xB002;
    const SSU_A:   address = @0xA551;
    const SSU_B:   address = @0xB552;
    const TRIBE_A: u64     = 1;
    const TRIBE_B: u64     = 2;
    const BAZAAR_TYPE: u8  = 0; // NoTribe

    // ===== T01 — Happy path: Owner toggles widget for own SSU =====
    //
    // Bootstrap one SSU (A). Owner A holds SSUOwnerCap-A, SSUGovernance-A is shared,
    // WidgetConfig-A is shared. Call toggle_ssu_widget with widget_idx=0, enabled=false.
    // Verify post-state: widget 0 is disabled.
    #[test]
    fun t01_happy_path_owner_toggles_widget() {
        let mut scenario = ts::begin(OWNER_A);

        // === Setup: create governance + widget config + owner cap ===
        let wconfig_id;
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // Create WidgetConfig for SSU_A (all 4 widgets start enabled=true)
            let wconfig = widget_config::create_widget_config(SSU_A, @bazaar_core, ctx);
            wconfig_id = sui::object::id(&wconfig);
            // Create SSUGovernance with the real widget_config_id bound
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_A, BAZAAR_TYPE, TRIBE_A, OWNER_A, wconfig_id, &clk, ctx,
            );
            let cap = membership::create_ssu_owner_cap_for_testing(SSU_A, TRIBE_A, ctx);
            // Share objects + transfer cap
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_share_object(wconfig);
            sui::transfer::public_transfer(cap, OWNER_A);
            clock::destroy_for_testing(clk);
        };

        // === Execute toggle: disable widget 0 (Announcements) ===
        ts::next_tx(&mut scenario, OWNER_A);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let mut wconfig = ts::take_shared<WidgetConfig>(&scenario);
            let cap = ts::take_from_address<membership::SSUOwnerCap>(&scenario, OWNER_A);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);

            // Pre-state: widget 0 starts enabled
            assert!(widget_config::is_widget_enabled(&wconfig, 0), 0);

            widget_governance::toggle_ssu_widget(&cap, &gov, &mut wconfig, @bazaar_core, 0, false, &clk);

            // Post-state: widget 0 is disabled
            assert!(!widget_config::is_widget_enabled(&wconfig, 0), 1);
            // Widgets 1-3 remain enabled (untouched)
            assert!(widget_config::is_widget_enabled(&wconfig, 1), 2);
            assert!(widget_config::is_widget_enabled(&wconfig, 2), 3);
            assert!(widget_config::is_widget_enabled(&wconfig, 3), 4);

            clock::destroy_for_testing(clk);
            ts::return_shared(wconfig);
            ts::return_shared(gov);
            ts::return_to_address(OWNER_A, cap);
        };

        ts::end(scenario);
    }

    // ===== T02 — Wrong SSU: cap_A with gov_B aborts E_WRONG_SSU =====
    //
    // Create SSUOwnerCap bound to SSU_A. Create SSUGovernance for SSU_B.
    // Calling toggle_ssu_widget with (cap_A, gov_B, ...) must abort with E_WRONG_SSU=1.
    #[test]
    #[expected_failure(abort_code = 1, location = bazaar_mission::widget_governance)]
    fun t02_wrong_ssu_aborts() {
        let mut scenario = ts::begin(OWNER_A);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // Create WidgetConfig for SSU_B
            let wconfig_b = widget_config::create_widget_config(SSU_B, @bazaar_core, ctx);
            let wconfig_b_id = sui::object::id(&wconfig_b);
            // Gov bound to SSU_B
            let gov_b = ssu_governance_test_helpers::create_for_testing(
                SSU_B, BAZAAR_TYPE, TRIBE_B, OWNER_B, wconfig_b_id, &clk, ctx,
            );
            // Cap bound to SSU_A (different SSU)
            let cap_a = membership::create_ssu_owner_cap_for_testing(SSU_A, TRIBE_A, ctx);

            ssu_governance_test_helpers::share_for_testing(gov_b);
            sui::transfer::public_share_object(wconfig_b);
            sui::transfer::public_transfer(cap_a, OWNER_A);
            clock::destroy_for_testing(clk);
        };

        ts::next_tx(&mut scenario, OWNER_A);
        {
            let gov_b = ts::take_shared<SSUGovernance>(&scenario);
            let mut wconfig_b = ts::take_shared<WidgetConfig>(&scenario);
            let cap_a = ts::take_from_address<membership::SSUOwnerCap>(&scenario, OWNER_A);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);

            // cap_a.ssu_id == SSU_A but gov_b.ssu_id == SSU_B => aborts E_WRONG_SSU=1
            widget_governance::toggle_ssu_widget(&cap_a, &gov_b, &mut wconfig_b, @bazaar_core, 0, false, &clk);

            clock::destroy_for_testing(clk);
            ts::return_shared(wconfig_b);
            ts::return_shared(gov_b);
            ts::return_to_address(OWNER_A, cap_a);
        };

        ts::end(scenario);
    }

    // ===== T03 — Wrong config: gov_A with config_B aborts E_WRONG_CONFIG =====
    //
    // Create SSUOwnerCap + SSUGovernance for SSU_A (with wconfig_A_id bound).
    // Create a separate WidgetConfig for SSU_B (wconfig_B). Pass (cap_A, gov_A, wconfig_B).
    // gov_A.widget_config_id != id(wconfig_B) => E_WRONG_CONFIG=2.
    #[test]
    #[expected_failure(abort_code = 2, location = bazaar_mission::widget_governance)]
    fun t03_wrong_config_aborts() {
        let mut scenario = ts::begin(OWNER_A);
        let wconfig_a_id;
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            // Dummy wconfig_A: only used for the gov binding — destroyed after recording ID
            let wconfig_a = widget_config::create_widget_config(SSU_A, @bazaar_core, ctx);
            wconfig_a_id = sui::object::id(&wconfig_a);
            // wconfig_B: the wrong config we will actually pass to the call
            let wconfig_b = widget_config::create_widget_config(SSU_B, @bazaar_core, ctx);
            // Gov bound to SSU_A with wconfig_A's id
            let gov_a = ssu_governance_test_helpers::create_for_testing(
                SSU_A, BAZAAR_TYPE, TRIBE_A, OWNER_A, wconfig_a_id, &clk, ctx,
            );
            let cap_a = membership::create_ssu_owner_cap_for_testing(SSU_A, TRIBE_A, ctx);

            ssu_governance_test_helpers::share_for_testing(gov_a);
            // Share wconfig_B (the wrong one) — wconfig_A is destroyed (no share)
            sui::transfer::public_share_object(wconfig_b);
            sui::transfer::public_transfer(cap_a, OWNER_A);
            widget_config::destroy_for_testing(wconfig_a);
            clock::destroy_for_testing(clk);
        };

        ts::next_tx(&mut scenario, OWNER_A);
        {
            let gov_a = ts::take_shared<SSUGovernance>(&scenario);
            let mut wconfig_b = ts::take_shared<WidgetConfig>(&scenario);
            let cap_a = ts::take_from_address<membership::SSUOwnerCap>(&scenario, OWNER_A);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);

            // gov_a.widget_config_id == wconfig_a_id != id(wconfig_b) => aborts E_WRONG_CONFIG=2
            widget_governance::toggle_ssu_widget(&cap_a, &gov_a, &mut wconfig_b, @bazaar_core, 0, false, &clk);

            clock::destroy_for_testing(clk);
            ts::return_shared(wconfig_b);
            ts::return_shared(gov_a);
            ts::return_to_address(OWNER_A, cap_a);
        };

        ts::end(scenario);
    }

    // ===== T04 — Invalid widget_idx >= 4 aborts E_INVALID_WIDGET_INDEX (callee) =====
    //
    // Happy-path setup but pass widget_idx=4. Callee (widget_config::toggle_widget)
    // aborts with E_INVALID_WIDGET_INDEX=1 at location shared_widgets::widget_config.
    #[test]
    #[expected_failure(abort_code = 1, location = shared_widgets::widget_config)]
    fun t04_invalid_widget_idx_aborts() {
        let mut scenario = ts::begin(OWNER_A);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let wconfig = widget_config::create_widget_config(SSU_A, @bazaar_core, ctx);
            let wconfig_id = sui::object::id(&wconfig);
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_A, BAZAAR_TYPE, TRIBE_A, OWNER_A, wconfig_id, &clk, ctx,
            );
            let cap = membership::create_ssu_owner_cap_for_testing(SSU_A, TRIBE_A, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_share_object(wconfig);
            sui::transfer::public_transfer(cap, OWNER_A);
            clock::destroy_for_testing(clk);
        };

        ts::next_tx(&mut scenario, OWNER_A);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let mut wconfig = ts::take_shared<WidgetConfig>(&scenario);
            let cap = ts::take_from_address<membership::SSUOwnerCap>(&scenario, OWNER_A);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);

            // widget_idx=4 is out of range (valid: 0-3) => callee aborts E_INVALID_WIDGET_INDEX=1
            widget_governance::toggle_ssu_widget(&cap, &gov, &mut wconfig, @bazaar_core, 4, false, &clk);

            clock::destroy_for_testing(clk);
            ts::return_shared(wconfig);
            ts::return_shared(gov);
            ts::return_to_address(OWNER_A, cap);
        };

        ts::end(scenario);
    }

    // ===== T05 — Sequential toggles: off -> on, final state assertion =====
    //
    // Happy-path setup. Widget 0 starts enabled. Toggle off, verify. Toggle on, verify.
    // Confirms that `enabled` is the desired post-state (not an XOR flip).
    #[test]
    fun t05_sequential_toggles() {
        let mut scenario = ts::begin(OWNER_A);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let wconfig = widget_config::create_widget_config(SSU_A, @bazaar_core, ctx);
            let wconfig_id = sui::object::id(&wconfig);
            let gov = ssu_governance_test_helpers::create_for_testing(
                SSU_A, BAZAAR_TYPE, TRIBE_A, OWNER_A, wconfig_id, &clk, ctx,
            );
            let cap = membership::create_ssu_owner_cap_for_testing(SSU_A, TRIBE_A, ctx);
            ssu_governance_test_helpers::share_for_testing(gov);
            sui::transfer::public_share_object(wconfig);
            sui::transfer::public_transfer(cap, OWNER_A);
            clock::destroy_for_testing(clk);
        };

        ts::next_tx(&mut scenario, OWNER_A);
        {
            let gov = ts::take_shared<SSUGovernance>(&scenario);
            let mut wconfig = ts::take_shared<WidgetConfig>(&scenario);
            let cap = ts::take_from_address<membership::SSUOwnerCap>(&scenario, OWNER_A);
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);

            // Widget 0 starts enabled
            assert!(widget_config::is_widget_enabled(&wconfig, 0), 200);

            // Toggle OFF
            widget_governance::toggle_ssu_widget(&cap, &gov, &mut wconfig, @bazaar_core, 0, false, &clk);
            assert!(!widget_config::is_widget_enabled(&wconfig, 0), 201);

            // Toggle ON again
            widget_governance::toggle_ssu_widget(&cap, &gov, &mut wconfig, @bazaar_core, 0, true, &clk);
            assert!(widget_config::is_widget_enabled(&wconfig, 0), 202);

            // Idempotent: toggle ON when already ON — state unchanged
            widget_governance::toggle_ssu_widget(&cap, &gov, &mut wconfig, @bazaar_core, 0, true, &clk);
            assert!(widget_config::is_widget_enabled(&wconfig, 0), 203);

            clock::destroy_for_testing(clk);
            ts::return_shared(wconfig);
            ts::return_shared(gov);
            ts::return_to_address(OWNER_A, cap);
        };

        ts::end(scenario);
    }

    // ===================================================================
    // ===== Tribe-side tests (TT01-TT05) — OS-59-tribe-widgets =====
    // ===================================================================

    const LEADER_A: address = @0xA0A1;
    const LEADER_B: address = @0xB0B2;
    const TRIBE_BAZAAR_TYPE: u8 = 1; // Easy
    const TRIBE_GOV_MODE: u8 = 0;    // Capitalistic

    // TT01 — Happy path: TribeLeader toggles widget for own tribe.
    // Bind wconfig_id into gov via create_for_testing_with_widget_config.
    // Toggle widget 0 off, verify. Toggle back on, verify. Other widgets untouched.
    #[test]
    fun tt01_happy_path_leader_toggles_tribe_widget() {
        let mut scenario = ts::begin(LEADER_A);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let leader_cap = tribe_registry::create_leader_cap_for_testing(1, ctx);
            let mut wconfig = widget_config::create_widget_config(LEADER_A, @bazaar_core, ctx);
            let wconfig_id = sui::object::id(&wconfig);
            let gov = tribe_governance_test_helpers::create_for_testing_with_widget_config(
                1, TRIBE_BAZAAR_TYPE, LEADER_A, TRIBE_GOV_MODE, wconfig_id, &clk, ctx,
            );
            assert!(widget_config::is_widget_enabled(&wconfig, 0), 0);
            widget_governance::toggle_tribe_widget(&leader_cap, &gov, &mut wconfig, @bazaar_core, 0, false, &clk);
            assert!(!widget_config::is_widget_enabled(&wconfig, 0), 1);
            widget_governance::toggle_tribe_widget(&leader_cap, &gov, &mut wconfig, @bazaar_core, 0, true, &clk);
            assert!(widget_config::is_widget_enabled(&wconfig, 0), 2);
            assert!(widget_config::is_widget_enabled(&wconfig, 1), 3);
            assert!(widget_config::is_widget_enabled(&wconfig, 2), 4);
            assert!(widget_config::is_widget_enabled(&wconfig, 3), 5);
            clock::destroy_for_testing(clk);
            widget_config::destroy_for_testing(wconfig);
            tribe_governance_test_helpers::destroy_for_testing(gov);
            tribe_registry::destroy_leader_cap_for_testing(leader_cap);
        };
        ts::end(scenario);
    }

    // TT02 — Wrong tribe: cap bound to tribe 1, gov for tribe 2 => E_WRONG_TRIBE=3.
    #[test]
    #[expected_failure(abort_code = 3, location = bazaar_mission::widget_governance)]
    fun tt02_wrong_tribe_aborts() {
        let mut scenario = ts::begin(LEADER_A);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let cap_a = tribe_registry::create_leader_cap_for_testing(1, ctx);
            let mut wconfig = widget_config::create_widget_config(LEADER_B, @bazaar_core, ctx);
            let wconfig_id = sui::object::id(&wconfig);
            let gov_b = tribe_governance_test_helpers::create_for_testing_with_widget_config(
                2, TRIBE_BAZAAR_TYPE, LEADER_B, TRIBE_GOV_MODE, wconfig_id, &clk, ctx,
            );
            // cap_a.tribe_id=1 != gov_b.tribe_id=2 => E_WRONG_TRIBE=3
            widget_governance::toggle_tribe_widget(&cap_a, &gov_b, &mut wconfig, @bazaar_core, 0, false, &clk);
            clock::destroy_for_testing(clk);
            widget_config::destroy_for_testing(wconfig);
            tribe_governance_test_helpers::destroy_for_testing(gov_b);
            tribe_registry::destroy_leader_cap_for_testing(cap_a);
        };
        ts::end(scenario);
    }

    // TT03 — Wrong config: gov_a bound to wconfig_a; pass wconfig_x => E_WRONG_CONFIG=2.
    #[test]
    #[expected_failure(abort_code = 2, location = bazaar_mission::widget_governance)]
    fun tt03_wrong_config_aborts() {
        let mut scenario = ts::begin(LEADER_A);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let cap_a = tribe_registry::create_leader_cap_for_testing(1, ctx);
            let wconfig_a = widget_config::create_widget_config(LEADER_A, @bazaar_core, ctx);
            let wconfig_a_id = sui::object::id(&wconfig_a);
            let gov_a = tribe_governance_test_helpers::create_for_testing_with_widget_config(
                1, TRIBE_BAZAAR_TYPE, LEADER_A, TRIBE_GOV_MODE, wconfig_a_id, &clk, ctx,
            );
            let mut wconfig_x = widget_config::create_widget_config(LEADER_B, @bazaar_core, ctx);
            // gov_a.widget_config_id == wconfig_a_id != id(wconfig_x) => E_WRONG_CONFIG=2
            widget_governance::toggle_tribe_widget(&cap_a, &gov_a, &mut wconfig_x, @bazaar_core, 0, false, &clk);
            clock::destroy_for_testing(clk);
            widget_config::destroy_for_testing(wconfig_a);
            widget_config::destroy_for_testing(wconfig_x);
            tribe_governance_test_helpers::destroy_for_testing(gov_a);
            tribe_registry::destroy_leader_cap_for_testing(cap_a);
        };
        ts::end(scenario);
    }

    // TT04 — Invalid widget_idx=4 => callee aborts E_INVALID_WIDGET_INDEX=1
    //         at location shared_widgets::widget_config.
    #[test]
    #[expected_failure(abort_code = 1, location = shared_widgets::widget_config)]
    fun tt04_invalid_widget_idx_aborts() {
        let mut scenario = ts::begin(LEADER_A);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let cap_a = tribe_registry::create_leader_cap_for_testing(1, ctx);
            let mut wconfig = widget_config::create_widget_config(LEADER_A, @bazaar_core, ctx);
            let wconfig_id = sui::object::id(&wconfig);
            let gov_a = tribe_governance_test_helpers::create_for_testing_with_widget_config(
                1, TRIBE_BAZAAR_TYPE, LEADER_A, TRIBE_GOV_MODE, wconfig_id, &clk, ctx,
            );
            // widget_idx=4 out of range => callee aborts E_INVALID_WIDGET_INDEX=1
            widget_governance::toggle_tribe_widget(&cap_a, &gov_a, &mut wconfig, @bazaar_core, 4, false, &clk);
            clock::destroy_for_testing(clk);
            widget_config::destroy_for_testing(wconfig);
            tribe_governance_test_helpers::destroy_for_testing(gov_a);
            tribe_registry::destroy_leader_cap_for_testing(cap_a);
        };
        ts::end(scenario);
    }

    // TT05 — widget_config_id not set (option::none) => E_TRIBE_WIDGET_CONFIG_NOT_SET=4.
    // Uses plain create_for_testing which does NOT bind widget_config_id.
    #[test]
    #[expected_failure(abort_code = 4, location = bazaar_mission::widget_governance)]
    fun tt05_widget_config_not_set_aborts() {
        let mut scenario = ts::begin(LEADER_A);
        {
            let ctx = ts::ctx(&mut scenario);
            let clk = clock::create_for_testing(ctx);
            let cap_a = tribe_registry::create_leader_cap_for_testing(1, ctx);
            let gov_a = tribe_governance_test_helpers::create_for_testing(
                1, TRIBE_BAZAAR_TYPE, LEADER_A, TRIBE_GOV_MODE, &clk, ctx,
            );
            let mut wconfig = widget_config::create_widget_config(LEADER_A, @bazaar_core, ctx);
            // gov_a.widget_config_id == none => E_TRIBE_WIDGET_CONFIG_NOT_SET=4
            widget_governance::toggle_tribe_widget(&cap_a, &gov_a, &mut wconfig, @bazaar_core, 0, false, &clk);
            clock::destroy_for_testing(clk);
            widget_config::destroy_for_testing(wconfig);
            tribe_governance_test_helpers::destroy_for_testing(gov_a);
            tribe_registry::destroy_leader_cap_for_testing(cap_a);
        };
        ts::end(scenario);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
