// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Per-role tax configuration row used by SSUTaxConfig and TribeTaxConfig
/// (both store a Table<u8, RoleTaxConfig> keyed by role index — Stranger=0 … 7).
///
/// Field convention (Session 3B 2026-05-13):
///   - `wts_pct` / `wtb_pct`: percentage stored ×100 for 2-decimal precision.
///     525 represents 5.25%. Per-tier cap enforced at the admin module:
///     MAX_TAX_PCT = 1000 (= 10.00%).
///   - `de_flat_fee`: flat EVE fee in base units. NOT a percentage —
///     denominated in token units, like the legacy flat DE fee.
///
/// Tax math (unchanged from legacy bps formulation; only the field name
/// changes):
///   tax_amt = (gross * wts_pct) / 10_000
///
/// Module isolation: kept dependency-free so both ssu_role_tax_admin and
/// tribe_role_tax_admin can import without dependency direction violations.
module bazaar_core::role_tax_types {

    /// Per-role tax row. Stored as the value type inside
    /// SSUTaxConfig.role_taxes / TribeTaxConfig.role_taxes Tables.
    public struct RoleTaxConfig has store, copy, drop {
        wts_pct: u64,
        wtb_pct: u64,
        de_flat_fee: u64,
    }

    /// Construct a new RoleTaxConfig row. Caller is responsible for bounds
    /// checks (admin modules enforce MAX_TAX_PCT before calling this).
    public fun new(wts_pct: u64, wtb_pct: u64, de_flat_fee: u64): RoleTaxConfig {
        RoleTaxConfig { wts_pct, wtb_pct, de_flat_fee }
    }

    /// Zero-valued row (unset-role lookup return).
    public fun zero(): RoleTaxConfig {
        RoleTaxConfig { wts_pct: 0, wtb_pct: 0, de_flat_fee: 0 }
    }

    // ===== Accessors =====
    public fun wts_pct(c: &RoleTaxConfig): u64 { c.wts_pct }
    public fun wtb_pct(c: &RoleTaxConfig): u64 { c.wtb_pct }
    public fun de_flat_fee(c: &RoleTaxConfig): u64 { c.de_flat_fee }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
