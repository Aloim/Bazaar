// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/WidgetMenuTab.tsx (lines 1-296; split for 500-line guard, section: widget-config-form sub-components).
// Re-imported into ./index.tsx.

// OS-19 closure: ForeignDappPanel removed — no Move backing in 4-package architecture.
// "Foreign dApp Links" relied on a dapp_links Move module that does not exist in our 4-package
// architecture and is not planned. Godot URL configuration uses buildSetSSUGodotUrl / buildSetTribeGodotUrl
// (tx/bazaarcore/) which are separately wired.
// V33: MissionBoardPanel removed alongside the mission board (replaced by the MIS shop type).
// This file retains InitiationProtocolToggle only.
import { useState } from "react";

// ── Initiation Protocol Toggle ────────────────────────────────────────────────

export function InitiationProtocolToggle() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    return localStorage.getItem("bazar-initiation-enabled") !== "false";
  });

  function handleToggle() {
    const next = !enabled;
    localStorage.setItem("bazar-initiation-enabled", next ? "true" : "false");
    setEnabled(next);
  }

  return (
    <div style={{ marginTop: "1.5rem", padding: "0.75rem", background: "rgba(255,255,255,0.04)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="widget-toggle" style={{ marginBottom: "0.5rem" }}>
        <span className="widget-toggle__label">Initiation Protocol</span>
        <button className={`widget-toggle__btn ${enabled ? "widget-toggle__btn--on" : "widget-toggle__btn--off"}`} onClick={handleToggle}>
          {enabled ? "ON" : "OFF"}
        </button>
      </div>
      <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.4rem" }}>
        Boot sequence & translation protocol for all visitors. When OFF, only new users see the identification sequence.
      </p>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
