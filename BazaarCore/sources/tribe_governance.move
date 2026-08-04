// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::tribe_governance {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use EVE::EVE::EVE;
    use std::string::{Self, String};
    use std::option;
    use dapp_hub::tribe_registry;
    use dapp_hub::tribe_registry::TribeLeaderCap;
    use bazaar_core::bazaar_assertions;
    use bazaar_core::role_tax_types::RoleTaxConfig;
    use bazaar_core::bazaar_core_admin::TribeTokenShopCap;
    use shared_widgets::widget_config;

    // ===== Error Codes =====
    // E_RATE_EXCEEDS_CAP retired with the flat set_tribe_tax_config fn (Session 3B).
    // Per-role cap enforcement lives in tribe_role_tax_admin::E_RATE_EXCEEDS_CAP.
    const E_WRONG_TRIBE: u64 = 1;
    const E_INSUFFICIENT_BALANCE: u64 = 3;
    const E_TRIBE_CAP_REVOKED: u64 = 4;
    const E_NOT_EASY_OR_ADVANCED: u64 = 5;
    const E_URL_TOO_LONG: u64 = 6;
    const E_UNSUPPORTED_MODE: u64 = 7;
    const E_MODE_NOT_SUPPORTED_FOR_OP: u64 = 8;  // reserved; used by shop_ops/ledger_shop_ops
    const E_URL_EMPTY: u64 = 9;
    const E_TRIBE_NOT_ACTIVE: u64 = 10;
    const E_WIDGET_CONFIG_ALREADY_SET: u64 = 11;
    // V35: timed-ban error codes. Mirror of ssu_governance E_BAN_EXPIRY_IN_PAST (9) /
    // E_NOT_BANNED (10) but offset to 12/13 because 9/10/11 are already used here.
    const E_BAN_EXPIRY_IN_PAST: u64 = 12;
    const E_NOT_BANNED: u64 = 13;
    // V35 CC-04: distinct error code for rank-too-high-to-ban (not E_WRONG_TRIBE).
    const E_TARGET_RANK_TOO_HIGH: u64 = 14;

    // V35: sentinel value for a permanent ban. Identical to the SSU side sentinel and
    // the FE constant ssu-ban-tx.ts:40 (U64_MAX = 0xFFFFFFFFFFFFFFFFn).
    const PERMANENT_BAN_SENTINEL: u64 = 18446744073709551615;

    // V35: tribe rank constants used for rank-aware ban enforcement (SA-06).
    // Maps cap tier to its effective numeric rank (mirrors role_types constants).
    const TRIBE_RANK_LEADER:      u8 = 7;  // TribeLeaderCap
    const TRIBE_RANK_SUPER_ADMIN: u8 = 6;  // TribeSuperAdminCap
    const TRIBE_RANK_ADMIN:       u8 = 5;  // TribeAdminCap
    const TRIBE_RANK_MOD:         u8 = 4;  // TribeModCap

    const MAX_GODOT_URL_BYTES: u64 = 256;
    const MAX_SUPPORTED_MODE: u8 = 0;
    const GOVERNANCE_MODE_CAPITALISTIC: u8 = 0;

    // Mirror of ssu_governance::SCOPE_TRIBE (1). Inlined to break a use cycle.
    // Import removed to break the ssu_governance -> membership -> tribe_governance
    // -> ssu_governance 3-way cycle. Value MUST stay in sync with ssu_governance.
    // See: R5.2.b.2 cycle-cut rationale (MS-overhaul-r5.2.b.2-cycle-cut-...).
    const SCOPE_TRIBE: u8 = 1;

    // MAX_TAX_BPS retired alongside the flat setter (Session 3B). Per-tier cap
    // enforcement of MAX_TAX_PCT = 1000 (10.00%) lives in tribe_role_tax_admin.

    // ===== Structs =====
    /// Session 3B reshape: flat fields (wts_bps/wtb_bps/de_flat_fee) replaced by
    /// a Table<u8, RoleTaxConfig> indexed by role (Stranger=0 … 7). Unset rows
    /// return 0 via getters (see tribe_role_tax_admin).
    ///
    /// Abilities demoted from (store, copy, drop) to (store) only because
    /// sui::table::Table is non-copy/non-drop. Requires fresh publish (V16 cascade).
    public struct TribeTaxConfig has store {
        role_taxes: Table<u8, RoleTaxConfig>,
    }

    public struct TribeGovernance has key {
        id: UID,
        tribe_id: u64,
        bazaar_type: u8,
        leader: address,
        tribe_tax_config: TribeTaxConfig,
        tax_wallet: Balance<EVE>,
        total_tax_collected: u64,
        // V31 (Registered-SSUs): per-SSU accumulated tribe tax, keyed by ssu_id address.
        // Pure accounting counter (NOT money) — incremented by record_ssu_tribe_tax at every
        // tribe-tax credit point (Easy real-EVE path + Advanced token-ledger path) so the
        // Tribe Gov SuperAdmin "Registered SSUs" list can show per-SSU tax generated.
        ssu_tax_accumulated: Table<address, u64>,
        // CC-01: retype from bool to u64 (stores expires_at_ms, not a boolean).
        global_bans: Table<address, u64>,
        ssu_ids: vector<address>,
        is_active: bool,
        created_at_ms: u64,
        // [ADDED AP2-F / FP1-28] IMMUTABLE — no setter ever.
        // mutation requires Article XV amendment.
        governance_mode: u8,
        // [ADDED AP2-C / FP1-28] On-chain Godot client URL override.
        godot_url: Option<String>,
        // R6.7.0 (step 9): shop visibility for tribe-scoped stores.
        // 0 = public (default). Non-zero values reserved for OS-49 gating in R6.7.1+.
        store_visibility: u8,
        // R6.7.0 (C-08 hoist): symmetric tribe-cap revocation tables.
        // Entry fns (revoke/unrevoke) land in R6.7.4-bis; struct added here
        // to unblock compile (no forward-reference error).
        revoked_tribe_super_admin_cap_ids: Table<ID, bool>,
        revoked_tribe_admin_cap_ids: Table<ID, bool>,
        revoked_tribe_mod_cap_ids: Table<ID, bool>,
        // OS-59-tribe-widgets: per-tribe WidgetConfig object ID.
        // option::none() for pre-v5 bootstrapped tribes; use set_tribe_widget_config_id
        // retroactive setter to bind after upgrade.
        widget_config_id: Option<ID>,
        // Mission (MIS) per-hour listing fee charged on the Tribe layer. Denomination
        // implied by bazaar_type: raw MIST EVE for Easy, tribe-token units for Advanced.
        // 0 = no tribe mission fee. Set via set_tribe_mission_listing_fee.
        mission_listing_fee_per_hour: u64,
        // V35 8a/8b: tribe-wide shop-count and items limits (mirror ssu_governance).
        // max_shops_override: None = no tribe-level per-owner cap; Some(n) = soft ceiling.
        // shop_limits_by_role: per-role per-owner max (0 = unset, role_limit>0 takes precedence).
        // shop_items_limit: FE-advisory config (0 = no tribe limit; not enforced on-chain
        //   in V35 — matches SSU precedent where shop_items_limit is FE-consumed).
        max_shops_override: Option<u64>,
        shop_limits_by_role: Table<u8, u64>,
        shop_items_limit: u64,
    }

    // ===== Capabilities =====
    public struct TribeSuperAdminCap has key, store {
        id: UID,
        tribe_id: u64,
    }

    public struct TribeAdminCap has key, store {
        id: UID,
        tribe_id: u64,
    }

    public struct TribeModCap has key, store {
        id: UID,
        tribe_id: u64,
    }

    // ===== Events =====
    public struct TribeGovernanceCreated has copy, drop {
        tribe_id: u64,
        bazaar_type: u8,
        governance_mode: u8,
        timestamp_ms: u64,
    }

    // TribeTaxConfigUpdated event retired (Session 3B). Per-role events live in
    // tribe_role_tax_admin: TribeRoleTaxUpdated / TribeRoleTaxCleared / TribeTaxBatchUpdated.

    public struct TribeTaxWithdrawn has copy, drop {
        tribe_id: u64,
        amount: u64,
        withdrawn_by: address,
        timestamp_ms: u64,
    }

    public struct SSURegisteredToTribeEvent has copy, drop {
        tribe_id: u64,
        ssu_id: address,
        registered_by: address,
        timestamp_ms: u64,
    }

    /// Emitted when a per-tribe WidgetConfig is bound to TribeGovernance.
    /// Emitted by both bootstrap_tribe_governance (atomic at creation) and
    /// set_tribe_widget_config_id (retroactive path for pre-v5 objects).
    public struct TribeWidgetConfigSetEvent has copy, drop {
        tribe_id: u64,
        widget_config_id: ID,
        actor: address,
        timestamp_ms: u64,
    }

    /// Emitted when the per-hour Mission (MIS) listing fee is set on the Tribe layer.
    public struct TribeMissionListingFeeUpdated has copy, drop {
        tribe_id: u64,
        fee_per_hour: u64,
        actor: address,
        timestamp_ms: u64,
    }

    // V35 8d: timed-ban events, replacing the removed TribeGlobalBanSet in tribe_governance_caps.
    public struct TribeBanIssued has copy, drop {
        tribe_id: u64,
        target: address,
        expires_at_ms: u64,       // PERMANENT_BAN_SENTINEL for permanent bans
        issuer: address,
        staff_kind: u8,           // 0=Leader, 1=SuperAdmin, 2=Admin, 3=Mod
        timestamp_ms: u64,
    }

    public struct TribeBanLifted has copy, drop {
        tribe_id: u64,
        target: address,
        lifter: address,
        staff_kind: u8,
        timestamp_ms: u64,
    }

    // ===== Creation =====
    public(package) fun create_tribe_governance(
        tribe_id: u64,
        bazaar_type: u8,
        leader: address,
        governance_mode: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeGovernance {
        assert!(bazaar_type == 1 || bazaar_type == 2, E_NOT_EASY_OR_ADVANCED);
        assert!(governance_mode <= MAX_SUPPORTED_MODE, E_UNSUPPORTED_MODE);
        let ts = clock.timestamp_ms();
        event::emit(TribeGovernanceCreated {
            tribe_id, bazaar_type, governance_mode, timestamp_ms: ts,
        });
        TribeGovernance {
            id: object::new(ctx),
            tribe_id, bazaar_type,
            leader,
            tribe_tax_config: TribeTaxConfig { role_taxes: table::new(ctx) },
            tax_wallet: balance::zero(),
            total_tax_collected: 0,
            ssu_tax_accumulated: table::new(ctx),
            global_bans: table::new(ctx),
            ssu_ids: vector::empty(),
            is_active: true,
            created_at_ms: ts,
            governance_mode,
            godot_url: option::none<String>(),
            store_visibility: 0,           // R6.7.0: default public (OS-49 setter in R6.7.1+)
            revoked_tribe_super_admin_cap_ids: table::new(ctx),
            revoked_tribe_admin_cap_ids: table::new(ctx),
            revoked_tribe_mod_cap_ids: table::new(ctx),
            widget_config_id: option::none<ID>(),
            mission_listing_fee_per_hour: 0,
            max_shops_override: option::none<u64>(),
            shop_limits_by_role: table::new(ctx),
            shop_items_limit: 0,
        }
    }

    // ===== Bootstrap helpers =====
    // V17: the prior `bootstrap_tribe_governance` entry was extracted into
    // bazaar_core::tribe_governance_bootstrap (split for the 500-LOC ceiling and
    // to expose `bootstrap_tribe_governance_atomic` as a public fun composable by
    // bazaar_economy::bootstrap_advanced_complete). The Easy-only entry now lives
    // in that same module. `share` below is the only piece that has to live here
    // because TribeGovernance lacks the `store` ability — Sui's same-module rule
    // for `transfer::share_object` requires the call site to be inside the
    // declaring module.

    /// Share a freshly-created TribeGovernance as a shared Sui object.
    /// Called only by bazaar_core::tribe_governance_bootstrap during atomic bootstrap.
    public fun share(gov: TribeGovernance) {
        transfer::share_object(gov)
    }

    /// Package-private: bind widget_config_id into TribeGovernance.
    /// Asserts option::is_none to prevent double-bind.
    /// Emits TribeWidgetConfigSetEvent.
    /// Called by: bootstrap_tribe_governance (pre-share) and set_tribe_widget_config_id.
    public(package) fun set_widget_config_id_internal(
        gov: &mut TribeGovernance,
        wconfig_id: ID,
        actor: address,
        timestamp_ms: u64,
    ) {
        assert!(option::is_none(&gov.widget_config_id), E_WIDGET_CONFIG_ALREADY_SET);
        gov.widget_config_id = option::some(wconfig_id);
        event::emit(TribeWidgetConfigSetEvent {
            tribe_id: gov.tribe_id,
            widget_config_id: wconfig_id,
            actor,
            timestamp_ms,
        });
    }

    /// One-shot retroactive setter: bind a WidgetConfig to a TribeGovernance bootstrapped
    /// under a pre-v5 package (where widget_config_id was absent).
    /// For v5-bootstrapped tribes, always aborts E_WIDGET_CONFIG_ALREADY_SET (already set).
    ///
    /// Aborts:
    ///   E_WRONG_TRIBE (1)                 cap.tribe_id != gov.tribe_id
    ///   E_TRIBE_NOT_ACTIVE (10)           gov.is_active == false
    ///   E_WIDGET_CONFIG_ALREADY_SET (11)  gov.widget_config_id already Some
    public entry fun set_tribe_widget_config_id(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        widget_config_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tribe_registry::cap_tribe_id(leader_cap) == gov.tribe_id, E_WRONG_TRIBE);
        assert!(gov.is_active, E_TRIBE_NOT_ACTIVE);
        set_widget_config_id_internal(gov, widget_config_id, ctx.sender(), clock.timestamp_ms());
    }

    /// Package-private: write directly to godot_url field.
    /// Used by tribe_governance_godot module to avoid direct cross-module field access.
    public(package) fun set_godot_url_internal(gov: &mut TribeGovernance, url: Option<String>) {
        gov.godot_url = url;
    }

    // ===== Leader Functions =====
    // set_tribe_tax_config retired (Session 3B). Per-role setters live in
    // bazaar_core::tribe_role_tax_admin:
    //   - set_tribe_role_tax     — single row upsert
    //   - clear_tribe_role_tax   — row removal
    //   - set_tribe_taxes_batch  — N-row upsert in one TX
    //   - set_tribe_tax_uniform  — write all 8 roles to the same RoleTaxConfig

    /// Session 3B: package-private accessor to the per-role tax table.
    public(package) fun borrow_role_taxes(gov: &TribeGovernance): &Table<u8, RoleTaxConfig> {
        &gov.tribe_tax_config.role_taxes
    }

    /// Session 3B: package-private mutable accessor to the per-role tax table.
    public(package) fun borrow_role_taxes_mut(gov: &mut TribeGovernance): &mut Table<u8, RoleTaxConfig> {
        &mut gov.tribe_tax_config.role_taxes
    }

    public fun withdraw_tribe_tax(
        leader_cap: &tribe_registry::TribeLeaderCap,
        gov: &mut TribeGovernance,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        bazaar_assertions::assert_easy_or_advanced(gov.bazaar_type);              // R5.2.b.1
        assert!(tribe_registry::cap_tribe_id(leader_cap) == gov.tribe_id, E_WRONG_TRIBE);
        assert!(gov.tax_wallet.value() >= amount, E_INSUFFICIENT_BALANCE);
        event::emit(TribeTaxWithdrawn {
            tribe_id: gov.tribe_id, amount,
            withdrawn_by: ctx.sender(), timestamp_ms: clock.timestamp_ms(),
        });
        coin::from_balance(gov.tax_wallet.split(amount), ctx)
    }

    /// V16-DESIGN-1: SuperAdmin-cap-gated withdraw of tribe tax revenue.
    /// Parallel to withdraw_tribe_tax (which is TribeLeaderCap-gated).
    /// Admin/Mod tiers do NOT have withdrawal access — only Leader + SuperAdmin.
    /// Honors the existing per-cap revocation table (E_TRIBE_CAP_REVOKED).
    public fun withdraw_tribe_tax_as_super_admin(
        cap: &TribeSuperAdminCap,
        gov: &mut TribeGovernance,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        bazaar_assertions::assert_easy_or_advanced(gov.bazaar_type);              // R5.2.b.1
        assert!(cap.tribe_id == gov.tribe_id, E_WRONG_TRIBE);
        assert!(
            !table::contains(&gov.revoked_tribe_super_admin_cap_ids, object::id(cap)),
            E_TRIBE_CAP_REVOKED,
        );
        assert!(gov.tax_wallet.value() >= amount, E_INSUFFICIENT_BALANCE);
        event::emit(TribeTaxWithdrawn {
            tribe_id: gov.tribe_id, amount,
            withdrawn_by: ctx.sender(), timestamp_ms: clock.timestamp_ms(),
        });
        coin::from_balance(gov.tax_wallet.split(amount), ctx)
    }

    /// Public entry wrapper for the package-private add_ssu.
    /// Callable from PTBs: allows tribe leaders to register an SSU to their tribe governance object.
    /// Idempotent — if ssu_id is already registered, the call succeeds with no state change.
    public fun register_ssu_to_tribe(
        leader_cap: &tribe_registry::TribeLeaderCap,
        gov: &mut TribeGovernance,
        ssu_id: address,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(gov.bazaar_type);              // R5.2.b.1
        assert!(gov.is_active, E_TRIBE_NOT_ACTIVE);    // SEC-015
        assert!(tribe_registry::cap_tribe_id(leader_cap) == gov.tribe_id, E_WRONG_TRIBE);
        add_ssu(gov, ssu_id);
        event::emit(SSURegisteredToTribeEvent {
            tribe_id: gov.tribe_id,
            ssu_id,
            registered_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Set the per-hour Mission (MIS) listing fee charged on the Tribe layer.
    /// Denomination implied by bazaar_type (raw MIST EVE for Easy, tribe-token units
    /// for Advanced). TribeLeaderCap-gated. 0 disables the tribe mission fee.
    public entry fun set_tribe_mission_listing_fee(
        leader_cap: &tribe_registry::TribeLeaderCap,
        gov: &mut TribeGovernance,
        fee_per_hour: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_easy_or_advanced(gov.bazaar_type);
        assert!(tribe_registry::cap_tribe_id(leader_cap) == gov.tribe_id, E_WRONG_TRIBE);
        assert!(gov.is_active, E_TRIBE_NOT_ACTIVE);
        gov.mission_listing_fee_per_hour = fee_per_hour;
        event::emit(TribeMissionListingFeeUpdated {
            tribe_id: gov.tribe_id,
            fee_per_hour,
            actor: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Mission (MIS) per-hour listing fee on the Tribe layer (0 if unset).
    public fun tribe_mission_listing_fee_per_hour(gov: &TribeGovernance): u64 { gov.mission_listing_fee_per_hour }

    // ===== Package-Private =====

    /// Update Ceremony V2 (Slice 2): split the ENTIRE tribe tax_wallet into a returned
    /// Balance<EVE>, leaving the wallet at 0. public(package) — callable ONLY by
    /// tribe_admin_drain::withdraw_legacy_tribe_gov_eve (same package). Parallel to
    /// ssu_governance::withdraw_from_tax_wallet (the "drain-all" primitive the legacy
    /// composable drain needs; withdraw_tribe_tax takes an explicit amount + is leader-cap
    /// gated, so it is not a clean full-residue split for the ceremony path).
    public(package) fun withdraw_tribe_tax_balance_all(gov: &mut TribeGovernance): Balance<EVE> {
        let amount = gov.tax_wallet.value();
        gov.tax_wallet.split(amount)
    }

    public(package) fun deposit_tribe_tax(gov: &mut TribeGovernance, coin: Coin<EVE>) {
        let val = coin.value();
        gov.tax_wallet.join(coin.into_balance());
        gov.total_tax_collected = gov.total_tax_collected + val;
    }

    /// V31 (Registered-SSUs): record that `amount` of tribe tax was generated by activity
    /// on `ssu_id`. Pure accounting — does NOT move funds (the real tribe-tax coin/ledger
    /// credit is routed separately). Called at every tribe-tax credit point: the Easy
    /// real-EVE path (shop_ops_wts/wtb/de) and the Advanced token-ledger path
    /// (bazaar_economy::ledger_shop_ops). Zero-safe (no-op when amount == 0).
    public(package) fun record_ssu_tribe_tax(gov: &mut TribeGovernance, ssu_id: address, amount: u64) {
        if (amount == 0) return;
        if (table::contains(&gov.ssu_tax_accumulated, ssu_id)) {
            let cur = table::borrow_mut(&mut gov.ssu_tax_accumulated, ssu_id);
            *cur = *cur + amount;
        } else {
            table::add(&mut gov.ssu_tax_accumulated, ssu_id, amount);
        };
    }

    /// V31 cross-package gated variant. The Advanced token-ledger tribe-tax path lives in
    /// `bazaar_economy::ledger_shop_ops`, which holds the `TribeTokenShopCap` issued by
    /// bazaar_core. Gating on that cap means only the legitimate ledger ops can record per-SSU
    /// tribe tax cross-package — an arbitrary caller with a `&mut TribeGovernance` (shared
    /// object) cannot inflate the display counter. The Easy path stays in-package via the
    /// `public(package)` `record_ssu_tribe_tax`.
    public fun record_ssu_tribe_tax_gated(
        gov: &mut TribeGovernance,
        ssu_id: address,
        amount: u64,
        _cap: &TribeTokenShopCap,
    ) {
        record_ssu_tribe_tax(gov, ssu_id, amount);
    }

    /// V31: accumulated tribe tax generated by `ssu_id` (0 if none recorded yet).
    public fun ssu_tribe_tax(gov: &TribeGovernance, ssu_id: address): u64 {
        if (table::contains(&gov.ssu_tax_accumulated, ssu_id)) {
            *table::borrow(&gov.ssu_tax_accumulated, ssu_id)
        } else { 0 }
    }

    public(package) fun add_ssu(gov: &mut TribeGovernance, ssu_id: address) {
        if (!vector::contains(&gov.ssu_ids, &ssu_id)) {
            vector::push_back(&mut gov.ssu_ids, ssu_id);
        };
    }

    // ===== Accessors =====
    // Flat tax getters (tribe_wts_tax_bps / tribe_wtb_tax_bps / tribe_de_flat_fee)
    // retired (Session 3B). Use tribe_role_tax_admin::tribe_{wts,wtb}_pct_for_role
    // and tribe_role_tax_admin::tribe_de_flat_fee_for_role instead.
    public fun tribe_tax_balance(gov: &TribeGovernance): u64 { gov.tax_wallet.value() }
    /// V35: clock-aware timed-ban check. Returns true iff player has a ban row AND the ban
    /// has not expired. Permanent-ban sentinel (u64::MAX) is always > now → always true.
    /// Expired bans return false without removing the row (lazy-expiry, same as SSU pattern).
    /// SIGNATURE CHANGE V35: takes &Clock (was 2-arg bool-table lookup).
    public fun tribe_is_globally_banned(
        gov: &TribeGovernance,
        player: address,
        clock: &Clock,
    ): bool {
        if (!table::contains(&gov.global_bans, player)) return false;
        let expiry = *table::borrow(&gov.global_bans, player);
        clock.timestamp_ms() < expiry
    }
    public fun tribe_bazaar_type(gov: &TribeGovernance): u8 { gov.bazaar_type }
    public fun tribe_id(gov: &TribeGovernance): u64 { gov.tribe_id }
    public fun tribe_is_active(gov: &TribeGovernance): bool { gov.is_active }
    public fun tribe_ssu_ids(gov: &TribeGovernance): &vector<address> { &gov.ssu_ids }

    /// Returns the tribe leader address stored in this governance object.
    /// Used by bazaar_economy::ledger_shop_ops for tax credit routing.
    public fun tribe_leader(gov: &TribeGovernance): address { gov.leader }

    /// Cross-package accessor alias: returns tribe_id recorded in this TribeGovernance object.
    /// Used by bazaar_economy for identity validation (SA-002/SA-003).
    public fun tribe_governance_tribe_id(gov: &TribeGovernance): u64 { gov.tribe_id }

    /// Returns governance_mode. IMMUTABLE field — no setter.
    /// mutation requires Article XV amendment.
    public fun tribe_governance_mode(gov: &TribeGovernance): u8 { gov.governance_mode }

    /// Returns the current Godot URL for this tribe (None if not set).
    public fun tribe_godot_url(gov: &TribeGovernance): &Option<String> { &gov.godot_url }

    public fun tribe_widget_config_id(gov: &TribeGovernance): &Option<ID> { &gov.widget_config_id }

    // Cap accessors
    public fun tribe_super_admin_cap_tribe_id(cap: &TribeSuperAdminCap): u64 { cap.tribe_id }
    public fun tribe_admin_cap_tribe_id(cap: &TribeAdminCap): u64 { cap.tribe_id }
    public fun tribe_mod_cap_tribe_id(cap: &TribeModCap): u64 { cap.tribe_id }

    /// Returns true if the given TribeSuperAdminCap ID is in the revocation table.
    public fun is_tribe_super_admin_cap_revoked(gov: &TribeGovernance, cap_id: ID): bool {
        table::contains(&gov.revoked_tribe_super_admin_cap_ids, cap_id)
    }

    /// Returns true if the given TribeAdminCap ID is in the revocation table.
    public fun is_tribe_admin_cap_revoked(gov: &TribeGovernance, cap_id: ID): bool {
        table::contains(&gov.revoked_tribe_admin_cap_ids, cap_id)
    }

    /// Returns true if the given TribeModCap ID is in the revocation table.
    public fun is_tribe_mod_cap_revoked(gov: &TribeGovernance, cap_id: ID): bool {
        table::contains(&gov.revoked_tribe_mod_cap_ids, cap_id)
    }

    /// Package-private: construct a TribeSuperAdminCap.
    /// Called by tribe_governance_caps::grant_tribe_super_admin.
    public(package) fun new_tribe_super_admin_cap(gov: &TribeGovernance, ctx: &mut TxContext): TribeSuperAdminCap {
        TribeSuperAdminCap { id: object::new(ctx), tribe_id: gov.tribe_id }
    }

    /// Package-private: construct a TribeAdminCap.
    /// Called by tribe_governance_caps::grant_tribe_admin.
    public(package) fun new_tribe_admin_cap(gov: &TribeGovernance, ctx: &mut TxContext): TribeAdminCap {
        TribeAdminCap { id: object::new(ctx), tribe_id: gov.tribe_id }
    }

    /// Package-private: construct a TribeModCap.
    /// Called by tribe_governance_caps::grant_tribe_mod.
    public(package) fun new_tribe_mod_cap(gov: &TribeGovernance, ctx: &mut TxContext): TribeModCap {
        TribeModCap { id: object::new(ctx), tribe_id: gov.tribe_id }
    }

    /// V35 8d: set a timed tribe-wide ban. Mirrors ssu_governance::set_ban_internal.
    /// expires_at_ms MUST be strictly greater than clock.timestamp_ms().
    /// PERMANENT_BAN_SENTINEL (u64::MAX) is always > now → passes the guard.
    /// Upserts the row if the player was already banned (allows extending/changing expiry).
    /// Emits TribeBanIssued.
    /// SA-06: Caller is responsible for asserting target_rank < issuer_rank (enforced
    /// in tribe_governance_caps ban entries — keeps this helper rank-agnostic).
    public(package) fun set_tribe_ban_internal(
        gov: &mut TribeGovernance,
        target: address,
        expires_at_ms: u64,
        issuer: address,
        staff_kind: u8,
        clock: &Clock,
    ) {
        assert!(expires_at_ms > clock.timestamp_ms(), E_BAN_EXPIRY_IN_PAST);
        if (table::contains(&gov.global_bans, target)) {
            *table::borrow_mut(&mut gov.global_bans, target) = expires_at_ms;
        } else {
            table::add(&mut gov.global_bans, target, expires_at_ms);
        };
        event::emit(TribeBanIssued {
            tribe_id: gov.tribe_id,
            target,
            expires_at_ms,
            issuer,
            staff_kind,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// V35 8d: lift a tribe-wide ban. Asserts player is in the ban table.
    /// Does NOT check expiry — allows explicit unban of already-expired rows (cleanup).
    /// Emits TribeBanLifted.
    public(package) fun tribe_unban_internal(
        gov: &mut TribeGovernance,
        target: address,
        lifter: address,
        staff_kind: u8,
        clock: &Clock,
    ) {
        assert!(table::contains(&gov.global_bans, target), E_NOT_BANNED);
        table::remove(&mut gov.global_bans, target);
        event::emit(TribeBanLifted {
            tribe_id: gov.tribe_id,
            target,
            lifter,
            staff_kind,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    public(package) fun add_to_tribe_super_admin_revocation(gov: &mut TribeGovernance, cap_id: ID) {
        table::add(&mut gov.revoked_tribe_super_admin_cap_ids, cap_id, true);
    }

    public(package) fun add_to_tribe_admin_revocation(gov: &mut TribeGovernance, cap_id: ID) {
        table::add(&mut gov.revoked_tribe_admin_cap_ids, cap_id, true);
    }

    public(package) fun add_to_tribe_mod_revocation(gov: &mut TribeGovernance, cap_id: ID) {
        table::add(&mut gov.revoked_tribe_mod_cap_ids, cap_id, true);
    }

    public(package) fun remove_from_tribe_super_admin_revocation(gov: &mut TribeGovernance, cap_id: ID) {
        table::remove(&mut gov.revoked_tribe_super_admin_cap_ids, cap_id);
    }

    public(package) fun remove_from_tribe_admin_revocation(gov: &mut TribeGovernance, cap_id: ID) {
        table::remove(&mut gov.revoked_tribe_admin_cap_ids, cap_id);
    }

    /// Package-private: remove cap_id from the TribeModCap revocation table.
    public(package) fun remove_from_tribe_mod_revocation(gov: &mut TribeGovernance, cap_id: ID) {
        table::remove(&mut gov.revoked_tribe_mod_cap_ids, cap_id);
    }

    // Bridge fns for tribe_lifecycle module (SEC-015 / OS-49a). See tribe_lifecycle.move.
    // SPLIT-NEEDED — defer to R6.7.6
    public(package) fun set_tribe_is_active(gov: &mut TribeGovernance, active: bool) { gov.is_active = active; }
    public(package) fun set_store_visibility(gov: &mut TribeGovernance, v: u8) { gov.store_visibility = v; }
    public fun store_visibility(gov: &TribeGovernance): u8 { gov.store_visibility }
    // V35 split: widened public(package) -> public. Read-only assert (mutates nothing);
    // consumed cross-package by bazaar_mission::announcement_proxy. Matches the
    // ssu_governance assert_* public pattern.
    public fun assert_tribe_active(gov: &TribeGovernance) { assert!(gov.is_active, E_TRIBE_NOT_ACTIVE); }
    /// Error accessor for tribe_governance_caps revocation fns. Closes SEC-010 gap at code 4.
    public fun e_tribe_cap_revoked(): u64 { E_TRIBE_CAP_REVOKED }
    /// Error accessor: E_BAN_EXPIRY_IN_PAST (12). Used by tribe_governance_caps.
    public fun e_ban_expiry_in_past(): u64 { E_BAN_EXPIRY_IN_PAST }
    /// Error accessor: E_NOT_BANNED (13). Used by tribe_governance_caps.
    public fun e_not_banned(): u64 { E_NOT_BANNED }
    /// CC-04: Error accessor: E_TARGET_RANK_TOO_HIGH (14). Used by tribe_governance_caps.
    public fun e_target_rank_too_high(): u64 { E_TARGET_RANK_TOO_HIGH }
    /// Constant accessor: PERMANENT_BAN_SENTINEL. Used by tribe_governance_caps + tests.
    public fun permanent_ban_sentinel(): u64 { PERMANENT_BAN_SENTINEL }
    /// Rank constant accessors for SA-06 enforcement in tribe_governance_caps.
    public fun tribe_rank_leader(): u8      { TRIBE_RANK_LEADER }
    public fun tribe_rank_super_admin(): u8 { TRIBE_RANK_SUPER_ADMIN }
    public fun tribe_rank_admin(): u8       { TRIBE_RANK_ADMIN }
    public fun tribe_rank_mod(): u8         { TRIBE_RANK_MOD }

    // ===== V35 8a/8b: Tribe Shop Config — package-private mutators / public accessors =====
    // Mirror of ssu_governance shop limit pattern.
    // shop_items_limit is FE-advisory config only (not enforced on-chain in V35).

    /// Upsert per-role max-shops limit. max=0 means "unset" (pass 0 to clear a row).
    public(package) fun set_tribe_shop_limit_for_role(gov: &mut TribeGovernance, role: u8, max: u64) {
        if (table::contains(&gov.shop_limits_by_role, role)) {
            *table::borrow_mut(&mut gov.shop_limits_by_role, role) = max;
        } else {
            table::add(&mut gov.shop_limits_by_role, role, max);
        };
    }

    public(package) fun set_tribe_max_shops_override(gov: &mut TribeGovernance, max: Option<u64>) {
        gov.max_shops_override = max;
    }

    public(package) fun set_tribe_shop_items_limit(gov: &mut TribeGovernance, limit: u64) {
        gov.shop_items_limit = limit;
    }

    /// Returns per-role shop limit for `role` (0 if unset).
    public fun tribe_shop_limit_for_role(gov: &TribeGovernance, role: u8): u64 {
        if (table::contains(&gov.shop_limits_by_role, role)) {
            *table::borrow(&gov.shop_limits_by_role, role)
        } else { 0 }
    }

    /// Returns tribe-level per-owner max_shops_override (None = no tribe cap).
    public fun tribe_max_shops_override(gov: &TribeGovernance): &Option<u64> {
        &gov.max_shops_override
    }

    /// Returns tribe-wide shop items limit (0 = no tribe limit). FE-advisory config.
    public fun tribe_shop_items_limit(gov: &TribeGovernance): u64 {
        gov.shop_items_limit
    }

    // ===== Update Ceremony V2 Phase 2 (Slice 3): reclaim restore wrappers =====
    // Thin TribeLeaderCap-gated wrappers over existing validated primitives, used by
    // bazaar_economy::reclaim_tribe to re-materialize a tribe snapshot on a fresh tribe.

    /// Deposit lazy-drained legacy gov EVE into the fresh TribeGovernance tax_wallet during
    /// reclaim. TribeLeaderCap-gated (E_WRONG_TRIBE). NO `recipient` param (SA-RCV2-11) —
    /// destination is this tribe's own wallet. Delegates to the validated deposit_tribe_tax.
    /// The coin is the OLD-version withdraw_legacy_tribe_gov_eve composed in the reclaim PTB.
    public fun deposit_reclaimed_gov_eve(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        eve_coin: Coin<EVE>,
    ) {
        assert!(tribe_registry::cap_tribe_id(leader_cap) == gov.tribe_id, E_WRONG_TRIBE);
        deposit_tribe_tax(gov, eve_coin);
    }

    /// Restore one timed tribe-wide ban during reclaim. TribeLeaderCap-gated (E_WRONG_TRIBE).
    /// Delegates to the validated set_tribe_ban_internal, which asserts `expires_at_ms > now`
    /// (E_BAN_EXPIRY_IN_PAST); PERMANENT_BAN_SENTINEL always passes. The FE must pre-filter
    /// non-permanent bans that have already expired by reclaim time. staff_kind = 0 (Leader).
    public fun restore_tribe_ban(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        target: address,
        expires_at_ms: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(tribe_registry::cap_tribe_id(leader_cap) == gov.tribe_id, E_WRONG_TRIBE);
        set_tribe_ban_internal(gov, target, expires_at_ms, ctx.sender(), 0 /* Leader */, clock);
    }

    #[test_only]
    public(package) fun construct_for_testing(tribe_id: u64, bazaar_type: u8, leader: address, governance_mode: u8, widget_config_id_opt: Option<ID>, clock: &Clock, ctx: &mut TxContext): TribeGovernance {
        let mut gov = create_tribe_governance(tribe_id, bazaar_type, leader, governance_mode, clock, ctx);
        gov.widget_config_id = widget_config_id_opt;
        gov
    }

    /// Bypasses MAX_SUPPORTED_MODE guard. Use only for testing mode-rejection paths.
    #[test_only]
    public fun create_with_arbitrary_mode_for_testing(
        tribe_id: u64,
        bazaar_type: u8,
        leader: address,
        governance_mode: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): TribeGovernance {
        assert!(bazaar_type == 1 || bazaar_type == 2, E_NOT_EASY_OR_ADVANCED);
        construct_for_testing(tribe_id, bazaar_type, leader, governance_mode, option::none<ID>(), clock, ctx)
    }

    #[test_only]
    public fun destroy_for_testing(gov: TribeGovernance) {
        let TribeGovernance {
            id, tribe_id: _, bazaar_type: _, leader: _,
            tribe_tax_config, tax_wallet, total_tax_collected: _,
            ssu_tax_accumulated,
            global_bans, ssu_ids: _, is_active: _, created_at_ms: _,
            governance_mode: _, godot_url: _,
            store_visibility: _,
            revoked_tribe_super_admin_cap_ids,
            revoked_tribe_admin_cap_ids,
            revoked_tribe_mod_cap_ids,
            widget_config_id: _,   // OS-59: Option<ID> drops automatically (no destroy needed)
            mission_listing_fee_per_hour: _,
            max_shops_override: _,
            shop_limits_by_role,
            shop_items_limit: _,
        } = gov;
        // Session 3B: TribeTaxConfig now non-droppable (holds a Table). Explicit destructure.
        let TribeTaxConfig { role_taxes } = tribe_tax_config;
        object::delete(id);
        balance::destroy_zero(tax_wallet);
        table::drop(role_taxes);
        table::drop(ssu_tax_accumulated);
        table::drop(global_bans);
        table::drop(revoked_tribe_super_admin_cap_ids);
        table::drop(revoked_tribe_admin_cap_ids);
        table::drop(revoked_tribe_mod_cap_ids);
        table::drop(shop_limits_by_role);
    }

    #[test_only]
    public fun create_admin_cap_for_testing(tribe_id: u64, ctx: &mut TxContext): TribeAdminCap {
        TribeAdminCap { id: object::new(ctx), tribe_id }
    }

    #[test_only]
    public fun create_super_admin_cap_for_testing(tribe_id: u64, ctx: &mut TxContext): TribeSuperAdminCap {
        TribeSuperAdminCap { id: object::new(ctx), tribe_id }
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
