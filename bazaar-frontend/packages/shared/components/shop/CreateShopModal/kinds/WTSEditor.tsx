// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/CreateShopModal.tsx (lines 692-816; split for 500-line guard, section: renderListingSlots for WTS).
// Re-imported into ../index.tsx.

import { DragEvent } from "react";
import type { Listing } from "@bazaar/shared/types";
import type { ItemTypeInfo } from "@bazaar/shared/types";
import type { OwnedInventoryItem } from "@bazaar/shared/types";
import { TypeBadge } from "../TypeBadge";
import { ItemTypeSearch } from "../ItemTypeSearch";
import { TaxIndicator, type TaxLayer } from "@bazaar/shared/components/widgets/TaxIndicator";
import { DecimalInput } from "@bazaar/shared/components/widgets/DecimalInput";
import type { ShopTaxBreakdownOutput } from "@bazaar/shared/hooks/bazaarcore/useShopTaxBreakdown";

function buildBpsLayers(ssuBps: number, tribeBps: number, dappBps: number): TaxLayer[] {
  const out: TaxLayer[] = [];
  if (ssuBps   > 0) out.push({ name: "SSU",   bps: ssuBps });
  if (tribeBps > 0) out.push({ name: "Tribe", bps: tribeBps });
  if (dappBps  > 0) out.push({ name: "DApp",  bps: dappBps });
  return out;
}

interface WTSEditorProps {
  listings: Listing[];
  showManualListing: boolean[];
  dragOverSlot: string | null;
  selectedItem: { typeId: number } | null;
  itemTypes: Map<number, ItemTypeInfo>;
  ownedByTypeId: Map<number, OwnedInventoryItem>;
  displayCurrency: string;
  onListingDrop: (e: DragEvent, i: number) => void;
  onDragOver: (slotKey: string) => void;
  onDragLeave: () => void;
  onApplySelected: (i: number) => void;
  onUpdateListing: (i: number, field: keyof Listing, val: number) => void;
  onClearListingItem: (i: number) => void;
  onToggleManual: (i: number) => void;
  onRemoveListing: (i: number) => void;
  onAddListing: () => void;
  wtsTax?: ShopTaxBreakdownOutput;
}

export function WTSEditor({
  listings, showManualListing, dragOverSlot, selectedItem, itemTypes,
  ownedByTypeId, displayCurrency, onListingDrop, onDragOver, onDragLeave,
  onApplySelected, onUpdateListing, onClearListingItem, onToggleManual,
  onRemoveListing, onAddListing, wtsTax,
}: WTSEditorProps) {
  return (
    <div className="listing-slots">
      <h4 className="listing-slots__heading">Items for Sale</h4>
      {wtsTax && wtsTax.totalBpsOrFee > 0 && (
        <div style={{ marginBottom: "0.5rem" }}>
          <TaxIndicator
            mode="bps"
            totalBps={wtsTax.totalBpsOrFee}
            currency={displayCurrency}
            label="Tax"
            layers={buildBpsLayers(wtsTax.ssuBpsOrFee, wtsTax.tribeBpsOrFee, wtsTax.dappBps)}
          />
        </div>
      )}
      {listings.map((l, i) => {
        const slotKey = `listing-${i}`;
        const isDragOver = dragOverSlot === slotKey;
        const isFilled = l.itemTypeId !== 0;
        const showManual = showManualListing[i] ?? false;

        const ownedForSlot = l.itemTypeId !== 0 ? ownedByTypeId.get(l.itemTypeId) : undefined;
        const availableForSlot = ownedForSlot
          ? ownedForSlot.quantity - ownedForSlot.lockedQuantity
          : undefined;
        const qtyExceedsAvailable = availableForSlot !== undefined && l.quantity > availableForSlot;

        return (
          <div key={i} className="listing-slot-wrapper">
            <div
              className={[
                "listing-slot",
                isFilled ? "listing-slot--filled" : "",
                isDragOver ? "listing-slot--drop-target" : "",
              ].join(" ")}
              onDragOver={(e) => { e.preventDefault(); onDragOver(slotKey); }}
              onDragLeave={onDragLeave}
              onDrop={(e) => onListingDrop(e, i)}
            >
              {isFilled && !showManual ? (
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
                      max={availableForSlot}
                      value={l.quantity || ""}
                      onChange={e => onUpdateListing(i, "quantity", +e.target.value)}
                    />
                    {qtyExceedsAvailable && (
                      <span className="currency-selector__warning" style={{ fontSize: "0.7rem", padding: "0.1rem 0.3rem" }}>
                        Max available: {availableForSlot}
                      </span>
                    )}
                    <DecimalInput
                      className="input input--xs"
                      placeholder={displayCurrency}
                      value={l.priceTribe}
                      onValueChange={v => onUpdateListing(i, "priceTribe", v)}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="listing-slot__empty-row"
                  onClick={() => onApplySelected(i)}
                  style={selectedItem ? { cursor: "pointer" } : undefined}
                >
                  {!showManual && (
                    <span className="listing-slot__hint muted">
                      {selectedItem ? "Click to place selected item" : "Drop item here or click after selecting"}
                    </span>
                  )}
                  {showManual && (
                    <div className="listing-slot__manual">
                      <ItemTypeSearch
                        value={l.itemTypeId}
                        onChange={typeId => {
                          onUpdateListing(i, "itemTypeId", typeId);
                          onToggleManual(i);
                        }}
                        className="input--sm"
                      />
                      <input type="number" className="input input--xs" placeholder="Qty"
                        min={1}
                        value={l.quantity || ""}
                        onChange={e => onUpdateListing(i, "quantity", +e.target.value)} />
                      <DecimalInput className="input input--xs" placeholder={displayCurrency}
                        value={l.priceTribe}
                        onValueChange={v => onUpdateListing(i, "priceTribe", v)} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="listing-slot__actions">
              <button
                type="button"
                className="btn btn--link"
                style={{ fontSize: "0.72rem" }}
                onClick={() => onToggleManual(i)}
              >
                {showManual ? "use click/drag" : "enter manually"}
              </button>
              {listings.length > 1 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onRemoveListing(i)}>
                  remove
                </button>
              )}
            </div>
          </div>
        );
      })}
      <button type="button" className="btn btn--ghost btn--sm" onClick={onAddListing}>
        + Add Item
      </button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
