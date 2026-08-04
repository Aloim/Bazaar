// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_shop_ops::shop_ops_cap_store {
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use bazaar_core::bazaar_core_admin::ShopOpsCap;

    // ===== Error Codes =====
    /// Raised by borrow_shop_ops_cap when the cap has not yet been loaded.
    const E_CAP_STORE_EMPTY:    u64 = 8;
    /// Raised by receive_shop_ops_cap when a cap is already stored.
    const E_CAP_ALREADY_STORED: u64 = 9;

    // ===== Struct =====

    /// Package-level singleton shared object. Holds the ShopOpsCap minted by
    /// bazaar_core_admin::authorize_shop_ops_package and extracted into this store
    /// during the one-time deployment setup PTB. The shop-op entry modules borrow
    /// the cap via the package-private accessor (SA-007) so external PTBs cannot
    /// obtain an unrestricted reference to the cap and call the hardened
    /// bazaar_core::shop_ops_guarded wrappers directly. Mirrors EconomyCapStore.
    public struct ShopOpsCapStore has key {
        id: UID,
        shop_ops_cap: Option<ShopOpsCap>,
    }

    // ===== Init =====

    /// Create and share the singleton at publish (one shared object).
    fun init(ctx: &mut TxContext) {
        transfer::share_object(ShopOpsCapStore {
            id: object::new(ctx),
            shop_ops_cap: option::none(),
        });
    }

    // ===== Public Cap Setup (DApp Owner gated, one-time) =====

    /// Accept the ShopOpsCap into the store. Aborts if already stored.
    public fun receive_shop_ops_cap(
        store: &mut ShopOpsCapStore,
        cap: ShopOpsCap,
        _owner_cap: &DAppOwnerCap,
    ) {
        assert!(option::is_none(&store.shop_ops_cap), E_CAP_ALREADY_STORED);
        option::fill(&mut store.shop_ops_cap, cap);
    }

    // ===== Package-Private Cap Accessor (SA-007) =====

    /// Borrow the ShopOpsCap for the shop-op entry modules. Package-private only.
    public(package) fun borrow_shop_ops_cap(store: &ShopOpsCapStore): &ShopOpsCap {
        assert!(option::is_some(&store.shop_ops_cap), E_CAP_STORE_EMPTY);
        option::borrow(&store.shop_ops_cap)
    }

    // ===== Test-Only Factories =====

    #[test_only]
    public fun create_for_testing(ctx: &mut TxContext): ShopOpsCapStore {
        ShopOpsCapStore {
            id: object::new(ctx),
            shop_ops_cap: option::none(),
        }
    }

    /// Build a fully-loaded ShopOpsCapStore for tests that call the cap-threaded
    /// entry fns. Stands up a throwaway ShopOpsCap via the core test factory.
    #[test_only]
    public fun create_loaded_for_testing(shop_ops_pkg: address, ctx: &mut TxContext): ShopOpsCapStore {
        let cap = bazaar_core::bazaar_core_admin::create_shop_ops_cap_for_testing(shop_ops_pkg, ctx);
        ShopOpsCapStore {
            id: object::new(ctx),
            shop_ops_cap: option::some(cap),
        }
    }

    #[test_only]
    public fun share_for_testing(store: ShopOpsCapStore) {
        transfer::share_object(store);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
