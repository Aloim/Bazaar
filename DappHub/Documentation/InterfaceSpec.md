# DappHub — Interface Specification

> **Status:** Phase 1 Complete
> **Constitution Reference:** Article II.1 (Documentation Structure)
> **Last Updated:** Constitution v3.1 sweep (2026-04-27 — BAZ coin removed)

---

## Cross-Package Functions Exposed by DappHub

DappHub is the foundation package. All other Bazaar packages depend on it. DappHub itself depends on NO other Bazaar package (Constitution Article I.3).

### Tax Wallet API (called by bazaar_core, bazaar_economy)
- `deposit_dapp_tax(wallet, cap, payment, tx_type, bazaar_type, ssu_id, tribe_id, payer, receiver, gross_amount, ssu_tax, tribe_tax, net_amount, clock)` — Deposit dApp tax from any bazaar type
- Requires `TaxDepositCap` (transferred to bazaar_core after deployment)

### Governance API (called by bazaar_core, bazaar_economy)
- `global_dapp_tax_bps(config)` — Read global dApp tax rate
- `custom_tribe_tax_bps(config, tribe_id)` — Read tribe-specific tax override
- `custom_ssu_tax_bps(config, ssu_id)` — Read SSU-specific tax override
- `set_global_dapp_tax_rate(cap, config, rate_bps)` — Set global dApp tax rate (DApp Owner only)

### Role Types API (imported by all packages)
- `role_stranger()` through `role_owner()` — Role constants (0-7)

### Tribe Registry API (called by bazaar_core, bazaar_economy)
- `tribe_by_id(registry, id)` — Look up tribe by ID
- `tribe_bazaar_type(tribe)` — Get tribe's bazaar type
- `tribe_name(tribe)` — Get tribe's name
- `tribe_ssu_ids(tribe)` — Get tribe's SSU list
- `tribe_leader(tribe)` — Get tribe's leader address
- `tribe_join_policy(tribe)` — Get tribe's join policy
- `tribe_is_active(tribe)` — Check if tribe is active
- `tribe_count(registry)` — Total tribe count

### SSU Registry API (called by bazaar_core, bazaar_economy)
- `is_registered(registry, ssu_id)` — Check SSU registration
- `registration(registry, ssu_id)` — Get SSU registration details
- `ssu_bazaar_type(reg)` — Get SSU's bazaar type
- `ssu_tribe_id(reg)` — Get SSU's tribe ID

### Shared Objects Created at init
- `DAppTaxWallet` — Single tax wallet for all bazaar types
- `GovernanceConfig` — Global dApp settings
- `DAppOwnerClaimBox` — First-come ownership claim
- `TribeRegistry` — Master tribe registry
- `SSURegistry` — Master SSU registry
- `RegistrationRequestQueue` — Pending applications
- `TicketBoard` — Support tickets

See `Documentation/API/CrossPackageAPI.md` for full function signatures.
