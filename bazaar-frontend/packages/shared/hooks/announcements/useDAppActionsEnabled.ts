// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — `useDAppActionsEnabled`.
 *
 * Returns `{ enabled, blockingWarning }` derived from the
 * DAppAnnouncementsContext's current `activeWarning`. Consumed by
 * `useGatedTransaction` and by component-level guards.
 *
 * IMPORTANT: Per CLAUDE.md Run #12 DappHub-EXEMPT posture, this hook MUST NOT
 * be imported by any file under `apps/dapphub/src/`. Enforced by the vitest
 * static-grep at `packages/shared/__tests__/dapphub-exempt.test.ts`.
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import { useDAppAnnouncementsContext } from "../../contexts/DAppAnnouncementsContext";
import type { Announcement } from "../../types/announcement";

export interface UseDAppActionsEnabledResult {
  /** True when no Warning row is currently active. */
  enabled: boolean;
  /** The active Warning, or null when enabled is true. */
  blockingWarning: Announcement | null;
}

export function useDAppActionsEnabled(): UseDAppActionsEnabledResult {
  const { activeWarning } = useDAppAnnouncementsContext();
  return {
    enabled: activeWarning === null,
    blockingWarning: activeWarning,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
