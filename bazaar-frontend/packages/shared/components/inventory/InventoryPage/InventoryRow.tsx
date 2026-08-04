// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/InventoryPage.tsx (lines 611-678; split for 500-line guard, section: InventoryRow table row).
// Re-imported into ./index.tsx.

import type { OwnedInventoryItem } from "@bazaar/shared/types";

interface InventoryRowProps {
  item:          OwnedInventoryItem;
  name:          string;
  iconUrl?:      string;
  onContextMenu: (e: React.MouseEvent, item: OwnedInventoryItem) => void;
}

export function InventoryRow({ item, name, iconUrl, onContextMenu }: InventoryRowProps) {
  const isLocked = item.lockedQuantity > 0;
  const availableQty = item.quantity - item.lockedQuantity;
  const tooltipText = isLocked
    ? `${item.lockedQuantity} locked by shop: ${item.lockingShopTitle ?? item.lockingShopId ?? "unknown"}`
    : undefined;

  return (
    <tr
      className={isLocked ? "inventory-row--locked" : ""}
      onContextMenu={e => onContextMenu(e, item)}
      style={{ cursor: "context-menu" }}
    >
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {iconUrl && (
            <img src={iconUrl} alt="" className="inventory-item__icon"
              style={{ width: 20, height: 20, objectFit: "contain", borderRadius: 2, flexShrink: 0 }} />
          )}
          <span className="inventory-item__name">{name}</span>
        </div>
      </td>
      <td>
        {isLocked ? (
          <span>
            <span style={{ color: "var(--text)" }}>{availableQty.toLocaleString()}</span>
            <span className="muted"> / {item.quantity.toLocaleString()}</span>
          </span>
        ) : (
          <span>{item.quantity.toLocaleString()}</span>
        )}
      </td>
      <td className="muted">{item.volume.toLocaleString()}</td>
      <td>
        {isLocked ? (
          <span className="lock-badge" title={tooltipText}>Locked</span>
        ) : (
          <span className="muted" style={{ fontSize: "0.75rem" }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
