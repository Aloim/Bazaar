// BazaarCore/sources/admin_drain_events.move
// Shared event utility for UpdateCeremonyPlan v1 Phase B + Variant B drains.
// Declares the BatchDrainSummary event + BATCH_KIND_* discriminator constants ONCE so the 5 admin batch
// entries (bazar_admin_drain, wtb_escrow_pool, trade in BazaarCore; advanced_direct_trade,
// vault_withdrawal_drain in BazaarEconomy) reuse the same shape. emit_summary is fully public to allow
// cross-package callers in bazaar_economy — security boundary is the per-entry DAppOwnerCap gate,
// not this event. The event itself is indexer data with no on-chain side effects.

module bazaar_core::admin_drain_events {
    use sui::clock::{Self, Clock};
    use sui::event;

    // Batch-kind discriminators — exhaustive enumeration of v1 admin batches.
    const BATCH_KIND_CLOSE_SHOPS:     u8 = 1;
    const BATCH_KIND_REFUND_WTB:      u8 = 2;
    const BATCH_KIND_CANCEL_TRADE:    u8 = 3;
    const BATCH_KIND_CANCEL_ADV_TRADE:u8 = 4;
    const BATCH_KIND_CANCEL_WITHDRAW: u8 = 5;

    /// One-per-batch summary; per-row events come from each primitive's existing emission.
    public struct BatchDrainSummary has copy, drop {
        kind: u8,
        processed: u64,
        skipped: u64,
        admin: address,
        timestamp_ms: u64,
    }

    /// Public so bazaar_economy entries can emit the same event shape cross-package.
    /// Caller is responsible for ensuring the kind value matches an enumerated BATCH_KIND_*.
    public fun emit_summary(
        kind: u8,
        processed: u64,
        skipped: u64,
        ctx: &TxContext,
        clock: &Clock,
    ) {
        event::emit(BatchDrainSummary {
            kind,
            processed,
            skipped,
            admin: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // Public accessors for the batch-kind constants — consumed by every admin batch entry.
    public fun kind_close_shops():     u8 { BATCH_KIND_CLOSE_SHOPS }
    public fun kind_refund_wtb():      u8 { BATCH_KIND_REFUND_WTB }
    public fun kind_cancel_trade():    u8 { BATCH_KIND_CANCEL_TRADE }
    public fun kind_cancel_adv_trade():u8 { BATCH_KIND_CANCEL_ADV_TRADE }
    public fun kind_cancel_withdraw(): u8 { BATCH_KIND_CANCEL_WITHDRAW }
}
