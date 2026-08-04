// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::ssu_governance {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::transfer;
    use sui::event;
    use sui::clock::Clock;
    use EVE::EVE::EVE;
    use sui::table::{Self, Table};
    use bazaar_core::user_storage;
    use bazaar_core::membership;
    use bazaar_core::role_tax_types::RoleTaxConfig;
    use std::string::{Self, String};
    use std::option;

    // ===== Error Codes =====
    // E_RATE_EXCEEDS_CAP retired with the flat set_ssu_tax_config fn (Session 3B).
    // Per-role cap enforcement lives in ssu_role_tax_admin::E_RATE_EXCEEDS_CAP.
    const E_WRONG_SSU: u64 = 1;
    const E_INSUFFICIENT_BALANCE: u64 = 3;
    const E_SSU_NOT_ACTIVE: u64 = 4;
    const E_ALREADY_REVOKED: u64 = 5;
    const E_NOT_REVOKED: u64 = 6;
    const E_URL_TOO_LONG: u64 = 7;
    const E_URL_EMPTY: u64 = 8;
    const E_BAN_EXPIRY_IN_PAST: u64 = 9;
    const E_NOT_BANNED: u64 = 10;
    const E_SSU_FROZEN: u64 = 11;
    const E_SUBJECT_SSU_MISMATCH: u64 = 12;
    const MAX_GODOT_URL_BYTES: u64 = 256;
    const SCOPE_SSU: u8 = 0;
    const SCOPE_TRIBE: u8 = 1;
    const STAFF_KIND_OWNER:       u8 = 0;
    const STAFF_KIND_SUPER_ADMIN: u8 = 1;
    const STAFF_KIND_ADMIN:       u8 = 2;
    const STAFF_KIND_MOD:         u8 = 3;
    // MAX_TAX_BPS retired alongside the flat setter (Session 3B). Per-tier cap
    // enforcement of MAX_TAX_PCT = 1000 (10.00%) lives in ssu_role_tax_admin.

    // ===== Structs =====
    /// Session 3B reshape: flat fields (wts_bps/wtb_bps/de_flat_fee) replaced by
    /// a Table<u8, RoleTaxConfig> indexed by role (Stranger=0 … 7). Unset rows
    /// return 0 via getters (see ssu_role_tax_admin).
    /// AUD-NT-10: surcharge_mode RETIRED at V36 (was dead config — no tax path consumed it).
    ///
    /// Abilities demoted from (store, copy, drop) to (store) only because
    /// sui::table::Table is non-copy/non-drop. This requires a fresh publish
    /// (V16 cascade carries it).
    public struct SSUTaxConfig has store {
        role_taxes: Table<u8, RoleTaxConfig>,
    }

    public struct SSUGovernance has key {
        id: UID,
        ssu_id: address,
        bazaar_type: u8,
        tribe_id: u64,
        owner: address,
        tax_config: SSUTaxConfig,
        tax_wallet: Balance<EVE>,
        total_tax_collected: u64,
        widget_config_id: ID,
        member_registry_id: ID,
        announcement_board_id: ID,
        guestbook_board_id: ID,
        quicktrade_vault_id: ID,
        wtb_escrow_pool_id: ID,
        is_active: bool,
        created_at_ms: u64,
        // APM-FP1-25: append-only revocation ledger; owner self-DoS within own scope (SDC-06).
        revoked_super_admin_cap_ids: Table<ID, bool>,
        // AP2-C / FP1-28: on-chain Godot client URL override (None = use platform default).
        godot_url: Option<String>,
        // R3.2: per-SSU ban list. addr -> expires_at_ms (absolute epoch ms). No permanent-ban sentinel.
        local_ban_list: Table<address, u64>,
        // R3.5: emergency freeze. true = all mutating entry fns abort E_SSU_FROZEN. Idempotent.
        frozen: bool,
        // R6.7.0: optional per-SSU shop cap override. None = use platform/role defaults.
        max_shops_override: Option<u64>,
        // R6.7.1 OS-44: per-role shop count limit. role (u8) -> max shops (u64). Empty at creation.
        shop_limits_by_role: Table<u8, u64>,
        // R6.7.1 OS-45: max items per shop (0 = no limit); auto-expiry duration in ms (0 = no expiry).
        shop_items_limit: u64,
        shop_auto_expiry_ms: u64,
        // Mission (MIS) per-hour listing fee charged on the SSU layer. Denomination
        // is implied by bazaar_type: raw MIST EVE for NoTribe/Easy, tribe-token units
        // for Advanced. 0 = no SSU mission fee. Set via set_ssu_mission_listing_fee.
        mission_listing_fee_per_hour: u64,
        // V41 SSU depreciation certificate (ssu-depreciation-prune-plan.md §2.2).
        // location_revealed is set true (permissionlessly, mark_ssu_revealed) once
        // world::location ever confirms this SSU was live; is_depreciated is the
        // terminal certificate set by mark_ssu_depreciated once location_revealed==true
        // AND world::location later reports none() (proof of unanchor). Both false at
        // creation; is_depreciated is set-once and never reset (plan §4 "certificate is
        // terminal").
        location_revealed: bool,
        is_depreciated: bool,
    }

    // ===== Events =====
    // SDC-003 (FP1-43): All 5 per-SSU object IDs included for frontend queryEvents resolution.
    public struct SSUGovernanceCreated has copy, drop {
        ssu_id: address,
        bazaar_type: u8,
        tribe_id: u64,
        owner: address,
        timestamp_ms: u64,
        widget_config_id: ID,
        member_registry_id: ID,
        announcement_board_id: ID,
        guestbook_board_id: ID,
        quicktrade_vault_id: ID,
        wtb_escrow_pool_id: ID,
    }

    // SSUTaxConfigUpdated event retired (Session 3B). Per-role events live in
    // ssu_role_tax_admin: SSURoleTaxUpdated / SSURoleTaxCleared / SSUTaxBatchUpdated.

    /// Emitted when a ban is issued via any ssu_ban_as_* entry fn.
    /// staff_kind: 0=Owner, 1=SuperAdmin, 2=Admin, 3=Mod (STAFF_KIND_* constants).
    public struct BanIssued has copy, drop {
        ssu_id: address,
        target: address,
        expires_at_ms: u64,
        issuer: address,
        staff_kind: u8,
        timestamp_ms: u64,
    }

    /// Emitted when a ban is lifted via any ssu_unban_as_* entry fn.
    public struct BanLifted has copy, drop {
        ssu_id: address,
        target: address,
        lifter: address,
        staff_kind: u8,
        timestamp_ms: u64,
    }

    /// Emitted when the per-hour Mission (MIS) listing fee is set on the SSU layer.
    public struct SSUMissionListingFeeUpdated has copy, drop {
        ssu_id: address,
        fee_per_hour: u64,
        actor: address,
        timestamp_ms: u64,
    }

    public struct SSUFrozen has copy, drop { ssu_id: address, frozen_by: address, timestamp_ms: u64 }
    public struct SSUUnfrozen has copy, drop { ssu_id: address, unfrozen_by: address, timestamp_ms: u64 }

    /// Emitted when an SSU or Tribe godot_url is set or cleared.
    /// scope: 0 = SSU, 1 = Tribe (SCOPE_SSU / SCOPE_TRIBE constants).
    public struct GodotUrlChangedEvent has copy, drop {
        scope: u8,
        target_id: address,
        target_tribe_id: u64,
        old_url_some: bool,
        new_url_some: bool,
        new_url: Option<String>,
        actor: address,
        timestamp_ms: u64,
    }

    // ===== Creation =====
    public(package) fun create_ssu_governance(
        ssu_id: address,
        bazaar_type: u8,
        tribe_id: u64,
        owner: address,
        widget_config_id: ID,
        member_registry_id: ID,
        announcement_board_id: ID,
        guestbook_board_id: ID,
        quicktrade_vault_id: ID,
        wtb_escrow_pool_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ): SSUGovernance {
        let ts = clock.timestamp_ms();
        event::emit(SSUGovernanceCreated {
            ssu_id, bazaar_type, tribe_id, owner, timestamp_ms: ts,
            widget_config_id,
            member_registry_id,
            announcement_board_id,
            guestbook_board_id,
            quicktrade_vault_id,
            wtb_escrow_pool_id,
        });
        SSUGovernance {
            id: object::new(ctx),
            ssu_id, bazaar_type, tribe_id, owner,
            tax_config: SSUTaxConfig {
                role_taxes: table::new(ctx),
            },
            tax_wallet: balance::zero(),
            total_tax_collected: 0,
            widget_config_id,
            member_registry_id,
            announcement_board_id,
            guestbook_board_id,
            quicktrade_vault_id,
            wtb_escrow_pool_id,
            is_active: true,
            created_at_ms: ts,
            revoked_super_admin_cap_ids: table::new(ctx),
            godot_url: option::none<String>(),
            local_ban_list: table::new(ctx),
            frozen: false,
            max_shops_override: option::none<u64>(),
            shop_limits_by_role: table::new(ctx),
            shop_items_limit: 0,
            shop_auto_expiry_ms: 0,
            mission_listing_fee_per_hour: 0,
            location_revealed: false,
            is_depreciated: false,
        }
    }

    // ===== Owner Functions =====
    // set_ssu_tax_config retired (Session 3B). Per-role setters live in
    // bazaar_core::ssu_role_tax_admin:
    //   - set_ssu_role_tax     — single row upsert
    //   - clear_ssu_role_tax   — row removal
    //   - set_ssu_taxes_batch  — N-row upsert in one TX
    //   - set_ssu_tax_uniform  — write all 8 roles to the same RoleTaxConfig

    /// Session 3B: package-private accessor to the per-role tax table.
    /// Used by ssu_role_tax_admin (setters/getters). Returns &Table for
    /// read-only callers.
    public(package) fun borrow_role_taxes(gov: &SSUGovernance): &Table<u8, RoleTaxConfig> {
        &gov.tax_config.role_taxes
    }

    /// Session 3B: package-private mutable accessor to the per-role tax table.
    /// Used by ssu_role_tax_admin setters.
    public(package) fun borrow_role_taxes_mut(gov: &mut SSUGovernance): &mut Table<u8, RoleTaxConfig> {
        &mut gov.tax_config.role_taxes
    }

    /// SSU re-registration rebind: sync bazaar_type + tribe_id to the CURRENT
    /// SSURegistration after a deregister → re-register cycle. Bare setter by
    /// design — ALL guards (registration match, owner unchanged, zero active
    /// shops, not frozen) live in bazaar_core::ssu_rebind, the only caller.
    public(package) fun set_binding(gov: &mut SSUGovernance, new_bazaar_type: u8, new_tribe_id: u64) {
        gov.bazaar_type = new_bazaar_type;
        gov.tribe_id = new_tribe_id;
    }

    // ===== Godot URL Management (AP2-C / FP1-28) =====

    /// Set or replace the SSU-level Godot client URL.
    /// Pass Option::none<String>() to clear. Pass Option::some(url) to set.
    /// Rejects empty string (MA-OQ-1) and URLs > 256 bytes.
    public entry fun set_ssu_godot_url(
        gov: &mut SSUGovernance,
        url: Option<String>,
        owner_cap: &membership::SSUOwnerCap,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert_not_frozen(gov);
        assert_subject_in_governance(gov, gov.ssu_id);
        assert!(membership::cap_ssu_id(owner_cap) == gov.ssu_id, E_WRONG_SSU);
        assert_active(gov);
        if (option::is_some(&url)) {
            let s_ref = option::borrow(&url);
            assert!(!string::is_empty(s_ref), E_URL_EMPTY);
            assert!(string::length(s_ref) <= MAX_GODOT_URL_BYTES, E_URL_TOO_LONG);
        };
        let old_some = option::is_some(&gov.godot_url);
        let new_some = option::is_some(&url);
        gov.godot_url = url;
        let emitted_url = if (new_some) {
            option::some(*option::borrow(&gov.godot_url))
        } else {
            option::none<String>()
        };
        event::emit(GodotUrlChangedEvent {
            scope: SCOPE_SSU,
            target_id: gov.ssu_id,
            target_tribe_id: 0,
            old_url_some: old_some,
            new_url_some: new_some,
            new_url: emitted_url,
            actor: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Set the per-hour Mission (MIS) listing fee charged on the SSU layer.
    /// Denomination implied by bazaar_type (raw MIST EVE for NoTribe/Easy,
    /// tribe-token units for Advanced). Owner-gated. 0 disables the SSU mission fee.
    public entry fun set_ssu_mission_listing_fee(
        gov: &mut SSUGovernance,
        fee_per_hour: u64,
        owner_cap: &membership::SSUOwnerCap,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert_not_frozen(gov);
        assert!(membership::cap_ssu_id(owner_cap) == gov.ssu_id, E_WRONG_SSU);
        assert_active(gov);
        gov.mission_listing_fee_per_hour = fee_per_hour;
        event::emit(SSUMissionListingFeeUpdated {
            ssu_id: gov.ssu_id,
            fee_per_hour,
            actor: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Clear the SSU-level Godot URL (convenience wrapper — delegates to set_ssu_godot_url).
    public entry fun clear_ssu_godot_url(
        gov: &mut SSUGovernance,
        owner_cap: &membership::SSUOwnerCap,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        set_ssu_godot_url(gov, option::none<String>(), owner_cap, clock, ctx);
    }

    // ===== Accessors =====
    // Flat tax getters (ssu_wts_tax_bps / ssu_wtb_tax_bps / ssu_de_flat_fee)
    // retired (Session 3B). Use ssu_role_tax_admin::ssu_{wts,wtb}_pct_for_role
    // and ssu_role_tax_admin::ssu_de_flat_fee_for_role instead.
    public fun ssu_tax_balance(gov: &SSUGovernance): u64 { gov.tax_wallet.value() }
    public fun ssu_bazaar_type(gov: &SSUGovernance): u8 { gov.bazaar_type }
    public fun ssu_tribe_id(gov: &SSUGovernance): u64 { gov.tribe_id }
    public fun ssu_is_active(gov: &SSUGovernance): bool { gov.is_active }
    public fun ssu_id(gov: &SSUGovernance): address { gov.ssu_id }
    public fun shop_items_limit(gov: &SSUGovernance): u64 { gov.shop_items_limit }
    public fun shop_auto_expiry_ms(gov: &SSUGovernance): u64 { gov.shop_auto_expiry_ms }
    public fun ssu_owner(gov: &SSUGovernance): address { gov.owner }
    public fun widget_config_id(gov: &SSUGovernance): ID { gov.widget_config_id }
    public fun ssu_governance_ssu_id(gov: &SSUGovernance): address { gov.ssu_id }
    public fun ssu_godot_url(gov: &SSUGovernance): &Option<String> { &gov.godot_url }
    public fun ssu_member_registry_id(gov: &SSUGovernance): ID { gov.member_registry_id }
    public fun ssu_announcement_board_id(gov: &SSUGovernance): ID { gov.announcement_board_id }
    public fun ssu_guestbook_board_id(gov: &SSUGovernance): ID { gov.guestbook_board_id }
    public fun ssu_quicktrade_vault_id(gov: &SSUGovernance): ID { gov.quicktrade_vault_id }
    public fun ssu_wtb_escrow_pool_id(gov: &SSUGovernance): ID { gov.wtb_escrow_pool_id }
    public fun ssu_mission_listing_fee_per_hour(gov: &SSUGovernance): u64 { gov.mission_listing_fee_per_hour }
    /// V41 depreciation certificate getters. bazaar_core::ssu_depreciation is the ONLY
    /// writer (via set_location_revealed/set_depreciated below). Safe as bare `public` --
    /// read-only, and cross-package Phase-B prune entries (bazaar_shop_ops/bazaar_mission/
    /// bazaar_economy) must gate on is_depreciated without a bazaar_core wrapper hop.
    public fun location_revealed(gov: &SSUGovernance): bool { gov.location_revealed }
    public fun is_depreciated(gov: &SSUGovernance): bool { gov.is_depreciated }
    public fun scope_ssu(): u8 { SCOPE_SSU }
    public fun scope_tribe(): u8 { SCOPE_TRIBE }

    /// Returns per-role shop limit for given role; 0 if not set.
    public fun shop_limit_for_role(gov: &SSUGovernance, role: u8): u64 {
        if (table::contains(&gov.shop_limits_by_role, role)) {
            *table::borrow(&gov.shop_limits_by_role, role)
        } else { 0 }
    }

    /// R6.7.6 OS-35: Returns per-SSU max_shops_override. None = no SSU-level cap.
    /// Used by bazar::assert_shop_limit_ok to enforce the SSU-level shop count ceiling.
    public fun max_shops_override(gov: &SSUGovernance): &Option<u64> {
        &gov.max_shops_override
    }

    // ===== Revocation, Tax Wallet, and Shop Config Helpers =====

    /// Adds cap_id to revocation table. Aborts E_ALREADY_REVOKED if already present.
    public(package) fun add_to_revocation_table(gov: &mut SSUGovernance, cap_id: ID) {
        assert!(
            !table::contains(&gov.revoked_super_admin_cap_ids, cap_id),
            E_ALREADY_REVOKED,
        );
        table::add(&mut gov.revoked_super_admin_cap_ids, cap_id, true);
    }

    /// Returns true if cap_id is in the revocation table.
    public fun is_cap_revoked(gov: &SSUGovernance, cap_id: ID): bool {
        table::contains(&gov.revoked_super_admin_cap_ids, cap_id)
    }

    /// Add balance to tax_wallet. Called by ssu_treasury::deposit_ssu_tax.
    public(package) fun add_to_tax_wallet(gov: &mut SSUGovernance, bal: Balance<EVE>) {
        gov.tax_wallet.join(bal);
    }

    /// Split `amount` from tax_wallet. Aborts E_INSUFFICIENT_BALANCE if insufficient.
    public(package) fun withdraw_from_tax_wallet(gov: &mut SSUGovernance, amount: u64): Balance<EVE> {
        gov.tax_wallet.split(amount)
    }

    /// UpdateCeremonyPlan v1 — view accessor consumed by ssu_admin_drain entries
    /// (`drain_ssu_eve` Variant B + `withdraw_legacy_ssu_eve` user) so they can pre-read
    /// the balance value before establishing the &mut withdraw chain.
    public fun tax_wallet_value(gov: &SSUGovernance): u64 { gov.tax_wallet.value() }

    /// Increment total_tax_collected counter. Called by ssu_treasury::deposit_ssu_tax.
    public(package) fun increment_total_tax_collected(gov: &mut SSUGovernance, amount: u64) {
        gov.total_tax_collected = gov.total_tax_collected + amount;
    }

    /// Set shop limit for role. Called by ssu_shop_config.
    public(package) fun set_shop_limit_for_role(gov: &mut SSUGovernance, role: u8, max: u64) {
        if (table::contains(&gov.shop_limits_by_role, role)) {
            *table::borrow_mut(&mut gov.shop_limits_by_role, role) = max;
        } else {
            table::add(&mut gov.shop_limits_by_role, role, max);
        };
    }

    public(package) fun set_shop_items_limit(gov: &mut SSUGovernance, limit: u64) { gov.shop_items_limit = limit; }
    public(package) fun set_shop_auto_expiry_ms(gov: &mut SSUGovernance, expiry_ms: u64) { gov.shop_auto_expiry_ms = expiry_ms; }
    public(package) fun set_max_shops_override(gov: &mut SSUGovernance, max: Option<u64>) { gov.max_shops_override = max; }

    /// V41 depreciation certificate setters -- package-private; the ONLY caller is
    /// bazaar_core::ssu_depreciation (mark_ssu_revealed / mark_ssu_depreciated), which
    /// enforces the world::location proof-of-death predicate (plan §1). set_depreciated
    /// also flips is_active=false -- a depreciated SSU is closed by definition (CR-DEP-07
    /// additionally blocks ssu_guarded_ops::set_ssu_active_as_owner from ever reversing
    /// this via the owner reactivate path).
    public(package) fun set_location_revealed(gov: &mut SSUGovernance, revealed: bool) {
        gov.location_revealed = revealed;
    }
    public(package) fun set_depreciated(gov: &mut SSUGovernance) {
        gov.is_depreciated = true;
        gov.is_active = false;
    }

    // ===== Error Code Accessors =====
    public fun e_wrong_ssu(): u64 { E_WRONG_SSU }
    public fun e_not_revoked(): u64 { E_NOT_REVOKED }
    public fun e_ban_expiry_in_past(): u64 { E_BAN_EXPIRY_IN_PAST }
    public fun e_not_banned(): u64 { E_NOT_BANNED }
    public fun e_ssu_frozen(): u64 { E_SSU_FROZEN }
    public fun e_subject_ssu_mismatch(): u64 { E_SUBJECT_SSU_MISMATCH }
    public fun e_ssu_not_active(): u64 { E_SSU_NOT_ACTIVE }

    // ===== Ban Internal Helpers (R3.2) — moderation works during freeze =====
    public(package) fun set_ban_internal(
        gov: &mut SSUGovernance,
        target: address,
        expires_at_ms: u64,
        issuer: address,
        staff_kind: u8,
        clock: &Clock,
    ) {
        assert!(expires_at_ms > clock.timestamp_ms(), E_BAN_EXPIRY_IN_PAST);
        if (table::contains(&gov.local_ban_list, target)) {
            *table::borrow_mut(&mut gov.local_ban_list, target) = expires_at_ms;
        } else {
            table::add(&mut gov.local_ban_list, target, expires_at_ms);
        };
        event::emit(BanIssued {
            ssu_id: gov.ssu_id,
            target,
            expires_at_ms,
            issuer,
            staff_kind,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    public(package) fun unban_internal(
        gov: &mut SSUGovernance,
        target: address,
        lifter: address,
        staff_kind: u8,
        clock: &Clock,
    ) {
        assert!(table::contains(&gov.local_ban_list, target), E_NOT_BANNED);
        table::remove(&mut gov.local_ban_list, target);
        event::emit(BanLifted {
            ssu_id: gov.ssu_id,
            target,
            lifter,
            staff_kind,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    // ===== Freeze / Active Helpers (R3.5) =====
    // assert_not_frozen: D-R3.5-05 / SA-R3-01. assert_active: Decision-2 SEC-013 gate.

    // Widened public(package) -> public for the bazaar_mission package split (read-only asserts; MA-mission-split-design §3).
    public fun assert_not_frozen(gov: &SSUGovernance) { assert!(!gov.frozen, E_SSU_FROZEN); }
    public fun assert_active(gov: &SSUGovernance) { assert!(gov.is_active, E_SSU_NOT_ACTIVE); }
    public fun assert_subject_in_governance(gov: &SSUGovernance, subject_ssu_id: address) {
        assert!(gov.ssu_id == subject_ssu_id, E_SUBJECT_SSU_MISMATCH);
    }
    public fun is_frozen(gov: &SSUGovernance): bool { gov.frozen }

    // ===== SSU Freeze / Unfreeze (R3.5) =====
    // freeze_ssu: idempotent kill-switch (D-R3.5-02/SA-R3-03); revoked cap rejected (FP1-25).

    public entry fun freeze_ssu(
        cap: &membership::SSUSuperAdminCap,
        gov: &mut SSUGovernance,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            membership::ssu_super_admin_cap_ssu_id(cap) == gov.ssu_id
                && !is_cap_revoked(gov, object::id(cap)),
            E_WRONG_SSU,
        );
        gov.frozen = true;
        event::emit(SSUFrozen { ssu_id: gov.ssu_id, frozen_by: ctx.sender(), timestamp_ms: clock.timestamp_ms() });
    }

    public entry fun unfreeze_ssu(
        cap: &membership::SSUSuperAdminCap,
        gov: &mut SSUGovernance,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            membership::ssu_super_admin_cap_ssu_id(cap) == gov.ssu_id
                && !is_cap_revoked(gov, object::id(cap)),
            E_WRONG_SSU,
        );
        gov.frozen = false;
        event::emit(SSUUnfrozen { ssu_id: gov.ssu_id, unfrozen_by: ctx.sender(), timestamp_ms: clock.timestamp_ms() });
    }

    public entry fun unfreeze_ssu_as_owner(
        cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::cap_ssu_id(cap) == gov.ssu_id, E_WRONG_SSU);
        gov.frozen = false;
        event::emit(SSUUnfrozen { ssu_id: gov.ssu_id, unfrozen_by: ctx.sender(), timestamp_ms: clock.timestamp_ms() });
    }

    /// Returns true iff addr is in the ban table and the ban has not expired (R3.2).
    public fun is_banned(gov: &SSUGovernance, addr: address, clock: &Clock): bool {
        if (!table::contains(&gov.local_ban_list, addr)) return false;
        let expiry = *table::borrow(&gov.local_ban_list, addr);
        clock.timestamp_ms() < expiry
    }

    public(package) fun set_active(gov: &mut SSUGovernance, active: bool) { gov.is_active = active; }
    public(package) fun share(gov: SSUGovernance) { transfer::share_object(gov); }

    // ===== Update Ceremony V2 Phase 2 (Slice 3): reclaim restore wrappers =====
    // Thin SSUOwnerCap-gated wrappers over existing validated primitives, used by
    // bazaar_mission::reclaim_ssu to re-materialize a snapshot on a fresh SSU shell.

    /// Restore one timed local ban during SSU reclaim. SSUOwnerCap-gated (the SSU owner
    /// holds the freshly-minted cap). Delegates to the validated set_ban_internal, which
    /// asserts `expires_at_ms > now` (E_BAN_EXPIRY_IN_PAST) — the FE must pre-filter bans
    /// that have already expired by reclaim time. issuer = owner, staff_kind = OWNER.
    public fun restore_local_ban(
        owner_cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        target: address,
        expires_at_ms: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(membership::cap_ssu_id(owner_cap) == gov.ssu_id, E_WRONG_SSU);
        set_ban_internal(gov, target, expires_at_ms, ctx.sender(), STAFF_KIND_OWNER, clock);
    }

    /// Deposit lazy-drained legacy EVE into the fresh SSU gov tax_wallet during reclaim.
    /// SSUOwnerCap-gated. NO `recipient` param (SA-RCV2-11) — the destination is derived
    /// internally (this gov's own wallet). The coin is the OLD-version withdraw_legacy_ssu_eve
    /// (+ WTB residual) composed in the reclaim PTB.
    public fun deposit_reclaimed_eve(
        owner_cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        eve_coin: Coin<EVE>,
    ) {
        assert!(membership::cap_ssu_id(owner_cap) == gov.ssu_id, E_WRONG_SSU);
        add_to_tax_wallet(gov, coin::into_balance(eve_coin));
    }

    // ===== Test-Only Factories =====
    // create_for_testing* moved to ssu_governance_test_helpers.move (R3.5 carve-out).
    // destroy_for_testing stays here (requires private-field destructure access).

    #[test_only]
    public fun destroy_for_testing(gov: SSUGovernance) {
        let SSUGovernance {
            id, ssu_id: _, bazaar_type: _, tribe_id: _, owner: _,
            tax_config, tax_wallet, total_tax_collected: _,
            widget_config_id: _, member_registry_id: _,
            announcement_board_id: _, guestbook_board_id: _,
            quicktrade_vault_id: _,
            wtb_escrow_pool_id: _,
            is_active: _, created_at_ms: _,
            revoked_super_admin_cap_ids, godot_url: _,
            local_ban_list, frozen: _,
            max_shops_override: _,
            shop_limits_by_role,
            shop_items_limit: _, shop_auto_expiry_ms: _,
            mission_listing_fee_per_hour: _,
            location_revealed: _, is_depreciated: _,
        } = gov;
        // Session 3B: SSUTaxConfig now non-droppable (holds a Table). Explicit destructure.
        let SSUTaxConfig { role_taxes } = tax_config;
        object::delete(id);
        balance::destroy_zero(tax_wallet);
        table::drop(role_taxes);
        table::drop(revoked_super_admin_cap_ids);
        table::drop(local_ban_list);
        table::drop(shop_limits_by_role);
    }

    /// CC-B1-01: Test-only setter for SSU timed-ban entries. Inserts or overwrites the
    /// expires_at_ms value for `addr` in the local_ban_list. Publish-stripped (test-only).
    #[test_only]
    public fun set_local_ban_for_testing(
        gov: &mut SSUGovernance,
        addr: address,
        expires_at_ms: u64,
    ) {
        if (table::contains(&gov.local_ban_list, addr)) {
            *table::borrow_mut(&mut gov.local_ban_list, addr) = expires_at_ms;
        } else {
            table::add(&mut gov.local_ban_list, addr, expires_at_ms);
        };
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
