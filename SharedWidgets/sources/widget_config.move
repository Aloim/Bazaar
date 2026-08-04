// SharedWidgets/sources/widget_config.move
// MAX 500 LINES — DO NOT EXCEED
module shared_widgets::widget_config {
    use sui::event;
    use sui::clock::Clock;     // R3.4: required for updated_at_ms

    // -- Error codes --
    const E_INVALID_WIDGET_INDEX: u64 = 1;
    const E_UNAUTHORIZED_PACKAGE: u64 = 2;

    // -- Widget index constants --
    // 0 = Announcements, 1 = Guestbook, 2 = MissionBoard, 3 = Donate
    const WIDGET_COUNT: u64 = 4;

    // -- Structs --

    /// Per-SSU widget enable/disable configuration.
    /// `authorized_package` is the package address permitted to call mutating functions.
    /// Created by the calling bazaar package on SSU setup; returned (not shared) to the caller.
    public struct WidgetConfig has key, store {
        id: UID,
        ssu_id: address,
        authorized_package: address,
        enabled_widgets: vector<bool>,
    }

    // -- Events --

    public struct WidgetToggledEvent has copy, drop {
        ssu_id: address,
        widget_idx: u64,
        enabled: bool,
    }

    /// Generic hot-reload signal. Emitted on every state mutation of WidgetConfig
    /// (currently only `toggle_widget`; future URL/value setters must also emit this).
    /// Frontend subscribes once and refetches the full config object on receipt.
    public struct WidgetConfigUpdated has copy, drop {
        config_id: ID,
        ssu_id: address,
        updated_at_ms: u64,
    }

    // ===== Constructor =====

    /// Create a new WidgetConfig for an SSU.
    /// All widgets start enabled (indices 0-3 all true).
    /// `authorized_package`: the package address authorised to call mutating functions.
    public fun create_widget_config(
        ssu_id: address,
        authorized_package: address,
        ctx: &mut TxContext,
    ): WidgetConfig {
        let mut widgets = vector::empty<bool>();
        vector::push_back(&mut widgets, true);  // 0 = Announcements
        vector::push_back(&mut widgets, true);  // 1 = Guestbook
        vector::push_back(&mut widgets, true);  // 2 = MissionBoard
        vector::push_back(&mut widgets, true);  // 3 = Donate
        WidgetConfig {
            id: object::new(ctx),
            ssu_id,
            authorized_package,
            enabled_widgets: widgets,
        }
    }

    // ===== Mutating functions =====

    /// Toggle a widget on/off.
    /// Caller is responsible for authority validation before calling this.
    /// `caller_package`: pass `@shared_widgets` from the calling package — checked against
    /// stored `authorized_package`.
    /// Aborts: E_INVALID_WIDGET_INDEX (1), E_UNAUTHORIZED_PACKAGE (2)
    public fun toggle_widget(
        config: &mut WidgetConfig,
        caller_package: address,
        widget_idx: u64,
        enabled: bool,
        clock: &Clock,    // R3.4: required to stamp updated_at_ms on WidgetConfigUpdated
    ) {
        assert!(config.authorized_package == caller_package, E_UNAUTHORIZED_PACKAGE);
        assert!(widget_idx < vector::length(&config.enabled_widgets), E_INVALID_WIDGET_INDEX);
        *vector::borrow_mut(&mut config.enabled_widgets, widget_idx) = enabled;
        event::emit(WidgetToggledEvent {
            ssu_id: config.ssu_id,
            widget_idx,
            enabled,
        });
        event::emit(WidgetConfigUpdated {
            config_id: object::id(config),
            ssu_id: config.ssu_id,
            updated_at_ms: clock.timestamp_ms(),
        });
    }

    // ===== Read accessors =====

    /// Check if a widget is enabled. Returns false for out-of-range indices.
    public fun is_widget_enabled(config: &WidgetConfig, widget_idx: u64): bool {
        if (widget_idx >= vector::length(&config.enabled_widgets)) {
            return false
        };
        *vector::borrow(&config.enabled_widgets, widget_idx)
    }

    /// Return the SSU ID this config belongs to.
    public fun ssu_id(config: &WidgetConfig): address { config.ssu_id }

    /// Return the authorized package address.
    public fun authorized_package(config: &WidgetConfig): address { config.authorized_package }

    /// Return the widget count.
    public fun widget_count(config: &WidgetConfig): u64 {
        vector::length(&config.enabled_widgets)
    }

    // ===== Test helpers =====

    #[test_only]
    public fun destroy_for_testing(config: WidgetConfig) {
        let WidgetConfig { id, ssu_id: _, authorized_package: _, enabled_widgets: _ } = config;
        object::delete(id);
    }
}
