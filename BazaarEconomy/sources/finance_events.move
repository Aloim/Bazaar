// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// Single aggregator event for the Advanced tribe FinanceNewsPanel.
///
/// Every monetary or governance action that affects either the tribe vault EVE
/// balance OR the TribeTokenLedger total_supply MUST emit a FinanceEvent with
/// both before/after snapshots. The FE renders these chronologically and computes
/// rate-impact % from (eve_reserve_after / circulation_after) vs (before/before).
///
/// Event type legend (must stay in sync with `useFinanceEvents.ts`):
///   0  MINT                  — mint_burn_queue executed a mint request
///   1  BURN                  — mint_burn_queue executed a burn request
///   2  VAULT_DEPOSIT         — leader deposit_eve or add_liquidity
///   3  WITHDRAW_REQUEST      — multi-sig withdrawal request created
///   4  WITHDRAW_APPROVED     — quorum reached, 24h wait period begins
///   5  WITHDRAW_CANCELLED    — requester cancelled
///   6  WITHDRAW_EXECUTED     — EVE physically withdrawn from vault
///   7  WITHDRAW_EXPIRED      — request expired without quorum
///   8  WITHDRAW_DENIED       — denial quorum reached
///   9  SWAP_EVE_TO_TOKEN     — player exchange swap (EVE in, tokens out)
///   10 SWAP_TOKEN_TO_EVE     — player exchange swap (tokens in, EVE out)
///   11 MINT_REQUEST          — V16: mint_burn_queue request_mint queued
///   12 BURN_REQUEST          — V16: mint_burn_queue request_burn queued
///   13 MINTBURN_REJECTED     — V16: mint_burn_queue reject_request fired
module bazaar_economy::finance_events {
    use sui::event;

    public struct FinanceEvent has copy, drop {
        tribe_id: u64,
        event_type: u8,
        actor: address,
        amount: u64,
        eve_reserve_before: u64,
        eve_reserve_after: u64,
        circulation_before: u64,
        circulation_after: u64,
        timestamp_ms: u64,
    }

    public(package) fun emit_finance(
        tribe_id: u64,
        event_type: u8,
        actor: address,
        amount: u64,
        eve_reserve_before: u64,
        eve_reserve_after: u64,
        circulation_before: u64,
        circulation_after: u64,
        timestamp_ms: u64,
    ) {
        event::emit(FinanceEvent {
            tribe_id,
            event_type,
            actor,
            amount,
            eve_reserve_before,
            eve_reserve_after,
            circulation_before,
            circulation_after,
            timestamp_ms,
        });
    }

    // Public discriminator getters so emitter modules can label events without
    // duplicating the constants.
    public fun event_type_mint():                u8 { 0 }
    public fun event_type_burn():                u8 { 1 }
    public fun event_type_vault_deposit():       u8 { 2 }
    public fun event_type_withdraw_request():    u8 { 3 }
    public fun event_type_withdraw_approved():   u8 { 4 }
    public fun event_type_withdraw_cancelled():  u8 { 5 }
    public fun event_type_withdraw_executed():   u8 { 6 }
    public fun event_type_withdraw_expired():    u8 { 7 }
    public fun event_type_withdraw_denied():     u8 { 8 }
    public fun event_type_swap_eve_to_token():   u8 { 9 }
    public fun event_type_swap_token_to_eve():   u8 { 10 }
    // V16 — mint_burn_queue type slots
    public fun event_type_mint_request():        u8 { 11 }
    public fun event_type_burn_request():        u8 { 12 }
    public fun event_type_mintburn_rejected():   u8 { 13 }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
