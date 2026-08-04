// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/CreateShopModal.tsx (lines 622-693, section: ReviewStep — Step 4 review block; split for 500-line guard on index.tsx).
// Re-imported into ./index.tsx.

import type { ShopKind, Listing, ExchangePair } from "@bazaar/shared/types";
import { COIN_DECIMALS, ROLE_LABEL } from "@bazaar/shared/constants";
import { TaxIndicator, type TaxLayer } from "@bazaar/shared/components/widgets/TaxIndicator";
import type { WTBTaxConfigOutput } from "@bazaar/shared/hooks/bazaarcore/useWTBTaxConfig";

function buildWTBTaxLayers(t: WTBTaxConfigOutput): TaxLayer[] {
  const out: TaxLayer[] = [];
  if (t.ssuBps   > 0) out.push({ name: "SSU",   bps: t.ssuBps });
  if (t.tribeBps > 0) out.push({ name: "Tribe", bps: t.tribeBps });
  if (t.dappBps  > 0) out.push({ name: "DApp",  bps: t.dappBps });
  return out;
}

interface ReviewStepProps {
  kind:                  ShopKind;
  title:                 string;
  listings:              Listing[];
  pairs:                 ExchangePair[];
  displayCurrency:       string;
  /** 0=NoTribe, 1=Easy, 2=Advanced. Used to fork unit conversion: Advanced
   *  prices are raw 0-decimal tribe tokens, NoTribe/Easy are 9-decimal MIST. */
  bazaarType?:           number;
  wtbItemsCostScaled:    number;
  wtbTax:                WTBTaxConfigOutput;
  claimLimitPerUser:     number;
  coinGiveawayAmount:    number;
  coinClaimLimitPerUser: number;
  allowedRoles:          number[];
  error:                 string;
}

export function ReviewStep({
  kind, title, listings, pairs, displayCurrency, bazaarType,
  wtbItemsCostScaled, wtbTax,
  claimLimitPerUser, coinGiveawayAmount, coinClaimLimitPerUser, allowedRoles, error,
}: ReviewStepProps) {
  const isAdvanced = bazaarType === 2;
  // For Advanced WTB the on-chain deposit is `gross` only (taxes deducted from
  // filler payout at fill). For NoTribe/Easy it's `gross + tax` (pre-paid in
  // Coin<EVE>). Render the right "Total deposit" number.
  const wtbDepositScaled = isAdvanced ? wtbItemsCostScaled : wtbTax.totalDepositScaled;
  const fmtScaled = (scaled: number) => isAdvanced
    ? Math.ceil(scaled / COIN_DECIMALS).toLocaleString()
    : (scaled / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 });
  return (
    <div className="step">
      <h4>Review &amp; Publish</h4>
      <div className="review-block">
        <div><span className="muted">Type:</span> <strong>{kind}</strong></div>
        <div><span className="muted">Title:</span> {title}</div>
        {kind !== "DE"
          ? listings.map((l, i) => (
              <div key={i}><span>Item #{l.itemTypeId} x {l.quantity}</span>{kind !== "FREE" && <span> @ {l.priceTribe} {displayCurrency}</span>}</div>
            ))
          : pairs.map((p, i) => {
              const perLot  = Math.max(1, p.offerPerLot || 1);
              const bundles = Math.max(1, Math.round((p.offeredQty || perLot) / perLot));
              return (
                <div key={i}>
                  {bundles}&times; bundle — {perLot} #{p.offeredTypeId} &#8651; {p.requestedQty} #{p.requestedTypeId}
                  <span className="muted"> (deposit {p.offeredQty} #{p.offeredTypeId})</span>
                </div>
              );
            })
        }
        {kind === "WTB" && (
          <div>
            <div><span className="muted">Items cost:</span> {fmtScaled(wtbItemsCostScaled)} {displayCurrency}</div>
            {wtbTax.totalBps > 0 && (
              <div>
                <TaxIndicator
                  mode="bps"
                  totalBps={wtbTax.totalBps}
                  totalAmountScaled={wtbTax.taxAmountScaled}
                  grossScaled={wtbItemsCostScaled}
                  currency={displayCurrency}
                  label="WTB tax"
                  layers={buildWTBTaxLayers(wtbTax)}
                />
              </div>
            )}
            <div><span className="muted">Total deposit:</span> <strong>{fmtScaled(wtbDepositScaled)} {displayCurrency}</strong></div>
            {isAdvanced && wtbTax.totalBps > 0 && (
              <div className="muted" style={{ fontSize: "0.7rem" }}>
                On Advanced, tax is deducted from the filler's payout at fill time — not added to your deposit.
              </div>
            )}
          </div>
        )}
        {kind === "FREE" && (
          <div>
            <div><span className="muted">Item claim limit:</span> {claimLimitPerUser === 0 ? "Unlimited" : `${claimLimitPerUser} per wallet`}</div>
            {coinGiveawayAmount > 0 && (<>
              <div><span className="muted">Coin giveaway:</span> {coinGiveawayAmount} {displayCurrency}</div>
              <div><span className="muted">Coin claim limit:</span> {coinClaimLimitPerUser === 0 ? "Unlimited" : `${coinClaimLimitPerUser} ${displayCurrency} per wallet`}</div>
            </>)}
            {allowedRoles.length < 8 && <div><span className="muted">Allowed roles:</span> {allowedRoles.map(r => ROLE_LABEL[r]).join(", ")}</div>}
          </div>
        )}
        {kind === "DE" && <div className="muted" style={{ fontSize: "0.8rem" }}>A flat {displayCurrency} fee is charged per exchange.</div>}
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
