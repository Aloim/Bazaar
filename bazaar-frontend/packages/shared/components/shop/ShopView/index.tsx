// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/ShopView.tsx (lines 32-79; split for 500-line guard, section: ShopView main shell + kind switch).
// Kind sub-components in ./kinds/WTSView.tsx, ./kinds/WTBView.tsx, ./kinds/DEView.tsx, ./kinds/FREEView.tsx.

import { useMemo } from "react";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import type { Shop } from "@bazaar/shared/types";
import { useCharacterNames } from "@bazaar/shared/hooks";
import { isCrossSSU } from "./isCrossSSU";
import WTSView from "./kinds/WTSView";
import WTBView from "./kinds/WTBView";
import DEView from "./kinds/DEView";
import FREEView from "./kinds/FREEView";

interface Props {
  shop:          Shop;
  onBack:        () => void;
  refetch:       () => void;
  refreshShop:   (shopId: string) => Promise<void>;
  tribeWalletId?: string;
}

export default function ShopView({ shop, onBack, refetch, refreshShop, tribeWalletId = "" }: Props) {
  const ownerAddresses = useMemo(() => [shop.owner], [shop.owner]);
  const ownerNames = useCharacterNames(ownerAddresses);
  const sellerDisplay = ownerNames.get(shop.owner) ?? abbreviateAddress(shop.owner);

  return (
    <div className="shop-view">
      <div className="shop-view__header">
        <div className="shop-view__title-row">
          <h2>{shop.title}</h2>
          <span className={`badge badge--${shop.kind.toLowerCase()}`}>{shop.kind}</span>
          {shop.is_tribe_store && <span className="badge badge--tribe">★ TRIBE</span>}
          {shop.displayId != null && <span className="muted" style={{ fontSize: "0.8rem" }}>Shop #{shop.displayId}</span>}
          <span className="muted">{sellerDisplay}</span>
          <button className="btn btn--ghost btn--sm shop-view__close" onClick={onBack}>
            X<span className="shop-view__close-label">close window</span>
          </button>
        </div>
        {isCrossSSU(shop) && (
          <div className="shop-view__cross-ssu" style={{ fontSize: "0.78rem", color: "var(--warning, #c8a84b)", padding: "0.25rem 0" }}>
            ⚑ Cross-SSU shop — items you buy are delivered to your locker at SSU{" "}
            {abbreviateAddress(shop.ssuId)}. Fly there to collect.
          </div>
        )}
      </div>
      {shop.kind === "WTS" && <WTSView shop={shop} refetch={refetch} refreshShop={refreshShop} />}
      {shop.kind === "WTB" && <WTBView shop={shop} refetch={refetch} refreshShop={refreshShop} />}
      {shop.kind === "DE" && <DEView shop={shop} refetch={refetch} refreshShop={refreshShop} />}
      {shop.kind === "FREE" && <FREEView shop={shop} refetch={refetch} refreshShop={refreshShop} />}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
