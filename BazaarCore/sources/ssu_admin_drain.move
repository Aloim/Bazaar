// BazaarCore/sources/ssu_admin_drain.move
// UpdateCeremonyPlan v1 — per-SSU EVE drain entries.
// Sibling to ssu_governance.move (which is at 508 LOC, over the 500-line guard pre-v1;
// Constitution-exempt for this campaign).
//
// Two entries:
//
//   1. drain_ssu_eve  (Variant B emergency; DAppOwnerCap-gated; per-SSU; FE iterates)
//   2. withdraw_legacy_ssu_eve  (user defense-in-depth; SSUOwnerCap-gated; single-SSU)
//
// Both wrap ssu_governance::withdraw_from_tax_wallet (public(package) primitive at
// ssu_governance.move:336). At amount==0 the entries return coin::zero / drain a zero
// balance and emit the unconditional summary event for audit visibility.

module bazaar_core::ssu_admin_drain {
    use sui::balance;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::transfer;
    use EVE::EVE::EVE;
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::membership::{Self, SSUOwnerCap};

    // Error codes
    const E_WRONG_SSU: u64 = 1;

    // Events
    public struct LegacySSUEveWithdrawn has copy, drop {
        ssu_id: address,
        amount: u64,
        owner: address,
        timestamp_ms: u64,
    }
    public struct EmergencySSUEveDrained has copy, drop {
        ssu_id: address,
        amount: u64,
        recipient: address,
        admin: address,
        timestamp_ms: u64,
    }

    // ============================================================
    // VARIANT B EMERGENCY (DAppOwnerCap-gated; per-SSU; FE iterates)
    // ============================================================

    /// Drain the entire per-SSU EVE tax wallet to `recipient` (admin-chosen drain wallet).
    /// Used ONLY in Variant B ceremonies where the outgoing-version per-SSU EVE custody
    /// is being abandoned (plan §12). Emits EmergencySSUEveDrained unconditionally — the
    /// audit trail must record every drain attempt, even on zero balances, so admins can
    /// distinguish "drained" from "never iterated".
    public entry fun drain_ssu_eve(
        _cap: &DAppOwnerCap,
        gov: &mut SSUGovernance,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let amount = ssu_governance::tax_wallet_value(gov);
        let ssu_id = ssu_governance::ssu_id(gov);
        let admin = tx_context::sender(ctx);
        let ts = clock::timestamp_ms(clock);

        if (amount > 0) {
            let bal = ssu_governance::withdraw_from_tax_wallet(gov, amount);
            transfer::public_transfer(coin::from_balance(bal, ctx), recipient);
        };

        event::emit(EmergencySSUEveDrained {
            ssu_id,
            amount,
            recipient,
            admin,
            timestamp_ms: ts,
        });
    }

    // ============================================================
    // USER LEGACY-WITHDRAW (SSUOwnerCap-gated; defense-in-depth)
    // ============================================================

    /// Rescue residual EVE from a legacy outgoing-version SSUGovernance.tax_wallet.
    /// Defense-in-depth: Phase B's batched drains should leave every wallet at zero,
    /// but if any residual slips through, the SSU owner can self-rescue here.
    ///
    /// Aborts E_WRONG_SSU if the supplied cap doesn't match this SSU. Returns
    /// coin::zero<EVE> at zero balance (caller PTB handles disposal — typically
    /// passes back to sender via transfer::public_transfer in the wrapping FE PTB).
    public fun withdraw_legacy_ssu_eve(
        cap: &SSUOwnerCap,
        gov: &mut SSUGovernance,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        let ssu_id = ssu_governance::ssu_id(gov);
        assert!(membership::cap_ssu_id(cap) == ssu_id, E_WRONG_SSU);

        let amount = ssu_governance::tax_wallet_value(gov);
        let bal = if (amount > 0) {
            ssu_governance::withdraw_from_tax_wallet(gov, amount)
        } else {
            balance::zero<EVE>()
        };

        event::emit(LegacySSUEveWithdrawn {
            ssu_id,
            amount,
            owner: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });

        coin::from_balance(bal, ctx)
    }
}
