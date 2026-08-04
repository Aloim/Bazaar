// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useMemo, useState, useEffect, useCallback } from "react";
import { useSSUInventory } from "./useSSUInventory";
import { useUserStorage } from "./useUserStorage";
import { useShops } from "./useShops";
import { usePlayerCharacter } from "./usePlayerCharacter";
import { resolveSSUOwnerCap } from "@bazaar/shared/tx/bazaarcore/ssu-receiving-tx";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";

/**
 * A single inventory slot as seen by the connected player.
 * lockedQuantity is the portion reserved by an active shop.
 * Shape matches Bazar1 OwnedInventoryItem — consumed by InventoryPage and pickers.
 */
export interface OwnedInventoryItem {
  typeId:            number;
  quantity:          number;
  volume:            number;
  lockedQuantity:    number;
  lockingShopId?:    string;
  lockingShopTitle?: string;
}

export interface OwnedInventoryResult {
  items:     OwnedInventoryItem[];
  isLoading: boolean;
  error:     string | null;
  refetch:   () => void;
}

/**
 * Returns only the current player's personal inventory items from the SSU.
 *
 * Inventory key mapping (dynamic field keys on the EVE Frontier SSU object):
 *   - SSU owner  → OwnerCap<StorageUnit> ID (the "main" storage slot in-game)
 *   - Regular player → OwnerCap<Character> ID (personal locker)
 *
 * Merges with UserStorage locked items to surface shop-claim escrow quantities.
 *
 * @param ssuId Optional SSU object ID override. Defaults to SSU_OBJECT_ID from URL params.
 */
export function useOwnedInventory(ssuId?: string): OwnedInventoryResult {
  const { items: allSsuItems, isLoading: ssuLoading, error: ssuError, refetch: refetchSsu } =
    useSSUInventory(ssuId);
  const { lockedItems, isLoading: storageLoading, error: storageError, refetch: refetchStorage } =
    useUserStorage();
  const { shops } = useShops();
  const { character, isLoading: charLoading } = usePlayerCharacter();

  // Resolve the SSU's OwnerCap<StorageUnit> ID to detect if the connected wallet is the SSU owner.
  // If they are, their items are in the "main" inventory slot (keyed by the SSU OwnerCap ID).
  const resolvedSsuId = ssuId ?? SSU_OBJECT_ID;
  const [ssuOwnerCapId, setSsuOwnerCapId] = useState<string | null>(null);
  useEffect(() => {
    if (!character) { setSsuOwnerCapId(null); return; }
    let aborted = false;
    resolveSSUOwnerCap(character.characterId, resolvedSsuId)
      .then(cap => { if (!aborted) setSsuOwnerCapId(cap?.ssuCapId ?? null); })
      .catch(() => { if (!aborted) setSsuOwnerCapId(null); });
    return () => { aborted = true; };
  }, [character, resolvedSsuId]);

  const refetch = useCallback(() => { refetchSsu(); refetchStorage(); }, [refetchSsu, refetchStorage]);

  // Filter SSU dynamic-field items to only this player's personal inventory slot.
  // allowedKey = SSU OwnerCap ID when connected wallet is the SSU owner,
  //              otherwise the player's own Character OwnerCap ID.
  const playerItems = useMemo(() => {
    if (!character) return [];
    const allowedKey = ssuOwnerCapId ?? character.ownerCapId;
    return allSsuItems.filter(it => it.inventoryKey === allowedKey);
  }, [allSsuItems, character, ssuOwnerCapId]);

  // Build shopId -> title lookup for lock label resolution.
  const shopTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of shops) m.set(s.id, s.title);
    return m;
  }, [shops]);

  // Build itemTypeId -> LockedItem lookup for O(1) merge with locked quantities.
  const lockByTypeId = useMemo(() => {
    const m = new Map<number, { quantity: number; shopId: string }>();
    for (const lock of lockedItems) {
      if (!m.has(lock.itemTypeId)) {
        m.set(lock.itemTypeId, { quantity: lock.quantity, shopId: lock.shopId });
      }
    }
    return m;
  }, [lockedItems]);

  // Aggregate by typeId (owner can have same item in multiple inventory sub-slots).
  const aggregated = useMemo(() => {
    const byType = new Map<number, { quantity: number; volume: number }>();
    for (const item of playerItems) {
      const existing = byType.get(item.typeId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        byType.set(item.typeId, { quantity: item.quantity, volume: item.volume });
      }
    }
    return byType;
  }, [playerItems]);

  const items: OwnedInventoryItem[] = useMemo(() => {
    return Array.from(aggregated.entries()).map(([typeId, { quantity, volume }]) => {
      const lock = lockByTypeId.get(typeId);
      if (!lock) {
        return { typeId, quantity, volume, lockedQuantity: 0 };
      }
      const shopTitle = shopTitleById.get(lock.shopId);
      return {
        typeId,
        quantity,
        volume,
        lockedQuantity:    lock.quantity,
        lockingShopId:     lock.shopId,
        lockingShopTitle:  shopTitle,
      };
    });
  }, [aggregated, lockByTypeId, shopTitleById]);

  const isLoading = ssuLoading || storageLoading || charLoading || (!character && !ssuError);
  const error     = ssuError ?? storageError;

  return { items, isLoading, error, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
