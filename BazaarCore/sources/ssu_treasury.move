// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::ssu_treasury {
    use sui::balance;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::clock::Clock;
    use EVE::EVE::EVE;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::membership;

    // ===== Error Codes =====
    // Mirrors E_WRONG_SSU from ssu_governance (cross-module; use accessor).
    // E_INSUFFICIENT_BALANCE mirrors ssu_governance value 3.
    const E_INSUFFICIENT_BALANCE: u64 = 3;

    // New R6.7.1 error codes
    const E_ZERO_DEPOSIT: u64 = 30;  // OS-39: coin value must be > 0
    // NOTE: E_WRONG_SSU is not re-declared here; use ssu_governance::e_wrong_ssu() accessor.

    // ===== Events =====
    /// Emitted when SSU tax is withdrawn via ssu_treasury::withdraw_ssu_tax.
    /// Relocated from ssu_governance; identical schema for indexer continuity.
    public struct SSUTaxWithdrawn has copy, drop {
        ssu_id: address,
        amount: u64,
        withdrawn_by: address,
        timestamp_ms: u64,
    }

    /// Emitted when external SUI is deposited into SSU tax wallet via deposit_ssu_tax_external.
    public struct SSUTaxDepositedExternal has copy, drop {
        ssu_id: address,
        depositor: address,
        amount: u64,
        timestamp_ms: u64,
    }

    // ===== Tax Withdrawal (relocated from ssu_governance) =====

    /// Withdraw collected SSU tax. Owner-only.
    /// Returns Coin<EVE> — PTB must transfer to owner address.
    /// Relocated from ssu_governance::withdraw_ssu_tax per R6.7.0 split.
    public fun withdraw_ssu_tax(
        cap: &membership::SSUOwnerCap,
        gov: &mut SSUGovernance,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(gov), ssu_governance::e_wrong_ssu());
        assert!(ssu_governance::ssu_tax_balance(gov) >= amount, E_INSUFFICIENT_BALANCE);
        event::emit(SSUTaxWithdrawn {
            ssu_id: ssu_governance::ssu_id(gov),
            amount,
            withdrawn_by: ctx.sender(),
            timestamp_ms: clock.timestamp_ms(),
        });
        coin::from_balance(ssu_governance::withdraw_from_tax_wallet(gov, amount), ctx)
    }

    // ===== Tax Deposit — Package-Private (relocated from ssu_governance) =====

    /// Deposit SSU tax from shop operations. Package-private — called by shop_ops.
    /// Relocated from ssu_governance::deposit_ssu_tax per R6.7.0 split.
    public(package) fun deposit_ssu_tax(gov: &mut SSUGovernance, coin: Coin<EVE>) {
        let val = coin.value();
        ssu_governance::add_to_tax_wallet(gov, coin.into_balance());
        // Increment total_tax_collected via the delegation helper.
        ssu_governance::increment_total_tax_collected(gov, val);
    }

    // ===== OS-39: Permissionless External Tax Deposit =====

    /// Deposit SUI into SSU tax wallet from any external caller (permissionless).
    /// Aborts E_SSU_FROZEN if frozen; E_SSU_NOT_ACTIVE if deactivated; E_ZERO_DEPOSIT if coin value = 0.
    /// Use case: external protocol revenues, voluntary contributions, etc.
    public entry fun deposit_ssu_tax_external(
        gov: &mut SSUGovernance,
        coin: Coin<EVE>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        ssu_governance::assert_not_frozen(gov);  // no donating to frozen SSU
        ssu_governance::assert_active(gov);       // R6.7.1 E_SSU_NOT_ACTIVE: no donating to deactivated SSU
        let amount = coin::value(&coin);
        assert!(amount > 0, E_ZERO_DEPOSIT);
        let depositor = ctx.sender();
        let ssu_id = ssu_governance::ssu_id(gov);
        ssu_governance::add_to_tax_wallet(gov, coin::into_balance(coin));
        ssu_governance::increment_total_tax_collected(gov, amount);
        event::emit(SSUTaxDepositedExternal {
            ssu_id,
            depositor,
            amount,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    // ===== Tax Balance Accessor (relocated from ssu_governance) =====

    /// Returns the current SSU tax wallet balance.
    /// Option A (relocate): canonical in ssu_treasury. ssu_governance forwards via its own
    /// ssu_tax_balance accessor which now delegates to this module's logic.
    /// NOTE: ssu_governance::ssu_tax_balance is KEPT as a thin `gov.tax_wallet.value()` read
    /// in ssu_governance (no delegation needed there — it reads the field directly).
    /// This accessor exists for callers that import ssu_treasury explicitly.
    public fun ssu_tax_balance(gov: &SSUGovernance): u64 {
        ssu_governance::ssu_tax_balance(gov)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
