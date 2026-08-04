// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useTribeExchange.ts
// Reads ExchangeConfig + TribeVault + TribeTokenLedger shared objects plus the
// TRIBE WALLET ledger row (gov-address dynamic field) via Sui RPC, and quotes
// swaps with the SAME V28 wallet-stock curve the Move contract executes.
//
// Phase 6 W5 (AUD-ADV-18): this hook previously quoted off the retired V27
// total-supply rate while Move executed the V28 wallet-stock rate — quotes
// drifted whenever the tribe wallet held less than the full supply. The math
// now lives in @bazaar/shared/utils/exchangeQuotes (BigInt, vitest-covered)
// and the rate denominator is the gov-address ledger row, exactly like:
//
// Move reference:
//   BazaarEconomy/sources/tribe_exchange.move
//   - swap_eve_to_tokens   (:133-249): tokens = net_eve * tribe_wallet_bal / available
//   - swap_tokens_to_eve   (:255-365): gross  = tokens * scaled_rate_v28 / 1e9
//   - compute_scaled_rate_v28 (:489-501): (vault - reserve) * 1e9 / tribe_wallet_bal
//   RATE_PRECISION = 1_000_000_000 (1e9)
//
// NEVER use dAppKit.getClient() — routes through stale GraphQL.

import { useState, useCallback, useEffect } from "react";
import {
  quoteEveToTokensV28,
  quoteEveCostForTokensV28,
  quoteTokensToEveV28,
} from "@bazaar/shared/utils/exchangeQuotes";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json() as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result;
}

export interface TribeExchangeState {
  tribeId:           number;     // from ExchangeConfig.tribe_id
  eveBalance:        number;     // raw MIST — from TribeVault.eve_balance.fields.value
  totalSupply:       number;     // from TribeTokenLedger.total_supply (display + legacy redemption)
  /** Tribe wallet ledger row at the gov address — the V28 rate denominator. */
  tribeWalletBalance: number;
  reserveMist:       number;     // from ExchangeConfig.reserve_mist
  isActive:          boolean;    // from ExchangeConfig.is_active
  /** Spot price: MIST per 1 raw token unit (V28 wallet-stock rate). 0 when unquotable. */
  tokenPriceInEve:   number;
  /**
   * Quote: EVE in → tribe tokens out (mirrors swap_eve_to_tokens).
   * eveAmountRaw: gross MIST input (fee deducted before token calculation).
   * feeBps: effective fee in basis points (override → per-type → global).
   */
  quoteEveToTokens:  (eveAmountRaw: number, feeBps: number) => number;
  /**
   * Quote: tribe tokens in → EVE out (mirrors swap_tokens_to_eve).
   * Returns 0 where Move would abort (zero rate / reserve floor).
   */
  quoteTokensToEve:  (tokenAmountRaw: number, feeBps: number) => number;
  /**
   * Inverse of quoteEveToTokens: gross EVE (MIST) needed so Move delivers at
   * least that many tokens. Ceiling math — never under-quotes. 0 when the ask
   * exceeds the tribe wallet stock (Move E_TRIBE_WALLET_INSUFFICIENT).
   */
  quoteEveCostForTokens: (tokenAmountRaw: number, feeBps: number) => number;
  loading:           boolean;
  error:             string | null;
  refetch:           () => void;
}

/**
 * Fetches ExchangeConfig, TribeVault, and TribeTokenLedger in a single
 * sui_multiGetObjects call, then the tribe-wallet ledger row (one
 * suix_getDynamicFieldObject on the ledger's balances Table keyed by the
 * TribeGovernance address). All four IDs are required for live quotes.
 */
export function useTribeExchange(
  configId: string,
  vaultId:  string,
  ledgerId: string,
  /** TribeGovernance shared object ID — its address keys the tribe wallet row. */
  tribeGovId: string,
): TribeExchangeState {
  const [tribeId,     setTribeId]     = useState(0);
  const [eveBalance,  setEveBalance]  = useState(0);
  const [totalSupply, setTotalSupply] = useState(0);
  const [tribeWalletBalance, setTribeWalletBalance] = useState(0);
  const [reserveMist, setReserveMist] = useState(0);
  const [isActive,    setIsActive]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!configId || !vaultId || !ledgerId) return;
    setLoading(true);
    setError(null);
    try {
      const results = await rpc("sui_multiGetObjects", [
        [configId, vaultId, ledgerId],
        { showContent: true },
      ]) as Array<{ data?: { content?: { fields?: Record<string, unknown> } } }>;

      const configFields  = results[0]?.data?.content?.fields;
      const vaultFields   = results[1]?.data?.content?.fields;
      const ledgerFields  = results[2]?.data?.content?.fields;

      if (!configFields) throw new Error("ExchangeConfig object has no fields");
      if (!vaultFields)  throw new Error("TribeVault object has no fields");
      if (!ledgerFields) throw new Error("TribeTokenLedger object has no fields");

      setTribeId(Number(configFields.tribe_id ?? 0));
      setReserveMist(Number(configFields.reserve_mist ?? 0));
      setIsActive(configFields.is_active === true);

      // TribeVault.eve_balance is Balance<EVE>. Sui RPC `showContent` serializes
      // this field with either of two shapes depending on context:
      //   (a) { fields: { value: "<mist>" } }  — wrapped struct
      //   (b) "<mist>"                          — flat string (most common)
      // Earlier revision only handled (a) and silently fell back to 0 for (b),
      // which is why the Exchange/Backing-Rate panels read 0 EVE even when the
      // vault genuinely held funds. Mirror the robust fallback used in
      // bazaareconomy/vault-hooks.ts::useTribeVault.
      const eveBalField = vaultFields.eve_balance as
        | { fields?: { value?: string | number } }
        | string
        | number
        | undefined;
      const eveBalNested =
        typeof eveBalField === "object" && eveBalField !== null
          ? eveBalField.fields?.value
          : undefined;
      const eveBalFlat =
        typeof eveBalField === "string" || typeof eveBalField === "number"
          ? eveBalField
          : undefined;
      setEveBalance(Number(eveBalNested ?? eveBalFlat ?? 0));

      setTotalSupply(Number(ledgerFields.total_supply ?? 0));

      // V28 denominator: the tribe wallet row in ledger.balances (a NESTED
      // Table — dynamic fields hang off the Table's own UID, not the ledger's;
      // same pitfall ledger-hooks.ts::useTribeTokenBalance documents).
      let walletBal = 0;
      if (tribeGovId) {
        const balancesField = ledgerFields.balances as
          | { fields?: { id?: { id?: string } } }
          | undefined;
        const balancesTableId = balancesField?.fields?.id?.id;
        if (balancesTableId) {
          try {
            const row = await rpc("suix_getDynamicFieldObject", [
              balancesTableId,
              { type: "address", value: tribeGovId },
            ]) as { data?: { content?: { fields?: { value?: string | number } } } } | null;
            walletBal = Number(row?.data?.content?.fields?.value ?? 0);
          } catch {
            walletBal = 0; // no row yet — quotes return 0 (Move would abort too)
          }
        }
      }
      setTribeWalletBalance(walletBal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error("[useTribeExchange]", msg);
    } finally {
      setLoading(false);
    }
  }, [configId, vaultId, ledgerId, tribeGovId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!configId || !vaultId || !ledgerId) return;
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [configId, vaultId, ledgerId, fetchData]);

  // Pool snapshot for the BigInt quote helpers. Balances arrive as integral
  // MIST/token-unit counts — Math.floor guards against any float creep.
  const pool = {
    eveBalance:         BigInt(Math.floor(eveBalance)),
    reserveMist:        BigInt(Math.floor(reserveMist)),
    tribeWalletBalance: BigInt(Math.floor(tribeWalletBalance)),
  };

  // Spot price (display): MIST per raw token unit at the V28 wallet-stock rate.
  const available = eveBalance > reserveMist ? eveBalance - reserveMist : 0;
  const tokenPriceInEve = tribeWalletBalance > 0 && available > 0
    ? available / tribeWalletBalance
    : 0;

  function quoteEveToTokens(eveAmountRaw: number, feeBps: number): number {
    if (eveAmountRaw <= 0 || !isActive) return 0;
    return Number(quoteEveToTokensV28(pool, BigInt(Math.floor(eveAmountRaw)), feeBps));
  }

  function quoteEveCostForTokens(tokenAmountRaw: number, feeBps: number): number {
    if (tokenAmountRaw <= 0 || !isActive) return 0;
    return Number(quoteEveCostForTokensV28(pool, BigInt(Math.floor(tokenAmountRaw)), feeBps));
  }

  function quoteTokensToEve(tokenAmountRaw: number, feeBps: number): number {
    if (tokenAmountRaw <= 0 || !isActive) return 0;
    return Number(quoteTokensToEveV28(pool, BigInt(Math.floor(tokenAmountRaw)), feeBps));
  }

  return {
    tribeId, eveBalance, totalSupply, tribeWalletBalance, reserveMist, isActive,
    tokenPriceInEve, quoteEveToTokens, quoteTokensToEve, quoteEveCostForTokens,
    loading, error, refetch: fetchData,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
