// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/components/inventory — Shared inventory UI sub-components.
 *
 * Consumed by: apps/notribe (Phase 8a), apps/easy (Phase 8b), apps/advanced (Phase 8c).
 * Shell screens (InventoryScreen.tsx per app) import from here.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

export { default as StorageMeter }     from "./StorageMeter";
export { default as UnclaimedSection } from "./UnclaimedSection";

export type { StorageMeterProps }     from "./StorageMeter";
export type { UnclaimedSectionProps } from "./UnclaimedSection";

// R2.4: InventoryPage default export — used by bazaar app App.tsx files.
export { default as InventoryPage } from "./InventoryPage";

// Multi-SSU Visibility Phase 4: Global ownership tab + per-SSU group.
export { default as GlobalInventoryTab } from "./GlobalInventoryTab";
export { default as SSUInventoryGroup }  from "./SSUInventoryGroup";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
