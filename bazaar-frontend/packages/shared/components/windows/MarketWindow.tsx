// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MarketWindow — in-HUD floating "Market & Missions" panel (opened from the HUD
 * Market & Missions button). Three tabs:
 *   1. Filter              (default) — the bazaar-type-aware Shop Filter
 *                          (<SSUFilter/>: own / tribe / other tier checkboxes) PLUS
 *                          a "Hide all missions" checkbox. Toggling persists to
 *                          localStorage AND dispatches "bazar-shop-filter-changed"
 *                          so the in-world Godot beacons / stalls re-filter live.
 *   2. My Stalls           — every ACTIVE stall the wallet owns (shops + mission
 *                          stalls), each with a Close / Cancel action (<MyStallsList/>).
 *   3. My Accepted Missions — the wallet's active accepted missions, read-only;
 *                          completion happens at the in-world stall (<AcceptedMissionsList/>).
 *
 * Only active entities are listed anywhere — closed/finished shops & missions are
 * gone (no inactive/summary section). The window resolves shared-object / cap /
 * tribe context once and hands it to MyStallsList for the close/cancel actions.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useState, useMemo, useEffect } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useShops } from "@bazaar/shared/hooks/useShops";
import { useMissions } from "@bazaar/shared/hooks/bazaarcore/mission-hooks";
import { useMyAcceptedMissions } from "@bazaar/shared/hooks/bazaarcore/useMyAcceptedMissions";
import {
  useSSUSharedObjects, useTribeGovId,
} from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSUGovernanceConfig, useTribeEconomyObjects } from "@bazaar/shared/hooks";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import { useCurrentSsuContext } from "@bazaar/shared/hooks/useCurrentSsuContext";
import { classifyShopTier, type ShopTier } from "@bazaar/shared/utils/shopTier";
import { SSU_OBJECT_ID, COIN_DECIMALS } from "@bazaar/shared/constants";
import { TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";
import { BAZAAR_TYPE_NUM } from "@bazaar/shared/types";
import SSUFilter from "@bazaar/shared/components/SSUFilter";
import WindowHeader from "@bazaar/shared/components/windows/WindowHeader";
import MyStallsList, { type MyStallsCtx } from "@bazaar/shared/components/windows/MyStallsList";
import AcceptedMissionsList, { type AcceptedMissionsCtx } from "@bazaar/shared/components/windows/AcceptedMissionsList";
import { useMissionCollateralPoolId, useMissionCollateralTokenPoolId } from "@bazaar/shared/hooks/bazaareconomy/economy-resolution-hooks";
import { useTribeTokenBalance } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import { useClaimBoxContext } from "@bazaar/shared/contexts";

/** The window's three tabs — also the quick-jump targets from the HUD MarketMenu. */
export type MarketTab = "filter" | "mystalls" | "accepted";

interface Props {
  onClose: () => void;
  /** Tab to open on (from the HUD Market & Missions dropdown). Default "filter". */
  initialTab?: MarketTab;
}

const ACCENT = "var(--accent, #cc7000)";

export default function MarketWindow({ onClose, initialTab }: Props) {
  const { walletAddress } = useConnection();
  const { shops, isLoading, refetch } = useShops();
  const { data: sharedObjs } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const { bazaarType: currentBazaarType, tribeId: currentTribeId } = useCurrentSsuContext();

  // Active missions at this SSU (already drops inactive) — owned subset → My Stalls.
  const { data: missions = [], refetch: refetchMissions } = useMissions(SSU_OBJECT_ID || null);
  const { items: accepted } = useMyAcceptedMissions(SSU_OBJECT_ID || null, walletAddress ?? null);

  // Cap / character context for Close (shops) + Cancel (missions).
  const { characterId, charCapRef, ssuCapRef, isSsuOwner, isLoading: capLoading } =
    useCharacterOwnerCapRef(walletAddress ?? undefined, sharedObjs?.ssuId ?? SSU_OBJECT_ID);

  // Advanced mission-cancel chain: ssuGov → tribeId → tribeGov / ledger.
  const { data: ssuGovConfig } = useSSUGovernanceConfig(sharedObjs?.ssuGovId ?? null);
  const tribeIdStr = ssuGovConfig?.tribeId ? String(ssuGovConfig.tribeId) : null;
  const { data: tribeGovId } = useTribeGovId(tribeIdStr);
  const { data: econObjects } = useTribeEconomyObjects(tribeIdStr);

  const isAdvancedSsu = currentBazaarType === BAZAAR_TYPE_NUM.ADVANCED;
  const { data: missionCollateralPoolId = null } = useMissionCollateralPoolId(
    !isAdvancedSsu ? (SSU_OBJECT_ID || null) : null,
  );
  const { data: missionCollateralTokenPoolId = null } = useMissionCollateralTokenPoolId(
    isAdvancedSsu ? (SSU_OBJECT_ID || null) : null,
  );

  // CC-05: derive displayCurrency from context (token symbol for Advanced, EVE otherwise).
  const { currencyName } = useClaimBoxContext();
  const displayCurrency = currencyName || "EVE";

  // CC-04: priceScale for collateral display — same derivation as CreateShopModal.
  const tribeTokenBalQ = useTribeTokenBalance(
    isAdvancedSsu ? (econObjects?.ledgerId ?? null) : null,
    walletAddress ?? undefined,
  );
  const tribeTokenDecimals = tribeTokenBalQ.data?.decimals ?? TRIBE_TOKEN_DECIMALS;
  const priceScale = isAdvancedSsu ? Math.pow(10, tribeTokenDecimals) : COIN_DECIMALS;

  const [tab, setTab] = useState<MarketTab>(initialTab ?? "filter");
  // Re-opened from the HUD dropdown on a different tab → jump to it.
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  // Per-tier counts shown next to each filter checkbox.
  const tierCounts = useMemo(() => {
    const ctx = { currentSsuId: SSU_OBJECT_ID, currentBazaarType, currentTribeId };
    const c: Record<ShopTier, number> = { own: 0, tribe: 0, other: 0 };
    for (const s of shops) c[classifyShopTier(s, ctx)] += 1;
    return c;
  }, [shops, currentBazaarType, currentTribeId]);

  const wallet = walletAddress?.toLowerCase();
  const myStallCount =
    shops.filter((s) => s.isActive && s.owner?.toLowerCase() === wallet).length +
    missions.filter((m) => m.owner?.toLowerCase() === wallet).length;

  const stallsCtx: MyStallsCtx = {
    walletAddress: walletAddress ?? null,
    ssuGovId:        sharedObjs?.ssuGovId ?? "",
    ssuId:           sharedObjs?.ssuId ?? SSU_OBJECT_ID,
    wtbEscrowPoolId: sharedObjs?.wtbEscrowPoolId ?? "",
    characterId:     characterId ?? null,
    charCapRef,
    isSSUOwner:      isSsuOwner,
    ssuOwnerCapRef:  ssuCapRef,
    capLoading,
    tribeGovId:      tribeGovId ?? null,
    ledgerId:        econObjects?.ledgerId ?? null,
  };

  const acceptedCtx: AcceptedMissionsCtx = {
    ssuGovId:                    sharedObjs?.ssuGovId ?? "",
    missionCollateralPoolId:     missionCollateralPoolId ?? "",
    missionCollateralTokenPoolId: missionCollateralTokenPoolId ?? "",
    tribeGovId:                  tribeGovId ?? null,
    ledgerId:                    econObjects?.ledgerId ?? null,
    displayCurrency,             // CC-05: derived from ClaimBoxContext, not hardcoded
    priceScale,                  // CC-04: correct scale per bazaarType
  };

  function refreshStalls() {
    refetch();
    refetchMissions();
  }

  const tabBtn = (id: MarketTab, label: string) => (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={() => setTab(id)}
      style={{
        flex: 1,
        borderBottom: tab === id ? `2px solid ${ACCENT}` : "2px solid transparent",
        color: tab === id ? ACCENT : undefined,
        borderRadius: 0,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="market-window">
      <WindowHeader title={<>MARKET &amp; MISSIONS</>} onClose={onClose} />

      <div className="market-window__tabs">
        {tabBtn("filter", "Filter")}
        {tabBtn("mystalls", `My Stalls${myStallCount ? ` (${myStallCount})` : ""}`)}
        {tabBtn("accepted", `Accepted${accepted.length ? ` (${accepted.length})` : ""}`)}
      </div>

      <div className="market-window__body scroll-area">
        {tab === "filter" && (
          <div>
            <p className="muted" style={{ fontSize: "0.74rem", margin: "0 0 0.6rem" }}>
              Choose which shops &amp; missions appear in the world and the bazaar list.
            </p>
            <SSUFilter counts={tierCounts} onChange={() => { /* persisted + event-driven by SSUFilter */ }} />
          </div>
        )}

        {tab === "mystalls" && (
          <MyStallsList
            shops={shops}
            missions={missions}
            ctx={stallsCtx}
            isLoading={isLoading}
            onChanged={refreshStalls}
          />
        )}

        {tab === "accepted" && <AcceptedMissionsList ctx={acceptedCtx} />}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
