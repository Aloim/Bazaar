// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/hooks/useTribeTokenBalance.ts
// Manual-state hook for reading the connected player's tribe token balances
// across ALL Advanced tribes that have bootstrapped their economy.
//
// 2026-05-12 rewrite: previous version queried a nonexistent
// `bazaar_economy::tribe_economy::TribeToken` coin struct; the actual data lives
// in `bazaar_economy::tribe_token_ledger::TribeTokenLedger.balances` —
// a Table<address, u64> looked up via getDynamicFieldObject per ledger.
//
// Strategy: enumerate Advanced tribes from useTribeRegistry, fan out parallel
// RPCs to each ledger's address-keyed dynamic field plus a getObject for the
// ledger's token_symbol, aggregate non-zero balances.

import { useState, useCallback, useEffect } from "react";
import { useTribeRegistry } from "./useTribeRegistry";

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

export interface TribeTokenBalance {
  tribeIdx:    number;
  ledgerId:    string;
  tokenSymbol: string;   // empty string if ledger metadata unreadable
  value:       number;   // raw token units (9 decimals)
}

export interface TribeTokenBalanceState {
  balances:   TribeTokenBalance[];
  totalValue: number;
  loading:    boolean;
  error:      string | null;
  refetch:    () => void;
}

async function fetchOneLedger(
  tribeIdx: number,
  ledgerId: string,
  ownerAddress: string,
): Promise<TribeTokenBalance> {
  // Parallel: balance dynamic field + ledger metadata.
  const [balResult, ledgerResult] = await Promise.all([
    rpc("suix_getDynamicFieldObject", [
      ledgerId,
      { type: "address", value: ownerAddress },
    ]).catch(() => null),
    rpc("sui_getObject", [ledgerId, { showContent: true }]).catch(() => null),
  ]);

  let value = 0;
  if (balResult) {
    const d = balResult as { data?: { content?: { fields?: Record<string, unknown> } } };
    const f = d?.data?.content?.fields;
    if (f && typeof f.value !== "undefined") value = Number(f.value);
  }

  let tokenSymbol = "";
  if (ledgerResult) {
    const d = ledgerResult as { data?: { content?: { fields?: Record<string, unknown> } } };
    const lf = d?.data?.content?.fields;
    if (lf && typeof lf.token_symbol === "string") tokenSymbol = lf.token_symbol;
  }

  return { tribeIdx, ledgerId, tokenSymbol, value };
}

/**
 * Manual-state polling hook for the connected player's tribe-token balances.
 * Returns one entry per Advanced tribe with non-zero balance, including the
 * tribe's `tokenSymbol` for HUD display.
 *
 * Renamed from `useTribeTokenBalance` → `useTribeTokenBalanceManual` to avoid
 * collision with the TanStack canonical version at
 * `hooks/bazaareconomy/ledger-hooks.ts`. The barrel-public name
 * `useTribeTokenBalance` resolves to the TanStack version.
 */
export function useTribeTokenBalanceManual(ownerAddress: string): TribeTokenBalanceState {
  const { tribes, loading: tribesLoading } = useTribeRegistry();
  const [balances, setBalances] = useState<TribeTokenBalance[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!ownerAddress) {
      setBalances([]);
      return;
    }
    // Wait for the registry to load before fanning out per-tribe RPCs.
    if (tribesLoading || tribes.length === 0) {
      setBalances([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Only Advanced tribes have a token ledger. Easy/NoTribe skip.
      const advancedTargets = tribes
        .filter(t => t.bazaarType === 2 && !!t.tribeTokenLedgerId)
        .map(t => ({ tribeIdx: t.idx, ledgerId: t.tribeTokenLedgerId as string }));

      if (advancedTargets.length === 0) {
        setBalances([]);
        return;
      }

      const all = await Promise.all(
        advancedTargets.map(t => fetchOneLedger(t.tribeIdx, t.ledgerId, ownerAddress)),
      );
      // Keep only non-zero balances for HUD display.
      setBalances(all.filter(b => b.value > 0));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error("[useTribeTokenBalanceManual]", msg);
    } finally {
      setLoading(false);
    }
  }, [ownerAddress, tribes, tribesLoading]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!ownerAddress) return;
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [ownerAddress, fetchData]);

  const totalValue = balances.reduce((acc, b) => acc + b.value, 0);
  return { balances, totalValue, loading, error, refetch: fetchData };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
