// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::shop_ops_helpers {
    use sui::coin::{Self, Coin};
    use sui::event;
    use EVE::EVE::EVE;
    use sui::object::ID;
    use bazaar_core::bazaar_core_admin::{Self, BazaarCoreAdmin};
    use dapp_hub::tax_wallet::{Self, DAppTaxWallet};
    use sui::clock::Clock;

    // ===== Error Codes (relocated from shop_ops.move + new R6.7.6 codes) =====
    // Original shop_ops.move error codes (1-7) — relocated verbatim:
    const E_INSUFFICIENT_PAYMENT:      u64 = 1;
    const E_SHOP_NOT_ACTIVE:            u64 = 2;
    const E_LISTING_SOLD_OUT:           u64 = 3;
    const E_WRONG_BAZAAR_TYPE:          u64 = 4;
    const E_PLAYER_BANNED:              u64 = 5;
    const E_ZERO_QUANTITY:              u64 = 6;
    const E_MODE_NOT_SUPPORTED_FOR_OP:  u64 = 7;
    // R6.7.6 OS-49a: buyer membership + cross-SSU binding errors:
    const E_TRIBE_STORE_PRIVATE:        u64 = 8;
    const E_WRONG_SSU:                  u64 = 9;
    // C-DEF (Phase-5 deferred): combined bps must not exceed 100%.
    const E_RATE_SUM_EXCEEDS_BASE:      u64 = 10;

    // ===== TX-type constants =====
    const TX_WTS:  u8 = 0;
    const TX_WTB:  u8 = 1;
    const TX_DE:   u8 = 2;
    const TX_FREE: u8 = 3;

    // ===== Canonical PurchaseEvent (Article VIII — single event type for all 6 trade fns) =====
    // Amendment #5: single struct here; all split modules call emit_purchase_event(ev).
    // Result: one event type name (bazaar_core::shop_ops_helpers::PurchaseEvent) for all consumers.
    // No breaking change for downstream event subscribers.
    public struct PurchaseEvent has copy, drop {
        tx_type: u8,
        bazaar_type: u8,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        buyer: address,
        seller: address,
        ssu_id: address,
        tribe_id: u64,
        gross_amount: u64,
        ssu_tax: u64,
        tribe_tax: u64,
        dapp_tax: u64,
        net_amount: u64,
        timestamp_ms: u64,
    }

    public(package) fun emit_purchase_event(ev: PurchaseEvent) {
        event::emit(ev);
    }

    public(package) fun new_purchase_event(
        tx_type: u8,
        bazaar_type: u8,
        shop_id: ID,
        listing_idx: u64,
        quantity: u64,
        buyer: address,
        seller: address,
        ssu_id: address,
        tribe_id: u64,
        gross_amount: u64,
        ssu_tax: u64,
        tribe_tax: u64,
        dapp_tax: u64,
        net_amount: u64,
        timestamp_ms: u64,
    ): PurchaseEvent {
        PurchaseEvent {
            tx_type, bazaar_type, shop_id, listing_idx, quantity,
            buyer, seller, ssu_id, tribe_id,
            gross_amount, ssu_tax, tribe_tax, dapp_tax, net_amount,
            timestamp_ms,
        }
    }

    // ===== Tax Computation (relocated from shop_ops.move) =====
    public(package) fun compute_taxes(
        gross: u64, ssu_bps: u64, tribe_bps: u64, dapp_bps: u64,
    ): (u64, u64, u64, u64) {
        // C-DEF: combined rate must not exceed 100%.
        assert!(ssu_bps + tribe_bps + dapp_bps <= 10000, E_RATE_SUM_EXCEEDS_BASE);
        // AUD-NT-01: u128 widening prevents overflow at gross > ~1.84e15 MIST.
        let ssu_tax   = (((gross as u128) * (ssu_bps  as u128)) / 10000u128) as u64;
        let tribe_tax = (((gross as u128) * (tribe_bps as u128)) / 10000u128) as u64;
        let dapp_tax  = (((gross as u128) * (dapp_bps  as u128)) / 10000u128) as u64;
        let net       = gross - ssu_tax - tribe_tax - dapp_tax;
        (ssu_tax, tribe_tax, dapp_tax, net)
    }

    #[test_only]
    public fun compute_taxes_for_testing(
        gross: u64, ssu_bps: u64, tribe_bps: u64, dapp_bps: u64,
    ): (u64, u64, u64, u64) {
        compute_taxes(gross, ssu_bps, tribe_bps, dapp_bps)
    }

    // ===== Safe DApp Tax Deposit (relocated from shop_ops.move) =====
    public(package) fun safe_deposit_dapp_tax(
        admin: &BazaarCoreAdmin,
        w: &mut DAppTaxWallet,
        dapp_coin: Coin<EVE>,
        tx_type: vector<u8>,
        bz_type: vector<u8>,
        ssu_id: address,
        tribe_id: u64,
        payer: address,
        receiver: address,
        gross: u64,
        ssu_tax: u64,
        tribe_tax: u64,
        net: u64,
        clock: &Clock,
    ) {
        if (coin::value(&dapp_coin) > 0) {
            let cap = bazaar_core_admin::borrow_tax_deposit_cap(admin);
            tax_wallet::deposit_dapp_tax(
                w, cap, dapp_coin, tx_type, bz_type,
                ssu_id, tribe_id, payer, receiver,
                gross, ssu_tax, tribe_tax, net, clock,
            );
        } else {
            coin::destroy_zero(dapp_coin);
        };
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
