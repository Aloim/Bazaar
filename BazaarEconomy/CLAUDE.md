IMPORTANT: Critical Insights and Instructions related to the contents of this folder MUST be documented below.
Ensure your information or instruction is accurate, you must never poison context here or elsewhere. No Hallucinations or Invention.
If you discover and confirm poisoned context you must remove it from here so it does not mislead other agents.
Language must be folder-specific, unambiguous, and kept current by agents.
The instructions and knowledge below are not mandates, treat them as guidance only.
---

## BazaarEconomy Package — Advanced Tribe Economy

**Package name:** `bazaar_economy`
**Role:** Economy extension for Advanced tribes ONLY. TribeTokenLedger, vault, exchange, multi-sig withdrawal.
**Deployed:** FOURTH (leaf package — depends on all others).
**Size target:** ~35 KB bytecode (80 KB limit).
**Dependencies:** `sui`, `world`, `dapp_hub`, `bazaar_core`, `shared_widgets`, `EVE` (EveCoinTypeStub — compile-time type binding, never published).
**Frontend:** Part of `advanced.bazaar.app`.

### Key Rules
- TribeToken is an INTERNAL LEDGER (`Table<address, u64>`), NOT `Coin<T>`.
- No real coins in wallets for tribe tokens — balances are numbers in a table.
- DApp tax is charged ONLY on the EVE side of the exchange, NOT on internal ledger purchases.
- Uses `TribeTokenShopCap` from bazaar_core for Advanced shop operations.
- See `INFRASTRUCTURE_PLAN.md` for full module specifications.

### Move Modules
- `tribe_token_ledger.move` — TribeTokenLedger, mint/burn/transfer/debit/credit
- `tribe_vault.move` — Per-tribe EVE vault (Coin<SUI> treasury)
- `tribe_exchange.move` — TribeToken <-> EVE swap (AMM or fixed rate)
- `vault_withdrawal.move` — Multi-sig withdrawal requests with 24h wait
- `economy_governance.move` — Mint/burn controls, inflation, exchange management
- `ledger_shop_ops.move` — Ledger-based shop purchases (debit/credit, no Coin)
