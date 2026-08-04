// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — DAppAnnouncementsProvider.
 *
 * One root-level provider per app that bundles two concerns into a single
 * context tree:
 *
 *   1. **Announcement polling state** — the `useDAppAnnouncements` result
 *      (announcements list + computed activeWarning + isLoading + refetch).
 *      Consumed by `<AnnouncementBanner />` and `useDAppActionsEnabled`.
 *
 *   2. **Blocked-action modal state** — `blockedWarning` + `signalBlocked` +
 *      `dismissBlocked`. `useGatedTransaction` calls `signalBlocked(activeWarning)`
 *      when it throws `ActionBlockedError`; `<ActionBlockedModal />` reads
 *      `blockedWarning` and renders when non-null.
 *
 * Separating into one context keeps the dependency graph simple
 * (useGatedTransaction → useDAppAnnouncementsContext only).
 *
 * Mount in 4 `main.tsx` files (DappHub + NoTribe + Easy + Advanced) between
 * `<ToastProvider>` and `<App />`.
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import {
  useDAppAnnouncements,
  type UseDAppAnnouncementsResult,
  type UseDAppAnnouncementsOptions,
} from "../hooks/announcements/useDAppAnnouncements";
import type { Announcement } from "../types/announcement";

export interface DAppAnnouncementsContextValue extends UseDAppAnnouncementsResult {
  /** The Warning that caused the most-recent executeGated rejection. Null
   *  until a gated mutation is attempted while a Warning is active, OR after
   *  the user dismisses the modal / the Warning clears. */
  blockedWarning: Announcement | null;
  /** Called by `useGatedTransaction` when it throws `ActionBlockedError`. */
  signalBlocked: (warning: Announcement) => void;
  /** Called by `<ActionBlockedModal />` close handler (refresh-status when
   *  active warning is gone) AND auto-fires when `activeWarning` clears. */
  dismissBlocked: () => void;
}

const DAppAnnouncementsContext = createContext<DAppAnnouncementsContextValue | null>(null);

export interface DAppAnnouncementsProviderProps {
  children: ReactNode;
  /** Override the global ID — useful for staging or tests. */
  announcementsId?: string;
  /** Override the default 30s cadence. */
  pollIntervalMs?: number;
}

export function DAppAnnouncementsProvider({
  children,
  announcementsId,
  pollIntervalMs,
}: DAppAnnouncementsProviderProps) {
  const opts: UseDAppAnnouncementsOptions = { announcementsId, pollIntervalMs };
  const announcementState = useDAppAnnouncements(opts);

  const [blockedWarning, setBlockedWarning] = useState<Announcement | null>(null);
  const signalBlocked = useCallback((w: Announcement) => setBlockedWarning(w), []);
  const dismissBlocked = useCallback(() => setBlockedWarning(null), []);

  // Auto-dismiss the modal if the underlying warning has been cleared on chain.
  // Cheap (runs once per render) and avoids the user staring at a stale modal
  // after admin runs `clear_announcement`.
  if (blockedWarning && announcementState.activeWarning === null) {
    setBlockedWarning(null);
  }

  const value: DAppAnnouncementsContextValue = {
    ...announcementState,
    blockedWarning,
    signalBlocked,
    dismissBlocked,
  };

  return (
    <DAppAnnouncementsContext.Provider value={value}>
      {children}
    </DAppAnnouncementsContext.Provider>
  );
}

/** Consume the announcement-board state. Returns the same value across the
 *  whole app tree — no duplicate RPC polling. Must be used inside
 *  <DAppAnnouncementsProvider>. */
export function useDAppAnnouncementsContext(): DAppAnnouncementsContextValue {
  const ctx = useContext(DAppAnnouncementsContext);
  if (!ctx) {
    throw new Error(
      "useDAppAnnouncementsContext must be used inside <DAppAnnouncementsProvider>",
    );
  }
  return ctx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
