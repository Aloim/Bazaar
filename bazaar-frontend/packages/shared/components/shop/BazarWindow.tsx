// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useConnection, dAppKit } from "@evefrontier/dapp-kit";
import { useShops } from "@bazaar/shared/hooks/useShops";
import { useClaimBoxContext } from "@bazaar/shared/contexts/ClaimBoxContext";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import BazarField from "@bazaar/shared/components/shop/BazarField";
import ShopView from "@bazaar/shared/components/shop/ShopView";
import CreateShopModal from "@bazaar/shared/components/shop/CreateShopModal";
import SSUFilter, { loadPersistedTierFilter } from "@bazaar/shared/components/SSUFilter";
import { useCurrentSsuContext } from "@bazaar/shared/hooks/useCurrentSsuContext";
import { classifyShopTier, type ShopTier } from "@bazaar/shared/utils/shopTier";
import { buildCloseShop } from "@bazaar/shared/tx/bazaarcore/shop-tx";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { translateMoveAbort } from "@bazaar/shared/utils";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import type { Screen, Shop, ShopKind } from "@bazaar/shared/types";

interface Props { nav: (s: Screen) => void }

type Filter = Record<ShopKind, boolean>;

export default function BazarWindow({ nav }: Props) {
  const { walletAddress } = useConnection();
  const { shops, isLoading, refetch, refreshShop } = useShops();
  const { currencyName } = useClaimBoxContext();
  const displayCurrency = currencyName || "EVE";
  const { data: sharedObjs } = useSSUSharedObjects(SSU_OBJECT_ID);

  const { characterId, charCapRef, ssuCapRef, isLoading: capLoading } =
    useCharacterOwnerCapRef(walletAddress ?? undefined, sharedObjs?.ssuId ?? SSU_OBJECT_ID);
  const ssuOwnerCapRef = ssuCapRef;
  const wtbEscrowPoolId = sharedObjs?.wtbEscrowPoolId ?? "";

  const [filter, setFilter]             = useState<Filter>({ WTS: true, WTB: true, DE: true, FREE: true });
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [showMyShops, setShowMyShops]   = useState(false);
  const [showHelp, setShowHelp]         = useState(false);
  const [closeError, setCloseError]     = useState<string>("");

  // Shop Filter — bazaar-type-aware visibility tiers (own / tribe / other).
  // Default = own SSU only, so a bazaar shows only its own shops (fixes
  // "Advanced shops appear in NoTribe"). SSUFilter persists to localStorage.
  const { bazaarType: currentBazaarType, tribeId: currentTribeId } = useCurrentSsuContext();
  const [enabledTiers, setEnabledTiers] = useState<Set<ShopTier>>(() => loadPersistedTierFilter());
  const handleTiersChange = useCallback((tiers: Set<ShopTier>) => {
    setEnabledTiers(tiers);
  }, []);

  const toggleFilter = (k: ShopKind) =>
    setFilter(f => ({ ...f, [k]: !f[k] }));

  const tierCtx = useMemo(
    () => ({ currentSsuId: SSU_OBJECT_ID, currentBazaarType, currentTribeId }),
    [currentBazaarType, currentTribeId],
  );

  // Classify every shop relative to the current SSU once.
  const shopTiers = useMemo(() => {
    const m = new Map<string, ShopTier>();
    for (const s of shops) m.set(s.id, classifyShopTier(s, tierCtx));
    return m;
  }, [shops, tierCtx]);

  const tierCounts = useMemo(() => {
    const c: Record<ShopTier, number> = { own: 0, tribe: 0, other: 0 };
    for (const t of shopTiers.values()) c[t] += 1;
    return c;
  }, [shopTiers]);

  // Filter by enabled tiers; own shops sort first.
  const filteredShops = useMemo(() => {
    const rank: Record<ShopTier, number> = { own: 0, tribe: 1, other: 2 };
    return shops
      .filter(s => enabledTiers.has(shopTiers.get(s.id) ?? "other"))
      .sort((a, b) => rank[shopTiers.get(a.id) ?? "other"] - rank[shopTiers.get(b.id) ?? "other"]);
  }, [shops, enabledTiers, shopTiers]);

  const myShops = shops.filter(s => s.owner === walletAddress);
  const activeMyShops   = myShops.filter(s => s.isActive);
  const inactiveMyShops = myShops.filter(s => !s.isActive);

  async function closeShop(shop: Shop) {
    setCloseError("");
    if (!characterId || !charCapRef || capLoading) {
      setCloseError("Character not loaded — please wait and retry.");
      return;
    }
    if (!wtbEscrowPoolId) {
      setCloseError("SSU shared objects still resolving — please retry shortly.");
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
    }
  }

  if (selectedShop) {
    return <ShopView shop={selectedShop} onBack={() => setSelectedShop(null)} refetch={refetch} refreshShop={refreshShop} />;
  }

  return (
    <div className="bazar">
      <div className="bazar__header">
        <button className="btn btn--ghost btn--sm" onClick={() => nav("landing")}>Back</button>
        <h2 className="bazar__title">THE BAZAAR</h2>
        <button className="btn btn--primary btn--sm bazar__create-mobile" onClick={() => setShowCreate(true)}>+ Shop</button>
        <button className="btn btn--ghost btn--sm" title="Help" onClick={() => setShowHelp(true)}>?</button>
      </div>

      <div className="bazar__body">
        {isLoading ? (
          <div className="bazar__field-area">
            <div className="bazar__field-loading">Loading shops...</div>
          </div>
        ) : (
          <BazarField
            shops={filteredShops}
            filter={filter}
            onOpen={setSelectedShop}
          />
        )}

        <div className="bazar__sidebar">
          <div className="bazar__filters">
            <h4>Filters</h4>
            {(["WTS", "WTB", "DE"] as ShopKind[]).map(k => (
              <label key={k} className="filter-check">
                <input type="checkbox" checked={filter[k]} onChange={() => toggleFilter(k)} />
                <span className={`badge badge--${k.toLowerCase()}`}>{k}</span>
              </label>
            ))}
            <SSUFilter
              counts={tierCounts}
              onChange={handleTiersChange}
            />
          </div>

          <div className="bazar__actions">
            <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
              + Create My Shop
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowMyShops(!showMyShops)}>
              My Shops ({activeMyShops.length})
            </button>
          </div>

          {showMyShops && (
            <div className="my-shops">
              {closeError && (
                <p style={{ fontSize: "0.78rem", color: "var(--danger)", marginBottom: "0.4rem" }}>{closeError}</p>
              )}
              {activeMyShops.length === 0 && inactiveMyShops.length === 0 ? (
                <p className="muted">No active shops.</p>
              ) : (
                <>
                  {activeMyShops.map(s => (
                    <div key={s.id} className="my-shops__item">
                      <span>{s.title}</span>
                      <span className={`badge badge--${s.kind.toLowerCase()}`}>{s.kind}</span>
                      <button className="btn btn--danger btn--sm" onClick={() => closeShop(s)}>
                        Close
                      </button>
                    </div>
                  ))}
                  {inactiveMyShops.map(s => (
                    <div key={s.id} className="my-shops__item" style={{ opacity: 0.65 }}>
                      <span>{s.title}</span>
                      <span className={`badge badge--${s.kind.toLowerCase()}`}>{s.kind}</span>
                      <span className="badge badge--status-cancelled" style={{ marginLeft: "auto" }}>Inactive</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreate && <CreateShopModal onClose={() => {
        setShowCreate(false);
        refetch();
        // Refetch again after a short delay — chain indexing may lag
        setTimeout(() => refetch(), 2000);
      }} />}

      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Shop Types</h3>
            <p><strong>WTS</strong> — Want to Sell. Owner lists items; buyers pay {displayCurrency}.</p>
            <p><strong>WTB</strong> — Want to Buy. Owner requests items; escrow funds sellers.</p>
            <p><strong>DE</strong> — Direct Exchange. Swap items directly. A flat {displayCurrency} fee applies.</p>
            <p className="muted" style={{ marginTop: "1rem" }}>Currency: {displayCurrency} only.</p>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowHelp(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
