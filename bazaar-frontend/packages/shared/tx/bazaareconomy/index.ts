// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/tx/bazaareconomy — Barrel re-export for all BazaarEconomy TX builders.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

export * from "./exchange-tx";
export * from "./withdrawal-tx";
export * from "./governance-tx";
export * from "./ledger-shop-tx";
export * from "./vault-tx";
export * from "./ledger-tx";
export * from "./mint-burn-queue-tx";  // V16: replaces retired economy_governance mint_supply/burn_tokens
export * from "./wtb-pool-tx";          // V21: Advanced WTB tribe-token escrow pool (bootstrap + create + refund)
export * from "./ssu-economy-init-tx";  // V27 Wave 2: per-SSU init_ssu_economy
export * from "./mission-ledger-tx";    // Mission (MIS) Advanced tribe-token twin builders

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
