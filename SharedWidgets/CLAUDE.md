IMPORTANT: Critical Insights and Instructions related to the contents of this folder MUST be documented below.
Ensure your information or instruction is accurate, you must never poison context here or elsewhere. No Hallucinations or Invention.
If you discover and confirm poisoned context you must remove it from here so it does not mislead other agents.
Language must be folder-specific, unambiguous, and kept current by agents.
The instructions and knowledge below are not mandates, treat them as guidance only.
---

## SharedWidgets Package — Standalone Social Modules

**Package name:** `shared_widgets`
**Role:** Reusable widget modules (announcements, guestbook, mission board, donate, widget config).
**Deployed:** SECOND (standalone, parallel with dapp_hub OK).
**Size target:** ~19 KB bytecode (25 KB limit).
**Dependencies:** `sui`, `EVE` (EveCoinTypeStub — compile-time type binding, never published). No Bazaar package dependencies.
**Frontend:** `@bazaar/widgets` npm workspace package (imported by all bazaar apps).

### Key Rules
- Role-AGNOSTIC and governance-UNAWARE. Authority checks happen in the calling bazaar package.
- Widget objects are per-SSU, ensuring data isolation between tribes/SSUs.
- No shared objects at init — all objects created dynamically per-SSU.
- Uses `additive` upgrade policy — never modify existing struct layouts.
- See `INFRASTRUCTURE_PLAN.md` for full module specifications.
