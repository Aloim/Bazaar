// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/LandingScreen.tsx (lines 812-1016; split for 500-line guard, section: Portal / PortalView).
// Re-imported into ./LandingScreen/index.tsx.

import { useState } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useDAppCaps } from "@bazaar/shared/hooks";
import { useTribeCaps } from "@bazaar/shared/hooks";
import TribeRegistrationForm from "@bazaar/shared/components/governance/TribeRegistrationForm";
import TribeBrowserPanel from "@bazaar/shared/components/governance/TribeBrowserPanel";
import ManagedSsusView from "./ManagedSsusView";
import DAppGovernancePanel from "@bazaar/shared/components/governance/DAppGovernancePanel";

type PortalView = "home" | "register" | "browse" | "managed-ssus";

const portalWrapStyle: React.CSSProperties = {
  position: "relative",
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10,
  padding: "1rem",
  overflowY: "auto",
};

export function Portal() {
  const { isConnected } = useConnection();
  const { isDAppOwner, isDAppAdmin } = useDAppCaps();
  const { hasLeaderCap, leaderCapId, leaderTribeIdx } = useTribeCaps();
  const isDAppStaff = isDAppOwner || isDAppAdmin;
  const [showDAppGov, setShowDAppGov] = useState(false);
  const [ssuInput, setSsuInput] = useState("");
  const [showDirectAccess, setShowDirectAccess] = useState(false);

  const urlView = new URLSearchParams(window.location.search).get("view") as PortalView | null;
  const [view, setView] = useState<PortalView>(urlView ?? "home");

  function setViewAndParam(v: PortalView) {
    setView(v);
    const url = new URL(window.location.href);
    if (v === "home") { url.searchParams.delete("view"); } else { url.searchParams.set("view", v); }
    window.history.pushState({}, "", url.toString());
  }

  function handleSsuLaunch() {
    const trimmed = ssuInput.trim();
    if (!trimmed || !/^0x[0-9a-fA-F]{1,64}$/.test(trimmed)) return;
    const url = new URL(window.location.href);
    url.searchParams.set("ssuId", trimmed);
    window.location.href = url.toString();
  }

  if (view === "register") {
    return (
      <div style={portalWrapStyle}>
        <TribeRegistrationForm onBack={() => setViewAndParam("home")} onSuccess={() => setViewAndParam("browse")} />
      </div>
    );
  }
  if (view === "managed-ssus") {
    return (
      <div style={portalWrapStyle}>
        <ManagedSsusView leaderCapId={leaderCapId} leaderTribeIdx={leaderTribeIdx} onBack={() => setViewAndParam("home")} />
      </div>
    );
  }
  if (view === "browse") {
    return (
      <div style={portalWrapStyle}>
        <TribeBrowserPanel onBack={() => setViewAndParam("home")} />
      </div>
    );
  }

  return (
    <div style={portalWrapStyle}>
      <div className="panel" style={{ maxWidth: 460, background: "var(--surface)" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "1.25rem 0 0.5rem" }}>
          <img src="/BazaarLogo.jpg" alt="Tribe Bazaar" style={{ maxWidth: "200px", width: "100%", borderRadius: "6px", boxShadow: "0 0 18px rgba(204, 112, 0, 0.45)" }} />
        </div>
        <div className="panel__header">
          <h2 style={{ fontFamily: "var(--font-display)", letterSpacing: "0.15em" }}>TRIBE BAZAAR</h2>
        </div>
        <div className="panel__section" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            A decentralized marketplace for EVE Frontier. Register a tribe, browse existing tribes, or visit an SSU directly.
          </p>
          <button className="btn btn--primary" onClick={() => setViewAndParam("register")} disabled={!isConnected} title={!isConnected ? "Connect your wallet to register a tribe" : undefined}>
            Register a Tribe
          </button>
          <button className="btn btn--ghost" onClick={() => setViewAndParam("browse")}>Browse Tribes</button>
          {isConnected && hasLeaderCap && (
            <button className="btn btn--ghost" onClick={() => setViewAndParam("managed-ssus")}>My Registered SSUs</button>
          )}
          {isDAppStaff && (
            <button className="btn btn--ghost" onClick={() => setShowDAppGov(true)} style={{ borderColor: "rgba(204,112,0,0.3)", color: "var(--accent)" }}>
              dApp Management
            </button>
          )}
          {!isConnected && <p className="muted" style={{ fontSize: "0.75rem", textAlign: "center" }}>Connect your wallet to register a tribe.</p>}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.25rem" }}>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowDirectAccess(!showDirectAccess)} style={{ width: "100%", fontSize: "0.75rem", opacity: 0.7 }}>
              {showDirectAccess ? "Hide" : "Direct SSU Access"}
            </button>
            {showDirectAccess && (
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <input type="text" value={ssuInput} onChange={e => setSsuInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSsuLaunch()} placeholder="0x..."
                  style={{ flex: 1, padding: "0.5rem 0.6rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text)", fontFamily: "var(--font)", fontSize: "0.8rem" }} />
                <button className="btn btn--primary btn--sm" onClick={handleSsuLaunch} disabled={!ssuInput.trim()}>LAUNCH</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {showDAppGov && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }} onClick={() => setShowDAppGov(false)}>
          <div style={{ maxHeight: "90vh", overflow: "auto", width: "100%", maxWidth: "760px", background: "var(--surface)", borderRadius: "8px", padding: "1rem" }} onClick={e => e.stopPropagation()}>
            <DAppGovernancePanel onClose={() => setShowDAppGov(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default Portal;

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
