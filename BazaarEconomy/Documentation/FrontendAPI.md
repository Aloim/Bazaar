# BazaarEconomy -- Frontend API Specification

> **Status:** Phase 2 Complete
> **Constitution Reference:** Article II.1 -- Frontend designed FIRST
> **Last Updated:** Phase 2 (BazaarEconomy Frontend Design)

---

## Overview

This document defines what the Advanced Bazaar frontend needs from the BazaarEconomy Move contracts. Derived from Phase 2 UI component designs: 12 source files in `bazaar-frontend/apps/advanced/src/`.

BazaarEconomy extends BazaarCore with tribe token economics: TribeToken ledger, AMM exchange pool, vault management, multi-sig withdrawals, and mint/burn operations. The Advanced app uses all BazaarCore APIs (shops, inventory, trades, SSU governance) plus the economy-specific APIs defined here.

**Important:** The Advanced app also uses all hooks and TX builders from BazaarCore's FrontendAPI.md for its shop, inventory, trade, and SSU governance features. This document covers only the economy-specific additions.

---

## 1. Hooks (RPC Reads)

### Tribe Token Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useTribeTokenBalance(walletAddress: string, tribeIdx: number)` | `TribeTokenBalance` -- totalValue, objectIds for TX building | App.tsx WalletBar, IntroSequence, TribeHub |
| `useTribeTokens(walletAddress: string, tribeIdx: number)` | `TribeToken[]` -- individual token objects owned by wallet | TribeGovernanceButton CoinTab (burn flow) |

### Exchange Pool Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useExchangePool(tribeIdx: number)` | `TribeExchangePool \| null` -- id, bazReserve, tokenReserve, enabled | ExchangeBeacon, TribeGovernanceButton ExchangeTab |
| `useExchangeRate(tribeIdx: number)` | `ExchangeRate` -- bazPerToken, tokenPerBaz, poolEnabled, reserves | ExchangeBeacon header rate display |

### Tribe Wallet Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useTribeWallet(tribeIdx: number)` | `TribeWalletData \| null` -- taxBalanceBaz, tokenTaxBalance, tokenSupply, tokenBurned | VaultPanel, TribeGovernanceButton CoinTab |
| `useEconomyMetrics(tribeIdx: number)` | `EconomyMetrics` -- circulation, backingRateBaz (derived from TribeWalletData) | VaultPanel stat cards |

### Withdrawal Request Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useWithdrawalRequests(tribeIdx: number)` | `WithdrawalRequest[]` -- all requests with status, signers, expiry | WithdrawalPanel |
| `useWithdrawalConfig(tribeIdx: number)` | `{ requiredSigners: number, totalSigners: number, expiryMs: number }` | WithdrawalPanel create form |

### Tribe Governance Hooks (Advanced-specific)
| Hook | Returns | Used By |
|------|---------|---------|
| `useTribeCaps(walletAddress: string, tribeId: string)` | `{ hasTribeLeaderCap, hasTribeSuperAdminCap, hasTribeAdminCap }` | TribeGovernanceButton |

---

## 2. TX Builders (Write Operations)

### Exchange TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildExchangeBazToToken(tribeIdx, bazAmountMist)` | Tribe index, BAZ amount in raw MIST units | ExchangeBeacon swap (baz-to-token direction) |
| `buildExchangeTokenToBaz(tribeIdx, tokenAmount, tokenObjectIds[])` | Tribe index, token amount, object IDs to consume | ExchangeBeacon swap (token-to-baz direction) |

### Tribe Token TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildMintTribeToken(tribeIdx, amount, recipientAddress)` | Tribe index, mint amount, recipient wallet | TribeGovernanceButton CoinTab mint form |
| `buildBurnTribeToken(tribeIdx, amount, tokenObjectIds[])` | Tribe index, burn amount, owned token object IDs | TribeGovernanceButton CoinTab burn form |

### Vault TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildDepositToVault(tribeIdx, bazAmountMist)` | Tribe index, BAZ amount in MIST | VaultPanel deposit form |
| `buildWithdrawFromVault(tribeIdx, bazAmountMist)` | Tribe index, BAZ amount in MIST | VaultPanel withdraw form |

### Withdrawal Request TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildCreateWithdrawalRequest(tribeIdx, bazAmountMist)` | Tribe index, BAZ amount | WithdrawalPanel create form |
| `buildSignWithdrawalRequest(requestId)` | Request object ID | WithdrawalPanel RequestCard sign button |
| `buildExecuteWithdrawal(requestId)` | Request object ID | WithdrawalPanel RequestCard execute button |

### Exchange Admin TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildToggleExchange(tribeIdx, enabled)` | Tribe index, boolean enable/disable | TribeGovernanceButton ExchangeTab toggle |
| `buildAddLiquidity(tribeIdx, bazAmountMist)` | Tribe index, BAZ amount for liquidity pool | TribeGovernanceButton ExchangeTab add liquidity |

### Tribe Role TX Builders (Advanced governance)
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildSetTribeRoleTax(tribeIdx, roleTaxTable)` | Tribe index, full per-role tax table | TribeGovernanceButton TaxTab |
| `buildGrantTribeRole(tribeIdx, address, role)` | Tribe index, wallet address, role | TribeGovernanceButton RolesTab |
| `buildRevokeTribeRole(tribeIdx, address, role)` | Tribe index, wallet address, role | TribeGovernanceButton RolesTab |

---

## 3. TypeScript Types

All types from `bazaar-frontend/apps/advanced/src/types/index.ts`:

- `TribeToken` -- On-chain token object (id, tribeIdx, value)
- `TribeTokenBalance` -- Aggregated balance (tribeIdx, totalValue, objectIds)
- `TribeExchangePool` -- AMM pool state (id, tribeIdx, bazReserve, tokenReserve, enabled)
- `ExchangeRate` -- Derived rate data (bazPerToken, tokenPerBaz, poolEnabled, reserves)
- `TribeWalletData` -- Tribe wallet shared object (taxBalanceBaz, tokenTaxBalance, tokenSupply, tokenBurned)
- `EconomyMetrics` -- Computed circulation and backing rate
- `WithdrawalRequest` -- Multi-sig request (id, amount, proposer, signers, requiredSigners, timestamps, status)
- `AdvancedUrlParams` -- Parsed URL params (tribeParam, ssuId)
- `AdvancedScreen` -- Navigation screen enum (intro, hub, bazar, trade, inventory, vault, withdrawals, ssu-gov, tribe-gov)

---

## 4. Component-to-API Matrix

### Advanced-Only Components (Economy Layer)

| Component | Hooks Required | TX Builders Required |
|-----------|---------------|---------------------|
| App.tsx | useTribeTokenBalance, useConnection | -- |
| ExchangeBeacon | useExchangePool, useExchangeRate | buildExchangeBazToToken, buildExchangeTokenToBaz |
| VaultPanel | useTribeWallet, useEconomyMetrics | buildDepositToVault, buildWithdrawFromVault |
| WithdrawalPanel | useWithdrawalRequests, useWithdrawalConfig, useConnection | buildCreateWithdrawalRequest, buildSignWithdrawalRequest, buildExecuteWithdrawal |
| TribeGovernanceButton | useTribeCaps | -- (tab container) |
| TribeGovernanceButton/RolesTab | -- | buildGrantTribeRole, buildRevokeTribeRole |
| TribeGovernanceButton/TaxTab | -- | buildSetTribeRoleTax |
| TribeGovernanceButton/CoinTab | useTribeWallet, useTribeTokens | buildMintTribeToken, buildBurnTribeToken |
| TribeGovernanceButton/ExchangeTab | useExchangePool | buildToggleExchange, buildAddLiquidity |
| TribeGovernanceButton/VaultTab | -- (links to VaultPanel) | -- |
| TribeGovernanceButton/WithdrawalsTab | -- (links to WithdrawalPanel) | -- |

### Shared with BazaarCore (see BazaarCore FrontendAPI.md)

The Advanced app also uses these BazaarCore components with identical API requirements:

| Component | BazaarCore Hooks | BazaarCore TX Builders |
|-----------|-----------------|----------------------|
| BazaarView | useShops, useMyShops | buildCreateWTSShop, buildCreateWTBShop, buildCreateDEShop |
| ShopPanel | useItemTypes | buildWTSBuy, buildWTBFill, buildDEExchange |
| InventoryPanel | useInventory, useUnclaimedItems, useStorageStats, useItemTypes | buildClaimUnclaimedItem, buildBatchClaimUnclaimed |
| DirectTradePanel | useTradeProposals, useInventory, useItemTypes | buildCreateTradeProposal, buildAcceptTrade, buildRejectTrade |
| SSUGovernanceButton | useSSUCaps, useSSURoleTaxTable, useSSUGovernanceConfig | buildSetSSURoleTax, buildSetShopSettings, buildSetVolumeLimit, buildGrantSSURole, buildForceCloseShop |
| TribeHub | useTribeMembers, useTribeAnnouncements | -- |
| IntroSequence | -- (pure UI) | -- |

### AMM Formula Reference

The ExchangeBeacon uses constant-product AMM pricing:
- **BAZ to Token:** `token_out = token_reserve - ceil(k / (baz_reserve + baz_in))` minus fee
- **Token to BAZ:** `baz_out = baz_reserve - ceil(k / (token_reserve + token_in))` minus fee
- **Fee:** Configurable in basis points (default 30 bps = 0.3%), deducted from output
- **Constitution XIII.4:** Minting is blocked when `vault_balance <= reserve`
