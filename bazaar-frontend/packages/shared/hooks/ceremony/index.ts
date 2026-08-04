// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — barrel for the ceremony read hooks.
 *
 * Consumed by `<UpdateCeremonyTab />`, `<LegacySSUWithdrawButton />`, and
 * `<BackupHistoryList />`.
 */

export { useAnchorRegistry } from "./useAnchorRegistry";
export type { AnchorRow, UseAnchorRegistryResult, UseAnchorRegistryOptions } from "./useAnchorRegistry";

export { useLegacySsuEveBalance } from "./useLegacySsuEveBalance";
export type { UseLegacySsuEveBalanceResult } from "./useLegacySsuEveBalance";

export { useOutgoingWtbPoolResidual } from "./useOutgoingWtbPoolResidual";
export type {
  PerShopResidual,
  UseOutgoingWtbPoolResidualResult,
} from "./useOutgoingWtbPoolResidual";

export {
  useShopCountSummary,
  useActiveShopCountSummary,
  useActiveMissionCountSummary,
  useProposalCountSummary,
  useWithdrawalCountSummary,
} from "./useTableRowCounts";
export type { TableCountSummary } from "./useTableRowCounts";

export { useForceClosePlan } from "./useForceClosePlan";
export type {
  ForceClosePlan,
  ShopOwnerGroup,
  MissionDrainItem,
} from "./useForceClosePlan";

// UpdateCeremony V2 (Phase 2, Slice 5) — the connected wallet's reclaim records.
export { useReclaimRecords } from "./useReclaimRecords";
export type { ReclaimRecordView, UseReclaimRecordsResult } from "./useReclaimRecords";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
