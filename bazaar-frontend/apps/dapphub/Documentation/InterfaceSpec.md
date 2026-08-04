# DappHub Interface Specification

> Defines the cross-package functions that DappHub exposes or consumes.

## Overview

DappHub is the central hub of the Bazaar Infrastructure. It is the entry point
for all users and provides tribe management, SSU registration, and DApp
administration. It operates independently from the marketplace apps (NoTribe,
Easy, Advanced) and does not render any trading UI.

## Exposed Interfaces (consumed by other apps)

### URL Generation

DappHub generates marketplace URLs for registered SSUs:

| Target App | URL Pattern | Example |
|-----------|-------------|---------|
| NoTribe | `{origin}/notribe/?ssuId={ssuId}` | `/notribe/?ssuId=0x1234...cdef` |
| Easy | `{origin}/easy/?tribe={tribeId}&ssuId={ssuId}` | `/easy/?tribe=0x001&ssuId=0x1234` |
| Advanced | `{origin}/advanced/?tribe={tribeId}&ssuId={ssuId}` | `/advanced/?tribe=0x001&ssuId=0x1234` |

### Tribe Registry (on-chain shared object)

DappHub writes to the tribe registry, which other apps read:

- `TribeRegistry` — Shared object containing all tribe definitions
- `SSURegistry` — Shared object mapping SSU IDs to tribes
- `DAppConfig` — Shared object with global DApp settings

### Events Emitted

| Event | When | Consumer |
|-------|------|----------|
| `TribeCreated` | createTribeEasy/createTribeAdvanced | All apps |
| `SSURegistered` | registerSSU/registerSSUToTribe | Target marketplace app |
| `TaxConfigUpdated` | updateDAppTaxConfig | All marketplace apps |
| `TribeFrozen` | freezeTribe | Marketplace apps filter frozen tribes |
| `TribeUnfrozen` | unfreezeTribe | Marketplace apps re-enable tribe |

## Consumed Interfaces (from @bazaar/shared)

| Interface | Source | Purpose |
|-----------|--------|---------|
| `useConnection` | `@evefrontier/dapp-kit` | Wallet connection state |
| `EveFrontierProvider` | `@evefrontier/dapp-kit` | App-level provider |
| `QueryClient` | `@tanstack/react-query` | Data fetching |

## Dependencies

- `@bazaar/shared` — Types, constants, hooks, TX builders
- `@evefrontier/dapp-kit` — Wallet, connection, Sui RPC
- `@tanstack/react-query` — Data fetching and caching
- `react`, `react-dom` — UI framework

DappHub does NOT depend on `@bazaar/widgets` (social components are
not needed in the hub application).
