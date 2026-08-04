// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MissionView — Slice 6. The open-stall detail for a single Mission (MIS).
 *
 * Two roles, resolved from the connected wallet vs mission.owner:
 *   • Taker  — Accept a run; then Complete (item-proof = single-tx submit; "other"
 *              = submit for the giver's confirmation). Permissionless "this run
 *              lapsed" cleanup when a deadline passes.
 *   • Giver  — Confirm / Reject pending "other" completions; "Collect proof → Main
 *              Storage" when the giver IS the SSU owner; Cancel (refund remaining
 *              reward escrow + unpaid item bundles).
 *
 * NoTribe/Easy use the real-EVE builders (tx/bazaarcore/mission-tx); Advanced uses
 * the tribe-token twins (tx/bazaareconomy/mission-ledger-tx). bazaar-type branch =
 * mission.bazaarType === 2. All actions toast on success/failure.
 *
 * Mirrors the ShopView open-stall language (refined reuse of the EVE-Frontier
 * design system) — the SSU/tribe/cap context is resolved once by MissionsWindow
 * and handed down, exactly as CreateShopModal hands context to MissionWizard.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useMemo, useState } from "react";
import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { dAppKit } from "@evefrontier/dapp-kit";
import type { Mission } from "@bazaar/shared/types";
import {
  MISSION_TYPE_LABEL, COMPLETION_MODE, MISSION_ACCEPTANCE_STATUS, BAZAAR_TYPE_NUM,
} from "@bazaar/shared/types";
import { COIN_DECIMALS, EVE_COIN_TYPE } from "@bazaar/shared/constants";
import { useItemTypes } from "@bazaar/shared/hooks";
import { useToast } from "@bazaar/shared/components/widgets/Toast";
import { useCharacterForAddress } from "@bazaar/shared/hooks/useCharacterForAddress";
import { useMyAcceptance } from "@bazaar/shared/hooks/bazaarcore/mission-hooks";
import {
  buildAcceptMission, buildCancelMyAcceptance,
  buildCompleteMissionWithItems, buildCompleteMissionOther,
  buildExpireAcceptance,
} from "@bazaar/shared/tx/bazaarcore/mission-tx";
import {
  buildCompleteMissionWithItemsAdvanced, buildCompleteMissionOtherAdvanced,
  buildAcceptMissionAdvanced, buildCancelMyAcceptanceAdvanced,
} from "@bazaar/shared/tx/bazaareconomy/mission-ledger-tx";
import { type CharOwnerCapRef, resolveCharOwnerCapRef } from "@bazaar/shared/tx/bazaarcore/shop-escrow-helpers";
import type { SSUOwnerCapRef } from "@bazaar/shared/tx/bazaarcore/ssu-receiving-tx";
import { resolveSSUOwnerCap } from "@bazaar/shared/tx";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { missionCountdown } from "@bazaar/shared/utils/mission";
import MissionCancelConfirm from "./MissionCancelConfirm";
import MissionOwnerPanel from "./MissionOwnerPanel";

// ── Context handed down from MissionsWindow ───────────────────────────────────
export interface MissionViewCtx {
  walletAddress: string | null;
  ssuGovId: string;
  ssuId: string;
  tribeGovId: string | null;
  ledgerId: string | null;
  bazaarType: number;            // 0/1/2 (govConfig.bazaarType)
  displayCurrency: string;
  /** Signer (taker) character context resolved by MissionsWindow. */
  characterId: string | null;
  charCapRef?: CharOwnerCapRef;
  isSSUOwner: boolean;
  ssuOwnerCapRef?: SSUOwnerCapRef;
  memberRegistryId: string;             // NEW V34 — for accept visibility gate
  missionCollateralPoolId: string;      // NEW V34 — EVE pool (from useMissionCollateralPoolId)
  missionCollateralTokenPoolId: string; // NEW V34 — Advanced token pool ("" for non-Advanced)
  priceScale: number;                   // NEW V34 — for collateral display formatting
}

interface Props {
  mission: Mission;
  ctx: MissionViewCtx;
  onBack: () => void;
  onRefetch: () => void;
}

function fmtEve(mist: number): string {
  return (mist / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function MissionView({ mission, ctx, onBack, onRefetch }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const isAdvanced = mission.bazaarType === BAZAAR_TYPE_NUM.ADVANCED;
  const isItemProof = mission.completionMode === COMPLETION_MODE.ITEM_PROOF;
  const isOwner = !!ctx.walletAddress && ctx.walletAddress.toLowerCase() === mission.owner.toLowerCase();

  // Mission owner's Character (giver) — needed for the taker's item-proof + giver confirm.
  const { characterId: giverCharacterId } = useCharacterForAddress(mission.owner);

  // Item-name map for proof + reward rows (resolved by NAME, never id).
  const typeIds = useMemo(
    () => [...mission.proofItems, ...mission.rewardItems].map((r) => r.typeId),
    [mission.proofItems, mission.rewardItems],
  );
  const itemTypes = useItemTypes(typeIds);
  const itemName = (id: number) => itemTypes.get(id)?.name ?? `Item #${id}`;

  const { data: acceptance, refetch: refetchAcc } = useMyAcceptance(mission.id, ctx.walletAddress);

  const runsLeft = Math.max(0, mission.maxRuns - mission.runsCompleted - mission.runsInProgress);
  const acceptedActive = acceptance?.status === MISSION_ACCEPTANCE_STATUS.ACTIVE;
  const acceptedPending = acceptance?.status === MISSION_ACCEPTANCE_STATUS.PENDING;

  function refreshAll() {
    refetchAcc(); onRefetch();
    window.dispatchEvent(new CustomEvent("bazar-soft-refresh"));
  }

  async function run(label: string, build: () => ReturnType<typeof buildAcceptMission>, okMsg: string) {
    setBusy(label); setError("");
    try {
      await dAppKit.signAndExecuteTransaction({ transaction: build() });
      toast.success(okMsg);
      setTimeout(refreshAll, 800);
      refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed.";
      setError(msg); toast.error(msg);
    } finally { setBusy(null); }
  }

  /** Async sibling of run(): the build step may await (e.g. a fresh owned-cap resolve). */
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

  // ── Fresh owned-cap resolution (Issue 4 fix) ──────────────────────────────────
  // SSU OwnerCap / Character OwnerCap are OWNED objects passed via tx.receivingRef
  // with an explicit {version,digest}. The page-load cached ref goes STALE the
  // moment any prior tx borrows that cap (e.g. creating the mission as SSU owner),
  // which surfaces as `-32603 provided version doesn't match` on cancel/complete.
  // Re-resolve fresh immediately before building any owned-cap tx.
  async function freshSsuCap(): Promise<SSUOwnerCapRef | undefined> {
    if (!ctx.isSSUOwner) return undefined;
    if (!ctx.characterId) throw new Error("Character not resolved — please wait.");
    const ref = await resolveSSUOwnerCap(ctx.characterId, ctx.ssuId);
    if (!ref) throw new Error("Could not resolve your SSU owner cap — please retry.");
    return ref;
  }
  async function freshCharCap(): Promise<CharOwnerCapRef | undefined> {
    if (!ctx.charCapRef) throw new Error("Character cap not resolved — please wait.");
    return (await resolveCharOwnerCapRef(ctx.charCapRef.charCapId)) ?? ctx.charCapRef;
  }

  // ── Taker actions ────────────────────────────────────────────────────────────
  const onAccept = async () => {
    if (!ctx.memberRegistryId) { setError("Member registry not resolved — please wait."); return; }
    if (!isAdvanced && !ctx.missionCollateralPoolId) {
      setError("Collateral pool not resolved — please wait."); return;
    }
    if (isAdvanced && !ctx.missionCollateralTokenPoolId) {
      setError("Token collateral pool not resolved — please wait."); return;
    }
    setBusy("accept"); setError("");
    try {
      let tx: Transaction;
      if (isAdvanced) {
        // Advanced: ledger debit — no Coin<EVE>; builder creates its own Transaction.
        tx = buildAcceptMissionAdvanced({
          missionId: mission.id,
          ssuGovId: ctx.ssuGovId,
          tribeGovId: ctx.tribeGovId!,
          ledgerId: ctx.ledgerId!,
          memberRegistryId: ctx.memberRegistryId,
          missionCollateralTokenPoolId: ctx.missionCollateralTokenPoolId,
        });
      } else {
        // NoTribe / Easy: must split exact Coin<EVE> collateral on the same tx.
        tx = new Transaction();
        const collateralEve = mission.collateralEvePerRun;
        let collateralEveCoin: TransactionArgument;
        if (collateralEve > 0) {
          if (!ctx.walletAddress) { setError("Wallet not connected."); setBusy(null); return; }
          // splitEveCoin appends mergeCoins + splitCoins to `tx` in-place and returns coinArg.
          const split = await splitEveCoin(ctx.walletAddress, BigInt(collateralEve), tx);
          collateralEveCoin = split.coinArg;
        } else {
          // Zero collateral: pass coin::zero<EVE> (Move accepts zero-value Coin<EVE>).
          collateralEveCoin = tx.moveCall({
            target: "0x2::coin::zero",
            typeArguments: [EVE_COIN_TYPE],
            arguments: [],
          });
        }
        // Pass the pre-built tx so the moveCall lands on the SAME tx as the coin-split.
        buildAcceptMission(
          {
            missionId: mission.id,
            ssuGovId: ctx.ssuGovId,
            memberRegistryId: ctx.memberRegistryId,
            missionCollateralPoolId: ctx.missionCollateralPoolId,
            collateralEveCoin,
            // V36: accept_mission split into _notribe/_easy (Easy needs tribe_gov at slot 3).
            bazaarType: mission.bazaarType,
            tribeGovId: ctx.tribeGovId ?? undefined,
          },
          tx,   // ← same tx that holds the coin-split; builder appends moveCall to it
        );
      }
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      toast.success("Mission accepted — complete it before your timer runs out.");
      setTimeout(refreshAll, 800);
      refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed.";
      setError(msg); toast.error(msg);
    } finally { setBusy(null); }
  };

  function onCompleteItems() {
    if (!ctx.characterId) { setError("Character not resolved — please wait."); return; }
    if (!giverCharacterId) { setError("Resolving the mission giver — please wait."); return; }
    const proofItems = mission.proofItems.map((p) => ({ typeId: p.typeId, quantity: p.amount }));
    runBuild("complete", async () => {
      // Issue 4: resolve the owned cap the completion path needs FRESH (avoid stale version).
      const ssuOwnerCapRef = ctx.isSSUOwner ? await freshSsuCap() : undefined;
      const charCapRef = ctx.isSSUOwner ? undefined : await freshCharCap();
      return isAdvanced
        ? buildCompleteMissionWithItemsAdvanced({
            missionId: mission.id, ssuGovId: ctx.ssuGovId, tribeGovId: ctx.tribeGovId!,
            ledgerId: ctx.ledgerId!, ssuId: mission.ssuId, giverCharacterId: giverCharacterId!,
            takerCharacterId: ctx.characterId!, proofItems,
            asTakerSsuOwner: ctx.isSSUOwner, charCapRef, ssuOwnerCapRef,
            missionCollateralTokenPoolId: ctx.missionCollateralTokenPoolId,  // NEW V34
          })
        : buildCompleteMissionWithItems({
            missionId: mission.id, ssuGovId: ctx.ssuGovId, ssuId: mission.ssuId,
            giverCharacterId: giverCharacterId!, takerCharacterId: ctx.characterId!, proofItems,
            asTakerSsuOwner: ctx.isSSUOwner, charCapRef, ssuOwnerCapRef,
            missionCollateralPoolId: ctx.missionCollateralPoolId,  // NEW V34
          });
    }, "Mission complete — reward released.");
  }

  const onCompleteOther = () =>
    run("complete", () => isAdvanced
      ? buildCompleteMissionOtherAdvanced({
          missionId: mission.id, ssuGovId: ctx.ssuGovId, tribeGovId: ctx.tribeGovId!, ledgerId: ctx.ledgerId!,
        })
      : buildCompleteMissionOther({ missionId: mission.id, ssuGovId: ctx.ssuGovId }),
      "Submitted for the giver to confirm.");

  const onExpireSelf = () =>
    run("expire", () => buildExpireAcceptance({
      missionId: mission.id, taker: ctx.walletAddress!,
      missionCollateralPoolId: ctx.missionCollateralPoolId,  // V34: expire forfeits collateral to giver
    }), "Lapsed run cleared.");

  const rewardMoney = isAdvanced ? mission.rewardTokenPerRun : mission.rewardEvePerRun;
  const moneyLabel = isAdvanced
    ? `${mission.rewardTokenPerRun.toLocaleString()} ${ctx.displayCurrency}`
    : `${fmtEve(mission.rewardEvePerRun)} ${ctx.displayCurrency}`;

  return (
    <div className="mission-view">
      <div className="mission-view__header">
        <div className="mission-view__title-row">
          <h2>{mission.title}</h2>
          <span className="badge badge--mis">MIS</span>
          <span className="badge mission-view__type">{MISSION_TYPE_LABEL[mission.missionType] ?? "Mission"}</span>
          {isOwner && <span className="badge badge--tribe">★ YOURS</span>}
          <button className="btn btn--ghost btn--sm mission-view__close" onClick={onBack}>X</button>
        </div>
        <div className="mission-view__meta">
          <span>{runsLeft} of {mission.maxRuns} run{mission.maxRuns === 1 ? "" : "s"} left</span>
          <span className="muted">·</span>
          <span>Time limit: {Math.round(mission.takerTimeLimitMs / 3_600_000)}h per taker</span>
          <span className="muted">·</span>
          <span>{isItemProof ? "Item-proof (auto)" : "Giver-confirmed"}</span>
        </div>
      </div>

      {mission.description && <p className="mission-view__desc">{mission.description}</p>}

      {(isAdvanced ? mission.collateralTokenPerRun : mission.collateralEvePerRun) > 0 && (
        <p style={{ fontSize: "0.78rem", margin: "0.3rem 0", color: "var(--accent, #cc7000)" }}>
          Collateral:{" "}
          {isAdvanced
            ? `${mission.collateralTokenPerRun.toLocaleString()} ${ctx.displayCurrency}`
            : `${fmtEve(mission.collateralEvePerRun)} ${ctx.displayCurrency}`}
          {" "}(posted at accept; returned on completion, split on cancel, forfeited on timeout)
        </p>
      )}

      <div className="mission-view__cols">
        {/* Reward */}
        <section className="mission-view__panel">
          <h3>Reward <span className="muted">(per run)</span></h3>
          <ul className="mission-view__list">
            {mission.rewardItems.map((r, i) => (
              <li key={`rw${i}`}>{r.amount} × {itemName(r.typeId)}</li>
            ))}
            {rewardMoney > 0 && <li>{moneyLabel}</li>}
            {mission.rewardItems.length === 0 && rewardMoney === 0 && <li className="muted">—</li>}
          </ul>
        </section>

        {/* Proof / completion */}
        <section className="mission-view__panel">
          <h3>{isItemProof ? "Required to complete" : "Completion"}</h3>
          {isItemProof ? (
            <ul className="mission-view__list">
              {mission.proofItems.map((p, i) => (
                <li key={`pf${i}`}>{p.amount} × {itemName(p.typeId)}</li>
              ))}
            </ul>
          ) : (
            <p className="mission-view__trust">
              Manual completion — the giver reviews and Confirms or Rejects your submission.
            </p>
          )}
        </section>
      </div>

      {error && <div className="currency-selector__warning" style={{ margin: "0.5rem 0" }}>{error}</div>}

      {/* ── Taker actions ─────────────────────────────────────────────────────── */}
      {!isOwner && (
        <div className="mission-view__actions">
          {!acceptance && runsLeft > 0 && (
            <button className="btn btn--primary" disabled={busy !== null} onClick={onAccept}>
              {busy === "accept" ? "…" : "Accept Mission"}
            </button>
          )}
          {/* Issue 1: runs all taken/completed → greyed (disabled) accept, the stall persists. */}
          {!acceptance && runsLeft === 0 && (
            <button className="btn btn--primary" disabled title="No runs left — all are taken or completed.">
              Accept Mission (no runs left)
            </button>
          )}
          {acceptedActive && (
            <button className="btn btn--primary mission-view__complete-btn" disabled={busy !== null}
              onClick={isItemProof ? onCompleteItems : onCompleteOther}>
              {busy === "complete" ? "…" : isItemProof ? "Complete Mission" : "Submit for Confirmation"}
            </button>
          )}
          {acceptedActive && (
            <button className="btn btn--ghost btn--sm mission-view__cancel-run" disabled={busy !== null}
              onClick={() => setCancelConfirmOpen(true)}>
              Cancel run
            </button>
          )}
          {acceptedActive && (() => {
            const cd = missionCountdown(acceptance!.deadlineMs, Date.now());
            return cd.expired ? (
              <button className="btn btn--ghost btn--sm" disabled={busy !== null} onClick={onExpireSelf}
                title="Timer lapsed — free the run (forfeits collateral to giver).">
                {busy === "expire" ? "…" : "Abandon run (timer lapsed)"}
              </button>
            ) : null;
          })()}
          {acceptedPending && <span className="muted">Submitted — awaiting the giver's confirmation.</span>}
        </div>
      )}

      {/* ── Owner / giver dashboard ───────────────────────────────────────────── */}
      {isOwner && (
        <MissionOwnerPanel
          mission={mission} ctx={ctx} giverCharacterId={giverCharacterId} onChanged={refreshAll}
        />
      )}
    {cancelConfirmOpen && (
      <MissionCancelConfirm
        currency={ctx.displayCurrency}
        collateralAmount={isAdvanced ? mission.collateralTokenPerRun : mission.collateralEvePerRun}
        priceScale={ctx.priceScale}
        isAdvanced={isAdvanced}
        busy={busy === "cancel-acceptance"}
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={() => {
          setCancelConfirmOpen(false);
          run("cancel-acceptance",
            () => isAdvanced
              ? buildCancelMyAcceptanceAdvanced({
                  missionId: mission.id, ssuGovId: ctx.ssuGovId,
                  tribeGovId: ctx.tribeGovId!, ledgerId: ctx.ledgerId!,
                  missionCollateralTokenPoolId: ctx.missionCollateralTokenPoolId,
                })
              : buildCancelMyAcceptance({
                  missionId: mission.id, ssuGovId: ctx.ssuGovId,
                  missionCollateralPoolId: ctx.missionCollateralPoolId,
                }),
            "Run cancelled.");
        }}
      />
    )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
