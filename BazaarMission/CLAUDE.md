IMPORTANT: Critical Insights and Instructions related to the contents of this module MUST be documented below.
Ensure your information or instruction is accurate, you must never poison context here or elsewhere. No Hallucinations or Invention.
If you discover and confirm poisoned context you must remove it from here so it does not mislead other agents.
Language must be module-specific, unambiguous, and kept current by agents.
The instructions and knowledge below are not mandates, treat them as guidance only.
---

## BazaarMission — `bazaar_mission` Move package

Created at the 2026-07-10 Phanes v2.1.1 migration (this module previously lacked a CLAUDE.md).

- **Origin:** carved out of `bazaar_core` at V33 when core hit Sui's 102,400-byte published-object
  limit, and again at V35 (second carve: TradeRegistry + trade/proxy/widget/lifecycle/stranger
  modules moved here). `mission_fees` deliberately STAYS in `bazaar_core`.
- **Type-filter anchor (Sweep H):** trade events anchor `BAZAAR_MISSION_ORIGINAL_PACKAGE_ID` —
  struct identity survives upgrades; never filter on the rotating package id.
- **Domain:** Mission (MIS) shop type — escrowed reward × runs, item-proof / giver-confirmed
  completion, per-hour listing fees, collateral, taker self-cancel, role-gated visibility,
  admin force-close; plus the trade-registry hot path carved from core.
- **Size watch:** this package exists because of core's size ceiling — size ANY growth with the
  publish dry-run (object ≈ .mv × ~1.08), and prefer hardened-callee patterns over widenings.
