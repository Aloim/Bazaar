// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// V26 D8 — SSU credit admin entries extracted from ledger_shop_ops.move
/// to keep the parent module under the 500-line guard.
///
/// Per-SSU tribe-token wallet admin. Mirrors the tribe-level entries
/// (withdraw_from_tribe_wallet_as_leader / deposit_to_tribe_wallet) in
/// tribe_token_ledger.move but operates on the ledger row keyed by
/// `ssu_governance::ssu_id(ssu_gov)`. SSU owners route accumulated tax
/// revenue to individual players without the EVE redemption path.
///
/// Entries:
///   transfer_ssu_credit_to_player  — SSUOwnerCap-gated; debit SSU row, credit player row
///   deposit_to_ssu_credit          — permissionless; debit caller row, credit SSU row
module bazaar_economy::ledger_shop_ops_ssu_admin {
    use sui::event;
    use sui::clock::{Self, Clock};
    use bazaar_core::membership::{Self, SSUOwnerCap};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazaar_assertions;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};

    // ===== Error Codes =====
    // Mirror ledger_shop_ops.move numeric values for FE error-decoding stability.
    const E_WRONG_SSU:            u64 = 3;
    const E_INSUFFICIENT_BALANCE: u64 = 5;
    const E_ZERO_QUANTITY:        u64 = 6;
    const E_LEDGER_FROZEN:        u64 = 8;

    // ===== Events =====

    public struct SSUCreditWithdrawEvent has copy, drop {
        ssu_id: address, tribe_id: u64, recipient: address,
        amount: u64, authorized_by: address, timestamp_ms: u64,
    }

    public struct SSUCreditDepositEvent has copy, drop {
        ssu_id: address, tribe_id: u64, depositor: address,
        amount: u64, timestamp_ms: u64,
    }

    // ===== Public Entries =====

    /// SSU owner moves tribe-token credits from the SSU tax row to a player.
    /// Amount is in scaled tribe-token units (V26+ decimals=2). SSUOwnerCap-gated.
    public fun transfer_ssu_credit_to_player(
        cap: &SSUOwnerCap,
        ssu_gov: &SSUGovernance,
        ledger: &mut TribeTokenLedger,
        recipient: address,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(ssu_gov));
        assert!(membership::cap_ssu_id(cap) == ssu_governance::ssu_id(ssu_gov), E_WRONG_SSU);
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(amount > 0, E_ZERO_QUANTITY);
        let ssu_addr = ssu_governance::ssu_id(ssu_gov);
        // GAS-02: removed redundant balance_of + pre-assert; debit carries its own >= guard.
        tribe_token_ledger::debit(ledger, ssu_addr, amount);
        tribe_token_ledger::credit(ledger, recipient, amount);
        event::emit(SSUCreditWithdrawEvent {
            ssu_id: ssu_addr,
            tribe_id: tribe_token_ledger::tribe_id(ledger),
            recipient, amount,
            authorized_by: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Permissionless deposit: caller credits the SSU tax row from their own
    /// ledger balance. Amount is in scaled tribe-token units.
    public fun deposit_to_ssu_credit(
        ssu_gov: &SSUGovernance,
        ledger: &mut TribeTokenLedger,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(ssu_gov));
        assert!(!tribe_token_ledger::is_frozen(ledger), E_LEDGER_FROZEN);
        assert!(amount > 0, E_ZERO_QUANTITY);
        let sender = tx_context::sender(ctx);
        let ssu_addr = ssu_governance::ssu_id(ssu_gov);
        // GAS-02: removed redundant balance_of + pre-assert; debit carries its own >= guard.
        tribe_token_ledger::debit(ledger, sender, amount);
        tribe_token_ledger::credit(ledger, ssu_addr, amount);
        event::emit(SSUCreditDepositEvent {
            ssu_id: ssu_addr,
            tribe_id: tribe_token_ledger::tribe_id(ledger),
            depositor: sender, amount,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
