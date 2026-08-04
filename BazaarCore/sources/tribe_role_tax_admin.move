// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Per-role tax admin surface for TribeGovernance (Session 3B 2026-05-13).
///
/// Mirror of bazaar_core::ssu_role_tax_admin for the tribe side.
/// Replaces the legacy flat `tribe_governance::set_tribe_tax_config` setter
/// and three flat getters (`tribe_wts_tax_bps` / `tribe_wtb_tax_bps` /
/// `tribe_de_flat_fee`). All per-role read/write of
/// `TribeTaxConfig.role_taxes: Table<u8, RoleTaxConfig>` goes through here.
///
/// Unit convention identical to SSU admin module:
///   - `wts_pct` / `wtb_pct`: percentage stored ×100 (525 = 5.25%).
///   - `de_flat_fee`: flat EVE fee in base units.
///   - Per-tier cap: MAX_TAX_PCT = 1000 (= 10.00%).
///
/// Auth: TribeLeaderCap scoped to the same tribe as the governance object.
/// Cap-routing assertions mirror the deleted `set_tribe_tax_config`:
///   (a) bazaar-type gate (Easy or Advanced) — R5.2.b.1 invariant preserved
///   (b) tribe-active check
///   (c) cap-tribe-id binding
module bazaar_core::tribe_role_tax_admin {
    use sui::table;
    use sui::event;
    use sui::clock::Clock;
    use dapp_hub::tribe_registry;
    use dapp_hub::tribe_registry::TribeLeaderCap;
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::role_tax_types::{Self, RoleTaxConfig};
    use bazaar_core::bazaar_assertions;

    // ===== Error Codes =====
    const E_WRONG_TRIBE: u64 = 1;
    const E_RATE_EXCEEDS_CAP: u64 = 2;
    const E_LENGTH_MISMATCH: u64 = 3;
    const E_INVALID_ROLE: u64 = 4;
    const E_TRIBE_NOT_ACTIVE: u64 = 10;   // mirrors tribe_governance::E_TRIBE_NOT_ACTIVE

    // ===== Constants =====
    const MAX_TAX_PCT: u64 = 1000;        // 10.00%
    const MAX_ROLE: u8 = 7;
    const TOTAL_ROLES: u8 = 8;
    const MAX_DE_FLAT_FEE:        u64 = 1_000_000_000_000;
    const E_FLAT_FEE_EXCEEDS_CAP: u64 = 5;  // tribe module: 1-4 used; 5 free

    // ===== Events =====
    public struct TribeRoleTaxUpdated has copy, drop {
        tribe_id: u64,
        role: u8,
        wts_pct: u64,
        wtb_pct: u64,
        de_flat_fee: u64,
        updated_by: address,
        timestamp_ms: u64,
    }

    public struct TribeRoleTaxCleared has copy, drop {
        tribe_id: u64,
        role: u8,
        cleared_by: address,
        timestamp_ms: u64,
    }

    public struct TribeTaxBatchUpdated has copy, drop {
        tribe_id: u64,
        role_count: u64,
        updated_by: address,
        timestamp_ms: u64,
    }

    // ===== Public Setters =====

    public entry fun set_tribe_role_tax(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        role: u8,
        wts_pct: u64,
        wtb_pct: u64,
        de_flat_fee: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert_cap_ok(leader_cap, gov);
        assert_pct_ok(wts_pct, wtb_pct);
        assert_de_fee_ok(de_flat_fee);
        assert!(role <= MAX_ROLE, E_INVALID_ROLE);
        let cfg = role_tax_types::new(wts_pct, wtb_pct, de_flat_fee);
        upsert_role(gov, role, cfg);
        event::emit(TribeRoleTaxUpdated {
            tribe_id: tribe_governance::tribe_id(gov),
            role,
            wts_pct,
            wtb_pct,
            de_flat_fee,
            updated_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    public entry fun clear_tribe_role_tax(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        role: u8,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert_cap_ok(leader_cap, gov);
        assert!(role <= MAX_ROLE, E_INVALID_ROLE);
        let role_taxes = tribe_governance::borrow_role_taxes_mut(gov);
        if (table::contains(role_taxes, role)) {
            let _ = table::remove(role_taxes, role);
        };
        event::emit(TribeRoleTaxCleared {
            tribe_id: tribe_governance::tribe_id(gov),
            role,
            cleared_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    public entry fun set_tribe_taxes_batch(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        roles: vector<u8>,
        wts_pcts: vector<u64>,
        wtb_pcts: vector<u64>,
        de_flat_fees: vector<u64>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert_cap_ok(leader_cap, gov);
        let n = vector::length(&roles);
        assert!(vector::length(&wts_pcts) == n, E_LENGTH_MISMATCH);
        assert!(vector::length(&wtb_pcts) == n, E_LENGTH_MISMATCH);
        assert!(vector::length(&de_flat_fees) == n, E_LENGTH_MISMATCH);
        let mut i = 0;
        while (i < n) {
            let role = *vector::borrow(&roles, i);
            let wts = *vector::borrow(&wts_pcts, i);
            let wtb = *vector::borrow(&wtb_pcts, i);
            let de = *vector::borrow(&de_flat_fees, i);
            assert!(role <= MAX_ROLE, E_INVALID_ROLE);
            assert_pct_ok(wts, wtb);
            assert_de_fee_ok(de);
            let cfg = role_tax_types::new(wts, wtb, de);
            upsert_role(gov, role, cfg);
            i = i + 1;
        };
        event::emit(TribeTaxBatchUpdated {
            tribe_id: tribe_governance::tribe_id(gov),
            role_count: n,
            updated_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    public entry fun set_tribe_tax_uniform(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        wts_pct: u64,
        wtb_pct: u64,
        de_flat_fee: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert_cap_ok(leader_cap, gov);
        assert_pct_ok(wts_pct, wtb_pct);
        assert_de_fee_ok(de_flat_fee);
        let cfg = role_tax_types::new(wts_pct, wtb_pct, de_flat_fee);
        let mut role: u8 = 0;
        while (role < TOTAL_ROLES) {
            upsert_role(gov, role, cfg);
            role = role + 1;
        };
        event::emit(TribeTaxBatchUpdated {
            tribe_id: tribe_governance::tribe_id(gov),
            role_count: (TOTAL_ROLES as u64),
            updated_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    // ===== Public Getters =====

    public fun tribe_wts_pct_for_role(gov: &TribeGovernance, role: u8): u64 {
        let role_taxes = tribe_governance::borrow_role_taxes(gov);
        if (table::contains(role_taxes, role)) {
            role_tax_types::wts_pct(table::borrow(role_taxes, role))
        } else { 0 }
    }

    public fun tribe_wtb_pct_for_role(gov: &TribeGovernance, role: u8): u64 {
        let role_taxes = tribe_governance::borrow_role_taxes(gov);
        if (table::contains(role_taxes, role)) {
            role_tax_types::wtb_pct(table::borrow(role_taxes, role))
        } else { 0 }
    }

    public fun tribe_de_flat_fee_for_role(gov: &TribeGovernance, role: u8): u64 {
        let role_taxes = tribe_governance::borrow_role_taxes(gov);
        if (table::contains(role_taxes, role)) {
            role_tax_types::de_flat_fee(table::borrow(role_taxes, role))
        } else { 0 }
    }

    public fun tribe_role_tax(gov: &TribeGovernance, role: u8): RoleTaxConfig {
        let role_taxes = tribe_governance::borrow_role_taxes(gov);
        if (table::contains(role_taxes, role)) {
            *table::borrow(role_taxes, role)
        } else {
            role_tax_types::zero()
        }
    }

    public fun tribe_has_role_tax(gov: &TribeGovernance, role: u8): bool {
        let role_taxes = tribe_governance::borrow_role_taxes(gov);
        table::contains(role_taxes, role)
    }

    // ===== Internal Helpers =====

    fun assert_cap_ok(leader_cap: &TribeLeaderCap, gov: &TribeGovernance) {
        // R5.2.b.1: bazaar-type gate (Easy or Advanced) — preserved from
        // legacy set_tribe_tax_config.
        bazaar_assertions::assert_easy_or_advanced(tribe_governance::tribe_bazaar_type(gov));
        // SEC-015 active-check preserved.
        tribe_governance::assert_tribe_active(gov);
        // Cap-tribe-id binding.
        assert!(
            tribe_registry::cap_tribe_id(leader_cap) == tribe_governance::tribe_id(gov),
            E_WRONG_TRIBE,
        );
    }

    fun assert_pct_ok(wts_pct: u64, wtb_pct: u64) {
        assert!(wts_pct <= MAX_TAX_PCT, E_RATE_EXCEEDS_CAP);
        assert!(wtb_pct <= MAX_TAX_PCT, E_RATE_EXCEEDS_CAP);
    }

    fun assert_de_fee_ok(de_flat_fee: u64) {
        assert!(de_flat_fee <= MAX_DE_FLAT_FEE, E_FLAT_FEE_EXCEEDS_CAP);
    }

    fun upsert_role(gov: &mut TribeGovernance, role: u8, cfg: RoleTaxConfig) {
        let role_taxes = tribe_governance::borrow_role_taxes_mut(gov);
        if (table::contains(role_taxes, role)) {
            let existing = table::borrow_mut(role_taxes, role);
            *existing = cfg;
        } else {
            table::add(role_taxes, role, cfg);
        };
    }

    // ===== Error Code + Constant Accessors (for tests) =====
    public fun max_tax_pct(): u64 { MAX_TAX_PCT }
    public fun max_role(): u8 { MAX_ROLE }
    public fun e_wrong_tribe(): u64 { E_WRONG_TRIBE }
    public fun e_rate_exceeds_cap(): u64 { E_RATE_EXCEEDS_CAP }
    public fun e_length_mismatch(): u64 { E_LENGTH_MISMATCH }
    public fun e_invalid_role(): u64 { E_INVALID_ROLE }
    public fun e_tribe_not_active(): u64 { E_TRIBE_NOT_ACTIVE }
    public fun e_flat_fee_exceeds_cap(): u64 { E_FLAT_FEE_EXCEEDS_CAP }
    public fun max_de_flat_fee(): u64 { MAX_DE_FLAT_FEE }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
