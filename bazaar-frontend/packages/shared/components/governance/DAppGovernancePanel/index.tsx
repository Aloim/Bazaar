// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/DAppGovernancePanel.tsx (lines 1-249; split for 500-line guard, section: DAppGovernancePanel main shell + ClaimDAppOwnershipButton).
// Tab components in ./tabs/TribesTab.tsx, ./tabs/DAppAdminsTab.tsx, ./tabs/DAppWalletTab.tsx, ./tabs/ExchangeFeeTab.tsx, ./tabs/TribesExchangeTab.tsx.

import { useState } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { useDAppCaps } from "@bazaar/shared/hooks";
import { useTribeRegistry } from "@bazaar/shared/hooks";
// V16 sweep B1 (2026-05-13): `useDAppWallet` retired; consume the real
// `DAppTaxWallet` shared object via `useTaxWallet` instead.
import { useTaxWallet } from "@bazaar/shared/hooks";
import { useDAppClaimStatus } from "@bazaar/shared/hooks";
import { buildClaimOwnership } from "@bazaar/shared/tx/dapp_hub/governance-tx";
import type { Screen } from "@bazaar/shared/types";
import { TribesTab } from "./tabs/TribesTab";
import { DAppWalletTab } from "./tabs/DAppWalletTab";
import { TribesExchangeTab } from "./tabs/TribesExchangeTab";

interface Props {
  onClose: () => void;
  nav?: (s: Screen) => void;
}

type DAppGovTab = "tribes" | "wallet" | "tribes-exchange";

function ClaimDAppOwnershipButton({ onSuccess }: { onSuccess: () => void }) {
  const { walletAddress } = useConnection();
  const [status, setStatus] = useState<"idle" | "signing" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const handleClaim = async () => {
    if (!walletAddress) return;
    setStatus("signing"); setError("");
    try {
      const tx = buildClaimOwnership({ senderAddress: walletAddress });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setStatus("confirming");
      setTimeout(() => { setStatus("done"); onSuccess(); }, 3000);
    } catch (err: unknown) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  if (status === "done") return <p style={{ color: "var(--color-success, #4caf50)", marginTop: "1rem" }}>dApp ownership claimed! Reload the panel to access governance settings.</p>;
  if (status === "confirming") return <p className="muted" style={{ marginTop: "1rem" }}>Confirming on-chain... please wait.</p>;

  return (
    <div style={{ marginTop: "1rem" }}>
      <button className="btn btn--primary" onClick={handleClaim} disabled={status === "signing"}>
        {status === "signing" ? "Signing..." : "Claim Ownership"}
      </button>
      {status === "error" && <p style={{ color: "var(--color-error, #f44336)", marginTop: "0.5rem", fontSize: "0.85rem" }}>{error}</p>}
    </div>
  );
}

export default function DAppGovernancePanel({ onClose }: Props) {
  const { walletAddress } = useConnection();
  const { isDAppOwner, isDAppAdmin, dappOwnerCapId, dappAdminCapId, refetchDAppCaps } = useDAppCaps();
  const { tribes, loading, refetch: refetchRegistry } = useTribeRegistry();
  // V16 sweep B1: real DAppTaxWallet snapshot ({balance, totalCollected, totalWithdrawn, depositCount}).
  const { data: taxWallet, refetch: refetchWallet } = useTaxWallet();
  const { isClaimable, isLoading: claimStatusLoading, refetch: refetchClaimStatus } = useDAppClaimStatus();
  const hasAnyAccess = isDAppOwner || isDAppAdmin;
  const [tab, setTab] = useState<DAppGovTab>("tribes");

  if (!claimStatusLoading && isClaimable) {
    return (
      <div className="panel" style={{ maxWidth: 600, background: "var(--surface)" }}>
        <div className="panel__header">
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
          <h2>Claim dApp Ownership</h2>
        </div>
        <div className="panel__section">
          <p>This dApp has no owner yet. Claim ownership to manage the marketplace, set tax rates, and configure tribes.</p>
          <ClaimDAppOwnershipButton onSuccess={() => { refetchClaimStatus(); refetchDAppCaps(); }} />
        </div>
      </div>
    );
  }

  if (!hasAnyAccess) {
    return (
      <div className="panel" style={{ maxWidth: 800 }}>
        <div className="panel__header">
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
          <h2>dApp Governance</h2>
        </div>
        <div className="panel__section">
          <p className="muted">No dApp governance capability detected. You need a DAppOwnerCap or DAppAdminCap.</p>
        </div>
      </div>
    );
  }

  const tabs: DAppGovTab[] = ["tribes", "wallet", "tribes-exchange"];
  const tabLabel: Record<DAppGovTab, string> = {
    tribes: "Tribes", wallet: "Wallet", "tribes-exchange": "Tribe Fees",
  };
  // Note: "admins" tab removed — v2 has no DApp Admin tier (only DAppOwnerCap).
  // Note: "exchange" tab removed — no global default exchange fee in v2. Override per-tribe in Tribe Fees tab.

  function handleRefresh() { refetchRegistry(); refetchDAppCaps(); refetchWallet(); }

  return (
    <div className="panel" style={{ maxWidth: 800 }}>
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
        <h2>dApp Governance</h2>
        {loading && <span className="muted" style={{ fontSize: "0.75rem" }}>Loading...</span>}
        <button className="btn btn--ghost btn--sm" onClick={handleRefresh} style={{ marginLeft: "auto" }}>Refresh</button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={onClose}
          aria-label="Close dApp Governance panel"
        >&#x2715;</button>
      </div>
      <div className="panel__tabs">
        {tabs.map(t => (
          <button key={t} className={`tab ${tab === t ? "tab--active" : ""}`} onClick={() => setTab(t)}>{tabLabel[t]}</button>
        ))}
      </div>
      {tab === "tribes" && <TribesTab tribes={tribes} isDAppOwner={isDAppOwner} isDAppAdmin={isDAppAdmin} ownerCapId={dappOwnerCapId} adminCapId={dappAdminCapId} walletAddress={walletAddress ?? ""} onRefresh={handleRefresh} />}
      {tab === "wallet" && <DAppWalletTab taxWallet={taxWallet ?? null} isDAppOwner={isDAppOwner} ownerCapId={dappOwnerCapId} walletAddress={walletAddress ?? ""} onRefresh={handleRefresh} />}
      {tab === "tribes-exchange" && <TribesExchangeTab tribes={tribes} isDAppOwner={isDAppOwner} ownerCapId={dappOwnerCapId} onRefresh={handleRefresh} />}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
