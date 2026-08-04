// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useMemo } from "react";
import { useSSUInventory } from "@bazaar/shared/hooks/useSSUInventory";
import { useItemTypes } from "@bazaar/shared/hooks/useItemTypes";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";

interface OwnerBreakdown {
  inventoryKey: string;
  quantity: number;
}

interface AggregatedItem {
  typeId: number;
  totalQuantity: number;
  owners: OwnerBreakdown[];
}

function abbrev(id: string): string {
  if (!id || id.length < 10) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

// ── SSUStorageTab ─────────────────────────────────────────────────────────────

export default function SSUStorageTab() {
  const { items, isLoading, error, refetch } = useSSUInventory();

  const [expandedTypeId, setExpandedTypeId] = useState<number | null>(null);

  if (!SSU_OBJECT_ID) {
    return (
      <div className="panel__section">
        <p className="muted">SSU not configured. Access the dApp from an SSU in-game or pass ?itemId= in the URL.</p>
      </div>
    );
  }

  const aggregated = useMemo<AggregatedItem[]>(() => {
    const byType = new Map<number, Map<string, number>>();
    for (const item of items) {
      const key = item.inventoryKey ?? "__unknown__";
      let ownerMap = byType.get(item.typeId);
      if (!ownerMap) {
        ownerMap = new Map();
        byType.set(item.typeId, ownerMap);
      }
      ownerMap.set(key, (ownerMap.get(key) ?? 0) + item.quantity);
    }
    return Array.from(byType.entries())
      .sort(([a], [b]) => a - b)
      .map(([typeId, ownerMap]) => {
        const owners: OwnerBreakdown[] = Array.from(ownerMap.entries()).map(
          ([inventoryKey, quantity]) => ({ inventoryKey, quantity }),
        );
        const totalQuantity = owners.reduce((s, o) => s + o.quantity, 0);
        return { typeId, totalQuantity, owners };
      });
  }, [items]);

  const allTypeIds = useMemo(() => aggregated.map(a => a.typeId), [aggregated]);
  const itemTypes  = useItemTypes(allTypeIds);

  function toggleExpand(typeId: number) {
    setExpandedTypeId(prev => (prev === typeId ? null : typeId));
  }

  return (
    <div className="panel__section">
      <div className="action-card" style={{ marginBottom: "1rem" }}>
        <h4>SSU Storage</h4>
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
          Object: <code>{abbrev(SSU_OBJECT_ID)}</code>
          {!isLoading && (
            <span style={{ marginLeft: "1rem" }}>
              {items.length} inventory slot{items.length !== 1 ? "s" : ""}
            </span>
          )}
        </p>
        <button
          className="btn btn--ghost btn--sm"
          style={{ marginTop: "0.5rem" }}
          onClick={refetch}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && <p className="status--error">{error}</p>}
      {isLoading && <p className="muted">Loading SSU inventory...</p>}
      {!isLoading && !error && aggregated.length === 0 && (
        <p className="muted">No items found in the SSU.</p>
      )}

      {!isLoading && aggregated.length > 0 && (
        <div className="donate-panel__item-list">
          {aggregated.map(({ typeId, totalQuantity, owners }) => {
            const typeName  = itemTypes.get(typeId)?.name ?? `Type ${typeId}`;
            const isExpanded = expandedTypeId === typeId;
            return (
              <div key={typeId}>
                <div
                  className={`donate-panel__item${isExpanded ? " donate-panel__item--selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(typeId)}
                  onKeyDown={e => e.key === "Enter" && toggleExpand(typeId)}
                  aria-expanded={isExpanded}
                  style={{ cursor: "pointer" }}
                >
                  <div className="donate-panel__item-info">
                    <span className="donate-panel__item-id">{typeName}</span>
                    <span className="donate-panel__item-qty">
                      Qty: <strong>{totalQuantity}</strong>
                      <span className="muted" style={{ marginLeft: "0.5rem" }}>
                        ({owners.length} slot{owners.length !== 1 ? "s" : ""})
                      </span>
                    </span>
                  </div>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>
                    {isExpanded ? "collapse" : "expand"}
                  </span>
                </div>

                {isExpanded && (
                  <div
                    style={{
                      marginLeft: "1rem",
                      marginBottom: "0.25rem",
                      borderLeft: "2px solid var(--border, #444)",
                      paddingLeft: "0.75rem",
                    }}
                  >
                    {owners.map(({ inventoryKey, quantity }) => (
                      <div
                        key={inventoryKey}
                        className="donate-panel__item"
                        style={{ padding: "0.3rem 0.5rem", cursor: "default" }}
                      >
                        <span style={{ fontSize: "0.82rem" }}>
                          {inventoryKey === "__unknown__"
                            ? "Unassigned slot"
                            : `Slot ${abbrev(inventoryKey)}`}
                        </span>
                        <span className="muted" style={{ fontSize: "0.82rem" }}>
                          x{quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Emergency item recovery note — replaces deprecated withdraw flow */}
      <div className="action-card" style={{ marginTop: "1rem" }}>
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          Emergency item recovery is no longer a separate flow. To recover items locked in your shops,
          use <strong>Force-Close Shop</strong> from the SSU Governance panel.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
