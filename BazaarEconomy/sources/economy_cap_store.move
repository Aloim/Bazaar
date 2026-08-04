// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_economy::economy_cap_store {
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use dapp_hub::tax_wallet::TaxDepositCap;
    use bazaar_core::bazaar_core_admin::TribeTokenShopCap;

    // ===== Version =====
    const PACKAGE_VERSION: u64 = 2;
    // Cross-package compat marker — runtime enforcement deferred to FP1-39.
    const COMPATIBLE_BAZAAR_CORE_VERSION: u64 = 2;

    // ===== Error Codes =====
    /// Raised by borrow_shop_cap or borrow_tax_deposit_cap when cap not yet loaded.
    const E_CAP_STORE_EMPTY:    u64 = 8;
    /// Raised by receive_shop_cap or receive_tax_deposit_cap when cap already stored.
    const E_CAP_ALREADY_STORED: u64 = 9;

    // ===== Struct =====

    /// Package-level singleton shared object. Stores TribeTokenShopCap and TaxDepositCap
    /// after the one-time deployment setup PTB. Internal callers (tribe_exchange,
    /// ledger_shop_ops) borrow caps via public(package) accessors, preventing external
    /// PTBs from obtaining unrestricted cap references. (SA-007)
    public struct EconomyCapStore has key {
        id: UID,
        shop_cap: Option<TribeTokenShopCap>,
        tax_deposit_cap: Option<TaxDepositCap>,
    }

    // ===== Package-Level Factory =====

    /// Called by economy_governance::init to create and share the singleton.
    public(package) fun create_cap_store(ctx: &mut TxContext): EconomyCapStore {
        EconomyCapStore {
            id: object::new(ctx),
            shop_cap: option::none(),
            tax_deposit_cap: option::none(),
        }
    }

    /// Share the cap store as a shared object. Called by economy_governance::init.
    public(package) fun share(self: EconomyCapStore) {
        transfer::share_object(self);
    }

    // ===== Public Cap Setup Functions (DApp Owner gated, one-time) =====

    /// Accept TribeTokenShopCap into the store. Aborts if already stored.
    public fun receive_shop_cap(
        store: &mut EconomyCapStore,
        cap: TribeTokenShopCap,
        _owner_cap: &DAppOwnerCap,
    ) {
        assert!(option::is_none(&store.shop_cap), E_CAP_ALREADY_STORED);
        option::fill(&mut store.shop_cap, cap);
    }

    /// Accept TaxDepositCap into the store. Aborts if already stored.
    public fun receive_tax_deposit_cap(
        store: &mut EconomyCapStore,
        cap: TaxDepositCap,
        _owner_cap: &DAppOwnerCap,
    ) {
        assert!(option::is_none(&store.tax_deposit_cap), E_CAP_ALREADY_STORED);
        option::fill(&mut store.tax_deposit_cap, cap);
    }

    // ===== Package-Private Cap Accessors (SA-007) =====

    /// Borrow TribeTokenShopCap for use by ledger_shop_ops. Package-private only.
    public(package) fun borrow_shop_cap(store: &EconomyCapStore): &TribeTokenShopCap {
        assert!(option::is_some(&store.shop_cap), E_CAP_STORE_EMPTY);
        option::borrow(&store.shop_cap)
    }

    /// Borrow TaxDepositCap for use by tribe_exchange. Package-private only.
    public(package) fun borrow_tax_deposit_cap(store: &EconomyCapStore): &TaxDepositCap {
        assert!(option::is_some(&store.tax_deposit_cap), E_CAP_STORE_EMPTY);
        option::borrow(&store.tax_deposit_cap)
    }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(ctx: &mut TxContext): EconomyCapStore {
        create_cap_store(ctx)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
