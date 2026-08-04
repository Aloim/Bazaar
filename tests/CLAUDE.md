IMPORTANT: Critical Insights and Instructions related to the contents of this folder MUST be documented below.
Ensure your information or instruction is accurate, you must never poison context here or elsewhere. No Hallucinations or Invention.
If you discover and confirm poisoned context you must remove it from here so it does not mislead other agents.
Language must be folder-specific, unambiguous, and kept current by agents.
The instructions and knowledge below are not mandates, treat them as guidance only.
---

## tests — Cross-Package Integration Test Suite

This directory is a dedicated Sui Move test package that depends on all 4 Bazaar packages for cross-package integration testing.

### Structure
- `sources/test_helpers.move` — Shared test utilities (make_admin_with_cap, etc.)
- `sources/test_dapphub_registration.move` — 6 tests: DappHub registration scenarios (Articles VI)
- `sources/test_advanced_tribe_setup.move` — 7 tests: Advanced tribe setup (Article XIII, SA-004)
- `sources/test_tax_deposits.move` — 7 tests: Cross-package tax deposit correctness (Articles IV, VIII)
- `sources/test_token_ledger_isolation.move` — 6 tests: Token ledger isolation (Article V, SA-002/003)
- `sources/test_widget_integration.move` — 5 tests: Widget authorization (Article VII.1)
- `sources/test_version_compat.move` — 8 tests: Version compatibility (Article VI)

### Test Status
- **39 integration tests** — ALL PASSING
- Combined with 57 per-package unit tests = **96/96 total tests passing** (Phase 7 complete)

### Key Patterns
- Tests use `#[test_only]` factory wrappers from the source packages to access `public(package)` functions
- No mocks — all tests use real Sui Move objects and scenarios
- Tax tests verify integer arithmetic: `gross * bps / 10000`
- SDC-001 pattern: `close_shop_for_testing` inlines close logic to avoid dynamic object field dual-borrow conflict
