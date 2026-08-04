// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/CreateShopModal.tsx (lines 949-1097; split for 500-line guard, section: renderPairSlots for DE).
// Re-imported into ../index.tsx.
//
// Bundle-ratio DE model: each pair is a bundle — `offerPerLot` offered items traded
// for `requestedQty` requested items — and the seller stocks a whole number of
// bundles. This lets a shop sell many cheap items for few premium ones (e.g. a bundle
// of 50 fuel for 5 alloys), which the old "requested per 1 offered" integer ratio
// could not express (it needed a sub-1 value like 0.1). offerPerLot = 1 reproduces
// the legacy per-single-offered behaviour.

import { DragEvent } from "react";
import type { ExchangePair } from "@bazaar/shared/types";
import type { ItemTypeInfo } from "@bazaar/shared/types";
import { TypeBadge } from "../TypeBadge";
import { ItemTypeSearch } from "../ItemTypeSearch";
import { TaxIndicator, type TaxLayer } from "@bazaar/shared/components/widgets/TaxIndicator";
import type { ShopTaxBreakdownOutput } from "@bazaar/shared/hooks/bazaarcore/useShopTaxBreakdown";

// AUD-NT-16/ET-03: layers show recipient NETS + the DApp carve (Move carves the
// DApp share out of the flats; the payer total above the layers is unchanged).
function buildFlatLayers(tax: ShopTaxBreakdownOutput): TaxLayer[] {
  const out: TaxLayer[] = [];
  if (tax.ssuAmount   > 0) out.push({ name: "SSU",   amount: tax.ssuAmount });
  if (tax.tribeAmount > 0) out.push({ name: "Tribe", amount: tax.tribeAmount });
  if (tax.dappAmount  > 0) out.push({ name: "DApp",  amount: tax.dappAmount });
  return out;
}

/** Whole bundles currently stocked = total offered stock ÷ bundle size. */
function bundleCount(p: ExchangePair): number {
  const perLot = Math.max(1, p.offerPerLot || 1);
  return Math.max(1, Math.round((p.offeredQty || perLot) / perLot));
}

interface DEEditorProps {
  pairs: ExchangePair[];
  showManualPairOffer: boolean[];
  showManualPairWant: boolean[];
  dragOverSlot: string | null;
  selectedItem: { typeId: number } | null;
  itemTypes: Map<number, ItemTypeInfo>;
  onPairDrop: (e: DragEvent, i: number, side: "offer" | "want") => void;
  onDragOver: (slotKey: string) => void;
  onDragLeave: () => void;
  onApplySelectedToPair: (i: number, side: "offer" | "want") => void;
  onUpdatePair: (i: number, field: keyof ExchangePair, val: number) => void;
  /** Set bundle size and/or bundle count together, keeping the total a whole multiple. */
  onUpdatePairLot: (i: number, next: { offerPerLot?: number; bundles?: number }) => void;
  onClearPairSide: (i: number, side: "offer" | "want") => void;
  onToggleOfferManual: (i: number) => void;
  onToggleWantManual: (i: number) => void;
  onRemovePair: (i: number) => void;
  onAddPair: () => void;
  displayCurrency?: string;
  deTax?:           ShopTaxBreakdownOutput;
}

export function DEEditor({
  pairs, showManualPairOffer, showManualPairWant, dragOverSlot, selectedItem, itemTypes,
  onPairDrop, onDragOver, onDragLeave, onApplySelectedToPair, onUpdatePair, onUpdatePairLot,
  onClearPairSide, onToggleOfferManual, onToggleWantManual, onRemovePair, onAddPair,
  displayCurrency, deTax,
}: DEEditorProps) {
  const itemName = (typeId: number) => itemTypes.get(typeId)?.name ?? `#${typeId}`;

  return (
    <div className="listing-slots">
      <h4 className="listing-slots__heading">Exchange Bundles</h4>
      <p className="muted" style={{ fontSize: "0.74rem", margin: "0 0 0.5rem" }}>
        Build each <strong>bundle</strong>: the item you <strong>give</strong> and how many per bundle, the
        item you <strong>want</strong> back and how many per bundle, then how many bundles to stock.
        Customers buy whole bundles. This sells big lots for small ones too — e.g. give&nbsp;50 Fuel, want&nbsp;5
        Alloys, stock&nbsp;3&nbsp;bundles → a customer takes 1&nbsp;bundle (50&nbsp;Fuel for 5&nbsp;Alloys), up to 3.
      </p>
      {deTax && deTax.totalAmount > 0 && (
        <div style={{ marginBottom: "0.5rem" }}>
          <TaxIndicator
            mode="flat"
            totalAmount={deTax.totalAmount}
            currency={displayCurrency ?? "EVE"}
            label="Per-exchange fee"
            layers={buildFlatLayers(deTax)}
          />
        </div>
      )}
      {pairs.map((p, i) => {
        const offerKey = `pair-offer-${i}`;
        const wantKey  = `pair-want-${i}`;
        const offerFilled = p.offeredTypeId !== 0;
        const wantFilled  = p.requestedTypeId !== 0;
        const showOfferManual = showManualPairOffer[i] ?? false;
        const showWantManual  = showManualPairWant[i] ?? false;
        const perLot  = Math.max(1, p.offerPerLot || 1);
        const bundles = bundleCount(p);

        return (
          <div key={i} className="pair-row-wrapper">
            <div className="pair-row">
              {/* Give side */}
              <div
                className={[
                  "listing-slot listing-slot--half",
                  offerFilled ? "listing-slot--filled" : "",
                  dragOverSlot === offerKey ? "listing-slot--drop-target" : "",
                ].join(" ")}
                onDragOver={(e) => { e.preventDefault(); onDragOver(offerKey); }}
                onDragLeave={onDragLeave}
                onDrop={(e) => onPairDrop(e, i, "offer")}
              >
                <span className="listing-slot__label muted">You give — per bundle</span>
                {offerFilled && !showOfferManual ? (
                  <div className="listing-slot__filled-row">
                    <TypeBadge
                      typeId={p.offeredTypeId}
                      qty={perLot}
                      onClear={() => onClearPairSide(i, "offer")}
                      typeInfo={itemTypes.get(p.offeredTypeId)}
                    />
                    <input type="number" className="input input--xs" placeholder="Per bundle"
                      min={1} value={perLot || ""}
                      onChange={e => onUpdatePairLot(i, { offerPerLot: +e.target.value })} />
                  </div>
                ) : (
                  <div
                    className="listing-slot__empty-row"
                    onClick={() => onApplySelectedToPair(i, "offer")}
                    style={selectedItem ? { cursor: "pointer" } : undefined}
                  >
                    {!showOfferManual && (
                      <span className="listing-slot__hint muted">
                        {selectedItem ? "Click to place" : "Drop here"}
                      </span>
                    )}
                    {showOfferManual && (
                      <div className="listing-slot__manual">
                        <ItemTypeSearch
                          value={p.offeredTypeId}
                          onChange={typeId => {
                            onUpdatePair(i, "offeredTypeId", typeId);
                            onToggleOfferManual(i);
                          }}
                          className="input--sm"
                        />
                        <input type="number" className="input input--xs" placeholder="Per bundle"
                          min={1} value={perLot || ""}
                          onChange={e => onUpdatePairLot(i, { offerPerLot: +e.target.value })} />
                      </div>
                    )}
                  </div>
                )}
                <button type="button" className="btn btn--link" style={{ fontSize: "0.72rem" }}
                  onClick={() => onToggleOfferManual(i)}>
                  {showOfferManual ? "drag-drop" : "manual"}
                </button>
              </div>

              <span className="pair-arrow muted">&#8651;</span>

              {/* Want side */}
              <div
                className={[
                  "listing-slot listing-slot--half",
                  wantFilled ? "listing-slot--filled" : "",
                  dragOverSlot === wantKey ? "listing-slot--drop-target" : "",
                ].join(" ")}
                onDragOver={(e) => { e.preventDefault(); onDragOver(wantKey); }}
                onDragLeave={onDragLeave}
                onDrop={(e) => onPairDrop(e, i, "want")}
              >
                <span className="listing-slot__label muted">You want — per bundle</span>
                {wantFilled && !showWantManual ? (
                  <div className="listing-slot__filled-row">
                    <TypeBadge
                      typeId={p.requestedTypeId}
                      qty={p.requestedQty}
                      onClear={() => onClearPairSide(i, "want")}
                      typeInfo={itemTypes.get(p.requestedTypeId)}
                    />
                    <input type="number" className="input input--xs" placeholder="Per bundle"
                      min={1} value={p.requestedQty || ""}
                      onChange={e => onUpdatePair(i, "requestedQty", +e.target.value)} />
                  </div>
                ) : (
                  <div
                    className="listing-slot__empty-row"
                    onClick={() => onApplySelectedToPair(i, "want")}
                    style={selectedItem ? { cursor: "pointer" } : undefined}
                  >
                    {!showWantManual && (
                      <span className="listing-slot__hint muted">
                        {selectedItem ? "Click to place" : "Drop here"}
                      </span>
                    )}
                    {showWantManual && (
                      <div className="listing-slot__manual">
                        <ItemTypeSearch
                          value={p.requestedTypeId}
                          onChange={typeId => {
                            onUpdatePair(i, "requestedTypeId", typeId);
                            onToggleWantManual(i);
                          }}
                          className="input--sm"
                        />
                        <input type="number" className="input input--xs" placeholder="Per bundle"
                          min={1} value={p.requestedQty || ""}
                          onChange={e => onUpdatePair(i, "requestedQty", +e.target.value)} />
                      </div>
                    )}
                  </div>
                )}
                <button type="button" className="btn btn--link" style={{ fontSize: "0.72rem" }}
                  onClick={() => onToggleWantManual(i)}>
                  {showWantManual ? "drag-drop" : "manual"}
                </button>
              </div>
            </div>

            {offerFilled && (
              <div className="pair-bundle-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0.25rem 0" }}>
                <label className="muted" style={{ fontSize: "0.74rem" }} htmlFor={`bundles-${i}`}>
                  Bundles to stock
                </label>
                <input id={`bundles-${i}`} type="number" className="input input--xs" placeholder="1"
                  min={1} value={bundles || ""}
                  onChange={e => onUpdatePairLot(i, { bundles: +e.target.value })} />
                <span className="muted" style={{ fontSize: "0.72rem" }}>
                  = depositing <strong>{perLot * bundles}</strong> {itemName(p.offeredTypeId)}
                </span>
              </div>
            )}

            {offerFilled && wantFilled && (
              <div className="muted" style={{ fontSize: "0.72rem", padding: "0.2rem 0.25rem 0" }}>
                1 bundle = <strong>{perLot} {itemName(p.offeredTypeId)}</strong> &#8651; <strong>{p.requestedQty} {itemName(p.requestedTypeId)}</strong>
                {" · "}stocking {bundles} bundle{bundles === 1 ? "" : "s"}
              </div>
            )}

            <div className="listing-slot__actions">
              {pairs.length > 1 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onRemovePair(i)}>
                  remove
                </button>
              )}
            </div>
          </div>
        );
      })}
      <button type="button" className="btn btn--ghost btn--sm" onClick={onAddPair}>
        + Add Bundle
      </button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
