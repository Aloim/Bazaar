// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";

const SUI_RPC = "https://api.zan.top/public/sui-testnet";

/** Map from our short method names to Sui JSON-RPC method names */
const RPC_METHOD_MAP: Record<string, string> = {
  getObject: "sui_getObject",
  getBalance: "suix_getBalance",
};

interface QueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  refetch: () => void;
}

let rpcId = 0;

export function useSuiQuery<T>(
  method: string,
  params: Record<string, any>,
  options?: { enabled?: boolean },
): QueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(options?.enabled !== false);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const enabled = options?.enabled !== false;

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      const rpcMethod = RPC_METHOD_MAP[method];
      if (!rpcMethod) throw new Error(`Unknown RPC method: ${method}`);

      const p = paramsRef.current;
      let rpcParams: any[];

      if (method === "getObject") {
        rpcParams = [p.id, p.options ?? {}];
      } else if (method === "getBalance") {
        rpcParams = [p.owner, p.coinType ?? "0x2::sui::SUI"];
      } else {
        rpcParams = [p];
      }

      const res = await fetch(SUI_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++rpcId,
          method: rpcMethod,
          params: rpcParams,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));

      setData(json.result as T);
    } catch (err) {
      console.warn(`[useSuiQuery] ${method} failed:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [method, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, refetch: fetchData };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
