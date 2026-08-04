// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";

/** Resolve the SSU object ID to query, falling back to the URL-param constant. */
function resolveSSUId(ssuId?: string): string {
  return ssuId ?? SSU_OBJECT_ID;
}

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

async function rpc(method: string, params: unknown[]): Promise<any> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error.message);
  return data.result;
}

export interface InventoryItem {
  typeId:       number;
  quantity:     number;
  volume:       number;
  /**
   * The dynamic field key (OwnerCap address) under which these items are stored on the SSU.
   * Use this to filter to a specific player's or the SSU owner's inventory slot.
   * Pass to useOwnedInventory (which filters by ssuOwnerCapId or character.ownerCapId).
   */
  inventoryKey?: string;
}

/**
 * Paginates the dynamic fields on the EVE Frontier SSU object to read all inventory slots.
 *
 * Each dynamic field is keyed by an OwnerCap address; the value is an inventory struct
 * containing a list of items (typeId, quantity, volume). useOwnedInventory delegates here
 * and filters by the player's ownerCapId (or the SSU OwnerCap ID for the SSU owner).
 *
 * Active consumers:
 *   - useOwnedInventory (player personal inventory — Phase 4.8 restored)
 *   - SSUStorageTab.tsx (admin full-SSU inventory view)
 *   - CreateShopModal/index.tsx (item picker for shop creation)
 *   - CreateTradeTab.tsx (item picker for direct trade offer)
 *
 * @param ssuId Optional SSU object ID override. Defaults to SSU_OBJECT_ID from URL params.
 */
export function useSSUInventory(ssuId?: string) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const objectId = resolveSSUId(ssuId);
    if (!objectId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function load() {
      // Step 1: Paginate all dynamic fields on the SSU
      const allFields: any[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const result = await rpc("suix_getDynamicFields", [
          objectId, cursor, 50,
        ]);
        const page: any[] = result?.data ?? [];
        allFields.push(...page);
        cursor = result?.nextCursor ?? null;
        hasMore = result?.hasNextPage === true && cursor !== null;
      }

      if (allFields.length === 0) {
        if (!cancelled) {
          setItems([]);
          setError(null);
          setIsLoading(false);
        }
        return;
      }

      // Step 2: Batch-fetch all field objects
      const objectIds = allFields
        .map((df: any) => df.objectId as string)
        .filter(Boolean);

      const multiResult = await rpc("sui_multiGetObjects", [
        objectIds,
        { showContent: true },
      ]);

      const allItems: InventoryItem[] = [];

      for (let i = 0; i < allFields.length; i++) {
        const df = allFields[i];
        const objData = (multiResult as any[])?.[i];

        // Extract inventory key (the dynamic field key — OwnerCap address)
        const keyAddress: string | undefined =
          df?.name?.value?.id ?? df?.name?.value ?? undefined;

        // Navigate to inventory items
        // Sui RPC wraps dynamic field values: data.content.fields.value.fields.items...
        const fields = objData?.data?.content?.fields;
        if (!fields) continue;

        // Dynamic field wrapper: the Inventory is in fields.value.fields
        // Fallback to fields directly for unwrapped shapes
        const inventoryFields = fields?.value?.fields ?? fields;
        const contents: any[] =
          inventoryFields?.items?.fields?.contents ??
          inventoryFields?.items?.contents ??
          [];

        for (const entry of contents) {
          // Table entries: { key, value } where value may be wrapped in { fields }
          const v = entry?.value?.fields ?? entry?.value ?? entry?.fields?.value?.fields ?? entry?.fields?.value;
          if (!v) continue;
          const qty = Number(v.quantity ?? 0);
          const typeId = Number(v.type_id ?? 0);
          if (typeId === 0 || qty <= 0) continue;

          allItems.push({
            typeId,
            quantity: qty,
            volume: Number(v.volume ?? 0),
            inventoryKey: typeof keyAddress === "string" ? keyAddress : undefined,
          });
        }
      }

      allItems.sort((a, b) => a.typeId - b.typeId);

      if (!cancelled) {
        setItems(allItems);
        setError(null);
        setIsLoading(false);
      }
    }

    load().catch((e: unknown) => {
      console.warn("[useSSUInventory] RPC load failed:", e);
      if (!cancelled) {
        setError(e instanceof Error ? e.message : "Failed to load inventory");
        setItems([]);
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [tick, ssuId]);

  return { items, isLoading, error, refetch };
}

/**
 * Convenience wrapper that filters useSSUInventory results to a single inventory slot
 * identified by its OwnerCap address (the dynamic field key on the SSU object).
 *
 * Use this when you need to display a specific player's or the SSU owner's items
 * from the full SSU dynamic-fields dump.
 *
 * @param inventoryKey The OwnerCap address keying the inventory slot (character ownerCapId or SSU ownerCapId).
 * @param ssuId Optional SSU object ID override.
 */
export function useSSUInventoryByKey(inventoryKey: string | undefined, ssuId?: string) {
  const { items, isLoading, error, refetch } = useSSUInventory(ssuId);
  const filtered = inventoryKey
    ? items.filter(it => it.inventoryKey === inventoryKey)
    : items;
  return { items: filtered, isLoading, error, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
