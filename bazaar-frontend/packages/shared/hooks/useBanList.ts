// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useBanList — resolve currently banned members for a given SSU.
 *
 * Resolution strategy:
 *   1. Delegate to useSSUSharedObjects(ssuId) to obtain memberRegistryId.
 *   2. getObject(memberRegistryId) → extract members.fields.id.id (Table UID).
 *   3. getDynamicFields(tableUid, limit 200) → list all member entries.
 *   4. getDynamicFieldObject per entry → filter is_banned === true.
 *   5. Return BannedEntry[].
 *
 * Move struct truth (BazaarCore/sources/membership.move:26-41):
 *   MemberRegistry.members: Table<address, MemberEntry>
 *   MemberEntry { player, ssu_role, tribe_role, is_banned: bool, registered_at_ms: u64 }
 *   NO ban_list field — bans are boolean flags on MemberEntry.
 *
 * OS-54-followup FE-A Phase 1.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useEffect, useCallback } from "react";
import { suiClient } from "./sui-client";
import { useSSUSharedObjects } from "./bazaarcore/governance-resolution-hooks";

export interface BannedEntry {
  address:  string;
  /**
   * @deprecated Bans are now boolean flags (is_banned) on MemberEntry.
   * This field is populated with registered_at_ms for interface back-compat.
   * Consumer cleanup deferred to Phase 2 migration.
   */
  expiryMs: number;
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Returns all banned members for the given SSU.
 *
 * @param ssuId - SSU address (0x-prefixed hex), or null to disable.
 */
export function useBanList(
  ssuId: string | null,
): { banned: BannedEntry[]; refetch: () => void } {
  const { data: sharedObjs } = useSSUSharedObjects(ssuId);

  const [banned, setBanned]   = useState<BannedEntry[]>([]);
  const [tick, setTick]       = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  const memberRegistryId = sharedObjs?.memberRegistryId ?? null;

  useEffect(() => {
    if (!memberRegistryId) {
      setBanned([]);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        // Step 1: getObject(memberRegistryId) → extract members Table UID.
        const regObj = await suiClient.getObject({
          id: memberRegistryId!,
          options: { showContent: true },
        });

        const regFields = (regObj.data?.content as { fields?: Record<string, unknown> } | undefined)
          ?.fields;
        const tableUid = (regFields?.members as { fields?: { id?: { id?: string } } } | undefined)
          ?.fields?.id?.id;

        if (!tableUid || cancelled) return;

        // Step 2: getDynamicFields on the members Table.
        const dfPage = await suiClient.getDynamicFields({
          parentId: tableUid,
          limit:    200,
        });

        if (cancelled) return;

        // Step 3: getDynamicFieldObject for each entry, filter is_banned === true.
        const entries = await Promise.all(
          dfPage.data.map(async (df) => {
            const entryObj = await suiClient.getDynamicFieldObject({
              parentId: tableUid,
              name:     df.name,
            });
            return entryObj;
          }),
        );

        if (cancelled) return;

        const result: BannedEntry[] = [];
        for (const entry of entries) {
          const val = (entry.data?.content as { fields?: Record<string, unknown> } | undefined)
            ?.fields;
          if (!val) continue;
          // Dynamic field structure: { key: address, value: MemberEntry }
          const value = val.value as Record<string, unknown> | undefined;
          const isBanned = value?.is_banned === true;
          if (!isBanned) continue;
          const addr = String(val.key ?? "");
          const registeredAtMs = Number(value?.registered_at_ms ?? 0);
          result.push({ address: addr, expiryMs: registeredAtMs });
        }

        if (!cancelled) setBanned(result);
      } catch (err) {
        if (!cancelled) {
          console.warn("[useBanList] Failed to load ban list:", err);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [memberRegistryId, tick]);

  // Poll for updates every 30s.
  useEffect(() => {
    if (!memberRegistryId) return;
    const timer = setInterval(refetch, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [memberRegistryId, refetch]);

  return { banned, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
