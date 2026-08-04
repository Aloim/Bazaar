// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — barrel exports for the announcement-gating hooks.
 *
 * Consumers in the 3 bazaar apps (NoTribe / Easy / Advanced) import from
 * `@bazaar/shared/hooks/announcements`. DappHub source must NOT import
 * `useDAppActionsEnabled` or `useGatedTransaction` — enforced at
 * `packages/shared/__tests__/dapphub-exempt.test.ts`. DappHub MAY import
 * `useDAppAnnouncements` for banner data.
 */

export { useDAppAnnouncements } from "./useDAppAnnouncements";
export type {
  UseDAppAnnouncementsOptions,
  UseDAppAnnouncementsResult,
} from "./useDAppAnnouncements";

export { useDAppActionsEnabled } from "./useDAppActionsEnabled";
export type { UseDAppActionsEnabledResult } from "./useDAppActionsEnabled";

export { useGatedTransaction } from "./useGatedTransaction";
export type {
  GatedBuilderFn,
  GatedTxOptions,
  UseGatedTransactionResult,
} from "./useGatedTransaction";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
