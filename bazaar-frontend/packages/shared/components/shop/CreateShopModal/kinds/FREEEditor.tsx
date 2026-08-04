// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/CreateShopModal.tsx (lines 692-888; split for 500-line guard, section: renderListingSlots for FREE + coin giveaway + role gates).
// Re-imported into ../index.tsx.

import { DragEvent } from "react";
import type { Listing } from "@bazaar/shared/types";
import type { ItemTypeInfo } from "@bazaar/shared/types";
import { ROLE_LABEL } from "@bazaar/shared/constants";
import { TypeBadge } from "../TypeBadge";
import { ItemTypeSearch } from "../ItemTypeSearch";
import { DecimalInput } from "@bazaar/shared/components/widgets/DecimalInput";

interface FREEEditorProps {
  listings: Listing[];
  showManualListing: boolean[];
  dragOverSlot: string | null;
  selectedItem: { typeId: number } | null;
  itemTypes: Map<number, ItemTypeInfo>;
  displayCurrency: string;
  claimLimitPerUser: number;
  coinGiveawayAmount: number;
  coinClaimLimitPerUser: number;
  allowedRoles: number[];
  onListingDrop: (e: DragEvent, i: number) => void;
  onDragOver: (slotKey: string) => void;
  onDragLeave: () => void;
  onApplySelected: (i: number) => void;
  onUpdateListing: (i: number, field: keyof Listing, val: number) => void;
  onClearListingItem: (i: number) => void;
  onToggleManual: (i: number) => void;
  onRemoveListing: (i: number) => void;
  onAddListing: () => void;
  onSetClaimLimit: (val: number) => void;
  onSetCoinGiveaway: (val: number) => void;
  onSetCoinClaimLimit: (val: number) => void;
  onSetAllowedRoles: (updater: (prev: number[]) => number[]) => void;
}

export function FREEEditor({
  listings, showManualListing, dragOverSlot, selectedItem, itemTypes,
  displayCurrency, claimLimitPerUser, coinGiveawayAmount, coinClaimLimitPerUser,
  allowedRoles, onListingDrop, onDragOver, onDragLeave, onApplySelected,
  onUpdateListing, onClearListingItem, onToggleManual, onRemoveListing, onAddListing,
  onSetClaimLimit, onSetCoinGiveaway, onSetCoinClaimLimit, onSetAllowedRoles,
}: FREEEditorProps) {
  return (
    <div className="listing-slots">
      <h4 className="listing-slots__heading">Items for Free Claim</h4>
      {listings.map((l, i) => {
        const slotKey = `listing-${i}`;
        const isDragOver = dragOverSlot === slotKey;
        const isFilled = l.itemTypeId !== 0;
        const showManual = showManualListing[i] ?? false;

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
                      value={l.quantity || ""}
                      onChange={e => onUpdateListing(i, "quantity", +e.target.value)}
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
                        min={1} value={l.quantity || ""}
                        onChange={e => onUpdateListing(i, "quantity", +e.target.value)} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="listing-slot__actions">
              <button type="button" className="btn btn--link" style={{ fontSize: "0.72rem" }}
                onClick={() => onToggleManual(i)}>
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
      <div className="escrow-info" style={{ marginTop: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <label className="muted" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>Claim limit per wallet:</label>
          <input
            type="number"
            className="input input--xs"
            min={0}
            value={claimLimitPerUser}
            onChange={e => onSetClaimLimit(Math.max(0, +e.target.value))}
            title="0 = unlimited"
          />
          <span className="muted" style={{ fontSize: "0.75rem" }}>{claimLimitPerUser === 0 ? "(unlimited)" : `max ${claimLimitPerUser} per wallet`}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <label className="muted" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>Coin giveaway (optional):</label>
          <DecimalInput
            className="input input--xs"
            value={coinGiveawayAmount}
            placeholder="0"
            onValueChange={v => onSetCoinGiveaway(v)}
          />
          <span className="muted" style={{ fontSize: "0.75rem" }}>{displayCurrency} included in shop</span>
        </div>
        {coinGiveawayAmount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
            <label className="muted" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>Coin claim limit per wallet:</label>
            <DecimalInput
              className="input input--xs"
              showZero
              value={coinClaimLimitPerUser}
              onValueChange={v => onSetCoinClaimLimit(v)}
              title="0 = unlimited coin claims per wallet"
            />
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              {coinClaimLimitPerUser === 0 ? "(unlimited)" : `max ${coinClaimLimitPerUser} ${displayCurrency} per wallet`}
            </span>
          </div>
        )}
        <div style={{ marginTop: "0.75rem" }}>
          <label className="muted" style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.4rem" }}>Who can claim:</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {Object.entries(ROLE_LABEL).map(([val, label]) => {
              const roleNum = Number(val);
              const checked = allowedRoles.includes(roleNum);
              return (
                <label key={val} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.78rem", color: checked ? "#fff" : "#666", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      onSetAllowedRoles(prev =>
                        prev.includes(roleNum)
                          ? prev.filter(r => r !== roleNum)
                          : [...prev, roleNum].sort((a, b) => a - b)
                      );
                    }}
                  />
                  {label}
                </label>
              );
            })}
          </div>
          <span className="muted" style={{ fontSize: "0.72rem" }}>
            {allowedRoles.length === 8 ? "All roles can claim" : allowedRoles.length === 0 ? "Nobody can claim!" : `${allowedRoles.length} role(s) selected`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
