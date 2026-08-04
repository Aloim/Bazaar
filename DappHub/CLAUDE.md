IMPORTANT: Critical Insights and Instructions related to the contents of this folder MUST be documented below.
Ensure your information or instruction is accurate, you must never poison context here or elsewhere. No Hallucinations or Invention.
If you discover and confirm poisoned context you must remove it from here so it does not mislead other agents.
Language must be folder-specific, unambiguous, and kept current by agents.
The instructions and knowledge below are not mandates, treat them as guidance only.
---

## DappHub Package — Foundation + Hub

**Package name:** `dapp_hub`
**Role:** Foundation layer (DApp tax wallet, governance, role types) AND hub layer (tribe registry, SSU registry, registration, tickets).
**Deployed:** FIRST — all other Bazaar packages depend on this.
**Size target:** ~55 KB bytecode (80 KB limit).
**Frontend:** Standalone Vite app at `dapphub.bazaar.app`.
**Currency:** EVE (`Coin<EVE>`) only. No BAZ coin (Constitution v3.1 retired BAZ). Advanced-tribe fantasy currency lives in `bazaar_economy::tribe_token_ledger`, not here.
**Dependencies:** `sui`, `EVE` (EveCoinTypeStub — compile-time type binding, never published).

### Key Rules
- DappHub calls NO other Bazaar package. Dependencies flow one way only.
- Uses `additive` upgrade policy — existing signatures NEVER change.
- `DAppTaxWallet` is the single collection point for ALL dApp taxes.
- `TaxDepositCap` is created here, transferred to bazaar_core after deployment.
- See `INFRASTRUCTURE_PLAN.md` for full module specifications.
- See `Documentation/API/CrossPackageAPI.md` for cross-package API contracts.

### Move Modules (Foundation)
- `dapp_governance.move` — DAppOwnerCap, GovernanceConfig, tax rate management
- `tax_wallet.move` — DAppTaxWallet, deposit/withdraw, TaxDepositEvent
- `role_types.move` — Shared role constants (0-7), TaxConfig struct

### Move Modules (Hub)
- `tribe_registry.move` — TribeRegistry, tribe creation, TribeLeaderCap
- `ssu_registry.move` — SSURegistry, SSU registration
- `registration.move` — RegistrationRequestQueue, application flow
- `tickets.move` — TicketBoard, support ticket system
