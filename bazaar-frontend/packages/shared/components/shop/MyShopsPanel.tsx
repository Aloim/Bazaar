// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";
import { dAppKit, useConnection, abbreviateAddress } from "@evefrontier/dapp-kit";
import { useShops } from "@bazaar/shared/hooks/useShops";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { buildCloseShop } from "@bazaar/shared/tx/bazaarcore/shop-tx";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { translateMoveAbort } from "@bazaar/shared/utils";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import type { Screen, Shop } from "@bazaar/shared/types";

interface Props {
  nav:     (s: Screen) => void;
  onClose: () => void;
}

export default function MyShopsPanel({ nav, onClose }: Props) {
  const { walletAddress } = useConnection();
  const { shops, isLoading, refetch } = useShops();
  const { data: sharedObjs } = useSSUSharedObjects(SSU_OBJECT_ID);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string>("");

  const { characterId, charCapRef, ssuCapRef, isLoading: capLoading } =
    useCharacterOwnerCapRef(walletAddress ?? undefined, sharedObjs?.ssuId ?? SSU_OBJECT_ID);
  const ssuOwnerCapRef = ssuCapRef;
  const wtbEscrowPoolId = sharedObjs?.wtbEscrowPoolId ?? "";

  const myShops = shops.filter(s => s.owner === walletAddress);
  const activeShops   = myShops.filter(s => s.isActive);
  const inactiveShops = myShops.filter(s => !s.isActive);

  async function closeShop(shop: Shop) {
    setClosingId(shop.id);
    setCloseError("");
    if (!characterId || !charCapRef || capLoading) {
      setCloseError("Character not loaded — please wait and retry.");
      setClosingId(null);
      return;
    }
    if (!wtbEscrowPoolId) {
      setCloseError("SSU shared objects still resolving — please retry shortly.");
      setClosingId(null);
      return;
    }
    try {
      const tx = buildCloseShop({
        shopId:          shop.id,
        ssuGovId:        sharedObjs?.ssuGovId ?? shop.ssuId,
        ssuId:           sharedObjs?.ssuId ?? SSU_OBJECT_ID,
        characterId,
        wtbEscrowPoolId,
        charCapRef,
        ssuOwnerCapRef,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetch();
      setCloseError("");
    } catch (e: unknown) {
      setCloseError(translateMoveAbort(e));
    } finally {
      setClosingId(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
        <h2>My Shops</h2>
      </div>

      <div className="panel__section">
        {isLoading && <p className="muted">Loading shops...</p>}

        {!isLoading && activeShops.length === 0 && inactiveShops.length === 0 && (
          <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
            <p className="muted">You have no active shops.</p>
            <button
              className="btn btn--primary btn--sm"
              style={{ marginTop: "1rem" }}
              onClick={() => nav("bazar")}
            >
              Open Bazaar to Create a Shop
            </button>
          </div>
        )}

        {closeError && (
          <p className="muted" style={{ fontSize: "0.82rem", color: "var(--danger)", marginBottom: "0.5rem" }}>
            {closeError}
          </p>
        )}

        {!isLoading && (activeShops.length > 0 || inactiveShops.length > 0) && (
          <div className="donate-panel__item-list">
            {activeShops.map(shop => {
              const listingLabel =
                shop.kind === "DE" ? `${shop.pairs.length} pair${shop.pairs.length !== 1 ? "s" : ""}` :
                `${shop.listings.length} listing${shop.listings.length !== 1 ? "s" : ""}`;
              const isClosing = closingId === shop.id;

              return (
                <div
                  key={shop.id}
                  className="action-card"
                  style={{ marginBottom: "0.5rem" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{shop.title}</span>{" "}
                      <span className={`badge badge--${shop.kind.toLowerCase()}`}>{shop.kind}</span>
                    </div>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>{listingLabel}</span>
                  </div>
                  {shop.ssuId && (
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: "0.15rem" }}>
                      SSU: {abbreviateAddress(shop.ssuId)}
                      {shop.ssuId === SSU_OBJECT_ID && " (this SSU)"}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => nav("bazar")}
                    >
                      View in Bazaar
                    </button>
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => closeShop(shop)}
                      disabled={isClosing}
                    >
                      {isClosing ? "Closing..." : "Close Shop"}
                    </button>
                  </div>
                </div>
              );
            })}
            {inactiveShops.map(shop => {
              const listingLabel =
                shop.kind === "DE" ? `${shop.pairs.length} pair${shop.pairs.length !== 1 ? "s" : ""}` :
                `${shop.listings.length} listing${shop.listings.length !== 1 ? "s" : ""}`;

              return (
                <div
                  key={shop.id}
                  className="action-card"
                  style={{ marginBottom: "0.5rem", opacity: 0.7 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{shop.title}</span>{" "}
                      <span className={`badge badge--${shop.kind.toLowerCase()}`}>{shop.kind}</span>{" "}
                      <span className="badge badge--status-cancelled">Inactive</span>
                    </div>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>{listingLabel}</span>
                  </div>
                  {shop.ssuId && (
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: "0.15rem" }}>
                      SSU: {abbreviateAddress(shop.ssuId)}
                      {shop.ssuId === SSU_OBJECT_ID && " (this SSU)"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
