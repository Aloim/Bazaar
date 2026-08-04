// TribeGovernanceScreen.tsx — DappHub-styled host for the shared
// TribeGovernancePanel. Lets a tribe's leadership govern their tribe from the
// DappHub, outside of any SSU context. The look mirrors the DappHub landing
// (matrix-rain backdrop + radial scrim + corner frame chrome); the panel itself
// is the same role-gated component the Godot/bazaar clients render, so tabs are
// derived from the connected wallet's caps (Moderation / Admin / SuperAdmin /
// Owner). It is mounted directly — NOT wrapped in the Easy/Advanced SSU gate the
// in-game wrapper uses — because tribe governance here is SSU-independent.
//
// ⚠ SHARED-SURFACE RULE (AI + humans, READ THIS): Tribe Governance renders on
// TWO surfaces — this DappHub host AND the in-game Godot client
// (packages/shared/components/godot/GodotGameWrapper/index.tsx, Panel #14). Both
// mount the SAME shared <TribeGovernancePanel>. Any change to governance behavior
// MUST go into that shared component so it lands on BOTH surfaces automatically —
// never fork one surface. If you change a host wrapper here (gating, the
// ClaimBoxProvider below, panel props), mirror it on the in-game host too. The
// SSU twin of this screen is SSUGovernanceScreen.tsx (same rule).

import { useEffect, useState } from "react";
import { MatrixBackdrop, FrameChrome } from "./MatrixBackdrop";
import { HubKeyframes } from "./HubPrimitives";
import { WalletChip, BuildTag } from "./HubChrome";
import { HUB } from "./hubStyle";
import { ClaimBoxProvider } from "@bazaar/shared/contexts/ClaimBoxContext";
import { TribeGovernancePanel } from "@bazaar/shared/components/governance/TribeGovernancePanel";

const BACKDROP_W = 1920;
const BACKDROP_H = 1080;

interface Props {
  isConnected: boolean;
  walletAddress: string | null;
  onConnect: () => void;
  onBack: () => void;
}

// Cover-scale the 1920×1080 matrix backdrop to fill the window at any aspect.
function CoverBackdrop() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.max(window.innerWidth / BACKDROP_W, window.innerHeight / BACKDROP_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div style={{ position: "absolute", top: "50%", left: "50%", width: BACKDROP_W, height: BACKDROP_H, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center center", pointerEvents: "none" }}>
      <MatrixBackdrop />
    </div>
  );
}

export default function TribeGovernanceScreen({ isConnected, walletAddress, onConnect, onBack }: Props) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", color: HUB.FG, fontFamily: '"Frontier Disket Mono", ui-monospace, monospace' }}>
      <CoverBackdrop />
      {/* Radial scrim — keeps the panel legible over the rain. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "rgba(8,6,4,0.42)" }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 96% at center, rgba(8,6,4,0.92) 0%, rgba(8,6,4,0.6) 54%, rgba(8,6,4,0) 90%)" }} />
      <FrameChrome />
      <HubKeyframes />

      <WalletChip isConnected={isConnected} walletAddress={walletAddress} onConnect={onConnect} />
      <BuildTag />

      {/* Scrollable centring region for the governance panel. */}
      <div style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "clamp(72px, 11vmin, 120px) clamp(16px, 4vmin, 40px) clamp(28px, 5vmin, 48px)" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ width: "min(860px, 100%)", animation: "hubRise 480ms ease-out both" }}>
            {isConnected ? (
              // ClaimBoxProvider: the panel's TX Log sub-tab (and any
              // WithdrawModal) consume useClaimBoxContext. DappHub's App.tsx never
              // wraps a provider (the in-game apps do), so without this the panel
              // threw "useClaimBoxContext must be used inside <ClaimBoxProvider>".
              // useClaimBox only reads the global CLAIM_BOX_ID (SSU-independent),
              // so it is safe to mount here.
              <ClaimBoxProvider>
                <TribeGovernancePanel onClose={onBack} tribeOnly />
              </ClaimBoxProvider>
            ) : (
              <div className="panel" style={{ maxWidth: 800 }}>
                <div className="panel__header">
                  <button className="btn btn--ghost btn--sm" onClick={onBack}>Back</button>
                  <h2>Tribe Governance</h2>
                </div>
                <div className="panel__section">
                  <p className="muted">Connect your wallet to manage your tribe.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
