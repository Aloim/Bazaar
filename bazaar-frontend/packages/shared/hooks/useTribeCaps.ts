// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/hooks/useTribeCaps.ts
// Detects TribeLeaderCap (tribe_registry module) and TribeSuperAdminCap (tribe_economy module)
// in the connected wallet via direct Sui fullnode RPC.
// NEVER use dAppKit.getClient() — it routes through stale GraphQL.

import { useState, useEffect, useMemo, useCallback } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { PACKAGE_IDS } from "@bazaar/shared/constants";
import { debug } from "@bazaar/shared/utils/debug";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

// TribeLeaderCap is defined in dapp_hub::tribe_registry; TribeSuperAdminCap is
// defined in bazaar_core::tribe_governance. Each cap's full Move type is anchored
// to its defining package's ID. Anchor to current PACKAGE_IDS so we only surface
// caps minted by the live deployment (older fresh-publish caps point at stale
// shared objects and would abort on use). If we ever switch from fresh publishes
// to upgrades, replace these with ORIGINAL_PACKAGE_ID variants per Run-#9 inv. 1.
const LEADER_CAP_TYPE      = `${PACKAGE_IDS.DAPP_HUB}::tribe_registry::TribeLeaderCap`;
const SUPER_ADMIN_CAP_TYPE = `${PACKAGE_IDS.BAZAAR_CORE}::tribe_governance::TribeSuperAdminCap`;
// V15: vault_withdrawal::approve_request / deny_request require TribeAdminCap
// (a separate struct from TribeSuperAdminCap — both live in bazaar_core::tribe_governance).
const ADMIN_CAP_TYPE       = `${PACKAGE_IDS.BAZAAR_CORE}::tribe_governance::TribeAdminCap`;
// Phase 8 A2 (AUD-ET-22): TribeModCap drives tribe_ban_as_mod / tribe_unban_as_mod.
const MOD_CAP_TYPE         = `${PACKAGE_IDS.BAZAAR_CORE}::tribe_governance::TribeModCap`;

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const data = await resp.json() as { result?: unknown; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));
  return data.result;
}

export interface TribeCapsState {
  hasLeaderCap:       boolean;
  hasSuperAdminCap:   boolean;
  hasAdminCap:        boolean;
  hasModCap:          boolean;
  leaderCapId:        string | null;
  superAdminCapId:    string | null;
  adminCapId:         string | null;
  modCapId:           string | null;
  /** tribe_idx encoded in the cap — read from the cap object's tribe_idx field. */
  leaderTribeIdx:     number | null;
  superAdminTribeIdx: number | null;
  adminTribeIdx:      number | null;
  modTribeIdx:        number | null;
  refetchTribeCaps:   () => void;
}

export function useTribeCaps(): TribeCapsState {
  const { walletAddress } = useConnection();
  const [caps, setCaps] = useState<Array<{ objectId: string; type: string }>>([]);
  const [leaderTribeIdx, setLeaderTribeIdx] = useState<number | null>(null);
  const [superAdminTribeIdx, setSuperAdminTribeIdx] = useState<number | null>(null);
  const [adminTribeIdx, setAdminTribeIdx] = useState<number | null>(null);
  const [modTribeIdx, setModTribeIdx] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const refetchTribeCaps = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!walletAddress) {
      setCaps([]);
      setLeaderTribeIdx(null);
      setSuperAdminTribeIdx(null);
      setAdminTribeIdx(null);
      setModTribeIdx(null);
      return;
    }

    let cancelled = false;

    async function fetchCaps() {
      try {
        // Paginate fully — a single 50-item page misses caps when the wallet
        // accumulates objects across multiple deployments (the user's V14
        // TribeLeaderCap landed on page 2 after stale V11-V13 caps).
        const items: Array<{ objectId: string; type: string }> = [];
        let cursor: string | null = null;
        for (let page = 0; page < 20; page++) {
          const result = await rpc("suix_getOwnedObjects", [
            walletAddress,
            { filter: null, options: { showType: true } },
            cursor,
            50,
          ]) as {
            data?: Array<{ data?: { objectId?: string; type?: string } }>;
            hasNextPage?: boolean;
            nextCursor?: string | null;
          } | null;
          if (cancelled) return;
          for (const item of result?.data ?? []) {
            items.push({
              objectId: item?.data?.objectId ?? "",
              type:     item?.data?.type ?? "",
            });
          }
          if (!result?.hasNextPage) break;
          cursor = result.nextCursor ?? null;
          if (!cursor) break;
        }

        const tribeCaps = items.filter(
          c => c.objectId && (
            c.type === LEADER_CAP_TYPE ||
            c.type === SUPER_ADMIN_CAP_TYPE ||
            c.type === ADMIN_CAP_TYPE ||
            c.type === MOD_CAP_TYPE
          ),
        );

        debug("[useTribeCaps] tribe caps found:", tribeCaps);
        setCaps(tribeCaps);

        // Fetch tribe_id from each cap object.
        // Move-side struct field is `tribe_id` (NOT `tribe_idx`) — see
        // DappHub/sources/tribe_registry.move:66 and
        // BazaarCore/sources/tribe_governance.move:84.
        const leaderCap     = tribeCaps.find(c => c.type === LEADER_CAP_TYPE);
        const superAdminCap = tribeCaps.find(c => c.type === SUPER_ADMIN_CAP_TYPE);
        const adminCap      = tribeCaps.find(c => c.type === ADMIN_CAP_TYPE);
        const modCap        = tribeCaps.find(c => c.type === MOD_CAP_TYPE);

        async function resolveTribeId(objectId: string): Promise<number | null> {
          try {
            const obj = await rpc("sui_getObject", [
              objectId,
              { showContent: true },
            ]) as { data?: { content?: { fields?: Record<string, unknown> } } } | null;
            const idx = obj?.data?.content?.fields?.tribe_id;
            return idx === undefined ? null : Number(idx);
          } catch {
            return null;
          }
        }

        if (leaderCap) {
          const idx = await resolveTribeId(leaderCap.objectId);
          if (!cancelled && idx !== null) setLeaderTribeIdx(idx);
        } else if (!cancelled) setLeaderTribeIdx(null);

        if (superAdminCap) {
          const idx = await resolveTribeId(superAdminCap.objectId);
          if (!cancelled && idx !== null) setSuperAdminTribeIdx(idx);
        } else if (!cancelled) setSuperAdminTribeIdx(null);

        if (adminCap) {
          const idx = await resolveTribeId(adminCap.objectId);
          if (!cancelled && idx !== null) setAdminTribeIdx(idx);
        } else if (!cancelled) setAdminTribeIdx(null);

        if (modCap) {
          const idx = await resolveTribeId(modCap.objectId);
          if (!cancelled && idx !== null) setModTribeIdx(idx);
        } else if (!cancelled) setModTribeIdx(null);
      } catch (err) {
        if (!cancelled) console.warn("[useTribeCaps] RPC fetch failed:", err);
      }
    }

    fetchCaps();
    return () => { cancelled = true; };
  }, [walletAddress, tick]);

  return useMemo(() => {
    const leaderCap     = caps.find(c => c.type === LEADER_CAP_TYPE);
    const superAdminCap = caps.find(c => c.type === SUPER_ADMIN_CAP_TYPE);
    const adminCap      = caps.find(c => c.type === ADMIN_CAP_TYPE);
    const modCap        = caps.find(c => c.type === MOD_CAP_TYPE);

    return {
      hasLeaderCap:       !!leaderCap,
      hasSuperAdminCap:   !!superAdminCap,
      hasAdminCap:        !!adminCap,
      hasModCap:          !!modCap,
      leaderCapId:        leaderCap?.objectId ?? null,
      superAdminCapId:    superAdminCap?.objectId ?? null,
      adminCapId:         adminCap?.objectId ?? null,
      modCapId:           modCap?.objectId ?? null,
      leaderTribeIdx,
      superAdminTribeIdx,
      adminTribeIdx,
      modTribeIdx,
      refetchTribeCaps,
    };
  }, [caps, leaderTribeIdx, superAdminTribeIdx, adminTribeIdx, modTribeIdx, refetchTribeCaps]);
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
