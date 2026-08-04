// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MissionOwnerPanel — what the mission CREATOR sees when they open their own stall.
 *
 * Not a taker view: the owner is the giver/manager. Shows a status dashboard
 *   • runs completed / total + how many are accepted (in progress) right now
 *   • time remaining on the listing
 *   • the list of takers who currently hold the mission (with their status)
 * and a single "Close Mission Stall" action that cancels the stall and returns
 * all undelivered reward deposits to the owner (Main Storage when SSU owner).
 *
 * The Confirm / Reject approval queue is shown ONLY for "other"-mode (giver-
 * confirmed) missions — item-proof missions settle automatically when the taker
 * completes, so the owner has nothing to approve. When the giver IS the SSU owner,
 * item-proof deliveries are escrowed on-chain; a "Collect delivered items" action
 * appears only while there is something escrowed to collect (fully-automatic
 * delivery to the owner is a Move-side V38 change).
 *
 * Owned caps (SSU OwnerCap) are re-resolved FRESH before every tx (Issue 4 — the
 * page-load ref goes stale after any prior borrow → `-32603 version mismatch`).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit, abbreviateAddress } from "@evefrontier/dapp-kit";
import type { Mission } from "@bazaar/shared/types";
import {
  COMPLETION_MODE, MISSION_ACCEPTANCE_STATUS, BAZAAR_TYPE_NUM,
} from "@bazaar/shared/types";
import { useToast } from "@bazaar/shared/components/widgets/Toast";
import { useCharacterForAddress } from "@bazaar/shared/hooks/useCharacterForAddress";
import { useMissionAcceptances } from "@bazaar/shared/hooks/bazaarcore/mission-hooks";
import { missionCountdown } from "@bazaar/shared/utils/mission";
import { resolveSSUOwnerCap } from "@bazaar/shared/tx";
import type { SSUOwnerCapRef } from "@bazaar/shared/tx/bazaarcore/ssu-receiving-tx";
import {
  buildConfirmCompletion, buildRejectCompletion,
  buildCollectProofToMain, buildCancelMission,
} from "@bazaar/shared/tx/bazaarcore/mission-tx";
import {
  buildConfirmCompletionAdvanced, buildRejectCompletionAdvanced, buildCancelMissionAdvanced,
} from "@bazaar/shared/tx/bazaareconomy/mission-ledger-tx";
import type { MissionViewCtx } from "./MissionView";

interface Props {
  mission: Mission;
  ctx: MissionViewCtx;
  /** Mission owner's Character (giver) — resolved by MissionView. */
  giverCharacterId: string | null;
  onChanged: () => void;
}

export default function MissionOwnerPanel({ mission, ctx, giverCharacterId, onChanged }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const isAdvanced = mission.bazaarType === BAZAAR_TYPE_NUM.ADVANCED;
  const isItemProof = mission.completionMode === COMPLETION_MODE.ITEM_PROOF;

  const { data: acceptances = [], refetch: refetchAcc } = useMissionAcceptances(mission.id);
  const active = acceptances.filter((a) => a.status === MISSION_ACCEPTANCE_STATUS.ACTIVE);
  const pending = acceptances.filter((a) => a.status === MISSION_ACCEPTANCE_STATUS.PENDING);

  const runsLeft = Math.max(0, mission.maxRuns - mission.runsCompleted - mission.runsInProgress);
  const hasEscrowedProof = mission.proofEscrowCount > mission.proofEscrowNext;
  const now = Date.now();
  const expiryCd = missionCountdown(mission.expiryMs, now);

  function refreshAll() {
    refetchAcc(); onChanged();
    window.dispatchEvent(new CustomEvent("bazar-soft-refresh"));
  }

  /** Re-resolve the SSU owner cap fresh (Issue 4). */
  async function freshSsuCap(): Promise<SSUOwnerCapRef | undefined> {
    if (!ctx.isSSUOwner) return undefined;
    if (!ctx.characterId) throw new Error("Character not resolved — please wait.");
    const ref = await resolveSSUOwnerCap(ctx.characterId, ctx.ssuId);
    if (!ref) throw new Error("Could not resolve your SSU owner cap — please retry.");
    return ref;
  }

  async function runBuild(label: string, build: () => Promise<Transaction>, okMsg: string) {
    setBusy(label); setError("");
    try {
      const tx = await build();
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      toast.success(okMsg);
      setTimeout(refreshAll, 800);
      refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed.";
      setError(msg); toast.error(msg);
    } finally { setBusy(null); }
  }

  const onCollectProof = () => runBuild("collect", async () => {
    if (!giverCharacterId) throw new Error("Resolving your character — please wait.");
    const ssuOwnerCapRef = await freshSsuCap();
    if (!ssuOwnerCapRef) throw new Error("Only the SSU owner can collect escrowed items here.");
    return buildCollectProofToMain({
      missionId: mission.id, ssuGovId: ctx.ssuGovId, ssuId: mission.ssuId,
      giverCharacterId, ssuOwnerCapRef,
    });
  }, "Delivered items collected into your storage.");

  const onCloseStall = () => runBuild("close", async () => {
    if (!giverCharacterId) throw new Error("Resolving your character — please wait.");
    const ssuOwnerCapRef = ctx.isSSUOwner ? await freshSsuCap() : undefined;
    return isAdvanced
      ? buildCancelMissionAdvanced({
          missionId: mission.id, ssuGovId: ctx.ssuGovId, tribeGovId: ctx.tribeGovId!, ledgerId: ctx.ledgerId!,
          ssuId: mission.ssuId, ownerCharacterId: giverCharacterId,
          asSsuOwner: ctx.isSSUOwner, ssuOwnerCapRef,
        })
      : buildCancelMission({
          missionId: mission.id, ssuGovId: ctx.ssuGovId, ssuId: mission.ssuId,
          ownerCharacterId: giverCharacterId, asSsuOwner: ctx.isSSUOwner, ssuOwnerCapRef,
        });
  }, "Mission stall closed — deposits returned to your storage.");

  return (
    <div className="mission-view__dash">
      <p className="muted" style={{ fontSize: "0.76rem", margin: 0 }}>
        You are the mission giver. Other players accept and complete this mission; you manage it here.
      </p>

      {/* Status stats */}
      <div className="mission-view__dash-stats">
        <Stat label="Runs done" value={`${mission.runsCompleted} / ${mission.maxRuns}`} />
        <Stat label="Accepted now" value={`${active.length}`} />
        <Stat label="Runs free" value={`${runsLeft}`} />
        <Stat label="Time left" value={expiryCd.expired ? "Expired" : expiryCd.label} />
      </div>

      {/* Takers currently holding the mission */}
      <section className="mission-view__panel">
        <h3>Takers ({acceptances.length})</h3>
        {acceptances.length === 0 && <p className="muted" style={{ fontSize: "0.78rem" }}>No one has accepted yet.</p>}
        {acceptances.length > 0 && (
          <ul className="mission-view__takers">
            {acceptances.map((a) => {
              const cd = missionCountdown(a.deadlineMs, now);
              const isPending = a.status === MISSION_ACCEPTANCE_STATUS.PENDING;
              return (
                <li key={a.taker} className="mission-view__taker">
                  <span>{abbreviateAddress(a.taker)}</span>
                  <span className="mission-view__taker-status">
                    {isPending
                      ? "awaiting approval"
                      : cd.expired ? "timer lapsed" : `in progress · ${cd.label} left`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Approval queue — ONLY for "other"-mode (giver-confirmed) missions */}
      {!isItemProof && (
        <section className="mission-view__panel">
          <h3>Awaiting your approval ({pending.length})</h3>
          {pending.length === 0 && <p className="muted" style={{ fontSize: "0.78rem" }}>No submissions to review.</p>}
          {pending.map((acc) => (
            <PendingRow
              key={acc.taker} taker={acc.taker} mission={mission} ctx={ctx} isAdvanced={isAdvanced}
              busy={busy} setBusy={setBusy} setError={setError} toast={toast} onDone={refreshAll}
            />
          ))}
        </section>
      )}

      {error && <div className="currency-selector__warning" style={{ margin: "0.3rem 0" }}>{error}</div>}

      <div className="mission-view__actions">
        {/* Item-proof + SSU-owner giver: escrowed deliveries need collecting (until V38 auto-delivery). */}
        {ctx.isSSUOwner && isItemProof && hasEscrowedProof && (
          <button className="btn btn--ghost btn--sm" disabled={busy !== null} onClick={onCollectProof}>
            {busy === "collect" ? "…" : "Collect delivered items → storage"}
          </button>
        )}
        <button className="btn btn--danger btn--sm mission-view__close-stall"
          disabled={busy !== null} onClick={onCloseStall}>
          {busy === "close" ? "…" : "Close Mission Stall"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mission-view__stat">
      <span className="mission-view__stat-label">{label}</span>
      <span className="mission-view__stat-value">{value}</span>
    </div>
  );
}

// ── Giver approval row ("other" mode) — one address → character resolution each ──
function PendingRow({
  taker, mission, ctx, isAdvanced, busy, setBusy, setError, toast, onDone,
}: {
  taker: string;
  mission: Mission;
  ctx: MissionViewCtx;
  isAdvanced: boolean;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string) => void;
  toast: ReturnType<typeof useToast>;
  onDone: () => void;
}) {
  const { characterId: takerCharacterId } = useCharacterForAddress(taker);

  async function act(kind: "confirm" | "reject") {
    if (kind === "confirm" && !takerCharacterId) { setError("Resolving taker character — please wait."); return; }
    setBusy(`${kind}:${taker}`); setError("");
    try {
      let tx;
      if (kind === "confirm") {
        tx = isAdvanced
          ? buildConfirmCompletionAdvanced({
              missionId: mission.id, ssuGovId: ctx.ssuGovId, tribeGovId: ctx.tribeGovId!, ledgerId: ctx.ledgerId!,
              taker, ssuId: mission.ssuId, takerCharacterId: takerCharacterId!,
              missionCollateralTokenPoolId: ctx.missionCollateralTokenPoolId,
            })
          : buildConfirmCompletion({
              missionId: mission.id, ssuGovId: ctx.ssuGovId, taker,
              ssuId: mission.ssuId, takerCharacterId: takerCharacterId!,
              missionCollateralPoolId: ctx.missionCollateralPoolId,
            });
      } else {
        tx = isAdvanced
          ? buildRejectCompletionAdvanced({
              missionId: mission.id, ssuGovId: ctx.ssuGovId, tribeGovId: ctx.tribeGovId!, ledgerId: ctx.ledgerId!, taker,
              missionCollateralTokenPoolId: ctx.missionCollateralTokenPoolId,
            })
          : buildRejectCompletion({
              missionId: mission.id, ssuGovId: ctx.ssuGovId, taker,
              missionCollateralPoolId: ctx.missionCollateralPoolId,
            });
      }
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      toast.success(kind === "confirm" ? "Completion confirmed — reward paid." : "Completion rejected — run freed.");
      setTimeout(onDone, 800); onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed.";
      setError(msg); toast.error(msg);
    } finally { setBusy(null); }
  }

  return (
    <div className="mission-view__pending">
      <span className="mission-view__pending-addr">{abbreviateAddress(taker)}</span>
      <button className="btn btn--primary btn--sm" disabled={busy !== null} onClick={() => act("confirm")}>
        {busy === `confirm:${taker}` ? "…" : "Confirm"}
      </button>
      <button className="btn btn--ghost btn--sm" disabled={busy !== null} onClick={() => act("reject")}>
        {busy === `reject:${taker}` ? "…" : "Reject"}
      </button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
