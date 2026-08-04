// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Per-role tax admin surface for SSUGovernance (Session 3B 2026-05-13).
///
/// Replaces the legacy flat `ssu_governance::set_ssu_tax_config` setter and
/// three flat getters (`ssu_wts_tax_bps` / `ssu_wtb_tax_bps` /
/// `ssu_de_flat_fee`). All per-role read/write of
/// `SSUTaxConfig.role_taxes: Table<u8, RoleTaxConfig>` goes through this module.
///
/// Unit convention:
///   - `wts_pct` / `wtb_pct`: percentage stored ×100. 525 represents 5.25%.
///   - `de_flat_fee`: flat EVE fee in base units (not a percentage).
///   - Per-tier cap: MAX_TAX_PCT = 1000 (= 10.00%). Mirror of legacy bps cap.
///
/// Auth: SSUOwnerCap scoped to the same SSU as the governance object.
/// Cap-routing assertions mirror the deleted `set_ssu_tax_config` exactly
/// (cap-SSU binding + assert_not_frozen + assert_active +
/// assert_subject_in_governance).
module bazaar_core::ssu_role_tax_admin {
    use sui::table;
    use sui::event;
    use sui::clock::Clock;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::role_tax_types::{Self, RoleTaxConfig};
    use bazaar_core::membership::{Self, SSUOwnerCap};

    // ===== Error Codes =====
    const E_WRONG_SSU: u64 = 1;
    const E_RATE_EXCEEDS_CAP: u64 = 2;
    const E_LENGTH_MISMATCH: u64 = 3;
    const E_INVALID_ROLE: u64 = 4;

    // ===== Constants =====
    /// Per-tier cap on tax percentage. 1000 = 10.00% (preserves the legacy
    /// MAX_TAX_BPS=1000 economic guardrail; both numbers are identical when
    /// the conceptual unit is "pct ×100").
    const MAX_TAX_PCT: u64 = 1000;
    const MAX_DE_FLAT_FEE:        u64 = 1_000_000_000_000; // AUD-NT-11: 1M SUI max
    const E_FLAT_FEE_EXCEEDS_CAP: u64 = 5;                 // 1-4 used; 5 is free

    /// Highest role index permitted in the per-role table. Stranger=0 …
    /// up to 7 inclusive. Mirrors membership::set_ssu_role's 1..=7 range
    /// but admits role 0 here so SSU owners can explicitly tax Strangers.
    const MAX_ROLE: u8 = 7;

    /// Convenience for `set_ssu_tax_uniform`: write all 8 roles in one TX.
    const TOTAL_ROLES: u8 = 8;

    // ===== Events =====
    public struct SSURoleTaxUpdated has copy, drop {
        ssu_id: address,
        role: u8,
        wts_pct: u64,
        wtb_pct: u64,
        de_flat_fee: u64,
        updated_by: address,
        timestamp_ms: u64,
    }

    public struct SSURoleTaxCleared has copy, drop {
        ssu_id: address,
        role: u8,
        cleared_by: address,
        timestamp_ms: u64,
    }

    public struct SSUTaxBatchUpdated has copy, drop {
        ssu_id: address,
        role_count: u64,
        updated_by: address,
        timestamp_ms: u64,
    }

    // ===== Public Setters =====

    /// Upsert a single per-role tax row.
    /// Aborts:
    ///   E_WRONG_SSU (1)         cap scoped to a different SSU than gov
    ///   E_RATE_EXCEEDS_CAP (2)  wts_pct or wtb_pct > MAX_TAX_PCT (10.00%)
    ///   E_INVALID_ROLE (4)      role > 7
    ///   ssu_governance::E_SSU_FROZEN / E_SSU_NOT_ACTIVE / E_SUBJECT_SSU_MISMATCH
    ///                           via assert_* helpers
    public entry fun set_ssu_role_tax(
        cap: &SSUOwnerCap,
        gov: &mut SSUGovernance,
        role: u8,
        wts_pct: u64,
        wtb_pct: u64,
        de_flat_fee: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert_cap_ok(cap, gov);
        assert_pct_ok(wts_pct, wtb_pct);
        assert_de_fee_ok(de_flat_fee);
        assert!(role <= MAX_ROLE, E_INVALID_ROLE);
        let cfg = role_tax_types::new(wts_pct, wtb_pct, de_flat_fee);
        upsert_role(gov, role, cfg);
        event::emit(SSURoleTaxUpdated {
            ssu_id: ssu_governance::ssu_id(gov),
            role,
            wts_pct,
            wtb_pct,
            de_flat_fee,
            updated_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Clear a single per-role tax row (revert to 0 default).
    /// Idempotent: no-op (still emits event) if row not present.
    public entry fun clear_ssu_role_tax(
        cap: &SSUOwnerCap,
        gov: &mut SSUGovernance,
        role: u8,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert_cap_ok(cap, gov);
        assert!(role <= MAX_ROLE, E_INVALID_ROLE);
        let role_taxes = ssu_governance::borrow_role_taxes_mut(gov);
        if (table::contains(role_taxes, role)) {
            let _ = table::remove(role_taxes, role);
        };
        event::emit(SSURoleTaxCleared {
            ssu_id: ssu_governance::ssu_id(gov),
            role,
            cleared_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Batch upsert of N per-role rows in a single TX.
    /// All four input vectors MUST have the same length.
    /// Aborts:
    ///   E_LENGTH_MISMATCH (3)   vector lengths differ
    ///   E_RATE_EXCEEDS_CAP (2)  any wts_pct or wtb_pct > MAX_TAX_PCT
    ///   E_INVALID_ROLE (4)      any role > 7
    public entry fun set_ssu_taxes_batch(
        cap: &SSUOwnerCap,
        gov: &mut SSUGovernance,
        roles: vector<u8>,
        wts_pcts: vector<u64>,
        wtb_pcts: vector<u64>,
        de_flat_fees: vector<u64>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert_cap_ok(cap, gov);
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
        event::emit(SSUTaxBatchUpdated {
            ssu_id: ssu_governance::ssu_id(gov),
            role_count: n,
            updated_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Convenience: write the same RoleTaxConfig to all 8 roles (0..=7).
    /// Useful as both an initial-setup UX shortcut and a test helper that
    /// mirrors the legacy `set_ssu_tax_config` (wts, wtb, de) shape.
    public entry fun set_ssu_tax_uniform(
        cap: &SSUOwnerCap,
        gov: &mut SSUGovernance,
        wts_pct: u64,
        wtb_pct: u64,
        de_flat_fee: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert_cap_ok(cap, gov);
        assert_pct_ok(wts_pct, wtb_pct);
        assert_de_fee_ok(de_flat_fee);
        let cfg = role_tax_types::new(wts_pct, wtb_pct, de_flat_fee);
        let mut role: u8 = 0;
        while (role < TOTAL_ROLES) {
            upsert_role(gov, role, cfg);
            role = role + 1;
        };
        event::emit(SSUTaxBatchUpdated {
            ssu_id: ssu_governance::ssu_id(gov),
            role_count: (TOTAL_ROLES as u64),
            updated_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    // ===== Public Getters =====

    public fun ssu_wts_pct_for_role(gov: &SSUGovernance, role: u8): u64 {
        let role_taxes = ssu_governance::borrow_role_taxes(gov);
        if (table::contains(role_taxes, role)) {
            role_tax_types::wts_pct(table::borrow(role_taxes, role))
        } else { 0 }
    }

    public fun ssu_wtb_pct_for_role(gov: &SSUGovernance, role: u8): u64 {
        let role_taxes = ssu_governance::borrow_role_taxes(gov);
        if (table::contains(role_taxes, role)) {
            role_tax_types::wtb_pct(table::borrow(role_taxes, role))
        } else { 0 }
    }

    public fun ssu_de_flat_fee_for_role(gov: &SSUGovernance, role: u8): u64 {
        let role_taxes = ssu_governance::borrow_role_taxes(gov);
        if (table::contains(role_taxes, role)) {
            role_tax_types::de_flat_fee(table::borrow(role_taxes, role))
        } else { 0 }
    }

    /// Returns a copy of the full RoleTaxConfig row for `role` (or zero
    /// row if not set). RoleTaxConfig has copy/drop so this is cheap.
    public fun ssu_role_tax(gov: &SSUGovernance, role: u8): RoleTaxConfig {
        let role_taxes = ssu_governance::borrow_role_taxes(gov);
        if (table::contains(role_taxes, role)) {
            *table::borrow(role_taxes, role)
        } else {
            role_tax_types::zero()
        }
    }

    public fun ssu_has_role_tax(gov: &SSUGovernance, role: u8): bool {
        let role_taxes = ssu_governance::borrow_role_taxes(gov);
        table::contains(role_taxes, role)
    }

    // ===== Internal Helpers =====

    fun assert_cap_ok(cap: &SSUOwnerCap, gov: &SSUGovernance) {
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov), E_WRONG_SSU);
        ssu_governance::assert_not_frozen(gov);
        ssu_governance::assert_active(gov);
        ssu_governance::assert_subject_in_governance(gov, ssu_governance::ssu_id(gov));
    }

    fun assert_pct_ok(wts_pct: u64, wtb_pct: u64) {
        assert!(wts_pct <= MAX_TAX_PCT, E_RATE_EXCEEDS_CAP);
        assert!(wtb_pct <= MAX_TAX_PCT, E_RATE_EXCEEDS_CAP);
    }

    fun assert_de_fee_ok(de_flat_fee: u64) {
        assert!(de_flat_fee <= MAX_DE_FLAT_FEE, E_FLAT_FEE_EXCEEDS_CAP);
    }

    fun upsert_role(gov: &mut SSUGovernance, role: u8, cfg: RoleTaxConfig) {
        let role_taxes = ssu_governance::borrow_role_taxes_mut(gov);
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
    public fun e_wrong_ssu(): u64 { E_WRONG_SSU }
    public fun e_rate_exceeds_cap(): u64 { E_RATE_EXCEEDS_CAP }
    public fun e_length_mismatch(): u64 { E_LENGTH_MISMATCH }
    public fun e_invalid_role(): u64 { E_INVALID_ROLE }
    public fun e_flat_fee_exceeds_cap(): u64 { E_FLAT_FEE_EXCEEDS_CAP }
    public fun max_de_flat_fee(): u64 { MAX_DE_FLAT_FEE }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
