// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MissionsWindow — Slice 6. The in-world Mission beacon panel (opened by clicking
 * the in-world Mission beacon). Lists the active missions at the current SSU; click
 * one to open its MissionView (Accept / Complete as a taker; Confirm / Reject /
 * Collect / Cancel as the giver).
 *
 * Resolves the SSU / tribe / cap context ONCE here and hands it to MissionView
 * (mirrors how CreateShopModal resolves and hands context to MissionWizard), so the
 * per-mission view stays focused on the actions. Reuses the .market-window chrome
 * so it matches the in-game Bazaar aesthetic and is CEF-clickable over the canvas.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useState, useMemo, useEffect } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { SSU_OBJECT_ID, MISSION_REGISTRY_ID, COIN_DECIMALS } from "@bazaar/shared/constants";
import { TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";
import { MISSION_TYPE_LABEL, BAZAAR_TYPE_NUM } from "@bazaar/shared/types";
import type { Mission } from "@bazaar/shared/types";
import { useMissions } from "@bazaar/shared/hooks/bazaarcore/mission-hooks";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks";
import { useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useTribeEconomyObjects } from "@bazaar/shared/hooks";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import { useClaimBoxContext } from "@bazaar/shared/contexts";
import MissionView, { type MissionViewCtx } from "@bazaar/shared/components/missions/MissionView";
import WindowHeader from "@bazaar/shared/components/windows/WindowHeader";
import { useMissionCollateralPoolId, useMissionCollateralTokenPoolId } from "@bazaar/shared/hooks/bazaareconomy/economy-resolution-hooks";
import { useTribeTokenBalance } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import { useRoles } from "@bazaar/shared/hooks/useRoles";
import { viewerRoleMask, missionVisibleToRole } from "@bazaar/shared/utils/mission";

interface Props { onClose: () => void; initialMissionId?: string | null; }

const ACCENT = "#cc7000";

function rewardSummary(m: Mission, currency: string): string {
  const parts: string[] = [];
  if (m.rewardItems.length > 0) parts.push(`${m.rewardItems.length} item${m.rewardItems.length === 1 ? "" : "s"}`);
  const money = m.bazaarType === BAZAAR_TYPE_NUM.ADVANCED ? m.rewardTokenPerRun : m.rewardEvePerRun;
  if (money > 0) {
    const v = m.bazaarType === BAZAAR_TYPE_NUM.ADVANCED ? money : money / COIN_DECIMALS;
    parts.push(`${v.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${currency}`);
  }
  return parts.length ? parts.join(" + ") : "—";
}

export default function MissionsWindow({ onClose, initialMissionId }: Props) {
  const { walletAddress } = useConnection();
  const { currencyName } = useClaimBoxContext();
  const displayCurrency = currencyName || "EVE";
  const ready = !!MISSION_REGISTRY_ID;

  const [selectedId, setSelectedId] = useState<string | null>(initialMissionId ?? null);
  // Opened from an in-world mission stall click → jump straight to that mission.
  useEffect(() => { if (initialMissionId) setSelectedId(initialMissionId); }, [initialMissionId]);

  // ── List ───────────────────────────────────────────────────────────────────
  const { data: missions = [], isLoading, refetch } = useMissions(SSU_OBJECT_ID || null);

  // ── Context (resolved once; handed to MissionView) ─────────────────────────
  const { data: shared } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const ssuGovId = shared?.ssuGovId ?? "";
  const { data: govConfig } = useSSUGovernanceConfig(ssuGovId || null);
  const tribeIdStr = govConfig?.tribeId ? String(govConfig.tribeId) : null;
  const { data: tribeGovId } = useTribeGovId(tribeIdStr);
  const { data: econObjects } = useTribeEconomyObjects(tribeIdStr);
  const { characterId, charCapRef, isSsuOwner, ssuCapRef } = useCharacterOwnerCapRef(
    walletAddress ?? undefined, SSU_OBJECT_ID,
  );

  const isAdvancedSsu = govConfig?.bazaarType === BAZAAR_TYPE_NUM.ADVANCED;
  const { data: missionCollateralPoolId = null } = useMissionCollateralPoolId(
    !isAdvancedSsu ? SSU_OBJECT_ID || null : null,
  );
  const { data: missionCollateralTokenPoolId = null } = useMissionCollateralTokenPoolId(
    isAdvancedSsu ? SSU_OBJECT_ID || null : null,
  );
  const roles = useRoles(SSU_OBJECT_ID || null);
  const vMask = viewerRoleMask(roles);
  const tribeTokenBalQ = useTribeTokenBalance(
    isAdvancedSsu ? (econObjects?.ledgerId ?? null) : null,
    walletAddress ?? undefined,
  );
  const tribeTokenDecimals = tribeTokenBalQ.data?.decimals ?? TRIBE_TOKEN_DECIMALS;
  const priceScale = isAdvancedSsu ? Math.pow(10, tribeTokenDecimals) : COIN_DECIMALS;

  const ctx: MissionViewCtx = useMemo(() => ({
    walletAddress: walletAddress ?? null,
    ssuGovId,
    ssuId: SSU_OBJECT_ID,
    tribeGovId: tribeGovId ?? null,
    ledgerId: econObjects?.ledgerId ?? null,
    bazaarType: govConfig?.bazaarType ?? 0,
    displayCurrency,
    characterId,
    charCapRef,
    isSSUOwner: isSsuOwner,
    ssuOwnerCapRef: ssuCapRef,
    memberRegistryId:             shared?.memberRegistryId ?? "",
    missionCollateralPoolId:      missionCollateralPoolId ?? "",
    missionCollateralTokenPoolId: missionCollateralTokenPoolId ?? "",
    priceScale,
  }), [walletAddress, ssuGovId, tribeGovId, econObjects?.ledgerId, govConfig?.bazaarType,
       displayCurrency, characterId, charCapRef, isSsuOwner, ssuCapRef,
       shared?.memberRegistryId, missionCollateralPoolId, missionCollateralTokenPoolId,
       priceScale]);

  const selected = missions.find((m) => {
    const owned = !!walletAddress && m.owner.toLowerCase() === (walletAddress ?? "").toLowerCase();
    if (owned) return m.id === selectedId;
    return m.id === selectedId && missionVisibleToRole(m.visibilityRoles ?? 16, vMask);
  }) ?? null;

  return (
    <div className="market-window">
      <WindowHeader
        title={selected ? "MISSION" : "MISSIONS"}
        onClose={onClose}
        onBack={selected ? () => setSelectedId(null) : undefined}
      />

      <div className="market-window__body scroll-area">
        {!ready && (
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            Missions are not live yet — available after the next DApp publish.
          </p>
        )}

        {ready && selected && (
          <MissionView mission={selected} ctx={ctx} onBack={() => setSelectedId(null)} onRefetch={refetch} />
        )}

        {ready && !selected && (
          <>
            {isLoading && <p className="muted" style={{ fontSize: "0.8rem" }}>Loading missions…</p>}
            {!isLoading && missions.length === 0 && (
              <p className="muted" style={{ fontSize: "0.82rem" }}>No active missions at this SSU.</p>
            )}
            {missions.filter((m) => {
              const owned = !!walletAddress && m.owner.toLowerCase() === (walletAddress ?? "").toLowerCase();
              if (owned) return true;
              return missionVisibleToRole(m.visibilityRoles ?? 16, vMask);
            }).map((m) => {
              const runsLeft = Math.max(0, m.maxRuns - m.runsCompleted - m.runsInProgress);
              const mine = !!walletAddress && walletAddress.toLowerCase() === m.owner.toLowerCase();
              return (
                <div
                  key={m.id}
                  className="mission-row"
                  onClick={() => setSelectedId(m.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="mission-row__top">
                    <strong style={{ color: ACCENT }}>{m.title}</strong>
                    <span className="badge mission-row__type">{MISSION_TYPE_LABEL[m.missionType] ?? "Mission"}</span>
                    {mine && <span className="badge badge--tribe">★</span>}
                  </div>
                  <div className="mission-row__meta muted">
                    Reward {rewardSummary(m, displayCurrency)} · {runsLeft}/{m.maxRuns} run{m.maxRuns === 1 ? "" : "s"} left
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
