// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import type { Shop } from "@bazaar/shared/types";

interface FloatingShopNodeProps {
  shop:      Shop;
  x:         number;   // 0-100 percentage of field width
  y:         number;   // 0-100 percentage of field height
  driftSeed: number;   // 0-3 selects drift animation variant
  onOpen:    (shop: Shop) => void;
}

const DRIFT_CLASSES = ["drift-a", "drift-b", "drift-c", "drift-d"] as const;

const KIND_LABEL: Record<Shop["kind"], string> = {
  WTS:  "WTS",
  WTB:  "WTB",
  DE:   "DE",
  FREE: "FREE",
};

export default function FloatingShopNode({ shop, x, y, driftSeed, onOpen }: FloatingShopNodeProps) {
  const driftClass = DRIFT_CLASSES[driftSeed % 4];
  const kindMod    = `floating-shop-node--${shop.kind.toLowerCase()}`;

  return (
    <button
      className={`floating-shop-node ${kindMod} ${driftClass}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={() => onOpen(shop)}
      title={shop.title}
      type="button"
    >
      <span className={`badge badge--${shop.kind.toLowerCase()} floating-shop-node__badge`}>
        {KIND_LABEL[shop.kind]}
      </span>
      <span className="floating-shop-node__title">{shop.title}</span>
    </button>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
