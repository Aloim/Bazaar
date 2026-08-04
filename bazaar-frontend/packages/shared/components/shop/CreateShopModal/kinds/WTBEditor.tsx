// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/CreateShopModal.tsx (lines 692-947; split for 500-line guard, section: renderListingSlots for WTB + escrow breakdown).
// Re-imported into ../index.tsx.

import { DragEvent } from "react";
import type { Listing } from "@bazaar/shared/types";
import type { ItemTypeInfo } from "@bazaar/shared/types";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { TypeBadge } from "../TypeBadge";
import { ItemTypeSearch } from "../ItemTypeSearch";
import { TaxIndicator, type TaxLayer } from "@bazaar/shared/components/widgets/TaxIndicator";
import { DecimalInput } from "@bazaar/shared/components/widgets/DecimalInput";
import type { WTBTaxConfigOutput } from "@bazaar/shared/hooks/bazaarcore/useWTBTaxConfig";
import { formatTribeAmount, TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";

function buildWTBTaxLayers(t: WTBTaxConfigOutput): TaxLayer[] {
  const out: TaxLayer[] = [];
  if (t.ssuBps   > 0) out.push({ name: "SSU",   bps: t.ssuBps });
  if (t.tribeBps > 0) out.push({ name: "Tribe", bps: t.tribeBps });
  if (t.dappBps  > 0) out.push({ name: "DApp",  bps: t.dappBps });
  return out;
}

interface WTBEditorProps {
  listings: Listing[];
  showManualListing: boolean[];
  dragOverSlot: string | null;
  selectedItem: { typeId: number } | null;
  itemTypes: Map<number, ItemTypeInfo>;
  displayCurrency: string;
  wtbItemsCostScaled: number;
  wtbTax:          WTBTaxConfigOutput;
  wtbExceedsCapacity: boolean;
  wtbTotalVolume: number;
  remainingCapacity: number;
  creatorRole: string;
  eveBalance: number;
  /** Advanced bazaar uses tribe-token ledger burn for WTB pre-funding (NOT EVE
   *  escrow). When `bazaarType === 2` we compare totalDepositScaled against
   *  `tribeTokenBalance` (raw scaled units, decimals=2 V26+) instead of
   *  `eveBalance` (MIST, 9 decimals). */
  bazaarType?: number;
  tribeTokenBalance?: number;
  /** On-chain tribe-token decimals (V26+ default 2). Passed by CreateShopModal
   *  from the ledger reader. */
  tribeTokenDecimals?: number;
  onListingDrop: (e: DragEvent, i: number) => void;
  onDragOver: (slotKey: string) => void;
  onDragLeave: () => void;
  onApplySelected: (i: number) => void;
  onUpdateListing: (i: number, field: keyof Listing, val: number) => void;
  onClearListingItem: (i: number) => void;
  onToggleManual: (i: number) => void;
  onRemoveListing: (i: number) => void;
  onAddListing: () => void;
}

export function WTBEditor(props: WTBEditorProps) {
  // showManualListing / dragOverSlot / selectedItem / creatorRole +
  // drag/drop + toggle-manual callbacks are intentionally unused here — the
  // WTB step-3 UX dropped the inventory panel + click/drag flow in favour
  // of manual search-only. Props retained on the interface for caller-side
  // back-compat.
  const {
    listings, itemTypes,
    displayCurrency, wtbItemsCostScaled, wtbTax, wtbExceedsCapacity,
    wtbTotalVolume, remainingCapacity, eveBalance,
    bazaarType, tribeTokenBalance,
    tribeTokenDecimals = TRIBE_TOKEN_DECIMALS,
    onUpdateListing, onClearListingItem, onRemoveListing, onAddListing,
  } = props;
  // Advanced WTB burns tribe-token ledger balance — NOT EVE. Compare against
  // the right balance / unit. Tribe tokens are 0-decimal (raw integer);
  // EVE is 9-decimal MIST.
  //
  // KEY DELTA between bazaar types:
  //   NoTribe/Easy (EVE): Move's `bazar::create_wtb_shop` takes a Coin<EVE>
  //     prepay of `gross + tax` — the pool holds the full surcharged amount,
  //     so the FE balance check compares against `wtbTax.totalDepositScaled`.
  //   Advanced (tribe-token): Move's `wtb_pool_ops::create_wtb_shop_advanced`
  //     ONLY burns `gross` (= sum(price*qty)) from the owner's ledger row.
  //     Tax is deducted from the filler's payout at fill time
  //     (ledger_wtb_fill mints `net = gross - ssu_tax - tribe_tax` to filler).
  //     So the FE check on Advanced must use `wtbItemsCostScaled`, not
  //     `totalDepositScaled` — otherwise a user with exactly `gross` tokens
  //     is wrongly blocked.
  const isAdvanced = bazaarType === 2;
  // V26+ — Advanced raw values are in tribe-token scaled units (10^decimals);
  // NoTribe/Easy raw values are in MIST (10^9). Display through the right
  // formatter for each branch.
  const balanceRaw = isAdvanced ? (tribeTokenBalance ?? 0) : eveBalance;
  const balanceLabel = isAdvanced
    ? formatTribeAmount(balanceRaw, { decimals: tribeTokenDecimals })
    : (balanceRaw / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 });
  // Advanced: wtbItemsCostScaled is in scaled tribe-token units. NoTribe/Easy:
  // wtbTax.totalDepositScaled is in MIST.
  const requiredScaled = isAdvanced ? wtbItemsCostScaled : wtbTax.totalDepositScaled;
  const requiredLabel = isAdvanced
    ? formatTribeAmount(requiredScaled, { decimals: tribeTokenDecimals })
    : (requiredScaled / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const hasInsufficient = requiredScaled > 0 && balanceRaw < requiredScaled;
  return (
    <div className="listing-slots">
      <h4 className="listing-slots__heading">Items to Buy</h4>
      {listings.map((l, i) => {
        const slotKey = `listing-${i}`;
        const isFilled = l.itemTypeId !== 0;
        // WTB step 3 has no inventory panel (buyer is searching for items they
        // want to buy — their own SSU inventory is irrelevant). All empty slots
        // default to manual search; filled slots show the TypeBadge + qty/price.
        // The drag/drop + click-to-place flow is dropped entirely for WTB.

        return (
          <div key={i} className="listing-slot-wrapper">
            <div className={["listing-slot", isFilled ? "listing-slot--filled" : ""].join(" ")}>
              {isFilled ? (
                <div className="listing-slot__filled-col">
                  <div className="listing-slot__filled-row">
                    <TypeBadge
                      typeId={l.itemTypeId}
                      qty={l.quantity}
                      onClear={() => onClearListingItem(i)}
                      typeInfo={itemTypes.get(l.itemTypeId)}
                    />
                    <input
                      type="number"
                      className="input input--xs"
                      placeholder="Qty"
                      min={1}
                      value={l.quantity || ""}
                      onChange={e => onUpdateListing(i, "quantity", +e.target.value)}
                    />
                    <DecimalInput
                      className="input input--xs"
                      placeholder={displayCurrency}
                      value={l.priceTribe}
                      onValueChange={v => onUpdateListing(i, "priceTribe", v)}
                    />
                  </div>
                </div>
              ) : (
                <div className="listing-slot__empty-row">
                  <div className="listing-slot__manual">
                    <ItemTypeSearch
                      value={l.itemTypeId}
                      onChange={typeId => onUpdateListing(i, "itemTypeId", typeId)}
                      className="input--sm"
                    />
                    <input type="number" className="input input--xs" placeholder="Qty"
                      min={1} value={l.quantity || ""}
                      onChange={e => onUpdateListing(i, "quantity", +e.target.value)} />
                    <DecimalInput className="input input--xs" placeholder={displayCurrency}
                      value={l.priceTribe}
                      onValueChange={v => onUpdateListing(i, "priceTribe", v)} />
                  </div>
                </div>
              )}
            </div>
            {listings.length > 1 && (
              <div className="listing-slot__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onRemoveListing(i)}>
                  remove
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="btn btn--ghost btn--sm" onClick={onAddListing}>
        + Add Item
      </button>
      <div className="escrow-info">
        <div className="escrow-breakdown">
          <div>
            <span className="muted">Items cost:</span>{" "}
            <strong>{isAdvanced
              ? formatTribeAmount(wtbItemsCostScaled, { decimals: tribeTokenDecimals })
              : (wtbItemsCostScaled / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 })} {displayCurrency}</strong>
          </div>
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
                decimals={isAdvanced ? tribeTokenDecimals : 9}
              />
            </div>
          )}
          <div style={{ borderTop: "1px solid var(--border, #444)", paddingTop: "0.25rem", marginTop: "0.25rem" }}>
            <span className="muted">Total deposit required:</span>{" "}
            <strong style={{ color: "var(--accent, #c8a84b)" }}>
              {/* Advanced pre-pays only the items cost (gross); taxes come out of the
                  filler's payout at fill time. NoTribe/Easy pre-pays gross + tax. */}
              {isAdvanced
                ? formatTribeAmount(requiredScaled, { decimals: tribeTokenDecimals })
                : (requiredScaled / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 })} {displayCurrency}
            </strong>
          </div>
          {wtbTax.totalBps > 0 && (
            <p className="muted" style={{ fontSize: "0.72rem", marginTop: "0.3rem" }}>
              {isAdvanced
                ? "On Advanced, tax is deducted from the filler's payout at fill time — you only pre-pay the items cost. Includes SSU + tribe surcharges."
                : "Tax is pre-paid at creation; sellers receive the full listed price. Includes SSU + tribe + dApp surcharges. Unused tax is refunded if you close the shop early."}
            </p>
          )}
        </div>
        <div style={{ marginTop: "0.5rem" }}>
          {requiredScaled > 0 && (
            hasInsufficient ? (
              <span className="currency-selector__warning" style={{ fontSize: "0.72rem" }}>
                Insufficient {displayCurrency}. Need {requiredLabel}, wallet has {balanceLabel}.
              </span>
            ) : (
              <span className="muted" style={{ fontSize: "0.72rem", color: "var(--success, #4caf50)" }}>
                {isAdvanced
                  ? `Your deposit will be ${requiredLabel} ${displayCurrency} (taxes come out of filler payout at fill time).`
                  : `Your deposit (including taxes) will be ${requiredLabel} ${displayCurrency}.`}
              </span>
            )
          )}
        </div>
        {wtbExceedsCapacity && (
          <div className="currency-selector__warning" style={{ marginTop: "0.5rem" }}>
            Warning: The total volume of items you want to buy ({wtbTotalVolume.toLocaleString()} units)
            may exceed your remaining storage capacity ({Math.max(0, remainingCapacity).toLocaleString()} units).
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
