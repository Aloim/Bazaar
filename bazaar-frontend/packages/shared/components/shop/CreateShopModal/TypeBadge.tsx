// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/CreateShopModal.tsx (lines 216-251; split for 500-line guard, section: TypeBadge filled slot).
// Re-imported into ./index.tsx and kinds editors.

import type { ItemTypeInfo } from "@bazaar/shared/types";

export function TypeBadge({
  typeId,
  qty,
  onClear,
  typeInfo,
}: {
  typeId: number;
  qty: number;
  onClear: () => void;
  typeInfo?: ItemTypeInfo;
}) {
  const displayName = typeInfo?.name ?? `#${typeId}`;
  return (
    <span className="type-badge">
      {typeInfo?.iconUrl && (
        <img
          className="type-badge__icon"
          src={typeInfo.iconUrl}
          alt=""
          aria-hidden="true"
        />
      )}
      {displayName}
      {qty > 0 && <em> x{qty}</em>}
      <button
        type="button"
        className="type-badge__clear"
        onClick={onClear}
        title="Clear item"
      >
        ×
      </button>
    </span>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
