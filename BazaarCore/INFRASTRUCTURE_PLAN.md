# BazaarCore — Infrastructure Plan
## Unified Marketplace for All Three Bazaar Types

> **Purpose:** The shared marketplace package used by ALL three bazaar frontends.
> One codebase handles NoTribe (EVE-only, 2-layer tax), EasyBazaar (EVE-only, 3-layer tax),
> and AdvancedBazaar (EVE for SSU/tribe tax, fantasy currency in bazaar_economy).
> Fix a bug once. Ship it to three frontends simultaneously.
>
> This package is deployed THIRD (after dapp_hub and shared_widgets) and provides the
> full marketplace surface: shops, buy/sell/exchange, direct trade, WTB escrow pool,
> membership roles, SSU governance, tribe governance (base layer), and item storage.
> bazaar_economy extends this package for Advanced tribes with token ledger operations.

---

## 1. Package Identity

| Field | Value |
|-------|-------|
| Package Name | `bazaar_core` |
| Language | Sui Move + React/TypeScript frontend |
| Max Size Target | 50KB bytecode (Move) |
| Move Dependencies | `sui`, `world` (EVE Frontier), `dapp_hub`, `shared_widgets` |
| Depended on by | `bazaar_economy` (Advanced tribes only) |
| Frontend | Three standalone Vite apps: `notribe.bazaar.app`, `easy.bazaar.app`, `advanced.bazaar.app` |
| Shared frontend code | `@bazaar/shared` npm workspace (hooks, TX builders, types, constants) |

---

## 2. Bazaar Type Constants

All modules within this package use a single `bazaar_type: u8` field to distinguish the three variants. The constants are:

```move
const BAZAAR_TYPE_NOTRIBE:  u8 = 0;   // Solo/small group, EVE only, 2-layer tax
const BAZAAR_TYPE_EASY:     u8 = 1;   // Tribe marketplace, EVE only, 3-layer tax
const BAZAAR_TYPE_ADVANCED: u8 = 2;   // Tribe marketplace, defers token ops to bazaar_economy
```

These constants are exported as public accessors for use by bazaar_economy and frontends.

---

## 3. Move Modules

### 3.1 `bazar.move` (~600 lines)
**Role:** Core shop registry and shop data types. Generic across all three bazaar types.

**Key Design Decisions:**
- `bazaar_type: u8` on the Shop struct determines tax routing in shop_ops
- Listings priced in EVE (SUI) for NoTribe and Easy; price field is reused as a token-unit quantity for Advanced (actual debit/credit handled by bazaar_economy)
- `tribe_id: u64` is 0 for NoTribe shops; non-zero for Easy and Advanced
- No foreign currency support — the v1 multi-currency experiment is retired in this architecture

**Shared Objects:**
- `BazarRegistry` — Unified shop registry for all three bazaar types

**Structs:**
```move
struct BazarRegistry has key {
    id: UID,
    shops: Table<ID, bool>,          // shop_id -> is_active sentinel
    shop_count_by_type: vector<u64>, // [notribe_count, easy_count, advanced_count]
}

struct Shop has key, store {
    id: UID,
    owner: address,
    kind: u8,                        // WTS=0, WTB=1, DE=2, FREE=3
    bazaar_type: u8,                 // 0=NoTribe, 1=Easy, 2=Advanced
    title: String,
    ssu_id: address,
    tribe_id: u64,                   // 0 for NoTribe
    listings: vector<Listing>,
    pairs: vector<ExchangePair>,     // DE only
    escrowed_eve: Balance<SUI>,      // EVE escrow for WTB pre-pay, DE liquidity
    created_at_ms: u64,
    expiry_ms: u64,
    is_active: bool,
}

struct Listing has store, copy, drop {
    item_type_id: u64,
    quantity: u64,
    price_eve: u64,                  // EVE price for NoTribe/Easy; token price for Advanced (bazaar_economy manages transfer)
    original_quantity: u64,
}

struct ExchangePair has store, copy, drop {
    offer_item_type_id: u64,
    offer_quantity: u64,
    request_item_type_id: u64,
    request_quantity: u64,
}
```

**Events:**
```move
struct ShopCreatedEvent has copy, drop {
    shop_id: ID,
    owner: address,
    kind: u8,
    bazaar_type: u8,
    ssu_id: address,
    tribe_id: u64,
    timestamp_ms: u64,
}

struct ShopClosedEvent has copy, drop {
    shop_id: ID,
    owner: address,
    bazaar_type: u8,
    ssu_id: address,
    tribe_id: u64,
    timestamp_ms: u64,
}
```

**Entry Functions:**
```move
public fun create_wts_shop(
    registry: &mut BazarRegistry,
    bazaar_type: u8,
    title: vector<u8>,
    ssu_id: address,
    tribe_id: u64,
    item_type_ids: vector<u64>,
    quantities: vector<u64>,
    prices_eve: vector<u64>,
    expiry_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID

public fun create_wtb_shop(
    registry: &mut BazarRegistry,
    bazaar_type: u8,
    title: vector<u8>,
    ssu_id: address,
    tribe_id: u64,
    item_type_ids: vector<u64>,
    quantities: vector<u64>,
    prices_eve: vector<u64>,
    prepay: Coin<SUI>,
    expiry_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID

public fun create_de_shop(
    registry: &mut BazarRegistry,
    bazaar_type: u8,
    title: vector<u8>,
    ssu_id: address,
    tribe_id: u64,
    offer_item_type_ids: vector<u64>,
    offer_quantities: vector<u64>,
    request_item_type_ids: vector<u64>,
    request_quantities: vector<u64>,
    expiry_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID

public fun create_free_shop(
    registry: &mut BazarRegistry,
    bazaar_type: u8,
    title: vector<u8>,
    ssu_id: address,
    tribe_id: u64,
    item_type_ids: vector<u64>,
    quantities: vector<u64>,
    expiry_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID

public fun close_shop(
    registry: &mut BazarRegistry,
    shop: &mut Shop,
    clock: &Clock,
    ctx: &mut TxContext,
)

public fun update_shop_listing(
    shop: &mut Shop,
    listing_idx: u64,
    new_price_eve: u64,
    ctx: &mut TxContext,
)

// Accessors (public — used by bazaar_economy and frontends via TX builders)
public fun shop_bazaar_type(shop: &Shop): u8
public fun shop_tribe_id(shop: &Shop): u64
public fun shop_ssu_id(shop: &Shop): address
public fun shop_kind(shop: &Shop): u8
public fun shop_owner(shop: &Shop): address
public fun shop_is_active(shop: &Shop): bool
public fun shop_listings(shop: &Shop): &vector<Listing>
public fun listing_item_type_id(listing: &Listing): u64
public fun listing_quantity(listing: &Listing): u64
public fun listing_price_eve(listing: &Listing): u64
```

---

### 3.2 `shop_ops.move` (~700 lines)
**Role:** All buy/sell/exchange operations with conditional tax routing based on `bazaar_type`.

This is the most critical module in the package. Tax logic branches on `shop.bazaar_type`:

**Tax Routing Logic:**

```
bazaar_type == NOTRIBE (2-layer):
  gross_amount
    -> SSU Tax  = gross * ssu_tax_bps / 10000  -> SSUTaxWallet (this package)
    -> DApp Tax = gross * dapp_tax_bps / 10000 -> DAppTaxWallet (dapp_hub, via TaxDepositCap)
    -> net      = gross - ssu_tax - dapp_tax   -> Seller / escrow

bazaar_type == EASY (3-layer):
  gross_amount
    -> SSU Tax   = gross * ssu_tax_bps / 10000    -> SSUTaxWallet (this package)
    -> Tribe Tax = gross * tribe_tax_bps / 10000  -> TribeTaxWallet (this package)
    -> DApp Tax  = gross * dapp_tax_bps / 10000   -> DAppTaxWallet (dapp_hub, via TaxDepositCap)
    -> net       = gross - ssu - tribe - dapp      -> Seller

bazaar_type == ADVANCED — EVE operations only (3-layer, same as Easy):
  Internal TribeToken trades are NOT handled here.
  bazaar_economy hooks into this package's shop objects to debit/credit the ledger.
  When EVE flows through an Advanced shop (e.g. DE pair priced in EVE), tax applies same as Easy.
  No dApp tax on internal TribeToken-denominated trades (those are ledger-only, no EVE moves).
```

**Key Technical Note on Advanced Type:**
For Advanced tribes, `wts_buy` and `wtb_fill` for TribeToken-priced listings are NOT called directly from the frontend — instead `bazaar_economy` calls into this package's `internal_deduct_listing_quantity` hook to atomically decrement the listing, while bazaar_economy handles the ledger debit/credit itself. This keeps EVE coin handling in one place and ledger handling in another.

**Shared Objects (via SSUGovernance and TribeGovernance):**
Tax wallets are held inside governance objects (see 3.4 and 3.5). `shop_ops` receives mutable references to those objects.

**Entry Functions:**
```move
// WTS Buy — EVE payment. Conditional tax split by bazaar_type.
public fun wts_buy(
    shop: &mut Shop,
    listing_idx: u64,
    quantity: u64,
    payment: Coin<SUI>,
    ssu_gov: &mut SSUGovernance,
    tribe_gov: Option<&mut TribeGovernance>,    // None for NoTribe
    dapp_tax_wallet: &mut DAppTaxWallet,        // from dapp_hub
    dapp_config: &GovernanceConfig,             // from dapp_hub
    tax_deposit_cap: &TaxDepositCap,            // from dapp_hub (held by bazaar_core admin)
    storage: &mut UserStorage,
    clock: &Clock,
    ctx: &mut TxContext,
)

// WTB Fill — Seller delivers item, receives pre-escrowed EVE minus taxes.
public fun wtb_fill(
    shop: &mut Shop,
    listing_idx: u64,
    quantity: u64,
    ssu_gov: &mut SSUGovernance,
    tribe_gov: Option<&mut TribeGovernance>,
    dapp_tax_wallet: &mut DAppTaxWallet,
    dapp_config: &GovernanceConfig,
    tax_deposit_cap: &TaxDepositCap,
    storage: &mut UserStorage,
    clock: &Clock,
    ctx: &mut TxContext,
)

// DE Exchange — Item-for-item swap. Flat fee in EVE for Easy/Advanced (SSU+Tribe+DApp).
public fun de_exchange(
    shop: &mut Shop,
    pair_idx: u64,
    ssu_gov: &mut SSUGovernance,
    tribe_gov: Option<&mut TribeGovernance>,
    dapp_tax_wallet: &mut DAppTaxWallet,
    dapp_config: &GovernanceConfig,
    tax_deposit_cap: &TaxDepositCap,
    de_fee_payment: Coin<SUI>,
    storage: &mut UserStorage,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Free Claim — No tax. Any registered user can claim.
public fun free_claim(
    shop: &mut Shop,
    listing_idx: u64,
    quantity: u64,
    storage: &mut UserStorage,
    membership: &MemberRegistry,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Hook for bazaar_economy — atomically decrement listing quantity without EVE transfer.
// ONLY callable from within bazaar_economy (enforced by TribeTokenShopCap).
public fun deduct_listing_quantity(
    shop: &mut Shop,
    listing_idx: u64,
    quantity: u64,
    cap: &TribeTokenShopCap,            // capability minted by this module, held by bazaar_economy
)

// Hook for bazaar_economy — add listing quantity (WTB fill from ledger side).
public fun add_listing_quantity(
    shop: &mut Shop,
    listing_idx: u64,
    quantity: u64,
    cap: &TribeTokenShopCap,
)
```

**Events:**
```move
struct PurchaseEvent has copy, drop {
    tx_type: String,                 // "wts_buy" | "wtb_fill" | "de_exchange" | "free_claim"
    bazaar_type: String,             // "notribe" | "easy" | "advanced"
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
```

**Internal Tax Splitting Helper (package-private):**
```move
public(package) fun split_payment(
    payment: Coin<SUI>,
    gross_amount: u64,
    bazaar_type: u8,
    ssu_tax_bps: u64,
    tribe_tax_bps: u64,
    dapp_tax_bps: u64,
    ctx: &mut TxContext,
): (Coin<SUI>, Coin<SUI>, Coin<SUI>, Coin<SUI>)
// Returns: (ssu_tax_coin, tribe_tax_coin, dapp_tax_coin, net_coin)
// For NoTribe: tribe_tax_coin is zero-value (immediately dropped)
```

---

### 3.3 `membership.move` (~280 lines)
**Role:** Unified role management system for all three bazaar types.

For NoTribe, only SSU-level roles apply. For Easy and Advanced, tribe-level roles stack on top of SSU-level roles. The effective role of a player is `max(ssu_role, tribe_role)`.

**Shared Objects:**
- `MemberRegistry` — Per-SSU membership table

**Structs:**
```move
struct MemberRegistry has key, store {
    id: UID,
    ssu_id: address,
    tribe_id: u64,                   // 0 for NoTribe registries
    members: Table<address, MemberEntry>,
    member_count: u64,
}

struct MemberEntry has store, copy, drop {
    player: address,
    ssu_role: u8,                    // SSU-scoped role (roles from dapp_hub::role_types)
    tribe_role: u8,                  // Tribe-scoped role (0 for NoTribe)
    is_banned: bool,
    registered_at_ms: u64,
}
```

**Capabilities:**
```move
// Per-SSU ownership cap — identifies the SSU operator
struct SSUOwnerCap has key, store {
    id: UID,
    ssu_id: address,
    tribe_id: u64,
}

struct SSUAdminCap has key, store {
    id: UID,
    ssu_id: address,
}

struct SSUModCap has key, store {
    id: UID,
    ssu_id: address,
}
```

**Entry Functions:**
```move
// Auto-register a stranger on first interaction (role = STRANGER)
public fun register_stranger(
    registry: &mut MemberRegistry,
    ssu_gov: &SSUGovernance,
    clock: &Clock,
    ctx: &mut TxContext,
)

// SSU-level role assignment (SSU Owner or Admin)
public fun set_ssu_role(
    cap: &SSUOwnerCap,
    registry: &mut MemberRegistry,
    player: address,
    role: u8,
    ctx: &mut TxContext,
)

// Tribe-level role assignment (TribeLeaderCap from dapp_hub required)
public fun set_tribe_role(
    leader_cap: &TribeLeaderCap,          // from dapp_hub::tribe_registry
    registry: &mut MemberRegistry,
    player: address,
    role: u8,
    ctx: &mut TxContext,
)

// SSU ban/unban (SSU Owner or Admin)
public fun set_ban(
    cap: &SSUOwnerCap,
    registry: &mut MemberRegistry,
    player: address,
    banned: bool,
)

// Read effective role (max of SSU and tribe roles)
public fun effective_role(registry: &MemberRegistry, player: address): u8

// Check minimum role gate — aborts with E_INSUFFICIENT_ROLE if not met
public fun assert_min_role(registry: &MemberRegistry, player: address, min_role: u8)

// Accessors
public fun is_banned(registry: &MemberRegistry, player: address): bool
public fun member_count(registry: &MemberRegistry): u64
public fun is_registered(registry: &MemberRegistry, player: address): bool
```

**Error Codes:**
```move
const E_INSUFFICIENT_ROLE: u64 = 1;
const E_PLAYER_BANNED: u64 = 2;
const E_ALREADY_REGISTERED: u64 = 3;
const E_PLAYER_NOT_FOUND: u64 = 4;
const E_INVALID_ROLE: u64 = 5;
```

---

### 3.4 `ssu_governance.move` (~500 lines)
**Role:** SSU-level governance. Tax wallet, SSU tax rate configuration, widget toggles, per-SSU bans, SSU caps lifecycle.

For NoTribe SSUs, `ssu_governance` is the top-level governance object. For Easy and Advanced SSUs, it layers UNDER tribe governance — the SSU operator sets surcharge rates that are added on top of the tribe base rate.

**Shared Objects:**
- `SSUGovernance` — One per registered SSU (created when SSU is accepted into bazaar_core)

**Structs:**
```move
struct SSUGovernance has key {
    id: UID,
    ssu_id: address,
    bazaar_type: u8,
    tribe_id: u64,                       // 0 for NoTribe
    owner: address,
    tax_config: SSUTaxConfig,
    tax_wallet: Balance<SUI>,            // Accumulated SSU-level EVE tax
    total_tax_collected: u64,
    widget_config: WidgetConfig,         // from shared_widgets
    announcement_board: AnnouncementBoard, // from shared_widgets — SSU-local announcements
    is_active: bool,
    created_at_ms: u64,
}

struct SSUTaxConfig has store, copy, drop {
    wts_bps: u64,                        // WTS tax in basis points (0-1000, max 10%)
    wtb_bps: u64,                        // WTB tax in basis points
    de_flat_fee: u64,                    // DE flat fee in MIST (EVE)
    surcharge_mode: bool,                // true = surcharge on top of tribe rate, false = override
}
```

**Events:**
```move
struct SSUTaxConfigUpdated has copy, drop {
    ssu_id: address,
    wts_bps: u64,
    wtb_bps: u64,
    de_flat_fee: u64,
    updated_by: address,
    timestamp_ms: u64,
}

struct SSUTaxWithdrawn has copy, drop {
    ssu_id: address,
    amount: u64,
    withdrawn_by: address,
    timestamp_ms: u64,
}
```

**Entry Functions:**
```move
// Create SSUGovernance (called internally during SSU registration acceptance)
public(package) fun create_ssu_governance(
    ssu_id: address,
    bazaar_type: u8,
    tribe_id: u64,
    owner: address,
    clock: &Clock,
    ctx: &mut TxContext,
): SSUGovernance

// SSU Owner configuration
public fun set_ssu_tax_config(
    cap: &SSUOwnerCap,
    gov: &mut SSUGovernance,
    wts_bps: u64,
    wtb_bps: u64,
    de_flat_fee: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

public fun withdraw_ssu_tax(
    cap: &SSUOwnerCap,
    gov: &mut SSUGovernance,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<SUI>

// Widget toggles (Admin+)
public fun toggle_widget(
    cap: &SSUAdminCap,
    gov: &mut SSUGovernance,
    widget_idx: u64,
    enabled: bool,
)

public fun set_server_url(
    cap: &SSUOwnerCap,
    gov: &mut SSUGovernance,
    url: vector<u8>,
)

// Deposit tax into SSU wallet — called by shop_ops
public(package) fun deposit_ssu_tax(gov: &mut SSUGovernance, coin: Coin<SUI>)

// Accessors (public — called by shop_ops, tribe_governance, bazaar_economy)
public fun ssu_wts_tax_bps(gov: &SSUGovernance): u64
public fun ssu_wtb_tax_bps(gov: &SSUGovernance): u64
public fun ssu_de_flat_fee(gov: &SSUGovernance): u64
public fun ssu_tax_balance(gov: &SSUGovernance): u64
public fun ssu_bazaar_type(gov: &SSUGovernance): u8
public fun ssu_tribe_id(gov: &SSUGovernance): u64
public fun ssu_is_active(gov: &SSUGovernance): bool
```

**Error Codes:**
```move
const E_WRONG_SSU: u64 = 1;
const E_RATE_EXCEEDS_CAP: u64 = 2;      // max 10% per tier
const E_INSUFFICIENT_BALANCE: u64 = 3;
const E_SSU_NOT_ACTIVE: u64 = 4;
```

---

### 3.5 `tribe_governance.move` (~500 lines)
**Role:** Tribe-level base governance. Tribe tax wallet, tribe tax rates, tribe-wide bans, tribe SSU management, tribe caps (SuperAdmin, Admin, Mod). Active for Easy and Advanced bazaar types only — NoTribe SSUs never create a TribeGovernance object.

**Design Note:** This module contains the governance STRUCTURE and STATE for a tribe operating on bazaar_core. It does not contain economy controls (mint/burn, exchange, vault) — those belong to `bazaar_economy::economy_governance` which extends this via its own shared object referencing the same `tribe_id`.

**Shared Objects:**
- `TribeGovernance` — One per tribe (created when a tribe first registers an SSU via DappHub acceptance)

**Structs:**
```move
struct TribeGovernance has key {
    id: UID,
    tribe_id: u64,
    bazaar_type: u8,                     // 1=Easy, 2=Advanced
    tribe_tax_config: TribeTaxConfig,
    tax_wallet: Balance<SUI>,            // Accumulated tribe-level EVE tax
    total_tax_collected: u64,
    global_bans: Table<address, bool>,   // Tribe-wide bans
    announcement_board: AnnouncementBoard, // from shared_widgets — tribe-wide announcements
    ssu_ids: vector<address>,
    is_active: bool,
    created_at_ms: u64,
}

struct TribeTaxConfig has store, copy, drop {
    wts_bps: u64,                        // Base tribe WTS tax rate (0-1000)
    wtb_bps: u64,                        // Base tribe WTB tax rate
    de_flat_fee: u64,                    // Base tribe DE flat fee in MIST
}
```

**Capabilities:**
```move
struct TribeSuperAdminCap has key, store {
    id: UID,
    tribe_id: u64,
}

struct TribeAdminCap has key, store {
    id: UID,
    tribe_id: u64,
}

struct TribeModCap has key, store {
    id: UID,
    tribe_id: u64,
}
```

**Events:**
```move
struct TribeTaxConfigUpdated has copy, drop {
    tribe_id: u64,
    wts_bps: u64,
    wtb_bps: u64,
    de_flat_fee: u64,
    updated_by: address,
    timestamp_ms: u64,
}

struct TribeTaxWithdrawn has copy, drop {
    tribe_id: u64,
    amount: u64,
    withdrawn_by: address,
    timestamp_ms: u64,
}

struct TribeGlobalBanSet has copy, drop {
    tribe_id: u64,
    player: address,
    banned: bool,
    set_by: address,
    timestamp_ms: u64,
}
```

**Entry Functions:**
```move
// Create TribeGovernance (called internally when tribe's first SSU registration is accepted)
public(package) fun create_tribe_governance(
    tribe_id: u64,
    bazaar_type: u8,
    clock: &Clock,
    ctx: &mut TxContext,
): TribeGovernance

// Tribe tax configuration (TribeLeaderCap from dapp_hub)
public fun set_tribe_tax_config(
    leader_cap: &TribeLeaderCap,
    gov: &mut TribeGovernance,
    wts_bps: u64,
    wtb_bps: u64,
    de_flat_fee: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

public fun withdraw_tribe_tax(
    leader_cap: &TribeLeaderCap,
    gov: &mut TribeGovernance,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<SUI>

// Tribe-wide ban management (TribeAdminCap+)
public fun set_tribe_ban(
    cap: &TribeAdminCap,
    gov: &mut TribeGovernance,
    player: address,
    banned: bool,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Tribe cap management (TribeLeaderCap grants SuperAdmin; SuperAdmin grants Admin/Mod)
public fun grant_tribe_super_admin(
    leader_cap: &TribeLeaderCap,
    gov: &mut TribeGovernance,
    recipient: address,
    ctx: &mut TxContext,
): TribeSuperAdminCap

public fun grant_tribe_admin(
    super_admin_cap: &TribeSuperAdminCap,
    gov: &mut TribeGovernance,
    recipient: address,
    ctx: &mut TxContext,
): TribeAdminCap

public fun grant_tribe_mod(
    admin_cap: &TribeAdminCap,
    gov: &mut TribeGovernance,
    recipient: address,
    ctx: &mut TxContext,
): TribeModCap

// Deposit tax — called by shop_ops
public(package) fun deposit_tribe_tax(gov: &mut TribeGovernance, coin: Coin<SUI>)

// Accessors (public — called by shop_ops, bazaar_economy)
public fun tribe_wts_tax_bps(gov: &TribeGovernance): u64
public fun tribe_wtb_tax_bps(gov: &TribeGovernance): u64
public fun tribe_de_flat_fee(gov: &TribeGovernance): u64
public fun tribe_tax_balance(gov: &TribeGovernance): u64
public fun tribe_is_globally_banned(gov: &TribeGovernance, player: address): bool
public fun tribe_bazaar_type(gov: &TribeGovernance): u8
public fun tribe_id(gov: &TribeGovernance): u64
public fun tribe_is_active(gov: &TribeGovernance): bool
public fun tribe_ssu_ids(gov: &TribeGovernance): &vector<address>
```

**Error Codes:**
```move
const E_WRONG_TRIBE: u64 = 1;
const E_RATE_EXCEEDS_CAP: u64 = 2;
const E_INSUFFICIENT_BALANCE: u64 = 3;
const E_PLAYER_GLOBALLY_BANNED: u64 = 4;
const E_NOT_EASY_OR_ADVANCED: u64 = 5;   // Guards — tribe_governance functions abort for NoTribe
```

---

### 3.6 `user_storage.move` (~320 lines)
**Role:** Item escrow, unclaimed items management, per-player item storage, volume limits.

Used by all three bazaar types. For Advanced tribes where TribeToken trades occur, bazaar_economy uses separate ledger credit/debit — this module handles ITEM (not currency) storage exclusively.

**Shared Objects:**
- `UserStorage` — One per SSU (stores items players have deposited or purchased but not yet retrieved)

**Structs:**
```move
struct UserStorage has key {
    id: UID,
    ssu_id: address,
    deposits: Table<address, vector<StoredItem>>,  // player -> items
    unclaimed_items: Table<ID, UnclaimedItem>,      // for closed/expired shop items
    total_item_count: u64,
}

struct StoredItem has store, copy, drop {
    item_type_id: u64,
    quantity: u64,
    deposited_at_ms: u64,
    source_shop_id: Option<ID>,
}

struct UnclaimedItem has store, drop {
    original_owner: address,
    item_type_id: u64,
    quantity: u64,
    shop_id: ID,
    expiry_ms: u64,
}
```

**Entry Functions:**
```move
// Store purchased items (called by shop_ops after successful purchase)
public(package) fun store_purchased_items(
    storage: &mut UserStorage,
    buyer: address,
    item_type_id: u64,
    quantity: u64,
    source_shop_id: ID,
    clock: &Clock,
)

// Player withdraws their stored items
public fun withdraw_items(
    storage: &mut UserStorage,
    item_indices: vector<u64>,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Move items to unclaimed on shop close/expiry
public(package) fun move_to_unclaimed(
    storage: &mut UserStorage,
    original_owner: address,
    item_type_id: u64,
    quantity: u64,
    shop_id: ID,
    expiry_ms: u64,
)

// Claim unclaimed item
public fun claim_unclaimed_item(
    storage: &mut UserStorage,
    shop_id: ID,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Accessors
public fun player_item_count(storage: &UserStorage, player: address): u64
public fun unclaimed_count(storage: &UserStorage): u64
```

**Error Codes:**
```move
const E_NO_ITEMS_TO_WITHDRAW: u64 = 1;
const E_UNCLAIMED_ITEM_NOT_FOUND: u64 = 2;
const E_UNCLAIMED_ITEM_EXPIRED: u64 = 3;
const E_VOLUME_LIMIT_EXCEEDED: u64 = 4;
```

---

### 3.7 `trade.move` (~330 lines)
**Role:** Direct peer-to-peer trade using EVE (SUI) coin escrow. For NoTribe and Easy, this is the complete direct trade surface. For Advanced tribes, bazaar_economy provides a `trade_with_ledger` variant that debits/credits the TribeTokenLedger; the underlying item transfer still uses this module's item-exchange helpers.

**Shared Objects:**
- `TradeRegistry` — Active trade proposals

**Structs:**
```move
struct TradeRegistry has key {
    id: UID,
    proposals: Table<ID, TradeProposal>,
    proposal_count: u64,
}

struct TradeProposal has store {
    id: UID,
    proposer: address,
    counterparty: address,
    ssu_id: address,
    tribe_id: u64,
    bazaar_type: u8,
    offered_items: vector<TradeItem>,
    requested_items: vector<TradeItem>,
    offered_eve: u64,                    // EVE offered (may be 0)
    requested_eve: u64,                  // EVE requested (may be 0)
    escrowed_eve: Balance<SUI>,          // locked by proposer
    status: u8,                          // 0=Pending, 1=Accepted, 2=Rejected, 3=Cancelled, 4=Expired
    created_at_ms: u64,
    expiry_ms: u64,
}

struct TradeItem has store, copy, drop {
    item_type_id: u64,
    quantity: u64,
}
```

**Events:**
```move
struct TradeEvent has copy, drop {
    proposal_id: ID,
    proposer: address,
    counterparty: address,
    bazaar_type: String,
    ssu_id: address,
    tribe_id: u64,
    status: String,                      // "accepted" | "rejected" | "cancelled" | "expired"
    eve_amount: u64,
    timestamp_ms: u64,
}
```

**Entry Functions:**
```move
public fun create_proposal(
    registry: &mut TradeRegistry,
    counterparty: address,
    ssu_id: address,
    tribe_id: u64,
    bazaar_type: u8,
    offered_item_type_ids: vector<u64>,
    offered_quantities: vector<u64>,
    requested_item_type_ids: vector<u64>,
    requested_quantities: vector<u64>,
    eve_payment: Coin<SUI>,
    requested_eve: u64,
    expiry_ms: u64,
    membership: &MemberRegistry,
    clock: &Clock,
    ctx: &mut TxContext,
): ID

public fun accept_proposal(
    registry: &mut TradeRegistry,
    proposal_id: ID,
    eve_payment: Coin<SUI>,
    storage: &mut UserStorage,
    clock: &Clock,
    ctx: &mut TxContext,
)

public fun reject_proposal(
    registry: &mut TradeRegistry,
    proposal_id: ID,
    clock: &Clock,
    ctx: &mut TxContext,
)

public fun cancel_proposal(
    registry: &mut TradeRegistry,
    proposal_id: ID,
    clock: &Clock,
    ctx: &mut TxContext,
)

public fun expire_proposal(
    registry: &mut TradeRegistry,
    proposal_id: ID,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Hook for bazaar_economy — validate and consume a proposal, then allow ledger settlement
public fun consume_proposal_for_ledger(
    registry: &mut TradeRegistry,
    proposal_id: ID,
    cap: &TribeTokenShopCap,
    clock: &Clock,
): (address, address, vector<TradeItem>, vector<TradeItem>)
```

---

### 3.8 `wtb_escrow_pool.move` (~130 lines)
**Role:** WTB pre-paid escrow pool. Shop owners pre-fund WTB listings so sellers can fill immediately. All three bazaar types use this — EVE is always the escrow currency here (Advanced TribeToken WTB is handled via bazaar_economy).

**Shared Objects:**
- `WtbEscrowPool` — One per SSU (holds pre-funded WTB balances)

**Structs:**
```move
struct WtbEscrowPool has key {
    id: UID,
    ssu_id: address,
    deposits: Table<ID, Balance<SUI>>,   // shop_id -> escrowed EVE
    total_escrowed: u64,
}
```

**Entry Functions:**
```move
// Shop owner tops up WTB escrow for their shop
public fun top_up_escrow(
    pool: &mut WtbEscrowPool,
    shop_id: ID,
    payment: Coin<SUI>,
)

// Withdraw remaining escrow when closing a WTB shop
public fun withdraw_escrow(
    pool: &mut WtbEscrowPool,
    shop_id: ID,
    cap: &SSUOwnerCap,
    ctx: &mut TxContext,
): Coin<SUI>

// Release payment to seller — called by shop_ops::wtb_fill after tax split
public(package) fun release_to_seller(
    pool: &mut WtbEscrowPool,
    shop_id: ID,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SUI>

// Accessors
public fun shop_escrow_balance(pool: &WtbEscrowPool, shop_id: ID): u64
public fun total_escrowed(pool: &WtbEscrowPool): u64
```

---

### 3.9 `quicktrade_vault.move` (~110 lines)
**Role:** On-chain ledger for open inventory management. Players deposit items to the vault to signal trade availability; other players see the vault contents and can initiate trades. Available for all three bazaar types.

**Shared Objects:**
- `QuicktradeVault` — One per SSU

**Structs:**
```move
struct QuicktradeVault has key {
    id: UID,
    ssu_id: address,
    deposits: Table<address, vector<VaultEntry>>,
}

struct VaultEntry has store, copy, drop {
    item_type_id: u64,
    quantity: u64,
    deposited_at_ms: u64,
}
```

**Entry Functions:**
```move
public fun deposit_to_vault(
    vault: &mut QuicktradeVault,
    item_type_ids: vector<u64>,
    quantities: vector<u64>,
    clock: &Clock,
    ctx: &mut TxContext,
)

public fun withdraw_from_vault(
    vault: &mut QuicktradeVault,
    entry_indices: vector<u64>,
    ctx: &mut TxContext,
)

public fun player_vault_entries(vault: &QuicktradeVault, player: address): &vector<VaultEntry>
```

---

### 3.10 `bazaar_core_admin.move` (~120 lines)
**Role:** Package-level admin. Holds the `TaxDepositCap` received from DappHub after deployment. Issues `TribeTokenShopCap` to bazaar_economy after economy package is deployed. Manages package version constant.

**Shared Objects:**
- `BazaarCoreAdmin` — Singleton admin object

**Structs:**
```move
struct BazaarCoreAdmin has key {
    id: UID,
    tax_deposit_cap: TaxDepositCap,          // from dapp_hub — received post-deploy
    economy_package: Option<address>,         // bazaar_economy package address (set post-deploy)
    version: u64,
}

// Capability issued to bazaar_economy to authorize shop hooks
struct TribeTokenShopCap has key, store {
    id: UID,
    authorized_economy_package: address,
}
```

**Entry Functions:**
```move
// DApp Owner sets the tax deposit cap after DappHub -> bazaar_core handoff
public fun receive_tax_deposit_cap(
    dapp_owner_cap: &DAppOwnerCap,
    admin: &mut BazaarCoreAdmin,
    cap: TaxDepositCap,
)

// DApp Owner registers bazaar_economy package and mints its shop cap
public fun authorize_economy_package(
    dapp_owner_cap: &DAppOwnerCap,
    admin: &mut BazaarCoreAdmin,
    economy_package_id: address,
    ctx: &mut TxContext,
): TribeTokenShopCap

// Accessor — shop_ops reads the cap for dapp_hub deposits
public(package) fun borrow_tax_deposit_cap(admin: &BazaarCoreAdmin): &TaxDepositCap
```

---

## 4. Frontend — Three Sites Using BazaarCore

All three frontends share logic via `@bazaar/shared`. Each has its own deployment with feature flags controlling what is visible.

### 4.1 NoTribe Bazaar — `notribe.bazaar.app?ssuId={address}`

**URL Pattern:** `notribe.bazaar.app?ssuId=0x...`

**Screens:**

```
1. Landing
   - Wallet connect
   - If unregistered SSU -> "SSU not registered" with link to DappHub
   - If registered + unowned -> "Claim SSU Ownership" button
   - If owned + not docked -> Show "Enter Bazaar" button
   - Auto-dock for returning registered players

2. Bazar (main view)
   - Godot game view embedded (WebGL export)
   - Shop list panel (WTS, WTB, DE, FREE tabs)
   - EVE prices throughout — no currency selector
   - Create shop button (registered users)

3. Trade
   - Counterparty search (by wallet or character name)
   - Propose trade: offer items + EVE, request items + EVE
   - Active proposals list (sent + received)
   - Accept / Reject / Cancel actions

4. Inventory
   - Player-owned items on this SSU
   - Deposit-to-vault action
   - Withdraw-from-storage action

5. My Shops
   - List of player's active shops
   - Close shop, edit listing prices

6. Quicktrade
   - Vault deposit / withdrawal
   - View other players' vault entries

7. SSU Admin Panel (SSU Owner/Admin only)
   Tab: Tax Config
     - WTS rate, WTB rate, DE flat fee (EVE)
     - Tax balance + withdrawal
   Tab: Users
     - Role assignment (Member, Mod, Admin)
     - Ban / unban
     - Registered user list
   Tab: Storage
     - Item storage overview (all deposited items)
     - Unclaimed items list
   Tab: Widgets
     - Toggle: Announcements, Guestbook, Mission Board, Donate
     - Server URL field

8. SSU Moderator Panel (SSU Mod+)
   Tab: Reports (future)
   Tab: Announcements — write/delete/pin
   Tab: Guestbook — delete entries
```

**Feature Flags (relative to Easy/Advanced — these are ABSENT in NoTribe):**
- No tribe identity bar / tribe name header
- No tribe tax layer in purchase breakdown
- No tribe governance panel
- No Tribe Hub screen
- No Exchange window or beacon
- No TribeToken balance display

---

### 4.2 Easy Bazaar — `easy.bazaar.app?tribe={name}&ssuId={address}`

**URL Pattern:** `easy.bazaar.app?tribe=TribeName&ssuId=0x...`

**Screens:**

```
1. Landing
   - Tribe identity header (tribe name, leader name, description)
   - Wallet connect
   - If not registered to this tribe -> application status or "Apply" link (to DappHub)
   - Auto-dock for returning tribe members

2. Bazar (main view)
   - Godot game view
   - Shop list — shows SSU-local shops AND (toggle) cross-SSU tribe shops
   - EVE prices only
   - Shop kind tabs: WTS, WTB, DE, FREE

3. Trade
   - Same as NoTribe (EVE only)

4. Inventory
   - Same as NoTribe

5. My Shops
   - Same as NoTribe, with tribe tag on each shop

6. Tribe Hub
   - Tribe identity card (name, leader, description, member count)
   - Tribe-wide Announcements (from TribeGovernance announcement board)
   - Guestbook (SSU-local or tribe-wide toggle)
   - Tribe member list (public view)

7. SSU Admin Panel (SSU Owner/Admin only)
   Tab: Tax Config
     - SSU surcharge rates (on top of tribe base)
     - SSU tax balance + withdrawal
   Tab: Users
     - SSU-level role assignment
     - SSU-local bans
   Tab: Storage
     - Same as NoTribe
   Tab: Widgets
     - Same as NoTribe

8. Tribe Admin Panel (TribeLeader / TribeSuperAdmin / TribeAdmin)
   Tab: Tax
     - Tribe base WTS/WTB/DE rates
     - Tribe tax balance + withdrawal
   Tab: Members
     - Tribe-wide role assignment
     - Tribe-wide bans
     - Application queue (accept/reject)
   Tab: SSUs
     - All tribe SSUs listed
     - Add/remove SSU from tribe
   Tab: Announcements
     - Create/edit/delete tribe-wide announcements
     - Pin/unpin

9. SSU Moderator Panel
   - Same as NoTribe moderator panel
```

**What Easy Has vs NoTribe:**
- Tribe identity header on all screens
- 3-layer tax breakdown in purchase modal (SSU Tax + Tribe Tax + DApp Tax + Net)
- Tribe Admin Panel (new)
- Tribe Hub screen (new)
- Cross-SSU shop browsing within tribe

**What Easy Does NOT Have vs Advanced:**
- No Exchange window or beacon
- No TribeToken balance
- No vault management
- No token mint/burn controls
- No multi-sig withdrawal panel

---

### 4.3 Advanced Bazaar — `advanced.bazaar.app?tribe={name}&ssuId={address}`

**URL Pattern:** `advanced.bazaar.app?tribe=TribeName&ssuId=0x...`

**Screens:**

Same as EasyBazaar PLUS the following screens and additions (these features are provided by bazaar_economy and displayed in the Advanced frontend):

```
1. Landing (additions)
   - TribeToken balance display in wallet bar (reads from TribeTokenLedger in bazaar_economy)
   - Exchange rate ticker (current TribeToken/EVE rate from bazaar_economy::TribeExchangePool)

2. Bazar (addition)
   - Shop listings show TribeToken prices (from bazaar_economy ledger-priced listings)
   - Purchase modal shows TribeToken debit from ledger

3. Exchange (new screen — from bazaar_economy)
   - TribeToken to EVE swap interface
   - EVE to TribeToken swap interface
   - AMM rate display (k = eve_reserve * token_reserve)
   - Slippage display

4. Vault (new panel — from bazaar_economy)
   - EVE vault balance
   - Deposit EVE to vault
   - Multi-sig withdrawal request list
   - Request withdrawal / approve / deny / execute

5. Tribe Admin Panel (additions from bazaar_economy)
   Tab: Economy (new tab — Advanced only)
     - Mint TribeToken (to tribe vault or to wallet)
     - Burn TribeToken (from circulation)
     - Total supply display
     - Exchange pool seeding (deposit EVE + TribeToken to pool)
     - Exchange toggle (pause/resume)
     - Inflation rate tracker
   Tab: Vault (new tab — Advanced only)
     - Vault EVE balance
     - Pending withdrawal requests
     - Approve/deny withdrawals
```

**Important Architectural Note for Advanced Frontend:**
The Advanced frontend imports hooks from BOTH `@bazaar/shared` (for bazaar_core features) AND a separate `@bazaar/economy` package (or advanced-specific section of `@bazaar/shared`) for bazaar_economy features. The frontend knows it is talking to two different on-chain packages via their respective package IDs in `.env`.

---

### 4.4 Shared Frontend Code — `@bazaar/shared`

All three bazaar frontends import from this npm workspace package:

```
packages/shared/
├── hooks/
│   ├── useShops.ts                  — Query BazarRegistry + shop objects
│   ├── useMembership.ts             — Query MemberRegistry for player role/ban
│   ├── useSSUGovernance.ts          — Query SSUGovernance (tax config, widget config)
│   ├── useTribeGovernance.ts        — Query TribeGovernance (null for NoTribe)
│   ├── useUserStorage.ts            — Query UserStorage (deposited items)
│   ├── useTradeProposals.ts         — Query TradeRegistry (active proposals)
│   ├── useWtbEscrowPool.ts          — Query WtbEscrowPool
│   ├── useQuicktradeVault.ts        — Query QuicktradeVault
│   └── useRegistration.ts           — Query dapp_hub SSURegistry (gating)
├── tx/
│   ├── shops.ts                     — Create/close shop TX builders
│   ├── shop_ops.ts                  — wts_buy, wtb_fill, de_exchange, free_claim builders
│   ├── membership.ts                — register_stranger, set_role, ban builders
│   ├── ssu_governance.ts            — set_tax_config, withdraw_tax, toggle_widget builders
│   ├── tribe_governance.ts          — tribe_tax, tribe_ban, cap_grant builders (Easy/Advanced)
│   ├── trade.ts                     — create_proposal, accept, reject, cancel builders
│   ├── wtb_escrow_pool.ts           — top_up, withdraw_escrow builders
│   └── quicktrade_vault.ts          — deposit, withdraw builders
├── types/
│   ├── shop.ts                      — Shop, Listing, ExchangePair TypeScript types
│   ├── membership.ts                — MemberEntry, role constants
│   ├── governance.ts                — SSUTaxConfig, TribeTaxConfig, cap types
│   ├── trade.ts                     — TradeProposal, TradeItem types
│   └── common.ts                    — BazaarType enum, shared event types
├── constants/
│   ├── package-ids.ts               — BAZAAR_CORE_PACKAGE_ID (from .env)
│   ├── object-ids.ts                — All shared object IDs (from .env or registry)
│   └── roles.ts                     — Role numeric constants
└── utils/
    ├── bcs.ts                       — BCS decoding helpers for Move structs
    ├── tax.ts                       — Tax calculation helpers (split_payment preview)
    └── formatters.ts                — EVE amount formatting, address truncation
```

All hooks use **direct Sui fullnode RPC** (`sui_getObject`, `suix_getDynamicFields`, `suix_queryEvents`) — never dAppKit's stale GraphQL client.

---

## 5. Size Budget (Move)

| Module | Estimated Bytecode | Notes |
|--------|-------------------|-------|
| `bazar.move` | ~11 KB | Unified shop registry + struct definitions |
| `shop_ops.move` | ~13 KB | Largest — conditional tax logic for all 3 types |
| `membership.move` | ~5 KB | Unified role system |
| `ssu_governance.move` | ~9 KB | SSU tax wallet + widget integration |
| `tribe_governance.move` | ~9 KB | Tribe tax wallet + cap management |
| `user_storage.move` | ~6 KB | Item escrow + unclaimed items |
| `trade.move` | ~7 KB | Direct trade + ledger hook |
| `wtb_escrow_pool.move` | ~3 KB | Pre-paid WTB escrow |
| `quicktrade_vault.move` | ~2 KB | Vault ledger |
| `bazaar_core_admin.move` | ~2 KB | Package admin + cap management |
| **Total** | **~67 KB** | **Wait — see note below** |

> **Size Warning:** 67 KB exceeds the 50 KB target from the Master Plan. However, this is still
> within the 80 KB safety threshold (Constitution Article I.1). The 50 KB target was set before
> the three-way unification was fully designed. The single unified package saves ~26 KB compared
> to three separate packages (the v1 estimates summed to 40+50+60 = 150 KB for the same logic).
>
> **If 67 KB proves too large after compilation, split options:**
> 1. Extract `trade.move` + `wtb_escrow_pool.move` + `quicktrade_vault.move` into a
>    `bazaar_trade` module sub-group (saves ~12 KB from core, still one package)
> 2. Merge `bazar.move` and `shop_ops.move` into a single module (saves ~2 KB overhead)
> 3. Reduce accessor function count (each `public fun` accessor adds ~50 bytes)

---

## 6. Reference Sources (NO COPY-PASTE)

The following existing files serve as **mental reference only**. All code must be typed from scratch.

| Existing Source (READ ONLY) | What to Study | Notes |
|-----------------------------|--------------|-------|
| `Bazar1/bazar.move` | Shop struct patterns, registry design, listing data | Rewrite — add bazaar_type, remove foreign currency |
| `Bazar1/bazar_shops.move` | Buy/sell/exchange tax split patterns | Rewrite — conditional 2-layer/3-layer logic |
| `Bazar1/membership.move` | Role management, auto-register, effective role logic | Rewrite — unify SSU + tribe role into single entry |
| `Bazar1/ssu_governance.move` | SSU tax wallet, widget toggle, ban patterns | Rewrite — remove tribe surcharge complexity; surcharge is now additive via TribeTaxConfig |
| `Bazar1/tribe_registry.move` | Tribe cap creation, tribe tax patterns | Rewrite — governance extracted to tribe_governance.move |
| `Bazar1/user_storage.move` | Item escrow, unclaimed items pattern | Rewrite — strip TribeToken escrow variants |
| `Bazar1/trade.move` | Two-phase commit trade, proposal lifecycle | Rewrite — add ledger hook for Advanced; strip multi-currency |
| `Bazar1/wtb_escrow_pool.move` | Pre-paid WTB pool pattern | Rewrite — EVE only |
| `Bazar1/quicktrade_vault.move` | On-chain vault deposit/withdraw ledger | Rewrite — no changes needed conceptually |
| `Bazar1/vault_withdrawal.move` | Multi-sig withdrawal lifecycle (STUDY only — lives in bazaar_economy) | Do NOT implement here |
| `BazarPublicFix/AdminPanel.tsx` | 6-tab admin panel design pattern | Same design, adapt tab labels for NoTribe vs tribe types |
| `BazarPublicFix/SuperAdminPanel.tsx` | 8-tab superadmin panel design | Adapt for Tribe Admin Panel in Easy/Advanced |
| `BazarPublicFix/ModeratorPanel.tsx` | 3-tab moderator panel design | Same design, same functionality |
| `BazarPublicFix/index.css` | Full CSS design system | Same visual language throughout all 3 frontends |
| `Bazar1/ExchangeWindow.tsx` | Exchange UI pattern (STUDY only — for advanced.bazaar.app) | Rewrite in bazaar_economy frontend section |
| `Bazar1/TribeReserveVaultPanel.tsx` | Vault management UI (STUDY only — lives in bazaar_economy) | Do NOT implement in bazaar_core frontend |

---

## 7. Cross-Package API Calls (Inbound — What BazaarCore Calls)

### 7.1 From DappHub

| BazaarCore Calls | Package::Module::Function | When Called | Shared Object Required |
|-----------------|--------------------------|-------------|----------------------|
| Every EVE purchase | `dapp_hub::tax_wallet::deposit_dapp_tax()` | shop_ops on every wts_buy / wtb_fill / de_exchange | `DAppTaxWallet`, `TaxDepositCap` |
| Tax rate lookup | `dapp_hub::dapp_governance::global_dapp_tax_bps()` | shop_ops tax calculation | `GovernanceConfig` |
| SSU override check | `dapp_hub::dapp_governance::custom_ssu_tax_bps()` | shop_ops tax calculation | `GovernanceConfig` |
| Tribe override check | `dapp_hub::dapp_governance::custom_tribe_tax_bps()` | shop_ops tax calculation (Easy/Advanced) | `GovernanceConfig` |
| Role constants | `dapp_hub::role_types::role_*()` | membership.move role guards | None |
| Tribe info | `dapp_hub::tribe_registry::tribe_by_id()` | tribe_governance creation, tribe tax lookup | `TribeRegistry` |
| SSU check | `dapp_hub::ssu_registry::is_registered()` | Landing page gate, shop creation gate | `SSURegistry` |
| SSU bazaar type | `dapp_hub::ssu_registry::ssu_bazaar_type()` | SSUGovernance creation | `SSURegistry` |
| Leader cap verify | Pass `&TribeLeaderCap` by reference | tribe_governance functions | Caller holds cap |

### 7.2 From SharedWidgets

| BazaarCore Calls | Package::Module::Function | When Called |
|-----------------|--------------------------|-------------|
| SSU setup | `shared_widgets::widget_config::create_widget_config()` | ssu_governance creation |
| Widget toggle | `shared_widgets::widget_config::toggle_widget()` | Admin panel widget config |
| Widget check | `shared_widgets::widget_config::is_widget_enabled()` | Widget rendering guards |
| SSU announcement board | `shared_widgets::announcements::create_board()` | ssu_governance creation |
| Create announcement | `shared_widgets::announcements::create_announcement()` | After role check in ssu_governance |
| Tribe announcement board | `shared_widgets::announcements::create_board()` | tribe_governance creation |
| Tribe announcement | `shared_widgets::announcements::create_announcement()` | After cap check in tribe_governance |

---

## 8. Cross-Package API Exposed (Outbound — What BazaarCore Exposes to BazaarEconomy)

These are the `public fun` functions that `bazaar_economy` calls into `bazaar_core`. They form the extension interface for the Advanced bazaar type.

| BazaarCore Exposes | Module::Function | Purpose for BazaarEconomy |
|-------------------|-----------------|--------------------------|
| Shop hook | `shop_ops::deduct_listing_quantity(shop, idx, qty, cap)` | After ledger debit, decrement WTS listing quantity |
| Shop hook | `shop_ops::add_listing_quantity(shop, idx, qty, cap)` | After ledger credit, increment WTB listing quantity |
| Trade hook | `trade::consume_proposal_for_ledger(registry, id, cap, clock)` | Settle a trade proposal via TribeToken ledger |
| Shop type | `bazar::shop_bazaar_type(shop)` | Verify shop is Advanced before touching ledger |
| Shop tribe | `bazar::shop_tribe_id(shop)` | Verify correct tribe_id matches ledger |
| Shop listing price | `bazar::listing_price_eve(listing)` | Read token-unit price stored in price_eve field |
| Tribe governance | `tribe_governance::tribe_wts_tax_bps(gov)` | Economy governance reads tax rates |
| Tribe governance | `tribe_governance::tribe_id(gov)` | Verify tribe_id consistency |
| Admin | `bazaar_core_admin::borrow_tax_deposit_cap(admin)` | Used internally by shop_ops; bazaar_economy passes its own cap for exchange taxes |
| Role check | `membership::assert_min_role(registry, player, min_role)` | Economy functions gate on same membership |
| Role check | `membership::effective_role(registry, player)` | Economy functions read current role |

**TribeTokenShopCap security:** All shop hooks (`deduct_listing_quantity`, `add_listing_quantity`, `consume_proposal_for_ledger`) require a `&TribeTokenShopCap` as a parameter. This cap is created by `bazaar_core_admin::authorize_economy_package()` and transferred to the `bazaar_economy` package's admin object. If `bazaar_economy` is not authorized, it cannot call these hooks.

---

## 9. Init Function

```move
fun init(witness: BAZAAR_CORE, ctx: &mut TxContext) {
    // 1. Create and share BazarRegistry (unified shop registry)
    // 2. Create and share TradeRegistry (all trade proposals)
    // 3. Create BazaarCoreAdmin (NO tax_deposit_cap yet — received post-deploy via receive_tax_deposit_cap)
    //    share BazaarCoreAdmin
    // Note: SSUGovernance, TribeGovernance, MemberRegistry, UserStorage, WtbEscrowPool,
    //       QuicktradeVault are all created PER SSU at registration acceptance time,
    //       not at package init. They are created in a PTB that accepts the application
    //       and initializes the SSU's bazaar environment atomically.
}
```

**Post-Deployment Initialization (two-step PTB):**

After `bazaar_core` is deployed, the DApp Owner must execute two PTBs:

```
PTB 1 — Transfer TaxDepositCap:
  dapp_hub::tax_wallet::issue_tax_deposit_cap(dapp_owner_cap, ctx)
  -> bazaar_core::bazaar_core_admin::receive_tax_deposit_cap(dapp_owner_cap, admin, cap)

PTB 2 — Authorize bazaar_economy (after bazaar_economy is deployed):
  bazaar_core::bazaar_core_admin::authorize_economy_package(dapp_owner_cap, admin, economy_pkg_id, ctx)
  -> Transfer resulting TribeTokenShopCap to bazaar_economy admin object
```

---

## 10. Documentation Deliverables

All stored in `BazaarCore/Documentation/`:

| Document | Written When | Contents |
|----------|-------------|----------|
| `FrontendAPI.md` | **Phase 2 (FIRST — before any Move code)** | Every hook, TX builder, type, constant, and screen spec all three frontends need. Separate sections per bazaar type. Full TypeScript interface definitions. |
| `InternalAPI.md` | Phase 5 (after Move code is written) | All internal functions, structs, events, error codes, and constants across all 9 modules |
| `InterfaceSpec.md` | Phase 5 (after Move code is written) | What bazaar_core exposes TO bazaar_economy (the 10 hooks listed in Section 8) + what it calls from dapp_hub and shared_widgets |

Cross-package functions also documented in `bazaarinfrastructure/Documentation/API/CrossPackageAPI.md` (to be updated in Phase 5).

---

## 11. Build Order (Frontend-First per Constitution Article II.1)

### Phase 2 — Frontend Design (before any Move code)

**2A. Design NoTribe Bazaar frontend:**
- All screens: Landing, Bazar, Trade, Inventory, My Shops, Quicktrade
- SSU Admin Panel (3 tabs: Tax, Users, Storage, Widgets)
- SSU Moderator Panel

**2B. Design EasyBazaar frontend:**
- All screens: Landing, Bazar, Trade, Inventory, My Shops, Tribe Hub
- SSU Admin Panel (same as NoTribe + tribe tax row in breakdown)
- Tribe Admin Panel (Tax, Members, SSUs, Announcements)
- Note what is IDENTICAL to NoTribe (reuse from @bazaar/shared)

**2C. Design AdvancedBazaar frontend:**
- All screens from EasyBazaar PLUS Exchange, Vault
- Tribe Admin Panel additions: Economy tab, Vault tab
- Landing additions: TribeToken balance, exchange rate ticker
- Note which screens come from bazaar_economy hooks vs bazaar_core hooks

**2D. Write FrontendAPI.md:**
- Full hook specifications (inputs, return types, loading/error states)
- Full TX builder specifications (parameters, expected effects)
- Full TypeScript type definitions
- Component props specs for shared components
- Feature flag mapping (which features activate per bazaar_type)

### Phase 5 — Move Contracts

1. Write all 9 Move modules satisfying the Frontend API
2. Write per-module unit tests
3. Write cross-module integration tests (tax routing, cap hierarchy)
4. Write `InternalAPI.md` + `InterfaceSpec.md`
5. Update `CrossPackageAPI.md` with bazaar_core -> dapp_hub and bazaar_economy -> bazaar_core entries

### Phase 5 (continued) — Frontend Wiring

1. Write all TX builders in `@bazaar/shared/tx/`
2. Write all hooks in `@bazaar/shared/hooks/`
3. Wire hooks + TX builders into all three Vite apps
4. Deploy to Sui testnet
5. Record all shared object IDs in `Documentation/SharedObjectRegistry.md`

---

## 12. Version Compatibility

```move
const PACKAGE_VERSION: u64 = 1;
const COMPATIBLE_DAPP_HUB_VERSION: u64 = 1;
const COMPATIBLE_SHARED_WIDGETS_VERSION: u64 = 1;
```

bazaar_economy must declare:
```move
const COMPATIBLE_BAZAAR_CORE_VERSION: u64 = 1;
```

---

## 13. Upgrade Policy

`bazaar_core` uses `additive` upgrade policy — new functions can be added, existing signatures NEVER change. This protects `bazaar_economy` (which depends on bazaar_core hooks) from breaking. Any change to a hook function listed in Section 8 requires the Breaking Change Protocol (Constitution Article II.5) and must produce a `_v2` variant.

---

## 14. Risk Register (Package-Level)

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bytecode exceeds 80 KB | Cannot deploy | Monitor after each module; merge bazar.move + shop_ops.move if needed |
| TribeTokenShopCap leaked or stolen | Unauthorized ledger writes via shop hooks | Cap is held in bazaar_economy admin object (shared, not transferable by users); require `&TaxDepositCap` in the same TX |
| Tax conditional logic bug (wrong type branches) | Missing tax deposits to DAppTaxWallet | Full test coverage per bazaar_type; explicit test: NoTribe has 0 tribe_tax, Advanced internal has 0 dapp_tax |
| NoTribe SSU accidentally passes tribe_gov | 3-layer tax on 2-layer SSU | shop_ops asserts `bazaar_type == NOTRIBE` implies `tribe_gov == Option::none()` |
| Cross-tribe shop contamination | Player A sees Tribe B's shops | BazarRegistry queries always filter by ssu_id; tribe shops filter by tribe_id |
| shop_ops hook misuse by unauthorized package | Ledger credited without actual payment | TribeTokenShopCap is the gate; only one cap ever minted per authorized_economy_package address |
