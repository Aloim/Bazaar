// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import type { Shop } from "@bazaar/shared/types";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import { useItemTypes } from "@bazaar/shared/hooks/useItemTypes";
import { useClaimBoxContext } from "@bazaar/shared/contexts/ClaimBoxContext";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { formatTribeAmount, TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";

interface Props { shop: Shop; onOpen: () => void }

export default function ShopCard({ shop, onOpen }: Props) {
  const { currencyName } = useClaimBoxContext();
  const displayCurrency  = currencyName || "EVE";

  // Collect typeIds from the preview slice (up to 2 items shown)
  const listingTypeIds = shop.kind !== "DE"
    ? shop.listings.slice(0, 2).map((l) => l.itemTypeId)
    : shop.pairs.slice(0, 2).flatMap((p) => [p.offeredTypeId, p.requestedTypeId]);

  const itemTypes = useItemTypes(listingTypeIds);

  function itemName(typeId: number): string {
    return itemTypes.get(typeId)?.name ?? `Item #${typeId}`;
  }

  return (
    <div className={`shop-card shop-card--${shop.kind.toLowerCase()}`} onClick={onOpen}>
      <div className="shop-card__header">
        <span className="shop-card__title">{shop.title}</span>
        <span className={`badge badge--${shop.kind.toLowerCase()}`}>{shop.kind}</span>
      </div>

      <div className="shop-card__owner">{abbreviateAddress(shop.owner)}</div>

      <div className="shop-card__preview">
        {shop.kind !== "DE"
          ? shop.listings.slice(0, 2).map((l, i) => (
              <div key={i} className="shop-card__item">
                <span>{itemName(l.itemTypeId)}</span>
                <span className="muted">x{l.quantity}</span>
                <span>
                  {shop.bazaarType === 2
                    ? `${formatTribeAmount(l.priceTribe, { decimals: TRIBE_TOKEN_DECIMALS })} ${displayCurrency}`
                    : `${(l.priceTribe / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${displayCurrency}`}
                </span>
              </div>
            ))
          : shop.pairs.slice(0, 2).map((p, i) => {
              // Bundle preview: show the per-bundle deal (offerPerLot ⇌ requestedQty),
              // not the total stock — offeredQty is the whole deposit across all bundles.
              const perLot = Math.max(1, p.offerPerLot || 1);
              return (
                <div key={i} className="shop-card__item">
                  <span>{itemName(p.offeredTypeId)} x{perLot}</span>
                  <span>&#8651;</span>
                  <span>{itemName(p.requestedTypeId)} x{p.requestedQty}</span>
                </div>
              );
            })
        }
        {(shop.kind !== "DE" ? shop.listings : shop.pairs).length > 2 && (
          <div className="muted" style={{ fontSize: "0.75rem" }}>
            +{(shop.kind !== "DE" ? shop.listings : shop.pairs).length - 2} more...
          </div>
        )}
      </div>

      <button className="btn btn--outline btn--sm shop-card__open">Open</button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
