# Report: Phase 1 — DappHub Frontend Design

## Assignment Details (Injected Context)
> Design the entire DappHub frontend: the foundation and hub application for the Bazaar Infrastructure.
> DappHub is the "lobby" where users register SSUs, create tribes, and manage the dApp.
> Sub-phases: 1A Landing Page, 1B Registration Windows, 1C Tribe Creation Windows,
> 1D Management Windows, 1E DApp Management Panel (6 tabs), 1F FrontendAPI Specification.
> All components follow the Bazar1 (BazaarLight) visual design language.

## Referenced Documents
- `BazaarLight/dapp/frontend/src/App.tsx` — Reference app routing pattern
- `BazaarLight/dapp/frontend/src/components/LandingScreen.tsx` — Reference landing page
- `BazaarLight/dapp/frontend/src/components/BazarWindow.tsx` — Reference modal pattern
- `BazaarLight/dapp/frontend/src/components/DAppMaintenancePanel.tsx` — Reference panel pattern
- `BazaarLight/dapp/frontend/src/index.css` — Reference CSS (design tokens, component styles)
- `BazaarLight/dapp/frontend/src/components/ScanMatrixRain.tsx` — Reference matrix rain
- `BazaarLight/dapp/frontend/src/types.ts` — Reference type definitions
- `MASTER_REFACTOR_PLAN.md` — Phase 1 specifications
- `SacredArchitectureConstitution.md` — File size limits, design rules

## Report Body

### Files Created (20 source files + 2 documentation files)

**Sub-phase 1A: Landing Page**
- `src/App.tsx` (103 lines) — Root router with lazy-loaded screens
- `src/components/LandingPage.tsx` (126 lines) — Hub landing with section buttons
- `src/components/ScanMatrixRain.tsx` (159 lines) — Canvas matrix rain background
- `src/components/WalletBar.tsx` (46 lines) — Top wallet connection bar
- `src/styles/index.css` (418 lines) — Global styles (tokens, layout, buttons, panels)
- `src/styles/components.css` (140 lines) — Component-specific styles (cards, badges, tables)

**Sub-phase 1B: Registration Windows**
- `src/components/windows/NoTribeRegistration.tsx` (179 lines) — SSU ID input, URL generation
- `src/components/windows/JoinTribeWindow.tsx` (160 lines) — Search, tribe list, Register/Apply
- `src/components/windows/ApplicationWindow.tsx` (179 lines) — SSU ID, message, auto-fill wallet

**Sub-phase 1C: Tribe Creation Windows**
- `src/components/windows/EasyBazaarCreation.tsx` (166 lines) — Name+Description form
- `src/components/windows/AdvancedBazaarCreation.tsx` (306 lines) — 3-step wizard

**Sub-phase 1D: Management Windows**
- `src/components/windows/MyRegisteredSSUs.tsx` (172 lines) — NoTribe/Tribe tabs, URLs, status
- `src/components/windows/ContactTicketWindow.tsx` (220 lines) — Title, tags, body, contact

**Sub-phase 1E: DApp Management Panel**
- `src/components/management/DAppManagementPanel.tsx` (69 lines) — 6-tab container
- `src/components/management/TribesTab.tsx` (120 lines) — List/manage tribes
- `src/components/management/SSUsTab.tsx` (124 lines) — List/manage SSUs
- `src/components/management/TaxesFeesTab.tsx` (181 lines) — Tax rate config
- `src/components/management/TaxWalletTab.tsx` (140 lines) — Balance/withdraw
- `src/components/management/CoinTab.tsx` (189 lines) — BAZ mint/burn
- `src/components/management/TicketsTab.tsx` (199 lines) — Ticket management

**Sub-phase 1F: FrontendAPI Specification**
- `Documentation/FrontendAPI.md` — 10 hooks, 12 TX builders, 10 types, constants
- `Documentation/InterfaceSpec.md` — Cross-package interfaces, URL patterns, events

**Supporting files**
- `src/types/index.ts` (100 lines) — DappHub-specific TypeScript types

### Design Decisions

1. **No HAL 9000 intro** — DappHub is a utility hub, not an SSU marketplace landing.
   The matrix rain background provides the sci-fi aesthetic without the gate sequence.

2. **Lazy loading** — All floating windows and management tabs are lazy-loaded via
   `React.lazy()` to minimize initial bundle size. Only the landing page loads eagerly.

3. **Modal overlay pattern** — All floating windows use the Bazar1 `.modal-overlay` +
   `.modal` pattern. Clicking the backdrop closes the window.

4. **Mock data hooks** — All management tabs use inline mock data functions that mirror
   the real hook API signatures. These are ready to be swapped for real `@bazaar/shared`
   hooks when the Move contracts are ready.

5. **CSS split** — Global styles (418 lines) and component styles (140 lines) are in
   separate files, both under the 500-line Constitution limit.

6. **URL routing** — DappHub generates URLs per the monorepo spec:
   - NoTribe: `/notribe/?ssuId=<id>`
   - Easy: `/easy/?tribe=<id>&ssuId=<id>`
   - Advanced: `/advanced/?tribe=<id>&ssuId=<id>`

### Compliance

- All 20 source files are under 500 lines (max: 306 lines in AdvancedBazaarCreation.tsx)
- CSS variables match Bazar1 exactly: `--accent: #cc7000`, `--font: 'Favorit'`
- Same class naming patterns as reference: `.btn--primary`, `.modal-overlay`, `.panel__tabs`
- All code written from scratch — no copy-paste from BazaarLight
- DappHub depends only on `@bazaar/shared` (no `@bazaar/widgets`)

### Known TODO Items

Each component contains `// TODO:` markers where TX builders and hooks need to be wired.
These will be resolved in Phase 3 (DappHub Move + Frontend Wiring) when the Move contracts
are designed by the move-architect agent.

## Next Step

Send to `system-design-critic` for architecture review. After approval, the frontend-specialist
can refine any component details, and the move-architect can begin designing the Move contracts
specified in `FrontendAPI.md`.
