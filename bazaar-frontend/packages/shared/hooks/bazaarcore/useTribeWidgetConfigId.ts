// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useTribeWidgetConfigId — OS-59-tribe-widgets.
 *
 * Resolves the per-tribe WidgetConfig shared object ID by reading the
 * `widget_config_id: Option<ID>` field from the TribeGovernance shared object.
 *
 * Move-side field type: Option<ID> (Variant 1 per MA-OS-59-tribe-widgets-design §3.2).
 * On-chain RPC shape: { vec: ["0x..."] } (populated) | { vec: [] } (none / legacy).
 *
 * Returns null when:
 *   - tribeGovId is null/empty (query disabled).
 *   - TribeGovernance object has widget_config_id == option::none (legacy v4 tribe
 *     not yet migrated to v5; caller must show a "pending bootstrap" message).
 *   - RPC error (treated as null, error surface via react-query).
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import { unwrapOptionAddress } from "../utils/option";

/** 24 hours — widget_config_id is set once at bootstrap and never changes. */
const STALE_MS = 24 * 60 * 60 * 1000;

export interface UseTribeWidgetConfigIdResult {
  /** The WidgetConfig shared object ID for this tribe, or null when not set / loading. */
  data:      string | null;
  isLoading: boolean;
  error:     Error | null;
}

/**
 * Resolve the per-tribe WidgetConfig ID from TribeGovernance.widget_config_id.
 *
 * @param tribeGovId — TribeGovernance shared object ID. Pass null to disable the query.
 */
export function useTribeWidgetConfigId(
  tribeGovId: string | null,
): UseTribeWidgetConfigIdResult {
  const { data, isLoading, error } = useQuery<string | null, Error>({
    queryKey: ["bazaarcore", "tribe-widget-config-id", tribeGovId],
    enabled:  !!tribeGovId,
    staleTime: STALE_MS,
    gcTime:    STALE_MS,
    queryFn: async (): Promise<string | null> => {
      if (!tribeGovId) return null;
      const resp = await suiClient.getObject({
        id:      tribeGovId,
        options: { showContent: true },
      });
      const fields = (
        resp.data?.content as { fields?: Record<string, unknown> } | undefined
      )?.fields;
      if (!fields) return null;
      return unwrapOptionAddress(fields.widget_config_id);
    },
  });

  return {
    data:      data ?? null,
    isLoading,
    error:     error ?? null,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
