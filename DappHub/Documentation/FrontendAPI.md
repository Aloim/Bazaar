# DappHub — Frontend API Specification

> **Status:** Phase 1 Complete
> **Last Updated:** Constitution v3.1 sweep (2026-04-27 — BAZ coin removed; fantasy coin in bazaar_economy::tribe_token_ledger is unrelated and unaffected)

---

## Overview

This document defines what the DappHub frontend needs from the Move contracts. Derived from the Phase 1 UI component design (21 source files in `bazaar-frontend/apps/dapphub/src/`).

---

## 1. Hooks (RPC Reads)

### Tribe Registry Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useTribes()` | `TribeSummary[]` — all registered tribes with name, member count, SSU count, bazaar type, join policy | JoinTribeWindow, TribesTab |
| `useTribeById(id: string)` | `TribeSummary \| null` | ApplicationWindow |
| `useTribeSearch(query: string)` | `TribeSummary[]` — filtered tribes matching search | JoinTribeWindow |

### SSU Registry Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useMySSUs(walletAddress: string)` | `RegisteredSSU[]` — SSUs owned by the connected wallet | MyRegisteredSSUs |
| `useAllSSUs()` | `SSUSummary[]` — all SSUs with status | SSUsTab (management) |
| `useSSUStatus(ssuId: string)` | `{ status, tribeId, bazaarType }` | NoTribeRegistration (post-register) |

### Governance Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useDAppTaxConfig()` | `DAppTaxConfig` — current WTS/WTB/DE/trade tax rates in BPS | TaxesFeesTab |
| `useDAppOwner()` | `{ address: string, isCurrent: boolean }` | App.tsx (isDappOwner check) |

### Tax Wallet Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useTaxWallet()` | `TaxWalletData` — balance, totalCollected, totalWithdrawn | TaxWalletTab |
| `useTaxTransactionLog()` | `TaxDepositEvent[]` — recent deposits | TaxWalletTab |

### Ticket Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useTickets()` | `SupportTicket[]` — all tickets | TicketsTab |
| `useMyTickets(walletAddress: string)` | `SupportTicket[]` — tickets by the user | ContactTicketWindow |

### Application Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `usePendingApplications()` | `TribeApplication[]` — pending applications | TribesTab |

---

## 2. TX Builders (Write Operations)

### Registration TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildRegisterNoTribeSSU(ssuId: string)` | SSU address | NoTribeRegistration |
| `buildApplyToTribe(ssuId: string, tribeId: string, message: string)` | SSU, tribe, message | ApplicationWindow |
| `buildAcceptApplication(applicationId: string)` | Application ID | TribesTab |
| `buildRejectApplication(applicationId: string)` | Application ID | TribesTab |

### Tribe Creation TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildCreateEasyTribe(name: string, description: string)` | Name, description | EasyBazaarCreation |
| `buildCreateAdvancedTribe(name: string, description: string, tokenName: string, tokenSymbol: string)` | Name, desc, token info | AdvancedBazaarCreation |

### Governance TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildSetDAppTaxRate(rateType: string, rateBps: number)` | Rate type + BPS value | TaxesFeesTab |
| `buildWithdrawDAppTax(amount: number)` | Amount in raw units | TaxWalletTab |

### Ticket TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildSubmitTicket(title: string, tag: string, body: string, contactMethod: string, contactValue: string)` | Ticket fields | ContactTicketWindow |
| `buildUpdateTicketStatus(ticketId: string, status: string)` | Ticket ID, new status | TicketsTab |

### Tribe Management TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildDeactivateTribe(tribeId: string)` | Tribe ID | TribesTab |
| `buildRemoveSSU(ssuId: string)` | SSU ID | SSUsTab |

---

## 3. TypeScript Types

All DappHub-specific types are in `bazaar-frontend/apps/dapphub/src/types/index.ts`:

- `DappHubScreen` — Navigation screen enum
- `TribeSummary` — Tribe listing data
- `RegisteredSSU` — User's SSU registration record
- `TribeApplication` — Application to join a tribe
- `SupportTicket` — Support ticket data
- `TicketTag` — Ticket tag enum
- `ManagementTab` — Management panel tab enum
- `DAppTaxConfig` — Tax rate configuration
- `TaxWalletData` — Tax wallet balance/stats

---

## 4. Component-to-API Matrix

| Component | Hooks Required | TX Builders Required |
|-----------|---------------|---------------------|
| LandingPage | useDAppOwner | — |
| NoTribeRegistration | useSSUStatus | buildRegisterNoTribeSSU |
| JoinTribeWindow | useTribes, useTribeSearch | — (navigates to ApplicationWindow) |
| ApplicationWindow | useTribeById | buildApplyToTribe |
| EasyBazaarCreation | — | buildCreateEasyTribe |
| AdvancedBazaarCreation | — | buildCreateAdvancedTribe |
| MyRegisteredSSUs | useMySSUs | — |
| ContactTicketWindow | — | buildSubmitTicket |
| DAppManagementPanel | — | — (tab container) |
| TribesTab | useTribes, usePendingApplications | buildAcceptApplication, buildRejectApplication, buildDeactivateTribe |
| SSUsTab | useAllSSUs | buildRemoveSSU |
| TaxesFeesTab | useDAppTaxConfig | buildSetDAppTaxRate |
| TaxWalletTab | useTaxWallet, useTaxTransactionLog | buildWithdrawDAppTax |
| TicketsTab | useTickets | buildUpdateTicketStatus |
