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

export interface UseTribeTokenWtbPoolResult {
  totalEscrowed: number;
  loading:       boolean;
  refetch:       () => void;
}

/**
 * Reads the per-SSU TribeTokenWtbPool total_escrowed field.
 *
 * Mirror of useWtbEscrowPool for the Advanced (tribe-token) WTB pool. The
 * Advanced WTB shop create flow burns tribe tokens from the owner's ledger
 * row and earmarks them in this pool for the duration of the shop. This
 * hook surfaces the running total for the Owner-tab WTB Pool view.
 *
 * Pass null/empty when the SSU's pool ID hasn't resolved (Advanced SSU not
 * yet bootstrapped, OR NoTribe/Easy SSU without a pool).
 */
export function useTribeTokenWtbPool(poolId?: string | null): UseTribeTokenWtbPoolResult {
  const [totalEscrowed, setTotalEscrowed] = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [tick,          setTick]          = useState(0);

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
      const total = Number(fields?.total_escrowed ?? 0);

      if (!cancelled) {
        setTotalEscrowed(total);
        setLoading(false);
      }
    })().catch(e => {
      console.warn("[useTribeTokenWtbPool] RPC load failed:", e);
      if (!cancelled) {
        setTotalEscrowed(0);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [tick, poolId]);

  return { totalEscrowed, loading, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
