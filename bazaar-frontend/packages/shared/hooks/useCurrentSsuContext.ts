// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useCurrentSsuContext — resolves the current SSU's bazaar type AND tribe id in
 * a single SSURegistration read, for the shop-tier classifier (shopTier.ts).
 *
 * Mirrors useBazaarType's registry-read path but also extracts tribe_id (which
 * useBazaarType discards). SSURegistration is immutable post-bootstrap (no Move
 * setter), so a 5-minute staleTime is safe.
 *
 * SSURegistration (DappHub/sources/ssu_registry.move:21):
 *   { ssu_id, owner, tribe_id: u64 (0 for NoTribe), bazaar_type: u8, … }
 * stored in SSURegistry.registrations: Table<address, SSURegistration>.
 */

import { useQuery } from "@tanstack/react-query";
import { SHARED_OBJECTS, SSU_OBJECT_ID } from "../constants";
import { suiClient } from "./sui-client";
import type { BazaarTypeName } from "./useBazaarType";

const BAZAAR_TYPE_MAP: Record<number, BazaarTypeName> = { 0: "NoTribe", 1: "Easy", 2: "Advanced" };
const STALE_TIME_MS = 5 * 60 * 1000;
const GC_TIME_MS = 30 * 60 * 1000;

export interface CurrentSsuContext {
  ssuId:      string;
  bazaarType: BazaarTypeName | null;
  tribeId:    number | null;
  isLoading:  boolean;
}

/**
 * @param ssuId  SSU object id. Defaults to SSU_OBJECT_ID (the current app's SSU).
 */
export function useCurrentSsuContext(ssuId: string = SSU_OBJECT_ID): CurrentSsuContext {
  const enabled = !!ssuId;

  const q = useQuery<{ bazaarType: BazaarTypeName | null; tribeId: number | null }, Error>({
    queryKey: ["current-ssu-context", ssuId ?? null],
    enabled,
    staleTime: STALE_TIME_MS,
    gcTime:    GC_TIME_MS,
    retry:     1,
    queryFn:   async () => {
      const empty = { bazaarType: null, tribeId: null };
      if (!ssuId) return empty;

      // Step 1: SSU_REGISTRY → registrations Table id.
      const registryResult = await suiClient.getObject({
        id: SHARED_OBJECTS.SSU_REGISTRY,
        options: { showContent: true },
      });
      const registryFields = (registryResult.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      const regsTable = registryFields?.registrations as { fields?: { id?: { id?: string } } } | undefined;
      const tableId = regsTable?.fields?.id?.id;
      if (!tableId) return empty;

      // Step 2: dynamic field entry for this ssuId.
      try {
        const entry = await suiClient.getDynamicFieldObject({
          parentId: tableId,
          name: { type: "address", value: ssuId },
        });
        const wrapperFields = (entry.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
        const valueFields = (wrapperFields?.value as { fields?: Record<string, unknown> } | undefined)?.fields;
        if (!valueFields) return empty;

        const bazaarType = BAZAAR_TYPE_MAP[Number(valueFields.bazaar_type ?? 0)] ?? null;
        const rawTribe = valueFields.tribe_id;
        const tribeId = rawTribe != null ? Number(rawTribe) : null;
        return { bazaarType, tribeId };
      } catch {
        return empty; // SSU unregistered.
      }
    },
  });

  if (!enabled) {
    return { ssuId, bazaarType: null, tribeId: null, isLoading: false };
  }

  return {
    ssuId,
    bazaarType: q.data?.bazaarType ?? null,
    tribeId:    q.data?.tribeId ?? null,
    isLoading:  q.isLoading,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
