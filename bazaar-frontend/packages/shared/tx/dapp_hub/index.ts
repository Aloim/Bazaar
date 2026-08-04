// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/tx/dapp_hub — Temporary barrel: auto-register helpers only.
 * R4.2 cleanup: admin-tx, dapp-links-tx, dapp-tax-tx, registration-tx,
 * tribe-registry-tx, tribe-staff-tx were all deleted (ghost Bazar1 monolith targets).
 * auto-register-tx survives temporarily; it relocates to tx/bazaar_core/ in R4.3.
 * Frozen DappHub TX builders remain in tx/index.ts (root barrel), not here.
 */
export * from "./auto-register-tx";
export * from "./governance-tx";
export * from "./dapp-tax-tx";
export * from "./tribe-registry-tx";
// V16 sweep B4 (2026-05-13): relocated buildSetJoinPolicyAsLeader + buildJoinTribeOpen
// from retired tx/bazaar_economy/tribe-tax-tx.ts with corrected DappHub package routing.
export * from "./registration-helpers-tx";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
