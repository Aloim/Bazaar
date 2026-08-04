// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore inventory hooks — useInventory, useUnclaimedItems, useStorageStats.
 *
 * RPC strategy (TODO at deployment):
 *   All read from UserStorage (per-SSU shared object, ID resolved from ssuId).
 *   player_items / unclaimed_items are Table entries accessed via getDynamicFieldObject.
 *
 * GAP NOTE (G-10): FrontendAPI spec mentions usedVolume/volumeLimit — Move has no volume
 * tracking. StorageStats exposes count-based fields only.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import type { OwnedInventoryItem, StorageStats } from "../../types/bazaarcore";
import { suiClient } from "../sui-client";

// ── useInventory ───────────────────────────────────────────────────────────────

/**
 * Fetch all stored items for walletAddress at a given SSU.
 * Move source: bazaar_core::user_storage::UserStorage.deposits.
 * C5/GAS-03 (V39): deposits is now Table<address, Table<u64, StoredItem>> — the
 * per-player value is a nested Table keyed by item_type_id (no longer an inline
 * vector). RPC: getDynamicFieldObject(deposits, key=walletAddress) → the inner
 * Table's id → enumerate its dynamic fields → each is a StoredItem.
 * NOTE: this hook has no live caller (live inventory reads the EVE Frontier world
 * locker); kept correct-for-shape for any future revival.
 */
export function useInventory(walletAddress: string | null, ssuId: string | null) {
  return useQuery<OwnedInventoryItem[]>({
    queryKey: ["bazaarcore", "inventory", walletAddress, ssuId],
    enabled: !!(walletAddress && ssuId),
    queryFn: async (): Promise<OwnedInventoryItem[]> => {
      try {
        // deposits[walletAddress] is a Table<u64, StoredItem> (C5/GAS-03).
        // ssuId param is the UserStorage object ID (caller's responsibility per FP1-24 ext).
        const resp = await suiClient.getDynamicFieldObject({
          parentId: ssuId!,
          name: { type: "address", value: walletAddress! },
        });
        const innerTableId = (resp.data?.content as
          { fields?: { value?: { fields?: { id?: { id?: string } } } } } | undefined)
          ?.fields?.value?.fields?.id?.id;
        if (!innerTableId) return [];

        // Enumerate the inner Table's dynamic fields (one per item_type_id).
        const names: Array<{ type: string; value: unknown }> = [];
        let cursor: string | null = null;
        do {
          const page = await suiClient.getDynamicFields({ parentId: innerTableId, cursor });
          for (const d of page.data) names.push(d.name as { type: string; value: unknown });
          cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
        } while (cursor);

        const rows = await Promise.all(names.map(async (name): Promise<OwnedInventoryItem | null> => {
          const row = await suiClient.getDynamicFieldObject({ parentId: innerTableId, name });
          const item = (row.data?.content as
            { fields?: { value?: { fields?: Record<string, unknown> } } } | undefined)
            ?.fields?.value?.fields;
          if (!item) return null;
          const shopOpt = item.source_shop_id as { fields?: { vec?: string[] } } | undefined;
          return {
            itemTypeId:    Number(item.item_type_id ?? 0),
            quantity:      Number(item.quantity ?? 0),
            sourceShopId:  shopOpt?.fields?.vec?.[0] ?? null,
            depositedAtMs: Number(item.deposited_at_ms ?? 0),
          };
        }));
        return rows.filter((r): r is OwnedInventoryItem => r !== null);
      } catch {
        return [];
      }
    },
    staleTime: 15_000,
  });
}

// ── useStorageStats ────────────────────────────────────────────────────────────

/**
 * Fetch count-based storage statistics for walletAddress at a given SSU.
 * Move source: UserStorage.total_item_count (u64) + the per-player deposits Table size.
 * C5/GAS-03 (V39): the per-player value is a Table<u64, StoredItem> — its distinct-type
 * count is the Table's `size` field. NOTE: volume tracking does not exist in Move — spec
 * fields usedVolume/volumeLimit are deferred (G-10 gap). No live caller (hygiene only).
 */
export function useStorageStats(walletAddress: string | null, ssuId: string | null) {
  return useQuery<StorageStats>({
    queryKey: ["bazaarcore", "storage-stats", walletAddress, ssuId],
    enabled: !!(walletAddress && ssuId),
    queryFn: async (): Promise<StorageStats> => {
      // UserStorage top-level: `total_item_count: u64`.
      const obj = await suiClient.getObject({
        id: ssuId!,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      const totalItemCount = Number(fields?.total_item_count ?? 0);
      // Player's stack count = distinct item_type_ids = the inner Table's `size`.
      let itemStackCount = 0;
      try {
        const dep = await suiClient.getDynamicFieldObject({
          parentId: ssuId!,
          name: { type: "address", value: walletAddress! },
        });
        const innerTable = (dep.data?.content as
          { fields?: { value?: { fields?: { size?: unknown } } } } | undefined)
          ?.fields?.value?.fields;
        itemStackCount = Number(innerTable?.size ?? 0);
      } catch {
        itemStackCount = 0;
      }
      return { itemStackCount, totalItemCount };
    },
    staleTime: 20_000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
