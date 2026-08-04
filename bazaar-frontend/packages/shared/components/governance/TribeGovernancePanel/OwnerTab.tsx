// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeOwnerTab — owner-only actions for a tribe leader at the tribe level
 * (Withdraw Tribe Tax, Governance Lifecycle).
 *
 * SSU Extension Authorization + Freeze Extension Config previously lived
 * here but were removed — those are per-SSU actions and belong in
 * SSUGovernancePanel/Owner/BazarAuthSubTab. WTB Escrow Pool passthrough
 * removed 2026-05-16 — WTB deposit wallets are per-SSU and live in
 * SSUGovernancePanel/OwnerTab → WTB Pool sub-tab.
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { useTribeAssets } from "@bazaar/shared/hooks/useTribeAssets";
import { buildWithdrawTribeTax, buildDeactivateTribeGovernance, buildActivateTribeGovernance } from "@bazaar/shared/tx/bazaarcore/tribe-governance-tx";
import type { Transaction } from "@mysten/sui/transactions";
import AddressInput from "@bazaar/shared/components/AddressInput";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { BootstrapEconomySubTab } from "./BootstrapEconomySubTab";

type OwnerSubTab = "bootstrap" | "general";

const BAZAAR_TYPE_ADVANCED = 2;

// ── TribeOwnerTab ─────────────────────────────────────────────────────────────

interface TribeOwnerTabProps {
  ownerCapId:    string;
  walletAddress: string;
}

export function TribeOwnerTab({ ownerCapId: _ownerCapId, walletAddress }: TribeOwnerTabProps) {
  const { leaderCapId, leaderTribeIdx } = useTribeCaps();
  const { tribes } = useTribeRegistry();
  const assets = useTribeAssets(leaderTribeIdx);
  const [withdrawAmt,  setWithdrawAmt]  = useState("");
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [loading,      setLoading]      = useState("");

  const tribe = leaderTribeIdx !== null
    ? tribes.find(t => t.idx === leaderTribeIdx)
    : null;
  const tribeGovId = tribe?.tribeGovId ?? null;

  // V17: open the Bootstrap sub-tab by default when this is an Advanced tribe
  // that hasn't been bootstrapped yet — that's the new-user landing surface.
  const shouldDefaultToBootstrap =
    tribe?.bazaarType === BAZAAR_TYPE_ADVANCED && !assets.isFullyBootstrapped;
  const [subTab, setSubTab] = useState<OwnerSubTab>(
    shouldDefaultToBootstrap ? "bootstrap" : "general",
  );

  async function exec(label: string, tx: Transaction) {
    setLoading(label);
    try {
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="panel__section">
      {/* V17 sub-tab strip. "Bootstrap Economy" appears only for Advanced tribes
          held by their TribeLeader; it auto-collapses for Easy tribes and for
          users without TribeLeaderCap (the sub-tab body itself surfaces the
          appropriate notice when entered). */}
      <div className="panel__tabs" style={{ marginBottom: "0.75rem" }}>
        <button
          className={`tab ${subTab === "bootstrap" ? "tab--active" : ""}`}
          onClick={() => setSubTab("bootstrap")}
        >
          Bootstrap Economy
        </button>
        <button
          className={`tab ${subTab === "general" ? "tab--active" : ""}`}
          onClick={() => setSubTab("general")}
        >
          General
        </button>
      </div>

      {subTab === "bootstrap" && <BootstrapEconomySubTab />}

      {subTab === "general" && (
        <>
      {/* OS-42: Withdraw Treasury → Withdraw Tribe Tax.
          Uses buildWithdrawTribeTax (TribeLeaderCap + TribeGovernance shared object).
          DApp treasury withdrawal is in DAppGovernancePanel. */}
      <div className="action-card">
        <h4>Withdraw Tribe Tax</h4>
        <div className="form-row">
          <input
            className="input input--sm"
            type="number"
            min={0}
            value={withdrawAmt}
            onChange={e => setWithdrawAmt(e.target.value)}
            placeholder="Amount (EVE)"
          />
          <AddressInput value={withdrawAddr} onChange={setWithdrawAddr} placeholder="Recipient 0x..." />
          <button
            className="btn btn--primary btn--sm"
            disabled={!leaderCapId || !tribeGovId || !withdrawAmt || !withdrawAddr || !!loading}
            onClick={() => {
              if (!leaderCapId || !tribeGovId) return;
              exec("withdraw",
                buildWithdrawTribeTax({
                  leaderCapId,
                  tribeGovId,
                  amount:        Math.round(Number(withdrawAmt) * COIN_DECIMALS),
                  senderAddress: walletAddress,
                })
              );
            }}
          >
            {loading === "withdraw" ? "Withdrawing..." : "Withdraw"}
          </button>
        </div>
        {!leaderCapId && (
          <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.4rem" }}>
            Requires TribeLeaderCap.
          </p>
        )}
        {leaderCapId && !tribeGovId && (
          <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.4rem" }}>
            Tribe governance object not bootstrapped yet.
          </p>
        )}
      </div>

      {/* SEC-015: Tribe Governance Lifecycle */}
      <div className="action-card" style={{ marginTop: "1rem" }}>
        <h4>Tribe Governance Lifecycle</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Deactivating blocks all tribe-mutation operations (shop settings, role grants, bans, etc.).
          Moderation, tax withdrawal, and cap revocation remain operational during deactivation.
          This is reversible — reactivation restores full functionality.
        </p>
        {!leaderCapId && (
          <p style={{ color: "var(--color-warn, #f5a623)", fontSize: "0.78rem" }}>
            TribeLeaderCap required for lifecycle management.
          </p>
        )}
        <div className="form-row" style={{ marginTop: "0.5rem", gap: "0.5rem" }}>
          <button
            className="btn btn--danger btn--sm"
            disabled={!leaderCapId || !tribeGovId || loading === "deactivate"}
            onClick={() => {
              if (!leaderCapId || !tribeGovId) return;
              exec("deactivate", buildDeactivateTribeGovernance({ leaderCapId, tribeGovId }));
            }}
          >
            {loading === "deactivate" ? "Deactivating..." : "Deactivate Governance"}
          </button>
          <button
            className="btn btn--primary btn--sm"
            disabled={!leaderCapId || !tribeGovId || loading === "activate"}
            onClick={() => {
              if (!leaderCapId || !tribeGovId) return;
              exec("activate", buildActivateTribeGovernance({ leaderCapId, tribeGovId }));
            }}
          >
            {loading === "activate" ? "Activating..." : "Activate Governance"}
          </button>
        </div>
      </div>

      {/* SSU Extension authorization + Freeze Config live in SSU Governance
          (per-SSU panel) — they operate on a specific SSU's OwnerCap and
          don't belong on the tribe-level Owner tab, which has no notion of
          which SSU the leader is acting on. */}

      {/* WTB Escrow Pool passthrough removed 2026-05-16 — WTB deposit wallets
          are per-SSU and surface only in SSUGovernancePanel/OwnerTab → WTB Pool. */}

      {/* Decision 3 (OS-52): DApp-level ownership transfer is in DAppGovernancePanel.
          Tribe leader transfer is not modeled in v1 — tribe_id is bound to TribeLeaderCap.
          To transfer DApp ownership: navigate to DAppGovernancePanel → Owner tab → Transfer Ownership. */}
      <div className="action-card" style={{ marginTop: "1rem" }}>
        <h4>DApp Ownership Transfer</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          DApp-level ownership transfer (DAppOwnerCap) is managed in{" "}
          <strong>DAppGovernancePanel → Owner tab</strong>.
          Tribe leader transfer is not available in v1 — tribe identity is bound to TribeLeaderCap.
        </p>
      </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
