// DappHub/sources/escrow_wallet.move
// Separate EVE escrow holder for the DApp. Pending fees (e.g. tribe-join
// application fees) are held HERE — NOT in the DAppTaxWallet — so the tax
// wallet's balance/totals only ever reflect COMPLETED revenue. On completion
// the escrowed balance is released to the tax wallet; on cancel/reject it is
// refunded to the payer.
//
// Keyed by an opaque u64 (the registration application id). Package-internal
// only — escrow/release are driven by dapp_hub::registration.
// Constitution: Article XII.3 — 500-line limit.
module dapp_hub::escrow_wallet {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::table::{Self, Table};
    use EVE::EVE::EVE;

    const E_NO_ESCROW: u64 = 1;

    // DAppEscrowWallet: single shared object holding per-application escrowed EVE.
    // `total_escrowed` is a monotonic-ish running sum of currently-held escrow.
    public struct DAppEscrowWallet has key {
        id: UID,
        escrows: Table<u64, Balance<EVE>>,
        total_escrowed: u64,
    }

    fun init(ctx: &mut TxContext) {
        let wallet = DAppEscrowWallet {
            id: object::new(ctx),
            escrows: table::new(ctx),
            total_escrowed: 0,
        };
        transfer::share_object(wallet);
    }

    // Escrow a payment under `key`. Accepts a zero coin (fee == 0) so every
    // application has exactly one escrow entry and release() is always valid.
    public(package) fun escrow(wallet: &mut DAppEscrowWallet, key: u64, payment: Coin<EVE>) {
        let amount = coin::value(&payment);
        table::add(&mut wallet.escrows, key, coin::into_balance(payment));
        wallet.total_escrowed = wallet.total_escrowed + amount;
    }

    // Release the escrow held under `key` as a Balance. Aborts if none.
    // Caller decides the destination (tax wallet on accept, refund on reject).
    public(package) fun release(wallet: &mut DAppEscrowWallet, key: u64): Balance<EVE> {
        assert!(table::contains(&wallet.escrows, key), E_NO_ESCROW);
        let bal = table::remove(&mut wallet.escrows, key);
        wallet.total_escrowed = wallet.total_escrowed - balance::value(&bal);
        bal
    }

    public(package) fun has_escrow(wallet: &DAppEscrowWallet, key: u64): bool {
        table::contains(&wallet.escrows, key)
    }

    // ===== Read accessors =====
    public fun total_escrowed(wallet: &DAppEscrowWallet): u64 { wallet.total_escrowed }
    public fun escrow_amount(wallet: &DAppEscrowWallet, key: u64): u64 {
        if (table::contains(&wallet.escrows, key)) {
            balance::value(table::borrow(&wallet.escrows, key))
        } else { 0 }
    }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(ctx: &mut TxContext): DAppEscrowWallet {
        DAppEscrowWallet { id: object::new(ctx), escrows: table::new(ctx), total_escrowed: 0 }
    }

    #[test_only]
    public fun share_for_testing(self: DAppEscrowWallet) {
        transfer::share_object(self);
    }
}
// END OF FILE — dapp_hub::escrow_wallet
