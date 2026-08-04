# BazaarEconomy — Infrastructure Plan
## Advanced Tribe Economy Extension (TribeTokenLedger + Vault + Exchange + Multi-Sig)

> **Purpose:** The economy layer for Advanced tribes only.
> Advanced tribes run an internal fantasy currency tracked by a per-tribe `TribeTokenLedger`
> (a `Table<address, u64>` ledger, NOT `Coin<T>`). Real EVE (`Coin<SUI>`) flows only at the
> exchange boundary — all internal trading is pure ledger debit/credit with zero on-chain coin
> movement. DApp tax is charged exclusively on the EVE side of the exchange.
>
> This package depends on `dapp_hub`, `bazaar_core`, and `shared_widgets`.
> It is deployed FOURTH and extends bazaar_core's Advanced shop objects via the
> `TribeTokenShopCap` hook pattern defined in bazaar_core's `shop_ops.move`.

---

## 1. Package Identity

| Field | Value |
|-------|-------|
| Package Name | `bazaar_economy` |
| Language | Sui Move + React/TypeScript frontend |
| Max Size Target | 35KB bytecode (Move) |
| Move Dependencies | `sui`, `world` (EVE Frontier), `dapp_hub`, `bazaar_core`, `shared_widgets` |
| Depended on by | Nothing (leaf package — topmost in the dependency tree) |
| Frontend | Part of `advanced.bazaar.app` — adds economy-specific UI on top of bazaar_core's Advanced frontend |
| Shared frontend code | `@bazaar/shared` npm workspace (hooks, TX builders, types, constants) |

---

## 2. Core Design Principle — TribeTokenLedger

Every reference to "TribeToken" in this plan means a **ledger entry** (`u64` balance) stored inside a `TribeTokenLedger` shared object. There are **no `Coin<TRIBE_TOKEN>` objects** anywhere in this package. Players never hold a coin in their wallet for tribe tokens — they hold a balance in a table.

The only `Coin<T>` used in this package is `Coin<SUI>`, representing real EVE, in the vault and at the exchange boundary.

```
Player holds:
  Coin<SUI>  (real EVE, standard Sui wallet object) — for exchange deposits
  [no coin]  (TribeToken balance is a u64 in TribeTokenLedger.balances[player_address])

Internal trade:
  buyer.balances[buyer_addr]  -= price_tokens + ssu_tax_tokens + tribe_tax_tokens
  seller.balances[seller_addr] += net_tokens
  ssu_wallet_credit            += ssu_tax_tokens  (also a ledger entry)
  tribe_wallet_credit          += tribe_tax_tokens (also a ledger entry)

Exchange (only real EVE moves here):
  deposit_eve:  buyer pays Coin<SUI> -> vault; ledger credits buyer with tokens
  redeem_eve:   buyer burns ledger balance; vault releases Coin<SUI> to buyer
  dApp tax:     eve_in * dapp_exchange_fee_bps / 10000 -> DAppTaxWallet (dapp_hub)
```

---

## 3. Move Modules

### 3.1 `tribe_token_ledger.move` (~350 lines)
**Role:** The fantasy currency ledger. One per Advanced tribe. Tracks all player balances and total supply. Only functions within `bazaar_economy` may modify balances — no external package can alter ledger entries.

**Shared Objects:**
- `TribeTokenLedger` — One per Advanced tribe, created on tribe creation

**Structs:**
```move
struct TribeTokenLedger has key {
    id: UID,
    tribe_id: u64,
    balances: Table<address, u64>,  // player -> balance (u64, no fractional)
    total_supply: u64,
    token_name: String,             // e.g. "Dragon Coin"
    token_symbol: String,           // e.g. "DRC"
    decimals: u8,                   // always 0 — whole units only (simplifies display)
    mint_authority: address,        // tribe leader; only minter besides economy_governance
    created_at_ms: u64,
}

// Internal-only wallet entries for tax collection (stored inside governance objects)
// NOT separate shared objects — embedded Balance as u64 field (ledger credit)
struct LedgerWallet has store {
    tribe_id: u64,
    balance: u64,          // accumulated tax credits; no coin object
}
```

**Events:**
```move
struct LedgerMintEvent has copy, drop {
    tribe_id: u64,
    recipient: address,
    amount: u64,
    new_total_supply: u64,
    timestamp_ms: u64,
}

struct LedgerBurnEvent has copy, drop {
    tribe_id: u64,
    from: address,
    amount: u64,
    new_total_supply: u64,
    timestamp_ms: u64,
}

struct LedgerTransferEvent has copy, drop {
    tribe_id: u64,
    from: address,
    to: address,
    amount: u64,
    tx_type: String,       // "trade_buy" | "trade_wtb_fill" | "trade_de" | "tax_ssu" | "tax_tribe" | "exchange_deposit" | "exchange_redeem"
    timestamp_ms: u64,
}
```

**Entry Functions:**
```move
// Mint new tokens into an address's ledger balance (increases total_supply)
// Requires TribeLeaderCap (from dapp_hub) — only tribe leader can mint
public fun mint_to(
    cap: &TribeLeaderCap,          // from dapp_hub::tribe_registry
    ledger: &mut TribeTokenLedger,
    recipient: address,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Burn tokens from an address's ledger balance (decreases total_supply)
// Requires TribeLeaderCap — tribe leader can burn from any address
// Players may also self-burn via ledger_burn_self (no cap required, burns caller's own balance)
public fun burn_from(
    cap: &TribeLeaderCap,
    ledger: &mut TribeTokenLedger,
    target: address,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

public fun burn_self(
    ledger: &mut TribeTokenLedger,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Balance query
public fun balance_of(ledger: &TribeTokenLedger, player: address): u64
public fun total_supply(ledger: &TribeTokenLedger): u64
public fun token_name(ledger: &TribeTokenLedger): &String
public fun token_symbol(ledger: &TribeTokenLedger): &String
public fun tribe_id(ledger: &TribeTokenLedger): u64

// Ensure account exists in the table (called on first interaction)
public fun ensure_account(ledger: &mut TribeTokenLedger, player: address)
```

**Package-private functions (used by ledger_shop_ops and tribe_exchange only):**
```move
// Atomic debit — aborts with E_INSUFFICIENT_BALANCE if balance < amount
// Does NOT change total_supply (ledger transfer, not burn)
public(package) fun debit(ledger: &mut TribeTokenLedger, from: address, amount: u64)

// Atomic credit — does NOT change total_supply (ledger transfer, not mint)
public(package) fun credit(ledger: &mut TribeTokenLedger, to: address, amount: u64)

// Mint into ledger (increases total_supply) — called by economy_governance for inflation
public(package) fun internal_mint(ledger: &mut TribeTokenLedger, to: address, amount: u64)

// Burn from ledger (decreases total_supply) — called by tribe_exchange on redeem
public(package) fun internal_burn(ledger: &mut TribeTokenLedger, from: address, amount: u64)
```

**Error Codes:**
```move
const E_INSUFFICIENT_BALANCE: u64 = 1;
const E_OVERFLOW: u64 = 2;
const E_WRONG_TRIBE: u64 = 3;
const E_LEDGER_FROZEN: u64 = 4;
const E_ZERO_AMOUNT: u64 = 5;
const E_ACCOUNT_NOT_FOUND: u64 = 6;
const E_SUPPLY_CAP_EXCEEDED: u64 = 7;
```

---

### 3.2 `tribe_vault.move` (~280 lines)
**Role:** The EVE vault backing the exchange. Holds real `Coin<SUI>` (EVE). Deposits come from the exchange when users swap EVE for tokens. Withdrawals go to users when they redeem tokens for EVE, or to the tribe leader via multi-sig withdrawal after the 24-hour waiting period.

**Shared Objects:**
- `TribeVault` — One per Advanced tribe, created on tribe creation

**Structs:**
```move
struct TribeVault has key {
    id: UID,
    tribe_id: u64,
    eve_balance: Balance<SUI>,      // real EVE reserves (Coin<SUI>)
    total_deposited: u64,           // lifetime deposit counter (MIST)
    total_withdrawn: u64,           // lifetime withdrawal counter (MIST)
    deposit_count: u64,
    withdrawal_count: u64,
    is_locked: bool,                // emergency lock (economy_governance can freeze)
}
```

**Events:**
```move
struct VaultDepositEvent has copy, drop {
    tribe_id: u64,
    depositor: address,
    amount: u64,               // MIST
    new_balance: u64,
    source: String,            // "exchange" | "direct_deposit"
    timestamp_ms: u64,
}

struct VaultWithdrawEvent has copy, drop {
    tribe_id: u64,
    recipient: address,
    amount: u64,               // MIST
    new_balance: u64,
    source: String,            // "exchange_redeem" | "withdrawal_request"
    timestamp_ms: u64,
}
```

**Entry Functions:**
```move
// Tribe Leader direct deposit (top up vault to back the exchange)
public fun deposit_eve(
    cap: &TribeLeaderCap,
    vault: &mut TribeVault,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Vault balance query
public fun eve_balance(vault: &TribeVault): u64
public fun tribe_id(vault: &TribeVault): u64
public fun is_locked(vault: &TribeVault): bool
```

**Package-private functions (called by tribe_exchange and vault_withdrawal):**
```move
// Called by tribe_exchange when user deposits EVE to get tokens
public(package) fun internal_deposit(vault: &mut TribeVault, payment: Coin<SUI>, source: String, clock: &Clock)

// Called by tribe_exchange when user redeems tokens for EVE (and by vault_withdrawal on execute)
public(package) fun internal_withdraw(vault: &mut TribeVault, amount: u64, recipient: address, source: String, clock: &Clock, ctx: &mut TxContext): Coin<SUI>
```

**Error Codes:**
```move
const E_VAULT_LOCKED: u64 = 1;
const E_INSUFFICIENT_VAULT_BALANCE: u64 = 2;
const E_WRONG_TRIBE: u64 = 3;
const E_ZERO_AMOUNT: u64 = 4;
```

---

### 3.3 `tribe_exchange.move` (~350 lines)
**Role:** The swap mechanism between ledger balances and real EVE. This is the only place in the entire package where `Coin<SUI>` is created or destroyed relative to the vault. DApp tax is charged here on the EVE side of every swap, deposited into DAppTaxWallet via `TaxDepositCap`.

Exchange rate is **algorithmically determined**, NOT configurable. The rate is:

```
rate = (vault_balance - reserve) / total_supply
```

Where `reserve` is the minimum EVE that must remain in the vault (default: 1 EVE, configurable by DApp Owner only). This creates a fully-backed currency with a reserve floor. If `vault_balance <= reserve`, minting is BLOCKED — no new TribeTokens can be created until more EVE is deposited. See Constitution Article XIII for full rules.

**Shared Objects:**
- `ExchangeConfig` — One per Advanced tribe, created on tribe creation

**Structs:**
```move
struct ExchangeConfig has key {
    id: UID,
    tribe_id: u64,
    // Rate is ALGORITHMIC: (vault_balance - reserve) / total_supply
    // No tokens_per_mist field — rate computed from vault + ledger state
    reserve_mist: u64,                         // min EVE in vault (default: 1_000_000_000 = 1 SUI/EVE)
    is_active: bool,
    exchange_fee_override_bps: Option<u64>,    // None = use global dApp rate
    total_eve_in: u64,                         // lifetime EVE deposited (MIST)
    total_eve_out: u64,                        // lifetime EVE redeemed (MIST)
    total_tokens_issued: u64,                  // lifetime tokens issued via exchange
    total_tokens_burned: u64,                  // lifetime tokens burned via exchange
    swap_count: u64,
}
```

**Events:**
```move
struct ExchangeSwapEvent has copy, drop {
    tribe_id: u64,
    player: address,
    direction: String,           // "eve_to_token" | "token_to_eve"
    eve_gross: u64,              // MIST (before tax)
    dapp_tax: u64,               // MIST
    eve_net: u64,                // MIST (after tax)
    tokens_delta: u64,           // ledger units credited or debited
    rate_mist_per_token: u64,      // computed at swap time: (vault - reserve) / supply
    timestamp_ms: u64,
}
```

**Entry Functions:**
```move
// Player deposits EVE -> receives ledger token credits
// Tax deducted from EVE before converting to tokens
// Flow: gross_eve - dapp_tax = net_eve; rate = (vault - reserve) / supply; tokens = net_eve / rate
public fun swap_eve_to_tokens(
    ledger: &mut TribeTokenLedger,
    vault: &mut TribeVault,
    exchange_config: &ExchangeConfig,
    payment: Coin<SUI>,
    dapp_tax_wallet: &mut DAppTaxWallet,      // from dapp_hub::tax_wallet
    dapp_config: &GovernanceConfig,           // from dapp_hub::dapp_governance
    tax_deposit_cap: &TaxDepositCap,          // from dapp_hub (held by bazaar_core admin, passed via PTB)
    clock: &Clock,
    ctx: &mut TxContext,
)

// Player burns ledger token credits -> receives EVE from vault
// Tax deducted from EVE payout
// Flow: rate = (vault - reserve) / supply; gross_eve = tokens * rate; gross_eve - dapp_tax = net_eve
public fun swap_tokens_to_eve(
    ledger: &mut TribeTokenLedger,
    vault: &mut TribeVault,
    exchange_config: &ExchangeConfig,
    tokens_to_burn: u64,
    dapp_tax_wallet: &mut DAppTaxWallet,
    dapp_config: &GovernanceConfig,
    tax_deposit_cap: &TaxDepositCap,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Accessors
public fun exchange_rate(vault: &TribeVault, ledger: &TribeTokenLedger, config: &ExchangeConfig): u64   // computed: (vault - reserve) / supply, in MIST per token
public fun is_exchange_active(config: &ExchangeConfig): bool
public fun tribe_id(config: &ExchangeConfig): u64
public fun fee_override(config: &ExchangeConfig): Option<u64>
```

**Error Codes:**
```move
const E_EXCHANGE_INACTIVE: u64 = 1;
const E_INSUFFICIENT_EVE: u64 = 2;
const E_INSUFFICIENT_TOKENS: u64 = 3;
const E_ZERO_RATE: u64 = 4;
const E_WRONG_TRIBE: u64 = 5;
const E_VAULT_INSUFFICIENT: u64 = 6;
```

---

### 3.4 `vault_withdrawal.move` (~380 lines)
**Role:** Multi-sig withdrawal requests for the tribe vault. Tribe Leader creates a request for a specific EVE amount. A configurable quorum of SuperAdmins (or Admins) must approve before execution. After quorum is reached, a mandatory 24-hour waiting period must elapse before the tribe leader can execute. Requests expire after 72 hours without full approval.

**Shared Objects:**
- `WithdrawalBoard` — One per Advanced tribe, holds all pending requests

**Structs:**
```move
struct WithdrawalBoard has key {
    id: UID,
    tribe_id: u64,
    requests: Table<u64, WithdrawalRequest>,
    next_request_id: u64,
    required_approvals: u64,   // quorum (configurable by Tribe Leader)
}

struct WithdrawalRequest has store {
    id: u64,
    tribe_id: u64,
    requester: address,
    amount: u64,               // MIST EVE requested
    reason: String,
    approvals: vector<address>,
    denials: vector<address>,
    status: u8,                // 0=Pending, 1=Approved(waiting), 2=Executed, 3=Cancelled, 4=Expired, 5=Denied
    created_at_ms: u64,
    approved_at_ms: u64,       // 0 until quorum reached
    executed_at_ms: u64,       // 0 until executed
    expires_at_ms: u64,        // created_at_ms + 72h
}
```

**Status Constants:**
```move
const STATUS_PENDING:  u8 = 0;
const STATUS_APPROVED: u8 = 1;   // quorum met, now in 24h wait
const STATUS_EXECUTED: u8 = 2;
const STATUS_CANCELLED: u8 = 3;
const STATUS_EXPIRED:  u8 = 4;
const STATUS_DENIED:   u8 = 5;
```

**Timing Constants:**
```move
const WAIT_PERIOD_MS: u64 = 86_400_000;    // 24 hours in milliseconds
const EXPIRY_PERIOD_MS: u64 = 259_200_000; // 72 hours in milliseconds
```

**Events:**
```move
struct WithdrawalRequestedEvent has copy, drop {
    tribe_id: u64,
    request_id: u64,
    requester: address,
    amount: u64,
    expires_at_ms: u64,
    timestamp_ms: u64,
}

struct WithdrawalVoteEvent has copy, drop {
    tribe_id: u64,
    request_id: u64,
    voter: address,
    vote: String,              // "approve" | "deny"
    approval_count: u64,
    required: u64,
    timestamp_ms: u64,
}

struct WithdrawalStatusEvent has copy, drop {
    tribe_id: u64,
    request_id: u64,
    new_status: u8,
    actor: address,
    timestamp_ms: u64,
}
```

**Entry Functions:**
```move
// Tribe Leader creates a withdrawal request
public fun request_withdrawal(
    cap: &TribeLeaderCap,
    board: &mut WithdrawalBoard,
    vault: &TribeVault,           // read-only — verify vault has enough balance
    amount: u64,
    reason: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): u64                            // returns request_id

// SuperAdmin or Admin approves a pending request
// If this approval reaches quorum, status -> STATUS_APPROVED and approved_at_ms is set
public fun approve_request(
    board: &mut WithdrawalBoard,
    membership: &MemberRegistry,   // from bazaar_core::membership
    request_id: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

// SuperAdmin or Admin denies a pending request
// Majority denial (> half of required_approvals deny) -> STATUS_DENIED
public fun deny_request(
    board: &mut WithdrawalBoard,
    membership: &MemberRegistry,
    request_id: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Tribe Leader executes an approved request after 24h wait
// Releases EVE from vault to tribe leader's address
public fun execute_withdrawal(
    cap: &TribeLeaderCap,
    board: &mut WithdrawalBoard,
    vault: &mut TribeVault,
    request_id: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Tribe Leader cancels their own pending request (STATUS_PENDING only)
public fun cancel_request(
    cap: &TribeLeaderCap,
    board: &mut WithdrawalBoard,
    request_id: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Anyone can mark an expired request as STATUS_EXPIRED (permissionless cleanup)
public fun expire_request(
    board: &mut WithdrawalBoard,
    request_id: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Set required approvals quorum (Tribe Leader only)
public fun set_required_approvals(
    cap: &TribeLeaderCap,
    board: &mut WithdrawalBoard,
    required: u64,
)

// Accessors
public fun request_status(board: &WithdrawalBoard, request_id: u64): u8
public fun request_amount(board: &WithdrawalBoard, request_id: u64): u64
public fun approval_count(board: &WithdrawalBoard, request_id: u64): u64
public fun required_approvals(board: &WithdrawalBoard): u64
public fun pending_request_count(board: &WithdrawalBoard): u64
```

**Error Codes:**
```move
const E_NOT_LEADER: u64 = 1;
const E_NOT_APPROVER: u64 = 2;
const E_REQUEST_NOT_FOUND: u64 = 3;
const E_WRONG_STATUS: u64 = 4;
const E_WAIT_PERIOD_NOT_ELAPSED: u64 = 5;
const E_REQUEST_EXPIRED: u64 = 6;
const E_ALREADY_VOTED: u64 = 7;
const E_INSUFFICIENT_VAULT: u64 = 8;
const E_WRONG_TRIBE: u64 = 9;
const E_INVALID_QUORUM: u64 = 10;
```

---

### 3.5 `economy_governance.move` (~320 lines)
**Role:** Economy-level administrative controls. Manages exchange configuration (rate, active/inactive toggle, fee override), inflation caps, supply visibility, and emergency vault lock. The Tribe Leader exercises these controls; the DApp Owner has an emergency override.

**Shared Objects:**
No new shared objects. `economy_governance` operates on `TribeTokenLedger`, `TribeVault`, `ExchangeConfig`, and `WithdrawalBoard` via mutable references.

**Entry Functions:**
```move
// Set or update the exchange rate (tokens per MIST EVE)
public fun set_exchange_rate(
    cap: &TribeLeaderCap,
    config: &mut ExchangeConfig,
    tokens_per_mist: u64,
    ctx: &mut TxContext,
)

// Toggle exchange on/off
public fun set_exchange_active(
    cap: &TribeLeaderCap,
    config: &mut ExchangeConfig,
    active: bool,
    ctx: &mut TxContext,
)

// Override dApp exchange fee for this tribe (Tribe Leader negotiates with DApp Owner separately)
// Passing option::none() reverts to global rate
public fun set_exchange_fee_override(
    cap: &DAppOwnerCap,            // Only DApp Owner can grant/revoke overrides
    config: &mut ExchangeConfig,
    tribe_id: u64,
    override_bps: Option<u64>,
    ctx: &mut TxContext,
)

// Emergency vault lock (DApp Owner only — protects users if tribe leader is compromised)
public fun lock_vault(
    cap: &DAppOwnerCap,
    vault: &mut TribeVault,
    ctx: &mut TxContext,
)

// Unlock vault (DApp Owner only)
public fun unlock_vault(
    cap: &DAppOwnerCap,
    vault: &mut TribeVault,
    ctx: &mut TxContext,
)

// Mint tokens to an address (Tribe Leader — creates supply from nothing)
// Guarded by supply_cap if set
public fun mint_supply(
    cap: &TribeLeaderCap,
    ledger: &mut TribeTokenLedger,
    recipient: address,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Set a hard cap on total_supply (0 = no cap)
// Once set, mint_supply aborts if total_supply + amount > cap
public fun set_supply_cap(
    cap: &TribeLeaderCap,
    ledger: &mut TribeTokenLedger,
    supply_cap: u64,
    ctx: &mut TxContext,
)

// Query current supply health
public fun supply_utilization(ledger: &TribeTokenLedger): (u64, u64)  // (total_supply, supply_cap)
public fun exchange_health(config: &ExchangeConfig, vault: &TribeVault): (u64, u64, bool)
// Returns: (eve_reserve_mist, tokens_per_mist_rate, is_active)
```

**Events:**
```move
struct ExchangeConfigUpdated has copy, drop {
    tribe_id: u64,
    new_rate: u64,
    new_active: bool,
    fee_override_bps: Option<u64>,
    updated_by: address,
    timestamp_ms: u64,
}

struct VaultLockEvent has copy, drop {
    tribe_id: u64,
    locked: bool,
    actor: address,
    timestamp_ms: u64,
}

struct SupplyCapSetEvent has copy, drop {
    tribe_id: u64,
    supply_cap: u64,
    current_supply: u64,
    timestamp_ms: u64,
}
```

---

### 3.6 `ledger_shop_ops.move` (~350 lines)
**Role:** Ledger-based shop transaction handler. When a player buys from an Advanced tribe WTS shop priced in TribeTokens, or fills a WTB shop, or performs a DE exchange, this module:
1. Uses bazaar_core's `deduct_listing_quantity` hook (via `TribeTokenShopCap`) to atomically reduce the shop listing
2. Performs all ledger debit/credit operations for buyer, seller, SSU tax wallet, and tribe tax wallet
3. Emits a `LedgerPurchaseEvent` following Article VIII event schema

**IMPORTANT:** This module does NOT handle EVE coin. If an Advanced tribe shop has EVE-denominated listings, those are handled by `bazaar_core::shop_ops` directly as if the shop were Easy type. This module handles only listings where `price_eve` is interpreted as a token-unit price (see bazaar_core Plan section 3.1 note).

**Structs:**
```move
// Capability proving this call originates from bazaar_economy
// Created at package init and stored in a shared wrapper object
struct TribeEconomyCap has key, store {
    id: UID,
}

// Per-tribe ledger tax wallets for SSU and Tribe layers
// Stored inside AdvancedTribeGovernance (see 3.7 note)
// The wallet is a simple u64 field (ledger credit), not a Coin<SUI>
struct LedgerTaxWallet has store, copy, drop {
    tribe_id: u64,
    ssu_id: address,
    balance: u64,
}
```

**Events:**
```move
struct LedgerPurchaseEvent has copy, drop {
    tx_type: String,               // "wts_buy" | "wtb_fill" | "de_exchange"
    bazaar_type: String,           // always "advanced"
    shop_id: ID,
    listing_idx: u64,
    quantity: u64,
    buyer: address,
    seller: address,
    ssu_id: address,
    tribe_id: u64,
    gross_tokens: u64,
    ssu_tax_tokens: u64,
    tribe_tax_tokens: u64,
    net_tokens: u64,
    timestamp_ms: u64,
}
```

**Entry Functions:**
```move
// Advanced WTS buy — buyer debits ledger, seller credits net, tax wallets credit taxes
public fun ledger_wts_buy(
    shop: &mut Shop,               // from bazaar_core::bazar — Advanced type only
    listing_idx: u64,
    quantity: u64,
    ledger: &mut TribeTokenLedger,
    ssu_gov: &mut SSUGovernance,   // from bazaar_core::ssu_governance — for SSU tax rate
    tribe_gov: &mut TribeGovernance, // from bazaar_core::tribe_governance — for tribe tax rate
    shop_cap: &TribeTokenShopCap,  // from bazaar_core::shop_ops — authorizes listing deduction
    storage: &mut UserStorage,     // from bazaar_core::user_storage — item delivery
    clock: &Clock,
    ctx: &mut TxContext,
)

// Advanced WTB fill — seller delivers item, buyer's pre-reserved tokens released to seller
public fun ledger_wtb_fill(
    shop: &mut Shop,
    listing_idx: u64,
    quantity: u64,
    ledger: &mut TribeTokenLedger,
    ssu_gov: &mut SSUGovernance,
    tribe_gov: &mut TribeGovernance,
    shop_cap: &TribeTokenShopCap,
    storage: &mut UserStorage,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Advanced DE exchange — item-for-item, flat token fee split to SSU+Tribe wallets
// No dApp tax on DE (item swap, no EVE moves)
public fun ledger_de_exchange(
    shop: &mut Shop,
    pair_idx: u64,
    ledger: &mut TribeTokenLedger,
    ssu_gov: &mut SSUGovernance,
    tribe_gov: &mut TribeGovernance,
    shop_cap: &TribeTokenShopCap,
    storage: &mut UserStorage,
    clock: &Clock,
    ctx: &mut TxContext,
)

// SSU Owner withdraws accumulated ledger tax credits
// Converts ledger credits to EVE via vault at current exchange rate
// Requires vault to have sufficient EVE balance
public fun withdraw_ssu_tax_credits(
    cap: &SSUOwnerCap,             // from bazaar_core::membership
    ssu_gov: &mut SSUGovernance,
    ledger: &mut TribeTokenLedger,
    vault: &mut TribeVault,
    exchange_config: &ExchangeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
)

// Tribe Leader withdraws accumulated tribe-level ledger tax credits (same conversion)
public fun withdraw_tribe_tax_credits(
    cap: &TribeLeaderCap,
    tribe_gov: &mut TribeGovernance,
    ledger: &mut TribeTokenLedger,
    vault: &mut TribeVault,
    exchange_config: &ExchangeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

**Internal Tax Splitting Helper:**
```move
// Splits a gross token amount into (ssu_tax, tribe_tax, net)
// All u64 arithmetic; panics only on u64 overflow (overflow protection section 11)
public(package) fun split_ledger_payment(
    gross: u64,
    ssu_tax_bps: u64,
    tribe_tax_bps: u64,
): (u64, u64, u64)
// Returns: (ssu_tax_tokens, tribe_tax_tokens, net_tokens)
// Guarantees: ssu_tax + tribe_tax + net == gross (no rounding leakage)
```

**Error Codes:**
```move
const E_NOT_ADVANCED_SHOP: u64 = 1;
const E_WRONG_TRIBE: u64 = 2;
const E_BUYER_INSUFFICIENT_BALANCE: u64 = 3;
const E_LISTING_QUANTITY_ZERO: u64 = 4;
const E_SHOP_NOT_ACTIVE: u64 = 5;
const E_WRONG_SHOP_KIND: u64 = 6;
```

---

## 4. Package-Level Init Function

```move
fun init(ctx: &mut TxContext) {
    // Create and share a TribeEconomyCap wrapper
    // This object holds the single TribeEconomyCap used for cross-package calls
    // into bazaar_core::shop_ops (deduct_listing_quantity / add_listing_quantity)
    let economy_cap_wrapper = TribeEconomyCapWrapper {
        id: object::new(ctx),
        cap: TribeEconomyCap { id: object::new(ctx) },
    };
    transfer::share_object(economy_cap_wrapper);
}
```

**Per-Tribe Objects Created When Advanced Tribe Is Created (called from dapp_hub's create_advanced_tribe PTB):**

The DappHub `create_advanced_tribe` PTB must call into `bazaar_economy` to initialize the per-tribe objects. This is a cross-package PTB composition — dapp_hub's Move code does NOT call bazaar_economy (dependency direction preserved). Instead, the frontend assembles the PTB with both calls atomically.

```move
// Called in PTB after dapp_hub::tribe_registry::create_advanced_tribe()
// Receives the TribeLeaderCap output from the first call
public fun initialize_tribe_economy(
    cap: &TribeLeaderCap,                   // output of create_advanced_tribe
    token_name: vector<u8>,
    token_symbol: vector<u8>,
    initial_tokens_per_mist: u64,
    initial_required_approvals: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)
// Creates and shares: TribeTokenLedger, TribeVault, ExchangeConfig, WithdrawalBoard
// All four objects carry tribe_id from the TribeLeaderCap
```

---

## 5. Frontend — Advanced Bazaar Economy UI

The AdvancedBazaar frontend (`advanced.bazaar.app`) inherits ALL bazaar_core UI (shops, trade, membership, panels). `bazaar_economy` adds the following components on top of that foundation.

### 5.1 Token Balance Display — `TokenBalanceWidget`

Location: Wallet bar (top right), alongside EVE balance.

```
┌────────────────────────────────────────┐
│  Wallet Bar                            │
│  [0x1234...abcd]  EVE: 1,250.00        │
│                   DRC:  3,400          │ ← TribeToken balance from ledger
└────────────────────────────────────────┘
```

- Reads `TribeTokenLedger.balances[player_address]` via direct RPC
- Displays token symbol and amount (whole numbers only, no decimal)
- Refreshes on every transaction + 15-second polling interval
- Grayed out / hidden for NoTribe and EasyBazaar frontends

### 5.2 Exchange Window — `ExchangeWindow`

Floating panel accessible from the Exchange Beacon in the Godot scene and a "Exchange" button in the navigation bar.

```
┌─────────────────────────────────────────────┐
│  EXCHANGE                             [x]    │
├─────────────────────────────────────────────┤
│  Rate: 10 DRC = 1 MIST EVE                  │
│  Vault: 50,000 MIST EVE reserve             │
├─────────────────────────────────────────────┤
│  ┌─── Get DRC ──────────────────────────┐   │
│  │  Pay EVE:   [________] MIST          │   │
│  │  Receive:   ~1,000 DRC (after tax)   │   │
│  │  DApp fee:  ~50 MIST (5%)            │   │
│  │            [Exchange EVE -> DRC]     │   │
│  └──────────────────────────────────────┘   │
│  ┌─── Get EVE ──────────────────────────┐   │
│  │  Burn DRC:  [________] DRC           │   │
│  │  Receive:   ~95 MIST EVE (after tax) │   │
│  │  DApp fee:  ~5 MIST (5%)             │   │
│  │  Your DRC:  3,400                    │   │
│  │            [Exchange DRC -> EVE]     │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

- Live rate preview updates as user types (no TX until submit)
- Shows DApp fee amount and resulting balance change
- Disables "Exchange" buttons when exchange is inactive or vault is insufficient
- Shows "Exchange offline" banner when `is_active = false`
- On success: balance updates in TokenBalanceWidget + EVE balance refreshes

### 5.3 Vault Panel — `TribeVaultPanel`

Located in the Tribe Admin Panel under an "Economy" tab. Tribe Leader only.

```
┌─────────────────────────────────────────────┐
│  TRIBE VAULT — Dragon Clan                   │
├─────────────────────────────────────────────┤
│  EVE Reserve:   50,000 MIST                  │
│  Total In:      200,000 MIST (lifetime)      │
│  Total Out:     150,000 MIST (lifetime)      │
├─────────────────────────────────────────────┤
│  Deposit EVE to Vault                        │
│  Amount: [________] MIST    [Deposit]        │
├─────────────────────────────────────────────┤
│  Withdrawal Requests              [+ New]    │
│  ┌──────────────────────────────────────┐   │
│  │ #1  2,000 MIST  ● Approved — 18h left│   │
│  │ #2  5,000 MIST  ● Pending (1/2 appr) │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

- Deposit field sends `tribe_vault::deposit_eve`
- "+ New" opens `WithdrawalRequestModal`
- Request cards show status, approval count, time remaining in wait period
- "Execute" button visible once wait period elapses (Tribe Leader only)
- "Cancel" button on pending requests (Tribe Leader only)

### 5.4 Withdrawal Request Modal — `WithdrawalRequestModal`

Opened from Vault Panel "+ New" button.

```
┌───────────────────────────────────────┐
│  New Withdrawal Request          [x]  │
├───────────────────────────────────────┤
│  Amount (MIST):  [__________]         │
│  Reason:         [__________________] │
│                  [Submit Request]     │
└───────────────────────────────────────┘
```

- Shows current vault balance and warning if request exceeds it
- On submit: emits `WithdrawalRequestedEvent`, refreshes request list

### 5.5 Withdrawal Request Card — `WithdrawalRequestCard`

Displayed in VaultPanel for each request. Separate view for approvers (SuperAdmins/Admins).

```
┌──────────────────────────────────────────────┐
│  Request #2  |  5,000 MIST                   │
│  Reason: "Monthly infrastructure costs"       │
│  Status: PENDING  |  Approvals: 1 / 2        │
│  Expires in: 47h 23m                          │
│  [Approve]   [Deny]               (Approver)  │
│  [Cancel]                         (Leader)    │
└──────────────────────────────────────────────┘
```

### 5.6 Mint/Burn Controls — within `EconomyGovernanceSection`

Part of the Tribe Admin Panel "Economy" tab, below Vault Panel. Tribe Leader only.

```
┌─────────────────────────────────────────────┐
│  TOKEN SUPPLY                                │
│  Circulating: 25,000 DRC                     │
│  Supply Cap:  100,000 DRC (25% used)         │
├─────────────────────────────────────────────┤
│  Mint Tokens                                 │
│  Recipient: [__________________]             │
│  Amount:    [________] DRC  [Mint]           │
├─────────────────────────────────────────────┤
│  Burn Tokens                                 │
│  From:    [__________________]               │
│  Amount:  [________] DRC    [Burn]           │
├─────────────────────────────────────────────┤
│  Supply Cap   [________] DRC   [Set Cap]     │
│  (0 = no cap)                                │
└─────────────────────────────────────────────┘
```

### 5.7 Exchange Rate Display — within `EconomyGovernanceSection`

```
┌─────────────────────────────────────────────┐
│  EXCHANGE SETTINGS                           │
│  Current Rate: 10 DRC per MIST               │
│  Status:       Active                        │
│  Fee Override: None (global 5% applies)      │
├─────────────────────────────────────────────┤
│  New Rate (tokens per MIST): [____]          │
│  Exchange Active: [ON] [OFF]                 │
│                            [Save Settings]   │
└─────────────────────────────────────────────┘
```

### 5.8 Economy Landing Strip — on AdvancedBazaar Landing Screen

Above the main Godot game view, a compact strip showing:

```
┌────────────────────────────────────────────────────────────────┐
│  DRAGON CLAN ECONOMY  │  Rate: 10 DRC / MIST  │  [Exchange]    │
│  Circulating: 25,000 DRC  │  Vault: 50,000 MIST               │
└────────────────────────────────────────────────────────────────┘
```

- Visible to all authenticated users (not just Tribe Leader)
- Exchange button opens `ExchangeWindow`
- Rate and vault balance from live RPC reads

---

## 6. Size Budget (Move)

| Module | Estimated Bytecode |
|--------|--------------------|
| `tribe_token_ledger.move` | ~9 KB |
| `tribe_vault.move` | ~7 KB |
| `tribe_exchange.move` | ~8 KB |
| `vault_withdrawal.move` | ~6 KB |
| `economy_governance.move` | ~8 KB |
| `ledger_shop_ops.move` | ~7 KB |
| **Total** | **~45 KB** |

Within the 80KB safety target (56% utilization). If size exceeds 60KB during implementation, merge `economy_governance.move` logic into the modules it governs (it has no unique shared objects of its own) to save function dispatch overhead.

---

## 7. Reference Sources (NO COPY-PASTE)

The following serve as **mental reference only**. All code must be written from scratch.

| Existing Source (READ ONLY) | What to Study | Notes |
|-----------------------------|--------------|-------|
| `Bazar1/tribe_economy.move` | TribeWallet, TribeToken struct patterns | Rewrite entirely as TribeTokenLedger (Table<address,u64>) — no Coin<T> |
| `Bazar1/tribe_exchange.move` | AMM pool pattern, swap logic | Rewrite as fixed-rate first; same DApp tax deposit pattern |
| `Bazar1/vault_withdrawal.move` | Multi-sig request lifecycle, voting logic, 24h wait | Direct conceptual reference; rewrite for WithdrawalBoard struct |
| `Bazar1/bazar_shops.move` | Tax-split logic patterns | Reference only for ledger_shop_ops split arithmetic |
| `BazarPublicFix/SuperAdminPanel.tsx` | 8-tab admin panel design | Extend with "Economy" tab following same visual pattern |
| `BazarPublicFix/AdminPanel.tsx` | 6-tab design | Same component patterns for Economy section |
| `Bazar1/ExchangeWindow.tsx` | Exchange UI layout and swap UX | Study flow; rewrite for ledger-based token display |
| `Bazar1/TribeReserveVaultPanel.tsx` | Vault panel layout, withdrawal request cards | Study; rewrite with new WithdrawalBoard struct |
| `BazarPublicFix/index.css` | Full CSS design system | Same visual design — no changes to CSS |

---

## 8. Cross-Package API Calls (bazaar_economy -> others)

| bazaar_economy Calls | Target Package::Module::Function | Purpose |
|---------------------|----------------------------------|---------|
| Exchange DApp tax | `dapp_hub::tax_wallet::deposit_dapp_tax()` | DApp tax on EVE swaps |
| Exchange fee rate | `dapp_hub::dapp_governance::global_dapp_tax_bps()` | Global exchange fee |
| Tribe fee override | `dapp_hub::dapp_governance::custom_tribe_tax_bps()` | Per-tribe fee override |
| Tribe info lookup | `dapp_hub::tribe_registry::tribe_by_id()` | Verify tribe is Advanced type |
| Listing deduction | `bazaar_core::shop_ops::deduct_listing_quantity()` | Atomically reduce WTS listing |
| Listing addition | `bazaar_core::shop_ops::add_listing_quantity()` | Atomically increase WTB fill |
| Shop type check | `bazaar_core::bazar::shop_bazaar_type()` | Abort early if not Advanced |
| SSU tax rate | `bazaar_core::ssu_governance::ssu_tax_config()` | WTS/WTB/DE tax bps |
| Tribe tax rate | `bazaar_core::tribe_governance::tribe_tax_config()` | Tribe tax bps |
| Role check | `bazaar_core::membership::assert_min_role()` | Gate approver voting |
| Item delivery | `bazaar_core::user_storage::store_item()` | Deliver purchased items |

---

## 9. Cross-Package API Exposed (bazaar_economy -> others)

`bazaar_economy` is the leaf package — no other Bazaar package depends on it. However, it exposes public read-only functions for use by the frontend (via RPC, not cross-package Move calls):

| Function | Used by | Purpose |
|----------|---------|---------|
| `tribe_token_ledger::balance_of()` | AdvancedBazaar frontend | Display player's token balance |
| `tribe_token_ledger::total_supply()` | AdvancedBazaar frontend | Supply stats display |
| `tribe_exchange::exchange_rate()` | AdvancedBazaar frontend | Rate display |
| `tribe_exchange::is_exchange_active()` | AdvancedBazaar frontend | Enable/disable exchange UI |
| `tribe_vault::eve_balance()` | AdvancedBazaar frontend | Vault balance display |
| `vault_withdrawal::request_status()` | AdvancedBazaar frontend | Withdrawal card status |
| `vault_withdrawal::approval_count()` | AdvancedBazaar frontend | Approval progress display |
| `economy_governance::supply_utilization()` | AdvancedBazaar frontend | Supply cap display |
| `economy_governance::exchange_health()` | AdvancedBazaar frontend | Economy strip landing display |

---

## 10. Documentation Deliverables

All stored in `BazaarEconomy/Documentation/`:

| Document | Written When | Contents |
|----------|-------------|----------|
| `FrontendAPI.md` | **Phase 2C (FIRST)** | Every hook, TX builder, TypeScript type, and screen specification the AdvancedBazaar economy UI needs |
| `InternalAPI.md` | Phase 6 (after Move code) | All internal functions, structs, events, error codes, package-private helpers |
| `InterfaceSpec.md` | Phase 6 (after Move code) | TribeEconomyCap mechanism, initialize_tribe_economy PTB composition, cross-package event schema |

Cross-package functions also documented in `bazaarinfrastructure/Documentation/API/CrossPackageAPI.md`.

---

## 11. Build Order (Frontend-First)

1. **Phase 2C:** Design all Advanced economy UI (Exchange Window, Vault Panel, Mint/Burn Controls, Economy Landing Strip, Withdrawal Request Modal, Token Balance Widget) → write `FrontendAPI.md`
2. **Phase 6:** Write all Move modules (in this order: `tribe_token_ledger` -> `tribe_vault` -> `tribe_exchange` -> `vault_withdrawal` -> `economy_governance` -> `ledger_shop_ops`) → write `InternalAPI.md` + `InterfaceSpec.md`
3. **Phase 6:** Write TX builders + hooks → wire into AdvancedBazaar frontend
4. **Deploy FOURTH** — after dapp_hub, shared_widgets, bazaar_core are live and their shared object IDs are recorded in `Documentation/SharedObjectRegistry.md`
5. Record all economy shared object IDs

---

## 12. TribeTokenLedger Security

### 12.1 Isolation Model
Each Advanced tribe has its **own** `TribeTokenLedger` shared object (one UID per tribe). The ledger carries a `tribe_id: u64` field and every mutating function checks `assert!(ledger.tribe_id == cap.tribe_id, E_WRONG_TRIBE)`. A player's balance in Tribe A's ledger is a completely separate entry from any balance they might hold in Tribe B's ledger. Cross-tribe spending is structurally impossible — there is no mechanism for ledger entries to transfer between objects.

### 12.2 Who Can Modify
Only `bazaar_economy` package functions can call the `public(package)` `debit`, `credit`, `internal_mint`, and `internal_burn` helpers. External packages (including bazaar_core) cannot call these. The only public entry functions that modify the ledger require either:
- A `TribeLeaderCap` (for mint/burn by the tribe leader), OR
- Are called from within `ledger_shop_ops` or `tribe_exchange` (same package, same trust boundary)

### 12.3 Overflow Protection
All arithmetic uses explicit overflow guards:

```move
// Addition guard — used before every credit()
public(package) fun safe_add(a: u64, b: u64): u64 {
    assert!(a <= MAX_U64 - b, E_OVERFLOW);
    a + b
}

// Subtraction guard — used before every debit()
public(package) fun safe_sub(a: u64, b: u64): u64 {
    assert!(a >= b, E_INSUFFICIENT_BALANCE);
    a - b
}
```

`total_supply` is guarded the same way: `safe_add(total_supply, amount)` before every `internal_mint`.

### 12.4 Rounding Policy
All tax splits use floor division. The `split_ledger_payment` helper guarantees `ssu_tax + tribe_tax + net == gross` by computing `net = gross - ssu_tax - tribe_tax` as the last step (not independently). This prevents sub-MIST dust accumulation.

### 12.5 Supply Cap Enforcement
If a supply cap is set (`supply_cap > 0`), `internal_mint` asserts `safe_add(total_supply, amount) <= supply_cap` before crediting. Setting `supply_cap = 0` disables the cap (permissive default for initial launch).

### 12.6 Vault Solvency vs Ledger Supply
The exchange rate creates a mathematical relationship between `TribeVault.eve_balance` and the redeemable portion of `TribeTokenLedger.total_supply`. The Move contracts do NOT enforce full backing (a tribe could issue more tokens than the vault can redeem). The Tribe Admin Panel warns the leader when `total_supply / tokens_per_mist > eve_balance` (undercollateralized state), but this is a UX advisory — not an abort condition. Tribes are trusted to manage their own economic health.

### 12.7 No Re-Entrancy
Sui Move's ownership model prevents re-entrancy by design — a mutable reference to a shared object (`&mut TribeTokenLedger`) can only be passed once per transaction. Multiple operations within one PTB that touch the same ledger are serialized.

### 12.8 Version Compatibility
```move
const PACKAGE_VERSION: u64 = 1;
const COMPATIBLE_DAPP_HUB_VERSION: u64 = 1;
const COMPATIBLE_BAZAAR_CORE_VERSION: u64 = 1;
```
Version constants are checked at the entry of every cross-package call. Mismatches abort with `E_VERSION_MISMATCH` rather than producing silent incorrect behavior.
