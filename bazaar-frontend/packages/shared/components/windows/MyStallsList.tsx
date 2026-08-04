// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MyStallsList — the "My Stalls" tab of the Market & Missions window.
 *
 * One unified list of every ACTIVE stall the connected wallet owns — shops AND
 * mission stalls — each with a per-row Close (shops) / Cancel (missions) action.
 * Only active entities exist (closed/finished are gone), so there is no
 * inactive/summary section.
 *
 * Context (SSU shared objects, character + cap refs, the Advanced tribe/ledger
 * chain) is resolved once by MarketWindow and handed down, mirroring how
 * MissionsWindow hands context to MissionView.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useState } from "react";
import { dAppKit, abbreviateAddress } from "@evefrontier/dapp-kit";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { BAZAAR_TYPE_NUM } from "@bazaar/shared/types";
import type { Shop, Mission } from "@bazaar/shared/types";
import { Transaction } from "@mysten/sui/transactions";
import { buildCloseShop } from "@bazaar/shared/tx/bazaarcore/shop-tx";
import { buildCancelMission } from "@bazaar/shared/tx/bazaarcore/mission-tx";
import { buildCancelMissionAdvanced } from "@bazaar/shared/tx/bazaareconomy/mission-ledger-tx";
import { resolveSSUOwnerCap } from "@bazaar/shared/tx";
import { translateMoveAbort } from "@bazaar/shared/utils";
import type { CharOwnerCapRef } from "@bazaar/shared/tx/bazaarcore/shop-escrow-helpers";
import type { SSUOwnerCapRef } from "@bazaar/shared/tx/bazaarcore/ssu-receiving-tx";

/** Context resolved once by MarketWindow for the close/cancel actions. */
export interface MyStallsCtx {
  walletAddress: string | null;
  ssuGovId: string;
  ssuId: string;
  wtbEscrowPoolId: string;
  characterId: string | null;
  charCapRef?: CharOwnerCapRef;
  isSSUOwner: boolean;
  ssuOwnerCapRef?: SSUOwnerCapRef;
  capLoading: boolean;
  /** Advanced mission cancel chain (null on NoTribe/Easy). */
  tribeGovId: string | null;
  ledgerId: string | null;
}

interface Props {
  shops: Shop[];
  missions: Mission[];
  ctx: MyStallsCtx;
  isLoading: boolean;
  onChanged: () => void;
}

export default function MyStallsList({ shops, missions, ctx, isLoading, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const wallet = ctx.walletAddress?.toLowerCase();
  const myShops = shops.filter((s) => s.isActive && s.owner?.toLowerCase() === wallet);
  const myMissions = missions.filter((m) => m.owner?.toLowerCase() === wallet); // useMissions already drops inactive

  async function sign(id: string, build: () => Transaction | Promise<Transaction>) {
    setBusyId(id);
    setError("");
    try {
      const tx = await build();
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onChanged();
    } catch (e) {
      setError(translateMoveAbort(e));
    } finally {
      setBusyId(null);
    }
  }

  function closeShop(shop: Shop) {
    if (!ctx.characterId || ctx.capLoading) { setError("Character not loaded — please wait and retry."); return; }
    if (!ctx.wtbEscrowPoolId) { setError("SSU shared objects still resolving — please retry shortly."); return; }
    sign(shop.id, () =>
      buildCloseShop({
        shopId:          shop.id,
        ssuGovId:        ctx.ssuGovId || shop.ssuId,
        ssuId:           ctx.ssuId || SSU_OBJECT_ID,
        characterId:     ctx.characterId!,
        wtbEscrowPoolId: ctx.wtbEscrowPoolId,
        charCapRef:      ctx.charCapRef,
        ssuOwnerCapRef:  ctx.ssuOwnerCapRef,
      }),
    );
  }

  function cancelMission(mission: Mission) {
    if (!ctx.characterId || ctx.capLoading) { setError("Character not loaded — please wait and retry."); return; }
    if (ctx.isSSUOwner && !ctx.ssuOwnerCapRef) { setError("Resolving SSU owner cap — please wait."); return; }
    const isAdvanced = mission.bazaarType === BAZAAR_TYPE_NUM.ADVANCED;
    if (isAdvanced && (!ctx.tribeGovId || !ctx.ledgerId)) {
      setError("Resolving tribe economy — please retry shortly.");
      return;
    }
    sign(mission.id, async () => {
      // Issue 4: re-resolve the SSU owner cap FRESH (page-load ref goes stale after any
      // prior borrow → `-32603 provided version doesn't match`).
      const ssuOwnerCapRef = ctx.isSSUOwner && ctx.characterId
        ? (await resolveSSUOwnerCap(ctx.characterId, ctx.ssuId)) ?? ctx.ssuOwnerCapRef
        : ctx.ssuOwnerCapRef;
      return isAdvanced
        ? buildCancelMissionAdvanced({
            missionId: mission.id, ssuGovId: ctx.ssuGovId, tribeGovId: ctx.tribeGovId!, ledgerId: ctx.ledgerId!,
            ssuId: mission.ssuId, ownerCharacterId: ctx.characterId!,
            asSsuOwner: ctx.isSSUOwner, ssuOwnerCapRef,
          })
        : buildCancelMission({
            missionId: mission.id, ssuGovId: ctx.ssuGovId, ssuId: mission.ssuId,
            ownerCharacterId: ctx.characterId!, asSsuOwner: ctx.isSSUOwner, ssuOwnerCapRef,
          });
    });
  }

  const total = myShops.length + myMissions.length;

  return (
    <div>
      {error && (
        <p style={{ fontSize: "0.78rem", color: "var(--danger, #f44336)", marginBottom: "0.5rem" }}>{error}</p>
      )}

      {isLoading && <p className="muted" style={{ fontSize: "0.8rem" }}>Loading your stalls…</p>}

      {!isLoading && total === 0 && (
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          You have no active stalls. Fly near a free spot and press <strong>C</strong> to create a shop or mission.
        </p>
      )}

      {/* Shops */}
      {myShops.map((shop) => {
        const listingLabel = shop.kind === "DE"
          ? `${shop.pairs.length} pair${shop.pairs.length !== 1 ? "s" : ""}`
          : `${shop.listings.length} listing${shop.listings.length !== 1 ? "s" : ""}`;
        const busy = busyId === shop.id;
        return (
          <div key={shop.id} className="market-window__shop">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>{shop.title}</span>
              <span className={`badge badge--${shop.kind.toLowerCase()}`}>{shop.kind}</span>
            </div>
            <div className="muted" style={{ fontSize: "0.72rem", marginTop: "0.15rem" }}>
              {listingLabel}
              {shop.ssuId && shop.ssuId !== SSU_OBJECT_ID && ` · SSU ${abbreviateAddress(shop.ssuId)}`}
            </div>
            <button className="btn btn--danger btn--sm" style={{ marginTop: "0.4rem" }} onClick={() => closeShop(shop)} disabled={busy}>
              {busy ? "Closing…" : "Close Shop"}
            </button>
          </div>
        );
      })}

      {/* Mission stalls */}
      {myMissions.map((mission) => {
        const runsLeft = Math.max(0, mission.maxRuns - mission.runsCompleted - mission.runsInProgress);
        const busy = busyId === mission.id;
        return (
          <div key={mission.id} className="market-window__shop">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>{mission.title || "Mission"}</span>
              <span className="badge badge--mis">MIS</span>
            </div>
            <div className="muted" style={{ fontSize: "0.72rem", marginTop: "0.15rem" }}>
              {runsLeft}/{mission.maxRuns} run{mission.maxRuns === 1 ? "" : "s"} left
            </div>
            <button className="btn btn--danger btn--sm" style={{ marginTop: "0.4rem" }} onClick={() => cancelMission(mission)} disabled={busy}>
              {busy ? "Cancelling…" : "Cancel Mission (refund)"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
