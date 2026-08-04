// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/components/trade — Shared Direct Trade UI primitives.
 *
 * Consumed by: apps/notribe, apps/easy (Phase 8b), apps/advanced (Phase 8c).
 * Shell screens (DirectTradeScreen.tsx per app) import from here.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

export { default as CreateTradeTab }    from "./CreateTradeTab";
export { default as TradeRequestsTab }  from "./TradeRequestsTab";
export { default as ProposalRow }       from "./ProposalRow";
export { default as TradeProposalView } from "./TradeProposalView";
export { default as ItemRowEditor }     from "./ItemRowEditor";

export type { CreateTradeTabProps }    from "./CreateTradeTab";
export type { TradeRequestsTabProps }  from "./TradeRequestsTab";
export type { ProposalRowProps }       from "./ProposalRow";
export type { TradeProposalViewProps } from "./TradeProposalView";
export type { ItemRowEditorProps }     from "./ItemRowEditor";

// R2.4: DirectTrade default export — used by bazaar app App.tsx files.
export { default as DirectTrade } from "./DirectTrade";
// V26 D6: AdvancedDirectTrade — currency-only (EVE + tribe-token) trade flow
// for Advanced bazaars. Mounted via apps/advanced/src/App.tsx.
export { default as AdvancedDirectTrade } from "./AdvancedDirectTrade";
// R2.4: QuicktradePanel default export — used by bazaar app App.tsx files.
export { default as QuicktradePanel } from "./QuicktradePanel";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
