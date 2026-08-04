// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/hooks/bazaarcore/godot-url-hooks — Godot URL stub hooks.
 *
 * useSSUGodotUrl    — reads godot_url from SSUGovernance shared object (stub)
 * useTribeGodotUrl  — reads godot_url from TribeGovernance shared object (stub)
 *
 * Both hooks are stubs this phase (AP2-C / FP1-28). Real suiClient.getObject
 * wiring is deferred — tracked as FP1-23 extension (post Pre-AP2.3 + redeploy #2).
 * Consumers receive { url: null, isLoading: false, refetch: () => void }.
 *
 * staleTime: 15_000 ms — consistent with existing bazaarcore hook conventions.
 *
 * Constitution: Article III.2 (shared canonical), XII.5 (SSU/Tribe prefix),
 *               XIV.2 (file-manager creates), XIV.4 (500-line ceiling).
 *
 * Phase: AP2-C / FP1-28
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";

// ── Return shape ───────────────────────────────────────────────────────────────

/** Narrow return shape for Godot URL hooks. Narrow by design — allows swap of
 *  fetch mechanism (event-indexer, subscription) without breaking consumers.
 *  AP2-E will extend with event subscription; AP2-D banner only needs url + isLoading.
 */
export interface GodotUrlResult {
  url: string | null;
  isLoading: boolean;
  refetch: () => void;
}

// ── useSSUGodotUrl ─────────────────────────────────────────────────────────────

/**
 * Read the on-chain godot_url field of an SSUGovernance shared object.
 *
 * Move source: bazaar_core::ssu_governance::SSUGovernance.godot_url
 *   — field added AP2-C / FP1-28 (Option<String>)
 *
 * Stub returns { url: null, isLoading: false, refetch: noop } until real RPC lands.
 * Real wiring: suiClient.getObject(ssuGovId, { showContent: true })
 *   → parse content.fields.godot_url (Option<String> → string | null)
 *   Tracked: FP1-23 extension after Pre-AP2.3 + redeploy #2.
 *
 * @param ssuGovId - SSUGovernance shared object ID, or null to disable.
 *   (Resolution gap FP1-24 — ssuGovId may be null until bootstrap lands.)
 */
export function useSSUGodotUrl(ssuGovId: string | null): GodotUrlResult {
  const query = useQuery<string | null>({
    queryKey: ["bazaarcore", "ssu-godot-url", ssuGovId],
    enabled: !!ssuGovId,
    staleTime: 15_000,
    queryFn: async (): Promise<string | null> => {
      const obj = await suiClient.getObject({
        id: ssuGovId!,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      if (!fields) return null;
      // Move Option<String> via showContent serialises as { fields: { vec: ["url"] } } (Some) or { fields: { vec: [] } } (None).
      const raw = fields.godot_url as { fields?: { vec?: string[] } } | null;
      return raw?.fields?.vec?.[0] ?? null;
    },
  });

  return {
    url: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// ── useTribeGodotUrl ───────────────────────────────────────────────────────────

/**
 * Read the on-chain godot_url field of a TribeGovernance shared object.
 *
 * Move source: bazaar_core::tribe_governance::TribeGovernance.godot_url
 *   — field added AP2-C / FP1-28 (Option<String>)
 *
 * Stub returns { url: null, isLoading: false, refetch: noop } until real RPC lands.
 * Real wiring: suiClient.getObject(tribeGovId, { showContent: true })
 *   → parse content.fields.godot_url (Option<String> → string | null)
 *   Tracked: FP1-23 extension after Pre-AP2.3 + redeploy #2.
 *
 * @param tribeGovId - TribeGovernance shared object ID, or null to disable.
 *   (Resolution gap FP1-24 — tribeGovId may be null until bootstrap lands.)
 */
export function useTribeGodotUrl(tribeGovId: string | null): GodotUrlResult {
  const query = useQuery<string | null>({
    queryKey: ["bazaarcore", "tribe-godot-url", tribeGovId],
    enabled: !!tribeGovId,
    staleTime: 15_000,
    queryFn: async (): Promise<string | null> => {
      const obj = await suiClient.getObject({
        id: tribeGovId!,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      if (!fields) return null;
      // Move Option<String> via showContent serialises as { fields: { vec: ["url"] } } (Some) or { fields: { vec: [] } } (None).
      const raw = fields.godot_url as { fields?: { vec?: string[] } } | null;
      return raw?.fields?.vec?.[0] ?? null;
    },
  });

  return {
    url: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
