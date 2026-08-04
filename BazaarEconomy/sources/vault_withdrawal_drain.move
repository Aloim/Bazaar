// BazaarEconomy/sources/vault_withdrawal_drain.move
// UpdateCeremonyPlan v1 — Phase B entry 5: admin batch cancel of every still-open
// (PENDING or APPROVED-but-not-yet-executed) withdrawal request on a tribe's
// WithdrawalBoard. Mirrors bazar_admin_drain / trade::cancel_trade_proposals_batch
// shape.
//
// Sibling module to vault_withdrawal.move (which is at 566+ LOC, over the 500-line
// guard pre-v1; Constitution-exempt for this campaign). The per-row primitive
// (vault_withdrawal::admin_force_cancel_internal) is a public(package) extraction
// of the user-side cancel_request body minus the TribeLeaderCap + requester-match
// gates; the admin path silent-skips absent / already-resolved rows and returns
// `bool` per row so the batch loop counts processed vs skipped.
//
// FE iteration model: ONE call per WithdrawalBoard (one per Advanced tribe).
// FE auto-iterates tribes and pages request_ids in MAX_BATCH_ROWS chunks.
//
// Cancels BOTH STATUS_PENDING and STATUS_APPROVED rows — the 24h-wait window must
// also be cancellable during ceremony Phase B, otherwise an approved-but-not-yet-
// executed request would survive the drain.

module bazaar_economy::vault_withdrawal_drain {
    use sui::clock::{Self, Clock};
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use bazaar_economy::vault_withdrawal::{Self, WithdrawalBoard};
    use bazaar_economy::tribe_vault::{Self, TribeVault};
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_core::admin_drain_events;

    // Error codes
    const E_BATCH_TOO_LARGE: u64 = 1;
    const E_PAGINATION_ZERO: u64 = 2;
    const E_WRONG_TRIBE:     u64 = 3;

    // Constants
    const MAX_BATCH_ROWS: u64 = 100;

    /// Cancel every still-open withdrawal request in `request_ids` on this board.
    /// DAppOwnerCap-gated; silent-skip on absent rows and on rows already in a
    /// terminal status (EXECUTED / CANCELLED / EXPIRED / DENIED). Cancels rows
    /// in STATUS_PENDING OR STATUS_APPROVED. Per-row WithdrawalStatusEvent +
    /// finance_events::emit_finance fire from the inner helper; one
    /// BatchDrainSummary at the end summarises processed/skipped counts.
    public entry fun cancel_vault_withdrawals_batch(
        _cap: &DAppOwnerCap,
        board: &mut WithdrawalBoard,
        vault: &TribeVault,
        ledger: &TribeTokenLedger,
        request_ids: vector<u64>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let board_tribe = vault_withdrawal::board_tribe_id(board);
        assert!(tribe_vault::tribe_id(vault) == board_tribe, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == board_tribe, E_WRONG_TRIBE);

        let n = vector::length(&request_ids);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        let admin = tx_context::sender(ctx);
        let now_ms = clock::timestamp_ms(clock);
        let mut processed: u64 = 0;
        let mut skipped: u64 = 0;
        let mut i: u64 = 0;
        while (i < n) {
            let rid = *vector::borrow(&request_ids, i);
            let cancelled = vault_withdrawal::admin_force_cancel_internal(
                board, vault, ledger, rid, admin, now_ms,
            );
            if (cancelled) {
                processed = processed + 1;
            } else {
                skipped = skipped + 1;
            };
            i = i + 1;
        };

        admin_drain_events::emit_summary(
            admin_drain_events::kind_cancel_withdraw(),
            processed,
            skipped,
            ctx,
            clock,
        );
    }
}
