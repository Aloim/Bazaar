// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeTaxWalletSubTab — V16-DESIGN-1 (Post-V16 Session 4).
 *
 * Displays tribe tax wallet balance + lifetime tax collected, and allows the
 * connected wallet to withdraw EVE from it when holding a TribeLeaderCap
 * (preferred) or a TribeSuperAdminCap. Admin and Mod tiers are NOT authorized
 * (matches Move-side: only the two superior cap-tier entry fns mutate
 * `TribeGovernance.tax_wallet`).
 *
 * Move source authority:
 *   - bazaar_core::tribe_governance::withdraw_tribe_tax            (TribeLeaderCap)
 *   - bazaar_core::tribe_governance::withdraw_tribe_tax_as_super_admin (TribeSuperAdminCap)
 *
 * Storage authority: TribeGovernance.tax_wallet: Balance<EVE> — accumulated by
 * Easy-bazaar shop trades through shop_ops_{wts,wtb,de}::deposit_tribe_tax.
 * Advanced-bazaar shop trades route to bazaar_economy::tribe_token_ledger
 * instead, so this wallet stays empty on Advanced tribes unless legacy Easy
 * shops were converted.
 */

import { useState } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { useTribeGovernanceConfig } from "@bazaar/shared/hooks/bazaarcore/tribe-governance-hooks";
import {
  buildWithdrawTribeTax,
  buildWithdrawTribeTaxAsSuperAdmin,
} from "@bazaar/shared/tx/bazaarcore/tribe-governance-tx";
import { COIN_DECIMALS } from "@bazaar/shared/constants";

function formatEveMist(mist: number): string {
  return (mist / COIN_DECIMALS).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 9,
  });
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        border: "1px solid var(--border-color, #444)",
        borderRadius: "0.5rem",
        minWidth: "10rem",
      }}
    >
      <div className="muted" style={{ fontSize: "0.75rem" }}>{label}</div>
      <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export function TribeTaxWalletSubTab() {
  const { walletAddress } = useConnection();
  const {
    leaderCapId, superAdminCapId,
    leaderTribeIdx, superAdminTribeIdx,
  } = useTribeCaps();
  const { tribes } = useTribeRegistry();

  // Prefer the leader-cap tribe; fall back to super-admin-cap tribe. This
  // mirrors the resolution used by the "vault" sub-tab next door.
  const tribeIdx = leaderTribeIdx ?? superAdminTribeIdx ?? null;
  const tribe = tribeIdx !== null ? tribes.find(t => t.idx === tribeIdx) : undefined;
  const tribeGovId = tribe?.tribeGovId ?? null;
  const { data: govConfig, refetch: refetchGov } = useTribeGovernanceConfig(tribeGovId);

  const [amountEve, setAmountEve] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const balanceMist  = govConfig?.taxBalance ?? 0;
  const lifetimeMist = govConfig?.totalTaxCollected ?? 0;
  const bazaarType   = govConfig?.bazaarType ?? 0;

  // Auth selection: prefer LeaderCap (higher tier) when both are held.
  // Admin / Mod tiers are NOT authorized — Move-side has no entry fn for them.
  const effectiveLeaderCap     = leaderCapId ?? null;
  const effectiveSuperAdminCap = !effectiveLeaderCap ? (superAdminCapId ?? null) : null;
  const canWithdraw = !!(effectiveLeaderCap || effectiveSuperAdminCap);
  const authLabel = effectiveLeaderCap
    ? "TribeLeaderCap"
    : effectiveSuperAdminCap
      ? "TribeSuperAdminCap"
      : "(none)";

  async function handleWithdraw() {
    setError(null);
    setSuccess(null);
    if (!walletAddress) { setError("Wallet not connected."); return; }
    if (!tribeGovId)    { setError("No tribe governance object found."); return; }
    const eve = Number(amountEve);
    if (!Number.isFinite(eve) || eve <= 0) {
      setError("Enter a positive EVE amount.");
      return;
    }
    const mist = Math.floor(eve * COIN_DECIMALS);
    if (mist > balanceMist) {
      setError("Amount exceeds tribe-wallet balance.");
      return;
    }

    setBusy(true);
    try {
      const transaction = effectiveLeaderCap
        ? buildWithdrawTribeTax({
            leaderCapId: effectiveLeaderCap,
            tribeGovId,
            amount: mist,
            senderAddress: walletAddress,
          })
        : buildWithdrawTribeTaxAsSuperAdmin({
            superAdminCapId: effectiveSuperAdminCap!,
            tribeGovId,
            amount: mist,
            senderAddress: walletAddress,
          });
      await dAppKit.signAndExecuteTransaction({ transaction });
      setSuccess(`Withdrew ${eve.toLocaleString()} EVE.`);
      setAmountEve("");
      void refetchGov();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const hasAnyAuthCap = !!(leaderCapId || superAdminCapId);
  if (!hasAnyAuthCap) {
    return (
      <div className="panel__section">
        <p className="muted">
          No tribe leadership or SuperAdmin cap detected for the connected wallet.
          Hold a TribeLeaderCap or TribeSuperAdminCap to access tribe-tax-wallet withdrawals.
        </p>
      </div>
    );
  }
  if (!tribeGovId) {
    return (
      <div className="panel__section">
        <p className="muted">
          Tribe economy not yet bootstrapped. Run <strong>Owner → Bootstrap Economy</strong> first.
        </p>
      </div>
    );
  }

  return (
    <div className="panel__section">
      <h3 className="panel__heading">Tribe Tax Wallet (EVE)</h3>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        Holds tribe-tier tax revenue from Easy-bazaar shop trades (WTS / WTB / DE).
        {bazaarType === 2 && (
          <>
            {" "}
            Advanced-bazaar shop trades route to the TribeTokenLedger instead —
            this wallet stays empty for Advanced unless legacy Easy shops were converted.
          </>
        )}
        {" "}TribeLeaderCap or TribeSuperAdminCap can withdraw; Admin and Mod tiers cannot.
      </p>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <StatCard label="Available"          value={`${formatEveMist(balanceMist)} EVE`} />
        <StatCard label="Lifetime Collected" value={`${formatEveMist(lifetimeMist)} EVE`} />
        <StatCard label="Withdraw Authority" value={authLabel} />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="number"
          min="0"
          step="any"
          placeholder="Amount in EVE"
          value={amountEve}
          onChange={e => setAmountEve(e.target.value)}
          disabled={!canWithdraw || busy}
          className="input"
          style={{ flex: 1, minWidth: "12rem", maxWidth: "20rem" }}
        />
        <button
          className="btn btn--primary"
          disabled={!canWithdraw || busy || !amountEve}
          onClick={handleWithdraw}
        >
          {busy ? "Withdrawing..." : "Withdraw"}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          disabled={!canWithdraw || busy || balanceMist === 0}
          onClick={() => setAmountEve((balanceMist / COIN_DECIMALS).toString())}
          title="Set amount to full available balance"
        >
          Max
        </button>
      </div>

      {error   && <p style={{ color: "var(--danger-color, #d33)",  marginTop: "0.75rem" }}>{error}</p>}
      {success && <p style={{ color: "var(--success-color, #2a2)", marginTop: "0.75rem" }}>{success}</p>}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
