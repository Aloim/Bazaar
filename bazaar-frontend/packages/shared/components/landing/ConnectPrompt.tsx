// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/LandingScreen.tsx (lines 767-810; split for 500-line guard, section: ConnectPrompt).
// Re-imported into ./LandingScreen/index.tsx.

import { useConnection } from "@evefrontier/dapp-kit";
import { useTextDecode } from "@bazaar/shared/hooks";

export default function ConnectPrompt() {
  const { handleConnect } = useConnection();
  const { displayText: displayed, isComplete: done } = useTextDecode(
    "TRIBE BAZAAR — CONNECT WALLET TO DOCK",
    { charSpeed: 30, cyclesPerChar: 3, cycleSpeed: 45, startDelay: 800, enabled: true }
  );

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10, gap: "1.5rem" }}>
      <div style={{ fontFamily: "var(--font)", fontSize: "1.1rem", color: "#ccc", letterSpacing: "0.15em", textAlign: "center", textShadow: "0 0 8px rgba(255,255,255,0.2)", maxWidth: "480px", minHeight: "2em" }}>
        {displayed}
      </div>
      {done && (
        <button className="btn btn--cta" onClick={handleConnect} style={{ fontSize: "1rem", letterSpacing: "0.15em" }}>
          Connect Wallet
        </button>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
