IMPORTANT: Critical Insights and Instructions related to the contents of this folder MUST be documented below.
Ensure your information or instruction is accurate, you must never poison context here or elsewhere. No Hallucinations or Invention.
If you discover and confirm poisoned context you must remove it from here so it does not mislead other agents.
Language must be folder-specific, unambiguous, and kept current by agents.
The instructions and knowledge below are not mandates, treat them as guidance only.
---

## BazaarCore Package — Unified Marketplace

**Package name:** `bazaar_core`
**Role:** Shared marketplace for ALL three bazaar types (NoTribe, Easy, Advanced). One codebase, three frontends.
**Deployed:** THIRD (after dapp_hub and shared_widgets).
**Size:** ~97 KB published object (hard limit 102,400 B; soft target 98 KB) — size-critical since the V33/V35 splits; new code goes to bazaar_mission / bazaar_economy / dapp_hub unless core is unavoidable.
**Dependencies:** `sui`, `world`, `dapp_hub`, `shared_widgets`, `EVE` (EveCoinTypeStub — compile-time type binding, never published).
**Frontend:** Three standalone Vite apps via `@bazaar/shared` workspace.

### Key Rules
- Uses `bazaar_type` field (0=NoTribe, 1=Easy, 2=Advanced) to distinguish paths.
- Tax layers: NoTribe=2-layer (SSU+dApp), Easy=3-layer (SSU+Tribe+dApp), Advanced=defers to bazaar_economy.
- Holds `TaxDepositCap` (received from dapp_hub) for depositing dApp taxes.
- Issues `TribeTokenShopCap` to bazaar_economy for Advanced shop operations.
- See `INFRASTRUCTURE_PLAN.md` for full module specifications.

### Move Modules (key ones — full census in SystemsAuditPlan/ArchitectureSnapshot.md §1)
- `bazar.move` — BazarRegistry, Shop struct (`escrowed_eve` = live WTB/FREE custody)
- `shop_ops_wts.move` / `shop_ops_wtb.move` / `shop_ops_de.move` — trade entries per flow; `shop_ops.move` is a legacy wrapper still LIVE via 3 `ledger_shop_ops` cross-package callers (audit AUD-NT-15: only `add_listing_quantity` is dead)
- `membership.move` — MemberRegistry, role management
- `ssu_governance.move` — Per-SSU governance (caps, tax, bans, widgets)
- `tribe_governance.move` — Per-tribe base governance (caps, tax, bans, roles)
- `wtb_escrow_pool.move` — DEPRECATED for trade since V13 (retained for ceremony drain/residual rescue — LEAD-04)
- NOTE: `trade.move` (direct trade) moved to **bazaar_mission** at the V35 size split, along with announcement_proxy/widget_governance/ssu_lifecycle/stranger_registration
