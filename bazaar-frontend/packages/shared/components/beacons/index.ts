// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// beacons/index.ts — Barrel re-export for all beacon components.
// Used by packages/shared/components/index.ts and BeaconLayer.tsx.

export { default as AnnouncementBeacon } from "./AnnouncementBeacon";
export { default as GuestbookBeacon } from "./GuestbookBeacon";
export { default as ExchangeBeacon } from "./ExchangeBeacon";
export { default as ShopHologram } from "./ShopHologram";
export { default as ShopStackPicker } from "./ShopStackPicker";
export { default as FloatingShopNode } from "./FloatingShopNode";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
