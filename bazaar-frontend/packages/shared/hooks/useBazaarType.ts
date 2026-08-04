// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useBazaarType — resolves bazaar_type from SSURegistration for a given SSU ID.
 *
 * Reads the SSU_REGISTRY dynamic-field table. The bazaar_type field on
 * SSURegistration is immutable post-bootstrap (no Move setter exists),
 * so a 5-minute staleTime is safe and avoids redundant RPC calls during
 * normal rendering.
 *
 * Canonical CamelCase discriminants ("NoTribe" | "Easy" | "Advanced") are
 * used here (per R5.1 design spec §1.3) to align with JSX prop ergonomics:
 *   <BazaarFeature only="Advanced"> ...
 *
 * The existing lowercase BazaarType ("notribe" | "easy" | "advanced") used
 * by SSUSummary/TribeSummary interfaces is unaffected.
 *
 * File limit: 500 lines | Constitution Article XII.3
 */

import { useQuery } from "@tanstack/react-query";
import { SHARED_OBJECTS } from "../constants";
import { suiClient } from "./sui-client";

// ── Public type ────────────────────────────────────────────────────────────────

/** CamelCase bazaar type discriminant for JSX prop use.
 *  Maps on-chain bazaar_type u8: 0=NoTribe, 1=Easy, 2=Advanced. */
export type BazaarTypeName = "NoTribe" | "Easy" | "Advanced";

export interface UseBazaarTypeResult {
  /** Resolved bazaar type for the SSU.
   *  null when ssuId is null/undefined, SSU is unregistered, or query is loading. */
  bazaarType: BazaarTypeName | null;
  isLoading: boolean;
  error: Error | null;
}

// ── Internal constants ─────────────────────────────────────────────────────────

const BAZAAR_TYPE_MAP: Record<number, BazaarTypeName> = {
  0: "NoTribe",
  1: "Easy",
  2: "Advanced",
};

/** 5 minutes — bazaar_type has no setter in Move (Part 1 §9 invariant). */
const STALE_TIME_MS = 5 * 60 * 1000;

/** 30 minutes garbage collection window. */
const GC_TIME_MS = 30 * 60 * 1000;

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Resolves the bazaar_type for a given SSU from the SSURegistration shared
 * object via Sui RPC.
 *
 * @param ssuId  SSU object ID string. Pass null or undefined to skip the
 *               query and receive { bazaarType: null, isLoading: false }.
 */
export function useBazaarType(
  ssuId: string | null | undefined,
): UseBazaarTypeResult {
  const enabled = !!ssuId;

  const q = useQuery<BazaarTypeName | null, Error>({
    queryKey: ["bazaar-type", ssuId ?? null],
    enabled,
    staleTime: STALE_TIME_MS,
    gcTime:    GC_TIME_MS,
    retry:     1,
    queryFn:   async (): Promise<BazaarTypeName | null> => {
      if (!ssuId) return null;

      // Step 1: Read top-level SSU_REGISTRY to get the registrations Table ID.
      const registryResult = await suiClient.getObject({
        id: SHARED_OBJECTS.SSU_REGISTRY,
        options: { showContent: true },
      });
      const registryContent = registryResult.data?.content as
        | { fields?: Record<string, unknown> }
        | undefined;
      const registryFields = registryContent?.fields;
      if (!registryFields) return null;

      const regsTable = registryFields.registrations as
        | { fields?: { id?: { id?: string } } }
        | undefined;
      const tableId = regsTable?.fields?.id?.id;
      if (!tableId) return null;

      // Step 2: Fetch the dynamic field entry for this ssuId.
      try {
        const entry = await suiClient.getDynamicFieldObject({
          parentId: tableId,
          name: { type: "address", value: ssuId },
        });

        // Unwrap the Field<address, SSURegistration> value struct.
        const wrapperFields = (entry.data?.content as
          | { fields?: Record<string, unknown> }
          | undefined)?.fields;
        if (!wrapperFields) return null;

        const valueFields = (wrapperFields.value as
          | { fields?: Record<string, unknown> }
          | undefined)?.fields;
        if (!valueFields) return null;

        const rawBt = Number(valueFields.bazaar_type ?? 0);
        return BAZAAR_TYPE_MAP[rawBt] ?? null;
      } catch {
        // SSU not registered — return null rather than throwing.
        return null;
      }
    },
  });

  // Short-circuit: no ssuId → synchronous null result, no pending query.
  if (!enabled) {
    return { bazaarType: null, isLoading: false, error: null };
  }

  return {
    bazaarType: q.data ?? null,
    isLoading:  q.isLoading,
    error:      (q.error as Error) ?? null,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
