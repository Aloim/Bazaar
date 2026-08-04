Test tree for this project.

MERGE NOTE (2026-07-10 Phanes v2.1.1 migration): this root `tests/` directory is a REAL MOVE
PACKAGE (Move.toml, sources/, integration/, build/) that predates the v2 scaffold — its contents
are project property and were not restructured. Move-idiom adaptation of the standard layout:

Layout (as adapted for Move):
- sources/       — the test package's Move modules (unit-style tests are co-located per package
                   in each package's own sources/tests, Move-idiomatically; not moved here).
- integration/   — cross-package integration scenarios using real structures (no mock-only suites).
- build/         — Move build output (generated).
- e2e/, fixtures/, helpers/ — SKIPPED at migration (empty dirs untracked by git; Move idiom keeps
                   fixtures in-module). Create via `phanes new-file tests <path> "<description>"`
                   when first needed.

Conventions:
- New tests are created via `phanes new-file tests <path> "<description>"` (same header stamp rule as src/).
- TDD workflow: write failing test → commit → implement → commit (see CLAUDE.md workflows).
- Integration tests for storage/escrow-touching code MUST hit real structures, not mocks.
- Test files mirror the module path of the code under test so navigation is mechanical.
- FE tests live with the FE monorepo (vitest, `bazaar-frontend/`), not here.

Single writer per test file: the agent that authored the test owns subsequent edits unless handed
off via the standard review flow.
