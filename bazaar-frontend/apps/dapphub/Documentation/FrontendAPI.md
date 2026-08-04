# DappHub Frontend API Specification

> Phase 1F — Complete specification of hooks, TX builders, and types
> required by the DappHub frontend application.

## Overview

DappHub is the "lobby" application for the Bazaar Infrastructure. It handles:
- SSU registration (standalone and tribe-affiliated)
- Tribe creation (Easy and Advanced bazaar types)
- SSU management dashboard
- DApp-level administration (owner-only)
- Support ticket system

DappHub depends on `@bazaar/shared` only (no `@bazaar/widgets`).

---

## Hooks

### useTribes()
**Package:** `@bazaar/shared/hooks`
**Purpose:** Fetch all registered tribes for the Join Tribe list.
**Returns:**
```ts
{
  tribes: TribeSummary[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}
```
**Move Contract:** `dapp_hub::tribe_registry::get_all_tribes`
**Used by:** `JoinTribeWindow.tsx`

### useRegisteredSSUs(walletAddress: string)
**Package:** `@bazaar/shared/hooks`
**Purpose:** Fetch all SSUs registered by the connected wallet.
**Returns:**
```ts
{
  ssus: RegisteredSSU[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}
```
**Move Contract:** `dapp_hub::ssu_registry::get_ssus_by_owner`
**Used by:** `MyRegisteredSSUs.tsx`

### useAllTribes()
**Package:** `@bazaar/shared/hooks`
**Purpose:** Fetch all tribes for the DApp Management panel (admin view with full details).
**Returns:**
```ts
{
  tribes: TribeRow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}
```
**Move Contract:** `dapp_hub::tribe_registry::get_all_tribes_admin`
**Used by:** `management/TribesTab.tsx`

### useAllSSUs()
**Package:** `@bazaar/shared/hooks`
**Purpose:** Fetch all SSUs across all tribes for DApp Management.
**Returns:**
```ts
{
  ssus: SSURow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}
```
**Move Contract:** `dapp_hub::ssu_registry::get_all_ssus`
**Used by:** `management/SSUsTab.tsx`

### useDAppTaxConfig()
**Package:** `@bazaar/shared/hooks`
**Purpose:** Fetch the current DApp-level tax configuration.
**Returns:**
```ts
{
  data: DAppTaxConfig | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}
```
**Move Contract:** `dapp_hub::dapp_config::get_tax_config`
**Used by:** `management/TaxesFeesTab.tsx`

### useTaxWallet()
**Package:** `@bazaar/shared/hooks`
**Purpose:** Fetch the DApp tax wallet balance and statistics.
**Returns:**
```ts
{
  data: TaxWalletData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}
```
**Move Contract:** `dapp_hub::dapp_wallet::get_wallet_info`
**Used by:** `management/TaxWalletTab.tsx`

### useTickets()
**Package:** `@bazaar/shared/hooks`
**Purpose:** Fetch all support tickets (DApp owner view).
**Returns:**
```ts
{
  tickets: SupportTicket[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}
```
**Move Contract:** `dapp_hub::tickets::get_all_tickets` (or off-chain API)
**Used by:** `management/TicketsTab.tsx`

### useIsDappOwner()
**Package:** `@bazaar/shared/hooks`
**Purpose:** Check if the connected wallet is the DApp owner.
**Returns:**
```ts
{
  isDappOwner: boolean;
  ownerAddress: string | null;
}
```
**Move Contract:** `dapp_hub::dapp_config::get_owner`
**Used by:** `App.tsx`, `LandingPage.tsx`

### useUnregisterSSU(): UseMutationResult
**Package:** `@bazaar/shared/hooks`
**Purpose:** Mutation hook that builds and executes the `unregisterSSU` PTB, then invalidates relevant query caches.
**Args type:**
```ts
interface UnregisterSSUArgs {
  ssuId: string;
  tribeGovId: string | null;
}
```
**Result type:**
```ts
interface UnregisterSSUResult {
  digest: string;
}
```
**Query keys invalidated on success:**
- `["my-ssus"]`
- `["all-ssus"]`
- `["ssu-status", ssuId]`
- `["bazaarcore", "tribe-members", tribeGovId]` (prefix match, `exact: false`) — only when `tribeGovId` is provided
**TX Builder called:** `unregisterSSU(ssuId)`
**Used by:** `UnregisterSSUDialog` (triggered from `MyRegisteredSSUs`)
**APM:** APM-005

---

## TX Builders

### registerSSU(ssuId: string)
**Package:** `@bazaar/shared/tx`
**Purpose:** Register a standalone SSU (no tribe).
**Move Entry Function:** `dapp_hub::ssu_registry::register_ssu`
**Parameters:** `ssu_id: address`
**Used by:** `NoTribeRegistration.tsx`

### registerSSUToTribe(ssuId: string, tribeId: string)
**Package:** `@bazaar/shared/tx`
**Purpose:** Register an SSU to an existing tribe (open registration).
**Move Entry Function:** `dapp_hub::ssu_registry::register_ssu_to_tribe`
**Parameters:** `ssu_id: address, tribe_id: address`
**Used by:** `JoinTribeWindow.tsx`

### submitTribeApplication(tribeId: string, ssuId: string, message: string)
**Package:** `@bazaar/shared/tx`
**Purpose:** Submit an application to join a tribe that requires approval.
**Move Entry Function:** `dapp_hub::tribe_registry::submit_application`
**Parameters:** `tribe_id: address, ssu_id: address, message: vector<u8>`
**Used by:** `ApplicationWindow.tsx`

### createTribeEasy(name: string, description: string)
**Package:** `@bazaar/shared/tx`
**Purpose:** Create a tribe with Easy Bazaar defaults.
**Move Entry Function:** `dapp_hub::tribe_registry::create_tribe_easy`
**Parameters:** `name: vector<u8>, description: vector<u8>`
**Used by:** `EasyBazaarCreation.tsx`

### createTribeAdvanced(name: string, description: string, tokenName: string, tokenSymbol: string)
**Package:** `@bazaar/shared/tx`
**Purpose:** Create a tribe with custom token and Advanced Bazaar configuration.
**Move Entry Function:** `dapp_hub::tribe_registry::create_tribe_advanced`
**Parameters:** `name: vector<u8>, description: vector<u8>, token_name: vector<u8>, token_symbol: vector<u8>`
**Used by:** `AdvancedBazaarCreation.tsx`

### updateDAppTaxConfig(wtsTaxBps: number, wtbTaxBps: number, deFlatFee: number, tradeTaxBps: number)
**Package:** `@bazaar/shared/tx`
**Purpose:** Update the DApp-level tax rates.
**Move Entry Function:** `dapp_hub::dapp_config::set_tax_config`
**Parameters:** `wts_tax_bps: u64, wtb_tax_bps: u64, de_flat_fee: u64, trade_tax_bps: u64`
**Used by:** `management/TaxesFeesTab.tsx`

### withdrawDappFunds(amount: number)
**Package:** `@bazaar/shared/tx`
**Purpose:** Withdraw EVE from the DApp tax wallet.
**Move Entry Function:** `dapp_hub::dapp_wallet::withdraw`
**Parameters:** `amount: u64`
**Used by:** `management/TaxWalletTab.tsx`

### freezeTribe(tribeId: string)
**Package:** `@bazaar/shared/tx`
**Purpose:** Freeze a tribe (DApp owner action).
**Move Entry Function:** `dapp_hub::tribe_registry::freeze_tribe`
**Parameters:** `tribe_id: address`
**Used by:** `management/TribesTab.tsx`

### unfreezeTribe(tribeId: string)
**Package:** `@bazaar/shared/tx`
**Purpose:** Unfreeze a previously frozen tribe.
**Move Entry Function:** `dapp_hub::tribe_registry::unfreeze_tribe`
**Parameters:** `tribe_id: address`
**Used by:** `management/TribesTab.tsx`

### submitTicket(title: string, tag: string, body: string, contactMethod: string, contactValue: string)
**Package:** `@bazaar/shared/tx`
**Purpose:** Submit a support ticket (may be off-chain API instead of Move TX).
**Move Entry Function:** TBD (may use off-chain ticket service)
**Used by:** `ContactTicketWindow.tsx`

### unregisterSSU(ssuId: string): Transaction
**Package:** `@bazaar/shared/tx`
**Purpose:** Build a PTB that atomically deregisters an SSU and cleans up its tribe membership when `tribe_id != 0`.
**Move Entry Function:** `dapp_hub::ssu_registry::deregister_ssu_with_tribe_cleanup`
**Parameters:** `ssu_id: address`
**Used by:** `useUnregisterSSU` hook (via `UnregisterSSUDialog`)
**Note:** `buildRemoveSSU(ssuId)` is retained as a deprecated alias. Prefer `unregisterSSU` for all new callers. APM-004.

---

## TypeScript Types

All types are defined in `src/types/index.ts`. Key types:

| Type | Purpose |
|------|---------|
| `DappHubScreen` | Union of all navigable screen identifiers |
| `TribeSummary` | Tribe info for the Join Tribe list |
| `RegisteredSSU` | SSU record for My Registered SSUs view |
| `TribeApplication` | Application to join a tribe |
| `SupportTicket` | Support/contact ticket |
| `TicketTag` | Ticket category tag union |
| `ManagementTab` | DApp Management tab identifiers |
| `DAppTaxConfig` | Tax rate configuration |
| `TaxWalletData` | Tax wallet balance and stats |

---

## Components

### UnregisterSSUDialog
**File:** `bazaar-frontend/apps/dapphub/src/components/windows/UnregisterSSUDialog.tsx`
**Purpose:** Confirmation dialog rendered by `MyRegisteredSSUs` when the user triggers unregister on an SSU card. Displays SSU details and an advanced-tribe warning when applicable.
**Props:**
```typescript
interface UnregisterSSUDialogProps {
  ssu: RegisteredSSU;
  isAdvancedTribe: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}
```
**Rendered by:** `MyRegisteredSSUs` (conditionally, when user triggers unregister on an ssu-card)
**APM:** APM-006

---

## Constants Required

```ts
// @bazaar/shared/constants
export const DAPP_OWNER_ADDRESS: string;      // DApp owner wallet address
export const DAPP_HUB_PACKAGE_ID: string;     // dapp_hub Move package ID
export const TRIBE_REGISTRY_ID: string;       // Tribe registry shared object ID
export const SSU_REGISTRY_ID: string;         // SSU registry shared object ID
export const DAPP_WALLET_ID: string;          // DApp tax wallet shared object ID
```

---

## Component-to-API Mapping

| Component | Hooks Used | TX Builders Used | Child Components |
|-----------|-----------|-----------------|-----------------|
| LandingPage | useIsDappOwner | (none) | (none) |
| NoTribeRegistration | (none) | registerSSU | (none) |
| JoinTribeWindow | useTribes | registerSSUToTribe | (none) |
| ApplicationWindow | (none) | submitTribeApplication | (none) |
| EasyBazaarCreation | (none) | createTribeEasy | (none) |
| AdvancedBazaarCreation | (none) | createTribeAdvanced | (none) |
| MyRegisteredSSUs | useRegisteredSSUs, useUnregisterSSU | (none) | UnregisterSSUDialog |
| ContactTicketWindow | (none) | submitTicket | (none) |
| TribesTab | useAllTribes | freezeTribe, unfreezeTribe | (none) |
| SSUsTab | useAllSSUs | (none) | (none) |
| TaxesFeesTab | useDAppTaxConfig | updateDAppTaxConfig | (none) |
| TaxWalletTab | useTaxWallet | withdrawDappFunds | (none) |
| TicketsTab | useTickets | (none) | (none) |
