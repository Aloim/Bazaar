// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::bazaar_core_admin {
    use sui::event;
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use dapp_hub::tax_wallet::TaxDepositCap;

    const PACKAGE_VERSION: u64 = 3;

    // --- Error Codes ---
    const E_CAP_ALREADY_SET:       u64 = 1;
    const E_CAP_NOT_SET:           u64 = 2;
    const E_ECONOMY_ALREADY_SET:   u64 = 3;
    const E_CAP_ALREADY_EXTRACTED: u64 = 4;

    // --- Shared Object ---
    public struct BazaarCoreAdmin has key {
        id: UID,
        tax_deposit_cap: Option<TaxDepositCap>,
        tribe_token_shop_cap: Option<TribeTokenShopCap>,
        economy_package: Option<address>,
        // V38 split: ShopOpsCap routing to the downstream bazaar_shop_ops package.
        // Both initialised to none() at publish (fresh-publish ABI-add — safe).
        shop_ops_cap: Option<ShopOpsCap>,
        shop_ops_package: Option<address>,
        version: u64,
    }

    public struct TribeTokenShopCap has key, store {
        id: UID,
        authorized_economy_package: address,
    }

    /// V38 split — cap minted into BazaarCoreAdmin then extracted into the
    /// bazaar_shop_ops::shop_ops_cap_store at deployment. Gates the hardened
    /// `bazaar_core::shop_ops_guarded` wrappers (mirrors TribeTokenShopCap).
    public struct ShopOpsCap has key, store {
        id: UID,
        authorized_shop_ops_package: address,
    }

    // --- Events ---
    public struct TaxDepositCapReceived has copy, drop {}
    public struct EconomyPackageAuthorized has copy, drop { economy_package: address }
    public struct ShopOpsPackageAuthorized has copy, drop { shop_ops_package: address }

    // --- Init ---
    fun init(ctx: &mut TxContext) {
        transfer::share_object(BazaarCoreAdmin {
            id: object::new(ctx),
            tax_deposit_cap: option::none(),
            tribe_token_shop_cap: option::none(),
            economy_package: option::none(),
            shop_ops_cap: option::none(),
            shop_ops_package: option::none(),
            version: 1,
        });
    }

    // --- Public Functions ---

    public fun receive_tax_deposit_cap(
        _dapp_owner_cap: &DAppOwnerCap,
        admin: &mut BazaarCoreAdmin,
        cap: TaxDepositCap,
    ) {
        assert!(option::is_none(&admin.tax_deposit_cap), E_CAP_ALREADY_SET);
        option::fill(&mut admin.tax_deposit_cap, cap);
        event::emit(TaxDepositCapReceived {});
    }

    public fun authorize_economy_package(
        _dapp_owner_cap: &DAppOwnerCap,
        admin: &mut BazaarCoreAdmin,
        economy_package_id: address,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_none(&admin.economy_package), E_ECONOMY_ALREADY_SET);
        assert!(option::is_none(&admin.tribe_token_shop_cap), E_CAP_ALREADY_SET);
        option::fill(&mut admin.economy_package, economy_package_id);
        event::emit(EconomyPackageAuthorized { economy_package: economy_package_id });
        let cap = TribeTokenShopCap {
            id: object::new(ctx),
            authorized_economy_package: economy_package_id,
        };
        option::fill(&mut admin.tribe_token_shop_cap, cap);
    }

    /// V38 split — authorize the downstream bazaar_shop_ops package + mint the
    /// ShopOpsCap into BazaarCoreAdmin. One-time; mirrors authorize_economy_package.
    /// The cap is later extracted via extract_shop_ops_cap into the shop-ops cap store.
    public fun authorize_shop_ops_package(
        _dapp_owner_cap: &DAppOwnerCap,
        admin: &mut BazaarCoreAdmin,
        shop_ops_package_id: address,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_none(&admin.shop_ops_package), E_ECONOMY_ALREADY_SET);
        assert!(option::is_none(&admin.shop_ops_cap), E_CAP_ALREADY_SET);
        option::fill(&mut admin.shop_ops_package, shop_ops_package_id);
        event::emit(ShopOpsPackageAuthorized { shop_ops_package: shop_ops_package_id });
        let cap = ShopOpsCap {
            id: object::new(ctx),
            authorized_shop_ops_package: shop_ops_package_id,
        };
        option::fill(&mut admin.shop_ops_cap, cap);
    }

    /// One-time extraction: removes TribeTokenShopCap from BazaarCoreAdmin and returns it.
    /// Called during the deployment setup PTB. authorize_economy_package must be called first.
    /// Aborts with E_CAP_NOT_SET if the cap was never stored or was already extracted.
    public fun extract_tribe_token_shop_cap(
        admin: &mut BazaarCoreAdmin,
        _owner_cap: &DAppOwnerCap,
    ): TribeTokenShopCap {
        assert!(option::is_some(&admin.tribe_token_shop_cap), E_CAP_NOT_SET);
        option::extract(&mut admin.tribe_token_shop_cap)
    }

    /// One-time extraction: removes TaxDepositCap from BazaarCoreAdmin and returns it.
    /// Called during the deployment setup PTB alongside extract_tribe_token_shop_cap.
    /// Aborts with E_CAP_NOT_SET if the cap was never received or was already extracted.
    public fun extract_tax_deposit_cap(
        admin: &mut BazaarCoreAdmin,
        _owner_cap: &DAppOwnerCap,
    ): TaxDepositCap {
        assert!(option::is_some(&admin.tax_deposit_cap), E_CAP_NOT_SET);
        option::extract(&mut admin.tax_deposit_cap)
    }

    /// V38 split — one-time extraction of ShopOpsCap from BazaarCoreAdmin during
    /// deployment, into the bazaar_shop_ops cap store. authorize_shop_ops_package
    /// must be called first. Mirrors extract_tribe_token_shop_cap.
    public fun extract_shop_ops_cap(
        admin: &mut BazaarCoreAdmin,
        _owner_cap: &DAppOwnerCap,
    ): ShopOpsCap {
        assert!(option::is_some(&admin.shop_ops_cap), E_CAP_NOT_SET);
        option::extract(&mut admin.shop_ops_cap)
    }

    public(package) fun borrow_tax_deposit_cap(admin: &BazaarCoreAdmin): &TaxDepositCap {
        assert!(option::is_some(&admin.tax_deposit_cap), E_CAP_NOT_SET);
        option::borrow(&admin.tax_deposit_cap)
    }

    public fun version(admin: &BazaarCoreAdmin): u64 { admin.version }
    public fun economy_package(admin: &BazaarCoreAdmin): Option<address> { admin.economy_package }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(ctx: &mut TxContext): BazaarCoreAdmin {
        BazaarCoreAdmin {
            id: object::new(ctx),
            tax_deposit_cap: option::none(),
            tribe_token_shop_cap: option::none(),
            economy_package: option::none(),
            shop_ops_cap: option::none(),
            shop_ops_package: option::none(),
            version: 1,
        }
    }

    #[test_only]
    public fun create_shop_cap_for_testing(economy_pkg: address, ctx: &mut TxContext): TribeTokenShopCap {
        TribeTokenShopCap {
            id: object::new(ctx),
            authorized_economy_package: economy_pkg,
        }
    }

    #[test_only]
    public fun create_shop_ops_cap_for_testing(shop_ops_pkg: address, ctx: &mut TxContext): ShopOpsCap {
        ShopOpsCap {
            id: object::new(ctx),
            authorized_shop_ops_package: shop_ops_pkg,
        }
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
