// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useTribeBoardIds — resolve every per-SSU AnnouncementBoard id in a tribe.
 *
 * Powers the Tribe-Governance → Admin → "Tribe Announcement" sub-tab, whose
 * broadcast posts one announcement to each board in a single PTB
 * (buildBroadcastTribeAnnouncement). Replaces the display-side useTribeNews
 * aggregation: under the broadcast model a tribe announcement is physically
 * written into every SSU board, so the in-world beacon just reads that SSU's own
 * board (useAnnouncements) — no client-side union is needed anymore.
 *
 * Resolution (same live source as useTribeMembers / the old useTribeNews):
 *   1. dapp_hub Tribe.ssu_ids + Tribe.tribe_gov_id (via useTribeRegistry).
 *      ⚠ The bazaar_core TribeGovernance.ssu_ids vector is DEAD (only
 *      register_ssu_to_tribe writes it) — never source the SSU list from there.
 *   2. ONE queryEvents(SSUGovernanceCreated) → map ssu_id → announcement_board_id.
 *   3. Map the tribe's ssu_ids through that board-map → boardIds[].
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { suiClient } from "./sui-client";
import { useTribeRegistry } from "./useTribeRegistry";
import { ORIGINAL_PACKAGE_ID } from "@bazaar/shared/constants";

export interface TribeBoardIdsResult {
  /** AnnouncementBoard ids for every tribe SSU whose board resolved. */
  boardIds:  string[];
  /** TribeGovernance shared object id for this tribe (null if not bootstrapped). */
  tribeGovId: string | null;
  /** How many of the tribe's SSUs resolved a board (≤ tribe SSU count). */
  ssuCount:  number;
  isLoading: boolean;
  refetch:   () => void;
}

/** Map every SSU id → its AnnouncementBoard id via one SSUGovernanceCreated query. */
async function resolveBoardMap(): Promise<Map<string, string>> {
  const eventType = `${ORIGINAL_PACKAGE_ID}::ssu_governance::SSUGovernanceCreated`;
  const events = await suiClient.queryEvents({
    query: { MoveEventType: eventType },
    limit: 1000,
  });
  if (events.data.length === 1000) {
    console.warn(
      "[useTribeBoardIds] SSUGovernanceCreated queryEvents hit the 1000 cap — " +
      "some tribe SSUs may not resolve a board (cursor pagination not implemented).",
    );
  }
  const map = new Map<string, string>();
  for (const e of events.data) {
    const p = e.parsedJson as { ssu_id?: string; announcement_board_id?: string } | null;
    if (p?.ssu_id && p.announcement_board_id) {
      // First-bootstrap-wins (ascending order): don't overwrite an earlier mapping.
      const key = p.ssu_id.toLowerCase();
      if (!map.has(key)) map.set(key, p.announcement_board_id);
    }
  }
  return map;
}

export function useTribeBoardIds(tribeIdx: number | null): TribeBoardIdsResult {
  const { tribes } = useTribeRegistry();
  const tribe = useMemo(
    () => (tribeIdx !== null ? tribes.find(t => t.idx === tribeIdx) ?? null : null),
    [tribes, tribeIdx],
  );
  const ssuIds = tribe?.ssuIds ?? [];
  const tribeGovId = tribe?.tribeGovId ?? null;
  const ssuKey = ssuIds.slice().sort().join(",");

  const query = useQuery<{ boardIds: string[]; ssuCount: number }>({
    queryKey: ["tribe-board-ids", tribeIdx, ssuKey],
    enabled: tribeIdx !== null && ssuIds.length > 0,
    staleTime: 20_000,
    queryFn: async () => {
      const boardMap = await resolveBoardMap();
      const boardIds: string[] = [];
      for (const ssuId of ssuIds) {
        const boardId = boardMap.get(ssuId.toLowerCase());
        if (boardId) boardIds.push(boardId);
      }
      return { boardIds, ssuCount: boardIds.length };
    },
  });

  return {
    boardIds:   query.data?.boardIds ?? [],
    tribeGovId,
    ssuCount:   query.data?.ssuCount ?? 0,
    isLoading:  query.isLoading,
    refetch:    () => { query.refetch(); },
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
