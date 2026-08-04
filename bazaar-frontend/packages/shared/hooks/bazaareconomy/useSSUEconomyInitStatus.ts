// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Wave 2 FE — useSSUEconomyInitStatus(ssuId)
 *
 * Returns whether a per-SSU economy has been initialized:
 *   - TribeTokenWtbPool created (required for Advanced WTB shop create + fill)
 *   - SSU ledger row exists (drives SSU Wallets tax balance display)
 *
 * Lookup strategy:
 *   1. PRIMARY: scan `bazaar_economy::ssu_economy_init::SSUEconomyInitializedEvent`
 *      (V27+). The single canonical signal — emitted only by the atomic init entry.
 *   2. FALLBACK: scan `bazaar_economy::tribe_token_wtb_pool::TribeTokenWtbPoolCreated`
 *      for SSUs whose pool was bootstrapped pre-V27 via the standalone entry
 *      `bootstrap_tribe_token_wtb_pool` (no SSUEconomyInitializedEvent then).
 *
 * Returns `initialized: true` if either event matches the ssu_id.
 * Returns `initialized: false` if neither is found.
 *
 * Caching: staleTime=60s so the UI updates promptly after the init TX confirms.
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import { BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID } from "../../constants";

export interface SSUEconomyInitStatus {
  initialized: boolean;
  wtbPoolId:   string | null;
  source:      "SSUEconomyInitializedEvent" | "TribeTokenWtbPoolCreated" | null;
}

export function useSSUEconomyInitStatus(ssuId: string | null) {
  return useQuery<SSUEconomyInitStatus>({
    queryKey: ["bazaareconomy", "ssu-economy-init-status", ssuId],
    enabled: !!ssuId,
    queryFn: async (): Promise<SSUEconomyInitStatus> => {
      if (!ssuId) return { initialized: false, wtbPoolId: null, source: null };

      const initEventType =
        `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::ssu_economy_init::SSUEconomyInitializedEvent`;
      const poolEventType =
        `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::tribe_token_wtb_pool::TribeTokenWtbPoolCreated`;

      const initEvents = await suiClient.queryEvents({
        query: { MoveEventType: initEventType },
        limit: 200,
      });
      const initMatch = initEvents.data.find((e) => {
        const p = e.parsedJson as { ssu_id?: string; wtb_pool_id?: string } | null;
        return p?.ssu_id === ssuId;
      });
      if (initMatch) {
        const p = initMatch.parsedJson as { wtb_pool_id?: string } | null;
        return {
          initialized: true,
          wtbPoolId: p?.wtb_pool_id ?? null,
          source: "SSUEconomyInitializedEvent",
        };
      }

      // Fallback for pre-V27 bootstraps that ran the standalone pool entry.
      const poolEvents = await suiClient.queryEvents({
        query: { MoveEventType: poolEventType },
        limit: 200,
      });
      const poolMatch = poolEvents.data.find((e) => {
        const p = e.parsedJson as { ssu_id?: string; pool_id?: string } | null;
        return p?.ssu_id === ssuId;
      });
      if (poolMatch) {
        const p = poolMatch.parsedJson as { pool_id?: string } | null;
        return {
          initialized: true,
          wtbPoolId: p?.pool_id ?? null,
          source: "TribeTokenWtbPoolCreated",
        };
      }

      return { initialized: false, wtbPoolId: null, source: null };
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
