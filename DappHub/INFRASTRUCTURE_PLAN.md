# DappHub — Infrastructure Plan
## Foundation + Registration + Tribe Management + DApp Administration

> **Purpose:** The foundation package AND first touchpoint for all users.
> Contains the DApp tax wallet, governance config, role types (foundation layer)
> PLUS tribe creation, SSU registration, application processing, ticket system, and DApp admin.
> This package is deployed FIRST and all other Bazaar packages depend on it.
> This is the "lobby" AND "backbone" of the Bazaar ecosystem.
> **Currency:** EVE (`Coin<SUI>`) only — Constitution v3.1 retired the BAZ coin. The Advanced-tribe fantasy currency (internal Table-based ledger, not a Sui Coin) lives in `bazaar_economy::tribe_token_ledger`, not here.

---

## 1. Package Identity

| Field | Value |
|-------|-------|
| Package Name | `dapp_hub` |
| Language | Sui Move + React/TypeScript frontend |
| Max Size Target | 55KB bytecode (Move) |
| Move Dependencies | `sui`, `world` (EVE Frontier) |
| Depended on by | ALL other Bazaar packages |
| Frontend | Standalone Vite app at `dapphub.bazaar.app` |

---

## 2. Move Modules — Foundation Layer

### 2.1 `dapp_governance.move` (~300 lines)
**Role:** DApp-level ownership, admin caps, global tax config.

**Shared Objects:**
- `DAppOwnerClaimBox` — First-come ownership claim
- `GovernanceConfig` — Global dApp settings (tax rates, fee caps, overrides)

**Capabilities:**
- `DAppOwnerCap` — God-mode capability
- `DAppAdminCap` — DApp admin capability

**Entry Functions:**
```move
public fun claim_dapp_ownership(claim_box: &mut DAppOwnerClaimBox, ctx: &mut TxContext): DAppOwnerCap
public fun transfer_dapp_ownership(cap: DAppOwnerCap, new_owner: address)
public fun grant_dapp_admin(cap: &DAppOwnerCap, recipient: address, ctx: &mut TxContext)
public fun revoke_dapp_admin(cap: &DAppOwnerCap, admin_cap_id: ID)
public fun set_global_dapp_tax_rate(cap: &DAppOwnerCap, config: &mut GovernanceConfig, rate_bps: u64)
public fun set_custom_tribe_tax(cap: &DAppOwnerCap, config: &mut GovernanceConfig, tribe_id: u64, rate_bps: u64)
public fun set_custom_ssu_tax(cap: &DAppOwnerCap, config: &mut GovernanceConfig, ssu_id: address, rate_bps: u64)
// Accessors (cross-package — called by all bazaar packages)
public fun global_dapp_tax_bps(config: &GovernanceConfig): u64
public fun custom_tribe_tax_bps(config: &GovernanceConfig, tribe_id: u64): Option<u64>
public fun custom_ssu_tax_bps(config: &GovernanceConfig, ssu_id: address): Option<u64>
```

### 2.2 `tax_wallet.move` (~250 lines)
**Role:** Single collection point for ALL dApp taxes across all bazaar types.

**Shared Objects:**
- `DAppTaxWallet` — Unified tax collection (EVE only)

**Events:**
```move
struct TaxDepositEvent has copy, drop {
    tx_type: String,          // "wts_buy", "wtb_fill", "de_exchange", "token_exchange"
    bazaar_type: String,      // "notribe", "easy", "advanced"
    ssu_id: address,
    tribe_id: u64,            // 0 for notribe
    payer: address,
    receiver: address,
    gross_amount: u64,
    ssu_tax: u64,
    tribe_tax: u64,
    dapp_tax: u64,
    net_amount: u64,
    currency_type_name: String,
    timestamp_ms: u64,
}
```

**Entry Functions:**
```move
// Called by other packages to deposit tax
public fun deposit_dapp_tax(
    wallet: &mut DAppTaxWallet,
    payment: Coin<SUI>,
    tx_type: String,
    bazaar_type: String,
    ssu_id: address,
    tribe_id: u64,
    payer: address,
    receiver: address,
    gross_amount: u64,
    ssu_tax: u64,
    tribe_tax: u64,
    net_amount: u64,
    clock: &Clock,
)

// Owner withdrawal
public fun withdraw_from_dapp_tax_wallet(
    cap: &DAppOwnerCap,
    wallet: &mut DAppTaxWallet,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SUI>

// Accessors
public fun dapp_tax_balance(wallet: &DAppTaxWallet): u64
public fun total_tax_collected(wallet: &DAppTaxWallet): u64
public fun tax_deposit_count(wallet: &DAppTaxWallet): u64
```

### 2.3 `role_types.move` (~80 lines)
**Role:** Shared role constants and TaxConfig struct used by all packages.

```move
const ROLE_STRANGER: u8 = 0;
const ROLE_UNFRIENDLY: u8 = 1;
const ROLE_MEMBER: u8 = 2;
const ROLE_FRIENDLY: u8 = 3;
const ROLE_MODERATOR: u8 = 4;
const ROLE_ADMIN: u8 = 5;
const ROLE_SUPER_ADMIN: u8 = 6;
const ROLE_OWNER: u8 = 7;

struct TaxConfig has store, copy, drop {
    wts_bps: u64,
    wtb_bps: u64,
    de_flat_fee: u64,
}

// Public accessors for cross-package use
public fun role_stranger(): u8 { ROLE_STRANGER }
public fun role_unfriendly(): u8 { ROLE_UNFRIENDLY }
// ... etc
```

---

## 3. Move Modules — Hub Layer

### 3.1 `tribe_registry.move` (~500 lines)
**Role:** Master registry of all tribes, tribe creation, SSU-to-tribe binding.

**Shared Objects:**
- `TribeRegistry` — Master list of all tribes

**Structs:**
```move
struct TribeRegistry has key {
    id: UID,
    tribes: Table<u64, Tribe>,
    next_tribe_id: u64,
    tribe_count: u64,
}

struct Tribe has store {
    id: u64,
    name: String,
    description: String,
    leader: address,
    bazaar_type: u8,          // 0=NotSet, 1=Easy, 2=Advanced
    token_name: String,       // "" for Easy tribes
    token_symbol: String,     // "" for Easy tribes
    ssu_ids: vector<address>,
    join_policy: u8,          // 0=Open, 1=Application
    created_at_ms: u64,
    is_active: bool,
}

struct TribeLeaderCap has key, store {
    id: UID,
    tribe_id: u64,
}
```

**Entry Functions:**
```move
public fun create_easy_tribe(registry: &mut TribeRegistry, name: String, description: String, clock: &Clock, ctx: &mut TxContext): TribeLeaderCap
public fun create_advanced_tribe(registry: &mut TribeRegistry, name: String, description: String, token_name: String, token_symbol: String, clock: &Clock, ctx: &mut TxContext): TribeLeaderCap
public fun register_ssu_to_tribe(tribe_registry: &mut TribeRegistry, ssu_registry: &mut SSURegistry, cap: &TribeLeaderCap, tribe_id: u64, ssu_id: address, ctx: &mut TxContext)
public fun set_join_policy(cap: &TribeLeaderCap, registry: &mut TribeRegistry, policy: u8)
public fun transfer_leadership(cap: TribeLeaderCap, new_leader: address)
// Accessors (cross-package — called by bazaar packages)
public fun tribe_by_id(registry: &TribeRegistry, id: u64): &Tribe
public fun tribe_count(registry: &TribeRegistry): u64
public fun tribe_ssu_ids(tribe: &Tribe): &vector<address>
public fun tribe_bazaar_type(tribe: &Tribe): u8
public fun tribe_name(tribe: &Tribe): &String
public fun tribe_leader(tribe: &Tribe): address
public fun tribe_join_policy(tribe: &Tribe): u8
public fun tribe_is_active(tribe: &Tribe): bool
```

### 3.2 `ssu_registry.move` (~200 lines)
**Role:** Master registry of all registered SSUs.

**Shared Objects:**
- `SSURegistry` — All registered SSUs

```move
struct SSURegistry has key {
    id: UID,
    registrations: Table<address, SSURegistration>,
    ssu_count: u64,
}

struct SSURegistration has store {
    ssu_id: address,
    owner: address,
    bazaar_type: u8,         // 0=NoTribe, 1=Easy, 2=Advanced
    tribe_id: u64,           // 0 for NoTribe
    registered_at_ms: u64,
    is_active: bool,
}
```

**Entry Functions:**
```move
public fun register_ssu_notribe(ssu_registry: &mut SSURegistry, ssu_id: address, ctx: &mut TxContext)
// Accessors (cross-package)
public fun is_registered(registry: &SSURegistry, ssu_id: address): bool
public fun registration(registry: &SSURegistry, ssu_id: address): &SSURegistration
public fun ssu_bazaar_type(reg: &SSURegistration): u8
public fun ssu_tribe_id(reg: &SSURegistration): u64
```

### 3.3 `registration.move` (~300 lines)
**Role:** Application queue for tribe SSU registration.

**Shared Objects:**
- `RegistrationRequestQueue` — Pending applications

```move
struct RegistrationRequest has store, drop {
    applicant: address,
    applicant_name: String,
    ssu_id: address,
    tribe_id: u64,
    application_text: String,
    status: u8,              // 0=Pending, 1=Accepted, 2=Rejected
    submitted_at_ms: u64,
}

public fun submit_tribe_application(queue: &mut RegistrationRequestQueue, ...)
public fun accept_application(cap: &TribeLeaderCap, queue: &mut RegistrationRequestQueue, ...)
public fun reject_application(cap: &TribeLeaderCap, queue: &mut RegistrationRequestQueue, ...)
```

### 3.4 `tickets.move` (~250 lines)
**Role:** User support ticket system.

**Shared Objects:**
- `TicketBoard` — Support tickets

```move
struct TicketBoard has key {
    id: UID,
    tickets: Table<u64, Ticket>,
    next_ticket_id: u64,
}

struct Ticket has store {
    id: u64,
    author: address,
    author_name: String,
    title: String,
    body: String,
    tag: u8,                 // 0=Feedback, 1=Bug, 2=Suggestion, 3=Other
    contact_method: u8,      // 0=Ingame, 1=Email
    contact_email: String,
    status: u8,              // 0=Open, 1=InReview, 2=Resolved
    submitted_at_ms: u64,
}

public fun submit_ticket(board: &mut TicketBoard, ...)
public fun set_ticket_status(cap: &DAppOwnerCap, board: &mut TicketBoard, ticket_id: u64, status: u8)
public fun ticket_count(board: &TicketBoard): u64
```

---

## 4. Frontend — DappHub Site

### 4.1 URL: `dapphub.bazaar.app`

### 4.2 Screens & Components

#### Landing Page (after wallet connect)
```
┌─────────────────────────────────────────────┐
│  BAZAAR HUB          [Connect Wallet]       │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─── Register Your SSU ──────────────────┐ │
│  │                                        │ │
│  │  [NoTribe Bazaar]    [Join a Tribe]    │ │
│  │   Solo/small group    Register SSU     │ │
│  │   EVE trading only    to existing      │ │
│  │                       tribe network    │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ┌─── Create a Tribe ────────────────────┐  │
│  │                                       │  │
│  │  [Easy Bazaar]    [Advanced Bazaar]   │  │
│  │   EVE trading      Custom currency    │  │
│  │   Simple setup     Full economy       │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [My Registered SSUs]                       │
│                                             │
│  [Having issues? Contact us]                │
│                                             │
│  [DApp Management] ← only if DApp Owner     │
└─────────────────────────────────────────────┘
```

#### Floating Windows

**1. NoTribe Registration Window**
- SSU ID paste field
- "Register" button
- On success: popup with URL (`notribe.bazaar.app?ssuId={id}`) + "Find it in My SSUs"

**2. Join a Tribe Window**
- Search bar (by tribe name)
- List of all tribes: Name, Type (Easy/Advanced), Leader name
- Per tribe:
  - If Open: "Register SSU" button → SSU ID field popup → URL generated
  - If Application: "Apply" button → SSU ID field + Application text + auto-fill wallet/name → "Submitted" confirmation with URL + "pending" notice

**3. Easy Bazaar Creation Window**
- Tribe Name field
- Description field
- "Create Tribe" / "Cancel" buttons
- On success: Tribe ID displayed, "Now register an SSU to your tribe" prompt

**4. Advanced Bazaar Creation Window (multi-step)**
- Step 1: Tribe Name + Description
- Step 2: Token Name + Token Symbol (abbreviation)
- Step 3: Confirmation + "Create" button
- On success: Tribe ID + Token info displayed

**5. My Registered SSUs Window**
- Tab: "NoTribe SSUs" — list with copy-paste URLs
- Tab: "Tribe SSUs" — list grouped by tribe, with copy-paste URLs
- Each entry: SSU ID, Bazaar Type, Tribe Name (if any), URL, Status

**6. Contact/Ticket Window**
- Title field
- Tag selector: Feedback / Bug / Suggestion / Other
- Text body field
- Contact method: Ingame (default) / Email (shows email field when selected)
- "Send" button → confirmation popup

**7. DApp Management Window (Owner only)**
Follows BazarPublicFix SuperAdminPanel design patterns:
- Tab: "Tribes" — all registered tribes, details, management
- Tab: "SSUs" — all registered SSUs, filter by type/tribe
- Tab: "Taxes & Fees" — global dApp tax rate, custom overrides per tribe/SSU
- Tab: "Tax Wallet" — balance, withdrawal, transaction history (TaxDepositEvent log)
- Tab: "Tickets" — tabs per tag (Feedback/Bug/Suggestion/Other), status management

---

## 5. URL Routing

| URL Pattern | Destination |
|-------------|-------------|
| `dapphub.bazaar.app` | DappHub landing |
| `notribe.bazaar.app?ssuId=0x...` | NoTribe Bazaar for that SSU |
| `easy.bazaar.app?tribe=TribeName&ssuId=0x...` | EasyBazaar for that tribe+SSU |
| `advanced.bazaar.app?tribe=TribeName&ssuId=0x...` | AdvancedBazaar for that tribe+SSU |
| Any bazaar URL without valid params | Redirect to DappHub |

**URL Generation Formula:**
- NoTribe: `{NOTRIBE_BASE_URL}?ssuId={ssu_address}`
- Tribe: `{BAZAAR_TYPE_BASE_URL}?tribe={tribe_name_urlencoded}&ssuId={ssu_address}`

---

## 6. Size Budget (Move)

| Module | Layer | Estimated Bytecode |
|--------|-------|--------------------|
| dapp_governance.move | Foundation | ~8 KB |
| tax_wallet.move | Foundation | ~7 KB |
| role_types.move | Foundation | ~2 KB |
| tribe_registry.move | Hub | ~12 KB |
| ssu_registry.move | Hub | ~5 KB |
| registration.move | Hub | ~8 KB |
| tickets.move | Hub | ~7 KB |
| **Total** | | **~49 KB** |

Well within the 80KB safety target (~61% utilization).

---

## 7. Reference Sources (NO COPY-PASTE)

The following existing files serve as **mental reference only**. All code must be typed from scratch.

| Existing Source (READ ONLY) | What to Study | Notes |
|-----------------------------|--------------|-------|
| `Bazar1/governance.move` | DAppOwnerCap, claim_dapp_ownership pattern | Rewrite with GovernanceConfig |
| `Bazar1/tribe_registry.move` | Tribe creation, SSU registration, leader caps | Rewrite with new SSURegistry separation |
| `Bazar1/registration_requests.move` | Application queue, accept/reject flow | Adapt for tribe applications |
| `BazarPublicFix/AdminPanel.tsx` | **Admin tab design:** 6-tab layout | Same design, same functionality |
| `BazarPublicFix/SuperAdminPanel.tsx` | **SuperAdmin tab design:** 8-tab layout | Same design, adapted for DApp Management panel |
| `BazarPublicFix/ModeratorPanel.tsx` | **Moderator tab design:** 3-tab layout | Same design, same functionality |
| `BazarPublicFix/index.css` | Full CSS design system | Same visual design |
| `Bazar1/LandingScreen.tsx` | Landing page patterns | Redesign for DappHub registration flow |
| NEW | tickets.move | Entirely new module |
| NEW | ssu_registry.move | New separation from tribe_registry |

---

## 8. Init Function

```move
fun init(witness: DAPP_HUB, ctx: &mut TxContext) {
    // Foundation layer
    // 1. Create and share DAppOwnerClaimBox
    // 2. Create and share GovernanceConfig (default 2% dApp tax)
    // 3. Create and share DAppTaxWallet (empty)

    // Hub layer
    // 4. Create and share TribeRegistry
    // 5. Create and share SSURegistry
    // 6. Create and share RegistrationRequestQueue
    // 7. Create and share TicketBoard
}
```

---

## 9. Cross-Package API (Exposed to Other Packages)

DappHub is the foundation — other packages call INTO it, never the reverse.

| Caller | DappHub Function | Purpose |
|--------|-----------------|---------|
| All bazaar packages | `dapp_hub::tax_wallet::deposit_dapp_tax()` | DApp tax deposit |
| All bazaar packages | `dapp_hub::dapp_governance::global_dapp_tax_bps()` | Get dApp tax rate |
| All bazaar packages | `dapp_hub::dapp_governance::custom_tribe_tax_bps()` | Tribe-specific override |
| All bazaar packages | `dapp_hub::dapp_governance::custom_ssu_tax_bps()` | SSU-specific override |
| All bazaar packages | `dapp_hub::role_types::role_*()` | Role constants |
| Easy/Advanced | `dapp_hub::tribe_registry::tribe_by_id()` | Look up tribe info |
| All bazaar packages | `dapp_hub::ssu_registry::is_registered()` | Verify SSU registration |

DappHub calls NO other Bazaar package. Dependencies flow one way only.

---

## 10. Documentation Deliverables

All stored in `DappHub/Documentation/`:

| Document | Written When | Contents |
|----------|-------------|----------|
| `FrontendAPI.md` | **Phase 1 (FIRST)** | Every hook, TX builder, type, screen spec the DappHub frontend needs |
| `InternalAPI.md` | Phase 3 (after Move code) | All internal functions, structs, events |
| `InterfaceSpec.md` | Phase 3 (after Move code) | How DappHub exposes data to other packages (foundation + hub APIs) |

Cross-package functions also in `bazaarinfrastructure/Documentation/API/CrossPackageAPI.md`.

---

## 11. Build Order (Frontend-First)

1. **Phase 1:** Design all DappHub UI (landing, floating windows, DApp Management panel) → write `FrontendAPI.md`
2. **Phase 3:** Write all Move contracts (foundation + hub modules) → write `InternalAPI.md` + `InterfaceSpec.md`
3. **Phase 3:** Write TX builders + hooks → wire into frontend components
4. Deploy FIRST (all other packages depend on DappHub)
5. Record all shared object IDs in `Documentation/SharedObjectRegistry.md`

---

## 12. Upgrade Policy

DappHub uses `additive` upgrade policy — new functions can be added, existing signatures NEVER change. This protects all downstream packages from breaking.
