// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useUnclaimedItems — resolve unclaimed items for the connected wallet at a given SSU.
 *
 * Resolution strategy:
 *   1. Delegate to useSSUSharedObjects(ssuId) to obtain userStorageId.
 *   2. getObject(userStorageId) → extract unclaimed_items.fields.id.id (Table UID).
 *   3. getDynamicFields(tableUid, limit 200) → list all item entries.
 *   4. getDynamicFieldObject per entry → filter value.original_owner === walletAddress.
 *   5. Map to UnclaimedItem[]. Poll every 30s.
 *
 * Move struct truth (BazaarCore/sources/user_storage.move:38-57):
 *   UserStorage.unclaimed_items: Table<ID, UnclaimedItem>
 *   UnclaimedItem { original_owner, item_type_id, quantity, shop_id: ID, expiry_ms }
 *   NO unclaimed_at_ms or confiscatable_after_ms.
 *   Table is keyed by item ID (not player address) — filter by original_owner post-enum.
 *
 * INTERFACE DELTA (Phase 2 migration required):
 *   Removed: unclaimedAtMs, confiscatableAfterMs — these fields do not exist on-chain.
 *   Consumers in TribeGovernancePanel / admin tabs that reference these fields must be
 *   updated in Phase 2 of OS-54-followup.
 *
 * OS-54-followup FE-A Phase 1.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useEffect, useCallback } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { suiClient } from "./sui-client";
import { useSSUSharedObjects } from "./bazaarcore/governance-resolution-hooks";

export interface UnclaimedItem {
  /** EVE item type ID. */
  typeId:    number;
  quantity:  number;
  /** Sui object ID of the originating shop. */
  shopId:    string;
  /** Unix timestamp (ms) after which the item expires and can be confiscated. */
  expiryMs:  number;
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Returns unclaimed items in the given SSU's UserStorage that belong to the
 * currently connected wallet.
 *
 * @param ssuId - SSU address (0x-prefixed hex), or null to disable.
 */
export function useUnclaimedItems(ssuId: string | null): {
  items:     UnclaimedItem[];
  isLoading: boolean;
  error:     string | null;
  refetch:   () => void;
} {
  const { walletAddress }          = useConnection();
  const { data: sharedObjs }       = useSSUSharedObjects(ssuId);

  const [items, setItems]          = useState<UnclaimedItem[]>([]);
  const [isLoading, setIsLoading]  = useState(false);
  const [error, setError]          = useState<string | null>(null);
  const [tick, setTick]            = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  const userStorageId = sharedObjs?.userStorageId ?? null;

  useEffect(() => {
    if (!walletAddress || !userStorageId) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function load() {
      try {
        // Step 1: getObject(userStorageId) → extract unclaimed_items Table UID.
        const storageObj = await suiClient.getObject({
          id: userStorageId!,
          options: { showContent: true },
        });

        const storageFields = (storageObj.data?.content as { fields?: Record<string, unknown> } | undefined)
          ?.fields;
        const tableUid = (storageFields?.unclaimed_items as { fields?: { id?: { id?: string } } } | undefined)
          ?.fields?.id?.id;

        if (!tableUid || cancelled) {
          if (!cancelled) { setItems([]); setError(null); setIsLoading(false); }
          return;
        }

        // Step 2: getDynamicFields on the unclaimed_items Table.
        const dfPage = await suiClient.getDynamicFields({
          parentId: tableUid,
          limit:    200,
        });

        if (cancelled) return;

        // Step 3: getDynamicFieldObject for each entry.
        const entries = await Promise.all(
          dfPage.data.map(async (df) =>
            suiClient.getDynamicFieldObject({
              parentId: tableUid,
              name:     df.name,
            }),
          ),
        );

        if (cancelled) return;

        // Step 4: filter by original_owner and map to UnclaimedItem.
        const result: UnclaimedItem[] = [];
        for (const entry of entries) {
          const val = (entry.data?.content as { fields?: Record<string, unknown> } | undefined)
            ?.fields;
          if (!val) continue;
          // Dynamic field value is the UnclaimedItem struct.
          const value = val.value as Record<string, unknown> | undefined;
          if (!value) continue;

          const owner = String(value.original_owner ?? "");
          if (owner.toLowerCase() !== (walletAddress ?? "").toLowerCase()) continue;

          result.push({
            typeId:   Number(value.item_type_id ?? 0),
            quantity: Number(value.quantity ?? 0),
            shopId:   String(value.shop_id ?? ""),
            expiryMs: Number(value.expiry_ms ?? 0),
          });
        }

        if (!cancelled) {
          setItems(result);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load unclaimed items");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [walletAddress, userStorageId, tick]);

  // Poll for updates every 30s.
  useEffect(() => {
    if (!walletAddress || !userStorageId) return;
    const timer = setInterval(refetch, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [walletAddress, userStorageId, refetch]);

  return { items, isLoading, error, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
