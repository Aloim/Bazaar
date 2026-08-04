// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/tx/bazaar_economy — Barrel re-export for all BazaarEconomy TX builders.
 * Phase R2.3: Bazar1 verbatim port + 4-package redistribution.
 *
 * R5.4 cleanup: governance-tx (deleted ghost), tribe-vault-tx (deleted ghost),
 * exchange-tx (deleted ghost) removed from barrel.
 * Canonical equivalents: bazaareconomy/exchange-tx.ts, bazaareconomy/vault-tx.ts.
 *
 * V16 sweep (2026-05-13 Bazar1 dead-code):
 *   - `vault-withdrawal-tx` + `tribe-token-tx` files deleted at Session-C
 *     (canonical builders live in tx/bazaareconomy/withdrawal-tx.ts; mint/burn
 *     shape moved to tx/bazaareconomy/mint-burn-queue-tx.ts).
 *   - `buildAddLiquidityAsLeader` removed from `tribe-tax-tx`; use
 *     tx/bazaareconomy/governance-tx::buildAddLiquidity instead.
 *
 * V16 sweep B4 (2026-05-13 PostV16 Session 1):
 *   - `tribe-tax-tx.ts` DELETED entirely. 15 of 16 builders had ZERO callers
 *     (Bazar1-era `tribe_registry::*` Move targets that don't exist in the
 *     current 4-package Move codebase). The 1 live caller —
 *     `buildSetJoinPolicyAsLeader` from TribeSettingsSection — had a latent
 *     package-routing bug (targeted ${PACKAGE_ID}::registration_helpers
 *     where PACKAGE_ID is BAZAAR_CORE, but the Move module lives in DappHub).
 *     Relocated + corrected to tx/dapp_hub/registration-helpers-tx.ts.
 *     `buildJoinTribeOpen` came along for the ride (zero callers but rounds
 *     out the helper-module surface).
 *
 * This barrel is now empty. The file is retained for potential future
 * BazaarEconomy-specific builders that don't fit into the existing
 * tx/bazaareconomy/ canonical files.
 */

export {};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
