// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { ANNOUNCEMENT_BOARD_ID } from "@bazaar/shared/constants";
import { debug } from "@bazaar/shared/utils/debug";
import {
  fetchAnnouncementsForBoard,
} from "./announcement-board-fetch";

// Backward-compat re-exports: 8 existing consumers import these types from this
// file. Routing through announcement-board-fetch.ts keeps all consumers unbroken.
export type { CommentData, AnnouncementData } from "./announcement-board-fetch";

export interface UseAnnouncementsResult {
  announcements: AnnouncementData[];
  stickyId:      number | null;
  loading:       boolean;
  refetch:       () => void;
}

/**
 * @param boardId — the AnnouncementBoard to read. AnnouncementBoards are per-SSU
 *   (created during SSU bootstrap, id stored on SSUGovernance.announcement_board_id);
 *   resolve it via `useSSUSharedObjects(ssuId).announcementBoardId`. When omitted,
 *   falls back to the legacy global `ANNOUNCEMENT_BOARD_ID` operator override
 *   (empty in current deployments — a per-SSU id should always be passed).
 */
export function useAnnouncements(boardId?: string | null): UseAnnouncementsResult {
  const [announcements, setAnnouncements] = useState<AnnouncementData[]>([]);
  const [stickyId, setStickyId]           = useState<number | null>(null);
  const [loading, setLoading]             = useState(true);
  const [tick, setTick]                   = useState(0);

  const effectiveBoardId = (boardId ?? ANNOUNCEMENT_BOARD_ID) || "";

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!effectiveBoardId) {
        if (!cancelled) {
          setAnnouncements([]);
          setStickyId(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        const results = await fetchAnnouncementsForBoard(effectiveBoardId);

        // Derive stickyId from the fetched results (the helper already computes
        // isSticky per-item; recover the ID by finding the sticky entry).
        const stickyEntry = results.find((a) => a.isSticky);
        const parsedStickyId = stickyEntry ? stickyEntry.id : null;

        results.sort((a, b) => {
          if (a.isSticky && !b.isSticky) return -1;
          if (!a.isSticky && b.isSticky) return 1;
          return b.createdAtMs - a.createdAtMs;
        });

        debug("[useAnnouncements] fetched:", results.length, "announcements");

        if (!cancelled) {
          setStickyId(parsedStickyId);
          setAnnouncements(results);
          setLoading(false);
        }
      } catch (e) {
        console.warn("[useAnnouncements] RPC load failed:", e);
        if (!cancelled) {
          setAnnouncements([]);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick, effectiveBoardId]);

  return { announcements, stickyId, loading, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
