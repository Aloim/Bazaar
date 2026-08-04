// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useMyAcceptedMissions — the connected wallet's ACTIVE accepted missions at an SSU.
 *
 * Composes useMissions(ssuId) (active missions) with a per-mission AcceptanceKey
 * { taker = wallet } dynamic-field lookup (mirrors useMyAcceptance, batched). A
 * MissionAcceptance DF only exists while the run is live (ACTIVE / PENDING) — it is
 * removed on completion / expiry / rejection — so any record found is a live
 * commitment. Returns the joined { mission, acceptance } rows AND the accepted
 * mission-id Set, which useGodotBridge consumes for the "hide all missions"
 * exception (accepted stalls stay visible even when missions are hidden).
 *
 * Type filters use BAZAAR_MISSION_ORIGINAL_PACKAGE_ID per Sweep-H.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Mission, MissionAcceptance, MissionAcceptanceStatus } from "../../types/bazaarcore";
import { BAZAAR_MISSION_ORIGINAL_PACKAGE_ID } from "../../constants";
import { suiClient } from "../sui-client";
import { useMissions } from "./mission-hooks";

export interface AcceptedMissionRow {
  mission: Mission;
  acceptance: MissionAcceptance;
}

export interface UseMyAcceptedMissions {
  items: AcceptedMissionRow[];
  /** Mission ids the wallet currently has a live acceptance on. */
  acceptedIds: Set<string>;
  isLoading: boolean;
  refetch: () => void;
}

function parseAcceptance(value: unknown): MissionAcceptance | null {
  const f = (value as { fields?: Record<string, unknown> })?.fields ?? (value as Record<string, unknown>);
  if (!f || typeof f !== "object") return null;
  const taker = (f as Record<string, unknown>).taker;
  if (typeof taker !== "string") return null;
  return {
    taker,
    acceptedAtMs: Number((f as Record<string, unknown>).accepted_at_ms ?? 0),
    deadlineMs:   Number((f as Record<string, unknown>).deadline_ms ?? 0),
    status:       Number((f as Record<string, unknown>).status ?? 0) as MissionAcceptanceStatus,
    collateralAmount: Number((f as Record<string, unknown>).collateral_amount ?? 0),
  };
}

export function useMyAcceptedMissions(
  ssuId: string | null,
  wallet: string | null,
): UseMyAcceptedMissions {
  const { data: missions = [], isLoading: missionsLoading, refetch: refetchMissions } =
    useMissions(ssuId);

  // Stable, order-independent key for the missions currently visible at the SSU.
  const missionIdsKey = missions.map((m) => m.id).sort().join(",");

  const { data: items = [], isLoading: accLoading, refetch: refetchAcc } = useQuery<AcceptedMissionRow[]>({
    queryKey: ["bazaarcore", "my-accepted-missions", ssuId, wallet, missionIdsKey],
    enabled: !!(wallet && missions.length > 0),
    queryFn: async (): Promise<AcceptedMissionRow[]> => {
      const settled = await Promise.allSettled(
        missions.map((m) =>
          suiClient.getDynamicFieldObject({
            parentId: m.id,
            name: {
              type: `${BAZAAR_MISSION_ORIGINAL_PACKAGE_ID}::mission::AcceptanceKey`,
              value: { taker: wallet! },
            },
          }),
        ),
      );
      const rows: AcceptedMissionRow[] = [];
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status !== "fulfilled") continue; // DF absent → not accepted by this wallet
        const content = s.value.data?.content as { fields?: { value?: unknown } } | undefined;
        const acc = content?.fields ? parseAcceptance(content.fields.value) : null;
        if (acc) rows.push({ mission: missions[i], acceptance: acc });
      }
      return rows;
    },
    staleTime: 10_000,
  });

  // Stable identity across renders while the accepted set is unchanged, so the
  // useGodotBridge memo (which depends on it) doesn't recompute every render.
  const acceptedKey = items.map((r) => r.mission.id).sort().join(",");
  const acceptedIds = useMemo(() => new Set(items.map((r) => r.mission.id)), [acceptedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    items,
    acceptedIds,
    isLoading: missionsLoading || accLoading,
    refetch: () => { refetchMissions(); refetchAcc(); },
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
