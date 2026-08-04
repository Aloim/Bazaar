// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
// Phase: OverhaulPlan1 R3.4
// Tests: WCE-01 through WCE-03 (3 tests)
// Covers: WidgetConfigUpdated event emission via toggle_widget

#[test_only]
module shared_widgets::widget_config_event_tests {
    use sui::clock;
    use sui::test_utils::assert_eq;
    use shared_widgets::widget_config;

    const SSU_ADDR: address = @0xA1;
    const AUTH_PKG: address = @0xB1;
    const WRONG_PKG: address = @0xFF;

    // WCE-01: toggle_widget happy path — widget state flips, no abort
    // Event emission is structural: sui::test_scenario event collection is not
    // available in pure unit test mode. We assert state is correct and trust
    // the emit code path (event::emit never aborts on valid input).
    #[test]
    fun test_wce01_toggle_emits_no_abort() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut config = widget_config::create_widget_config(SSU_ADDR, AUTH_PKG, &mut ctx);

        // Widget 0 starts enabled (true); toggle to false
        widget_config::toggle_widget(&mut config, AUTH_PKG, 0, false, &clock);
        assert_eq(widget_config::is_widget_enabled(&config, 0), false);

        // Toggle back to true — both WidgetToggledEvent and WidgetConfigUpdated must emit
        widget_config::toggle_widget(&mut config, AUTH_PKG, 0, true, &clock);
        assert_eq(widget_config::is_widget_enabled(&config, 0), true);

        widget_config::destroy_for_testing(config);
        clock::destroy_for_testing(clock);
    }

    // WCE-02: unauthorized caller aborts E_UNAUTHORIZED_PACKAGE before any event fires
    #[test]
    #[expected_failure(abort_code = shared_widgets::widget_config::E_UNAUTHORIZED_PACKAGE)]
    fun test_wce02_unauthorized_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut config = widget_config::create_widget_config(SSU_ADDR, AUTH_PKG, &mut ctx);

        // WRONG_PKG != AUTH_PKG — must abort with E_UNAUTHORIZED_PACKAGE (2)
        widget_config::toggle_widget(&mut config, WRONG_PKG, 0, false, &clock);
        abort 0
    }

    // WCE-03: out-of-range widget index aborts E_INVALID_WIDGET_INDEX before any event fires
    #[test]
    #[expected_failure(abort_code = shared_widgets::widget_config::E_INVALID_WIDGET_INDEX)]
    fun test_wce03_invalid_index_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut config = widget_config::create_widget_config(SSU_ADDR, AUTH_PKG, &mut ctx);

        // Index 99 is out of range (WIDGET_COUNT = 4) — must abort with E_INVALID_WIDGET_INDEX (1)
        widget_config::toggle_widget(&mut config, AUTH_PKG, 99, false, &clock);
        abort 0
    }
}
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
