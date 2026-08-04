# Report: Phase 0 Frontend Monorepo Setup

## Assignment Details (Injected Context)
> Set up the frontend monorepo structure as defined in MASTER_REFACTOR_PLAN.md (Section: Frontend Architecture Detail / Monorepo Structure). Create the complete directory tree under `bazaar-frontend/` with npm workspaces, TypeScript composite project references, Vite+React app scaffolds for all 4 apps, and placeholder index files for both shared packages.

## Referenced Documents
- `MASTER_REFACTOR_PLAN.md` (lines 248-270: Monorepo Structure)
- `SacredArchitectureConstitution.md` (Article XII: No copy-paste, 500-line limit)
- `BazaarLight/dapp/frontend/` (reference codebase for patterns: package.json, tsconfig.json, vite.config.ts, index.html, main.tsx)

## Report Body

### Structure Created (44 files)

**Root configuration (2 files)**
- `package.json` — npm workspaces pointing to `packages/*` and `apps/*`, with dev/build scripts for each app
- `tsconfig.json` — composite project references to all 6 sub-projects (2 packages + 4 apps)

**@bazaar/shared (11 files)**
- `package.json` — subpath exports for hooks, tx, types, constants, utils, components, contexts, css
- `tsconfig.json` — extends root, includes all .ts/.tsx
- `index.ts` — barrel re-export from all submodules
- 7 subdirectory `index.ts` placeholders (hooks, tx, types, constants, utils, components, contexts) + 1 CSS placeholder

**@bazaar/widgets (7 files)**
- `package.json` — depends on @bazaar/shared, subpath exports for components, hooks, tx, css
- `tsconfig.json` — extends root, references @bazaar/shared
- `index.ts` — barrel re-export
- 3 subdirectory `index.ts` placeholders (components, hooks, tx) + 1 CSS placeholder

**4 app scaffolds (6 files each = 24 files total)**
Each app (dapphub, notribe, easy, advanced) contains:
- `package.json` — correct dependencies (dapphub depends on shared only; others depend on shared + widgets)
- `tsconfig.json` — extends root, references the packages it depends on
- `vite.config.ts` — React plugin, process.env polyfill, es2022 target, manual vendor chunks
- `index.html` — Bazar1 loading screen pattern (black bg, #cc7000 text, Favorit font)
- `src/main.tsx` — EveFrontierProvider + QueryClient setup (matches BazaarLight pattern)
- `src/App.tsx` — Placeholder with JSDoc describing the app's purpose, URL routing, and feature set

**godot/ directory**
- `.gitkeep` — placeholder for Godot game client integration

### Design Decisions

1. **DappHub does not depend on @bazaar/widgets** — DappHub is the hub/registration site, not a marketplace. It has no announcement boards or guestbooks.
2. **@bazaar/shared uses subpath exports** — Enables tree-shaking via `@bazaar/shared/hooks` instead of pulling the entire barrel.
3. **@bazaar/widgets depends on @bazaar/shared** — Widgets need shared types, constants, and hooks.
4. **Vite config matches BazaarLight patterns** — Same manual chunk strategy (vendor-react, vendor-sui-tx, vendor-rq), same process.env polyfill, same es2022 target.
5. **All packages are `private: true`** — These are workspace-internal packages, not published to npm.
6. **Peer dependencies on shared packages** — React, @mysten/sui, and @tanstack/react-query are peer deps to avoid version conflicts.
7. **types/index.ts seeds BazaarType and GovernanceLevel** — Core discriminator types that will be used across all apps.
8. **utils/index.ts seeds truncateAddress and formatSui** — Common utility functions extracted from BazaarLight patterns.

### What This Does NOT Include (by design)
- No `npm install` execution (user should run this when ready)
- No intro sequence implementation (Phase 1-2 work)
- No actual component/hook/TX builder code (Phase 1-6 work)
- No Brotli compression plugin (added per-app during deployment prep)
- No CSS files with actual styles (Phase 1-2 work)

## Next Step
This completes the Phase 0 frontend monorepo scaffolding. The next step is Phase 1: DappHub Frontend Design, which should be handled by the `frontend-architect` agent through the `design-review.yml` workflow.
