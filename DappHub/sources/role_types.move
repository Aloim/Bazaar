// DappHub/sources/role_types.move
// Role constants and TaxConfig struct shared across all Bazaar packages.
// All role functions are public for cross-package import.
// Constitution: Article XII.3 — 500-line limit. Current: ~60 lines.
module dapp_hub::role_types {

    // Role constants
    const ROLE_STRANGER:    u8 = 0;
    const ROLE_UNFRIENDLY:  u8 = 1;
    const ROLE_MEMBER:      u8 = 2;
    const ROLE_FRIENDLY:    u8 = 3;
    const ROLE_MODERATOR:   u8 = 4;
    const ROLE_ADMIN:       u8 = 5;
    const ROLE_SUPER_ADMIN: u8 = 6;
    const ROLE_OWNER:       u8 = 7;

    // TaxConfig stores per-role tax rates for SSU-level taxation.
    // Used by bazaar_core to compute multi-layer taxes.
    public struct TaxConfig has store, copy, drop {
        wts_tax_bps:   u64,   // WTS transaction tax in basis points
        wtb_tax_bps:   u64,   // WTB transaction tax in basis points
        de_flat_fee:   u64,   // DE flat fee in SUI base units
        trade_tax_bps: u64,   // Direct trade tax in basis points
    }

    // Role accessor functions — public for cross-package import.
    public fun role_stranger(): u8    { ROLE_STRANGER }
    public fun role_unfriendly(): u8  { ROLE_UNFRIENDLY }
    public fun role_member(): u8      { ROLE_MEMBER }
    public fun role_friendly(): u8    { ROLE_FRIENDLY }
    public fun role_moderator(): u8   { ROLE_MODERATOR }
    public fun role_admin(): u8       { ROLE_ADMIN }
    public fun role_super_admin(): u8 { ROLE_SUPER_ADMIN }
    public fun role_owner(): u8       { ROLE_OWNER }

    // TaxConfig constructor.
    public fun new_tax_config(
        wts_tax_bps: u64,
        wtb_tax_bps: u64,
        de_flat_fee: u64,
        trade_tax_bps: u64,
    ): TaxConfig {
        TaxConfig { wts_tax_bps, wtb_tax_bps, de_flat_fee, trade_tax_bps }
    }

    // TaxConfig field accessors.
    public fun tax_wts_bps(cfg: &TaxConfig): u64   { cfg.wts_tax_bps }
    public fun tax_wtb_bps(cfg: &TaxConfig): u64   { cfg.wtb_tax_bps }
    public fun tax_de_fee(cfg: &TaxConfig): u64    { cfg.de_flat_fee }
    public fun tax_trade_bps(cfg: &TaxConfig): u64 { cfg.trade_tax_bps }
}
// END OF FILE — dapp_hub::role_types
