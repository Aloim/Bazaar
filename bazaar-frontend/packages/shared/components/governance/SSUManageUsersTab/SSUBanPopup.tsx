// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/SSUManageUsersTab.tsx (lines 814-864; split for 500-line guard, section: SSUBanPopup).
// Re-imported into ./SSUUserRow.tsx.

import { useRef, useEffect } from "react";
import { BAN_DURATIONS } from "./ssu-roles";

interface SSUBanPopupProps {
  onBan: (ms: number) => void;
  onClose: () => void;
}

export function SSUBanPopup({ onBan, onClose }: SSUBanPopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [onClose]);

  return (
    <div ref={ref} style={{ position: "absolute", top: "100%", right: 0, zIndex: 200, background: "var(--panel-bg, #1a1a2e)", border: "1px solid var(--border-color, #444)", borderRadius: "4px", padding: "0.4rem", minWidth: "7rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {BAN_DURATIONS.map(d => (
        <button key={d.ms} className="btn btn--danger btn--sm" style={{ width: "100%" }} onClick={() => onBan(d.ms)}>
          {d.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
