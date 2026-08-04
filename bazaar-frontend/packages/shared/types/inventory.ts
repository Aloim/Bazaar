/**
 * inventory.ts — Inventory-related type definitions for marketplace items and storage.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

// Inventory type shapes for Phase C hooks.
// These types will be consumed by useSSUInventory, useOwnedInventory,
// useUserStorage, and useUnclaimedItems — all landing in Phase C.
// Mirrors already exist in types/bazaarcore.ts for OwnedInventoryItem,
// UnclaimedItem, StorageStats.  This file adds the aggregated view shapes
// and hook return types that the Phase C hooks will expose.

import type { OwnedInventoryItem, UnclaimedItem, StorageStats } from "./bazaarcore";

// Re-export core item shapes so consumers can import from one place.
export type { OwnedInventoryItem, UnclaimedItem, StorageStats };

// ── Inventory view shapes ──────────────────────────────────────────────────────

/**
 * Full inventory state for the Inventory panel.
 * `mainItems`   — items in the player's main storage slot (deposited by player).
 * `lockerItems` — items in the player's locker slot (shop-purchased, deposited by owner).
 */
export interface InventoryView {
  mainItems:    OwnedInventoryItem[];
  lockerItems:  OwnedInventoryItem[];
  stats:        StorageStats;
}

/**
 * Result shape returned by useSSUInventory.
 * Fetches raw item vectors from UserStorage dynamic fields via Sui RPC pagination.
 */
export interface UseSSUInventoryResult {
  inventory:  InventoryView | null;
  isLoading:  boolean;
  error:      string | null;
  refetch:    () => void;
}

/**
 * Result shape returned by useOwnedInventory.
 * Selects the correct inventory branch based on whether the connected wallet is
 * the SSU owner (locker branch) or a visitor (main branch).
 */
export interface UseOwnedInventoryResult {
  items:      OwnedInventoryItem[];
  isOwner:    boolean;
  isLoading:  boolean;
  error:      string | null;
  refetch:    () => void;
}

/**
 * Result shape returned by useUserStorage.
 * Wraps UseSSUInventoryResult with an `isLocked` flag indicating whether the
 * UserStorage is shop-locked (i.e. the player has an active shop and cannot
 * withdraw items without closing it first).
 */
export interface UseUserStorageResult extends UseSSUInventoryResult {
  isLocked: boolean;
}

/**
 * Result shape returned by useUnclaimedItems.
 * Lists all items awaiting claim from the unclaimed_items Table on UserStorage.
 */
export interface UseUnclaimedItemsResult {
  items:     UnclaimedItem[];
  isLoading: boolean;
  error:     string | null;
  refetch:   () => void;
}
