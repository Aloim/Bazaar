IMPORTANT: Critical Insights and Instructions related to the contents of this module MUST be documented below.
Ensure your information or instruction is accurate, you must never poison context here or elsewhere. No Hallucinations or Invention.
If you discover and confirm poisoned context you must remove it from here so it does not mislead other agents.
Language must be module-specific, unambiguous, and kept current by agents.
The instructions and knowledge below are not mandates, treat them as guidance only.
---

## BazaarShopOps — `bazaar_shop_ops` Move package (6th package, newest)

Created at the 2026-07-10 Phanes v2.1.1 migration (this module previously lacked a CLAUDE.md).

- **Origin:** carved out of `bazaar_core` at V38 (2026-06-25) after core re-broke the size limit
  (`MovePackageTooBig 104333 > 102400`). Holds 7 shop-op modules — the trade / force-close /
  admin-drain hot path.
- **Security shape:** all entries sit behind a `ShopOpsCap`-gated `shop_ops_guarded` wrapper layer
  (hardened-callee pattern — chosen over signature widenings). The `ShopOpsCap` is minted and
  routed into the `ShopOpsCapStore` in cascade PTB#1; every FE entry moved here gained a
  `cap_store: &ShopOpsCapStore` argument.
- **Gas:** the guarded-wrapper layer is ZERO-COST per the V38 gas review (memory
  `reference_gas_review_v38`).
- **Fresh-publish note:** owner-manifest scheme — `Published.toml` holds published-at (Move.lock
  does NOT); delete it + set addr `0x0` to force a fresh publish.
