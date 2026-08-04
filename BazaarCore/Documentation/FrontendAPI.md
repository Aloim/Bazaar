# BazaarCore -- Frontend API Specification

> **Status:** Phase 5 Wiring — Spec Corrections Applied
> **Constitution Reference:** Article II.1 -- Frontend designed FIRST
> **Last Updated:** Phase 5D — BazaarCore Move implementation alignment (2026-04-17)

---

## Overview

This document defines what the NoTribe and Easy Bazaar frontends need from the BazaarCore Move contracts. Derived from Phase 2 UI component designs: 7 source files in `bazaar-frontend/apps/notribe/src/` and 9 source files in `bazaar-frontend/apps/easy/src/`.

BazaarCore serves both NoTribe (2-layer tax, EVE only, standalone SSU) and Easy (3-layer tax, EVE only, tribe-affiliated). The same Move modules back both apps, differentiated by `bazaar_type` field (0=NoTribe, 1=Easy).

> **Phase 5D Change Summary:** This document was corrected in Phase 5 to align with the actual Move implementation. See the gap table in `.claude/reports/phase5-wiring-unified-plan.md` (G-05 through G-20) for the full rationale behind each correction.

---

## 1. Hooks (RPC Reads)

### Shop Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useShops(ssuId: string)` | `Shop[]` -- all shops at this SSU with kind, listings, pairs, escrow, expiry | BazaarView (NoTribe), BazaarView (Easy) |
| `useShopById(shopId: string)` | `Shop \| null` -- single shop detail | ShopPanel (NoTribe), ShopPanel (Easy) |
| `useMyShops(walletAddress: string, ssuId: string)` | `Shop[]` -- shops owned by connected wallet at this SSU | BazaarView (NoTribe), BazaarView (Easy) |

### Inventory Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useInventory(walletAddress: string, ssuId: string)` | `OwnedInventoryItem[]` -- items with quantity and locked state | InventoryPanel (NoTribe), InventoryPanel (Easy) |
| `useUnclaimedItems(walletAddress: string, ssuId: string)` | `UnclaimedItem[]` -- items from closed shops pending claim | InventoryPanel (NoTribe), InventoryPanel (Easy) |
| `useStorageStats(walletAddress: string, ssuId: string)` | `{ totalItemCount: number }` -- count of items in UserStorage | InventoryPanel (NoTribe), InventoryPanel (Easy) |

> **G-10 correction:** `useStorageStats` previously returned `{ usedVolume, volumeLimit }`. Move has no volume tracking. Return is now `{ totalItemCount: number }`.

### Item Type Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useItemTypes(typeIds: number[])` | `Map<number, { name: string }>` -- item type metadata | ShopPanel, DirectTradePanel, InventoryPanel (all apps) |

### Direct Trade Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useTradeProposals(walletAddress: string)` | `TradeProposal[]` -- all proposals involving this wallet | DirectTradePanel (NoTribe), DirectTradePanel (Easy) |

### SSU Governance Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useSSUCaps(walletAddress: string, ssuId: string)` | `{ hasSSUOwnerCap, hasSSUAdminCap, capIds }` -- caps held at this SSU | SSUGovernanceButton (NoTribe), SSUGovernanceButton (Easy) |
| `useSSURoleTaxTable(ssuId: string)` | `SSUTaxConfig { wtsBps: number, wtbBps: number, deFlatFee: number }` -- flat SSU tax config | SSUGovernanceButton TaxSettingsTab (both apps) |
| `useSSUGovernanceConfig(ssuId: string)` | `SSUGovernanceConfig` -- SSU governance settings (no shopLimit, no volumeLimit, no maxListings) | SSUGovernanceButton (both apps) |
| `useUnclaimedSSUItems(ssuId: string)` | `UnclaimedItem[]` -- SSU-wide unclaimed items for admin view | SSUGovernanceButton UnclaimedTab (both apps) |

> **G-08 correction:** `useSSURoleTaxTable` was renamed conceptually to return a flat `SSUTaxConfig` rather than a per-role tax table. Move stores a single flat config (`wtsBps`, `wtbBps`, `deFlatFee`) for the SSU, not per-role rates.
>
> **G-09/G-10 correction:** `useSSUGovernanceConfig` no longer includes `shopLimit`, `maxListings`, or `volumeLimit`. These fields do not exist in the Move `SSUGovernance` struct.
>
> **G-15 correction:** `useSSUCaps` previously listed `hasSSUSuperAdminCap`. Move has no `SSUSuperAdminCap`; the highest SSU-level cap is `SSUOwnerCap`. The field is removed.

### SSU Role Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useSSURoles(walletAddress: string, ssuId: string)` | `SSURoles` -- role flags for the connected wallet | App.tsx (NoTribe), App.tsx (Easy) |

### Tribe Identity Hooks (Easy only)
| Hook | Returns | Used By |
|------|---------|---------|
| `useTribeIdentity(tribeParam: string)` | `TribeIdentity \| null` -- tribe metadata from registry | App.tsx (Easy) |
| `useTribeRoles(walletAddress: string, tribeId: string)` | `TribeRoles` -- role flags for the connected wallet | App.tsx (Easy) |

### Tribe Governance Hooks (Easy only)
| Hook | Returns | Used By |
|------|---------|---------|
| `useTribeCaps(walletAddress: string, tribeId: string)` | `{ hasTribeLeaderCap, hasTribeSuperAdminCap, hasTribeAdminCap, hasTribeModCap }` | TribeGovernanceButton (Easy) |
| `useTribeGovernanceConfig(tribeId: string)` | `TribeGovernanceConfig` -- tribe tax rates only (no registrationPolicy, no maxMembers) | TribeGovernanceButton TribeTaxTab (Easy) |
| `useTribeMembers(tribeId: string)` | `TribeMember[]` -- address, alias, role, join time | TribeHub MemberList (Easy) |
| `useTribeAnnouncements(tribeId: string)` | `Announcement[]` -- tribe-level announcements | TribeHub AnnouncementFeed (Easy), TribeGovernanceButton AnnouncementsTab (Easy) |
| `useTribeApplications(tribeId: string)` | `TribeApplication[]` -- pending membership applications | TribeGovernanceButton ApplicationsTab (Easy) |
| `useTribeSSUs(tribeId: string)` | `TribeSSU[]` -- SSUs registered to this tribe | TribeGovernanceButton SSUsTab (Easy) |

> **G-16 correction:** `useTribeCaps` previously listed only `hasTribeLeaderCap` and `hasTribeAdminCap`. Move has four cap types: `TribeLeaderCap`, `TribeSuperAdminCap`, `TribeAdminCap`, `TribeModCap`. All four are now exposed.
>
> **G-11 correction:** `useTribeGovernanceConfig` previously included `registrationPolicy` and `maxMembers`. In Move, `registrationPolicy` is on `dapp_hub::Tribe`, not on `TribeGovernance`. Neither field is in the `TribeGovernance` struct. Both are removed.

### Wallet Connection Hook
| Hook | Returns | Used By |
|------|---------|---------|
| `useConnection()` | `{ walletAddress, isConnected }` | WalletBar, all panels requiring wallet state |

---

## 2. TX Builders (Write Operations)

### Shop Creation TX Builders

> **G-05 correction:** All shop creation builders now include `bazaarType`, `tribeId`, and `expiryMs` parameters to match the Move entry function signatures. Move uses these to set the shop's type classification and lifetime.

| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildCreateWTSShop(ssuId, title, listings[], bazaarType, tribeId, expiryMs)` | SSU ID, title, array of `{itemTypeId, quantity, priceEve}`, bazaar type enum, tribe ID (0 for NoTribe), expiry duration in ms | BazaarView Create Shop modal (both apps) |
| `buildCreateWTBShop(ssuId, title, listings[], escrowEve, bazaarType, tribeId, expiryMs)` | SSU ID, title, listings, escrow amount, bazaar type enum, tribe ID (0 for NoTribe), expiry duration in ms | BazaarView Create Shop modal (both apps) |
| `buildCreateDEShop(ssuId, title, pairs[], bazaarType, tribeId, expiryMs)` | SSU ID, title, array of `{offeredTypeId, offeredQty, requestedTypeId, requestedQty}`, bazaar type enum, tribe ID (0 for NoTribe), expiry duration in ms | BazaarView Create Shop modal (both apps) |
| `buildCreateFreeShop(ssuId, title, listings[], bazaarType, tribeId, expiryMs)` | SSU ID, title, array of `{itemTypeId, quantity}`, bazaar type enum, tribe ID (0 for NoTribe), expiry duration in ms | BazaarView Create Shop modal (FREE type) |

### Shop Interaction TX Builders

> **G-14 note:** The shop interaction builders (WTS buy, WTB fill, DE exchange) require the following shared objects to be passed in the PTB in addition to the shop object ID: `SSUGovernance`, `BazaarCoreAdmin`, `DAppTaxWallet`, `GovernanceConfig`, `UserStorage`. For tribe bazaars (Easy), `TribeGovernance` is also required. These are passed as object arguments in the PTB construction layer and must be resolved from the constants/shared-object registry at call time.

| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildWTSBuy(shopId, listingIdx, quantity)` | Shop object ID, listing index, purchase quantity (plus required shared objects — see note above) | ShopPanel WTSView (both apps) |
| `buildWTBFill(shopId, listingIdx, quantity)` | Shop object ID, listing index, delivery quantity (plus required shared objects — see note above) | ShopPanel WTBView (both apps) |
| `buildDEExchange(shopId, pairIdx)` | Shop object ID, pair index — each call consumes exactly one pair (no units param) (plus required shared objects — see note above) | ShopPanel DEView (both apps) |
| `buildCloseShop(shopId)` | Shop object ID | BazaarView (owner closes own shop) |
| `buildFreeClaim(shopId, listingIdx)` | Shop object ID, listing index — claim one item from a FREE shop | ShopPanel FREEView (both apps) |

> **G-13 correction:** `buildDEExchange` previously accepted a `units` parameter. Move's `de_exchange` entry function processes exactly one pair per call. The `units` parameter has been removed. To exchange multiple pairs, use PTB multi-call.

### Direct Trade TX Builders

> **G-06 correction:** `buildCreateTradeProposal` now includes `ssuId`, `tribeId`, `bazaarType`, and `expiryMs` to match the Move `create_proposal` entry function signature.
>
> **G-07 correction:** `buildAcceptTrade` now includes `eveAmount` because the counterparty must pay their EVE side of the trade at accept time.

| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildCreateTradeProposal(counterparty, giveItems[], requestItems[], giveEve, requestEve, ssuId, tribeId, bazaarType, expiryMs)` | Counterparty address, offered/requested items and EVE amounts, SSU ID, tribe ID (0 for NoTribe), bazaar type enum, expiry duration in ms | DirectTradePanel CreateTradeForm (both apps) |
| `buildAcceptTrade(proposalId, eveAmount)` | Proposal object ID, EVE amount the counterparty pays | DirectTradePanel TradeDetailView (both apps) |
| `buildRejectTrade(proposalId)` | Proposal object ID | DirectTradePanel TradeDetailView (both apps) |
| `buildCancelTrade(proposalId)` | Proposal object ID — proposer cancels their own pending trade | DirectTradePanel TradeDetailView (both apps) |

### Inventory TX Builders

> **G-12 correction:** `buildClaimUnclaimedItem` previously used `typeId: number` as the second parameter. Move uses `shop_id` as the key for the unclaimed items table. The parameter is now `shopId: string`.

| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildClaimUnclaimedItem(ssuId, shopId)` | SSU ID, shop object ID (the shop whose unclaimed items are being claimed) | InventoryPanel UnclaimedSection (both apps) |
| `buildBatchClaimUnclaimed(ssuId)` | SSU ID (PTB multi-call pattern — calls buildClaimUnclaimedItem once per shop; no Move batch function) | InventoryPanel Claim All button (both apps) |
| `buildWithdrawItems(ssuId, itemTypeId, quantity)` | SSU ID, item type ID, quantity to withdraw from UserStorage to player wallet | InventoryPanel WithdrawSection (both apps) |

### SSU Governance TX Builders

> **G-08 correction:** `buildSetSSURoleTax` previously accepted a full per-role tax table. Move's `set_ssu_tax_config` accepts a flat config. The parameter is now a single `SSUTaxConfig` object.
>
> **G-09 correction:** `buildSetShopSettings` and `buildSetVolumeLimit` have been removed. These Move functions do not exist. The `SSUGovernance` struct has no `shopLimit`, `maxListings`, or `volumeLimit` fields.

| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildSetSSURoleTax(ssuId, taxConfig)` | SSU ID, `SSUTaxConfig { wtsBps: number, wtbBps: number, deFlatFee: number }` | SSUGovernanceButton TaxSettingsTab (both apps) |
| `buildGrantSSURole(ssuId, address, role)` | SSU ID, target wallet, role enum | SSUGovernanceButton UsersTab (both apps) |
| `buildForceCloseShop(ssuId, shopId)` | SSU ID, shop object ID | SSUGovernanceButton ForceCloseTab (both apps) |
| `buildWithdrawSSUTax(ssuId)` | SSU ID — SSU owner withdraws accumulated tax from SSU tax wallet | SSUGovernanceButton (SSUOwner only) |

### WTB Escrow TX Builders

| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildTopUpEscrow(shopId, eveAmount)` | Shop object ID, EVE coin amount to add to WTB escrow pool | ShopPanel WTBView (shop owner) |
| `buildWithdrawEscrow(shopId)` | Shop object ID — shop owner withdraws remaining EVE from WTB escrow pool | ShopPanel WTBView (shop owner) |

### Tribe Governance TX Builders (Easy only)

> **G-20 correction:** `buildBanTribeMember` previously accepted a `reason` string. Move's `set_tribe_ban` has no reason field. Signature is now `buildBanTribeMember(tribeId, address)`.

| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildSetTribeTax(tribeId, { wtsBps, wtbBps, deFee })` | Tribe ID, tax rate object | TribeGovernanceButton TribeTaxTab (Easy) |
| `buildGrantTribeRole(tribeId, address, role)` | Tribe ID, wallet address, role — dispatches to the appropriate Move function (`grant_tribe_super_admin`, `grant_tribe_admin`, or `grant_tribe_mod`) based on role level | TribeGovernanceButton MembersTab (Easy) |
| `buildRemoveTribeMember(tribeId, address)` | Tribe ID, wallet address | TribeGovernanceButton MembersTab (Easy) |
| `buildBanTribeMember(tribeId, address)` | Tribe ID, wallet address (no reason field — Move has none) | TribeGovernanceButton BansTab (Easy) |
| `buildRegisterSSUToTribe(tribeId, ssuAddress)` | Tribe ID, SSU object ID | TribeGovernanceButton SSUsTab (Easy) |
| `buildApproveTribeApplication(tribeId, address)` | Tribe ID, applicant address -- routes to DappHub `registration::accept_registration` | TribeGovernanceButton ApplicationsTab (Easy) |
| `buildRejectTribeApplication(tribeId, address)` | Tribe ID, applicant address -- routes to DappHub `registration::reject_registration` | TribeGovernanceButton ApplicationsTab (Easy) |
| `buildPostAnnouncement(tribeId, { title, body, isSticky })` | Tribe ID, announcement data | TribeGovernanceButton AnnouncementsTab (Easy) |
| `buildWithdrawTribeTax(tribeId)` | Tribe ID — tribe leader withdraws accumulated tribe tax | TribeGovernanceButton (TribeLeader only) |

### SSU Access TX Builders

| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildRegisterStranger(ssuId)` | SSU ID — player self-registers as a stranger at this SSU to gain access | IntroSequence / landing page (both apps) |

---

## 3. TypeScript Types

### Shared BazaarCore Types

- `BazaarType` -- enum: `0 = NoTribe`, `1 = Easy`, `2 = Advanced`

### NoTribe-specific (`bazaar-frontend/apps/notribe/src/types/index.ts`)

- `NoTribeScreen` -- Navigation screen enum (intro, landing, bazaar, inventory, trade, ssu-governance)
- `ShopKind` -- "WTS" | "WTB" | "DE" | "FREE"
- `Listing` -- Single item listing (itemTypeId, quantity, priceEve)
- `ExchangePair` -- DE pair (offeredTypeId, offeredQty, requestedTypeId, requestedQty)
- `Shop` -- Full shop object with kind, listings, pairs, escrow, timestamps, bazaarType, tribeId, expiryMs
- `SSURole` -- SSU-prefixed role enum (8 levels)
- `SSUMarketRole` -- Market role classification for tax purposes
- `SSURoles` -- Role state flags for connected wallet
- `SSUTaxConfig` -- Flat SSU tax config: `{ wtsBps: number, wtbBps: number, deFlatFee: number }`
- `SSUGovernanceConfig` -- SSU governance settings (no shopLimit, no volumeLimit, no maxListings)
- `TradeItem` -- Single item in a trade proposal
- `TradeProposal` -- Two-phase trade with status, items, EVE amounts, ssuId, tribeId, bazaarType, expiryMs
- `OwnedInventoryItem` -- Inventory slot with locked quantities
- `InventorySortKey` -- "name" | "quantity"
- `SSUGovernanceTab` -- 6-tab enum (tax, shop, storage, users, forceclose, unclaimed)

> **G-09/G-10 correction:** `SSURoleTaxConfig` and `SSURoleTaxTable` are replaced by `SSUTaxConfig` (flat config). `InventorySortKey` no longer includes "volume".

### Easy-specific (`bazaar-frontend/apps/easy/src/types/index.ts`)

All of the above NoTribe types, plus:

- `EasyScreen` -- Navigation screen enum (adds tribe-hub, tribe-governance)
- `TribeIdentity` -- Tribe metadata (id, name, description, memberCount, ssuCount, bazaarType, accentColor, logoUrl)
- `TribeRole` -- Tribe-prefixed role enum (TribeLeader, TribeSuperAdmin, TribeAdmin, TribeMod, TribeMember)
- `TribeRoles` -- Role state flags for connected wallet (tribe level, 5 levels matching Move cap types)
- `TribeGovernanceTab` -- 6-tab enum (tax, members, bans, ssus, applications, announcements)
- `TribeGovernanceConfig` -- Tribe tax rates only (no registrationPolicy, no maxMembers)
- `Announcement` -- Announcement with comments, visibility, sticky flag
- `Comment` -- Announcement comment
- `GuestbookEntry` -- Guestbook entry

> **G-11 correction:** `TribeGovernanceConfig` no longer includes `registrationPolicy` or `maxMembers`. These fields are on `dapp_hub::Tribe`, not `TribeGovernance`.
>
> **G-16 correction:** `TribeRole` now includes `TribeSuperAdmin` and `TribeMod` to match the four cap types in Move.

---

## 4. Component-to-API Matrix

### NoTribe App Components

| Component | Hooks Required | TX Builders Required |
|-----------|---------------|---------------------|
| App.tsx | useSSURoles | -- |
| IntroSequence | -- (pure UI animation) | buildRegisterStranger |
| BazaarView | useShops, useMyShops | -- (delegates to ShopPanel; create modal uses buildCreateWTSShop/WTB/DE/Free) |
| ShopPanel (WTS) | useItemTypes | buildWTSBuy |
| ShopPanel (WTB) | useItemTypes | buildWTBFill, buildTopUpEscrow, buildWithdrawEscrow |
| ShopPanel (DE) | useItemTypes | buildDEExchange |
| ShopPanel (FREE) | useItemTypes | buildFreeClaim |
| InventoryPanel | useInventory, useUnclaimedItems, useStorageStats, useItemTypes | buildClaimUnclaimedItem, buildBatchClaimUnclaimed, buildWithdrawItems |
| DirectTradePanel | useTradeProposals, useInventory, useItemTypes | buildCreateTradeProposal, buildAcceptTrade, buildRejectTrade, buildCancelTrade |
| SSUGovernanceButton | useSSUCaps | -- (tab container) |
| SSUGovernanceButton/TaxSettingsTab | useSSURoleTaxTable | buildSetSSURoleTax |
| SSUGovernanceButton/UsersTab | -- | buildGrantSSURole |
| SSUGovernanceButton/ForceCloseTab | -- | buildForceCloseShop |
| SSUGovernanceButton/UnclaimedTab | useUnclaimedSSUItems | -- |
| SSUGovernanceButton/OwnerTab | useSSUCaps | buildWithdrawSSUTax |

> **G-09/G-10 correction:** ShopSettingsTab (buildSetShopSettings) and StorageTab (buildSetVolumeLimit) rows have been removed. Those TX builders and their corresponding Move functions do not exist.

### Easy App Components

| Component | Hooks Required | TX Builders Required |
|-----------|---------------|---------------------|
| App.tsx | useTribeIdentity, useSSURoles, useTribeRoles | -- |
| IntroSequence | -- (pure UI animation) | buildRegisterStranger |
| TribeHub | useTribeMembers, useTribeAnnouncements | -- |
| BazaarView | useShops, useMyShops | -- (delegates to ShopPanel; create modal uses buildCreateWTSShop/WTB/DE/Free) |
| ShopPanel (WTS) | useItemTypes | buildWTSBuy |
| ShopPanel (WTB) | useItemTypes | buildWTBFill, buildTopUpEscrow, buildWithdrawEscrow |
| ShopPanel (DE) | useItemTypes | buildDEExchange |
| ShopPanel (FREE) | useItemTypes | buildFreeClaim |
| InventoryPanel | useInventory, useUnclaimedItems, useStorageStats, useItemTypes | buildClaimUnclaimedItem, buildBatchClaimUnclaimed, buildWithdrawItems |
| DirectTradePanel | useTradeProposals, useInventory, useItemTypes | buildCreateTradeProposal, buildAcceptTrade, buildRejectTrade, buildCancelTrade |
| SSUGovernanceButton | useSSUCaps | -- (tab container, same tabs as NoTribe) |
| SSUGovernanceButton/TaxSettingsTab | useSSURoleTaxTable | buildSetSSURoleTax |
| SSUGovernanceButton/UsersTab | -- | buildGrantSSURole |
| SSUGovernanceButton/ForceCloseTab | -- | buildForceCloseShop |
| SSUGovernanceButton/UnclaimedTab | useUnclaimedSSUItems | -- |
| SSUGovernanceButton/OwnerTab | useSSUCaps | buildWithdrawSSUTax |
| TribeGovernanceButton | useTribeCaps | -- (tab container) |
| TribeGovernanceButton/TribeTaxTab | useTribeGovernanceConfig | buildSetTribeTax |
| TribeGovernanceButton/MembersTab | -- | buildGrantTribeRole, buildRemoveTribeMember |
| TribeGovernanceButton/BansTab | -- | buildBanTribeMember |
| TribeGovernanceButton/SSUsTab | useTribeSSUs | buildRegisterSSUToTribe |
| TribeGovernanceButton/ApplicationsTab | useTribeApplications | buildApproveTribeApplication, buildRejectTribeApplication |
| TribeGovernanceButton/AnnouncementsTab | useTribeAnnouncements | buildPostAnnouncement |
| TribeGovernanceButton/OwnerTab | useTribeCaps | buildWithdrawTribeTax |

---

## 5. Shared Object Requirements for Shop Interaction Builders

The following shared objects are required by the Move entry functions for all shop interaction transactions (WTS buy, WTB fill, DE exchange, FREE claim). The TypeScript PTB construction layer must resolve these from the shared object registry (`Documentation/API/SharedObjectRegistry.md`) and pass them as object arguments.

| Shared Object | Type | Required For |
|---------------|------|-------------|
| `SSUGovernance` | `0x...::ssu_governance::SSUGovernance` | All shop interactions |
| `BazaarCoreAdmin` | `0x...::bazar::BazaarCoreAdmin` | All shop interactions |
| `DAppTaxWallet` | `0x...::dapp_hub::DAppTaxWallet` | All shop interactions (dApp tax deposit) |
| `GovernanceConfig` | `0x...::dapp_hub::GovernanceConfig` | All shop interactions (dApp fee config) |
| `UserStorage` | `0x...::user_storage::UserStorage` | All shop interactions (item escrow) |
| `TribeGovernance` | `0x...::tribe_governance::TribeGovernance` | Tribe bazaars only (Easy app) |

> All object IDs are loaded from environment config sourced from `Documentation/API/SharedObjectRegistry.md`. No hardcoded IDs in source — see Constitution Article 2.6.

---

## 6. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | Phase 2 | Initial spec — derived from NoTribe and Easy UI design. Hooks, TX builders, types, component matrix. |
| 2.0 | 2026-04-17 | **Phase 5D corrections** — Aligned spec with actual Move implementation. Applied gaps G-05 through G-20 from unified plan. Removed non-existent fields (shopLimit, volumeLimit, maxListings, registrationPolicy, maxMembers, SSUSuperAdminCap, ban reason). Corrected buildClaimUnclaimedItem param (shopId not typeId). Fixed buildAcceptTrade (added eveAmount). Fixed buildDEExchange (removed units). Fixed useSSURoleTaxTable (flat config). Corrected useTribeCaps (4 cap types). Added 9 missing TX builders (buildCreateFreeShop, buildFreeClaim, buildCancelTrade, buildWithdrawSSUTax, buildWithdrawTribeTax, buildRegisterStranger, buildWithdrawItems, buildTopUpEscrow, buildWithdrawEscrow). Added Section 5 for shared object requirements. |
