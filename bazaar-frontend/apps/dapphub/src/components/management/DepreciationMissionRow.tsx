// bazaar-frontend | Per-mission depreciation prune row for collateral reward-close items and token refund
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V41 SSU depreciation/prune — per-mission row (mounted by DepreciationDrainRow,
 * one per mission id on a certified-depreciated SSU). FOUR steps, ordered:
 *   1. Collateral refund (EVE or Advanced token pool) — paged over live takers.
 *   2. Reward + close (single-shot) — requires step 1 fully drained (runs_in_progress==0).
 *   3. Items recovery (repeatable single-shot; order-independent).
 *   4. (Advanced only) reward-token residue drain — requires the mission SETTLED
 *      by step 2 first (E_MISSION_NOT_SETTLED otherwise).
 *
 * Permissionless — no ownerCapId. DappHub-EXEMPT (dAppKit direct sign).
 */

import { useState, useEffect, useCallback } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit } from "@evefrontier/dapp-kit";
import { suiClient } from "@bazaar/shared/hooks/sui-client";
import { useMission } from "@bazaar/shared/hooks/bazaarcore/mission-hooks";
import {
  useMissionCollateralPoolId,
  useMissionCollateralTokenPoolId,
  useTribeEconomyObjects,
} from "@bazaar/shared/hooks/bazaareconomy/economy-resolution-hooks";
import {
  buildPruneDepreciatedMissionCollateralPage,
  buildPruneDepreciatedMissionReward,
  buildPruneDepreciatedMissionItemsPage,
} from "@bazaar/shared/tx/bazaarmission/ssu-depreciation-missions-tx";
import { buildPruneDepreciatedMissionCollateralTokenPage, buildPruneDepreciatedMissionRewardToken } from "@bazaar/shared/tx/bazaareconomy/ssu-depreciation-economy-tx";
import DrainBatchButton from "./DrainBatchButton";

interface Props {
  ssuGovId: string;
  ssuId: string;
  missionId: string;
  onSettled: () => void;
}

const ROW_STYLE: React.CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.08)", background: "rgba(255, 255, 255, 0.015)",
  padding: "0.5rem 0.65rem", display: "flex", flexDirection: "column", gap: "0.4rem",
  fontFamily: "monospace", fontSize: "0.74rem",
};
const HEAD_STYLE: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "0.35rem 0.8rem", alignItems: "baseline" };
const TAG_STYLE: React.CSSProperties = { color: "rgba(255,255,255,0.45)" };
const VAL_STYLE: React.CSSProperties = { color: "#e8e8e8" };
const WAIT_STYLE: React.CSSProperties = { color: "rgba(255,255,255,0.5)", fontStyle: "italic" };
const OK_STYLE: React.CSSProperties = { color: "#7fc97f" };
const ERR_STYLE: React.CSSProperties = { color: "#e55555" };
const BTN_BASE: React.CSSProperties = {
  background: "rgba(204, 112, 0, 0.12)", border: "1px solid rgba(204, 112, 0, 0.6)", color: "#cc7000",
  padding: "0.35rem 0.75rem", fontFamily: "monospace", fontSize: "0.74rem", cursor: "pointer", alignSelf: "flex-start",
};
const BTN_DISABLED: React.CSSProperties = { ...BTN_BASE, opacity: 0.45, cursor: "not-allowed" };
const TYPE_LABEL = ["NoTribe", "Easy", "Advanced"] as const;

/** Enumerate live AcceptanceKey takers on the mission UID — same DF-scan
 *  useForceClosePlan.ts's fetchMissionTakers uses, inlined here to keep this
 *  file's dependency surface small (that helper is not exported). */
async function fetchLiveTakers(missionId: string): Promise<string[]> {
  const takers: string[] = [];
  let cursor: string | null | undefined = undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await suiClient.getDynamicFields({ parentId: missionId, cursor: cursor ?? undefined });
    for (const df of page.data) {
      if (typeof df.name?.type === "string" && df.name.type.includes("::mission::AcceptanceKey")) {
        const v = (df.name.value as { taker?: string } | undefined)?.taker;
        if (typeof v === "string") takers.push(v);
      }
    }
    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }
  return takers;
}

export default function DepreciationMissionRow({ ssuGovId, ssuId, missionId, onSettled }: Props) {
  const { data: mission } = useMission(missionId);
  const isAdvanced = mission?.bazaarType === 2;
  const tribeIdStr = mission ? String(mission.tribeId) : null;

  const evePool = useMissionCollateralPoolId(!mission || isAdvanced ? null : ssuId);
  const tokenPool = useMissionCollateralTokenPoolId(isAdvanced ? ssuId : null);
  const tribeEcon = useTribeEconomyObjects(isAdvanced ? tribeIdStr : null);
  const collateralPoolId = isAdvanced ? (tokenPool.data ?? null) : (evePool.data ?? null);
  const ledgerId = tribeEcon.data?.ledgerId ?? null;

  const [takers, setTakers] = useState<string[] | null>(null);
  const [takersLoading, setTakersLoading] = useState(false);
  const loadTakers = useCallback(async () => {
    setTakersLoading(true);
    try { setTakers(await fetchLiveTakers(missionId)); } finally { setTakersLoading(false); }
  }, [missionId]);
  useEffect(() => { void loadTakers(); }, [loadTakers]);

  const fetchTakerIds = useCallback(async (): Promise<string[]> => takers ?? [], [takers]);
  const buildCollateralChunk = useCallback(
    (ids: string[], tx: Transaction): Transaction =>
      isAdvanced
        ? buildPruneDepreciatedMissionCollateralTokenPage(
            { ssuGovId, missionCollateralTokenPoolId: collateralPoolId!, ledgerId: ledgerId!, missionId, takers: ids },
            tx,
          )
        : buildPruneDepreciatedMissionCollateralPage(
            { ssuGovId, missionCollateralPoolId: collateralPoolId!, missionId, takers: ids },
            tx,
          ),
    [isAdvanced, ssuGovId, collateralPoolId, ledgerId, missionId],
  );

  const [closePhase, setClosePhase] = useState<"idle" | "signing" | "done" | "error">("idle");
  const [closeErr, setCloseErr] = useState<string | null>(null);
  const closeMission = useCallback(async () => {
    setClosePhase("signing"); setCloseErr(null);
    try {
      const tx = buildPruneDepreciatedMissionReward({ ssuGovId, missionId });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setClosePhase("done"); onSettled();
    } catch (e) { setCloseErr(e instanceof Error ? e.message : String(e)); setClosePhase("error"); }
  }, [ssuGovId, missionId, onSettled]);

  const [itemsPhase, setItemsPhase] = useState<"idle" | "signing" | "done" | "error">("idle");
  const [itemsErr, setItemsErr] = useState<string | null>(null);
  const recoverItems = useCallback(async () => {
    setItemsPhase("signing"); setItemsErr(null);
    try {
      const tx = buildPruneDepreciatedMissionItemsPage({ ssuGovId, missionId });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setItemsPhase("done"); onSettled();
    } catch (e) { setItemsErr(e instanceof Error ? e.message : String(e)); setItemsPhase("error"); }
  }, [ssuGovId, missionId, onSettled]);

  const [tokenPhase, setTokenPhase] = useState<"idle" | "signing" | "done" | "error">("idle");
  const [tokenErr, setTokenErr] = useState<string | null>(null);
  const drainRewardToken = useCallback(async () => {
    setTokenPhase("signing"); setTokenErr(null);
    try {
      const tx = buildPruneDepreciatedMissionRewardToken({ ssuGovId, ledgerId: ledgerId!, missionId });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setTokenPhase("done"); onSettled();
    } catch (e) { setTokenErr(e instanceof Error ? e.message : String(e)); setTokenPhase("error"); }
  }, [ssuGovId, ledgerId, missionId, onSettled]);

  if (!mission) return <div style={ROW_STYLE}><span style={WAIT_STYLE}>Resolving mission…</span></div>;

  const hasTakers = (takers?.length ?? 0) > 0;
  const collateralReady = !!collateralPoolId && (!isAdvanced || !!ledgerId);

  return (
    <div style={ROW_STYLE}>
      <div style={HEAD_STYLE}>
        <span style={VAL_STYLE}>{mission.title || "(untitled mission)"}</span>
        <span><span style={TAG_STYLE}>type </span><span style={VAL_STYLE}>{TYPE_LABEL[mission.bazaarType] ?? mission.bazaarType}</span></span>
        <span><span style={TAG_STYLE}>settled </span><span style={VAL_STYLE}>{mission.isSettled ? "yes" : "no"}</span></span>
      </div>

      {takersLoading && <span style={WAIT_STYLE}>Resolving live takers…</span>}
      {!takersLoading && hasTakers && collateralReady && (
        <DrainBatchButton
          label={`1. Refund ${takers!.length} taker${takers!.length === 1 ? "" : "s"}' collateral`}
          fetchIds={fetchTakerIds}
          buildChunkTx={buildCollateralChunk}
          onPageSettled={() => { onSettled(); void loadTakers(); }}
        />
      )}
      {!takersLoading && !hasTakers && <span style={OK_STYLE}>✓ 1. No live takers — collateral already clear.</span>}
      {!takersLoading && hasTakers && !collateralReady && (
        <span style={WAIT_STYLE}>Resolving collateral pool{isAdvanced ? " + tribe ledger" : ""}…</span>
      )}

      <button
        style={!mission.isSettled && !hasTakers && closePhase !== "signing" ? BTN_BASE : BTN_DISABLED}
        onClick={closeMission}
        disabled={mission.isSettled || hasTakers || closePhase === "signing"}
      >
        {closePhase === "signing" ? "Signing…" : mission.isSettled ? "2. Reward closed ✓" : "2. Close mission (reward → giver)"}
      </button>
      {closeErr && <span style={ERR_STYLE}>Error: {closeErr}</span>}

      <button style={itemsPhase === "signing" ? BTN_DISABLED : BTN_BASE} onClick={recoverItems} disabled={itemsPhase === "signing"}>
        {itemsPhase === "signing" ? "Signing…" : "3. Recover leftover reward/proof items → giver"}
      </button>
      {itemsPhase === "done" && <span style={OK_STYLE}>✓ Page recovered — click again if more remain.</span>}
      {itemsErr && <span style={ERR_STYLE}>Error: {itemsErr}</span>}

      {isAdvanced && (
        <>
          <button
            style={mission.isSettled && ledgerId && tokenPhase !== "signing" ? BTN_BASE : BTN_DISABLED}
            onClick={drainRewardToken}
            disabled={!mission.isSettled || !ledgerId || tokenPhase === "signing"}
          >
            {tokenPhase === "signing" ? "Signing…" : "4. Refund reward-token residue → giver ledger"}
          </button>
          {!mission.isSettled && <span style={WAIT_STYLE}>Close the mission (step 2) first.</span>}
          {tokenErr && <span style={ERR_STYLE}>Error: {tokenErr}</span>}
        </>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
