// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1.1 — Step-2 per-mission force-cancel row.
 *
 * Two ordered steps (the Move pins this order):
 *   1. Settle takers — refund collateral 100% to each taker (no-fault). Paged
 *      in ≤100. Each settle also decrements runs_in_progress, so settling every
 *      live taker brings the mission to runs_in_progress == 0.
 *   2. Cancel mission — reward bundles → giver Player Locker, EVE/token reward →
 *      giver. Asserts !is_settled-flow guards + runs_in_progress == 0 +
 *      giverCharacter == mission.owner, so Cancel stays disabled until step 1
 *      has cleared every taker.
 *
 * EVE path (NoTribe/Easy) → bazaar_mission::mission_admin_drain.
 * Advanced path (token)   → bazaar_economy::mission_ledger_ops (dual-cap gated).
 *
 * DappHub-EXEMPT — signs via dAppKit directly.
 */

import { useCallback, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit } from "@evefrontier/dapp-kit";
import { SHARED_OBJECTS } from "@bazaar/shared/constants";
import { useSSUGovId, useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useCharacterForAddress } from "@bazaar/shared/hooks/useCharacterForAddress";
import {
  useMissionCollateralPoolId,
  useMissionCollateralTokenPoolId,
  useTribeEconomyObjects,
} from "@bazaar/shared/hooks/bazaareconomy/economy-resolution-hooks";
import {
  buildAdminForceSettleMissionAcceptances,
  buildAdminForceCancelMission,
  buildAdminForceSettleMissionAcceptancesAdvanced,
  buildAdminForceCancelMissionAdvanced,
} from "@bazaar/shared/tx/bazaarcore/mission-admin-drain-tx";
import type { MissionDrainItem } from "@bazaar/shared/hooks/ceremony";
import DrainBatchButton from "./DrainBatchButton";

interface Props {
  item: MissionDrainItem;
  ownerCapId: string;
  onSettled: () => void;
}

const ROW_STYLE: React.CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "rgba(255, 255, 255, 0.015)",
  padding: "0.55rem 0.7rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
  fontFamily: "monospace",
  fontSize: "0.76rem",
};

const HEAD_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem 0.9rem",
  alignItems: "baseline",
};

const TAG_STYLE: React.CSSProperties = { color: "rgba(255,255,255,0.45)" };
const VAL_STYLE: React.CSSProperties = { color: "#e8e8e8" };
const ACCENT_STYLE: React.CSSProperties = { color: "#cc7000", fontWeight: 600 };
const WAIT_STYLE: React.CSSProperties = { color: "rgba(255,255,255,0.5)", fontStyle: "italic" };
const OK_STYLE: React.CSSProperties = { color: "#7fc97f" };
const ERR_STYLE: React.CSSProperties = { color: "#e55555" };

const BTN_BASE: React.CSSProperties = {
  background: "rgba(204, 112, 0, 0.12)",
  border: "1px solid rgba(204, 112, 0, 0.6)",
  color: "#cc7000",
  padding: "0.4rem 0.85rem",
  fontFamily: "monospace",
  fontSize: "0.78rem",
  cursor: "pointer",
  alignSelf: "flex-start",
};
const BTN_DISABLED: React.CSSProperties = { ...BTN_BASE, opacity: 0.45, cursor: "not-allowed" };

const TYPE_LABEL = ["NoTribe", "Easy", "Advanced"] as const;

function short(addr: string): string {
  return addr ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : "—";
}

export default function MissionDrainRow({ item, ownerCapId, onSettled }: Props) {
  const isAdvanced = item.bazaarType === 2;

  // Shared object + Character resolution (all hooks called unconditionally; the
  // unused path is disabled by passing null).
  const ssuGov = useSSUGovId(item.ssuId);
  const giver = useCharacterForAddress(item.giverAddress);
  const evePool = useMissionCollateralPoolId(isAdvanced ? null : item.ssuId);
  const tokenPool = useMissionCollateralTokenPoolId(isAdvanced ? item.ssuId : null);
  const tribeGov = useTribeGovId(isAdvanced ? String(item.tribeId) : null);
  const tribeEcon = useTribeEconomyObjects(isAdvanced ? String(item.tribeId) : null);

  const ssuGovId = ssuGov.data ?? null;
  const giverCharacterId = giver.characterId;
  const ledgerId = tribeEcon.data?.ledgerId ?? null;
  const tribeGovId = tribeGov.data ?? null;
  const collateralPoolId = isAdvanced ? (tokenPool.data ?? null) : (evePool.data ?? null);

  const baseReady = !!(ssuGovId && giverCharacterId);
  const advReady = !!(tribeGovId && ledgerId && collateralPoolId);
  const ready = isAdvanced ? baseReady && advReady : baseReady && !!collateralPoolId;

  const hasTakers = item.takers.length > 0;
  const canCancel = ready && item.runsInProgress === 0 && !hasTakers;

  // ── settle (paged) ──
  const fetchTakerIds = async (): Promise<string[]> => item.takers;
  const buildSettleChunk = (takers: string[], tx: Transaction): Transaction => {
    if (isAdvanced) {
      return buildAdminForceSettleMissionAcceptancesAdvanced(
        {
          ownerCapId,
          missionId: item.missionId,
          ssuGovId: ssuGovId!,
          tribeGovId: tribeGovId!,
          ledgerId: ledgerId!,
          economyCapStoreId: SHARED_OBJECTS.ECONOMY_CAP_STORE,
          missionCollateralTokenPoolId: collateralPoolId!,
          takers,
        },
        tx,
      );
    }
    return buildAdminForceSettleMissionAcceptances(
      {
        ownerCapId,
        missionId: item.missionId,
        ssuGovId: ssuGovId!,
        missionCollateralPoolId: collateralPoolId!,
        takers,
      },
      tx,
    );
  };

  // ── cancel (single) ──
  const [cancelPhase, setCancelPhase] = useState<"idle" | "signing" | "done" | "error">("idle");
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const cancel = useCallback(async () => {
    setCancelPhase("signing");
    setCancelErr(null);
    try {
      const tx = isAdvanced
        ? buildAdminForceCancelMissionAdvanced({
            ownerCapId,
            missionId: item.missionId,
            ssuGovId: ssuGovId!,
            tribeGovId: tribeGovId!,
            ledgerId: ledgerId!,
            economyCapStoreId: SHARED_OBJECTS.ECONOMY_CAP_STORE,
            ssuId: item.ssuId,
            giverCharacterId: giverCharacterId!,
          })
        : buildAdminForceCancelMission({
            ownerCapId,
            missionId: item.missionId,
            ssuGovId: ssuGovId!,
            ssuId: item.ssuId,
            giverCharacterId: giverCharacterId!,
          });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setCancelPhase("done");
      onSettled();
    } catch (err) {
      setCancelErr(err instanceof Error ? err.message : String(err));
      setCancelPhase("error");
    }
  }, [isAdvanced, ownerCapId, item, ssuGovId, tribeGovId, ledgerId, giverCharacterId, onSettled]);

  // ── blocker copy ──
  let blockReason: string | null = null;
  if (!ready) {
    if (ssuGov.isLoading || giver.isLoading) blockReason = "Resolving shared objects + giver Character…";
    else if (giver.error) blockReason = `Giver Character unresolved: ${giver.error}`;
    else if (!ssuGovId) blockReason = "SSUGovernance unresolved.";
    else if (!giverCharacterId) blockReason = "Giver has no EVE Frontier Character.";
    else if (isAdvanced && !tribeGovId) blockReason = "TribeGovernance unresolved.";
    else if (isAdvanced && !ledgerId) blockReason = "Tribe token ledger unresolved.";
    else if (!collateralPoolId) blockReason = isAdvanced
      ? "MissionCollateralTokenPool not bootstrapped for this SSU."
      : "MissionCollateralPool not bootstrapped for this SSU.";
    else blockReason = "Resolving…";
  }

  return (
    <div style={ROW_STYLE}>
      <div style={HEAD_STYLE}>
        <span><span style={VAL_STYLE}>{item.title || "(untitled mission)"}</span></span>
        <span><span style={TAG_STYLE}>type </span><span style={VAL_STYLE}>{TYPE_LABEL[item.bazaarType] ?? item.bazaarType}</span></span>
        <span><span style={TAG_STYLE}>giver </span><span style={VAL_STYLE}>{short(item.giverAddress)}</span></span>
        <span><span style={ACCENT_STYLE}>{item.takers.length}</span> <span style={TAG_STYLE}>taker{item.takers.length === 1 ? "" : "s"}</span></span>
        <span><span style={TAG_STYLE}>runs_in_progress </span><span style={VAL_STYLE}>{item.runsInProgress}</span></span>
      </div>

      {!ready && <span style={giver.error ? ERR_STYLE : WAIT_STYLE}>{blockReason}</span>}

      {ready && (
        <>
          {hasTakers ? (
            <DrainBatchButton
              label={`1. Settle ${item.takers.length} taker${item.takers.length === 1 ? "" : "s"} (collateral 100% → takers)`}
              fetchIds={fetchTakerIds}
              buildChunkTx={buildSettleChunk}
              onPageSettled={onSettled}
            />
          ) : (
            <span style={OK_STYLE}>✓ 1. No live takers — collateral already clear.</span>
          )}

          <button
            style={canCancel && cancelPhase !== "signing" ? BTN_BASE : BTN_DISABLED}
            onClick={cancel}
            disabled={!canCancel || cancelPhase === "signing"}
            aria-disabled={!canCancel || cancelPhase === "signing"}
          >
            {cancelPhase === "signing" ? "Signing…"
              : cancelPhase === "done" ? "2. Mission cancelled ✓"
              : "2. Cancel mission (reward → giver)"}
          </button>
          {!canCancel && cancelPhase !== "done" && (
            <span style={WAIT_STYLE}>
              {hasTakers ? "Settle all takers first (runs_in_progress must reach 0)." : "Awaiting on-chain state refresh…"}
            </span>
          )}
          {cancelErr && <span style={ERR_STYLE}>Error: {cancelErr}</span>}
        </>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
