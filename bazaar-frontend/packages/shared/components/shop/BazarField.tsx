// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useMemo } from "react";
import FloatingShopNode from "@bazaar/shared/components/beacons/FloatingShopNode";
import type { Shop, ShopKind } from "@bazaar/shared/types";

interface BazarFieldProps {
  shops:  Shop[];
  filter: Record<ShopKind, boolean>;
  onOpen: (shop: Shop) => void;
}

// Grid partition constants — 5 columns x 4 rows = 20 cells.
// With safe inner margins, nodes won't crowd the edges.
const COLS        = 5;
const ROWS        = 4;
const CELL_W      = 100 / COLS;   // 20% per column
const CELL_H      = 100 / ROWS;   // 25% per row
// Inner safe zone inside each cell: nodes land in the middle 60% of a cell
const INNER_FRAC  = 0.60;
const INNER_OFF   = (1 - INNER_FRAC) / 2;  // 0.20

// Lightweight seeded pseudo-random — deterministic on shop.id
function seededRand(seed: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b1);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 0xffffffff;
}

interface NodeLayout {
  id:        string;
  x:         number;
  y:         number;
  driftSeed: number;
}

function computePositions(shops: Shop[]): Map<string, NodeLayout> {
  const map = new Map<string, NodeLayout>();

  shops.forEach((shop, index) => {
    // Assign each shop to a grid cell via modulo; wraps when shops > 20
    const cellIndex = index % (COLS * ROWS);
    const col       = cellIndex % COLS;
    const row       = Math.floor(cellIndex / COLS);

    // Cell origin in percentage coordinates
    const cellOriginX = col * CELL_W;
    const cellOriginY = row * CELL_H;

    // Deterministic offset within the inner safe zone of the cell
    const offsetX = seededRand(shop.id, 1) * INNER_FRAC + INNER_OFF;
    const offsetY = seededRand(shop.id, 2) * INNER_FRAC + INNER_OFF;

    const x = cellOriginX + offsetX * CELL_W;
    const y = cellOriginY + offsetY * CELL_H;

    // Clamp: nodes must not overflow past 85% (leaves room for 140px node width)
    const xClamped = Math.min(x, 85);
    const yClamped = Math.min(y, 88);

    map.set(shop.id, {
      id:        shop.id,
      x:         xClamped,
      y:         yClamped,
      driftSeed: Math.floor(seededRand(shop.id, 3) * 4),
    });
  });

  return map;
}

export default function BazarField({ shops, filter, onOpen }: BazarFieldProps) {
  // Positions are stable: keyed on shop IDs only, NOT on filter state.
  // Filter changes do NOT move existing nodes.
  const shopIdsKey = shops.map(s => s.id).join(",");
  const positionMap = useMemo(
    () => computePositions(shops),
    // shops identity changes on every render; shopIdsKey is a stable primitive
    // that only changes when the set of shop IDs actually changes.
    [shopIdsKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Apply filter after positions are assigned
  const visible = shops.filter(s => filter[s.kind]);

  if (visible.length === 0) {
    return (
      <div className="bazar__field-area">
        <div className="bazar__field-empty">
          No shops match your filters. Be the first to open one!
        </div>
      </div>
    );
  }

  return (
    <div className="bazar__field-area">
      {visible.map(shop => {
        const layout = positionMap.get(shop.id);
        if (!layout) return null;
        return (
          <FloatingShopNode
            key={shop.id}
            shop={shop}
            x={layout.x}
            y={layout.y}
            driftSeed={layout.driftSeed}
            onOpen={onOpen}
          />
        );
      })}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
