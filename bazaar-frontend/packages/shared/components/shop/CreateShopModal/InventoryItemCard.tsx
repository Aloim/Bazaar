// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/CreateShopModal.tsx (lines 150-214; split for 500-line guard, section: InventoryItemCard draggable).
// Re-imported into ./index.tsx.

import { DragEvent } from "react";
import type { InventoryItem } from "@bazaar/shared/hooks";
import type { OwnedInventoryItem, ItemTypeInfo } from "@bazaar/shared/types";

interface DragPayload {
  typeId: number;
  quantity: number;
}

export function InventoryItemCard({
  item,
  typeInfo,
  isSelected,
  onClick,
  ownedItem,
}: {
  item: InventoryItem;
  typeInfo?: ItemTypeInfo;
  isSelected?: boolean;
  onClick?: () => void;
  ownedItem?: OwnedInventoryItem;
}) {
  const availableQty = ownedItem
    ? ownedItem.quantity - ownedItem.lockedQuantity
    : item.quantity;
  const isPartiallyLocked = ownedItem && ownedItem.lockedQuantity > 0;

  function onDragStart(e: DragEvent<HTMLDivElement>) {
    const payload: DragPayload = { typeId: item.typeId, quantity: availableQty };
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  }

  const displayName = typeInfo?.name ?? `#${item.typeId}`;
  const lockTooltip = isPartiallyLocked
    ? `${ownedItem!.lockedQuantity} locked by shop: ${ownedItem!.lockingShopTitle ?? ownedItem!.lockingShopId ?? "unknown"}`
    : undefined;

  return (
    <div
      className={["inventory-item", isSelected ? "inventory-item--selected" : ""].join(" ").trim()}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      title={lockTooltip ?? `${displayName} — vol ${item.volume} each`}
    >
      {typeInfo?.iconUrl && (
        <img
          className="inventory-item__icon"
          src={typeInfo.iconUrl}
          alt=""
          aria-hidden="true"
        />
      )}
      <span className="inventory-item__name">{displayName}</span>
      <span className="inventory-item__qty">
        {isPartiallyLocked ? (
          <>{availableQty}<span className="muted">/{item.quantity}</span></>
        ) : (
          <>x{item.quantity}</>
        )}
      </span>
      {isPartiallyLocked && (
        <span className="lock-badge" title={lockTooltip} style={{ fontSize: "0.65rem" }}>
          Locked
        </span>
      )}
      {item.volume > 0 && (
        <span className="inventory-item__vol muted">{item.volume}m³</span>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
