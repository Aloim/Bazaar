// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazaar_core::mission_fees — per-hour Mission (MIS) listing-fee split for the
/// real-EVE bazaar types (NoTribe + Easy). The Advanced tribe-token twin lives in
/// bazaar_economy::mission_ledger_ops. Each charge fn reads the per-hour fee from
/// every applicable governance layer, asserts the caller-supplied Coin<EVE> equals
/// exactly Σ(layer per-hour fee) × hours, then splits + deposits to each layer's
/// wallet exactly like trade taxes (ssu_treasury::deposit_ssu_tax /
/// tribe_governance::deposit_tribe_tax / shop_ops_helpers::safe_deposit_dapp_tax).
///
/// Composition: NoTribe = SSU + Dapp · Easy = SSU + Tribe + Dapp.
/// No module depends on bazaar_core::mission, so this stays cycle-free.
module bazaar_core::mission_fees {
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use EVE::EVE::EVE;
    use dapp_hub::dapp_governance::{Self, GovernanceConfig};
    use dapp_hub::tax_wallet::DAppTaxWallet;
    use bazaar_core::bazaar_core_admin::BazaarCoreAdmin;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::ssu_treasury;
    use bazaar_core::shop_ops_helpers;

    const HOUR_MS: u64 = 3_600_000;
    const MAX_U64_AS_U128: u128 = 18_446_744_073_709_551_615;

    // ===== Error Codes =====
    const E_FEE_MISMATCH: u64 = 1;       // listing_fee coin value != Σ(layer fee) × hours
    const E_AMOUNT_OVERFLOW: u64 = 2;    // per-hour fee × hours overflows u64
    const E_WRONG_BAZAAR_TYPE: u64 = 3;  // charge router called against an SSU of the wrong bazaar type
    const E_WRONG_TRIBE: u64 = 4;        // Easy: tribe_gov is not the SSU's tribe

    fun checked_mul(a: u64, b: u64): u64 {
        let r = (a as u128) * (b as u128);
        assert!(r <= MAX_U64_AS_U128, E_AMOUNT_OVERFLOW);
        (r as u64)
    }

    /// Whole listing hours for a duration (1h-stepped on the FE; floor here).
    public fun duration_hours(duration_ms: u64): u64 { duration_ms / HOUR_MS }

    /// NoTribe mission listing fee: SSU + Dapp layers (EVE). `fee` MUST equal exactly
    /// (ssu_fph + dapp_fph) × hours. Splits the SSU portion to the SSU tax wallet and
    /// routes the remainder (the Dapp portion, possibly zero) to the DAppTaxWallet.
    public fun charge_notribe(
        gov: &mut SSUGovernance,
        dapp_config: &GovernanceConfig,
        admin: &BazaarCoreAdmin,
        dapp_wallet: &mut DAppTaxWallet,
        mut fee: Coin<EVE>,
        hours: u64,
        payer: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Public after the bazaar_mission split: self-check the bazaar type so a direct
        // PTB caller cannot route an Easy SSU through the NoTribe (tribe-less) path.
        assert!(ssu_governance::ssu_bazaar_type(gov) == 0, E_WRONG_BAZAAR_TYPE);
        let ssu_fee = checked_mul(ssu_governance::ssu_mission_listing_fee_per_hour(gov), hours);
        let dapp_fee = checked_mul(dapp_governance::mission_listing_fee_per_hour(dapp_config), hours);
        let total = ssu_fee + dapp_fee;
        assert!(coin::value(&fee) == total, E_FEE_MISMATCH);
        let ssu_id = ssu_governance::ssu_id(gov);
        if (ssu_fee > 0) {
            ssu_treasury::deposit_ssu_tax(gov, coin::split(&mut fee, ssu_fee, ctx));
        };
        // Remaining coin == dapp_fee (or a zero coin, which safe_deposit destroys).
        shop_ops_helpers::safe_deposit_dapp_tax(
            admin, dapp_wallet, fee,
            b"MIS_FEE", b"notribe", ssu_id, 0, payer, payer,
            total, ssu_fee, 0, dapp_fee, clock,
        );
    }

    /// Easy mission listing fee: SSU + Tribe + Dapp layers (EVE). `fee` MUST equal
    /// exactly (ssu_fph + tribe_fph + dapp_fph) × hours. Splits SSU + Tribe portions to
    /// their tax wallets (recording per-SSU tribe tax for the Registered-SSUs list) and
    /// routes the remainder (the Dapp portion, possibly zero) to the DAppTaxWallet.
    public fun charge_easy(
        gov: &mut SSUGovernance,
        tribe_gov: &mut TribeGovernance,
        dapp_config: &GovernanceConfig,
        admin: &BazaarCoreAdmin,
        dapp_wallet: &mut DAppTaxWallet,
        mut fee: Coin<EVE>,
        hours: u64,
        payer: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Public after the bazaar_mission split (SA-MIS-01/02): self-check the bazaar
        // type AND that tribe_gov is the SSU's own tribe, so a direct PTB caller cannot
        // (a) route a non-Easy SSU here, or (b) pass a foreign TribeGovernance and write
        // a phantom row into another tribe's Registered-SSU tax list.
        assert!(ssu_governance::ssu_bazaar_type(gov) == 1, E_WRONG_BAZAAR_TYPE);
        assert!(
            tribe_governance::tribe_id(tribe_gov) == ssu_governance::ssu_tribe_id(gov),
            E_WRONG_TRIBE,
        );
        let ssu_fee = checked_mul(ssu_governance::ssu_mission_listing_fee_per_hour(gov), hours);
        let tribe_fee = checked_mul(tribe_governance::tribe_mission_listing_fee_per_hour(tribe_gov), hours);
        let dapp_fee = checked_mul(dapp_governance::mission_listing_fee_per_hour(dapp_config), hours);
        let total = ssu_fee + tribe_fee + dapp_fee;
        assert!(coin::value(&fee) == total, E_FEE_MISMATCH);
        let ssu_id = ssu_governance::ssu_id(gov);
        let tribe_id = tribe_governance::tribe_id(tribe_gov);
        if (ssu_fee > 0) {
            ssu_treasury::deposit_ssu_tax(gov, coin::split(&mut fee, ssu_fee, ctx));
        };
        if (tribe_fee > 0) {
            tribe_governance::deposit_tribe_tax(tribe_gov, coin::split(&mut fee, tribe_fee, ctx));
        };
        // Remaining coin == dapp_fee (or a zero coin, which safe_deposit destroys).
        shop_ops_helpers::safe_deposit_dapp_tax(
            admin, dapp_wallet, fee,
            b"MIS_FEE", b"easy", ssu_id, tribe_id, payer, payer,
            total, ssu_fee, tribe_fee, dapp_fee, clock,
        );
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
