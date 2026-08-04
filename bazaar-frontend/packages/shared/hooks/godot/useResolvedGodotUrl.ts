// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/hooks/godot/useResolvedGodotUrl — React orchestration hook.
 *
 * Wires useSSUGovernanceConfig → useSSUCaps → useTribeCaps →
 * useSSUGodotUrl → useTribeGodotUrl → resolveGodotUrl (in useQuery).
 *
 * staleTime: 0 on the resolver query (upstream hooks already cache at 15–30 s;
 * SDC-030-02 confirmed staleTime 0 correct — double caching would delay failover
 * recovery).
 *
 * Pending-update detection: compares resolved URL across renders. When the
 * upstream on-chain URL changes mid-session (React-query refetch after 15 s
 * staleTime), hasPendingUpdate is set and applyPending() / dismissPending()
 * are surfaced for the banner's "pending-update" 6th state.
 *
 * Phase: AP2-E / FP1-30
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { resolveGodotUrl } from "../../godot/url-resolver";
import type { ResolvedSource } from "../../godot/url-resolver";
import { removeOverride } from "../../storage/dev-override-store";
import {
  useSSUGovernanceConfig,
  useSSUCaps,
} from "../bazaarcore/ssu-governance-hooks";
import { useTribeCaps } from "../bazaarcore/tribe-governance-hooks";
import {
  useSSUGodotUrl,
  useTribeGodotUrl,
} from "../bazaarcore/godot-url-hooks";
import type { SSUCaps, TribeCaps } from "../../types/bazaarcore";

// ── Null-safe cap defaults ────────────────────────────────────────────────────

const NULL_SSU_CAPS: SSUCaps = {
  hasSSUOwnerCap: false,
  hasSSUSuperAdminCap: false,
  hasSSUAdminCap: false,
  hasSSUModCap: false,
  capIds: {},
};

const NULL_TRIBE_CAPS: TribeCaps = {
  hasTribeLeaderCap: false,
  hasTribeSuperAdminCap: false,
  hasTribeAdminCap: false,
  hasTribeModCap: false,
  capIds: {},
};

// ── Public types ──────────────────────────────────────────────────────────────

export interface UseResolvedGodotUrlInput {
  /** SSU object ID from URL param. null disables the hook. */
  ssuId: string | null;
  /** Connected wallet or null (anonymous user). */
  walletAddress: string | null;
  /** Tribe object ID for Easy/Advanced; null for NoTribe or unresolved (FP1-24). */
  tribeId: string | null;
  /** SSUGovernance shared object ID; null in stub era (FP1-24). */
  ssuGovId: string | null;
  /** TribeGovernance shared object ID; null in stub era (FP1-24). */
  tribeGovId: string | null;
}

export interface UseResolvedGodotUrlReturn {
  /** Resolved URL, or null while isLoading. Pass as GodotCanvas.basePath. */
  url: string | null;
  /** Which tier produced the URL. null while loading. */
  source: ResolvedSource | null;
  /** true while resolver is running. Show <LoadingSpinner> during this time. */
  isLoading: boolean;
  /** Re-run the resolver (banner Retry button handler). */
  retry: () => void;
  /** Clear dev-override for this SSU and re-resolve (banner Clear override handler). */
  clearOverride: () => void;
  /** Non-null when a new URL was detected mid-session (on-chain change). */
  hasPendingUpdate: boolean;
  /** Triggers window.location.reload() to apply the pending URL. */
  applyPending: () => void;
  /** Dismiss the pending-update banner without reloading. */
  dismissPending: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useResolvedGodotUrl(
  input: UseResolvedGodotUrlInput,
): UseResolvedGodotUrlReturn {
  const { ssuId, walletAddress, tribeId, ssuGovId, tribeGovId } = input;

  // Generation counter: bumped by retry() and clearOverride() to force re-query.
  const [generation, setGeneration] = useState(0);

  // Pending-update state (mid-session URL change detection).
  const resolvedUrlRef = useRef<string | null>(null);
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);

  // ── Upstream hooks ────────────────────────────────────────────────────────
  // All called unconditionally (Rules of Hooks).

  const govConfig = useSSUGovernanceConfig(ssuGovId);
  const capsQuery = useSSUCaps(walletAddress, ssuId);
  const tribeCapsQuery = useTribeCaps(walletAddress, tribeId);
  const ssuGodotUrl = useSSUGodotUrl(ssuGovId);
  const tribeGodotUrl = useTribeGodotUrl(tribeGovId);

  // Derive bazaarType from govConfig; default 0 (NoTribe) when null/loading.
  const bazaarType = govConfig.data?.bazaarType ?? 0;
  const caps = capsQuery.data ?? NULL_SSU_CAPS;
  const tribeCaps = tribeCapsQuery.data ?? NULL_TRIBE_CAPS;
  const onChainSSUUrl = ssuGodotUrl.url;
  const onChainTribeUrl = tribeGodotUrl.url;

  // ── Resolver query ────────────────────────────────────────────────────────

  const resolverQuery = useQuery({
    queryKey: [
      "godot-resolver",
      ssuId,
      walletAddress,
      tribeId,
      bazaarType,
      caps,
      tribeCaps,
      onChainSSUUrl,
      onChainTribeUrl,
      generation,
    ],
    enabled: !!ssuId,
    staleTime: 0,
    queryFn: async () => {
      if (!ssuId) return null;
      return resolveGodotUrl({
        ssuId,
        bazaarType,
        walletAddress,
        tribeId,
        caps,
        tribeCaps,
        onChainSSUUrl,
        onChainTribeUrl,
      });
    },
  });

  const resolvedUrl = resolverQuery.data?.url ?? null;

  // ── Pending-update detection (mid-session on-chain URL change) ────────────

  useEffect(() => {
    if (!resolvedUrl) return;
    if (resolvedUrlRef.current === null) {
      // First successful resolution — store as baseline; no pending update.
      resolvedUrlRef.current = resolvedUrl;
      return;
    }
    if (resolvedUrl !== resolvedUrlRef.current) {
      setHasPendingUpdate(true);
    }
  }, [resolvedUrl]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const retry = useCallback(() => {
    setGeneration((g) => g + 1);
  }, []);

  const clearOverride = useCallback(() => {
    if (ssuId) removeOverride(ssuId);
    setGeneration((g) => g + 1);
  }, [ssuId]);

  const applyPending = useCallback(() => {
    window.location.reload();
  }, []);

  const dismissPending = useCallback(() => {
    setHasPendingUpdate(false);
    // Update the baseline to the current resolved URL so future changes are
    // detected relative to the dismissed state.
    if (resolvedUrl) resolvedUrlRef.current = resolvedUrl;
  }, [resolvedUrl]);

  return {
    url: resolvedUrl,
    source: resolverQuery.data?.source ?? null,
    isLoading: resolverQuery.isLoading,
    retry,
    clearOverride,
    hasPendingUpdate,
    applyPending,
    dismissPending,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
