// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Advanced Tribe Bazaar — App root.
// Adapted from Bazar1/dapp/frontend/src/App.tsx.
// Per-app: APP_BAZAAR_TYPE = "Advanced" (bazaar_type === 2).
// SSU Governance nav button (CEF deliverable 2): owner-gated via useOwnedCaps().hasOwnerCap.
// Gov panel opens via local govPanelOpen state (NOT setScreen) — panel has no Screen entry.
// CEF notes: No "Exit Bazaar" button; currency label = "EVE" (from ClaimBoxContext).
// Advanced note: ExchangeBeacon is always-on in BeaconLayer in R2.4 (unconditional).
// R5 wraps ExchangeBeacon in <BazaarFeature only="Advanced">. No R2.4 divergence needed.

import { useState, useEffect } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import {
  LandingScreen,
  AdvancedDirectTrade,
  InventoryPage,
  ArchivePage,
  ManageAnnouncements,
  MyShopsPanel,
  QuicktradePanel,
  WalletBar,
  GodotGameWrapper,
  DeregisteredSSUScreen,
} from "@bazaar/shared/components";
import { useRoles } from "@bazaar/shared/hooks/useRoles";
import { ClaimBoxProvider, useClaimBoxContext } from "@bazaar/shared/contexts/ClaimBoxContext";
import { SSU_OBJECT_ID, PACKAGE_ID, buildBazaarAppUrl } from "@bazaar/shared/constants";
import { useSSUGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { useTribeTokenSymbol } from "@bazaar/shared/hooks/bazaareconomy/useTribeTokenSymbol";
import { BazaarFeatureRoot } from "@bazaar/shared/components";
import { useBazaarType } from "@bazaar/shared/hooks/useBazaarType";
import { APP_BAZAAR_TYPE } from "./feature-flags";
import type { Screen } from "@bazaar/shared/types";
import "./styles/index.css";

// Direct Sui fullnode RPC — same pattern as all hooks in this project.
// NEVER use dAppKit.getClient() — routes through GraphQL which lags 10+ min.
const RPC = (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined)
  ?? "https://api.zan.top/public/sui-testnet";

interface SsuAssembly {
  id: string;
  objectId: string;
  name: string;
  owner: unknown;
  fields: Record<string, unknown>;
}

/** Direct SSU loader — uses sui_getObject RPC (not GraphQL indexer).
 *  Mirrors Bazar1 App.tsx useDirectAssembly exactly. */
function useDirectAssembly() {
  const { isConnected } = useConnection();
  const [assembly, setAssembly] = useState<SsuAssembly | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) { setLoading(false); setAssembly(null); return; }

    const id = SSU_OBJECT_ID;
    if (!id) { setLoading(false); setError("No SSU ID"); return; }

    setLoading(true);
    fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "sui_getObject",
        params: [id, { showContent: true, showOwner: true }],
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
        return r.json();
      })
      .then(json => {
        if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
        const obj = json.result?.data;
        if (!obj) { setError("SSU not found on-chain"); return; }
        const fields = (obj.content?.fields ?? {}) as Record<string, unknown>;
        setAssembly({
          id: obj.objectId,
          objectId: obj.objectId,
          name: (fields.name as string) || `SSU ${(obj.objectId as string).slice(0, 8)}...`,
          owner: obj.owner,
          fields,
        });
        setError(null);
      })
      .catch(e => { setError((e as Error).message); })
      .finally(() => setLoading(false));
  }, [isConnected]);

  return { assembly, loading, error, isConnected };
}

// ── AppBody — rendered inside ClaimBoxProvider so hooks can read context ──────

interface AppBodyProps {
  assembly:    SsuAssembly;
  isConnected: boolean;
}

function AppBody({ assembly, isConnected }: AppBodyProps) {
  const { refetchRoles, ...roles } = useRoles(SSU_OBJECT_ID || null);
  const { isClaimable } = useClaimBoxContext();
  const [screen, setScreen] = useState<Screen>("landing");

  const { walletAddress } = useConnection();
  const [identified, setIdentified] = useState(false);

  useEffect(() => {
    setIdentified(false);
  }, [walletAddress]);

  // CEF deliverable 1: no "Exit Bazaar" button anywhere in this component.
  // Players navigate out via panel back-buttons or EVE Frontier in-game UI.

  const needsRegistration =
    isConnected &&
    !!walletAddress &&
    !roles.isLoading &&
    !identified &&
    localStorage.getItem(`bazar-identified-${PACKAGE_ID}`) !== walletAddress &&
    !roles.isRegistered &&
    !roles.isOwner &&
    !roles.isAdmin &&
    !roles.isModerator;

  return (
    <div className="app">
      <WalletBar />

      {screen === "bazar" ? (
        <GodotGameWrapper nav={setScreen} />
      ) : (
        <>
          {screen === "landing" && (
            <LandingScreen
              nav={setScreen}
              roles={roles}
              assemblyName={assembly.name}
              walletAddress={walletAddress ?? null}
              needsRegistration={needsRegistration}
              onRegistered={() => setIdentified(true)}
              isRegistered={roles.isRegistered}
            />
          )}
          {screen === "trade"      && <AdvancedDirectTrade nav={setScreen} />}
          {screen === "inventory"  && <InventoryPage  nav={setScreen} />}
          {screen === "announcements-archive" && <ArchivePage nav={setScreen} />}
          {screen === "manage-announcements"  && <ManageAnnouncements nav={setScreen} />}
          {screen === "myshops"               && <MyShopsPanel nav={setScreen} onClose={() => setScreen("landing")} />}
          {screen === "quicktrade"            && <QuicktradePanel onClose={() => setScreen("landing")} />}
        </>
      )}
    </div>
  );
}

// ── App — SSU resolver shell ───────────────────────────────────────────────────

export default function App() {
  const { assembly, loading, error, isConnected } = useDirectAssembly();
  const { bazaarType, isLoading: btLoading, error: btError } = useBazaarType(SSU_OBJECT_ID);

  // Phase 12: resolve tribe token symbol for Advanced app ClaimBoxProvider seeding.
  // Chain: SSU_OBJECT_ID → ssuGovId → ssuGovConfig.tribeId → tokenSymbol.
  // Hooks called unconditionally (Rules of Hooks) — gate on null at data level.
  const { data: advSsuGovId }    = useSSUGovId(SSU_OBJECT_ID || null);
  const { data: advSsuGovConfig } = useSSUGovernanceConfig(advSsuGovId ?? null);
  const advTribeId = advSsuGovConfig?.tribeId ?? null;
  const { symbol: tribeTokenSymbol } = useTribeTokenSymbol(advTribeId);

  if (loading || btLoading) return <div className="loader">Loading SSU data...</div>;

  // Deregistered gate: no SSURegistry row ⇒ the bazaar goes dark. The per-SSU
  // shared objects persist after deregister_ssu*, so without this check the
  // marketplace would keep operating at this URL. Fail-open on RPC errors.
  if (SSU_OBJECT_ID && bazaarType === null && !btError) {
    return <DeregisteredSSUScreen ssuId={SSU_OBJECT_ID} appTitle="ADVANCED BAZAAR" />;
  }

  // R5.3: bazaar-type mismatch redirect — navigates to the correct bazaar app.
  // Uses buildBazaarAppUrl so it works on both subdomain prod (advanced.bazaar.app)
  // and single-origin Netlify dev (/<type>/?ssuId=...).
  // Suppressed in dev mode if VITE_DISABLE_BAZAAR_REDIRECT=1 (testnet multi-app dev).
  if (bazaarType !== null && bazaarType !== APP_BAZAAR_TYPE) {
    const targetType: "notribe" | "easy" | "advanced" =
      bazaarType === "NoTribe" ? "notribe"
      : bazaarType === "Easy"  ? "easy"
      :                          "advanced";
    if (
      import.meta.env.DEV &&
      import.meta.env.VITE_DISABLE_BAZAAR_REDIRECT === "1"
    ) {
      console.warn(
        `[bazaar-redirect] SSU ${SSU_OBJECT_ID} is bazaar_type=${bazaarType}, ` +
        `but APP_BAZAAR_TYPE=${APP_BAZAAR_TYPE}. Redirect suppressed (DEV).`,
      );
    } else {
      const target = buildBazaarAppUrl(targetType, SSU_OBJECT_ID);
      window.location.replace(target);
      return <div className="loader">Redirecting to {targetType} bazaar…</div>;
    }
  }

  if (!assembly) {
    return (
      <BazaarFeatureRoot ssuId={SSU_OBJECT_ID}>
      <ClaimBoxProvider tokenSymbol={tribeTokenSymbol}>
        <div className="connect-screen">
          <WalletBar />
          {!SSU_OBJECT_ID ? (
            <div className="connect-screen__body" style={{ position: "relative", zIndex: 1 }}>
              <h1 className="connect-screen__title">ADVANCED TRIBE BAZAAR</h1>
              <p className="connect-screen__hint">No SSU ID provided. Use ?ssuId= URL parameter.</p>
            </div>
          ) : !isConnected ? (
            <div className="connect-screen__body" style={{ position: "relative", zIndex: 1 }}>
              <h1 className="connect-screen__title">ADVANCED TRIBE BAZAAR</h1>
              <p className="connect-screen__hint">Connect your wallet to load this SSU.</p>
            </div>
          ) : (
            <div className="connect-screen__body" style={{ position: "relative", zIndex: 1 }}>
              <p>SSU not found.</p>
              {error && <p className="connect-screen__error">{error}</p>}
            </div>
          )}
        </div>
      </ClaimBoxProvider>
      </BazaarFeatureRoot>
    );
  }

  return (
    <BazaarFeatureRoot ssuId={SSU_OBJECT_ID}>
    <ClaimBoxProvider tokenSymbol={tribeTokenSymbol}>
      <AppBody assembly={assembly} isConnected={isConnected} />
    </ClaimBoxProvider>
    </BazaarFeatureRoot>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
