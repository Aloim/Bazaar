// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { PACKAGE_IDS, ORIGINAL_PACKAGE_ID } from "@bazaar/shared/constants";
import { debug } from "@bazaar/shared/utils/debug";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

interface OwnedCaps {
  hasOwnerCap:     boolean;
  hasSuperAdminCap: boolean;
  hasAdminCap:     boolean;
  hasModCap:       boolean;
  hasDAppOwnerCap: boolean;
  ownerCapId:      string | null;
  superAdminCapId: string | null;
  adminCapId:      string | null;
  modCapId:        string | null;
  dAppOwnerCapId:  string | null;
}

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

export function useOwnedCaps(): OwnedCaps & { refetchCaps: () => void } {
  const { walletAddress } = useConnection();
  const [caps, setCaps] = useState<Array<{ address: string; type: string }>>([]);
  const [tick, setTick] = useState(0);

  const refetchCaps = useCallback(() => setTick(t => t + 1), []);

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

        const govCaps = allItems
          .filter(c => {
            const t = c.type;
            return c.objectId && (
              t.startsWith(`${ORIGINAL_PACKAGE_ID}::membership::`)
              || t.startsWith(`${PACKAGE_IDS.DAPP_HUB}::dapp_governance::`)
            );
          })
          .map(c => ({ address: c.objectId, type: c.type }));

        debug("[useOwnedCaps] total objects:", allItems.length, "gov caps:", govCaps);
        setCaps(govCaps);
      } catch (err) {
        if (!cancelled) console.warn("[useOwnedCaps] RPC fetch failed:", err);
      }
    }

    fetchCaps();
    return () => { cancelled = true; };
  }, [walletAddress, tick]);

  const result = useMemo(() => {
    const find = (suffix: string) => caps.find(c => c.type.includes(suffix));
    const owner      = find("::membership::SSUOwnerCap");
    const superAdmin = find("::membership::SSUSuperAdminCap");
    const admin      = find("::membership::SSUAdminCap");
    const mod        = find("::membership::SSUModCap");
    const dAppOwner  = find("::dapp_governance::DAppOwnerCap");
    return {
      hasOwnerCap:      !!owner,
      hasSuperAdminCap: !!superAdmin,
      hasAdminCap:      !!admin,
      hasModCap:        !!mod,
      hasDAppOwnerCap:  !!dAppOwner,
      ownerCapId:       owner?.address ?? null,
      superAdminCapId:  superAdmin?.address ?? null,
      adminCapId:       admin?.address ?? null,
      modCapId:         mod?.address ?? null,
      dAppOwnerCapId:   dAppOwner?.address ?? null,
      refetchCaps,
    };
  }, [caps, refetchCaps]);

  return result;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
