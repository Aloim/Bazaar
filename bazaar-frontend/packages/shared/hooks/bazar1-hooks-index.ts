// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/hooks — R2.3 Bazar1 verbatim port re-exports.
 *
 * Extracted from hooks/index.ts to keep that barrel under 500 lines
 * (Constitution Article XII.3). Split performed at R5.3 commit.
 *
 * File limit: 500 lines | Constitution Article XII.3
 */

export { useRoles }                              from "./useRoles";
export { useSSUGovernance }                      from "./useSSUGovernance";
export { useTribeRegistry }                      from "./useTribeRegistry";
export type { TribeInfo }                        from "./useTribeRegistry";
export { useOwnedCaps }                          from "./useOwnedCaps";
export { useWidgetConfig }                       from "./useWidgetConfig";
export { useDAppCaps }                           from "./useDAppCaps";
// V16 sweep B1/B2 (2026-05-13): useDAppWallet + useDAppTreasury DELETED — read
// fictional `DAppTreasury` shared object fields (tax_balance, baz_total_minted,
// baz_total_burned, exchange_fee_bps) that never existed on V15+ chain.
// Canonical replacements:
//   - DAppGovernancePanel Wallet tab → useTaxWallet (DAppTaxWallet shared object)
//   - ExchangeWindow swap fee        → useExchangeConfig.exchangeFeeOverrideBps
//                                       ?? useDAppTaxConfig.globalTaxBps
//                                       (mirrors `tribe_exchange::effective_fee_bps`)
export { useDAppTaxHistory }                     from "./useDAppTaxHistory";
export type { DAppTaxEvent }                     from "./useDAppTaxHistory";
export { useDAppClaimStatus }                    from "./useDAppClaimStatus";
// useTribeCaps canonical in bazaarcore/; useTribeTokenBalance + useTribeVault in bazaareconomy/;
// dropping Bazar1 R2.3 port re-exports here to resolve namespace collision. R5.4-followon.
// useTribeCoins DELETED (OS-29 R6.6.5): tribe_coin type removed in overhaul.
export { useTribeExchange }                      from "./useTribeExchange";
// V16 sweep: useTribeWallet DELETED — read fictional `TribeWallet` struct fields
// (tax_balance_baz, token_supply, token_burned, eve_only, eve_tax_balance) which
// never existed on chain. Canonical replacements: useTribeVault (EVE) +
// useTribeTokenLedger + useTribeTokenBalance(ledgerId, govAddress) (tribe wallet).
// Future: Easy tribes will need their own EVE tribe wallet — design TBD, see legacycode.md.
export { useVaultWithdrawals }                   from "./useVaultWithdrawals";
export { useWtbEscrowPool }                      from "./useWtbEscrowPool";
export { useAnnouncements }                      from "./useAnnouncements";
export { useGuestbook }                          from "./useGuestbook";
export { useFinanceEvents }                      from "./useFinanceEvents";
export { useBalances }                           from "./useBalances";
export { useBanList }                            from "./useBanList";
export { useSSURoleList }                        from "./useSSURoleList";
export { useProposals }                          from "./useProposals";
export { useQuicktradeVault }                    from "./useQuicktradeVault";
export { useRegistrationRequests }               from "./useRegistrationRequests";
// B3 (Post-V16 Session 3): useRoleTaxTable DELETED. SSU tax now read flat from
// useSSUGovernanceConfig.taxConfig; DApp rate from useDAppTaxConfig.globalTaxBps.
export { useTransactionLog }                     from "./useTransactionLog";
export { useMultiplayerRelay }                   from "./useMultiplayerRelay";
export { useSuiQuery }                           from "./useSuiQuery";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
