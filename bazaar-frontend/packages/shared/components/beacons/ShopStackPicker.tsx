// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ShopStackPicker — Multi-SSU Visibility Phase 2.
 *
 * Rendered when a position stack holding more than one shop is clicked (in-world
 * beacon or React hologram). Lists the member shops OWN→TRIBE→OTHER, each row
 * tier-coloured; selecting one opens the existing ShopView for that shop.
 */

import type { Shop } from "@bazaar/shared/types";
import type { ShopStack } from "@bazaar/shared/utils/shopStacks";
import { TIER_COLOR, TIER_LABEL } from "@bazaar/shared/utils/shopTier";

interface Props {
  stack:    ShopStack<Shop>;
  onSelect: (shop: Shop) => void;
  onClose:  () => void;
}

export default function ShopStackPicker({ stack, onSelect, onClose }: Props) {
  return (
    <div className="game-overlay-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h2 style={{ margin: 0, color: "var(--accent, #cc7000)", fontSize: "1.05rem" }}>
          {stack.count} Shops here
        </h2>
        <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ color: "#cc7000" }}>X</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {stack.members.map(({ shop, tier }) => (
          <button
            key={shop.id}
            type="button"
            onClick={() => onSelect(shop)}
            className="btn btn--ghost"
            style={{
              display: "flex", alignItems: "center", gap: "8px", width: "100%",
              textAlign: "left", padding: "8px 10px",
              borderLeft: `3px solid ${TIER_COLOR[tier]}`,
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-block", width: "0.7rem", height: "0.7rem",
                borderRadius: "2px", background: TIER_COLOR[tier], flexShrink: 0,
              }}
            />
            <span className="badge" data-kind={shop.kind} style={{ fontSize: "0.7rem" }}>
              [{shop.kind}]
            </span>
            <span style={{ flex: 1, color: "#ddd", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shop.title}
            </span>
            <span style={{ color: TIER_COLOR[tier], fontSize: "0.7rem", flexShrink: 0 }}>
              {TIER_LABEL[tier]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
