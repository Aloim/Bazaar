// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/DAppGovernancePanel.tsx (lines 705-931; split for 500-line guard, section: DAppWalletTab).
// V16 sweep B1 (2026-05-13): prop API switched from a single `eveBalance: number`
// to a full `taxWallet` snapshot of the real `DAppTaxWallet` shared object.
// Reflects 4 lifetime stats (balance / total collected / total withdrawn /
// deposit count) instead of the fictional single-balance value pulled from
// the retired `DAppTreasury` object.

import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit } from "@evefrontier/dapp-kit";
import { COIN_DECIMALS, SHARED_OBJECTS } from "@bazaar/shared/constants";
import { buildWithdrawDAppTax } from "@bazaar/shared/tx";
import { useDAppTaxHistory } from "@bazaar/shared/hooks";
import { useSuiQuery } from "@bazaar/shared/hooks/useSuiQuery";
import type { DAppTaxEvent } from "@bazaar/shared/hooks";
import AddressInput from "@bazaar/shared/components/AddressInput";

export interface DAppTaxWalletSnapshot {
  balance:        number; // raw MIST in DAppTaxWallet.balance
  totalCollected: number; // raw MIST lifetime deposits
  totalWithdrawn: number; // raw MIST lifetime withdrawals
  depositCount:   number; // total deposit operations
}

interface DAppWalletTabProps {
  taxWallet:     DAppTaxWalletSnapshot | null;
  isDAppOwner:   boolean;
  ownerCapId:    string | null;
  walletAddress: string;
  onRefresh:     () => void;
}

export function DAppWalletTab({
  taxWallet,
  isDAppOwner,
  ownerCapId,
  walletAddress,
  onRefresh,
}: DAppWalletTabProps) {
  const eveBalance = taxWallet?.balance ?? 0;
  const [withdrawAmt, setWithdrawAmt]   = useState("");
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [loading, setLoading]           = useState(false);

  // Transfer DAppOwnerCap state
  const [transferTo, setTransferTo]           = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);

  const {
    events,
    loading: historyLoading,
    error: historyError,
    page,
    hasNextPage,
    hasPrevPage,
    goNext,
    goPrev,
    refetch: refetchHistory,
  } = useDAppTaxHistory();

  // Phase 6 W7 (AUD-DH-22 / LEAD-07): read-only DAppEscrowWallet insight.
  // `total_escrowed` is the live sum of join fees held pending accept/reject —
  // accept releases to the tax wallet, reject refunds the applicant
  // (escrow_wallet.move:20-51). Move-side enumerable; this card closes the
  // "pending join fees invisible to admin AND applicant" gap.
  const { data: escrowObj, isLoading: escrowLoading } = useSuiQuery<{
    data?: { content?: { fields?: { total_escrowed?: string | number } } };
  }>("getObject", {
    id: SHARED_OBJECTS.ESCROW_WALLET,
    options: { showContent: true },
  });
  const escrowTotal = Number(
    escrowObj?.data?.content?.fields?.total_escrowed ?? 0,
  );

  const fmtEve = (raw: number) =>
    (raw / COIN_DECIMALS).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });

  const displayBalance        = fmtEve(eveBalance);
  const displayTotalCollected = fmtEve(taxWallet?.totalCollected ?? 0);
  const displayTotalWithdrawn = fmtEve(taxWallet?.totalWithdrawn ?? 0);
  const displayDepositCount   = (taxWallet?.depositCount ?? 0).toLocaleString();

  async function handleWithdraw() {
    if (!ownerCapId) return;
    const rawAmt = Math.round(Number(withdrawAmt) * COIN_DECIMALS);
    if (isNaN(rawAmt) || rawAmt <= 0) { alert("Enter a valid amount."); return; }
    const addr = withdrawAddr.trim() || walletAddress;
    if (!addr) { alert("Enter a recipient address."); return; }

    setLoading(true);
    try {
      const tx = buildWithdrawDAppTax(ownerCapId, rawAmt, addr);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setWithdrawAmt("");
      setWithdrawAddr("");
      onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleTransferCap() {
    if (!ownerCapId || !transferTo.trim()) return;
    setTransferLoading(true);
    try {
      // Transfer DAppOwnerCap — inline PTB, no builder needed.
      // IMPORTANT: after this TX the caller no longer holds ownerCap — all owner access is lost.
      const tx = new Transaction();
      tx.transferObjects([tx.object(ownerCapId)], tx.pure.address(transferTo.trim()));
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setTransferTo("");
      setConfirmTransfer(false);
      onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setTransferLoading(false);
    }
  }

  function formatTs(ms: number): string {
    if (!ms) return "—";
    return new Date(ms).toLocaleString("en-US", {
      month:  "short",
      day:    "numeric",
      hour:   "2-digit",
      minute: "2-digit",
    });
  }

  function abbrevDigest(digest: string): string {
    if (!digest || digest.length < 12) return digest;
    return `${digest.slice(0, 6)}...${digest.slice(-4)}`;
  }

  function formatAmount(ev: DAppTaxEvent): string {
    const baz = ev.amount / COIN_DECIMALS;
    return baz.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  return (
    <div className="panel__section">
      {/* Balance section — 4 stats from the real DAppTaxWallet (V16 sweep B1) */}
      <div className="action-card">
        <h4>dApp Tax Wallet</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Accumulated dApp-level tax revenue collected from all marketplace transactions.
        </p>
        <div className="stats-row" style={{ marginTop: "0.75rem" }}>
          <div className="stat">
            <span className="stat__label">EVE Balance</span>
            <span className="stat__value" style={{ fontSize: "1.4rem", color: "var(--accent)" }}>
              {displayBalance}
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Total Collected</span>
            <span className="stat__value">{displayTotalCollected}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Total Withdrawn</span>
            <span className="stat__value">{displayTotalWithdrawn}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Deposit Count</span>
            <span className="stat__value">{displayDepositCount}</span>
          </div>
        </div>
      </div>

      {/* Join-Fee Escrow insight — Phase 6 W7 (AUD-DH-22 / LEAD-07) */}
      <div className="action-card">
        <h4>Join-Fee Escrow</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          EVE held in the DAppEscrowWallet for PENDING tribe-join applications.
          Funds release to the tax wallet on accept and refund the applicant on
          reject — this balance is custody-in-flight, not revenue, and has no
          direct withdraw.
        </p>
        <div className="stats-row" style={{ marginTop: "0.75rem" }}>
          <div className="stat">
            <span className="stat__label">Escrowed (pending)</span>
            <span className="stat__value" style={{ fontSize: "1.4rem", color: "var(--accent2)" }}>
              {escrowLoading ? "…" : fmtEve(escrowTotal)}
            </span>
          </div>
        </div>
        {!escrowLoading && escrowTotal === 0 && (
          <p className="muted" style={{ fontSize: "0.72rem", marginTop: "0.4rem" }}>
            Nothing escrowed — join fees are currently 0 on live config, so
            applications escrow zero-value entries.
          </p>
        )}
      </div>

      {/* Withdraw section — Owner only */}
      {isDAppOwner && (
        <div className="action-card">
          <h4>Withdraw dApp Tax</h4>
          <p className="muted" style={{ fontSize: "0.78rem" }}>
            Withdraw accumulated dApp tax revenue. Defaults to your connected wallet if no recipient is specified.
            Owner only.
          </p>
          <div className="form-row" style={{ marginTop: "0.5rem" }}>
            <input
              className="input input--sm"
              type="number"
              min="0"
              step="0.01"
              value={withdrawAmt}
              onChange={e => setWithdrawAmt(e.target.value)}
              placeholder="Amount (EVE)"
            />
            <AddressInput
              value={withdrawAddr}
              onChange={setWithdrawAddr}
              placeholder={walletAddress || "Recipient address 0x..."}
            />
            <button
              className="btn btn--primary btn--sm"
              disabled={loading || !withdrawAmt || Number(withdrawAmt) <= 0}
              onClick={handleWithdraw}
            >
              {loading ? "Withdrawing..." : "Withdraw"}
            </button>
          </div>
        </div>
      )}

      {/* Transaction History section */}
      <div className="action-card">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <h4 style={{ margin: 0 }}>Transaction History</h4>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => { onRefresh(); refetchHistory(); }}
            style={{ marginLeft: "auto" }}
          >
            Refresh
          </button>
        </div>

        {historyError && (
          <p style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{historyError}</p>
        )}

        {historyLoading && (
          <p className="muted" style={{ fontSize: "0.82rem" }}>Loading...</p>
        )}

        {!historyLoading && events.length === 0 && !historyError && (
          <p className="muted" style={{ fontSize: "0.82rem" }}>No dApp tax events found.</p>
        )}

        {!historyLoading && events.length > 0 && (
          <table className="admin-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount (EVE)</th>
                <th>Time</th>
                <th>TX</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => {
                // AUD-DH-16: Fee + Drain streams included so the history
                // reconciles with the lifetime stats above it.
                const inflow = ev.type === "deposit" || ev.type === "fee";
                const label =
                  ev.type === "deposit"    ? "Tax"
                : ev.type === "fee"        ? `Fee${ev.feeKind ? ` · ${ev.feeKind}` : ""}`
                : ev.type === "withdrawal" ? "Withdraw"
                :                            "Drain";
                return (
                <tr key={ev.id}>
                  <td>
                    <span
                      className={`badge ${inflow ? "badge--green" : "badge--muted"}`}
                      title={ev.recipient ? `to ${ev.recipient}` : undefined}
                    >
                      {label}
                    </span>
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>
                    <span style={{ color: inflow ? "var(--success)" : "var(--muted)" }}>
                      {inflow ? "+" : "-"}{formatAmount(ev)}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: "0.76rem" }}>
                    {formatTs(ev.timestamp)}
                  </td>
                  <td>
                    <a
                      href={`https://suiscan.xyz/testnet/tx/${ev.txDigest}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--accent)" }}
                    >
                      {abbrevDigest(ev.txDigest)}
                    </a>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {(hasPrevPage || hasNextPage) && (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", justifyContent: "center" }}>
            <button
              className="btn btn--ghost btn--sm"
              disabled={!hasPrevPage || historyLoading}
              onClick={goPrev}
            >
              Prev
            </button>
            <span className="muted" style={{ alignSelf: "center", fontSize: "0.8rem" }}>
              Page {page + 1}
            </span>
            <button
              className="btn btn--ghost btn--sm"
              disabled={!hasNextPage || historyLoading}
              onClick={goNext}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Transfer DAppOwnerCap — Owner only */}
      {isDAppOwner && ownerCapId && (
        <div className="action-card">
          <h4>Transfer DAppOwnerCap</h4>
          <p className="muted" style={{ fontSize: "0.78rem", color: "var(--danger)" }}>
            Transfer ownership of this dApp to another address. You will permanently lose all dApp
            Owner access. This cannot be undone.
          </p>
          <div className="form-row" style={{ marginTop: "0.5rem" }}>
            <AddressInput
              value={transferTo}
              onChange={setTransferTo}
              placeholder="New owner address 0x..."
            />
            <button
              className="btn btn--danger btn--sm"
              disabled={transferLoading || !transferTo.trim()}
              onClick={() => setConfirmTransfer(true)}
            >
              Transfer Ownership
            </button>
          </div>
        </div>
      )}

      {/* Transfer confirmation modal */}
      {confirmTransfer && (
        <div className="modal-overlay" onClick={() => setConfirmTransfer(false)}>
          <div className="modal modal--warn" onClick={e => e.stopPropagation()}>
            <h3>Transfer DAppOwnerCap?</h3>
            <div className="ban-modal__warning">
              <p>You are transferring dApp ownership to:</p>
              <p style={{ fontFamily: "var(--font-mono)", margin: "0.5rem 0" }}>{transferTo}</p>
              <p style={{ fontWeight: "bold", color: "var(--danger)" }}>
                You will permanently lose dApp Owner access. This cannot be undone.
              </p>
            </div>
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={() => setConfirmTransfer(false)}>Cancel</button>
              <button
                className="btn btn--danger"
                disabled={transferLoading}
                onClick={handleTransferCap}
              >
                {transferLoading ? "Transferring..." : "Confirm Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
