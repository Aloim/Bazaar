// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/hooks/useDAppCaps.ts
// Detects DAppOwnerCap and DAppAdminCap in the connected wallet.
// Uses direct Sui fullnode RPC (NOT dAppKit.getClient()).

import { useState, useEffect, useMemo, useCallback } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { PACKAGE_IDS } from "@bazaar/shared/constants";
import { debug } from "@bazaar/shared/utils/debug";

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

export interface DAppCaps {
  isDAppOwner:       boolean;
  isDAppAdmin:       boolean;
  dappOwnerCapId:    string | null;
  dappAdminCapId:    string | null;
  refetchDAppCaps:   () => void;
}

export function useDAppCaps(): DAppCaps {
  const { walletAddress } = useConnection();
  const [caps, setCaps] = useState<Array<{ address: string; type: string }>>([]);
  const [tick, setTick] = useState(0);

  const refetchDAppCaps = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!walletAddress) {
      setCaps([]);
      return;
    }

    let cancelled = false;

    async function fetchCaps() {
      try {
        let cursor: string | null = null;
        const allItems: Array<{ objectId: string; type: string }> = [];
        do {
          const page = await rpc("suix_getOwnedObjects", [
            walletAddress,
            { filter: null, options: { showType: true } },
            cursor,
            50,
          ]);
          if (cancelled) return;
          for (const item of page?.data ?? []) {
            allItems.push({
              objectId: item?.data?.objectId ?? "",
              type:     item?.data?.type ?? "",
            });
          }
          cursor = page?.nextCursor ?? null;
          if (!page?.hasNextPage) break;
        } while (true);

        // DAppOwnerCap + DAppAdminCap are defined in dapp_hub::tribe_registry,
        // so the type prefix must be the live DappHub package ID (not the
        // BazaarCore-flavoured ORIGINAL_PACKAGE_ID that was here before).
        const dappCaps = allItems
          .filter(
            c =>
              c.objectId &&
              c.type.startsWith(`${PACKAGE_IDS.DAPP_HUB}::tribe_registry::`),
          )
          .map(c => ({ address: c.objectId, type: c.type }));

        debug("[useDAppCaps] dApp caps found:", dappCaps);
        setCaps(dappCaps);
      } catch (err) {
        if (!cancelled) console.warn("[useDAppCaps] RPC fetch failed:", err);
      }
    }

    fetchCaps();
    return () => { cancelled = true; };
  }, [walletAddress, tick]);

  return useMemo(() => {
    const find = (suffix: string) =>
      caps.find(c => c.type.includes(suffix));

    const ownerCap = find("::tribe_registry::DAppOwnerCap");
    const adminCap = find("::tribe_registry::DAppAdminCap");

    return {
      isDAppOwner:     !!ownerCap,
      isDAppAdmin:     !!adminCap,
      dappOwnerCapId:  ownerCap?.address ?? null,
      dappAdminCapId:  adminCap?.address ?? null,
      refetchDAppCaps,
    };
  }, [caps, refetchDAppCaps]);
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
