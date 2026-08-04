// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useCallback } from "react";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

async function rpc(method: string, params: unknown[]): Promise<any> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error.message);
  return data.result;
}

export interface UseWtbEscrowPoolResult {
  poolBalance:  number;
  totalLedger:  number;
  surplus:      number;
  loading:      boolean;
  refetch:      () => void;
}

/**
 * Reads the per-SSU WtbEscrowPool balance + ledger.
 *
 * V13 atomic-9: pool ID is now per-SSU and must come from useSSUSharedObjects().
 * Pass null/empty when the SSU's shared objects haven't resolved yet.
 */
export function useWtbEscrowPool(poolId?: string | null): UseWtbEscrowPoolResult {
  const [poolBalance, setPoolBalance] = useState(0);
  const [totalLedger, setTotalLedger] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [tick,        setTick]        = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!poolId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const result = await rpc("sui_getObject", [
        poolId,
        { showContent: true },
      ]);

      const fields = result?.data?.content?.fields ?? {};
      const bal = Number(fields?.pool?.fields?.value ?? 0);
      const ledger = Number(fields?.total_ledger ?? 0);

      if (!cancelled) {
        setPoolBalance(bal);
        setTotalLedger(ledger);
        setLoading(false);
      }
    })().catch(e => {
      console.warn("[useWtbEscrowPool] RPC load failed:", e);
      if (!cancelled) {
        setPoolBalance(0);
        setTotalLedger(0);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [tick, poolId]);

  const surplus = poolBalance > totalLedger ? poolBalance - totalLedger : 0;

  return { poolBalance, totalLedger, surplus, loading, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
