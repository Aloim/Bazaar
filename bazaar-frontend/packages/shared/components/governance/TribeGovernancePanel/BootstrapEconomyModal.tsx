// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BootstrapEconomyModal — Post-V26 Wave 1 Issue 3
 *
 * Standalone floating-panel wrapper around <BootstrapEconomySubTab/>. Mounted
 * from the in-HUD "Bootstrap Advanced Tribe Economy" button so Advanced tribe
 * leaders can run the bootstrap flow without first navigating to the Tribe
 * Governance panel → Owner tab → BootstrapEconomy sub-tab.
 *
 * The SubTab is unchanged — this modal is purely a chrome wrapper that mirrors
 * the inline-panel layout used by SSUGovernancePanel / TribeGovernancePanel.
 */

import { BootstrapEconomySubTab } from "./BootstrapEconomySubTab";
import { Z } from "@bazaar/shared/constants/zIndex";

interface Props {
  onClose: () => void;
}

export default function BootstrapEconomyModal({ onClose }: Props) {
  return (
    <div style={{
      position: "absolute",
      top: "40px",
      left: "20px",
      width: "min(620px, calc(100vw - 40px))",
      maxHeight: "85vh",
      overflowY: "auto",
      overflowX: "hidden",
      background: "rgba(15,12,8,0.94)",
      border: "1px solid rgba(204,112,0,0.3)",
      borderRadius: "8px",
      padding: "16px",
      zIndex: Z.PANEL,
      pointerEvents: "auto",
      boxShadow: "0 0 24px rgba(204,112,0,0.12)",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px",
      }}>
        <h2 style={{
          margin: 0,
          color: "#cc7000",
          fontSize: "1rem",
          fontFamily: "var(--font-display)",
        }}>
          BOOTSTRAP TRIBE ECONOMY
        </h2>
        <button
          className="btn btn--ghost btn--sm"
          onClick={onClose}
          style={{ color: "#cc7000" }}
        >
          X
        </button>
      </div>
      <BootstrapEconomySubTab />
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
