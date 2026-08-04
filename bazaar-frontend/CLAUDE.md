IMPORTANT: Critical Insights and Instructions related to the contents of this folder MUST be documented below.
Ensure your information or instruction is accurate, you must never poison context here or elsewhere. No Hallucinations or Invention.
If you discover and confirm poisoned context you must remove it from here so it does not mislead other agents.
Language must be folder-specific, unambiguous, and kept current by agents.
The instructions and knowledge below are not mandates, treat them as guidance only.
---

## bazaar-frontend — React/TypeScript Monorepo

This directory contains the complete frontend for the Bazaar marketplace, structured as an npm workspace monorepo.

### Structure
- `apps/dapphub/` — DappHub admin panel (tribe management, SSU registration, tax wallets)
- `apps/notribe/` — NoTribe bazaar (no tribe affiliation, WTS/WTB/DE shops)
- `apps/easy/` — Easy bazaar (tribe-affiliated, simplified governance)
- `apps/advanced/` — Advanced bazaar (full economy: token ledger, exchange, vault)
- `packages/shared/` — @bazaar/shared (hooks, TX builders, types, constants)
- `packages/widgets/` — @bazaar/widgets (social components: announcements, guestbook, donations)

### Tech Stack
- React 18.3, TypeScript 5.5, Vite 5.4
- @mysten/sui for Sui blockchain interaction
- @evefrontier/dapp-kit for EVE Frontier integration
- @tanstack/react-query for data fetching

### Build & Dev
- `npm run dev:dapphub` — Dev server for DappHub (port 5173)
- `npm run dev:notribe` — Dev server for NoTribe (port 5174)
- `npm run dev:easy` — Dev server for Easy (port 5175)
- `npm run dev:advanced` — Dev server for Advanced (port 5176)
- `npm run build:all` — Build all 4 apps for production

### Key Patterns
- TX builders in `packages/shared/tx/` bridge frontend to Move contracts
- Hooks in `packages/shared/hooks/` handle Sui RPC data fetching
- Each app has its own Vite config with shared vendor chunk splitting
- Shared packages use `composite: true` for TypeScript project references
- App build scripts use `vite build` only (no tsc step — Vite handles transpilation)

### Code Governance
- All files subject to 500-line limit (Constitution Article XII.3)
- Frontend designed FIRST (Constitution Article II.1)
- Visual design matches existing Bazar1 frontend styling
