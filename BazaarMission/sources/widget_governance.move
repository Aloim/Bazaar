// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Per-SSU and per-Tribe widget governance (OS-59).
///
/// V35 package split: relocated verbatim from bazaar_core::widget_governance
/// (bazaar_core exceeded Sui's 102,400-byte published-object limit). Read-only
/// leaf-consumer of bazaar_core (public accessors only); toggles widgets via
/// shared_widgets::widget_config. No code delta beyond the module rename.
///
/// Thin shim exposing public entry PTB targets for toggling widgets on
/// per-SSU and per-Tribe WidgetConfig objects.
///
/// SSU authority chain:
///   1. Caller holds SSUOwnerCap (issued at bootstrap).
///   2. cap.ssu_id == gov.ssu_id                         -> E_WRONG_SSU
///   3. gov.widget_config_id == id(config)               -> E_WRONG_CONFIG
///   4. config.authorized_package == package_id (callee assert; package_id passed by PTB)
///
/// Tribe authority chain:
///   1. Caller holds TribeLeaderCap (tribe_id-bound).
///   2. cap.tribe_id == gov.tribe_id                     -> E_WRONG_TRIBE
///   3. gov.widget_config_id == Some(id(config))         -> E_TRIBE_WIDGET_CONFIG_NOT_SET
///                                                          or E_WRONG_CONFIG
///   4. config.authorized_package == package_id (callee assert; package_id passed by PTB)
///
/// Constitution compliance:
///   - Article I.3: bazaar_mission -> {bazaar_core, shared_widgets, dapp_hub}
///     edges all pre-existing in BazaarMission/Move.toml. No new cross-package
///     arrows introduced by the V35 relocation.
///   - Article XII.3: file < 500 lines.
module bazaar_mission::widget_governance {
    use bazaar_core::membership::{Self, SSUOwnerCap};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use dapp_hub::tribe_registry::{Self, TribeLeaderCap};
    use shared_widgets::widget_config::{Self, WidgetConfig};
    use sui::clock::Clock;
    use sui::object;
    use std::option;

    // ===== Error codes =====

    /// Caller's SSUOwnerCap is bound to a different SSU than `gov`.
    const E_WRONG_SSU: u64 = 1;
    /// `config` is not the WidgetConfig registered under `gov.widget_config_id`.
    const E_WRONG_CONFIG: u64 = 2;
    /// Caller's TribeLeaderCap is bound to a different tribe than `gov`.
    const E_WRONG_TRIBE: u64 = 3;
    /// `gov.widget_config_id` is option::none (tribe not yet bootstrapped under v5,
    /// or retroactive set_tribe_widget_config_id not yet called).
    const E_TRIBE_WIDGET_CONFIG_NOT_SET: u64 = 4;

    // ===== SSU widget toggle =====

    /// Toggle a widget on/off for an SSU.
    ///
    /// Parameters:
    ///   - `cap`        SSUOwnerCap proving ownership of the SSU.
    ///   - `gov`        SSUGovernance for the target SSU (shared object).
    ///   - `config`     WidgetConfig for the target SSU (shared object, mutable).
    ///   - `package_id` Caller-supplied board-authorized package address (V7: avoids
    ///                  @-literal compile-as-zero bug; pass the package id the config
    ///                  was authorized with from the PTB).
    ///   - `widget_idx` 0=Announcements, 1=Guestbook, 2=(unused; formerly MissionBoard), 3=Donate.
    ///   - `enabled`    Desired post-state (true=on, false=off).
    ///   - `clock`      Sui system clock for event timestamp.
    ///
    /// Aborts:
    ///   - E_WRONG_SSU (1)                                   cap/gov mismatch
    ///   - E_WRONG_CONFIG (2)                                gov/config mismatch
    ///   - widget_config::E_INVALID_WIDGET_INDEX (1, callee) widget_idx >= 4
    ///   - widget_config::E_UNAUTHORIZED_PACKAGE (2, callee) config.authorized_package != package_id
    ///
    /// Emits (via callee): WidgetToggledEvent, WidgetConfigUpdated.
    public entry fun toggle_ssu_widget(
        cap: &SSUOwnerCap,
        gov: &SSUGovernance,
        config: &mut WidgetConfig,
        package_id: address,
        widget_idx: u64,
        enabled: bool,
        clock: &Clock,
    ) {
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov), E_WRONG_SSU);
        assert!(ssu_governance::widget_config_id(gov) == object::id(config), E_WRONG_CONFIG);
        widget_config::toggle_widget(config, package_id, widget_idx, enabled, clock);
    }

    // ===== Tribe widget toggle =====

    /// Toggle a widget on/off for a Tribe.
    ///
    /// Parameters:
    ///   - `cap`        TribeLeaderCap proving leadership of the tribe.
    ///   - `gov`        TribeGovernance for the target tribe (shared object).
    ///   - `config`     WidgetConfig for the target tribe (shared object, mutable).
    ///   - `package_id` Caller-supplied board-authorized package address (V7: avoids
    ///                  @-literal compile-as-zero bug; pass the package id the config
    ///                  was authorized with from the PTB).
    ///   - `widget_idx` 0=Announcements, 1=Guestbook, 2=(unused; formerly MissionBoard), 3=Donate.
    ///   - `enabled`    Desired post-state (true=on, false=off).
    ///   - `clock`      Sui system clock for event timestamp.
    ///
    /// Aborts:
    ///   - E_WRONG_TRIBE (3)                                 cap.tribe_id != gov.tribe_id
    ///   - E_TRIBE_WIDGET_CONFIG_NOT_SET (4)                 gov.widget_config_id is None
    ///   - E_WRONG_CONFIG (2)                                gov.widget_config_id != id(config)
    ///   - widget_config::E_INVALID_WIDGET_INDEX (1, callee) widget_idx >= 4
    ///   - widget_config::E_UNAUTHORIZED_PACKAGE (2, callee) config.authorized_package != package_id
    ///
    /// Emits (via callee): WidgetToggledEvent, WidgetConfigUpdated.
    public entry fun toggle_tribe_widget(
        cap: &TribeLeaderCap,
        gov: &TribeGovernance,
        config: &mut WidgetConfig,
        package_id: address,
        widget_idx: u64,
        enabled: bool,
        clock: &Clock,
    ) {
        assert!(
            tribe_registry::cap_tribe_id(cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
        let id_opt = tribe_governance::tribe_widget_config_id(gov);
        assert!(option::is_some(id_opt), E_TRIBE_WIDGET_CONFIG_NOT_SET);
        assert!(*option::borrow(id_opt) == object::id(config), E_WRONG_CONFIG);
        widget_config::toggle_widget(config, package_id, widget_idx, enabled, clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
