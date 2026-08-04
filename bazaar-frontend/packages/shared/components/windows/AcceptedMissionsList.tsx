// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * AcceptedMissionsList — the "My Accepted Missions" tab of the Market & Missions
 * window. Lists the connected wallet's ACTIVE accepted missions (a live
 * MissionAcceptance DF exists only while the run is unresolved), showing
 * accepted-at, the per-taker expiry countdown, the reward, and what to bring/do.
 *
 * Read-only by design — completion itself happens at the in-world mission stall
 * (visit the stall → Complete in MissionView). Accepted missions stay listed here
 * even when "Hide all missions" is on (a mission you've committed to is never
 * hidden).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useEffect, useMemo, useState } from "react";
import { useConnection, dAppKit } from "@evefrontier/dapp-kit";
import { SSU_OBJECT_ID, COIN_DECIMALS } from "@bazaar/shared/constants";
import { BAZAAR_TYPE_NUM, MISSION_TYPE_LABEL, COMPLETION_MODE } from "@bazaar/shared/types";
import type { Mission } from "@bazaar/shared/types";
import { useMyAcceptedMissions } from "@bazaar/shared/hooks/bazaarcore/useMyAcceptedMissions";
import { useItemTypes } from "@bazaar/shared/hooks";
import { useClaimBoxContext } from "@bazaar/shared/contexts";
import { missionCountdown } from "@bazaar/shared/utils/mission";
import { buildCancelMyAcceptance } from "@bazaar/shared/tx/bazaarcore/mission-tx";
import { buildCancelMyAcceptanceAdvanced } from "@bazaar/shared/tx/bazaareconomy/mission-ledger-tx";
import MissionCancelConfirm from "@bazaar/shared/components/missions/MissionCancelConfirm";
import { useToast } from "@bazaar/shared/components/widgets/Toast";

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

export interface AcceptedMissionsCtx {
  ssuGovId: string;
  missionCollateralPoolId: string;
  missionCollateralTokenPoolId: string;
  tribeGovId: string | null;
  ledgerId: string | null;
  displayCurrency: string;
  priceScale: number;
}

export default function AcceptedMissionsList({ ctx }: { ctx?: AcceptedMissionsCtx }) {
  const { walletAddress } = useConnection();
  const { currencyName } = useClaimBoxContext();
  const displayCurrency = ctx?.displayCurrency ?? currencyName ?? "EVE";
  const toast = useToast();

  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const { items, isLoading } = useMyAcceptedMissions(SSU_OBJECT_ID || null, walletAddress ?? null);

  // One-minute tick so the countdown ages without a refetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Batch-resolve proof + reward item names across all accepted missions.
  const typeIds = useMemo(
    () => items.flatMap((r) => [...r.mission.proofItems, ...r.mission.rewardItems].map((it) => it.typeId)),
    [items],
  );
  const itemTypes = useItemTypes(typeIds);
  const itemName = (id: number) => itemTypes.get(id)?.name ?? `Item #${id}`;

  if (isLoading) return <p className="muted" style={{ fontSize: "0.8rem" }}>Loading your accepted missions…</p>;
  if (items.length === 0) {
    return (
      <p className="muted" style={{ fontSize: "0.82rem" }}>
        You haven't accepted any missions. Open a mission stall in the world to accept one.
      </p>
    );
  }

  const now = Date.now();

  return (
    <div>
      {items.map(({ mission, acceptance }) => {
        const cd = missionCountdown(acceptance.deadlineMs, now);
        const isItemProof = mission.completionMode === COMPLETION_MODE.ITEM_PROOF;
        const isAdvanced = mission.bazaarType === BAZAAR_TYPE_NUM.ADVANCED;
        const collateral = isAdvanced ? mission.collateralTokenPerRun : mission.collateralEvePerRun;
        const acceptedAt = acceptance.acceptedAtMs
          ? new Date(acceptance.acceptedAtMs).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
          : "—";
        return (
          <div key={mission.id} className="market-window__shop">
            <div className="mission-row__top">
              <strong style={{ color: "var(--accent, #cc7000)" }}>{mission.title || "Mission"}</strong>
              <span className="badge badge--mis">MIS</span>
              <span className="badge mission-row__type">{MISSION_TYPE_LABEL[mission.missionType] ?? "Mission"}</span>
            </div>

            <div className="muted" style={{ fontSize: "0.72rem", marginTop: "0.25rem" }}>
              Accepted {acceptedAt} · Time left{" "}
              <span style={{ color: cd.expired ? "#c05040" : "var(--accent, #cc7000)", fontWeight: 600 }}>{cd.label}</span>
            </div>

            <div style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
              Reward: {rewardSummary(mission, displayCurrency)}
            </div>

            {collateral > 0 && (
              <div style={{ fontSize: "0.73rem", marginTop: "0.2rem", color: "var(--accent, #cc7000)" }}>
                Collateral: {isAdvanced
                  ? collateral.toLocaleString()
                  : (collateral / COIN_DECIMALS).toFixed(4)} {displayCurrency}
              </div>
            )}

            <div style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>
              {isItemProof ? (
                <>
                  Bring:{" "}
                  {mission.proofItems.length
                    ? mission.proofItems.map((p) => `${p.amount}× ${itemName(p.typeId)}`).join(", ")
                    : "—"}
                </>
              ) : (
                "Giver-confirmed — submit at the stall for the giver to confirm."
              )}
            </div>

            <p className="muted" style={{ fontSize: "0.7rem", marginTop: "0.3rem", fontStyle: "italic" }}>
              {cd.expired
                ? "Timer lapsed — the run may be freed. Visit the stall to retry or abandon."
                : "Complete at the mission stall in the world."}
            </p>

            <button className="btn btn--danger btn--sm" style={{ marginTop: "0.4rem" }}
              onClick={() => setCancelTarget(mission.id)}
              disabled={cancelBusy}>
              Cancel run
            </button>
          </div>
        );
      })}

      {cancelTarget && (() => {
        const row = items.find((r) => r.mission.id === cancelTarget);
        if (!row) return null;
        const { mission } = row;
        const isAdv = mission.bazaarType === BAZAAR_TYPE_NUM.ADVANCED;
        const collateral = isAdv ? mission.collateralTokenPerRun : mission.collateralEvePerRun;
        return (
          <MissionCancelConfirm
            currency={displayCurrency}
            collateralAmount={collateral}
            priceScale={ctx?.priceScale ?? COIN_DECIMALS}
            isAdvanced={isAdv}
            busy={cancelBusy}
            onCancel={() => setCancelTarget(null)}
            onConfirm={async () => {
              if (!ctx) return;
              setCancelBusy(true);
              try {
                const tx = isAdv
                  ? buildCancelMyAcceptanceAdvanced({
                      missionId: mission.id, ssuGovId: ctx.ssuGovId,
                      tribeGovId: ctx.tribeGovId!, ledgerId: ctx.ledgerId!,
                      missionCollateralTokenPoolId: ctx.missionCollateralTokenPoolId,
                    })
                  : buildCancelMyAcceptance({
                      missionId: mission.id, ssuGovId: ctx.ssuGovId,
                      missionCollateralPoolId: ctx.missionCollateralPoolId,
                    });
                await dAppKit.signAndExecuteTransaction({ transaction: tx });
                toast.success("Run cancelled.");
                window.dispatchEvent(new CustomEvent("bazar-soft-refresh"));
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Transaction failed.";
                toast.error(msg);
              } finally { setCancelBusy(false); setCancelTarget(null); }
            }}
          />
        );
      })()}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
