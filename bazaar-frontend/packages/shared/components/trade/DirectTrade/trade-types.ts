// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/DirectTrade.tsx (lines 20-34; split for 500-line guard, section: trade-types).
// Re-imported into ./index.tsx and ./CreateTradeTab.tsx.

export interface WantItem {
  typeId:   number;
  quantity: number;
}

export interface GiveItem {
  typeId:      number;
  quantity:    number;
  objectId?:   string;
}

export type ActiveTab = "create" | "requests";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
