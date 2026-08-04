// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * StorageMeter.tsx — Storage usage progress bar + label.
 *
 * Extracted from InventoryScreen.tsx L.143-157.
 * Does NOT call useUserStorage — receives values as props so the parent
 * screen can comply with Rules-of-Hooks ordering constraints.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

// ── Props ─────────────────────────────────────────────────────────────────────

export interface StorageMeterProps {
  usedVolume:    number;
  volumeLimit:   number;
  isLoading:     boolean;
}

// ── StorageMeter ──────────────────────────────────────────────────────────────

export default function StorageMeter({ usedVolume, volumeLimit, isLoading }: StorageMeterProps) {
  if (isLoading || volumeLimit <= 0) return null;

  const storagePercent = Math.min(100, Math.round((usedVolume / volumeLimit) * 100));

  return (
    <div className="inventory__toolbar">
      <span className="muted" style={{ fontSize: "0.8rem" }}>
        Storage: {usedVolume.toLocaleString()} / {volumeLimit.toLocaleString()} m³
        ({storagePercent}%)
      </span>
      <div className="inventory__storage-meter">
        <div
          className="inventory__storage-meter__fill"
          style={{ width: `${storagePercent}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
