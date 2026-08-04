// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useTribeTokenSymbol — EconomyFixplan Phase 12 full implementation.
// Chain: tribeId (number) → useTribeEconomyObjects (needs string) → ledgerId → useTribeTokenLedger.

/**
 * useTribeTokenSymbol — returns the on-chain token symbol for a tribe's token ledger.
 *
 * Resolution chain:
 *   1. Coerce tribeId (number | null | undefined) → string | null for useTribeEconomyObjects.
 *   2. useTribeEconomyObjects(tribeIdStr) → { data: { ledgerId } }.
 *   3. useTribeTokenLedger(ledgerId) → { data: { tokenSymbol } }.
 *
 * isLoading: true while EITHER upstream query is loading.
 * symbol: null until both resolve, then the on-chain token_symbol string.
 *
 * Consumers:
 *   - CreateShopModal/index.tsx: displayCurrency (Advanced) — Phase 7 call site, auto-resolves
 *   - GodotGameWrapper: currencyName on ExchangeWindow + FinanceNewsPanel — Phase 11/12
 *   - Coin sub-tab header (CoinSubTab.tsx) — Phase 9
 *   - Advanced ClaimBoxProvider seeding via useClaimBox opts — Phase 12
 */

import { useTribeEconomyObjects } from "./economy-resolution-hooks";
import { useTribeTokenLedger } from "./ledger-hooks";

export interface TribeTokenSymbolResult {
  symbol: string | null;
  isLoading: boolean;
}

export function useTribeTokenSymbol(
  tribeId: number | null | undefined,
): TribeTokenSymbolResult {
  // Coerce number → string | null (useTribeEconomyObjects expects string | null).
  // tribeId === 0 is treated as "no tribe" — the hook disables when tribeIdNum <= 0.
  const tribeIdStr: string | null =
    tribeId != null && tribeId > 0 ? String(tribeId) : null;

  const econQ   = useTribeEconomyObjects(tribeIdStr);
  const ledgerId = econQ.data?.ledgerId ?? null;
  const ledgerQ  = useTribeTokenLedger(ledgerId);

  const symbol: string | null = ledgerQ.data?.tokenSymbol ?? null;
  const isLoading = econQ.isLoading || ledgerQ.isLoading;

  return { symbol, isLoading };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
