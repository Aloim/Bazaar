// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { SHARED_OBJECTS } from "../constants";
import { suiClient } from "./sui-client";

export interface SSUOwnerInfo {
  /** Wallet address that registered the SSU (its owner/registrant). */
  ownerAddress: string | null;
  /** Whether the SSU registration is currently active. */
  isActive: boolean;
}

/** Map of SSU object id → owner/status. */
export type SSUOwnerMap = Record<string, SSUOwnerInfo>;

type AnyFields = { fields?: Record<string, unknown> } | undefined;

/**
 * Resolves the owner address + active status for a list of SSU object ids by
 * reading SSURegistry.registrations (Table<address, SSURegistration>) — one
 * O(1)-keyed dynamic-field lookup per SSU, fanned out with Promise.all.
 *
 * `enabled` gates the whole query: pass `false` (e.g. for a COLLAPSED accordion
 * row) so RPC only fans out for the SSUs the user is actually looking at — the
 * row component is mounted for every tribe even when its body is hidden.
 *
 * The returned owner addresses are wallet addresses; resolve them to EVE
 * Frontier character display names with useCharacterNames. Fail-soft: a missing
 * or unreadable registration yields { ownerAddress: null, isActive: false }.
 */
export function useSSUOwners(ssuIds: readonly string[], enabled = true) {
  const idsKey = [...ssuIds].sort().join(",");
  return useQuery<SSUOwnerMap>({
    queryKey: ["ssu-owners", idsKey],
    enabled: enabled && ssuIds.length > 0,
    queryFn: async (): Promise<SSUOwnerMap> => {
      const reg = await suiClient.getObject({
        id: SHARED_OBJECTS.SSU_REGISTRY,
        options: { showContent: true },
      });
      const regTableId = ((reg.data?.content as AnyFields)?.fields?.registrations as
        { fields?: { id?: { id?: string } } } | undefined)?.fields?.id?.id;
      if (!regTableId) return {};

      const entries = await Promise.all(
        ssuIds.map(async (ssuId): Promise<[string, SSUOwnerInfo]> => {
          try {
            const r = await suiClient.getDynamicFieldObject({
              parentId: regTableId,
              name: { type: "address", value: ssuId },
            });
            const ef = ((r.data?.content as AnyFields)?.fields?.value as AnyFields)?.fields;
            if (!ef) return [ssuId, { ownerAddress: null, isActive: false }];
            return [ssuId, {
              ownerAddress: (ef.owner as string | undefined) ?? null,
              isActive: Boolean(ef.is_active),
            }];
          } catch {
            // not registered / unreadable → fail-soft
            return [ssuId, { ownerAddress: null, isActive: false }];
          }
        }),
      );
      return Object.fromEntries(entries);
    },
    staleTime: 30_000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
