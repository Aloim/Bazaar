// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useMissionStalls — the in-world Mission (MIS) stalls for the Godot bridge.
 *
 * Each active mission at the current SSU renders as a stall at its creator's
 * position by riding the SAME Godot shop channel as shops (see useGodotBridge
 * SHOPS_UPDATED). This hook owns that concern so useGodotBridge stays under its
 * 500-line guard:
 *   • serializes active missions → MIS stall payloads,
 *   • honours the "Hide all missions" pref (Market & Missions Filter tab),
 *   • keeps stalls of missions the wallet has ACCEPTED visible even when hidden
 *     (so the taker can return to Complete),
 *   • re-evaluates live on SHOP_FILTER_CHANGED_EVENT,
 *   • returns the mission-id Set for click routing (mission stalls open the
 *     MissionsWindow, not ShopView).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useEffect, useMemo, useState } from "react";
import { SSU_OBJECT_ID } from "../../constants";
import { loadHideMissions, SHOP_FILTER_CHANGED_EVENT } from "@bazaar/shared/components/SSUFilter";
import { useMissions } from "./mission-hooks";
import { useMyAcceptedMissions } from "./useMyAcceptedMissions";
import { useDepreciatedSSUs } from "./useDepreciatedSSUs";
import { useRoles } from "../../hooks/useRoles";
import { viewerRoleMask, missionVisibleToRole } from "../../utils/mission";

export interface MissionStall {
  id: string;
  ssu_id: string;
  kind: "MIS";
  title: string;
  positionX: number;
  positionY: number;
  mapPosition: { x: number; y: number };
  stackCount: number;
  stackMemberIds: string[];
  isOwn: boolean;
}

export function useMissionStalls(walletAddress: string | null): {
  missionStalls: MissionStall[];
  missionIds: Set<string>;
} {
  const { data: missions } = useMissions(SSU_OBJECT_ID || null);
  const { acceptedIds } = useMyAcceptedMissions(SSU_OBJECT_ID || null, walletAddress);
  const roles = useRoles(SSU_OBJECT_ID || null);
  const vMask = viewerRoleMask(roles);

  // V41 SSU depreciation/prune (plan §5): hard delist a depreciated SSU's mission
  // stalls, gated BEFORE the owned/accepted exception below — the world assembly
  // is gone and unenterable even for the mission's own giver/taker.
  const candidateSsuIds = useMemo(() => (missions ?? []).map(m => m.ssuId), [missions]);
  const { depreciated } = useDepreciatedSSUs(candidateSsuIds);

  // Re-filter live when the Market/Shop filter (incl. "Hide all missions") changes.
  const [filterTick, setFilterTick] = useState(0);
  useEffect(() => {
    const h = () => setFilterTick((t) => t + 1);
    window.addEventListener(SHOP_FILTER_CHANGED_EVENT, h);
    return () => window.removeEventListener(SHOP_FILTER_CHANGED_EVENT, h);
  }, []);

  // Id set filtered by visibility + acceptance for click routing.
  const missionIds = useMemo(
    () => new Set((missions ?? []).filter((m) => {
      if (depreciated.has((m.ssuId || "").toLowerCase())) return false;
      const owned = !!walletAddress && m.owner === walletAddress;
      const accepted = acceptedIds.has(m.id);
      if (owned || accepted) return true;
      return missionVisibleToRole(m.visibilityRoles ?? 16, vMask);
    }).map((m) => m.id)),
    [missions, walletAddress, acceptedIds, vMask, depreciated],
  );

  const missionStalls = useMemo(() => {
    const hide = loadHideMissions();
    const visible = (missions ?? []).filter((m) => {
      if (depreciated.has((m.ssuId || "").toLowerCase())) return false;
      const owned = !!walletAddress && m.owner === walletAddress;
      const accepted = acceptedIds.has(m.id);
      if (owned || accepted) return !hide || accepted || owned;
      if (!missionVisibleToRole(m.visibilityRoles ?? 16, vMask)) return false;
      return !hide;
    });
    return visible.map((m) => ({
      id: m.id,
      ssu_id: m.ssuId,
      kind: "MIS" as const,
      title: m.title || "Mission",
      positionX: m.positionX,
      positionY: m.positionY,
      mapPosition: { x: m.positionX, y: m.positionY },
      stackCount: 1,
      stackMemberIds: [m.id],
      isOwn: !!walletAddress && m.owner === walletAddress,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions, walletAddress, acceptedIds, vMask, filterTick, depreciated]);

  return { missionStalls, missionIds };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
