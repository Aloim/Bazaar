// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TradeProposalView.tsx — Direct Trade proposal detail view (single-phase MVP).
 *
 * Creator sees: Cancel (pending) + Expire (pending + clock > expiryMs).
 * Counterparty sees: Accept (pending) + Reject (pending).
 * No countdown, no AWAITING, no two-phase branches (FP1-01 deferred).
 *
 * Derived from NoTribe TradeProposalView.tsx; shared primitive for all bazaar types.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useMemo } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import { useSSUGovId } from "@bazaar/shared/hooks";
import { Transaction } from "@mysten/sui/transactions";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import type { TradeProposal, TradeStatus } from "@bazaar/shared/types/bazaarcore";
import {
  buildAcceptTradeProposal,
  buildRejectTradeProposal,
  buildCancelTradeProposal,
  buildExpireTradeProposal,
} from "@bazaar/shared/tx/bazaarcore/trade-tx";

// ── Status display helpers ────────────────────────────────────────────────────

const STATUS_LABEL: Record<TradeStatus, string> = {
  0: "pending",
  1: "accepted",
  2: "rejected",
  3: "cancelled",
  4: "expired",
};

function abbreviate(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TradeProposalViewProps {
  proposal:  TradeProposal;
  myAddress: string;
  ssuId:     string;
  onBack:    () => void;
}

// ── TradeProposalView ─────────────────────────────────────────────────────────

export default function TradeProposalView({
  proposal,
  myAddress,
  onBack,
}: TradeProposalViewProps) {
  const { signGated } = useGatedTransaction();
  const isProposer   = proposal.proposer === myAddress;
  const statusLabel  = STATUS_LABEL[proposal.status] ?? "pending";
  const isPending    = proposal.status === 0;
  const isExpiredNow = isPending && Date.now() > proposal.expiryMs;

  const [loading, setLoading] = useState("");
  const [error,   setError]   = useState("");

  const { walletAddress } = useConnection();
  const { data: ssuGovId } = useSSUGovId(ssuId);

  // ── Perspective-relative pane labels ─────────────────────────────────────────

  const leftPaneTitle = isProposer
    ? `Your Offer (${abbreviate(proposal.proposer)})`
    : `They Offer — You Receive (${abbreviate(proposal.proposer)})`;

  const rightPaneTitle = isProposer
    ? `They Want From You (${abbreviate(proposal.counterparty)})`
    : `Your Side (${abbreviate(proposal.counterparty)})`;

  // ── Item display labels (type IDs only in MVP) ────────────────────────────────

  const offeredItemsSummary = useMemo(
    () =>
      proposal.offeredItems.length === 0
        ? null
        : proposal.offeredItems.map(i => `${i.quantity}x #${i.itemTypeId}`).join(", "),
    [proposal.offeredItems],
  );

  const requestedItemsSummary = useMemo(
    () =>
      proposal.requestedItems.length === 0
        ? null
        : proposal.requestedItems.map(i => `${i.quantity}x #${i.itemTypeId}`).join(", "),
    [proposal.requestedItems],
  );

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function handleAccept() {
    setLoading("accept"); setError("");
    if (!walletAddress) { setError("Wallet not connected."); setLoading(""); return; }
    if (!ssuGovId) { setError("SSU governance still loading — please wait."); setLoading(""); return; }
    const tx = new Transaction();
    let eveSplit;
    try {
      eveSplit = await splitEveCoin(walletAddress, BigInt(proposal.requestedEve), tx);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Insufficient EVE balance.");
      setLoading("");
      return;
    }
    try {
      buildAcceptTradeProposal({
        proposalId:     proposal.id,
        ssuGovId,
        eveAmountMist:  proposal.requestedEve,
        evePaymentCoin: eveSplit.coinArg,
      }, tx);
      const result = await signGated(tx);
      if (result.$kind === "FailedTransaction") {
        throw new Error("Accept transaction failed. Ensure you have sufficient EVE and are the designated counterparty.");
      }
      onBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Accept failed.");
    } finally { setLoading(""); }
  }

  async function handleReject() {
    setLoading("reject"); setError("");
    try {
      const tx = buildRejectTradeProposal(proposal.id);
      const result = await signGated(tx);
      if (result.$kind === "FailedTransaction") throw new Error("Reject transaction failed.");
      onBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reject failed.");
    } finally { setLoading(""); }
  }

  async function handleCancel() {
    setLoading("cancel"); setError("");
    try {
      const tx = buildCancelTradeProposal(proposal.id);
      const result = await signGated(tx);
      if (result.$kind === "FailedTransaction") throw new Error("Cancel transaction failed.");
      onBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Cancel failed.");
    } finally { setLoading(""); }
  }

  async function handleExpire() {
    setLoading("expire"); setError("");
    try {
      const tx = buildExpireTradeProposal(proposal.id);
      const result = await signGated(tx);
      if (result.$kind === "FailedTransaction") {
        throw new Error("Expire transaction failed. Ensure the on-chain clock is past the proposal's expiry time.");
      }
      onBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Expire failed.");
    } finally { setLoading(""); }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="trade">
      <div className="trade__header">
        <button className="btn btn--ghost btn--sm" onClick={onBack} type="button">Back</button>
        <h2>Trade Proposal</h2>
        <span className={`badge badge--status-${statusLabel}`}>{statusLabel}</span>
      </div>

      {isPending && (
        <div className="action-card" style={{ margin: "0 1.5rem" }}>
          {isExpiredNow ? (
            <p className="muted">
              Proposal has passed its expiry time. Anyone can call Expire to return the proposer's funds.
            </p>
          ) : (
            <p className="muted">Expires at: {new Date(proposal.expiryMs).toLocaleString()}.</p>
          )}
        </div>
      )}

      <div className="trade-window__panes">
        <div className="trade-pane">
          <h4>{leftPaneTitle}</h4>
          {proposal.offeredEve > 0 && (
            <div className="shop-card__item">
              <span>{proposal.offeredEve.toLocaleString()} MIST EVE</span>
              <span className="muted">(escrowed)</span>
            </div>
          )}
          {offeredItemsSummary ? (
            <div className="shop-card__item"><span>{offeredItemsSummary}</span></div>
          ) : proposal.offeredEve === 0 ? (
            <p className="muted" style={{ fontSize: "0.8rem" }}>Nothing offered.</p>
          ) : null}
        </div>

        <div className="trade-pane trade-pane--theirs">
          <h4>{rightPaneTitle}</h4>
          {proposal.requestedEve > 0 && (
            <div className="shop-card__item">
              <span>{proposal.requestedEve.toLocaleString()} MIST EVE</span>
              <span className="muted">
                {isProposer ? "(requested)" : "(you must send on accept)"}
              </span>
            </div>
          )}
          {requestedItemsSummary ? (
            <div className="shop-card__item"><span>{requestedItemsSummary}</span></div>
          ) : proposal.requestedEve === 0 ? (
            <p className="muted" style={{ fontSize: "0.8rem" }}>Nothing requested.</p>
          ) : null}
        </div>
      </div>

      <div className="muted" style={{ padding: "0.5rem 1.5rem", fontSize: "0.75rem" }}>
        SSU: {abbreviate(proposal.ssuId)}
        {" · "}Created: {new Date(proposal.createdAtMs).toLocaleString()}
        {" · "}ID: {proposal.id.slice(0, 10)}...
      </div>

      {error && <div className="error-text" style={{ padding: "0 1.5rem" }}>{error}</div>}

      <div className="trade__actions">
        {isPending && !isProposer && (
          <button className="btn btn--primary" onClick={handleAccept} disabled={!!loading} type="button">
            {loading === "accept" ? "Accepting..." : "Accept Trade"}
          </button>
        )}
        {isPending && !isProposer && (
          <button className="btn btn--secondary btn--sm" onClick={handleReject} disabled={!!loading} type="button">
            {loading === "reject" ? "Rejecting..." : "Reject"}
          </button>
        )}
        {isPending && isProposer && !isExpiredNow && (
          <button className="btn btn--danger btn--sm" onClick={handleCancel} disabled={!!loading} type="button">
            {loading === "cancel" ? "Cancelling..." : "Cancel Proposal"}
          </button>
        )}
        {isPending && isExpiredNow && (
          <button className="btn btn--danger btn--sm" onClick={handleExpire} disabled={!!loading} type="button">
            {loading === "expire" ? "Expiring..." : "Mark Expired"}
          </button>
        )}
      </div>

      <div className="trade__footer muted">
        Single-phase MVP trade. Two-phase commit (escrow + confirm + 15-min timeout) pending FP1-01.
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
