// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * SSUInventoryGroup — one collapsible section in the Global inventory tab
 * (Multi-SSU Visibility Phase 4). Renders the connected player's items at a
 * SINGLE SSU, headed by that SSU's in-game solar-system name + a copy button.
 *
 * Rendered once per unique shop-SSU by GlobalInventoryTab. Each instance owns
 * its own `useOwnedInventory(ssuId)` + `useSolarSystemName(ssuId)` calls — the
 * per-SSU hook calls live here (not in a loop) to satisfy the rules of hooks
 * with a variable SSU count.
 *
 * Doubles as the cross-SSU pickup view (Phase 3): a foreign SSU is flagged
 * "fly here to collect".
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import { useOwnedInventory } from "@bazaar/shared/hooks";
import { useItemTypes } from "@bazaar/shared/hooks";
import { useSolarSystemName } from "@bazaar/shared/hooks/useSolarSystemName";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";

export interface SSUInventoryGroupProps {
  ssuId: string;
  /** Start expanded (the current SSU defaults open). */
  defaultOpen?: boolean;
}

export default function SSUInventoryGroup({ ssuId, defaultOpen = false }: SSUInventoryGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isCurrent = !!SSU_OBJECT_ID && ssuId === SSU_OBJECT_ID;
  const { info: solar, isLoading: solarLoading } = useSolarSystemName(ssuId);
  const { items, isLoading, error } = useOwnedInventory(ssuId);

  const typeInfo = useItemTypes(items.map(i => i.typeId));
  const itemName = (typeId: number) => typeInfo.get(typeId)?.name ?? `#${typeId}`;

  const [copied, setCopied] = useState(false);
  function copySystemName() {
    const text = solar?.name ?? ssuId;
    void navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); },
      () => {},
    );
  }

  const systemLabel = solar?.name ?? (solarLoading ? "Resolving system…" : "Unknown system");
  const itemCount = items.length;

  return (
    <div className="ssu-inv-group" style={{ border: "1px solid var(--border, #2a2f3a)", borderRadius: 4, marginBottom: "0.6rem" }}>
      <button
        className="ssu-inv-group__header"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.6rem",
          padding: "0.5rem 0.75rem", background: "transparent", border: "none",
          color: "inherit", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontFamily: "monospace", opacity: 0.7 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 600 }}>{systemLabel}</span>
        {isCurrent
          ? <span className="badge badge--tribe" style={{ fontSize: "0.7rem" }}>this SSU</span>
          : <span style={{ fontSize: "0.72rem", color: "var(--warning, #c8a84b)" }}>fly here to collect</span>}
        <span className="muted" style={{ fontSize: "0.74rem", marginLeft: "auto" }}>
          {abbreviateAddress(ssuId)} · {itemCount} item{itemCount !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 0.75rem 0.6rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", fontSize: "0.78rem" }}>
            <span className="muted">Solar system:</span>
            <span style={{ fontWeight: 600 }}>{systemLabel}</span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={copySystemName}
              title="Copy solar-system name"
              style={{ fontSize: "0.72rem", padding: "0.1rem 0.4rem" }}
              disabled={solarLoading && !solar}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {isLoading && <p className="muted" style={{ fontSize: "0.8rem", padding: "0.4rem 0" }}>Loading items…</p>}
          {!isLoading && error && <p className="error-text" style={{ fontSize: "0.8rem", padding: "0.4rem 0" }}>{error}</p>}
          {!isLoading && !error && itemCount === 0 && (
            <p className="muted" style={{ fontSize: "0.8rem", padding: "0.4rem 0" }}>No items in your locker here.</p>
          )}
          {!isLoading && !error && itemCount > 0 && (
            <table className="table" style={{ marginBottom: 0 }}>
              <thead><tr><th>Item</th><th>Qty</th></tr></thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.typeId}>
                    <td>{itemName(it.typeId)}</td>
                    <td>{it.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
