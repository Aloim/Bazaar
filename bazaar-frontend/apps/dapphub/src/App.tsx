// App.tsx — DappHub root application component.
// Routes between the redesigned "Station Hub" landing surface and the
// owner-only management panel. Landing uses the matrix-rain Station Hub
// (components/hub); management keeps the legacy full-screen panel.

import { useState, useEffect, lazy, Suspense } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { PACKAGE_IDS } from "@bazaar/shared/constants";
import WalletBar from "./components/WalletBar";
import HubLanding from "./components/hub/HubLanding";
import TribeGovernanceScreen from "./components/hub/TribeGovernanceScreen";
import SSUGovernanceScreen from "./components/hub/SSUGovernanceScreen";
import type { DappHubScreen } from "./types";
import "./styles/index.css";

const DAppManagementPanel = lazy(() => import("./components/management/DAppManagementPanel"));

// Phase 8 A3 (AUD-DH-17): DApp ownership is CAP-DERIVED — the wallet holding the
// on-chain DAppOwnerCap is the owner. The former hardcoded owner-address gate
// silently broke if the cap was ever transferred, and the ?upgrade deep-link
// exposed the full (inert but confusing) panel to any wallet.
const DAPP_OWNER_CAP_TYPE = `${PACKAGE_IDS.DAPP_HUB}::dapp_governance::DAppOwnerCap`;

const suiClient = new SuiJsonRpcClient({ url: "https://api.zan.top/public/sui-testnet", network: "testnet" });

/** Resolve the DAppOwnerCap object id owned by the wallet (owner gate + owner TXs). */
function useOwnerCapId(walletAddress: string | null) {
  const [ownerCapId, setOwnerCapId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    if (!walletAddress) { setOwnerCapId(null); setResolved(true); return; }
    setResolved(false);
    let cancelled = false;
    suiClient.getOwnedObjects({
      owner: walletAddress,
      filter: { StructType: DAPP_OWNER_CAP_TYPE },
      options: { showContent: false },
    }).then((result) => {
      if (cancelled) return;
      setOwnerCapId(result.data.length > 0 ? result.data[0].data?.objectId ?? null : null);
      setResolved(true);
    }).catch(() => { if (!cancelled) { setOwnerCapId(null); setResolved(true); } });
    return () => { cancelled = true; };
  }, [walletAddress]);
  return { ownerCapId, resolved };
}

export default function App() {
  const { walletAddress, isConnected, handleConnect } = useConnection();

  // ?upgrade / ?v27-upgrade jumps straight to the management → Upgrade tab.
  const initialScreen: DappHubScreen =
    typeof window !== "undefined"
      && (window.location.search.includes("upgrade") || window.location.search.includes("v27-upgrade"))
      ? "management" : "landing";
  const [screen, setScreen] = useState<DappHubScreen>(initialScreen);
  // Target SSU for the per-SSU SSU Governance screen (set from "My Registered
  // SSUs" before navigating). Cleared back to landing on Back.
  const [ssuGovTarget, setSsuGovTarget] = useState<string | null>(null);

  const { ownerCapId, resolved: ownerCapResolved } = useOwnerCapId(walletAddress ?? null);
  const isOwner = !!ownerCapId;

  function nav(target: DappHubScreen) { setScreen(target); }

  // Open the SSU Governance screen for a specific SSU id.
  function openSsuGov(ssuId: string) { setSsuGovTarget(ssuId); setScreen("ssu-governance"); }

  if (screen === "tribe-governance") {
    return (
      <TribeGovernanceScreen
        isConnected={isConnected}
        walletAddress={walletAddress ?? null}
        onConnect={handleConnect}
        onBack={() => nav("landing")}
      />
    );
  }

  if (screen === "ssu-governance" && ssuGovTarget) {
    return (
      <SSUGovernanceScreen
        ssuId={ssuGovTarget}
        isConnected={isConnected}
        walletAddress={walletAddress ?? null}
        onConnect={handleConnect}
        onBack={() => { setSsuGovTarget(null); nav("landing"); }}
      />
    );
  }

  if (screen === "management") {
    // AUD-DH-17: the panel renders ONLY for the DAppOwnerCap holder. A deep-link
    // (?upgrade) without the cap gets a notice, not clickable admin surfaces.
    return (
      <div className="dapphub">
        <div className="overlay-vignette" />
        <div className="overlay-scanlines" />
        <WalletBar />
        {!isConnected || !ownerCapResolved ? (
          <div className="loader">
            {isConnected ? "Resolving DApp owner capability..." : "Connect the DApp owner wallet to manage."}
          </div>
        ) : isOwner ? (
          <Suspense fallback={<div className="loader">Loading...</div>}>
            <DAppManagementPanel nav={nav} ownerCapId={ownerCapId} />
          </Suspense>
        ) : (
          <div className="loader">
            This wallet does not hold the DAppOwnerCap — management is owner-only.{" "}
            <button className="btn btn--ghost btn--sm" onClick={() => nav("landing")}>Back to hub</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <HubLanding
      isOwner={isOwner}
      isConnected={isConnected}
      walletAddress={walletAddress ?? null}
      onConnect={handleConnect}
      onManage={() => nav("management")}
      onTribeGov={() => nav("tribe-governance")}
      onSsuGov={openSsuGov}
    />
  );
}
