// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — `useAnchorRegistry`.
 *
 * Reads `dapp_hub::anchor_registry::AnchorRegistry`. The anchors table is
 * paginated via `suix_getDynamicFields`; per-row anchor data is fetched via
 * `suix_getDynamicFieldObject`. At expected scale (<10 anchors/year × ~5y =
 * <50 rows) a single page is enough.
 *
 * No auto-polling by default — backup history changes only when admin clicks
 * "Create Backup" from the same browser. Optional `pollIntervalMs` for the
 * dashboard scenario.
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { suiClient } from "../sui-client";
import { ANCHOR_REGISTRY_ID } from "../../constants";

export interface AnchorRow {
  id: number;
  checkpoint: number;
  hash: Uint8Array;
  schemaVersion: string;
  ipfsCid: string;
  postedAtMs: number;
  note: string;
  postedBy: string;
}

export interface UseAnchorRegistryOptions {
  /** Override the global AnchorRegistry shared object ID. */
  anchorRegistryId?: string;
  /** When set, the hook polls at this cadence (ms). Default: no polling. */
  pollIntervalMs?: number;
}

export interface UseAnchorRegistryResult {
  anchors: AnchorRow[];   // sorted id DESC (newest first)
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

function toNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function decodeHash(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (Array.isArray(raw)) {
    // RPC returns vector<u8> as number[].
    return Uint8Array.from(raw as number[]);
  }
  if (typeof raw === "string") {
    // Base64 fallback.
    try {
      return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    } catch {
      return new Uint8Array();
    }
  }
  return new Uint8Array();
}

function parseAnchor(fields: Record<string, unknown>): AnchorRow {
  return {
    id: toNumber(fields.id),
    checkpoint: toNumber(fields.checkpoint),
    hash: decodeHash(fields.hash),
    schemaVersion: (fields.schema_version as string) ?? "",
    ipfsCid: (fields.ipfs_cid as string) ?? "",
    postedAtMs: toNumber(fields.posted_at_ms),
    note: (fields.note as string) ?? "",
    postedBy: (fields.posted_by as string) ?? "",
  };
}

export function useAnchorRegistry(
  opts?: UseAnchorRegistryOptions,
): UseAnchorRegistryResult {
  const registryId = opts?.anchorRegistryId ?? ANCHOR_REGISTRY_ID;
  const pollMs = opts?.pollIntervalMs;

  const [anchors, setAnchors] = useState<AnchorRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!registryId) {
      setAnchors([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const myReq = ++reqIdRef.current;

    async function loadAll() {
      setIsLoading(true);
      try {
        // First, locate the table parent ID via the registry's content fields.
        const regObj = await suiClient.getObject({
          id: registryId,
          options: { showContent: true },
        });
        if (cancelled || myReq !== reqIdRef.current) return;
        const regContent = regObj.data?.content as { fields?: Record<string, unknown> } | undefined;
        const tableFields = regContent?.fields?.anchors as { fields?: { id?: { id?: string } } } | undefined;
        const tableUid = tableFields?.fields?.id?.id;
        if (!tableUid) {
          setAnchors([]);
          setError(null);
          return;
        }

        const fieldsPage = await suiClient.getDynamicFields({
          parentId: tableUid,
          limit: 200,
        });
        if (cancelled || myReq !== reqIdRef.current) return;

        const rows: AnchorRow[] = [];
        for (const df of fieldsPage.data) {
          const obj = await suiClient.getDynamicFieldObject({
            parentId: tableUid,
            name: df.name,
          });
          if (cancelled || myReq !== reqIdRef.current) return;
          const dfFields = (obj.data?.content as { fields?: { value?: { fields?: Record<string, unknown> } } } | undefined)?.fields?.value?.fields;
          if (dfFields) rows.push(parseAnchor(dfFields));
        }

        rows.sort((a, b) => b.id - a.id);
        setAnchors(rows);
        setError(null);
      } catch (err) {
        if (cancelled || myReq !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && myReq === reqIdRef.current) setIsLoading(false);
      }
    }

    void loadAll();
    if (pollMs && pollMs > 0) {
      const timer = window.setInterval(loadAll, pollMs);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [registryId, pollMs, tick]);

  return { anchors, isLoading, error, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
