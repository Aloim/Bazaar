// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_economy::exchange_rate_math {
    use bazaar_economy::tribe_vault::{Self, TribeVault};
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};

    // Precision scaling factor — must match tribe_exchange::RATE_PRECISION.
    // Duplicated as a module constant so exchange_rate_math has no dep on
    // tribe_exchange's private constant. Kept in sync by the locking test.
    const RATE_PRECISION: u64 = 1_000_000_000;

    /// LEGACY V27 formula — vault/total_supply. PRESERVED for upgrade
    /// compatibility (public read accessors `exchange_rate` +
    /// `exchange_rate_scaled` keep their original signatures) and for the
    /// `ledger_shop_ops::withdraw_ssu_tax_credits` redeem path which still
    /// burns SSU tax credits against total supply.
    ///
    /// For player EVE<->token swaps, prefer `compute_scaled_rate_v28` which
    /// uses the tribe wallet balance as the denominator.
    public(package) fun compute_scaled_rate(
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        reserve_mist: u64,
    ): u64 {
        let supply = tribe_token_ledger::total_supply(ledger);
        let balance = tribe_vault::eve_balance(vault);
        if (supply == 0 || balance <= reserve_mist) {
            return 0
        };
        let available = (balance as u128) - (reserve_mist as u128);
        let scaled = available * (RATE_PRECISION as u128) / (supply as u128);
        (scaled as u64)
    }

    /// V28: Precision-scaled rate using tribe-wallet token stock as the
    /// denominator. Formula: (vault - reserve) * RATE_PRECISION / tribe_wallet_balance.
    /// Returns 0 if tribe wallet empty or vault underfunded.
    public(package) fun compute_scaled_rate_v28(
        vault: &TribeVault,
        reserve_mist: u64,
        tribe_wallet_balance: u64,
    ): u64 {
        let balance = tribe_vault::eve_balance(vault);
        if (tribe_wallet_balance == 0 || balance <= reserve_mist) {
            return 0
        };
        let available = (balance as u128) - (reserve_mist as u128);
        let scaled = available * (RATE_PRECISION as u128) / (tribe_wallet_balance as u128);
        (scaled as u64)
    }

    /// GAS-16: Compute the V28 scaled rate given a pre-read vault balance.
    /// Used on the write path (swap_eve_to_tokens) to avoid a second
    /// `tribe_vault::eve_balance` borrow when the balance is already local.
    public(package) fun compute_scaled_rate_v28_with_bal(
        vault_balance: u64,
        reserve_mist: u64,
        tribe_wallet_balance: u64,
    ): u64 {
        if (tribe_wallet_balance == 0 || vault_balance <= reserve_mist) {
            return 0
        };
        let available = (vault_balance as u128) - (reserve_mist as u128);
        let scaled = available * (RATE_PRECISION as u128) / (tribe_wallet_balance as u128);
        (scaled as u64)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
